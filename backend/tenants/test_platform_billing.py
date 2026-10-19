"""
Billing as the platform sees it: every school's invoices, the totals, and
the actions only a platform admin takes - discounts, cancellations, money
received outside the app, and raising a school's invoice for them.
"""

import base64
import re
import zlib
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
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


def pdf_text(content):
    """The text drawn on a ReportLab PDF, whose page streams are ASCII85 + Flate."""
    streams = re.findall(rb"stream\r?\n(.*?)~>endstream", content, re.S)
    return b"".join(zlib.decompress(base64.a85decode(s))
                    for s in streams).decode("latin-1")


class PlatformBillingCase(APITestCase):
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


class PlatformBillingTest(PlatformBillingCase):
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

    def receipt(self, payment, data=None):
        return self.post(f"/api/tenants/payments/{payment.id}/receipt/", data)

    def test_each_payment_gets_a_receipt_saying_whether_it_settled_the_invoice(self):
        invoice = self.invoice_for(self.beta)  # 5 students: 4000
        self.as_platform()
        self.post(f"{INVOICES_URL}{invoice.id}/record-payment/", {"amount": "1500"})
        self.post(f"{INVOICES_URL}{invoice.id}/record-payment/", {"amount": "2500"})
        first, second = invoice.payments.order_by("confirmed_at")

        part = self.receipt(first, {"received_from": "Mrs Adaeze Okafor", "note": "With thanks"})
        full = self.receipt(second)

        number = invoice.invoice_number.removeprefix("INV-")
        self.assertEqual(part.status_code, status.HTTP_200_OK)
        self.assertEqual(part["Content-Type"], "application/pdf")
        self.assertIn(b"/Subtype /Image", part.content)  # the Nuventa Cloud logo
        self.assertIn(f'filename="RCT-{number}-1.pdf"', part["Content-Disposition"])
        self.assertIn(f'filename="RCT-{number}-2.pdf"', full["Content-Disposition"])
        # The first stays a part payment even now the invoice is paid.
        part_text, full_text = pdf_text(part.content), pdf_text(full.content)
        self.assertIn("Part payment", part_text)
        self.assertIn("Mrs Adaeze Okafor", part_text)
        self.assertIn("With thanks", part_text)
        self.assertIn("Paid in full", full_text)

    def test_a_payment_not_yet_confirmed_has_no_receipt(self):
        invoice = self.invoice_for(self.beta)
        payment = TenantPayment.objects.create(
            invoice=invoice, amount=Decimal("4000"), payment_method="manual",
            status="pending", reference="TRF-1")
        self.as_platform()

        response = self.receipt(payment)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_platform_admins_issue_receipts(self):
        invoice = self.invoice_for(self.beta)
        self.as_platform()
        self.post(f"{INVOICES_URL}{invoice.id}/record-payment/", {"amount": "4000"})
        payment = invoice.payments.get()
        school_admin = User.objects.create_user(
            username="beta_admin", email="beta_admin@example.com", role="superadmin",
            password=None, is_active=True, tenant=self.beta)
        self.client.force_authenticate(school_admin)

        response = self.client.post(
            f"/api/tenants/payments/{payment.id}/receipt/", {}, format="json",
            HTTP_X_TENANT_SLUG=self.beta.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# No platform Brevo key, so receipts go through Django's test mail outbox.
@override_settings(BREVO_API_KEY="", EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SendReceiptTest(PlatformBillingCase):
    def setUp(self):
        super().setUp()
        self.invoice = self.invoice_for(self.beta)  # 5 students: 4000
        self.as_platform()
        self.post(f"{INVOICES_URL}{self.invoice.id}/record-payment/", {"amount": "1500"})
        self.payment = self.invoice.payments.get()
        self.bursar = User.objects.create_user(
            username="beta_bursar", email="bursar@beta.example.com", role="admin",
            first_name="Ngozi", last_name="Eze", password=None, is_active=True, tenant=self.beta)

    def send(self, data=None):
        return self.post(f"/api/tenants/payments/{self.payment.id}/send-receipt/", data)

    def test_the_school_admins_to_copy_in_are_listed(self):
        response = self.client.get(f"/api/tenants/payments/{self.payment.id}/receipt-recipients/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["owner_email"], "beta-college@example.com")
        self.assertEqual(response.data["admins"],
                         [{"name": "Ngozi Eze", "email": "bursar@beta.example.com"}])

    def test_the_receipt_goes_to_the_registration_email_with_admins_copied_in(self):
        response = self.send({"cc": ["bursar@beta.example.com", "proprietress@example.com"],
                              "received_from": "Mrs Okafor"})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["beta-college@example.com"])
        self.assertEqual(sent.cc, ["bursar@beta.example.com", "proprietress@example.com"])
        self.assertIn("Mrs Okafor", sent.body)
        name, content, mimetype = sent.attachments[0]
        self.assertTrue(name.startswith("RCT-") and name.endswith(".pdf"))
        self.assertEqual(mimetype, "application/pdf")
        self.assertIn("Part payment", pdf_text(content))

    def test_a_school_with_no_registration_email_needs_someone_copied_in(self):
        Tenant.objects.filter(pk=self.beta.pk).update(owner_email="")

        refused = self.send()
        sent = self.send({"cc": ["proprietress@example.com"]})

        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(sent.status_code, status.HTTP_200_OK)
        self.assertEqual(mail.outbox[0].to, ["proprietress@example.com"])

    def test_an_address_that_is_not_an_email_is_refused(self):
        response = self.send({"cc": ["not-an-email"]})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mail.outbox, [])

    def test_only_platform_admins_send_receipts(self):
        self.client.force_authenticate(self.bursar)

        response = self.client.post(
            f"/api/tenants/payments/{self.payment.id}/send-receipt/", {}, format="json",
            HTTP_X_TENANT_SLUG=self.beta.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(mail.outbox, [])

    @override_settings(BREVO_API_KEY="test-key", DEFAULT_FROM_EMAIL="billing@nuventa.test")
    def test_with_a_platform_brevo_account_it_is_sent_through_brevo(self):
        with patch("tenants.receipts.requests.post",
                   return_value=Mock(status_code=201, text="{}")) as brevo:
            response = self.send({"cc": ["bursar@beta.example.com"]})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        payload = brevo.call_args.kwargs["json"]
        self.assertEqual(payload["sender"], {"name": "Nuventa Cloud", "email": "billing@nuventa.test"})
        self.assertEqual(payload["to"], [{"email": "beta-college@example.com"}])
        self.assertEqual(payload["cc"], [{"email": "bursar@beta.example.com"}])
        self.assertTrue(payload["attachment"][0]["name"].endswith(".pdf"))
        self.assertTrue(base64.b64decode(payload["attachment"][0]["content"]).startswith(b"%PDF"))

    def test_a_brevo_refusal_is_reported(self):
        with override_settings(BREVO_API_KEY="test-key"), \
                patch("tenants.receipts.requests.post",
                      return_value=Mock(status_code=400, text="bad sender")):
            response = self.send()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("refused", response.data["error"])


class MinStudentsTest(PlatformBillingCase):
    """Billing students a school has admitted but not yet enrolled in the app."""

    def setUp(self):
        super().setUp()
        self.invoice = self.invoice_for(self.beta)  # 5 enrolled students: 4000
        self.as_platform()

    def set_min(self, count, reason=""):
        return self.post(f"{INVOICES_URL}{self.invoice.id}/min-students/",
                         {"count": count, "reason": reason})

    def enrol(self, n):
        user = User.objects.create_user(
            username=f"late-{n}", email=f"late-{n}@example.com", role="student",
            password=None, is_active=True, tenant=self.beta)
        Student.objects.create(tenant=self.beta, user=user, gender="M",
                               date_of_birth=date(2015, 1, 1))

    def test_the_invoice_bills_the_students_still_to_be_enrolled(self):
        response = self.set_min(8, "3 admitted, not yet enrolled")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["student_count"], 8)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("6400.00"))
        text = pdf_text(self.client.get(f"{INVOICES_URL}{self.invoice.id}/pdf/").content)
        # PDF text escapes brackets.
        self.assertIn(r"8 \(5 enrolled, 3 to enrol\)", text)
        self.assertIn("3 admitted, not yet enrolled", text)

    def test_enrolling_them_later_does_not_bill_them_twice(self):
        self.set_min(8)
        for n in range(3):
            self.enrol(n)

        invoice, _ = billing.invoice_for_period(self.beta, "term")

        self.assertEqual(invoice.student_count, 8)
        self.assertEqual(invoice.total_amount, Decimal("6400.00"))

    def test_more_students_enrolled_than_the_minimum_are_all_billed(self):
        self.set_min(6)
        for n in range(3):
            self.enrol(n)

        invoice, _ = billing.invoice_for_period(self.beta, "term")

        self.assertEqual(invoice.student_count, 8)

    def test_zero_goes_back_to_the_enrolled_students(self):
        self.set_min(8, "admitted")

        response = self.set_min(0)

        self.assertEqual(response.data["student_count"], 5)
        self.assertEqual(response.data["min_student_reason"], "")

    def test_an_invoice_with_money_against_it_cannot_be_changed(self):
        self.post(f"{INVOICES_URL}{self.invoice.id}/record-payment/", {"amount": "1000"})

        response = self.set_min(8)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.student_count, 5)

    def test_only_platform_admins_set_it(self):
        school_admin = User.objects.create_user(
            username="beta_admin", email="beta_admin@example.com", role="superadmin",
            password=None, is_active=True, tenant=self.beta)
        self.client.force_authenticate(school_admin)

        response = self.client.post(
            f"{INVOICES_URL}{self.invoice.id}/min-students/", {"count": 50}, format="json",
            HTTP_X_TENANT_SLUG=self.beta.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
