# Add these imports at the top of your authentication/views.py file

from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.views import View
from django.utils.decorators import method_decorator
import os
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from dj_rest_auth.registration.views import SocialLoginView
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client

from datetime import timedelta
import random
import string
import logging
import json
from utils import generate_unique_username
import secrets
from django.db import transaction

from .serializers import (
    RegisterSerializer,
    VerifyAccountSerializer,
    ResendVerificationSerializer,
    CustomTokenObtainPairSerializer,
    SimpleLoginSerializer,
)
from .cookie_auth import set_auth_cookies, clear_auth_cookies, refresh_access_token_from_cookie

User = get_user_model()
logger = logging.getLogger(__name__)

# ============== REGISTRATION AND VERIFICATION VIEWS ==============


@method_decorator(csrf_exempt, name="dispatch")
class RegisterView(generics.CreateAPIView):
    """User registration view - creates inactive user and sends verification code"""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # Access generated credentials from the user object
            generated_username = getattr(user, "_generated_username", None)
            generated_password = getattr(user, "_generated_password", None)
            response_data = {
                "message": "Account created successfully. Please check your email/SMS for verification code.",
                "email": user.email,
                "verification_method": request.data.get("verification_method", "email"),
            }
            if generated_username and generated_password:
                response_data["username"] = generated_username
                response_data["password"] = generated_password
            return Response(
                response_data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name="dispatch")
