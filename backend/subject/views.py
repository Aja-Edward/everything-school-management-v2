# views.py
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Count, Avg, Sum, Prefetch, Min, Max
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.core.cache import cache
from django.db import transaction
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
import logging

from tenants.mixins import TenantFilterMixin
from utils.section_filtering import AutoSectionFilterMixin
from utils.pagination import StandardResultsPagination, LargeResultsPagination

from .models import (
    Subject,
    SubjectCategory,
    SubjectType,
    SchoolStreamConfiguration,
    SchoolStreamSubjectAssignment,
    SubjectCombination,
)

# from classroom.models import GradeLevel  # Commented out to avoid circular import
from classroom.models import GradeLevel
from academics.models import EducationLevel

from .serializers import (
    SubjectSerializer,
    SubjectListSerializer,
    SubjectCreateUpdateSerializer,
    SubjectEducationLevelSerializer,
    SubjectCategorySerializer,
    SubjectTypeSerializer,
    SchoolStreamConfigurationSerializer,
    SchoolStreamSubjectAssignmentSerializer,
    SubjectCombinationSerializer,
)


# Import the separated viewsets
from .subjectviewset import SubjectViewSet
from .analyticalviewset import SubjectAnalyticsViewSet
from .subjectmanagementviewset import SubjectManagementViewSet

logger = logging.getLogger(__name__)
from .utils import filter_subjects_by_education_level, clear_subject_caches


logger = logging.getLogger(__name__)


# ==============================================================================
# SubjectCategory ViewSet - NEW
# ==============================================================================
class SubjectCategoryViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    """
    ViewSet for managing subject categories
    REPLACES: Old SUBJECT_CATEGORY_CHOICES CharField
    """

    queryset = SubjectCategory.objects.all()
    serializer_class = SubjectCategorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "display_order", "created_at"]
    ordering = ["display_order", "name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset.prefetch_related(
            Prefetch(
                "subjects_new",
                queryset=Subject.objects.filter(is_active=True).order_by(
                    "subject_order"
                ),
            )
        )

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        """Get all subjects in this category"""
        category = self.get_object()
        subjects = category.subjects_new.filter(is_active=True).order_by(
            "subject_order"
        )
        subjects = self.apply_section_filters(subjects)

        serializer = SubjectListSerializer(subjects, many=True)
        return Response(
            {
                "category": SubjectCategorySerializer(category).data,
                "total_subjects": subjects.count(),
                "subjects": serializer.data,
            }
        )

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get category statistics"""
        queryset = self.get_queryset()

        stats = []
        for category in queryset.filter(is_active=True):
            subject_count = category.subjects_new.filter(is_active=True).count()
            stats.append(
                {
                    "id": category.id,
                    "name": category.name,
                    "code": category.code,
                    "subject_count": subject_count,
                    "color_code": category.color_code,
                }
            )

        return Response({"total_categories": len(stats), "categories": stats})


# ==============================================================================
# SubjectType ViewSet - NEW
# ==============================================================================
class SubjectTypeViewSet(
    TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet
):
    """
    ViewSet for managing subject types (Senior Secondary)
    REPLACES: Old SS_SUBJECT_TYPES CharField
    """

    queryset = SubjectType.objects.all()
    serializer_class = SubjectTypeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset.prefetch_related(
            Prefetch(
                "subjects_new",
                queryset=Subject.objects.filter(is_active=True).order_by(
                    "subject_order"
                ),
            )
        )

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        """Get all subjects of this type"""
        subject_type = self.get_object()
        subjects = subject_type.subjects_new.filter(is_active=True).order_by(
            "subject_order"
        )
        subjects = self.apply_section_filters(subjects)

        serializer = SubjectListSerializer(subjects, many=True)
        return Response(
            {
                "subject_type": SubjectTypeSerializer(subject_type).data,
                "total_subjects": subjects.count(),
                "subjects": serializer.data,
            }
        )

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get subject type statistics"""
        queryset = self.get_queryset()

        stats = []
        for subject_type in queryset.filter(is_active=True):
            subject_count = subject_type.subjects_new.filter(is_active=True).count()
            stats.append(
                {
                    "id": subject_type.id,
                    "name": subject_type.name,
                    "code": subject_type.code,
                    "subject_count": subject_count,
                }
            )

        return Response({"total_types": len(stats), "subject_types": stats})


