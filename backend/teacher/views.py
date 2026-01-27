from django.db.models import Prefetch, Count, Q
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Teacher, AssignmentRequest, TeacherSchedule
from .serializers import (
    TeacherSerializer,
    AssignmentRequestSerializer,
    TeacherScheduleSerializer,
)
from classroom.models import GradeLevel, Section
from subject.models import Subject
from utils.section_filtering import AutoSectionFilterMixin
from utils.pagination import StandardResultsPagination
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.db import models
from rest_framework import permissions as drf_permissions
from schoolSettings.models import UserRole
import logging
from classroom.models import ClassroomTeacherAssignment, Classroom
from tenants.mixins import TenantFilterMixin

logger = logging.getLogger(__name__)


# Replace TeacherModulePermission in teacher/views.py with this:

from rest_framework import permissions as drf_permissions


class TeacherModulePermission(drf_permissions.BasePermission):
    """
    🔥 UPDATED: Custom permission to check if user has teachers module permission.
    Now includes section admins.
    """

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated or not user.is_active:
            return False

        # Super admins have full access
        if user.is_superuser:
            return True

        # Regular staff have full access
        if user.is_staff:
            return True

        # 🔥 NEW: Section admins have access
        if hasattr(user, "role") and user.role:
            role = user.role.lower()
            section_admin_roles = [
                "admin",
                "principal",
                "secondary_admin",
                "nursery_admin",
                "primary_admin",
                "junior_secondary_admin",
                "senior_secondary_admin",
            ]
            if role in section_admin_roles:
                # Section admins can read, create, update teachers in their section
                # The AutoSectionFilterMixin handles showing only their section's teachers
                if request.method in ["GET", "POST", "PUT", "PATCH"]:
                    return True

        # Teachers can view and edit their own profile
        if hasattr(user, "teacher"):
            if request.method in drf_permissions.SAFE_METHODS or request.method in [
                "PUT",
                "PATCH",
            ]:
                return True

        # Check role-based permission (for custom permission system)
        from schoolSettings.models import UserRole

        method_to_permission = {
            "GET": "read",
            "POST": "write",
            "PUT": "write",
            "PATCH": "write",
            "DELETE": "delete",
        }
        permission_type = method_to_permission.get(request.method, "read")

        user_roles = UserRole.objects.filter(
            user=user, is_active=True
        ).prefetch_related("role", "custom_permissions")

        for user_role in user_roles:
            if user_role.is_expired():
                continue

            if user_role.custom_permissions.filter(
                module="teachers", permission_type=permission_type, granted=True
            ).exists():
                return True

            if user_role.role.has_permission("teachers", permission_type):
                return True

        return False

    def has_object_permission(self, request, view, obj):
        user = request.user

        # Admins/staff full access
        if user.is_superuser or user.is_staff:
            return True

        # 🔥 NEW: Section admins have access
        if hasattr(user, "role") and user.role:
            role = user.role.lower()
            if any(
                admin in role
                for admin in [
                    "admin",
                    "primary_admin",
                    "nursery_admin",
                    "junior_secondary_admin",
                    "senior_secondary_admin",
                    "secondary_admin",
                ]
            ):
                # AutoSectionFilterMixin ensures they only see teachers in their section
                return True

        # Teachers can view and edit their own profile (but not delete)
        if hasattr(user, "teacher") and getattr(obj, "user", None) == user:
            if request.method in drf_permissions.SAFE_METHODS or request.method in [
                "PUT",
                "PATCH",
            ]:
                return True
            return False

        return self.has_permission(request, view)


class TeacherViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    Teacher ViewSet with automatic section filtering.
    AutoSectionFilterMixin handles all section-based filtering automatically.
    """

    queryset = Teacher.objects.select_related("user").all()
    serializer_class = TeacherSerializer
    authentication_classes = [
        JWTAuthentication,
        TokenAuthentication,
        SessionAuthentication,
    ]
    permission_classes = [TeacherModulePermission]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate teachers

    def get_queryset(self):
        """
        Get queryset with automatic section filtering from mixin.
        Then apply additional search/filter parameters.
        OPTIMIZED: Prefetch and annotate to avoid N+1 queries.
        """
        # CRITICAL: Call super() to get tenant-filtered queryset first
        # This calls TenantFilterMixin, then AutoSectionFilterMixin
        queryset = super().get_queryset()

        user = self.request.user
        logger.info(f"[TeacherViewSet] Getting queryset for user: {user.username}")

        optimized_classrooms = Classroom.objects.annotate(
            student_count=Count("students")
        ).select_related(
            "section",
            "section__grade_level",
        )

        queryset = queryset.prefetch_related(
            Prefetch(
                "classroom_assignments",  # ✅ Matches related_name in model
                queryset=ClassroomTeacherAssignment.objects.filter(is_active=True)
                .select_related("subject")
                .prefetch_related(Prefetch("classroom", queryset=optimized_classrooms)),
            )
        )

        # Now it's safe to count after optimization is applied
        logger.info(
            f"[TeacherViewSet] After mixin filtering: {queryset.count()} teachers"
        )

        # 🟦 Special case: Teachers can only see their own profile
        # Check if user is a teacher by checking if they have a teacher record
        is_teacher = False
        teacher_id = None

        try:
            # Try to get the teacher record for this user
            teacher = Teacher.objects.get(user=user)
            is_teacher = True
            teacher_id = teacher.id
            logger.info(
                f"[TeacherViewSet] User {user.id} is a teacher with ID {teacher_id}"
            )
        except Teacher.DoesNotExist:
            logger.info(f"[TeacherViewSet] User {user.id} is not a teacher")
            pass

        # Apply teacher restrictions
        if is_teacher and not user.is_staff and not user.is_superuser:
            # For list actions, restrict to self
            if self.action == "list":
                queryset = queryset.filter(user=user)
                logger.info(
                    f"[TeacherViewSet] Teacher user - restricted to self for list"
                )
            # For retrieve action, allow if the teacher ID matches
            elif self.action == "retrieve":
                # Get the teacher ID from URL kwargs
                requested_teacher_id = self.kwargs.get("pk")
                if requested_teacher_id:
                    try:
                        requested_teacher_id = int(requested_teacher_id)
                        # Only allow if requesting their own teacher record
                        if requested_teacher_id == teacher_id:
                            # Allow - they're requesting their own record
                            queryset = queryset.filter(id=teacher_id)
                            logger.info(
                                f"[TeacherViewSet] Teacher user - allowing retrieve of own record (ID: {teacher_id})"
                            )
                        else:
                            # Not their own record - deny
                            queryset = queryset.none()
                            logger.info(
                                f"[TeacherViewSet] Teacher user - denying retrieve of other teacher (requested: {requested_teacher_id}, own: {teacher_id})"
                            )
                    except (ValueError, TypeError):
                        queryset = queryset.filter(user=user)
                else:
                    queryset = queryset.filter(user=user)

        # Apply search filter
        search = self.request.query_params.get("search")
        if search:
            logger.info(f"[TeacherViewSet] Applying search: {search}")
            queryset = queryset.filter(
                models.Q(user__first_name__icontains=search)
                | models.Q(user__last_name__icontains=search)
                | models.Q(employee_id__icontains=search)
            ).distinct()

        # Apply level filter
        level = self.request.query_params.get("level")
        if level:
            queryset = queryset.filter(level=level)
            logger.info(f"[TeacherViewSet] Filtered by level={level}")

        # Apply status filter
        status_filter = self.request.query_params.get("status")
        if status_filter:
            if status_filter == "active":
                queryset = queryset.filter(is_active=True)
            elif status_filter == "inactive":
                queryset = queryset.filter(is_active=False)
            logger.info(f"[TeacherViewSet] Filtered by status={status_filter}")

        logger.info(f"[TeacherViewSet] Final queryset count: {queryset.count()}")
        return queryset

    @action(detail=False, methods=["get"], url_path="by-user/(?P<user_id>[^/.]+)")
    def by_user(self, request, user_id=None):
        """
        Get teacher by user ID.
        Teachers can only access their own profile.
        Admins/staff can access any teacher.
        """
        user = request.user

        # Convert user_id to int
        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid user ID"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Teachers can only access their own profile
        if hasattr(user, "teacher") and not user.is_staff and not user.is_superuser:
            if user.id != user_id:
                return Response(
                    {"error": "You can only access your own profile"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Get the teacher
        try:
            teacher = Teacher.objects.select_related("user").get(user_id=user_id)
            serializer = self.get_serializer(teacher)
            return Response(serializer.data)
        except Teacher.DoesNotExist:
            return Response(
                {"error": f"No teacher found for user ID {user_id}"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """
        Get the current user's teacher profile.
        Only works for teacher users.
        """
        user = request.user

        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Current user is not a teacher"},
                status=status.HTTP_404_NOT_FOUND,
            )

        teacher = user.teacher
        serializer = self.get_serializer(teacher)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Override create to include generated credentials in response"""
        logger.info(f"[TeacherViewSet] Create called by user: {request.user.username}")

        # Validate required fields
        required_fields = [
            "user_email",
            "user_first_name",
            "user_last_name",
            "employee_id",
        ]
        missing_fields = [
            field for field in required_fields if not request.data.get(field)
        ]

        if missing_fields:
            return Response(
                {
                    "error": "Missing required fields",
                    "missing_fields": missing_fields,
                    "message": f"Please provide: {', '.join(missing_fields)}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # For section admins, validate they can create teachers in requested section
        user = request.user
        role = self.get_user_role()  # From mixin

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:

            teacher_education_level = request.data.get("education_level")
            allowed_levels = self.get_user_education_level_access()  # From mixin

            if (
                teacher_education_level
                and teacher_education_level not in allowed_levels
            ):
                return Response(
                    {
                        "error": f"You can only create teachers for: {', '.join(allowed_levels)}",
                        "your_access": allowed_levels,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = self.get_serializer(data=request.data)

        if not serializer.is_valid():
            logger.error(f"[TeacherViewSet] Validation errors: {serializer.errors}")
            return Response(
                {"error": "Validation failed", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            teacher = serializer.save()
            logger.info(f"[TeacherViewSet] Teacher created successfully: {teacher.id}")

            response_data = {
                "id": teacher.id,
                "employee_id": teacher.employee_id,
                "staff_type": teacher.staff_type,
                "level": teacher.level,
                "phone_number": teacher.phone_number,
                "address": teacher.address,
                "date_of_birth": (
                    teacher.date_of_birth.isoformat() if teacher.date_of_birth else None
                ),
                "hire_date": (
                    teacher.hire_date.isoformat() if teacher.hire_date else None
                ),
                "qualification": teacher.qualification,
                "specialization": teacher.specialization,
                "photo": teacher.photo,
                "is_active": teacher.is_active,
                "created_at": teacher.created_at.isoformat(),
                "updated_at": teacher.updated_at.isoformat(),
                "full_name": f"{teacher.user.first_name} {teacher.user.last_name}",
                "email_readonly": teacher.user.email,
                "username": teacher.user.username,
                "user": {
                    "id": teacher.user.id,
                    "first_name": teacher.user.first_name,
                    "last_name": teacher.user.last_name,
                    "email": teacher.user.email,
                    "username": teacher.user.username,
                    "date_joined": (
                        teacher.user.date_joined.isoformat()
                        if teacher.user.date_joined
                        else None
                    ),
                    "is_active": teacher.user.is_active,
                },
            }

            # Include generated credentials if available
            if hasattr(serializer, "context") and "user_password" in serializer.context:
                response_data["user_password"] = serializer.context["user_password"]
                response_data["user_username"] = serializer.context.get(
                    "user_username", ""
                )

            return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(
                f"[TeacherViewSet] Error creating teacher: {str(e)}", exc_info=True
            )
            return Response(
                {"error": "Failed to create teacher", "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def retrieve(self, request, *args, **kwargs):
        """Override retrieve to add education_level to assignments"""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data

        # ✅ ADD education_level to each classroom assignment
        if "classroom_assignments" in data:
            for assignment in data["classroom_assignments"]:
                try:
                    classroom_id = assignment.get("classroom_id")
                    if classroom_id:
                        from classroom.models import Classroom

                        classroom = Classroom.objects.select_related(
                            "section__grade_level"
                        ).get(id=classroom_id)

                        # ✅ FIXED: Access education_level through grade_level
                        assignment["education_level"] = (
                            classroom.section.grade_level.education_level
                            if classroom.section and classroom.section.grade_level
                            else None
                        )

                except Exception as e:
                    logger.warning(
                        f"Could not get education_level for classroom {classroom_id}: {e}"
                    )
                    assignment["education_level"] = None

        return Response(data)


class AssignmentRequestViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    Assignment Request ViewSet with automatic section filtering.
    """

    queryset = AssignmentRequest.objects.all()
    serializer_class = AssignmentRequestSerializer
    permission_classes = [drf_permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate assignment requests

    def get_queryset(self):
        """
        Get queryset with automatic section filtering, then apply additional filters.
        """
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        user = self.request.user

        # Teachers see only their own requests
        if hasattr(user, "teacher") and not user.is_staff and not user.is_superuser:
            queryset = queryset.filter(teacher__user=user)

        # Apply additional filters
        teacher_id = self.request.query_params.get("teacher_id")
        if teacher_id:
            queryset = queryset.filter(teacher_id=teacher_id)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        request_type = self.request.query_params.get("request_type")
        if request_type:
            queryset = queryset.filter(request_type=request_type)

        return queryset

    def perform_create(self, serializer):
        teacher = get_object_or_404(Teacher, user=self.request.user)
        serializer.save(teacher=teacher)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        assignment_request = self.get_object()
        assignment_request.status = "approved"
        assignment_request.reviewed_at = timezone.now()
        assignment_request.reviewed_by = request.user
        assignment_request.save()
        return Response({"status": "Request approved"})

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        assignment_request = self.get_object()
        assignment_request.status = "rejected"
        assignment_request.reviewed_at = timezone.now()
        assignment_request.reviewed_by = request.user
        assignment_request.admin_notes = request.data.get("admin_notes", "")
        assignment_request.save()
        return Response({"status": "Request rejected"})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        assignment_request = self.get_object()
        assignment_request.status = "cancelled"
        assignment_request.save()
        return Response({"status": "Request cancelled"})


class TeacherScheduleViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    Teacher Schedule ViewSet with automatic section filtering.
    """

    queryset = TeacherSchedule.objects.all()
    serializer_class = TeacherScheduleSerializer
    permission_classes = [drf_permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate teacher schedules

    def get_queryset(self):
        """
        Get queryset with automatic section filtering, then apply additional filters.
        """
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        user = self.request.user

        # Teachers see only their own schedule
        if hasattr(user, "teacher") and not user.is_staff and not user.is_superuser:
            queryset = queryset.filter(teacher__user=user)

        # Apply additional filters
        teacher_id = self.request.query_params.get("teacher_id")
        if teacher_id:
            queryset = queryset.filter(teacher_id=teacher_id)

        academic_session = self.request.query_params.get("academic_session")
        if academic_session:
            queryset = queryset.filter(academic_session=academic_session)

        term = self.request.query_params.get("term")
        if term:
            queryset = queryset.filter(term=term)

        day_of_week = self.request.query_params.get("day_of_week")
        if day_of_week:
            queryset = queryset.filter(day_of_week=day_of_week)

        return queryset

    @action(detail=False, methods=["get"])
    def weekly_schedule(self, request):
        teacher_id = request.query_params.get("teacher_id")
        if not teacher_id:
            return Response(
                {"error": "teacher_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        schedules = self.get_queryset().filter(teacher_id=teacher_id, is_active=True)
        weekly_schedule = {}
        days = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]
        for day in days:
            weekly_schedule[day] = schedules.filter(day_of_week=day).order_by(
                "start_time"
            )
        serializer = self.get_serializer(schedules, many=True)
        return Response(
            {"weekly_schedule": weekly_schedule, "schedules": serializer.data}
        )

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        teacher_id = request.data.get("teacher_id")
        schedules_data = request.data.get("schedules", [])
        if not teacher_id or not schedules_data:
            return Response(
                {"error": "teacher_id and schedules are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        created_schedules = []
        for schedule_data in schedules_data:
            schedule_data["teacher"] = teacher_id
            serializer = self.get_serializer(data=schedule_data)
            if serializer.is_valid():
                schedule = serializer.save()
                created_schedules.append(schedule)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "message": f"Created {len(created_schedules)} schedule entries",
                "schedules": self.get_serializer(created_schedules, many=True).data,
            }
        )


class AssignmentManagementViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    Assignment management endpoints with section filtering.
    """

    permission_classes = [drf_permissions.IsAuthenticated]

    @action(detail=False, methods=["get"])
    def available_subjects(self, request):
        """Get subjects available to the user based on their section access"""
        subjects = Subject.objects.filter(is_active=True)
        # Apply section filtering to subjects
        subjects = self.apply_section_filters(subjects)

        return Response(
            {
                "subjects": [
                    {"id": subject.id, "name": subject.name, "code": subject.code}
                    for subject in subjects
                ]
            }
        )

    @action(detail=False, methods=["get"])
    def available_grade_levels(self, request):
        """Get grade levels available to the user based on their section access"""
        grade_levels = GradeLevel.objects.filter(is_active=True)
        # Apply section filtering to grade levels
        grade_levels = self.apply_section_filters(grade_levels)

        return Response(
            {
                "grade_levels": [
                    {
                        "id": grade.id,
                        "name": grade.name,
                        "education_level": grade.education_level,
                    }
                    for grade in grade_levels
                ]
            }
        )

    @action(detail=False, methods=["get"])
    def available_sections(self, request):
        """Get sections available to the user based on their section access"""
        sections = Section.objects.filter(is_active=True)
        # Apply section filtering to sections
        sections = self.apply_section_filters(sections)

        return Response(
            {
                "sections": [
                    {
                        "id": section.id,
                        "name": section.name,
                        "grade_level": section.grade_level.name,
                    }
                    for section in sections
                ]
            }
        )

    @action(detail=False, methods=["get"])
    def teacher_assignments_summary(self, request):
        teacher_id = request.query_params.get("teacher_id")
        if not teacher_id:
            return Response(
                {"error": "teacher_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        teacher = get_object_or_404(Teacher, id=teacher_id)

        subject_assignments = (
            teacher.teacher_assignments.values("subject").distinct().count()
        )
        class_assignments = (
            teacher.teacher_assignments.values("grade_level", "section")
            .distinct()
            .count()
        )
        total_students = 0
        pending_requests = teacher.assignment_requests.filter(status="pending").count()

        return Response(
            {
                "total_subjects": subject_assignments,
                "total_classes": class_assignments,
                "total_students": total_students,
                "pending_requests": pending_requests,
                "teaching_hours": 25,
            }
        )
