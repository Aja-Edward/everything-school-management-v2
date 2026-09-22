"""
The platform admin's Pending Payments queue: bank transfers from every
school awaiting confirmation, and confirming one from that queue.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession
from tenants.models import Tenant, TenantInvoice, TenantInvoiceLineItem, TenantPayment

User = get_user_model()

QUEUE_URL = "/api/tenants/payments/pending-verification/"


class PendingPaymentsQueueTest(APITestCase):
    def setUp(self):
        self.platform_admin = User.objects.create_user(
            username="platform_root", email="root@example.com", role="superadmin",
            password=None, is_active=True, is_superuser=True, is_staff=True,
            tenant=None)
        self.alpha = self.make_school("Alpha Academy", "alpha-academy")
        self.beta = self.make_school("Beta College", "beta-college")

    def make_school(self, name, slug):
        school = Tenant.objects.create(
            name=name, slug=slug, status="pending", is_active=True,
            owner_email=f"{slug}@example.com")
        session = AcademicSession.objects.create(
            tenant=school, name="2026/2027",
            start_date=date(2026, 9, 7), end_date=date(2027, 7, 23))
        invoice = TenantInvoice.objects.create(
            tenant=school, academic_session=session,
            base_price_per_student=Decimal("500.00"), student_count=40,
            due_date=date(2026, 10, 1))
        TenantInvoiceLineItem.objects.create(
            invoice=invoice, item_type="service", service="attendance",
            description="Attendance System", unit_price=Decimal("5000.00"))
        invoice.recalculate_totals()
        school.invoice = invoice
        return school

    def pay(self, school, method="manual", payment_status="pending"):
        return TenantPayment.objects.create(
            invoice=school.invoice, amount=school.invoice.total_amount,
            payment_method=method, status=payment_status,
            bank_name="First Bank", account_name=f"{school.name} Ltd")

    def test_lists_bank_transfers_awaiting_confirmation_from_every_school(self):
        alpha_transfer = self.pay(self.alpha)
        beta_transfer = self.pay(self.beta)
        self.pay(self.alpha, method="paystack")  # checkout not yet verified
        self.pay(self.beta, payment_status="confirmed")

        self.client.force_authenticate(self.platform_admin)
        response = self.client.get(QUEUE_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        by_id = {row["id"]: row for row in response.data["results"]}
        self.assertEqual(set(by_id), {str(alpha_transfer.id), str(beta_transfer.id)})

        row = by_id[str(alpha_transfer.id)]
        self.assertEqual(row["school_name"], "Alpha Academy")
        self.assertEqual(row["tenant_id"], str(self.alpha.id))
        self.assertEqual(row["invoice_number"], self.alpha.invoice.invoice_number)
        self.assertEqual(row["student_count"], 40)
        self.assertEqual(row["due_date"], "2026-10-01")
        self.assertEqual(Decimal(row["amount"]), Decimal("25000.00"))
        self.assertEqual(row["payment_reference"], alpha_transfer.reference)
        self.assertEqual(row["account_name"], "Alpha Academy Ltd")
        self.assertEqual(row["features"], ["Attendance System"])

    def test_school_admin_cannot_see_the_queue(self):
        self.pay(self.alpha)
        school_admin = User.objects.create_user(
            username="alpha_admin", email="alpha_admin@example.com", role="superadmin",
            password=None, is_active=True, tenant=self.alpha)

        self.client.force_authenticate(school_admin)
        response = self.client.get(QUEUE_URL, HTTP_X_TENANT_SLUG=self.alpha.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_confirming_from_the_queue_pays_the_invoice_and_leaves_the_queue(self):
        transfer = self.pay(self.alpha)

        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(
            f"/api/tenants/payments/{transfer.id}/confirm/",
            {"notes": "Seen on statement"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "confirmed")
        self.assertEqual(transfer.confirmation_notes, "Seen on statement")
        self.alpha.invoice.refresh_from_db()
        self.assertEqual(self.alpha.invoice.status, "paid")
        self.alpha.refresh_from_db()
        self.assertEqual(self.alpha.status, "active")
        self.assertEqual(self.client.get(QUEUE_URL).data["count"], 0)
