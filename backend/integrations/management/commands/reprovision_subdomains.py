"""
Re-run subdomain provisioning for tenants that do not have a working
subdomain, and report exactly which step fails and why.

This is the repair counterpart to `diagnose_provisioning` (which is read-only).
Use it to backfill schools registered before provisioning worked, and to retry
after fixing an API token or a Vercel project setting.

    python manage.py reprovision_subdomains --dry-run
    python manage.py reprovision_subdomains --slug gods-treasure-schools
    python manage.py reprovision_subdomains --all-broken

Safe to re-run: Cloudflare treats an existing CNAME as non-fatal and Vercel
returns a conflict for a domain already on the project, which is then
confirmed with a follow-up read rather than assumed.
"""

import json as _json

from django.core.management.base import BaseCommand

from integrations.services import ROOT_DOMAIN, provision_subdomain
from tenants.models import Tenant


class Command(BaseCommand):
    help = "Re-run subdomain provisioning for tenants and report per-step results."

    def add_arguments(self, parser):
        parser.add_argument(
            "--slug", help="Only this tenant slug.")
        parser.add_argument(
            "--all-broken",
            action="store_true",
            help="Every active tenant whose domain is not attached and verified "
                 "on Vercel. Requires a Vercel API call per tenant.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List what would be provisioned without calling any write API.",
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            help="Include tenants that are not active (skipped by default).",
        )
        parser.add_argument(
            "--json", action="store_true", dest="as_json",
            help="Emit machine-readable JSON.",
        )

    def _needs_provisioning(self, tenant):
        """True when Vercel does not hold a verified domain for this tenant."""
        from integrations.clients import VercelClient
        try:
            info = VercelClient().get_domain(f"{tenant.slug}.{ROOT_DOMAIN}")
        except Exception:
            # Cannot tell -- assume it needs work rather than skipping silently.
            return True
        return info is None or not info.get("verified")

    def handle(self, *args, **opts):
        w = self.stdout.write
        as_json = opts["as_json"]

        tenants = Tenant.objects.all().order_by("created_at")
        if opts["slug"]:
            tenants = tenants.filter(slug=opts["slug"])
        if not opts["include_inactive"]:
            tenants = tenants.filter(status="active", is_active=True)
        tenants = list(tenants)

        if not tenants:
            w(self.style.ERROR("No matching tenants."))
            return

        if opts["all_broken"]:
            tenants = [t for t in tenants if self._needs_provisioning(t)]
            if not tenants:
                w(self.style.SUCCESS(
                    "Every active tenant already has a verified domain."))
                return

        if opts["dry_run"]:
            w(f"\n[dry-run] would provision {len(tenants)} tenant(s):")
            for t in tenants:
                w(f"    {t.slug}.{ROOT_DOMAIN}   ({t.name})")
            w("\nNo API calls were made.")
            return

        results = []
        w(f"\nProvisioning {len(tenants)} tenant(s)...\n")

        for t in tenants:
            res = provision_subdomain(t)
            results.append(res)

            if as_json:
                continue

            badge = (self.style.SUCCESS("OK    ") if res["ok"]
                     else self.style.ERROR("FAILED"))
            w(f"  {badge}  {res['domain']}")
            for step in ("dns", "vercel"):
                s = res[step]
                mark = "ok  " if s["ok"] else "FAIL"
                style = self.style.SUCCESS if s["ok"] else self.style.ERROR
                w(f"            {style(mark)} {step:<7} {s['detail'] or '-'}")
            w(f"            {'ok  ' if res['verified'] else 'FAIL'} verified"
              f" {'certificate will issue' if res['verified'] else 'NO certificate'}")

        if as_json:
            w(_json.dumps(results, indent=2))
            return

        ok = [r for r in results if r["ok"]]
        w("")
        w("-" * 70)
        w(f"  {len(ok)}/{len(results)} fully provisioned")
        if len(ok) != len(results):
            w("")
            w("  Certificates issue only once Vercel reports the domain as")
            w("  verified. If Vercel returned a 409 conflict, the domain is held")
            w("  by another Vercel project or team -- remove it there first, or")
            w("  add it to this project from the Vercel dashboard.")
