"""
Read-only diagnostic for subdomain SSL provisioning.

Answers "why did this school never get a certificate?" by checking, for every
tenant, whether the three things that must all be true actually are:

    1. A Cloudflare CNAME exists for {slug}.{ROOT_DOMAIN} and is DNS-only.
    2. The domain is attached to the Vercel project.
    3. Vercel has verified it (which is what triggers cert issuance).

Because provision_subdomain() swallows every failure and records nothing on
the Tenant, this command is the only way to see the real state.

Makes no writes of any kind - safe to run against production.

    python manage.py diagnose_provisioning
    python manage.py diagnose_provisioning --slug greenwood
    python manage.py diagnose_provisioning --broken-only
    python manage.py diagnose_provisioning --json

Secrets are never printed: credentials are reported only as present/missing
with a short masked fingerprint so you can tell two tokens apart.
"""

import json as _json

import requests
from django.conf import settings
from django.core.management.base import BaseCommand

from integrations.clients import CloudflareClient, VercelClient
from integrations.services import ROOT_DOMAIN, VERCEL_CNAME_TARGET
from tenants.models import Tenant

OK = "OK"
FAIL = "FAIL"
WARN = "WARN"
SKIP = "SKIP"


def mask(value):
    """Fingerprint a secret so two tokens can be told apart without leaking it."""
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-2:]} (len {len(value)})"


