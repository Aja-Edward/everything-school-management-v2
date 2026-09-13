"""
tenants/membership.py

Ties an authenticated user to the school a request is for.

TenantMiddleware resolves request.tenant from the host, or from the
X-Tenant-Slug / X-Tenant-ID header, before DRF has authenticated anyone, and
TenantFilterMixin scopes querysets to whatever it resolved. Nothing connected
the two, so a user of one school could send another school's slug and be
served — and often allowed to change — that school's data under their own
login. The authentication classes now call restrict_to_request_tenant() on
every user they sign in.
"""

import logging

from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)

# Several account-creation paths (teacher and parent creation, both bulk
# uploads) have only ever set the school on the profile, not on the user,
# so a user's own tenant is not enough to go on.
_PROFILE_BY_ROLE = {
    "teacher": ("teacher", "Teacher"),
    "student": ("students", "Student"),
    "parent": ("parent", "ParentProfile"),
}


def user_school_id(user):
    """
    The id of the school `user` belongs to, or None if it can't be told.

    The user's own tenant wins; otherwise the tenant on their teacher,
    student or parent profile.
    """
    if user.tenant_id:
        return user.tenant_id

    profile = _PROFILE_BY_ROLE.get((getattr(user, "role", "") or "").lower())
    if profile is None:
        return None

    from django.apps import apps

    model = apps.get_model(*profile)
    return model.objects.filter(user=user).values_list("tenant_id", flat=True).first()


def user_belongs_to_tenant(user, tenant):
    if tenant is None or not user.is_authenticated:
        return True
    if getattr(user, "is_platform_staff", False):
        return True
    return user_school_id(user) == tenant.id


def restrict_to_request_tenant(request, user_auth):
    """
    Pass an authenticator's (user, auth) result through only if the user
    belongs to the request's school.

    A user from another school becomes an anonymous visitor for this request
    rather than being refused outright: the login cookie is shared across
    school subdomains, so someone signed in at one school must still be able
    to browse another school's public pages. Returning (AnonymousUser, None)
    — not None — also ends the authenticator chain, so a later authenticator
    cannot sign the same credentials in, and DRF answers protected endpoints
    with 403 rather than a 401 the frontend would try to refresh its way out
    of.
    """
    if user_auth is None:
        return None

    user = user_auth[0]
    tenant = getattr(request, "tenant", None)
    if user_belongs_to_tenant(user, tenant):
        return user_auth

    logger.warning(
        "Cross-school request treated as anonymous: user=%s (school=%s) asked for %s at %s",
        user.pk, user_school_id(user), tenant.slug, request.path,
    )
    return (AnonymousUser(), None)
