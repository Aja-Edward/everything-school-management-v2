from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, TestCase, override_settings

from .middleware import TenantMiddleware, TenantRequiredMiddleware
from .models import Tenant

User = get_user_model()

# A path that is neither public (so the middleware actually resolves a tenant)
# nor exempt from TenantRequiredMiddleware.
TENANT_PATH = "/api/students/"

# Read off the middleware rather than settings: it snapshots PLATFORM_DOMAIN
# into a class attribute at import time, so override_settings cannot move it
# and a hardcoded copy here would silently diverge.
PLATFORM_DOMAIN = TenantMiddleware.PLATFORM_DOMAIN

# A host that reaches step 4 onwards without resolving earlier: 'www' is in
# EXCLUDED_SUBDOMAINS, so the subdomain branch declines to even look it up.
NEUTRAL_HOST = f"www.{PLATFORM_DOMAIN}"

# ALLOWED_HOSTS is localhost-only in dev, and request.get_host() validates
# against it -- without this every host below raises DisallowedHost.
allow_any_host = override_settings(ALLOWED_HOSTS=["*"])


def make_tenant(slug, status="active", is_active=True, **extra):
    return Tenant.objects.create(
        name=slug.replace("-", " ").title(),
        slug=slug,
        owner_email=f"{slug}@example.com",
        status=status,
        is_active=is_active,
        **extra,
    )


class ActiveTenantCheckTest(TestCase):
    """The single definition every resolution branch shares."""

    def test_accepts_only_active_and_flagged(self):
        """A tenant is reachable exactly when status='active' AND is_active."""
        self.assertTrue(
            TenantMiddleware._is_active_tenant(
                make_tenant("open-school", "active", True)
            )
        )

    def test_rejects_suspended(self):
        """suspend() writes status='suspended', is_active=False."""
        self.assertFalse(
            TenantMiddleware._is_active_tenant(
                make_tenant("gone-school", "suspended", False)
            )
        )

    def test_rejects_pending(self):
        """A tenant awaiting activation is not reachable."""
        self.assertFalse(
            TenantMiddleware._is_active_tenant(
                make_tenant("new-school", "pending", False)
            )
        )

    def test_rejects_status_drift_active_flag(self):
        """is_active=True must not outvote a non-active status."""
        self.assertFalse(
            TenantMiddleware._is_active_tenant(
                make_tenant("drift-a", "suspended", True)
            )
        )

    def test_rejects_status_drift_active_status(self):
        """status='active' must not outvote is_active=False."""
        self.assertFalse(
            TenantMiddleware._is_active_tenant(make_tenant("drift-b", "active", False))
        )

    def test_rejects_none(self):
        """A user with no tenant FK resolves to nothing, not a crash."""
        self.assertFalse(TenantMiddleware._is_active_tenant(None))


