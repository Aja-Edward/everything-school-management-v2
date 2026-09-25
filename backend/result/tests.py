"""
Exam sessions: their term must belong to their academic session.
Assessment components: their education level must belong to the same school.
"""

from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from result.models import AssessmentComponent, ExamSession, ExamType
from tenants.models import Tenant

User = get_user_model()


class ExamSessionTermTest(APITestCase):
    URL = "/api/results/exam-sessions/"

    def setUp(self):
        self.tenant = self.make_tenant("exam-term-school")
        # Same start date on purpose: that tie is what used to pick the wrong session.
        self.last_year = AcademicSession.objects.create(
            tenant=self.tenant, name="2025/2026", start_date=date(2025, 9, 8), end_date=date(2026, 7, 24))
        self.this_year = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027", start_date=date(2025, 9, 8), end_date=date(2027, 7, 23),
            is_current=True)
        self.third_term = self.make_term(self.last_year, "Third Term", 3, date(2026, 4, 20), date(2026, 7, 24))
        self.first_term = self.make_term(self.this_year, "First Term", 1, date(2026, 9, 7), date(2026, 12, 16))
        self.exam_type, _ = ExamType.objects.get_or_create(
            tenant=self.tenant, code="exam-term-exam", defaults={"name": "Examination"})
        admin = User.objects.create_user(
            username="exam_term_admin", email="exam_term_admin@example.com", role="admin",
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

    def payload(self, session, term, **extra):
        return {"name": "June Exam", "exam_type": self.exam_type.id, "academic_session": session.id,
                "term": term.id, "start_date": "2026-06-15", "end_date": "2026-07-03", **extra}

    def post(self, data):
        return self.client.post(self.URL, data, format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)

    def test_term_from_another_session_is_refused(self):
        """The regression: the June 2025/2026 exam was saved with 2026/2027's First Term."""
        response = self.post(self.payload(self.last_year, self.first_term))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("First Term is a term of 2026/2027, not 2025/2026", str(response.data["term"]))
        self.assertFalse(ExamSession.objects.filter(tenant=self.tenant).exists())

    def test_matching_term_saves_under_the_chosen_session(self):
        """The regression: the chosen session was swapped for the first active one."""
        response = self.post(self.payload(self.last_year, self.third_term))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        exam_session = ExamSession.objects.get(tenant=self.tenant)
        self.assertEqual(exam_session.academic_session, self.last_year)
        self.assertEqual(exam_session.term, self.third_term)

        response = self.post(self.payload(self.this_year, self.first_term, name="First Term Exam",
                                          start_date="2026-12-01", end_date="2026-12-12"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(ExamSession.objects.get(name="First Term Exam").academic_session, self.this_year)

    def test_changing_the_term_alone_is_checked_against_the_saved_session(self):
        exam_session = ExamSession.objects.create(
            tenant=self.tenant, name="June Exam", exam_type=self.exam_type,
            academic_session=self.last_year, term=self.third_term,
            start_date=date(2026, 6, 15), end_date=date(2026, 7, 3))

        response = self.client.patch(
            f"{self.URL}{exam_session.id}/", {"term": self.first_term.id}, format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        exam_session.refresh_from_db()
        self.assertEqual(exam_session.term, self.third_term)

    def test_another_schools_session_and_term_are_refused(self):
        other = self.make_tenant("exam-term-elsewhere")
        their_session = AcademicSession.objects.create(
            tenant=other, name="2025/2026", start_date=date(2025, 9, 1), end_date=date(2026, 7, 31))
        their_term = self.make_term(their_session, "Third Term", 3, date(2026, 4, 20), date(2026, 7, 20))

        response = self.post(self.payload(their_session, their_term))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

        response = self.post(self.payload(self.last_year, their_term))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

        self.assertFalse(ExamSession.objects.exists())


class AssessmentComponentLevelTest(APITestCase):
    """
    A component must hang off one of the caller's own education levels.

    The regression: the create serializer offered every school's levels, so a
    posted id belonging to another school was accepted. One school ended up
    with 60 components attached to another school's nursery and primary.
    """

    URL = "/api/results/assessment-components/"

    def setUp(self):
        self.tenant = self.make_tenant("component-school")
        self.other = self.make_tenant("component-elsewhere")
        self.my_level = self.make_level(self.tenant, "primary")
        self.their_level = self.make_level(self.other, "primary")
        admin = User.objects.create_user(
            username="component_admin", email="component_admin@example.com", role="admin",
            password="testpass123", is_active=True, tenant=self.tenant)
        self.client.force_authenticate(user=admin)

    def make_tenant(self, slug):
        return Tenant.objects.create(
            name=slug.replace("-", " ").title(), slug=slug, status="active",
            is_active=True, owner_email=f"{slug}@example.com")

    def make_level(self, tenant, code):
        level, _ = EducationLevel.objects.get_or_create(
            tenant=tenant, code=code, defaults={"name": code.title(), "level_type": code.upper()})
        return level

    # Creating a tenant seeds it a set of components, so every assertion below
    # looks for this one by its own code rather than counting the table.
    CODE = "CA1-PORTED"

    def post(self, level):
        return self.client.post(
            self.URL,
            {"education_level": level.id, "name": "First CA", "code": self.CODE,
             "component_type": "CA", "max_score": 20},
            format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)

    def mine(self):
        # The serializer lowercases code on the way in.
        return AssessmentComponent.objects.filter(code__iexact=self.CODE)

    def test_a_component_can_be_added_to_our_own_level(self):
        response = self.post(self.my_level)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        component = self.mine().get()
        self.assertEqual(component.education_level, self.my_level)
        self.assertEqual(component.tenant, self.tenant)

    def test_another_schools_education_level_is_refused(self):
        response = self.post(self.their_level)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("another school", str(response.data))
        self.assertFalse(self.mine().exists())
