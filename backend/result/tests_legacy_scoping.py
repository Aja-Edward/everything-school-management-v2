"""
The legacy result endpoints stay inside the school, and a section admin's
approvals inside their section.

StudentResult, StudentTermResult, ResultSheet, AssessmentScore and
ResultComment viewsets had no TenantFilterMixin, unlike every other viewset in
result/views.py. Their querysets spanned every school, so a school admin could
list, approve and publish another school's results by id.
"""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from classroom.models import Class
from common.education_levels import expand_tokens
from result.models import ExamSession, ExamType, GradingSystem, ResultSheet, StudentResult
from students.models import Student
from subject.models import Subject
from tenants.models import Tenant

User = get_user_model()


class LegacyResultsStayInTheirSchoolTest(APITestCase):
    URL = "/api/results/student-results/"

    def setUp(self):
        self.school = self._school("legacy-home")
        self.other = self._school("legacy-other")
        self.admin = self._user("legacy-admin", "admin", self.school, is_staff=True)
        self.outsider = self._user("legacy-outsider", "admin", self.other, is_staff=True)
        self.primary_admin = self._user("legacy-primary", "primary_admin", self.school)

        self.nursery_result = self._result(self.school, "NURSERY", "tot")
        self.primary_result = self._result(self.school, "PRIMARY", "kid")

    def _school(self, slug):
        return Tenant.objects.create(
            name=slug.title(), slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com",
        )

    def _user(self, name, role, tenant, **extra):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name,
            last_name="User", role=role, password=None, is_active=True,
            tenant=tenant, **extra,
        )

    def _result(self, tenant, level_token, name):
        level = EducationLevel.objects.filter(
            tenant=tenant, level_type__in=expand_tokens([level_token])
        ).first()
        student_class = Class.objects.create(
            tenant=tenant, name=f"Legacy {name}", code=f"LG{name.upper()}",
            education_level=level, grade_number=1, order=1,
        )
        student = Student.objects.create(
            user=self._user(f"legacy-{name}", "student", tenant), gender="F",
            date_of_birth=date(2018, 1, 1), student_class=student_class, tenant=tenant,
        )
        session = AcademicSession.objects.create(
            tenant=tenant, name=f"2026/{name}", start_date=date(2026, 9, 1),
            end_date=date(2027, 7, 31),
        )
        term_type, _ = TermType.objects.get_or_create(
            tenant=tenant, code="FIRST_TERM", defaults={"name": "First Term", "display_order": 1},
        )
        term = Term.objects.create(
            tenant=tenant, term_type=term_type, academic_session=session,
            start_date=date(2026, 9, 7), end_date=date(2026, 12, 16),
        )
        exam_type, _ = ExamType.objects.get_or_create(
            tenant=tenant, code=f"legacy-exam-{name}", defaults={"name": "Examination"},
        )
        exam_session = ExamSession.objects.create(
            tenant=tenant, name=f"Exam {name}", exam_type=exam_type,
            academic_session=session, term=term,
            start_date=date(2026, 12, 1), end_date=date(2026, 12, 12),
        )
        subject = Subject.objects.create(tenant=tenant, name=f"Maths {name}", code=f"M{name.upper()}")
        grading = GradingSystem.objects.create(
            tenant=tenant, name=f"Grading {name}", grading_type="PERCENTAGE", max_score=100,
        )
        return StudentResult.objects.create(
            tenant=tenant, student=student, subject=subject, exam_session=exam_session,
            grading_system=grading, status="DRAFT",
        )

    def _as(self, user, school):
        self.client.force_authenticate(user)
        return {"HTTP_X_TENANT_SLUG": school.slug}

    @staticmethod
    def _ids(response):
        body = response.json()
        rows = body["results"] if isinstance(body, dict) and "results" in body else body
        return {str(row["id"]) for row in rows}

    def test_another_schools_admin_does_not_see_the_results(self):
        response = self.client.get(self.URL, **self._as(self.outsider, self.other))

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self._ids(response), set())

    def test_nor_approve_them_by_id(self):
        response = self.client.post(
            f"{self.URL}{self.primary_result.pk}/approve/", **self._as(self.outsider, self.other)
        )

        self.assertEqual(response.status_code, 404)
        self.primary_result.refresh_from_db()
        self.assertEqual(self.primary_result.status, "DRAFT")

    def test_the_schools_admin_sees_all_its_results(self):
        response = self.client.get(self.URL, **self._as(self.admin, self.school))

        self.assertEqual(
            self._ids(response), {str(self.nursery_result.pk), str(self.primary_result.pk)}
        )

    def test_a_section_admin_approves_their_own_sections_result(self):
        response = self.client.post(
            f"{self.URL}{self.primary_result.pk}/approve/",
            **self._as(self.primary_admin, self.school),
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.primary_result.refresh_from_db()
        self.assertEqual(self.primary_result.status, "APPROVED")

    def test_but_not_another_sections(self):
        response = self.client.post(
            f"{self.URL}{self.nursery_result.pk}/approve/",
            **self._as(self.primary_admin, self.school),
        )

        self.assertIn(response.status_code, (403, 404))
        self.nursery_result.refresh_from_db()
        self.assertEqual(self.nursery_result.status, "DRAFT")

    # ── Result sheets ─────────────────────────────────────────────────────────

    def _generate(self, user, school, student_class):
        self.client.force_authenticate(user)
        return self.client.post(
            "/api/results/result-sheets/generate_sheet/",
            {"exam_session_id": str(self.primary_result.exam_session_id),
             "student_class_id": student_class.pk},
            format="json", HTTP_X_TENANT_SLUG=school.slug,
        )

    def test_a_student_cannot_make_a_result_sheet(self):
        pupil = self.primary_result.student.user

        response = self._generate(pupil, self.school, self.primary_result.student.student_class)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(ResultSheet.objects.exists())

    def test_a_sheet_is_made_in_the_callers_school(self):
        response = self._generate(self.admin, self.school, self.primary_result.student.student_class)

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(ResultSheet.objects.get().tenant, self.school)
