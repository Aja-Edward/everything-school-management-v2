# config/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from .sitemaps import sitemap_view, robots_txt_view

from .views import api_root, debug_login_function
from authentication.views import GoogleLogin
from .health import health_check
from .views import force_migrate
from .views import force_migrate, check_database_schema
from authentication.views import create_first_superuser

urlpatterns = [
    # ===== API ROOT =====
    path("health/", health_check, name="health"),
    path("sitemap.xml", sitemap_view, name="sitemap"),
    path("robots.txt", robots_txt_view, name="robots_txt"),
    path("admin/", admin.site.urls),
    # ===== AUTHENTICATION ROUTES =====
    # Django Rest Auth routes (MAIN AUTHENTICATION)
    path("api/dj-rest-auth/", include("dj_rest_auth.urls")),
    path("api/dj-rest-auth/registration/", include("dj_rest_auth.registration.urls")),
    # Social login routes
    path("api/dj-rest-auth/google/", GoogleLogin.as_view(), name="google_login"),
    # Custom authentication routes
    path("api/auth/", include("authentication.urls")),
    # Social account routes (optional, mainly for admin)
    path("api/socialaccounts/", include("allauth.socialaccount.urls")),
    # Social provider routes (if needed for direct provider integration)
    path("api/auth/google/", include("allauth.socialaccount.providers.google.urls")),
    path(
        "api/auth/facebook/", include("allauth.socialaccount.providers.facebook.urls")
    ),
    # ===== CORE ACADEMIC MANAGEMENT =====
    path("api/dashboard/", include("dashboard.urls")),
    path("api/classrooms/", include("classroom.urls")),
    path("api/subjects/", include("subject.urls")),
    path("api/lessons/", include("lesson.urls")),
    path("api/timetable/", include("timetable.urls")),
    path("api/student_promotions/", include("student_promotions.urls")),
    # ===== PEOPLE MANAGEMENT =====
    path("api/profiles/", include("userprofile.urls")),
    path("api/teachers/", include("teacher.urls")),
    path("api/students/", include("students.urls")),
    path("api/parents/", include("parent.urls")),
    # ===== ACADEMIC OPERATIONS =====
    path("api/academics/", include("academics.urls")),
    # Backward compatibility aliases for /api/sessions/ and /api/terms/
    path("api/attendance/", include("attendance.urls")),
    path("api/exams/", include("exam.urls")),
    path(
        "api/results/", include("result.urls")
    ),  # Updated with new hierarchical structure
    # ===== FINANCIAL MANAGEMENT =====
    path("api/fee/", include("fee.urls")),
    # ===== COMMUNICATION =====
    path("api/messaging/", include("messaging.urls")),
    path("api/invitations/", include("invitations.urls")),
    # ===== SCHOOL ADMINISTRATION =====
    path("api/school-settings/", include("schoolSettings.urls")),
    path("api/events/", include("events.urls")),
    # ===== MULTI-TENANCY =====
    path("api/tenants/", include("tenants.urls")),
    # ===== UTILITIES =====
    path("api/utils/", include("utils.urls")),
    path("admin/force-migrate/", force_migrate),
    path("api/force-migrate/", force_migrate),
    path("api/check-schema/", check_database_schema),
    path("api/auth/setup-admin/", create_first_superuser, name="setup_admin"),
]

# ===== STATIC/MEDIA FILES (Development) =====
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# ===== DEBUG TOOLBAR (Development) =====
if settings.DEBUG and "debug_toolbar" in settings.INSTALLED_APPS:
    import debug_toolbar

    urlpatterns = [
        path("__debug__/", include(debug_toolbar.urls)),
    ] + urlpatterns