from rest_framework.views import APIView


class SubjectByEducationLevelView(APIView):
    def get(self, request):
        level = request.query_params.get("level")
        if not level:
            return Response({"error": "Missing 'level' query parameter."}, status=400)

        subjects = Subject.objects.filter(education_level=level)
        serializer = SubjectEducationLevelSerializer(subjects, many=True)
        return Response(serializer.data)


# ==============================================================================
# STREAM CONFIGURATION VIEWSETS
# ==============================================================================


class SchoolStreamConfigurationViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing school stream configurations
    UPDATED: Works with FK-based Stream model
    """

    queryset = SchoolStreamConfiguration.objects.all()
    serializer_class = SchoolStreamConfigurationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        queryset = super().get_queryset()

        queryset = (
            queryset.select_related(
                "stream",
                "stream__stream_type_new",  # FK to StreamType
                "stream__grade_level",
                "stream__academic_session",
            )
            .filter(is_active=True)
            .prefetch_related("subject_assignments__subject")
        )

        # Filter by stream if provided
        stream_id = self.request.query_params.get("stream_id")
        if stream_id:
            queryset = queryset.filter(stream_id=stream_id)

        # Filter by subject role if provided
        subject_role = self.request.query_params.get("subject_role")
        if subject_role:
            queryset = queryset.filter(subject_role=subject_role)

        return queryset

    def perform_create(self, serializer):
        """Set tenant when creating new configurations"""
        tenant = getattr(self.request, "tenant", None)
        if tenant:
            serializer.save(tenant=tenant)
        else:
            serializer.save()

    def perform_update(self, serializer):
        """Ensure tenant is preserved when updating configurations"""
        tenant = getattr(self.request, "tenant", None)
        if tenant:
            serializer.save(tenant=tenant)
        else:
            serializer.save()

    @action(detail=False, methods=["post"])
    def setup_defaults(self, request):
        """Setup default configurations for all streams in the tenant"""
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return Response(
                {"error": "Tenant context required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from classroom.models import Stream
        from subject.models import SchoolStreamSubjectAssignment

        try:
            # Get all active streams for this tenant
            streams = Stream.objects.filter(tenant=tenant, is_active=True)

            if not streams.exists():
                return Response(
                    {"error": "No active streams found for this tenant"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            created_configs = []
            assigned_subjects = []
            with transaction.atomic():
                for stream in streams:
                    # Define default configurations for each stream
                    roles = [
                        {
                            "subject_role": SchoolStreamConfiguration.CORE_SUBJECTS,
                            "min_subjects_required": 3,
                            "max_subjects_allowed": 5,
                            "is_compulsory": True,
                            "display_order": 1,
                        },
                        {
                            "subject_role": SchoolStreamConfiguration.ELECTIVE_SUBJECTS,
                            "min_subjects_required": 2,
                            "max_subjects_allowed": 3,
                            "is_compulsory": False,
                            "display_order": 2,
                        },
                        {
                            "subject_role": SchoolStreamConfiguration.CROSS_CUTTING_SUBJECTS,
                            "min_subjects_required": 2,
                            "max_subjects_allowed": 4,
                            "is_compulsory": True,
                            "display_order": 3,
                        },
                    ]

                    for role_config in roles:
                        # Check if configuration already exists
                        existing = SchoolStreamConfiguration.objects.filter(
                            tenant=tenant,
                            stream=stream,
                            subject_role=role_config["subject_role"],
                        ).first()

                        if not existing:
                            # Create new configuration
                            config = SchoolStreamConfiguration.objects.create(
                                tenant=tenant, stream=stream, **role_config
                            )
                            created_configs.append(
                                {
                                    "stream_name": stream.name,
                                    "subject_role": role_config["subject_role"],
                                    "config_id": config.id,
                                }
                            )

                            # Assign default subjects to this configuration
                            subjects_assigned = self._assign_default_subjects_to_config(
                                config, stream
                            )
                            assigned_subjects.extend(subjects_assigned)
                        else:
                            # Configuration exists, ensure it has subjects assigned
                            existing_assignments = (
                                SchoolStreamSubjectAssignment.objects.filter(
                                    tenant=tenant, stream_config=existing
                                )
                            )
                            if not existing_assignments.exists():
                                subjects_assigned = (
                                    self._assign_default_subjects_to_config(
                                        existing, stream
                                    )
                                )
                                assigned_subjects.extend(subjects_assigned)

            return Response(
                {
                    "message": f"Successfully created {len(created_configs)} default configurations and assigned {len(assigned_subjects)} subjects",
                    "created_configs": created_configs,
                    "assigned_subjects": assigned_subjects,
                    "total_streams": streams.count(),
                }
            )

        except Exception as e:
            logger.error(f"Error setting up default configurations: {e}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _assign_default_subjects_to_config(self, config, stream):
        """Assign default subjects to a stream configuration based on stream type and subject role"""
        from subject.models import SchoolStreamSubjectAssignment, Subject

        tenant = config.tenant
        assigned_subjects = []

        try:
            # Get subjects based on configuration role and stream type
            if config.subject_role == SchoolStreamConfiguration.CORE_SUBJECTS:
                # Core subjects based on stream type
                if stream.stream_type == "SCIENCE":
                    subject_codes = ["MATH-SS", "ENG-SS", "PHY-SS", "CHEM-SS", "BIO-SS"]
                elif stream.stream_type == "ARTS":
                    subject_codes = ["MATH-SS", "ENG-SS", "LIT-SS", "GOV-SS", "CRS-SS"]
                elif stream.stream_type == "COMMERCIAL":
                    subject_codes = ["MATH-SS", "ENG-SS", "ACC-SS", "COM-SS", "ECO-SS"]
                elif stream.stream_type == "TECHNICAL":
                    subject_codes = [
                        "MATH-SS",
                        "ENG-SS",
                        "PHY-SS",
                        "TECH-SS",
                        "WOOD-SS",
                    ]
                else:
                    # Default core subjects
                    subject_codes = ["MATH-SS", "ENG-SS"]

            elif config.subject_role == SchoolStreamConfiguration.ELECTIVE_SUBJECTS:
                # Elective subjects - more options available
                if stream.stream_type == "SCIENCE":
                    subject_codes = ["PHY-SS", "CHEM-SS", "BIO-SS", "GEO-SS", "ICT-SS"]
                elif stream.stream_type == "ARTS":
                    subject_codes = ["GEO-SS", "HIST-SS", "LIT-SS", "GOV-SS", "CRS-SS"]
                elif stream.stream_type == "COMMERCIAL":
                    subject_codes = ["GEO-SS", "HIST-SS", "LIT-SS", "GOV-SS", "ICT-SS"]
                elif stream.stream_type == "TECHNICAL":
                    subject_codes = [
                        "CHEM-SS",
                        "BIO-SS",
                        "WOOD-SS",
                        "METAL-SS",
                        "ELEC-SS",
                    ]
                else:
                    subject_codes = ["GEO-SS", "HIST-SS"]

            elif (
                config.subject_role == SchoolStreamConfiguration.CROSS_CUTTING_SUBJECTS
            ):
                # Cross-cutting subjects apply to all streams
                subject_codes = ["CRS-SS", "ICT-SS", "PE-SS", "CIVIC-SS"]

            # Get existing subjects by code
            subjects = Subject.objects.filter(
                tenant=tenant, code__in=subject_codes, is_active=True
            )

            # Create assignments for found subjects
            for subject in subjects:
                assignment, created = (
                    SchoolStreamSubjectAssignment.objects.get_or_create(
                        tenant=tenant,
                        stream_config=config,
                        subject=subject,
                        defaults={
                            "is_compulsory": config.is_compulsory,
                            "credit_weight": (
                                getattr(subject, "credit_hours", 1)
                                if hasattr(subject, "credit_hours")
                                else 1
                            ),
                        },
                    )
                )
                if created:
                    assigned_subjects.append(
                        {
                            "config_id": config.id,
                            "subject_name": subject.name,
                            "subject_code": subject.code,
                            "subject_role": config.subject_role,
                        }
                    )

        except Exception as e:
            logger.error(f"Error assigning subjects to config {config.id}: {e}")

        return assigned_subjects

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Get summary of stream configurations for the current tenant"""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response(
                {"error": "Tenant context required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        configs = self.get_queryset().filter(tenant=tenant)

        summary_data = []

        for config in configs:
            stream_data = {
                "stream_id": config.stream.id,
                "stream_name": config.stream.name,
                # stream_type via FK
                "stream_type": (
                    config.stream.stream_type_new.name
                    if config.stream.stream_type_new
                    else None
                ),
                "stream_type_code": (
                    config.stream.stream_type_new.code
                    if config.stream.stream_type_new
                    else None
                ),
                "subject_role": config.subject_role,
                "min_subjects_required": config.min_subjects_required,
                "max_subjects_allowed": config.max_subjects_allowed,
                "is_compulsory": config.is_compulsory,
                "subjects": [],
            }

            # Get subjects for this configuration
            assignments = config.subject_assignments.filter(is_active=True)
            for assignment in assignments:
                subject_info = {
                    "id": assignment.subject.id,
                    "name": assignment.subject.name,
                    "code": assignment.subject.code,
                    "is_compulsory": assignment.is_compulsory,
                    "credit_weight": assignment.credit_weight,
                }
                stream_data["subjects"].append(subject_info)

            summary_data.append(stream_data)

        return Response(summary_data)

    @action(detail=True, methods=["post"])
    def bulk_assign_subjects(self, request, pk=None):
        """Bulk assign subjects to a stream configuration"""
        config = self.get_object()
        subject_ids = request.data.get("subject_ids", [])

        if not subject_ids:
            return Response(
                {"error": "subject_ids list is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(subject_ids, list):
            return Response(
                {"error": "subject_ids must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = getattr(request, "tenant", None)
        if not tenant:
            return Response(
                {"error": "Tenant context required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                assigned_subjects = []
                skipped_subjects = []

                for subject_id in subject_ids:
                    try:
                        # Validate subject exists and belongs to tenant
                        subject = Subject.objects.get(
                            id=subject_id, tenant=tenant, is_active=True
                        )

                        # Check if assignment already exists
                        existing_assignment = (
                            SchoolStreamSubjectAssignment.objects.filter(
                                tenant=tenant,
                                stream_config=config,
                                subject=subject,
                                is_active=True,
                            ).first()
                        )

                        if existing_assignment:
                            skipped_subjects.append(
                                {
                                    "id": subject.id,
                                    "name": subject.name,
                                    "code": subject.code,
                                    "reason": "Already assigned to this configuration",
                                }
                            )
                            continue

                        # Create new assignment
                        assignment = SchoolStreamSubjectAssignment.objects.create(
                            tenant=tenant,
                            stream_config=config,
                            subject=subject,
                            is_compulsory=config.is_compulsory,  # Use config's compulsory setting
                            credit_weight=getattr(subject, "credit_hours", 1),
                        )

                        assigned_subjects.append(
                            {
                                "id": subject.id,
                                "name": subject.name,
                                "code": subject.code,
                                "is_compulsory": assignment.is_compulsory,
                                "credit_weight": assignment.credit_weight,
                            }
                        )

                    except Subject.DoesNotExist:
                        skipped_subjects.append(
                            {
                                "id": subject_id,
                                "reason": "Subject not found or inactive",
                            }
                        )
                    except Exception as e:
                        logger.error(
                            "Error assigning subject {}: {}".format(subject_id, e)
                        )
                        skipped_subjects.append(
                            {"id": subject_id, "reason": "Error: {}".format(str(e))}
                        )

                return Response(
                    {
                        "message": "Successfully assigned {} subjects".format(
                            len(assigned_subjects)
                        ),
                        "assigned_subjects": assigned_subjects,
                        "skipped_subjects": skipped_subjects,
                        "total_requested": len(subject_ids),
                        "total_assigned": len(assigned_subjects),
                        "total_skipped": len(skipped_subjects),
                    }
                )

        except Exception as e:
            logger.error("Error in bulk assign subjects: {}".format(e), exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def remove_subject(self, request, pk=None):
        """Remove a single subject from a stream configuration"""
        config = self.get_object()
        subject_id = request.data.get("subject_id")

        if not subject_id:
            return Response(
                {"error": "subject_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = getattr(request, "tenant", None)
        if not tenant:
            return Response(
                {"error": "Tenant context required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                # Find and delete the assignment
                assignment = SchoolStreamSubjectAssignment.objects.filter(
                    tenant=tenant,
                    stream_config=config,
                    subject_id=subject_id,
                    is_active=True,
                ).first()

                if not assignment:
                    return Response(
                        {
                            "error": "Subject assignment not found or already inactive",
                            "subject_id": subject_id,
                        },
                        status=status.HTTP_404_NOT_FOUND,
                    )

                # Soft delete by marking as inactive
                assignment.is_active = False
                assignment.save()

                logger.info(
                    f"Subject {subject_id} removed from config {config.id} by {request.user}"
                )

                return Response(
                    {
                        "message": f"Successfully removed subject from configuration",
                        "subject_id": subject_id,
                        "config_id": config.id,
                    }
                )

        except Exception as e:
            logger.error(f"Error removing subject: {str(e)}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class SchoolStreamSubjectAssignmentViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """ViewSet for managing stream subject assignments"""

    queryset = SchoolStreamSubjectAssignment.objects.all()
    serializer_class = SchoolStreamSubjectAssignmentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        queryset = super().get_queryset()

        queryset = queryset.select_related(
            "stream_config__stream",
            "stream_config__stream__stream_type_new",  # FK to StreamType
            "subject",
            "subject__category_new",  # FK to SubjectCategory
            "subject__subject_type_new",  # FK to SubjectType
        ).filter(is_active=True)

        # Filter by stream config if provided
        stream_config_id = self.request.query_params.get("stream_config_id")
        if stream_config_id:
            queryset = queryset.filter(stream_config_id=stream_config_id)

        # Filter by subject if provided
        subject_id = self.request.query_params.get("subject_id")
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)

        return queryset

    def perform_create(self, serializer):
        """Set tenant when creating new assignments"""
        tenant = getattr(self.request, "tenant", None)
        if tenant:
            serializer.save(tenant=tenant)
        else:
            serializer.save()

    def perform_update(self, serializer):
        """Ensure tenant is preserved when updating assignments"""
        tenant = getattr(self.request, "tenant", None)
        if tenant:
            serializer.save(tenant=tenant)
        else:
            serializer.save()

    @action(detail=False, methods=["post"])
    def bulk_assign(self, request):
        """Bulk assign subjects to a stream configuration"""
        stream_config_id = request.data.get("stream_config_id")
        subject_ids = request.data.get("subject_ids", [])

        if not stream_config_id or not subject_ids:
            return Response(
                {"error": "stream_config_id and subject_ids are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            stream_config = SchoolStreamConfiguration.objects.get(
                id=stream_config_id, is_active=True
            )
        except SchoolStreamConfiguration.DoesNotExist:
            return Response(
                {"error": "Stream configuration not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Create assignments for each subject
        created_count = 0
        for subject_id in subject_ids:
            try:
                subject = Subject.objects.get(id=subject_id, is_active=True)
                assignment, created = (
                    SchoolStreamSubjectAssignment.objects.get_or_create(
                        stream_config=stream_config,
                        subject=subject,
                        defaults={
                            "is_compulsory": False,
                            "credit_weight": 1,
                            "can_be_elective_elsewhere": True,
                        },
                    )
                )
                if created:
                    created_count += 1
            except Subject.DoesNotExist:
                continue

        return Response(
            {
                "message": f"Successfully assigned {created_count} subjects",
                "created_count": created_count,
            }
        )


class SubjectCombinationViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """ViewSet for managing subject combinations"""

    queryset = SubjectCombination.objects.all()
    serializer_class = SubjectCombinationSerializer

    def get_queryset(self):
        """Filter by tenant"""
        return super().get_queryset().filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        """Set tenant on create"""
        serializer.save(tenant=self.request.tenant)

    def perform_update(self, serializer):
        """Set tenant on update"""
        serializer.save(tenant=self.request.tenant)


def _format_combinations(stream_id, tenant=None):
    """Helper function to format subject combinations for response"""
    logger.info(f"📊 _format_combinations(stream_id={stream_id}, tenant={tenant})")

    queryset = SchoolStreamConfiguration.objects.filter(
        stream_id=stream_id, is_active=True
    ).prefetch_related(
        "subject_assignments__subject",
    )

    logger.info(f"   Initial queryset count: {queryset.count()}")

    # Filter by tenant if provided
    if tenant:
        queryset = queryset.filter(tenant=tenant)
        logger.info(f"   After tenant filter: {queryset.count()}")

    configs = queryset

    combinations = []
    for config in configs:
        logger.info(f"   Processing config {config.id} (role={config.subject_role})")
        assignments = config.subject_assignments.filter(is_active=True)
        logger.info(f"      Active assignments: {assignments.count()}")

        subjects = []
        for assignment in assignments:
            subj = assignment.subject
            subjects.append(
                {
                    "id": subj.id,
                    "name": subj.name,
                    "code": subj.code,
                    "is_compulsory": assignment.is_compulsory,
                    "credit_weight": assignment.credit_weight,
                }
            )

        combinations.append(
            {
                "config_id": config.id,
                "subject_role": config.subject_role,
                "min_subjects_required": config.min_subjects_required,
                "max_subjects_allowed": config.max_subjects_allowed,
                "is_compulsory": config.is_compulsory,
                "subjects": subjects,
            }
        )

    logger.info(f"   Total combinations: {len(combinations)}")
    return combinations


@api_view(["GET", "POST", "PUT"])
@permission_classes([IsAuthenticated])
def subject_combinations(request):
    """
    GET: Fetch subject combinations for a stream
    POST: Create new subject combination configurations
    PUT: Update existing subject combination configurations
    """

    if request.method == "GET":
        stream_id = request.GET.get("stream")
        logger.info(f"📋 GET /subject-combinations/ - stream_id={stream_id}")

        if not stream_id:
            return Response(
                {"error": "Missing 'stream' query parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Get tenant from request
            tenant = getattr(request, "tenant", None)
            logger.info(f"   Tenant: {tenant}")

            combinations = _format_combinations(stream_id, tenant=tenant)
            logger.info(f"   Found {len(combinations)} combinations")

            return Response(
                {
                    "stream_id": stream_id,
                    "total_combinations": len(combinations),
                    "combinations": combinations,
                }
            )

        except Exception as e:
            logger.error(f"Error fetching subject combinations: {e}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    elif request.method == "POST":
        """Create new subject combinations for a stream"""
        try:
            stream_id = request.data.get("stream_id")
            if not stream_id:
                return Response(
                    {"error": "Missing 'stream_id' in request body."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from classroom.models import Stream

            stream = get_object_or_404(Stream, id=stream_id)

            # Get tenant from request
            tenant = (
                request.user.school_profile.tenant
                if hasattr(request.user, "school_profile")
                else None
            )

            # Create or update configurations for each subject role
            roles = {
                "core_subjects": SchoolStreamConfiguration.CORE_SUBJECTS,
                "elective_subjects": SchoolStreamConfiguration.ELECTIVE_SUBJECTS,
                "cross_cutting_subjects": SchoolStreamConfiguration.CROSS_CUTTING_SUBJECTS,
            }

            with transaction.atomic():
                for role_key, role_value in roles.items():
                    subject_ids = request.data.get(role_key, [])

                    if subject_ids:
                        # Create or get the configuration
                        config, created = (
                            SchoolStreamConfiguration.objects.get_or_create(
                                tenant=tenant,
                                stream=stream,
                                subject_role=role_value,
                                defaults={
                                    "min_subjects_required": request.data.get(
                                        "min_subjects_required", 1
                                    ),
                                    "max_subjects_allowed": request.data.get(
                                        "max_subjects_allowed", 5
                                    ),
                                    "is_compulsory": request.data.get(
                                        "is_compulsory", True
                                    ),
                                    "display_order": request.data.get(
                                        "display_order", 0
                                    ),
                                    "is_active": request.data.get("is_active", True),
                                },
                            )
                        )

                        # Update configuration if it already exists
                        if not created:
                            config.is_active = request.data.get(
                                "is_active", config.is_active
                            )
                            config.save()

                        # Create subject assignments
                        for subject_id in subject_ids:
                            try:
                                subject = Subject.objects.get(
                                    id=subject_id, is_active=True
                                )
                                SchoolStreamSubjectAssignment.objects.get_or_create(
                                    tenant=tenant,
                                    stream_config=config,
                                    subject=subject,
                                    defaults={
                                        "is_compulsory": request.data.get(
                                            "is_compulsory", False
                                        ),
                                        "credit_weight": request.data.get(
                                            "credit_weight", 1
                                        ),
                                        "can_be_elective_elsewhere": True,
                                        "is_active": True,
                                    },
                                )
                            except Subject.DoesNotExist:
                                continue

            combinations = _format_combinations(stream_id)
            return Response(
                {
                    "message": "Subject combinations created successfully",
                    "stream_id": stream_id,
                    "total_combinations": len(combinations),
                    "combinations": combinations,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            logger.error(f"Error creating subject combinations: {e}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    elif request.method == "PUT":
        """Update existing subject combinations"""
        try:
            stream_id = request.data.get("stream_id")
            if not stream_id:
                return Response(
                    {"error": "Missing 'stream_id' in request body."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from classroom.models import Stream

            stream = get_object_or_404(Stream, id=stream_id)

            # Get tenant from request
            tenant = (
                request.user.school_profile.tenant
                if hasattr(request.user, "school_profile")
                else None
            )

            roles = {
                "core_subjects": SchoolStreamConfiguration.CORE_SUBJECTS,
                "elective_subjects": SchoolStreamConfiguration.ELECTIVE_SUBJECTS,
                "cross_cutting_subjects": SchoolStreamConfiguration.CROSS_CUTTING_SUBJECTS,
            }

            with transaction.atomic():
                for role_key, role_value in roles.items():
                    subject_ids = request.data.get(role_key, [])

                    try:
                        config = SchoolStreamConfiguration.objects.get(
                            tenant=tenant,
                            stream=stream,
                            subject_role=role_value,
                        )

                        # Update configuration
                        config.is_active = request.data.get(
                            "is_active", config.is_active
                        )
                        config.min_subjects_required = request.data.get(
                            "min_subjects_required", config.min_subjects_required
                        )
                        config.max_subjects_allowed = request.data.get(
                            "max_subjects_allowed", config.max_subjects_allowed
                        )
                        config.is_compulsory = request.data.get(
                            "is_compulsory", config.is_compulsory
                        )
                        config.display_order = request.data.get(
                            "display_order", config.display_order
                        )
                        config.save()

                        # Delete existing assignments for this config
                        config.subject_assignments.all().delete()

                        # Create new subject assignments
                        for subject_id in subject_ids:
                            try:
                                subject = Subject.objects.get(
                                    id=subject_id, is_active=True
                                )
                                SchoolStreamSubjectAssignment.objects.get_or_create(
                                    tenant=tenant,
                                    stream_config=config,
                                    subject=subject,
                                    defaults={
                                        "is_compulsory": request.data.get(
                                            "is_compulsory", False
                                        ),
                                        "credit_weight": request.data.get(
                                            "credit_weight", 1
                                        ),
                                        "can_be_elective_elsewhere": True,
                                        "is_active": True,
                                    },
                                )
                            except Subject.DoesNotExist:
                                continue

                    except SchoolStreamConfiguration.DoesNotExist:
                        # Configuration doesn't exist, create it
                        if subject_ids:
                            config = SchoolStreamConfiguration.objects.create(
                                tenant=tenant,
                                stream=stream,
                                subject_role=role_value,
                                min_subjects_required=request.data.get(
                                    "min_subjects_required", 1
                                ),
                                max_subjects_allowed=request.data.get(
                                    "max_subjects_allowed", 5
                                ),
                                is_compulsory=request.data.get("is_compulsory", True),
                                display_order=request.data.get("display_order", 0),
                                is_active=request.data.get("is_active", True),
                            )

                            for subject_id in subject_ids:
                                try:
                                    subject = Subject.objects.get(
                                        id=subject_id, is_active=True
                                    )
                                    SchoolStreamSubjectAssignment.objects.get_or_create(
                                        tenant=tenant,
                                        stream_config=config,
                                        subject=subject,
                                        defaults={
                                            "is_compulsory": request.data.get(
                                                "is_compulsory", False
                                            ),
                                            "credit_weight": request.data.get(
                                                "credit_weight", 1
                                            ),
                                            "can_be_elective_elsewhere": True,
                                            "is_active": True,
                                        },
                                    )
                                except Subject.DoesNotExist:
                                    continue

            combinations = _format_combinations(stream_id)
            return Response(
                {
                    "message": "Subject combinations updated successfully",
                    "stream_id": stream_id,
                    "total_combinations": len(combinations),
                    "combinations": combinations,
                }
            )

        except Exception as e:
            logger.error(f"Error updating subject combinations: {e}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ==============================================================================
# HEALTH CHECK ENDPOINT
# ==============================================================================
@api_view(["GET"])
def health_check(request):
    """Health check endpoint for monitoring API status"""
    return Response(
        {
            "status": "healthy",
            "timestamp": timezone.now().isoformat(),
            "version": "v2.0-fk-subjects",
            "service": "subjects-api",
        }
    )


# ==============================================================================
# EXPORTED VIEWSETS
# ==============================================================================
# Export the viewsets so they can be imported in urls.py

__all__ = [
    "SubjectCategoryViewSet",
    "SubjectTypeViewSet",
    "SubjectViewSet",
    "SchoolStreamConfigurationViewSet",
    "SchoolStreamSubjectAssignmentViewSet",
    "SubjectAnalyticsViewSet",
    "SubjectManagementViewSet",
    "SubjectByEducationLevelView",
    "clear_subject_caches",
    "subject_combinations",
    "health_check",
]

# ==============================================================================
# VIEWSET CONFIGURATION
# ==============================================================================
"""
This file serves as the main entry point for all subject-related viewsets.

The viewsets are organized as follows:

1. SubjectViewSet (from subjectviewset.py):
   - Core CRUD operations for subjects
   - Filtering, searching, and pagination
   - Grade-level specific queries
   - Subject availability checks
   - Basic subject management

2. SubjectAnalyticsViewSet (from analyticalviewset.py):
   - Read-only analytics and reporting
   - Subject statistics and metrics
   - Category-based groupings
   - Performance analytics
   - Cached analytical data

3. SubjectManagementViewSet (from subjectmanagementviewset.py):
   - Admin-only operations
   - Bulk operations (update, delete, activate)
   - Advanced subject management
   - Audit logging and monitoring
   - Data export/import functions

URL Configuration:
- /api/v1/subjects/ -> SubjectViewSet
- /api/v1/analytics/subjects/ -> SubjectAnalyticsViewSet  
- /api/v1/management/subjects/ -> SubjectManagementViewSet
"""
