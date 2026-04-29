# tenants/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from django.conf import settings
from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from django.core.cache import cache
import dns.resolver
import logging
import json as _json
import urllib.request
import urllib.error

import cloudinary.uploader

from .models import (
    Tenant, TenantService, ServicePricing, TenantSettings,
    TenantInvoice, TenantInvoiceLineItem, TenantPayment, TenantInvitation,
    TenantSetupToken
)
from .serializers import (
    TenantSerializer,
    TenantSettingsSerializer,
    DesignSettingsSerializer,
    TenantServiceSerializer,
    ServicePricingSerializer,
    AvailableServiceSerializer,
    TenantInvoiceSerializer,
    TenantInvoiceLineItemSerializer,
    TenantPaymentSerializer,
    TenantInvitationSerializer,
    SchoolRegistrationSerializer,
    ServiceToggleSerializer,
    CustomDomainSerializer,
    ManualPaymentSerializer,
    PaystackInitializeSerializer,
    PaystackVerifySerializer,
    SlugCheckSerializer,
    DomainCheckSerializer,
)

logger = logging.getLogger(__name__)


# ============ Custom Permissions ============

class IsTenantOwner(permissions.BasePermission):
    """Permission check for tenant owner (superadmin)."""

    ADMIN_ROLES = {"superadmin", "admin", "secondary_admin"}

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in self.ADMIN_ROLES


class IsTenantMember(permissions.BasePermission):
    """Permission check for tenant member."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return False
        # Check if user belongs to this tenant
        return getattr(request.user, 'school', None) == tenant or request.user.is_superuser


class IsPlatformAdmin(permissions.BasePermission):
    """Permission check for platform-level admin."""

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


class PlatformInfoView(APIView):
    """Platform landing page information (NO authentication required)"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(
            {
                "platform_name": getattr(
                    settings, "PLATFORM_NAME", "School Management Platform"
                ),
                "site_name": getattr(settings, "SITE_NAME", "School Platform"),
                "school_name": "School Management Platform",  # For your HeroSection
                "logo": None,  # Platform logo if you have one
                "allow_registration": True,
                "platform_mode": True,
            }
        )


# ============ School Registration ============

