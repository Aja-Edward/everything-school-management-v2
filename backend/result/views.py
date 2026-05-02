# result/views.py


import csv
import io
import json
import logging
from decimal import Decimal

import cloudinary.uploader
from django.apps import apps
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
    AssessmentComponent,
    AssessmentScore,
    AssessmentType,
    ComponentScore,
    ExamSession,
    ExamType,
    Grade,
    GradingSystem,
    JuniorSecondaryResult,
    JuniorSecondarySessionReport,
    JuniorSecondaryTermReport,
    NurseryResult,
    NurserySessionReport,
    NurseryTermReport,
    PrimaryResult,
    PrimarySessionReport,
    PrimaryTermReport,
    ResultComment,
    ResultSheet,
    ResultTemplate,
    ScoringConfiguration,
    SeniorSecondaryResult,
    SeniorSecondarySessionReport,
    SeniorSecondaryTermReport,
    StudentResult,
    StudentTermResult,
    # Permission helpers — single source of truth from models.py
    _is_admin,
    _user_role,
)
from .report_generation import get_report_generator
from .serializers import (
    AssessmentComponentCreateUpdateSerializer,
    AssessmentComponentSerializer,
    AssessmentScoreSerializer,
    AssessmentTypeCreateUpdateSerializer,
    AssessmentTypeSerializer,
    BulkApproveSerializer,
    BulkDeleteSerializer,
    BulkPublishSerializer,
    BulkRecordSerializer,
    BulkReportGenerationSerializer,
    ComponentScoreReadSerializer,
    DetailedStudentResultSerializer,
    ExamSessionCreateUpdateSerializer,
    ExamSessionSerializer,
    ExamTypeCreateUpdateSerializer,
    ExamTypeSerializer,
    GradeSerializer,
    GradingSystemCreateUpdateSerializer,
    GradingSystemSerializer,
    HeadTeacherRemarkUpdateSerializer,
    JuniorSecondaryResultCreateUpdateSerializer,
    JuniorSecondaryResultSerializer,
    JuniorSecondarySessionReportCreateUpdateSerializer,
    JuniorSecondarySessionReportSerializer,
    JuniorSecondaryTermReportCreateUpdateSerializer,
    JuniorSecondaryTermReportSerializer,
    NurseryResultCreateUpdateSerializer,
    NurseryResultSerializer,
    NurserySessionReportCreateUpdateSerializer,
    NurserySessionReportSerializer,
    NurseryTermReportCreateUpdateSerializer,
    NurseryTermReportSerializer,
    PrimaryResultCreateUpdateSerializer,
    PrimaryResultSerializer,
    PrimarySessionReportCreateUpdateSerializer,
    PrimarySessionReportSerializer,
    PrimaryTermReportCreateUpdateSerializer,
    PrimaryTermReportSerializer,
    ReportGenerationSerializer,
    ResultCommentCreateSerializer,
    ResultCommentSerializer,
    ResultComponentScoresSerializer,
    ResultExportSerializer,
    ResultImportSerializer,
    ResultSheetSerializer,
    ResultTemplateCreateUpdateSerializer,
    ResultTemplateSerializer,
    ScoringConfigurationCreateUpdateSerializer,
    ScoringConfigurationSerializer,
    SeniorSecondaryResultCreateUpdateSerializer,
    SeniorSecondaryResultSerializer,
    SeniorSecondarySessionReportCreateUpdateSerializer,
    SeniorSecondarySessionReportSerializer,
    SeniorSecondaryTermReportCreateUpdateSerializer,
    SeniorSecondaryTermReportSerializer,
    SingleApproveSerializer,
    StatusTransitionSerializer,
    StudentMinimalSerializer,
    StudentResultSerializer,
    StudentTermResultCreateUpdateSerializer,
    StudentTermResultDetailSerializer,
    StudentTermResultSerializer,
    SubjectPerformanceSerializer,
    TeacherRemarkUpdateSerializer,
)

logger = logging.getLogger(__name__)

# ── Status constants ──────────────────────────────────────────────────────────
DRAFT = "DRAFT"
APPROVED = "APPROVED"
PUBLISHED = "PUBLISHED"

SENIOR_SECONDARY = "SENIOR_SECONDARY"
JUNIOR_SECONDARY = "JUNIOR_SECONDARY"
PRIMARY = "PRIMARY"
NURSERY = "NURSERY"

# ── Model routing maps ────────────────────────────────────────────────────────
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
_SESSION_REPORT_MODEL_MAP = {
    SENIOR_SECONDARY: SeniorSecondarySessionReport,
    JUNIOR_SECONDARY: JuniorSecondarySessionReport,
    PRIMARY: PrimarySessionReport,
    NURSERY: NurserySessionReport,
}


class StandardResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ── Utility helpers ───────────────────────────────────────────────────────────


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
        next_session = (
            AcademicSession.objects.filter(
                start_date__gt=current_session.end_date, is_active=True
            )
            .order_by("start_date")
            .first()
        )
        if next_session:
            first_term = (
                Term.objects.filter(academic_session=next_session, is_active=True)
                .order_by("term_type__display_order")
                .first()
            )
            return first_term.next_term_begins if first_term else None
        return None
    except Exception as exc:
        logger.error("Error getting next term begins date: %s", exc)
        return None


def _validate_component_scores(scores_data, education_level):
    """
    Validate a list of {"component_id": int, "score": Decimal} dicts.
    Returns a list of error strings; empty list means valid.
    Nursery skips this — it uses mark_obtained directly.
    """
    if education_level == NURSERY or not scores_data:
        return []

    errors, seen_ids = [], set()
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


def _calculate_nursery_scores(instance):
    """Compute NurseryResult percentage + grade in-memory before bulk_create."""
    if instance.max_marks_obtainable and instance.max_marks_obtainable > 0:
        instance.percentage = (
            instance.mark_obtained / instance.max_marks_obtainable * 100
        )
    else:
        instance.percentage = Decimal(0)

    gs = getattr(instance, "grading_system", None)
    if gs:
        try:
            from .models import _default_grade

            grade = gs.get_grade(float(instance.percentage))
            instance.grade = (
                grade if grade else _default_grade(float(instance.percentage))
            )
            instance.is_passed = float(instance.percentage) >= float(gs.pass_mark or 40)
        except Exception as exc:
            logger.error("Error grading nursery instance: %s", exc)
            from .models import _default_grade

            instance.grade = _default_grade(float(instance.percentage))
            instance.is_passed = float(instance.percentage) >= 40


def _error_response(message, errors):
    return Response(
        {"error": message, "errors": errors},
        status=status.HTTP_400_BAD_REQUEST,
    )


# ── Result queryset helpers ───────────────────────────────────────────────────


def _component_score_qs():
    """Standard ComponentScore prefetch sub-queryset."""
    return ComponentScore.objects.select_related("component")


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
        "exam_session__exam_type",
        "exam_session__term",
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
        .prefetch_related(
            "grading_system__grades",
            Prefetch("component_scores", queryset=_component_score_qs()),
        )
    )


