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
from classroom.models import ClassSchedule, Classroom, Section, GradeLevel
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
import csv
from datetime import date, timedelta, datetime, time
from django.utils import timezone
from .models import Student, ResultCheckToken
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
                    "token": token_string,  # THIS WAS MISSING!
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

    student = None
    try:
        student = Student.objects.select_related("user").get(user=token_obj.student)
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

    education_level = student.education_level if student else ""
    current_class = None
    if student and hasattr(student, "classroom"):
        current_class = student.classroom

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

        student_class = ""
        if hasattr(token.student, "student_profile") and token.student.student_profile:
            student_class = getattr(
                token.student.student_profile, "classroom", ""
            ) or getattr(token.student.student_profile, "student_class", "")
        elif hasattr(token.student, "classroom"):
            student_class = token.student.classroom or ""
        elif hasattr(token.student, "student_class"):
            student_class = token.student.student_class or ""

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
    """Helper function to get schedule entries for a student"""

    # Lightweight debug (keep concise to avoid noisy logs in production)
    print("=== DEBUGGING STUDENT CLASSROOM ===")
    print(f"Student: {student.full_name}")
    print(f"Student classroom value: '{student.classroom}'")

    # Method 1: Direct classroom match
    if hasattr(student, "classroom") and student.classroom:
        try:
            classroom = Classroom.objects.get(name__iexact=student.classroom.strip())
            schedule_qs = ClassSchedule.objects.filter(
                classroom=classroom, is_active=True
            ).select_related(
                "subject", "teacher__user", "classroom__section__grade_level"
            )
            if schedule_qs.exists():
                return schedule_qs
        except Classroom.DoesNotExist:
            print(f"No classroom found with exact name: {student.classroom}")

    # Method 2: Parse classroom like "Primary 1 A" → GradeLevel + Section
    if hasattr(student, "classroom") and student.classroom:
        try:
            classroom_str = student.classroom.strip()
            parts = classroom_str.split()
            # Expect forms like: [Primary, 1, A] or [JSS, 1, A] or [SS, 2, B]
            section_letter = None
            grade_number = None
            education_keyword = None

            if len(parts) >= 2:
                # If last token is a single alpha char, treat as section
                if parts[-1].isalpha() and len(parts[-1]) == 1:
                    section_letter = parts[-1]
                    parts = parts[:-1]

                # Find a numeric token for grade number
                for token in parts[::-1]:
                    if token.isdigit():
                        grade_number = int(token)
                        break

                # Education keyword from remaining tokens (keep words)
                education_keyword = " ".join([p for p in parts if not p.isdigit()]).strip()

                # Map keyword to education_level and build GradeLevel filter
                gradelevel_q = GradeLevel.objects.all()
                # Normalize keywords
                if education_keyword.upper().startswith("PRIMARY"):
                    gradelevel_q = gradelevel_q.filter(education_level="PRIMARY")
                elif education_keyword.upper().startswith("JSS") or education_keyword.upper().startswith("JUNIOR"):
                    gradelevel_q = gradelevel_q.filter(education_level="JUNIOR_SECONDARY")
                elif education_keyword.upper().startswith("SS") or education_keyword.upper().startswith("SENIOR"):
                    gradelevel_q = gradelevel_q.filter(education_level="SENIOR_SECONDARY")
                elif education_keyword.upper().startswith("NURSERY"):
                    gradelevel_q = gradelevel_q.filter(education_level="NURSERY")

                # Build name candidates like "SS 1", "Senior Secondary 1" if we have number
                name_candidates = []
                ek_upper = education_keyword.upper()
                if grade_number is not None:
                    # Common abbreviations and full names
                    if ek_upper.startswith("SS") or ek_upper.startswith("SENIOR"):
                        name_candidates.extend([
                            f"SS {grade_number}",
                            f"Senior Secondary {grade_number}",
                        ])
                    elif ek_upper.startswith("JSS") or ek_upper.startswith("JUNIOR"):
                        name_candidates.extend([
                            f"JSS {grade_number}",
                            f"Junior Secondary {grade_number}",
                        ])
                    elif ek_upper.startswith("PRIMARY"):
                        name_candidates.append(f"Primary {grade_number}")
                    elif ek_upper.startswith("NURSERY"):
                        name_candidates.append(f"Nursery {grade_number}")

                # Try matching by name candidates first, then by education/order, then fallback by icontains
                grade_level = None
                for cand in name_candidates:
                    grade_level = GradeLevel.objects.filter(name__iexact=cand).first()
                    if grade_level:
                        break

                if not grade_level:
                    if grade_number is not None:
                        gradelevel_q = gradelevel_q.filter(order=grade_number)
                    grade_level = gradelevel_q.first()

                if not grade_level and education_keyword:
                    grade_level = GradeLevel.objects.filter(name__icontains=education_keyword).first()

                if grade_level:
                    section = None
                    if section_letter:
                        section = Section.objects.filter(
                            name__iexact=section_letter, grade_level=grade_level
                        ).first()

                    # If specific section is identified, use it; otherwise include all sections for the grade level
                    if section:
                        classrooms_q = Classroom.objects.filter(section=section)
                    else:
                        classrooms_q = Classroom.objects.filter(
                            section__grade_level=grade_level
                        )

                    schedule_qs = ClassSchedule.objects.filter(
                        classroom__in=classrooms_q, is_active=True
                    ).select_related(
                        "subject",
                        "teacher__user",
                        "classroom__section__grade_level",
                    )
                    if schedule_qs.exists():
                        return schedule_qs
        except Exception as e:
            print(f"Error in Method 2: {str(e)}")

    # Method 3: Find by student class mapping
    try:
        class_to_grade_mapping = {
            "NURSERY_1": "Nursery 1",
            "NURSERY_2": "Nursery 2",
            "PRE_K": "Pre-K",
            "KINDERGARTEN": "Kindergarten",
            "PRIMARY_1": "Primary 1",
            "PRIMARY_2": "Primary 2",
            "PRIMARY_3": "Primary 3",
            "PRIMARY_4": "Primary 4",
            "PRIMARY_5": "Primary 5",
            "PRIMARY_6": "Primary 6",
            "JSS_1": "JSS 1",
            "JSS_2": "JSS 2",
            "JSS_3": "JSS 3",
            "SS_1": "SS 1",
            "SS_2": "SS 2",
            "SS_3": "SS 3",
        }

        grade_name = class_to_grade_mapping.get(student.student_class)
        if grade_name:
            # Derive education_level and grade order from grade_name
            order = None
            if any(ch.isdigit() for ch in grade_name):
                try:
                    order = int("".join([ch for ch in grade_name if ch.isdigit()]))
                except ValueError:
                    order = None

            edu = None
            if grade_name.upper().startswith("PRIMARY"):
                edu = "PRIMARY"
            elif grade_name.upper().startswith("JSS"):
                edu = "JUNIOR_SECONDARY"
            elif grade_name.upper().startswith("SS"):
                edu = "SENIOR_SECONDARY"
            elif grade_name.upper().startswith("NURSERY"):
                edu = "NURSERY"

            gradelevel_q = GradeLevel.objects.all()
            if edu:
                gradelevel_q = gradelevel_q.filter(education_level=edu)
            if order is not None:
                gradelevel_q = gradelevel_q.filter(order=order)

            grade_level = (
                GradeLevel.objects.filter(name__iexact=grade_name).first()
                or gradelevel_q.first()
            )

            if grade_level:
                classrooms = Classroom.objects.filter(section__grade_level=grade_level)
                schedule_qs = ClassSchedule.objects.filter(
                    classroom__in=classrooms, is_active=True
                ).select_related(
                    "subject", "teacher__user", "classroom__section__grade_level"
                )
                if schedule_qs.exists():
                    return schedule_qs
    except Exception as e:
        print(f"Error in Method 3: {str(e)}")

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
        return Student.objects.get(user=user)


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
    """Get schedule for current student - Improved version"""
    print(f"Schedule view called by user: {request.user.username}")

    try:
        student = get_student_from_user(request.user)
        print(f"Found student: {student}")

        schedule_entries = get_student_schedule_entries(student)

        if not schedule_entries.exists():
            return Response(
                {
                    "detail": "No schedule found for this student.",
                    "debug_info": {
                        "student_classroom": getattr(student, "classroom", None),
                        "student_class": student.student_class,
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
                    "class": student.get_student_class_display(),
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
        print(f"Error in student_schedule_view: {str(e)}")
        return Response({"error": f"Failed to fetch schedule: {str(e)}"}, status=500)


class StudentViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing students with proper tenant filtering and section access control.
    """
    queryset = Student.objects.all()  # Base queryset - will be filtered by mixins and get_queryset()
    permission_classes = [HasStudentsPermissionOrReadOnly]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large student datasets
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = [
        "user",
        "education_level",
        "student_class",
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
    ordering = ["education_level", "student_class", "user__first_name"]

    # def get_queryset(self):
    #     """Optimize queryset with select_related for better performance."""
    #     queryset = Student.objects.select_related("user").prefetch_related("parents")

    #     # Apply section-based filtering for authenticated users
    #     if self.request.user.is_authenticated:
    #         queryset = self.filter_students_by_section_access(queryset)

    #     return queryset
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

        logger.info(f"🔍 StudentViewSet.get_queryset: user_filter={user_filter}, user.id={self.request.user.id}, is_self_query={is_self_query}")

        # CRITICAL: If student is viewing their own record, skip AutoSectionFilterMixin
        if is_self_query:
            logger.info(f"✅ Self-query detected for user {user_filter}, bypassing section filtering")
            # Bypass mixins and get base queryset directly with only tenant filtering
            queryset = Student.objects.all()

            # Apply tenant filtering manually (tenant is set by TenantMiddleware)
            tenant = getattr(self.request, 'tenant', None)
            logger.info(f"🏢 Tenant from request: {tenant}")
            if tenant:
                # Use tenant ID for filtering to avoid object comparison issues
                queryset = queryset.filter(tenant_id=tenant.id)
                logger.info(f"📊 After tenant filter: {queryset.count()} students")

            # Add performance optimizations
            queryset = queryset.select_related("user").prefetch_related("parents")

            # Filter by the specific user
            queryset = queryset.filter(user_id=user_filter)
            logger.info(f"📊 After user filter: {queryset.count()} students")

            return queryset

        # CRITICAL: For non-self queries, call super() to apply tenant and section filtering
        logger.info(f"⚙️ Not a self-query, using standard filtering")
        queryset = super().get_queryset()

        # Add performance optimizations
        queryset = queryset.select_related("user").prefetch_related("parents")

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
            # Convert date to datetime for comparison
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
            student = get_object_or_404(Student, pk=pk)
            student_data = StudentDetailSerializer(student).data
            return Response(student_data)
        except Student.DoesNotExist:
            return Response(
                {"detail": f"Student with id '{pk}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

    # SPECIAL ENDPOINTS - Using proper @action decorators
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
                            "student_class": student.student_class,
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
                        "class": student.get_student_class_display(),
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

            days_with_classes = sum(1 for _, periods in schedule_by_day.items() if periods)
            avg_daily_periods = total_periods / days_with_classes if days_with_classes > 0 else 0

            weekly_data = {
                "student_id": student.id,
                "student_name": student.full_name,
                "classroom_name": getattr(student, "classroom", None),
                "education_level": student.get_education_level_display(),
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
                {"error": "Student profile not found"}, status=status.HTTP_404_NOT_FOUND
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

            # Get today's schedule
            schedule_entries = get_student_schedule_entries(student)
            today_schedule = schedule_entries.filter(day_of_week=current_day)

            current_period = None
            next_period = None

            for entry in today_schedule:
                start_time = entry.start_time
                end_time = entry.end_time

                # Check if current time is within this period
                if start_time <= current_time <= end_time:
                    current_period = {
                        "subject": entry.subject.name if entry.subject else "Unknown",
                        "teacher": get_user_display_name(entry.teacher.user) if entry.teacher and entry.teacher.user else "Unknown",
                        "start_time": start_time.strftime("%H:%M"),
                        "end_time": end_time.strftime("%H:%M"),
                        "classroom": (
                            entry.classroom.name if entry.classroom else "Unknown"
                        ),
                        "is_current": True,
                    }
                    break
                # Check for next period
                elif start_time > current_time and not next_period:
                    next_period = {
                        "subject": entry.subject.name if entry.subject else "Unknown",
                        "teacher": get_user_display_name(entry.teacher.user) if entry.teacher and entry.teacher.user else "Unknown",
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
                {"error": "Student profile not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to get current period: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # REGULAR STUDENT ACTIONS
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
                    "class": student.get_student_class_display(),
                    "classroom": getattr(student, "classroom", None),
                    "education_level": student.get_education_level_display(),
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

        # Calculate statistics
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
            "education_level": student.get_education_level_display(),
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

        # Get date from query params, default to today
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

        # Find current and next period
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
        print(f"Dashboard request from user: {request.user.username}")

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

        # Add recent results
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

        # Add recent attendance
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

        # Sort activities by date
        recent_activities.sort(key=lambda x: x["date"], reverse=True)
        recent_activities = recent_activities[:5]

        # Get announcements for students
        all_announcements = SchoolAnnouncement.objects.filter(
            is_active=True, start_date__lte=timezone.now(), end_date__gte=timezone.now()
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

        # Get academic calendar events
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
                "class": student.get_student_class_display(),
                "education_level": student.get_education_level_display(),
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
        print(f"Profile action called by user: {request.user.username}")

        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            student = get_student_from_user(request.user)
            serializer = StudentDetailSerializer(student, context={"request": request})
            profile_data = serializer.data

            # Add additional profile-specific data
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
                        "class": student.get_student_class_display(),
                        "education_level": student.get_education_level_display(),
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
                {"error": "Student profile not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to fetch profile: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # CRUD OPERATIONS
    def create(self, request, *args, **kwargs):
        self.permission_classes = [AllowAny]
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
        print(f"Update request for student {kwargs.get('pk')}")
        print(f"Request data: {request.data}")

        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=True
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Override destroy method to add debugging."""
        print(f"Delete request for student {kwargs.get('pk')}")
        return super().destroy(request, *args, **kwargs)
