# tenants/middleware.py
import logging
from django.conf import settings
from django.http import JsonResponse
from django.db import OperationalError
from django.db.utils import ProgrammingError

logger = logging.getLogger(__name__)


class TenantMiddleware:
    """
    Middleware to identify tenant from subdomain or custom domain.
    Sets request.tenant for use throughout the request lifecycle.
    """

    # Subdomains that are not tenant-specific
    EXCLUDED_SUBDOMAINS = ['www', 'api', 'admin', 'app', 'dashboard', 'static', 'media']

    # Main platform domain
    PLATFORM_DOMAIN = getattr(settings, 'PLATFORM_DOMAIN', 'schoolplatform.com')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Import here to avoid circular imports
        from .models import Tenant

        host = request.get_host().split(':')[0].lower()  # Remove port, lowercase
        tenant = None

        logger.debug(f"TenantMiddleware: Processing request for host={host}, path={request.path}")

        # Skip tenant resolution for certain paths (e.g., public registration)
        if self._is_public_path(request.path):
            logger.debug(f"TenantMiddleware: Skipping tenant resolution for public path: {request.path}")
            request.tenant = None
            return self.get_response(request)

        try:
            # 1. Check for localhost subdomain in development (e.g., bay-school.localhost)
            if host.endswith(".localhost"):
                parts = host.replace('.localhost', '').split('.')
                logger.debug(f"TenantMiddleware: localhost host detected, parts={parts}")
                if parts and parts[0] not in self.EXCLUDED_SUBDOMAINS:
                    subdomain = parts[0]
                    tenant = Tenant.objects.filter(
                        slug=subdomain,
                        is_active=True
                    ).first()
                    logger.debug(f"TenantMiddleware: localhost subdomain lookup for '{subdomain}': tenant={tenant}")

            # 2. Check for custom domain
            if (
                not tenant
                and not host.endswith(self.PLATFORM_DOMAIN)
                and not host.endswith("localhost")
                and "." in host
            ):
                tenant = Tenant.objects.filter(
                    custom_domain=host,
                    custom_domain_verified=True,
                    is_active=True,
                    status='active'
                ).first()
                logger.debug(
                    f"TenantMiddleware: Custom domain lookup for '{host}': tenant={tenant}"
                )

            # 3. Check for subdomain on platform domain
            if not tenant and host.endswith(self.PLATFORM_DOMAIN):
                parts = host.replace(f'.{self.PLATFORM_DOMAIN}', '').split('.')
                if parts and parts[0] not in self.EXCLUDED_SUBDOMAINS:
                    subdomain = parts[0]
                    tenant = Tenant.objects.filter(
                        slug=subdomain,
                        is_active=True
                    ).first()
                    logger.debug(
                        f"TenantMiddleware: Platform subdomain lookup for '{subdomain}': tenant={tenant}"
                    )

            # 4. Check for tenant in request header (for API calls)
            if not tenant:
                tenant_header = request.headers.get('X-Tenant-ID') or request.headers.get('X-Tenant-Slug')
                logger.debug(f"TenantMiddleware: Checking headers - X-Tenant-ID/X-Tenant-Slug: {tenant_header}")
                if tenant_header:
                    # Try UUID first, then slug
                    try:
                        import uuid
                        uuid.UUID(tenant_header)
                        tenant = Tenant.objects.filter(
                            id=tenant_header, is_active=True
                        ).first()
                    except ValueError:
                        tenant = Tenant.objects.filter(
                            slug=tenant_header, is_active=True
                        ).first()
                    logger.debug(f"TenantMiddleware: Header lookup for '{tenant_header}': tenant={tenant}")

            # 5. Fall back to authenticated user's tenant (especially for localhost)
            if not tenant and hasattr(request, 'user') and request.user.is_authenticated:
                logger.debug(
                    f"TenantMiddleware: Attempting user tenant fallback for user={request.user}"
                )
                user_tenant = getattr(request.user, 'tenant', None)
                if user_tenant and isinstance(user_tenant, Tenant):
                    tenant = user_tenant
                    logger.info(f"TenantMiddleware: Using user's tenant: {tenant}")
                else:
                    logger.warning(
                        f"TenantMiddleware: User {request.user} has no valid tenant attribute"
                    )

            # 6. Check session for tenant (backup method)
            if not tenant and hasattr(request, "session"):
                tenant_id = request.session.get("tenant_id")
                if tenant_id:
                    tenant = Tenant.objects.filter(id=tenant_id, is_active=True).first()
                    logger.debug(
                        f"TenantMiddleware: Session tenant lookup for '{tenant_id}': tenant={tenant}"
                    )

        except (OperationalError, ProgrammingError) as e:
            # Table doesn't exist yet (during migrations) - continue without tenant
            logger.warning(f"TenantMiddleware: Database error during tenant resolution: {e}")
            tenant = None

        logger.info(f"TenantMiddleware: Final tenant resolution for {request.path}: tenant={tenant}")
        request.tenant = tenant
        response = self.get_response(request)
        return response

    def _is_public_path(self, path):
        """Check if the path is public and doesn't require tenant context."""
        public_paths = [
            "/api/tenants/register/",
            "/api/tenants/check-slug/",
            "/api/tenants/check-domain/",
            "/api/tenants/setup/exchange/",
            "/api/tenants/public/",
            "/api/auth/",
            "/admin/",
            "/health/",
            "/api/force-migrate/",
            "/api/check-schema/",
            "/api/school-settings/",
            "/api/platform/",
        ]
        return any(path.startswith(p) for p in public_paths)


class TenantRequiredMiddleware:
    """
    Optional middleware to enforce tenant requirement on certain paths.
    Use this if you want to return 404 for requests without a valid tenant.
    """

    TENANT_REQUIRED_PATHS = [
        '/api/students/',
        '/api/teachers/',
        '/api/classrooms/',
        '/api/subjects/',
        '/api/exams/',
        '/api/results/',
        '/api/attendance/',
        '/api/fee/',
    ]

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._requires_tenant(request.path) and not getattr(request, 'tenant', None):
            return JsonResponse({
                'error': 'Tenant not found',
                'message': 'Please access this resource through your school subdomain or custom domain.'
            }, status=404)

        return self.get_response(request)

    def _requires_tenant(self, path):
        return any(path.startswith(p) for p in self.TENANT_REQUIRED_PATHS)