def _apply_role_filter(queryset, viewset, user):
    """Apply role-based visibility filter on a result queryset."""
    if user.is_superuser or user.is_staff:
        return queryset
    if _is_admin(user):
        return queryset
    role = _user_role(user)
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
    if role == "TEACHER":
        return viewset.get_teacher_queryset(user, queryset)
    if role == "STUDENT":
        try:
            student = Student.objects.get(user=user)
            return queryset.filter(student=student, status=PUBLISHED)
        except Student.DoesNotExist:
            return queryset.none()
    if role == "PARENT":
        try:
            Parent = apps.get_model("parent", "Parent")
            parent = Parent.objects.get(user=user)
            return queryset.filter(student__parents=parent, status=PUBLISHED)
        except Exception:
            return queryset.none()
    return queryset.none()


def _apply_report_role_filter(queryset, viewset, user):
    """Role filter for term/session reports (no subject restriction for teachers)."""
    if user.is_superuser or user.is_staff:
        return queryset
    if _is_admin(user):
        return queryset
    role = _user_role(user)
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
    if role == "TEACHER":
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
            return queryset.filter(student_id__in=student_ids)
        except Exception:
            return queryset.none()
    if role == "STUDENT":
        try:
            return queryset.filter(student=Student.objects.get(user=user))
        except Student.DoesNotExist:
            return queryset.none()
    if role == "PARENT":
        try:
            parent = apps.get_model("parent", "Parent").objects.get(user=user)
            return queryset.filter(student__parents=parent)
        except Exception:
            return queryset.none()
    return queryset.none()


# ── Grading System ────────────────────────────────────────────────────────────


class GradingSystemViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    queryset = GradingSystem.objects.all()
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
        gs.save(update_fields=["is_active", "updated_at"])
        return Response(GradingSystemSerializer(gs).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        gs = self.get_object()
        gs.is_active = False
        gs.save(update_fields=["is_active", "updated_at"])
        return Response(GradingSystemSerializer(gs).data)


class GradeViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["grading_system", "is_passing"]

    def get_queryset(self):
        return super().get_queryset().select_related("grading_system")


# ── Assessment Component ───────────────────────────────────────────────────────


class AssessmentComponentViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    queryset = AssessmentComponent.objects.all().order_by("display_order", "name")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        "education_level",
        "component_type",
        "is_active",
        "contributes_to_ca",
    ]
    search_fields = ["name", "code"]

    def get_queryset(self):
        return super().get_queryset().select_related("education_level")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return AssessmentComponentCreateUpdateSerializer
        return AssessmentComponentSerializer

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        param = request.query_params.get("education_level")
        if not param:
            return Response(
                {"error": "education_level parameter is required"}, status=400
            )
        try:
            qs = self.get_queryset().filter(education_level_id=int(param))
        except (ValueError, TypeError):
            qs = self.get_queryset().filter(education_level__level_type=param.upper())
        return Response(
            AssessmentComponentSerializer(qs.filter(is_active=True), many=True).data
        )


# ── Assessment Type ───────────────────────────────────────────────────────────


class AssessmentTypeViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    queryset = AssessmentType.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["education_level", "is_active"]
    search_fields = ["name", "code"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return AssessmentTypeCreateUpdateSerializer
        return AssessmentTypeSerializer

    def get_queryset(self):
        return super().get_queryset().select_related("education_level")


# ── Exam Type ─────────────────────────────────────────────────────────────────


class ExamTypeViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    queryset = ExamType.objects.all().order_by("display_order", "name")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "code"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ExamTypeCreateUpdateSerializer
        return ExamTypeSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        et = self.get_object()
        et.is_active = True
        et.save(update_fields=["is_active", "updated_at"])
        return Response(ExamTypeSerializer(et).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        et = self.get_object()
        et.is_active = False
        et.save(update_fields=["is_active", "updated_at"])
        return Response(ExamTypeSerializer(et).data)


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
            .select_related("academic_session", "term", "term__term_type", "exam_type")
        )
        if _user_role(self.request.user) == "STUDENT":
            qs = qs.filter(is_published=True)
        return qs.order_by("-created_at")

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        session = self.get_object()
        session.is_published = True
        session.save(update_fields=["is_published", "updated_at"])
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
        return Response(
            ScoringConfigurationSerializer(
                self.get_queryset().filter(is_default=True, is_active=True), many=True
            ).data
        )

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
                education_level=config.education_level,
                result_type=config.result_type,
            ).update(is_default=False)
            config.is_default = True
            config.save(update_fields=["is_default"])
        return Response(ScoringConfigurationSerializer(config).data)


# ── BaseResultViewSetMixin ────────────────────────────────────────────────────