class VerifyAccountView(APIView):
    """Verify user account with verification code and auto-login

    **FIXED**: Now stores tenant in session for TenantMiddleware
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyAccountSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data["user"]
            user_username = serializer.validated_data.get("user_username")
            user_password = serializer.validated_data.get("user_password")
            parent_username = serializer.validated_data.get("parent_username")
            parent_password = serializer.validated_data.get("parent_password")

            # Generate JWT tokens for automatic login
            refresh = RefreshToken.for_user(user)
            access_token = refresh.access_token

            # Add custom claims to the token
            access_token["id"] = user.id
            access_token["email"] = user.email
            access_token["role"] = user.role
            access_token["is_staff"] = user.is_staff

            # **CRITICAL FIX: Store tenant in session**
            if hasattr(user, "tenant") and user.tenant:
                request.session["tenant_id"] = str(user.tenant.id)
                logger.info(
                    f"✅ Stored tenant {user.tenant.id} in session during account verification for user {user.email}"
                )
            else:
                logger.warning(f"⚠️ User {user.email} has no tenant during verification")

            return Response(
                {
                    "message": "Account verified successfully. You are now logged in.",
                    "access": str(access_token),
                    "refresh": str(refresh),
                    "user": {
                        "id": user.id,
                        "email": user.email,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "role": user.role,
                        "is_superuser": user.is_superuser,
                        "is_staff": user.is_staff,
                        "is_active": user.is_active,
                        "username": user_username,
                        "password": user_password,
                        "parent_username": parent_username,
                        "parent_password": parent_password,
                    },
                },
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name="dispatch")
class ResendVerificationView(APIView):
    """Resend verification code to user's email or phone"""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        if serializer.is_valid():
            verification_code = serializer.resend_code(serializer.validated_data)  # type: ignore
            return Response(
                {
                    "message": f"Verification code sent successfully via {serializer.validated_data['verification_method']}",  # type: ignore
                    "email": serializer.validated_data["email"],  # type: ignore
                },
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============== LOGIN VIEWS ==============


class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom JWT token view for verified users

    **FIXED**: Now stores tenant in session for TenantMiddleware
    """

    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)

            # **CRITICAL FIX: Store tenant in session**
            # Get the user from the serializer's validated data
            if "user" in serializer.validated_data:
                user = serializer.validated_data["user"]
                if hasattr(user, "tenant") and user.tenant:
                    request.session["tenant_id"] = str(user.tenant.id)
                    logger.info(
                        f"✅ Stored tenant {user.tenant.id} in session for user {user.email}"
                    )

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class SimpleLoginView(APIView):
    """
    Login view that sets JWT tokens in httpOnly cookies.

    **FIXED**: Now stores tenant in session for TenantMiddleware
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = SimpleLoginSerializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid():
            user = serializer.validated_data["user"]

            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            access_token = refresh.access_token

            # Add custom claims
            access_token["id"] = user.id
            access_token["email"] = user.email
            access_token["role"] = user.role
            access_token["is_staff"] = user.is_staff

            # **CRITICAL FIX: Store tenant in session for middleware**
            if hasattr(user, "tenant") and user.tenant:
                request.session["tenant_id"] = str(user.tenant.id)
                logger.info(
                    f"✅ Stored tenant {user.tenant.id} ({user.tenant.name}) in session for user {user.email}"
                )
            else:
                logger.warning(
                    f"⚠️ User {user.email} has no tenant attribute or tenant is None"
                )

            # Build response data
            response_data = {
                "message": "Login successful",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "role": getattr(user, "role", "user"),
                    "is_superuser": user.is_superuser,
                    "is_staff": user.is_staff,
                    "is_active": user.is_active,
                },
            }

            # In development, also include tokens in body for cross-origin HTTP support
            if getattr(settings, 'AUTH_RETURN_TOKENS_IN_BODY', False):
                response_data["tokens"] = {
                    "access": str(access_token),
                    "refresh": str(refresh),
                }

            response = Response(response_data, status=status.HTTP_200_OK)

            # Set tokens in httpOnly cookies (works in production with HTTPS)
            set_auth_cookies(response, str(access_token), str(refresh))

            logger.info(f"User {user.email} logged in successfully")
            return response

        logger.error(f"Login serializer errors: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([AllowAny])
def create_first_superuser(request):
    """
    Create the first superuser - only works if no superusers exist
    """
    # Check if any superuser already exists
    if User.objects.filter(is_superuser=True).exists():
        return Response(
            {"error": "Superuser already exists. Use normal registration."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Optional: Add a secret key for extra security
    secret = request.data.get("setup_secret")
    expected_secret = os.getenv("SETUP_SECRET", "allow-first-setup")

    if secret != expected_secret:
        return Response(
            {"error": "Invalid setup secret"}, status=status.HTTP_403_FORBIDDEN
        )

    username = request.data.get("username")
    email = request.data.get("email")
    password = request.data.get("password")
    first_name = request.data.get("first_name", "")
    last_name = request.data.get("last_name", "")

    if not all([username, email, password]):
        return Response(
            {"error": "Username, email, and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_superuser=True,
            is_staff=True,
            is_active=True,
        )

        return Response(
            {
                "success": True,
                "message": "Superuser created successfully",
                "user": {"username": user.username, "email": user.email, "id": user.id},
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([AllowAny])
def jwt_login_view(request):
    """JWT login view for authentication"""
    serializer = CustomTokenObtainPairSerializer(data=request.data)
    if serializer.is_valid():
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)


@api_view(["POST"])
@permission_classes([AllowAny])
def simple_login_view(request):
    """Simple login view (function-based) with httpOnly cookie authentication

    **FIXED**: Now stores tenant in session for TenantMiddleware
    """
    serializer = SimpleLoginSerializer(data=request.data, context={"request": request})
    if serializer.is_valid():
        user = serializer.validated_data["user"]

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        # Add custom claims
        access["id"] = user.id
        access["email"] = user.email
        access["role"] = user.role
        access["is_staff"] = user.is_staff

        # **CRITICAL FIX: Store tenant in session for middleware**
        if hasattr(user, "tenant") and user.tenant:
            request.session["tenant_id"] = str(user.tenant.id)
            logger.info(
                f"✅ Stored tenant {user.tenant.id} ({user.tenant.name}) in session for user {user.email}"
            )
        else:
            logger.warning(
                f"⚠️ User {user.email} has no tenant attribute or tenant is None"
            )

        # Build response data
        response_data = {
            "message": "Login successful",
            "user": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
                "is_superuser": user.is_superuser,
                "is_staff": user.is_staff,
                "is_active": user.is_active,
            },
        }

        # In development, also include tokens in body for cross-origin HTTP support
        if getattr(settings, 'AUTH_RETURN_TOKENS_IN_BODY', False):
            response_data["tokens"] = {
                "access": str(access),
                "refresh": str(refresh),
            }

        response = Response(response_data, status=status.HTTP_200_OK)

        # Set tokens in httpOnly cookies
        set_auth_cookies(response, str(access), str(refresh))
        return response

    return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)


# ============== COOKIE AUTH ENDPOINTS ==============


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_token_view(request):
    """
    Refresh access token using the refresh token from httpOnly cookie.

    This endpoint reads the refresh token from the cookie, generates
    a new access token, and sets both tokens in new cookies.
    """
    new_access, new_refresh = refresh_access_token_from_cookie(request)

    if new_access is None:
        return Response(
            {"error": "Invalid or expired refresh token"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    response = Response(
        {"message": "Token refreshed successfully"},
        status=status.HTTP_200_OK
    )

    set_auth_cookies(response, new_access, new_refresh)
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token_view(request):
    """
    Get a CSRF token for the frontend.

    The CSRF token is needed for non-GET requests when using cookie authentication.
    Django automatically sets the csrftoken cookie when this view is called.
    """
    from django.middleware.csrf import get_token

    csrf_token = get_token(request)
    return Response({"csrfToken": csrf_token}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def auth_status_view(request):
    """
    Check if the user is authenticated (via cookie).

    Returns user info if authenticated, 401 if not.
    """
    user = request.user
    return Response(
        {
            "authenticated": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": getattr(user, "role", "user"),
                "is_superuser": user.is_superuser,
                "is_staff": user.is_staff,
                "is_active": user.is_active,
            },
        },
        status=status.HTTP_200_OK,
    )


# ============== UTILITY VIEWS ==============


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def check_verification_status(request):
    """Check if user account is verified"""
    email = request.data.get("email")
    if not email:
        return Response(
            {"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(email=email)
        return Response(
            {
                "email": email,
                "is_verified": user.is_active,
                "user_exists": True,
            },
            status=status.HTTP_200_OK,
        )
    except User.DoesNotExist:
        return Response(
            {
                "email": email,
                "is_verified": False,
                "user_exists": False,
            },
            status=status.HTTP_200_OK,
        )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def check_verification_status_post(request):
    """Check if user account is verified (function-based)"""
    email = request.data.get("email")
    if not email:
        return Response(
            {"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(email=email)
        return Response(
            {
                "email": email,
                "is_verified": user.is_active,
                "user_exists": True,
            },
            status=status.HTTP_200_OK,
        )
    except User.DoesNotExist:
        return Response(
            {
                "email": email,
                "is_verified": False,
                "user_exists": False,
            },
            status=status.HTTP_200_OK,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_profile(request):
    """Get current user profile with better error handling"""
    try:
        user = request.user
        logger.info(
            f"Profile request for user: {user.email if user.is_authenticated else 'Anonymous'}"
        )

        if not user.is_authenticated:
            logger.warning("Unauthenticated user tried to access profile")
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(
            {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": getattr(user, "role", "user"),
                "is_active": user.is_active,
                "date_joined": user.date_joined,
                "phone": getattr(user, "phone", None),
                "phone_number": getattr(user, "phone_number", None),
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.error(f"Profile view error: {str(e)}")
        return Response(
            {"error": "Server error"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def list_admins(request):
    """List all admin users including section admins"""
    try:
        admin_roles = [
            "superadmin",
            "admin",
            "secondary_admin",
            "senior_secondary_admin",
            "junior_secondary_admin",
            "primary_admin",
            "nursery_admin",
        ]

        admins = User.objects.filter(role__in=admin_roles).order_by("-date_joined")

        admin_list = []
        for admin in admins:
            admin_list.append(
                {
                    "id": admin.id,
                    "username": admin.username,
                    "email": admin.email,
                    "first_name": admin.first_name,
                    "last_name": admin.last_name,
                    "full_name": getattr(
                        admin, "full_name", f"{admin.first_name} {admin.last_name}"
                    ),
                    "role": getattr(admin, "role", "user"),
                    "section": getattr(admin, "section", None),
                    "is_active": admin.is_active,
                    "is_staff": admin.is_staff,
                    "is_superuser": admin.is_superuser,
                    "date_joined": admin.date_joined,
                    "last_login": admin.last_login,
                    "phone": getattr(admin, "phone", None),
                }
            )

        return Response(admin_list, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Error listing admins: {str(e)}")
        return Response(
            {"detail": f"Failed to list admins: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Logout user by blacklisting refresh token and clearing cookies.

    **FIXED**: Now also clears tenant from session
    """
    # Try to get refresh token from cookie first, then from request body
    refresh_token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH) or request.data.get("refresh")

    response = Response(
        {"message": "Successfully logged out."}, status=status.HTTP_200_OK
    )

    # Clear auth cookies regardless of token blacklisting result
    clear_auth_cookies(response)

    # **CRITICAL FIX: Clear tenant from session**
    if "tenant_id" in request.session:
        del request.session["tenant_id"]
        logger.info("🗑️ Cleared tenant from session on logout")

    if refresh_token:
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            logger.info(f"User logged out, refresh token blacklisted")
        except Exception as e:
            # Log but don't fail - cookies are cleared anyway
            logger.warning(f"Could not blacklist refresh token: {str(e)}")
    else:
        logger.info("Logout without refresh token - cookies cleared")

    return response


# ============== PASSWORD RESET ==============


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_request(request):
    """Request password reset link"""
    email = request.data.get("email")
    frontend_url = request.data.get("frontend_url")

    if not email or not frontend_url:
        return Response(
            {"detail": "Email and frontend_url are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(email=email).first()
    if user:
        # Check if user is verified
        if not user.is_active:
            return Response(
                {
                    "detail": "Account is not verified. Please verify your account first."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_link = f"{frontend_url}/reset-password/{uid}/{token}/"

        try:
            send_mail(
                "Password Reset Request",
                f"Click the link to reset your password:\n\n{reset_link}",
                settings.DEFAULT_FROM_EMAIL,
                [email],
            )
        except Exception as e:
            logger.error(f"Password reset email failed: {e}")

    return Response(
        {"detail": "If the email exists, a reset link has been sent."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_confirm(request, uidb64, token):
    """Confirm password reset with new password"""
    password = request.data.get("password")
    if not password:
        return Response({"error": "Password is required."}, status=400)

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except Exception:
        return Response({"error": "Invalid reset link."}, status=400)

    if default_token_generator.check_token(user, token):
        user.set_password(password)
        user.save()
        return Response({"message": "Password has been reset successfully."})
    else:
        return Response({"error": "Invalid or expired token."}, status=400)


# ============CHECK VERIFICATION VIEW============


class CheckVerificationStatusView(APIView):
    """
    Check the verification status of the current user
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user

            # Assuming your user model has an 'is_verified' field
            # Adjust this based on your actual user model structure
            is_verified = getattr(user, "is_verified", False)

            return Response(
                {
                    "is_verified": is_verified,
                    "email": user.email,
                    "message": "Verification status retrieved successfully",
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"error": "Failed to check verification status", "detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def post(self, request):
        """
        Alternative endpoint to check verification status via POST
        (in case you need to send additional data)
        """
        try:
            user = request.user
            email = request.data.get("email", user.email)

            # You can add additional logic here if needed
            is_verified = getattr(user, "is_verified", False)

            return Response(
                {
                    "is_verified": is_verified,
                    "email": email,
                    "message": "Verification status checked successfully",
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"error": "Failed to check verification status", "detail": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ============== SOCIAL LOGIN ==============


class CustomGoogleOAuth2Adapter(GoogleOAuth2Adapter):
    def complete_login(self, request, app, token, **kwargs):
        # Store extra data in request for adapter to use
        if hasattr(request, "data"):
            request.social_extra_data = {
                "role": request.data.get("role"),
                "phone": request.data.get("phone"),
                "agree_to_terms": request.data.get("agree_to_terms", False),
                "subscribe_newsletter": request.data.get("subscribe_newsletter", False),
                "first_name": request.data.get("first_name"),
                "last_name": request.data.get("last_name"),
            }

        return super().complete_login(request, app, token, **kwargs)


class GoogleLogin(SocialLoginView):
    adapter_class = CustomGoogleOAuth2Adapter
    client_class = OAuth2Client

    def post(self, request, *args, **kwargs):
        # Store extra data in request for the adapter
        request.social_extra_data = {
            "role": request.data.get("role"),
            "phone": request.data.get("phone"),
            "agree_to_terms": request.data.get("agree_to_terms", False),
            "subscribe_newsletter": request.data.get("subscribe_newsletter", False),
            "first_name": request.data.get("first_name"),
            "last_name": request.data.get("last_name"),
        }

        return super().post(request, *args, **kwargs)


@api_view(["POST"])
@permission_classes([AllowAny])
def debug_auth(request):
    """Debug authentication issues"""
    try:
        email = request.data.get("email")
        password = request.data.get("password")

        if not email or not password:
            return Response(
                {"error": "Email and password required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Try to get user
        try:
            user = User.objects.get(email=email)
            user_exists = True
            user_active = user.is_active
            password_correct = user.check_password(password)
        except User.DoesNotExist:
            user_exists = False
            user_active = False
            password_correct = False

        # Try authentication
        auth_user = authenticate(request, email=email, password=password)

        return Response(
            {
                "email": email,
                "user_exists": user_exists,
                "user_active": user_active,
                "password_correct": password_correct,
                "authentication_success": auth_user is not None,
                "user_id": auth_user.id if auth_user else None,
            }
        )

    except Exception as e:
        logger.error(f"Debug auth error: {str(e)}")
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def debug_token(request):
    """Debug JWT token issues"""
    try:
        user = request.user
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")

        return Response(
            {
                "user_authenticated": user.is_authenticated,
                "user_id": user.id if user.is_authenticated else None,
                "user_email": user.email if user.is_authenticated else None,
                "auth_header_present": bool(auth_header),
                "auth_header_format": (
                    auth_header[:20] + "..." if len(auth_header) > 20 else auth_header
                ),
            }
        )

    except Exception as e:
        logger.error(f"Debug token error: {str(e)}")
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ============== ALTERNATIVE FUNCTION-BASED VIEWS ==============


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register_user(request):
    """Alternative function-based registration view"""
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return JsonResponse(
            {
                "message": "Registration successful. Please verify your account.",
                "email": user.email,  # type: ignore
                "user_id": user.id,  # type: ignore
            },
            status=201,
        )
    return JsonResponse(serializer.errors, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_account(request):
    """Alternative function-based verification view"""
    serializer = VerifyAccountSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data["user"]  # type: ignore

        # Auto-login after verification
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token

        return JsonResponse(
            {
                "message": "Account verified and logged in successfully.",
                "access": str(access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "role": user.role,
                },
            },
            status=200,
        )
    return JsonResponse(serializer.errors, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def resend_verification(request):
    """Alternative function-based resend verification view"""
    serializer = ResendVerificationSerializer(data=request.data)
    if serializer.is_valid():
        verification_code = serializer.resend_code(serializer.validated_data)  # type: ignore
        return JsonResponse(
            {
                "message": "Verification code resent successfully.",
                "email": serializer.validated_data["email"],  # type: ignore
            },
            status=200,
        )
    return JsonResponse(serializer.errors, status=400)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def check_email_view(request):
    """Check if email exists in the system"""
    email = request.data.get("email")
    if not email:
        return Response(
            {"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.get(email=email)
        return Response(
            {
                "email": email,
                "exists": True,
                "is_verified": user.is_active,
            },
            status=status.HTTP_200_OK,
        )
    except User.DoesNotExist:
        return Response(
            {
                "email": email,
                "exists": False,
            },
            status=status.HTTP_200_OK,
        )


# Add these missing views to your authentication/views.py file

# ============== MISSING FUNCTION-BASED VIEWS ==============


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register_view(request):
    """Function-based registration view (alternative name for register_user)"""
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(
            {
                "message": "Account created successfully. Please check your email/SMS for verification code.",
                "email": user.email,  # type: ignore
                "user_id": user.id,  # type: ignore
                "verification_method": request.data.get("verification_method", "email"),
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_account_view(request):
    """Function-based verification view (alternative name for verify_account)"""
    serializer = VerifyAccountSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data["user"]  # type: ignore

        # Generate JWT tokens for automatic login
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token

        # Add custom claims to the token
        access_token["id"] = user.id
        access_token["email"] = user.email
        access_token["role"] = user.role
        access_token["is_staff"] = user.is_staff

        return Response(
            {
                "message": "Account verified successfully. You are now logged in.",
                "access": str(access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "role": user.role,
                    "is_superuser": user.is_superuser,
                    "is_staff": user.is_staff,
                    "is_active": user.is_active,
                },
            },
            status=status.HTTP_200_OK,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def resend_verification_view(request):
    """Function-based resend verification view (alternative name for resend_verification)"""
    serializer = ResendVerificationSerializer(data=request.data)
    if serializer.is_valid():
        verification_code = serializer.resend_code(serializer.validated_data)  # type: ignore
        return Response(
            {
                "message": f"Verification code sent successfully via {serializer.validated_data['verification_method']}",  # type: ignore
                "email": serializer.validated_data["email"],  # type: ignore
            },
            status=status.HTTP_200_OK,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DebugLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        # Log the incoming data
        print("Request data:", request.data)
        return Response({"received_data": request.data}, status=status.HTTP_200_OK)


# Function-based version if you prefer
@csrf_exempt
@require_http_methods(["POST"])
def debug_login_function(request):
    try:
        print(f"Raw body: {request.body}")
        print(f"Content type: {request.content_type}")

        data = json.loads(request.body)
        print(f"Parsed data: {data}")

        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return JsonResponse({"error": "Email and password required"}, status=400)

        user = authenticate(request, email=email, password=password)

        if user:
            return JsonResponse({"message": "Success", "user": user.username})
        else:
            return JsonResponse({"error": "Authentication failed"}, status=401)

    except Exception as e:
        print(f"Error: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def activate_user(request, user_id):
    try:
        print(f"🔍 activate_user called with user_id: {user_id}")
        print(f"🔍 Request data: {request.data}")
        print(f"🔍 Request user: {request.user}")

        user = User.objects.get(pk=user_id)
        print(
            f"🔍 Found user: {user.username} (ID: {user.id}), current is_active: {user.is_active}"
        )

        is_active = request.data.get("is_active")
        print(f"🔍 Requested is_active value: {is_active}")

        if is_active is not None:
            user.is_active = bool(is_active)
            user.save()
            print(f"🔍 Updated user.is_active to: {user.is_active}")
            return Response({"success": True, "is_active": user.is_active})
        else:
            print(f"🔍 Missing is_active field in request data")
            return Response({"error": "Missing is_active field"}, status=400)
    except User.DoesNotExist:
        print(f"🔍 User with ID {user_id} not found")
        return Response({"error": "User not found"}, status=404)
    except Exception as e:
        print(f"🔍 Unexpected error: {str(e)}")
        return Response({"error": str(e)}, status=500)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_reset_password(request):
    """Reset user password (admin only)"""
    try:
        user_id = request.data.get("user_id")
        new_password = request.data.get("new_password")

        if not user_id or not new_password:
            return Response(
                {"error": "user_id and new_password are required."}, status=400
            )

        user = User.objects.get(id=user_id)
        user.set_password(new_password)
        user.save()

        return Response(
            {
                "message": f"Password for user {user.email} has been reset successfully.",
                "username": user.username,
                "email": user.email,
            }
        )
    except User.DoesNotExist:
        return Response({"error": "User not found."}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


def generate_temp_password(length=12):
    """Generate a secure temporary password"""
    chars = string.ascii_uppercase + string.ascii_lowercase + string.digits + "!@#$%"
    password = "".join(secrets.choice(chars) for _ in range(length))

    # Ensure it has at least one of each type
    if not any(c.isupper() for c in password):
        password = secrets.choice(string.ascii_uppercase) + password[1:]
    if not any(c.islower() for c in password):
        password = password[0] + secrets.choice(string.ascii_lowercase) + password[2:]
    if not any(c.isdigit() for c in password):
        password = password[:2] + secrets.choice(string.digits) + password[3:]
    if not any(c in "!@#$%" for c in password):
        password = password[:3] + secrets.choice("!@#$%") + password[4:]

    return password


@api_view(["POST"])
@permission_classes([IsAdminUser])
def create_admin(request):
    """Create a new admin with auto-generated username and password"""
    email = request.data.get("email")
    first_name = request.data.get("first_name")
    last_name = request.data.get("last_name")

    # Validate required fields
    if not all([email, first_name, last_name]):
        return Response(
            {"detail": "Email, first name, and last name are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check if email already exists
    if User.objects.filter(email=email).exists():
        return Response(
            {"detail": "A user with this email already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            # Generate unique username using your existing utility
            # Format will be: ADM/GTS/OCT/25/001
            username = generate_unique_username("admin")
            temp_password = generate_temp_password()

            # Create the admin user
            admin = User.objects.create_user(
                username=username,
                email=email,
                password=temp_password,
                first_name=first_name,
                last_name=last_name,
                role="admin",
                is_staff=True,
                is_superuser=True,
                is_active=True,
                email_verified=True,
            )

            logger.info(f"Admin created: {username} ({email})")

            return Response(
                {
                    "id": admin.id,
                    "admin_username": username,
                    "admin_password": temp_password,
                    "email": email,
                    "first_name": first_name,
                    "last_name": last_name,
                    "message": "Admin created successfully",
                },
                status=status.HTTP_201_CREATED,
            )

    except Exception as e:
        logger.error(f"Failed to create admin: {str(e)}")
        return Response(
            {"detail": f"Failed to create admin: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
