from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .student_views import AttemptViewSet, MyExamsViewSet
from .views import CBTPaperViewSet

router = DefaultRouter()
router.register(r"papers", CBTPaperViewSet, basename="cbt-paper")
router.register(r"my/exams", MyExamsViewSet, basename="cbt-my-exam")
router.register(r"attempts", AttemptViewSet, basename="cbt-attempt")

urlpatterns = [
    path("", include(router.urls)),
]