class SchoolRegistrationView(APIView):
    """Register a new school on the platform."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SchoolRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            result = serializer.save()
            tenant = result['tenant']
            admin_user = result['admin_user']
            username = result['username']
            setup_token = result['setup_token']

            # Build the subdomain setup URL for redirect
            # In development: http://bay-school.localhost:5173/setup?token=xxx
            # In production: https://bay-school.nuventacloud.com/setup?token=xxx
            frontend_port = getattr(settings, 'FRONTEND_PORT', '5173')
            is_development = getattr(settings, 'DEBUG', False)

            if is_development:
                # Development: use localhost with subdomain
                setup_url = f"http://{tenant.slug}.localhost:{frontend_port}/setup?token={setup_token}"
            else:
                # Production: use actual domain
                platform_domain = getattr(
                    settings, "PLATFORM_DOMAIN", "nuventacloud.com"
                )
                setup_url = f"https://{tenant.slug}.{platform_domain}/setup?token={setup_token}"

            return Response({
                'message': 'School registered successfully',
                'tenant': TenantSerializer(tenant).data,
                'subdomain': tenant.subdomain_url,
                'setup_url': setup_url,
                'setup_token': setup_token,
                'admin_credentials': {
                    'username': username,
                    'email': admin_user.email,
                },
                'user': {
                    'id': admin_user.id,
                    'email': admin_user.email,
                    'first_name': admin_user.first_name,
                    'last_name': admin_user.last_name,
                    'role': admin_user.role,
                }
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CheckSlugView(APIView):
    """Check if a slug is available."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SlugCheckSerializer(data=request.data)
        if serializer.is_valid():
            slug = serializer.validated_data['slug']
            exists = Tenant.objects.filter(slug=slug).exists()
            return Response({
                'slug': slug,
                'available': not exists,
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CheckDomainView(APIView):
    """Check if a custom domain is available."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DomainCheckSerializer(data=request.data)
        if serializer.is_valid():
            domain = serializer.validated_data['domain'].lower()
            exists = Tenant.objects.filter(custom_domain=domain).exists()
            return Response({
                'domain': domain,
                'available': not exists,
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PublicTenantView(APIView):
    """
    Get public tenant information by slug.
    Used for subdomain login pages to display school branding.
    No authentication required.
    """
    permission_classes = [AllowAny]

    def get(self, request, slug):
        try:
            tenant = Tenant.objects.select_related("settings").get(slug=slug)
        except Tenant.DoesNotExist:
            return Response(
                {"error": "School not found"}, status=status.HTTP_404_NOT_FOUND
            )

        settings_obj = getattr(tenant, 'settings', None)
        settings_data = None

        if settings_obj:
            # Handle both CloudinaryField objects and plain string URLs
            def safe_url(field):
                if not field:
                    return None
                return str(
                    field
                )  # str() works on both CloudinaryField and plain strings

            settings_data = {
                "logo": safe_url(settings_obj.logo),
                "favicon": safe_url(settings_obj.favicon),
                "primary_color": settings_obj.primary_color,
                "secondary_color": settings_obj.secondary_color,
                "school_motto": settings_obj.school_motto,
                "student_portal_enabled": settings_obj.student_portal_enabled,
                "teacher_portal_enabled": settings_obj.teacher_portal_enabled,
                "parent_portal_enabled": settings_obj.parent_portal_enabled,
            }

        return Response({
            'tenant': {
                'id': str(tenant.id),
                'name': tenant.name,
                'slug': tenant.slug,
                'status': tenant.status,
                'is_active': tenant.is_active,
                'subdomain_url': tenant.subdomain_url,
            },
            'settings': settings_data,
        })


class SetupTokenExchangeView(APIView):
    """
    Exchange a one-time setup token for JWT authentication.

    In production (HTTPS): Tokens set in httpOnly cookies for XSS protection
    In development (HTTP): Tokens also returned in body for cross-origin support
    """
    # Explicitly disable authentication - this endpoint uses its own token validation
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        from authentication.cookie_auth import set_auth_cookies

        token = request.data.get('token')
        if not token:
            return Response(
                {'error': 'Setup token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            setup_token = TenantSetupToken.objects.get(token=token)
        except TenantSetupToken.DoesNotExist:
            return Response(
                {'error': 'Invalid setup token'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate the token
        if not setup_token.is_valid:
            if setup_token.is_used:
                return Response(
                    {'error': 'Setup token has already been used'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if setup_token.is_expired:
                return Response(
                    {'error': 'Setup token has expired'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Mark the token as used
        setup_token.use()

        # Get the user and tenant
        user = setup_token.user
        tenant = setup_token.tenant

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token

        # Add custom claims to access token
        access_token['id'] = user.id
        access_token['email'] = user.email
        access_token['role'] = user.role
        access_token['is_staff'] = user.is_staff
        access_token['tenant_id'] = str(tenant.id)

        # Build response data
        response_data = {
            'message': 'Authentication successful',
            'user': {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'role': user.role,
                'is_superuser': user.is_superuser,
                'is_staff': user.is_staff,
                'is_active': user.is_active,
            },
            'tenant': TenantSerializer(tenant).data,
        }

        # In development, also include tokens in body for cross-origin HTTP support
        if getattr(settings, 'AUTH_RETURN_TOKENS_IN_BODY', False):
            response_data['tokens'] = {
                'access': str(access_token),
                'refresh': str(refresh),
            }

        response = Response(response_data)

        # Set tokens in httpOnly cookies (works in production with HTTPS)
        set_auth_cookies(response, str(access_token), str(refresh))

        logger.info(f"Setup token exchanged for user {user.email}, tenant {tenant.slug}")
        return response


# ============ Tenant Management ============

class TenantViewSet(viewsets.ModelViewSet):
    """ViewSet for managing tenants."""
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'is_active']
    search_fields = ['name', 'slug', 'owner_email']
    ordering_fields = ['name', 'created_at', 'status']
    ordering = ['-created_at']

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate a tenant."""
        tenant = self.get_object()
        if tenant.status == 'active':
            return Response({'error': 'Tenant is already active'}, status=400)

        tenant.status = 'active'
        tenant.is_active = True
        tenant.activated_at = timezone.now()
        tenant.save()

        return Response({
            'message': 'Tenant activated successfully',
            'tenant': TenantSerializer(tenant).data
        })

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Suspend a tenant."""
        tenant = self.get_object()
        reason = request.data.get('reason', '')

        tenant.status = 'suspended'
        tenant.is_active = False
        tenant.save()

        return Response({
            'message': 'Tenant suspended',
            'reason': reason,
            'tenant': TenantSerializer(tenant).data
        })

    @action(detail=True, methods=['get'])
    def dashboard_stats(self, request, pk=None):
        """Get dashboard statistics for a tenant."""
        tenant = self.get_object()

        # Get student count (will need to update when models have tenant FK)
        # student_count = Student.objects.filter(school=tenant).count()

        # Get invoice stats
        invoices = TenantInvoice.objects.filter(tenant=tenant)
        total_invoiced = invoices.aggregate(total=Sum('total_amount'))['total'] or 0
        total_paid = invoices.aggregate(total=Sum('amount_paid'))['total'] or 0
        total_outstanding = total_invoiced - total_paid

        # Get enabled services
        enabled_services = tenant.services.filter(is_enabled=True).count()

        return Response({
            'student_count': 0,  # Placeholder until models updated
            'enabled_services': enabled_services,
            'total_invoiced': float(total_invoiced),
            'total_paid': float(total_paid),
            'total_outstanding': float(total_outstanding),
            'status': tenant.status,
        })


class CurrentTenantView(APIView):
    """Get the current tenant from request context."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=404)

        try:
            settings_data = TenantSettingsSerializer(tenant.settings).data
        except Exception:
            settings_data = None
        return Response(
            {"tenant": TenantSerializer(tenant).data, "settings": settings_data}
        )


# ============ Service Management ============

class ServiceManagementViewSet(viewsets.ViewSet):
    """Manage services for a tenant."""
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """
        Instantiates and returns the list of permissions that this view requires.
        List action only requires authentication, toggle requires owner permission.
        """
        if self.action == 'toggle':
            return [IsAuthenticated(), IsTenantOwner()]
        return [IsAuthenticated()]

    def list(self, request):
        """Get available services and their status for current tenant."""
        logger.info(f"ServiceManagementViewSet.list called by user: {request.user}, tenant: {getattr(request, 'tenant', None)}")
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            logger.warning(f"No tenant context for user {request.user}")
            return Response({'error': 'No tenant context'}, status=400)

        enabled_services = set(
            tenant.services.filter(is_enabled=True).values_list('service', flat=True)
        )

        # Get pricing for all services
        pricing = {p.service: p for p in ServicePricing.objects.filter(is_active=True)}

        services = []
        for service_code, service_name in TenantService.SERVICE_CHOICES:
            service_pricing = pricing.get(service_code)
            is_default = service_code in TenantService.DEFAULT_SERVICES

            services.append({
                'service': service_code,
                'name': service_name,
                'description': service_pricing.description if service_pricing else '',
                'price_per_student': float(service_pricing.price_per_student) if service_pricing else 0,
                'is_default': is_default,
                'is_enabled': service_code in enabled_services,
                'category': self._get_service_category(service_code),
            })

        return Response(services)

    def _get_service_category(self, service_code):
        """Get the category for a service."""
        categories = {
            'exams': 'core',
            'results': 'core',
            'attendance': 'attendance',
            'arrival_notification': 'attendance',
            'exam_proofreading': 'assessment',
            'ai_question_generator': 'assessment',
            'question_bank': 'assessment',
            'exam_builder': 'assessment',
            'sms_notifications': 'communication',
            'fees': 'finance',
            'timetable': 'scheduling',
        }
        return categories.get(service_code, 'other')

    @action(detail=False, methods=['post'])
    def toggle(self, request):
        """Enable or disable a service."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        serializer = ServiceToggleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        service_code = serializer.validated_data['service']
        enable = serializer.validated_data['enable']

        # Check if service is a default (cannot disable)
        if not enable and service_code in TenantService.DEFAULT_SERVICES:
            return Response({
                'error': 'Cannot disable default services (Exams, Results)'
            }, status=400)

        # Update or create service record
        tenant_service, created = TenantService.objects.update_or_create(
            tenant=tenant,
            service=service_code,
            defaults={
                'is_enabled': enable,
                'enabled_at': timezone.now() if enable else None,
                'disabled_at': None if enable else timezone.now(),
            }
        )

        # Recalculate current invoice if exists
        self._recalculate_current_invoice(tenant)

        return Response({
            'success': True,
            'service': service_code,
            'is_enabled': enable,
            'message': f"Service {'enabled' if enable else 'disabled'} successfully"
        })

    def _recalculate_current_invoice(self, tenant):
        """Recalculate the current pending/draft invoice."""
        current_invoice = TenantInvoice.objects.filter(
            tenant=tenant,
            status__in=['draft', 'pending']
        ).first()

        if current_invoice:
            current_invoice.recalculate_totals()


class ServicePricingViewSet(viewsets.ReadOnlyModelViewSet):
    """View service pricing (read-only for tenants)."""
    queryset = ServicePricing.objects.filter(is_active=True)
    serializer_class = ServicePricingSerializer
    permission_classes = [AllowAny]

    def list(self, request):
        """Get all active service pricing."""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


# ============ Vercel domain helpers ============

logger_vercel = logging.getLogger(__name__)

def _vercel_request(method: str, path: str, body: dict | None = None) -> bool:
    """Make an authenticated request to the Vercel API. Returns True on success."""
    token = getattr(settings, 'VERCEL_API_TOKEN', '')
    if not token:
        logger_vercel.warning("VERCEL_API_TOKEN not set — skipping Vercel domain sync")
        return False
    try:
        data = _json.dumps(body).encode() if body else None
        req = urllib.request.Request(
            f"https://api.vercel.com{path}",
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method=method,
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger_vercel.info("Vercel API %s %s → %s", method, path, resp.status)
        return True
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")
        logger_vercel.error("Vercel API %s %s → HTTP %s: %s", method, path, e.code, body_text)
        return False
    except Exception as e:
        logger_vercel.error("Vercel API %s %s → %s", method, path, e)
        return False


def _register_vercel_domain(domain: str) -> None:
    """Add apex + www domain to the Vercel project after successful verification."""
    project_id = getattr(settings, 'VERCEL_PROJECT_ID', '')
    if not project_id:
        logger_vercel.warning("VERCEL_PROJECT_ID not set — skipping domain registration")
        return
    for d in [domain, f"www.{domain}"]:
        _vercel_request("POST", f"/v10/projects/{project_id}/domains", {"name": d})


def _remove_vercel_domain(domain: str) -> None:
    """Remove apex + www domain from the Vercel project when a tenant removes theirs."""
    project_id = getattr(settings, 'VERCEL_PROJECT_ID', '')
    if not project_id:
        return
    for d in [domain, f"www.{domain}"]:
        _vercel_request("DELETE", f"/v9/projects/{project_id}/domains/{d}")


# ============ Domain Management ============

class DomainManagementViewSet(viewsets.ViewSet):
    """Manage custom domain for tenant."""
    permission_classes = [IsAuthenticated, IsTenantOwner]

    @action(detail=False, methods=["get", "patch"])
    def current(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        settings_obj, created = TenantSettings.objects.get_or_create(tenant=tenant)

        if request.method == "PATCH":
            serializer = self.get_serializer(
                settings_obj, data=request.data, partial=True
            )
            if serializer.is_valid():
                serializer.save()
                cache.delete(f"tenant_settings_{tenant.id}")
                return Response(serializer.data)
            return Response(serializer.errors, status=400)

        # GET — return both domain info and settings
        return Response(
            {
                "subdomain": tenant.slug,
                "subdomain_url": tenant.subdomain_url,
                "custom_domain": tenant.custom_domain,
                "custom_domain_verified": tenant.custom_domain_verified,
                "verification_token": (
                    tenant.domain_verification_token
                    if not tenant.custom_domain_verified
                    else None
                ),
                "settings": TenantSettingsSerializer(settings_obj).data,
            }
        )

    @action(detail=False, methods=['post'])
    def set_custom_domain(self, request):
        """Set custom domain (requires DNS verification)."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        serializer = CustomDomainSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        domain = serializer.validated_data['domain']

        # Check if domain is already taken
        if Tenant.objects.filter(custom_domain=domain).exclude(id=tenant.id).exists():
            return Response({'error': 'Domain is already in use'}, status=400)

        # Generate verification token
        import secrets
        verification_token = secrets.token_urlsafe(32)

        tenant.custom_domain = domain
        tenant.custom_domain_verified = False
        tenant.domain_verification_token = verification_token
        tenant.save()

        platform_domain = getattr(settings, "PLATFORM_DOMAIN", "nuventacloud.com")
        platform_ip = getattr(settings, 'PLATFORM_IP', '0.0.0.0')

        return Response({
            'domain': domain,
            'verification_token': verification_token,
            'instructions': {
                'step1': f"Add a TXT record: _nuventacloud-verify.{domain} with value: {verification_token}",
                'step2': f"Add a CNAME record: www.{domain} pointing to: proxy.{platform_domain}",
                'step3': f"Add an A record: {domain} pointing to: {platform_ip}",
            },
            'message': 'Domain set. Please configure DNS records and verify.'
        })

    @action(detail=False, methods=['post'])
    def verify_domain(self, request):
        """Verify custom domain via DNS TXT record."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        if not tenant.custom_domain:
            return Response({'error': 'No custom domain configured'}, status=400)

        if tenant.custom_domain_verified:
            return Response({'message': 'Domain already verified'})

        # Check DNS TXT record using public resolvers for reliable propagation
        try:
            txt_record_name = f"_nuventacloud-verify.{tenant.custom_domain}"
            resolver = dns.resolver.Resolver()
            resolver.nameservers = ['8.8.8.8', '1.1.1.1', '8.8.4.4']
            resolver.timeout = 5
            resolver.lifetime = 10
            answers = resolver.resolve(txt_record_name, 'TXT')

            for rdata in answers:
                txt_value = rdata.to_text().strip('"')
                if txt_value == tenant.domain_verification_token:
                    tenant.custom_domain_verified = True
                    tenant.save()
                    # Auto-register on Vercel so the frontend serves this domain
                    _register_vercel_domain(tenant.custom_domain)
                    return Response({
                        'verified': True,
                        'message': 'Domain verified successfully!',
                        'domain': tenant.custom_domain,
                    })

            return Response({
                'verified': False,
                'error': 'Verification token not found in DNS records',
            }, status=400)

        except dns.resolver.NXDOMAIN:
            return Response({
                'verified': False,
                'error': f'DNS record not found. Please add TXT record for _nuventacloud-verify.{tenant.custom_domain}'
            }, status=400)
        except dns.resolver.NoAnswer:
            return Response({
                'verified': False,
                'error': 'No TXT records found for verification domain'
            }, status=400)
        except Exception as e:
            logger.error(f"DNS verification error: {str(e)}")
            return Response({
                'verified': False,
                'error': 'DNS lookup failed. Please try again later.'
            }, status=500)

    @action(detail=False, methods=['post'])
    def remove_custom_domain(self, request):
        """Remove custom domain."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        # Remove from Vercel before clearing the DB record
        if tenant.custom_domain and tenant.custom_domain_verified:
            _remove_vercel_domain(tenant.custom_domain)

        tenant.custom_domain = None
        tenant.custom_domain_verified = False
        tenant.domain_verification_token = None
        tenant.save()

        return Response({
            'message': 'Custom domain removed',
            'subdomain_url': tenant.subdomain_url,
        })


# ============ Tenant Settings ============

class TenantSettingsViewSet(viewsets.ModelViewSet):
    """ViewSet for managing tenant settings."""
    serializer_class = TenantSettingsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return TenantSettings.objects.filter(tenant=tenant)
        return TenantSettings.objects.none()

    def get_permissions(self):
        """
        GET (read) — any authenticated tenant member can read settings.
        PATCH/POST/PUT/DELETE — only tenant owners can modify.
        """
        if self.request.method in ("PATCH", "POST", "PUT", "DELETE"):
            return [IsAuthenticated(), IsTenantOwner()]
        return [IsAuthenticated()]

    def get_object(self):
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)
        return get_object_or_404(TenantSettings, tenant=tenant)

    @action(detail=False, methods=["post"], url_path="upload-logo")
    def upload_logo(self, request):
        """POST /api/tenants/settings/upload-logo/ - Upload school logo"""
        if "logo" not in request.FILES:
            return Response(
                {"error": "No logo file provided"}, status=status.HTTP_400_BAD_REQUEST
            )

        logo_file = request.FILES["logo"]

        # Validate file size (2MB max)
        if logo_file.size > 2 * 1024 * 1024:
            return Response(
                {"error": "Logo file size must be less than 2MB"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"]
        if logo_file.content_type not in allowed_types:
            return Response(
                {"error": "Invalid file type. Allowed: JPG, PNG, SVG, WEBP"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Try to get tenant from request (middleware)
            tenant = getattr(request, "tenant", None)

            # Fallback: Get tenant from user's association
            if not tenant and request.user.is_authenticated:
                tenant = getattr(request.user, "tenant", None)

                if not tenant:
                    from tenants.models import TenantUser

                    tenant_user = TenantUser.objects.filter(user=request.user).first()
                    if tenant_user:
                        tenant = tenant_user.tenant

            if not tenant:
                return Response(
                    {
                        "error": "No tenant context found. Please ensure you are logged in to a school."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Use tenant_settings instead of settings to avoid naming conflict
            tenant_settings, created = TenantSettings.objects.get_or_create(
                tenant=tenant
            )

            # Check if Cloudinary is configured (using django_settings)
            if not all(
                [
                    django_settings.CLOUDINARY_CLOUD_NAME,
                    django_settings.CLOUDINARY_API_KEY,
                    django_settings.CLOUDINARY_API_SECRET,
                ]
            ):
                return Response(
                    {"error": "Cloudinary is not configured"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Upload to Cloudinary
            upload_result = cloudinary.uploader.upload(
                logo_file,
                folder=f"school_logos/{tenant.slug}",
                public_id=f"logo_{tenant.slug}",
                overwrite=True,
                resource_type="image",
                transformation=[
                    {"width": 500, "height": 500, "crop": "limit"},
                    {"quality": "auto"},
                    {"fetch_format": "auto"},
                ],
            )

            # Save Cloudinary URL to tenant_settings
            logo_url = upload_result["secure_url"]
            tenant_settings.logo = logo_url
            tenant_settings.save()

            return Response(
                {"logoUrl": logo_url, "message": "Logo uploaded successfully"},
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            import traceback

            traceback.print_exc()
            return Response(
                {"error": f"Upload failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="upload-favicon")
    def upload_favicon(self, request):
        """POST /api/tenants/settings/upload-favicon/ - Upload school favicon"""
        if "favicon" not in request.FILES:
            return Response(
                {"error": "No favicon file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        favicon_file = request.FILES["favicon"]

        # Validate file size (1MB max)
        if favicon_file.size > 1 * 1024 * 1024:
            return Response(
                {"error": "Favicon file size must be less than 1MB"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file type
        allowed_types = [
            "image/x-icon",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/vnd.microsoft.icon",
        ]
        if favicon_file.content_type not in allowed_types:
            return Response(
                {"error": "Invalid file type. Allowed: ICO, PNG, JPG, WEBP"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Try to get tenant from request (middleware)
            tenant = getattr(request, "tenant", None)

            # Fallback: Get tenant from user's association
            if not tenant and request.user.is_authenticated:
                tenant = getattr(request.user, "tenant", None)

                if not tenant:
                    from tenants.models import TenantUser

                    tenant_user = TenantUser.objects.filter(user=request.user).first()
                    if tenant_user:
                        tenant = tenant_user.tenant

            if not tenant:
                return Response(
                    {
                        "error": "No tenant context found. Please ensure you are logged in to a school."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Use tenant_settings instead of settings to avoid naming conflict
            tenant_settings, created = TenantSettings.objects.get_or_create(
                tenant=tenant
            )

            # Check if Cloudinary is configured (using django_settings)
            if not all(
                [
                    django_settings.CLOUDINARY_CLOUD_NAME,
                    django_settings.CLOUDINARY_API_KEY,
                    django_settings.CLOUDINARY_API_SECRET,
                ]
            ):
                return Response(
                    {"error": "Cloudinary is not configured"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Upload to Cloudinary
            upload_result = cloudinary.uploader.upload(
                favicon_file,
                folder=f"school_favicons/{tenant.slug}",
                public_id=f"favicon_{tenant.slug}",
                overwrite=True,
                resource_type="image",
                transformation=[
                    {"width": 64, "height": 64, "crop": "limit"},
                    {"quality": "auto"},
                    {"fetch_format": "auto"},
                ],
            )

            # Save Cloudinary URL to tenant_settings
            favicon_url = upload_result["secure_url"]
            tenant_settings.favicon = favicon_url
            tenant_settings.save()

            return Response(
                {"faviconUrl": favicon_url, "message": "Favicon uploaded successfully"},
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            import traceback

            traceback.print_exc()
            return Response(
                {"error": f"Upload failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="upload-hero-image")
    def upload_hero_image(self, request):
        """POST /api/tenants/settings/upload-hero-image/ - Upload landing page hero image"""
        if "image" not in request.FILES:
            return Response({"error": "No image file provided"}, status=status.HTTP_400_BAD_REQUEST)

        image_file = request.FILES["image"]

        if image_file.size > 5 * 1024 * 1024:
            return Response({"error": "Image must be less than 5MB"}, status=status.HTTP_400_BAD_REQUEST)

        allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
        if image_file.content_type not in allowed_types:
            return Response({"error": "Invalid file type. Allowed: JPG, PNG, WEBP, GIF"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tenant = getattr(request, "tenant", None)
            if not tenant and request.user.is_authenticated:
                tenant = getattr(request.user, "tenant", None)

            if not tenant:
                return Response({"error": "No tenant context found."}, status=status.HTTP_400_BAD_REQUEST)

            upload_result = cloudinary.uploader.upload(
                image_file,
                folder=f"tenants/{tenant.slug}/landing",
                public_id=f"hero_{tenant.slug}",
                overwrite=True,
                resource_type="image",
                transformation=[
                    {"width": 1920, "height": 1080, "crop": "limit"},
                    {"quality": "auto"},
                    {"fetch_format": "auto"},
                ],
            )

            hero_url = upload_result["secure_url"]

            from schoolSettings.models import TenantLandingPage
            landing, _ = TenantLandingPage.objects.get_or_create(tenant=tenant)
            landing.hero_image = hero_url
            landing.save(update_fields=["hero_image"])

            return Response({"url": hero_url, "message": "Hero image uploaded successfully"}, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": f"Upload failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get', 'patch'])
    def current(self, request):
        """Get or update current tenant settings."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            logger.error("TenantSettings.current: No tenant context found")
            return Response({'error': 'No tenant context'}, status=400)

        settings_obj, created = TenantSettings.objects.get_or_create(tenant=tenant)
        logger.info(f"TenantSettings.current: tenant={tenant.slug}, created={created}")

        if request.method == 'PATCH':
            serializer = TenantSettingsSerializer(
                settings_obj, data=request.data, partial=True
            )
            if serializer.is_valid():
                serializer.save()
                cache.delete(f"tenant_settings_{tenant.id}")
                return Response(TenantSettingsSerializer(settings_obj).data)

            logger.error(f"TenantSettings PATCH validation errors: {serializer.errors}")
            return Response(serializer.errors, status=400)

        logger.info(f"TenantSettings GET: Returning settings for {tenant.slug}")
        return Response(TenantSettingsSerializer(settings_obj).data)


# ============ Invoice Management ============

class TenantInvoiceViewSet(viewsets.ModelViewSet):
    """ViewSet for managing tenant invoices."""
    serializer_class = TenantInvoiceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'billing_period']
    search_fields = ['invoice_number']
    ordering_fields = ['issue_date', 'due_date', 'total_amount']
    ordering = ['-issue_date']

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return TenantInvoice.objects.filter(tenant=tenant)
        # Platform admins can see all
        if self.request.user.is_superuser:
            return TenantInvoice.objects.all()
        return TenantInvoice.objects.none()

    @action(detail=False, methods=['get'])
    def current(self, request):
        """Get current active invoice."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        invoice = TenantInvoice.objects.filter(
            tenant=tenant,
            status__in=['draft', 'pending', 'partially_paid']
        ).first()

        if not invoice:
            return Response({'message': 'No active invoice'}, status=404)

        return Response(TenantInvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """Recalculate invoice totals."""
        invoice = self.get_object()

        if invoice.status in ['paid', 'cancelled']:
            return Response({
                'error': 'Cannot recalculate paid or cancelled invoices'
            }, status=400)

        invoice.recalculate_totals()
        return Response({
            'message': 'Invoice recalculated',
            'invoice': TenantInvoiceSerializer(invoice).data
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get invoice summary for tenant."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        invoices = TenantInvoice.objects.filter(tenant=tenant)

        summary = invoices.aggregate(
            total_invoiced=Sum('total_amount'),
            total_paid=Sum('amount_paid'),
        )

        total_invoiced = summary['total_invoiced'] or 0
        total_paid = summary['total_paid'] or 0

        return Response({
            'total_invoices': invoices.count(),
            'total_invoiced': float(total_invoiced),
            'total_paid': float(total_paid),
            'total_outstanding': float(total_invoiced - total_paid),
            'pending_count': invoices.filter(status='pending').count(),
            'overdue_count': invoices.filter(status='overdue').count(),
        })


# ============ Payment Management ============

class TenantPaymentViewSet(viewsets.ModelViewSet):
    """ViewSet for managing tenant payments."""
    serializer_class = TenantPaymentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'payment_method']
    search_fields = ['reference', 'paystack_reference']
    ordering = ['-created_at']

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return TenantPayment.objects.filter(invoice__tenant=tenant)
        if self.request.user.is_superuser:
            return TenantPayment.objects.all()
        return TenantPayment.objects.none()

    @action(detail=False, methods=['post'])
    def record_manual(self, request):
        """Record a manual payment (bank transfer)."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        invoice_id = request.data.get('invoice_id')
        if not invoice_id:
            return Response({'error': 'invoice_id is required'}, status=400)

        try:
            invoice = TenantInvoice.objects.get(id=invoice_id, tenant=tenant)
        except TenantInvoice.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=404)

        serializer = ManualPaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        # Create pending payment
        payment = TenantPayment.objects.create(
            invoice=invoice,
            amount=serializer.validated_data['amount'],
            payment_method='manual',
            status='pending',
            bank_name=serializer.validated_data.get('bank_name', ''),
            account_name=serializer.validated_data.get('account_name', ''),
            payment_proof=serializer.validated_data.get('payment_proof', ''),
            confirmation_notes=serializer.validated_data.get('notes', ''),
        )

        return Response({
            'message': 'Payment recorded and pending confirmation',
            'payment': TenantPaymentSerializer(payment).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def initialize_paystack(self, request):
        """Initialize Paystack payment."""
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({'error': 'No tenant context'}, status=400)

        serializer = PaystackInitializeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        invoice_id = serializer.validated_data['invoice_id']
        callback_url = serializer.validated_data.get('callback_url')

        try:
            invoice = TenantInvoice.objects.get(id=invoice_id, tenant=tenant)
        except TenantInvoice.DoesNotExist:
            return Response({'error': 'Invoice not found'}, status=404)

        if invoice.balance_due <= 0:
            return Response({'error': 'Invoice already paid'}, status=400)

        # Initialize Paystack payment
        import requests
        import secrets

        paystack_secret = getattr(settings, 'PAYSTACK_SECRET_KEY', '')
        reference = f"TNT-{tenant.slug}-{secrets.token_hex(8).upper()}"

        # Create pending payment record
        payment = TenantPayment.objects.create(
            invoice=invoice,
            amount=invoice.balance_due,
            payment_method='paystack',
            status='pending',
            reference=reference,
        )

        # Call Paystack API
        try:
            response = requests.post(
                'https://api.paystack.co/transaction/initialize',
                headers={
                    'Authorization': f'Bearer {paystack_secret}',
                    'Content-Type': 'application/json'
                },
                json={
                    'email': tenant.owner_email,
                    'amount': int(invoice.balance_due * 100),  # Paystack uses kobo
                    'reference': reference,
                    'callback_url': callback_url,
                    'metadata': {
                        'tenant_id': str(tenant.id),
                        'invoice_id': str(invoice.id),
                        'payment_id': str(payment.id),
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                if data['status']:
                    return Response({
                        'message': 'Payment initialized',
                        'authorization_url': data['data']['authorization_url'],
                        'access_code': data['data']['access_code'],
                        'reference': reference,
                    })

            payment.status = 'failed'
            payment.save()
            return Response({'error': 'Failed to initialize payment'}, status=500)

        except Exception as e:
            logger.error(f"Paystack initialization error: {str(e)}")
            payment.status = 'failed'
            payment.save()
            return Response({'error': 'Payment gateway error'}, status=500)

    @action(detail=False, methods=['post'])
    def verify_paystack(self, request):
        """Verify Paystack payment."""
        serializer = PaystackVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        reference = serializer.validated_data['reference']

        try:
            payment = TenantPayment.objects.get(reference=reference)
        except TenantPayment.DoesNotExist:
            return Response({'error': 'Payment not found'}, status=404)

        if payment.status == 'confirmed':
            return Response({
                'message': 'Payment already verified',
                'payment': TenantPaymentSerializer(payment).data
            })

        # Verify with Paystack
        import requests

        paystack_secret = getattr(settings, 'PAYSTACK_SECRET_KEY', '')

        try:
            response = requests.get(
                f'https://api.paystack.co/transaction/verify/{reference}',
                headers={'Authorization': f'Bearer {paystack_secret}'}
            )

            if response.status_code == 200:
                data = response.json()
                if data['status'] and data['data']['status'] == 'success':
                    payment.status = 'confirmed'
                    payment.paystack_reference = data['data']['reference']
                    payment.paystack_transaction_id = str(data['data']['id'])
                    payment.confirmed_at = timezone.now()
                    payment.save()

                    # Update invoice
                    payment.invoice.record_payment(payment.amount)

                    return Response({
                        'message': 'Payment verified successfully',
                        'payment': TenantPaymentSerializer(payment).data
                    })
                else:
                    payment.status = 'failed'
                    payment.save()
                    return Response({'error': 'Payment was not successful'}, status=400)

            return Response({'error': 'Verification failed'}, status=500)

        except Exception as e:
            logger.error(f"Paystack verification error: {str(e)}")
            return Response({'error': 'Verification error'}, status=500)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm a manual payment (admin only)."""
        if not request.user.is_superuser:
            return Response({'error': 'Permission denied'}, status=403)

        payment = self.get_object()

        if payment.status == 'confirmed':
            return Response({'error': 'Payment already confirmed'}, status=400)

        payment.status = 'confirmed'
        payment.confirmed_by = request.user
        payment.confirmed_at = timezone.now()
        payment.confirmation_notes = request.data.get('notes', payment.confirmation_notes)
        payment.save()

        # Update invoice
        payment.invoice.record_payment(payment.amount)

        return Response({
            'message': 'Payment confirmed',
            'payment': TenantPaymentSerializer(payment).data
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a manual payment (admin only)."""
        if not request.user.is_superuser:
            return Response({'error': 'Permission denied'}, status=403)

        payment = self.get_object()

        if payment.status != 'pending':
            return Response({'error': 'Can only reject pending payments'}, status=400)

        payment.status = 'failed'
        payment.confirmation_notes = request.data.get('reason', 'Payment rejected')
        payment.save()

        return Response({
            'message': 'Payment rejected',
            'payment': TenantPaymentSerializer(payment).data
        })


# ============ Tenant Invitation ============

class TenantInvitationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing tenant invitations."""
    serializer_class = TenantInvitationSerializer
    permission_classes = [IsAuthenticated, IsTenantOwner]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'role']
    search_fields = ['email']
    ordering = ['-created_at']

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return TenantInvitation.objects.filter(tenant=tenant)
        return TenantInvitation.objects.none()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(tenant=tenant, invited_by=self.request.user)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def accept(self, request):
        """Accept an invitation."""
        token = request.data.get('token')
        if not token:
            return Response({'error': 'Token is required'}, status=400)

        try:
            invitation = TenantInvitation.objects.get(token=token)
        except TenantInvitation.DoesNotExist:
            return Response({'error': 'Invalid invitation'}, status=404)

        if not invitation.is_valid:
            if invitation.is_expired:
                return Response({'error': 'Invitation has expired'}, status=400)
            return Response({'error': 'Invitation is no longer valid'}, status=400)

        # Return invitation details for registration
        return Response({
            'invitation': TenantInvitationSerializer(invitation).data,
            'message': 'Please complete registration'
        })

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        """Resend invitation email."""
        invitation = self.get_object()

        if invitation.status != 'pending':
            return Response({'error': 'Can only resend pending invitations'}, status=400)

        # Regenerate token and extend expiry
        invitation.regenerate_token()

        # Send email with new invitation link
        from utils.email import send_email_via_brevo

        # Build invitation URL
        frontend_port = getattr(settings, 'FRONTEND_PORT', '5173')
        is_development = getattr(settings, 'DEBUG', False)
        tenant = invitation.tenant

        if is_development:
            # Development: use localhost with subdomain
            invitation_url = f"http://{tenant.slug}.localhost:{frontend_port}/accept-invitation?token={invitation.token}"
        else:
            # Production: use actual domain
            platform_domain = getattr(settings, "PLATFORM_DOMAIN", "nuventacloud.com")
            invitation_url = f"https://{tenant.slug}.{platform_domain}/accept-invitation?token={invitation.token}"

        # Create email content
        subject = f"Invitation to join {tenant.name} - Reminder"
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">You're Invited to Join {tenant.name}</h2>
                    <p>Hello,</p>
                    <p>This is a reminder that you have been invited to join <strong>{tenant.name}</strong> as a <strong>{invitation.get_role_display()}</strong>.</p>
                    <p>This invitation was sent by {invitation.invited_by.get_full_name() if invitation.invited_by else 'the school administrator'}.</p>
                    <div style="margin: 30px 0;">
                        <a href="{invitation_url}"
                           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Accept Invitation
                        </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">
                        Or copy and paste this link into your browser:<br>
                        <a href="{invitation_url}" style="color: #2563eb;">{invitation_url}</a>
                    </p>
                    <p style="color: #666; font-size: 14px;">
                        This invitation will expire on {invitation.expires_at.strftime('%B %d, %Y at %I:%M %p')}.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                    <p style="color: #999; font-size: 12px;">
                        If you didn't expect this invitation, you can safely ignore this email.
                    </p>
                </div>
            </body>
        </html>
        """

        # Send the email
        try:
            status_code, response_text = send_email_via_brevo(
                subject=subject,
                html_content=html_content,
                to_email=invitation.email
            )

            if status_code in [200, 201]:
                logger.info(f"Invitation resent to {invitation.email} for tenant {tenant.slug}")
                return Response({
                    'message': 'Invitation resent successfully',
                    'invitation': TenantInvitationSerializer(invitation).data
                })
            else:
                logger.warning(f"Email sending returned status {status_code}: {response_text}")
                # Still return success since invitation was regenerated
                return Response({
                    'message': 'Invitation regenerated, but email delivery may have failed',
                    'invitation': TenantInvitationSerializer(invitation).data,
                    'email_status': 'warning'
                })

        except Exception as e:
            logger.error(f"Failed to send invitation email: {str(e)}")
            # Still return success since invitation was regenerated
            return Response({
                'message': 'Invitation regenerated, but email sending failed',
                'invitation': TenantInvitationSerializer(invitation).data,
                'email_status': 'failed',
                'email_error': str(e)
            })

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        """Revoke an invitation."""
        invitation = self.get_object()

        if invitation.status != 'pending':
            return Response({'error': 'Can only revoke pending invitations'}, status=400)

        invitation.status = 'revoked'
        invitation.save()

        return Response({
            'message': 'Invitation revoked',
            'invitation': TenantInvitationSerializer(invitation).data
        })
