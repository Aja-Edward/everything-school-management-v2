from datetime import datetime


def generate_unique_username(
    role: str,
    registration_number: str = None,
    employee_id: str = None,
    school_code: str = None,
    tenant=None,
) -> str:
    """
    Generate a unique username in the format:
    PREFIX/SCHOOL_CODE/MONTH/YEAR/ID

    FIX: Always resolve the school_code from the request tenant via
    TenantMiddleware / get_current_tenant(), falling back to the tenant
    argument, then to a DB lookup, then to "SCH".  The old code went
    straight to Tenant.objects.first() when no tenant was supplied,
    which returned whichever tenant happened to be first in the DB
    (e.g. "LIS") instead of the school that is actually logged-in
    ("GTS").
    """
    from users.models import CustomUser  # avoid AppRegistryNotReady

    prefix_map = {
        "student": "STU",
        "teacher": "TCH",
        "parent": "PAR",
        "admin": "ADM",
        "superadmin": "ADM",
        "secondary_admin": "ADM",
        "senior_secondary_admin": "ADM",
        "junior_secondary_admin": "ADM",
        "primary_admin": "ADM",
        "nursery_admin": "ADM",
    }
    prefix = prefix_map.get(role.lower(), "USR")

    # ------------------------------------------------------------------
    # Resolve school_code — priority order:
    #   1. Explicit school_code argument (caller already knows it)
    #   2. tenant argument passed by the caller
    #   3. Current request tenant via django-tenants / custom middleware
    #   4. Single active tenant in DB  (last resort, logs a warning)
    #   5. Hard-coded fallback "SCH"
    # ------------------------------------------------------------------
    if school_code is None:
        school_code = _resolve_school_code(tenant)

    now = datetime.now()
    month = now.strftime("%b").upper()  # e.g. 'APR'
    year = now.strftime("%y")  # e.g. '26'

    # ------------------------------------------------------------------
    # Build the ID part
    # ------------------------------------------------------------------
    if role.lower() == "student" and registration_number:
        # Use the provided registration number in the username
        base_username = f"{prefix}/{school_code}/{month}/{year}/{registration_number}"
        if CustomUser.objects.filter(username=base_username).exists():
            counter = 1
            while CustomUser.objects.filter(
                username=f"{base_username}-{counter}"
            ).exists():
                counter += 1
            id_part = f"{registration_number}-{counter}"
        else:
            id_part = registration_number

    elif role.lower() == "teacher" and employee_id:
        base_username = f"{prefix}/{school_code}/{month}/{year}/{employee_id}"
        if CustomUser.objects.filter(username=base_username).exists():
            counter = 1
            while CustomUser.objects.filter(
                username=f"{base_username}-{counter}"
            ).exists():
                counter += 1
            id_part = f"{employee_id}-{counter}"
        else:
            id_part = employee_id

    else:
        # Auto-increment for parents, admins, and students without a
        # registration number
        pattern = f"{prefix}/{school_code}/{month}/{year}/"
        existing = CustomUser.objects.filter(username__startswith=pattern)
        max_num = 0
        for user in existing:
            try:
                last_part = user.username.split("/")[-1]
                base_num = last_part.split("-")[0]
                num = int(base_num)
                if num > max_num:
                    max_num = num
            except (ValueError, IndexError):
                continue
        id_part = f"{max_num + 1:04d}"

    return f"{prefix}/{school_code}/{month}/{year}/{id_part}"


# ----------------------------------------------------------------------
# Internal helper — kept separate so it is easy to test / mock
# ----------------------------------------------------------------------


def _resolve_school_code(tenant=None) -> str:
    """
    Return the school_code for the currently active tenant.

    Tries (in order):
      1. tenant argument
      2. django-tenant-schemas / django-tenants connection schema
      3. Custom middleware stored on the current thread
      4. Single active tenant in DB  (warns if >1 tenant exists)
      5. Fallback "SCH"
    """
    import logging

    logger = logging.getLogger(__name__)

    # 1. Explicit tenant argument
    if tenant is not None:
        code = _code_from_tenant(tenant)
        if code:
            return code

    # 2. Try thread-local / middleware current tenant
    #    Works with django-tenants, tenant-schemas, or a custom middleware
    #    that stores the tenant on threading.local().
    try:
        # django-tenants exposes connection.tenant
        from django.db import connection

        t = getattr(connection, "tenant", None)
        if t is not None:
            code = _code_from_tenant(t)
            if code:
                return code
    except Exception:
        pass

    try:
        # Custom middleware pattern — many projects store it here
        from tenants.middleware import (
            get_current_tenant,
        )  # adjust import to your project

        t = get_current_tenant()
        if t is not None:
            code = _code_from_tenant(t)
            if code:
                return code
    except Exception:
        pass

    # 3. Last-resort DB lookup — warn if ambiguous
    try:
        from tenants.models import Tenant

        active_tenants = Tenant.objects.filter(is_active=True)
        count = active_tenants.count()
        if count == 1:
            code = _code_from_tenant(active_tenants.first())
            if code:
                return code
        elif count > 1:
            logger.warning(
                "generate_unique_username: multiple active tenants found and no "
                "request tenant could be determined. Username school code may be "
                "wrong. Pass `tenant=` explicitly from the serializer/view."
            )
            # Still return the first one so we don't crash, but the caller
            # should fix this by passing the tenant explicitly.
            code = _code_from_tenant(active_tenants.first())
            if code:
                return code
    except Exception:
        pass

    return "SCH"


def _code_from_tenant(tenant) -> str:
    """Extract school_code from a tenant object. Returns '' if not found."""
    try:
        if hasattr(tenant, "settings") and tenant.settings:
            return tenant.settings.school_code or ""
    except Exception:
        pass
    return ""


def get_default_school_code():
    """Helper for migrations — never touches tenant settings."""
    return "SCH"


import secrets, string


def generate_temp_password(length=14):
    """Generate a cryptographically secure password guaranteed to meet
    complexity rules without positional bias."""
    alphabet = string.ascii_letters + string.digits + "!@#$%"

    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        # Check all complexity requirements
        if (
            any(c.isupper() for c in pwd)
            and any(c.islower() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%" for c in pwd)
        ):
            return pwd
