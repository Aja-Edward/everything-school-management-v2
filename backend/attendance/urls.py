# attendance/urls.py
from rest_framework.routers import DefaultRouter
from .views import AttendanceViewSet, GateScanViewSet, StudentTagViewSet

router = DefaultRouter()
router.register(r"attendance", AttendanceViewSet, basename="attendance")
router.register(r"tags", StudentTagViewSet, basename="studenttag")
router.register(r"scans", GateScanViewSet, basename="gatescan")

urlpatterns = router.urls
