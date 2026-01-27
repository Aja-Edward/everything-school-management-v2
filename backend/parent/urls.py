from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ParentViewSet
from .views_performance import StudentDetailView

# Create router and register the ParentViewSet
router = DefaultRouter()
router.register(r'', ParentViewSet, basename='parent')

# URL patterns
urlpatterns = [
    # Custom view for student detail (not part of ParentViewSet)
    path(
        "students/<int:student_id>/", StudentDetailView.as_view(), name="student-detail"
    ),
    # Include router URLs - this will automatically create:
    # - GET    /parents/                     -> list
    # - POST   /parents/                     -> create
    # - GET    /parents/{id}/                -> retrieve
    # - PUT    /parents/{id}/                -> update
    # - PATCH  /parents/{id}/                -> partial_update
    # - DELETE /parents/{id}/                -> destroy
    # - GET    /parents/dashboard/           -> dashboard (from @action)
    # - GET    /parents/search/              -> search (from @action)
    # - POST   /parents/{id}/activate/       -> activate (from @action)
    # - POST   /parents/{id}/deactivate/     -> deactivate (from @action)
    # - POST   /parents/{id}/add-student/    -> add_student (from @action)
    # - POST   /parents/{id}/add-existing-student/ -> add_existing_student (from @action)
    path('', include(router.urls)),
]
