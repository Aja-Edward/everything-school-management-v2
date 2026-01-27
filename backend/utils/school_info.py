from tenants.models import Tenant, TenantSettings


def get_school_info(tenant=None, user=None):
    """
    Get school information from Tenant and TenantSettings.

    Args:
        tenant: Tenant object (optional)
        user: User object to get tenant from (optional)

    Returns:
        dict with school info
    """
    # Try to get tenant from parameters or user
    if not tenant and user and hasattr(user, 'tenant'):
        tenant = user.tenant

    # If still no tenant, try to get the first active tenant (fallback)
    if not tenant:
        tenant = Tenant.objects.filter(is_active=True).first()

    if not tenant:
        return {
            "name": "School Name",
            "site": "Site Name",
            "address": "",
            "phone": "",
            "email": "",
            "logo": None,
            "favicon": None,
            "motto": "",
            "school_code": "",
        }

    # Get or create TenantSettings
    try:
        settings = tenant.settings
    except TenantSettings.DoesNotExist:
        settings = TenantSettings.objects.create(tenant=tenant)

    return {
        "name": tenant.name,
        "site": tenant.name,
        "address": settings.address or "",
        "phone": settings.phone or "",
        "email": settings.email or "",
        "logo": settings.logo or None,
        "favicon": settings.favicon or None,
        "motto": settings.school_motto or "",
        "school_code": settings.school_code or "",
    }
