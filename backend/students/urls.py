from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import StudentViewSet, student_schedule_view
from students.bulk_views import (
    bulk_upload_students,
    bulk_upload_status,
    download_upload_template,
    export_credentials,
    download_error_report,
)

# Create router and register viewsets
router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="student")

# URL patterns - ORDER MATTERS!
urlpatterns = [
    # Specific paths MUST come before router patterns
    # Function-based view for current user's schedule (standalone)
    path("my-schedule/", student_schedule_view, name="student-schedule"),
    # Token-related endpoints (admin and student)
    path(
        "admin/generate-result-tokens/",
        views.generate_result_tokens,
        name="generate-result-tokens",
    ),
    path(
        "admin/get-all-result-tokens/",
        views.get_all_result_tokens,
        name="get-all-result-tokens",
    ),
    path(
        "admin/delete-expired-tokens/",
        views.delete_expired_tokens,
        name="delete-expired-tokens",
    ),
    path(
        "admin/delete-all-tokens-for-term/",
        views.delete_all_tokens_for_term,
        name="delete-all-tokens-for-term",
    ),
    path(
        "result-token/",
        views.get_student_result_token,
        name="get_result_token",
    ),
    path(
        "verify-result-token/",
        views.verify_result_token,
        name="verify_result_token",
    ),
    # Include router URLs - this includes the {pk} patterns AND @action endpoints
    # Router will automatically create:
    # - /students/my-schedule/ (from @action)
    # - /students/my-weekly-schedule/ (from @action)
    # - /students/my-current-period/ (from @action)
    # - /students/dashboard/ (from @action)
    # - /students/profile/ (from @action)
    # - /students/current_schedule/ (from @action if exists)
    path("", include(router.urls)),
    # Upload
    path("bulk-upload/", bulk_upload_students, name="student-bulk-upload"),
    # Status polling
    path(
        "bulk-upload/<int:upload_id>/status/",
        bulk_upload_status,
        name="student-bulk-upload-status",
    ),
    # Template download  (?format=csv or ?format=excel)
    path(
        "bulk-upload/template/",
        download_upload_template,
        name="student-bulk-upload-template",
    ),
    # Credential export  (POST body: { format: 'csv'|'excel'|'pdf' })
    path(
        "bulk-upload/<int:upload_id>/export-credentials/",
        export_credentials,
        name="student-export-credentials",
    ),
    # Error report download
    path(
        "bulk-upload/<int:upload_id>/errors/",
        download_error_report,
        name="student-bulk-upload-errors",
    ),
]

# Alternative Solution: If you prefer to keep it simple, just reorder:
"""
urlpatterns = [
    # Specific non-numeric paths first
    path("my-schedule/", student_schedule_view, name="student-schedule"),
    
    # Router patterns last (includes /students/{pk}/ which would catch anything)
    path("", include(router.urls)),
]
"""
