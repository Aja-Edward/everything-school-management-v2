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
from students.models import EducationLevel
from .utils import clear_subject_caches

from classroom.models import GradeLevel  # Commented out to avoid circular import

logger = logging.getLogger(__name__)


def filter_by_json_field(queryset, field_name, value):
    """
    Database-agnostic JSON field filtering that works with both SQLite and PostgreSQL.

    Args:
        queryset: The base queryset to filter
        field_name: The JSON field name (e.g., 'education_levels', 'nursery_levels')
        value: The value to search for in the JSON array

    Returns:
        Filtered queryset
    """
    # Since the database doesn't support contains lookup for JSON fields,
    # use Python-based filtering for all cases
    subject_ids = []
    for subject in queryset:
        if value in getattr(subject, field_name, []):
            subject_ids.append(subject.id)
    return queryset.filter(id__in=subject_ids)


def filter_subjects_by_education_level(queryset, education_level):
    """Filter subjects by education level using Python-based filtering."""
    subject_ids = []
    for subject in queryset:
        if education_level in getattr(subject, "education_levels", []):
            subject_ids.append(subject.id)
    return queryset.filter(id__in=subject_ids)


def filter_subjects_by_nursery_level(queryset, nursery_level):
    """Filter subjects by nursery level using Python-based filtering."""
    subject_ids = []
    for subject in queryset:
        if nursery_level in getattr(subject, "nursery_levels", []):
            subject_ids.append(subject.id)
    return queryset.filter(id__in=subject_ids)


class SubjectViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    Enhanced ViewSet for Subject CRUD operations
    UPDATED: Uses FK-based category_new, subject_type_new, and grade_levels M2M
    """

    queryset = Subject.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    # UPDATED: Filter by FK IDs
    filterset_fields = {
        "category_new": ["exact", "in"],  # FK to SubjectCategory
        "subject_type_new": ["exact", "in"],  # FK to SubjectType
        "is_active": ["exact"],
        "is_cross_cutting": ["exact"],
        "subject_order": ["exact", "gte", "lte"],
    }

    search_fields = [
        "name",
        "short_name",
        "code",
        "description",
    ]

    ordering_fields = [
        "name",
        "short_name",
        "code",
        "subject_order",
        "created_at",
    ]

    ordering = ["subject_order", "name"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        serializer_map = {
            "list": SubjectListSerializer,
            "create": SubjectCreateUpdateSerializer,
            "update": SubjectCreateUpdateSerializer,
            "partial_update": SubjectCreateUpdateSerializer,
        }
        return serializer_map.get(self.action, SubjectSerializer)

    def get_queryset(self):
        """
        Enhanced queryset with FK optimizations
        UPDATED: Prefetch category_new, subject_type_new, and grade_levels
        """
        queryset = super().get_queryset()

        queryset = queryset.select_related(
            "category_new",  # FK to SubjectCategory
            "subject_type_new",  # FK to SubjectType
        ).prefetch_related(
            "grade_levels",  # M2M to GradeLevel
            "grade_levels__education_level",  # Nested FK to EducationLevel
            Prefetch(
                "prerequisites",
                queryset=Subject.objects.filter(is_active=True).only(
                    "id", "name", "short_name", "code"
                ),
            ),
        )

        # Filter by education level (via grade_levels M2M FK chain)
        education_level_id = self.request.query_params.get("education_level_id")
        if education_level_id:
            queryset = queryset.filter(
                grade_levels__education_level_id=education_level_id
            ).distinct()

        # Filter by grade level directly
        grade_level_id = self.request.query_params.get("grade_level_id")
        if grade_level_id:
            queryset = queryset.filter(grade_levels__id=grade_level_id).distinct()

        # Filter by category (FK)
        category_id = self.request.query_params.get("category_id")
        if category_id:
            queryset = queryset.filter(category_new_id=category_id)

        # Filter by subject type (FK)
        subject_type_id = self.request.query_params.get("subject_type_id")
        if subject_type_id:
            queryset = queryset.filter(subject_type_new_id=subject_type_id)

        # Active only filtering
        available_only = self.request.query_params.get("available_only", "true").lower()
        if available_only == "true":
            queryset = queryset.filter(is_active=True)

        # Cross-cutting subjects filtering
        cross_cutting_only = self.request.query_params.get("cross_cutting_only")
        if cross_cutting_only == "true":
            queryset = queryset.filter(is_cross_cutting=True)

        return queryset

    def get_permissions(self):
        """Set permissions based on action"""
        if self.action in ["list", "retrieve", "statistics"]:
            return []  # Allow unauthenticated read access
        elif self.action in ["create", "update", "partial_update", "destroy"]:
            # For production, change this to [IsAuthenticated()]
            return []  # Temporarily allow unauthenticated for testing
        else:
            return [IsAuthenticated()]

    def filter_subjects_by_section_access(self, queryset):
        """
        Filter subjects based on user's section access permissions
        """
        user = self.request.user

        # Superadmins see everything
        if user.is_superuser and user.is_staff:
            return queryset

        # Check if user is a section admin
        section_admin_roles = [
            "secondary_admin",
            "senior_secondary_admin",
            "junior_secondary_admin",
            "primary_admin",
            "nursery_admin",
        ]

        user_role = getattr(user, "role", None)

        if user_role in section_admin_roles:
            # Determine which education levels this admin can access
            if user_role == "primary_admin":
                # Filter subjects that include PRIMARY in education_levels array
                subject_ids = []
                for subject in queryset:
                    education_levels = getattr(subject, "education_levels", [])
                    if "PRIMARY" in education_levels or "ALL" in education_levels:
                        subject_ids.append(subject.id)
                return queryset.filter(id__in=subject_ids)

            elif user_role == "nursery_admin":
                # Filter subjects that include NURSERY in education_levels array
                subject_ids = []
                for subject in queryset:
                    education_levels = getattr(subject, "education_levels", [])
                    if "NURSERY" in education_levels or "ALL" in education_levels:
                        subject_ids.append(subject.id)
                return queryset.filter(id__in=subject_ids)

            elif user_role in [
                "secondary_admin",
                "senior_secondary_admin",
                "junior_secondary_admin",
            ]:
                # Filter subjects for secondary levels (both JSS and SSS)
                subject_ids = []
                for subject in queryset:
                    education_levels = getattr(subject, "education_levels", [])
                    if any(
                        level in education_levels
                        for level in ["JUNIOR_SECONDARY", "SENIOR_SECONDARY", "ALL"]
                    ):
                        subject_ids.append(subject.id)
                return queryset.filter(id__in=subject_ids)
        # Check for role assignments from permissions system
        try:
            from schoolSettings.models import UserRole

            user_roles = UserRole.objects.filter(
                user=user, is_active=True
            ).select_related("role")

            if user_roles.exists():
                # Build list of accessible education levels
                accessible_levels = set()

                for user_role_obj in user_roles:
                    if user_role_obj.primary_section_access:
                        accessible_levels.add("PRIMARY")
                    if user_role_obj.secondary_section_access:
                        accessible_levels.add("JUNIOR_SECONDARY")
                        accessible_levels.add("SENIOR_SECONDARY")
                    if user_role_obj.nursery_section_access:
                        accessible_levels.add("NURSERY")

                if accessible_levels:
                    accessible_levels.add(
                        "ALL"
                    )  # Always include subjects marked as ALL

                    # Filter subjects by accessible education levels
                    subject_ids = []
                    for subject in queryset:
                        education_levels = getattr(subject, "education_levels", [])
                        if any(
                            level in education_levels for level in accessible_levels
                        ):
                            subject_ids.append(subject.id)
                    return queryset.filter(id__in=subject_ids)

        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Error checking role assignments: {e}")
        # Default: return all active subjects for regular admins and teachers
        if user.is_staff or user_role in ["admin", "teacher"]:
            return queryset

        # For other users, return all active subjects
        return queryset.filter(is_active=True)

    def list(self, request, *args, **kwargs):
        """Enhanced list with comprehensive metadata"""
        response = super().list(request, *args, **kwargs)
        if hasattr(response, "data") and isinstance(response.data, dict):
            if "results" in response.data:
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
        return response

    def perform_create(self, serializer):
        """Create with enhanced logging and cache invalidation"""
        with transaction.atomic():
            subject = serializer.save()
            clear_subject_caches()
            logger.info(
                f"Subject '{subject.name}' ({subject.code}) created by {self.request.user}"
            )

    def perform_update(self, serializer):
        """Update with enhanced logging and cache invalidation"""
        with transaction.atomic():
            old_name = serializer.instance.name
            subject = serializer.save()
            clear_subject_caches()
            logger.info(
                f"Subject '{old_name}' updated to '{subject.name}' by {self.request.user}"
            )

    def destroy(self, request, *args, **kwargs):
        """Override destroy method to ensure proper JSON response"""
        instance = self.get_object()

        try:
            subject_info = {
                "id": instance.id,
                "name": instance.name,
                "code": instance.code,
            }

            # Check for dependencies
            has_dependencies = (
                instance.unlocks_subjects.exists() or instance.grade_levels.exists()
            )

            if has_dependencies:
                # Soft delete
                instance.is_active = False
                instance.save()
                action_taken = "soft_deleted"
                message = f"Subject '{instance.name}' has been deactivated due to existing dependencies"
            else:
                # Hard delete
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

        except Exception as e:
            logger.error(f"Error deleting subject {instance.id}: {str(e)}")
            return Response(
                {
                    "success": False,
                    "error": "Failed to delete subject",
                    "details": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _clear_subject_caches(self):
        """Clear all subject-related caches"""
        cache_keys = [
            "subjects_cache_v1",
            "subjects_by_category_v3",
            "subjects_by_education_level_v2",
            "nursery_subjects_v1",
            "ss_subjects_by_type_v1",
            "cross_cutting_subjects_v1",
        ]
        for key in cache_keys:
            cache.delete(key)

    @action(detail=False, methods=["get"])
    def by_category(self, request):
        """
        Get subjects grouped by category
        UPDATED: Uses FK-based SubjectCategory
        """
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
        """
        Get subjects grouped by education level
        UPDATED: Uses grade_levels M2M with EducationLevel FK
        """
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
                        "cross_cutting": subjects.filter(is_cross_cutting=True).count(),
                    },
                    "subjects": SubjectListSerializer(subjects, many=True).data,
                }

            cache.set(cache_key, result, 60 * 30)

        return Response(result)

    @action(detail=False, methods=["get"])
    def by_grade_level(self, request):
        """
        Get subjects by specific grade level
        Query params: grade_level_id
        """
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

        # Categorize subjects
        by_category = {}
        categories = SubjectCategory.objects.filter(is_active=True)

        for category in categories:
            category_subjects = subjects.filter(category_new=category)
            if category_subjects.exists():
                by_category[category.code] = {
                    "id": category.id,
                    "name": category.name,
                    "count": category_subjects.count(),
                    "subjects": SubjectListSerializer(
                        category_subjects, many=True
                    ).data,
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
        """
        Get Senior Secondary subjects with classification breakdown
        UPDATED: Uses subject_type_new FK
        """
        # Get SS education level
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

        # Filter by subject type if provided
        subject_type_id = request.query_params.get("subject_type_id")
        if subject_type_id:
            ss_subjects = ss_subjects.filter(subject_type_new_id=subject_type_id)

        # Group by subject type
        by_subject_type = {}
        subject_types = SubjectType.objects.filter(is_active=True)

        for subject_type in subject_types:
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
        """Get cross-cutting subjects for Senior Secondary"""
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
        """Enhanced prerequisites with dependency tree"""
        subject = self.get_object()

        # Get prerequisites
        prerequisites = subject.prerequisites.filter(is_active=True)

        # Get dependent subjects (subjects that require this one)
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
        """
        Get comprehensive subject statistics
        UPDATED: Uses FK-based relationships
        """
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

            # Statistics by education level
            education_levels = EducationLevel.objects.filter(is_active=True)
            for edu_level in education_levels:
                level_subjects = queryset.filter(
                    grade_levels__education_level=edu_level
                ).distinct()

                result["by_education_level"][edu_level.code] = {
                    "id": edu_level.id,
                    "name": edu_level.name,
                    "count": level_subjects.count(),
                }

            # Statistics by category
            categories = SubjectCategory.objects.filter(is_active=True)
            for category in categories:
                category_subjects = queryset.filter(category_new=category)
                result["by_category"][category.code] = {
                    "id": category.id,
                    "name": category.name,
                    "count": category_subjects.count(),
                }

            # Statistics by subject type (SS)
            subject_types = SubjectType.objects.filter(is_active=True)
            for subject_type in subject_types:
                type_subjects = queryset.filter(subject_type_new=subject_type)
                result["by_subject_type"][subject_type.code] = {
                    "id": subject_type.id,
                    "name": subject_type.name,
                    "count": type_subjects.count(),
                }

            cache.set(cache_key, result, 60 * 10)

        return Response(result)

    @action(detail=False, methods=["get"])
    def search_suggestions(self, request):
        """Enhanced search suggestions"""
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
            .prefetch_related("grade_levels", "grade_levels__education_level")[:15]
        )

        suggestions = []
        for s in subjects:
            display_name = s.short_name or s.name

            # Get education levels from grade_levels M2M
            education_levels = list(
                s.grade_levels.values_list(
                    "education_level__name", flat=True
                ).distinct()
            )

            suggestions.append(
                {
                    "id": s.id,
                    "label": f"{display_name} ({s.code})",
                    "name": s.name,
                    "short_name": s.short_name,
                    "display_name": display_name,
                    "code": s.code,
                    "category": s.category_new.name if s.category_new else None,
                    "subject_type": (
                        s.subject_type_new.name if s.subject_type_new else None
                    ),
                    "education_levels": (
                        ", ".join(education_levels)
                        if education_levels
                        else "All levels"
                    ),
                    "badges": self._get_subject_badges(s),
                }
            )

        return Response(
            {"query": query, "count": len(suggestions), "suggestions": suggestions}
        )

    def _get_category_icon(self, category_code):
        """Get icon for category display"""
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
        """Get display badges for subjects"""
        badges = []

        if subject.is_cross_cutting:
            badges.append({"text": "Cross-cutting", "type": "info"})

        return badges

    def _get_availability_reasons(self, subject, is_grade_available):
        """Get reasons for availability status"""
        reasons = []

        if not subject.is_active:
            reasons.append("Subject is not currently active")
        if not is_grade_available:
            reasons.append("Subject is not available for this grade level")
        if not reasons:
            reasons.append("Subject is available")

        return reasons