class Command(BaseCommand):
    help = "Diagnose why tenant subdomains are missing DNS, Vercel domains, or SSL certificates."

    def add_arguments(self, parser):
        parser.add_argument(
            "--slug",
            help="Check a single tenant by slug instead of all of them.",
        )
        parser.add_argument(
            "--broken-only",
            action="store_true",
            help="Only print tenants with at least one problem.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            dest="as_json",
            help="Emit machine-readable JSON instead of the table.",
        )
        parser.add_argument(
            "--include-inactive",
            action="store_true",
            help="Include tenants that are not active (skipped by default).",
        )

    # ── credentials ──────────────────────────────────────────────────────────

    def check_credentials(self):
        """Report which provisioning env vars are set. Values are never printed."""
        expected = {
            "VERCEL_API_TOKEN": getattr(settings, "VERCEL_API_TOKEN", ""),
            "VERCEL_PROJECT_ID": getattr(settings, "VERCEL_PROJECT_ID", ""),
            "VERCEL_TEAM_ID": getattr(settings, "VERCEL_TEAM_ID", ""),
            "CLOUDFLARE_API_TOKEN": getattr(settings, "CLOUDFLARE_API_TOKEN", ""),
            "CLOUDFLARE_ZONE_ID": getattr(settings, "CLOUDFLARE_ZONE_ID", ""),
        }
        # VERCEL_TEAM_ID is genuinely optional (only needed for team-scoped projects).
        required = {k for k in expected if k != "VERCEL_TEAM_ID"}

        report = {}
        for name, value in expected.items():
            report[name] = {
                "set": bool(value),
                "fingerprint": mask(value),
                "required": name in required,
            }
        missing_required = [
            n for n in required if not expected[n]]
        return report, missing_required

    def probe_live_credentials(self):
        """
        Confirm the tokens actually work, rather than merely being present.
        A token can be set but expired, scoped to the wrong zone, or revoked -
        which produces exactly the same silent failure as a missing one.
        """
        results = {}

        # Cloudflare: read the zone.
        try:
            cf = CloudflareClient()
            resp = requests.get(
                f"{CloudflareClient.BASE_URL}/zones/{cf.zone_id}",
                headers=cf._headers(),
                timeout=15,
            )
            data = resp.json()
            if data.get("success"):
                results["cloudflare"] = {
                    "status": OK,
                    "detail": f"zone '{data['result'].get('name')}' reachable",
                }
            else:
                results["cloudflare"] = {
                    "status": FAIL,
                    "detail": f"HTTP {resp.status_code}: {data.get('errors')}",
                }
        except Exception as exc:
            results["cloudflare"] = {"status": FAIL, "detail": str(exc)}

        # Vercel: read the project.
        try:
            vc = VercelClient()
            resp = requests.get(
                f"{VercelClient.BASE_URL}/v9/projects/{vc.project_id}",
                headers=vc._headers(),
                params=vc._params(),
                timeout=15,
            )
            if resp.status_code == 200:
                results["vercel"] = {
                    "status": OK,
                    "detail": f"project '{resp.json().get('name')}' reachable",
                }
            else:
                results["vercel"] = {
                    "status": FAIL,
                    "detail": f"HTTP {resp.status_code}: {resp.text[:200]}",
                }
        except Exception as exc:
            results["vercel"] = {"status": FAIL, "detail": str(exc)}

        return results

    # ── per-tenant checks ────────────────────────────────────────────────────

    def fetch_zone_cname_map(self):
        """
        Pull every CNAME in the zone once, paginated, instead of querying per
        tenant. Returns {full_domain: record} or None if the zone is unreadable.
        """
        try:
            cf = CloudflareClient()
        except Exception:
            return None

        records = {}
        page = 1
        while True:
            try:
                resp = requests.get(
                    f"{CloudflareClient.BASE_URL}/zones/{cf.zone_id}/dns_records",
                    headers=cf._headers(),
                    params={"type": "CNAME", "per_page": 100, "page": page},
                    timeout=20,
                )
                data = resp.json()
            except Exception:
                return None
            if not data.get("success"):
                return None

            for rec in data.get("result", []):
                records[rec["name"].lower()] = rec

            info = data.get("result_info") or {}
            if page >= (info.get("total_pages") or 1):
                break
            page += 1

        return records

    def check_tenant(self, tenant, cname_map):
        full_domain = f"{tenant.slug}.{ROOT_DOMAIN}"
        row = {
            "slug": tenant.slug,
            "name": tenant.name,
            "domain": full_domain,
            "status": tenant.status,
            "is_active": tenant.is_active,
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
            "problems": [],
        }

        # ── 1. Cloudflare DNS ────────────────────────────────────────────────
        if cname_map is None:
            row["dns"] = {"status": SKIP,
                          "detail": "zone unreadable - check Cloudflare credentials"}
        else:
            rec = cname_map.get(full_domain.lower())
            if not rec:
                row["dns"] = {"status": FAIL, "detail": "no CNAME record"}
                row["problems"].append("missing DNS record")
            elif rec.get("proxied"):
                # Proxied records make Cloudflare intercept Vercel's HTTP-01
                # ACME challenge, so the certificate never issues.
                row["dns"] = {
                    "status": FAIL,
                    "detail": f"CNAME -> {rec.get('content')} but PROXIED (orange cloud); "
                              "this blocks Vercel's ACME challenge",
                }
                row["problems"].append("DNS record is proxied")
            elif rec.get("content") != VERCEL_CNAME_TARGET:
                row["dns"] = {
                    "status": WARN,
                    "detail": f"CNAME -> {rec.get('content')} (expected {VERCEL_CNAME_TARGET})",
                }
                row["problems"].append("DNS points at unexpected target")
            else:
                row["dns"] = {"status": OK,
                              "detail": f"CNAME -> {rec.get('content')} (DNS-only)"}

        # ── 2 & 3. Vercel domain + verification ──────────────────────────────
        try:
            vercel = VercelClient()
            resp = requests.get(
                f"{VercelClient.BASE_URL}/v9/projects/{vercel.project_id}/domains/{full_domain}",
                headers=vercel._headers(),
                params=vercel._params(),
                timeout=15,
            )
            if resp.status_code == 404:
                row["vercel"] = {"status": FAIL,
                                 "detail": "domain not attached to project"}
                row["problems"].append("not on Vercel project")
            elif resp.status_code != 200:
                row["vercel"] = {
                    "status": SKIP,
                    "detail": f"HTTP {resp.status_code}: {resp.text[:160]}",
                }
            else:
                data = resp.json()
                verified = data.get("verified")
                if verified:
                    row["vercel"] = {"status": OK, "detail": "attached and verified"}
                else:
                    challenges = data.get("verification") or []
                    kinds = ", ".join(
                        c.get("type", "?") for c in challenges) or "none"
                    row["vercel"] = {
                        "status": FAIL,
                        "detail": f"attached but NOT verified - no cert will issue "
                                  f"(pending challenges: {kinds})",
                    }
                    row["problems"].append("Vercel domain unverified")
        except Exception as exc:
            row["vercel"] = {"status": SKIP, "detail": str(exc)}

        # ── 4. Does HTTPS actually serve? The ground truth. ──────────────────
        try:
            resp = requests.head(
                f"https://{full_domain}/", timeout=12, allow_redirects=True)
            row["https"] = {"status": OK, "detail": f"HTTP {resp.status_code}"}
        except requests.exceptions.SSLError as exc:
            row["https"] = {"status": FAIL,
                            "detail": f"TLS error: {str(exc)[:160]}"}
            row["problems"].append("TLS handshake fails")
        except Exception as exc:
            row["https"] = {"status": WARN,
                            "detail": f"unreachable: {str(exc)[:160]}"}

        row["healthy"] = not row["problems"]
        return row

    # ── output ───────────────────────────────────────────────────────────────

    def handle(self, *args, **opts):
        as_json = opts["as_json"]
        w = self.stdout.write

        cred_report, missing_required = self.check_credentials()

        # If required credentials are missing there is no point querying the
        # database or calling the APIs: this alone explains every silent
        # provisioning failure.
        if missing_required:
            payload = {
                "credentials": cred_report,
                "live_check": None,
                "fatal": f"Missing required settings: {', '.join(sorted(missing_required))}",
                "tenants": [],
            }
            if as_json:
                w(_json.dumps(payload, indent=2))
                return
            self._print_credentials(cred_report, None)
            w("")
            w(self.style.ERROR(
                f"FATAL: {', '.join(sorted(missing_required))} not set."))
            w("")
            w("  provision_subdomain() catches the resulting auth error, logs it, and")
            w("  returns False - which is why registration appears to succeed while no")
            w("  subdomain is ever created. Set these in the Render dashboard")
            w("  (Environment tab) and redeploy, then re-run this command.")
            return

        tenants = Tenant.objects.all().order_by("created_at")
        if opts["slug"]:
            tenants = tenants.filter(slug=opts["slug"])
        if not opts["include_inactive"]:
            tenants = tenants.filter(status="active", is_active=True)
        tenants = list(tenants)

        live = self.probe_live_credentials()
        cname_map = self.fetch_zone_cname_map()

        rows = [self.check_tenant(t, cname_map) for t in tenants]
        if opts["broken_only"]:
            rows = [r for r in rows if not r["healthy"]]

        if as_json:
            w(_json.dumps(
                {"credentials": cred_report, "live_check": live,
                 "root_domain": ROOT_DOMAIN, "tenants": rows},
                indent=2,
            ))
            return

        self._print_credentials(cred_report, live)
        self._print_tenants(rows, len(tenants), opts["broken_only"])

    def _print_credentials(self, cred_report, live):
        w = self.stdout.write
        w("")
        w("=" * 78)
        w("  PROVISIONING CREDENTIALS")
        w("=" * 78)
        for name, info in cred_report.items():
            if info["set"]:
                label = self.style.SUCCESS("SET    ")
                extra = f"  {info['fingerprint']}"
            elif info["required"]:
                label = self.style.ERROR("MISSING")
                extra = "  <-- required"
            else:
                label = self.style.WARNING("unset  ")
                extra = "  (optional)"
            w(f"  {label}  {name:<24}{extra}")

        if live:
            w("")
            w("  Live API check:")
            for svc, res in live.items():
                style = self.style.SUCCESS if res["status"] == OK else self.style.ERROR
                w(f"    {style(res['status']):<6}  {svc:<12} {res['detail']}")

    def _print_tenants(self, rows, total, broken_only):
        w = self.stdout.write
        w("")
        w("=" * 78)
        w(f"  TENANT SUBDOMAINS  (root domain: {ROOT_DOMAIN})")
        w("=" * 78)

        if not rows:
            msg = "All tenants healthy." if broken_only else "No tenants matched."
            w(f"  {msg}")
            return

        for r in rows:
            headline = self.style.SUCCESS(
                "HEALTHY") if r["healthy"] else self.style.ERROR("BROKEN ")
            w("")
            w(f"  {headline}  {r['domain']}")
            w(f"           {r['name']}  |  created {(r['created_at'] or '')[:10]}")
            for check in ("dns", "vercel", "https"):
                res = r.get(check)
                if not res:
                    continue
                style = {
                    OK: self.style.SUCCESS,
                    FAIL: self.style.ERROR,
                    WARN: self.style.WARNING,
                    SKIP: self.style.WARNING,
                }.get(res["status"], self.style.WARNING)
                w(f"             {style(res['status']):<6} {check:<7} {res['detail']}")

        broken = [r for r in rows if not r["healthy"]]
        w("")
        w("-" * 78)
        w(f"  {total} tenant(s) checked | "
          f"{total - len(broken) if not broken_only else '?'} healthy | "
          f"{len(broken)} broken")
        if broken:
            w("")
            w("  Broken: " + ", ".join(r["slug"] for r in broken))
            w("")
            w("  Re-run provisioning for these once the cause is fixed:")
            w("    python manage.py shell -c \""
              "from tenants.models import Tenant; "
              "from integrations.services import provision_subdomain; "
              "[provision_subdomain(t) for t in Tenant.objects.filter(slug__in="
              f"{[r['slug'] for r in broken]})]\"")