class BaseResultViewSetMixin:
    """
    Shared helpers for all education-level result viewsets.
    Does NOT define get_queryset() — each viewset owns its own.
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
                l in (NURSERY, PRIMARY) for l in classroom_levels
            )
            # Use subqueries instead of list() to avoid loading large ID sets
            # into Python memory — the DB handles the join efficiently.
            student_qs = StudentEnrollment.objects.filter(
                classroom__in=assigned_classrooms, is_active=True
            ).values("student_id")
            if not student_qs.exists():
                return queryset.none()

            if is_classroom_teacher:
                return queryset.filter(student_id__in=student_qs)

            assigned_subject_qs = (
                ClassroomTeacherAssignment.objects.filter(teacher=teacher)
                .exclude(subject__isnull=True)
                .values("subject_id")
                .distinct()
            )
            if not assigned_subject_qs.exists():
                return queryset.none()
            return queryset.filter(
                subject_id__in=assigned_subject_qs, student_id__in=student_qs
            )
        except Teacher.DoesNotExist:
            return queryset.none()
        except Exception as exc:
            logger.error(
                "Error filtering for teacher %s: %s", user.username, exc, exc_info=True
            )
            return queryset.none()

    # ── Single-record create / update helpers ─────────────────────────────────

    def handle_create(
        self, request, education_level, serializer_class, result_serializer_class
    ):
        try:
            with transaction.atomic():
                student_id = request.data.get("student")
                if student_id:
                    student = Student.objects.select_related(
                        "student_class", "student_class__education_level"
                    ).get(id=student_id)
                    if student.education_level != education_level:
                        return Response(
                            {
                                "error": (
                                    f"Student education level is {student.education_level},"
                                    f" expected {education_level}."
                                )
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                serializer = serializer_class(
                    data=request.data, context={"request": request}
                )
                serializer.is_valid(raise_exception=True)
                result = serializer.save()
                return Response(
                    result_serializer_class(result, context={"request": request}).data,
                    status=status.HTTP_201_CREATED,
                )
        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as exc:
            logger.error("Failed to create result: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    def handle_update(
        self, request, instance, serializer_class, result_serializer_class, **kwargs
    ):
        try:
            with transaction.atomic():
                if not instance.can_edit(request.user):
                    return Response(
                        {"error": "You do not have permission to edit this result."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                serializer = serializer_class(
                    instance,
                    data=request.data,
                    partial=kwargs.get("partial", False),
                    context={"request": request},
                )
                serializer.is_valid(raise_exception=True)
                return Response(
                    result_serializer_class(
                        serializer.save(), context={"request": request}
                    ).data
                )
        except Exception as exc:
            logger.error("Failed to update result: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Approve / publish (delegates to model bulk methods, one SQL UPDATE) ───

    def handle_approve(self, request, result, read_serializer_class):
        """
        Single-record approve.  Uses ModelClass.bulk_approve() so the same
        SQL UPDATE path is used for both single and bulk operations.
        Requires _is_admin(user) — consistent with model _ADMIN_ROLES.
        """
        if not _is_admin(request.user):
            return Response(
                {"error": "You do not have permission to approve results."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if result.status == PUBLISHED:
            return Response({"error": "Cannot approve a published result."}, status=400)
        if result.status != DRAFT:
            return Response(
                {"error": f"Cannot approve result with status '{result.status}'."},
                status=400,
            )
        ModelClass = type(result)
        ModelClass.bulk_approve(ModelClass.objects.filter(pk=result.pk), request.user)
        result.refresh_from_db()
        return Response(
            read_serializer_class(result, context={"request": request}).data
        )

    def handle_publish(self, request, result, read_serializer_class):
        """
        Single-record publish.  Uses ModelClass.bulk_publish() — one UPDATE.
        """
        if not _is_admin(request.user):
            return Response(
                {"error": "You do not have permission to publish results."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if result.status == PUBLISHED:
            return Response({"error": "Result is already published."}, status=400)
        if result.status != APPROVED:
            return Response(
                {
                    "error": f"Only APPROVED results can be published (current: {result.status})."
                },
                status=400,
            )
        ModelClass = type(result)
        ModelClass.bulk_publish(ModelClass.objects.filter(pk=result.pk), request.user)
        result.refresh_from_db()
        return Response(
            read_serializer_class(result, context={"request": request}).data
        )

    # ── component-scores action ───────────────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="component-scores")
    def component_scores(self, request, pk=None):
        """
        POST {component_id, score} pairs for this result.
        Upserts ComponentScore rows and re-triggers calculate_scores().
        """
        result = self.get_object()
        if not result.can_edit(request.user):
            return Response(
                {"error": "You do not have permission to edit scores for this result."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ResultComponentScoresSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = serializer.save(result_instance=result)
            return Response(
                self.get_serializer_class()(updated, context={"request": request}).data
            )
        except Exception as exc:
            logger.error("Failed to save component scores: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=400)

    # ── destroy — delegates to model can_delete ───────────────────────────────

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not instance.can_delete(request.user):
            return Response(
                {"error": "You do not have permission to delete this result."},
                status=status.HTTP_403_FORBIDDEN,
            )
        with transaction.atomic():
            subject_name = getattr(getattr(instance, "subject", None), "name", "N/A")
            student_name = getattr(instance.student, "full_name", "Unknown")
            instance.delete()
        return Response(
            {
                "message": f"Result for {student_name} in {subject_name} deleted successfully."
            },
            status=status.HTTP_204_NO_CONTENT,
        )

    # ── bulk_create ───────────────────────────────────────────────────────────

    def _get_education_level(self, ModelClass):
        return {v: k for k, v in _RESULT_MODEL_MAP.items()}.get(ModelClass, "UNKNOWN")

    def _get_term_report_model(self, ModelClass):
        return _TERM_REPORT_MODEL_MAP.get(self._get_education_level(ModelClass))

    def _get_exam_session(self, exam_session_id):
        if not hasattr(self, "_exam_session_cache"):
            self._exam_session_cache = {}
        if exam_session_id not in self._exam_session_cache:
            self._exam_session_cache[exam_session_id] = ExamSession.objects.get(
                id=exam_session_id
            )
        return self._exam_session_cache[exam_session_id]

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

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """
        Two-phase bulk result creation.

        Phase 1: validate all rows — fail fast, nothing written.
        Phase 2: bulk_create result rows, then call ModelClass.bulk_record()
                 for ComponentScore creation + score recalculation in two SQL
                 statements (one aggregate, one bulk_update).
        Positions recalculated with SQL RANK() via bulk_recalculate_positions().
        """
        _serializer_map = {
            SENIOR_SECONDARY: SeniorSecondaryResultCreateUpdateSerializer,
            JUNIOR_SECONDARY: JuniorSecondaryResultCreateUpdateSerializer,
            PRIMARY: PrimaryResultCreateUpdateSerializer,
            NURSERY: NurseryResultCreateUpdateSerializer,
        }

        results_data = request.data.get("results", [])
        ModelClass = self.get_queryset().model
        education_level = self._get_education_level(ModelClass)
        is_nursery = ModelClass == NurseryResult
        CreateUpdateSerializer = _serializer_map.get(
            education_level, self.get_serializer_class()
        )

        existing_keys = set(
            ModelClass.objects.values_list(
                "student_id", "subject_id", "exam_session_id"
            )
        )

        errors = []
        validated_instances = []
        seen_keys = set()

        for i, raw in enumerate(results_data):
            item = dict(raw) if not isinstance(raw, dict) else raw.copy()
            scores_data = item.pop("scores", [])

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

            score_errors = _validate_component_scores(scores_data, education_level)
            if score_errors:
                errors.append({"index": i, "errors": score_errors})
                continue

            instance = ModelClass(**data)
            if is_nursery:
                _calculate_nursery_scores(instance)
            validated_instances.append((instance, scores_data))

        if errors:
            return _error_response("Validation failed. No results were saved.", errors)

        try:
            with transaction.atomic():
                raw_instances = [inst for inst, _ in validated_instances]
                created_results = ModelClass.objects.bulk_create(
                    raw_instances, batch_size=500
                )

                if not is_nursery and any(scores for _, scores in validated_instances):
                    # Build entries list for bulk_record: map each created result to its scores.
                    # created_results[i] corresponds to validated_instances[i].
                    entries = []
                    for result, scores in zip(created_results, validated_instances):
                        _, scores_data = scores
                        for s in scores_data:
                            entries.append(
                                {
                                    "result_id": result.pk,
                                    "component_id": s["component_id"],
                                    "score": s["score"],
                                }
                            )
                    if entries:
                        ModelClass.bulk_record(entries, request.user)
                elif not is_nursery:
                    # No scores submitted; still recalculate to set zeros correctly.
                    ModelClass._bulk_recalculate_scores(
                        ModelClass.objects.filter(
                            pk__in=[r.pk for r in created_results]
                        )
                    )

                self._ensure_term_reports_exist(
                    created_results, ModelClass, education_level
                )

                # Recalculate positions with SQL RANK() — no Python sort.
                class_groups = set()
                for obj in created_results:
                    sc = obj.student.student_class
                    el = obj.student.education_level
                    class_groups.add((obj.exam_session_id, sc, el))

                for esid, sc, el in class_groups:
                    qs = ModelClass.objects.filter(
                        exam_session_id=esid,
                        student__student_class=sc,
                        student__education_level=el,
                        status__in=(APPROVED, PUBLISHED),
                    )
                    ModelClass.bulk_recalculate_positions(qs)

                TermReportModel = self._get_term_report_model(ModelClass)
                if TermReportModel:
                    for esid, sc, el in class_groups:
                        TermReportModel.bulk_recalculate_positions(
                            exam_session=self._get_exam_session(esid),
                            student_class=sc,
                            education_level=el,
                        )

            return Response(
                {
                    "message": f"Successfully created {len(created_results)} results",
                    "results": self.get_serializer(
                        created_results, many=True, context={"request": request}
                    ).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as exc:
            logger.error("Bulk create failed: %s", exc, exc_info=True)
            return Response(
                {
                    "error": "Bulk upload failed. No results were saved.",
                    "details": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    # ── Bulk approve / publish / delete (new model methods) ───────────────────

    @action(detail=False, methods=["post"], url_path="bulk-approve")
    def bulk_approve(self, request):
        """
        Approve a list of results in one SQL UPDATE.
        Admin roles only. Only DRAFT rows are advanced.
        """
        ser = BulkApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result_ids = ser.validated_data["result_ids"]
        ModelClass = self.get_queryset().model
        try:
            count = ModelClass.bulk_approve(
                ModelClass.objects.filter(pk__in=result_ids), request.user
            )
            return Response(
                {"approved_count": count, "result_ids": [str(i) for i in result_ids]}
            )
        except PermissionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            logger.error("bulk_approve failed: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=400)

    @action(detail=False, methods=["post"], url_path="bulk-publish")
    def bulk_publish_action(self, request):
        """
        Publish a list of APPROVED results in one SQL UPDATE.
        Admin roles only.
        """
        ser = BulkPublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result_ids = ser.validated_data["result_ids"]
        ModelClass = self.get_queryset().model
        try:
            count = ModelClass.bulk_publish(
                ModelClass.objects.filter(pk__in=result_ids), request.user
            )
            return Response(
                {"published_count": count, "result_ids": [str(i) for i in result_ids]}
            )
        except PermissionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            logger.error("bulk_publish_action failed: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=400)

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete_action(self, request):
        """
        Delete results the user is permitted to delete.
        Admin → any status. Teachers → DRAFT only.
        """
        ser = BulkDeleteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result_ids = ser.validated_data["result_ids"]
        ModelClass = self.get_queryset().model
        try:
            deleted_count, _ = ModelClass.bulk_delete(
                ModelClass.objects.filter(pk__in=result_ids), request.user
            )
            return Response({"deleted_count": deleted_count})
        except Exception as exc:
            logger.error("bulk_delete_action failed: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=400)

    # ── Statistics ─────────────────────────────────────────────────────────────

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

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

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

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return SeniorSecondaryTermReportCreateUpdateSerializer
        return SeniorSecondaryTermReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

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
                "exam_session__exam_type",
                "exam_session__term",
                "published_by",
                "approved_by",
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
                    ).prefetch_related(
                        "grading_system__grades",
                        Prefetch("component_scores", queryset=_component_score_qs()),
                    ),
                )
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Approve this report + all its DRAFT subject results.
        Uses BaseTermReport.bulk_approve() — one UPDATE for the report,
        one for the subject results.
        """
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status != DRAFT:
            return Response(
                {"error": f"Cannot approve from status '{report.status}'."}, status=400
            )
        with transaction.atomic():
            SeniorSecondaryTermReport.bulk_approve(
                SeniorSecondaryTermReport.objects.filter(pk=report.pk), request.user
            )
            results_updated = SeniorSecondaryResult.bulk_approve(
                report.subject_results.filter(status=DRAFT), request.user
            )
        report.refresh_from_db()
        return Response(
            {
                "message": f"Approved. {results_updated} subject result(s) also approved.",
                "data": SeniorSecondaryTermReportSerializer(
                    report, context={"request": request}
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."}, status=400
            )
        with transaction.atomic():
            SeniorSecondaryTermReport.bulk_publish(
                SeniorSecondaryTermReport.objects.filter(pk=report.pk), request.user
            )
            SeniorSecondaryResult.bulk_publish(
                report.subject_results.all(), request.user
            )
        report.refresh_from_db()
        return Response(
            SeniorSecondaryTermReportSerializer(
                report, context={"request": request}
            ).data
        )

    @action(detail=False, methods=["post"], url_path="bulk-approve")
    def bulk_approve_reports(self, request):
        """Approve all DRAFT term reports in a class in one SQL UPDATE."""
        ser = BulkApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        report_ids = ser.validated_data["result_ids"]
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        with transaction.atomic():
            qs = SeniorSecondaryTermReport.objects.filter(pk__in=report_ids)
            count = SeniorSecondaryTermReport.bulk_approve(qs, request.user)
            # Cascade approve all DRAFT subject results for these reports.
            result_count = SeniorSecondaryResult.bulk_approve(
                SeniorSecondaryResult.objects.filter(
                    term_report__in=report_ids, status=DRAFT
                ),
                request.user,
            )
        return Response(
            {"approved_reports": count, "approved_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="bulk-publish")
    def bulk_publish_reports(self, request):
        """Publish all APPROVED term reports in one SQL UPDATE."""
        ser = BulkPublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        report_ids = ser.validated_data["result_ids"]
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        with transaction.atomic():
            qs = SeniorSecondaryTermReport.objects.filter(pk__in=report_ids)
            count = SeniorSecondaryTermReport.bulk_publish(qs, request.user)
            result_count = SeniorSecondaryResult.bulk_publish(
                SeniorSecondaryResult.objects.filter(term_report__in=report_ids),
                request.user,
            )
        return Response(
            {"published_reports": count, "published_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="recalculate-positions")
    def recalculate_positions(self, request):
        """Re-rank all APPROVED/PUBLISHED reports for an exam session using SQL RANK()."""
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        exam_session_id = request.data.get("exam_session")
        if not exam_session_id:
            return Response({"error": "exam_session is required."}, status=400)
        try:
            exam_session = ExamSession.objects.get(
                pk=exam_session_id, tenant=request.tenant
            )
        except ExamSession.DoesNotExist:
            return Response({"error": "Exam session not found."}, status=404)
        combos = (
            SeniorSecondaryTermReport.objects.filter(
                tenant=request.tenant, exam_session=exam_session
            )
            .values("student__student_class", "student__education_level")
            .distinct()
        )
        count = 0
        with transaction.atomic():
            for combo in combos:
                sc = combo["student__student_class"]
                el = combo["student__education_level"]
                if sc and el:
                    SeniorSecondaryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session,
                        student_class=sc,
                        education_level=el,
                    )
                    count += 1
        return Response({"recalculated_groups": count, "exam_session": str(exam_session_id)})


# ── Senior Secondary Session Report ──────────────────────────────────────────


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
        if self.action in ("create", "update", "partial_update"):
            return SeniorSecondarySessionReportCreateUpdateSerializer
        return SeniorSecondarySessionReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = (
            SeniorSecondarySessionReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "academic_session",
                "stream",
                "stream__stream_type_new",
                "published_by",
                "approved_by",
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def compute(self, request, pk=None):
        """Re-compute session totals from approved term reports."""
        report = self.get_object()
        try:
            report.compute_from_term_reports()
            return Response(
                SeniorSecondarySessionReportSerializer(
                    report, context={"request": request}
                ).data
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status != DRAFT:
            return Response(
                {"error": f"Cannot approve from status '{report.status}'."}, status=400
            )
        SeniorSecondarySessionReport.bulk_approve(
            SeniorSecondarySessionReport.objects.filter(pk=report.pk), request.user
        )
        report.refresh_from_db()
        return Response(
            SeniorSecondarySessionReportSerializer(
                report, context={"request": request}
            ).data
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """Delegates to model publish() — targeted update_fields save."""
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."}, status=400
            )
        report.publish(request.user)
        return Response(
            SeniorSecondarySessionReportSerializer(
                report, context={"request": request}
            ).data
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

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

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
        instance = JuniorSecondaryResult.objects.select_related(
            "student__student_class__education_level"
        ).get(pk=self.get_object().pk)
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

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self.handle_approve(
            request, self.get_object(), JuniorSecondaryResultSerializer
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self.handle_publish(
            request, self.get_object(), JuniorSecondaryResultSerializer
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
        if self.action in ("create", "update", "partial_update"):
            return JuniorSecondaryTermReportCreateUpdateSerializer
        return JuniorSecondaryTermReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = (
            JuniorSecondaryTermReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "exam_session",
                "exam_session__academic_session",
                "exam_session__exam_type",
                "exam_session__term",
                "published_by",
                "approved_by",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=JuniorSecondaryResult.objects.select_related(
                        "subject",
                        "grading_system",
                        "entered_by",
                        "approved_by",
                    ).prefetch_related(
                        "grading_system__grades",
                        Prefetch("component_scores", queryset=_component_score_qs()),
                    ),
                )
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status != DRAFT:
            return Response(
                {"error": f"Cannot approve from status '{report.status}'."}, status=400
            )
        with transaction.atomic():
            JuniorSecondaryTermReport.bulk_approve(
                JuniorSecondaryTermReport.objects.filter(pk=report.pk), request.user
            )
            results_updated = JuniorSecondaryResult.bulk_approve(
                report.subject_results.filter(status=DRAFT), request.user
            )
        report.refresh_from_db()
        return Response(
            {
                "message": f"Approved. {results_updated} subject result(s) also approved.",
                "data": JuniorSecondaryTermReportSerializer(
                    report, context={"request": request}
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."}, status=400
            )
        with transaction.atomic():
            JuniorSecondaryTermReport.bulk_publish(
                JuniorSecondaryTermReport.objects.filter(pk=report.pk), request.user
            )
            JuniorSecondaryResult.bulk_publish(
                report.subject_results.all(), request.user
            )
        report.refresh_from_db()
        return Response(
            JuniorSecondaryTermReportSerializer(
                report, context={"request": request}
            ).data
        )

    @action(detail=False, methods=["post"], url_path="bulk-approve")
    def bulk_approve_reports(self, request):
        ser = BulkApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        with transaction.atomic():
            qs = JuniorSecondaryTermReport.objects.filter(
                pk__in=ser.validated_data["result_ids"]
            )
            count = JuniorSecondaryTermReport.bulk_approve(qs, request.user)
            result_count = JuniorSecondaryResult.bulk_approve(
                JuniorSecondaryResult.objects.filter(
                    term_report__in=ser.validated_data["result_ids"], status=DRAFT
                ),
                request.user,
            )
        return Response(
            {"approved_reports": count, "approved_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="bulk-publish")
    def bulk_publish_reports(self, request):
        ser = BulkPublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        with transaction.atomic():
            qs = JuniorSecondaryTermReport.objects.filter(
                pk__in=ser.validated_data["result_ids"]
            )
            count = JuniorSecondaryTermReport.bulk_publish(qs, request.user)
            result_count = JuniorSecondaryResult.bulk_publish(
                JuniorSecondaryResult.objects.filter(
                    term_report__in=ser.validated_data["result_ids"]
                ),
                request.user,
            )
        return Response(
            {"published_reports": count, "published_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="recalculate-positions")
    def recalculate_positions(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        exam_session_id = request.data.get("exam_session")
        if not exam_session_id:
            return Response({"error": "exam_session is required."}, status=400)
        try:
            exam_session = ExamSession.objects.get(pk=exam_session_id, tenant=request.tenant)
        except ExamSession.DoesNotExist:
            return Response({"error": "Exam session not found."}, status=404)
        combos = (
            JuniorSecondaryTermReport.objects.filter(tenant=request.tenant, exam_session=exam_session)
            .values("student__student_class", "student__education_level")
            .distinct()
        )
        count = 0
        with transaction.atomic():
            for combo in combos:
                sc, el = combo["student__student_class"], combo["student__education_level"]
                if sc and el:
                    JuniorSecondaryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session, student_class=sc, education_level=el
                    )
                    count += 1
        return Response({"recalculated_groups": count, "exam_session": str(exam_session_id)})


# ── Junior Secondary Session Report ──────────────────────────────────────────


class JuniorSecondarySessionReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = JuniorSecondarySessionReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "academic_session", "status", "is_published"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return JuniorSecondarySessionReportCreateUpdateSerializer
        return JuniorSecondarySessionReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = (
            JuniorSecondarySessionReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "academic_session",
                "published_by",
                "approved_by",
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def compute(self, request, pk=None):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        report = self.get_object()
        try:
            report.compute_from_term_reports()
            return Response(
                JuniorSecondarySessionReportSerializer(
                    report, context={"request": request}
                ).data
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."}, status=400
            )
        report.publish(request.user)
        return Response(
            JuniorSecondarySessionReportSerializer(
                report, context={"request": request}
            ).data
        )


# ── Primary Result ────────────────────────────────────────────────────────────


class PrimaryResultViewSet(
    BaseResultViewSetMixin,
    TeacherPortalCheckMixin,
    SectionFilterMixin,
    viewsets.ModelViewSet,
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

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        user = self.request.user
        qs = _result_qs_base(PrimaryResult).order_by("-created_at")
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
        instance = PrimaryResult.objects.select_related(
            "student__student_class__education_level"
        ).get(pk=self.get_object().pk)
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

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self.handle_approve(request, self.get_object(), PrimaryResultSerializer)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self.handle_publish(request, self.get_object(), PrimaryResultSerializer)


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
        if self.action in ("create", "update", "partial_update"):
            return PrimaryTermReportCreateUpdateSerializer
        return PrimaryTermReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = (
            PrimaryTermReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "exam_session",
                "exam_session__academic_session",
                "exam_session__exam_type",
                "exam_session__term",
                "published_by",
                "approved_by",
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
                    ).prefetch_related(
                        "grading_system__grades",
                        Prefetch("component_scores", queryset=_component_score_qs()),
                    ),
                )
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status != DRAFT:
            return Response(
                {"error": f"Cannot approve from status '{report.status}'."}, status=400
            )
        with transaction.atomic():
            PrimaryTermReport.bulk_approve(
                PrimaryTermReport.objects.filter(pk=report.pk), request.user
            )
            results_updated = PrimaryResult.bulk_approve(
                report.subject_results.filter(status=DRAFT), request.user
            )
        report.refresh_from_db()
        return Response(
            {
                "message": f"Approved. {results_updated} subject result(s) also approved.",
                "data": PrimaryTermReportSerializer(
                    report, context={"request": request}
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."}, status=400
            )
        with transaction.atomic():
            PrimaryTermReport.bulk_publish(
                PrimaryTermReport.objects.filter(pk=report.pk), request.user
            )
            PrimaryResult.bulk_publish(report.subject_results.all(), request.user)
        report.refresh_from_db()
        return Response(
            PrimaryTermReportSerializer(report, context={"request": request}).data
        )

    @action(detail=False, methods=["post"], url_path="bulk-approve")
    def bulk_approve_reports(self, request):
        ser = BulkApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        with transaction.atomic():
            qs = PrimaryTermReport.objects.filter(
                pk__in=ser.validated_data["result_ids"]
            )
            count = PrimaryTermReport.bulk_approve(qs, request.user)
            result_count = PrimaryResult.bulk_approve(
                PrimaryResult.objects.filter(
                    term_report__in=ser.validated_data["result_ids"], status=DRAFT
                ),
                request.user,
            )
        return Response(
            {"approved_reports": count, "approved_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="bulk-publish")
    def bulk_publish_reports(self, request):
        ser = BulkPublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        with transaction.atomic():
            qs = PrimaryTermReport.objects.filter(
                pk__in=ser.validated_data["result_ids"]
            )
            count = PrimaryTermReport.bulk_publish(qs, request.user)
            result_count = PrimaryResult.bulk_publish(
                PrimaryResult.objects.filter(
                    term_report__in=ser.validated_data["result_ids"]
                ),
                request.user,
            )
        return Response(
            {"published_reports": count, "published_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="recalculate-positions")
    def recalculate_positions(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        exam_session_id = request.data.get("exam_session")
        if not exam_session_id:
            return Response({"error": "exam_session is required."}, status=400)
        try:
            exam_session = ExamSession.objects.get(pk=exam_session_id, tenant=request.tenant)
        except ExamSession.DoesNotExist:
            return Response({"error": "Exam session not found."}, status=404)
        combos = (
            PrimaryTermReport.objects.filter(tenant=request.tenant, exam_session=exam_session)
            .values("student__student_class", "student__education_level")
            .distinct()
        )
        count = 0
        with transaction.atomic():
            for combo in combos:
                sc, el = combo["student__student_class"], combo["student__education_level"]
                if sc and el:
                    PrimaryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session, student_class=sc, education_level=el
                    )
                    count += 1
        return Response({"recalculated_groups": count, "exam_session": str(exam_session_id)})


# ── Primary Session Report ────────────────────────────────────────────────────


class PrimarySessionReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = PrimarySessionReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "academic_session", "status", "is_published"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return PrimarySessionReportCreateUpdateSerializer
        return PrimarySessionReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = (
            PrimarySessionReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "academic_session",
                "published_by",
                "approved_by",
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def compute(self, request, pk=None):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        report = self.get_object()
        try:
            report.compute_from_term_reports()
            return Response(
                PrimarySessionReportSerializer(
                    report, context={"request": request}
                ).data
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."}, status=400
            )
        report.publish(request.user)
        return Response(
            PrimarySessionReportSerializer(report, context={"request": request}).data
        )


# ── Nursery Result ────────────────────────────────────────────────────────────


class NurseryResultViewSet(
    BaseResultViewSetMixin,
    TeacherPortalCheckMixin,
    SectionFilterMixin,
    viewsets.ModelViewSet,
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

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = _result_qs_base(NurseryResult, extra_selects=("term_report",)).order_by(
            "-created_at"
        )
        return _apply_role_filter(qs, self, self.request.user)

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                student_id = request.data.get("student")
                if not student_id:
                    return Response({"error": "student is required"}, status=400)
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
                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()
                return Response(
                    NurseryResultSerializer(result, context={"request": request}).data,
                    status=201,
                )
        except Exception as exc:
            logger.error("Failed to create nursery result: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=400)

    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                instance = NurseryResult.objects.select_related(
                    "student__student_class__education_level"
                ).get(pk=self.get_object().pk)
                if not instance.can_edit(request.user):
                    return Response(
                        {"error": "You do not have permission to edit this result."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
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
                return Response(
                    NurseryResultSerializer(
                        serializer.save(), context={"request": request}
                    ).data
                )
        except Exception as exc:
            logger.error("Failed to update nursery result: %s", exc)
            return Response({"error": str(exc)}, status=400)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        result = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if result.status != DRAFT:
            return Response(
                {"error": f"Cannot approve result with status '{result.status}'."},
                status=400,
            )
        NurseryResult.bulk_approve(
            NurseryResult.objects.filter(pk=result.pk), request.user
        )
        result.refresh_from_db()
        return Response(
            NurseryResultSerializer(result, context={"request": request}).data
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self.handle_publish(request, self.get_object(), NurseryResultSerializer)

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        q = Q(status__in=[APPROVED, PUBLISHED])
        if es := request.query_params.get("exam_session"):
            q &= Q(exam_session=es)
        if sc := request.query_params.get("student_class"):
            q &= Q(student__student_class__name=sc)
        if subj := request.query_params.get("subject"):
            q &= Q(subject=subj)
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
        if self.action in ("create", "update", "partial_update"):
            return NurseryTermReportCreateUpdateSerializer
        return NurseryTermReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = (
            NurseryTermReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "exam_session",
                "exam_session__academic_session",
                "exam_session__exam_type",
                "exam_session__term",
                "published_by",
                "approved_by",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=NurseryResult.objects.select_related(
                        "subject",
                        "grading_system",
                        "entered_by",
                        "approved_by",
                        "published_by",
                        "term_report",
                    ).prefetch_related(
                        "grading_system__grades",
                        # NurseryResult now inherits BaseResult — component_scores exists.
                        Prefetch("component_scores", queryset=_component_score_qs()),
                    ),
                )
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status != DRAFT:
            return Response(
                {"error": f"Cannot approve from status '{report.status}'."},
                status=400,
            )
        with transaction.atomic():
            NurseryTermReport.bulk_approve(
                NurseryTermReport.objects.filter(pk=report.pk), request.user
            )
            results_updated = NurseryResult.bulk_approve(
                report.subject_results.filter(status=DRAFT), request.user
            )
        report.refresh_from_db()
        return Response(
            {
                "message": f"Approved. {results_updated} subject result(s) also approved.",
                "data": self.get_serializer(report, context={"request": request}).data,
            }
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."},
                status=400,
            )
        with transaction.atomic():
            NurseryTermReport.bulk_publish(
                NurseryTermReport.objects.filter(pk=report.pk), request.user
            )
            # One UPDATE for all child results — no per-report loop.
            NurseryResult.objects.filter(term_report=report).update(
                status=PUBLISHED,
                published_by=request.user,
                published_date=timezone.now(),
            )
        report.refresh_from_db()
        return Response(
            {
                "message": "Published.",
                "data": self.get_serializer(report, context={"request": request}).data,
            }
        )

    @action(detail=True, methods=["post"])
    def calculate_metrics(self, request, pk=None):
        try:
            report = self.get_object()
            report.calculate_metrics()
            report.calculate_class_position()
            return Response(
                self.get_serializer(report, context={"request": request}).data
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=False, methods=["post"], url_path="bulk-approve")
    def bulk_approve_reports(self, request):
        """Admin one-click: approve all DRAFT nursery term reports for a batch."""
        ser = BulkApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        report_ids = ser.validated_data["result_ids"]
        with transaction.atomic():
            qs = NurseryTermReport.objects.filter(pk__in=report_ids)
            count = NurseryTermReport.bulk_approve(qs, request.user)
            # One UPDATE for all child results — no per-report loop.
            result_count = NurseryResult.objects.filter(
                term_report__in=report_ids, status=DRAFT
            ).update(
                status=APPROVED,
                approved_by=request.user,
                approved_date=timezone.now(),
            )
        return Response(
            {"approved_reports": count, "approved_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="bulk-publish")
    def bulk_publish_reports(self, request):
        """Admin one-click: publish all APPROVED nursery term reports for a batch."""
        ser = BulkPublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        report_ids = ser.validated_data["result_ids"]
        with transaction.atomic():
            qs = NurseryTermReport.objects.filter(pk__in=report_ids)
            count = NurseryTermReport.bulk_publish(qs, request.user)
            # One UPDATE for all child results — no N+1 loop.
            result_count = NurseryResult.objects.filter(
                term_report__in=report_ids
            ).update(
                status=PUBLISHED,
                published_by=request.user,
                published_date=timezone.now(),
            )
        return Response(
            {"published_reports": count, "published_subject_results": result_count}
        )

    @action(detail=False, methods=["post"], url_path="recalculate-positions")
    def recalculate_positions(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        exam_session_id = request.data.get("exam_session")
        if not exam_session_id:
            return Response({"error": "exam_session is required."}, status=400)
        try:
            exam_session = ExamSession.objects.get(pk=exam_session_id, tenant=request.tenant)
        except ExamSession.DoesNotExist:
            return Response({"error": "Exam session not found."}, status=404)
        combos = (
            NurseryTermReport.objects.filter(tenant=request.tenant, exam_session=exam_session)
            .values("student__student_class", "student__education_level")
            .distinct()
        )
        count = 0
        with transaction.atomic():
            for combo in combos:
                sc, el = combo["student__student_class"], combo["student__education_level"]
                if sc and el:
                    NurseryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session, student_class=sc, education_level=el
                    )
                    count += 1
        return Response({"recalculated_groups": count, "exam_session": str(exam_session_id)})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not _is_admin(request.user):
            return Response(
                {"error": "Only administrators can delete term reports."},
                status=status.HTTP_403_FORBIDDEN,
            )
        with transaction.atomic():
            subject_count = instance.subject_results.count()
            instance.subject_results.all().delete()
            instance.delete()
        return Response(
            {"message": f"Deleted report and {subject_count} subject result(s)."},
            status=status.HTTP_204_NO_CONTENT,
        )


# ── Nursery Session Report ────────────────────────────────────────────────────


class NurserySessionReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = NurserySessionReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "academic_session", "status", "is_published"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return NurserySessionReportCreateUpdateSerializer
        return NurserySessionReportSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["skip_permission_flags"] = True
        return ctx

    def get_queryset(self):
        qs = (
            NurserySessionReport.objects.all()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "academic_session",
                "published_by",
                "approved_by",
            )
            .order_by("-created_at")
        )
        return _apply_report_role_filter(qs, self, self.request.user)

    @action(detail=True, methods=["post"])
    def compute(self, request, pk=None):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        report = self.get_object()
        try:
            report.compute_from_term_reports()
            return Response(
                NurserySessionReportSerializer(
                    report, context={"request": request}
                ).data
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        report = self.get_object()
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        if report.status not in (DRAFT, APPROVED):
            return Response(
                {"error": f"Cannot publish from status '{report.status}'."},
                status=400,
            )
        report.publish(request.user)
        return Response(
            NurserySessionReportSerializer(report, context={"request": request}).data
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
            qs = qs.filter(
                student__student_class__education_level__level_type__in=education_levels
            )
        return qs

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                return Response(
                    DetailedStudentResultSerializer(serializer.save()).data, status=201
                )
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                partial = kwargs.pop("partial", False)
                serializer = self.get_serializer(
                    self.get_object(), data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                return Response(DetailedStudentResultSerializer(serializer.save()).data)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

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
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        result = self.get_object()
        if result.status != DRAFT:
            return Response(
                {"error": f"Cannot approve from status '{result.status}'."}, status=400
            )
        try:
            with transaction.atomic():
                result.status = APPROVED
                result.approved_by = request.user
                result.approved_date = timezone.now()
                result.save(
                    update_fields=[
                        "status",
                        "approved_by",
                        "approved_date",
                        "updated_at",
                    ]
                )
            return Response(DetailedStudentResultSerializer(result).data)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        try:
            with transaction.atomic():
                result = self.get_object()
                result.status = PUBLISHED
                result.save(update_fields=["status", "updated_at"])
            return Response(DetailedStudentResultSerializer(result).data)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)


class StudentTermResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = StudentTermResult.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = StudentTermResultFilter
    search_fields = ["student__full_name"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return StudentTermResultCreateUpdateSerializer
        return StudentTermResultSerializer

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
        if _user_role(user) == "STUDENT":
            return qs.filter(student__user=user)
        section_access = self.get_user_section_access()
        if not section_access:
            return qs.none()
        education_levels = self.get_education_levels_for_sections(section_access)
        if not education_levels:
            return qs.none()
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
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        try:
            with transaction.atomic():
                term_result = self.get_object()
                if term_result.status != DRAFT:
                    return Response(
                        {
                            "error": f"Cannot approve from status '{term_result.status}'."
                        },
                        status=400,
                    )
                term_result.status = APPROVED
                term_result.save(update_fields=["status", "updated_at"])
            return Response(StudentTermResultSerializer(term_result).data)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        try:
            with transaction.atomic():
                term_result = self.get_object()
                if term_result.status not in (DRAFT, APPROVED):
                    return Response(
                        {
                            "error": f"Cannot publish from status '{term_result.status}'."
                        },
                        status=400,
                    )
                term_result.status = PUBLISHED
                term_result.save(update_fields=["status", "updated_at"])
            return Response(StudentTermResultSerializer(term_result).data)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)


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
                "exam_session__exam_type",
                "exam_session__term",
                "prepared_by",
                "approved_by",
                "student_class",
                "student_class__education_level",
            )
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        try:
            with transaction.atomic():
                sheet = self.get_object()
                sheet.status = APPROVED
                sheet.approved_by = request.user
                sheet.approved_date = timezone.now()
                sheet.save(
                    update_fields=[
                        "status",
                        "approved_by",
                        "approved_date",
                        "updated_at",
                    ]
                )
            return Response(ResultSheetSerializer(sheet).data)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

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
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)


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
        t.save(update_fields=["is_active", "updated_at"])
        return Response(ResultTemplateSerializer(t).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        t = self.get_object()
        t.is_active = False
        t.save(update_fields=["is_active", "updated_at"])
        return Response(ResultTemplateSerializer(t).data)


# ── Bulk Operations ───────────────────────────────────────────────────────────


class BulkResultOperationsViewSet(TenantFilterMixin, viewsets.ViewSet):
    """
    Cross-education-level bulk operations.
    For education-level-specific bulk actions (approve/publish/delete),
    use the per-level viewset bulk-approve / bulk-publish endpoints.
    This viewset handles cross-cutting concerns: publish with notifications,
    analytics summary, etc.
    """

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"])
    def bulk_approve(self, request):
        """
        Approve results across any education level.
        Requires education_level param to route to the correct model.
        """
        ser = BulkApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)
        level = request.data.get("education_level", "").upper()
        model = _RESULT_MODEL_MAP.get(level)
        if not model:
            return Response({"error": "Valid education_level is required."}, status=400)
        try:
            count = model.bulk_approve(
                model.objects.filter(pk__in=ser.validated_data["result_ids"]),
                request.user,
            )
            return Response({"approved_count": count})
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

    @action(detail=False, methods=["post"])
    def bulk_publish_results(self, request):
        """
        Publish results across any education level with optional notifications.
        """
        ser = BulkPublishSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not _is_admin(request.user):
            return Response({"error": "Permission denied."}, status=403)

        result_ids = ser.validated_data["result_ids"]
        send_notifications = ser.validated_data.get("send_notifications", False)
        level = request.data.get("education_level", "").upper()
        model = _RESULT_MODEL_MAP.get(level)
        if not model:
            return Response({"error": "Valid education_level is required."}, status=400)

        try:
            with transaction.atomic():
                student_ids = set()
                if send_notifications:
                    student_ids.update(
                        model.objects.filter(pk__in=result_ids).values_list(
                            "student_id", flat=True
                        )
                    )
                total_published = model.bulk_publish(
                    model.objects.filter(pk__in=result_ids), request.user
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
                        bulk_msg.save(update_fields=["sent_count", "delivered_count"])

            return Response(
                {
                    "message": f"Published {total_published} results.",
                    "notifications_sent": notifications_sent,
                }
            )
        except Exception as exc:
            logger.error("bulk_publish_results failed: %s", exc)
            return Response({"error": str(exc)}, status=400)


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
            "approved_results": 0,
            "draft_results": 0,
        }
        total_passed = 0
        for model in _RESULT_MODEL_MAP.values():
            qs = model.objects.filter(exam_session_id=es_id)
            summary["total_results"] += qs.count()
            summary["published_results"] += qs.filter(status=PUBLISHED).count()
            summary["approved_results"] += qs.filter(status=APPROVED).count()
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
                except Exception as exc:
                    errors.append(f"Row {row_num}: {exc}")
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
                    r.subject.name if getattr(r, "subject", None) else "",
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
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)
        except Exception as exc:
            logger.error("Error generating PDF report: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=500)

    @action(detail=False, methods=["get"], url_path="download-session-report")
    def download_session_report(self, request):
        report_id = request.query_params.get("report_id")
        education_level = request.query_params.get(
            "education_level", SENIOR_SECONDARY
        ).upper()
        if not report_id:
            return Response({"error": "report_id is required"}, status=400)
        try:
            return get_report_generator(
                education_level, request
            ).generate_session_report(report_id)
        except Exception as exc:
            logger.error("Error generating session report: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=500)


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
                classroom__in=assigned_classrooms, is_active=True
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
        except Exception as exc:
            logger.error("Error fetching assigned students: %s", exc, exc_info=True)
            return Response({"error": str(exc)}, status=500)

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
        serializer = TeacherRemarkUpdateSerializer(
            data={"class_teacher_remark": remark}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        try:
            model = self._get_report_model(level)
            report = model.objects.get(id=report_id)
            if not self._can_teacher_edit_remark(request.user, report):
                return Response({"error": "Permission denied"}, status=403)
            report.class_teacher_remark = serializer.validated_data[
                "class_teacher_remark"
            ]
            report.save(update_fields=["class_teacher_remark", "updated_at"])
            return Response(
                {"message": "Remark updated", "term_report_id": str(report.id)}
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)

    @action(detail=False, methods=["get"], url_path="my-signature")
    def get_my_signature(self, request):
        """Return the teacher's stored signature URL (empty if none uploaded yet)."""
        try:
            teacher = request.user.teacher
            return Response({
                "signature_url": teacher.signature_url or "",
                "signature_uploaded_at": teacher.signature_uploaded_at,
            })
        except Exception:
            return Response({"signature_url": "", "signature_uploaded_at": None})

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
            # Persist URL on the Teacher profile so it can be reused
            try:
                teacher = request.user.teacher
                teacher.signature_url = result["signature_url"]
                teacher.signature_uploaded_at = timezone.now()
                teacher.save(update_fields=["signature_url", "signature_uploaded_at"])
            except Exception:
                pass  # Don't fail the upload if the save fails
            return Response(
                {
                    "signature_url": result["signature_url"],
                    "public_id": result["public_id"],
                }
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)

    @action(detail=False, methods=["post"], url_path="apply-signature")
    def apply_signature_to_reports(self, request):
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
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)

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
        """Returns APPROVED reports awaiting head-teacher remark + publication."""
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
                exam_session=exam_session, status=APPROVED
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
        serializer = HeadTeacherRemarkUpdateSerializer(
            data={"head_teacher_remark": remark}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        model = _TERM_REPORT_MODEL_MAP.get(level.upper())
        if not model:
            return Response({"error": "Invalid education level"}, status=400)
        try:
            report = model.objects.get(id=report_id)
            if not report.can_edit_head_teacher_remark(request.user):
                return Response({"error": "Permission denied"}, status=403)
            report.head_teacher_remark = serializer.validated_data[
                "head_teacher_remark"
            ]
            report.save(update_fields=["head_teacher_remark", "updated_at"])
            return Response(
                {
                    "message": "Head teacher remark updated",
                    "term_report_id": str(report.id),
                }
            )
        except model.DoesNotExist:
            return Response({"error": "Term report not found"}, status=404)
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)

    @action(detail=False, methods=["get"], url_path="get-head-signature")
    def get_head_signature(self, request):
        """Return the tenant's stored head teacher signature URL."""
        from tenants.models import Tenant
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return Response({"signature_url": "", "signature_uploaded_at": None})
        try:
            settings = tenant.settings
            return Response({
                "signature_url": settings.head_teacher_signature_url or "",
                "signature_uploaded_at": settings.head_teacher_signature_uploaded_at,
            })
        except Exception:
            return Response({"signature_url": "", "signature_uploaded_at": None})

    @action(detail=False, methods=["post"], url_path="upload-head-signature")
    def upload_head_teacher_signature(self, request):
        sig = request.FILES.get("signature_image")
        if not sig:
            return Response({"error": "signature_image is required"}, status=400)
        if sig.size > 2 * 1024 * 1024:
            return Response({"error": "Max 2MB"}, status=400)
        if sig.content_type not in ("image/png", "image/jpeg", "image/jpg"):
            return Response({"error": "Only PNG/JPEG allowed"}, status=400)
        try:
            result = upload_signature_to_cloudinary(
                sig, request.user, signature_type="head_teacher"
            )
            # Persist on TenantSettings so it survives across sessions
            tenant = getattr(request, "tenant", None)
            if tenant:
                try:
                    settings = tenant.settings
                    settings.head_teacher_signature_url = result["signature_url"]
                    settings.head_teacher_signature_uploaded_at = timezone.now()
                    settings.save(update_fields=[
                        "head_teacher_signature_url",
                        "head_teacher_signature_uploaded_at",
                    ])
                except Exception:
                    pass
            return Response(
                {
                    "signature_url": result["signature_url"],
                    "public_id": result["public_id"],
                }
            )
        except Exception as exc:
            return Response({"error": str(exc)}, status=500)

    @action(detail=False, methods=["post"], url_path="apply-head-signature")
    def apply_head_signature(self, request):
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
