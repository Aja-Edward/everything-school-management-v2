from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TeacherViewSet, 
    AssignmentRequestViewSet, 
    TeacherScheduleViewSet, 
    AssignmentManagementViewSet
)
from teacher.bulk_views import (
    bulk_upload_teachers,
    bulk_upload_status,
    download_upload_template,
    export_credentials,
)

router = DefaultRouter()
router.register(r"teachers", TeacherViewSet, basename="teacher")
router.register(r"assignment-requests", AssignmentRequestViewSet, basename="assignment-request")
router.register(r"teacher-schedules", TeacherScheduleViewSet, basename="teacher-schedule")
router.register(r"assignment-management", AssignmentManagementViewSet, basename="assignment-management")

urlpatterns = [
    # Give bulk-upload its own prefix so router regex can never intercept it
    path(
        "bulk-upload/",
        include(
            [
                path(
                    "template/",
                    download_upload_template,
                    name="teacher-bulk-upload-template",
                ),
                path(
                    "<int:upload_id>/status/",
                    bulk_upload_status,
                    name="teacher-bulk-upload-status",
                ),
                path(
                    "<int:upload_id>/export-credentials/",
                    export_credentials,
                    name="teacher-export-credentials",
                ),
                path("", bulk_upload_teachers, name="teacher-bulk-upload"),
            ]
        ),
    ),
    # ── Router patterns (most specific paths first) ──────────────────────
    path("", include(router.urls)),
]
