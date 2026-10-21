"""
Positions within a section or across the whole class.

Primary 3 has two sections, Gold (3 pupils) and Silver (2). By default a
pupil is ranked against all of Primary 3; a school that switches on
rank_within_section ranks them against their own section only, for term
positions, "number in class", subject positions and a subject's highest and
lowest. Terms already published to parents keep the positions they had.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from classroom.models import Class, Section
from students.models import Student
from subject.models import Subject
from tenants.models import Tenant, TenantSettings

from .models import ExamSession, ExamType, GradingSystem, PrimaryResult, PrimaryTermReport
from .report_generation import PrimaryReportGenerator

User = get_user_model()


class SectionRankingTest(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Rank School", slug="rank-school", status="active",
            is_active=True, owner_email="rank@example.com")
        self.settings = TenantSettings.objects.create(tenant=self.tenant)
        level, _ = EducationLevel.objects.update_or_create(
            tenant=self.tenant, code="pri",
            defaults={"name": "Primary", "level_type": "PRIMARY"})
        session = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027", start_date=date(2026, 9, 7),
            end_date=date(2027, 7, 23), is_current=True)
        exam_type, _ = ExamType.objects.get_or_create(
            tenant=self.tenant, code="exam", defaults={"name": "Exam"})
        self.terms = []
        for order, (code, name) in enumerate([("FIRST_TERM", "First Term"), ("SECOND_TERM", "Second Term")], 1):
            term_type, _ = TermType.objects.get_or_create(
                tenant=self.tenant, code=code, defaults={"name": name, "display_order": order})
            term = Term.objects.create(
                tenant=self.tenant, term_type=term_type, academic_session=session,
                start_date=date(2026, 9, 7), end_date=date(2026, 12, 16))
            self.terms.append(ExamSession.objects.create(
                tenant=self.tenant, name=f"{name} Exam", exam_type=exam_type,
                academic_session=session, term=term,
                start_date=date(2026, 12, 1), end_date=date(2026, 12, 10)))
        self.first_term, self.second_term = self.terms

        self.p3 = Class.objects.create(
            tenant=self.tenant, name="Primary 3", code="P3", education_level=level,
            grade_number=3, order=3)
        gold = Section.objects.create(tenant=self.tenant, class_grade=self.p3, name="Gold")
        silver = Section.objects.create(tenant=self.tenant, class_grade=self.p3, name="Silver")
        # Gold: 90, 80, 70. Silver: 85, 60.
        self.pupils = {
            name: self.pupil(name, section)
            for name, section in [("ade", gold), ("bisi", gold), ("chidi", gold),
                                  ("dayo", silver), ("ebun", silver)]
        }
        self.scores = {"ade": 90, "bisi": 80, "chidi": 70, "dayo": 85, "ebun": 60}
        self.grading = GradingSystem.objects.create(
            tenant=self.tenant, name="Standard", grading_type="PERCENTAGE")
        self.maths = Subject.objects.create(tenant=self.tenant, name="Mathematics", code="MTH")

    def pupil(self, name, section):
        user = User.objects.create_user(
            username=f"rank_{name}", email=f"{name}@rank.example.com", first_name=name.title(),
            last_name="Test", role="student", password=None, is_active=True, tenant=self.tenant)
        return Student.objects.create(
            tenant=self.tenant, user=user, gender="F", date_of_birth=date(2017, 5, 1),
            student_class=self.p3, section=section)

    def term_reports(self, exam_session, status="APPROVED"):
        for name, pupil in self.pupils.items():
            PrimaryTermReport.objects.create(
                tenant=self.tenant, student=pupil, exam_session=exam_session,
                average_score=Decimal(self.scores[name]), status=status)
        PrimaryTermReport.bulk_recalculate_positions(exam_session=exam_session, student_class=self.p3)

    def positions(self, exam_session):
        return {
            r.student.user.first_name.lower(): (r.class_position, r.total_students)
            for r in PrimaryTermReport.objects.filter(exam_session=exam_session).select_related("student__user")
        }

    def rank_within_section(self, on=True):
        self.settings.rank_within_section = on
        self.settings.save()

    def test_whole_class_by_default(self):
        self.term_reports(self.first_term)

        self.assertEqual(self.positions(self.first_term), {
            "ade": (1, 5), "dayo": (2, 5), "bisi": (3, 5), "chidi": (4, 5), "ebun": (5, 5),
        })

    def test_within_section_when_switched_on(self):
        self.rank_within_section()
        self.term_reports(self.first_term)

        self.assertEqual(self.positions(self.first_term), {
            "ade": (1, 3), "bisi": (2, 3), "chidi": (3, 3),
            "dayo": (1, 2), "ebun": (2, 2),
        })

    def test_subject_position_and_highest_lowest_follow_the_section(self):
        self.rank_within_section()
        for name, pupil in self.pupils.items():
            result = PrimaryResult.objects.create(
                tenant=self.tenant, student=pupil, subject=self.maths, exam_session=self.first_term,
                grading_system=self.grading, status="APPROVED")
            # save() works the percentage out from component scores; set it directly.
            PrimaryResult.objects.filter(pk=result.pk).update(percentage=Decimal(self.scores[name]))

        PrimaryResult.bulk_recalculate_class(
            exam_session=self.first_term, subject=self.maths, student_class=self.p3,
            education_level="PRIMARY")

        rows = {
            r.student.user.first_name.lower(): (r.subject_position, r.highest_in_class, r.lowest_in_class)
            for r in PrimaryResult.objects.select_related("student__user")
        }
        self.assertEqual(rows["bisi"], (2, Decimal("90.00"), Decimal("70.00")))
        self.assertEqual(rows["dayo"], (1, Decimal("85.00"), Decimal("60.00")))

    def test_published_term_keeps_its_positions_when_the_switch_changes(self):
        self.term_reports(self.first_term, status="PUBLISHED")
        self.rank_within_section()

        # A later recalculation of the published term, e.g. after a correction.
        PrimaryTermReport.bulk_recalculate_positions(exam_session=self.first_term, student_class=self.p3)
        self.term_reports(self.second_term)

        self.assertEqual(self.positions(self.first_term)["dayo"], (2, 5))
        self.assertEqual(self.positions(self.second_term)["dayo"], (1, 2))

    def test_printed_report_counts_the_section(self):
        generator = PrimaryReportGenerator()
        bisi = self.pupils["bisi"]

        self.assertEqual(generator.count_students_in_class(bisi, self.first_term), 5)
        self.rank_within_section()
        self.assertEqual(generator.count_students_in_class(bisi, self.first_term), 3)

    def test_school_switches_it_on_from_settings(self):
        admin = User.objects.create_user(
            username="rank_admin", email="admin@rank.example.com", role="admin",
            password=None, is_active=True, tenant=self.tenant)
        self.client.force_authenticate(user=admin)

        response = self.client.patch(
            "/api/tenants/settings/current/", {"rank_within_section": True}, format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["rank_within_section"])
        self.settings.refresh_from_db()
        self.assertTrue(self.settings.rank_within_section)
