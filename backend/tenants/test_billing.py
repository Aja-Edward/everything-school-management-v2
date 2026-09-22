"""
What a school is billed: the Basic package at ₦800 per student per term,
add-ons on top at their own prices, and a session billed as three terms.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, Term, TermType
from students.models import Student
from tenants.models import SentSms, Tenant, TenantInvoice, TenantPayment, TenantService

User = get_user_model()

QUOTE_URL = "/api/tenants/invoices/quote/"
GENERATE_URL = "/api/tenants/invoices/generate/"


class SchoolBillingTest(APITestCase):
    def setUp(self):
        self.school = Tenant.objects.create(
            name="Alpha Academy", slug="alpha-academy", status="active",
            is_active=True, owner_email="alpha@example.com")
        self.session = AcademicSession.objects.create(
            tenant=self.school, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        term_type, _ = TermType.objects.get_or_create(
            tenant=self.school, code="FT", defaults={"name": "First Term", "display_order": 1})
        self.term = Term.objects.create(
            tenant=self.school, term_type=term_type, academic_session=self.session,
            start_date=date(2026, 9, 7), end_date=date(2026, 12, 16), is_current=True)
        self.admin = self.make_user("alpha_admin", "superadmin")
        for n in range(10):
            self.enrol(f"pupil{n}")

    def make_user(self, username, role):
        return User.objects.create_user(
            username=username, email=f"{username}@example.com", role=role,
            password=None, is_active=True, tenant=self.school)

    def enrol(self, username, is_active=True):
        return Student.objects.create(
            tenant=self.school, user=self.make_user(username, "student"),
            gender="F", date_of_birth=date(2015, 1, 1), is_active=is_active)

    def switch_on(self, *services):
        for service in services:
            TenantService.objects.update_or_create(
                tenant=self.school, service=service, defaults={"is_enabled": True})

    def as_admin(self):
        self.client.force_authenticate(self.admin)
        return {"HTTP_X_TENANT_SLUG": self.school.slug}

    def quote(self, billing_period):
        response = self.client.get(
            QUOTE_URL, {"billing_period": billing_period}, **self.as_admin())
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def generate(self, billing_period):
        return self.client.post(
            GENERATE_URL, {"billing_period": billing_period}, format="json", **self.as_admin())

    def test_a_term_is_the_basic_package_for_every_active_student(self):
        self.enrol("left_school", is_active=False)
        # Services in the Basic package add nothing, however many are on, and
        # the SMS add-on adds nothing until a text is sent.
        self.switch_on("attendance", "timetable", "email_notifications", "sms_notifications")

        quote = self.quote("term")

        self.assertEqual(quote["student_count"], 10)
        self.assertEqual(quote["term"], self.term.id)
        self.assertEqual(
            [(line["description"], line["unit_price"]) for line in quote["lines"]],
            [("Basic package", "800.00")])
        self.assertEqual(Decimal(quote["total"]), Decimal("8000.00"))

    def test_a_session_is_three_terms_with_add_ons_at_their_session_price(self):
        self.switch_on("cbt", "gate_tracker")

        quote = self.quote("session")

        self.assertIsNone(quote["term"])
        prices = {line["description"]: line["unit_price"] for line in quote["lines"]}
        self.assertEqual(prices, {
            "Basic package": "2400.00",
            "Computer-Based Testing (CBT)": "300.00",
            "Gate Tracker": "3900.00",
        })
        self.assertEqual(Decimal(quote["total"]), Decimal("66000.00"))

    def test_generating_raises_the_invoice_the_quote_described(self):
        self.switch_on("cbt")

        response = self.generate("term")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = TenantInvoice.objects.get(id=response.data["id"])
        self.assertEqual(invoice.status, "pending")
        self.assertEqual(invoice.term, self.term)
        self.assertEqual(invoice.student_count, 10)
        self.assertEqual(invoice.base_amount, Decimal("8000.00"))
        self.assertEqual(invoice.services_amount, Decimal("1000.00"))
        self.assertEqual(invoice.total_amount, Decimal("9000.00"))
        self.assertEqual(invoice.balance_due, Decimal("9000.00"))
        self.assertIsNotNone(invoice.due_date)

    def test_generating_again_updates_the_unpaid_invoice_instead_of_adding_one(self):
        first = self.generate("term").data
        self.switch_on("gate_tracker")
        self.enrol("new_pupil")

        response = self.generate("term")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], first["id"])
        self.assertEqual(TenantInvoice.objects.filter(tenant=self.school).count(), 1)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("23100.00"))

    def test_switching_an_add_on_on_reprices_the_unpaid_invoice(self):
        invoice_id = self.generate("term").data["id"]

        self.client.post(
            "/api/tenants/services/toggle/", {"service": "cbt", "enable": True},
            format="json", **self.as_admin())

        self.assertEqual(
            TenantInvoice.objects.get(id=invoice_id).total_amount, Decimal("9000.00"))

    def test_an_invoice_with_money_against_it_is_not_repriced(self):
        invoice = TenantInvoice.objects.get(id=self.generate("term").data["id"])
        TenantPayment.objects.create(
            invoice=invoice, amount=Decimal("8000.00"), payment_method="paystack",
            status="confirmed")
        invoice.record_payment(Decimal("8000.00"))
        self.switch_on("gate_tracker")

        response = self.generate("term")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data["total_amount"]), Decimal("8000.00"))
        self.assertEqual(response.data["status"], "paid")

    def test_a_school_with_no_current_session_is_told_what_to_set(self):
        AcademicSession.objects.filter(pk=self.session.pk).update(is_current=False)

        response = self.generate("term")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current academic session", response.data["error"])

    def test_only_school_admins_can_raise_invoices(self):
        teacher = self.make_user("a_teacher", "teacher")
        self.client.force_authenticate(teacher)

        response = self.client.post(
            GENERATE_URL, {"billing_period": "term"}, format="json",
            HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TenantInvoice.objects.exists())

    def test_a_school_cannot_mark_its_own_invoice_paid(self):
        invoice_id = self.generate("term").data["id"]

        response = self.client.patch(
            f"/api/tenants/invoices/{invoice_id}/", {"amount_paid": "8000.00"},
            format="json", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(TenantInvoice.objects.get(id=invoice_id).amount_paid, 0)

    def test_the_invoice_list_is_paged(self):
        self.generate("term")

        response = self.client.get("/api/tenants/invoices/", **self.as_admin())

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)

    def test_the_services_list_leads_with_the_basic_package(self):
        services = self.client.get("/api/tenants/services/", **self.as_admin()).data

        basic = services[0]
        self.assertEqual(basic["service"], "basic")
        self.assertEqual(basic["price_per_student"], 800)
        self.assertEqual(basic["price_per_student_per_session"], 2400)
        by_code = {row["service"]: row for row in services}
        self.assertEqual(by_code["timetable"]["price_per_student"], 0)
        self.assertFalse(by_code["timetable"]["is_add_on"])
        self.assertTrue(by_code["cbt"]["is_add_on"])
        self.assertEqual(by_code["cbt"]["price_per_student"], 100)

    # SMS is billed by the text, ₦10 each, on the next invoice after it is sent.

    def send_texts(self, count):
        for n in range(count):
            SentSms.objects.create(tenant=self.school, recipient=f"23480000000{n:02d}")

    def sms_line(self, quote):
        lines = [line for line in quote["lines"] if line["service"] == "sms_notifications"]
        return lines[0] if lines else None

    def test_texts_sent_are_billed_at_ten_naira_each(self):
        self.switch_on("sms_notifications")
        self.send_texts(7)

        quote = self.quote("term")

        line = self.sms_line(quote)
        self.assertEqual(line["description"], "SMS messages sent")
        self.assertEqual(line["quantity"], 7)
        self.assertEqual(line["unit_price"], "10.00")
        self.assertEqual(Decimal(quote["total"]), Decimal("8070.00"))

    def test_the_sms_add_on_is_never_charged_per_student(self):
        self.switch_on("sms_notifications")

        self.assertIsNone(self.sms_line(self.quote("session")))

    def test_an_invoice_takes_the_texts_and_the_next_one_does_not_bill_them_again(self):
        self.switch_on("sms_notifications")
        self.send_texts(3)

        invoice = TenantInvoice.objects.get(id=self.generate("term").data["id"])

        self.assertEqual(invoice.services_amount, Decimal("30.00"))
        self.assertEqual(invoice.total_amount, Decimal("8030.00"))
        self.assertEqual(invoice.sent_sms.count(), 3)
        self.assertIsNone(self.sms_line(self.quote("term")))

        # Sent after the invoice was raised: on it while it is unpaid...
        self.send_texts(2)
        self.generate("term")
        invoice.refresh_from_db()
        self.assertEqual(invoice.sent_sms.count(), 5)
        self.assertEqual(invoice.total_amount, Decimal("8050.00"))

    def test_other_schools_texts_are_not_billed_here(self):
        other = Tenant.objects.create(
            name="Beta College", slug="beta-college", status="active",
            is_active=True, owner_email="beta@example.com")
        SentSms.objects.create(tenant=other, recipient="2348000000099")

        self.assertIsNone(self.sms_line(self.quote("term")))
