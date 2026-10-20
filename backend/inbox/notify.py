"""
Putting a line in people's notification bells.

Everything that notifies calls `notify()`. It is a single bulk insert and
never raises: a failure is logged and the action that triggered it (a mark
saved, an assignment posted) still succeeds.
"""
import logging

from django.contrib.auth import get_user_model

from .models import Notification

logger = logging.getLogger(__name__)

# Tenant roles that run a school, whatever part of it. "superadmin" here is
# the school's own top admin; users_in_audience only looks inside one school,
# so platform staff are never reached.
ADMIN_ROLES = (
    "superadmin", "admin", "secondary_admin", "senior_secondary_admin", "junior_secondary_admin",
    "primary_admin", "nursery_admin",
)

# Where each role's bell sends them for each kind of thing.
DASHBOARD = {
    "student": "/student/dashboard",
    "parent": "/parent/dashboard",
    "teacher": "/teacher/dashboard",
}


def notify(recipients, *, tenant, kind, title, body="", link=""):
    """
    Add one notification for each distinct user in `recipients`, all in
    `tenant`. `link` may be a string, or a function of the user returning one
    (for when students and parents land on different pages).
    Returns how many were added.
    """
    if tenant is None:
        return 0
    seen, rows = set(), []
    for user in recipients:
        if user is None or user.pk in seen:
            continue
        seen.add(user.pk)
        rows.append(Notification(
            tenant=tenant,
            recipient=user,
            kind=kind,
            title=title[:200],
            body=body,
            link=(link(user) if callable(link) else link) or "",
        ))
    if not rows:
        return 0
    try:
        Notification.objects.bulk_create(rows, batch_size=500)
    except Exception:  # noqa: BLE001 - a bell must never break the action behind it
        logger.exception("Could not add %s %r notification(s)", len(rows), kind)
        return 0
    return len(rows)


def dashboard_for(user):
    return DASHBOARD.get((getattr(user, "role", "") or "").lower(), "")


def users_in_audience(tenant, audience):
    """
    Active users of `tenant` an announcement is for. `audience` is what the
    settings screen saves: "all", "students", "teachers", "parents" or
    "admins", or a list of those.
    """
    if isinstance(audience, str):
        audience = [audience]
    audience = {str(a).lower() for a in (audience or ["all"])}

    users = get_user_model().objects.filter(tenant=tenant, is_active=True)
    if "all" in audience:
        return users
    roles = set()
    for group in audience:
        if group == "admins":
            roles.update(ADMIN_ROLES)
        else:
            roles.add(group.rstrip("s"))  # "students" -> "student"
    return users.filter(role__in=roles)
