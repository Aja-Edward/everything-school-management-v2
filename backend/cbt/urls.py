from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import station_views
from .invigilation_views import InvigilationViewSet
from .student_views import AttemptViewSet, MyExamsViewSet
from .views import CBTPaperViewSet

router = DefaultRouter()
router.register(r"papers", CBTPaperViewSet, basename="cbt-paper")
router.register(r"my/exams", MyExamsViewSet, basename="cbt-my-exam")
router.register(r"attempts", AttemptViewSet, basename="cbt-attempt")
router.register(r"invigilate", InvigilationViewSet, basename="cbt-invigilate")

urlpatterns = [
    # Exam station only; they answer 404 anywhere else.
    path("station/", station_views.StatusView.as_view()),
    path("station/sign-in/", station_views.StudentSignInView.as_view()),
    path("station/sign-out/", station_views.SignOutView.as_view()),
    path("station/staff/key/", station_views.StaffKeyView.as_view()),
    path("station/staff/sign-in/", station_views.StaffSignInView.as_view()),
    path("station/packages/", station_views.PackagesView.as_view()),
    path("station/packages/<uuid:package_id>/results/", station_views.ResultsView.as_view()),
    path("station/packages/<uuid:package_id>/window/", station_views.WindowView.as_view()),
    path("", include(router.urls)),
]
