from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.http import HttpResponse
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Count, Avg, Max, Min
from django.utils import timezone
from io import TextIOWrapper
import csv
from datetime import datetime, timedelta
from utils.section_filtering import SectionFilterMixin, AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination, StandardResultsPagination
import logging

# Import models
from .models import (
    Exam,
    ExamType,
    ExamStatus,
    DifficultyLevel,
    ExamSchedule,
    ExamRegistration,
    ExamStatistics,
    QuestionBank,
    ExamTemplate,
    ExamReview,
    ExamReviewer,
    ExamReviewComment,
    ReviewStatus,
)
from result.models import StudentResult
from classroom.models import GradeLevel, Section
from subject.models import Subject
from teacher.models import Teacher
from students.models import Student
from django.shortcuts import render, redirect
from django.contrib import messages
from .forms import ExamForm, ExamScheduleForm


# Import serializers
from .serializers import (
    ExamListSerializer,
    ExamDetailSerializer,
    ExamCreateUpdateSerializer,
    ExamScheduleSerializer,
    ExamRegistrationSerializer,
    ResultSerializer,
    ResultCreateUpdateSerializer,
    ExamStatisticsSerializer,
    # EXAM-003 serializers
    QuestionBankListSerializer,
    QuestionBankDetailSerializer,
    QuestionBankCreateUpdateSerializer,
    ExamTemplateListSerializer,
    ExamTemplateDetailSerializer,
    ExamTemplateCreateUpdateSerializer,
    ExamReviewListSerializer,
    ExamReviewDetailSerializer,
    ExamReviewSubmitSerializer,
    ExamReviewDecisionSerializer,
    ExamReviewerSerializer,
    ExamReviewCommentSerializer,
    ExamReviewCommentCreateSerializer,
)

# Import filters
from .filters import ExamFilter

logger = logging.getLogger(__name__)


# ==============================================================================
# FK HELPER UTILITIES
# ==============================================================================


def _get_exam_status(code, tenant):
    """Fetch an ExamStatus instance by code, scoped to tenant. Returns None if not found."""
    try:
        return ExamStatus.objects.get(code=code, tenant=tenant)
    except ExamStatus.DoesNotExist:
        logger.error(f"ExamStatus with code='{code}' not found for tenant={tenant}")
        return None


def _get_review_status(code, tenant):
    """Fetch a ReviewStatus instance by code, scoped to tenant. Returns None if not found."""
    try:
        return ReviewStatus.objects.get(code=code, tenant=tenant)
    except ReviewStatus.DoesNotExist:
        logger.error(f"ReviewStatus with code='{code}' not found for tenant={tenant}")
        return None


def _exam_status_code(exam):
    """Safely get the code string from an exam's FK status. Returns '' if unset."""
    return exam.status.code if exam.status else ""


def _review_status_code(review):
    """Safely get the code string from a review's FK status. Returns '' if unset."""
    return review.status.code if review.status else ""


# ==============================================================================
# TEMPLATE VIEWS
# ==============================================================================

def create_exam(request):
    if request.method == "POST":
        form = ExamForm(request.POST)
        if form.is_valid():
            exam = form.save()
            messages.success(request, f'Exam "{exam.title}" created successfully!')
            return redirect("exam_list")
    else:
        form = ExamForm()

    return render(request, "exams/exam_form.html", {"form": form})


def create_exam_schedule(request):
    if request.method == "POST":
        form = ExamScheduleForm(request.POST)
        if form.is_valid():
            schedule = form.save()
            messages.success(
                request, f'Exam schedule "{schedule.name}" created successfully!'
            )
            return redirect("exam_schedule_list")
    else:
        form = ExamScheduleForm()

    return render(request, "exams/exam_schedule_form.html", {"form": form})


# ==============================================================================
# SECTION EDUCATION LEVEL HELPER MIXIN
# ==============================================================================


class SectionEducationLevelMixin:
    """
    Reusable mixin providing _get_section_education_levels().
    Eliminates the copy-pasted version in every ViewSet.
    """

    SECTION_TO_EDUCATION_LEVEL = {
        "nursery": ["NURSERY"],
        "primary": ["PRIMARY"],
        "junior_secondary": ["JUNIOR_SECONDARY"],
        "senior_secondary": ["SENIOR_SECONDARY"],
        "secondary": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
    }

    ROLE_TO_SECTION = {
        "nursery_admin": "nursery",
        "primary_admin": "primary",
        "junior_secondary_admin": "junior_secondary",
        "senior_secondary_admin": "senior_secondary",
        "secondary_admin": "secondary",
    }

    def _get_section_education_levels(self, user_or_section):
        """Return a list of education level strings for the given user or section."""
        if hasattr(user_or_section, "section") and hasattr(user_or_section, "role"):
            user_section = user_or_section.section
            if not user_section and user_or_section.role in self.ROLE_TO_SECTION:
                user_section = self.ROLE_TO_SECTION[user_or_section.role]
            return self.SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

        section_name = (
            str(user_or_section.name).lower()
            if hasattr(user_or_section, "name")
            else str(user_or_section).lower()
        )

        if section_name in self.SECTION_TO_EDUCATION_LEVEL:
            return self.SECTION_TO_EDUCATION_LEVEL[section_name]

        if (
            "nursery" in section_name
            or "pre-nursery" in section_name
            or "pre nursery" in section_name
        ):
            return ["NURSERY"]
        elif "primary" in section_name:
            return ["PRIMARY"]
        elif (
            "jss" in section_name
            or "junior secondary" in section_name
            or "js" in section_name
        ):
            return ["JUNIOR_SECONDARY"]
        elif (
            "sss" in section_name
            or "senior secondary" in section_name
            or "ss" in section_name
        ):
            return ["SENIOR_SECONDARY"]

        logger.warning(
            f"Could not determine education level for section: {section_name}"
        )
        return []


# ==============================================================================
# EXAM VIEWSET
# ==============================================================================


class ExamViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    AutoSectionFilterMixin,
    viewsets.ModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    Streamlined ViewSet for managing exams with section-based filtering.
    """

    queryset = Exam.objects.select_related(
        "subject",
        "grade_level",
        "section",
        "teacher",
        "exam_type",
        "status",
        "difficulty_level",  # FK fields
    ).prefetch_related("invigilators")

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ExamFilter
    search_fields = ["title", "description", "code", "subject__name", "venue"]
    ordering_fields = ["exam_date", "start_time", "title", "created_at"]
    ordering = ["-exam_date", "start_time"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_serializer_class(self):
        if self.action == "list":
            return ExamListSerializer
        elif self.action in ["create", "update", "partial_update"]:
            return ExamCreateUpdateSerializer
        return ExamDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.is_superuser:
            logger.info(f"✅ Superuser {user.username} - Full access to all exams")
            return queryset

        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )
        logger.info(f"📋 User {user.username} has role: {role}")

        if role in ["admin", "superadmin", "principal"]:
            logger.info(f"✅ Admin {user.username} - Full access to all exams")
            return queryset

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            logger.info(
                f"🔒 Section admin '{role}' - restricted to: {education_levels}"
            )
            if not education_levels:
                logger.warning(f"❌ No education levels for {user.username}")
                return queryset.none()
            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Filtered Exams: {filtered.count()} of {queryset.count()}")
            return filtered

        if role == "teacher" or hasattr(user, "teacher"):
            try:
                teacher = Teacher.objects.get(user=user)
                filtered = queryset.filter(teacher_id=teacher.id)
                logger.info(f"✅ Teacher can see {filtered.count()} exams")
                return filtered
            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for {user.username}")
                return queryset.none()

        if user.is_staff:
            logger.info(f"✅ Staff {user.username} - Full access")
            return queryset

        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))
            if not education_levels:
                logger.warning(f"❌ No education level access for {user.username}")
                return queryset.none()
            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Student/Parent can see {filtered.count()} exams")
            return filtered

        logger.warning(f"❌ No access rules matched for {user.username}")
        return queryset.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    # ------------------------------------------------------------------
    # Bulk result helpers
    # ------------------------------------------------------------------

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """Bulk create results"""
        results_data = request.data.get("results", [])
        if not results_data:
            return Response(
                {"error": "Results data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_results = []
        errors = []

        with transaction.atomic():
            for i, result_data in enumerate(results_data):
                serializer = ResultCreateUpdateSerializer(data=result_data)
                if serializer.is_valid():
                    result = serializer.save(recorded_by=request.user)
                    created_results.append(result.id)
                else:
                    errors.append({"index": i, "errors": serializer.errors})

            if errors:
                transaction.set_rollback(True)
                return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Created {len(created_results)} results",
                "created_ids": created_results,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def bulk_update(self, request):
        """Bulk update results"""
        results_data = request.data.get("results", [])
        if not results_data:
            return Response(
                {"error": "Results data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_count = 0
        errors = []

        with transaction.atomic():
            for i, result_data in enumerate(results_data):
                result_id = result_data.get("id")
                if not result_id:
                    errors.append({"index": i, "error": "Result ID is required"})
                    continue
                try:
                    result = StudentResult.objects.get(id=result_id)
                    serializer = ResultCreateUpdateSerializer(
                        result, data=result_data, partial=True
                    )
                    if serializer.is_valid():
                        serializer.save(updated_by=request.user)
                        updated_count += 1
                    else:
                        errors.append({"index": i, "errors": serializer.errors})
                except StudentResult.DoesNotExist:
                    errors.append(
                        {"index": i, "error": f"Result {result_id} not found"}
                    )
                except Exception as e:
                    errors.append({"index": i, "error": str(e)})

            if errors:
                transaction.set_rollback(True)
                return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Updated {updated_count} results",
                "updated_count": updated_count,
            }
        )

    # ------------------------------------------------------------------
    # Result query helpers
    # ------------------------------------------------------------------

    @action(detail=False, methods=["get"])
    def by_student(self, request, student_id=None):
        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        results = self.get_queryset().filter(student_id=student_id)
        return Response(self.get_serializer(results, many=True).data)

    @action(detail=False, methods=["get"])
    def by_exam(self, request, exam_id=None):
        if not exam_id:
            return Response(
                {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        results = self.get_queryset().filter(exam_id=exam_id)
        return Response(self.get_serializer(results, many=True).data)

    @action(detail=False, methods=["get"])
    def by_subject(self, request, subject_id=None):
        if not subject_id:
            return Response(
                {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        results = self.get_queryset().filter(subject_id=subject_id)
        return Response(self.get_serializer(results, many=True).data)

    @action(detail=False, methods=["get"])
    def by_grade(self, request, grade_id=None):
        if not grade_id:
            return Response(
                {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        results = self.get_queryset().filter(grade_level_id=grade_id)
        return Response(self.get_serializer(results, many=True).data)

    @action(detail=False, methods=["get"])
    def student_transcript(self, request, student_id=None):
        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        results = (
            self.get_queryset()
            .filter(student_id=student_id)
            .order_by("exam__exam_date")
        )
        return Response(self.get_serializer(results, many=True).data)

    @action(detail=False, methods=["get"])
    def grade_sheet(self, request, exam_id=None):
        if not exam_id:
            return Response(
                {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        results = (
            self.get_queryset()
            .filter(exam_id=exam_id)
            .order_by("student__user__first_name")
        )
        return Response(self.get_serializer(results, many=True).data)

    # ------------------------------------------------------------------
    # Core exam status actions — FK-safe assignments
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"])
    def start_exam(self, request, pk=None):
        """Start an exam"""
        exam = self.get_object()

        # UPDATED: compare via FK .code
        if _exam_status_code(exam) != "scheduled":
            return Response(
                {"error": "Only scheduled exams can be started"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # UPDATED: assign FK instance, not raw string
        in_progress_status = _get_exam_status("in_progress", exam.tenant)
        if not in_progress_status:
            return Response(
                {
                    "error": "Exam status 'in_progress' not configured. Please create exam statuses first."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        exam.status = in_progress_status
        exam.save()
        return Response({"message": "Exam started successfully"})

    @action(detail=True, methods=["post"])
    def end_exam(self, request, pk=None):
        """End an exam and generate statistics"""
        exam = self.get_object()

        # UPDATED: compare via FK .code
        if _exam_status_code(exam) != "in_progress":
            return Response(
                {"error": "Only exams in progress can be ended"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # UPDATED: assign FK instance
        completed_status = _get_exam_status("completed", exam.tenant)
        if not completed_status:
            return Response(
                {
                    "error": "Exam status 'completed' not configured. Please create exam statuses first."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        exam.status = completed_status
        exam.save()
        self._generate_exam_statistics(exam)
        return Response({"message": "Exam ended successfully"})

    @action(detail=True, methods=["post"])
    def cancel_exam(self, request, pk=None):
        """Cancel an exam"""
        exam = self.get_object()

        # UPDATED: compare via FK .code
        if _exam_status_code(exam) == "completed":
            return Response(
                {"error": "Cannot cancel completed exam"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # UPDATED: assign FK instance
        cancelled_status = _get_exam_status("cancelled", exam.tenant)
        if not cancelled_status:
            return Response(
                {
                    "error": "Exam status 'cancelled' not configured. Please create exam statuses first."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        exam.status = cancelled_status
        exam.cancellation_reason = request.data.get("reason", "")
        exam.save()
        return Response({"message": "Exam cancelled successfully"})

    @action(detail=True, methods=["post"])
    def postpone_exam(self, request, pk=None):
        """Postpone an exam"""
        exam = self.get_object()
        new_date = request.data.get("new_date")
        new_start_time = request.data.get("new_start_time")
        new_end_time = request.data.get("new_end_time")
        reason = request.data.get("reason", "")

        if not new_date:
            return Response(
                {"error": "New date is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # UPDATED: compare via FK .code
        if _exam_status_code(exam) == "completed":
            return Response(
                {"error": "Cannot postpone completed exam"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # UPDATED: assign FK instance
        postponed_status = _get_exam_status("postponed", exam.tenant)
        if not postponed_status:
            return Response(
                {
                    "error": "Exam status 'postponed' not configured. Please create exam statuses first."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        exam.exam_date = new_date
        if new_start_time:
            exam.start_time = new_start_time
        if new_end_time:
            exam.end_time = new_end_time
        exam.status = postponed_status
        exam.postponement_reason = reason
        exam.save()
        return Response({"message": "Exam postponed successfully"})

    # ------------------------------------------------------------------
    # Approval workflow — FK-safe via model methods
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve an exam"""
        exam = self.get_object()

        # UPDATED: compare via FK .code
        if _exam_status_code(exam) != "pending_approval":
            return Response(
                {"error": "Only exams pending approval can be approved"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approver = None
        if request.user.is_authenticated:
            try:
                approver = Teacher.objects.get(user=request.user)
            except Teacher.DoesNotExist:
                pass

        notes = request.data.get("notes", "")
        exam.approve(approver, notes)  # model method handles FK assignment internally

        return Response(
            {
                "message": "Exam approved successfully",
                "status": exam.status.code if exam.status else None,
                "approved_at": exam.approved_at,
                "approved_by": exam.approved_by.id if exam.approved_by else None,
            }
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject an exam"""
        exam = self.get_object()

        # UPDATED: compare via FK .code
        if _exam_status_code(exam) != "pending_approval":
            return Response(
                {"error": "Only exams pending approval can be rejected"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approver = None
        if request.user.is_authenticated:
            try:
                approver = Teacher.objects.get(user=request.user)
            except Teacher.DoesNotExist:
                pass

        reason = request.data.get("reason", "")
        exam.reject(approver, reason)  # model method handles FK assignment internally

        return Response(
            {
                "message": "Exam rejected successfully",
                "status": exam.status.code if exam.status else None,
                "rejected_at": exam.approved_at,
                "rejected_by": exam.approved_by.id if exam.approved_by else None,
                "rejection_reason": exam.rejection_reason,
            }
        )

    @action(detail=True, methods=["post"])
    def submit_for_approval(self, request, pk=None):
        """Submit exam for approval"""
        exam = self.get_object()

        # UPDATED: compare via FK .code
        if _exam_status_code(exam) not in ["draft", "rejected"]:
            return Response(
                {"error": "Only draft or rejected exams can be submitted for approval"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam.submit_for_approval()  # model method handles FK assignment internally

        return Response(
            {
                "message": "Exam submitted for approval successfully",
                "status": exam.status.code if exam.status else None,
            }
        )

    # ------------------------------------------------------------------
    # Student registration
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"])
    def register_student(self, request, pk=None):
        exam = self.get_object()
        student_id = request.data.get("student_id")
        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if ExamRegistration.objects.filter(exam=exam, student=student).exists():
            return Response(
                {"error": "Student already registered for this exam"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        registration = ExamRegistration.objects.create(
            exam=exam, student=student, registration_date=timezone.now()
        )
        return Response(
            ExamRegistrationSerializer(registration).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["delete"])
    def unregister_student(self, request, pk=None):
        exam = self.get_object()
        student_id = request.data.get("student_id")
        try:
            registration = ExamRegistration.objects.get(
                exam=exam, student_id=student_id
            )
            registration.delete()
            return Response({"message": "Student unregistered successfully"})
        except ExamRegistration.DoesNotExist:
            return Response(
                {"error": "Registration not found"}, status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=["get"])
    def registrations(self, request, pk=None):
        exam = self.get_object()
        registrations = ExamRegistration.objects.filter(exam=exam).select_related(
            "student"
        )
        return Response(ExamRegistrationSerializer(registrations, many=True).data)

    @action(detail=True, methods=["get"])
    def get_registrations(self, request, pk=None):
        return self.registrations(request, pk)

    @action(detail=True, methods=["get"])
    def get_results(self, request, pk=None):
        return self.results(request, pk)

    @action(detail=True, methods=["get"])
    def get_statistics(self, request, pk=None):
        return self.statistics(request, pk)

    # ------------------------------------------------------------------
    # Results management
    # ------------------------------------------------------------------

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        exam = self.get_object()
        results = StudentResult.objects.filter(exam=exam).select_related("student")
        return Response(ResultSerializer(results, many=True).data)

    @action(detail=True, methods=["post"])
    def bulk_create_results(self, request, pk=None):
        exam = self.get_object()
        results_data = request.data.get("results", [])
        if not results_data:
            return Response(
                {"error": "Results data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_results = []
        errors = []

        with transaction.atomic():
            for i, result_data in enumerate(results_data):
                result_data["exam"] = exam.id
                result_data["subject"] = exam.subject.id
                serializer = ResultCreateUpdateSerializer(data=result_data)
                if serializer.is_valid():
                    result = serializer.save(recorded_by=request.user)
                    created_results.append(result.id)
                else:
                    errors.append({"index": i, "errors": serializer.errors})

            if errors:
                transaction.set_rollback(True)
                return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Created {len(created_results)} results",
                "created_ids": created_results,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        exam = self.get_object()
        stats, created = ExamStatistics.objects.get_or_create(
            exam=exam, defaults={"calculated_at": timezone.now()}
        )
        if not created and stats.calculated_at < timezone.now() - timedelta(hours=1):
            self._generate_exam_statistics(exam)
            stats.refresh_from_db()
        return Response(ExamStatisticsSerializer(stats).data)

    # ------------------------------------------------------------------
    # Essential filters
    # ------------------------------------------------------------------

    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        """Get upcoming exams — FK-safe: filter via status__code"""
        today = timezone.now().date()
        exams = (
            self.get_queryset()
            .filter(exam_date__gte=today, status__code="scheduled")
            .order_by("exam_date", "start_time")
        )
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def by_schedule(self, request):
        schedule_id = request.GET.get("schedule_id")
        if not schedule_id:
            return Response(
                {"error": "Schedule ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        exams = self.get_queryset().filter(exam_schedule_id=schedule_id)
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def by_teacher(self, request, teacher_id=None):
        try:
            teacher = Teacher.objects.get(id=teacher_id)
        except Teacher.DoesNotExist:
            return Response(
                {"error": "Teacher not found"}, status=status.HTTP_404_NOT_FOUND
            )
        exams = self.get_queryset().filter(teacher_id=teacher.id)
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def by_subject(self, request, subject_id=None):
        if not subject_id:
            return Response(
                {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        exams = self.get_queryset().filter(subject_id=subject_id)
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def by_grade(self, request, grade_id=None):
        if not grade_id:
            return Response(
                {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        exams = self.get_queryset().filter(grade_level_id=grade_id)
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def completed(self, request):
        """Get completed exams — FK-safe: filter via status__code"""
        exams = self.get_queryset().filter(status__code="completed")
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def ongoing(self, request):
        """Get ongoing exams — FK-safe: filter via status__code"""
        exams = self.get_queryset().filter(status__code="in_progress")
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def calendar_view(self, request):
        start_date = request.GET.get("start_date")
        end_date = request.GET.get("end_date")
        queryset = self.get_queryset()
        if start_date:
            queryset = queryset.filter(exam_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(exam_date__lte=end_date)
        exams = queryset.order_by("exam_date", "start_time")
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["get"])
    def summary_list(self, request):
        exams = self.get_queryset().annotate(
            registered_students_count=Count("examregistration", distinct=True)
        )
        return Response(self.get_serializer(exams, many=True).data)

    @action(detail=False, methods=["post"])
    def bulk_update(self, request):
        exam_ids = request.data.get("exam_ids", [])
        update_data = request.data.get("update_data", {})
        if not exam_ids:
            return Response(
                {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        updated_count = 0
        errors = []

        with transaction.atomic():
            for exam_id in exam_ids:
                try:
                    exam = Exam.objects.get(id=exam_id)
                    for field, value in update_data.items():
                        if hasattr(exam, field):
                            setattr(exam, field, value)
                    exam.save()
                    updated_count += 1
                except Exam.DoesNotExist:
                    errors.append(f"Exam {exam_id} not found")
                except Exception as e:
                    errors.append(f"Exam {exam_id}: {str(e)}")

        return Response(
            {
                "message": f"Updated {updated_count} exams",
                "updated_count": updated_count,
                "errors": errors,
            }
        )

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        exam_ids = request.data.get("exam_ids", [])
        if not exam_ids:
            return Response(
                {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        deleted_count = 0
        errors = []

        with transaction.atomic():
            for exam_id in exam_ids:
                try:
                    Exam.objects.get(id=exam_id).delete()
                    deleted_count += 1
                except Exam.DoesNotExist:
                    errors.append(f"Exam {exam_id} not found")
                except Exception as e:
                    errors.append(f"Exam {exam_id}: {str(e)}")

        return Response(
            {
                "message": f"Deleted {deleted_count} exams",
                "deleted_count": deleted_count,
                "errors": errors,
            }
        )

    # ------------------------------------------------------------------
    # Import / Export
    # ------------------------------------------------------------------

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        file = request.FILES.get("file")
        if not file or not file.name.endswith(".csv"):
            return Response(
                {"error": "Valid CSV file is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            decoded_file = TextIOWrapper(file.file, encoding="utf-8")
            reader = csv.DictReader(decoded_file)

            required_headers = [
                "title",
                "subject",
                "grade_level",
                "exam_date",
                "start_time",
                "end_time",
            ]
            missing_headers = [
                h for h in required_headers if h not in reader.fieldnames
            ]
            if missing_headers:
                return Response(
                    {
                        "error": f'Missing required columns: {", ".join(missing_headers)}'
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            created_exams = []
            errors = []

            with transaction.atomic():
                for row_num, row in enumerate(reader, start=2):
                    try:
                        exam_data = self._process_csv_row(row, row_num, request)
                        if "error" in exam_data:
                            errors.append(exam_data["error"])
                            continue
                        serializer = ExamCreateUpdateSerializer(data=exam_data)
                        if serializer.is_valid():
                            exam = serializer.save(created_by=request.user)
                            created_exams.append(exam.id)
                        else:
                            errors.append(f"Row {row_num}: {serializer.errors}")
                    except Exception as e:
                        errors.append(f"Row {row_num}: {str(e)}")

                if errors:
                    transaction.set_rollback(True)
                    return Response(
                        {"error": "CSV import failed", "details": errors},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            return Response(
                {
                    "message": f"Successfully imported {len(created_exams)} exams",
                    "created_exam_ids": created_exams,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            logger.error(f"CSV import error: {str(e)}")
            return Response(
                {"error": f"Import failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"])
    def export_csv(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="exams.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "id",
                "title",
                "code",
                "subject_name",
                "grade_level_name",
                "section_name",
                "teacher_name",
                "exam_date",
                "start_time",
                "end_time",
                "duration_minutes",
                "total_marks",
                "pass_marks",
                "venue",
                "status",  # UPDATED: write status code
                "exam_type",  # UPDATED: write exam_type name
            ]
        )

        for exam in self.filter_queryset(self.get_queryset()).select_related(
            "subject", "grade_level", "section", "teacher", "status", "exam_type"
        ):
            writer.writerow(
                [
                    exam.id,
                    exam.title,
                    exam.code,
                    exam.subject.name,
                    exam.grade_level.name,
                    exam.section.name if exam.section else "",
                    exam.teacher.full_name if exam.teacher else "",
                    exam.exam_date.strftime("%Y-%m-%d"),
                    exam.start_time.strftime("%H:%M"),
                    exam.end_time.strftime("%H:%M"),
                    exam.duration_minutes,
                    exam.total_marks,
                    exam.pass_marks,
                    exam.venue,
                    exam.status.code if exam.status else "",  # UPDATED: FK → .code
                    (
                        exam.exam_type.name if exam.exam_type else ""
                    ),  # UPDATED: FK → .name
                ]
            )

        return response

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _process_csv_row(self, row, row_num, request=None):
        """
        Process a single CSV row.
        exam_type and status columns are expected to hold codes that map to
        ExamType / ExamStatus FK records.
        """
        try:
            subject = Subject.objects.get(name=row["subject"].strip())
            grade_level = GradeLevel.objects.get(name=row["grade_level"].strip())

            section = None
            if row.get("section") and row["section"].strip():
                section = Section.objects.get(name=row["section"].strip())

            teacher = None
            if row.get("teacher") and row["teacher"].strip():
                teacher = Teacher.objects.get(full_name=row["teacher"].strip())

            exam_date = datetime.strptime(row["exam_date"], "%Y-%m-%d").date()
            start_time = datetime.strptime(row["start_time"], "%H:%M").time()
            end_time = datetime.strptime(row["end_time"], "%H:%M").time()

            # UPDATED: resolve exam_type code → FK id
            exam_type_code = row.get("exam_type", "written").strip()
            try:
                exam_type_obj = ExamType.objects.get(code=exam_type_code)
                exam_type_id = exam_type_obj.id
            except ExamType.DoesNotExist:
                return {
                    "error": f"Row {row_num}: ExamType with code '{exam_type_code}' not found"
                }

            # UPDATED: resolve status code → FK id
            status_code = row.get("status", "scheduled").strip()
            try:
                status_obj = ExamStatus.objects.get(code=status_code)
                status_id = status_obj.id
            except ExamStatus.DoesNotExist:
                return {
                    "error": f"Row {row_num}: ExamStatus with code '{status_code}' not found"
                }

            return {
                "title": row["title"].strip(),
                "subject": subject.id,
                "grade_level": grade_level.id,
                "section": section.id if section else None,
                "teacher": teacher.id if teacher else None,
                "exam_date": exam_date,
                "start_time": start_time,
                "end_time": end_time,
                "description": row.get("description", "").strip(),
                "total_marks": int(row.get("total_marks", 100)),
                "pass_marks": int(row.get("pass_marks", 40)),
                "venue": row.get("venue", "").strip(),
                "exam_type": exam_type_id,  # UPDATED: FK id
                "status": status_id,  # UPDATED: FK id
            }
        except Exception as e:
            return {"error": f"Row {row_num}: {str(e)}"}

    def _generate_exam_statistics(self, exam):
        results = StudentResult.objects.filter(exam=exam)
        if not results.exists():
            return

        total_registered = ExamRegistration.objects.filter(exam=exam).count()
        total_appeared = results.count()

        stats_data = {
            "total_registered": total_registered,
            "total_appeared": total_appeared,
            "total_absent": total_registered - total_appeared,
            "highest_score": results.aggregate(Max("score"))["score__max"] or 0,
            "lowest_score": results.aggregate(Min("score"))["score__min"] or 0,
            "average_score": results.aggregate(Avg("score"))["score__avg"] or 0,
            "total_passed": results.filter(is_pass=True).count(),
            "total_failed": results.filter(is_pass=False).count(),
        }
        stats_data["pass_percentage"] = (
            (stats_data["total_passed"] / stats_data["total_appeared"] * 100)
            if stats_data["total_appeared"] > 0
            else 0
        )

        ExamStatistics.objects.update_or_create(
            exam=exam, defaults={**stats_data, "calculated_at": timezone.now()}
        )


# ==============================================================================
# EXAM SCHEDULE VIEWSET
# ==============================================================================


class ExamScheduleViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    viewsets.ModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for exam schedules.
    """

    queryset = ExamSchedule.objects.all()
    serializer_class = ExamScheduleSerializer
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()
        if user.is_superuser:
            return queryset

        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        if role in ["admin", "superadmin", "principal"]:
            return queryset

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        if role == "teacher" or hasattr(user, "teacher"):
            try:
                teacher = Teacher.objects.get(user=user)
                return queryset.filter(teacher_id=teacher.id)
            except Teacher.DoesNotExist:
                return queryset.none()

        if user.is_staff:
            return queryset

        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        return queryset.none()

    @action(detail=True, methods=["get"])
    def exams(self, request, pk=None):
        schedule = self.get_object()
        exams = Exam.objects.filter(exam_schedule=schedule)
        return Response(ExamListSerializer(exams, many=True).data)

    @action(detail=True, methods=["get"])
    def get_exams(self, request, pk=None):
        return self.exams(request, pk)

    @action(detail=True, methods=["post"])
    def set_default(self, request, pk=None):
        schedule = self.get_object()
        ExamSchedule.objects.exclude(pk=schedule.pk).update(is_default=False)
        schedule.is_default = True
        schedule.save()
        return Response(
            {
                "message": "Default schedule updated successfully",
                "schedule": self.get_serializer(schedule).data,
            }
        )

    @action(detail=True, methods=["post"])
    def toggle_active(self, request, pk=None):
        schedule = self.get_object()
        schedule.is_active = not schedule.is_active
        schedule.save()
        status_text = "activated" if schedule.is_active else "deactivated"
        return Response(
            {"message": f"Schedule {status_text}", "is_active": schedule.is_active}
        )


# ==============================================================================
# EXAM REGISTRATION VIEWSET
# ==============================================================================


class ExamRegistrationViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    AutoSectionFilterMixin,
    viewsets.ModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for exam registrations with section filtering.
    """

    queryset = ExamRegistration.objects.select_related("exam", "student")
    serializer_class = ExamRegistrationSerializer
    ordering = ["-registration_date"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()
        if user.is_superuser:
            return queryset

        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        if role in ["admin", "superadmin", "principal"]:
            return queryset

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        if role == "teacher" or hasattr(user, "teacher"):
            try:
                teacher = Teacher.objects.get(user=user)
                return queryset.filter(teacher_id=teacher.id)
            except Teacher.DoesNotExist:
                return queryset.none()

        if user.is_staff:
            return queryset

        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        return queryset.none()

    @action(detail=False, methods=["post"])
    def bulk_register(self, request):
        exam_id = request.data.get("exam_id")
        student_ids = request.data.get("student_ids", [])
        if not exam_id or not student_ids:
            return Response(
                {"error": "Exam ID and student IDs are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response(
                {"error": "Exam not found"}, status=status.HTTP_404_NOT_FOUND
            )

        created_registrations = []
        errors = []

        with transaction.atomic():
            for student_id in student_ids:
                try:
                    student = Student.objects.get(id=student_id)
                    if ExamRegistration.objects.filter(
                        exam=exam, student=student
                    ).exists():
                        errors.append(f"Student {student_id} already registered")
                        continue
                    reg = ExamRegistration.objects.create(
                        exam=exam, student=student, registration_date=timezone.now()
                    )
                    created_registrations.append(reg.id)
                except Student.DoesNotExist:
                    errors.append(f"Student {student_id} not found")
                except Exception as e:
                    errors.append(f"Student {student_id}: {str(e)}")

        return Response(
            {
                "message": f"Registered {len(created_registrations)} students",
                "created_registrations": created_registrations,
                "errors": errors,
            }
        )

    @action(detail=False, methods=["get"])
    def by_student(self, request, student_id=None):
        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        registrations = self.get_queryset().filter(student_id=student_id)
        return Response(self.get_serializer(registrations, many=True).data)

    @action(detail=False, methods=["get"])
    def by_exam(self, request, exam_id=None):
        if not exam_id:
            return Response(
                {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        registrations = self.get_queryset().filter(exam_id=exam_id)
        return Response(self.get_serializer(registrations, many=True).data)

    @action(detail=False, methods=["post"])
    def mark_attendance(self, request):
        attendance_data = request.data.get("attendance", [])
        if not attendance_data:
            return Response(
                {"error": "Attendance data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_count = 0
        errors = []

        with transaction.atomic():
            for item in attendance_data:
                registration_id = item.get("registration_id")
                is_present = item.get("is_present", False)
                if not registration_id:
                    errors.append("Registration ID is required")
                    continue
                try:
                    reg = ExamRegistration.objects.get(id=registration_id)
                    reg.is_present = is_present
                    reg.save()
                    updated_count += 1
                except ExamRegistration.DoesNotExist:
                    errors.append(f"Registration {registration_id} not found")
                except Exception as e:
                    errors.append(f"Registration {registration_id}: {str(e)}")

        return Response(
            {
                "message": f"Updated attendance for {updated_count} registrations",
                "updated_count": updated_count,
                "errors": errors,
            }
        )


# ==============================================================================
# RESULT VIEWSET
# ==============================================================================


class ResultViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    AutoSectionFilterMixin,
    viewsets.ModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for exam results with section filtering.
    """

    queryset = StudentResult.objects.select_related("exam", "student", "subject")
    serializer_class = ResultSerializer
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()
        if user.is_superuser:
            return queryset

        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        if role in ["admin", "superadmin", "principal"]:
            return queryset

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        if role == "teacher" or hasattr(user, "teacher"):
            try:
                teacher = Teacher.objects.get(user=user)
                return queryset.filter(teacher_id=teacher.id)
            except Teacher.DoesNotExist:
                return queryset.none()

        if user.is_staff:
            return queryset

        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        return queryset.none()

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ResultCreateUpdateSerializer
        return ResultSerializer

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(recorded_by=self.request.user)


# ==============================================================================
# EXAM STATISTICS VIEWSET
# ==============================================================================


class ExamStatisticsViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    SectionFilterMixin,
    viewsets.ReadOnlyModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for exam statistics (read-only) with section filtering.
    """

    queryset = ExamStatistics.objects.select_related("exam")
    serializer_class = ExamStatisticsSerializer
    ordering = ["-calculated_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()
        if user.is_superuser:
            return queryset

        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        if role in ["admin", "superadmin", "principal"]:
            return queryset

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        if role == "teacher" or hasattr(user, "teacher"):
            try:
                teacher = Teacher.objects.get(user=user)
                return queryset.filter(teacher_id=teacher.id)
            except Teacher.DoesNotExist:
                return queryset.none()

        if user.is_staff:
            return queryset

        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))
            if not education_levels:
                return queryset.none()
            return queryset.filter(grade_level__education_level__in=education_levels)

        return queryset.none()

    @action(detail=False, methods=["get"])
    def summary(self, request):
        stats = self.get_queryset()
        if not stats.exists():
            return Response({"message": "No statistics available", "total_exams": 0})
        return Response(
            {
                "total_exams": stats.count(),
                "total_students_registered": sum(s.total_registered for s in stats),
                "total_students_appeared": sum(s.total_appeared for s in stats),
                "average_pass_rate": stats.aggregate(avg_pass=Avg("pass_percentage"))[
                    "avg_pass"
                ]
                or 0,
                "highest_average_score": stats.aggregate(max_avg=Max("average_score"))[
                    "max_avg"
                ]
                or 0,
            }
        )

    @action(detail=True, methods=["post"])
    def recalculate(self, request, pk=None):
        stats = self.get_object()
        ExamViewSet()._generate_exam_statistics(stats.exam)
        stats.refresh_from_db()
        return Response(
            {
                "message": "Statistics recalculated successfully",
                "statistics": self.get_serializer(stats).data,
            }
        )


# ==============================================================================
# QUESTION BANK VIEWSET
# ==============================================================================


class QuestionBankViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    AutoSectionFilterMixin,
    viewsets.ModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing Question Bank.
    """

    queryset = QuestionBank.objects.select_related(
        "created_by", "subject", "grade_level", "difficulty"  # difficulty is now FK
    ).all()

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["question", "topic", "subtopic", "tags"]
    # UPDATED: ordering by difficulty now uses FK traversal difficulty__name
    ordering_fields = ["created_at", "usage_count", "last_used", "difficulty__name"]
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination

    def get_serializer_class(self):
        if self.action == "list":
            return QuestionBankListSerializer
        elif self.action in ["create", "update", "partial_update"]:
            return QuestionBankCreateUpdateSerializer
        return QuestionBankDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        params = self.request.query_params

        if question_type := params.get("question_type"):
            queryset = queryset.filter(question_type=question_type)

        if subject_id := params.get("subject"):
            queryset = queryset.filter(subject_id=subject_id)

        if grade_level_id := params.get("grade_level"):
            queryset = queryset.filter(grade_level_id=grade_level_id)

        # UPDATED: difficulty is now a FK — filter via difficulty__code
        if difficulty := params.get("difficulty"):
            queryset = queryset.filter(difficulty__code=difficulty)

        if topic := params.get("topic"):
            queryset = queryset.filter(topic__icontains=topic)

        if tags := params.get("tags"):
            for tag in tags.split(","):
                queryset = queryset.filter(tags__contains=[tag.strip()])

        show_only_mine = params.get("only_mine") == "true"
        show_shared = params.get("show_shared") == "true"

        if hasattr(user, "teacher"):
            teacher = user.teacher
            if show_only_mine:
                queryset = queryset.filter(created_by=teacher)
            elif show_shared:
                queryset = queryset.filter(is_shared=True).exclude(created_by=teacher)
            else:
                queryset = queryset.filter(Q(created_by=teacher) | Q(is_shared=True))
        elif not user.is_staff:
            queryset = queryset.filter(is_shared=True)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, "teacher"):
            serializer.save(created_by=user.teacher)
        else:
            raise ValidationError("Only teachers can create questions in the bank.")

    @action(detail=False, methods=["post"])
    def import_to_exam(self, request):
        exam_id = request.data.get("exam_id")
        question_ids = request.data.get("question_ids", [])
        section_type = request.data.get("section_type")

        if not exam_id or not question_ids or not section_type:
            return Response(
                {"error": "exam_id, question_ids, and section_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response(
                {"error": "Exam not found"}, status=status.HTTP_404_NOT_FOUND
            )

        questions = QuestionBank.objects.filter(id__in=question_ids)
        if questions.count() != len(question_ids):
            return Response(
                {"error": "Some questions not found"}, status=status.HTTP_404_NOT_FOUND
            )

        imported_count = 0
        with transaction.atomic():
            for question in questions:
                question_data = {
                    "question": question.question,
                    "marks": question.marks,
                    "images": question.images,
                    "table": question.table_data,
                }

                if question.question_type == "objective":
                    question_data["options"] = question.options
                    question_data["correctAnswer"] = question.correct_answer
                    if section_type == "objective":
                        if not exam.objective_questions:
                            exam.objective_questions = []
                        exam.objective_questions.append(question_data)
                        imported_count += 1

                elif question.question_type == "theory":
                    question_data["expectedPoints"] = question.expected_points
                    if section_type == "theory":
                        if not exam.theory_questions:
                            exam.theory_questions = []
                        exam.theory_questions.append(question_data)
                        imported_count += 1

                elif question.question_type == "practical":
                    question_data["task"] = question.question
                    question_data["expectedOutcome"] = question.expected_points
                    if section_type == "practical":
                        if not exam.practical_questions:
                            exam.practical_questions = []
                        exam.practical_questions.append(question_data)
                        imported_count += 1

                question.increment_usage()

            exam.save()

        return Response(
            {
                "message": f"Successfully imported {imported_count} questions to exam",
                "imported_count": imported_count,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        question = self.get_object()
        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can duplicate questions"},
                status=status.HTTP_403_FORBIDDEN,
            )

        question.pk = None
        question.created_by = user.teacher
        question.usage_count = 0
        question.last_used = None
        question.save()

        return Response(
            {
                "message": "Question duplicated successfully",
                "question": QuestionBankDetailSerializer(question).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """
        Get question bank statistics.
        UPDATED: difficulty breakdown now queries via FK code (difficulty__code).
        """
        queryset = self.get_queryset()

        # UPDATED: group by difficulty FK code instead of raw string equality
        difficulty_breakdown = {}
        for diff in DifficultyLevel.objects.filter(is_active=True):
            difficulty_breakdown[diff.code] = queryset.filter(difficulty=diff).count()

        return Response(
            {
                "total_questions": queryset.count(),
                "by_type": {
                    "objective": queryset.filter(question_type="objective").count(),
                    "theory": queryset.filter(question_type="theory").count(),
                    "practical": queryset.filter(question_type="practical").count(),
                },
                "by_difficulty": difficulty_breakdown,  # UPDATED: dynamic from DB
                "shared_questions": queryset.filter(is_shared=True).count(),
                "most_used": list(
                    queryset.order_by("-usage_count")[:5].values(
                        "id", "question", "usage_count"
                    )
                ),
            }
        )


# ==============================================================================
# EXAM TEMPLATE VIEWSET
# ==============================================================================


class ExamTemplateViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    AutoSectionFilterMixin,
    viewsets.ModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing Exam Templates.
    """

    queryset = ExamTemplate.objects.select_related(
        "created_by", "grade_level", "subject"
    ).all()
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["name", "description"]
    ordering_fields = ["created_at", "usage_count", "name"]
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_serializer_class(self):
        if self.action == "list":
            return ExamTemplateListSerializer
        elif self.action in ["create", "update", "partial_update"]:
            return ExamTemplateCreateUpdateSerializer
        return ExamTemplateDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        params = self.request.query_params

        if grade_level_id := params.get("grade_level"):
            queryset = queryset.filter(grade_level_id=grade_level_id)
        if subject_id := params.get("subject"):
            queryset = queryset.filter(subject_id=subject_id)

        show_only_mine = params.get("only_mine") == "true"
        show_shared = params.get("show_shared") == "true"

        if hasattr(user, "teacher"):
            teacher = user.teacher
            if show_only_mine:
                queryset = queryset.filter(created_by=teacher)
            elif show_shared:
                queryset = queryset.filter(is_shared=True).exclude(created_by=teacher)
            else:
                queryset = queryset.filter(Q(created_by=teacher) | Q(is_shared=True))
        elif not user.is_staff:
            queryset = queryset.filter(is_shared=True)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if hasattr(user, "teacher"):
            serializer.save(created_by=user.teacher)
        else:
            raise ValidationError("Only teachers can create templates.")

    @action(detail=True, methods=["post"])
    def apply(self, request, pk=None):
        template = self.get_object()
        exam_data = request.data.copy()

        if "total_marks" not in exam_data:
            exam_data["total_marks"] = template.total_marks
        if "duration_minutes" not in exam_data:
            exam_data["duration_minutes"] = template.duration_minutes
        if "grade_level" not in exam_data:
            exam_data["grade_level"] = template.grade_level.id

        if template.default_instructions:
            if "objective_instructions" not in exam_data:
                exam_data["objective_instructions"] = template.default_instructions.get("objective", "")
            if "theory_instructions" not in exam_data:
                exam_data["theory_instructions"] = template.default_instructions.get("theory", "")
            if "practical_instructions" not in exam_data:
                exam_data["practical_instructions"] = template.default_instructions.get("practical", "")
            if "instructions" not in exam_data:
                exam_data["instructions"] = template.default_instructions.get("general", "")

        exam_serializer = ExamCreateUpdateSerializer(data=exam_data, context={"request": request})
        if exam_serializer.is_valid():
            exam = exam_serializer.save()
            template.increment_usage()
            return Response(
                {
                    "message": "Exam created successfully from template",
                    "exam": ExamDetailSerializer(exam).data,
                    "template": ExamTemplateDetailSerializer(template).data,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(exam_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        template = self.get_object()
        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can duplicate templates"},
                status=status.HTTP_403_FORBIDDEN,
            )

        template.pk = None
        template.created_by = user.teacher
        template.name = f"{template.name} (Copy)"
        template.usage_count = 0
        template.save()

        return Response(
            {
                "message": "Template duplicated successfully",
                "template": ExamTemplateDetailSerializer(template).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ==============================================================================
# EXAM REVIEW VIEWSET
# ==============================================================================


class ExamReviewViewSet(
    SectionEducationLevelMixin,
    TenantFilterMixin,
    AutoSectionFilterMixin,
    viewsets.ModelViewSet,
):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing Exam Reviews.
    """

    queryset = (
        ExamReview.objects.select_related(
            "exam", "submitted_by", "approved_by", "status"  # status is FK
        )
        .prefetch_related("reviewers", "comments")
        .all()
    )

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["exam__title", "exam__code", "submission_note"]
    # UPDATED: ordering by status now uses FK traversal
    ordering_fields = ["created_at", "submitted_at", "status__name"]
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_serializer_class(self):
        if self.action == "list":
            return ExamReviewListSerializer
        elif self.action == "submit_for_review":
            return ExamReviewSubmitSerializer
        elif self.action == "make_decision":
            return ExamReviewDecisionSerializer
        return ExamReviewDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        params = self.request.query_params

        # UPDATED: filter via status FK → status__code
        if review_status_code := params.get("status"):
            queryset = queryset.filter(status__code=review_status_code)

        if hasattr(user, "teacher") and not user.is_staff:
            teacher = user.teacher
            queryset = queryset.filter(
                Q(submitted_by=teacher) | Q(reviewers__reviewer=teacher)
            ).distinct()

        return queryset

    @action(detail=False, methods=["post"])
    def submit_for_review(self, request):
        serializer = ExamReviewSubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        exam_id = request.data.get("exam_id")
        reviewer_ids = serializer.validated_data["reviewer_ids"]
        submission_note = serializer.validated_data.get("submission_note", "")

        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response(
                {"error": "Exam not found"}, status=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can submit exams for review"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if hasattr(exam, "review"):
            return Response(
                {"error": "This exam already has a review"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # UPDATED: resolve initial ReviewStatus FK for the new review
        draft_review_status = _get_review_status("draft", exam.tenant)
        if not draft_review_status:
            return Response(
                {
                    "error": "ReviewStatus 'draft' not configured. Please create review statuses first."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        with transaction.atomic():
            review = ExamReview.objects.create(
                exam=exam,
                submitted_by=user.teacher,
                submission_note=submission_note,
                status=draft_review_status,  # UPDATED: FK instance
            )

            for reviewer_id in reviewer_ids:
                try:
                    reviewer = Teacher.objects.get(id=reviewer_id)
                    ExamReviewer.objects.create(review=review, reviewer=reviewer)
                except Teacher.DoesNotExist:
                    pass

            review.submit()  # model method transitions status FK internally

        return Response(
            {
                "message": "Exam submitted for review successfully",
                "review": ExamReviewDetailSerializer(review).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def make_decision(self, request, pk=None):
        review = self.get_object()
        serializer = ExamReviewDecisionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can make review decisions"},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_reviewer = review.reviewers.filter(reviewer=user.teacher).exists()
        if not is_reviewer and not user.is_staff:
            return Response(
                {"error": "You are not assigned as a reviewer for this exam"},
                status=status.HTTP_403_FORBIDDEN,
            )

        decision = serializer.validated_data["decision"]
        notes = serializer.validated_data.get("notes", "")
        reason = serializer.validated_data.get("reason", "")

        with transaction.atomic():
            if decision == "approve":
                review.approve(user.teacher, notes)
                message = "Exam approved successfully"
            elif decision == "reject":
                review.reject(user.teacher, reason)
                message = "Exam rejected"
            elif decision == "request_changes":
                review.request_changes()
                message = "Changes requested"

            reviewer_obj = review.reviewers.filter(reviewer=user.teacher).first()
            if reviewer_obj:
                reviewer_obj.submit_review(decision)

        return Response(
            {"message": message, "review": ExamReviewDetailSerializer(review).data},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def add_comment(self, request, pk=None):
        review = self.get_object()
        serializer = ExamReviewCommentCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can add comments"},
                status=status.HTTP_403_FORBIDDEN,
            )

        comment = ExamReviewComment.objects.create(
            review=review, author=user.teacher, **serializer.validated_data
        )
        return Response(
            {
                "message": "Comment added successfully",
                "comment": ExamReviewCommentSerializer(comment).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="comments/(?P<comment_id>[^/.]+)/resolve")
    def resolve_comment(self, request, pk=None, comment_id=None):
        review = self.get_object()
        try:
            comment = review.comments.get(id=comment_id)
        except ExamReviewComment.DoesNotExist:
            return Response(
                {"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can resolve comments"},
                status=status.HTTP_403_FORBIDDEN,
            )

        comment.resolve(user.teacher)
        return Response(
            {
                "message": "Comment resolved successfully",
                "comment": ExamReviewCommentSerializer(comment).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def queue(self, request):
        """
        Get review queue (pending reviews for current user).
        UPDATED: filter via status FK → status__code__in instead of status__in
        """
        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers have review queues"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # UPDATED: traverse FK to filter by code
        reviews = (
            ExamReview.objects.filter(
                reviewers__reviewer=user.teacher,
                status__code__in=["submitted", "in_review"],  # UPDATED: FK-safe
            )
            .select_related("exam", "submitted_by", "status")
            .distinct()
        )

        return Response(
            {
                "queue": ExamReviewListSerializer(reviews, many=True).data,
                "count": reviews.count(),
            },
            status=status.HTTP_200_OK,
        )
