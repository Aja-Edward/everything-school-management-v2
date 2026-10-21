"""
One teacher for every subject in a class section.

Primary 3 Gold and Primary 3 Silver each have their own teacher who takes
all of the section's subjects. A teacher's result screens list only subjects
they are assigned, so whichever teaching model the school uses for the level,
that teacher must end up assigned to every subject of their section.
"""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from subject.models import Subject
from teacher.models import Teacher
from teacher.serializers import TeacherSerializer
from tenants.models import Tenant, TenantSettings

from .models import Class, Classroom, ClassroomTeacherAssignment, Section

User = get_user_model()
URL = "/api/classrooms/classrooms/"


class SectionTeacherTest(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Treasure Test", slug="treasure-test", status="active",
            is_active=True, owner_email="treasure@example.com")
        self.settings = TenantSettings.objects.create(
            tenant=self.tenant, primary_use_subject_teachers=True)
        level, _ = EducationLevel.objects.update_or_create(
            tenant=self.tenant, code="pri", defaults={"name": "Primary", "level_type": "PRIMARY"})
        session = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        term_type, _ = TermType.objects.get_or_create(
            tenant=self.tenant, code="FIRST_TERM", defaults={"name": "First Term", "display_order": 1})
        term = Term.objects.create(
            tenant=self.tenant, term_type=term_type, academic_session=session,
            start_date=date(2026, 9, 7), end_date=date(2026, 12, 16), is_current=True)
        p3 = Class.objects.create(
            tenant=self.tenant, name="Primary 3", code="P3", education_level=level,
            grade_number=3, order=3)
        self.gold_section = Section.objects.create(tenant=self.tenant, class_grade=p3, name="Gold")
        self.gold, self.silver = (
            Classroom.objects.create(
                tenant=self.tenant, name=f"Primary 3 {name}", academic_session=session, term=term,
                section=self.gold_section if name == "Gold" else
                Section.objects.create(tenant=self.tenant, class_grade=p3, name=name))
            for name in ("Gold", "Silver")
        )
        self.subjects = [
            Subject.objects.create(tenant=self.tenant, name=name, code=code, education_levels=["PRIMARY"])
            for name, code in [("Mathematics", "MTH"), ("English Studies", "ENG"), ("French", "FRE")]
        ]
        # Not a primary subject: never assigned to a primary class.
        Subject.objects.create(tenant=self.tenant, name="Chemistry", code="CHM",
                               education_levels=["SENIOR_SECONDARY"])

        self.martha = self.teacher("martha")
        self.evelyn = self.teacher("evelyn")
        self.french_teacher = self.teacher("french")
        self.admin = self.user("admin", "admin")
        # Evelyn already teaches Silver; a specialist has Gold's French.
        ClassroomTeacherAssignment.objects.create(
            tenant=self.tenant, classroom=self.silver, teacher=self.evelyn, subject=self.subjects[0])
        ClassroomTeacherAssignment.objects.create(
            tenant=self.tenant, classroom=self.gold, teacher=self.french_teacher, subject=self.subjects[2])

    def user(self, name, role):
        return User.objects.create_user(
            username=f"treasure_{name}", email=f"{name}@treasure.example.com", first_name=name.title(),
            last_name="Test", role=role, password=None, is_active=True, tenant=self.tenant,
            is_staff=role == "admin")  # as admin accounts are made (common.admin_access)

    def teacher(self, name):
        return Teacher.objects.create(tenant=self.tenant, user=self.user(name, "teacher"), employee_id=f"T-{name}")

    def teachers_of(self, classroom):
        return {
            a.subject.name: a.teacher.user.first_name
            for a in ClassroomTeacherAssignment.objects.filter(classroom=classroom, is_active=True)
            .select_related("subject", "teacher__user")
        }

    def post(self, path, data, user=None):
        self.client.force_authenticate(user=user or self.admin)
        return self.client.post(URL + path, data, format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)

    def test_admin_gives_one_teacher_every_subject_in_a_section(self):
        response = self.post(f"{self.gold.id}/assign_all_subjects/", {"teacher_id": self.martha.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["assigned"], 3)
        self.assertEqual(self.teachers_of(self.gold), {
            "Mathematics": "Martha", "English Studies": "Martha", "French": "Martha"})
        self.gold.refresh_from_db()
        self.assertEqual(self.gold.class_teacher, self.martha)
        # The other section keeps its own teacher.
        self.assertEqual(self.teachers_of(self.silver), {"Mathematics": "Evelyn"})

    def test_teachers_cannot_reassign_a_class(self):
        response = self.post(
            f"{self.gold.id}/assign_all_subjects/", {"teacher_id": self.martha.id}, user=self.martha.user)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.teachers_of(self.gold), {"French": "French"})

    def test_class_teacher_model_gives_the_class_teacher_every_subject(self):
        self.settings.primary_use_subject_teachers = False
        self.settings.save()
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            f"{URL}{self.gold.id}/", {"class_teacher": self.martha.id}, format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(set(self.teachers_of(self.gold).values()), {"Martha"})
        self.assertEqual(len(self.teachers_of(self.gold)), 3)

    def test_add_teacher_form_section_assignment_is_saved(self):
        # The nursery/primary form sends the section and chosen subjects, not
        # classroom/subject pairs; this used to be dropped.
        TeacherSerializer()._create_classroom_assignments(
            self.martha,
            [{"grade_level_id": "1", "section_id": str(self.gold_section.id),
              "subject_ids": [str(self.subjects[0].id), str(self.subjects[1].id)]}],
            None,
        )

        self.assertEqual(self.teachers_of(self.gold), {
            "Mathematics": "Martha", "English Studies": "Martha", "French": "French"})
        self.gold.refresh_from_db()
        self.assertEqual(self.gold.class_teacher, self.martha)
