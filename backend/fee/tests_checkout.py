"""
Parents paying a term's fees into the school's own Paystack account: what
they see, what gets charged, what gets credited, and that it stays in the
family and in the school.
"""
import hashlib
import hmac
import json
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel
from classroom.models import Class
from fee.models import FeeStructure, Payment, PaymentAttempt, PaymentGatewayConfig, StudentFee
from parent.models import ParentProfile, ParentStudentRelationship
from students.models import Student
from tenants.models import Tenant

User = get_user_model()

FAMILY = "/api/fee/family-fees/"
SECRET = "sk_test_school_9876"


class FamilyCheckoutTest(APITestCase):
    def setUp(self):
        self.school = self.make_school("Kebi Academy", "kebi-academy")
        self.session = AcademicSession.objects.create(
            tenant=self.school, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        self.level = EducationLevel.objects.get(tenant=self.school, code="primary")
        self.primary_1 = Class.objects.create(
            tenant=self.school, name="Primary 1", code="P1", education_level=self.level,
            grade_number=1, order=1)
        self.tuition = self.make_fee("Tuition", "TUITION", "50000.00")
        self.bus = self.make_fee("School bus", "TRANSPORT", "15000.00")

        self.ada = self.enrol("ada")
        self.obi = self.enrol("obi")
        self.stranger_child = self.enrol("stranger_child")
        self.mother = self.family("ada_mum", self.ada, self.obi)
        self.bill(self.ada, self.tuition, discount="0")
        self.bill(self.ada, self.bus)
        self.bill(self.obi, self.tuition, discount="5000.00")
        self.bill(self.stranger_child, self.tuition)
        PaymentGatewayConfig.objects.create(
            tenant=self.school, gateway="PAYSTACK", is_active=True, is_test_mode=True,
            public_key="pk_test_school", secret_key=SECRET,
            min_amount=Decimal("100.00"), max_amount=Decimal("1000000.00"))

    # ── Fixtures ──────────────────────────────────────────────────────────────

    def make_school(self, name, slug):
        return Tenant.objects.create(
            name=name, slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com")

    def make_user(self, username, role, school=None, **fields):
        return User.objects.create_user(
            username=username, email=f"{username}@example.com", role=role, password=None,
            is_active=True, tenant=school or self.school, **fields)

    def make_fee(self, name, fee_type, amount):
        return FeeStructure.objects.create(
            tenant=self.school, name=name, fee_type=fee_type, education_level=self.level,
            student_class=self.primary_1, amount=Decimal(amount), frequency="TERMLY")

    def enrol(self, username):
        return Student.objects.create(
            tenant=self.school, user=self.make_user(username, "student"),
            gender="F", date_of_birth=date(2016, 1, 1), admission_date=date(2026, 9, 7),
            student_class=self.primary_1)

    def family(self, username, *children):
        parent = ParentProfile.objects.create(
            tenant=self.school, user=self.make_user(username, "parent"), phone="08030000000")
        for n, child in enumerate(children):
            ParentStudentRelationship.objects.create(
                tenant=self.school, parent=parent, student=child,
                relationship="Mother", is_primary_contact=(n == 0))
        return parent

    def bill(self, student, fee, discount="0", term="FIRST"):
        return StudentFee.objects.create(
            tenant=self.school, student=student, fee_structure=fee,
            academic_session=self.session, term=term, amount_due=fee.amount,
            discount_amount=Decimal(discount), due_date=date(2026, 10, 1))

    def as_parent(self, parent=None):
        self.client.force_authenticate((parent or self.mother).user)
        return {"HTTP_X_TENANT_SLUG": self.school.slug}

    def start_paying(self, student=None, **extra):
        started = {"status": True, "data": {
            "authorization_url": "https://checkout.paystack.com/abc", "access_code": "abc"}}
        with patch("fee.services.paystack_service.PaystackService.initialize_payment",
                   return_value=started) as initialize:
            response = self.client.post(FAMILY + "pay/", {
                "student_id": (student or self.ada).id,
                "academic_session_id": self.session.id, "term": "FIRST",
                "callback_url": "https://kebi-academy.nuventacloud.com/parent/dashboard",
                **extra}, format="json", **self.as_parent())
        return response, initialize

    def paid(self, reference, kobo, status_="success"):
        return {"id": 991, "status": status_, "reference": reference, "amount": kobo,
                "currency": "NGN", "channel": "card",
                "customer": {"email": "ada_mum@example.com", "first_name": "Ngozi",
                             "last_name": "Eze"},
                "authorization": {"last4": "4081", "card_type": "visa", "bank": "TEST BANK"}}

    def webhook(self, body, secret=SECRET, school=None):
        raw = json.dumps(body)
        signature = hmac.new(secret.encode(), raw.encode(), hashlib.sha512).hexdigest()
        self.client.force_authenticate(None)
        return self.client.post(
            f"/api/fee/paystack/webhook/{(school or self.school).id}/", raw,
            content_type="application/json", HTTP_X_PAYSTACK_SIGNATURE=signature)

    # ── What a parent sees ────────────────────────────────────────────────────

    def test_a_parent_sees_one_bill_per_child_per_term(self):
        response = self.client.get(FAMILY, **self.as_parent())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["can_pay_online"])
        by_child = {c["student_id"]: c for c in response.data["children"]}
        self.assertEqual(set(by_child), {self.ada.id, self.obi.id})
        ada_term = by_child[self.ada.id]["bills"][0]
        self.assertEqual(ada_term["term"], "FIRST")
        self.assertEqual(len(ada_term["items"]), 2)
        self.assertEqual(ada_term["balance"], "65000.00")
        obi_term = by_child[self.obi.id]["bills"][0]
        self.assertEqual(obi_term["discount"], "5000.00")
        self.assertEqual(obi_term["balance"], "45000.00")

    def test_someone_who_is_not_a_parent_here_is_turned_away(self):
        self.client.force_authenticate(self.make_user("a_teacher", "teacher"))

        response = self.client.get(FAMILY, HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── Paying ────────────────────────────────────────────────────────────────

    def test_paying_charges_everything_owed_for_the_term_at_once(self):
        response, initialize = self.start_paying()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["amount"], "65000.00")
        self.assertEqual(response.data["authorization_url"], "https://checkout.paystack.com/abc")
        kwargs = initialize.call_args.kwargs
        self.assertEqual(kwargs["amount"], Decimal("65000.00"))
        self.assertEqual(kwargs["email"], "ada_mum@example.com")
        self.assertEqual(kwargs["reference"], response.data["reference"])
        attempts = PaymentAttempt.objects.filter(attempt_reference=response.data["reference"])
        self.assertEqual(attempts.count(), 2)
        self.assertEqual({a.status for a in attempts}, {"PROCESSING"})

    def test_a_parent_cannot_pay_for_someone_elses_child(self):
        response, initialize = self.start_paying(student=self.stranger_child)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not linked", response.data["error"])
        initialize.assert_not_called()

    def test_a_term_already_paid_is_not_charged_again(self):
        for fee in StudentFee.objects.filter(student=self.ada):
            fee.amount_paid = fee.amount_due
            fee.save()

        response, initialize = self.start_paying()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Nothing is owed", response.data["error"])
        initialize.assert_not_called()

    def test_a_school_without_paystack_says_so(self):
        PaymentGatewayConfig.objects.all().delete()

        response, initialize = self.start_paying()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not set up online payment", response.data["error"])
        initialize.assert_not_called()

    def test_when_paystack_will_not_start_nothing_is_left_hanging(self):
        with patch("fee.services.paystack_service.PaystackService.initialize_payment",
                   return_value={"status": False, "message": "Invalid key"}):
            response = self.client.post(FAMILY + "pay/", {
                "student_id": self.ada.id, "academic_session_id": self.session.id,
                "term": "FIRST"}, format="json", **self.as_parent())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(set(PaymentAttempt.objects.values_list("status", flat=True)),
                         {"FAILED"})

    # ── Coming back from Paystack ─────────────────────────────────────────────

    def test_coming_back_paid_credits_each_fee_under_one_receipt(self):
        reference = self.start_paying()[0].data["reference"]

        with patch("fee.services.paystack_service.PaystackService.verify_payment",
                   return_value={"status": True, "data": self.paid(reference, 6500000)}):
            response = self.client.post(FAMILY + "verify/", {"reference": reference},
                                        format="json", **self.as_parent())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "paid")
        receipt = response.data["receipt"]
        self.assertEqual(receipt["total"], "65000.00")
        self.assertEqual(len(receipt["lines"]), 2)
        self.assertTrue(receipt["receipt_number"].startswith("RCT"))
        self.assertEqual(receipt["card_last_four"], "4081")
        for fee in StudentFee.objects.filter(student=self.ada):
            self.assertEqual(fee.status, "PAID")
            self.assertEqual(fee.balance, 0)
        payments = Payment.objects.filter(gateway_reference=reference)
        self.assertEqual({p.receipt_number for p in payments}, {receipt["receipt_number"]})
        self.assertTrue(all(p.verified and p.tenant == self.school for p in payments))

    def test_verifying_twice_does_not_pay_twice(self):
        reference = self.start_paying()[0].data["reference"]
        verified = {"status": True, "data": self.paid(reference, 6500000)}

        with patch("fee.services.paystack_service.PaystackService.verify_payment",
                   return_value=verified):
            for _ in range(2):
                self.client.post(FAMILY + "verify/", {"reference": reference},
                                 format="json", **self.as_parent())

        self.assertEqual(Payment.objects.filter(gateway_reference=reference).count(), 2)
        self.assertEqual(StudentFee.objects.get(student=self.ada, fee_structure=self.bus)
                         .amount_paid, Decimal("15000.00"))

    def test_an_abandoned_payment_credits_nothing(self):
        reference = self.start_paying()[0].data["reference"]

        with patch("fee.services.paystack_service.PaystackService.verify_payment",
                   return_value={"status": True,
                                 "data": self.paid(reference, 6500000, "abandoned")}):
            response = self.client.post(FAMILY + "verify/", {"reference": reference},
                                        format="json", **self.as_parent())

        self.assertEqual(response.data["status"], "abandoned")
        self.assertFalse(Payment.objects.exists())

    def test_a_short_payment_is_not_credited(self):
        reference = self.start_paying()[0].data["reference"]

        with patch("fee.services.paystack_service.PaystackService.verify_payment",
                   return_value={"status": True, "data": self.paid(reference, 100)}):
            response = self.client.post(FAMILY + "verify/", {"reference": reference},
                                        format="json", **self.as_parent())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Payment.objects.exists())

    def test_another_parent_cannot_verify_or_read_the_receipt(self):
        reference = self.start_paying()[0].data["reference"]
        other = self.family("other_mum", self.stranger_child)

        response = self.client.post(FAMILY + "verify/", {"reference": reference},
                                    format="json", **self.as_parent(other))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.get(FAMILY + "receipt/", {"reference": reference},
                                   **self.as_parent(other))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ── Paystack's webhook ────────────────────────────────────────────────────

    def test_the_webhook_credits_a_parent_who_never_came_back(self):
        reference = self.start_paying()[0].data["reference"]

        response = self.webhook({"event": "charge.success",
                                 "data": self.paid(reference, 6500000)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Payment.objects.filter(gateway_reference=reference).count(), 2)
        self.assertEqual(StudentFee.objects.get(student=self.ada, fee_structure=self.tuition)
                         .status, "PAID")

    def test_an_unsigned_webhook_is_refused(self):
        reference = self.start_paying()[0].data["reference"]

        response = self.webhook({"event": "charge.success",
                                 "data": self.paid(reference, 6500000)},
                                secret="sk_test_forged")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Payment.objects.exists())

    def test_a_webhook_cannot_credit_another_schools_payment(self):
        reference = self.start_paying()[0].data["reference"]
        rival = self.make_school("Rival School", "rival-school")
        PaymentGatewayConfig.objects.create(
            tenant=rival, gateway="PAYSTACK", is_active=True, is_test_mode=True,
            public_key="pk_test_rival", secret_key="sk_test_rival",
            min_amount=Decimal("100.00"), max_amount=Decimal("1000000.00"))

        response = self.webhook({"event": "charge.success",
                                 "data": self.paid(reference, 6500000)},
                                secret="sk_test_rival", school=rival)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Payment.objects.exists())

    # ── The school-wide lists ─────────────────────────────────────────────────

    def test_a_parent_sees_only_their_childrens_fees_in_the_school_list(self):
        response = self.client.get("/api/fee/student-fees/", **self.as_parent())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual({row["id"] for row in rows},
                         set(StudentFee.objects.filter(student__in=[self.ada, self.obi])
                             .values_list("id", flat=True)))

    def test_a_parent_cannot_change_a_fee(self):
        fee = StudentFee.objects.get(student=self.ada, fee_structure=self.tuition)

        response = self.client.patch(f"/api/fee/student-fees/{fee.id}/",
                                     {"amount_due": "1.00"}, format="json",
                                     **self.as_parent())

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        fee.refresh_from_db()
        self.assertEqual(fee.amount_due, Decimal("50000.00"))
