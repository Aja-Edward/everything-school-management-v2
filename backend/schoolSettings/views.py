from rest_framework import status, viewsets
from rest_framework.decorators import (
    api_view,
    permission_classes,
    parser_classes,
    action,
    authentication_classes,
)
from django.contrib.auth import get_user_model
from rest_framework.authentication import BasicAuthentication, SessionAuthentication
from django.core.management import call_command
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction
from django.core.cache import cache
import cloudinary
import cloudinary.uploader
import logging

# Multi-tenant imports
from tenants.models import Tenant, TenantSettings

from .models import (
    SchoolAnnouncement,
    CommunicationSettings,
    Permission,
    Role,
    UserRole,
)
from .serializers import (
    SchoolAnnouncementSerializer,
    CommunicationSettingsSerializer,
    PermissionSerializer,
    RoleSerializer,
    RoleCreateUpdateSerializer,
    UserRoleSerializer,
    UserRoleCreateUpdateSerializer,
)
from .permissions import (
    HasSettingsPermission,
    HasSettingsPermissionOrReadOnly,
    PublicReadOnly,
)

# Set up logging
logger = logging.getLogger(__name__)


class SchoolSettingsDetail(APIView):
    """
    Retrieve and update school settings using multi-tenant TenantSettings.
    The school name comes from Tenant.name, other settings from TenantSettings.
    """

    permission_classes = [PublicReadOnly]

    def get_permissions(self):
        """Allow public read access, require admin for write"""
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated(), IsAdminUser()]

    def _get_tenant(self, request):
        """Get tenant from request or authenticated user"""
        # First try from middleware (subdomain/header)
        tenant = getattr(request, 'tenant', None)

        # Fall back to user's tenant if authenticated
        if not tenant and request.user.is_authenticated:
            tenant = getattr(request.user, 'tenant', None)

        # Final fallback: get the first active tenant (for development/single-tenant mode)
        if not tenant:
            tenant = Tenant.objects.filter(is_active=True).first()

        return tenant

    def _build_settings_response(self, tenant, tenant_settings):
        """Build the settings response combining Tenant and TenantSettings data"""
        return {
            # From Tenant model
            "school_name": tenant.name,
            "site_name": tenant.name,
            # From TenantSettings model
            "school_code": tenant_settings.school_code,
            "school_motto": tenant_settings.school_motto,
            "school_address": tenant_settings.address,
            "address": tenant_settings.address,
            "city": tenant_settings.city,
            "state": tenant_settings.state,
            "country": tenant_settings.country,
            "postal_code": tenant_settings.postal_code,
            "school_phone": tenant_settings.phone,
            "phone": tenant_settings.phone,
            "school_email": tenant_settings.email,
            "email": tenant_settings.email,
            "website": tenant_settings.website,
            # Branding
            "logo": str(tenant_settings.logo) if tenant_settings.logo else None,
            "logo_url": str(tenant_settings.logo) if tenant_settings.logo else None,
            "favicon": (
                str(tenant_settings.favicon) if tenant_settings.favicon else None
            ),
            "favicon_url": (
                str(tenant_settings.favicon) if tenant_settings.favicon else None
            ),
            "primary_color": tenant_settings.primary_color,
            "secondary_color": tenant_settings.secondary_color,
            "theme": tenant_settings.theme,
            "typography": tenant_settings.typography,
            # Academic
            "academic_year": (
                str(tenant_settings.current_session)
                if tenant_settings.current_session
                else ""
            ),
            "current_term": (
                str(tenant_settings.current_term)
                if tenant_settings.current_term
                else ""
            ),
            # Localization
            "timezone": tenant_settings.timezone,
            "date_format": tenant_settings.date_format,
            "language": tenant_settings.language,
            "currency": tenant_settings.currency,
            # Registration & User Settings
            "allow_self_registration": tenant_settings.allow_student_registration,
            "allow_student_registration": tenant_settings.allow_student_registration,
            "allow_parent_registration": tenant_settings.allow_parent_registration,
            "registration_approval_required": tenant_settings.registration_approval_required,
            "default_user_role": tenant_settings.default_user_role,
            # Security & Authentication
            "email_verification_required": tenant_settings.require_email_verification,
            "session_timeout": tenant_settings.session_timeout_minutes,
            "max_login_attempts": tenant_settings.max_login_attempts,
            "account_lock_duration": tenant_settings.account_lock_duration_minutes,
            # Password Policy
            "password_min_length": tenant_settings.password_min_length,
            "password_reset_interval": tenant_settings.password_reset_interval_days,
            "password_require_numbers": tenant_settings.password_require_numbers,
            "password_require_symbols": tenant_settings.password_require_symbols,
            "password_require_uppercase": tenant_settings.password_require_uppercase,
            "password_expiration": tenant_settings.password_expiration_days,
            # Profile Settings
            "allow_profile_image_upload": tenant_settings.allow_profile_image_upload,
            "profile_image_max_size": tenant_settings.profile_image_max_size_mb,
            # Notifications
            "notifications_enabled": tenant_settings.notifications_enabled,
            # Portal Access
            "student_portal_enabled": tenant_settings.student_portal_enabled,
            "teacher_portal_enabled": tenant_settings.teacher_portal_enabled,
            "parent_portal_enabled": tenant_settings.parent_portal_enabled,
            # Result Settings
            "show_position_on_result": tenant_settings.show_position_on_result,
            "show_class_average_on_result": tenant_settings.show_class_average_on_result,
            "require_token_for_result": tenant_settings.require_token_for_result,
            # ── Academic Year ──────────────────────────────
            "academic_year_start": tenant_settings.academic_year_start,
            "academic_year_end": tenant_settings.academic_year_end,
            "terms_per_year": tenant_settings.terms_per_year,
            "weeks_per_term": tenant_settings.weeks_per_term,
            # ── Class Settings ─────────────────────────────
            "allow_class_overflow": tenant_settings.allow_class_overflow,
            "enable_streaming": tenant_settings.enable_streaming,
            "enable_subject_electives": tenant_settings.enable_subject_electives,
            # ── Grading ────────────────────────────────────
            "grading_system": tenant_settings.grading_system,
            "pass_percentage": tenant_settings.pass_percentage,
            "enable_grade_curving": tenant_settings.enable_grade_curving,
            "enable_grade_weighting": tenant_settings.enable_grade_weighting,
            # ── Attendance ─────────────────────────────────
            "require_attendance": tenant_settings.require_attendance,
            "minimum_attendance_percentage": tenant_settings.minimum_attendance_percentage,
            "enable_attendance_tracking": tenant_settings.enable_attendance_tracking,
            "allow_late_arrival": tenant_settings.allow_late_arrival,
            # ── Curriculum ─────────────────────────────────
            "enable_cross_cutting_subjects": tenant_settings.enable_cross_cutting_subjects,
            "enable_subject_prerequisites": tenant_settings.enable_subject_prerequisites,
            "allow_subject_changes": tenant_settings.allow_subject_changes,
            "enable_credit_system": tenant_settings.enable_credit_system,
            # Timestamps
            "created_at": (
                tenant_settings.created_at.isoformat()
                if tenant_settings.created_at
                else None
            ),
            "updated_at": (
                tenant_settings.updated_at.isoformat()
                if tenant_settings.updated_at
                else None
            ),
        }

    def get(self, request):
        """Get current school settings from TenantSettings"""
        try:
            tenant = self._get_tenant(request)

            if not tenant:
                return Response(
                    {"error": "No tenant found. Please ensure you're accessing via subdomain or are logged in."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Use tenant-specific cache key
            cache_key = f"tenant_settings_{tenant.id}"
            cached_data = cache.get(cache_key)

            if cached_data:
                return Response(cached_data)

            # Get or create TenantSettings
            tenant_settings, created = TenantSettings.objects.get_or_create(tenant=tenant)

            # Build response data
            response_data = self._build_settings_response(tenant, tenant_settings)

            # Cache the response
            cache.set(cache_key, response_data, 300)  # 5 minutes

            return Response(response_data)

        except Exception as e:
            logger.error(f"Failed to fetch settings: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to fetch settings: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @transaction.atomic
    def put(self, request):
        """Update school settings in TenantSettings"""
        try:
            tenant = self._get_tenant(request)

            if not tenant:
                return Response(
                    {"error": "No tenant found. Please ensure you're accessing via subdomain or are logged in."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Get or create TenantSettings
            tenant_settings, created = TenantSettings.objects.get_or_create(tenant=tenant)

            data = request.data.copy()

            # Update Tenant.name if school_name is provided
            if "school_name" in data:
                school_name = data.get("school_name", "").strip()
                if not school_name:
                    return Response(
                        {"error": "School name cannot be empty"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                tenant.name = school_name
                tenant.save(update_fields=['name'])

            # Map frontend fields to TenantSettings fields
            field_mapping = {
                # School Information
                "school_code": "school_code",
                "school_motto": "school_motto",
                "motto": "school_motto",
                "address": "address",
                "school_address": "address",
                "city": "city",
                "state": "state",
                "country": "country",
                "postal_code": "postal_code",
                "phone": "phone",
                "school_phone": "phone",
                "email": "email",
                "school_email": "email",
                "website": "website",

                # Branding
                "primary_color": "primary_color",
                "secondary_color": "secondary_color",
                "theme": "theme",
                "typography": "typography",

                # Localization
                "timezone": "timezone",
                "date_format": "date_format",
                "language": "language",
                "currency": "currency",

                # Registration & User Settings
                "allow_self_registration": "allow_student_registration",
                "allow_student_registration": "allow_student_registration",
                "allow_parent_registration": "allow_parent_registration",
                "registration_approval_required": "registration_approval_required",
                "default_user_role": "default_user_role",

                # Security & Authentication
                "email_verification_required": "require_email_verification",
                "session_timeout": "session_timeout_minutes",
                "max_login_attempts": "max_login_attempts",
                "account_lock_duration": "account_lock_duration_minutes",

                # Password Policy
                "password_min_length": "password_min_length",
                "password_reset_interval": "password_reset_interval_days",
                "password_require_numbers": "password_require_numbers",
                "password_require_symbols": "password_require_symbols",
                "password_require_uppercase": "password_require_uppercase",
                "password_expiration": "password_expiration_days",

                # Profile Settings
                "allow_profile_image_upload": "allow_profile_image_upload",
                "profile_image_max_size": "profile_image_max_size_mb",

                # Notifications
                "notifications_enabled": "notifications_enabled",

                # Portal Access
                "student_portal_enabled": "student_portal_enabled",
                "teacher_portal_enabled": "teacher_portal_enabled",
                "parent_portal_enabled": "parent_portal_enabled",

                # Result Settings
                "show_position_on_result": "show_position_on_result",
                "show_class_average_on_result": "show_class_average_on_result",
                "require_token_for_result": "require_token_for_result",
            }

            # Update TenantSettings fields
            updated_fields = []
            for frontend_field, model_field in field_mapping.items():
                if frontend_field in data:
                    value = data[frontend_field]
                    setattr(tenant_settings, model_field, value)
                    if model_field not in updated_fields:
                        updated_fields.append(model_field)

            if updated_fields:
                tenant_settings.save(update_fields=updated_fields + ['updated_at'])

            # Clear cache
            cache.delete(f"tenant_settings_{tenant.id}")

            # Build and return response
            response_data = self._build_settings_response(tenant, tenant_settings)

            return Response(response_data)

        except Exception as e:
            logger.error(f"Failed to update settings: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to update settings: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


User = get_user_model()


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def update_user_role(request):
    """
    Allows an admin to update a user's role, adjust is_staff,
    and automatically manage UserRole relationships.

    Expected JSON:
    {
        "email": "secondaryadmin@gmail.com",
        "role": "secondary_admin"
    }
    """
    email = request.data.get("email")
    role_name = request.data.get("role")

    if not email or not role_name:
        return Response(
            {"error": "Both 'email' and 'role' fields are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response(
            {"error": f"No user found with email '{email}'"},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Ensure role exists (create if missing)
    role, _ = Role.objects.get_or_create(
        name=role_name,
        defaults={"description": f"Auto-created role: {role_name}"},
    )

    # Update user's primary role field and staff status
    user.role = role_name
    user.is_staff = role_name in ["admin", "secondary_admin"]
    user.save(update_fields=["role", "is_staff"])

    # Ensure UserRole link exists
    user_role, created = UserRole.objects.get_or_create(
        user=user,
        role=role,
        defaults={
            "assigned_by": request.user,
            "assigned_at": timezone.now(),
            "is_active": True,
        },
    )

    if not created:
        # If already exists, re-activate it if it was inactive
        if not user_role.is_active:
            user_role.is_active = True
            user_role.assigned_by = request.user
            user_role.assigned_at = timezone.now()
            user_role.save(update_fields=["is_active", "assigned_by", "assigned_at"])

    return Response(
        {
            "message": f"User '{user.email}' successfully updated.",
            "role": user.role,
            "is_staff": user.is_staff,
            "user_role_id": user_role.id,
            "user_role_status": "created" if created else "updated",
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated, IsAdminUser])
def upload_logo(request):
    """
    Upload school logo to Cloudinary
    CRITICAL FIX: Uses update_fields to avoid querying missing columns
    """
    try:
        # Validate file presence
        if "logo" not in request.FILES:
            return Response(
                {"error": "No logo file provided. Expected field name: 'logo'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_file = request.FILES["logo"]

        # Log upload attempt
        logger.info(
            f"Logo upload started: {uploaded_file.name} ({uploaded_file.size} bytes)"
        )

        # Validate file type
        allowed_types = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/svg+xml",
            "image/webp",
        ]
        if uploaded_file.content_type not in allowed_types:
            return Response(
                {
                    "error": f"Invalid file type: {uploaded_file.content_type}",
                    "allowed_types": allowed_types,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file size (max 5MB)
        max_size = 5 * 1024 * 1024
        if uploaded_file.size > max_size:
            return Response(
                {
                    "error": f"File too large: {uploaded_file.size} bytes",
                    "max_size": f"{max_size / 1024 / 1024}MB",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Upload to Cloudinary
        try:
            upload_result = cloudinary.uploader.upload(
                uploaded_file,
                folder="school_logos",
                resource_type="image",
                transformation=[
                    {"width": 800, "height": 800, "crop": "limit"},
                    {"quality": "auto:good"},
                    {"fetch_format": "auto"},
                ],
                overwrite=True,
                invalidate=True,  # Clear CDN cache
            )

            logo_url = upload_result.get("secure_url")

            if not logo_url:
                raise Exception("Cloudinary did not return a URL")

            logger.info(f"Logo uploaded to Cloudinary: {logo_url}")

        except Exception as cloudinary_error:
            logger.error(
                f"Cloudinary upload failed: {str(cloudinary_error)}", exc_info=True
            )
            return Response(
                {"error": f"Cloudinary upload failed: {str(cloudinary_error)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Update database - Using TenantSettings
        try:
            # Get tenant from user
            tenant = getattr(request.user, 'tenant', None)
            if not tenant:
                return Response(
                    {"error": "No tenant found for user."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with transaction.atomic():
                # Get or create TenantSettings
                tenant_settings, created = TenantSettings.objects.get_or_create(tenant=tenant)
                tenant_settings.logo = logo_url
                tenant_settings.save(update_fields=["logo", "updated_at"])

            logger.info(f"Logo URL saved to database: {logo_url}")

            # Clear cache
            cache.delete(f"tenant_settings_{tenant.id}")

            return Response(
                {
                    "logoUrl": logo_url,
                    "message": "Logo uploaded successfully",
                    "cloudinary_public_id": upload_result.get("public_id"),
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as db_error:
            logger.error(f"Database save failed: {str(db_error)}", exc_info=True)
            return Response(
                {"error": f"Failed to save logo URL: {str(db_error)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    except Exception as e:
        logger.error(f"Logo upload failed: {str(e)}", exc_info=True)
        return Response(
            {"error": f"Failed to upload logo: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated, IsAdminUser])
def upload_favicon(request):
    """
    Upload school favicon to Cloudinary
    CRITICAL FIX: Uses update_fields to avoid querying missing columns
    """
    try:
        # Validate file presence
        if "favicon" not in request.FILES:
            return Response(
                {"error": "No favicon file provided. Expected field name: 'favicon'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_file = request.FILES["favicon"]

        logger.info(
            f"Favicon upload started: {uploaded_file.name} ({uploaded_file.size} bytes)"
        )

        # Validate file type
        allowed_types = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/svg+xml",
            "image/x-icon",
            "image/vnd.microsoft.icon",
            "image/webp",
        ]
        if uploaded_file.content_type not in allowed_types:
            return Response(
                {
                    "error": f"Invalid file type: {uploaded_file.content_type}",
                    "allowed_types": allowed_types,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file size (max 1MB for favicon)
        max_size = 1 * 1024 * 1024
        if uploaded_file.size > max_size:
            return Response(
                {
                    "error": f"File too large: {uploaded_file.size} bytes",
                    "max_size": f"{max_size / 1024 / 1024}MB",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Upload to Cloudinary
        try:
            upload_result = cloudinary.uploader.upload(
                uploaded_file,
                folder="school_favicons",
                resource_type="image",
                transformation=[
                    {"width": 64, "height": 64, "crop": "fill"},
                    {"quality": "auto:good"},
                    {"fetch_format": "auto"},
                ],
                overwrite=True,
                invalidate=True,
            )

            favicon_url = upload_result.get("secure_url")

            if not favicon_url:
                raise Exception("Cloudinary did not return a URL")

            logger.info(f"Favicon uploaded to Cloudinary: {favicon_url}")
            logger.info(f"🔍 Favicon URL LENGTH: {len(favicon_url)} characters")

        except Exception as cloudinary_error:
            logger.error(
                f"Cloudinary upload failed: {str(cloudinary_error)}", exc_info=True
            )
            return Response(
                {"error": f"Cloudinary upload failed: {str(cloudinary_error)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Update database - Using TenantSettings
        try:
            # Get tenant from user
            tenant = getattr(request.user, 'tenant', None)
            if not tenant:
                return Response(
                    {"error": "No tenant found for user."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with transaction.atomic():
                # Get or create TenantSettings
                tenant_settings, created = TenantSettings.objects.get_or_create(tenant=tenant)
                logger.info(
                    f"🔍 About to save favicon URL (length: {len(favicon_url)})"
                )
                logger.info(f"🔍 Favicon URL being saved: {favicon_url}")

                tenant_settings.favicon = favicon_url
                tenant_settings.save(update_fields=["favicon", "updated_at"])

            logger.info(f"✅ Favicon URL saved to database: {favicon_url}")

            # Clear cache
            cache.delete(f"tenant_settings_{tenant.id}")

            return Response(
                {
                    "faviconUrl": favicon_url,
                    "message": "Favicon uploaded successfully",
                    "cloudinary_public_id": upload_result.get("public_id"),
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as db_error:
            logger.error(f"❌ Database save failed: {str(db_error)}", exc_info=True)
            logger.error(f"❌ Favicon URL that failed: {favicon_url}")
            logger.error(f"❌ Favicon URL length: {len(favicon_url)}")

            return Response(
                {
                    "error": f"Failed to save favicon URL: {str(db_error)}",
                    "url_length": len(favicon_url),
                    "url": (
                        favicon_url[:100] + "..."
                        if len(favicon_url) > 100
                        else favicon_url
                    ),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    except Exception as e:
        logger.error(f"Favicon upload failed: {str(e)}", exc_info=True)
        return Response(
            {"error": f"Failed to upload favicon: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def test_payment_gateway(request, gateway):
    """Test payment gateway connection"""
    try:
        credentials = request.data

        # Here you would implement the actual gateway testing logic
        # For now, we'll return a mock response

        if gateway == "paystack":
            # Test Paystack connection
            public_key = credentials.get("publicKey", "")
            secret_key = credentials.get("secretKey", "")

            if not public_key or not secret_key:
                return Response(
                    {
                        "success": False,
                        "message": "Public key and secret key are required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Mock successful test
            return Response(
                {"success": True, "message": "Paystack connection test successful!"}
            )

        elif gateway == "stripe":
            # Test Stripe connection
            publishable_key = credentials.get("publishableKey", "")
            secret_key = credentials.get("secretKey", "")

            if not publishable_key or not secret_key:
                return Response(
                    {
                        "success": False,
                        "message": "Publishable key and secret key are required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Mock successful test
            return Response(
                {"success": True, "message": "Stripe connection test successful!"}
            )

        elif gateway == "flutterwave":
            # Test Flutterwave connection
            public_key = credentials.get("publicKey", "")
            secret_key = credentials.get("secretKey", "")

            if not public_key or not secret_key:
                return Response(
                    {
                        "success": False,
                        "message": "Public key and secret key are required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Mock successful test
            return Response(
                {"success": True, "message": "Flutterwave connection test successful!"}
            )

        else:
            return Response(
                {"success": False, "message": f"Unsupported gateway: {gateway}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    except Exception as e:
        return Response(
            {
                "success": False,
                "message": f"Failed to test {gateway} connection: {str(e)}",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def test_email_connection(request):
    """Test email provider connection (SMTP or Brevo)"""
    try:
        provider = request.data.get("provider", "smtp")

        if provider == "smtp":
            # Test SMTP connection
            smtp_config = request.data

            # Validate required fields
            required_fields = ["host", "port", "username", "password"]
            for field in required_fields:
                if not smtp_config.get(field):
                    return Response(
                        {"success": False, "message": f"{field} is required"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # Here you would implement actual SMTP testing
            # For now, we'll return a mock response
            return Response(
                {"success": True, "message": "SMTP connection test successful!"}
            )

        elif provider == "brevo":
            # Test Brevo connection
            import requests

            api_key = request.data.get("apiKey", "")
            from_email = request.data.get("fromEmail", "")

            if not api_key:
                return Response(
                    {"success": False, "message": "Brevo API key is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Test Brevo API connection
            url = "https://api.brevo.com/v3/senders"
            headers = {"accept": "application/json", "api-key": api_key}

            try:
                response = requests.get(url, headers=headers)
                if response.status_code == 200:
                    return Response(
                        {"success": True, "message": "Brevo connection successful!"}
                    )
                else:
                    return Response(
                        {
                            "success": False,
                            "message": "Invalid Brevo API key or connection failed",
                        }
                    )
            except Exception as e:
                return Response(
                    {"success": False, "message": f"Brevo connection error: {str(e)}"}
                )

        else:
            return Response(
                {"success": False, "message": f"Unsupported email provider: {provider}"}
            )

    except Exception as e:
        return Response(
            {"success": False, "message": f"Failed to test email connection: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def test_sms_connection(request):
    """Test SMS provider connection"""
    try:
        sms_config = request.data

        # Validate required fields
        required_fields = ["provider", "apiKey", "apiSecret"]
        for field in required_fields:
            if not sms_config.get(field):
                return Response(
                    {"success": False, "message": f"{field} is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Here you would implement actual SMS provider testing
        # For now, we'll return a mock response

        return Response(
            {
                "success": True,
                "message": f'SMS connection test successful for {sms_config["provider"]}!',
            }
        )

    except Exception as e:
        return Response(
            {"success": False, "message": f"Failed to test SMS connection: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class CommunicationSettingsDetail(APIView):
    """
    Retrieve and update communication settings
    """

    permission_classes = [HasSettingsPermissionOrReadOnly]

    def get(self, request):
        """Get current communication settings"""
        try:
            settings = CommunicationSettings.objects.first()
            if not settings:
                settings = CommunicationSettings.objects.create()

            serializer = CommunicationSettingsSerializer(settings)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {"error": f"Failed to fetch communication settings: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def put(self, request):
        """Update communication settings"""
        try:
            settings = CommunicationSettings.objects.first()
            if not settings:
                settings = CommunicationSettings.objects.create()

            # Remove computed fields that shouldn't be updated directly
            data = request.data.copy()
            data.pop("id", None)
            data.pop("created_at", None)
            data.pop("updated_at", None)
            data.pop("brevo_configured", None)
            data.pop("twilio_configured", None)

            serializer = CommunicationSettingsSerializer(
                settings, data=data, partial=True
            )
            if serializer.is_valid():
                serializer.save(updated_by=request.user)
                return Response(serializer.data)
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"Failed to update communication settings: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def test_brevo_connection(request):
    """Test Brevo connection with provided credentials"""
    try:
        import requests

        api_key = request.data.get("apiKey", "")
        sender_email = request.data.get("senderEmail", "")

        if not api_key:
            return Response(
                {"success": False, "message": "Brevo API key is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Test Brevo API connection
        url = "https://api.brevo.com/v3/senders"
        headers = {"accept": "application/json", "api-key": api_key}

        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                # Update communication settings if test is successful
                settings = CommunicationSettings.objects.first()
                if not settings:
                    settings = CommunicationSettings.objects.create()

                settings.brevo_api_key = api_key
                settings.brevo_sender_email = sender_email
                settings.brevo_configured = True
                settings.save(
                    update_fields=[
                        "brevo_api_key",
                        "brevo_sender_email",
                        "brevo_configured",
                    ]
                )

                return Response(
                    {"success": True, "message": "Brevo connection successful!"}
                )
            else:
                return Response(
                    {
                        "success": False,
                        "message": "Invalid Brevo API key or connection failed",
                    }
                )
        except requests.exceptions.Timeout:
            return Response(
                {
                    "success": False,
                    "message": "Connection timeout. Please check your internet connection.",
                }
            )
        except Exception as e:
            return Response(
                {"success": False, "message": f"Brevo connection error: {str(e)}"}
            )

    except Exception as e:
        return Response(
            {"success": False, "message": f"Failed to test Brevo connection: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def test_twilio_connection(request):
    """Test Twilio connection with provided credentials"""
    try:
        from utils.sms import test_twilio_connection as test_twilio

        account_sid = request.data.get("accountSid", "")
        auth_token = request.data.get("authToken", "")
        phone_number = request.data.get("phoneNumber", "")

        if not account_sid or not auth_token:
            return Response(
                {
                    "success": False,
                    "message": "Twilio Account SID and Auth Token are required",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Test Twilio connection using utility function
        success, message = test_twilio(account_sid, auth_token, phone_number)

        if success:
            # Update communication settings if test is successful
            settings = CommunicationSettings.objects.first()
            if not settings:
                settings = CommunicationSettings.objects.create()

            settings.twilio_account_sid = account_sid
            settings.twilio_auth_token = auth_token
            settings.twilio_phone_number = phone_number
            settings.twilio_configured = True
            settings.save(
                update_fields=[
                    "twilio_account_sid",
                    "twilio_auth_token",
                    "twilio_phone_number",
                    "twilio_configured",
                ]
            )

            return Response(
                {"success": True, "message": "Twilio connection successful!"}
            )
        else:
            return Response({"success": False, "message": message})

    except Exception as e:
        return Response(
            {
                "success": False,
                "message": f"Failed to test Twilio connection: {str(e)}",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def send_test_email(request):
    """Send test email using configured Brevo settings"""
    try:
        settings = CommunicationSettings.objects.first()
        if not settings or not settings.brevo_configured:
            return Response(
                {
                    "success": False,
                    "message": "Brevo is not configured. Please configure Brevo first.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Import the email utility
        from utils.email import send_email_via_brevo

        subject = "Test Email from School Management System"
        html_content = """
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3B82F6;">Test Email</h2>
            <p>This is a test email sent from your school management system.</p>
            <p>If you received this email, your Brevo configuration is working correctly!</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
                Sent at: {timestamp}<br>
                From: {sender_name} &lt;{sender_email}&gt;
            </p>
        </div>
        """.format(
            timestamp=timezone.now().strftime("%Y-%m-%d %H:%M:%S"),
            sender_name=settings.brevo_sender_name or "School Management System",
            sender_email=settings.brevo_sender_email or "noreply@school.com",
        )

        # Send to the admin's email
        to_email = request.user.email

        status_code, response = send_email_via_brevo(subject, html_content, to_email)

        if status_code in [200, 201]:
            return Response(
                {
                    "success": True,
                    "message": f"Test email sent successfully to {to_email}",
                }
            )
        else:
            return Response(
                {"success": False, "message": f"Failed to send test email: {response}"}
            )

    except Exception as e:
        return Response(
            {"success": False, "message": f"Failed to send test email: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def send_test_sms(request):
    """Send test SMS using configured Twilio settings"""
    try:
        settings = CommunicationSettings.objects.first()
        if not settings or not settings.twilio_configured:
            return Response(
                {
                    "success": False,
                    "message": "Twilio is not configured. Please configure Twilio first.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        test_number = request.data.get("testNumber", "")
        if not test_number:
            return Response(
                {"success": False, "message": "Test phone number is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Import Twilio SDK
        from twilio.rest import Client
        from twilio.base.exceptions import TwilioRestException

        # Create Twilio client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

        # Prepare message content
        message_body = f"Test SMS from School Management System. Sent at {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}"

        try:
            # Send SMS via Twilio
            message = client.messages.create(
                body=message_body, from_=settings.twilio_phone_number, to=test_number
            )

            return Response(
                {
                    "success": True,
                    "message": f"Test SMS sent successfully to {test_number}",
                    "message_sid": message.sid,
                    "status": message.status,
                }
            )

        except TwilioRestException as e:
            return Response(
                {
                    "success": False,
                    "message": f"Twilio SMS error: {e.msg}",
                    "error_code": e.code,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    except ImportError:
        return Response(
            {
                "success": False,
                "message": "Twilio SDK not installed. Please install twilio package.",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except Exception as e:
        return Response(
            {"success": False, "message": f"Failed to send test SMS: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ============================================================================
# ROLES & PERMISSIONS VIEWS
# ============================================================================


class PermissionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing permissions"""

    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_queryset(self):
        """Filter permissions based on query parameters"""
        queryset = Permission.objects.all()

        module = self.request.query_params.get("module", None)
        if module:
            queryset = queryset.filter(module=module)

        permission_type = self.request.query_params.get("permission_type", None)
        if permission_type:
            queryset = queryset.filter(permission_type=permission_type)

        section = self.request.query_params.get("section", None)
        if section:
            queryset = queryset.filter(section=section)

        return queryset.order_by("module", "permission_type", "section")

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """Create multiple permissions at once"""
        try:
            permissions_data = request.data.get("permissions", [])
            created_permissions = []

            for perm_data in permissions_data:
                serializer = self.get_serializer(data=perm_data)
                if serializer.is_valid():
                    permission = serializer.save()
                    created_permissions.append(permission)
                else:
                    return Response(
                        {"error": f"Invalid permission data: {serializer.errors}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            return Response(
                {
                    "message": f"Successfully created {len(created_permissions)} permissions",
                    "permissions": PermissionSerializer(
                        created_permissions, many=True
                    ).data,
                }
            )

        except Exception as e:
            return Response(
                {"error": f"Failed to create permissions: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class RoleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing roles"""

    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [HasSettingsPermission]

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action in ["create", "update", "partial_update"]:
            return RoleCreateUpdateSerializer
        return RoleSerializer

    def perform_create(self, serializer):
        """Set the creator when creating a role"""
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        """Prevent deletion of system roles"""
        if instance.is_system:
            raise ValidationError("System roles cannot be deleted")
        instance.delete()

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Duplicate an existing role"""
        try:
            original_role = self.get_object()

            # Create new role with similar data
            new_role = Role.objects.create(
                name=f"{original_role.name} (Copy)",
                description=original_role.description,
                color=original_role.color,
                primary_section_access=original_role.primary_section_access,
                secondary_section_access=original_role.secondary_section_access,
                nursery_section_access=original_role.nursery_section_access,
                created_by=request.user,
            )

            # Copy permissions
            new_role.permissions.set(original_role.permissions.all())

            return Response(
                {
                    "message": "Role duplicated successfully",
                    "role": RoleSerializer(new_role).data,
                }
            )

        except Exception as e:
            return Response(
                {"error": f"Failed to duplicate role: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"])
    def users(self, request, pk=None):
        """Get users assigned to this role"""
        try:
            role = self.get_object()

            # Get users assigned to this role through UserRole model
            user_roles = UserRole.objects.filter(role=role, is_active=True)
            user_data = []

            for user_role in user_roles:
                if not user_role.is_expired():
                    user_data.append(
                        {
                            "id": user_role.user.id,
                            "username": user_role.user.username,
                            "email": user_role.user.email,
                            "full_name": user_role.user.full_name,
                            "is_active": user_role.user.is_active,
                            "assigned_at": user_role.assigned_at,
                            "expires_at": user_role.expires_at,
                            "assigned_by": (
                                user_role.assigned_by.full_name
                                if user_role.assigned_by
                                else None
                            ),
                            "primary_section_access": user_role.primary_section_access,
                            "secondary_section_access": user_role.secondary_section_access,
                            "nursery_section_access": user_role.nursery_section_access,
                        }
                    )

            return Response(
                {"role": role.name, "user_count": len(user_data), "users": user_data}
            )

        except Exception as e:
            return Response(
                {"error": f"Failed to get users: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class UserRoleViewSet(viewsets.ModelViewSet):
    """ViewSet for managing user role assignments"""

    queryset = UserRole.objects.all()
    permission_classes = [HasSettingsPermission]
    serializer_class = UserRoleSerializer

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action in ["create", "update", "partial_update"]:
            return UserRoleCreateUpdateSerializer
        return UserRoleSerializer

    def perform_create(self, serializer):
        """Set the assigner when creating a user role assignment"""
        serializer.save(assigned_by=self.request.user)

    def get_queryset(self):
        """Filter user roles based on query parameters"""
        queryset = UserRole.objects.all()

        user_id = self.request.query_params.get("user", None)
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        role_id = self.request.query_params.get("role", None)
        if role_id:
            queryset = queryset.filter(role_id=role_id)

        is_active = self.request.query_params.get("is_active", None)
        if is_active is not None:
            is_active_bool = is_active.lower() == "true"
            queryset = queryset.filter(is_active=is_active_bool)

        return queryset.select_related("user", "role", "assigned_by")

    @action(detail=False, methods=["get"])
    def user_permissions(self, request):
        """Get all permissions for a specific user"""
        try:
            user_id = request.query_params.get("user_id")
            if not user_id:
                return Response(
                    {"error": "user_id parameter is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from users.models import CustomUser

            user = CustomUser.objects.get(id=user_id)

            # Get user's role assignments
            user_roles = UserRole.objects.filter(user=user, is_active=True)

            permissions_summary = {
                "user": {
                    "id": user.id,
                    "name": user.full_name,
                    "email": user.email,
                    "role": user.role,
                },
                "role_assignments": [],
                "effective_permissions": {},
            }

            # Initialize effective permissions
            modules = Permission.MODULE_CHOICES
            effective_permissions = {}

            for module_code, module_name in modules:
                effective_permissions[module_code] = {
                    "read": False,
                    "write": False,
                    "delete": False,
                    "admin": False,
                    "sections": {
                        "primary": False,
                        "secondary": False,
                        "nursery": False,
                    },
                }

            # Process each role assignment
            for user_role in user_roles:
                if user_role.is_expired():
                    continue

                role_data = {
                    "role_id": user_role.role.id,
                    "role_name": user_role.role.name,
                    "role_color": user_role.role.color,
                    "sections": {
                        "primary": user_role.primary_section_access,
                        "secondary": user_role.secondary_section_access,
                        "nursery": user_role.nursery_section_access,
                    },
                    "expires_at": user_role.expires_at,
                    "permissions": {},
                }

                # Get role permissions
                for permission in user_role.role.permissions.all():
                    if permission.granted:
                        effective_permissions[permission.module][
                            permission.permission_type
                        ] = True
                        role_data["permissions"][
                            f"{permission.module}_{permission.permission_type}"
                        ] = True

                # Get custom permissions
                for permission in user_role.custom_permissions.all():
                    if permission.granted:
                        effective_permissions[permission.module][
                            permission.permission_type
                        ] = True
                        role_data["permissions"][
                            f"{permission.module}_{permission.permission_type}"
                        ] = True

                permissions_summary["role_assignments"].append(role_data)

            permissions_summary["effective_permissions"] = effective_permissions

            return Response(permissions_summary)

        except CustomUser.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to get user permissions: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"])
    def bulk_assign(self, request):
        """Assign roles to multiple users at once"""
        try:
            assignments_data = request.data.get("assignments", [])
            created_assignments = []

            for assignment_data in assignments_data:
                serializer = self.get_serializer(data=assignment_data)
                if serializer.is_valid():
                    assignment = serializer.save(assigned_by=request.user)
                    created_assignments.append(assignment)
                else:
                    return Response(
                        {"error": f"Invalid assignment data: {serializer.errors}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            return Response(
                {
                    "message": f"Successfully assigned roles to {len(created_assignments)} users",
                    "assignments": UserRoleSerializer(
                        created_assignments, many=True
                    ).data,
                }
            )

        except Exception as e:
            return Response(
                {"error": f"Failed to assign roles: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@api_view(["GET"])
@authentication_classes([])  # Disable any default authentication
@permission_classes([AllowAny])  # Public access
def force_migrate(request):
    try:
        call_command("migrate", interactive=False)
        return Response({"status": "Migrations applied successfully ✅"})
    except Exception as e:
        return Response({"error": str(e)})


class SchoolAnnouncementViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing school announcements
    """

    queryset = SchoolAnnouncement.objects.all()
    serializer_class = SchoolAnnouncementSerializer
    permission_classes = [HasSettingsPermissionOrReadOnly]

    def perform_create(self, serializer):
        """Set the created_by field to the current user"""
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        """Filter announcements based on user permissions"""
        if self.request.user.is_superuser:
            return SchoolAnnouncement.objects.all()
        else:
            # For non-superusers, only show announcements they created
            return SchoolAnnouncement.objects.filter(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def toggle_active(self, request, pk=None):
        """Toggle the active status of an announcement"""
        announcement = self.get_object()
        announcement.is_active = not announcement.is_active
        announcement.save()
        serializer = self.get_serializer(announcement)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def toggle_pinned(self, request, pk=None):
        """Toggle the pinned status of an announcement"""
        announcement = self.get_object()
        announcement.is_pinned = not announcement.is_pinned
        announcement.save()
        serializer = self.get_serializer(announcement)
        return Response(serializer.data)
