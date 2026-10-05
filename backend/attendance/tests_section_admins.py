"""
A section admin keeps their own section's attendance register.

Attendance writes are gated on Roles & Permissions assignments. A section
admin had none, so they were refused the register their role is for; the
school's plain "admin" accounts were too. The register now lets both in by
role, and holds a section admin to their own section's pupils.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from academics.models import EducationLevel
from attendance.models import Attendance
from classroom.models import Class, Section
from common.education_levels import expand_tokens
from students.models import Student
from tenants.models import Tenant

User = get_user_model()


class SectionAdminKeepsTheirRegisterTest(APITestCase):
    def setUp(self):
        self.school = Tenant.objects.create(
            name="Register School", slug="register-school", status="active",
            is_active=True, owner_email="register@example.com",
        )
        levels = EducationLevel.objects.filter(tenant=self.school)
        nursery = levels.filter(level_type__in=expand_tokens(["NURSERY"])).first()
        primary = levels.filter(level_type__in=expand_tokens(["PRIMARY"])).first()
        self.assertTrue(nursery and primary, "school seeding should create both levels")

        self.nursery_section = self._section("Test Nursery", "TNUR", nursery)
        self.primary_section = self._section("Test Primary", "TPRI", primary)
        self.nursery_pupil = self._pupil("tot", self.nursery_section)
        self.primary_pupil = self._pupil("kid", self.primary_section)

        self.primary_admin = self._user("register-primary", "primary_admin")
        self.school_admin = self._user("register-admin", "admin", is_staff=True)

    def _section(self, name, code, level):
        grade = Class.objects.create(
            tenant=self.school, name=name, code=code, education_level=level,
            grade_number=1, order=1,
        )
        return Section.objects.create(tenant=self.school, class_grade=grade, name="Gold")

    def _user(self, name, role, **extra):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name,
            last_name="User", role=role, password=None, is_active=True,
            tenant=self.school, **extra,
        )

    def _pupil(self, name, section):
        return Student.objects.create(
            user=self._user(name, "student"), gender="F",
            date_of_birth=date(2019, 5, 1), student_class=section.class_grade,
            section=section, tenant=self.school,
        )

    def _mark(self, user, pupil, section):
        self.client.force_authenticate(user)
        return self.client.post(
            reverse("attendance-bulk-upsert"),
            {"records": [{
                "student": pupil.pk, "section": section.pk,
                "date": date.today().isoformat(), "status": "P",
            }]},
            format="json", HTTP_X_TENANT_SLUG=self.school.slug,
        )

    def test_a_section_admin_marks_their_own_sections_pupils(self):
        response = self._mark(self.primary_admin, self.primary_pupil, self.primary_section)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(Attendance.objects.filter(student=self.primary_pupil).exists())

    def test_but_not_another_sections(self):
        response = self._mark(self.primary_admin, self.nursery_pupil, self.nursery_section)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Attendance.objects.filter(student=self.nursery_pupil).exists())

    def test_nor_by_filing_another_sections_pupil_under_their_class(self):
        response = self._mark(self.primary_admin, self.nursery_pupil, self.primary_section)

        self.assertEqual(response.status_code, 403)

    def test_a_school_admin_marks_any_section(self):
        response = self._mark(self.school_admin, self.nursery_pupil, self.nursery_section)

        self.assertEqual(response.status_code, 200, response.content)

    def test_a_section_admin_only_lists_their_sections_register(self):
        for pupil, section in (
            (self.nursery_pupil, self.nursery_section),
            (self.primary_pupil, self.primary_section),
        ):
            Attendance.objects.create(
                tenant=self.school, student=pupil, section=section,
                date=date.today(), status="P",
            )
        self.client.force_authenticate(self.primary_admin)

        response = self.client.get(reverse("attendance-list"), HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(response.status_code, 200)
        pupils = {row["student"] for row in response.data["results"]}
        self.assertEqual(pupils, {self.primary_pupil.pk})

    def test_school_wide_views_do_not_let_a_section_admin_in(self):
        """The gate is every section's; only views that hold them to theirs opt in."""
        from types import SimpleNamespace

        from schoolSettings.permissions import HasAttendancePermission

        request = SimpleNamespace(user=self.primary_admin, tenant=self.school, method="POST")
        gate_like_view = SimpleNamespace()

        self.assertFalse(HasAttendancePermission().has_permission(request, gate_like_view))
