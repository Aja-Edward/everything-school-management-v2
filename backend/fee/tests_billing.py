"""
Issuing a school's fees to its students: who is billed, what the second child
pays, and that it stops at the school's own gate.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel
from classroom.models import Class
from fee.models import FeeStructure, StudentFee
from parent.models import ParentProfile, ParentStudentRelationship
from students.models import Student
from tenants.models import Tenant

User = get_user_model()

GENERATE = "/api/fee/student-fees/bulk_generate/"


class IssueFeesTest(APITestCase):
    def setUp(self):
        self.school = self.make_school("Kebi Academy", "kebi-academy")
        self.admin = self.make_user("kebi_head", "superadmin", self.school)
        self.session = AcademicSession.objects.create(
            tenant=self.school, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        self.level = EducationLevel.objects.get(tenant=self.school, code="primary")
        self.primary_1 = Class.objects.create(
            tenant=self.school, name="Primary 1", code="P1", education_level=self.level,
            grade_number=1, order=1)
        self.tuition = self.make_fee("Tuition", "TUITION", "50000.00")
        self.bus = self.make_fee("School bus", "TRANSPORT", "15000.00")

    # ── Fixtures ──────────────────────────────────────────────────────────────

    def make_school(self, name, slug):
        return Tenant.objects.create(
            name=name, slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com")

    def make_user(self, username, role, school, **fields):
        return User.objects.create_user(
            username=username, email=f"{username}@example.com", role=role, password=None,
            is_active=True, tenant=school, **fields)

    def make_fee(self, name, fee_type, amount, school=None):
        school = school or self.school
        return FeeStructure.objects.create(
            tenant=school, name=name, fee_type=fee_type, education_level=self.level,
            student_class=self.primary_1, amount=Decimal(amount), frequency="TERMLY")

    def enrol(self, username, joined, school=None, student_class=None):
        school = school or self.school
        return Student.objects.create(
            tenant=school, user=self.make_user(username, "student", school),
            gender="F", date_of_birth=date(2016, 1, 1), admission_date=joined,
            student_class=student_class or self.primary_1)

    def family(self, username, *children):
        parent = ParentProfile.objects.create(
            tenant=self.school, user=self.make_user(username, "parent", self.school),
            phone="08030000000")
        for n, child in enumerate(children):
            ParentStudentRelationship.objects.create(
                tenant=self.school, parent=parent, student=child,
                relationship="Mother", is_primary_contact=(n == 0))
        return parent

    def issue(self, fee=None, **extra):
        self.client.force_authenticate(self.admin)
        body = {
            "fee_structure_id": (fee or self.tuition).id,
            "academic_session_id": self.session.id,
            "term": "FIRST",
            "due_date": str(date(2026, 10, 1)),
            **extra,
        }
        return self.client.post(GENERATE, body, format="json",
                                HTTP_X_TENANT_SLUG=self.school.slug)

    def bill(self, student, fee=None):
        return StudentFee.objects.get(student=student, fee_structure=fee or self.tuition)

    # ── Issuing ───────────────────────────────────────────────────────────────

    def test_every_student_in_the_class_gets_the_fee_once(self):
        ada = self.enrol("ada", date(2024, 9, 1))
        obi = self.enrol("obi", date(2025, 9, 1))

        response = self.issue(student_class_id=self.primary_1.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["billed"], 2)
        self.assertEqual(self.bill(ada).amount_due, Decimal("50000.00"))
        self.assertEqual(self.bill(ada).term, "FIRST")
        self.assertEqual(self.bill(obi).due_date, date(2026, 10, 1))
        self.assertEqual(StudentFee.objects.count(), 2)

    def test_issuing_again_bills_only_the_student_who_joined_since(self):
        self.enrol("ada", date(2024, 9, 1))
        self.issue(student_class_id=self.primary_1.id)
        self.enrol("late_joiner", date(2026, 9, 20))

        again = self.issue(student_class_id=self.primary_1.id)

        self.assertEqual(again.data["billed"], 1)
        self.assertEqual(again.data["already_had_it"], 1)
        self.assertEqual(StudentFee.objects.count(), 2)

    def test_a_student_who_left_is_not_billed(self):
        staying = self.enrol("staying", date(2024, 9, 1))
        left = self.enrol("left", date(2024, 9, 1))
        Student.objects.filter(pk=left.pk).update(is_active=False)

        self.issue(student_class_id=self.primary_1.id)

        self.assertEqual(StudentFee.objects.filter(student=staying).count(), 1)
        self.assertFalse(StudentFee.objects.filter(student=left).exists())

    # ── The second child ──────────────────────────────────────────────────────

    def test_the_second_child_pays_ten_percent_less_tuition(self):
        first = self.enrol("first_born", date(2023, 9, 1))
        second = self.enrol("second_born", date(2025, 9, 1))
        self.family("their_mother", first, second)

        response = self.issue(student_class_id=self.primary_1.id)

        self.assertEqual(self.bill(first).discount_amount, Decimal("0.00"))
        self.assertEqual(self.bill(first).balance, Decimal("50000.00"))
        self.assertEqual(self.bill(second).discount_amount, Decimal("5000.00"))
        self.assertEqual(self.bill(second).balance, Decimal("45000.00"))
        self.assertIn("Sibling discount", self.bill(second).remarks)
        self.assertEqual(response.data["students_with_sibling_discount"], 1)
        self.assertEqual(response.data["sibling_discount_total"], "5000.00")

    def test_a_third_child_gets_it_too_and_an_only_child_does_not(self):
        first = self.enrol("eldest", date(2022, 9, 1))
        second = self.enrol("middle", date(2023, 9, 1))
        third = self.enrol("youngest", date(2024, 9, 1))
        self.family("big_family", first, second, third)
        alone = self.enrol("only_child", date(2023, 9, 1))
        self.family("another_mother", alone)

        self.issue(student_class_id=self.primary_1.id)

        self.assertEqual(self.bill(first).discount_amount, Decimal("0.00"))
        self.assertEqual(self.bill(second).discount_amount, Decimal("5000.00"))
        self.assertEqual(self.bill(third).discount_amount, Decimal("5000.00"))
        self.assertEqual(self.bill(alone).discount_amount, Decimal("0.00"))

    def test_the_discount_is_for_tuition_only(self):
        first = self.enrol("first_born", date(2023, 9, 1))
        second = self.enrol("second_born", date(2025, 9, 1))
        self.family("their_mother", first, second)

        self.issue(fee=self.bus, student_class_id=self.primary_1.id)

        self.assertEqual(self.bill(second, self.bus).discount_amount, Decimal("0.00"))
        self.assertEqual(self.bill(second, self.bus).balance, Decimal("15000.00"))

    # ── One school at a time ──────────────────────────────────────────────────

    def test_another_schools_students_are_never_billed(self):
        ours = self.enrol("ours", date(2024, 9, 1))
        other = self.make_school("Rival School", "rival-school")
        their_class = Class.objects.create(
            tenant=other, name="Primary 1", code="P1", grade_number=1, order=1,
            education_level=EducationLevel.objects.get(tenant=other, code="primary"))
        theirs = self.enrol("theirs", date(2024, 9, 1), school=other, student_class=their_class)

        response = self.issue()  # no class or level: the whole school

        self.assertEqual(response.data["billed"], 1)
        self.assertTrue(StudentFee.objects.filter(student=ours).exists())
        self.assertFalse(StudentFee.objects.filter(student=theirs).exists())

    def test_another_schools_fee_cannot_be_issued_here(self):
        self.enrol("ada", date(2024, 9, 1))
        other = self.make_school("Rival School", "rival-school")
        theirs = self.make_fee("Their tuition", "TUITION", "1000.00", school=other)

        response = self.issue(fee=theirs, student_class_id=self.primary_1.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(StudentFee.objects.exists())

    def test_only_finance_staff_can_issue_fees(self):
        self.enrol("ada", date(2024, 9, 1))
        parent_user = self.make_user("a_parent", "parent", self.school)
        self.client.force_authenticate(parent_user)

        response = self.client.post(GENERATE, {
            "fee_structure_id": self.tuition.id, "academic_session_id": self.session.id,
            "term": "FIRST", "due_date": "2026-10-01",
        }, format="json", HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(StudentFee.objects.exists())
