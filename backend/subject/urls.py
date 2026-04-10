# subjects/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.urlpatterns import format_suffix_patterns

from .views import (
    SubjectViewSet,
    SubjectCategoryViewSet,  # NEW
    SubjectTypeViewSet,  # NEW
    SubjectAnalyticsViewSet,
    SubjectManagementViewSet,
    SubjectByEducationLevelView,
    SchoolStreamConfigurationViewSet,
    SchoolStreamSubjectAssignmentViewSet,
    SubjectCombinationViewSet,  # NEW
    health_check,
    subject_combinations,
)

# ==============================================================================
# ROUTER CONFIGURATION
# ==============================================================================

# Main router for core subject operations
router = DefaultRouter()
router.register(r"", SubjectViewSet, basename="subject")

# NEW: Category router for subject categories
category_router = DefaultRouter()
category_router.register(r"", SubjectCategoryViewSet, basename="subject-category")

# NEW: Type router for subject types
type_router = DefaultRouter()
type_router.register(r"", SubjectTypeViewSet, basename="subject-type")

# Analytics router for read-only analytics endpoints
analytics_router = DefaultRouter()
analytics_router.register(r"", SubjectAnalyticsViewSet, basename="subject-analytics")

# Management router for admin-only operations
management_router = DefaultRouter()
management_router.register(r"", SubjectManagementViewSet, basename="subject-management")

# Stream configuration router
stream_config_router = DefaultRouter()
stream_config_router.register(
    r"", SchoolStreamConfigurationViewSet, basename="stream-configuration"
)

# Stream subject assignment router
stream_assignment_router = DefaultRouter()
stream_assignment_router.register(
    r"", SchoolStreamSubjectAssignmentViewSet, basename="stream-subject-assignment"
)

# Subject combination router
subject_combination_router = DefaultRouter()
subject_combination_router.register(
    r"", SubjectCombinationViewSet, basename="subject-combination"
)

# ==============================================================================
# URL PATTERNS
# ==============================================================================

app_name = "subjects"

urlpatterns = [
    # Health check endpoint
    path("health/", health_check, name="health-check"),
    # NEW: Category endpoints - /api/subjects/categories/
    path("categories/", include(category_router.urls)),
    # NEW: Type endpoints - /api/subjects/types/
    path("types/", include(type_router.urls)),
    # Stream configuration endpoints - /api/subjects/stream-configurations/ (MUST COME BEFORE main router)
    path(
        "stream-configurations/setup_defaults/",
        SchoolStreamConfigurationViewSet.as_view({"post": "setup_defaults"}),
    ),
    path(
        "stream-configurations/",
        SchoolStreamConfigurationViewSet.as_view({"get": "list", "post": "create"}),
    ),
    path(
        "stream-configurations/<int:pk>/bulk_assign_subjects/",
        SchoolStreamConfigurationViewSet.as_view({"post": "bulk_assign_subjects"}),
    ),
    path(
        "stream-configurations/<int:pk>/remove_subject/",
        SchoolStreamConfigurationViewSet.as_view({"post": "remove_subject"}),
    ),
    path(
        "stream-configurations/<int:pk>/",
        SchoolStreamConfigurationViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
    ),
    # Stream subject assignment endpoints - /api/subjects/stream-subject-assignments/
    path(
        "stream-subject-assignments/",
        SchoolStreamSubjectAssignmentViewSet.as_view({"get": "list", "post": "create"}),
    ),
    path(
        "stream-subject-assignments/<int:pk>/",
        SchoolStreamSubjectAssignmentViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
    ),
    # Subject combination endpoints - /api/subjects/subject-combinations/
    path("subject-combinations/", include(subject_combination_router.urls)),
    # Analytics endpoints - /api/subjects/analytics/ (MUST COME BEFORE main router)
    path("analytics/", include(analytics_router.urls)),
    # Management endpoints - /api/subjects/management/ (MUST COME BEFORE main router)
    path("management/", include(management_router.urls)),
    path("subject-combinations/", subject_combinations, name="subject-combinations"),
    # Core subject operations - /api/subjects/ (MUST BE LAST)
    path("", include(router.urls)),
]

