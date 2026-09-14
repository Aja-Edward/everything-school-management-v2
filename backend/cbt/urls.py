from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .invigilation_views import InvigilationViewSet
from .student_views import AttemptViewSet, MyExamsViewSet
from .views import CBTPaperViewSet

router = DefaultRouter()
router.register(r"papers", CBTPaperViewSet, basename="cbt-paper")
router.register(r"my/exams", MyExamsViewSet, basename="cbt-my-exam")
router.register(r"attempts", AttemptViewSet, basename="cbt-attempt")
router.register(r"invigilate", InvigilationViewSet, basename="cbt-invigilate")

urlpatterns = [
    path("", include(router.urls)),
]
