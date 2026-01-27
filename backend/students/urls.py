# from django.urls import path, include
# from rest_framework.routers import DefaultRouter
# from .views import StudentViewSet, student_schedule_view

# # Create router and register viewsets
# router = DefaultRouter()
# router.register(r"students", StudentViewSet, basename="student")

# # URL patterns
# urlpatterns = [
#     # Function-based view for current user's schedule (standalone)
#     path("my-schedule/", student_schedule_view, name="student-schedule"),
#     # Include router URLs for main CRUD operations and custom actions
#     path("", include(router.urls)),
# ]

# # The router automatically generates these URLs:
# """
# Generated URLs from router.register(r"students", StudentViewSet):

# CRUD Operations:
# - GET    /students/                     -> list (StudentViewSet.list)
# - POST   /students/                     -> create (StudentViewSet.create)
# - GET    /students/{id}/                -> retrieve (StudentViewSet.retrieve)
# - PUT    /students/{id}/                -> update (StudentViewSet.update)
# - PATCH  /students/{id}/                -> partial_update (StudentViewSet.partial_update)
# - DELETE /students/{id}/                -> destroy (StudentViewSet.destroy)

# Custom Actions (from @action decorators):
# - GET    /students/current_schedule/           -> current_schedule (for logged-in student)
# - GET    /students/{id}/schedule/              -> schedule (specific student's complete schedule)
# - GET    /students/{id}/weekly_schedule/       -> weekly_schedule (weekly view)
# - GET    /students/{id}/daily_schedule/        -> daily_schedule (daily view, supports ?date=YYYY-MM-DD)
# - GET    /students/{id}/studentschedule/       -> studentschedule (legacy endpoint)
# - GET    /students/nursery_students/           -> nursery_students
# - GET    /students/primary_students/           -> primary_students
# - GET    /students/secondary_students/         -> secondary_students
# - GET    /students/student_statistics/         -> student_statistics
# - GET    /students/statistics_by_level/        -> statistics_by_level
# - GET    /students/students_with_medical_conditions/  -> students_with_medical_conditions
# - GET    /students/students_with_special_requirements/ -> students_with_special_requirements
# - GET    /students/{id}/emergency_contacts/    -> emergency_contacts
# - GET    /students/export_csv/                 -> export_csv
# - GET    /students/export_nursery_csv/         -> export_nursery_csv
# - POST   /students/{id}/activate/              -> activate
# - POST   /students/{id}/deactivate/            -> deactivate
# - POST   /students/{id}/toggle_status/         -> toggle_status
# - GET    /students/dashboard/                  -> dashboard (for logged-in student)
# - GET    /students/profile/                    -> profile (for logged-in student)
# """

# # Usage Examples:
# """
# Schedule-related endpoints:

# 1. For current logged-in student:
#    GET /api/my-schedule/                    -> Function-based view (student_schedule_view)
#    GET /api/students/current_schedule/      -> ViewSet action (current_schedule)
#    GET /api/students/dashboard/             -> Dashboard with schedule summary
#    GET /api/students/profile/               -> Profile information

# 2. For specific student (by ID):
#    GET /api/students/123/schedule/          -> Complete schedule
#    GET /api/students/123/weekly_schedule/   -> Weekly grouped view
#    GET /api/students/123/daily_schedule/    -> Today's schedule
#    GET /api/students/123/daily_schedule/?date=2024-03-15  -> Specific date

# 3. Student management:
#    GET /api/students/                       -> List all students
#    POST /api/students/                      -> Create new student
#    GET /api/students/123/                   -> Get specific student details
#    PATCH /api/students/123/                 -> Update student
#    DELETE /api/students/123/                -> Delete student

# 4. Statistics and filtering:
#    GET /api/students/nursery_students/      -> All nursery students
#    GET /api/students/student_statistics/    -> Overall statistics
#    GET /api/students/?education_level=NURSERY  -> Filter by education level
#    GET /api/students/?search=John           -> Search students
# """

