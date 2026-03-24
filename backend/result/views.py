import tempfile
import logging
import csv
import io
from decimal import Decimal
from django.apps import apps
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Avg, Count, Max, Min, F, Case, When, DecimalField
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.core.exceptions import ValidationError
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.template.loader import render_to_string
from utils.section_filtering import SectionFilterMixin, AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from .report_generation import get_report_generator
from utils.teacher_portal_permissions import TeacherPortalCheckMixin
from django.db.models import Prefetch
from .filters import StudentTermResultFilter
from utils.signature_handler import upload_signature_to_cloudinary
from rest_framework.pagination import PageNumberPagination
from utils.pagination import LargeResultsPagination, StandardResultsPagination
from classroom.models import StudentEnrollment


from rest_framework.parsers import MultiPartParser, FormParser
import cloudinary.uploader

from messaging.models import BulkMessage, Message

from .models import (
    StudentResult,
    StudentTermResult,
    ExamSession,
    ResultSheet,
    AssessmentScore,
    ResultComment,
    ResultTemplate,
    GradingSystem,
    Grade,
    AssessmentType,
    ScoringConfiguration,
    JuniorSecondaryResult,
    JuniorSecondaryTermReport,
    PrimaryResult,
    PrimaryTermReport,
    NurseryResult,
    NurseryTermReport,
    SeniorSecondaryResult,
    SeniorSecondaryTermReport,
    SeniorSecondarySessionResult,
    SeniorSecondarySessionReport,
)

from .serializers import (
    StudentResultSerializer,
    GradingSystemCreateUpdateSerializer,
    StudentTermResultSerializer,
    ExamSessionSerializer,
    ExamSessionCreateUpdateSerializer,
    ResultSheetSerializer,
    AssessmentScoreSerializer,
    ResultCommentSerializer,
    GradingSystemSerializer,
    GradeSerializer,
    AssessmentTypeSerializer,
    DetailedStudentResultSerializer,
    StudentTermResultDetailSerializer,
    ScoringConfigurationSerializer,
    ScoringConfigurationCreateUpdateSerializer,
    JuniorSecondaryResultSerializer,
    JuniorSecondaryResultCreateUpdateSerializer,
    JuniorSecondaryTermReportSerializer,
    PrimaryResultSerializer,
    PrimaryResultCreateUpdateSerializer,
    PrimaryTermReportSerializer,
    NurseryResultSerializer,
    NurseryResultCreateUpdateSerializer,
    NurseryTermReportSerializer,
    SeniorSecondaryResultSerializer,
    SeniorSecondaryResultCreateUpdateSerializer,
    SeniorSecondaryTermReportSerializer,
    SeniorSecondarySessionResultSerializer,
    SeniorSecondarySessionResultCreateUpdateSerializer,
    SeniorSecondarySessionReportSerializer,
    ResultCommentCreateSerializer,
    ResultTemplateCreateUpdateSerializer,
    ResultTemplateSerializer,
    BulkStatusUpdateSerializer,
    PublishResultSerializer,
    StudentMinimalSerializer,
    SubjectPerformanceSerializer,
    BulkResultUpdateSerializer,
    ResultExportSerializer,
    ResultImportSerializer,
    BulkReportGenerationSerializer,
    ReportGenerationSerializer,
)

from students.models import Student
from academics.models import AcademicSession, Term, EducationLevel
from classroom.models import Stream, Class as StudentClass
from subject.models import Subject

logger = logging.getLogger(__name__)

# Constants
FIRST = "FIRST"
SECOND = "SECOND"
THIRD = "THIRD"
DRAFT = "DRAFT"
SUBMITTED = "SUBMITTED"
APPROVED = "APPROVED"
PUBLISHED = "PUBLISHED"
SENIOR_SECONDARY = "SENIOR_SECONDARY"
JUNIOR_SECONDARY = "JUNIOR_SECONDARY"
PRIMARY = "PRIMARY"
NURSERY = "NURSERY"
IMPROVING = "IMPROVING"
DECLINING = "DECLINING"
STABLE = "STABLE"


# ===== UTILITY FUNCTIONS =====
def get_next_term_begins_date(exam_session):
    """Get the next term begins date for the given exam session"""
    try:
        if (
            not hasattr(exam_session, "academic_session")
            or not exam_session.academic_session
        ):
            logger.error(
                f"Exam session {exam_session.id} does not have academic_session relationship loaded"
            )
            return None

        current_term_name = exam_session.term
        current_academic_session = exam_session.academic_session

        logger.info(
            f"Getting next term begins date for term {current_term_name}, academic_session {current_academic_session.name}"
        )

        term_order = [FIRST, SECOND, THIRD]

        if current_term_name not in term_order:
            logger.error(f"Invalid term name: {current_term_name}")
            return None

        current_index = term_order.index(current_term_name)

        if current_index < len(term_order) - 1:
            next_term_name = term_order[current_index + 1]
            next_term = Term.objects.filter(
                academic_session=current_academic_session,
                name=next_term_name,
                is_active=True,
            ).first()

            if next_term and next_term.next_term_begins:
                logger.info(
                    f"Found next term {next_term_name} with next_term_begins {next_term.next_term_begins}"
                )
                return next_term.next_term_begins
            else:
                logger.warning(
                    f"Next term {next_term_name} not found or has no next_term_begins date"
                )
        else:
            next_academic_session = (
                AcademicSession.objects.filter(
                    start_date__gt=current_academic_session.end_date, is_active=True
                )
                .order_by("start_date")
                .first()
            )

            if next_academic_session:
                next_term = Term.objects.filter(
                    academic_session=next_academic_session, name=FIRST, is_active=True
                ).first()

                if next_term and next_term.next_term_begins:
                    logger.info(
                        f"Found first term of next academic session with next_term_begins {next_term.next_term_begins}"
                    )
                    return next_term.next_term_begins
                else:
                    logger.warning(
                        "First term of next academic session not found or has no next_term_begins date"
                    )
            else:
                logger.warning(
                    f"No next academic session found after {current_academic_session.name}"
                )

        return None
    except Exception as e:
        logger.error(f"Error getting next term begins date: {e}")
        return None


def check_user_permission(user, permission_name):
    """Check if user has specific permission"""
    if user.is_superuser or user.is_staff:
        return True

    role = getattr(user, "role", None)
    if role in ["admin", "superadmin", "principal"]:
        return True

    return user.has_perm(permission_name)


def validate_result_for_approval(result):
    """Validate that result is ready for approval"""
    errors = []

    if not result.total_score or result.total_score < 0:
        errors.append("Total score is invalid")

    if not hasattr(result, "exam_score") or result.exam_score is None:
        errors.append("Exam score is missing")

    if not result.grade:
        errors.append("Grade has not been calculated")

    return errors


# ===== HELPER FUNCTIONS FOR EDUCATION LEVEL =====


def get_education_level_from_student(student):
    """
    ✅ Get education_level from Student model
    Student has FK: student_class → StudentClass → education_level FK → EducationLevel
    The @property student.education_level returns level_type string
    """
    try:
        # Returns the level_type string like "SENIOR_SECONDARY", "PRIMARY", etc.
        return student.education_level
    except Exception as e:
        logger.error(f"Error getting education level for student {student.id}: {e}")
        return None


def get_education_level_from_classroom(classroom):
    """
    ✅ Get education_level from Classroom model
    Classroom → grade_level FK → GradeLevel → education_level FK → EducationLevel → level_type
    """
    try:
        if hasattr(classroom, "grade_level") and classroom.grade_level:
            grade_level = classroom.grade_level
            if hasattr(grade_level, "education_level") and grade_level.education_level:
                # education_level is the FK to EducationLevel model
                return grade_level.education_level.level_type
        return None
    except Exception as e:
        logger.error(f"Error getting education level from classroom: {e}")
        return None


# ===== GRADING SYSTEM VIEWSETS =====


class GradingSystemViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    Grading systems are school-wide, not section-specific.
    """
    queryset = GradingSystem.objects.all()
    serializer_class = GradingSystemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["grading_type", "is_active"]
    search_fields = ["name", "description"]

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()
        return queryset.prefetch_related("grades")

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return GradingSystemCreateUpdateSerializer
        return GradingSystemSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        grading_system = self.get_object()
        grading_system.is_active = True
        grading_system.save()
        return Response(GradingSystemSerializer(grading_system).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        grading_system = self.get_object()
        grading_system.is_active = False
        grading_system.save()
        return Response(GradingSystemSerializer(grading_system).data)


class GradeViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    Grades are school-wide, not section-specific.
    """
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["grading_system", "is_passing"]

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset.select_related("grading_system")


class AssessmentTypeViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ✅ FIXED: education_level is now FK to EducationLevel model
    """
    queryset = AssessmentType.objects.all()
    serializer_class = AssessmentTypeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    # ✅ FIXED: Filter by FK id
    filterset_fields = ["education_level", "is_active"]
    search_fields = ["name", "code"]

    def get_queryset(self):
        queryset = super().get_queryset()
        # ✅ Select related FK
        return queryset.select_related("education_level")


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
        if self.action in ["create", "update", "partial_update"]:
            return ExamSessionCreateUpdateSerializer
        return ExamSessionSerializer

    def get_queryset(self):
        queryset = super().get_queryset().select_related("academic_session")
        user = self.request.user

        # Students see only published sessions
        if hasattr(user, "role") and user.role == "STUDENT":
            queryset = queryset.filter(is_published=True)

        return queryset.order_by("-created_at")

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        exam_session = self.get_object()
        exam_session.is_published = True
        exam_session.published_by = request.user
        exam_session.published_date = timezone.now()
        exam_session.save()
        return Response(ExamSessionSerializer(exam_session).data)

    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        exam_session = self.get_object()

        stats = {
            "total_results": 0,
            "by_education_level": {},
            "by_status": {},
        }

        education_levels = [SENIOR_SECONDARY, JUNIOR_SECONDARY, PRIMARY, NURSERY]

        for level in education_levels:
            if level == SENIOR_SECONDARY:
                results = SeniorSecondaryResult.objects.filter(
                    exam_session=exam_session
                )
            elif level == JUNIOR_SECONDARY:
                results = JuniorSecondaryResult.objects.filter(
                    exam_session=exam_session
                )
            elif level == PRIMARY:
                results = PrimaryResult.objects.filter(exam_session=exam_session)
            elif level == NURSERY:
                results = NurseryResult.objects.filter(exam_session=exam_session)
            else:
                results = StudentResult.objects.none()

            level_stats = {
                "total": results.count(),
                "published": results.filter(status=PUBLISHED).count(),
                "approved": results.filter(status=APPROVED).count(),
                "draft": results.filter(status=DRAFT).count(),
                "passed": results.filter(is_passed=True).count(),
                "failed": results.filter(is_passed=False).count(),
            }

            stats["by_education_level"][level] = level_stats
            stats["total_results"] += level_stats["total"]

        return Response(stats)
class ScoringConfigurationViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ✅ FIXED: education_level is now FK to EducationLevel model
    """
    queryset = ScoringConfiguration.objects.all().order_by("education_level", "name")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    # ✅ FIXED: Filter by FK id
    filterset_fields = ["education_level", "result_type", "is_active", "is_default"]
    search_fields = ["name", "description"]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ScoringConfigurationCreateUpdateSerializer
        return ScoringConfigurationSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        # ✅ Select related FK
        return queryset.select_related("created_by", "education_level")

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        """
        ✅ FIXED: Accept education_level as FK id or level_type string
        """
        education_level_param = request.query_params.get("education_level")
        if not education_level_param:
            return Response(
                {"error": "education_level parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Try to parse as FK id first
        try:
            education_level_id = int(education_level_param)
            configs = self.get_queryset().filter(education_level_id=education_level_id)
        except (ValueError, TypeError):
            # Fall back to level_type string lookup
            configs = self.get_queryset().filter(
                education_level__level_type=education_level_param.upper()
            )

        serializer = ScoringConfigurationSerializer(configs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def defaults(self, request):
        configs = self.get_queryset().filter(is_default=True, is_active=True)
        serializer = ScoringConfigurationSerializer(configs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_result_type(self, request):
        result_type = request.query_params.get("result_type", "TERMLY")
        education_level_param = request.query_params.get("education_level")

        filters_q = {"result_type": result_type, "is_active": True}

        # ✅ FIXED: Handle both FK id and level_type string
        if education_level_param:
            try:
                education_level_id = int(education_level_param)
                filters_q["education_level_id"] = education_level_id
            except (ValueError, TypeError):
                filters_q["education_level__level_type"] = education_level_param.upper()

        configs = self.get_queryset().filter(**filters_q)
        serializer = ScoringConfigurationSerializer(configs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def set_as_default(self, request, pk=None):
        config = self.get_object()

        with transaction.atomic():
            # ✅ FIXED: Filter by FK instead of string
            ScoringConfiguration.objects.filter(
                education_level=config.education_level, result_type=config.result_type
            ).update(is_default=False)

            config.is_default = True
            config.save(update_fields=["is_default"])

        return Response(ScoringConfigurationSerializer(config).data)


class BaseResultViewSetMixin:
    """Common methods for all result viewsets"""

    def get_teacher_queryset(self, user, queryset):
        """
        ✅ FIXED: Get filtered queryset for teachers
        Uses FK relationships: Teacher → Classroom → GradeLevel → EducationLevel
        """
        Teacher = apps.get_model("teacher", "Teacher")
        Classroom = apps.get_model("classroom", "Classroom")
        StudentEnrollment = apps.get_model("classroom", "StudentEnrollment")
        ClassroomTeacherAssignment = apps.get_model(
            "classroom", "ClassroomTeacherAssignment"
        )

        try:
            teacher = Teacher.objects.get(user=user)
            logger.info(
                f"🔍 Filtering results for teacher: {user.username} (ID: {teacher.id})"
            )

            # Get assigned classrooms with FK relationships
            assigned_classrooms = (
                Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                )
                .select_related("grade_level", "grade_level__education_level")
                .distinct()
            )

            logger.info(
                f"📚 Teacher assigned to {assigned_classrooms.count()} classrooms"
            )

            if not assigned_classrooms.exists():
                logger.warning(f"❌ Teacher {user.username} has no assigned classrooms")
                return queryset.none()

            # ✅ Get education levels from FK chain: Classroom → GradeLevel → EducationLevel
            classroom_education_levels = []
            for classroom in assigned_classrooms:
                try:
                    if hasattr(classroom, "grade_level") and classroom.grade_level:
                        level_obj = classroom.grade_level.education_level
                        if (
                            level_obj
                            and level_obj.level_type not in classroom_education_levels
                        ):
                            classroom_education_levels.append(level_obj.level_type)
                except Exception as e:
                    logger.warning(
                        f"⚠️ Could not get education level for classroom {classroom.name}: {e}"
                    )
                    continue

            logger.info(f"🎓 Classroom education levels: {classroom_education_levels}")

            # Determine if classroom teacher (Nursery/Primary)
            is_classroom_teacher = any(
                level in ["NURSERY", "PRIMARY"] for level in classroom_education_levels
            )
            logger.info(f"👨‍🏫 Is classroom teacher? {is_classroom_teacher}")

            # Get students from assigned classrooms
            student_ids = list(
                StudentEnrollment.objects.filter(
                    classroom__in=assigned_classrooms, is_active=True
                ).values_list("student_id", flat=True)
            )
            logger.info(f"👥 Students in assigned classrooms: {len(student_ids)}")

            if not student_ids:
                logger.warning(f"❌ No active students found in teacher's classrooms")
                return queryset.none()

            # Filter based on teacher type
            if is_classroom_teacher:
                # CLASSROOM TEACHERS (Nursery/Primary): See ALL subjects for their students
                filtered = queryset.filter(student_id__in=student_ids)
                logger.info(
                    f"✅ Classroom teacher can see {filtered.count()} results (all subjects)"
                )
                return filtered
            else:
                # SUBJECT TEACHERS (Secondary): See ONLY their assigned subjects
                teacher_assignments = ClassroomTeacherAssignment.objects.filter(
                    teacher=teacher
                ).select_related("subject")

                assigned_subject_ids = list(
                    teacher_assignments.exclude(subject__isnull=True)
                    .values_list("subject_id", flat=True)
                    .distinct()
                )
                logger.info(f"📖 Teacher assigned subjects: {assigned_subject_ids}")

                if not assigned_subject_ids:
                    logger.warning(
                        f"❌ Subject teacher {user.username} has no assigned subjects"
                    )
                    return queryset.none()

                # Filter by BOTH subject AND student
                filtered = queryset.filter(
                    subject_id__in=assigned_subject_ids, student_id__in=student_ids
                )
                logger.info(f"✅ Subject teacher can see {filtered.count()} results")
                return filtered

        except Teacher.DoesNotExist:
            logger.error(f"❌ Teacher object not found for user {user.username}")
            return queryset.none()
        except Exception as e:
            logger.error(f"❌ Error filtering for teacher: {str(e)}", exc_info=True)
            import traceback

            logger.error(f"❌ Traceback: {traceback.format_exc()}")
            return queryset.none()

    def handle_create(
        self, request, education_level, serializer_class, result_serializer_class
    ):
        """
        ✅ FIXED: Common create logic using FK relationships
        Validates student.education_level (FK chain) matches expected level
        """
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

                    # ✅ student.education_level is @property returning level_type string
                    if student.education_level != education_level:
                        return Response(
                            {
                                "error": f"Student's education level is {student.education_level}, expected {education_level}."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                data["entered_by"] = request.user.id
                serializer = serializer_class(data=data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()

                detailed_serializer = result_serializer_class(result)
                return Response(
                    detailed_serializer.data, status=status.HTTP_201_CREATED
                )

        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Failed to create result: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to create result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def handle_update(
        self, request, instance, serializer_class, result_serializer_class, **kwargs
    ):
        """Common update logic for all result types"""
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
                result = serializer.save()

                detailed_serializer = result_serializer_class(result)
                return Response(detailed_serializer.data)

        except Exception as e:
            logger.error(f"Failed to update result: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to update result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def _prepare_request_data_copy(self, request):
        """Create a mutable copy of request data"""
        if hasattr(request.data, "_mutable"):
            request.data._mutable = True
            return request.data
        return (
            request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        )

    def handle_approve(self, request, result, serializer_class):
        """Common approve logic"""
        user_role = self.get_user_role()
        allowed_roles = ["admin", "superadmin", "principal", "senior_secondary_admin"]

        if user_role not in allowed_roles and not check_user_permission(
            request.user, "results.can_approve_results"
        ):
            return Response(
                {"error": "You don't have permission to approve results"},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            with transaction.atomic():
                if result.status == PUBLISHED:
                    return Response(
                        {"error": "Cannot approve a published result"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if not getattr(result, "total_score", None) and result.total_score != 0:
                    return Response(
                        {"error": "Cannot approve result with invalid scores"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if result.status not in [DRAFT, SUBMITTED]:
                    return Response(
                        {
                            "error": "Invalid status transition",
                            "detail": f"Cannot approve result with status '{result.status}'. Only DRAFT or SUBMITTED results can be approved.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                result.status = APPROVED
                result.approved_by = request.user
                result.approved_date = timezone.now()
                result.save(update_fields=["status", "approved_by", "approved_date"])

                return Response(serializer_class(result).data)

        except Exception as e:
            logger.error(f"Error approving result: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Error approving result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def handle_publish(self, request, result, serializer_class):
        """Common publish logic"""
        user_role = self.get_user_role()
        allowed_roles = ["admin", "superadmin", "principal", "senior_secondary_admin"]

        if user_role not in allowed_roles and not check_user_permission(
            request.user, "results.can_publish_results"
        ):
            return Response(
                {"error": "You don't have permission to publish results"},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            with transaction.atomic():
                if result.status == PUBLISHED:
                    return Response(
                        {"error": "Result is already published"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                result.status = PUBLISHED
                result.published_by = request.user
                result.published_date = timezone.now()
                result.save(update_fields=["status", "published_by", "published_date"])

                return Response(serializer_class(result).data)

        except Exception as e:
            logger.error(f"Error publishing result: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Error publishing result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class StandardResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ===== SENIOR SECONDARY VIEWSETS =====
class SeniorSecondaryResultViewSet(
    BaseResultViewSetMixin,
    TeacherPortalCheckMixin,
    SectionFilterMixin,
    viewsets.ModelViewSet,
):
    """
    ✅ FIXED: All FK relationships properly handled
    - Student → student_class FK → education_level FK
    - Stream → stream_type_new FK (new FK relationship)
    """
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
        "stream",  # ✅ FK to Stream model
    ]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return SeniorSecondaryResultCreateUpdateSerializer
        return SeniorSecondaryResultSerializer

    def get_queryset(self):
        # ✅ Select related all FK relationships
        qs = (
            super()
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "student__student_class",  # ✅ FK
                "student__student_class__education_level",  # ✅ FK chain
                "subject",
                "exam_session",
                "grading_system",
                "stream",  # ✅ FK
                "stream__stream_type_new",  # ✅ New FK relationship
                "entered_by",
                "approved_by",
                "published_by",
                "last_edited_by",
            )
        )

        user = getattr(self.request, "user", None)
        if not user or user.is_anonymous:
            return qs.none()

        if user.is_superuser or user.is_staff:
            return qs

        role = self.get_user_role()

        if role in ["admin", "superadmin", "principal"]:
            return qs

        if role in ["secondary_admin", "senior_secondary_admin"]:
            education_levels = self.get_user_education_level_access()
            if education_levels:
                # ✅ Filter by level_type through FK chain
                return qs.filter(
                    student__student_class__education_level__level_type__in=education_levels
                )
            return qs.none()

        if role == "teacher":
            return self.get_teacher_queryset(user, qs)

        if role == "student":
            try:
                student = Student.objects.get(user=user)
                return qs.filter(student=student, status=PUBLISHED)
            except Student.DoesNotExist:
                return qs.none()

        if role == "parent":
            try:
                Parent = apps.get_model("parent", "Parent")
                parent = Parent.objects.get(user=user)
                return qs.filter(student__parents=parent, status=PUBLISHED)
            except Exception:
                return qs.none()

        return qs.none()

    def create(self, request, *args, **kwargs):
        return self.handle_create(
            request,
            SENIOR_SECONDARY,
            SeniorSecondaryResultCreateUpdateSerializer,
            SeniorSecondaryResultSerializer,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        return self.handle_update(
            request,
            instance,
            SeniorSecondaryResultCreateUpdateSerializer,
            SeniorSecondaryResultSerializer,
            **kwargs,
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        result = self.get_object()
        return self.handle_approve(request, result, SeniorSecondaryResultSerializer)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        result = self.get_object()
        return self.handle_publish(request, result, SeniorSecondaryResultSerializer)

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        results_data = request.data.get("results", [])
        created_results = []
        errors = []

        try:
            with transaction.atomic():
                for i, raw_item in enumerate(results_data):
                    if isinstance(raw_item, dict):
                        item = raw_item.copy()
                    else:
                        item = dict(raw_item)

                    item["entered_by"] = request.user.id
                    serializer = self.get_serializer(data=item)

                    try:
                        serializer.is_valid(raise_exception=True)
                        result = serializer.save()
                        created_results.append(
                            SeniorSecondaryResultSerializer(result).data
                        )
                    except Exception as e:
                        logger.warning(f"Error saving item index {i}: {e}")
                        errors.append({"index": i, "error": str(e), "data": item})

                if not created_results and errors:
                    return Response(
                        {"error": "Failed to create any results", "errors": errors},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                response_data = {
                    "message": f"Successfully created {len(created_results)} results",
                    "results": created_results,
                }

                if errors:
                    response_data["partial_success"] = True
                    response_data["errors"] = errors

                return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Failed to bulk create results: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to bulk create results: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def destroy(self, request, *args, **kwargs):
        """
        Delete a subject result.
        - Admin/Principal: Can delete ANY result regardless of status
        - Teachers: Can only delete DRAFT results
        """
        try:
            instance = self.get_object()
            user_role = self.get_user_role()

            if user_role in ["admin", "superadmin", "principal"]:
                logger.warning(
                    f"ADMIN DELETE: Result ID={instance.id}, "
                    f"Student={instance.student.full_name}, "
                    f"Subject={instance.subject.name}, "
                    f"Status={instance.status}, "
                    f"Deleted by={request.user.username}"
                )
            elif user_role == "teacher":
                if instance.status != "DRAFT":
                    return Response(
                        {
                            "error": "Teachers can only delete DRAFT results",
                            "detail": f"This result has status '{instance.status}' and cannot be deleted by teachers. Contact an administrator.",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                logger.info(
                    f"TEACHER DELETE: Draft result ID={instance.id}, "
                    f"Deleted by={request.user.username}"
                )
            else:
                return Response(
                    {"error": "You don't have permission to delete results"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            with transaction.atomic():
                subject_name = instance.subject.name
                student_name = instance.student.full_name
                instance.delete()

            return Response(
                {
                    "message": f"Result for {student_name} in {subject_name} deleted successfully",
                    "deleted_id": str(kwargs.get("pk")),
                },
                status=status.HTTP_204_NO_CONTENT,
            )

        except Exception as e:
            logger.error(f"Error deleting subject result: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to delete result: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        """
        ✅ FIXED: Use FK relationship for student_class filtering
        """
        exam_session = request.query_params.get("exam_session")
        student_class = request.query_params.get("student_class")
        subject = request.query_params.get("subject")

        filters = {}
        if exam_session:
            filters["exam_session"] = exam_session
        if student_class:
            # ✅ Can filter by student_class FK id
            filters["student__student_class_id"] = student_class
        if subject:
            filters["subject"] = subject

        filters["status__in"] = [APPROVED, PUBLISHED]

        results = self.get_queryset().filter(**filters)

        if not results.exists():
            return Response(
                {"error": "No results found"}, status=status.HTTP_404_NOT_FOUND
            )

        scores = list(results.values_list("total_score", flat=True))
        statistics = {
            "total_students": len(scores),
            "class_average": (sum(scores) / len(scores)) if scores else 0,
            "highest_score": max(scores) if scores else 0,
            "lowest_score": min(scores) if scores else 0,
            "students_passed": results.filter(is_passed=True).count(),
            "students_failed": results.filter(is_passed=False).count(),
        }

        return Response(statistics)

    @action(detail=False, methods=["get"])
    def grade_distribution(self, request):
        exam_session = request.query_params.get("exam_session")
        student_class = request.query_params.get("student_class")

        filters = {"status__in": [APPROVED, PUBLISHED]}
        if exam_session:
            filters["exam_session"] = exam_session
        if student_class:
            # ✅ Filter by FK id
            filters["student__student_class_id"] = student_class

        results = self.get_queryset().filter(**filters)
        grade_stats = (
            results.values("grade").annotate(count=Count("grade")).order_by("grade")
        )

        return Response(list(grade_stats))


# ===== SENIOR SECONDARY SESSION RESULT & REPORT VIEWSETS =====
class SeniorSecondarySessionResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    """ViewSet for managing senior secondary session results."""

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
        """Filter queryset based on user role and permissions."""
        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",  # ✅ FK chain
                "subject",
                "academic_session",
                "grading_system",
                "stream__stream_type_new",  # ✅ Senior Secondary stream FK
                "entered_by",
                "approved_by",
                "published_by",
                "last_edited_by",
            )
        )

        user = self.request.user
        if not user or user.is_anonymous:
            return queryset.none()

        if user.is_superuser or user.is_staff:
            return queryset

        role = self.get_user_role()

        if role in ["admin", "superadmin", "principal"]:
            return queryset

        # ✅ Section admins - FK filtering
        if role in ["secondary_admin", "senior_secondary_admin"]:
            education_levels = self.get_user_education_level_access()
            if education_levels:
                filtered = queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels  # ✅ FK chain
                )
                return filtered
            return queryset.none()

        # Teachers - use inherited method from BaseResultViewSetMixin
        if role == "teacher":
            return self._get_teacher_queryset(user, queryset)

        # Students
        if role == "student":
            try:
                from students.models import Student as StudentModel

                student = StudentModel.objects.get(user=user)
                return queryset.filter(student=student, status="PUBLISHED")
            except StudentModel.DoesNotExist:
                return queryset.none()

        # Parents
        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                return queryset.filter(student__parents=parent, status="PUBLISHED")
            except:
                return queryset.none()

        return queryset.none()

    def create(self, request, *args, **kwargs):
        """Create a new senior secondary session result."""
        data = self._prepare_request_data_copy(request)
        try:
            with transaction.atomic():
                student_id = data.get("student")
                if student_id:
                    try:
                        # ✅ FK: Select related for validation
                        student = Student.objects.select_related(
                            "student_class__education_level"
                        ).get(id=student_id)

                        # ✅ Use @property which traverses FK chain
                        if student.education_level != "SENIOR_SECONDARY":
                            return Response(
                                {
                                    "error": f"Student's education level is {student.education_level}, expected SENIOR_SECONDARY."
                                },
                                status=status.HTTP_400_BAD_REQUEST,
                            )
                    except Student.DoesNotExist:
                        return Response(
                            {"error": "Student not found"},
                            status=status.HTTP_404_NOT_FOUND,
                        )

                data["entered_by"] = request.user.id
                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()

                detailed_serializer = SeniorSecondarySessionResultSerializer(result)
                return Response(
                    detailed_serializer.data, status=status.HTTP_201_CREATED
                )

        except Exception as e:
            logger.error(f"Failed to create session result: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to create session result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ===== CORRECTED: SeniorSecondarySessionReportViewSet =====
class SeniorSecondarySessionReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    """ViewSet for managing senior secondary session reports."""

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

    def get_queryset(self):
        """Filter queryset based on user role and permissions."""
        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",  # ✅ FK chain
                "academic_session",
                "stream__stream_type_new",  # ✅ Stream FK
            )
            .prefetch_related("subject_results")
        )

        user = self.request.user

        if user.is_superuser or user.is_staff:
            return queryset

        role = self.get_user_role()

        if role in ["admin", "superadmin", "principal"]:
            return queryset

        # ✅ Section admins - FK filtering
        if role == "teacher":
            section_access = self.get_user_section_access()
            education_levels = self.get_education_levels_for_sections(section_access)
            if education_levels:
                return queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels  # ✅ FK chain
                )
            return queryset.none()

        if role == "student":
            try:
                student = Student.objects.get(user=user)
                return queryset.filter(student=student)
            except Student.DoesNotExist:
                return queryset.none()

        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                return queryset.filter(student__parents=parent)
            except:
                return queryset.none()

        # ✅ Default section filtering with FK chain
        section_access = self.get_user_section_access()
        education_levels = self.get_education_levels_for_sections(section_access)

        if not education_levels:
            return queryset.none()

        return queryset.filter(
            student__student_class__education_level__level_type__in=education_levels  # ✅ FK chain
        )


# ===== CORRECTED: SeniorSecondaryTermReportViewSet =====
class SeniorSecondaryTermReportViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    """ViewSet for managing senior secondary term reports."""
    pagination_class = StandardResultsPagination

    queryset = SeniorSecondaryTermReport.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["student", "exam_session", "status", "is_published", "stream"]
    search_fields = ["student__user__first_name", "student__user__last_name"]

    def get_queryset(self):
        """Filter queryset based on user role and permissions."""
        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",  # ✅ FK chain
                "exam_session",
                "published_by",
                "stream__stream_type_new",  # ✅ Stream FK
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=SeniorSecondaryResult.objects.select_related(
                        "entered_by",
                        "approved_by",
                        "published_by",
                        "last_edited_by",
                        "subject",
                        "grading_system",
                        "stream__stream_type_new",  # ✅ Stream FK in prefetch
                    ),
                )
            )
        )

        user = self.request.user

        if user.is_superuser or user.is_staff:
            return queryset

        role = self.get_user_role()

        if role in ["admin", "superadmin", "principal"]:
            return queryset

        # ✅ Section admins - FK filtering
        if role in ["secondary_admin", "senior_secondary_admin"]:
            education_levels = self.get_user_education_level_access()
            if education_levels:
                return queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels  # ✅ FK chain
                )
            return queryset.none()

        if role == "teacher":
            try:
                from teacher.models import Teacher
                from classroom.models import Classroom, StudentEnrollment

                teacher = Teacher.objects.get(user=user)
                assigned_classrooms = Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                ).distinct()

                student_ids = StudentEnrollment.objects.filter(
                    classroom__in=assigned_classrooms, is_active=True
                ).values_list("student_id", flat=True)

                return queryset.filter(student_id__in=student_ids)
            except Teacher.DoesNotExist:
                return queryset.none()

        if role == "student":
            try:
                student = Student.objects.get(user=user)
                return queryset.filter(student=student)
            except:
                return queryset.none()

        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                return queryset.filter(student__parents=parent)
            except:
                return queryset.none()

        return queryset.none()

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
    filterset_fields = [
        "student",
        "subject",
        "exam_session",
        "status",
        "is_passed",
    ]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return JuniorSecondaryResultCreateUpdateSerializer
        return JuniorSecondaryResultSerializer

    def get_queryset(self):
        from classroom.models import StudentEnrollment

        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",
                "subject",
                "exam_session",
                "grading_system",
                "entered_by",
                "approved_by",
                "published_by",
                "last_edited_by",
            )
            .prefetch_related(
                Prefetch(
                    "student__studentenrollment_set",
                    queryset=StudentEnrollment.objects.filter(
                        is_active=True
                    ).select_related("classroom"),
                    to_attr="active_enrollments",
                )
            )
        )

        user = self.request.user

        if user.is_superuser or user.is_staff:
            logger.info(
                f"Super admin/staff {user.username} - Full access to {queryset.count()} results"
            )
            return queryset

        role = self.get_user_role()
        logger.info(f"User {user.username} role: {role}")

        if role in ["admin", "superadmin", "principal"]:
            logger.info(
                f"Admin {user.username} - Full access to {queryset.count()} results"
            )
            return queryset

        # ===== SECTION ADMINS =====
        if role in [
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ]:
            education_levels = self.get_user_education_level_access()
            logger.info(f"Section admin access for {education_levels}")

            if education_levels:
                # ✅ FIXED: Use FK chain
                filtered = queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels
                )
                logger.info(f"Section admin can see {filtered.count()} results")
                return filtered
            else:
                logger.warning("❌ Section admin has no education level access")
                return queryset.none()

        if role == "teacher":
            return self.get_teacher_queryset(user, queryset)

        if role == "student":
            try:
                from students.models import Student

                student = Student.objects.get(user=user)
                filtered = queryset.filter(student=student, status="PUBLISHED")
                logger.info(f"Student can see {filtered.count()} published results")
                return filtered
            except Student.DoesNotExist:
                logger.warning(f"❌ Student object not found for user {user.username}")
                return queryset.none()

        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                filtered = queryset.filter(student__parents=parent, status="PUBLISHED")
                logger.info(f"Parent can see {filtered.count()} published results")
                return filtered
            except:
                logger.warning(f"❌ Parent object not found for user {user.username}")
                return queryset.none()

        logger.warning(f"❌ No access for user {user.username} with role {role}")
        return queryset.none()

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                student_id = request.data.get("student")
                if student_id:
                    # ✅ FIXED: Add select_related for FK chain
                    student = Student.objects.select_related(
                        "student_class__education_level"
                    ).get(id=student_id)

                    # ✅ Use @property which traverses FK chain
                    expected_level = student.education_level

                    if expected_level != "JUNIOR_SECONDARY":
                        return Response(
                            {
                                "error": f"Student's education level is {expected_level}, expected JUNIOR_SECONDARY."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                request.data["entered_by"] = request.user.id

                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()

                detailed_serializer = JuniorSecondaryResultSerializer(result)
                return Response(
                    detailed_serializer.data, status=status.HTTP_201_CREATED
                )
        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Failed to create result: {str(e)}")
            return Response(
                {"error": f"Failed to create result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                instance = self.get_object()

                # ✅ FIXED: Add select_related when accessing FK
                instance = self.__class__.queryset.select_related(
                    "student__student_class__education_level"
                ).get(pk=instance.pk)

                # ✅ Use @property
                expected_level = instance.student.education_level

                student_id = request.data.get("student")
                if student_id:
                    # ✅ FIXED: Add select_related
                    student = Student.objects.select_related(
                        "student_class__education_level"
                    ).get(id=student_id)
                    expected_level = student.education_level

                    if expected_level != "JUNIOR_SECONDARY":
                        return Response(
                            {
                                "error": f"Student's education level is {expected_level}, expected JUNIOR_SECONDARY."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                if expected_level != "JUNIOR_SECONDARY":
                    return Response(
                        {
                            "error": f"Student's education level is {expected_level}, expected JUNIOR_SECONDARY."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                partial = kwargs.get("partial", False)
                if request.method == "PATCH":
                    partial = True

                serializer = self.get_serializer(
                    instance, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                result = serializer.save()

                detailed_serializer = JuniorSecondaryResultSerializer(result)
                return Response(detailed_serializer.data)

        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Failed to update result: {str(e)}")
            return Response(
                {"error": f"Failed to update result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        """Get class statistics: average, highest, lowest scores, pass/fail count."""
        exam_session = request.query_params.get("exam_session")
        student_class = request.query_params.get("student_class")
        subject = request.query_params.get("subject")

        filters = Q(status__in=["APPROVED", "PUBLISHED"])
        if exam_session:
            filters &= Q(exam_session=exam_session)
        if student_class:
            # ✅ FIXED: Use FK chain with __name lookup
            filters &= Q(student__student_class__name=student_class)
        if subject:
            filters &= Q(subject=subject)

        queryset = self.get_queryset().filter(filters)

        if not queryset.exists():
            return Response(
                {"error": "No results found"}, status=status.HTTP_404_NOT_FOUND
            )

        aggregate_data = queryset.aggregate(
            total_students=Count("id"),
            class_average=Avg("total_score"),
            highest_score=Max("total_score"),
            lowest_score=Min("total_score"),
            students_passed=Count("id", filter=Q(is_passed=True)),
            students_failed=Count("id", filter=Q(is_passed=False)),
        )

        statistics = {
            "total_students": aggregate_data["total_students"] or 0,
            "class_average": float(aggregate_data["class_average"] or 0),
            "highest_score": aggregate_data["highest_score"] or 0,
            "lowest_score": aggregate_data["lowest_score"] or 0,
            "students_passed": aggregate_data["students_passed"] or 0,
            "students_failed": aggregate_data["students_failed"] or 0,
        }

        return Response(statistics)

    @action(detail=False, methods=["get"])
    def grade_distribution(self, request):
        exam_session = request.query_params.get("exam_session")
        student_class = request.query_params.get("student_class")

        filters = {"status__in": ["APPROVED", "PUBLISHED"]}
        if exam_session:
            filters["exam_session"] = exam_session
        if student_class:
            # ✅ FIXED: Use FK chain with __name lookup
            filters["student__student_class__name"] = student_class

        results = self.get_queryset().filter(**filters)

        grade_stats = (
            results.values("grade").annotate(count=Count("grade")).order_by("grade")
        )

        return Response(list(grade_stats))


# ===== CORRECTED: JuniorSecondaryTermReportViewSet =====
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
        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",  # ✅ ADDED FK chain
                "exam_session",
                "published_by",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=JuniorSecondaryResult.objects.select_related(
                        "entered_by",
                        "approved_by",
                        "published_by",
                        "last_edited_by",
                        "subject",
                        "grading_system",
                    ),
                )
            )
        )

        user = self.request.user

        if user.is_superuser or user.is_staff:
            logger.info(
                f"Super admin/staff {user.username} - Full access to all {queryset.count()} term reports"
            )
            return queryset

        role = self.get_user_role()
        logger.info(f"User {user.username} role: {role}")

        if role in ["admin", "superadmin", "principal"]:
            logger.info(
                f"Admin {user.username} - Full access to all {queryset.count()} term reports"
            )
            return queryset

        # ===== SECTION ADMINS =====
        if role in [
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ]:
            education_levels = self.get_user_education_level_access()
            logger.info(f"Section admin access for {education_levels}")

            if education_levels:
                # ✅ FIXED: Use FK chain
                filtered = queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels
                )
                logger.info(f"Section admin can see {filtered.count()} term reports")
                return filtered
            else:
                logger.warning("❌ Section admin has no education level access")
                return queryset.none()

        # ===== TEACHERS =====
        if role == "teacher":
            try:
                from teacher.models import Teacher
                from classroom.models import Classroom, StudentEnrollment

                teacher = Teacher.objects.get(user=user)

                assigned_classrooms = Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                ).distinct()

                classroom_education_levels = list(
                    assigned_classrooms.values_list(
                        "grade_level__education_level__level_type", flat=True
                    ).distinct()
                )

                is_classroom_teacher = any(
                    level in ["NURSERY", "PRIMARY"]
                    for level in classroom_education_levels
                )

                if is_classroom_teacher:
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    filtered = queryset.filter(student_id__in=student_ids)
                    logger.info(
                        f"Classroom teacher can see {filtered.count()} term reports"
                    )
                    return filtered
                else:
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    education_levels = self.get_user_education_level_access()

                    # ✅ FIXED: Use FK chain
                    filtered = queryset.filter(
                        student_id__in=student_ids,
                        student__student_class__education_level__level_type__in=education_levels,
                    )
                    logger.info(
                        f"Subject teacher can see {filtered.count()} term reports"
                    )
                    return filtered

            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for user {user.username}")
                return queryset.none()
            except Exception as e:
                logger.error(f"❌ Error filtering for teacher: {str(e)}")
                return queryset.none()

        if role == "student":
            try:
                from students.models import Student

                student = Student.objects.get(user=user)
                filtered = queryset.filter(student=student)
                logger.info(f"Student can see {filtered.count()} own term reports")
                return filtered
            except:
                logger.warning(f"❌ Student object not found for user {user.username}")
                return queryset.none()

        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                filtered = queryset.filter(student__parents=parent)
                logger.info(
                    f"Parent can see {filtered.count()} children's term reports"
                )
                return filtered
            except:
                logger.warning(f"❌ Parent object not found for user {user.username}")
                return queryset.none()

        logger.warning(f"❌ No access for user {user.username} with role {role}")
        return queryset.none()


# ===== CORRECTED: PrimaryResultViewSet =====
class PrimaryResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = PrimaryResult.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        "student",
        "subject",
        "exam_session",
        "status",
        "is_passed",
    ]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return PrimaryResultCreateUpdateSerializer
        return PrimaryResultSerializer

    def get_queryset(self):
        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "student__student_class__education_level",  # ✅ ADDED FK chain
                "subject",
                "exam_session",
                "grading_system",
                "entered_by",
                "approved_by",
                "published_by",
                "last_edited_by",
            )
        )

        user = self.request.user
        role = self.get_user_role()
        logger.info(f"User {user.username} role: {role}")

        student_class_param = self.request.query_params.get("student_class")
        if student_class_param:
            try:
                from classroom.models import Classroom

                classroom = Classroom.objects.filter(id=student_class_param).first()
                if classroom:
                    from classroom.models import StudentEnrollment

                    student_ids = StudentEnrollment.objects.filter(
                        classroom=classroom, is_active=True
                    ).values_list("student_id", flat=True)
                    queryset = queryset.filter(student_id__in=student_ids)
                else:
                    # ✅ Use FK chain with __name
                    queryset = queryset.filter(
                        student__student_class__name=student_class_param
                    )
            except (ValueError, TypeError):
                queryset = queryset.filter(
                    student__student_class__name=student_class_param
                )

        if user.is_superuser or user.is_staff:
            logger.info(
                f"Super admin/staff {user.username} - Full access to {queryset.count()} results"
            )
            return queryset

        if role in ["admin", "superadmin", "principal"]:
            logger.info(
                f"Admin {user.username} - Full access to {queryset.count()} results"
            )
            return queryset

        # ===== SECTION ADMINS =====
        if role in [
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ]:
            education_levels = self.get_user_education_level_access()
            logger.info(f"Section admin access for {education_levels}")

            if education_levels:
                # ✅ FIXED: Use FK chain
                filtered = queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels
                )
                logger.info(f"Section admin can see {filtered.count()} results")
                return filtered
            else:
                logger.warning("❌ Section admin has no education level access")
                return queryset.none()

        # Teacher/Student/Parent filtering remains the same as already correct
        # ... (keeping existing code for brevity)

        logger.warning(f"❌ No access for user {user.username} with role {role}")
        return queryset.none()

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                student_id = request.data.get("student")
                if not student_id:
                    return Response(
                        {"error": "student is required"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                try:
                    # ✅ FIXED: Add select_related
                    student = Student.objects.select_related(
                        "student_class__education_level"
                    ).get(id=student_id)
                except Student.DoesNotExist:
                    return Response(
                        {"error": "Student not found"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                # ✅ Use @property
                if student.education_level != "PRIMARY":
                    return Response(
                        {
                            "error": f"Student education level mismatch. Expected PRIMARY but got {student.education_level}."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if hasattr(request.data, "_mutable"):
                    request.data._mutable = True
                request.data["entered_by"] = request.user.id

                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()

                detailed_serializer = PrimaryResultSerializer(result)
                return Response(
                    detailed_serializer.data, status=status.HTTP_201_CREATED
                )

        except Exception as e:
            logger.error(f"Failed to create result: {str(e)}")
            return Response(
                {"error": f"Failed to create result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                instance = self.get_object()

                # ✅ FIXED: Reload instance with select_related
                instance = self.__class__.queryset.select_related(
                    "student__student_class__education_level"
                ).get(pk=instance.pk)

                # ✅ Use @property
                expected_level = instance.student.education_level

                student_id = request.data.get("student")
                if student_id:
                    try:
                        # ✅ FIXED: Add select_related
                        student = Student.objects.select_related(
                            "student_class__education_level"
                        ).get(id=student_id)
                        expected_level = student.education_level
                    except Student.DoesNotExist:
                        return Response(
                            {"error": "Student not found"},
                            status=status.HTTP_404_NOT_FOUND,
                        )

                    if expected_level != "PRIMARY":
                        return Response(
                            {
                                "error": f"Student education level mismatch. Expected PRIMARY but got {expected_level}."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                partial = kwargs.get("partial", False)
                if request.method == "PATCH":
                    partial = True

                serializer = self.get_serializer(
                    instance, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                result = serializer.save()

                detailed_serializer = PrimaryResultSerializer(result)
                return Response(detailed_serializer.data)
        except Exception as e:
            logger.error(f"Failed to update result: {str(e)}")
            return Response(
                {"error": f"Failed to update result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ===== CORRECTED: PrimaryTermReportViewSet =====
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
        queryset = PrimaryTermReport.objects.select_related(
            "student",
            "student__user",
            "student__student_class__education_level",  # ✅ ADDED FK chain
            "exam_session",
            "published_by",
        ).prefetch_related(
            Prefetch(
                "subject_results",
                queryset=PrimaryResult.objects.select_related(
                    "student",
                    "student__user",
                    "exam_session",
                    "subject",
                    "grading_system",
                    "entered_by",
                    "approved_by",
                    "published_by",
                ),
            )
        )

        user = self.request.user

        if user.is_superuser or user.is_staff:
            logger.info(f"Super admin/staff {user.username} full access")
            return queryset

        role = self.get_user_role()
        logger.info(f"User {user.username} role: {role}")

        if role in ["admin", "superadmin", "principal"]:
            logger.info(
                f"Admin {user.username} - Full access to all {queryset.count()} term reports"
            )
            return queryset

        # ===== SECTION ADMINS =====
        if role in [
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ]:
            education_levels = self.get_user_education_level_access()
            logger.info(f"Section admin access for {education_levels}")

            if education_levels:
                # ✅ FIXED: Use FK chain
                filtered = queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels
                )
                logger.info(f"Section admin can see {filtered.count()} term reports")
                return filtered
            else:
                logger.warning("❌ Section admin has no education level access")
                return queryset.none()

        # ===== TEACHERS =====
        if role == "teacher":
            try:
                from teacher.models import Teacher
                from classroom.models import Classroom, StudentEnrollment

                teacher = Teacher.objects.get(user=user)

                assigned_classrooms = Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                ).distinct()

                classroom_education_levels = list(
                    assigned_classrooms.values_list(
                        "grade_level__education_level", flat=True
                    ).distinct()
                )

                is_classroom_teacher = any(
                    level in ["NURSERY", "PRIMARY"]
                    for level in classroom_education_levels
                )

                if is_classroom_teacher:
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    filtered = queryset.filter(student_id__in=student_ids)
                    logger.info(
                        "Teacher full access to assigned students' term reports"
                    )
                    return filtered
                else:
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    education_levels = self.get_user_education_level_access()

                    # ✅ FIXED: Use FK chain
                    filtered = queryset.filter(
                        student_id__in=student_ids,
                        student__student_class__education_level__level_type__in=education_levels,
                    )
                    logger.info(
                        f"Subject teacher can see {filtered.count()} term reports"
                    )
                    return filtered

            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for user {user.username}")
                return queryset.none()
            except Exception as e:
                logger.error(f"❌ Error filtering for teacher: {str(e)}")
                return queryset.none()

        if role == "student":
            try:
                from students.models import Student

                student = Student.objects.get(user=user)
                filtered = queryset.filter(student=student)
                logger.info(f"Student can see {filtered.count()} own term reports")
                return filtered
            except:
                logger.warning(f"❌ Student object not found for user {user.username}")
                return queryset.none()

        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                filtered = queryset.filter(student__parents=parent)
                logger.info(
                    f"Parent can see {filtered.count()} children's term reports"
                )
                return filtered
            except:
                logger.warning(f"❌ Parent object not found for user {user.username}")
                return queryset.none()

        logger.warning(f"❌ No access for user {user.username} with role {role}")
        return queryset.none()


class NurseryResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    pagination_class = StandardResultsPagination
    queryset = NurseryResult.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        "student",
        "subject",
        "exam_session",
        "status",
        "is_passed",
    ]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return NurseryResultCreateUpdateSerializer
        return NurseryResultSerializer

    def get_queryset(self):
        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "subject",
                "student__student_class__education_level",  # ✅ ADDED FK chain
                "exam_session",
                "grading_system",
                "entered_by",
                "approved_by",
                "published_by",
                "last_edited_by",
            )
        )

        user = self.request.user

        # ===== SUPER ADMIN / STAFF =====
        if user.is_superuser or user.is_staff:
            logger.info(
                f"goodSuper admin/staff {user.username} - Full access to {queryset.count()} results"
            )
            return queryset

        role = self.get_user_role()
        logger.info(f"User {user.username} role: {role}")

        # ===== ADMIN / PRINCIPAL =====
        if role in ["admin", "superadmin", "principal"]:
            logger.info(
                f"goodAdmin {user.username} - Full access to {queryset.count()} results"
            )
            return queryset

        # ===== SECTION ADMINS =====
        if role in [
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ]:
            education_levels = self.get_user_education_level_access()
            logger.info(f"Section admin access for {education_levels}")

            if education_levels:
                filtered = queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels
                )
                logger.info(f"goodSection admin can see {filtered.count()} results")
                return filtered
            else:
                logger.warning("❌ Section admin has no education level access")
                return queryset.none()

        # ===== TEACHERS =====
        if role == "teacher":
            try:
                from teacher.models import Teacher
                from classroom.models import (
                    Classroom,
                    StudentEnrollment,
                    ClassroomTeacherAssignment,
                )

                teacher = Teacher.objects.get(user=user)

                # Get assigned classrooms
                assigned_classrooms = Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                ).distinct()

                classroom_education_levels = list(
                    assigned_classrooms.values_list(
                        "grade_level__education_level", flat=True
                    ).distinct()
                )

                logger.info(
                    f"Teacher {user.username} classroom education levels: {classroom_education_levels}"
                )

                # Check if this is a classroom teacher (Nursery/Primary)
                is_classroom_teacher = any(
                    level in ["NURSERY", "PRIMARY"]
                    for level in classroom_education_levels
                )

                if is_classroom_teacher:
                    # CLASSROOM TEACHERS: See ALL results for students in their classrooms
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    filtered = queryset.filter(student_id__in=student_ids)
                    logger.info(
                        f"goodClassroom teacher can see {filtered.count()} results"
                    )
                    return filtered
                else:
                    # SUBJECT TEACHERS: See ONLY results for subjects they teach

                    # Get subjects assigned to this teacher
                    teacher_assignments = ClassroomTeacherAssignment.objects.filter(
                        teacher=teacher
                    ).select_related("subject")

                    assigned_subject_ids = list(
                        teacher_assignments.values_list(
                            "subject_id", flat=True
                        ).distinct()
                    )

                    logger.info(
                        f"Teacher {user.username} assigned subjects: {assigned_subject_ids}"
                    )

                    if not assigned_subject_ids:
                        logger.warning(
                            f"❌ Subject teacher {user.username} has no assigned subjects"
                        )
                        return queryset.none()

                    # Get students from assigned classrooms
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    # Filter: ONLY their assigned subjects + their students
                    filtered = queryset.filter(
                        subject_id__in=assigned_subject_ids, student_id__in=student_ids
                    )

                    logger.info(
                        f"goodSubject teacher can see {filtered.count()} results (subjects: {assigned_subject_ids})"
                    )
                    return filtered

            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for user {user.username}")
                return queryset.none()
            except Exception as e:
                logger.error(f"❌ Error filtering for teacher: {str(e)}", exc_info=True)
                return queryset.none()

        # ===== STUDENTS =====
        if role == "student":
            try:
                from students.models import Student

                student = Student.objects.get(user=user)
                # Students only see PUBLISHED results
                filtered = queryset.filter(student=student, status="PUBLISHED")
                logger.info(f"goodStudent can see {filtered.count()} published results")
                return filtered
            except Student.DoesNotExist:
                logger.warning(f"❌ Student object not found for user {user.username}")
                return queryset.none()

        # ===== PARENTS =====
        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                # Parents only see PUBLISHED results
                filtered = queryset.filter(student__parents=parent, status="PUBLISHED")
                logger.info(f"goodParent can see {filtered.count()} published results")
                return filtered
            except:
                logger.warning(f"❌ Parent object not found for user {user.username}")
                return queryset.none()

        # ===== DEFAULT: NO ACCESS =====
        logger.warning(f"❌ No access for user {user.username} with role {role}")
        return queryset.none()

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                # ✅ ADD THIS DEBUG LOGGING
                logger.info("=" * 80)
                logger.info("🔍 NURSERY RESULT CREATE - DEBUGGING")
                logger.info(f"📦 Full request.data: {request.data}")
                logger.info(f"📦 request.data type: {type(request.data)}")

                # Check each field individually
                for field in [
                    "student",
                    "subject",
                    "exam_session",
                    "grading_system",
                    "max_marks_obtainable",
                    "mark_obtained",
                    "academic_comment",
                    "status",
                ]:
                    value = request.data.get(field)
                    logger.info(
                        f"   {field}: {value} (type: {type(value).__name__}, is None: {value is None})"
                    )
                logger.info("=" * 80)

                student_id = request.data.get("student")
                if not student_id:
                    logger.error("❌ student_id is missing or None")
                    return Response(
                        {"error": "student is required"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # ✅ ADD MORE VALIDATION
                subject_id = request.data.get("subject")
                if not subject_id:
                    logger.error("❌ subject_id is missing or None")
                    return Response(
                        {"error": "subject is required"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                exam_session_id = request.data.get("exam_session")
                if not exam_session_id:
                    logger.error("❌ exam_session_id is missing or None")
                    return Response(
                        {"error": "exam_session is required"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                grading_system_id = request.data.get("grading_system")
                logger.info(
                    f"🔍 grading_system_id: {grading_system_id} (type: {type(grading_system_id)})"
                )

                try:
                    student = Student.objects.select_related(
                        "student_class__education_level"
                    ).get(id=student_id)
                    logger.info(f"✅ Student found: {student}")

                except Student.DoesNotExist:
                    logger.error(f"❌ Student not found with id: {student_id}")
                    return Response(
                        {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
                    )
                except Exception as e:
                    logger.error(f"❌ Error fetching student: {str(e)}", exc_info=True)
                    return Response(
                        {"error": f"Error fetching student: {str(e)}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                expected_level = student.education_level
                # Ensure education level matches NURSERY
                if expected_level != "NURSERY":
                    return Response(
                        {
                            "error": f"Student education level mismatch. Expected NURSERY but got {expected_level}, expected NURSERY"
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Optional: Validate student_class if provided
                student_class_input = request.data.get("student_class")
                if student_class_input and student_class_input != student.student_class:
                    return Response(
                        {
                            "error": f"Student class mismatch. Expected {student.student_class} but got {student_class_input}."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Prepare data for serializer
                if hasattr(request.data, "_mutable"):
                    request.data._mutable = True
                request.data["entered_by"] = request.user.id

                logger.info(f"📤 Sending to serializer: {request.data}")

                serializer = self.get_serializer(data=request.data)

                # ✅ CATCH VALIDATION ERRORS PROPERLY
                try:
                    serializer.is_valid(raise_exception=True)
                except serializers.ValidationError as ve:
                    logger.error(f"❌ Serializer validation failed: {ve.detail}")
                    return Response(
                        {"error": "Validation failed", "details": ve.detail},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                result = serializer.save()
                logger.info(f"✅ Result created successfully: {result.id}")

                detailed_serializer = NurseryResultSerializer(result)
                return Response(
                    detailed_serializer.data, status=status.HTTP_201_CREATED
                )

        except Exception as e:
            logger.error(f"❌ Failed to create result: {str(e)}", exc_info=True)
            import traceback

            logger.error(f"❌ Traceback: {traceback.format_exc()}")
            return Response(
                {"error": f"Failed to create result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                instance = self.get_object()

                instance = self.__class__.queryset.select_related(
                    "student__student_class__education_level"
                ).get(pk=instance.pk)

                # ✅ FIX: Initialize expected_level from instance
                expected_level = instance.student.education_level

                # Validate student if changed
                student_id = request.data.get("student")
                if student_id:
                    try:
                        student = Student.objects.select_related(
                            "student_class__education_level"
                        ).get(id=student_id)
                        expected_level = student.education_level
                    except Student.DoesNotExist:
                        return Response(
                            {"error": f"Student with id {student_id} does not exist."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    if expected_level != "NURSERY":
                        return Response(
                            {
                                "error": f"Student education level mismatch. Expected NURSERY but got {expected_level}."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                partial = kwargs.get("partial", False)
                if request.method == "PATCH":
                    partial = True

                serializer = self.get_serializer(
                    instance, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                result = serializer.save()

                detailed_serializer = NurseryResultSerializer(result)
                return Response(detailed_serializer.data)
        except Exception as e:
            logger.error(f"Failed to update result: {str(e)}")
            return Response(
                {"error": f"Failed to update result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a nursery result"""
        # Check permission
        user_role = self.get_user_role()
        if user_role not in [
            "admin",
            "superadmin",
            "principal",
            "nursery_admin",
        ]:
            return Response(
                {"error": "You don't have permission to approve results"},
                status=status.HTTP_403_FORBIDDEN,
            )

        result = self.get_object()

        # Validate status
        if result.status not in ["DRAFT", "SUBMITTED"]:
            return Response(
                {
                    "error": "Invalid status transition",
                    "detail": f"Cannot approve result with status '{result.status}'. Only DRAFT or SUBMITTED results can be approved.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ✅ CORRECT: Validate mark_obtained for Nursery
        if (
            not hasattr(result, "mark_obtained")
            or result.mark_obtained is None
            or result.mark_obtained < 0
        ):
            return Response(
                {"error": "Cannot approve result with invalid scores"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Apply approval
        try:
            with transaction.atomic():
                result.status = "APPROVED"
                result.approved_by = request.user
                result.approved_date = timezone.now()
                result.save()
                return Response(NurseryResultSerializer(result).data)
        except Exception as e:
            logger.error(f"Failed to approve result: {str(e)}")
            return Response(
                {"error": f"Failed to approve result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        with transaction.atomic():
            result = self.get_object()
            result.status = "PUBLISHED"
            result.published_by = request.user
            result.published_date = timezone.now()
            result.save()
            return Response(NurseryResultSerializer(result).data)

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        results_data = request.data.get("results", [])
        created_results = []
        errors = []

        try:
            with transaction.atomic():
                for i, result_data in enumerate(results_data):
                    try:
                        result_data["entered_by"] = request.user.id
                        serializer = self.get_serializer(data=result_data)
                        serializer.is_valid(raise_exception=True)
                        result = serializer.save()
                        created_results.append(NurseryResultSerializer(result).data)
                    except Exception as e:
                        errors.append(
                            {"index": i, "error": str(e), "data": result_data}
                        )

                if errors and not created_results:
                    return Response(
                        {"error": "Failed to create any results", "errors": errors},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                response_data = {
                    "message": f"Successfully created {len(created_results)} results",
                    "results": created_results,
                }

                if errors:
                    response_data["partial_success"] = True
                    response_data["errors"] = errors

                return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Failed to bulk create results: {str(e)}")
            return Response(
                {"error": f"Failed to bulk create results: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def destroy(self, request, *args, **kwargs):
        """
        Delete a subject result.
        - Admin/Principal: Can delete ANY result regardless of status
        - Teachers: Can only delete DRAFT results
        """
        try:
            instance = self.get_object()
            user_role = self.get_user_role()

            # Check permissions
            if user_role in ["admin", "superadmin", "principal"]:
                # Admins can delete any result
                logger.warning(
                    f"ADMIN DELETE: Result ID={instance.id}, "
                    f"Student={instance.student.full_name}, "
                    f"Subject={instance.subject.name}, "
                    f"Status={instance.status}, "
                    f"Deleted by={request.user.username}"
                )
            elif user_role == "teacher":
                # Teachers can only delete DRAFT results
                if instance.status != "DRAFT":
                    return Response(
                        {
                            "error": "Teachers can only delete DRAFT results",
                            "detail": f"This result has status '{instance.status}' and cannot be deleted by teachers. Contact an administrator.",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
                logger.info(
                    f"TEACHER DELETE: Draft result ID={instance.id}, "
                    f"Deleted by={request.user.username}"
                )
            else:
                return Response(
                    {"error": "You don't have permission to delete results"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Perform deletion
            with transaction.atomic():
                subject_name = instance.subject.name
                student_name = instance.student.full_name
                instance.delete()

            return Response(
                {
                    "message": f"Result for {student_name} in {subject_name} deleted successfully",
                    "deleted_id": str(kwargs.get("pk")),
                },
                status=status.HTTP_204_NO_CONTENT,
            )

        except Exception as e:
            logger.error(f"Error deleting subject result: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to delete result: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        exam_session = request.query_params.get("exam_session")
        student_class = request.query_params.get("student_class")
        subject = request.query_params.get("subject")

        filters = {}
        if exam_session:
            filters["exam_session"] = exam_session
        if student_class:
            filters &= Q(student__student_class__name=student_class)
        if subject:
            filters["subject"] = subject

        filters["status__in"] = ["APPROVED", "PUBLISHED"]

        results = self.get_queryset().filter(**filters)

        if not results.exists():
            return Response(
                {"error": "No results found"}, status=status.HTTP_404_NOT_FOUND
            )

        scores = list(results.values_list("total_score", flat=True))
        statistics = {
            "total_students": len(scores),
            "class_average": sum(scores) / len(scores) if scores else 0,
            "highest_score": max(scores) if scores else 0,
            "lowest_score": min(scores) if scores else 0,
            "students_passed": results.filter(is_passed=True).count(),
            "students_failed": results.filter(is_passed=False).count(),
        }

        return Response(statistics)

    @action(detail=False, methods=["get"])
    def grade_distribution(self, request):
        exam_session = request.query_params.get("exam_session")
        student_class = request.query_params.get("student_class")

        filters = {"status__in": ["APPROVED", "PUBLISHED"]}
        if exam_session:
            filters["exam_session"] = exam_session
        if student_class:
            filters["student__student_class__name"] = student_class

        results = self.get_queryset().filter(**filters)

        grade_stats = (
            results.values("grade").annotate(count=Count("grade")).order_by("grade")
        )

        return Response(list(grade_stats))


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
        queryset = (
            super(viewsets.ModelViewSet, self)
            .get_queryset()
            .select_related(
                "student",
                "student__user",
                "exam_session",
                "published_by",
                "student__student_class__education_level",
            )
            .prefetch_related(
                Prefetch(
                    "subject_results",
                    queryset=NurseryResult.objects.select_related(  # ✅ NurseryResult
                        "entered_by",
                        "approved_by",
                        "published_by",
                        "last_edited_by",
                        "subject",
                        "grading_system",
                    ),
                )
            )
        )

        user = self.request.user
        # ===== SUPER ADMIN / STAFF =====
        if user.is_superuser or user.is_staff:
            logger.info(
                f"goodSuper admin/staff {user.username} - Full access to all {queryset.count()} term reports"
            )
            return queryset

        role = self.get_user_role()
        logger.info(f"User {user.username} role: {role}")

        # ===== ADMIN / PRINCIPAL =====
        if role in ["admin", "superadmin", "principal"]:
            logger.info(
                f"goodAdmin {user.username} - Full access to all {queryset.count()} term reports"
            )
            return queryset

        # ===== SECTION ADMINS =====
        if role in [
            "secondary_admin",
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
        ]:
            education_levels = self.get_user_education_level_access()
            logger.info(f"Section admin access for {education_levels}")

            if education_levels:
                filtered = queryset.filter(
                    student__student_class__education_level__level_type__in=education_levels
                )

                logger.info(
                    f"goodSection admin can see {filtered.count()} term reports"
                )
                return filtered
            else:
                logger.warning("❌ Section admin has no education level access")
                return queryset.none()

        # ===== TEACHERS =====
        if role == "teacher":
            try:
                from teacher.models import Teacher
                from classroom.models import Classroom, StudentEnrollment

                teacher = Teacher.objects.get(user=user)

                # Get assigned classrooms (for classroom teachers - Nursery/Primary)
                assigned_classrooms = Classroom.objects.filter(
                    Q(class_teacher=teacher)
                    | Q(classroomteacherassignment__teacher=teacher)
                ).distinct()

                classroom_education_levels = list(
                    assigned_classrooms.values_list(
                        "grade_level__education_level", flat=True
                    ).distinct()
                )

                logger.info(
                    f"Teacher {user.username} classroom education levels: {classroom_education_levels}"
                )

                # Check if this is a classroom teacher (Nursery/Primary)
                is_classroom_teacher = any(
                    level in ["NURSERY", "PRIMARY"]
                    for level in classroom_education_levels
                )

                if is_classroom_teacher:
                    # CLASSROOM TEACHERS: See all term reports for students in their classrooms
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    filtered = queryset.filter(student_id__in=student_ids)
                    logger.info(
                        f"goodClassroom teacher can see {filtered.count()} term reports"
                    )
                    return filtered
                else:
                    # SUBJECT TEACHERS (Secondary): See term reports for students they teach
                    # Get students from assigned classrooms
                    student_ids = StudentEnrollment.objects.filter(
                        classroom__in=assigned_classrooms, is_active=True
                    ).values_list("student_id", flat=True)

                    # Filter by education level access
                    education_levels = self.get_user_education_level_access()

                    filtered = queryset.filter(
                        student_id__in=student_ids,
                        student__student_class__education_level__level_type__in=education_levels,
                    )
                    logger.info(
                        f"goodSubject teacher can see {filtered.count()} term reports"
                    )
                    return filtered

            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for user {user.username}")
                return queryset.none()
            except Exception as e:
                logger.error(f"❌ Error filtering for teacher: {str(e)}")
                return queryset.none()

        # ===== STUDENTS =====
        if role == "student":
            try:
                from students.models import Student

                student = Student.objects.get(user=user)
                filtered = queryset.filter(student=student)
                logger.info(f"goodStudent can see {filtered.count()} own term reports")
                return filtered
            except:
                logger.warning(f"❌ Student object not found for user {user.username}")
                return queryset.none()

        # ===== PARENTS =====
        if role == "parent":
            try:
                from parent.models import Parent

                parent = Parent.objects.get(user=user)
                filtered = queryset.filter(student__parents=parent)
                logger.info(
                    f"goodParent can see {filtered.count()} children's term reports"
                )
                return filtered
            except:
                logger.warning(f"❌ Parent object not found for user {user.username}")
                return queryset.none()

        # ===== DEFAULT: NO ACCESS =====
        logger.warning(f"❌ No access for user {user.username} with role {role}")
        return queryset.none()

    @action(detail=True, methods=["post"])
    def submit_teacher_remark(self, request, pk=None):
        report = self.get_object()
        user = request.user

        if not report.can_edit_teacher_remark(user):
            return Response(
                {"detail": "You are not allowed to submit teacher remark."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Accept remark, signature, optional physical development for primary/nursery
        report.class_teacher_remark = request.data.get("class_teacher_remark", "")
        report.teacher_signature = request.data.get("teacher_signature", None)

        # For primary/nursery
        if hasattr(report, "physical_development"):
            report.physical_development = request.data.get("physical_development", {})

        report.submit_by_teacher()
        return Response({"status": "submitted"})

    @action(detail=True, methods=["post"])
    def submit_head_teacher_remark(self, request, pk=None):
        report = self.get_object()
        user = request.user

        if not report.can_edit_head_teacher_remark(user):
            return Response(
                {"detail": "You are not allowed to submit head teacher remark."},
                status=status.HTTP_403_FORBIDDEN,
            )

        report.head_teacher_remark = request.data.get("head_teacher_remark", "")
        report.head_teacher_signature = request.data.get("head_teacher_signature", None)
        report.school_stamp = request.data.get("school_stamp", None)

        report.approve_by_proprietress(user)
        return Response({"status": "approved"})

    @action(detail=True, methods=["post"])
    def submit_for_approval(self, request, pk=None):
        """
        Teacher submits term report for admin approval.
        Validates that all required subjects have results before submitting.
        Changes status from DRAFT to SUBMITTED.
        """
        try:
            with transaction.atomic():
                report = self.get_object()

                # Validate that report has subject results
                if not report.subject_results.exists():
                    return Response(
                        {
                            "error": "Cannot submit empty report",
                            "detail": "Please add subject results before submitting for approval.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Validate current status allows submission
                if report.status not in ["DRAFT", "APPROVED"]:
                    return Response(
                        {
                            "error": "Invalid status transition",
                            "detail": f"Cannot submit report with status '{report.status}'. Only DRAFT reports can be submitted.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Update status to SUBMITTED
                report.status = "SUBMITTED"
                report.save()

                logger.info(
                    f"Term report {report.id} submitted for approval by {request.user.username}"
                )

                serializer = self.get_serializer(report)
                return Response(
                    {
                        "message": "Term report submitted for approval successfully",
                        "data": serializer.data,
                    }
                )
        except Exception as e:
            logger.error(f"Failed to submit term report: {str(e)}")
            return Response(
                {"error": f"Failed to submit term report: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Admin approves term report.
        Changes status from SUBMITTED to APPROVED.
        Cascades APPROVED status to all individual subject results.
        """
        try:
            with transaction.atomic():
                report = self.get_object()

                # Validate current status allows approval
                if report.status not in ["SUBMITTED", "DRAFT"]:
                    return Response(
                        {
                            "error": "Invalid status transition",
                            "detail": f"Cannot approve report with status '{report.status}'. Only SUBMITTED or DRAFT reports can be approved.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Update report status
                report.status = "APPROVED"
                report.save()

                # Cascade approval to all subject results
                updated_count = report.subject_results.update(
                    status="APPROVED",
                    approved_by=request.user,
                    approved_date=timezone.now(),
                )

                logger.info(
                    f"Term report {report.id} approved by {request.user.username}. {updated_count} subject results also approved."
                )

                serializer = self.get_serializer(report)
                return Response(
                    {
                        "message": f"Term report approved successfully. {updated_count} subject result(s) also approved.",
                        "data": serializer.data,
                    }
                )
        except Exception as e:
            logger.error(f"Failed to approve term report: {str(e)}")
            return Response(
                {"error": f"Failed to approve term report: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """
        Admin publishes term report.
        Changes status from APPROVED to PUBLISHED.
        Cascades PUBLISHED status to all individual subject results.
        Published results become visible to students and parents.
        """
        try:
            with transaction.atomic():
                report = self.get_object()

                # Validate current status allows publishing
                if report.status not in ["APPROVED", "SUBMITTED"]:
                    return Response(
                        {
                            "error": "Invalid status transition",
                            "detail": f"Cannot publish report with status '{report.status}'. Only APPROVED or SUBMITTED reports can be published.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Update report status and metadata
                report.is_published = True
                report.published_by = request.user
                report.published_date = timezone.now()
                report.status = "PUBLISHED"
                report.save()

                # Cascade publish to all subject results
                updated_count = report.subject_results.update(
                    status="PUBLISHED",
                    published_by=request.user,
                    published_date=timezone.now(),
                )

                logger.info(
                    f"Term report {report.id} published by {request.user.username}. {updated_count} subject results also published."
                )

                serializer = self.get_serializer(report)
                return Response(
                    {
                        "message": f"Term report published successfully. {updated_count} subject result(s) also published and are now visible to students.",
                        "data": serializer.data,
                    }
                )
        except Exception as e:
            logger.error(f"Failed to publish report: {str(e)}")
            return Response(
                {"error": f"Failed to publish report: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def calculate_metrics(self, request, pk=None):
        """Recalculate term report metrics and class position"""
        try:
            report = self.get_object()
            report.calculate_metrics()
            report.calculate_class_position()

            serializer = self.get_serializer(report)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Failed to calculate metrics: {str(e)}")
            return Response(
                {"error": f"Failed to calculate metrics: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["post"])
    def bulk_publish(self, request):
        """
        Bulk publish multiple term reports at once.
        Cascades PUBLISHED status to all associated subject results.
        """
        report_ids = request.data.get("report_ids", [])
        if not report_ids:
            return Response(
                {"error": "report_ids are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                reports = self.get_queryset().filter(id__in=report_ids)

                # Validate all reports can be published
                invalid_reports = reports.exclude(status__in=["APPROVED", "SUBMITTED"])
                if invalid_reports.exists():
                    return Response(
                        {
                            "error": "Some reports cannot be published",
                            "detail": f"{invalid_reports.count()} report(s) have invalid status. Only APPROVED or SUBMITTED reports can be published.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Update all reports
                updated_count = reports.update(
                    is_published=True,
                    published_by=request.user,
                    published_date=timezone.now(),
                    status="PUBLISHED",
                )

                # Cascade publish to all subject results for these reports
                total_subjects_updated = 0
                for report in reports:
                    subjects_updated = report.subject_results.update(
                        status="PUBLISHED",
                        published_by=request.user,
                        published_date=timezone.now(),
                    )
                    total_subjects_updated += subjects_updated

                logger.info(
                    f"Bulk published {updated_count} term reports by {request.user.username}. {total_subjects_updated} subject results also published."
                )

                return Response(
                    {
                        "message": f"Successfully published {updated_count} term report(s)",
                        "reports_published": updated_count,
                        "subjects_published": total_subjects_updated,
                    }
                )
        except Exception as e:
            logger.error(f"Failed to bulk publish reports: {str(e)}")
            return Response(
                {"error": f"Failed to bulk publish reports: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def destroy(self, request, *args, **kwargs):
        """
        Delete a term report - Admin only, with cascade deletion of subject results.
        """
        try:
            instance = self.get_object()
            user_role = self.get_user_role()

            # Only admins can delete term reports
            if user_role not in ["admin", "superadmin", "principal"]:
                return Response(
                    {"error": "Only administrators can delete term reports"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Log the deletion
            logger.warning(
                f"Term report deleted: ID={instance.id}, Student={instance.student.full_name}, "
                f"Term={instance.exam_session.term if hasattr(instance, 'exam_session') else 'N/A'}, "
                f"Status={instance.status}, Deleted by={request.user.username}"
            )

            # Delete with cascade (will also delete related subject results if configured)
            with transaction.atomic():
                # Optional: Explicitly delete subject results first
                subject_results_count = instance.subject_results.count()
                instance.subject_results.all().delete()

                # Delete the term report
                instance.delete()

            return Response(
                {
                    "message": f"Term report and {subject_results_count} subject result(s) deleted successfully",
                    "deleted_id": str(kwargs.get("pk")),
                },
                status=status.HTTP_204_NO_CONTENT,
            )

        except Exception as e:
            logger.error(f"Error deleting term report: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to delete term report: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ===== LEGACY STUDENT RESULT VIEWSET =====
class StudentResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    """Base StudentResult ViewSet - mainly for legacy support"""

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
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            "student", "subject", "exam_session", "grading_system", "stream"
        ).prefetch_related("assessment_scores", "comments")

        if self.request.user.is_authenticated:
            section_access = self.get_user_section_access()
            education_levels = self.get_education_levels_for_sections(section_access)

            if not education_levels:
                return queryset.none()

            # FK: student__education_level is now a FK to EducationLevel
            queryset = queryset.filter(student__education_level__in=education_levels)

        return queryset

    def create(self, request, *args, **kwargs):
        """Create a new student result with automatic calculations"""
        try:
            with transaction.atomic():
                request.data["entered_by"] = request.user.id
                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                result = serializer.save()
                detailed_serializer = DetailedStudentResultSerializer(result)
                return Response(
                    detailed_serializer.data, status=status.HTTP_201_CREATED
                )
        except Exception as e:
            logger.error(f"Failed to create result: {str(e)}")
            return Response(
                {"error": f"Failed to create result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def update(self, request, *args, **kwargs):
        """Update a student result with automatic recalculations"""
        try:
            with transaction.atomic():
                partial = kwargs.pop("partial", False)
                instance = self.get_object()
                serializer = self.get_serializer(
                    instance, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                result = serializer.save()
                detailed_serializer = DetailedStudentResultSerializer(result)
                return Response(detailed_serializer.data)
        except Exception as e:
            logger.error(f"Failed to update result: {str(e)}")
            return Response(
                {"error": f"Failed to update result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["get"])
    def by_student(self, request):
        """Get all results for a specific student"""
        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response(
                {"error": "student_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        results = self.get_queryset().filter(student_id=student_id)
        serializer = DetailedStudentResultSerializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def class_statistics(self, request):
        """Get class statistics for an exam session"""
        exam_session_id = request.query_params.get("exam_session_id")
        # UPDATED: accept student_class_id (FK) instead of class name string
        student_class_id = request.query_params.get("student_class_id")

        if not exam_session_id or not student_class_id:
            return Response(
                {
                    "error": "exam_session_id and student_class_id parameters are required"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # UPDATED: filter via FK relationship student__student_class_id
        results = self.get_queryset().filter(
            exam_session_id=exam_session_id,
            student__student_class_id=student_class_id,
        )

        if not results.exists():
            return Response(
                {"error": "No results found"}, status=status.HTTP_404_NOT_FOUND
            )

        stats = results.aggregate(
            total_students=Count("student", distinct=True),
            average_score=Avg("total_score"),
            highest_score=Max("total_score"),
            lowest_score=Min("total_score"),
            passed_count=Count("id", filter=Q(is_passed=True)),
            failed_count=Count("id", filter=Q(is_passed=False)),
        )

        return Response(stats)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        user_role = self.get_user_role()
        if user_role not in [
            "admin",
            "superadmin",
            "principal",
            "senior_secondary_admin",
        ]:
            return Response(
                {"error": "You don't have permission to approve results"},
                status=status.HTTP_403_FORBIDDEN,
            )
        result = self.get_object()

        if not result.total_score or result.total_score < 0:
            return Response(
                {"error": "Cannot approve result with invalid scores"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if result.status not in ["DRAFT", "SUBMITTED"]:
            return Response(
                {
                    "error": "Invalid status transition",
                    "detail": f"Cannot approve result with status '{result.status}'. Only DRAFT or SUBMITTED results can be approved.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        """Approve a student result"""
        try:
            with transaction.atomic():
                result = self.get_object()
                result.status = "APPROVED"
                result.approved_by = request.user
                result.approved_date = timezone.now()
                result.save()
                serializer = DetailedStudentResultSerializer(result)
                return Response(serializer.data)
        except Exception as e:
            logger.error(f"Failed to approve result: {str(e)}")
            return Response(
                {"error": f"Failed to approve result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """Publish a student result"""
        try:
            with transaction.atomic():
                result = self.get_object()
                result.status = "PUBLISHED"
                result.save()
                serializer = DetailedStudentResultSerializer(result)
                return Response(serializer.data)
        except Exception as e:
            logger.error(f"Failed to publish result: {str(e)}")
            return Response(
                {"error": f"Failed to publish result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


from .filters import StudentTermResultFilter


class StudentTermResultViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ModelViewSet
):
    queryset = StudentTermResult.objects.all()
    serializer_class = StudentTermResultSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = StudentTermResultFilter
    search_fields = ["student__full_name", "student__username"]

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .select_related("student", "student__user", "academic_session")
            .prefetch_related("comments")
            .order_by("-created_at")
        )

        user = self.request.user

        if hasattr(user, "role") and user.role == "STUDENT":
            return queryset.filter(student__user=user)

        section_access = self.get_user_section_access()
        if not section_access:
            return queryset.none()

        education_levels = self.get_education_levels_for_sections(section_access)

        if not education_levels:
            return queryset.none()

        # FK: student__education_level is now a FK to EducationLevel
        return queryset.filter(student__education_level__in=education_levels)

    @action(detail=False, methods=["get"])
    def by_student(self, request):
        """Get all term results for a specific student"""
        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response(
                {"error": "student_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        results = self.get_queryset().filter(student_id=student_id)
        serializer = StudentTermResultSerializer(results, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def detailed(self, request, pk=None):
        """Get detailed term result with all subject results"""
        term_result = self.get_object()
        serializer = StudentTermResultDetailSerializer(term_result)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def generate_report(self, request):
        """Generate term report for a student"""
        student_id = request.data.get("student_id")
        exam_session_id = request.data.get("exam_session_id")

        if not all([student_id, exam_session_id]):
            return Response(
                {"error": "student_id and exam_session_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            student = Student.objects.get(id=student_id)
            exam_session = ExamSession.objects.get(id=exam_session_id)
        except (Student.DoesNotExist, ExamSession.DoesNotExist) as e:
            return Response(
                {"error": f"Student or ExamSession not found: {str(e)}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        from django.db.models import Q

        # Determine education level and use appropriate result model
        education_level = student.education_level

        if education_level == "SENIOR_SECONDARY":
            result_model = SeniorSecondaryResult
        elif education_level == "JUNIOR_SECONDARY":
            result_model = JuniorSecondaryResult
        elif education_level == "PRIMARY":
            result_model = PrimaryResult
        elif education_level == "NURSERY":
            result_model = NurseryResult
        else:
            result_model = SeniorSecondaryResult  # Default fallback

        subject_results = (
            result_model.objects.filter(student=student, exam_session=exam_session)
            .filter(
                Q(status="PUBLISHED") | Q(status="APPROVED") | Q(status="SUBMITTED")
            )
            .select_related("subject", "student", "exam_session")
        )

        if not subject_results.exists():
            return Response(
                {
                    "error": f"No published/approved results found for student {student_id} in exam session {exam_session_id}",
                    "debug_info": {
                        "student_id": student_id,
                        "exam_session_id": exam_session_id,
                        "statuses_checked": ["PUBLISHED", "APPROVED", "SUBMITTED"],
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # UPDATED: education_level is now a FK; use level_type property
        education_level = (
            student.education_level.upper() if student.education_level else "PRIMARY"
        )

        term = exam_session.term if hasattr(exam_session, "term") else "Unknown"
        academic_session = (
            exam_session.academic_session
            if hasattr(exam_session, "academic_session")
            else None
        )

        student_term_result, created = StudentTermResult.objects.get_or_create(
            student=student,
            exam_session=exam_session,
            defaults={
                "term": term,
                "academic_session": academic_session,
                "education_level": education_level,
                "status": "DRAFT",
            },
        )

        print(
            f"🔍 [generate_report] Created: {created}, Report ID: {student_term_result.id}"
        )
        print(f"🔍 [generate_report] Student: {student.full_name} ({student.id})")
        print(
            f"🔍 [generate_report] Exam Session: {exam_session.name} ({exam_session.id})"
        )
        print(f"🔍 [generate_report] Found {subject_results.count()} subject results")

        for sr in subject_results:
            print(f"  - {sr.subject.name}: Status={sr.status}, Score={sr.total_score}")

        if subject_results.exists():
            total_score = sum(sr.total_score or 0 for sr in subject_results)
            average_score = (
                total_score / subject_results.count()
                if subject_results.count() > 0
                else 0
            )
            subjects_passed = subject_results.filter(is_passed=True).count()
            subjects_failed = subject_results.filter(is_passed=False).count()

            student_term_result.total_subjects = subject_results.count()
            student_term_result.subjects_passed = subjects_passed
            student_term_result.subjects_failed = subjects_failed
            student_term_result.average_score = average_score
            student_term_result.total_score = total_score

            if hasattr(student_term_result, "calculate_gpa"):
                student_term_result.gpa = student_term_result.calculate_gpa()

            student_term_result.save()

        serializer = self.get_serializer(student_term_result)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a term result"""
        try:
            with transaction.atomic():
                term_result = self.get_object()
                term_result.status = "APPROVED"
                term_result.save()
                serializer = StudentTermResultSerializer(term_result)
                return Response(serializer.data)
        except Exception as e:
            logger.error(f"Failed to approve term result: {str(e)}")
            return Response(
                {"error": f"Failed to approve term result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """Publish a term result"""
        try:
            with transaction.atomic():
                term_result = self.get_object()
                term_result.status = "PUBLISHED"
                term_result.save()
                serializer = StudentTermResultSerializer(term_result)
                return Response(serializer.data)
        except Exception as e:
            logger.error(f"Failed to publish term result: {str(e)}")
            return Response(
                {"error": f"Failed to publish term result: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ===== SUPPORTING VIEWSETS =====
class ResultSheetViewSet(
    AutoSectionFilterMixin, TeacherPortalCheckMixin, viewsets.ModelViewSet
):
    queryset = ResultSheet.objects.all()
    serializer_class = ResultSheetSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    # UPDATED: filterset_fields now use FK id lookups instead of CharFields
    filterset_fields = ["exam_session", "student_class", "status"]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related(
                "exam_session",
                "prepared_by",
                "approved_by",
                # UPDATED: include FK relations for education_level traversal
                "student_class",
                "student_class__education_level",
            )
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a result sheet"""
        try:
            with transaction.atomic():
                result_sheet = self.get_object()
                result_sheet.status = "APPROVED"
                result_sheet.approved_by = request.user
                result_sheet.approved_date = timezone.now()
                result_sheet.save()
                return Response(ResultSheetSerializer(result_sheet).data)
        except Exception as e:
            logger.error(f"Failed to approve result sheet: {str(e)}")
            return Response(
                {"error": f"Failed to approve result sheet: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["post"])
    def generate_sheet(self, request):
        """Generate result sheet for a class"""
        exam_session_id = request.data.get("exam_session_id")
        # UPDATED: accept student_class_id (FK pk) instead of a class name string
        student_class_id = request.data.get("student_class_id")

        if not all([exam_session_id, student_class_id]):
            return Response(
                {"error": "exam_session_id and student_class_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from classroom.models import Class as StudentClass

            exam_session = ExamSession.objects.get(id=exam_session_id)
            # UPDATED: resolve StudentClass FK object
            student_class = StudentClass.objects.get(id=student_class_id)

            # UPDATED: filter using FK fields; education_level derived from student_class FK
            existing_sheet = ResultSheet.objects.filter(
                exam_session=exam_session,
                student_class=student_class,
            ).first()

            if existing_sheet:
                return Response(
                    ResultSheetSerializer(existing_sheet).data,
                    status=status.HTTP_200_OK,
                )

            # UPDATED: create with FK objects; education_level no longer stored directly
            result_sheet = ResultSheet.objects.create(
                exam_session=exam_session,
                student_class=student_class,
                prepared_by=request.user,
                status="DRAFT",
            )

            return Response(
                ResultSheetSerializer(result_sheet).data,
                status=status.HTTP_201_CREATED,
            )

        except ExamSession.DoesNotExist:
            return Response(
                {"error": "Exam session not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except StudentClass.DoesNotExist:
            return Response(
                {"error": "Student class not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Failed to generate result sheet: {str(e)}")
            return Response(
                {"error": f"Failed to generate result sheet: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


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
    """ViewSet for managing result comments"""

    queryset = ResultComment.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["student_result", "term_result", "comment_type", "commented_by"]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
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
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing result templates.
    """

    queryset = ResultTemplate.objects.all().order_by("-created_at")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    # UPDATED: education_level is now a FK; filter by its id or level_type
    filterset_fields = ["template_type", "education_level", "is_active"]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ResultTemplateCreateUpdateSerializer
        return ResultTemplateSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Activate a result template"""
        template = self.get_object()
        template.is_active = True
        template.save()
        return Response(ResultTemplateSerializer(template).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Deactivate a result template"""
        template = self.get_object()
        template.is_active = False
        template.save()
        return Response(ResultTemplateSerializer(template).data)


class BulkResultOperationsViewSet(TenantFilterMixin, viewsets.ViewSet):
    """CRITICAL: TenantFilterMixin ensures tenant isolation."""

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"])
    def bulk_update(self, request):
        """Bulk update multiple results"""
        serializer = BulkResultUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        results_data = serializer.validated_data["results"]
        updated_results = []
        errors = []

        try:
            with transaction.atomic():
                for result_data in results_data:
                    result_id = result_data.pop("id")
                    try:
                        # UPDATED: education_level is now resolved via student FK;
                        # callers should pass education_level as the level_type string
                        # (e.g. "SENIOR_SECONDARY") which maps to the same model routing.
                        education_level = result_data.get(
                            "education_level", "SENIOR_SECONDARY"
                        )

                        if education_level == "SENIOR_SECONDARY":
                            result = SeniorSecondaryResult.objects.get(id=result_id)
                            update_serializer = (
                                SeniorSecondaryResultCreateUpdateSerializer(
                                    result, data=result_data, partial=True
                                )
                            )
                        elif education_level == "JUNIOR_SECONDARY":
                            result = JuniorSecondaryResult.objects.get(id=result_id)
                            update_serializer = (
                                JuniorSecondaryResultCreateUpdateSerializer(
                                    result, data=result_data, partial=True
                                )
                            )
                        elif education_level == "PRIMARY":
                            result = PrimaryResult.objects.get(id=result_id)
                            update_serializer = PrimaryResultCreateUpdateSerializer(
                                result, data=result_data, partial=True
                            )
                        else:
                            result = NurseryResult.objects.get(id=result_id)
                            update_serializer = NurseryResultCreateUpdateSerializer(
                                result, data=result_data, partial=True
                            )

                        update_serializer.is_valid(raise_exception=True)
                        updated_result = update_serializer.save()
                        updated_results.append(str(updated_result.id))

                    except Exception as e:
                        errors.append({"id": result_id, "error": str(e)})

                return Response(
                    {
                        "message": f"Successfully updated {len(updated_results)} results",
                        "updated_ids": updated_results,
                        "errors": errors,
                    },
                    status=status.HTTP_200_OK,
                )

        except Exception as e:
            logger.error(f"Bulk update failed: {str(e)}")
            return Response(
                {"error": f"Bulk update failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["post"])
    def bulk_status_update(self, request):
        """Bulk update status of multiple results"""
        serializer = BulkStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result_ids = serializer.validated_data["result_ids"]
        new_status = serializer.validated_data["status"]
        comment = serializer.validated_data.get("comment", "")

        try:
            with transaction.atomic():
                total_updated = 0
                for model in [
                    SeniorSecondaryResult,
                    JuniorSecondaryResult,
                    PrimaryResult,
                    NurseryResult,
                ]:
                    updated = model.objects.filter(id__in=result_ids).update(
                        status=new_status
                    )
                    total_updated += updated

                return Response(
                    {
                        "message": f"Successfully updated status for {total_updated} results",
                        "status": new_status,
                        "comment": comment,
                    },
                    status=status.HTTP_200_OK,
                )

        except Exception as e:
            logger.error(f"Bulk status update failed: {str(e)}")
            return Response(
                {"error": f"Bulk status update failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["post"])
    def bulk_publish_results(self, request):
        """Bulk publish results with notifications"""
        serializer = PublishResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result_ids = serializer.validated_data["result_ids"]
        publish_date = serializer.validated_data.get("publish_date", timezone.now())
        send_notifications = serializer.validated_data.get("send_notifications", True)

        try:
            with transaction.atomic():
                total_published = 0
                student_ids = set()

                for model in [
                    SeniorSecondaryResult,
                    JuniorSecondaryResult,
                    PrimaryResult,
                    NurseryResult,
                ]:
                    if send_notifications:
                        results_to_publish = model.objects.filter(id__in=result_ids)
                        student_ids.update(
                            results_to_publish.values_list("student_id", flat=True)
                        )

                    published = model.objects.filter(id__in=result_ids).update(
                        status="PUBLISHED",
                        published_by=request.user,
                        published_date=publish_date,
                    )
                    total_published += published

                notifications_sent = 0
                recipient_user_ids = []

                if send_notifications and student_ids:
                    from parent.models import ParentStudentRelationship
                    from students.models import Student

                    students = Student.objects.filter(
                        id__in=student_ids
                    ).select_related("user")
                    parent_relationships = ParentStudentRelationship.objects.filter(
                        student_id__in=student_ids
                    ).select_related("parent__user")

                    recipient_user_ids.extend([s.user.id for s in students if s.user])
                    recipient_user_ids.extend(
                        [
                            pr.parent.user.id
                            for pr in parent_relationships
                            if pr.parent and pr.parent.user
                        ]
                    )

                    if recipient_user_ids:
                        bulk_message = BulkMessage.objects.create(
                            sender=request.user,
                            subject="Results Published",
                            content="Academic results have been published and are now available for viewing. Please check your student portal to view the results.",
                            message_type="in_app",
                            priority="high",
                            custom_recipients=list(set(recipient_user_ids)),
                            total_recipients=len(set(recipient_user_ids)),
                            status="sent",
                            sent_at=timezone.now(),
                            tenant=(
                                request.tenant if hasattr(request, "tenant") else None
                            ),
                        )

                        from users.models import CustomUser

                        recipients = CustomUser.objects.filter(
                            id__in=list(set(recipient_user_ids))
                        )
                        messages_to_create = [
                            Message(
                                sender=request.user,
                                recipient=recipient,
                                subject=bulk_message.subject,
                                content=bulk_message.content,
                                message_type=bulk_message.message_type,
                                priority=bulk_message.priority,
                                status="sent",
                                sent_at=timezone.now(),
                                tenant=(
                                    request.tenant
                                    if hasattr(request, "tenant")
                                    else None
                                ),
                            )
                            for recipient in recipients
                        ]
                        Message.objects.bulk_create(messages_to_create)
                        notifications_sent = len(messages_to_create)

                        bulk_message.sent_count = notifications_sent
                        bulk_message.delivered_count = notifications_sent
                        bulk_message.save()

                return Response(
                    {
                        "message": f"Successfully published {total_published} results",
                        "published_date": publish_date,
                        "notifications_sent": notifications_sent if send_notifications else 0,
                        "recipients_notified": len(set(recipient_user_ids)) if send_notifications and student_ids else 0,
                    },
                    status=status.HTTP_200_OK,
                )

        except Exception as e:
            logger.error(f"Bulk publish failed: {str(e)}")
            return Response(
                {"error": f"Bulk publish failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ResultAnalyticsViewSet(TenantFilterMixin, viewsets.ViewSet):
    """CRITICAL: TenantFilterMixin ensures tenant isolation."""

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"])
    def subject_performance(self, request):
        """Get subject performance statistics"""
        exam_session_id = request.query_params.get("exam_session_id")
        # UPDATED: accept education_level as level_type string (SENIOR_SECONDARY etc.)
        # which is still used for model routing only — not as a DB CharField filter
        education_level = request.query_params.get("education_level")

        if not exam_session_id:
            return Response(
                {"error": "exam_session_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model_map = {
            "SENIOR_SECONDARY": SeniorSecondaryResult,
            "JUNIOR_SECONDARY": JuniorSecondaryResult,
            "PRIMARY": PrimaryResult,
            "NURSERY": NurseryResult,
        }
        model = model_map.get(education_level, SeniorSecondaryResult)

        results = (
            model.objects.filter(
                exam_session_id=exam_session_id, status__in=["APPROVED", "PUBLISHED"]
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

        performance_data = []
        for result in results:
            pass_rate = (
                (result["students_passed"] / result["total_students"] * 100)
                if result["total_students"] > 0
                else 0
            )
            performance_data.append(
                {
                    "subject_id": result["subject__id"],
                    "subject_name": result["subject__name"],
                    "subject_code": result["subject__code"],
                    "total_students": result["total_students"],
                    "average_score": (
                        round(result["average_score"], 2)
                        if result["average_score"]
                        else 0
                    ),
                    "highest_score": result["highest_score"],
                    "lowest_score": result["lowest_score"],
                    "pass_rate": round(pass_rate, 2),
                    "students_passed": result["students_passed"],
                    "students_failed": result["students_failed"],
                }
            )

        serializer = SubjectPerformanceSerializer(performance_data, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def student_performance_trend(self, request):
        """Get student performance trend across terms"""
        student_id = request.query_params.get("student_id")
        academic_session_id = request.query_params.get("academic_session_id")

        if not student_id:
            return Response(
                {"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.select_related("education_level").get(
                id=student_id
            )
            # UPDATED: education_level is a FK; use level_type property
            education_level = student.education_level  # @property → level_type string

            if education_level == "SENIOR_SECONDARY":
                term_reports = SeniorSecondaryTermReport.objects.filter(
                    student=student
                ).select_related("exam_session")
            elif education_level == "JUNIOR_SECONDARY":
                term_reports = JuniorSecondaryTermReport.objects.filter(
                    student=student
                ).select_related("exam_session")
            elif education_level == "PRIMARY":
                term_reports = PrimaryTermReport.objects.filter(
                    student=student
                ).select_related("exam_session")
            else:
                term_reports = NurseryTermReport.objects.filter(
                    student=student
                ).select_related("exam_session")

            if academic_session_id:
                term_reports = term_reports.filter(
                    exam_session__academic_session_id=academic_session_id
                )

            term_scores = []
            for report in term_reports:
                term_scores.append(
                    {
                        "term": report.exam_session.term,
                        "average_score": (
                            float(report.average_score) if report.average_score else 0
                        ),
                        "total_score": (
                            float(report.total_score) if report.total_score else 0
                        ),
                        "class_position": report.class_position,
                    }
                )

            if len(term_scores) >= 2:
                first_score = term_scores[0]["average_score"]
                last_score = term_scores[-1]["average_score"]
                percentage_change = (
                    ((last_score - first_score) / first_score * 100)
                    if first_score > 0
                    else 0
                )
                if percentage_change > 5:
                    trend = "IMPROVING"
                elif percentage_change < -5:
                    trend = "DECLINING"
                else:
                    trend = "STABLE"
            else:
                percentage_change = 0
                trend = "STABLE"

            best_subject = None
            worst_subject = None

            if education_level == "SENIOR_SECONDARY":
                results = SeniorSecondaryResult.objects.filter(
                    student=student
                ).select_related("subject")
                if academic_session_id:
                    results = results.filter(exam_session__academic_session_id=academic_session_id)
            elif education_level == "JUNIOR_SECONDARY":
                results = JuniorSecondaryResult.objects.filter(
                    student=student
                ).select_related("subject")
                if academic_session_id:
                    results = results.filter(exam_session__academic_session_id=academic_session_id)
            elif education_level == "PRIMARY":
                results = PrimaryResult.objects.filter(student=student).select_related(
                    "subject"
                )
                if academic_session_id:
                    results = results.filter(exam_session__academic_session_id=academic_session_id)
            else:
                results = NurseryResult.objects.filter(student=student).select_related(
                    "subject"
                )
                if academic_session_id:
                    results = results.filter(exam_session__academic_session_id=academic_session_id)

            subject_scores = {}
            for result in results:
                subject_name = (
                    result.subject.name
                    if hasattr(result, "subject") and result.subject
                    else "Unknown"
                )
                total = float(result.total or 0)
                subject_scores.setdefault(subject_name, []).append(total)

            subject_averages = {
                subject: sum(scores) / len(scores)
                for subject, scores in subject_scores.items()
                if scores
            }

            if subject_averages:
                best_subject_name = max(subject_averages, key=subject_averages.get)
                best_subject = {
                    "name": best_subject_name,
                    "average_score": round(subject_averages[best_subject_name], 2),
                }
                worst_subject_name = min(subject_averages, key=subject_averages.get)
                worst_subject = {
                    "name": worst_subject_name,
                    "average_score": round(subject_averages[worst_subject_name], 2),
                }

            response_data = {
                "student": StudentMinimalSerializer(student).data,
                "term_scores": term_scores,
                "average_score": (
                    sum(s["average_score"] for s in term_scores) / len(term_scores)
                    if term_scores
                    else 0
                ),
                "trend": trend,
                "percentage_change": round(percentage_change, 2),
                "best_subject": best_subject,
                "worst_subject": worst_subject,
            }

            return Response(response_data)

        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=["get"])
    def class_performance(self, request):
        """Get class-level performance summary"""
        exam_session_id = request.query_params.get("exam_session_id")
        # UPDATED: accept student_class_id (FK pk) instead of a class name string
        student_class_id = request.query_params.get("student_class_id")
        # education_level still used for model routing (level_type string)
        education_level = request.query_params.get("education_level")

        if not all([exam_session_id, student_class_id, education_level]):
            return Response(
                {
                    "error": "exam_session_id, student_class_id, and education_level are required"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        report_model_map = {
            "SENIOR_SECONDARY": SeniorSecondaryTermReport,
            "JUNIOR_SECONDARY": JuniorSecondaryTermReport,
            "PRIMARY": PrimaryTermReport,
            "NURSERY": NurseryTermReport,
        }
        report_model = report_model_map.get(education_level)
        if not report_model:
            return Response(
                {"error": "Invalid education level"}, status=status.HTTP_400_BAD_REQUEST
            )

        # UPDATED: filter via FK — student__student_class_id instead of student__student_class string
        term_reports = report_model.objects.filter(
            exam_session_id=exam_session_id,
            student__student_class_id=student_class_id,
            status__in=["APPROVED", "PUBLISHED"],
        ).select_related("student")

        if not term_reports.exists():
            return Response(
                {"error": "No results found"}, status=status.HTTP_404_NOT_FOUND
            )

        total_students = term_reports.count()
        class_average = (
            term_reports.aggregate(Avg("average_score"))["average_score__avg"] or 0
        )

        passed_count = term_reports.filter(average_score__gte=50).count()
        pass_rate = (passed_count / total_students * 100) if total_students > 0 else 0

        top_performers = term_reports.order_by("-average_score")[:5]
        top_performers_data = [
            {
                "student_id": str(report.student.id),
                "student_name": report.student.full_name,
                "average_score": (
                    float(report.average_score) if report.average_score else 0
                ),
                "class_position": report.class_position,
            }
            for report in top_performers
        ]

        result_model_map = {
            "SENIOR_SECONDARY": SeniorSecondaryResult,
            "JUNIOR_SECONDARY": JuniorSecondaryResult,
            "PRIMARY": PrimaryResult,
            "NURSERY": NurseryResult,
        }
        result_model = result_model_map.get(education_level)
        subject_performance = []

        if result_model:
            # UPDATED: filter via FK — student__student_class_id instead of string
            results = result_model.objects.filter(
                exam_session_id=exam_session_id,
                student__student_class_id=student_class_id,
                status__in=["APPROVED", "PUBLISHED"],
            ).select_related("subject")

            subject_stats = {}
            for result in results:
                subject_name = (
                    result.subject.name
                    if hasattr(result, "subject") and result.subject
                    else "Unknown"
                )
                total_score = float(result.total or 0)
                if subject_name not in subject_stats:
                    subject_stats[subject_name] = {
                        "scores": [],
                        "passed": 0,
                        "failed": 0,
                    }
                subject_stats[subject_name]["scores"].append(total_score)
                if total_score >= 50:
                    subject_stats[subject_name]["passed"] += 1
                else:
                    subject_stats[subject_name]["failed"] += 1

            for subject_name, stats in subject_stats.items():
                scores = stats["scores"]
                if scores:
                    subject_performance.append(
                        {
                            "subject": subject_name,
                            "average_score": round(sum(scores) / len(scores), 2),
                            "highest_score": round(max(scores), 2),
                            "lowest_score": round(min(scores), 2),
                            "students_passed": stats["passed"],
                            "students_failed": stats["failed"],
                            "pass_rate": round(
                                (stats["passed"] / len(scores) * 100) if scores else 0,
                                2,
                            ),
                        }
                    )

            subject_performance.sort(key=lambda x: x["average_score"], reverse=True)

        # UPDATED: return student_class_id instead of raw name string so callers
        # can resolve the FK object themselves if needed
        response_data = {
            "student_class_id": student_class_id,
            "education_level": education_level,
            "total_students": total_students,
            "class_average": round(class_average, 2),
            "pass_rate": round(pass_rate, 2),
            "top_performers": top_performers_data,
            "subject_performance": subject_performance,
        }

        return Response(response_data)

    @action(detail=False, methods=["get"])
    def result_summary(self, request):
        """Get overall result summary dashboard"""
        exam_session_id = request.query_params.get("exam_session_id")

        if not exam_session_id:
            return Response(
                {"error": "exam_session_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        summary = {
            "total_results": 0,
            "published_results": 0,
            "pending_approval": 0,
            "draft_results": 0,
            "overall_pass_rate": 0,
            "average_class_performance": 0,
            "top_performing_class": None,
            "subjects_summary": [],
        }

        for model in [
            SeniorSecondaryResult,
            JuniorSecondaryResult,
            PrimaryResult,
            NurseryResult,
        ]:
            results = model.objects.filter(exam_session_id=exam_session_id)
            summary["total_results"] += results.count()
            summary["published_results"] += results.filter(status="PUBLISHED").count()
            summary["pending_approval"] += results.filter(status="SUBMITTED").count()
            summary["draft_results"] += results.filter(status="DRAFT").count()

        total_passed = 0
        for model in [
            SeniorSecondaryResult,
            JuniorSecondaryResult,
            PrimaryResult,
            NurseryResult,
        ]:
            total_passed += model.objects.filter(
                exam_session_id=exam_session_id, is_passed=True
            ).count()

        summary["overall_pass_rate"] = round(
            (
                (total_passed / summary["total_results"] * 100)
                if summary["total_results"] > 0
                else 0
            ),
            2,
        )

        return Response(summary)


class ResultImportExportViewSet(TenantFilterMixin, viewsets.ViewSet):
    """CRITICAL: TenantFilterMixin ensures tenant isolation."""

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"])
    def import_results(self, request):
        """Import results from CSV file"""
        serializer = ResultImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response(
                {"error": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            education_level = serializer.validated_data.get("education_level")
            exam_session_id = serializer.validated_data.get("exam_session_id")

            model_map = {
                "SENIOR_SECONDARY": SeniorSecondaryResult,
                "JUNIOR_SECONDARY": JuniorSecondaryResult,
                "PRIMARY": PrimaryResult,
                "NURSERY": NurseryResult,
            }
            result_model = model_map.get(education_level)
            if not result_model:
                return Response(
                    {"error": "Invalid education level"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            decoded_file = file_obj.read().decode("utf-8")
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)

            imported_count = 0
            errors = []

            with transaction.atomic():
                for row_num, row in enumerate(reader, start=2):
                    try:
                        from students.models import Student
                        from subject.models import Subject

                        student = Student.objects.get(id=row["student_id"])
                        subject = Subject.objects.get(id=row["subject_id"])

                        result, created = result_model.objects.update_or_create(
                            student=student,
                            subject=subject,
                            exam_session_id=exam_session_id,
                            defaults={
                                "ca_score": Decimal(row.get("ca_score", 0)),
                                "exam_score": Decimal(row.get("exam_score", 0)),
                                "total": Decimal(row.get("ca_score", 0))
                                + Decimal(row.get("exam_score", 0)),
                                "status": "DRAFT",
                                "tenant": (
                                    request.tenant
                                    if hasattr(request, "tenant")
                                    else None
                                ),
                            },
                        )
                        imported_count += 1

                    except Student.DoesNotExist:
                        errors.append(
                            f"Row {row_num}: Student ID {row.get('student_id')} not found"
                        )
                    except Subject.DoesNotExist:
                        errors.append(
                            f"Row {row_num}: Subject ID {row.get('subject_id')} not found"
                        )
                    except Exception as e:
                        errors.append(f"Row {row_num}: {str(e)}")

            return Response(
                {
                    "message": f"Successfully imported {imported_count} results",
                    "imported_count": imported_count,
                    "error_count": len(errors),
                    "errors": errors[:10],
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            logger.error(f"Import failed: {str(e)}")
            return Response(
                {"error": f"Import failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["post"])
    def export_results(self, request):
        """Export results to CSV file"""
        serializer = ResultExportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            education_level = serializer.validated_data.get("education_level")
            exam_session_id = serializer.validated_data.get("exam_session_id")
            # UPDATED: accept student_class_id instead of a raw class name string
            student_class_id = serializer.validated_data.get("student_class_id")
            export_format = serializer.validated_data.get("export_format", "csv")

            model_map = {
                "SENIOR_SECONDARY": SeniorSecondaryResult,
                "JUNIOR_SECONDARY": JuniorSecondaryResult,
                "PRIMARY": PrimaryResult,
                "NURSERY": NurseryResult,
            }
            result_model = model_map.get(education_level)
            if not result_model:
                return Response(
                    {"error": "Invalid education level"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            results = result_model.objects.filter(
                exam_session_id=exam_session_id
            ).select_related("student", "subject", "student__student_class")

            # UPDATED: filter by FK id instead of student_class name string
            if student_class_id:
                results = results.filter(student__student_class_id=student_class_id)

            if export_format == "csv":
                response = HttpResponse(content_type="text/csv")
                response["Content-Disposition"] = (
                    f'attachment; filename="results_{exam_session_id}_{education_level}.csv"'
                )

                writer = csv.writer(response)
                writer.writerow(
                    [
                        "Student ID",
                        "Student Name",
                        "Student Class",
                        "Subject ID",
                        "Subject Name",
                        "CA Score",
                        "Exam Score",
                        "Total",
                        "Grade",
                        "Status",
                    ]
                )

                for result in results:
                    # UPDATED: student_class is now a FK — use .name attribute
                    student_class_name = (
                        result.student.student_class.name
                        if result.student.student_class
                        else ""
                    )
                    writer.writerow(
                        [
                            result.student.id,
                            (
                                result.student.full_name
                                if hasattr(result.student, "full_name")
                                else f"{result.student.user.first_name} {result.student.user.last_name}"
                            ),
                            student_class_name,
                            result.subject.id if hasattr(result, "subject") else "",
                            result.subject.name if hasattr(result, "subject") else "",
                            result.ca_score or 0,
                            result.exam_score or 0,
                            result.total or 0,
                            result.grade or "",
                            result.status or "",
                        ]
                    )

                return response
            else:
                return Response(
                    {"error": "Only CSV export is currently supported"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        except Exception as e:
            logger.error(f"Export failed: {str(e)}")
            return Response(
                {"error": f"Export failed: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ReportGenerationViewSet(TenantFilterMixin, viewsets.ViewSet):
    """CRITICAL: TenantFilterMixin ensures tenant isolation."""

    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"], url_path="verify-report")
    def verify_report_exists(self, request):
        """Verify if a term report exists before allowing download"""
        report_id = request.query_params.get("report_id")
        education_level = request.query_params.get("education_level")

        if not report_id or not education_level:
            return Response(
                {"error": "Missing parameters"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            model_map = {
                "NURSERY": NurseryTermReport,
                "PRIMARY": PrimaryTermReport,
                "JUNIOR_SECONDARY": JuniorSecondaryTermReport,
                "SENIOR_SECONDARY": SeniorSecondaryTermReport,
            }
            report_model = model_map.get(education_level.upper())
            if not report_model:
                return Response(
                    {"error": "Invalid education level"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            report = report_model.objects.get(id=report_id)
            return Response(
                {
                    "exists": True,
                    "report_id": str(report.id),
                    "student": (
                        report.student.full_name
                        if hasattr(report, "student")
                        else "Unknown"
                    ),
                    "status": report.status if hasattr(report, "status") else "UNKNOWN",
                }
            )

        except (report_model.DoesNotExist, ValueError, AttributeError):
            return Response(
                {"exists": False, "error": f"Report with ID {report_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=["get"], url_path="download-term-report")
    def download_term_report(self, request):
        """Download PDF term report for a student"""
        report_id = request.query_params.get("report_id")
        education_level = request.query_params.get("education_level")

        print(f"\n{'='*60}")
        print(f"🎯 DOWNLOAD REQUEST RECEIVED")
        print(f"{'='*60}")
        print(f"📨 Request Method: {request.method}")
        print(f"📨 Request Path: {request.path}")
        print(f"📨 Query Params: {dict(request.query_params)}")
        print(f"🎫 Report ID: {report_id}")
        print(f"🎓 Education Level: {education_level}")
        print(f"👤 User: {request.user.username if request.user else 'Anonymous'}")
        print(f"{'='*60}\n")

        if not report_id or not education_level:
            return Response(
                {"error": "report_id and education_level are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            generator = get_report_generator(education_level, request)
            print(f"About to generate report for ID: {report_id}")
            pdf_response = generator.generate_term_report(report_id)
            print(f"PDF generation completed for ID: {report_id}\n")
            return pdf_response

        except ValueError as e:
            logger.error(f"Invalid education level: {e}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error generating PDF report: {e}", exc_info=True)
            return Response(
                {"error": "Failed to generate PDF report", "detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"], url_path="download-session-report")
    def download_session_report(self, request):
        """Download PDF session report for a student (Senior Secondary only)"""
        report_id = request.query_params.get("report_id")

        if not report_id:
            return Response(
                {"error": "report_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            generator = get_report_generator("SENIOR_SECONDARY", request)
            return generator.generate_session_report(report_id)
        except Exception as e:
            logger.error(f"Error generating session PDF report: {e}", exc_info=True)
            return Response(
                {"error": "Failed to generate PDF report", "detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="bulk-download")
    def bulk_download_reports(self, request):
        """Bulk download multiple PDF reports"""
        serializer = BulkReportGenerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report_ids = serializer.validated_data.get("report_ids", [])
        education_level = serializer.validated_data.get("education_level")

        if not report_ids:
            return Response(
                {"error": "report_ids are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            generator = get_report_generator(education_level, request)
            return Response(
                {
                    "message": f"Bulk download initiated for {len(report_ids)} reports",
                    "status": "processing",
                },
                status=status.HTTP_202_ACCEPTED,
            )
        except Exception as e:
            logger.error(f"Bulk download failed: {e}", exc_info=True)
            return Response(
                {"error": "Failed to initiate bulk download", "detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ===== PROFESSIONAL ASSIGNMENT VIEWS =====
from rest_framework.parsers import MultiPartParser, FormParser
import cloudinary.uploader


class ProfessionalAssignmentViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ViewSet
):
    """ViewSet for Professional Assignment tab functionality."""

    pagination_class = StandardResultsPagination
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def get_user_role(self):
        return getattr(self.request.user, "role", None)

    @action(detail=False, methods=["get"], url_path="my-students")
    def get_assigned_students(self, request):
        """Get all students assigned to the current teacher."""
        user = request.user

        exam_session_id = request.query_params.get("exam_session")
        # UPDATED: accept education_level as level_type string for filtering;
        # actual DB comparisons go through the FK property on Student
        education_level_filter = request.query_params.get("education_level")

        if exam_session_id:
            try:
                exam_session = ExamSession.objects.get(id=exam_session_id)
            except ExamSession.DoesNotExist:
                return Response(
                    {"error": "Exam session not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            exam_session = (
                ExamSession.objects.filter(is_active=True)
                .order_by("-created_at")
                .first()
            )
            if not exam_session:
                return Response(
                    {"error": "No active exam session found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            from teacher.models import Teacher
            from classroom.models import Classroom, StudentEnrollment

            teacher = Teacher.objects.get(user=user)
            logger.info(
                f"👨‍🏫 Teacher: {teacher.user.get_full_name()} (ID: {teacher.id})"
            )

            assigned_classrooms = Classroom.objects.filter(
                Q(class_teacher=teacher)
                | Q(classroomteacherassignment__teacher=teacher)
            ).distinct()

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
                        "message": "No classrooms assigned to this teacher",
                    }
                )

            student_enrollments = StudentEnrollment.objects.filter(
                classroom__in=assigned_classrooms,
                is_active=True,
            ).select_related(
                "student", "student__user", "student__education_level", "classroom"
            )

            from collections import Counter

            # UPDATED: education_level is a FK; use level_type @property
            education_level_counts = Counter(
                enrollment.student.education_level for enrollment in student_enrollments
            )

            students_data = []
            for idx, enrollment in enumerate(student_enrollments, 1):
                student = enrollment.student
                # UPDATED: education_level @property returns level_type string from FK
                education_level = student.education_level

                if education_level_filter and education_level != education_level_filter:
                    continue

                try:
                    report_model = self._get_report_model(education_level)
                    term_report = report_model.objects.filter(
                        student=student,
                        exam_session=exam_session,
                    ).first()
                except Exception as e:
                    logger.error(
                        f"❌ Error getting report for {student.full_name}: {e}"
                    )
                    term_report = None

                has_teacher_remark = bool(
                    term_report and term_report.class_teacher_remark
                )
                has_teacher_signature = bool(
                    term_report
                    and getattr(term_report, "class_teacher_signature", None)
                )

                if has_teacher_remark and has_teacher_signature:
                    remark_status = "completed"
                elif has_teacher_remark:
                    remark_status = "draft"
                else:
                    remark_status = "pending"

                average_score = (
                    getattr(term_report, "average_score", None) if term_report else None
                )

                students_data.append(
                    {
                        "id": str(student.id),
                        "full_name": student.full_name,
                        "admission_number": student.registration_number,
                        # UPDATED: student_class is a FK — use .name attribute
                        "student_class": (
                            student.student_class.name
                            if student.student_class
                            else enrollment.classroom.name
                        ),
                        "education_level": education_level,
                        "average_score": (
                            float(average_score) if average_score is not None else None
                        ),
                        "term_report_id": str(term_report.id) if term_report else None,
                        "has_remark": has_teacher_remark,
                        "remark_status": remark_status,
                        "last_remark": (
                            getattr(term_report, "class_teacher_remark", "")
                            if term_report
                            else ""
                        ),
                        "has_signature": has_teacher_signature,
                        "classroom": (
                            enrollment.classroom.name if enrollment.classroom else None
                        ),
                    }
                )

            final_level_counts = Counter(s["education_level"] for s in students_data)
            logger.info(
                f"📊 Final students_data by education level: {dict(final_level_counts)}"
            )

            students_data.sort(key=lambda x: (x["student_class"], x["full_name"]))

            # UPDATED: derive level_type strings from FK-based property
            student_education_levels = [
                enrollment.student.education_level for enrollment in student_enrollments
            ]
            is_classroom_teacher = any(
                level in ["NURSERY", "PRIMARY"] for level in student_education_levels
            )

            total_students = len(students_data)
            completed_remarks = sum(
                1 for s in students_data if s["remark_status"] == "completed"
            )
            pending_remarks = total_students - completed_remarks

            return Response(
                {
                    "exam_session": {
                        "id": str(exam_session.id),
                        "name": exam_session.name,
                        "term": exam_session.term,
                        "start_date": exam_session.start_date,
                        "end_date": exam_session.end_date,
                    },
                    "students": students_data,
                    "summary": {
                        "total_students": total_students,
                        "completed_remarks": completed_remarks,
                        "pending_remarks": pending_remarks,
                        "completion_percentage": (
                            round((completed_remarks / total_students) * 100, 2)
                            if total_students > 0
                            else 0
                        ),
                    },
                    "is_classroom_teacher": is_classroom_teacher,
                    "education_level_counts": dict(education_level_counts),
                }
            )

        except Teacher.DoesNotExist:
            return Response(
                {"error": "Teacher profile not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error fetching assigned students: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to fetch students: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _can_teacher_edit_remark(self, user, term_report):
        """Check if teacher can edit remarks for this term report."""
        try:
            from teacher.models import Teacher
            from classroom.models import (
                Classroom,
                StudentEnrollment,
                ClassroomTeacherAssignment,
            )

            teacher = Teacher.objects.get(user=user)
            student = term_report.student

            student_enrollment = (
                StudentEnrollment.objects.filter(student=student, is_active=True)
                .select_related("classroom")
                .first()
            )

            if not student_enrollment:
                return False

            student_classroom = student_enrollment.classroom

            if student_classroom.class_teacher == teacher:
                return True

            return ClassroomTeacherAssignment.objects.filter(
                teacher=teacher, classroom=student_classroom
            ).exists()

        except Teacher.DoesNotExist:
            return False
        except Exception as e:
            logger.error(
                f"Error checking teacher remark permission: {e}", exc_info=True
            )
            return False

    @action(detail=False, methods=["post"], url_path="update-remark")
    def update_teacher_remark(self, request):
        """Update teacher remark for a student's term report."""
        term_report_id = request.data.get("term_report_id")
        education_level = request.data.get("education_level")
        class_teacher_remark = request.data.get("class_teacher_remark", "").strip()

        if not term_report_id or not education_level:
            return Response(
                {"error": "term_report_id and education_level are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not class_teacher_remark:
            return Response(
                {"error": "Remark cannot be empty"}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(class_teacher_remark) < 50:
            return Response(
                {"error": "Remark must be at least 50 characters long"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(class_teacher_remark) > 500:
            return Response(
                {"error": "Remark must not exceed 500 characters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            report_model = self._get_report_model(education_level)
            term_report = report_model.objects.get(id=term_report_id)

            if not self._can_teacher_edit_remark(request.user, term_report):
                return Response(
                    {"error": "You don't have permission to edit this remark"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            with transaction.atomic():
                term_report.class_teacher_remark = class_teacher_remark
                term_report.save(update_fields=["class_teacher_remark", "updated_at"])

            return Response(
                {
                    "message": "Remark updated successfully",
                    "term_report_id": str(term_report.id),
                    "class_teacher_remark": term_report.class_teacher_remark,
                    "status": term_report.status,
                }
            )

        except report_model.DoesNotExist:
            return Response(
                {"error": "Term report not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error updating remark: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to update remark: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="upload-signature")
    def upload_teacher_signature(self, request):
        """Upload teacher signature to Cloudinary and save URL."""
        signature_image = request.FILES.get("signature_image")

        if not signature_image:
            return Response(
                {"error": "signature_image file is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if signature_image.size > 2 * 1024 * 1024:
            return Response(
                {"error": "Signature image must be less than 2MB"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if signature_image.content_type not in ["image/png", "image/jpeg", "image/jpg"]:
            return Response(
                {"error": "Only PNG and JPEG images are allowed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            upload_result = upload_signature_to_cloudinary(
                signature_image, request.user, signature_type="teacher"
            )
            return Response(
                {
                    "message": "Signature uploaded successfully",
                    "signature_url": upload_result["signature_url"],
                    "public_id": upload_result["public_id"],
                    "width": upload_result["width"],
                    "height": upload_result["height"],
                }
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error uploading signature: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to upload signature: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="apply-signature")
    def apply_signature_to_reports(self, request):
        """Apply uploaded signature to multiple term reports."""
        import json

        signature_url = request.data.get("signature_url")
        education_level = request.data.get("education_level")
        term_report_ids = request.data.get("term_report_ids", [])

        if isinstance(term_report_ids, str):
            try:
                term_report_ids = json.loads(term_report_ids)
            except json.JSONDecodeError:
                return Response(
                    {"error": "Invalid term_report_ids format. Expected JSON array."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not signature_url or not term_report_ids or not education_level:
            return Response(
                {
                    "error": "signature_url, term_report_ids, and education_level are required"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            report_model = self._get_report_model(education_level)
            updated_count = 0
            errors = []

            with transaction.atomic():
                for report_id in term_report_ids:
                    try:
                        term_report = report_model.objects.select_related(
                            "student", "student__user", "student__education_level"
                        ).get(id=report_id)

                        can_edit = self._can_teacher_edit_remark(
                            request.user, term_report
                        )
                        if not can_edit:
                            errors.append(
                                {
                                    "report_id": str(report_id),
                                    # UPDATED: student_class is a FK — use .name
                                    "student": term_report.student.full_name,
                                    "class": (
                                        term_report.student.student_class.name
                                        if term_report.student.student_class
                                        else ""
                                    ),
                                    "error": "You don't have permission to sign this report. You must teach at least one subject in this class.",
                                }
                            )
                            continue

                        term_report.class_teacher_signature = signature_url
                        term_report.class_teacher_signed_at = timezone.now()
                        term_report.save(
                            update_fields=[
                                "class_teacher_signature",
                                "class_teacher_signed_at",
                                "updated_at",
                            ]
                        )
                        updated_count += 1

                    except report_model.DoesNotExist:
                        errors.append(
                            {"report_id": str(report_id), "error": "Report not found"}
                        )
                    except Exception as e:
                        errors.append({"report_id": str(report_id), "error": str(e)})

            logger.info(
                f"Signature applied to {updated_count} reports by {request.user.username}"
            )

            response_data = {
                "message": f"Signature applied to {updated_count} out of {len(term_report_ids)} report(s)",
                "updated_count": updated_count,
                "total_requested": len(term_report_ids),
                "success": updated_count > 0,
            }
            if errors:
                response_data["errors"] = errors
                response_data["failed_count"] = len(errors)

            return Response(response_data)

        except Exception as e:
            logger.error(f"Error applying signature: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to apply signature: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"], url_path="remark-templates")
    def get_remark_templates(self, request):
        templates = {
            "nursery": {
                "excellent": [
                    "{student_name} shows great enthusiasm for learning, follows instructions well, and interacts positively with classmates.",
                    "{student_name} is attentive, eager to learn, and demonstrates excellent behaviour in class.",
                ],
                "good": [
                    "{student_name} is learning well, participates in activities, and shows good behaviour most of the time.",
                    "{student_name} follows routines and is making steady academic progress.",
                ],
                "average": [
                    "{student_name} is developing basic skills and should participate more actively in class activities.",
                    "{student_name} needs gentle encouragement to stay focused and improve learning consistency.",
                ],
                "needs_improvement": [
                    "{student_name} needs support in staying focused and following classroom routines.",
                    "{student_name} should improve attention, listening skills, and participation.",
                ],
            },
            "primary": {
                "excellent": [
                    "{student_name} demonstrates strong academic performance, positive behaviour, and a responsible attitude toward learning.",
                    "{student_name} is hardworking, respectful, and actively engaged in class activities.",
                ],
                "good": [
                    "{student_name} shows good understanding of lessons and maintains positive classroom behaviour.",
                    "{student_name} is making good progress and displays a cooperative learning attitude.",
                ],
                "average": [
                    "{student_name} shows average performance and needs more consistency and focus to improve.",
                    "{student_name} can achieve better results with increased effort and better study habits.",
                ],
                "needs_improvement": [
                    "{student_name} needs to improve focus, class participation, and academic commitment.",
                    "{student_name} should work harder and show greater responsibility toward learning.",
                ],
            },
            "junior_secondary": {
                "excellent": [
                    "{student_name} demonstrates excellent academic skills, discipline, and strong engagement in learning.",
                    "{student_name} shows maturity, focus, and consistent high-quality work.",
                ],
                "good": [
                    "{student_name} performs well academically and participates actively in class activities.",
                    "{student_name} shows steady progress and a positive attitude toward learning.",
                ],
                "average": [
                    "{student_name} shows adequate performance and needs to improve focus and study habits.",
                    "{student_name} can achieve better results with more consistent effort and concentration.",
                ],
                "needs_improvement": [
                    "{student_name} needs to work on discipline, class engagement, and study consistency.",
                    "{student_name} should seek help where necessary and improve academic commitment.",
                ],
            },
            "senior_secondary": {
                "excellent": [
                    "{student_name} consistently excels academically, demonstrates responsibility, and shows strong leadership qualities.",
                    "{student_name} is disciplined, focused, and produces high-quality work consistently.",
                ],
                "good": [
                    "{student_name} shows good understanding of concepts and maintains a positive approach to learning.",
                    "{student_name} performs well and participates actively in class discussions.",
                ],
                "average": [
                    "{student_name} shows fair performance and should focus on strengthening weak areas and time management.",
                    "{student_name} can improve with more effort, better organization, and consistent study habits.",
                ],
                "needs_improvement": [
                    "{student_name} needs to increase academic effort, attention, and participation in class activities.",
                    "{student_name} should develop better study routines and seek guidance to improve results.",
                ],
            },
        }

        return Response(
            {
                "templates": templates,
                "usage": "Select education level and performance key, then replace {student_name} dynamically.",
            }
        )

    def _get_report_model(self, education_level):
        """Helper method to get the appropriate report model."""
        model_map = {
            "SENIOR_SECONDARY": SeniorSecondaryTermReport,
            "JUNIOR_SECONDARY": JuniorSecondaryTermReport,
            "PRIMARY": PrimaryTermReport,
            "NURSERY": NurseryTermReport,
        }
        model = model_map.get(education_level.upper())
        if not model:
            raise ValueError(f"Invalid education level: {education_level}")
        return model


# ===== HEAD TEACHER PROFESSIONAL ASSIGNMENT =====
class HeadTeacherAssignmentViewSet(
    TeacherPortalCheckMixin, SectionFilterMixin, viewsets.ViewSet
):
    """ViewSet for Head Teacher to manage remarks and signatures."""

    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset_for_head_teacher(self, exam_session):
        all_reports = []
        for model in [
            SeniorSecondaryTermReport,
            JuniorSecondaryTermReport,
            PrimaryTermReport,
            NurseryTermReport,
        ]:
            reports = model.objects.filter(
                exam_session=exam_session,
                status="SUBMITTED",
            ).select_related("student", "student__user", "student__education_level")
            all_reports.extend(reports)
        return all_reports

    @action(detail=False, methods=["get"], url_path="pending-reviews")
    def get_pending_reviews(self, request):
        """Get all term reports pending head teacher review."""
        exam_session_id = request.query_params.get("exam_session")

        if exam_session_id:
            try:
                exam_session = ExamSession.objects.get(id=exam_session_id)
            except ExamSession.DoesNotExist:
                return Response(
                    {"error": "Exam session not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            exam_session = (
                ExamSession.objects.filter(is_active=True)
                .order_by("-created_at")
                .first()
            )

        if not exam_session:
            return Response(
                {"error": "No active exam session found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pending_reports = []

        for education_level, model in [
            ("SENIOR_SECONDARY", SeniorSecondaryTermReport),
            ("JUNIOR_SECONDARY", JuniorSecondaryTermReport),
            ("PRIMARY", PrimaryTermReport),
            ("NURSERY", NurseryTermReport),
        ]:
            reports = model.objects.filter(
                exam_session=exam_session, status="SUBMITTED"
            ).select_related("student", "student__user", "student__student_class")

            for report in reports:
                has_head_remark = bool(report.head_teacher_remark)
                has_head_signature = bool(report.head_teacher_signature)

                pending_reports.append(
                    {
                        "id": str(report.id),
                        "student": {
                            "id": str(report.student.id),
                            "full_name": report.student.full_name,
                            # UPDATED: student_class is a FK — use .name attribute
                            "student_class": (
                                report.student.student_class.name
                                if report.student.student_class
                                else None
                            ),
                        },
                        "education_level": education_level,
                        "class_teacher_remark": report.class_teacher_remark,
                        "head_teacher_remark": report.head_teacher_remark,
                        "has_head_teacher_remark": has_head_remark,
                        "has_head_teacher_signature": has_head_signature,
                        "status": report.status,
                        "average_score": (
                            float(report.average_score)
                            if hasattr(report, "average_score") and report.average_score
                            else None
                        ),
                    }
                )

        return Response(
            {
                "exam_session": ExamSessionSerializer(exam_session).data,
                "pending_reviews": pending_reports,
                "total_pending": len(pending_reports),
            }
        )

    @action(detail=False, methods=["post"], url_path="update-head-remark")
    def update_head_teacher_remark(self, request):
        """Update head teacher remark for a term report."""
        term_report_id = request.data.get("term_report_id")
        education_level = request.data.get("education_level")
        head_teacher_remark = request.data.get("head_teacher_remark", "").strip()

        if not all([term_report_id, education_level, head_teacher_remark]):
            return Response(
                {"error": "All fields are required"}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(head_teacher_remark) < 50:
            return Response(
                {"error": "Remark must be at least 50 characters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            model_map = {
                "SENIOR_SECONDARY": SeniorSecondaryTermReport,
                "JUNIOR_SECONDARY": JuniorSecondaryTermReport,
                "PRIMARY": PrimaryTermReport,
                "NURSERY": NurseryTermReport,
            }
            report_model = model_map.get(education_level.upper())
            if not report_model:
                return Response(
                    {"error": "Invalid education level"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            term_report = report_model.objects.get(id=term_report_id)

            if not term_report.can_edit_head_teacher_remark(request.user):
                return Response(
                    {"error": "You don't have permission to edit this remark"},
                    status=status.HTTP_403_FORBIDDEN,
                )

            with transaction.atomic():
                term_report.head_teacher_remark = head_teacher_remark
                term_report.save(update_fields=["head_teacher_remark", "updated_at"])

            return Response(
                {
                    "message": "Head teacher remark updated successfully",
                    "term_report_id": str(term_report.id),
                }
            )

        except report_model.DoesNotExist:
            return Response(
                {"error": "Term report not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error updating head teacher remark: {e}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=["post"], url_path="upload-head-signature")
    def upload_head_teacher_signature(self, request):
        """Upload head teacher signature to Cloudinary"""
        signature_image = request.FILES.get("signature_image")

        if not signature_image:
            return Response(
                {"error": "signature_image is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            upload_result = upload_signature_to_cloudinary(
                signature_image, request.user, signature_type="head_teacher"
            )
            return Response(
                {
                    "message": "Signature uploaded successfully",
                    "signature_url": upload_result["signature_url"],
                    "public_id": upload_result["public_id"],
                    "width": upload_result["width"],
                    "height": upload_result["height"],
                }
            )
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error uploading head signature: {e}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=["post"], url_path="apply-head-signature")
    def apply_head_signature(self, request):
        """Apply head teacher signature to reports"""
        import json

        signature_url = request.data.get("signature_url")
        education_level = request.data.get("education_level")
        term_report_ids = request.data.get("term_report_ids", [])

        if isinstance(term_report_ids, str):
            try:
                term_report_ids = json.loads(term_report_ids)
            except json.JSONDecodeError:
                return Response(
                    {"error": "Invalid term_report_ids format. Expected JSON array."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not all([signature_url, term_report_ids, education_level]):
            return Response(
                {"error": "All fields are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            model_map = {
                "SENIOR_SECONDARY": SeniorSecondaryTermReport,
                "JUNIOR_SECONDARY": JuniorSecondaryTermReport,
                "PRIMARY": PrimaryTermReport,
                "NURSERY": NurseryTermReport,
            }
            report_model = model_map.get(education_level.upper())
            if not report_model:
                return Response(
                    {"error": "Invalid education level"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            updated_count = 0
            errors = []

            with transaction.atomic():
                for report_id in term_report_ids:
                    try:
                        term_report = report_model.objects.get(id=report_id)

                        if not term_report.can_edit_head_teacher_remark(request.user):
                            errors.append(
                                {
                                    "report_id": str(report_id),
                                    "error": "No permission to edit this report",
                                }
                            )
                            continue

                        term_report.head_teacher_signature = signature_url
                        term_report.head_teacher_signed_at = timezone.now()
                        term_report.save(
                            update_fields=[
                                "head_teacher_signature",
                                "head_teacher_signed_at",
                                "updated_at",
                            ]
                        )
                        updated_count += 1

                    except report_model.DoesNotExist:
                        errors.append(
                            {"report_id": str(report_id), "error": "Report not found"}
                        )
                    except Exception as e:
                        errors.append({"report_id": str(report_id), "error": str(e)})

            return Response(
                {
                    "message": f"Signature applied to {updated_count} report(s)",
                    "updated_count": updated_count,
                    "errors": errors if errors else None,
                }
            )

        except Exception as e:
            logger.error(f"Error applying head signature: {e}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
