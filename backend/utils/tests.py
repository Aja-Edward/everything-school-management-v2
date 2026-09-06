"""
Tests for the tenant scoping of utils.sms.

Twilio credentials live on CommunicationSettings, which is one row per
tenant. The helper previously resolved them with
`CommunicationSettings.objects.first()`, so whichever school sorted first
paid for — and appeared as the sender of — every school's messages. These
tests pin the fail-closed behaviour that replaced it.
"""
from django.test import TestCase

from schoolSettings.models import CommunicationSettings
from tenants.models import Tenant
from utils.sms import send_sms_via_twilio


class SendSmsTenantScopingTest(TestCase):
    def setUp(self):
        self.school_a = Tenant.objects.create(
            name="School A",
            slug="school-a",
            status="active",
            is_active=True,
            owner_email="a@example.com",
        )
        self.school_b = Tenant.objects.create(
            name="School B",
            slug="school-b",
            status="active",
            is_active=True,
            owner_email="b@example.com",
        )
        # Only School A has Twilio set up.
        CommunicationSettings.objects.create(
            tenant=self.school_a,
            twilio_account_sid="AC" + "0" * 30,
            twilio_auth_token="token-a",
            twilio_phone_number="+15005550006",
            twilio_configured=True,
        )

    def test_configured_tenants_credentials_are_not_used_for_another_tenant(self):
        """The regression: School B must not send on School A's account."""
        success, response, sid = send_sms_via_twilio(
            "+2348000000000", "hello", tenant=self.school_b)

        self.assertFalse(success)
        self.assertIn("not configured", response)
        self.assertIsNone(sid)

    def test_no_tenant_refuses_to_send(self):
        success, response, sid = send_sms_via_twilio(
            "+2348000000000", "hello", tenant=None)

        self.assertFalse(success)
        self.assertIn("No tenant supplied", response)
        self.assertIsNone(sid)

    def test_tenant_without_settings_row_refuses_to_send(self):
        CommunicationSettings.objects.filter(tenant=self.school_a).delete()

        success, response, sid = send_sms_via_twilio(
            "+2348000000000", "hello", tenant=self.school_a)

        self.assertFalse(success)
        self.assertIn("not configured", response)
        self.assertIsNone(sid)

    def test_tenant_is_keyword_only_and_required(self):
        """A caller cannot forget to say which school is sending."""
        with self.assertRaises(TypeError):
            send_sms_via_twilio("+2348000000000", "hello")