# ==============================================================================
# URL PATTERN DOCUMENTATION
# ==============================================================================
"""
URL Structure Overview:

1. NEW FK ENDPOINTS
   - GET    /api/subjects/categories/                         # List all categories
   - POST   /api/subjects/categories/                         # Create category
   - GET    /api/subjects/categories/{id}/                    # Get category
   - PUT    /api/subjects/categories/{id}/                    # Update category
   - PATCH  /api/subjects/categories/{id}/                    # Partial update
   - DELETE /api/subjects/categories/{id}/                    # Delete category
   - GET    /api/subjects/categories/{id}/subjects/           # Subjects in category
   - GET    /api/subjects/categories/statistics/              # Category statistics

   - GET    /api/subjects/types/                              # List all types
   - POST   /api/subjects/types/                              # Create type
   - GET    /api/subjects/types/{id}/                         # Get type
   - PUT    /api/subjects/types/{id}/                         # Update type
   - PATCH  /api/subjects/types/{id}/                         # Partial update
   - DELETE /api/subjects/types/{id}/                         # Delete type
   - GET    /api/subjects/types/{id}/subjects/                # Subjects of type
   - GET    /api/subjects/types/statistics/                   # Type statistics

2. CORE SUBJECT OPERATIONS (/api/subjects/)
   - GET    /api/subjects/                                    # List all subjects
   - POST   /api/subjects/                                    # Create new subject
   - GET    /api/subjects/{id}/                               # Retrieve specific subject
   - PUT    /api/subjects/{id}/                               # Update specific subject
   - PATCH  /api/subjects/{id}/                               # Partial update subject
   - DELETE /api/subjects/{id}/                               # Delete specific subject

3. ANALYTICS OPERATIONS (/api/subjects/analytics/)
   - GET    /api/subjects/analytics/                          # Basic analytics list
   - GET    /api/subjects/analytics/statistics/               # Overall statistics
   - GET    /api/subjects/analytics/by_category/              # Category breakdown
   - GET    /api/subjects/analytics/performance/              # Performance metrics

4. MANAGEMENT OPERATIONS (/api/subjects/management/) - Admin Only
   - POST   /api/subjects/management/bulk_create/             # Bulk create subjects
   - PATCH  /api/subjects/management/bulk_update/             # Bulk update subjects
   - DELETE /api/subjects/management/bulk_delete/             # Bulk delete subjects
   - POST   /api/subjects/management/bulk_activate/           # Bulk activate/deactivate
   - GET    /api/subjects/management/export/                  # Export subject data
   - POST   /api/subjects/management/import/                  # Import subject data

5. STREAM CONFIGURATION
   - GET    /api/subjects/stream-configurations/              # List configurations
   - POST   /api/subjects/stream-configurations/              # Create configuration
   - GET    /api/subjects/stream-subject-assignments/         # List assignments

6. UTILITY ENDPOINTS
   - GET    /api/subjects/health/                             # Health check

Query Parameters:
   - ?search=term                    # Text search
   - ?category_new_id=1              # Filter by category (FK)
   - ?subject_type_new_id=1          # Filter by type (FK)
   - ?grade_level_id=1               # Filter by grade level (FK)
   - ?education_level=PRIMARY        # Filter by education level
   - ?is_active=true                 # Filter by active status
   - ?ordering=name                  # Sort results
   - ?page=1&page_size=20            # Pagination

Examples:
   GET /api/subjects/categories/
   GET /api/subjects/types/
   GET /api/subjects/?category_new_id=1&is_active=true
   GET /api/subjects/categories/1/subjects/
   GET /api/subjects/types/statistics/
"""