@allow_any_host
class TenantMiddlewareResolutionTest(TestCase):
    """Each of the six resolution branches, active and inactive."""

    def setUp(self):
        self.factory = RequestFactory()
        self.resolved = []
        self.middleware = TenantMiddleware(self._capture)

    def _capture(self, request):
        """Stand-in for the rest of the stack; records what was resolved."""
        self.resolved.append(request.tenant)
        return "response"

    def run_request(self, host=NEUTRAL_HOST, path=TENANT_PATH, user=None,
                    session=None, **headers):
        request = self.factory.get(path, HTTP_HOST=host, **headers)
        request.user = user or AnonymousUser()
        if session is not None:
            request.session = session
        self.middleware(request)
        return self.resolved[-1]

    # --- 3. platform subdomain -------------------------------------------

    def test_subdomain_resolves_active_tenant(self):
        """The ordinary path: an active school reached on its own subdomain."""
        tenant = make_tenant("alpha-school")
        self.assertEqual(
            self.run_request(host=f"alpha-school.{PLATFORM_DOMAIN}"), tenant
        )

    def test_subdomain_refuses_suspended_tenant(self):
        """Suspending a school closes its subdomain."""
        make_tenant("beta-school", "suspended", False)
        self.assertIsNone(self.run_request(host=f"beta-school.{PLATFORM_DOMAIN}"))

    # --- 2. custom domain -------------------------------------------------

    def test_custom_domain_resolves_when_verified(self):
        """A verified custom domain on an active tenant resolves."""
        tenant = make_tenant(
            "gamma-school",
            custom_domain="gamma.example.com",
            custom_domain_verified=True,
        )
        self.assertEqual(self.run_request(host="gamma.example.com"), tenant)

    def test_custom_domain_refuses_suspended_tenant(self):
        """Suspending a school closes its custom domain too."""
        make_tenant(
            "delta-school",
            "suspended",
            False,
            custom_domain="delta.example.com",
            custom_domain_verified=True,
        )
        self.assertIsNone(self.run_request(host="delta.example.com"))

    # --- 4. X-Tenant-* header (previously missing the status check) -------

    def test_header_resolves_active_tenant_by_slug(self):
        """X-Tenant-Slug reaches an active tenant."""
        tenant = make_tenant("eps-school")
        self.assertEqual(
            self.run_request(HTTP_X_TENANT_SLUG="eps-school"), tenant
        )

    def test_header_resolves_active_tenant_by_id(self):
        """X-Tenant-ID reaches an active tenant."""
        tenant = make_tenant("zeta-school")
        self.assertEqual(
            self.run_request(HTTP_X_TENANT_ID=str(tenant.id)), tenant
        )

    def test_header_refuses_suspended_tenant(self):
        """REGRESSION: the header branch must honour status, not just is_active."""
        make_tenant("eta-school", "suspended", False)
        self.assertIsNone(self.run_request(HTTP_X_TENANT_SLUG="eta-school"))

    def test_header_refuses_status_drift(self):
        """REGRESSION: is_active=True alone used to let a suspended tenant through."""
        make_tenant("theta-school", "suspended", True)
        self.assertIsNone(self.run_request(HTTP_X_TENANT_SLUG="theta-school"))

    # --- 5. logged-in user's tenant (previously checked nothing) ----------

    def make_user(self, tenant, username):
        return User.objects.create_user(
            username=username,
            password="x",
            email=f"{username}@example.com",
            first_name="A",
            last_name="B",
            role="superadmin",
            tenant=tenant,
            is_active=True,
        )

    def test_user_fallback_resolves_active_tenant(self):
        """A logged-in user still reaches their own active school."""
        tenant = make_tenant("iota-school")
        user = self.make_user(tenant, "iota_admin")
        self.assertEqual(self.run_request(user=user), tenant)

    def test_user_fallback_refuses_inactive_tenant(self):
        """REGRESSION: deactivating a school must evict live sessions too.

        This branch reads the FK straight off the user rather than through a
        filtered queryset, so before the fix it returned the tenant whatever
        its status - deactivating closed the subdomain but left anyone already
        holding a session with full access.
        """
        tenant = make_tenant("kappa-school", "inactive", False)
        user = self.make_user(tenant, "kappa_admin")
        self.assertIsNone(self.run_request(user=user))

    def test_user_fallback_refuses_suspended_tenant(self):
        """REGRESSION: same for an explicitly suspended school."""
        tenant = make_tenant("lambda-school", "suspended", False)
        user = self.make_user(tenant, "lambda_admin")
        self.assertIsNone(self.run_request(user=user))

    # --- 6. session (previously missing the status check) ------------------

    def test_session_resolves_active_tenant(self):
        """A tenant_id left in the session reaches an active tenant."""
        tenant = make_tenant("mu-school")
        self.assertEqual(
            self.run_request(session={"tenant_id": str(tenant.id)}), tenant
        )

    def test_session_refuses_suspended_tenant(self):
        """REGRESSION: the session branch must honour status, not just is_active."""
        tenant = make_tenant("nu-school", "suspended", False)
        self.assertIsNone(
            self.run_request(session={"tenant_id": str(tenant.id)})
        )

    def test_session_refuses_status_drift(self):
        """REGRESSION: is_active=True alone used to let a suspended tenant through."""
        tenant = make_tenant("xi-school", "suspended", True)
        self.assertIsNone(
            self.run_request(session={"tenant_id": str(tenant.id)})
        )

    # --- public paths ------------------------------------------------------

    def test_public_path_skips_resolution(self):
        """Registration must stay reachable with no tenant context at all."""
        make_tenant("omicron-school")
        self.assertIsNone(
            self.run_request(
                host=f"omicron-school.{PLATFORM_DOMAIN}",
                path="/api/tenants/register/",
            )
        )


class TenantRequiredMiddlewareTest(TestCase):
    """The 404 gate that turns 'no tenant resolved' into a closed door."""

    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = TenantRequiredMiddleware(lambda r: "response")

    def test_blocks_tenant_path_without_tenant(self):
        """A deactivated school's users get 404 on tenant-scoped endpoints."""
        request = self.factory.get(TENANT_PATH)
        request.tenant = None
        self.assertEqual(self.middleware(request).status_code, 404)

    def test_allows_tenant_path_with_tenant(self):
        """An active school passes through untouched."""
        request = self.factory.get(TENANT_PATH)
        request.tenant = make_tenant("pi-school")
        self.assertEqual(self.middleware(request), "response")

    def test_allows_exempt_path_without_tenant(self):
        """The bulk-upload template is exempt and must stay reachable."""
        request = self.factory.get("/api/students/bulk-upload/template/")
        request.tenant = None
        self.assertEqual(self.middleware(request), "response")
