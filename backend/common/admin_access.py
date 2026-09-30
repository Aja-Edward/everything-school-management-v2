"""
common/admin_access.py

Who counts as a school admin, and over which education levels.

A school's own top admin is registered as role="superadmin" with a tenant
(platform staff are the tenant-less ones, see CustomUser.is_platform_staff),
alongside role="admin". Section admins are narrowed to their levels.
"""

from common.education_levels import expand_tokens
from tenants.membership import user_belongs_to_tenant, user_school_id

SCHOOL_ADMIN_ROLES = {"superadmin", "admin"}

SECTION_ADMIN_LEVELS = {
    "nursery_admin": ["NURSERY"],
    "primary_admin": ["PRIMARY"],
    "junior_secondary_admin": ["JUNIOR_SECONDARY"],
    "senior_secondary_admin": ["SENIOR_SECONDARY"],
    "secondary_admin": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
}


def admin_level_access(user, tenant):
    """
    The education levels `user` administers in `tenant`.

    Returns None for every level, a list of level_type spellings for a
    section admin, or [] for someone who is no admin there at all.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return []
    if getattr(user, "is_platform_staff", False):
        return None

    # Authentication already treats a user from another school as anonymous
    # (tenants.membership); checked again here so this can't drift from it.
    if tenant is None or not user_belongs_to_tenant(user, tenant):
        return []

    role = (getattr(user, "role", "") or "").lower()
    if role in SCHOOL_ADMIN_ROLES:
        return None
    if role in SECTION_ADMIN_LEVELS:
        return expand_tokens(SECTION_ADMIN_LEVELS[role])
    return []


def can_manage_level(access, education_level):
    return access is None or education_level.level_type in access


def in_same_school(actor, target):
    """
    Whether `actor` may act on the account `target` at all.

    Endpoints that take a user id or email from the request (password reset,
    activation, role change) used to be gated by is_staff alone, which every
    school's own admin has, and then looked the target up across the whole
    platform. Any school admin could reset another school's admin's password
    by id. Membership of the request's school (tenants.membership) only covers
    who is asking, not who they are asking about; this covers the second.

    Platform staff reach every school. Nobody else reaches a platform account.
    """
    if getattr(actor, "is_platform_staff", False):
        return True
    if target.is_superuser or getattr(target, "is_platform_user", False):
        return False
    school_id = user_school_id(actor)
    return school_id is not None and user_school_id(target) == school_id


def outranks(actor, target):
    """
    Whether `actor` may change `target`'s password, status or role.

    Only the school's owner (role superadmin) may touch the owner's account,
    and only a school admin may touch any other admin: otherwise a lesser
    staff account could reset the owner's password and sign in as them.
    Call after in_same_school().
    """
    if getattr(actor, "is_platform_staff", False):
        return True
    actor_role = (getattr(actor, "role", "") or "").lower()
    target_role = (getattr(target, "role", "") or "").lower()
    if target_role == "superadmin":
        return actor_role == "superadmin"
    if target_role in SCHOOL_ADMIN_ROLES or target_role in SECTION_ADMIN_LEVELS:
        return actor_role in SCHOOL_ADMIN_ROLES
    return True
