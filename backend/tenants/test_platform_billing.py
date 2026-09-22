"""
Billing as the platform sees it: every school's invoices, the totals, and
the actions only a platform admin takes - discounts, cancellations, money
received outside the app, and raising a school's invoice for them.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, Term, TermType
from students.models import Student
from tenants import billing
from tenants.models import SentSms, Tenant, TenantInvoice, TenantPayment, TenantService

User = get_user_model()

INVOICES_URL = "/api/tenants/invoices/"
SUMMARY_URL = "/api/tenants/invoices/platform-summary/"


class PlatformBillingTest(APITestCase):
    def setUp(self):
        # A Platform Users panel admin: platform staff without being a superuser.
        self.platform_admin = User.objects.create_user(
            username="ops_admin", email="ops@example.com", role="platform_admin",
            password=None, is_active=True, tenant=None)
        self.alpha = self.make_school("Alpha Academy", "alpha-academy", students=10)
        self.beta = self.make_school("Beta College", "beta-college", students=5, status="pending")

    def make_school(self, name, slug, students, status="active"):
        school = Tenant.objects.create(
            name=name, slug=slug, status=status, is_active=True,
            owner_email=f"{slug}@example.com")
        session = AcademicSession.objects.create(
            tenant=school, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        term_type, _ = TermType.objects.get_or_create(
            tenant=school, code="FT", defaults={"name": "First Term", "display_order": 1})
        Term.objects.create(
            tenant=school, term_type=term_type, academic_session=session,
            start_date=date(2026, 9, 7), end_date=date(2026, 12, 16), is_current=True)
        for n in range(students):
            user = User.objects.create_user(
                username=f"{slug}-pupil{n}", email=f"{slug}-pupil{n}@example.com",
                role="student", password=None, is_active=True, tenant=school)
            Student.objects.create(
                tenant=school, user=user, gender="F", date_of_birth=date(2015, 1, 1))
        return school

    def invoice_for(self, school):
        invoice, _ = billing.invoice_for_period(school, "term")
        return invoice

    def as_platform(self):
        self.client.force_authenticate(self.platform_admin)

    def post(self, url, data=None):
        return self.client.post(url, data or {}, format="json")

    def test_platform_admins_see_every_schools_invoices_and_can_filter_by_school(self):
        alpha_invoice = self.invoice_for(self.alpha)
        self.invoice_for(self.beta)
        self.as_platform()

        everything = self.client.get(INVOICES_URL)
        just_alpha = self.client.get(INVOICES_URL, {"tenant": str(self.alpha.id)})

        self.assertEqual(everything.data["count"], 2)
        self.assertEqual(
            [row["id"] for row in just_alpha.data["results"]], [str(alpha_invoice.id)])
        self.assertEqual(just_alpha.data["results"][0]["school_name"], "Alpha Academy")

    def test_the_summary_adds_up_what_is_owed_collected_and_late(self):
        paid = self.invoice_for(self.alpha)  # 10 x 800 = 8,000
        TenantPayment.objects.create(
            invoice=paid, amount=Decimal("8000.00"), payment_method="paystack",
            status="confirmed")
        paid.record_payment(Decimal("8000.00"))
        late = self.invoice_for(self.beta)  # 5 x 800 = 4,000
        TenantInvoice.objects.filter(pk=late.pk).update(
            due_date=timezone.localdate() - timedelta(days=1))
        TenantPayment.objects.create(
            invoice=late, amount=Decimal("1000.00"), payment_method="manual", status="pending")
        self.as_platform()

        summary = self.client.get(SUMMARY_URL).data

        self.assertEqual(summary["total_invoiced"], 12000)
        self.assertEqual(summary["total_collected"], 8000)
        self.assertEqual(summary["collected_by_paystack"], 8000)
        self.assertEqual(summary["collected_by_transfer"], 0)
        self.assertEqual(summary["total_outstanding"], 4000)
        self.assertEqual(summary["schools_owing"], 1)
        self.assertEqual(summary["overdue_count"], 1)
        self.assertEqual(summary["overdue_total"], 4000)
        self.assertEqual(summary["transfers_awaiting_confirmation"], 1)

    def test_a_discount_comes_off_the_total_with_its_reason(self):
        invoice = self.invoice_for(self.alpha)
        self.as_platform()

        response = self.post(
            f"{INVOICES_URL}{invoice.id}/discount/", {"amount": "1500", "reason": "Pilot school"})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.total_amount, Decimal("6500.00"))
        self.assertEqual(invoice.balance_due, Decimal("6500.00"))
        self.assertEqual(invoice.discount_reason, "Pilot school")

    def test_a_discount_cannot_exceed_the_subtotal(self):
        invoice = self.invoice_for(self.alpha)
        self.as_platform()

        response = self.post(f"{INVOICES_URL}{invoice.id}/discount/", {"amount": "9000"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancelling_frees_the_period_for_a_new_invoice(self):
        invoice = self.invoice_for(self.alpha)
        self.as_platform()

        response = self.post(f"{INVOICES_URL}{invoice.id}/cancel/", {"reason": "Raised in error"})

        self.assertEqual(response.data["status"], "cancelled")
        self.assertNotEqual(self.invoice_for(self.alpha).id, invoice.id)

    def test_cancelling_leaves_its_texts_for_the_next_invoice(self):
        TenantService.objects.create(tenant=self.alpha, service="sms_notifications", is_enabled=True)
        SentSms.objects.create(tenant=self.alpha, recipient="2348000000001")
        invoice = self.invoice_for(self.alpha)
        self.as_platform()

        self.post(f"{INVOICES_URL}{invoice.id}/cancel/")

        self.assertEqual(self.invoice_for(self.alpha).sent_sms.count(), 1)

    def test_an_invoice_with_money_against_it_cannot_be_cancelled(self):
        invoice = self.invoice_for(self.alpha)
        TenantPayment.objects.create(
            invoice=invoice, amount=Decimal("500.00"), payment_method="manual", status="pending")
        self.as_platform()

        response = self.post(f"{INVOICES_URL}{invoice.id}/cancel/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "pending")

    def test_money_received_outside_the_app_pays_the_invoice_and_activates_the_school(self):
        invoice = self.invoice_for(self.beta)  # 4,000; Beta is still pending activation
        self.as_platform()

        part = self.post(f"{INVOICES_URL}{invoice.id}/record-payment/", {"amount": "1500", "notes": "Cash"})
        rest = self.post(f"{INVOICES_URL}{invoice.id}/record-payment/", {"amount": "2500"})

        self.assertEqual(part.data["status"], "partially_paid")
        self.assertEqual(rest.data["status"], "paid")
        self.assertEqual(Decimal(rest.data["balance_due"]), Decimal("0.00"))
        self.assertEqual(
            TenantPayment.objects.filter(invoice=invoice, status="confirmed").count(), 2)
        self.beta.refresh_from_db()
        self.assertEqual(self.beta.status, "active")

    def test_recording_more_than_is_owed_is_refused(self):
        invoice = self.invoice_for(self.beta)
        self.as_platform()

        response = self.post(f"{INVOICES_URL}{invoice.id}/record-payment/", {"amount": "4000.01"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_platform_admin_can_raise_a_schools_invoice_for_them(self):
        self.as_platform()

        response = self.post(
            f"{INVOICES_URL}generate/", {"billing_period": "session", "tenant": str(self.alpha.id)})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["school_name"], "Alpha Academy")
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("24000.00"))

    def test_a_platform_admin_can_confirm_a_bank_transfer(self):
        invoice = self.invoice_for(self.alpha)
        transfer = TenantPayment.objects.create(
            invoice=invoice, amount=Decimal("8000.00"), payment_method="manual", status="pending")
        self.as_platform()

        response = self.post(f"/api/tenants/payments/{transfer.id}/confirm/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "paid")

    def test_schools_and_marketers_cannot_use_the_platform_actions(self):
        invoice = self.invoice_for(self.alpha)
        school_admin = User.objects.create_user(
            username="alpha_admin", email="alpha_admin@example.com", role="superadmin",
            password=None, is_active=True, tenant=self.alpha)
        marketer = User.objects.create_user(
            username="a_marketer", email="marketer@example.com", role="marketer",
            password=None, is_active=True, tenant=None)

        for user, headers in ((school_admin, {"HTTP_X_TENANT_SLUG": self.alpha.slug}), (marketer, {})):
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                summary = self.client.get(SUMMARY_URL, **headers)
                discount = self.client.post(
                    f"{INVOICES_URL}{invoice.id}/discount/", {"amount": "8000"},
                    format="json", **headers)
                self.assertEqual(summary.status_code, status.HTTP_403_FORBIDDEN)
                self.assertEqual(discount.status_code, status.HTTP_403_FORBIDDEN)

        invoice.refresh_from_db()
        self.assertEqual(invoice.discount_amount, 0)
