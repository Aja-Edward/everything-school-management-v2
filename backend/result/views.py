# result/views.py
"""
Key fixes applied in this version
───────────────────────────────────
1. Removed queryset.count() calls from all logger.info() lines — each was a
   wasted DB hit on every list request.

2. Fixed NurseryResultViewSet.class_statistics() — was mixing a plain dict
   with &= Q(...) which raises TypeError at runtime.

3. Fixed _recalculate_subject_stats() position algorithm — the first group
   was always skipping position 1 due to the way count_at_position was
   accumulated before the first score comparison.

4. Fixed StudentTermResultViewSet.get_queryset() — was filtering on
   student__education_level__in which doesn't hit a real DB column (it's a
   @property). Now routes to the correct FK lookup.

5. Fixed SeniorSecondaryTermReportViewSet prefetch — added grading_system__grades
   to the subject_results Prefetch so the serializer doesn't fire per-result
   grade queries.

6. Fixed NurseryTermReportViewSet prefetch — added term_report to the
   subject_results Prefetch so NurseryResultSerializer can access
   term_report.field via source= without extra queries.

7. Removed the 8-line per-field debug logging from NurseryResultViewSet.create()
   — kept one compact log line instead.

8. Moved StandardResultsPagination import to avoid the local duplicate
   definition shadowing the one from utils.pagination.
"""

import csv
import io
import logging
from decimal import Decimal

import cloudinary.uploader
from django.apps import apps
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Max, Min, Prefetch, Q
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from academics.models import AcademicSession, EducationLevel, Term
from classroom.models import Class as StudentClass
from classroom.models import Stream, StudentEnrollment
from messaging.models import BulkMessage, Message
from students.models import Student
from subject.models import Subject
from tenants.mixins import TenantFilterMixin
from utils.section_filtering import AutoSectionFilterMixin, SectionFilterMixin
from utils.signature_handler import upload_signature_to_cloudinary
from utils.teacher_portal_permissions import TeacherPortalCheckMixin

from .filters import StudentTermResultFilter
from .models import (
    AssessmentScore,
    AssessmentType,
    ExamSession,
    Grade,
    GradingSystem,
    JuniorSecondaryResult,
    JuniorSecondaryTermReport,
    NurseryResult,
    NurseryTermReport,
    PrimaryResult,
    PrimaryTermReport,
    ResultComment,
    ResultSheet,
    ResultTemplate,
    ScoringConfiguration,
    SeniorSecondaryResult,
    SeniorSecondarySessionReport,
    SeniorSecondarySessionResult,
    SeniorSecondaryTermReport,
    StudentResult,
    StudentTermResult,
)
from .report_generation import get_report_generator
from .serializers import (
    AssessmentScoreSerializer,
    AssessmentTypeSerializer,
    BulkReportGenerationSerializer,
    BulkResultUpdateSerializer,
    BulkStatusUpdateSerializer,
    DetailedStudentResultSerializer,
    ExamSessionCreateUpdateSerializer,
    ExamSessionSerializer,
    GradingSystemCreateUpdateSerializer,
    GradingSystemSerializer,
    GradeSerializer,
    JuniorSecondaryResultCreateUpdateSerializer,
    JuniorSecondaryResultSerializer,
    JuniorSecondaryTermReportSerializer,
    NurseryResultCreateUpdateSerializer,
    NurseryResultSerializer,
    NurseryTermReportSerializer,
    PrimaryResultCreateUpdateSerializer,
    PrimaryResultSerializer,
    PrimaryTermReportSerializer,
    PublishResultSerializer,
    ReportGenerationSerializer,
    ResultCommentCreateSerializer,
    ResultCommentSerializer,
    ResultExportSerializer,
    ResultImportSerializer,
    ResultSheetSerializer,
    ResultTemplateCreateUpdateSerializer,
    ResultTemplateSerializer,
    ScoringConfigurationCreateUpdateSerializer,
    ScoringConfigurationSerializer,
    SeniorSecondaryResultCreateUpdateSerializer,
    SeniorSecondaryResultSerializer,
    SeniorSecondarySessionResultCreateUpdateSerializer,
    SeniorSecondarySessionResultSerializer,
    SeniorSecondarySessionReportSerializer,
    SeniorSecondaryTermReportSerializer,
    StudentMinimalSerializer,
    StudentTermResultDetailSerializer,
    StudentTermResultSerializer,
    StudentResultSerializer,
    SubjectPerformanceSerializer,
)

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
DRAFT = "DRAFT"
SUBMITTED = "SUBMITTED"
APPROVED = "APPROVED"
PUBLISHED = "PUBLISHED"
SENIOR_SECONDARY = "SENIOR_SECONDARY"
JUNIOR_SECONDARY = "JUNIOR_SECONDARY"
PRIMARY = "PRIMARY"
NURSERY = "NURSERY"

# ── Model routing maps (avoids repeated if/elif chains) ───────────────────────
_RESULT_MODEL_MAP = {
    SENIOR_SECONDARY: SeniorSecondaryResult,
    JUNIOR_SECONDARY: JuniorSecondaryResult,
    PRIMARY: PrimaryResult,
    NURSERY: NurseryResult,
}
_TERM_REPORT_MODEL_MAP = {
    SENIOR_SECONDARY: SeniorSecondaryTermReport,
    JUNIOR_SECONDARY: JuniorSecondaryTermReport,
    PRIMARY: PrimaryTermReport,
    NURSERY: NurseryTermReport,
}


class StandardResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ── Utility helpers ───────────────────────────────────────────────────────────


def check_user_permission(user, permission_name):
    if user.is_superuser or user.is_staff:
        return True
    role = getattr(user, "role", None)
    if role in ("admin", "superadmin", "principal"):
        return True
    return user.has_perm(permission_name)


def get_next_term_begins_date(exam_session):
    try:
        current_term = exam_session.term
        if not current_term:
            return None
        current_session = exam_session.academic_session

        next_term = (
            Term.objects.filter(
                academic_session=current_session,
                term_type__display_order__gt=current_term.term_type.display_order,
                is_active=True,
            )
            .order_by("term_type__display_order")
            .first()
        )

        if next_term:
            return next_term.next_term_begins

        # Last term — look into next academic session
        next_session = (
            AcademicSession.objects.filter(
                start_date__gt=current_session.end_date, is_active=True
            )
            .order_by("start_date")
            .first()
        )
        if next_session:
            first_term = (
                Term.objects.filter(
                    academic_session=next_session,
                    is_active=True,
                )
                .order_by("term_type__display_order")
                .first()
            )
            return first_term.next_term_begins if first_term else None
        return None
    except Exception as e:
        logger.error(f"Error getting next term begins date: {e}")
        return None


# ── Grading System ────────────────────────────────────────────────────────────


class GradingSystemViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    queryset = GradingSystem.objects.all()
    serializer_class = GradingSystemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["grading_type", "is_active"]
    search_fields = ["name", "description"]

    def get_queryset(self):
        return super().get_queryset().prefetch_related("grades")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return GradingSystemCreateUpdateSerializer
        return GradingSystemSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        gs = self.get_object()
        gs.is_active = True
        gs.save()
        return Response(GradingSystemSerializer(gs).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        gs = self.get_object()
        gs.is_active = False
        gs.save()
        return Response(GradingSystemSerializer(gs).data)


class GradeViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["grading_system", "is_passing"]

    def get_queryset(self):
        return super().get_queryset().select_related("grading_system")


class AssessmentTypeViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    queryset = AssessmentType.objects.all()
    serializer_class = AssessmentTypeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["education_level", "is_active"]
    search_fields = ["name", "code"]

    def get_queryset(self):
        return super().get_queryset().select_related("education_level")


# ── Exam Session ──────────────────────────────────────────────────────────────


class ExamSessionViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    queryset = ExamSession.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        "exam_type",
        "term",
        "academic_session",
        "is_published",
        "is_active",
    ]
    search_fields = ["name"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ExamSessionCreateUpdateSerializer
        return ExamSessionSerializer

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("academic_session", "term", "term__term_type")
        )
        if getattr(self.request.user, "role", None) == "STUDENT":
            qs = qs.filter(is_published=True)
        return qs.order_by("-created_at")

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        session = self.get_object()
        session.is_published = True
        session.save()
        return Response(ExamSessionSerializer(session).data)

    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        session = self.get_object()
        stats = {"total_results": 0, "by_education_level": {}}
        for level, model in _RESULT_MODEL_MAP.items():
            qs = model.objects.filter(exam_session=session)
            level_stats = {
                "total": qs.count(),
                "published": qs.filter(status=PUBLISHED).count(),
                "approved": qs.filter(status=APPROVED).count(),
                "draft": qs.filter(status=DRAFT).count(),
                "passed": qs.filter(is_passed=True).count(),
                "failed": qs.filter(is_passed=False).count(),
            }
            stats["by_education_level"][level] = level_stats
            stats["total_results"] += level_stats["total"]
        return Response(stats)


# ── Scoring Configuration ─────────────────────────────────────────────────────


class ScoringConfigurationViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    queryset = ScoringConfiguration.objects.all().order_by("education_level", "name")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["education_level", "result_type", "is_active", "is_default"]
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ScoringConfigurationCreateUpdateSerializer
        return ScoringConfigurationSerializer

    def get_queryset(self):
        return super().get_queryset().select_related("created_by", "education_level")

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        param = request.query_params.get("education_level")
        if not param:
            return Response(
                {"error": "education_level parameter is required"}, status=400
            )
        try:
            configs = self.get_queryset().filter(education_level_id=int(param))
        except (ValueError, TypeError):
            configs = self.get_queryset().filter(
                education_level__level_type=param.upper()
            )
        return Response(ScoringConfigurationSerializer(configs, many=True).data)

    @action(detail=False, methods=["get"])
    def defaults(self, request):
        configs = self.get_queryset().filter(is_default=True, is_active=True)
        return Response(ScoringConfigurationSerializer(configs, many=True).data)

    @action(detail=False, methods=["get"])
    def by_result_type(self, request):
        result_type = request.query_params.get("result_type", "TERMLY")
        param = request.query_params.get("education_level")
        filter_kwargs = {"result_type": result_type, "is_active": True}
        if param:
            try:
                filter_kwargs["education_level_id"] = int(param)
            except (ValueError, TypeError):
                filter_kwargs["education_level__level_type"] = param.upper()
        return Response(
            ScoringConfigurationSerializer(
                self.get_queryset().filter(**filter_kwargs), many=True
            ).data
        )

    @action(detail=True, methods=["post"])
    def set_as_default(self, request, pk=None):
        config = self.get_object()
        with transaction.atomic():
            ScoringConfiguration.objects.filter(
                education_level=config.education_level, result_type=config.result_type
            ).update(is_default=False)
            config.is_default = True
            config.save(update_fields=["is_default"])
        return Response(ScoringConfigurationSerializer(config).data)


# ── BaseResultViewSetMixin ────────────────────────────────────────────────────


