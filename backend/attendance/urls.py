# attendance/urls.py
from rest_framework.routers import DefaultRouter
from .views import AttendanceViewSet, StudentTagViewSet

router = DefaultRouter()
router.register(r"attendance", AttendanceViewSet, basename="attendance")
router.register(r"tags", StudentTagViewSet, basename="studenttag")

urlpatterns = router.urls
