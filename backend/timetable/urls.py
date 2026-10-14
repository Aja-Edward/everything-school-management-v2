# timetable/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TimetableViewSet, test_email_view

router = DefaultRouter()
router.register(r"timetables", TimetableViewSet, basename="timetable")

urlpatterns = [
    path("", include(router.urls)),
]

# Sends a real email through Brevo on every visit, to anyone who opens it;
# a development aid only, as the auth app does with its debug views.
from django.conf import settings

if settings.DEBUG:
    urlpatterns.append(path("test-email/", test_email_view, name="test_email"))
