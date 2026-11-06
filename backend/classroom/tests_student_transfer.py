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


class StudentTransferSetup(APITestCase):
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

class StudentTransferTest(StudentTransferSetup):
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


class StudentPagesAfterTransferTest(StudentTransferSetup):
    """
    Teachers' class lists read the enrollment; the student's own pages read
    the Student's class and section. Transfers made before c6d0ef43 moved the
    enrollment only, so those students sat in the new class for their teacher
    and the old one on their own page.
    """

    def student_pages(self):
        """What the logged-in student sees as their class on each page."""
        # A fresh user, as each real request loads: self.student.user caches
        # the Student object from before the transfer as student_profile.
        self.client.force_authenticate(user=User.objects.get(pk=self.student.user_id))
        slug = {"HTTP_X_TENANT_SLUG": self.tenant.slug}
        dashboard = self.client.get("/api/students/students/dashboard/", **slug)
        profile = self.client.get("/api/students/students/profile/", **slug)
        record = self.client.get(f"/api/students/students/?user={self.student.user_id}", **slug)
        mine = self.client.get("/api/students/my-classroom/", **slug)
        for response in (dashboard, profile, record, mine):
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        records = record.data["results"] if isinstance(record.data, dict) else record.data
        return {
            "dashboard": dashboard.data["student_info"]["classroom"],
            "profile": profile.data["academic_info"]["classroom"],
            "record": records[0]["classroom"],
            "result portal": mine.data["classroom"]["id"],
        }

    def everywhere(self, section, room):
        name = f"{section.class_grade.name} {section.name}"
        return {"dashboard": name, "profile": name, "record": name, "result portal": room.id}

    def transfer_the_old_way(self, source, target):
        """What transfer_student did before c6d0ef43: the enrollment only."""
        StudentEnrollment.objects.filter(
            student=self.student, classroom=source, is_active=True).update(is_active=False)
        StudentEnrollment.objects.create(tenant=self.tenant, student=self.student, classroom=target)

    def repair(self, *extra):
        from io import StringIO
        from django.core.management import call_command

        out = StringIO()
        call_command("repair_transferred_students", "--tenant", self.tenant.slug, *extra, stdout=out)
        return out.getvalue()

    def test_student_pages_show_the_new_section_after_a_transfer(self):
        self.transfer(self.gold_room, self.silver_room)

        self.assertEqual(self.student_pages(), self.everywhere(self.silver, self.silver_room))

    def test_student_pages_show_the_new_class_after_a_transfer(self):
        self.transfer(self.gold_room, self.jss2_a_room)

        self.assertEqual(self.student_pages(), self.everywhere(self.jss2_a, self.jss2_a_room))

    def test_an_old_transfer_is_repaired(self):
        self.transfer_the_old_way(self.gold_room, self.silver_room)
        # The reported bug: the teacher has them in Silver, they see Gold.
        self.assertEqual(self.active_rooms(), [self.silver_room.id])
        self.assertEqual(self.student_pages(), self.everywhere(self.gold, self.gold_room))

        output = self.repair("--apply")

        self.assertIn("Moved 1 student(s)", output)
        self.student.refresh_from_db()
        self.assertEqual((self.student.student_class, self.student.section), (self.jss1, self.silver))
        self.assertEqual(self.student_pages(), self.everywhere(self.silver, self.silver_room))
        # And the next save no longer pulls them back into Gold.
        self.student.save()
        self.assertEqual(self.active_rooms(), [self.silver_room.id])

    def test_an_old_transfer_to_another_class_is_repaired(self):
        self.transfer_the_old_way(self.gold_room, self.jss2_a_room)

        self.repair("--apply")

        self.student.refresh_from_db()
        self.assertEqual((self.student.student_class, self.student.section), (self.jss2, self.jss2_a))

    def test_the_repair_is_a_dry_run_unless_applied(self):
        self.transfer_the_old_way(self.gold_room, self.silver_room)

        output = self.repair()

        self.assertIn("Would move 1 student(s)", output)
        self.student.refresh_from_db()
        self.assertEqual(self.student.section, self.gold)

    def test_the_repair_leaves_students_who_agree_alone(self):
        self.transfer(self.gold_room, self.silver_room)

        output = self.repair("--apply")

        self.assertIn("Moved 0 student(s); 0 disagree", output)

    def test_the_repair_doesnt_guess_without_a_record_of_leaving(self):
        """No ended enrollment in their own section: which side is wrong
        can't be told from the data, so it is reported, not changed."""
        StudentEnrollment.objects.filter(student=self.student).update(classroom=self.silver_room)

        output = self.repair("--apply")

        self.assertIn("Moved 0 student(s); 1 disagree", output)
        self.assertIn("check by hand", output)
        self.student.refresh_from_db()
        self.assertEqual(self.student.section, self.gold)
