"""
Classrooms: their term must belong to their academic session.
"""

from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from classroom.models import Class, Classroom, Section
from tenants.models import Tenant

User = get_user_model()


class ClassroomTermTest(APITestCase):
    URL = "/api/classrooms/classrooms/"

    def setUp(self):
        self.tenant = self.make_tenant("classroom-term-school")
        level, _ = EducationLevel.objects.update_or_create(
            tenant=self.tenant, code="jss", defaults={"name": "Junior Secondary", "level_type": "JUNIOR_SECONDARY"})
        jss1 = Class.objects.create(
            tenant=self.tenant, name="JSS 1 (room)", code="JSS_1_ROOM",
            education_level=level, grade_number=1, order=1)
        self.section = Section.objects.create(tenant=self.tenant, class_grade=jss1, name="Frankincense")
        self.last_year = AcademicSession.objects.create(
            tenant=self.tenant, name="2025/2026", start_date=date(2025, 9, 8), end_date=date(2026, 7, 24))
        self.this_year = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027", start_date=date(2026, 9, 7), end_date=date(2027, 7, 23),
            is_current=True)
        self.third_term = self.make_term(self.last_year, "Third Term", 3, date(2026, 4, 20), date(2026, 7, 24))
        self.first_term = self.make_term(self.this_year, "First Term", 1, date(2026, 9, 7), date(2026, 12, 16))
        admin = User.objects.create_user(
            username="classroom_term_admin", email="classroom_term_admin@example.com", role="admin",
            password="testpass123", is_active=True, tenant=self.tenant)
        self.client.force_authenticate(user=admin)

    def make_tenant(self, slug):
        return Tenant.objects.create(
            name=slug.replace("-", " ").title(), slug=slug, status="active",
            is_active=True, owner_email=f"{slug}@example.com")

    def make_term(self, session, name, order, start, end):
        term_type, _ = TermType.objects.get_or_create(
            tenant=session.tenant, code=name.upper().replace(" ", "_"),
            defaults={"name": name, "display_order": order})
        return Term.objects.create(
            tenant=session.tenant, term_type=term_type, academic_session=session,
            start_date=start, end_date=end)

    def post(self, session, term):
        return self.client.post(
            self.URL, {"name": "J S S 1", "section": self.section.id, "academic_session": session.id,
                       "term": term.id, "max_capacity": 30},
            format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)

    def test_term_from_another_session_is_refused(self):
        """The regression: classrooms were saved as 2025/2026 with 2026/2027's First Term."""
        response = self.post(self.last_year, self.first_term)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("First Term is a term of 2026/2027, not 2025/2026", str(response.data["term"]))
        self.assertFalse(Classroom.objects.filter(tenant=self.tenant).exists())

    def test_matching_term_saves_under_the_chosen_session(self):
        response = self.post(self.this_year, self.first_term)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        classroom = Classroom.objects.get(tenant=self.tenant)
        self.assertEqual((classroom.academic_session, classroom.term), (self.this_year, self.first_term))

    def test_changing_the_term_alone_is_checked_against_the_saved_session(self):
        classroom = Classroom.objects.create(
            tenant=self.tenant, name="J S S 1", section=self.section,
            academic_session=self.this_year, term=self.first_term)

        response = self.client.patch(
            f"{self.URL}{classroom.id}/", {"term": self.third_term.id}, format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        classroom.refresh_from_db()
        self.assertEqual(classroom.term, self.first_term)
