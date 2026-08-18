# integrations/services.py
import logging
from django.conf import settings
from .clients import VercelClient, CloudflareClient, ProvisioningError

logger = logging.getLogger(__name__)

ROOT_DOMAIN = getattr(settings, "ROOT_DOMAIN", "nuventacloud.com")
VERCEL_CNAME_TARGET = "cname.vercel-dns.com"


def provision_subdomain(tenant) -> dict:
    """
    Provision {tenant.slug}.{ROOT_DOMAIN}:
      1. Create a DNS-only CNAME in Cloudflare pointing at Vercel.
      2. Attach the domain to the Vercel project.
      3. Confirm Vercel actually holds it, since that is what triggers the
         certificate.

    The two remote steps are INDEPENDENT. The previous version returned early
    when Cloudflare failed, so a DNS hiccup meant Vercel was never called and
    no certificate could ever issue. They are attempted separately now and the
    per-step outcome is reported.

    Never raises: tenant creation must not fail because a third-party API is
    having a bad minute. Returns a structured result so callers (and the
    reprovision command) can see exactly which step failed and why.
    """
    full_domain = f"{tenant.slug}.{ROOT_DOMAIN}"
    result = {
        "domain": full_domain,
        "dns": {"ok": False, "detail": ""},
        "vercel": {"ok": False, "detail": ""},
        "verified": False,
        "ok": False,
    }

    # ── 1. Cloudflare DNS ────────────────────────────────────────────────────
    try:
        cf = CloudflareClient()
        record = cf.create_cname_record(
            name=tenant.slug, target=VERCEL_CNAME_TARGET, proxied=False)
        if isinstance(record, dict) and record.get("already_exists"):
            result["dns"] = {"ok": True, "detail": "record already existed"}
        else:
            result["dns"] = {"ok": True, "detail": "CNAME created"}
    except ProvisioningError as exc:
        result["dns"] = {"ok": False, "detail": str(exc)}
        logger.error("Cloudflare DNS provisioning failed for %s: %s",
                     full_domain, exc)
    except Exception as exc:
        result["dns"] = {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}
        logger.exception(
            "Cloudflare DNS provisioning error for %s", full_domain)

    # ── 2. Vercel attach (attempted even if step 1 failed) ───────────────────
    vercel = None
    try:
        vercel = VercelClient()
        added = vercel.add_domain(full_domain)
        if added.get("conflict"):
            # Benign (already ours) or fatal (held elsewhere) -- step 3 decides.
            result["vercel"] = {
                "ok": False,
                "detail": f"409 conflict from Vercel: {added.get('raw')}",
            }
        else:
            result["vercel"] = {"ok": True, "detail": "domain added"}
    except ProvisioningError as exc:
        result["vercel"] = {"ok": False, "detail": str(exc)}
        logger.error("Vercel domain provisioning failed for %s: %s",
                     full_domain, exc)
    except Exception as exc:
        result["vercel"] = {
            "ok": False, "detail": f"{type(exc).__name__}: {exc}"}
        logger.exception("Vercel domain provisioning error for %s", full_domain)

    # ── 3. Confirm Vercel really holds the domain ────────────────────────────
    # Adding is asynchronous and a 409 is ambiguous, so trust only this read.
    if vercel is not None:
        try:
            info = vercel.get_domain(full_domain)
            if info is None:
                result["verified"] = False
                result["vercel"]["detail"] += " | not attached to project"
            else:
                result["vercel"]["ok"] = True
                result["verified"] = bool(info.get("verified"))
                if not result["verified"]:
                    result["vercel"]["detail"] += (
                        " | attached but unverified -- no certificate yet")
        except Exception as exc:
            result["vercel"]["detail"] += f" | verify failed: {exc}"

    result["ok"] = result["dns"]["ok"] and result["verified"]

    if result["ok"]:
        logger.info("Subdomain provisioned and verified: %s", full_domain)
    else:
        logger.error(
            "Subdomain provisioning INCOMPLETE for %s -- dns=%s (%s), "
            "vercel=%s (%s), verified=%s",
            full_domain,
            result["dns"]["ok"], result["dns"]["detail"],
            result["vercel"]["ok"], result["vercel"]["detail"],
            result["verified"],
        )
    return result


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
