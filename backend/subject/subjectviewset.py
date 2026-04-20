from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Prefetch, Count, Avg
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.core.cache import cache
from django.db import transaction, connection
from django.core.exceptions import ValidationError
from utils.section_filtering import SectionFilterMixin
from .models import (
    Subject,
    SubjectCategory,
    SubjectType,
    SchoolStreamConfiguration,
    SchoolStreamSubjectAssignment,
)
import logging
from .serializers import (
    SubjectSerializer,
    SubjectListSerializer,
    SubjectCreateUpdateSerializer,
    SubjectEducationLevelSerializer,
    SubjectCategorySerializer,
    SubjectTypeSerializer,
    SchoolStreamConfigurationSerializer,
    SchoolStreamSubjectAssignmentSerializer,
)

from tenants.mixins import TenantFilterMixin
from utils.section_filtering import AutoSectionFilterMixin
from utils.pagination import StandardResultsPagination, LargeResultsPagination

from classroom.models import GradeLevel
from academics.models import EducationLevel
from .utils import clear_subject_caches

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Legacy Python-loop helpers
# These are kept for any call-sites outside get_queryset(), but are NO LONGER
# called from the hot path — get_queryset() uses ORM queries instead.
# ---------------------------------------------------------------------------

def filter_by_json_field(queryset, field_name, value):
    """Database-agnostic JSON field filtering (kept for external call-sites only)."""
    subject_ids = [
        subject.id for subject in queryset if value in getattr(subject, field_name, [])
    ]
    return queryset.filter(id__in=subject_ids)


def filter_subjects_by_education_level(queryset, education_level):
    """Filter subjects by education level (kept for external call-sites only)."""
    subject_ids = [
        subject.id
        for subject in queryset
        if education_level in getattr(subject, "education_levels", [])
    ]
    return queryset.filter(id__in=subject_ids)


def filter_subjects_by_nursery_level(queryset, nursery_level):
    """Filter subjects by nursery level (kept for external call-sites only)."""
    subject_ids = [
        subject.id
        for subject in queryset
        if nursery_level in getattr(subject, "nursery_levels", [])
    ]
    return queryset.filter(id__in=subject_ids)


# ---------------------------------------------------------------------------
# ViewSet
# ---------------------------------------------------------------------------

class SubjectViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for Subject CRUD operations.
    Uses FK-based category_new, subject_type_new, and grade_levels M2M.

    MRO: TenantFilterMixin → AutoSectionFilterMixin → ModelViewSet
    TenantFilterMixin MUST be first to guarantee tenant isolation.
    """

    queryset = Subject.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    filterset_fields = {
        "category_new": ["exact", "in"],
        "subject_type_new": ["exact", "in"],
        "is_active": ["exact"],
        "is_cross_cutting": ["exact"],
        "subject_order": ["exact", "gte", "lte"],
    }

    search_fields = ["name", "short_name", "code", "description"]
    ordering_fields = ["name", "short_name", "code", "subject_order", "created_at"]
    ordering = ["subject_order", "name"]

    # -----------------------------------------------------------------------
    def get_serializer_class(self):
        serializer_map = {
            "list": SubjectListSerializer,
            "create": SubjectCreateUpdateSerializer,
            "update": SubjectCreateUpdateSerializer,
            "partial_update": SubjectCreateUpdateSerializer,
        }
        return serializer_map.get(self.action, SubjectSerializer)

    # -----------------------------------------------------------------------
    def get_queryset(self):
        """
        Build the queryset with:
          1. Tenant + section isolation (via mixins, called through super())
          2. Eager loading (select_related / prefetch_related)
          3. Server-side filters driven by query params

        All filters use ORM queries — no Python loops over the queryset.
        """
        # 1. Tenant + section isolation — MUST call super() first
        queryset = super().get_queryset()

        # 2. Eager loading
        queryset = queryset.select_related(
            "category_new",
            "subject_type_new",
        ).prefetch_related(
            "grade_levels",
            "grade_levels__education_level",
            Prefetch(
                "prerequisites",
                queryset=Subject.objects.filter(is_active=True).only(
                    "id", "name", "short_name", "code"
                ),
            ),
        )

        # 3a. education_level_id — precise FK match (preferred when caller has the PK)
        education_level_id = self.request.query_params.get("education_level_id")
        if education_level_id:
            matching_ids = (
                Subject.objects.filter(
                    grade_levels__education_level_id=education_level_id
                )
                .values_list("id", flat=True)
                .distinct()
            )
            queryset = queryset.filter(id__in=matching_ids)

        # 3b. education_levels — legacy param name sent by the EditTeacherForm frontend.
        #
        # Combines two ORM paths with a UNION so both old and new data are found:
        #
        #   Path A (FK/M2M — new model):
        #     Subject → grade_levels (M2M GradeLevel) → education_level (FK EducationLevel)
        #     → EducationLevel.level_type
        #
        #   Path B (legacy JSON/text field — old model):
        #     Subject.education_levels stored as JSONField, ArrayField, or CharField.
        #     __icontains works on all three (SQLite stores JSON as text; Postgres
        #     JSONB/ArrayField also matches on __icontains).
        #
        # .distinct() de-duplicates subjects matched by both paths.
        #
        # NOTE: if Subject.education_levels is a PostgreSQL ArrayField you can replace
        # the __icontains lookup with __contains=[value] for an index-backed query:
        #   legacy_qs = queryset.filter(education_levels__contains=[education_levels_param])
        education_levels_param = self.request.query_params.get("education_levels")
        if education_levels_param:
            # Step 1: collect matching subject IDs in a subquery
            # This avoids the DISTINCT + JOIN + OFFSET bug where PostgreSQL
            # can't paginate correctly over a DISTINCT query on joined tables.
            matching_ids = (
                Subject.objects.filter(
                    Q(grade_levels__education_level__level_type=education_levels_param)
                    | Q(education_levels__icontains=education_levels_param)
                )
                .values_list("id", flat=True)
                .distinct()
            )

            # Step 2: filter the main queryset by those IDs — no JOIN, no DISTINCT,
            # so LIMIT/OFFSET works correctly
            queryset = queryset.filter(id__in=matching_ids)

            logger.info(
                "[SubjectViewSet] education_levels='%s' → %d subjects",
                education_levels_param,
                queryset.count(),
            )

        # 3c. grade_level_id — filter by a specific GradeLevel PK
        grade_level_id = self.request.query_params.get("grade_level_id")
        if grade_level_id:
            matching_ids = (
                Subject.objects.filter(grade_levels__id=grade_level_id)
                .values_list("id", flat=True)
                .distinct()
            )
            queryset = queryset.filter(id__in=matching_ids)

        # 3d. category_id — filter by SubjectCategory FK
        category_id = self.request.query_params.get("category_id")
        if category_id:
            queryset = queryset.filter(category_new_id=category_id)

        # 3e. subject_type_id — filter by SubjectType FK
        subject_type_id = self.request.query_params.get("subject_type_id")
        if subject_type_id:
            queryset = queryset.filter(subject_type_new_id=subject_type_id)

        # 3f. available_only — default True (only return active subjects)
        available_only = self.request.query_params.get("available_only", "true").lower()
        if available_only == "true":
            queryset = queryset.filter(is_active=True)

        # 3g. cross_cutting_only
        if self.request.query_params.get("cross_cutting_only") == "true":
            queryset = queryset.filter(is_cross_cutting=True)

        return queryset  # ← REQUIRED — was missing from the broken version

    # -----------------------------------------------------------------------
    def get_permissions(self):
        if self.action in ["list", "retrieve", "statistics"]:
            return []  # unauthenticated read
        elif self.action in ["create", "update", "partial_update", "destroy"]:
            return []  # TODO: tighten to [IsAuthenticated()] before production
        return [IsAuthenticated()]

    # -----------------------------------------------------------------------
    def filter_subjects_by_section_access(self, queryset):
        """
        Filter subjects by the requesting user's section access.
        Called by AutoSectionFilterMixin where needed.

        Replaced all Python loops with ORM Q-object unions for performance.
        """
        user = self.request.user
        user_role = getattr(user, "role", None)

        # Superadmins / staff see everything
        if user.is_superuser and user.is_staff:
            return queryset

        # ── Section admin roles — filter by education level ────────────────
        role_to_levels = {
            "primary_admin": ["PRIMARY"],
            "nursery_admin": ["NURSERY"],
            "secondary_admin": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
            "junior_secondary_admin": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
            "senior_secondary_admin": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
        }

        if user_role in role_to_levels:
            allowed = role_to_levels[user_role]
            # FK path
            fk_q = Q(grade_levels__education_level__level_type__in=allowed)
            # Legacy JSON path — build OR of icontains per level
            legacy_q = Q()
            for level in allowed:
                legacy_q |= Q(education_levels__icontains=level)
            # Always include subjects marked for ALL levels (legacy field)
            legacy_q |= Q(education_levels__icontains="ALL")

            return queryset.filter(fk_q | legacy_q).distinct()

        # ── Permission-system role assignments ────────────────────────────
        try:
            from schoolSettings.models import UserRole as UserRoleModel

            user_roles = UserRoleModel.objects.filter(
                user=user, is_active=True
            ).select_related("role")

            if user_roles.exists():
                accessible_levels = set()
                for ur in user_roles:
                    if getattr(ur, "primary_section_access", False):
                        accessible_levels.add("PRIMARY")
                    if getattr(ur, "secondary_section_access", False):
                        accessible_levels.add("JUNIOR_SECONDARY")
                        accessible_levels.add("SENIOR_SECONDARY")
                    if getattr(ur, "nursery_section_access", False):
                        accessible_levels.add("NURSERY")

                if accessible_levels:
                    fk_q = Q(
                        grade_levels__education_level__level_type__in=accessible_levels
                    )
                    legacy_q = Q()
                    for level in accessible_levels:
                        legacy_q |= Q(education_levels__icontains=level)
                    legacy_q |= Q(education_levels__icontains="ALL")

                    return queryset.filter(fk_q | legacy_q).distinct()

        except Exception as exc:
            logger.warning("[SubjectViewSet] Error checking role assignments: %s", exc)

        # ── Default: staff / teacher / everyone else sees active subjects ──
        if user.is_staff or user_role in ["admin", "teacher"]:
            return queryset

        return queryset.filter(is_active=True)

    # -----------------------------------------------------------------------
    def list(self, request, *args, **kwargs):
        """List with lightweight metadata appended to paginated response."""
        response = super().list(request, *args, **kwargs)

        if isinstance(response.data, dict) and "results" in response.data:
            # Re-use the already-filtered queryset rather than calling get_queryset() again
            queryset = self.filter_queryset(self.get_queryset())
            response.data["metadata"] = {
                "filters_applied": bool(request.query_params),
                "summary": {
                    "total_subjects": queryset.count(),
                    "active_subjects": queryset.filter(is_active=True).count(),
                    "cross_cutting_subjects": queryset.filter(
                        is_cross_cutting=True
                    ).count(),
                },
            }

            if request.query_params.get("education_levels"):
                logger.info(
                    "[SubjectViewSet] Returning %d subjects to frontend for education_levels='%s'",
                    len(response.data["results"]),
                    request.query_params["education_levels"],
                )

        return response

    # -----------------------------------------------------------------------
    def perform_create(self, serializer):
        with transaction.atomic():
            tenant = getattr(self.request, "tenant", None)
            subject = serializer.save(tenant=tenant)
            clear_subject_caches()
            logger.info(
                "Subject '%s' (%s) created by %s",
                subject.name,
                subject.code,
                self.request.user,
            )

    def perform_update(self, serializer):
        with transaction.atomic():
            old_name = serializer.instance.name
            tenant = getattr(self.request, "tenant", None)
            subject = serializer.save(tenant=tenant)
            clear_subject_caches()
            logger.info(
                "Subject '%s' updated to '%s' by %s",
                old_name,
                subject.name,
                self.request.user,
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            subject_info = {
                "id": instance.id,
                "name": instance.name,
                "code": instance.code,
            }

            has_dependencies = (
                instance.unlocks_subjects.exists() or instance.grade_levels.exists()
            )

            if has_dependencies:
                instance.is_active = False
                instance.save()
                action_taken = "soft_deleted"
                message = f"Subject '{instance.name}' has been deactivated due to existing dependencies"
            else:
                instance.delete()
                action_taken = "deleted"
                message = (
                    f"Subject '{subject_info['name']}' has been permanently deleted"
                )

            clear_subject_caches()
            return Response(
                {
                    "success": True,
                    "message": message,
                    "action": action_taken,
                    "subject": subject_info,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as exc:
            logger.error("Error deleting subject %s: %s", instance.id, exc)
            return Response(
                {
                    "success": False,
                    "error": "Failed to delete subject",
                    "details": str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _clear_subject_caches(self):
        for key in [
            "subjects_cache_v1",
            "subjects_by_category_v3",
            "subjects_by_education_level_v2",
            "nursery_subjects_v1",
            "ss_subjects_by_type_v1",
            "cross_cutting_subjects_v1",
        ]:
            cache.delete(key)

    # -----------------------------------------------------------------------
    # Custom actions
    # -----------------------------------------------------------------------

    @action(detail=False, methods=["get"])
    def by_category(self, request):
        """Subjects grouped by SubjectCategory FK."""
        cache_key = "subjects_by_category_v4"
        result = cache.get(cache_key)

        if not result:
            result = {}
            categories = SubjectCategory.objects.filter(is_active=True).order_by(
                "display_order"
            )

            for category in categories:
                subjects = (
                    self.get_queryset()
                    .filter(category_new=category, is_active=True)
                    .order_by("subject_order", "name")
                )
                result[category.code] = {
                    "id": category.id,
                    "display_name": category.name,
                    "code": category.code,
                    "color_code": category.color_code,
                    "icon": self._get_category_icon(category.code),
                    "count": subjects.count(),
                    "subjects": SubjectListSerializer(subjects, many=True).data,
                }

            cache.set(cache_key, result, 60 * 30)

        return Response(result)

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        """Subjects grouped by EducationLevel FK (via grade_levels M2M)."""
        cache_key = "subjects_by_education_level_v3"
        result = cache.get(cache_key)

        if not result:
            result = {}
            education_levels = EducationLevel.objects.filter(is_active=True).order_by(
                "order"
            )

            for edu_level in education_levels:
                subjects = (
                    self.get_queryset()
                    .filter(grade_levels__education_level=edu_level, is_active=True)
                    .distinct()
                    .order_by("subject_order", "name")
                )
                result[edu_level.code] = {
                    "id": edu_level.id,
                    "name": edu_level.name,
                    "code": edu_level.code,
                    "level_type": edu_level.level_type,
                    "count": subjects.count(),
                    "summary": {
                        "cross_cutting": subjects.filter(is_cross_cutting=True).count()
                    },
                    "subjects": SubjectListSerializer(subjects, many=True).data,
                }

            cache.set(cache_key, result, 60 * 30)

        return Response(result)

    @action(detail=False, methods=["get"])
    def by_grade_level(self, request):
        """Subjects for a specific GradeLevel PK, grouped by category."""
        grade_level_id = request.query_params.get("grade_level_id")
        if not grade_level_id:
            return Response(
                {"error": "grade_level_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            grade_level = GradeLevel.objects.select_related("education_level").get(
                id=grade_level_id
            )
        except GradeLevel.DoesNotExist:
            return Response(
                {"error": "Grade level not found"}, status=status.HTTP_404_NOT_FOUND
            )

        subjects = (
            self.get_queryset()
            .filter(grade_levels=grade_level, is_active=True)
            .distinct()
            .order_by("subject_order", "name")
        )

        by_category = {}
        for category in SubjectCategory.objects.filter(is_active=True):
            cat_subjects = subjects.filter(category_new=category)
            if cat_subjects.exists():
                by_category[category.code] = {
                    "id": category.id,
                    "name": category.name,
                    "count": cat_subjects.count(),
                    "subjects": SubjectListSerializer(cat_subjects, many=True).data,
                }

        return Response(
            {
                "grade_level": {
                    "id": grade_level.id,
                    "name": grade_level.name,
                    "order": grade_level.order,
                    "education_level": (
                        grade_level.education_level.name
                        if grade_level.education_level
                        else None
                    ),
                },
                "summary": {
                    "total_subjects": subjects.count(),
                    "cross_cutting": subjects.filter(is_cross_cutting=True).count(),
                },
                "by_category": by_category,
            }
        )

    @action(detail=False, methods=["get"])
    def senior_secondary_subjects(self, request):
        """Senior Secondary subjects grouped by SubjectType FK."""
        try:
            ss_level = EducationLevel.objects.get(
                level_type="SENIOR_SECONDARY", is_active=True
            )
        except EducationLevel.DoesNotExist:
            return Response(
                {"error": "Senior Secondary education level not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        ss_subjects = (
            self.get_queryset()
            .filter(grade_levels__education_level=ss_level, is_active=True)
            .distinct()
        )

        subject_type_id = request.query_params.get("subject_type_id")
        if subject_type_id:
            ss_subjects = ss_subjects.filter(subject_type_new_id=subject_type_id)

        by_subject_type = {}
        for subject_type in SubjectType.objects.filter(is_active=True):
            type_subjects = ss_subjects.filter(subject_type_new=subject_type)
            if type_subjects.exists():
                by_subject_type[subject_type.code] = {
                    "id": subject_type.id,
                    "name": subject_type.name,
                    "code": subject_type.code,
                    "count": type_subjects.count(),
                    "subjects": SubjectListSerializer(type_subjects, many=True).data,
                }

        return Response(
            {
                "total_count": ss_subjects.count(),
                "cross_cutting_count": ss_subjects.filter(
                    is_cross_cutting=True
                ).count(),
                "by_subject_type": by_subject_type,
                "cross_cutting_subjects": SubjectListSerializer(
                    ss_subjects.filter(is_cross_cutting=True), many=True
                ).data,
            }
        )

    @action(detail=False, methods=["get"])
    def cross_cutting_subjects(self, request):
        """All cross-cutting subjects."""
        cross_cutting = (
            self.get_queryset()
            .filter(is_cross_cutting=True, is_active=True)
            .order_by("subject_order", "name")
        )
        return Response(
            {
                "count": cross_cutting.count(),
                "description": "Cross-cutting subjects required for all Senior Secondary students",
                "subjects": SubjectListSerializer(cross_cutting, many=True).data,
            }
        )

    @action(detail=True, methods=["get"])
    def prerequisites(self, request, pk=None):
        """Subject prerequisites and dependents."""
        subject = self.get_object()
        prerequisites = subject.prerequisites.filter(is_active=True)
        dependent_subjects = subject.unlocks_subjects.filter(is_active=True)

        return Response(
            {
                "subject": {
                    "id": subject.id,
                    "name": subject.name,
                    "code": subject.code,
                },
                "prerequisites": {
                    "count": prerequisites.count(),
                    "subjects": SubjectListSerializer(prerequisites, many=True).data,
                },
                "unlocks_subjects": {
                    "count": dependent_subjects.count(),
                    "subjects": SubjectListSerializer(
                        dependent_subjects, many=True
                    ).data,
                },
            }
        )

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Comprehensive subject statistics (cached 10 min)."""
        cache_key = "subject_statistics_v2"
        result = cache.get(cache_key)

        if not result:
            queryset = self.get_queryset()
            result = {
                "overview": {
                    "total_subjects": queryset.count(),
                    "active_subjects": queryset.filter(is_active=True).count(),
                    "cross_cutting": queryset.filter(is_cross_cutting=True).count(),
                },
                "by_education_level": {},
                "by_category": {},
                "by_subject_type": {},
            }

            for edu_level in EducationLevel.objects.filter(is_active=True):
                level_subjects = queryset.filter(
                    grade_levels__education_level=edu_level
                ).distinct()
                result["by_education_level"][edu_level.code] = {
                    "id": edu_level.id,
                    "name": edu_level.name,
                    "count": level_subjects.count(),
                }

            for category in SubjectCategory.objects.filter(is_active=True):
                result["by_category"][category.code] = {
                    "id": category.id,
                    "name": category.name,
                    "count": queryset.filter(category_new=category).count(),
                }

            for subject_type in SubjectType.objects.filter(is_active=True):
                result["by_subject_type"][subject_type.code] = {
                    "id": subject_type.id,
                    "name": subject_type.name,
                    "count": queryset.filter(subject_type_new=subject_type).count(),
                }

            cache.set(cache_key, result, 60 * 10)

        return Response(result)

    @action(detail=False, methods=["get"])
    def search_suggestions(self, request):
        """Fast search suggestions (max 15 results)."""
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response({"suggestions": []})

        subjects = (
            self.get_queryset()
            .filter(
                Q(name__icontains=query)
                | Q(short_name__icontains=query)
                | Q(code__icontains=query),
                is_active=True,
            )
            .select_related("category_new", "subject_type_new")
            .prefetch_related("grade_levels", "grade_levels__education_level")
        )[:15]

        suggestions = [
            {
                "id": s.id,
                "label": f"{s.short_name or s.name} ({s.code})",
                "name": s.name,
                "short_name": s.short_name,
                "display_name": s.short_name or s.name,
                "code": s.code,
                "category": s.category_new.name if s.category_new else None,
                "subject_type": s.subject_type_new.name if s.subject_type_new else None,
                "education_levels": ", ".join(
                    s.grade_levels.values_list(
                        "education_level__name", flat=True
                    ).distinct()
                )
                or "All levels",
                "badges": self._get_subject_badges(s),
            }
            for s in subjects
        ]

        return Response(
            {"query": query, "count": len(suggestions), "suggestions": suggestions}
        )

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    def _get_category_icon(self, category_code):
        icons = {
            "core": "📚",
            "elective": "🎯",
            "science": "🔬",
            "arts": "🎨",
            "humanities": "📖",
            "vocational": "🔧",
            "creative": "🎭",
            "religious": "🙏",
            "physical": "⚽",
            "language": "🗣️",
        }
        return icons.get(category_code, "📖")

    def _get_subject_badges(self, subject):
        badges = []
        if subject.is_cross_cutting:
            badges.append({"text": "Cross-cutting", "type": "info"})
        return badges

    def _get_availability_reasons(self, subject, is_grade_available):
        reasons = []
        if not subject.is_active:
            reasons.append("Subject is not currently active")
        if not is_grade_available:
            reasons.append("Subject is not available for this grade level")
        if not reasons:
            reasons.append("Subject is available")
        return reasons
