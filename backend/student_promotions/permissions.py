"""
student_promotions/permissions.py

Promotions are an admin tool: the records expose every student's session
average, and the actions decide who moves into which class.
"""

from rest_framework.permissions import BasePermission

from common.education_levels import expand_tokens

# A school's own top admin is registered as role="superadmin" with a tenant
# (platform staff are the tenant-less ones, see CustomUser.is_platform_staff).
SCHOOL_ADMIN_ROLES = {"superadmin", "admin"}

SECTION_ADMIN_LEVELS = {
    "nursery_admin": ["NURSERY"],
    "primary_admin": ["PRIMARY"],
    "junior_secondary_admin": ["JUNIOR_SECONDARY"],
    "senior_secondary_admin": ["SENIOR_SECONDARY"],
    "secondary_admin": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
}


def promotion_level_access(user, tenant):
    """
    The education levels `user` may manage promotions for in `tenant`.

    Returns None for every level, a list of level_type spellings for a
    section admin, or [] for no access at all.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return []
    if getattr(user, "is_platform_staff", False):
        return None

    # Nothing upstream ties the tenant a request names (X-Tenant-Slug) to the
    # user's own school, so check it here: an admin of one school is nobody
    # in another.
    if tenant is None or user.tenant_id != tenant.id:
        return []

    role = (getattr(user, "role", "") or "").lower()
    if role in SCHOOL_ADMIN_ROLES:
        return None
    if role in SECTION_ADMIN_LEVELS:
        return expand_tokens(SECTION_ADMIN_LEVELS[role])
    return []


def can_manage_level(access, education_level):
    return access is None or education_level.level_type in access


class IsPromotionAdmin(BasePermission):
    """School admins, and section admins (narrowed to their levels by the views)."""

    message = "Only school admins can manage promotions."

    def has_permission(self, request, view):
        return promotion_level_access(request.user, getattr(request, "tenant", None)) != []
