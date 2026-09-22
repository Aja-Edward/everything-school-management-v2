"""
Fee reminders to parents: who gets one, what it says, by which channel, and
what a text costs the school.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel
from classroom.models import Class
from fee.models import FeeStructure, PaymentReminder, StudentFee
from fee.reminders import SMS_LENGTH
from parent.models import ParentProfile, ParentStudentRelationship
from students.models import Student
from tenants.models import SentSms, Tenant, TenantService

User = get_user_model()

URL = "/api/fee/payment-reminders/"


def brevo_ok(*args, **kwargs):
    response = Mock(status_code=201)
    response.json.return_value = {"messageId": "brevo-1"}
    return response


@override_settings(
    BREVO_API_KEY="platform-key", DEFAULT_FROM_EMAIL="fees@platform.test",
    TERMII_API_KEY="termii-key", TERMII_SENDER_ID="School")
class FeeRemindersTest(APITestCase):
    def setUp(self):
        self.school = self.make_school("Alpha Academy", "alpha-academy")
        self.admin = self.make_user("alpha_admin", "superadmin", self.school)
        self.session = AcademicSession.objects.create(
            tenant=self.school, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        level = EducationLevel.objects.get(tenant=self.school, code="primary")
        self.primary_1 = Class.objects.create(
            tenant=self.school, name="Primary 1", code="P1_FEES",
            education_level=level, grade_number=1, order=1)
        self.tuition = self.make_structure("Tuition", level)
        self.bus = self.make_structure("School bus", level)

        self.ada = self.enrol("Ada", "Obi")
        self.mother = self.make_parent("mama_obi", "mama@example.com", "08031234567")
        self.father = self.make_parent("papa_obi", "papa@example.com", "08037654321")
        self.link(self.mother, self.ada, primary=True)
        self.link(self.father, self.ada)

    # ── Fixtures ──────────────────────────────────────────────────────────────

    def make_school(self, name, slug):
        return Tenant.objects.create(
            name=name, slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com")

    def make_user(self, username, role, school, email=None, **names):
        return User.objects.create_user(
            username=username, email=email if email is not None else f"{username}@example.com",
            role=role, password=None, is_active=True, tenant=school, **names)

    def make_structure(self, name, level):
        return FeeStructure.objects.create(
            tenant=self.school, name=name, fee_type="TUITION", education_level=level,
            student_class=self.primary_1, amount=Decimal("50000.00"), frequency="TERMLY")

    def enrol(self, first, last, school=None):
        school = school or self.school
        user = self.make_user(f"{first.lower()}_{last.lower()}_{school.slug}", "student", school,
                              first_name=first, last_name=last)
        return Student.objects.create(
            tenant=school, user=user, gender="F", date_of_birth=date(2016, 1, 1))

    def make_parent(self, username, email, phone, school=None):
        school = school or self.school
        user = self.make_user(username, "parent", school, email=email,
                              first_name=username.split("_")[0].title(), last_name="Obi")
        return ParentProfile.objects.create(tenant=school, user=user, phone=phone)

    def link(self, parent, student, primary=False):
        ParentStudentRelationship.objects.create(
            tenant=student.tenant, parent=parent, student=student,
            relationship="Mother", is_primary_contact=primary)

    def owe(self, student, structure, amount, paid="0.00", status="PENDING", due=None):
        return StudentFee.objects.create(
            tenant=student.tenant, student=student, fee_structure=structure,
            academic_session=self.session, term="FIRST", amount_due=Decimal(amount),
            amount_paid=Decimal(paid), status=status,
            due_date=due or date.today() + timedelta(days=7))

    def as_admin(self):
        self.client.force_authenticate(self.admin)
        return {"HTTP_X_TENANT_SLUG": self.school.slug}

    def send(self, channels, **extra):
        return self.client.post(
            f"{URL}send_bulk/", {"channels": channels, **extra}, format="json", **self.as_admin())

    # ── Email ─────────────────────────────────────────────────────────────────

    def test_each_parent_gets_one_email_covering_all_of_their_childs_fees(self):
        self.owe(self.ada, self.tuition, "50000.00", paid="20000.00", status="PARTIAL")
        self.owe(self.ada, self.bus, "15000.00")

        with patch("utils.notifications.requests.post", side_effect=brevo_ok) as post:
            response = self.send(["email"])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["email"]["sent"], 2)
        self.assertEqual(post.call_count, 2)
        recipients = {call.kwargs["json"]["to"][0]["email"] for call in post.call_args_list}
        self.assertEqual(recipients, {"mama@example.com", "papa@example.com"})

        email = post.call_args_list[0].kwargs["json"]
        self.assertEqual(email["subject"], "School fees reminder for Ada Obi")
        self.assertIn("Tuition: ₦30,000.00", email["textContent"])
        self.assertIn("School bus: ₦15,000.00", email["textContent"])
        self.assertIn("Total outstanding: ₦45,000.00", email["textContent"])

        # One row per fee per parent, all delivered.
        self.assertEqual(PaymentReminder.objects.filter(is_sent=True, channel="email").count(), 4)

    def test_paid_fees_and_other_schools_are_left_alone(self):
        self.owe(self.ada, self.tuition, "50000.00", paid="50000.00", status="PAID")
        other = self.make_school("Beta College", "beta-college")
        bola = self.enrol("Bola", "Ade", school=other)
        parent = self.make_parent("mama_ade", "ade@example.com", "08030000000", school=other)
        self.link(parent, bola, primary=True)
        StudentFee.objects.create(
            tenant=other, student=bola, fee_structure=self.tuition, academic_session=self.session,
            term="FIRST", amount_due=Decimal("50000.00"), due_date=date.today())

        with patch("utils.notifications.requests.post", side_effect=brevo_ok) as post:
            response = self.send(["email"])

        self.assertEqual(response.data["students_owing"], 0)
        post.assert_not_called()

    def test_a_second_send_within_a_day_does_not_remind_again(self):
        self.owe(self.ada, self.tuition, "50000.00")

        with patch("utils.notifications.requests.post", side_effect=brevo_ok) as post:
            self.send(["email"])
            again = self.send(["email"])

        self.assertEqual(post.call_count, 2)
        self.assertEqual(again.data["email"]["sent"], 0)
        self.assertEqual(again.data["email"]["already_reminded"], 2)

    def test_a_parent_without_an_email_address_is_counted(self):
        self.owe(self.ada, self.tuition, "50000.00")
        User.objects.filter(pk=self.father.user.pk).update(email="")

        with patch("utils.notifications.requests.post", side_effect=brevo_ok):
            response = self.send(["email"])

        self.assertEqual(response.data["email"]["sent"], 1)
        self.assertEqual(response.data["email"]["no_address"], 1)

    def test_a_failed_email_is_recorded_with_its_reason_and_retried_next_time(self):
        self.owe(self.ada, self.tuition, "50000.00")
        refused = Mock(status_code=500, text="Brevo is down")
        refused.json.return_value = {}

        with patch("utils.notifications.requests.post", return_value=refused):
            first = self.send(["email"])
        with patch("utils.notifications.requests.post", side_effect=brevo_ok) as post:
            second = self.send(["email"])

        self.assertEqual(first.data["email"]["failed"], 2)
        self.assertIn("Brevo returned 500", PaymentReminder.objects.filter(is_sent=False).first().error)
        self.assertEqual(second.data["email"]["sent"], 2)
        self.assertEqual(post.call_count, 2)

    # ── SMS ───────────────────────────────────────────────────────────────────

    def test_sms_needs_the_add_on(self):
        self.owe(self.ada, self.tuition, "50000.00")

        with patch("utils.termii.send_sms") as send_sms:
            response = self.send(["sms"])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("SMS add-on", response.data["error"])
        send_sms.assert_not_called()
        self.assertFalse(PaymentReminder.objects.exists())

    def test_each_text_is_sent_and_billed_to_the_school(self):
        TenantService.objects.create(tenant=self.school, service="sms_notifications", is_enabled=True)
        self.owe(self.ada, self.tuition, "50000.00")
        self.owe(self.ada, self.bus, "15000.00")

        with patch("utils.termii.send_sms", return_value=(True, "Sent", "T1")) as send_sms:
            response = self.send(["sms"])

        self.assertEqual(response.data["sms"]["sent"], 2)
        self.assertEqual(response.data["sms"]["cost"], "20.00")
        numbers = {call.args[0] for call in send_sms.call_args_list}
        self.assertEqual(numbers, {"08031234567", "08037654321"})
        text = send_sms.call_args_list[0].args[1]
        self.assertIn("NGN 65,000", text)
        self.assertLessEqual(len(text), SMS_LENGTH)
        # Two texts, not four: one per parent covers both fees.
        self.assertEqual(SentSms.objects.filter(tenant=self.school).count(), 2)

    def test_a_long_school_name_still_fits_one_text(self):
        TenantService.objects.create(tenant=self.school, service="sms_notifications", is_enabled=True)
        Tenant.objects.filter(pk=self.school.pk).update(
            name="The Very Long Named International Model College of Excellence Lagos")
        self.school.refresh_from_db()
        self.owe(self.ada, self.tuition, "50000.00")

        with patch("utils.termii.send_sms", return_value=(True, "Sent", "T1")) as send_sms:
            self.send(["sms"])

        self.assertLessEqual(len(send_sms.call_args_list[0].args[1]), SMS_LENGTH)

    # ── Preview and access ────────────────────────────────────────────────────

    def test_the_preview_counts_messages_and_the_cost_of_texting(self):
        self.owe(self.ada, self.tuition, "50000.00")
        self.owe(self.ada, self.bus, "15000.00")

        response = self.client.get(f"{URL}preview/", **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["students_owing"], 1)
        self.assertEqual(Decimal(response.data["total_outstanding"]), Decimal("65000.00"))
        self.assertEqual(response.data["email_messages"], 2)
        self.assertEqual(response.data["sms_messages"], 2)
        self.assertEqual(response.data["sms_cost"], "20.00")
        self.assertFalse(response.data["sms_enabled"])

    def test_parents_cannot_read_or_send_reminders(self):
        self.client.force_authenticate(self.mother.user)
        headers = {"HTTP_X_TENANT_SLUG": self.school.slug}

        self.assertEqual(self.client.get(URL, **headers).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(f"{URL}send_bulk/", {"channels": ["email"]}, format="json",
                             **headers).status_code,
            status.HTTP_403_FORBIDDEN)

    def test_the_reminder_log_can_be_filtered_by_channel(self):
        self.owe(self.ada, self.tuition, "50000.00")
        with patch("utils.notifications.requests.post", side_effect=brevo_ok):
            self.send(["email"])

        response = self.client.get(URL, {"channel": "email", "is_sent": True}, **self.as_admin())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
