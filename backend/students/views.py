from rest_framework.decorators import api_view, permission_classes
from rest_framework import viewsets, status, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from django.contrib.auth import get_user_model
from schoolSettings.permissions import (
    HasStudentsPermission,
    HasStudentsPermissionOrReadOnly,
)
from utils.section_filtering import SectionFilterMixin, AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination
from django.db.models import Avg, Count, Q
from classroom.models import (
    ClassSchedule,
    Classroom,
    Section,
    GradeLevel,
    Stream,
    Class,
)
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
import csv
from datetime import date, timedelta, datetime, time
from django.utils import timezone
from .models import Student, ResultCheckToken
from academics.models import EducationLevel
from .serializers import (
    StudentScheduleSerializer,
    StudentWeeklyScheduleSerializer,
    StudentDailyScheduleSerializer,
    StudentDetailSerializer,
    StudentListSerializer,
    StudentCreateSerializer,
    ResultTokenSerializer,
)
from attendance.models import Attendance
from result.models import StudentResult
from schoolSettings.models import SchoolAnnouncement
from events.models import Event
from academics.models import AcademicCalendar, Term
import string
import random

from .serializers import ResultTokenSerializer
import logging

logger = logging.getLogger(__name__)

User = get_user_model()


def generate_human_readable_token():
    """
    Generate a human-readable token in format: A7B-2C9-X3Y-5Z1
    Each segment is 3 characters (uppercase letters and digits)
    """
    characters = string.ascii_uppercase + string.digits
    segments = [
        "".join(random.choices(characters, k=3)),
        "".join(random.choices(characters, k=3)),
        "".join(random.choices(characters, k=3)),
        "".join(random.choices(characters, k=3)),
    ]
    return "-".join(segments)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def generate_result_tokens(request):
    """
    Admin endpoint to generate result tokens for all active students of a school term.

    Request body:
    {
        "school_term_id": 1,
        "days_until_expiry": 30  // Optional, defaults to term end date
    }
    """
    school_term_id = request.data.get("school_term_id")
    days_until_expiry = request.data.get("days_until_expiry")

    if not school_term_id:
        return Response(
            {"error": "school_term_id is required"}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        school_term = Term.objects.get(id=school_term_id)
    except Term.DoesNotExist:
        return Response(
            {"error": f"School term with id {school_term_id} not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    students = User.objects.filter(role="student", is_active=True)
    created_count = 0
    updated_count = 0
    errors = []

    # Calculate expiration
    if days_until_expiry:
        expiration_datetime = timezone.now() + timedelta(days=int(days_until_expiry))
    else:
        expiration_datetime = timezone.make_aware(
            datetime.combine(school_term.end_date, time.max)
        )

    for student in students:
        try:
            # Generate a unique token for each student
            token_string = generate_human_readable_token()

            # Ensure token is unique (retry if collision occurs)
            max_retries = 10
            retries = 0
            while (
                ResultCheckToken.objects.filter(token=token_string).exists()
                and retries < max_retries
            ):
                token_string = generate_human_readable_token()
                retries += 1

            if retries >= max_retries:
                raise Exception("Failed to generate unique token after 10 attempts")

            # Create or update the token
            token_obj, created = ResultCheckToken.objects.update_or_create(
                student=student,
                school_term=school_term,
                defaults={
                    "token": token_string,
                    "expires_at": expiration_datetime,
                    "is_used": False,
                    "used_at": None,
                },
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        except Exception as e:
            errors.append(
                {
                    "student_id": student.id,
                    "username": student.username,
                    "error": str(e),
                }
            )

    delta = expiration_datetime - timezone.now()
    days_calculated = delta.days

    response_data = {
        "success": True,
        "message": "Result tokens generated successfully",
        "school_term": school_term.name,
        "academic_session": str(school_term.academic_session),
        "tokens_created": created_count,
        "tokens_updated": updated_count,
        "total_students": created_count + updated_count,
        "expires_at": expiration_datetime.isoformat(),
        "days_until_expiry": days_calculated,
        "expiry_date": expiration_datetime.strftime("%B %d, %Y"),
    }

    if errors:
        response_data["errors"] = errors
        response_data["error_count"] = len(errors)

    return Response(response_data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_student_result_token(request):
    """
    Student endpoint to retrieve their result token for the current/active school term.
    """
    student = request.user
    current_term = Term.objects.filter(is_current=True).first()

    if not current_term:
        return Response(
            {
                "error": "No active school term",
                "has_token": False,
                "message": "Results are not available at this time",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        token_obj = ResultCheckToken.objects.get(
            student=student, school_term=current_term
        )
    except ResultCheckToken.DoesNotExist:
        return Response(
            {
                "error": "No result token available for this term",
                "has_token": False,
                "current_term": current_term.name,
                "message": "Your results are not yet available. Please check back later.",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if not token_obj.is_valid():
        return Response(
            {
                "error": "Token has expired",
                "has_token": False,
                "expired_at": token_obj.expires_at.isoformat(),
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ResultTokenSerializer(token_obj)
    return Response(
        {"has_token": True, "token_data": serializer.data},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_result_token(request):
    """
    Verify result token and return complete student information.
    """
    token_string = request.data.get("token")

    if not token_string:
        return Response(
            {"error": "Token is required", "is_valid": False},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token_obj = ResultCheckToken.objects.select_related(
            "student", "school_term"
        ).get(token=token_string, student=request.user)
    except ResultCheckToken.DoesNotExist:
        return Response(
            {"error": "Invalid token", "is_valid": False},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not token_obj.is_valid():
        return Response(
            {
                "error": "Token has expired or already used",
                "is_valid": False,
                "expires_at": token_obj.expires_at.isoformat(),
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # Mark the token as used so it cannot be verified again
    token_obj.mark_as_used()

    student = None
    try:
        student = Student.objects.select_related(
            "user", "student_class", "section", "stream"
        ).get(user=token_obj.student)
    except Student.DoesNotExist:
        pass

    student_name = None
    if student and hasattr(student, "full_name") and student.full_name:
        student_name = student.full_name
    else:
        name_parts = []
        if token_obj.student.first_name:
            name_parts.append(token_obj.student.first_name)
        if token_obj.student.last_name:
            name_parts.append(token_obj.student.last_name)
        student_name = (
            " ".join(name_parts) if name_parts else token_obj.student.username
        )

    # Use the @property which returns level_type string
    education_level = student.education_level if student else ""

    # Use the @property which computes classroom display string
    current_class = student.classroom if student else None

    return Response(
        {
            "is_valid": True,
            "message": "Token verified successfully",
            "school_term": token_obj.school_term.name,
            "expires_at": token_obj.expires_at.isoformat(),
            "student_id": token_obj.student.id,
            "student_name": student_name,
            "education_level": education_level,
            "current_class": current_class,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def get_all_result_tokens(request):
    """
    Admin endpoint to retrieve all result tokens for a specific school term.
    """
    school_term_id = request.query_params.get("school_term_id")

    if not school_term_id:
        return Response(
            {"error": "school_term_id is required"}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        school_term = Term.objects.get(id=school_term_id)
    except Term.DoesNotExist:
        return Response(
            {"error": f"School term with id {school_term_id} not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    tokens = (
        ResultCheckToken.objects.filter(school_term=school_term)
        .select_related("student")
        .order_by("student__username")
    )

    token_data = []
    for token in tokens:
        name_parts = []
        if token.student.first_name:
            name_parts.append(token.student.first_name)
        if token.student.middle_name:
            name_parts.append(token.student.middle_name)
        if token.student.last_name:
            name_parts.append(token.student.last_name)

        student_name = " ".join(name_parts) if name_parts else token.student.username

        # Try to get student_class via Student model
        student_class = ""
        try:
            student_profile = Student.objects.select_related("student_class").get(
                user=token.student
            )
            # Use the computed classroom property which returns display string
            student_class = student_profile.classroom or ""
        except Student.DoesNotExist:
            pass

        # Check if valid
        is_valid = not token.is_used and token.expires_at > timezone.now()

        # Get status
        if token.is_used:
            status_text = "Used"
        elif token.expires_at <= timezone.now():
            status_text = "Expired"
        else:
            status_text = "Active"

        token_data.append(
            {
                "id": token.id,
                "student_name": student_name,
                "username": token.student.username,
                "student_class": student_class,
                "token": token.token,
                "expires_at": token.expires_at.isoformat(),
                "is_valid": is_valid,
                "status": status_text,
            }
        )

    # Calculate statistics
    total = len(token_data)
    active = sum(1 for t in token_data if t["status"] == "Active")
    expired = sum(1 for t in token_data if t["status"] == "Expired")
    used = sum(1 for t in token_data if t["status"] == "Used")

    return Response(
        {
            "tokens": token_data,
            "total": total,
            "statistics": {
                "total": total,
                "active": active,
                "expired": expired,
                "used": used,
            },
            "school_term": school_term.name,
            "academic_session": str(school_term.academic_session),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["DELETE"])
@permission_classes([IsAdminUser])
def delete_expired_tokens(request):
    """
    Admin endpoint to delete expired result tokens.
    """
    expired_tokens = ResultCheckToken.objects.filter(expires_at__lt=timezone.now())
    count = expired_tokens.count()

    # Get breakdown by term before deleting
    from django.db.models import Count

    breakdown = list(
        expired_tokens.values("school_term__name").annotate(count=Count("id"))
    )

    expired_tokens.delete()

    return Response(
        {
            "success": True,
            "message": f"Successfully deleted {count} expired tokens",
            "deleted_count": count,
            "breakdown": breakdown,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["DELETE"])
@permission_classes([IsAdminUser])
def delete_all_tokens_for_term(request):
    """
    Admin endpoint to delete ALL tokens for a specific term.

    Request body: { "school_term_id": 1 }
    """
    school_term_id = request.data.get("school_term_id")

    if not school_term_id:
        return Response(
            {"error": "school_term_id is required"}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        school_term = Term.objects.get(id=school_term_id)
    except Term.DoesNotExist:
        return Response(
            {"error": f"School term with id {school_term_id} not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    tokens = ResultCheckToken.objects.filter(school_term=school_term)
    count = tokens.count()
    tokens.delete()

    return Response(
        {
            "success": True,
            "message": f"Successfully deleted all {count} tokens for {school_term.name}",
            "deleted_count": count,
            "school_term": school_term.name,
        },
        status=status.HTTP_200_OK,
    )


def get_student_schedule_entries(student):
    """
    Helper function to get schedule entries for a student using FK relationships.
    Now simplified to use direct FK lookups instead of string parsing.
    """
    logger.info(f"=== Getting schedule for student: {student.full_name} ===")
    logger.info(f"Student class FK: {student.student_class}")
    logger.info(f"Student section FK: {student.section}")
    logger.info(f"Student stream FK: {student.stream}")

    # Start with empty queryset
    schedule_qs = ClassSchedule.objects.none()

    # Method 1: Direct FK-based lookup
    if student.student_class:
        try:
            # Build classroom filter based on available FK data
            classroom_filters = Q()

            # Filter by grade level from student_class
            classroom_filters &= Q(section__grade_level=student.student_class)

            # If section is specified, filter by it
            if student.section:
                classroom_filters &= Q(section=student.section)

            # For Senior Secondary, filter by stream if available
            if student.stream:
                classroom_filters &= Q(stream=student.stream)

            # Find matching classrooms
            classrooms = Classroom.objects.filter(classroom_filters)

            if classrooms.exists():
                # Get schedules for these classrooms
                schedule_qs = ClassSchedule.objects.filter(
                    classroom__in=classrooms, is_active=True
                ).select_related(
                    "subject",
                    "teacher__user",
                    "classroom__section",
                    "classroom__stream",
                )

                if schedule_qs.exists():
                    logger.info(
                        f"✓ Found {schedule_qs.count()} schedule entries via FK relationships"
                    )
                    return schedule_qs
                else:
                    logger.info(f"✗ No active schedules found for matched classrooms")
            else:
                logger.info(f"✗ No classrooms found matching student's FK data")

        except Exception as e:
            logger.error(f"✗ Error in FK-based schedule lookup: {str(e)}")

    # Method 2: Fallback using the computed classroom property
    # This handles cases where classroom string exists but FKs aren't fully set
    if hasattr(student, "classroom") and student.classroom:
        try:
            # Try exact match on classroom name
            classroom = Classroom.objects.filter(
                name__iexact=student.classroom.strip()
            ).first()

            if classroom:
                schedule_qs = ClassSchedule.objects.filter(
                    classroom=classroom, is_active=True
                ).select_related(
                    "subject",
                    "teacher__user",
                    "classroom__section",
                    "classroom__stream",
                )

                if schedule_qs.exists():
                    logger.info(
                        f"✓ Found {schedule_qs.count()} schedules via classroom property fallback"
                    )
                    return schedule_qs
            else:
                logger.info(f"✗ No classroom found with name: {student.classroom}")

        except Exception as e:
            logger.error(f"✗ Error in classroom property fallback: {str(e)}")

    logger.warning(f"✗ No schedules found for student {student.full_name}")
    return ClassSchedule.objects.none()


def group_schedule_by_day(schedule_data):
    """Group schedule entries by day of week"""
    days = [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
    ]
    schedule_by_day = {day.lower(): [] for day in days}

    for entry in schedule_data:
        day = entry.get("day_of_week", "").upper()
        if day in days:
            schedule_by_day[day.lower()].append(entry)

    # Sort each day's schedule by start time
    for day in schedule_by_day:
        schedule_by_day[day].sort(key=lambda x: x.get("start_time", "00:00"))

    return schedule_by_day


def get_student_from_user(user):
    """Helper function to get student profile from user"""
    if hasattr(user, "student_profile"):
        return user.student_profile
    else:
        return Student.objects.select_related(
            "user", "student_class", "section", "stream"
        ).get(user=user)


def get_user_display_name(user):
    """Safely build a user's display name without assuming get_full_name exists."""
    try:
        if hasattr(user, "get_full_name") and callable(user.get_full_name):
            name = user.get_full_name()
            if name:
                return name
    except Exception:
        pass
    # Fallbacks
    first = getattr(user, "first_name", "") or ""
    last = getattr(user, "last_name", "") or ""
    full_name = f"{first} {last}".strip()
    if full_name:
        return full_name
    # Final fallback to username or string
    return getattr(user, "username", str(user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_schedule_view(request):
    """Get schedule for current student"""
    logger.info(f"Schedule view called by user: {request.user.username}")

    try:
        student = get_student_from_user(request.user)
        logger.info(f"Found student: {student}")

        schedule_entries = get_student_schedule_entries(student)

        if not schedule_entries.exists():
            return Response(
                {
                    "detail": "No schedule found for this student.",
                    "debug_info": {
                        "student_classroom": getattr(student, "classroom", None),
                        "student_class": (
                            str(student.student_class)
                            if student.student_class
                            else None
                        ),
                        "section": str(student.section) if student.section else None,
                        "stream": str(student.stream) if student.stream else None,
                        "education_level": student.education_level,
                    },
                },
                status=404,
            )

        serializer = StudentScheduleSerializer(schedule_entries, many=True)
        schedule_by_day = group_schedule_by_day(serializer.data)

        return Response(
            {
                "student_info": {
                    "id": student.id,
                    "name": student.full_name,
                    "class": student.student_class.name if student.student_class else "",
                    "classroom": getattr(student, "classroom", None),
                },
                "schedule": serializer.data,
                "schedule_by_day": schedule_by_day,
                "total_periods": len(serializer.data),
            }
        )

    except Student.DoesNotExist:
        return Response({"error": "Student profile not found"}, status=404)
    except Exception as e:
        logger.error(f"Error in student_schedule_view: {str(e)}")
        return Response({"error": f"Failed to fetch schedule: {str(e)}"}, status=500)


class StudentViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing students with proper tenant filtering and section access control.
    """

    queryset = Student.objects.all()
    permission_classes = [HasStudentsPermissionOrReadOnly]
    pagination_class = LargeResultsPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = [
        "user",
        "student_class",  # FK to Class
        "section",  # FK to Section
        "stream",  # FK to Stream
        "gender",
        "is_active",
    ]
    search_fields = [
        "user__first_name",
        "user__last_name",
        "user__email",
        "parent_contact",
        "registration_number",
        "user__username",
    ]
    ordering_fields = ["user__first_name", "admission_date", "date_of_birth"]
    ordering = ["student_class__order", "user__first_name"]

    def get_queryset(self):
        """
        Optimize queryset with select_related for better performance.
        CRITICAL: Calls super() first to apply tenant filtering from TenantFilterMixin.
        """
        # Check if user is querying by user parameter (student viewing their own record)
        user_filter = self.request.query_params.get("user", None)
        is_self_query = (
            self.request.user.is_authenticated
            and user_filter
            and str(self.request.user.id) == str(user_filter)
        )

        logger.info(
            f"🔍 StudentViewSet.get_queryset: user_filter={user_filter}, user.id={self.request.user.id}, is_self_query={is_self_query}"
        )

        # CRITICAL: If student is viewing their own record, skip AutoSectionFilterMixin
        if is_self_query:
            logger.info(
                f"✅ Self-query detected for user {user_filter}, bypassing section filtering"
            )
            queryset = Student.objects.all()

            # Apply tenant filtering manually
            tenant = getattr(self.request, "tenant", None)
            logger.info(f"🏢 Tenant from request: {tenant}")
            if tenant:
                queryset = queryset.filter(tenant_id=tenant.id)
                logger.info(f"📊 After tenant filter: {queryset.count()} students")

            # Add performance optimizations - FIXED: Use correct FK names
            queryset = queryset.select_related(
                "user",
                "student_class",  # FK to Class (which is the grade level)
                "student_class__education_level",
                "section",
                "stream",
                "stream__stream_type_new",
            ).prefetch_related("parents")

            # Filter by the specific user
            queryset = queryset.filter(user_id=user_filter)
            logger.info(f"📊 After user filter: {queryset.count()} students")

            return queryset

        # CRITICAL: For non-self queries, call super() to apply tenant and section filtering
        logger.info(f"⚙️ Not a self-query, using standard filtering")
        queryset = super().get_queryset()

        # Add performance optimizations - FIXED: Use correct FK names
        queryset = queryset.select_related(
            "user",
            "student_class",  # FK to Class (which is the grade level)
            "student_class__education_level",
            "section",
            "stream",
            "stream__stream_type_new",
        ).prefetch_related("parents")

        logger.info(f"📊 Final queryset count: {queryset.count()} students")
        return queryset

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return StudentListSerializer
        elif self.action == "create":
            return StudentCreateSerializer
        elif self.action in [
            "schedule",
            "student_schedule",
            "weekly_schedule",
            "daily_schedule",
        ]:
            return StudentScheduleSerializer
        return StudentDetailSerializer

    def _get_time_ago(self, past_date):
        """Helper method to calculate time ago string"""
        from django.utils import timezone

        if isinstance(past_date, date) and not isinstance(past_date, datetime):
            past_datetime = datetime.combine(past_date, time.min)
            past_datetime = (
                timezone.make_aware(past_datetime)
                if timezone.is_naive(past_datetime)
                else past_datetime
            )
        elif isinstance(past_date, datetime):
            past_datetime = (
                timezone.make_aware(past_date)
                if timezone.is_naive(past_date)
                else past_date
            )
        else:
            return "Unknown"

        now = timezone.now()
        diff = now - past_datetime

        if diff.days > 365:
            years = diff.days // 365
            return f"{years} year{'s' if years != 1 else ''} ago"
        elif diff.days > 30:
            months = diff.days // 30
            return f"{months} month{'s' if months != 1 else ''} ago"
        elif diff.days > 0:
            return f"{diff.days} day{'s' if diff.days != 1 else ''} ago"
        elif diff.seconds > 3600:
            hours = diff.seconds // 3600
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        elif diff.seconds > 60:
            minutes = diff.seconds // 60
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        else:
            return "Just now"

    def retrieve(self, request, pk=None):
        """Standard retrieve method for numeric IDs only."""
        try:
            student = (
                self.get_queryset()
                .select_related(
                    "user",
                    "student_class",
                    "student_class__education_level",  # ← critical for education_level property
                    "section",
                    "stream",
                    "stream__stream_type_new",
                )
                .get(pk=pk)
            )
            serializer = StudentDetailSerializer(student, context={"request": request})
            return Response(serializer.data)
        except Student.DoesNotExist:
            return Response(
                {"detail": f"Student with id '{pk}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=["get"], url_path="my-schedule")
    def my_schedule(self, request):
        """Get current user's schedule."""
        try:
            student = get_student_from_user(request.user)
            schedule_entries = get_student_schedule_entries(student)

            if not schedule_entries.exists():
                return Response(
                    {
                        "detail": "No schedule found for your profile.",
                        "debug_info": {
                            "classroom": getattr(student, "classroom", None),
                            "student_class": (
                                str(student.student_class)
                                if student.student_class
                                else None
                            ),
                            "section": (
                                str(student.section) if student.section else None
                            ),
                            "stream": str(student.stream) if student.stream else None,
                            "education_level": student.education_level,
                        },
                    },
                    status=404,
                )

            serializer = StudentScheduleSerializer(schedule_entries, many=True)
            schedule_by_day = group_schedule_by_day(serializer.data)

            return Response(
                {
                    "student_info": {
                        "id": student.id,
                        "name": student.full_name,
                        "class": student.student_class.name if student.student_class else "",
                        "classroom": getattr(student, "classroom", None),
                    },
                    "schedule": serializer.data,
                    "schedule_by_day": schedule_by_day,
                    "total_periods": len(serializer.data),
                }
            )

        except Student.DoesNotExist:
            return Response({"error": "Student profile not found"}, status=404)
        except Exception as e:
            return Response(
                {"error": f"Failed to fetch schedule: {str(e)}"}, status=500
            )

    @action(detail=False, methods=["get"], url_path="my-weekly-schedule")
    def my_weekly_schedule(self, request):
        """Get current user's weekly schedule."""
        try:
            student = get_student_from_user(request.user)

            schedule_entries = get_student_schedule_entries(student)
            if not schedule_entries.exists():
                return Response(
                    {"detail": "No schedule found for this student."}, status=404
                )

            serializer = StudentScheduleSerializer(schedule_entries, many=True)
            schedule_by_day = group_schedule_by_day(serializer.data)

            total_periods = len(serializer.data)
            unique_subjects = set(entry["subject_name"] for entry in serializer.data)
            unique_teachers = set(entry["teacher_name"] for entry in serializer.data)

            days_with_classes = sum(
                1 for _, periods in schedule_by_day.items() if periods
            )
            avg_daily_periods = (
                total_periods / days_with_classes if days_with_classes > 0 else 0
            )

            weekly_data = {
                "student_id": student.id,
                "student_name": student.full_name,
                "classroom_name": getattr(student, "classroom", None),
                "education_level": student.education_level_display,
                "academic_year": "2024-2025",
                "term": "Current Term",
                "monday": schedule_by_day.get("monday", []),
                "tuesday": schedule_by_day.get("tuesday", []),
                "wednesday": schedule_by_day.get("wednesday", []),
                "thursday": schedule_by_day.get("thursday", []),
                "friday": schedule_by_day.get("friday", []),
                "saturday": schedule_by_day.get("saturday", []),
                "sunday": schedule_by_day.get("sunday", []),
                "total_periods_per_week": total_periods,
                "total_subjects": len(unique_subjects),
                "total_teachers": len(unique_teachers),
                "average_daily_periods": round(avg_daily_periods, 1),
            }

            return Response(weekly_data)

        except Student.DoesNotExist:
            return Response(
                {"error": "Student profile not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to fetch weekly schedule: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"], url_path="my-current-period")
    def my_current_period(self, request):
        """Get current user's current period."""
        try:
            student = get_student_from_user(request.user)

            now = datetime.now()
            current_time = now.time()
            current_day = now.strftime("%A").upper()

            schedule_entries = get_student_schedule_entries(student)
            today_schedule = schedule_entries.filter(day_of_week=current_day)

            current_period = None
            next_period = None

            for entry in today_schedule:
                start_time = entry.start_time
                end_time = entry.end_time

                if start_time <= current_time <= end_time:
                    current_period = {
                        "subject": entry.subject.name if entry.subject else "Unknown",
                        "teacher": (
                            get_user_display_name(entry.teacher.user)
                            if entry.teacher and entry.teacher.user
                            else "Unknown"
                        ),
                        "start_time": start_time.strftime("%H:%M"),
                        "end_time": end_time.strftime("%H:%M"),
                        "classroom": (
                            entry.classroom.name if entry.classroom else "Unknown"
                        ),
                        "is_current": True,
                    }
                    break
                elif start_time > current_time and not next_period:
                    next_period = {
                        "subject": entry.subject.name if entry.subject else "Unknown",
                        "teacher": (
                            get_user_display_name(entry.teacher.user)
                            if entry.teacher and entry.teacher.user
                            else "Unknown"
                        ),
                        "start_time": start_time.strftime("%H:%M"),
                        "end_time": end_time.strftime("%H:%M"),
                        "classroom": (
                            entry.classroom.name if entry.classroom else "Unknown"
                        ),
                        "is_next": True,
                    }

            return Response(
                {
                    "student_name": student.full_name,
                    "current_time": current_time.strftime("%H:%M"),
                    "current_day": current_day,
                    "current_period": current_period,
                    "next_period": next_period,
                    "message": (
                        "No active period"
                        if not current_period
                        else "Currently in session"
                    ),
                }
            )

        except Student.DoesNotExist:
            return Response(
                {"error": "Student profile not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to get current period: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"])
    def schedule(self, request, pk=None):
        """Get complete schedule for a specific student"""
        student = self.get_object()
        schedule_entries = get_student_schedule_entries(student)

        if not schedule_entries.exists():
            return Response(
                {
                    "detail": "No schedule found for this student.",
                    "student_info": {
                        "id": student.id,
                        "name": student.full_name,
                        "classroom": getattr(student, "classroom", None),
                    },
                },
                status=404,
            )

        serializer = StudentScheduleSerializer(schedule_entries, many=True)
        schedule_by_day = group_schedule_by_day(serializer.data)

        return Response(
            {
                "student_info": {
                    "id": student.id,
                    "name": student.full_name,
                    "class": student.student_class.name if student.student_class else "",
                    "classroom": getattr(student, "classroom", None),
                    "education_level": student.education_level_display,
                },
                "schedule": serializer.data,
                "schedule_by_day": schedule_by_day,
                "statistics": {
                    "total_periods": len(serializer.data),
                    "subjects_count": len(
                        set(entry["subject_name"] for entry in serializer.data)
                    ),
                    "teachers_count": len(
                        set(entry["teacher_name"] for entry in serializer.data)
                    ),
                },
            }
        )

    @action(detail=True, methods=["get"])
    def weekly_schedule(self, request, pk=None):
        """Get weekly schedule view for a specific student"""
        student = self.get_object()
        schedule_entries = get_student_schedule_entries(student)

        if not schedule_entries.exists():
            return Response(
                {"detail": "No schedule found for this student."}, status=404
            )

        serializer = StudentScheduleSerializer(schedule_entries, many=True)
        schedule_by_day = group_schedule_by_day(serializer.data)

        total_periods = len(serializer.data)
        unique_subjects = set(entry["subject_name"] for entry in serializer.data)
        unique_teachers = set(entry["teacher_name"] for entry in serializer.data)

        days_with_classes = sum(
            1 for day, periods in schedule_by_day.items() if periods
        )
        avg_daily_periods = (
            total_periods / days_with_classes if days_with_classes > 0 else 0
        )

        weekly_data = {
            "student_id": student.id,
            "student_name": student.full_name,
            "classroom_name": getattr(student, "classroom", None),
            "education_level": student.education_level_display,
            "academic_year": "2024-2025",
            "term": "Current Term",
            "monday": schedule_by_day.get("monday", []),
            "tuesday": schedule_by_day.get("tuesday", []),
            "wednesday": schedule_by_day.get("wednesday", []),
            "thursday": schedule_by_day.get("thursday", []),
            "friday": schedule_by_day.get("friday", []),
            "saturday": schedule_by_day.get("saturday", []),
            "sunday": schedule_by_day.get("sunday", []),
            "total_periods_per_week": total_periods,
            "total_subjects": len(unique_subjects),
            "total_teachers": len(unique_teachers),
            "average_daily_periods": round(avg_daily_periods, 1),
        }

        return Response(weekly_data)

    @action(detail=True, methods=["get"])
    def daily_schedule(self, request, pk=None):
        """Get daily schedule for a specific student"""
        student = self.get_object()

        date_str = request.query_params.get("date")
        if date_str:
            try:
                target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date format. Use YYYY-MM-DD"}, status=400
                )
        else:
            target_date = date.today()

        day_of_week = target_date.strftime("%A").upper()

        schedule_entries = get_student_schedule_entries(student)
        daily_entries = schedule_entries.filter(day_of_week=day_of_week)

        serializer = StudentScheduleSerializer(daily_entries, many=True)

        current_time = datetime.now().time()
        current_period = None
        next_period = None

        sorted_periods = sorted(
            serializer.data, key=lambda x: x.get("start_time", "00:00")
        )

        for i, period in enumerate(sorted_periods):
            start_time = datetime.strptime(period["start_time"], "%H:%M:%S").time()
            end_time = datetime.strptime(period["end_time"], "%H:%M:%S").time()

            if start_time <= current_time <= end_time:
                current_period = period
            elif start_time > current_time and not next_period:
                next_period = period

        daily_data = {
            "student_id": student.id,
            "student_name": student.full_name,
            "classroom_name": getattr(student, "classroom", None),
            "date": target_date,
            "day_of_week": day_of_week,
            "periods": sorted_periods,
            "total_periods": len(sorted_periods),
            "current_period": current_period,
            "next_period": next_period,
        }

        return Response(daily_data)

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Get comprehensive dashboard data for the logged-in student."""
        logger.info(f"Dashboard request from user: {request.user.username}")

        try:
            student = get_student_from_user(request.user)
        except Student.DoesNotExist:
            return Response(
                {"error": "User is not a student", "username": request.user.username},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = date.today()

        # Get attendance statistics
        total_attendance = Attendance.objects.filter(student=student).count()
        present_attendance = Attendance.objects.filter(
            student=student, status="P"
        ).count()
        attendance_rate = (
            (present_attendance / total_attendance * 100) if total_attendance > 0 else 0
        )

        # Get recent attendance (last 30 days)
        thirty_days_ago = today - timedelta(days=30)
        recent_attendance = Attendance.objects.filter(
            student=student, date__gte=thirty_days_ago
        ).order_by("-date")[:10]

        # Get academic performance
        results = StudentResult.objects.filter(student=student)
        total_subjects = results.values("subject").distinct().count()

        if results.exists():
            average_score = (
                sum(result.percentage for result in results if result.percentage)
                / results.count()
            )
        else:
            average_score = 0

        # Get recent activities
        recent_activities = []

        recent_results = results.order_by("-created_at")[:5]
        for result in recent_results:
            recent_activities.append(
                {
                    "type": "result",
                    "title": f"{result.subject.name} Result",
                    "description": f"Score: {result.total_score} ({result.percentage}%)",
                    "date": result.created_at.strftime("%Y-%m-%d"),
                    "time_ago": self._get_time_ago(result.created_at),
                }
            )

        for attendance in recent_attendance[:5]:
            recent_activities.append(
                {
                    "type": "attendance",
                    "title": f"Attendance - {attendance.get_status_display()}",
                    "description": f"Section: {attendance.section.name}",
                    "date": attendance.date.strftime("%Y-%m-%d"),
                    "time_ago": self._get_time_ago(attendance.date),
                }
            )

        recent_activities.sort(key=lambda x: x["date"], reverse=True)
        recent_activities = recent_activities[:5]

        # Get announcements
        all_announcements = SchoolAnnouncement.objects.filter(
            is_active=True,
            start_date__lte=timezone.now(),
            end_date__gte=timezone.now(),
        ).order_by("-is_pinned", "-created_at")

        announcements = [
            announcement
            for announcement in all_announcements
            if "student" in announcement.target_audience
        ][:5]

        announcements_data = []
        for announcement in announcements:
            announcements_data.append(
                {
                    "id": announcement.id,
                    "title": announcement.title,
                    "content": announcement.content,
                    "type": announcement.announcement_type,
                    "is_pinned": announcement.is_pinned,
                    "created_at": announcement.created_at.strftime("%Y-%m-%d %H:%M"),
                    "time_ago": self._get_time_ago(announcement.created_at),
                }
            )

        # Get upcoming events
        upcoming_events = Event.objects.filter(
            is_active=True, is_published=True, start_date__gte=timezone.now()
        ).order_by("start_date")[:5]

        events_data = []
        for event in upcoming_events:
            events_data.append(
                {
                    "id": event.id,
                    "title": event.title,
                    "subtitle": event.subtitle,
                    "description": event.description,
                    "type": event.event_type,
                    "start_date": (
                        event.start_date.strftime("%Y-%m-%d")
                        if event.start_date
                        else None
                    ),
                    "end_date": (
                        event.end_date.strftime("%Y-%m-%d") if event.end_date else None
                    ),
                    "days_until": (
                        (event.start_date.date() - today).days
                        if event.start_date
                        else None
                    ),
                }
            )

        # Get academic calendar
        academic_calendar = AcademicCalendar.objects.filter(
            is_active=True, start_date__gte=today
        ).order_by("start_date")[:10]

        calendar_data = []
        for event in academic_calendar:
            calendar_data.append(
                {
                    "id": event.id,
                    "title": event.title,
                    "description": event.description,
                    "type": event.event_type,
                    "start_date": event.start_date.strftime("%Y-%m-%d"),
                    "end_date": (
                        event.end_date.strftime("%Y-%m-%d") if event.end_date else None
                    ),
                    "location": event.location,
                    "days_until": (event.start_date - today).days,
                }
            )

        dashboard_data = {
            "student_info": {
                "name": student.full_name,
                "class": student.student_class.name if student.student_class else "",
                "education_level": student.education_level_display,
                "registration_number": student.registration_number,
                "admission_date": (
                    student.admission_date.strftime("%Y-%m-%d")
                    if student.admission_date
                    else None
                ),
            },
            "statistics": {
                "performance": {
                    "average_score": round(average_score, 1),
                    "label": "Average Score",
                },
                "attendance": {
                    "rate": round(attendance_rate, 1),
                    "present": present_attendance,
                    "total": total_attendance,
                    "label": "Present Rate",
                },
                "subjects": {"count": total_subjects, "label": "Total Subjects"},
                "schedule": {"classes_today": 0, "label": "Classes Today"},
            },
            "recent_activities": recent_activities,
            "announcements": announcements_data,
            "upcoming_events": events_data,
            "academic_calendar": calendar_data,
            "quick_stats": {
                "total_results": results.count(),
                "this_term_results": results.filter(
                    created_at__month=today.month
                ).count(),
                "attendance_this_month": Attendance.objects.filter(
                    student=student, date__month=today.month
                ).count(),
            },
        }

        return Response(dashboard_data)

    @action(detail=False, methods=["get"])
    def profile(self, request):
        """Get detailed profile information for the logged-in student."""
        logger.info(f"Profile action called by user: {request.user.username}")

        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            student = get_student_from_user(request.user)
            serializer = StudentDetailSerializer(student, context={"request": request})
            profile_data = serializer.data

            profile_data.update(
                {
                    "user_info": {
                        "username": student.user.username,
                        "email": student.user.email,
                        "first_name": student.user.first_name,
                        "last_name": student.user.last_name,
                        "is_active": student.user.is_active,
                        "date_joined": student.user.date_joined,
                    },
                    "academic_info": {
                        "class": student.student_class.name if student.student_class else "",
                        "education_level": student.education_level_display,
                        "admission_date": student.admission_date,
                        "registration_number": student.registration_number,
                        "classroom": student.classroom,
                    },
                    "contact_info": {
                        "parent_contact": student.parent_contact,
                        "emergency_contact": student.emergency_contact,
                    },
                    "medical_info": {
                        "medical_conditions": student.medical_conditions,
                        "special_requirements": student.special_requirements,
                    },
                }
            )

            return Response(profile_data)

        except Student.DoesNotExist:
            return Response(
                {"error": "Student profile not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to fetch profile: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = serializer.save()
        student_password = getattr(serializer, "_generated_student_password", None)
        student_username = getattr(serializer, "_generated_student_username", None)
        parent_password = getattr(serializer, "_generated_parent_password", None)
        headers = self.get_success_headers(serializer.data)

        return Response(
            {
                "student": StudentDetailSerializer(
                    student, context=self.get_serializer_context()
                ).data,
                "student_username": student_username,
                "student_password": student_password,
                "parent_password": parent_password,
            },
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def update(self, request, *args, **kwargs):
        """Override update method to add debugging."""
        logger.info(f"Update request for student {kwargs.get('pk')}")
        logger.info(f"Request data: {request.data}")

        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=True
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Override destroy method to add debugging."""
        logger.info(f"Delete request for student {kwargs.get('pk')}")
        return super().destroy(request, *args, **kwargs)
