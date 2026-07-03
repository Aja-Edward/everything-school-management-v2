# integrations/services.py
import logging
from django.conf import settings
from .clients import VercelClient, CloudflareClient, ProvisioningError

logger = logging.getLogger(__name__)

ROOT_DOMAIN = getattr(settings, "ROOT_DOMAIN", "nuventacloud.com")
VERCEL_CNAME_TARGET = "cname.vercel-dns.com"


def provision_subdomain(tenant) -> bool:
    """
    Provisions {tenant.slug}.nuventacloud.com:
    1. Creates a DNS-only CNAME in Cloudflare pointing to Vercel.
    2. Registers the domain with the Vercel project.
    Returns True on success, False if it failed (logged, not raised,
    so tenant creation never blocks on this).
    """
    full_domain = f"{tenant.slug}.{ROOT_DOMAIN}"
    cf = CloudflareClient()
    vercel = VercelClient()

    try:
        cf.create_cname_record(
            name=tenant.slug, target=VERCEL_CNAME_TARGET, proxied=False)
    except ProvisioningError:
        logger.exception(
            "Cloudflare DNS provisioning failed for %s", full_domain)
        return False

    try:
        vercel.add_domain(full_domain)
    except ProvisioningError:
        logger.exception(
            "Vercel domain provisioning failed for %s", full_domain)
        return False

    logger.info("Subdomain provisioned: %s", full_domain)
    return True


def check_custom_domain_status(tenant) -> str:
    """
    Polls Cloudflare for the current verification/SSL status of a
    tenant's custom domain and updates custom_domain_verified accordingly.
    Returns the raw Cloudflare status string.
    """
    if not tenant.cloudflare_hostname_id:
        raise ValueError("Tenant has no cloudflare_hostname_id")

    cf = CloudflareClient()
    result = cf.get_custom_hostname_status(tenant.cloudflare_hostname_id)
    ssl_status = result.get("ssl", {}).get("status")
    hostname_status = result.get("status")

    is_active = hostname_status == "active" and ssl_status == "active"
    if is_active != tenant.custom_domain_verified:
        tenant.custom_domain_verified = is_active
        tenant.save(update_fields=["custom_domain_verified"])

    return hostname_status
