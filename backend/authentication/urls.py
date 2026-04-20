# authentication/urls.py
from django.urls import path, include
from django.conf import settings
from rest_framework_simplejwt.views import TokenVerifyView
from .views import (
    SimpleLoginView,
    RegisterView,
    VerifyAccountView,
    ResendVerificationView,
    CheckVerificationStatusView,
    create_admin,
    list_admins,
    user_profile,
    logout_view,
    password_reset_request,
    password_reset_confirm,
    check_email_view,
    supabase_login,
    GoogleLogin,
    activate_user,
    admin_reset_password,
    refresh_token_view,
    csrf_token_view,
    auth_status_view,
)

app_name = "authentication"
urlpatterns = [
    # Core auth
    path("login/", SimpleLoginView.as_view(), name="login"),
    path("logout/", logout_view, name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("verify-account/", VerifyAccountView.as_view(), name="verify_account"),
    path(
        "resend-verification/",
        ResendVerificationView.as_view(),
        name="resend_verification",
    ),
    # Cookie management
    path("refresh/", refresh_token_view, name="cookie_refresh"),
    path("csrf/", csrf_token_view, name="csrf_token"),
    path("status/", auth_status_view, name="auth_status"),
    # Token verify (for server-to-server checks)
    path("token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    # User management
    path("profile/", user_profile, name="user_profile"),
    path("check-email/", check_email_view, name="check_email"),
    path(
        "check-verification-status/",
        CheckVerificationStatusView.as_view(),
        name="check_verification_status",
    ),
    # Password reset
    path("password-reset/", password_reset_request, name="password_reset"),
    path(
        "password-reset-confirm/<uidb64>/<token>/",
        password_reset_confirm,
        name="password_reset_confirm",
    ),
    path("admin-reset-password/", admin_reset_password, name="admin_reset_password"),
    # Admin management
    path("admins/", create_admin, name="create-admin"),
    path("admins/list/", list_admins, name="list-admins"),
    path("users/<int:user_id>/activate/", activate_user, name="activate_user"),
    # Social
    path("google/login/", GoogleLogin.as_view(), name="google_login"),
    path(
        "supabase-login/", supabase_login, name="supabase_login"
    ),  # Using dedicated view for Supabase JWT login
    # Debug endpoints — never exposed in production
]
# Debug endpoints — never exposed in production
if settings.DEBUG:
    from .views import debug_auth, debug_token, DebugLoginView

    urlpatterns += [
        path("debug/auth/", debug_auth, name="debug_auth"),
        path("debug/token/", debug_token, name="debug_token"),
        path("debug-login/", DebugLoginView.as_view(), name="debug_login"),
    ]
