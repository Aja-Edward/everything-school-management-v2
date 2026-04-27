from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import force_migrate
from .views import force_migrate, update_user_role

app_name = "schoolSettings"

# Create router for ViewSets
router = DefaultRouter()
router.register(
    r"announcements", views.SchoolAnnouncementViewSet, basename="announcement"
)
router.register(r"permissions", views.PermissionViewSet, basename="permission")
router.register(r"roles", views.RoleViewSet, basename="role")
router.register(r"user-roles", views.UserRoleViewSet, basename="user-role")
router.register(r"landing/sections", views.LandingSectionViewSet, basename="landing-section")
router.register(r"landing/nav-links", views.NavigationLinkViewSet, basename="landing-nav-link")

urlpatterns = [
    # File upload endpoints - CRITICAL: These MUST come FIRST before all other patterns
    path(
        "school-settings/upload-logo/",
        views.upload_logo,  # ✅ Use the function-based view
        name="upload-logo",
    ),
    path(
        "school-settings/upload-favicon/",
        views.upload_favicon,  # ✅ Use the function-based view
        name="upload-favicon",
    ),
    path("update-user-role/", update_user_role, name="update-user-role"),
    # Main settings endpoints
    path(
        "school-settings/",
        views.SchoolSettingsDetail.as_view(),
        name="settings-detail",
    ),
    # Payment gateway testing
    path(
        "payment-gateways/<str:gateway>/test/",
        views.test_payment_gateway,
        name="test-payment-gateway",
    ),
    # Communication settings
    path(
        "communication-settings/",
        views.CommunicationSettingsDetail.as_view(),
        name="communication-settings",
    ),
    # Notification testing
    path("notifications/email/test/", views.test_email_connection, name="test-email"),
    path("notifications/sms/test/", views.test_sms_connection, name="test-sms"),
    # Brevo and Twilio testing
    path("notifications/brevo/test/", views.test_brevo_connection, name="test-brevo"),
    path(
        "notifications/twilio/test/", views.test_twilio_connection, name="test-twilio"
    ),
    path(
        "notifications/brevo/send-test/", views.send_test_email, name="send-test-email"
    ),
    path("notifications/twilio/send-test/", views.send_test_sms, name="send-test-sms"),
    # Include router URLs
    path("", include(router.urls)),
    path("force-migrate/", force_migrate, name="force_migrate"),

    # Landing page endpoints
    path("landing/", views.LandingPageView.as_view(), name="landing-page"),
    path("landing/admin/", views.LandingPageAdminView.as_view(), name="landing-page-admin"),
    path("landing/upload-hero/", views.LandingPageUploadHeroImage.as_view(), name="landing-upload-hero"),
]
