# utils/teacher_portal_permissions.py

from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied
from tenants.models import TenantSettings


def get_tenant_settings(user):
    """Get TenantSettings for the user's tenant"""
    tenant = getattr(user, 'tenant', None)
    if not tenant:
        return None
    try:
        return tenant.settings
    except TenantSettings.DoesNotExist:
        return None


class TeacherPortalEnabledPermission(BasePermission):
    """
    Permission class that checks if teacher portal is enabled.
    Blocks teachers from accessing resources when portal is disabled.
    """

    message = "Teacher portal access is currently disabled. Please contact your administrator."

    def has_permission(self, request, view):
        # Allow superusers and staff always
        if request.user.is_superuser or request.user.is_staff:
            return True

        # Allow admins and principals always
        user_role = getattr(request.user, "role", None)
        if user_role in ["admin", "superadmin", "principal"]:
            return True

        # For teachers, check if portal is enabled
        if user_role == "teacher":
            settings = get_tenant_settings(request.user)
            is_enabled = settings.teacher_portal_enabled if settings else True

            if not is_enabled:
                raise PermissionDenied(
                    "The teacher portal has been temporarily disabled by the system administrator. "
                    "Please contact your school administrator or IT support team for assistance."
                )

            return is_enabled

        # Allow other roles (students, parents, etc.)
        return True


# Alternative: Mixin approach for ViewSets
class TeacherPortalCheckMixin:
    """
    Mixin to add to ViewSets that should check teacher portal status.
    Blocks teachers when portal is disabled.
    """

    def check_teacher_portal_access(self):
        """Check if teacher portal is enabled for teacher users"""
        user = self.request.user

        # Allow superusers and staff
        if user.is_superuser or user.is_staff:
            return

        # Allow admins and principals
        user_role = getattr(user, "role", None)
        if user_role in ["admin", "superadmin", "principal"]:
            return

        # Check teachers
        if user_role == "teacher":
            settings = get_tenant_settings(user)
            is_enabled = settings.teacher_portal_enabled if settings else True

            if not is_enabled:
                raise PermissionDenied(
                    "The teacher portal has been temporarily disabled by the system administrator. "
                    "Please contact your school administrator or IT support team for assistance."
                )

    def list(self, request, *args, **kwargs):
        self.check_teacher_portal_access()
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        self.check_teacher_portal_access()
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        self.check_teacher_portal_access()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self.check_teacher_portal_access()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self.check_teacher_portal_access()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self.check_teacher_portal_access()
        return super().destroy(request, *args, **kwargs)
