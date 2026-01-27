# views.py
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view
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

from .models import (
    Subject,
    SUBJECT_CATEGORY_CHOICES,
    EDUCATION_LEVELS,
    SchoolStreamConfiguration,
    SchoolStreamSubjectAssignment,
)

# from classroom.models import GradeLevel  # Commented out to avoid circular import
from .serializers import (
    SubjectSerializer,
    SubjectListSerializer,
    SubjectCreateUpdateSerializer,
    SubjectEducationLevelSerializer,
    SchoolStreamConfigurationSerializer,
    SchoolStreamSubjectAssignmentSerializer,
)

# Import the separated viewsets
from .subjectviewset import SubjectViewSet
from .analyticalviewset import SubjectAnalyticsViewSet
from .subjectmanagementviewset import SubjectManagementViewSet
from .utils import clear_subject_caches


logger = logging.getLogger(__name__)


# ==============================================================================
# HEALTH CHECK ENDPOINT
# ==============================================================================
@api_view(["GET"])
def health_check(request):
    """
    Simple health check endpoint for monitoring API status
    """
    return Response(
        {
            "status": "healthy",
            "timestamp": timezone.now().isoformat(),
            "version": "v1.0",
            "service": "subjects-api",
        }
    )


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
# UTILITY FUNCTIONS
# ==============================================================================
# def clear_subject_caches():
#     """Helper function to clear all subject-related caches"""
#     cache_keys = [
#         "subjects_statistics",
#         "subjects_statistics_v2",
#         "subjects_by_category",
#         "subjects_by_category_v2",
#         "active_subjects_count",
#     ]
#     cache.delete_many(cache_keys)


# ==============================================================================
# STREAM CONFIGURATION VIEWSETS
# ==============================================================================
from tenants.mixins import TenantFilterMixin


class SchoolStreamConfigurationViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """ViewSet for managing school stream configurations"""

    queryset = SchoolStreamConfiguration.objects.all()
    serializer_class = SchoolStreamConfigurationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # TenantFilterMixin will automatically filter by tenant
        queryset = super().get_queryset()

        queryset = (
            queryset.select_related("stream")
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

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Get summary of stream configurations for the current tenant"""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response(
                {"error": "Tenant context required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get all stream configurations for this tenant
        configs = (
            SchoolStreamConfiguration.objects.filter(
                tenant=tenant, is_active=True
            )
            .select_related("stream")
            .prefetch_related("subject_assignments__subject")
        )

        summary_data = []

        for config in configs:
            stream_data = {
                "stream_id": config.stream.id,
                "stream_name": config.stream.name,
                "stream_type": config.stream.stream_type,
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

    @action(detail=False, methods=["post"])
    def setup_defaults(self, request):
        """Setup default stream configurations for the current tenant"""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response(
                {"error": "Tenant context required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        stream_type = request.data.get("stream_type")

        try:
            from django.core.management import call_command
            from io import StringIO

            # Capture command output
            out = StringIO()

            # Call the management command with tenant_id
            call_command("setup_default_stream_config", tenant_id=tenant.id, stdout=out)

            return Response(
                {
                    "message": "Default configurations set up successfully",
                    "output": out.getvalue(),
                }
            )

        except Exception as e:
            return Response(
                {"error": f"Failed to setup defaults: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class SchoolStreamSubjectAssignmentViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """ViewSet for managing stream subject assignments"""

    queryset = SchoolStreamSubjectAssignment.objects.all()
    serializer_class = SchoolStreamSubjectAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # TenantFilterMixin will automatically filter by tenant
        queryset = super().get_queryset()

        queryset = queryset.select_related(
            "stream_config__stream", "subject"
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


# ==============================================================================
# EXPORTED VIEWSETS
# ==============================================================================
# Export the viewsets so they can be imported in urls.py
__all__ = [
    "SubjectViewSet",
    "SubjectAnalyticsViewSet",
    "SubjectManagementViewSet",
    "SubjectByEducationLevelView",
    "health_check",
    "clear_subject_caches",
    "SchoolStreamConfigurationViewSet",
    "SchoolStreamSubjectAssignmentViewSet",
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
