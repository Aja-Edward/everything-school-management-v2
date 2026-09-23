"""
Each school's own prices, as the platform agreed them when it subscribed:
who can set them, what the school is then billed, and what it sees.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from tenants import billing
from tenants.models import SentSms, TenantInvoice, TenantPayment, TenantService
from tenants.test_platform_billing import PlatformBillingTest

User = get_user_model()


def pricing_url(school):
    return f"/api/tenants/list/{school.id}/pricing/"


class TenantPricingTest(APITestCase):
    make_school = PlatformBillingTest.make_school

    def setUp(self):
        self.platform_admin = User.objects.create_user(
            username="ops_admin", email="ops@example.com", role="platform_admin",
            password=None, is_active=True, tenant=None)
        self.alpha = self.make_school("Alpha Academy", "alpha-academy", students=10)
        self.beta = self.make_school("Beta College", "beta-college", students=4)
        self.head = User.objects.create_user(
            username="alpha_head", email="alpha_head@example.com", role="superadmin",
            password=None, is_active=True, tenant=self.alpha)

    def agree(self, school, **body):
        self.client.force_authenticate(self.platform_admin)
        body.setdefault("basic", {"price_per_student": "650"})
        return self.client.put(pricing_url(school), body, format="json")

    def switch_on(self, school, service):
        TenantService.objects.update_or_create(
            tenant=school, service=service, defaults={"is_enabled": True})

    def lines(self, invoice):
        return {(line.item_type, line.service): line for line in invoice.line_items.all()}

    # ── Setting them ──────────────────────────────────────────────────────────

    def test_a_school_with_no_agreement_pays_the_standard_prices(self):
        invoice, _ = billing.invoice_for_period(self.alpha, "term")

        self.assertEqual(invoice.base_price_per_student, Decimal("800.00"))
        self.assertEqual(invoice.total_amount, Decimal("8000.00"))

    def test_the_platform_sets_a_schools_own_basic_price(self):
        response = self.agree(self.alpha, notes="Agreed at the Sept demo")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["agreed"])
        self.assertEqual(response.data["basic"]["price_per_student"], "650.00")
        self.assertEqual(response.data["basic"]["standard_price_per_student"], "800.00")
        self.assertEqual(response.data["notes"], "Agreed at the Sept demo")

        invoice, _ = billing.invoice_for_period(self.alpha, "term")
        self.assertEqual(invoice.base_price_per_student, Decimal("650.00"))
        self.assertEqual(invoice.total_amount, Decimal("6500.00"))

    def test_one_schools_bargain_does_not_touch_another(self):
        self.agree(self.alpha)

        invoice, _ = billing.invoice_for_period(self.beta, "term")

        self.assertEqual(invoice.total_amount, Decimal("3200.00"))

    def test_an_agreed_session_price_need_not_be_three_terms(self):
        self.agree(self.alpha, basic={"price_per_student": "650", "price_per_student_per_session": "1800"})

        invoice, _ = billing.invoice_for_period(self.alpha, "session")

        self.assertEqual(self.lines(invoice)[("base", None)].unit_price, Decimal("1800.00"))
        self.assertEqual(invoice.base_amount, Decimal("18000.00"))
        self.assertEqual(invoice.total_amount, Decimal("18000.00"))

    def test_without_a_session_price_a_session_is_three_agreed_terms(self):
        self.agree(self.alpha)

        invoice, _ = billing.invoice_for_period(self.alpha, "session")

        self.assertEqual(invoice.total_amount, Decimal("19500.00"))

    def test_add_ons_and_sms_can_be_bargained_too(self):
        self.switch_on(self.alpha, "cbt")
        self.switch_on(self.alpha, "gate_tracker")
        SentSms.objects.create(tenant=self.alpha, recipient="2348030000000")
        SentSms.objects.create(tenant=self.alpha, recipient="2348030000001")
        self.agree(self.alpha, sms={"price_per_message": "7.50"},
                   add_ons=[{"service": "cbt", "price_per_student": "60"}])

        invoice, _ = billing.invoice_for_period(self.alpha, "term")
        lines = self.lines(invoice)

        self.assertEqual(lines[("service", "cbt")].unit_price, Decimal("60.00"))
        # Not bargained, so still the standard price.
        self.assertEqual(lines[("service", "gate_tracker")].unit_price, Decimal("1300.00"))
        self.assertEqual(lines[("service", "sms_notifications")].unit_price, Decimal("7.50"))
        self.assertEqual(invoice.total_amount,
                         Decimal("6500.00") + Decimal("600.00") + Decimal("13000.00") + Decimal("15.00"))

    def test_clearing_an_add_on_price_puts_it_back_on_the_standard(self):
        self.agree(self.alpha, add_ons=[{"service": "cbt", "price_per_student": "60"}])

        response = self.agree(self.alpha, add_ons=[{"service": "cbt", "price_per_student": ""}])

        cbt = next(a for a in response.data["add_ons"] if a["service"] == "cbt")
        self.assertIsNone(cbt["price_per_student"])
        self.assertEqual(cbt["standard_price_per_student"], "100.00")

    def test_forgetting_the_agreement_restores_the_standard_prices(self):
        self.agree(self.alpha)

        response = self.client.delete(pricing_url(self.alpha))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["agreed"])
        invoice, _ = billing.invoice_for_period(self.alpha, "term")
        self.assertEqual(invoice.total_amount, Decimal("8000.00"))

    def test_bad_prices_are_refused(self):
        for basic in ({"price_per_student": ""}, {"price_per_student": "-5"},
                      {"price_per_student": "lots"}):
            response = self.agree(self.alpha, basic=basic)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, basic)

        response = self.agree(self.alpha, add_ons=[{"service": "fees", "price_per_student": "5"}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Invoices already raised ───────────────────────────────────────────────

    def test_an_unpaid_invoice_is_repriced_when_the_price_changes(self):
        invoice, _ = billing.invoice_for_period(self.alpha, "term")

        response = self.agree(self.alpha)

        self.assertEqual(response.data["invoices_repriced"], 1)
        invoice.refresh_from_db()
        self.assertEqual(invoice.total_amount, Decimal("6500.00"))

    def test_a_paid_invoice_keeps_the_price_it_was_paid_at(self):
        invoice, _ = billing.invoice_for_period(self.alpha, "term")
        TenantPayment.objects.create(
            invoice=invoice, amount=Decimal("8000.00"), payment_method="paystack",
            status="confirmed")
        invoice.record_payment(Decimal("8000.00"))

        response = self.agree(self.alpha)

        self.assertEqual(response.data["invoices_repriced"], 0)
        invoice.refresh_from_db()
        self.assertEqual(invoice.total_amount, Decimal("8000.00"))

    # ── Who may, and what the school sees ─────────────────────────────────────

    def test_a_school_cannot_set_its_own_price(self):
        self.client.force_authenticate(self.head)

        response = self.client.put(
            pricing_url(self.alpha), {"basic": {"price_per_student": "1"}},
            format="json", HTTP_X_TENANT_SLUG=self.alpha.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(billing.pricing.basic_price(self.alpha), Decimal("800.00"))

    def test_the_school_sees_its_own_prices_on_its_services_page(self):
        self.agree(self.alpha, basic={"price_per_student": "650"}, sms={"price_per_message": "7.50"},
                   add_ons=[{"service": "cbt", "price_per_student": "60"}])
        self.client.force_authenticate(self.head)

        response = self.client.get("/api/tenants/services/", HTTP_X_TENANT_SLUG=self.alpha.slug)

        services = {row["service"]: row for row in response.data}
        self.assertEqual(services["basic"]["price_per_student"], 650)
        self.assertEqual(services["basic"]["price_per_student_per_session"], 1950)
        self.assertEqual(services["cbt"]["price_per_student"], 60)
        self.assertEqual(services["gate_tracker"]["price_per_student"], 1300)
        self.assertEqual(services["sms_notifications"]["price_per_message"], 7.5)
