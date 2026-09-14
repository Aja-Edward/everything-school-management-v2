from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CBTPaperViewSet

router = DefaultRouter()
router.register(r"papers", CBTPaperViewSet, basename="cbt-paper")

urlpatterns = [
    path("", include(router.urls)),
]
