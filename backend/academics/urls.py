# academics/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AcademicSessionViewSet,
    TermViewSet,
    SubjectViewSet,
    SubjectAllocationViewSet,
    CurriculumViewSet,
    AcademicCalendarViewSet,
    EducationLevelViewSet,
    TermTypeViewSet,
)

router = DefaultRouter()
router.register(r"sessions", AcademicSessionViewSet, basename="session")
router.register(r"terms", TermViewSet, basename="term")
router.register(r"term-types", TermTypeViewSet, basename="term-type")
router.register(r"subjects", SubjectViewSet, basename="subject")
router.register(r"education-levels", EducationLevelViewSet, basename="education-level")
router.register(
    r"subject-allocations", SubjectAllocationViewSet, basename="subject-allocation"
)
router.register(r"curricula", CurriculumViewSet, basename="curriculum")
router.register(r"calendar", AcademicCalendarViewSet, basename="calendar")

urlpatterns = [
    path("", include(router.urls)),
]
