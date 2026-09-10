# attendance/urls.py
from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    AttendanceSettingsDetail,
    AttendanceViewSet,
    GateScanViewSet,
    ScanNotificationViewSet,
    StudentTagViewSet,
)

router = DefaultRouter()
router.register(r"attendance", AttendanceViewSet, basename="attendance")
router.register(r"tags", StudentTagViewSet, basename="studenttag")
router.register(r"scans", GateScanViewSet, basename="gatescan")
router.register(r"notifications", ScanNotificationViewSet,
                basename="scannotification")

urlpatterns = [
    # A path rather than a router registration: AttendanceSettings is keyed on
    # the tenant, one row per school, so there is nothing to list and no id to
    # address. It sits alongside tags/ and scans/ rather than under
    # attendance/, because it configures the app rather than belonging to the
    # attendance records.
    path("settings/", AttendanceSettingsDetail.as_view(),
         name="attendance-settings"),
    *router.urls,
]
