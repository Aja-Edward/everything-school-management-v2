# tenants/mixins.py
"""
Mixins for enforcing tenant isolation in views and querysets.
CRITICAL: All ViewSets dealing with tenant-specific data must use TenantFilterMixin
"""

from django.forms import ValidationError
from rest_framework.exceptions import ValidationError
from academics.models import AcademicSession
from rest_framework.exceptions import PermissionDenied
from django.db.models import QuerySet
import logging

logger = logging.getLogger(__name__)


class TenantFilterMixin:
    """
    Mixin that automatically filters querysets by tenant.
    Use this on all ModelViewSets that should be tenant-isolated.

    CRITICAL: This ensures data from one tenant is never visible to another tenant.
    """

    def get_queryset(self):
        """Override to add tenant filtering"""
        queryset = super().get_queryset()

        # Get tenant from request
        tenant = getattr(self.request, 'tenant', None)

        # Check if user is platform admin (either is_superuser flag or role='superadmin')
        is_platform_admin = (
            self.request.user.is_superuser or
            (hasattr(self.request.user, 'role') and self.request.user.role.upper() == 'SUPERADMIN')
        )

        # For platform admins with no tenant context
        # Allow them to see all data
        if is_platform_admin and not tenant:
            logger.warning(
                f"Platform admin accessing {self.__class__.__name__} without tenant context. "
                f"Returning unfiltered queryset. User: {self.request.user.email}"
            )
            return queryset

        # Ensure tenant exists for non-platform-admins
        if not tenant:
            logger.error(
                f"No tenant found in request for {self.__class__.__name__}. "
                f"User: {self.request.user.email if self.request.user.is_authenticated else 'Anonymous'}"
            )
            raise PermissionDenied("Tenant context required. Please access via your school subdomain.")

        # Filter by tenant if model has tenant field
        if hasattr(queryset.model, 'tenant'):
            queryset = queryset.filter(tenant=tenant)
            logger.debug(f"Filtered {queryset.model.__name__} by tenant: {tenant.slug}")
        else:
            logger.warning(
                f"Model {queryset.model.__name__} does not have tenant field. "
                f"Cannot apply tenant filtering."
            )

        return queryset

    def perform_create(self, serializer):
        """Auto-populate tenant-scoped fields when creating objects"""
        tenant = getattr(self.request, "tenant", None)
        model = serializer.Meta.model

        save_kwargs = {}

        # Tenant-scoped models
        if hasattr(model, "tenant"):
            if not tenant:
                raise ValidationError("Tenant context is required for this operation.")
            save_kwargs["tenant"] = tenant

        # Academic-session–scoped models
        if hasattr(model, "academic_session"):
            academic_session = AcademicSession.objects.filter(
                tenant=tenant, is_active=True
            ).first()

            if not academic_session:
                raise ValidationError("No active academic session found.")

            save_kwargs["academic_session"] = academic_session

        # Save ONCE
        serializer.save(**save_kwargs)

        logger.info(
            f"Created {model.__name__} "
            f"with tenant={save_kwargs.get('tenant')} "
            f"academic_session={save_kwargs.get('academic_session')}"
        )


class TenantRequiredMixin:
    """
    Mixin that requires tenant context for all requests.
    More strict than TenantFilterMixin - will reject requests without tenant.
    """

    def initial(self, request, *args, **kwargs):
        """Check tenant exists before processing request"""
        super().initial(request, *args, **kwargs)

        tenant = getattr(request, 'tenant', None)

        # Allow platform admins to bypass this check
        is_platform_admin = (
            request.user.is_superuser or
            (hasattr(request.user, 'role') and request.user.role.upper() == 'SUPERADMIN')
        )

        if request.user.is_authenticated and is_platform_admin:
            return

        if not tenant:
            logger.error(
                f"TenantRequiredMixin: No tenant for {self.__class__.__name__}. "
                f"User: {request.user.email if request.user.is_authenticated else 'Anonymous'}"
            )
            raise PermissionDenied(
                "This resource requires tenant context. "
                "Please access via your school subdomain or custom domain."
            )


class UserTenantValidationMixin:
    """
    Mixin to ensure user belongs to the request tenant.
    Use this for additional security on sensitive operations.
    """

    def check_user_tenant_match(self):
        """Verify that user belongs to the request tenant"""
        if not self.request.user.is_authenticated:
            return False

        request_tenant = getattr(self.request, 'tenant', None)
        user_tenant = getattr(self.request.user, 'tenant', None)

        # Platform admins can access any tenant
        is_platform_admin = (
            self.request.user.is_superuser or
            (hasattr(self.request.user, 'role') and self.request.user.role.upper() == 'SUPERADMIN')
        )

        if is_platform_admin:
            return True

        # Check if tenants match
        if request_tenant and user_tenant and request_tenant.id != user_tenant.id:
            logger.warning(
                f"Tenant mismatch! User {self.request.user.email} "
                f"(tenant: {user_tenant.slug if user_tenant else 'None'}) "
                f"attempting to access {request_tenant.slug}"
            )
            raise PermissionDenied("You do not have access to this school's data.")

        return True

    def initial(self, request, *args, **kwargs):
        """Check tenant match before processing request"""
        super().initial(request, *args, **kwargs)
        self.check_user_tenant_match()
