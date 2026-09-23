"""
Collecting fees into the school's own Paystack account: whose keys are used,
who may see them, and whether the keys are really any good.
"""
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from fee.models import PaymentGatewayConfig
from fee.services.paystack_service import PaystackNotConfigured, PaystackService
from tenants.models import Tenant

User = get_user_model()

GATEWAYS = "/api/fee/payment-gateways/"


@override_settings(PAYSTACK_SECRET_KEY="sk_test_platform", PAYSTACK_PUBLIC_KEY="pk_test_platform")
class SchoolPaystackTest(APITestCase):
    def setUp(self):
        self.school = self.make_school("Kebi Academy", "kebi-academy")
        self.admin = self.make_user("kebi_head", "superadmin", self.school)

    def make_school(self, name, slug):
        return Tenant.objects.create(
            name=name, slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com")

    def make_user(self, username, role, school):
        return User.objects.create_user(
            username=username, email=f"{username}@example.com", role=role, password=None,
            is_active=True, is_staff=(role == "superadmin"), tenant=school)

    def configure(self, school=None, public="pk_test_school", secret="sk_test_school_9876"):
        return PaymentGatewayConfig.objects.create(
            tenant=school or self.school, gateway="PAYSTACK", is_active=True,
            is_test_mode=True, public_key=public, secret_key=secret,
            min_amount=Decimal("100.00"), max_amount=Decimal("1000000.00"))

    def as_admin(self):
        self.client.force_authenticate(self.admin)
        return {"HTTP_X_TENANT_SLUG": self.school.slug}

    # ── Whose account ─────────────────────────────────────────────────────────

    def test_a_schools_fees_go_to_its_own_keys_not_the_platforms(self):
        self.configure()

        paystack = PaystackService.for_school(self.school)

        self.assertEqual(paystack.secret_key, "sk_test_school_9876")
        self.assertEqual(paystack.public_key, "pk_test_school")
        self.assertIn("sk_test_school_9876", paystack.headers["Authorization"])

    def test_a_school_that_has_not_set_paystack_up_is_told_so(self):
        with self.assertRaises(PaystackNotConfigured) as refused:
            PaystackService.for_school(self.school)

        self.assertIn("has not set up Paystack", str(refused.exception))

    def test_half_a_setup_is_refused_rather_than_charged_to_nobody(self):
        self.configure(secret="")

        with self.assertRaises(PaystackNotConfigured) as refused:
            PaystackService.for_school(self.school)

        self.assertIn("incomplete", str(refused.exception))

    def test_one_schools_keys_are_never_used_for_another(self):
        self.configure()
        other = self.make_school("Rival School", "rival-school")

        with self.assertRaises(PaystackNotConfigured):
            PaystackService.for_school(other)

    # ── The keys themselves ───────────────────────────────────────────────────

    def test_the_secret_key_never_comes_back_out(self):
        config = self.configure()

        response = self.client.get(f"{GATEWAYS}{config.id}/", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertNotIn("secret_key", response.data)
        self.assertTrue(response.data["secret_key_saved"])
        self.assertEqual(response.data["secret_key_hint"], "…9876")
        self.assertEqual(response.data["public_key"], "pk_test_school")

    def test_saving_without_retyping_the_secret_keeps_it(self):
        config = self.configure()

        response = self.client.patch(
            f"{GATEWAYS}{config.id}/", {"public_key": "pk_test_new", "secret_key": ""},
            format="json", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        config.refresh_from_db()
        self.assertEqual(config.secret_key, "sk_test_school_9876")
        self.assertEqual(config.public_key, "pk_test_new")

    def test_a_school_setting_paystack_up_for_the_first_time(self):
        response = self.client.post(
            GATEWAYS,
            {"gateway": "PAYSTACK", "public_key": "pk_test_first",
             "secret_key": "sk_test_first_4321", "is_test_mode": True, "is_active": True},
            format="json", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertNotIn("secret_key", response.data)
        config = PaymentGatewayConfig.objects.get(gateway="PAYSTACK")
        self.assertEqual(config.tenant, self.school)
        self.assertEqual(config.secret_key, "sk_test_first_4321")
        self.assertEqual(PaystackService.for_school(self.school).secret_key,
                         "sk_test_first_4321")

    def test_another_schools_keys_are_out_of_reach(self):
        other = self.make_school("Rival School", "rival-school")
        theirs = self.configure(school=other)

        response = self.client.get(f"{GATEWAYS}{theirs.id}/", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_parent_cannot_read_the_schools_keys(self):
        config = self.configure()
        self.client.force_authenticate(self.make_user("a_parent", "parent", self.school))

        response = self.client.get(
            f"{GATEWAYS}{config.id}/", HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Testing the connection ────────────────────────────────────────────────

    def test_testing_the_connection_asks_paystack_with_the_schools_key(self):
        config = self.configure()

        with patch("fee.services.paystack_service.requests.get",
                   return_value=Mock(status_code=200)) as get:
            response = self.client.post(
                f"{GATEWAYS}{config.id}/test_connection/", {}, format="json", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["success"])
        self.assertIn("test mode", response.data["message"])
        self.assertEqual(get.call_args.kwargs["headers"]["Authorization"],
                         "Bearer sk_test_school_9876")

    def test_a_key_paystack_refuses_is_reported_as_refused(self):
        config = self.configure(secret="sk_test_wrong")
        refused = Mock(status_code=401)
        refused.json.return_value = {"message": "Invalid key"}

        with patch("fee.services.paystack_service.requests.get", return_value=refused):
            response = self.client.post(
                f"{GATEWAYS}{config.id}/test_connection/", {}, format="json", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])
        self.assertIn("refused", response.data["message"])