# # Alternative approach if you want to customize the URL structure further:
# """
# # Custom URL patterns (uncomment to use instead of router)
# urlpatterns = [
#     # Schedule endpoints
#     path("my-schedule/", student_schedule_view, name="student-schedule"),
#     path("students/current-schedule/", StudentViewSet.as_view({"get": "current_schedule"}), name="student-current-schedule"),

#     # Student CRUD
#     path("students/", StudentViewSet.as_view({"get": "list", "post": "create"}), name="student-list"),
#     path("students/<int:pk>/", StudentViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}), name="student-detail"),

#     # Schedule actions for specific students
#     path("students/<int:pk>/schedule/", StudentViewSet.as_view({"get": "schedule"}), name="student-schedule-detail"),
#     path("students/<int:pk>/weekly-schedule/", StudentViewSet.as_view({"get": "weekly_schedule"}), name="student-weekly-schedule"),
#     path("students/<int:pk>/daily-schedule/", StudentViewSet.as_view({"get": "daily_schedule"}), name="student-daily-schedule"),

#     # Statistics endpoints
#     path("students/statistics/", StudentViewSet.as_view({"get": "student_statistics"}), name="student-statistics"),
#     path("students/nursery/", StudentViewSet.as_view({"get": "nursery_students"}), name="nursery-students"),
#     path("students/primary/", StudentViewSet.as_view({"get": "primary_students"}), name="primary-students"),
#     path("students/secondary/", StudentViewSet.as_view({"get": "secondary_students"}), name="secondary-students"),

#     # Student management actions
#     path("students/<int:pk>/activate/", StudentViewSet.as_view({"post": "activate"}), name="student-activate"),
#     path("students/<int:pk>/deactivate/", StudentViewSet.as_view({"post": "deactivate"}), name="student-deactivate"),
#     path("students/<int:pk>/toggle-status/", StudentViewSet.as_view({"post": "toggle_status"}), name="student-toggle-status"),

#     # Export endpoints
#     path("students/export/csv/", StudentViewSet.as_view({"get": "export_csv"}), name="students-export-csv"),
#     path("students/export/nursery-csv/", StudentViewSet.as_view({"get": "export_nursery_csv"}), name="nursery-export-csv"),
# ]
# """

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import StudentViewSet, student_schedule_view

# Create router and register viewsets
router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="student")

# URL patterns - ORDER MATTERS!
urlpatterns = [
    # Specific paths MUST come before router patterns
    # Function-based view for current user's schedule (standalone)
    path("my-schedule/", student_schedule_view, name="student-schedule"),
    # Token-related endpoints (admin and student)
    path(
        "admin/generate-result-tokens/",
        views.generate_result_tokens,
        name="generate-result-tokens",
    ),
    path(
        "admin/get-all-result-tokens/",
        views.get_all_result_tokens,
        name="get-all-result-tokens",
    ),
    path(
        "admin/delete-expired-tokens/",
        views.delete_expired_tokens,
        name="delete-expired-tokens",
    ),
    path(
        "admin/delete-all-tokens-for-term/",
        views.delete_all_tokens_for_term,
        name="delete-all-tokens-for-term",
    ),
    path(
        "result-token/",
        views.get_student_result_token,
        name="get_result_token",
    ),
    path(
        "verify-result-token/",
        views.verify_result_token,
        name="verify_result_token",
    ),
    # Include router URLs - this includes the {pk} patterns AND @action endpoints
    # Router will automatically create:
    # - /students/my-schedule/ (from @action)
    # - /students/my-weekly-schedule/ (from @action)
    # - /students/my-current-period/ (from @action)
    # - /students/dashboard/ (from @action)
    # - /students/profile/ (from @action)
    # - /students/current_schedule/ (from @action if exists)
    path("", include(router.urls)),
]

# Alternative Solution: If you prefer to keep it simple, just reorder:
"""
urlpatterns = [
    # Specific non-numeric paths first
    path("my-schedule/", student_schedule_view, name="student-schedule"),
    
    # Router patterns last (includes /students/{pk}/ which would catch anything)
    path("", include(router.urls)),
]
"""
