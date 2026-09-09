import inspect

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from security.utils import record_login_attempt
from tenants.models import Tenant

User = get_user_model()


class WebLoginUpdatesLastLoginTest(APITestCase):
    """
    last_login has to survive the web login path.

    SimpleLoginView mints its token with RefreshToken.for_user(), which does
    nothing but mint a token. SIMPLE_JWT["UPDATE_LAST_LOGIN"] only reaches
    TokenObtainPairSerializer, so for every account that had only ever signed
    in through the browser last_login stayed None -- and it read as though
    nobody on the platform had ever logged in.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Login School",
            slug="login-school",
            status="active",
            is_active=True,
            owner_email="login@example.com",
        )
        self.password = "testpass123"
        self.user = User.objects.create_user(
            username="loginuser",
            email="loginuser@example.com",
            first_name="Login",
            last_name="User",
            role="teacher",
            password=self.password,
            is_active=True,
            tenant=self.tenant,
        )

    def _login(self, identifier):
        return self.client.post(
            reverse("login"),
            {"email": identifier, "password": self.password},
            format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug,
        )

    def test_last_login_is_set_after_a_web_login(self):
        self.assertIsNone(self.user.last_login)

        response = self._login(self.user.email)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(
            self.user.last_login,
            "web login left last_login unset - the field is unusable for "
            "answering whether an account is in use",
        )

    def test_it_works_when_signing_in_by_username(self):
        """The serializer accepts either; both are the same login."""
        response = self._login(self.user.username)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_a_failed_login_does_not_set_it(self):
        response = self.client.post(
            reverse("login"),
            {"email": self.user.email, "password": "wrong-password"},
            format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug,
        )

        self.assertNotEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.last_login)


class RecordLoginAttemptIsDefinedOnceTest(APITestCase):
    """
    There were two definitions of record_login_attempt in security/utils.py.
    The later one won, so the earlier one's opt-in gate never ran.

    Reviving that gate would have been worse than deleting it: its early
    return skipped the brute-force check too, so honouring it would switch off
    account lockout for any tenant that had not opted in.
    """

    def test_brute_force_check_still_reachable(self):
        source = inspect.getsource(record_login_attempt)
        self.assertIn(
            "_check_and_handle_brute_force",
            source,
            "account lockout must stay reachable from the recording path",
        )

    def test_recording_is_not_gated_on_the_security_opt_in(self):
        source = inspect.getsource(record_login_attempt)
        self.assertNotIn(
            "_is_security_enabled",
            source,
            "gating here also gates brute-force lockout - see the docstring",
        )
