# timetable/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TimetableViewSet, test_email_view

router = DefaultRouter()
router.register(r"timetables", TimetableViewSet, basename="timetable")

urlpatterns = [
    path("", include(router.urls)),
    path("test-email/", test_email_view, name="test_email"),
]