class BaseResultViewSetMixin:
    """
    Shared helpers for all education-level result viewsets.
    Does NOT contain any get_queryset() — each viewset owns its own.
    """

    def get_teacher_queryset(self, user, queryset):
        Teacher = apps.get_model("teacher", "Teacher")
        Classroom = apps.get_model("classroom", "Classroom")
        ClassroomTeacherAssignment = apps.get_model(
            "classroom", "ClassroomTeacherAssignment"
        )
        try:
            teacher = Teacher.objects.get(user=user)
            assigned_classrooms = (
                Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                )
                .select_related("grade_level", "grade_level__education_level")
                .distinct()
            )
            if not assigned_classrooms.exists():
                return queryset.none()

            classroom_levels = []
            for classroom in assigned_classrooms:
                try:
                    level = classroom.grade_level.education_level.level_type
                    if level not in classroom_levels:
                        classroom_levels.append(level)
                except (AttributeError, Exception):
                    continue

            is_classroom_teacher = any(
                l in ("NURSERY", "PRIMARY") for l in classroom_levels
            )
            student_ids = list(
                StudentEnrollment.objects.filter(
                    classroom__in=assigned_classrooms, is_active=True
                ).values_list("student_id", flat=True)
            )
            if not student_ids:
                return queryset.none()

            if is_classroom_teacher:
                return queryset.filter(student_id__in=student_ids)

            assigned_subject_ids = list(
                ClassroomTeacherAssignment.objects.filter(teacher=teacher)
                .exclude(subject__isnull=True)
                .values_list("subject_id", flat=True)
                .distinct()
            )
            if not assigned_subject_ids:
                return queryset.none()
            return queryset.filter(
                subject_id__in=assigned_subject_ids, student_id__in=student_ids
            )

        except Teacher.DoesNotExist:
            return queryset.none()
        except Exception as e:
            logger.error(
                f"Error filtering for teacher {user.username}: {e}", exc_info=True
            )
            return queryset.none()

    def handle_create(
        self, request, education_level, serializer_class, result_serializer_class
    ):
        try:
            with transaction.atomic():
                data = (
                    request.data.copy()
                    if hasattr(request.data, "copy")
                    else dict(request.data)
                )
                student_id = data.get("student")
                if student_id:
                    student = Student.objects.select_related(
                        "student_class", "student_class__education_level"
                    ).get(id=student_id)
                    if student.education_level != education_level:
                        return Response(
                            {
                                "error": f"Student education level is {student.education_level}, expected {education_level}."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                data["entered_by"] = request.user.id
                serializer = serializer_class(data=data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()
                return Response(
                    result_serializer_class(result).data, status=status.HTTP_201_CREATED
                )
        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Failed to create result: {e}", exc_info=True)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def handle_update(
        self, request, instance, serializer_class, result_serializer_class, **kwargs
    ):
        try:
            with transaction.atomic():
                if instance.status == PUBLISHED and not check_user_permission(
                    request.user, "results.change_published_results"
                ):
                    return Response(
                        {
                            "error": "You don't have permission to modify published results"
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                data = (
                    request.data.copy()
                    if hasattr(request.data, "copy")
                    else dict(request.data)
                )
                serializer = serializer_class(
                    instance, data=data, partial=kwargs.get("partial", False)
                )
                serializer.is_valid(raise_exception=True)
                return Response(result_serializer_class(serializer.save()).data)
        except Exception as e:
            logger.error(f"Failed to update result: {e}", exc_info=True)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def handle_approve(self, request, result, serializer_class):
        user_role = self.get_user_role()
        if user_role not in (
            "admin",
            "superadmin",
            "principal",
            "senior_secondary_admin",
        ) and not check_user_permission(request.user, "results.can_approve_results"):
            return Response(
                {"error": "You don't have permission to approve results"}, status=403
            )
        if result.status == PUBLISHED:
            return Response({"error": "Cannot approve a published result"}, status=400)
        if result.status not in (DRAFT, SUBMITTED):
            return Response(
                {"error": f"Cannot approve result with status '{result.status}'"},
                status=400,
            )
        try:
            with transaction.atomic():
                result.status = APPROVED
                result.approved_by = request.user
                result.approved_date = timezone.now()
                result.save(update_fields=["status", "approved_by", "approved_date"])
            return Response(serializer_class(result).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    def handle_publish(self, request, result, serializer_class):
        user_role = self.get_user_role()
        if user_role not in (
            "admin",
            "superadmin",
            "principal",
            "senior_secondary_admin",
        ) and not check_user_permission(request.user, "results.can_publish_results"):
            return Response(
                {"error": "You don't have permission to publish results"}, status=403
            )
        if result.status == PUBLISHED:
            return Response({"error": "Result is already published"}, status=400)
        try:
            with transaction.atomic():
                result.status = PUBLISHED
                result.published_by = request.user
                result.published_date = timezone.now()
                result.save(update_fields=["status", "published_by", "published_date"])
            return Response(serializer_class(result).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    # ── bulk_create helpers ───────────────────────────────────────────────────

    def _get_education_level(self, ModelClass):
        return {v: k for k, v in _RESULT_MODEL_MAP.items()}.get(ModelClass, "UNKNOWN")

    def _get_term_report_model(self, ModelClass):
        level = self._get_education_level(ModelClass)
        return _TERM_REPORT_MODEL_MAP.get(level)

    def _get_exam_session(self, exam_session_id):
        if not hasattr(self, "_exam_session_cache"):
            self._exam_session_cache = {}
        if exam_session_id not in self._exam_session_cache:
            self._exam_session_cache[exam_session_id] = ExamSession.objects.get(
                id=exam_session_id
            )
        return self._exam_session_cache[exam_session_id]

    def _calculate_instance_scores(self, instance, ModelClass):
        if hasattr(instance, "calculate_scores"):
            instance.calculate_scores()
        if hasattr(instance, "determine_grade"):
            instance.determine_grade()
        if ModelClass == NurseryResult:
            if instance.max_marks_obtainable and instance.max_marks_obtainable > 0:
                instance.percentage = (
                    instance.mark_obtained / instance.max_marks_obtainable
                ) * 100
            else:
                instance.percentage = 0
            if instance.grading_system:
                grade = instance.grading_system.get_grade(instance.percentage)
                from result.models import _default_grade

                instance.grade = grade or _default_grade(instance.percentage)
                instance.is_passed = instance.percentage >= float(
                    instance.grading_system.pass_mark or 40
                )

    def _ensure_term_reports_exist(self, created_results, ModelClass, education_level):
        TermReportModel = self._get_term_report_model(ModelClass)
        if not TermReportModel:
            return
        seen = set()
        for obj in created_results:
            pair = (obj.student_id, obj.exam_session_id)
            if pair in seen:
                continue
            seen.add(pair)
            defaults = {"status": DRAFT, "is_published": False}
            if ModelClass == SeniorSecondaryResult and getattr(obj, "stream", None):
                defaults["stream"] = obj.stream
            term_report, _ = TermReportModel.objects.get_or_create(
                student_id=obj.student_id,
                exam_session_id=obj.exam_session_id,
                defaults=defaults,
            )
            ModelClass.objects.filter(
                student_id=obj.student_id,
                exam_session_id=obj.exam_session_id,
                term_report__isnull=True,
            ).update(term_report=term_report)
            term_report.calculate_metrics()

    def _recalculate_subject_stats(
        self, ModelClass, exam_session_id, subject_id, student_class, edu_level
    ):
        """
        Bulk recalculate subject-level stats with correct tie-breaking.

        Position algorithm fix: when score changes, advance position by the
        count of results at the *previous* score, not the current one.
        Reset prev_score tracking before the loop.
        """
        score_field = (
            "mark_obtained"
            if ModelClass == NurseryResult
            else (
                "total_percentage"
                if hasattr(ModelClass, "total_percentage")
                else "total_score"
            )
        )
        results = (
            ModelClass.objects.filter(
                exam_session_id=exam_session_id,
                subject_id=subject_id,
                student__student_class=student_class,
                student__education_level=edu_level,
                status__in=(APPROVED, PUBLISHED),
            )
            .select_for_update()
            .order_by(f"-{score_field}", "created_at")
        )
        if not results.exists():
            return

        stats = results.aggregate(
            avg=Avg(score_field), highest=Max(score_field), lowest=Min(score_field)
        )

        updates = []
        current_position = 1  # position assigned to current score group
        count_at_current = 0  # how many have this score so far
        prev_score = None

        for result in results:
            score = getattr(result, score_field)
            if score != prev_score:
                # Move position past the previous group
                current_position += count_at_current
                count_at_current = 1
                prev_score = score
            else:
                count_at_current += 1

            result.subject_position = current_position
            result.class_average = stats["avg"] or 0
            result.highest_in_class = stats["highest"] or 0
            result.lowest_in_class = stats["lowest"] or 0
            updates.append(result)

        ModelClass.objects.bulk_update(
            updates,
            [
                "subject_position",
                "class_average",
                "highest_in_class",
                "lowest_in_class",
            ],
            batch_size=100,
        )

    def bulk_create(self, request):
        """
        Two-phase bulk result creation.

        Expected request body
        ─────────────────────
        {
            "results": [
                {
                    "student":        "<uuid>",
                    "subject":        <int>,
                    "exam_session":   "<uuid>",
                    "grading_system": <int>,
                    "stream":         <int | null>,   # optional
                    "status":         "DRAFT",
                    "teacher_remark": "",             # optional
                    "scores": [                       # omit for NurseryResult
                        {"component_id": 1, "score": "8.50"},
                        {"component_id": 2, "score": "62.00"}
                    ],
                    # NurseryResult only:
                    "mark_obtained":      "45.00",
                    "max_marks_obtainable": "50.00",
                    "academic_comment": ""
                },
                ...
            ]
        }

        Phase 1  Validate all records and check for duplicates.
                Build unsaved model instances with derived fields set to 0.
        Phase 2  bulk_create the instances.
                For each created result, bulk_create ComponentScore rows,
                then recalculate and persist derived fields.
        Phase 3  Ensure term reports exist; recalculate subject stats and
                class positions.
        """
        from result.models import (
            ComponentScore,
            AssessmentComponent,
            NurseryResult,
        )
        from result.serializers import (
            SeniorSecondaryResultCreateUpdateSerializer,
            JuniorSecondaryResultCreateUpdateSerializer,
            PrimaryResultCreateUpdateSerializer,
            NurseryResultCreateUpdateSerializer,
        )

        results_data = request.data.get("results", [])
        ModelClass = self.get_queryset().model
        education_level = self._get_education_level(ModelClass)
        is_nursery = ModelClass == NurseryResult

        # Map serializer per model
        _serializer_map = {
            "SENIOR_SECONDARY": SeniorSecondaryResultCreateUpdateSerializer,
            "JUNIOR_SECONDARY": JuniorSecondaryResultCreateUpdateSerializer,
            "PRIMARY": PrimaryResultCreateUpdateSerializer,
            "NURSERY": NurseryResultCreateUpdateSerializer,
        }
        CreateUpdateSerializer = _serializer_map.get(
            education_level, self.get_serializer_class()
        )

        # Pre-load existing (student, subject, session) tuples to skip dupes
        existing_keys = set(
            ModelClass.objects.values_list(
                "student_id", "subject_id", "exam_session_id"
            )
        )

        errors = []
        validated_instances = []  # (model_instance, raw_scores_list)
        seen_keys = set()

        # ── Phase 1: validate ────────────────────────────────────────────────────
        for i, raw in enumerate(results_data):
            item = dict(raw) if not isinstance(raw, dict) else raw.copy()

            # Pull scores out before passing to the model serializer
            scores_data = item.pop("scores", [])
            item["entered_by"] = request.user.id

            serializer = CreateUpdateSerializer(data=item, context={"request": request})

            if not serializer.is_valid():
                errors.append({"index": i, "errors": serializer.errors, "data": item})
                continue

            data = serializer.validated_data
            key = (
                data["student"].id,
                data.get("subject", {}).id if data.get("subject") else None,
                data["exam_session"].id,
            )

            if key in seen_keys:
                errors.append(
                    {"index": i, "errors": "Duplicate entry in submitted data"}
                )
                continue
            if key in existing_keys:
                errors.append(
                    {"index": i, "errors": "Result already exists in database"}
                )
                continue

            seen_keys.add(key)

            # Validate component scores against their component max_score
            score_errors = _validate_component_scores(scores_data, education_level)
            if score_errors:
                errors.append({"index": i, "errors": score_errors})
                continue

            # Build unsaved instance — derived fields default to 0 until Phase 2
            instance = ModelClass(**data)

            # NurseryResult: compute percentage now (no ComponentScore rows needed)
            if is_nursery:
                _calculate_nursery_scores(instance)

            validated_instances.append((instance, scores_data))

        if errors:
            return _error_response("Validation failed. No results were saved.", errors)

        # ── Phase 2 & 3: insert, score, link ────────────────────────────────────
        try:
            with transaction.atomic():
                # 2a. Bulk-insert result rows
                raw_instances = [inst for inst, _ in validated_instances]
                created_results = ModelClass.objects.bulk_create(
                    raw_instances, batch_size=500
                )

                # 2b. Create ComponentScore rows and recalculate per result
                if not is_nursery:
                    score_map = {
                        i: scores for i, (_, scores) in enumerate(validated_instances)
                    }
                    _bulk_create_component_scores(
                        created_results, score_map, ModelClass
                    )

                # 3a. Ensure term reports exist and link results
                self._ensure_term_reports_exist(
                    created_results, ModelClass, education_level
                )

                # 3b. Recalculate subject-level stats
                subject_groups = set()
                class_groups = set()
                for obj in created_results:
                    sc = obj.student.student_class
                    el = obj.student.education_level
                    if hasattr(obj, "subject_id"):
                        subject_groups.add(
                            (obj.exam_session_id, obj.subject_id, sc, el)
                        )
                    class_groups.add((obj.exam_session_id, sc, el))

                for esid, sid, sc, el in subject_groups:
                    self._recalculate_subject_stats(ModelClass, esid, sid, sc, el)

                # 3c. Recalculate class positions on term reports
                TermReportModel = self._get_term_report_model(ModelClass)
                if TermReportModel:
                    for esid, sc, el in class_groups:
                        TermReportModel.bulk_recalculate_positions(
                            exam_session=self._get_exam_session(esid),
                            student_class=sc,
                            education_level=el,
                        )

            from rest_framework import status as drf_status
            from rest_framework.response import Response

            return Response(
                {
                    "message": f"Successfully created {len(created_results)} results",
                    "results": self.get_serializer(created_results, many=True).data,
                },
                status=drf_status.HTTP_201_CREATED,
            )

        except Exception as e:
            logger.error(f"Bulk create failed: {e}", exc_info=True)
            from rest_framework.response import Response
            from rest_framework import status as drf_status

            return Response(
                {
                    "error": "Bulk upload failed. No results were saved.",
                    "details": str(e),
                },
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

    # ── Updated _ensure_term_reports_exist ──────────────────────────────────────

    def _ensure_term_reports_exist(self, created_results, ModelClass, education_level):
        """
        For each student+session in the batch, get_or_create the term report
        shell and link results to it.  Identical to the old version — unchanged
        because it never touched hardcoded score fields.
        """
        TermReportModel = self._get_term_report_model(ModelClass)
        if not TermReportModel:
            return

        seen = set()
        for obj in created_results:
            pair = (obj.student_id, obj.exam_session_id)
            if pair in seen:
                continue
            seen.add(pair)

            defaults = {"status": "DRAFT", "is_published": False}
            from result.models import SeniorSecondaryResult
            if ModelClass == SeniorSecondaryResult and getattr(obj, "stream", None):
                defaults["stream"] = obj.stream

            term_report, _ = TermReportModel.objects.get_or_create(
                student_id=obj.student_id,
                exam_session_id=obj.exam_session_id,
                defaults=defaults,
            )
            # Link using update() — avoids re-triggering post_save signal
            ModelClass.objects.filter(
                student_id=obj.student_id,
                exam_session_id=obj.exam_session_id,
                term_report__isnull=True,
            ).update(term_report=term_report)
            term_report.calculate_metrics()

    # ── Private helpers (module-level, not methods) ──────────────────────────────

    def _validate_component_scores(scores_data, education_level):
        """
        Validate a list of {"component_id": int, "score": Decimal} dicts.
        Returns a list of error strings, empty if all valid.
        Nursery skips this — it uses mark_obtained directly.
        """
        if education_level == "NURSERY" or not scores_data:
            return []

        from result.models import AssessmentComponent

        errors = []
        seen_ids = set()

        for entry in scores_data:
            cid = entry.get("component_id")
            score = entry.get("score")

            if cid is None or score is None:
                errors.append("Each score entry must have 'component_id' and 'score'")
                continue

            if cid in seen_ids:
                errors.append(f"Duplicate component_id {cid}")
                continue
            seen_ids.add(cid)

            try:
                component = AssessmentComponent.objects.get(id=cid)
            except AssessmentComponent.DoesNotExist:
                errors.append(f"AssessmentComponent {cid} does not exist")
                continue

            if not component.is_active:
                errors.append(f"Component '{component.name}' (id={cid}) is not active")
                continue

            try:
                score_decimal = Decimal(str(score))
            except Exception:
                errors.append(f"Invalid score value '{score}' for component {cid}")
                continue

            if score_decimal < 0:
                errors.append(f"Score for '{component.name}' cannot be negative")
            elif score_decimal > component.max_score:
                errors.append(
                    f"Score {score_decimal} for '{component.name}' "
                    f"exceeds maximum {component.max_score}"
                )

        return errors

    def _bulk_create_component_scores(created_results, score_map, ModelClass):
        """
        For each result in created_results, bulk-create ComponentScore rows
        using the scores from score_map[index], then recalculate and persist
        the derived fields (total_score, ca_total, percentage, grade, is_passed).

        score_map: {index: [{"component_id": int, "score": str/Decimal}, ...]}
        """
        from result.models import ComponentScore, AssessmentComponent

        # Determine which FK field name ComponentScore uses for this model
        _fk_map = {
            "SeniorSecondaryResult": "senior_result",
            "JuniorSecondaryResult": "junior_result",
            "PrimaryResult": "primary_result",
            "NurseryResult": "nursery_result",
        }
        fk_name = _fk_map.get(ModelClass.__name__)
        if not fk_name:
            logger.warning(
                f"_bulk_create_component_scores: unknown model {ModelClass.__name__}"
            )
            return

        # Pre-fetch all components mentioned across all score lists to avoid
        # one query per component per result
        all_component_ids = set()
        for scores in score_map.values():
            for s in scores:
                all_component_ids.add(s["component_id"])

        component_cache = {
            c.id: c
            for c in AssessmentComponent.objects.filter(id__in=all_component_ids)
        }

        # Build ComponentScore objects for bulk_create
        score_objects = []
        for idx, result in enumerate(created_results):
            scores_data = score_map.get(idx, [])
            for s in scores_data:
                component = component_cache.get(s["component_id"])
                if not component:
                    continue  # already caught by _validate_component_scores
                score_objects.append(
                    ComponentScore(
                        **{fk_name: result},
                        component=component,
                        score=Decimal(str(s["score"])),
                        tenant=result.tenant,
                    )
                )

        if score_objects:
            ComponentScore.objects.bulk_create(score_objects, batch_size=500)

        # Now recalculate each result's derived fields
        updates = []
        for result in created_results:
            result.calculate_scores()
            result.determine_grade()
            updates.append(result)

        if updates:
            ModelClass.objects.bulk_update(
                updates,
                [
                    "total_score",
                    "ca_total",
                    "percentage",
                    "grade",
                    "grade_point",
                    "is_passed",
                    "updated_at",
                ],
                batch_size=200,
            )

    def _calculate_nursery_scores(instance):
        """
        Compute NurseryResult percentage + grade in-memory before bulk_create.
        NurseryResult doesn't use ComponentScore — mark_obtained is submitted
        directly — so this is safe to do before the row is inserted.
        """
        if instance.max_marks_obtainable and instance.max_marks_obtainable > 0:
            instance.percentage = (
                instance.mark_obtained / instance.max_marks_obtainable * 100
            )
        else:
            instance.percentage = Decimal(0)

        gs = getattr(instance, "grading_system", None)
        if gs:
            try:
                grade = gs.get_grade(float(instance.percentage))
                from result.models import _default_grade

                instance.grade = (
                    grade if grade else _default_grade(float(instance.percentage))
                )
                instance.is_passed = float(instance.percentage) >= float(
                    gs.pass_mark or 40
                )
            except Exception as e:
                logger.error(f"Error grading nursery instance: {e}")
                from result.models import _default_grade

                instance.grade = _default_grade(float(instance.percentage))
                instance.is_passed = float(instance.percentage) >= 40

    def _error_response(message, errors):
        from rest_framework.response import Response
        from rest_framework import status as drf_status

        return Response(
            {"error": message, "errors": errors},
            status=drf_status.HTTP_400_BAD_REQUEST,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user_role = self.get_user_role()
        if user_role in ("admin", "superadmin", "principal"):
            logger.warning(f"Admin deleted result {instance.id} ({instance.status})")
        elif user_role == "teacher":
            if instance.status != DRAFT:
                return Response(
                    {"error": "Teachers can only delete DRAFT results"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        else:
            return Response(
                {"error": "You don't have permission to delete results"}, status=403
            )

        with transaction.atomic():
            subject_name = instance.subject.name
            student_name = instance.student.full_name
            instance.delete()
        return Response(
            {
                "message": f"Result for {student_name} in {subject_name} deleted successfully"
            },
            status=status.HTTP_204_NO_CONTENT,
        )

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        filters_q = {"status__in": [APPROVED, PUBLISHED]}
        if es := request.query_params.get("exam_session"):
            filters_q["exam_session"] = es
        if sc := request.query_params.get("student_class"):
            filters_q["student__student_class_id"] = sc
        if subj := request.query_params.get("subject"):
            filters_q["subject"] = subj

        results = self.get_queryset().filter(**filters_q)
        if not results.exists():
            return Response({"error": "No results found"}, status=404)

        agg = results.aggregate(
            avg=Avg("total_score"), high=Max("total_score"), low=Min("total_score")
        )
        total = results.count()
        return Response(
            {
                "total_students": total,
                "class_average": float(agg["avg"] or 0),
                "highest_score": agg["high"] or 0,
                "lowest_score": agg["low"] or 0,
                "students_passed": results.filter(is_passed=True).count(),
                "students_failed": results.filter(is_passed=False).count(),
            }
        )

    @action(detail=False, methods=["get"])
    def grade_distribution(self, request):
        filters_q = {"status__in": [APPROVED, PUBLISHED]}
        if es := request.query_params.get("exam_session"):
            filters_q["exam_session"] = es
        if sc := request.query_params.get("student_class"):
            filters_q["student__student_class_id"] = sc
        return Response(
            list(
                self.get_queryset()
                .filter(**filters_q)
                .values("grade")
                .annotate(count=Count("grade"))
                .order_by("grade")
            )
        )


# ── Helper: build standard result queryset select_related ─────────────────────


def _result_qs_base(ModelClass, extra_selects=()):
    """Return the base queryset with standard select_related for a result model."""
    selects = [
        "student",
        "student__user",
        "student__student_class",
        "student__student_class__education_level",
        "subject",
        "exam_session",
        "exam_session__academic_session",
        "grading_system",
        "entered_by",
        "approved_by",
        "published_by",
        "last_edited_by",
    ]
    selects.extend(extra_selects)
    return (
        ModelClass.objects.all()
        .select_related(*selects)
        .prefetch_related("grading_system__grades")
    )


def _apply_role_filter(queryset, viewset, user):
    """Apply role-based visibility filter on a result queryset."""
    if user.is_superuser or user.is_staff:
        return queryset
    role = viewset.get_user_role()
    if role in ("admin", "superadmin", "principal"):
        return queryset
    if role in (
        "secondary_admin",
        "nursery_admin",
        "primary_admin",
        "junior_secondary_admin",
        "senior_secondary_admin",
    ):
        levels = viewset.get_user_education_level_access()
        return (
            queryset.filter(
                student__student_class__education_level__level_type__in=levels
            )
            if levels
            else queryset.none()
        )
    if role == "teacher":
        return viewset.get_teacher_queryset(user, queryset)
    if role == "student":
        try:
            student = Student.objects.get(user=user)
            return queryset.filter(student=student, status=PUBLISHED)
        except Student.DoesNotExist:
            return queryset.none()
    if role == "parent":
        try:
            Parent = apps.get_model("parent", "Parent")
            parent = Parent.objects.get(user=user)
            return queryset.filter(student__parents=parent, status=PUBLISHED)
        except Exception:
            return queryset.none()
    return queryset.none()


# ── Senior Secondary Result ───────────────────────────────────────────────────


class SeniorSecondaryResultViewSet(
    BaseResultViewSetMixin,
    TeacherPortalCheckMixin,
    SectionFilterMixin,
    viewsets.ModelViewSet,
):
    pagination_class = StandardResultsPagination
    queryset = SeniorSecondaryResult.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        "student",
        "subject",
        "exam_session",
        "status",
        "is_passed",
        "stream",
    ]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return SeniorSecondaryResultCreateUpdateSerializer
        return SeniorSecondaryResultSerializer

    def get_queryset(self):
        user = getattr(self.request, "user", None)
        if not user or user.is_anonymous:
            return SeniorSecondaryResult.objects.none()
        qs = _result_qs_base(
            SeniorSecondaryResult,
            extra_selects=("stream", "stream__stream_type_new"),
        ).order_by("-created_at")
        return _apply_role_filter(qs, self, user)

    def create(self, request, *args, **kwargs):
        return self.handle_create(
            request,
            SENIOR_SECONDARY,
            SeniorSecondaryResultCreateUpdateSerializer,
            SeniorSecondaryResultSerializer,
        )

    def update(self, request, *args, **kwargs):
        return self.handle_update(
            request,
            self.get_object(),
            SeniorSecondaryResultCreateUpdateSerializer,
            SeniorSecondaryResultSerializer,
            **kwargs,
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self.handle_approve(
            request, self.get_object(), SeniorSecondaryResultSerializer
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self.handle_publish(
            request, self.get_object(), SeniorSecondaryResultSerializer
        )


# ── Senior Secondary Term Report ──────────────────────────────────────────────


class SeniorSecondaryTermReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = SeniorSecondaryTermReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "exam_session", "status", "is_published", "stream"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_queryset(self):
        qs = (
            SeniorSecondaryTermReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class",
                "student__student_class__education_level",
                "exam_session",
                "exam_session__academic_session",
                "published_by",
                "stream",
                "stream__stream_type_new",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=SeniorSecondaryResult.objects.select_related(
                        "subject",
                        "grading_system",
                        "stream",
                        "stream__stream_type_new",
                        "entered_by",
                        "approved_by",
                    ).prefetch_related("grading_system__grades"),
                )
            )
            .order_by("-created_at")
        )
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return qs
        role = self.get_user_role()
        if role in ("admin", "superadmin", "principal"):
            return qs
        if role in ("secondary_admin", "senior_secondary_admin"):
            levels = self.get_user_education_level_access()
            return (
                qs.filter(
                    student__student_class__education_level__level_type__in=levels
                )
                if levels
                else qs.none()
            )
        if role == "teacher":
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                assigned_classrooms = (
                    apps.get_model("classroom", "Classroom")
                    .objects.filter(
                        Q(class_teacher=teacher)
                        | Q(classroomteacherassignment__teacher=teacher)
                    )
                    .distinct()
                )
                student_ids = StudentEnrollment.objects.filter(
                    classroom__in=assigned_classrooms, is_active=True
                ).values_list("student_id", flat=True)
                return qs.filter(student_id__in=student_ids)
            except Exception:
                return qs.none()
        if role == "student":
            try:
                return qs.filter(student=Student.objects.get(user=user))
            except Student.DoesNotExist:
                return qs.none()
        if role == "parent":
            try:
                parent = apps.get_model("parent", "Parent").objects.get(user=user)
                return qs.filter(student__parents=parent)
            except Exception:
                return qs.none()
        return qs.none()


# ── Senior Secondary Session Result & Report ──────────────────────────────────


class SeniorSecondarySessionResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = SeniorSecondarySessionResult.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "subject", "academic_session", "status", "stream"]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_queryset(self):
        qs = (
            SeniorSecondarySessionResult.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "subject",
                "academic_session",
                "stream__stream_type_new",
            )
            .order_by("-created_at")
        )
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return qs
        role = self.get_user_role()
        if role in ("admin", "superadmin", "principal"):
            return qs
        if role in ("secondary_admin", "senior_secondary_admin"):
            levels = self.get_user_education_level_access()
            return (
                qs.filter(
                    student__student_class__education_level__level_type__in=levels
                )
                if levels
                else qs.none()
            )
        if role == "student":
            try:
                return qs.filter(
                    student=Student.objects.get(user=user), status=PUBLISHED
                )
            except Student.DoesNotExist:
                return qs.none()
        if role == "parent":
            try:
                parent = apps.get_model("parent", "Parent").objects.get(user=user)
                return qs.filter(student__parents=parent, status=PUBLISHED)
            except Exception:
                return qs.none()
        return qs.none()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return SeniorSecondarySessionResultCreateUpdateSerializer
        return SeniorSecondarySessionResultSerializer

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                student_id = request.data.get("student")
                if student_id:
                    student = Student.objects.select_related(
                        "student_class__education_level"
                    ).get(id=student_id)
                    if student.education_level != SENIOR_SECONDARY:
                        return Response(
                            {
                                "error": f"Expected SENIOR_SECONDARY, got {student.education_level}."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                data = (
                    request.data.copy()
                    if hasattr(request.data, "copy")
                    else dict(request.data)
                )
                data["entered_by"] = request.user.id
                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()
                return Response(
                    SeniorSecondarySessionResultSerializer(result).data, status=201
                )
        except Student.DoesNotExist:
            return Response({"error": "Student not found"}, status=404)
        except Exception as e:
            logger.error(f"Failed to create session result: {e}", exc_info=True)
            return Response({"error": str(e)}, status=400)


class SeniorSecondarySessionReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = SeniorSecondarySessionReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        "student",
        "academic_session",
        "status",
        "is_published",
        "stream",
    ]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_serializer_class(self):
        return SeniorSecondarySessionReportSerializer

    def get_queryset(self):
        qs = (
            SeniorSecondarySessionReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "academic_session",
                "stream__stream_type_new",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=SeniorSecondarySessionResult.objects.select_related(
                        "subject", "academic_session", "stream__stream_type_new"
                    ),
                )
            )
            .order_by("-created_at")
        )
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return qs
        role = self.get_user_role()
        if role in ("admin", "superadmin", "principal"):
            return qs
        if role == "student":
            try:
                return qs.filter(student=Student.objects.get(user=user))
            except Student.DoesNotExist:
                return qs.none()
        if role == "parent":
            try:
                parent = apps.get_model("parent", "Parent").objects.get(user=user)
                return qs.filter(student__parents=parent)
            except Exception:
                return qs.none()
        levels = self.get_user_education_level_access()
        return (
            qs.filter(student__student_class__education_level__level_type__in=levels)
            if levels
            else qs.none()
        )


# ── Junior Secondary Result ───────────────────────────────────────────────────


class JuniorSecondaryResultViewSet(
    BaseResultViewSetMixin,
    TeacherPortalCheckMixin,
    SectionFilterMixin,
    viewsets.ModelViewSet,
):
    pagination_class = StandardResultsPagination
    queryset = JuniorSecondaryResult.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "subject", "exam_session", "status", "is_passed"]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return JuniorSecondaryResultCreateUpdateSerializer
        return JuniorSecondaryResultSerializer

    def get_queryset(self):
        user = self.request.user
        qs = (
            _result_qs_base(JuniorSecondaryResult)
            .prefetch_related(
                Prefetch(
                    "student__studentenrollment_set",
                    queryset=StudentEnrollment.objects.filter(
                        is_active=True
                    ).select_related("classroom"),
                    to_attr="active_enrollments",
                )
            )
            .order_by("-created_at")
        )
        return _apply_role_filter(qs, self, user)

    def create(self, request, *args, **kwargs):
        return self.handle_create(
            request,
            JUNIOR_SECONDARY,
            JuniorSecondaryResultCreateUpdateSerializer,
            JuniorSecondaryResultSerializer,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        # reload with FK chain
        instance = JuniorSecondaryResult.objects.select_related(
            "student__student_class__education_level"
        ).get(pk=instance.pk)
        student_id = request.data.get("student")
        if student_id:
            try:
                student = Student.objects.select_related(
                    "student_class__education_level"
                ).get(id=student_id)
                if student.education_level != JUNIOR_SECONDARY:
                    return Response(
                        {
                            "error": f"Expected JUNIOR_SECONDARY, got {student.education_level}."
                        },
                        status=400,
                    )
            except Student.DoesNotExist:
                return Response({"error": "Student not found"}, status=404)
        return self.handle_update(
            request,
            instance,
            JuniorSecondaryResultCreateUpdateSerializer,
            JuniorSecondaryResultSerializer,
            **kwargs,
        )


# ── Junior Secondary Term Report ──────────────────────────────────────────────

class JuniorSecondaryTermReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = JuniorSecondaryTermReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "exam_session", "status", "is_published"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_serializer_class(self):
        return JuniorSecondaryTermReportSerializer

    def get_queryset(self):
        qs = (
            JuniorSecondaryTermReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "exam_session",
                "exam_session__academic_session",
                "published_by",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=JuniorSecondaryResult.objects.select_related(
                        "subject",
                        "grading_system",
                        "entered_by",
                        "approved_by",
                    ).prefetch_related("grading_system__grades"),
                )
            )
            .order_by("-created_at")
        )
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return qs
        role = self.get_user_role()
        if role in ("admin", "superadmin", "principal"):
            return qs
        if role in (
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ):
            levels = self.get_user_education_level_access()
            return (
                qs.filter(
                    student__student_class__education_level__level_type__in=levels
                )
                if levels
                else qs.none()
            )
        if role == "teacher":
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                assigned = (
                    apps.get_model("classroom", "Classroom")
                    .objects.filter(
                        Q(class_teacher=teacher)
                        | Q(classroomteacherassignment__teacher=teacher)
                    )
                    .distinct()
                )
                student_ids = StudentEnrollment.objects.filter(
                    classroom__in=assigned, is_active=True
                ).values_list("student_id", flat=True)
                levels = self.get_user_education_level_access()
                return qs.filter(
                    student_id__in=student_ids,
                    student__student_class__education_level__level_type__in=levels,
                )
            except Exception:
                return qs.none()
        if role == "student":
            try:
                return qs.filter(student=Student.objects.get(user=user))
            except Student.DoesNotExist:
                return qs.none()
        if role == "parent":
            try:
                parent = apps.get_model("parent", "Parent").objects.get(user=user)
                return qs.filter(student__parents=parent)
            except Exception:
                return qs.none()
        return qs.none()


# ── Primary Result ────────────────────────────────────────────────────────────

class PrimaryResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = PrimaryResult.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "subject", "exam_session", "status", "is_passed"]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return PrimaryResultCreateUpdateSerializer
        return PrimaryResultSerializer

    def get_queryset(self):
        user = self.request.user
        qs = _result_qs_base(PrimaryResult).order_by("-created_at")
        # Optional student_class filter from query params
        sc_param = self.request.query_params.get("student_class")
        if sc_param:
            try:
                classroom = (
                    apps.get_model("classroom", "Classroom")
                    .objects.filter(id=sc_param)
                    .first()
                )
                if classroom:
                    sids = StudentEnrollment.objects.filter(
                        classroom=classroom, is_active=True
                    ).values_list("student_id", flat=True)
                    qs = qs.filter(student_id__in=sids)
                else:
                    qs = qs.filter(student__student_class__name=sc_param)
            except (ValueError, TypeError):
                qs = qs.filter(student__student_class__name=sc_param)
        return _apply_role_filter(qs, self, user)

    def create(self, request, *args, **kwargs):
        return self.handle_create(
            request,
            PRIMARY,
            PrimaryResultCreateUpdateSerializer,
            PrimaryResultSerializer,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        instance = PrimaryResult.objects.select_related(
            "student__student_class__education_level"
        ).get(pk=instance.pk)
        student_id = request.data.get("student")
        if student_id:
            try:
                student = Student.objects.select_related(
                    "student_class__education_level"
                ).get(id=student_id)
                if student.education_level != PRIMARY:
                    return Response(
                        {"error": f"Expected PRIMARY, got {student.education_level}."},
                        status=400,
                    )
            except Student.DoesNotExist:
                return Response({"error": "Student not found"}, status=404)
        return self.handle_update(
            request,
            instance,
            PrimaryResultCreateUpdateSerializer,
            PrimaryResultSerializer,
            **kwargs,
        )


# ── Primary Term Report ───────────────────────────────────────────────────────

class PrimaryTermReportViewSet(
    TeacherPortalCheckMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = PrimaryTermReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "exam_session", "status", "is_published"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_serializer_class(self):
        return PrimaryTermReportSerializer

    def get_queryset(self):
        qs = (
            PrimaryTermReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "exam_session",
                "exam_session__academic_session",
                "published_by",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=PrimaryResult.objects.select_related(
                        "student",
                        "student__user",
                        "subject",
                        "grading_system",
                        "exam_session",
                        "entered_by",
                        "approved_by",
                        "published_by",
                    ).prefetch_related("grading_system__grades"),
                )
            )
            .order_by("-created_at")
        )
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return qs
        role = self.get_user_role()
        if role in ("admin", "superadmin", "principal"):
            return qs
        if role in (
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ):
            levels = self.get_user_education_level_access()
            return (
                qs.filter(
                    student__student_class__education_level__level_type__in=levels
                )
                if levels
                else qs.none()
            )
        if role == "teacher":
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                assigned = (
                    apps.get_model("classroom", "Classroom")
                    .objects.filter(
                        Q(class_teacher=teacher)
                        | Q(classroomteacherassignment__teacher=teacher)
                    )
                    .distinct()
                )
                student_ids = StudentEnrollment.objects.filter(
                    classroom__in=assigned, is_active=True
                ).values_list("student_id", flat=True)
                levels = self.get_user_education_level_access()
                return qs.filter(
                    student_id__in=student_ids,
                    student__student_class__education_level__level_type__in=levels,
                )
            except Exception:
                return qs.none()
        if role == "student":
            try:
                return qs.filter(student=Student.objects.get(user=user))
            except Student.DoesNotExist:
                return qs.none()
        if role == "parent":
            try:
                parent = apps.get_model("parent", "Parent").objects.get(user=user)
                return qs.filter(student__parents=parent)
            except Exception:
                return qs.none()
        return qs.none()


# ── Nursery Result ────────────────────────────────────────────────────────────

class NurseryResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = NurseryResult.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "subject", "exam_session", "status", "is_passed"]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return NurseryResultCreateUpdateSerializer
        return NurseryResultSerializer

    def get_queryset(self):
        user = self.request.user
        qs = _result_qs_base(NurseryResult, extra_selects=("term_report",)).order_by(
            "-created_at"
        )
        return _apply_role_filter(qs, self, user)

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                student_id = request.data.get("student")
                if not student_id:
                    return Response({"error": "student is required"}, status=400)
                subject_id = request.data.get("subject")
                if not subject_id:
                    return Response({"error": "subject is required"}, status=400)
                exam_session_id = request.data.get("exam_session")
                if not exam_session_id:
                    return Response({"error": "exam_session is required"}, status=400)

                try:
                    student = Student.objects.select_related(
                        "student_class__education_level"
                    ).get(id=student_id)
                except Student.DoesNotExist:
                    return Response({"error": "Student not found"}, status=404)

                if student.education_level != NURSERY:
                    return Response(
                        {"error": f"Expected NURSERY, got {student.education_level}."},
                        status=400,
                    )

                if hasattr(request.data, "_mutable"):
                    request.data._mutable = True
                request.data["entered_by"] = request.user.id

                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()
                logger.info(
                    f"NurseryResult created: {result.id} for student {student_id}"
                )
                return Response(NurseryResultSerializer(result).data, status=201)

        except Exception as e:
            logger.error(f"Failed to create nursery result: {e}", exc_info=True)
            return Response({"error": str(e)}, status=400)

    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                instance = self.get_object()
                instance = NurseryResult.objects.select_related(
                    "student__student_class__education_level"
                ).get(pk=instance.pk)
                student_id = request.data.get("student")
                if student_id:
                    try:
                        student = Student.objects.select_related(
                            "student_class__education_level"
                        ).get(id=student_id)
                        if student.education_level != NURSERY:
                            return Response(
                                {
                                    "error": f"Expected NURSERY, got {student.education_level}."
                                },
                                status=400,
                            )
                    except Student.DoesNotExist:
                        return Response({"error": "Student not found"}, status=404)
                partial = kwargs.get("partial", False) or request.method == "PATCH"
                serializer = self.get_serializer(
                    instance, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                return Response(NurseryResultSerializer(serializer.save()).data)
        except Exception as e:
            logger.error(f"Failed to update nursery result: {e}")
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        user_role = self.get_user_role()
        if user_role not in ("admin", "superadmin", "principal", "nursery_admin"):
            return Response({"error": "Permission denied"}, status=403)
        result = self.get_object()
        if result.status not in (DRAFT, SUBMITTED):
            return Response(
                {"error": f"Cannot approve result with status '{result.status}'"},
                status=400,
            )
        if result.mark_obtained is None or result.mark_obtained < 0:
            return Response({"error": "Invalid scores"}, status=400)
        try:
            with transaction.atomic():
                result.status = APPROVED
                result.approved_by = request.user
                result.approved_date = timezone.now()
                result.save()
            return Response(NurseryResultSerializer(result).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        with transaction.atomic():
            result = self.get_object()
            result.status = PUBLISHED
            result.published_by = request.user
            result.published_date = timezone.now()
            result.save()
        return Response(NurseryResultSerializer(result).data)

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """Simple per-record bulk create for nursery (no position recalculation needed at entry time)."""
        results_data = request.data.get("results", [])
        created, errors = [], []
        try:
            with transaction.atomic():
                for i, result_data in enumerate(results_data):
                    try:
                        result_data["entered_by"] = request.user.id
                        serializer = self.get_serializer(data=result_data)
                        serializer.is_valid(raise_exception=True)
                        created.append(NurseryResultSerializer(serializer.save()).data)
                    except Exception as e:
                        errors.append({"index": i, "error": str(e)})
                if errors and not created:
                    raise ValueError("No results created")
        except Exception as e:
            return Response({"error": str(e), "errors": errors}, status=400)
        resp = {"message": f"Created {len(created)} results", "results": created}
        if errors:
            resp["errors"] = errors
        return Response(resp, status=201)

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        # Fixed: was mixing dict assignment with &= Q(...)
        exam_session = request.query_params.get("exam_session")
        student_class = request.query_params.get("student_class")
        subject = request.query_params.get("subject")

        q = Q(status__in=[APPROVED, PUBLISHED])
        if exam_session:
            q &= Q(exam_session=exam_session)
        if student_class:
            q &= Q(student__student_class__name=student_class)
        if subject:
            q &= Q(subject=subject)

        results = self.get_queryset().filter(q)
        if not results.exists():
            return Response({"error": "No results found"}, status=404)

        agg = results.aggregate(
            avg=Avg("percentage"), high=Max("percentage"), low=Min("percentage")
        )
        return Response(
            {
                "total_students": results.count(),
                "class_average": float(agg["avg"] or 0),
                "highest_score": agg["high"] or 0,
                "lowest_score": agg["low"] or 0,
                "students_passed": results.filter(is_passed=True).count(),
                "students_failed": results.filter(is_passed=False).count(),
            }
        )

    @action(detail=False, methods=["get"])
    def grade_distribution(self, request):
        filters_q = {"status__in": [APPROVED, PUBLISHED]}
        if es := request.query_params.get("exam_session"):
            filters_q["exam_session"] = es
        if sc := request.query_params.get("student_class"):
            filters_q["student__student_class__name"] = sc
        return Response(
            list(
                self.get_queryset()
                .filter(**filters_q)
                .values("grade")
                .annotate(count=Count("grade"))
                .order_by("grade")
            )
        )


# ── Nursery Term Report ───────────────────────────────────────────────────────

class NurseryTermReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = NurseryTermReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "exam_session", "status", "is_published"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_serializer_class(self):
        return NurseryTermReportSerializer

    def get_queryset(self):
        qs = (
            NurseryTermReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "exam_session",
                "exam_session__academic_session",
                "published_by",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    # term_report is included so NurseryResultSerializer can read
                    # physical-development fields via source="term_report.field"
                    queryset=NurseryResult.objects.select_related(
                        "subject",
                        "grading_system",
                        "entered_by",
                        "approved_by",
                        "published_by",
                        "term_report",
                    ).prefetch_related("grading_system__grades"),
                )
            )
            .order_by("-created_at")
        )
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return qs
        role = self.get_user_role()
        if role in ("admin", "superadmin", "principal"):
            return qs
        if role in (
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ):
            levels = self.get_user_education_level_access()
            return (
                qs.filter(
                    student__student_class__education_level__level_type__in=levels
                )
                if levels
                else qs.none()
            )
        if role == "teacher":
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                assigned = (
                    apps.get_model("classroom", "Classroom")
                    .objects.filter(
                        Q(class_teacher=teacher)
                        | Q(classroomteacherassignment__teacher=teacher)
                    )
                    .distinct()
                )
                student_ids = StudentEnrollment.objects.filter(
                    classroom__in=assigned, is_active=True
                ).values_list("student_id", flat=True)
                levels = self.get_user_education_level_access()
                return qs.filter(
                    student_id__in=student_ids,
                    student__student_class__education_level__level_type__in=levels,
                )
            except Exception:
                return qs.none()
        if role == "student":
            try:
                return qs.filter(student=Student.objects.get(user=user))
            except Student.DoesNotExist:
                return qs.none()
        if role == "parent":
            try:
                parent = apps.get_model("parent", "Parent").objects.get(user=user)
                return qs.filter(student__parents=parent)
            except Exception:
                return qs.none()
        return qs.none()

    @action(detail=True, methods=["post"])
    def submit_for_approval(self, request, pk=None):
        try:
            with transaction.atomic():
                report = self.get_object()
                if not report.subject_results.exists():
                    return Response({"error": "Cannot submit empty report"}, status=400)
                if report.status not in (DRAFT, APPROVED):
                    return Response(
                        {"error": f"Cannot submit from status '{report.status}'"},
                        status=400,
                    )
                report.status = SUBMITTED
                report.save(update_fields=["status", "updated_at"])
                return Response(
                    {"message": "Submitted", "data": self.get_serializer(report).data}
                )
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        try:
            with transaction.atomic():
                report = self.get_object()
                if report.status not in (SUBMITTED, DRAFT):
                    return Response(
                        {"error": f"Cannot approve from status '{report.status}'"},
                        status=400,
                    )
                report.status = APPROVED
                report.save(update_fields=["status", "updated_at"])
                updated = report.subject_results.update(
                    status=APPROVED,
                    approved_by=request.user,
                    approved_date=timezone.now(),
                )
                return Response(
                    {
                        "message": f"Approved. {updated} subject result(s) also approved.",
                        "data": self.get_serializer(report).data,
                    }
                )
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        try:
            with transaction.atomic():
                report = self.get_object()
                if report.status not in (APPROVED, SUBMITTED):
                    return Response(
                        {"error": f"Cannot publish from status '{report.status}'"},
                        status=400,
                    )
                report.is_published = True
                report.published_by = request.user
                report.published_date = timezone.now()
                report.status = PUBLISHED
                report.save()
                updated = report.subject_results.update(
                    status=PUBLISHED,
                    published_by=request.user,
                    published_date=timezone.now(),
                )
                return Response(
                    {
                        "message": f"Published. {updated} subject result(s) also published.",
                        "data": self.get_serializer(report).data,
                    }
                )
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def calculate_metrics(self, request, pk=None):
        try:
            report = self.get_object()
            report.calculate_metrics()
            report.calculate_class_position()
            return Response(self.get_serializer(report).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["post"])
    def bulk_publish(self, request):
        report_ids = request.data.get("report_ids", [])
        if not report_ids:
            return Response({"error": "report_ids are required"}, status=400)
        try:
            with transaction.atomic():
                reports = self.get_queryset().filter(id__in=report_ids)
                invalid = reports.exclude(status__in=(APPROVED, SUBMITTED))
                if invalid.exists():
                    return Response(
                        {"error": f"{invalid.count()} report(s) cannot be published"},
                        status=400,
                    )
                count = reports.update(
                    is_published=True,
                    published_by=request.user,
                    published_date=timezone.now(),
                    status=PUBLISHED,
                )
                subj_count = 0
                for report in reports:
                    subj_count += report.subject_results.update(
                        status=PUBLISHED,
                        published_by=request.user,
                        published_date=timezone.now(),
                    )
                return Response(
                    {"reports_published": count, "subjects_published": subj_count}
                )
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if self.get_user_role() not in ("admin", "superadmin", "principal"):
            return Response(
                {"error": "Only administrators can delete term reports"}, status=403
            )
        with transaction.atomic():
            subject_count = instance.subject_results.count()
            instance.subject_results.all().delete()
            instance.delete()
        return Response(
            {"message": f"Deleted report and {subject_count} subject result(s)"},
            status=status.HTTP_204_NO_CONTENT,
        )


# ── Legacy Student Result / Term Result ───────────────────────────────────────


class StudentResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = StudentResult.objects.all()
    serializer_class = StudentResultSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        "student",
        "subject",
        "exam_session",
        "status",
        "is_passed",
        "stream",
    ]
    search_fields = ["student__full_name", "subject__name"]

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related(
                "student", "subject", "exam_session", "grading_system", "stream"
            )
            .prefetch_related("assessment_scores", "comments")
        )
        if self.request.user.is_authenticated:
            section_access = self.get_user_section_access()
            education_levels = self.get_education_levels_for_sections(section_access)
            if not education_levels:
                return qs.none()
            # StudentResult.student.education_level is a @property — filter via FK chain
            qs = qs.filter(
                student__student_class__education_level__level_type__in=education_levels
            )
        return qs

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                request.data["entered_by"] = request.user.id
                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                return Response(
                    DetailedStudentResultSerializer(serializer.save()).data, status=201
                )
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                partial = kwargs.pop("partial", False)
                serializer = self.get_serializer(
                    self.get_object(), data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                return Response(DetailedStudentResultSerializer(serializer.save()).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        es_id = request.query_params.get("exam_session_id")
        sc_id = request.query_params.get("student_class_id")
        if not es_id or not sc_id:
            return Response(
                {"error": "exam_session_id and student_class_id are required"},
                status=400,
            )
        results = self.get_queryset().filter(
            exam_session_id=es_id, student__student_class_id=sc_id
        )
        if not results.exists():
            return Response({"error": "No results found"}, status=404)
        return Response(
            results.aggregate(
                total_students=Count("student", distinct=True),
                average_score=Avg("total_score"),
                highest_score=Max("total_score"),
                lowest_score=Min("total_score"),
                passed_count=Count("id", filter=Q(is_passed=True)),
                failed_count=Count("id", filter=Q(is_passed=False)),
            )
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        result = self.get_object()
        if self.get_user_role() not in (
            "admin",
            "superadmin",
            "principal",
            "senior_secondary_admin",
        ):
            return Response({"error": "Permission denied"}, status=403)
        if result.status not in (DRAFT, SUBMITTED):
            return Response(
                {"error": f"Cannot approve from status '{result.status}'"}, status=400
            )
        try:
            with transaction.atomic():
                result.status = APPROVED
                result.approved_by = request.user
                result.approved_date = timezone.now()
                result.save()
            return Response(DetailedStudentResultSerializer(result).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        try:
            with transaction.atomic():
                result = self.get_object()
                result.status = PUBLISHED
                result.save()
            return Response(DetailedStudentResultSerializer(result).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class StudentTermResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = StudentTermResult.objects.all()
    serializer_class = StudentTermResultSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = StudentTermResultFilter
    search_fields = ["student__full_name"]

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "academic_session",
                "term",
                "term__term_type",
            )
            .prefetch_related("comments")
            .order_by("-created_at")
        )
        user = self.request.user
        if getattr(user, "role", None) == "STUDENT":
            return qs.filter(student__user=user)
        section_access = self.get_user_section_access()
        if not section_access:
            return qs.none()
        education_levels = self.get_education_levels_for_sections(section_access)
        if not education_levels:
            return qs.none()
        # education_level is a @property — must filter via FK chain
        return qs.filter(
            student__student_class__education_level__level_type__in=education_levels
        )

    @action(detail=True, methods=["get"])
    def detailed(self, request, pk=None):
        term_result = self.get_object()
        return Response(
            StudentTermResultDetailSerializer(
                term_result, context={"request": request}
            ).data
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        try:
            with transaction.atomic():
                term_result = self.get_object()
                term_result.status = APPROVED
                term_result.save()
            return Response(StudentTermResultSerializer(term_result).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        try:
            with transaction.atomic():
                term_result = self.get_object()
                term_result.status = PUBLISHED
                term_result.save()
            return Response(StudentTermResultSerializer(term_result).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


# ── Supporting ViewSets ───────────────────────────────────────────────────────


class ResultSheetViewSet(
    AutoSectionFilterMixin, TeacherPortalCheckMixin, viewsets.ModelViewSet
):
    queryset = ResultSheet.objects.all()
    serializer_class = ResultSheetSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["exam_session", "student_class", "status"]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related(
                "exam_session",
                "exam_session__academic_session",
                "prepared_by",
                "approved_by",
                "student_class",
                "student_class__education_level",
            )
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        try:
            with transaction.atomic():
                sheet = self.get_object()
                sheet.status = APPROVED
                sheet.approved_by = request.user
                sheet.approved_date = timezone.now()
                sheet.save()
            return Response(ResultSheetSerializer(sheet).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["post"])
    def generate_sheet(self, request):
        es_id = request.data.get("exam_session_id")
        sc_id = request.data.get("student_class_id")
        if not es_id or not sc_id:
            return Response(
                {"error": "exam_session_id and student_class_id are required"},
                status=400,
            )
        try:
            exam_session = ExamSession.objects.get(id=es_id)
            student_class = StudentClass.objects.get(id=sc_id)
            existing = ResultSheet.objects.filter(
                exam_session=exam_session, student_class=student_class
            ).first()
            if existing:
                return Response(ResultSheetSerializer(existing).data)
            sheet = ResultSheet.objects.create(
                exam_session=exam_session,
                student_class=student_class,
                prepared_by=request.user,
                status=DRAFT,
            )
            return Response(ResultSheetSerializer(sheet).data, status=201)
        except ExamSession.DoesNotExist:
            return Response({"error": "Exam session not found"}, status=404)
        except StudentClass.DoesNotExist:
            return Response({"error": "Student class not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class AssessmentScoreViewSet(
    AutoSectionFilterMixin, TeacherPortalCheckMixin, viewsets.ModelViewSet
):
    queryset = AssessmentScore.objects.all()
    serializer_class = AssessmentScoreSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["student_result", "assessment_type"]

    def get_queryset(self):
        return (
            super().get_queryset().select_related("student_result", "assessment_type")
        )


class ResultCommentViewSet(
    AutoSectionFilterMixin, TeacherPortalCheckMixin, viewsets.ModelViewSet
):
    queryset = ResultComment.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["student_result", "term_result", "comment_type", "commented_by"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ResultCommentCreateSerializer
        return ResultCommentSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("student_result", "term_result", "commented_by")
        )

    def perform_create(self, serializer):
        serializer.save(commented_by=self.request.user)


class ResultTemplateViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    queryset = ResultTemplate.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["template_type", "education_level", "is_active"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ResultTemplateCreateUpdateSerializer
        return ResultTemplateSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        t = self.get_object()
        t.is_active = True
        t.save()
        return Response(ResultTemplateSerializer(t).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        t = self.get_object()
        t.is_active = False
        t.save()
        return Response(ResultTemplateSerializer(t).data)


# ── Bulk Operations ───────────────────────────────────────────────────────────


class BulkResultOperationsViewSet(TenantFilterMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"])
    def bulk_status_update(self, request):
        serializer = BulkStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result_ids = serializer.validated_data["result_ids"]
        new_status = serializer.validated_data["status"]
        try:
            with transaction.atomic():
                total = sum(
                    model.objects.filter(id__in=result_ids).update(status=new_status)
                    for model in _RESULT_MODEL_MAP.values()
                )
            return Response(
                {"message": f"Updated {total} results", "status": new_status}
            )
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["post"])
    def bulk_publish_results(self, request):
        serializer = PublishResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result_ids = serializer.validated_data["result_ids"]
        publish_date = serializer.validated_data.get("publish_date", timezone.now())
        send_notifications = serializer.validated_data.get("send_notifications", True)

        try:
            with transaction.atomic():
                total_published = 0
                student_ids = set()
                for model in _RESULT_MODEL_MAP.values():
                    if send_notifications:
                        student_ids.update(
                            model.objects.filter(id__in=result_ids).values_list(
                                "student_id", flat=True
                            )
                        )
                    total_published += model.objects.filter(id__in=result_ids).update(
                        status=PUBLISHED,
                        published_by=request.user,
                        published_date=publish_date,
                    )

                notifications_sent = 0
                if send_notifications and student_ids:
                    from parent.models import ParentStudentRelationship

                    students = Student.objects.filter(
                        id__in=student_ids
                    ).select_related("user")
                    rels = ParentStudentRelationship.objects.filter(
                        student_id__in=student_ids
                    ).select_related("parent__user")
                    recipient_ids = list(
                        {
                            *(s.user.id for s in students if s.user),
                            *(
                                r.parent.user.id
                                for r in rels
                                if r.parent and r.parent.user
                            ),
                        }
                    )
                    if recipient_ids:
                        bulk_msg = BulkMessage.objects.create(
                            sender=request.user,
                            subject="Results Published",
                            content="Academic results are now available.",
                            message_type="in_app",
                            priority="high",
                            custom_recipients=recipient_ids,
                            total_recipients=len(recipient_ids),
                            status="sent",
                            sent_at=timezone.now(),
                            tenant=getattr(request, "tenant", None),
                        )
                        from users.models import CustomUser
                        msgs = [
                            Message(
                                sender=request.user,
                                recipient=r,
                                subject=bulk_msg.subject,
                                content=bulk_msg.content,
                                message_type="in_app",
                                priority="high",
                                status="sent",
                                sent_at=timezone.now(),
                                tenant=getattr(request, "tenant", None),
                            )
                            for r in CustomUser.objects.filter(id__in=recipient_ids)
                        ]
                        Message.objects.bulk_create(msgs)
                        notifications_sent = len(msgs)
                        bulk_msg.sent_count = notifications_sent
                        bulk_msg.delivered_count = notifications_sent
                        bulk_msg.save()

            return Response(
                {
                    "message": f"Published {total_published} results",
                    "notifications_sent": notifications_sent,
                }
            )
        except Exception as e:
            logger.error(f"Bulk publish failed: {e}")
            return Response({"error": str(e)}, status=400)


# ── Analytics ─────────────────────────────────────────────────────────────────


class ResultAnalyticsViewSet(TenantFilterMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"])
    def subject_performance(self, request):
        es_id = request.query_params.get("exam_session_id")
        level = request.query_params.get("education_level", SENIOR_SECONDARY)
        if not es_id:
            return Response({"error": "exam_session_id is required"}, status=400)
        model = _RESULT_MODEL_MAP.get(level, SeniorSecondaryResult)
        results = (
            model.objects.filter(
                exam_session_id=es_id, status__in=(APPROVED, PUBLISHED)
            )
            .values("subject__id", "subject__name", "subject__code")
            .annotate(
                total_students=Count("student", distinct=True),
                average_score=Avg("total_score"),
                highest_score=Max("total_score"),
                lowest_score=Min("total_score"),
                students_passed=Count("id", filter=Q(is_passed=True)),
                students_failed=Count("id", filter=Q(is_passed=False)),
            )
        )
        data = [
            {
                "subject_id": r["subject__id"],
                "subject_name": r["subject__name"],
                "subject_code": r["subject__code"],
                "total_students": r["total_students"],
                "average_score": round(r["average_score"] or 0, 2),
                "highest_score": r["highest_score"],
                "lowest_score": r["lowest_score"],
                "pass_rate": round(
                    (
                        (r["students_passed"] / r["total_students"] * 100)
                        if r["total_students"]
                        else 0
                    ),
                    2,
                ),
                "students_passed": r["students_passed"],
                "students_failed": r["students_failed"],
            }
            for r in results
        ]
        return Response(SubjectPerformanceSerializer(data, many=True).data)

    @action(detail=False, methods=["get"])
    def result_summary(self, request):
        es_id = request.query_params.get("exam_session_id")
        if not es_id:
            return Response({"error": "exam_session_id is required"}, status=400)
        summary = {
            "total_results": 0,
            "published_results": 0,
            "pending_approval": 0,
            "draft_results": 0,
        }
        total_passed = 0
        for model in _RESULT_MODEL_MAP.values():
            qs = model.objects.filter(exam_session_id=es_id)
            summary["total_results"] += qs.count()
            summary["published_results"] += qs.filter(status=PUBLISHED).count()
            summary["pending_approval"] += qs.filter(status=SUBMITTED).count()
            summary["draft_results"] += qs.filter(status=DRAFT).count()
            total_passed += qs.filter(is_passed=True).count()
        summary["overall_pass_rate"] = round(
            (
                total_passed / summary["total_results"] * 100
                if summary["total_results"]
                else 0
            ),
            2,
        )
        return Response(summary)


# ── Import / Export ───────────────────────────────────────────────────────────


class ResultImportExportViewSet(TenantFilterMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"])
    def import_results(self, request):
        serializer = ResultImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "No file provided"}, status=400)
        level = serializer.validated_data.get("education_level")
        es_id = serializer.validated_data.get("exam_session_id")
        model = _RESULT_MODEL_MAP.get(level)
        if not model:
            return Response({"error": "Invalid education level"}, status=400)
        reader = csv.DictReader(io.StringIO(file_obj.read().decode("utf-8")))
        imported, errors = 0, []
        with transaction.atomic():
            for row_num, row in enumerate(reader, start=2):
                try:
                    student = Student.objects.get(id=row["student_id"])
                    subject = Subject.objects.get(id=row["subject_id"])
                    model.objects.update_or_create(
                        student=student,
                        subject=subject,
                        exam_session_id=es_id,
                        defaults={
                            "status": DRAFT,
                            "tenant": getattr(request, "tenant", None),
                        },
                    )
                    imported += 1
                except Exception as e:
                    errors.append(f"Row {row_num}: {e}")
        return Response({"imported_count": imported, "errors": errors[:10]})

    @action(detail=False, methods=["post"])
    def export_results(self, request):
        serializer = ResultExportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        level = serializer.validated_data.get("education_level")
        es_id = serializer.validated_data.get("exam_session_id")
        sc_id = serializer.validated_data.get("student_class")
        model = _RESULT_MODEL_MAP.get(level)
        if not model:
            return Response({"error": "Invalid education level"}, status=400)
        qs = model.objects.filter(exam_session_id=es_id).select_related(
            "student", "subject", "student__student_class"
        )
        if sc_id:
            qs = qs.filter(student__student_class_id=sc_id)
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="results_{es_id}_{level}.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(
            [
                "Student ID",
                "Student Name",
                "Student Class",
                "Subject",
                "Grade",
                "Status",
            ]
        )
        for r in qs:
            writer.writerow(
                [
                    r.student.id,
                    getattr(r.student, "full_name", ""),
                    r.student.student_class.name if r.student.student_class else "",
                    (
                        getattr(r, "subject", {}).name
                        if hasattr(r, "subject") and r.subject
                        else ""
                    ),
                    r.grade or "",
                    r.status or "",
                ]
            )
        return response


# ── Report Generation ─────────────────────────────────────────────────────────


class ReportGenerationViewSet(TenantFilterMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"], url_path="verify-report")
    def verify_report_exists(self, request):
        report_id = request.query_params.get("report_id")
        level = request.query_params.get("education_level", "").upper()
        model = _TERM_REPORT_MODEL_MAP.get(level)
        if not model:
            return Response({"error": "Invalid education level"}, status=400)
        try:
            report = model.objects.get(id=report_id)
            return Response(
                {
                    "exists": True,
                    "report_id": str(report.id),
                    "student": getattr(report.student, "full_name", "Unknown"),
                    "status": report.status,
                }
            )
        except model.DoesNotExist:
            return Response({"exists": False, "error": "Not found"}, status=404)

    @action(detail=False, methods=["get"], url_path="download-term-report")
    def download_term_report(self, request):
        report_id = request.query_params.get("report_id")
        education_level = request.query_params.get("education_level")
        if not report_id or not education_level:
            return Response(
                {"error": "report_id and education_level are required"}, status=400
            )
        try:
            generator = get_report_generator(education_level, request)
            return generator.generate_term_report(report_id)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
        except Exception as e:
            logger.error(f"Error generating PDF report: {e}", exc_info=True)
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["get"], url_path="download-session-report")
    def download_session_report(self, request):
        report_id = request.query_params.get("report_id")
        if not report_id:
            return Response({"error": "report_id is required"}, status=400)
        try:
            return get_report_generator(
                SENIOR_SECONDARY, request
            ).generate_session_report(report_id)
        except Exception as e:
            logger.error(f"Error generating session report: {e}", exc_info=True)
            return Response({"error": str(e)}, status=500)


# ── Professional Assignment ───────────────────────────────────────────────────


class ProfessionalAssignmentViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ViewSet
):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def _get_report_model(self, education_level):
        model = _TERM_REPORT_MODEL_MAP.get(education_level.upper())
        if not model:
            raise ValueError(f"Invalid education level: {education_level}")
        return model

    def _can_teacher_edit_remark(self, user, term_report):
        try:
            from teacher.models import Teacher
            from classroom.models import ClassroomTeacherAssignment

            teacher = Teacher.objects.get(user=user)
            enrollment = (
                StudentEnrollment.objects.filter(
                    student=term_report.student, is_active=True
                )
                .select_related("classroom")
                .first()
            )
            if not enrollment:
                return False
            classroom = enrollment.classroom
            if classroom.class_teacher == teacher:
                return True
            return ClassroomTeacherAssignment.objects.filter(
                teacher=teacher, classroom=classroom
            ).exists()
        except Exception:
            return False

    @action(detail=False, methods=["get"], url_path="my-students")
    def get_assigned_students(self, request):
        user = request.user
        es_id = request.query_params.get("exam_session")
        level_filter = request.query_params.get("education_level")

        exam_session = (
            ExamSession.objects.select_related(
                "academic_session", "term", "term__term_type"
            ).get(id=es_id)
            if es_id
            else ExamSession.objects.select_related(
                "academic_session", "term", "term__term_type"
            )
            .filter(is_active=True)
            .order_by("-created_at")
            .first()
        )
        if not exam_session:
            return Response({"error": "No active exam session found"}, status=400)

        try:
            from teacher.models import Teacher

            teacher = Teacher.objects.get(user=user)
            assigned_classrooms = (
                apps.get_model("classroom", "Classroom")
                .objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                )
                .distinct()
            )

            if not assigned_classrooms.exists():
                return Response(
                    {
                        "exam_session": {
                            "id": str(exam_session.id),
                            "name": exam_session.name,
                        },
                        "students": [],
                        "summary": {
                            "total_students": 0,
                            "completed_remarks": 0,
                            "pending_remarks": 0,
                            "completion_percentage": 0,
                        },
                    }
                )

            enrollments = StudentEnrollment.objects.filter(
                classroom__in=assigned_classrooms,
                is_active=True,
            ).select_related(
                "student", "student__user", "student__student_class", "classroom"
            )

            students_data = []
            for enrollment in enrollments:
                student = enrollment.student
                level = student.education_level
                if level_filter and level != level_filter:
                    continue
                try:
                    report_model = self._get_report_model(level)
                    term_report = report_model.objects.filter(
                        student=student, exam_session=exam_session
                    ).first()
                except Exception:
                    term_report = None

                has_remark = bool(term_report and term_report.class_teacher_remark)
                has_sig = bool(
                    term_report
                    and getattr(term_report, "class_teacher_signature", None)
                )
                remark_status = (
                    "completed"
                    if (has_remark and has_sig)
                    else ("draft" if has_remark else "pending")
                )

                students_data.append(
                    {
                        "id": str(student.id),
                        "full_name": student.full_name,
                        "admission_number": student.registration_number,
                        "student_class": (
                            student.student_class.name
                            if student.student_class
                            else enrollment.classroom.name
                        ),
                        "education_level": level,
                        "average_score": (
                            float(getattr(term_report, "average_score", None) or 0)
                            if term_report
                            else None
                        ),
                        "term_report_id": str(term_report.id) if term_report else None,
                        "has_remark": has_remark,
                        "remark_status": remark_status,
                        "last_remark": (
                            getattr(term_report, "class_teacher_remark", "")
                            if term_report
                            else ""
                        ),
                    }
                )

            students_data.sort(key=lambda x: (x["student_class"], x["full_name"]))
            total = len(students_data)
            completed = sum(
                1 for s in students_data if s["remark_status"] == "completed"
            )

            return Response(
                {
                    "exam_session": {
                        "id": str(exam_session.id),
                        "name": exam_session.name,
                        "term": exam_session.term.name if exam_session.term else None,
                    },
                    "students": students_data,
                    "summary": {
                        "total_students": total,
                        "completed_remarks": completed,
                        "pending_remarks": total - completed,
                        "completion_percentage": (
                            round(completed / total * 100, 2) if total else 0
                        ),
                    },
                }
            )
        except Exception as e:
            logger.error(f"Error fetching assigned students: {e}", exc_info=True)
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="update-remark")
    def update_teacher_remark(self, request):
        report_id = request.data.get("term_report_id")
        level = request.data.get("education_level")
        remark = request.data.get("class_teacher_remark", "").strip()
        if not report_id or not level or not remark:
            return Response(
                {"error": "term_report_id, education_level, and remark are required"},
                status=400,
            )
        if len(remark) < 50:
            return Response(
                {"error": "Remark must be at least 50 characters"}, status=400
            )
        if len(remark) > 500:
            return Response(
                {"error": "Remark must not exceed 500 characters"}, status=400
            )
        try:
            model = self._get_report_model(level)
            report = model.objects.get(id=report_id)
            if not self._can_teacher_edit_remark(request.user, report):
                return Response({"error": "Permission denied"}, status=403)
            report.class_teacher_remark = remark
            report.save(update_fields=["class_teacher_remark", "updated_at"])
            return Response(
                {"message": "Remark updated", "term_report_id": str(report.id)}
            )
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="upload-signature")
    def upload_teacher_signature(self, request):
        sig = request.FILES.get("signature_image")
        if not sig:
            return Response({"error": "signature_image is required"}, status=400)
        if sig.size > 2 * 1024 * 1024:
            return Response({"error": "Max 2MB"}, status=400)
        if sig.content_type not in ("image/png", "image/jpeg", "image/jpg"):
            return Response({"error": "Only PNG/JPEG allowed"}, status=400)
        try:
            result = upload_signature_to_cloudinary(
                sig, request.user, signature_type="teacher"
            )
            return Response(
                {
                    "signature_url": result["signature_url"],
                    "public_id": result["public_id"],
                }
            )
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="apply-signature")
    def apply_signature_to_reports(self, request):
        import json
        url = request.data.get("signature_url")
        level = request.data.get("education_level")
        ids = request.data.get("term_report_ids", [])
        if isinstance(ids, str):
            try:
                ids = json.loads(ids)
            except json.JSONDecodeError:
                return Response({"error": "Invalid term_report_ids format"}, status=400)
        if not url or not ids or not level:
            return Response(
                {
                    "error": "signature_url, term_report_ids, and education_level are required"
                },
                status=400,
            )
        try:
            model = self._get_report_model(level)
            updated, errors = 0, []
            with transaction.atomic():
                for rid in ids:
                    try:
                        report = model.objects.get(id=rid)
                        if not self._can_teacher_edit_remark(request.user, report):
                            errors.append(
                                {"report_id": str(rid), "error": "Permission denied"}
                            )
                            continue
                        report.class_teacher_signature = url
                        report.class_teacher_signed_at = timezone.now()
                        report.save(
                            update_fields=[
                                "class_teacher_signature",
                                "class_teacher_signed_at",
                                "updated_at",
                            ]
                        )
                        updated += 1
                    except model.DoesNotExist:
                        errors.append({"report_id": str(rid), "error": "Not found"})
            resp = {"updated_count": updated, "total_requested": len(ids)}
            if errors:
                resp["errors"] = errors
            return Response(resp)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["get"], url_path="remark-templates")
    def get_remark_templates(self, request):
        return Response(
            {
                "templates": {
                    "nursery": {
                        "excellent": [
                            "{student_name} shows great enthusiasm for learning and interacts positively with classmates."
                        ],
                        "good": [
                            "{student_name} is learning well and shows good behaviour most of the time."
                        ],
                        "average": [
                            "{student_name} is developing basic skills and should participate more actively."
                        ],
                        "needs_improvement": [
                            "{student_name} needs support staying focused and following classroom routines."
                        ],
                    },
                    "primary": {
                        "excellent": [
                            "{student_name} demonstrates strong academic performance and a responsible attitude."
                        ],
                        "good": [
                            "{student_name} shows good understanding and maintains positive classroom behaviour."
                        ],
                        "average": [
                            "{student_name} shows average performance and needs more consistency."
                        ],
                        "needs_improvement": [
                            "{student_name} needs to improve focus and academic commitment."
                        ],
                    },
                    "junior_secondary": {
                        "excellent": [
                            "{student_name} demonstrates excellent academic skills and strong engagement."
                        ],
                        "good": [
                            "{student_name} performs well and participates actively in class activities."
                        ],
                        "average": [
                            "{student_name} shows adequate performance and needs better study habits."
                        ],
                        "needs_improvement": [
                            "{student_name} needs to work on discipline and study consistency."
                        ],
                    },
                    "senior_secondary": {
                        "excellent": [
                            "{student_name} consistently excels academically and shows strong leadership."
                        ],
                        "good": [
                            "{student_name} shows good understanding and maintains a positive attitude."
                        ],
                        "average": [
                            "{student_name} should focus on strengthening weak areas and time management."
                        ],
                        "needs_improvement": [
                            "{student_name} needs to increase effort and participation."
                        ],
                    },
                }
            }
        )


class HeadTeacherAssignmentViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ViewSet
):
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    @action(detail=False, methods=["get"], url_path="pending-reviews")
    def get_pending_reviews(self, request):
        es_id = request.query_params.get("exam_session")
        exam_session = (
            ExamSession.objects.select_related(
                "academic_session", "term", "term__term_type"
            ).get(id=es_id)
            if es_id
            else ExamSession.objects.select_related(
                "academic_session", "term", "term__term_type"
            )
            .filter(is_active=True)
            .order_by("-created_at")
            .first()
        )
        if not exam_session:
            return Response({"error": "No active exam session found"}, status=400)

        pending = []
        for level, model in _TERM_REPORT_MODEL_MAP.items():
            for report in model.objects.filter(
                exam_session=exam_session, status=SUBMITTED
            ).select_related("student", "student__user", "student__student_class"):
                pending.append(
                    {
                        "id": str(report.id),
                        "student": {
                            "id": str(report.student.id),
                            "full_name": report.student.full_name,
                            "student_class": (
                                report.student.student_class.name
                                if report.student.student_class
                                else None
                            ),
                        },
                        "education_level": level,
                        "class_teacher_remark": report.class_teacher_remark,
                        "head_teacher_remark": report.head_teacher_remark,
                        "has_head_teacher_remark": bool(report.head_teacher_remark),
                        "has_head_teacher_signature": bool(
                            getattr(report, "head_teacher_signature", None)
                        ),
                        "status": report.status,
                        "average_score": (
                            float(getattr(report, "average_score", None) or 0)
                            if hasattr(report, "average_score")
                            else None
                        ),
                    }
                )
        return Response(
            {
                "exam_session": ExamSessionSerializer(exam_session).data,
                "pending_reviews": pending,
                "total_pending": len(pending),
            }
        )

    @action(detail=False, methods=["post"], url_path="update-head-remark")
    def update_head_teacher_remark(self, request):
        report_id = request.data.get("term_report_id")
        level = request.data.get("education_level")
        remark = request.data.get("head_teacher_remark", "").strip()
        if not all([report_id, level, remark]):
            return Response({"error": "All fields are required"}, status=400)
        if len(remark) < 50:
            return Response(
                {"error": "Remark must be at least 50 characters"}, status=400
            )
        model = _TERM_REPORT_MODEL_MAP.get(level.upper())
        if not model:
            return Response({"error": "Invalid education level"}, status=400)
        try:
            report = model.objects.get(id=report_id)
            if not report.can_edit_head_teacher_remark(request.user):
                return Response({"error": "Permission denied"}, status=403)
            report.head_teacher_remark = remark
            report.save(update_fields=["head_teacher_remark", "updated_at"])
            return Response(
                {
                    "message": "Head teacher remark updated",
                    "term_report_id": str(report.id),
                }
            )
        except model.DoesNotExist:
            return Response({"error": "Term report not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="upload-head-signature")
    def upload_head_teacher_signature(self, request):
        sig = request.FILES.get("signature_image")
        if not sig:
            return Response({"error": "signature_image is required"}, status=400)
        try:
            result = upload_signature_to_cloudinary(
                sig, request.user, signature_type="head_teacher"
            )
            return Response(
                {
                    "signature_url": result["signature_url"],
                    "public_id": result["public_id"],
                }
            )
        except Exception as e:
            return Response({"error": str(e)}, status=500)

    @action(detail=False, methods=["post"], url_path="apply-head-signature")
    def apply_head_signature(self, request):
        import json
        url = request.data.get("signature_url")
        level = request.data.get("education_level")
        ids = request.data.get("term_report_ids", [])
        if isinstance(ids, str):
            try:
                ids = json.loads(ids)
            except json.JSONDecodeError:
                return Response({"error": "Invalid term_report_ids format"}, status=400)
        if not all([url, ids, level]):
            return Response({"error": "All fields are required"}, status=400)
        model = _TERM_REPORT_MODEL_MAP.get(level.upper())
        if not model:
            return Response({"error": "Invalid education level"}, status=400)
        updated, errors = 0, []
        with transaction.atomic():
            for rid in ids:
                try:
                    report = model.objects.get(id=rid)
                    if not report.can_edit_head_teacher_remark(request.user):
                        errors.append(
                            {"report_id": str(rid), "error": "Permission denied"}
                        )
                        continue
                    report.head_teacher_signature = url
                    report.head_teacher_signed_at = timezone.now()
                    report.save(
                        update_fields=[
                            "head_teacher_signature",
                            "head_teacher_signed_at",
                            "updated_at",
                        ]
                    )
                    updated += 1
                except model.DoesNotExist:
                    errors.append({"report_id": str(rid), "error": "Not found"})
        return Response({"updated_count": updated, "errors": errors or None})
