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
print("STUDENTS URLS LOADED FROM:", __file__)
# URL patterns - ORDER MATTERS!
urlpatterns = [
    # Give bulk-upload its own prefix so router regex can never intercept it
    path(
        "bulk-upload/",
        include(
            [
                path(
                    "template/",
                    download_upload_template,
                    name="student-bulk-upload-template",
                ),
                path(
                    "<int:upload_id>/status/",
                    bulk_upload_status,
                    name="student-bulk-upload-status",
                ),
                path(
                    "<int:upload_id>/export-credentials/",
                    export_credentials,
                    name="student-export-credentials",
                ),
                path(
                    "<int:upload_id>/errors/",
                    download_error_report,
                    name="student-bulk-upload-errors",
                ),
                path("", bulk_upload_students, name="student-bulk-upload"),
            ]
        ),
    ),
    # Standalone endpoints
    path("my-schedule/", student_schedule_view, name="student-schedule"),
    # Token endpoints
    path("admin/generate-result-tokens/", views.generate_result_tokens),
    path("admin/get-all-result-tokens/", views.get_all_result_tokens),
    path("admin/delete-expired-tokens/", views.delete_expired_tokens),
    path("admin/delete-all-tokens-for-term/", views.delete_all_tokens_for_term),
    path("result-token/", views.get_student_result_token),
    path("verify-result-token/", views.verify_result_token),
    # ── Router last ─────────────────────────
    path("", include(router.urls)),
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
