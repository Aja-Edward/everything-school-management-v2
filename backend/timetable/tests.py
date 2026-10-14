"""
The timetable belongs to one school, is read by its signed-in users, and is
changed by its admins.

TimetableViewSet had no permission_classes, so the platform's AllowAny default
applied, and no school filter: anyone, signed in or not, could list every
school's timetable and create, edit or delete entries in it.
"""
from datetime import time

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from classroom.models import Section
from subject.models import Subject
from teacher.models import Teacher
from tenants.models import Tenant
from timetable.models import Timetable

User = get_user_model()
URL = "/api/timetable/timetables/"


class TimetableStaysInItsSchoolTest(APITestCase):
    def setUp(self):
        self.school = self._school("timetable-home")
        self.other = self._school("timetable-other")
        self.admin = self._user("tt-admin", "admin", self.school, is_staff=True)
        self.outsider = self._user("tt-outsider", "admin", self.other, is_staff=True)
        self.teacher_user = self._user("tt-teacher", "teacher", self.school)
        self.teacher = Teacher.objects.create(tenant=self.school, user=self.teacher_user, employee_id="TT1")
        from academics.models import EducationLevel
        from classroom.models import Class

        level = EducationLevel.objects.filter(tenant=self.school).first()
        grade = Class.objects.create(tenant=self.school, name="TT Class", code="TTC",
                                     education_level=level, grade_number=1, order=1)
        self.section = Section.objects.create(tenant=self.school, class_grade=grade, name="A")
        self.subject = Subject.objects.create(tenant=self.school, name="Maths", code="MTH")
        self.entry = Timetable.objects.create(
            tenant=self.school, section=self.section, subject=self.subject, teacher=self.teacher,
            day="Monday", start_time=time(8, 0), end_time=time(9, 0),
        )

    def _school(self, slug):
        return Tenant.objects.create(
            name=slug.title(), slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com",
        )

    def _user(self, name, role, tenant, **extra):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name, last_name="User",
            role=role, password=None, is_active=True, tenant=tenant, **extra,
        )

    def _payload(self, start):
        return {"section": self.section.pk, "subject": self.subject.pk, "teacher": self.teacher.pk,
                "day": "Tuesday", "start_time": start, "end_time": "11:00"}

    @staticmethod
    def _ids(response):
        body = response.json()
        rows = body["results"] if isinstance(body, dict) and "results" in body else body
        return {row["id"] for row in rows}

    def test_signed_out_visitors_get_nothing(self):
        response = self.client.get(URL, HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertIn(response.status_code, (401, 403))

    def test_nor_can_they_delete_an_entry(self):
        response = self.client.delete(f"{URL}{self.entry.pk}/", HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertIn(response.status_code, (401, 403))
        self.assertTrue(Timetable.objects.filter(pk=self.entry.pk).exists())

    def test_another_schools_admin_does_not_see_it(self):
        self.client.force_authenticate(self.outsider)

        response = self.client.get(URL, HTTP_X_TENANT_SLUG=self.other.slug)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._ids(response), set())

    def test_the_schools_admin_adds_an_entry_to_their_school(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(URL, self._payload("10:00"), format="json",
                                    HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Timetable.objects.get(pk=response.json()["id"]).tenant, self.school)

    def test_a_bulk_upload_is_saved_to_the_school(self):
        """Bulk saves bypass perform_create, so they used to save no school."""
        self.client.force_authenticate(self.admin)

        response = self.client.post(f"{URL}bulk-upload/", [self._payload("12:00")], format="json",
                                    HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Timetable.objects.get(start_time=time(12, 0)).tenant, self.school)

    def test_a_teacher_reads_but_cannot_change_it(self):
        self.client.force_authenticate(self.teacher_user)

        self.assertEqual(self.client.get(URL, HTTP_X_TENANT_SLUG=self.school.slug).status_code, 200)
        response = self.client.post(URL, self._payload("10:00"), format="json",
                                    HTTP_X_TENANT_SLUG=self.school.slug)
        self.assertEqual(response.status_code, 403)

    def test_the_test_email_page_is_not_served(self):
        """It sent a real email through Brevo to anyone who opened it."""
        self.assertEqual(self.client.get("/api/timetable/test-email/").status_code, 404)

    def test_exam_lookups_need_a_login(self):
        for path in ("/api/exams/exam-types/", "/api/exams/difficulty-levels/"):
            response = self.client.get(path, HTTP_X_TENANT_SLUG=self.school.slug)
            self.assertIn(response.status_code, (401, 403), path)
