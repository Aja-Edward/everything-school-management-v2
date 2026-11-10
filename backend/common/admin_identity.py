"""
common/admin_identity.py

How a school admin is named to everyone else.

Edward asked that an admin who sends a message, posts an announcement or
reviews a teacher's work is known by their title (Proprietress, School Admin
2, Primary Admin), not by their name. public_name() is that rule; use it
wherever an account's name is shown as the author of something.
"""

from rest_framework import serializers

from common.admin_access import SCHOOL_ADMIN_ROLES, SECTION_ADMIN_LEVELS

ADMIN_ROLES = SCHOOL_ADMIN_ROLES | set(SECTION_ADMIN_LEVELS)

# The title of the school's owner (role superadmin, made at registration)
# until they pick one of these on the admin list.
OWNER_TITLE = "Proprietor/Proprietress"
OWNER_TITLES = ("Proprietor", "Proprietress", OWNER_TITLE)

ROLE_TITLES = {
    "superadmin": OWNER_TITLE,
    "admin": "School Admin",
    "nursery_admin": "Nursery Admin",
    "primary_admin": "Primary Admin",
    "junior_secondary_admin": "Junior Secondary Admin",
    "senior_secondary_admin": "Senior Secondary Admin",
    "secondary_admin": "Secondary Admin",
}


def is_school_admin_account(user):
    """A school's own admin, of any rank. Platform accounts have no school."""
    role = (getattr(user, "role", "") or "").lower()
    return role in ADMIN_ROLES and getattr(user, "tenant_id", None) is not None


def admin_title(user):
    """The title `user` goes by as an admin: the one given, else their role's."""
    given = (getattr(user, "admin_title", "") or "").strip()
    if given:
        return given
    role = (getattr(user, "role", "") or "").lower()
    return ROLE_TITLES.get(role, "Admin")


def public_name(user, default=None):
    """
    What others see as the author of something `user` did: their title if
    they are a school admin, else their name. `default` when there is nobody.
    """
    if user is None:
        return default
    if is_school_admin_account(user):
        return admin_title(user)
    return user.get_full_name() or user.username


def next_numbered_title(tenant, role):
    """
    "School Admin 3" for the third whole-school admin, and so on: a fresh
    admin's title, so two admins of one role are told apart without names.
    """
    from users.models import CustomUser

    base = ROLE_TITLES.get(role, "Admin")
    taken = set(
        CustomUser.objects.filter(tenant=tenant, admin_title__startswith=base)
        .values_list("admin_title", flat=True)
    )
    n = CustomUser.objects.filter(tenant=tenant, role=role).count() + 1
    while f"{base} {n}" in taken:
        n += 1
    return f"{base} {n}"


class AuthorNameField(serializers.Field):
    """
    The person at `source`, as others see them: a school admin by their title
    (Proprietress, School Admin 2), anyone else by name. See
    common.admin_identity.
    """

    def __init__(self, **kwargs):
        kwargs["read_only"] = True
        super().__init__(**kwargs)

    def to_representation(self, user):
        return public_name(user)


class AuthorEmailField(serializers.Field):
    """An account's email, left out for a school admin: it often is their name."""

    def __init__(self, **kwargs):
        kwargs["read_only"] = True
        super().__init__(**kwargs)

    def to_representation(self, user):
        if user is None or is_school_admin_account(user):
            return None
        return user.email
