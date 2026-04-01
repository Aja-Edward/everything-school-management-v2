from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ParentViewSet
from .views_performance import StudentDetailView
from parent.bulk_view import (
    bulk_upload_parents,
    bulk_upload_status,
    download_upload_template,
    export_credentials,
    download_error_report,
)

# Create router and register the ParentViewSet
router = DefaultRouter()
router.register(r'', ParentViewSet, basename='parent')

# URL patterns
urlpatterns = [
    path(
        "bulk-upload/",
        include(
            [
                path(
                    "template/",
                    download_upload_template,
                    name="parentt-bulk-upload-template",
                ),
                path(
                    "<int:upload_id>/status/",
                    bulk_upload_status,
                    name="parent-bulk-upload-status",
                ),
                path(
                    "<int:upload_id>/export-credentials/",
                    export_credentials,
                    name="parent-export-credentials",
                ),
                path(
                    "<int:upload_id>/errors/",
                    download_error_report,
                    name="parent-bulk-upload-errors",
                ),
                path("", bulk_upload_parents, name="parent-bulk-upload"),
            ]
        ),
    ),
    # Custom view for student detail (not part of ParentViewSet)
    path(
        "students/<int:student_id>/", StudentDetailView.as_view(), name="student-detail"
    ),
    # Include router URLs - this will automatically create:
    # - GET    /parents/                     -> list
    # - POST   /parents/                     -> create
    # - GET    /parents/{id}/                -> retrieve
    # - PUT    /parents/{id}/                -> update
    # - PATCH  /parents/{id}/                -> partial_update
    # - DELETE /parents/{id}/                -> destroy
    # - GET    /parents/dashboard/           -> dashboard (from @action)
    # - GET    /parents/search/              -> search (from @action)
    # - POST   /parents/{id}/activate/       -> activate (from @action)
    # - POST   /parents/{id}/deactivate/     -> deactivate (from @action)
    # - POST   /parents/{id}/add-student/    -> add_student (from @action)
    # - POST   /parents/{id}/add-existing-student/ -> add_existing_student (from @action)
    path("", include(router.urls)),
]
