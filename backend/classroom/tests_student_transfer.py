"""
Moving a student between classrooms — another class, or another section of
the same class — moves their own class and section with the enrollment.
"""

from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from classroom.models import Class, Classroom, Section, StudentEnrollment
from students.models import Student
from tenants.models import Tenant

User = get_user_model()


class StudentTransferTest(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Transfer School", slug="transfer-school", status="active",
            is_active=True, owner_email="transfer-school@example.com")
        level, _ = EducationLevel.objects.update_or_create(
            tenant=self.tenant, code="jss", defaults={"name": "Junior Secondary", "level_type": "JUNIOR_SECONDARY"})
        self.jss1 = Class.objects.create(
            tenant=self.tenant, name="JSS 1 (transfer)", code="JSS_1_TRANSFER",
            education_level=level, grade_number=1, order=1)
        self.jss2 = Class.objects.create(
            tenant=self.tenant, name="JSS 2 (transfer)", code="JSS_2_TRANSFER",
            education_level=level, grade_number=2, order=2)
        self.session = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027", start_date=date(2026, 9, 7), end_date=date(2027, 7, 23),
            is_current=True)
        term_type, _ = TermType.objects.get_or_create(
            tenant=self.tenant, code="FIRST_TERM", defaults={"name": "First Term", "display_order": 1})
        self.term = Term.objects.create(
            tenant=self.tenant, term_type=term_type, academic_session=self.session,
            start_date=date(2026, 9, 7), end_date=date(2026, 12, 16), is_current=True)

        self.gold, self.gold_room = self.make_section(self.jss1, "Gold")
        self.silver, self.silver_room = self.make_section(self.jss1, "Silver")
        self.jss2_a, self.jss2_a_room = self.make_section(self.jss2, "A")

        user = User.objects.create_user(
            username="transfer_pupil", email="transfer_pupil@example.com", first_name="Ada",
            last_name="Pupil", role="student", password=None, is_active=True, tenant=self.tenant)
        # The post_save signal enrolls the student in Gold's classroom.
        self.student = Student.objects.create(
            user=user, gender="F", date_of_birth=date(2014, 1, 1),
            student_class=self.jss1, section=self.gold, tenant=self.tenant)
        self.assertEqual(self.active_rooms(), [self.gold_room.id])

        admin = User.objects.create_user(
            username="transfer_admin", email="transfer_admin@example.com", role="admin",
            password=None, is_active=True, is_staff=True, tenant=self.tenant)
        self.client.force_authenticate(user=admin)

    def make_section(self, class_grade, name):
        section = Section.objects.create(tenant=self.tenant, class_grade=class_grade, name=name)
        room = Classroom.objects.create(
            tenant=self.tenant, name=class_grade.name, section=section,
            academic_session=self.session, term=self.term, max_capacity=30)
        return section, room

    def active_rooms(self):
        return list(StudentEnrollment.objects.filter(
            student=self.student, is_active=True).values_list("classroom_id", flat=True))

    def transfer(self, source, target):
        return self.client.post(
            f"/api/classrooms/classrooms/{source.id}/transfer_student/",
            {"student_id": self.student.id, "target_classroom_id": target.id},
            format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)

    def test_moving_to_another_section_of_the_same_class(self):
        response = self.transfer(self.gold_room, self.silver_room)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data["from_section"], response.data["to_section"]), ("Gold", "Silver"))
        self.student.refresh_from_db()
        self.assertEqual((self.student.student_class, self.student.section), (self.jss1, self.silver))
        self.assertEqual(self.active_rooms(), [self.silver_room.id])

    def test_saving_the_student_afterwards_keeps_the_new_section(self):
        """The regression: only the enrollment moved, so the next save of the
        student re-enrolled them in their old section's classroom."""
        self.transfer(self.gold_room, self.silver_room)

        self.student.refresh_from_db()
        self.student.save()

        self.assertEqual(self.active_rooms(), [self.silver_room.id])

    def test_moving_to_another_class_moves_the_class_too(self):
        response = self.transfer(self.gold_room, self.jss2_a_room)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.student.refresh_from_db()
        self.assertEqual((self.student.student_class, self.student.section), (self.jss2, self.jss2_a))
        self.assertEqual(self.active_rooms(), [self.jss2_a_room.id])

    def test_a_student_not_in_the_source_classroom_is_refused(self):
        response = self.transfer(self.silver_room, self.jss2_a_room)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.student.refresh_from_db()
        self.assertEqual(self.student.section, self.gold)
        self.assertEqual(self.active_rooms(), [self.gold_room.id])

    def test_transferring_into_the_same_classroom_is_refused(self):
        response = self.transfer(self.gold_room, self.gold_room)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(self.active_rooms(), [self.gold_room.id])

    def test_classroom_list_names_the_class_of_each_section(self):
        response = self.client.get(
            f"/api/classrooms/classrooms/{self.silver_room.id}/", HTTP_X_TENANT_SLUG=self.tenant.slug)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            (response.data["class_grade"], response.data["class_name"], response.data["section_name"]),
            (self.jss1.id, "JSS 1 (transfer)", "Silver"))
