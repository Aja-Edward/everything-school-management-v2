"""
What a student and a parent can see of results.

A report card reaches a student or parent only once the admin has published
it; drafts and approved-but-unpublished reports stay hidden. On top of that,
the parent dashboard's results show only while the admin has released the
Academics tab (TenantSettings.academics_tab_enabled), which is off by default.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from classroom.models import Class
from parent.models import ParentProfile, ParentStudentRelationship
from students.models import Student
from subject.models import Subject
from tenants.models import Tenant, TenantSettings

from .models import (
    ExamSession, ExamType, GradingSystem, PrimaryResult, PrimaryTermReport, StudentResult,
)

User = get_user_model()

TERM_REPORTS = "/api/results/primary/term-reports/"
PRIMARY_RESULTS = "/api/results/primary/results/"
SUBJECT_RESULTS = "/api/results/subject-results/"
PARENT_DASHBOARD = "/api/parents/dashboard/"


class AcademicsAccessTest(APITestCase):
    def setUp(self):
        self.slug = "acad-school"
        self.tenant = Tenant.objects.create(
            name="Acad School", slug=self.slug, status="active",
            is_active=True, owner_email="acad@example.com")
        self.settings = TenantSettings.objects.create(tenant=self.tenant)
        level, _ = EducationLevel.objects.update_or_create(
            tenant=self.tenant, code="pri",
            defaults={"name": "Primary", "level_type": "PRIMARY"})
        session = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        exam_type, _ = ExamType.objects.get_or_create(
            tenant=self.tenant, code="exam", defaults={"name": "Exam"})
        self.exam_sessions = []
        for order, (code, name) in enumerate(
            [("FIRST_TERM", "First Term"), ("SECOND_TERM", "Second Term"), ("THIRD_TERM", "Third Term")], 1
        ):
            term_type, _ = TermType.objects.get_or_create(
                tenant=self.tenant, code=code, defaults={"name": name, "display_order": order})
            term = Term.objects.create(
                tenant=self.tenant, term_type=term_type, academic_session=session,
                start_date=date(2026, 9, 7), end_date=date(2026, 12, 16))
            self.exam_sessions.append(ExamSession.objects.create(
                tenant=self.tenant, name=f"{name} Exam", exam_type=exam_type,
                academic_session=session, term=term,
                start_date=date(2026, 12, 1), end_date=date(2026, 12, 10)))

        p3 = Class.objects.create(
            tenant=self.tenant, name="Primary 3", code="P3", education_level=level,
            grade_number=3, order=3)
        self.student_user = User.objects.create_user(
            username="acad_kid", email="kid@acad.example.com", first_name="Kid",
            last_name="Test", role="student", password=None, is_active=True, tenant=self.tenant)
        self.student = Student.objects.create(
            tenant=self.tenant, user=self.student_user, gender="F",
            date_of_birth=date(2017, 5, 1), student_class=p3)
        self.parent_user = User.objects.create_user(
            username="acad_mum", email="mum@acad.example.com", first_name="Mum",
            last_name="Test", role="parent", password=None, is_active=True, tenant=self.tenant)
        self.parent = ParentProfile.objects.create(tenant=self.tenant, user=self.parent_user)
        ParentStudentRelationship.objects.create(
            tenant=self.tenant, parent=self.parent, student=self.student, relationship="Mother")

        # One report per status, one term each.
        for exam_session, status in zip(self.exam_sessions, ["DRAFT", "APPROVED", "PUBLISHED"]):
            PrimaryTermReport.objects.create(
                tenant=self.tenant, student=self.student, exam_session=exam_session,
                average_score=Decimal("70"), status=status)

    def get(self, user, url):
        self.client.force_authenticate(user=user)
        return self.client.get(url, HTTP_X_TENANT_SLUG=self.slug)

    def statuses(self, user):
        response = self.get(user, TERM_REPORTS)
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        rows = data["results"] if isinstance(data, dict) else data
        return sorted(r["status"] for r in rows)

    def test_student_sees_only_published_report_cards(self):
        self.assertEqual(self.statuses(self.student_user), ["PUBLISHED"])

    def release_academics(self):
        self.settings.academics_tab_enabled = True
        self.settings.save()

    def test_parent_sees_only_published_report_cards(self):
        self.release_academics()
        self.assertEqual(self.statuses(self.parent_user), ["PUBLISHED"])

    def test_parent_sees_no_report_cards_while_the_tab_is_off(self):
        self.assertEqual(self.statuses(self.parent_user), [])

    def test_academics_tab_is_off_until_the_admin_releases_it(self):
        self.assertFalse(TenantSettings.objects.get(tenant=self.tenant).academics_tab_enabled)

    def make_subject_results(self):
        grading = GradingSystem.objects.create(
            tenant=self.tenant, name="Standard", grading_type="PERCENTAGE")
        subject = Subject.objects.create(tenant=self.tenant, name="Mathematics", code="MTH")
        for exam_session, status, pct in zip(
            self.exam_sessions, ["DRAFT", "APPROVED", "PUBLISHED"], [20, 30, 80]
        ):
            result = StudentResult.objects.create(
                tenant=self.tenant, student=self.student, subject=subject,
                exam_session=exam_session, grading_system=grading, status=status)
            StudentResult.objects.filter(pk=result.pk).update(percentage=Decimal(pct))

    def test_parent_dashboard_hides_results_while_the_tab_is_off(self):
        self.make_subject_results()

        data = self.get(self.parent_user, PARENT_DASHBOARD).json()

        self.assertFalse(data["academics_visible"])
        child = data["dashboard"][0]
        self.assertEqual(child["recent_results"], [])
        self.assertEqual(child["average_score"], 0)
        self.assertIsNone(child["alert"])

    def test_parent_dashboard_shows_only_published_results_once_released(self):
        self.make_subject_results()
        self.release_academics()

        data = self.get(self.parent_user, PARENT_DASHBOARD).json()

        self.assertTrue(data["academics_visible"])
        child = data["dashboard"][0]
        self.assertEqual([r["score"] for r in child["recent_results"]], [80.0])
        self.assertEqual(child["average_score"], 80)

    # -- Every other way a parent can reach results -------------------------

    def make_primary_results(self):
        grading = GradingSystem.objects.create(
            tenant=self.tenant, name="Primary", grading_type="PERCENTAGE")
        subject = Subject.objects.create(tenant=self.tenant, name="English", code="ENG")
        for exam_session, status in zip(self.exam_sessions, ["DRAFT", "APPROVED", "PUBLISHED"]):
            PrimaryResult.objects.create(
                tenant=self.tenant, student=self.student, subject=subject,
                exam_session=exam_session, grading_system=grading, status=status)

    def rows(self, user, url):
        response = self.get(user, url)
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        return data["results"] if isinstance(data, dict) else data

    def test_result_endpoints_give_a_parent_nothing_while_the_tab_is_off(self):
        self.make_primary_results()

        self.assertEqual(self.rows(self.parent_user, PRIMARY_RESULTS), [])
        self.assertEqual(self.rows(self.parent_user, SUBJECT_RESULTS), [])

    def test_result_endpoints_give_a_parent_published_results_once_released(self):
        self.make_primary_results()
        self.release_academics()

        rows = self.rows(self.parent_user, PRIMARY_RESULTS)
        self.assertEqual([r["status"] for r in rows], ["PUBLISHED"])
        rows = self.rows(self.parent_user, SUBJECT_RESULTS)
        self.assertEqual([r["status"] for r in rows], ["PUBLISHED"])

    def test_students_own_results_do_not_depend_on_the_parent_setting(self):
        # The setting gates families; it must not take a student's published
        # results away from the student's other pages.
        self.make_primary_results()
        rows = self.rows(self.student_user, PRIMARY_RESULTS)
        self.assertEqual([r["status"] for r in rows], ["PUBLISHED"])

    def test_child_detail_hides_results_while_the_tab_is_off(self):
        self.make_subject_results()

        response = self.get(self.parent_user, f"/api/parents/students/{self.student.id}/")

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertFalse(data["academics_visible"])
        self.assertEqual(data["recent_results"], [])
        self.assertEqual(data["average_score"], 0)

    def test_child_detail_shows_published_results_once_released(self):
        self.make_subject_results()
        self.release_academics()

        data = self.get(self.parent_user, f"/api/parents/students/{self.student.id}/").json()

        self.assertEqual([r["score"] for r in data["recent_results"]], [80.0])
        self.assertEqual(data["recent_results"][0]["term"], "Third Term")

    # -- What each result says about itself --------------------------------

    def test_each_recent_result_carries_its_term_session_and_a_real_date(self):
        self.make_subject_results()
        self.release_academics()

        result = self.get(self.parent_user, PARENT_DASHBOARD).json()["dashboard"][0]["recent_results"][0]

        self.assertEqual(result["subject"], "Mathematics")
        self.assertEqual(result["term"], "Third Term")
        self.assertEqual(result["session"], "2026/2027")
        self.assertEqual(result["exam_name"], "Third Term Exam")
        # An ISO date the page can format, not the exam session's name.
        self.assertEqual(result["exam_date"], "2026-12-10")

    def test_another_parent_cannot_load_this_parents_summary_by_id(self):
        self.make_subject_results()
        self.release_academics()
        other_user = User.objects.create_user(
            username="acad_other", email="other@acad.example.com", first_name="Other",
            last_name="Parent", role="parent", password=None, is_active=True, tenant=self.tenant)
        ParentProfile.objects.create(tenant=self.tenant, user=other_user)

        response = self.get(other_user, f"/api/dashboard/parent/{self.parent.id}/summary/")

        self.assertEqual(response.status_code, 403, response.content)
