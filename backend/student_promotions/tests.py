"""
Promotion engine: reading term averages, and applying promotions (moving
students into the next class).
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import AcademicSession, EducationLevel, Term, TermType
from classroom.models import Class, Classroom, Section, StudentEnrollment
from result.models import ExamSession, ExamType, PrimaryTermReport
from students.models import Student
from tenants.models import Tenant

from .engine import PromotionApplyError, PromotionEngine
from .models import StudentPromotion

User = get_user_model()


class PromotionFixtureMixin:
    def make_school(self):
        self.tenant = Tenant.objects.create(
            name="Promo School",
            slug="promo-school",
            status="active",
            is_active=True,
            owner_email="owner@example.com",
        )
        self.nursery = self.make_level("nursery", "Nursery", "NURSERY", 1)
        self.primary = self.make_level("primary", "Primary", "PRIMARY", 2)
        self.jss = self.make_level("jss", "Junior Secondary", "JUNIOR_SECONDARY", 3)

        # Replace the tenant's seeded classes with a known set. As in real
        # schools, order restarts inside each education level.
        Class.objects.filter(tenant=self.tenant).delete()
        self.nursery2 = self.make_class("Nursery 2", order=2, level=self.nursery)
        self.p1 = self.make_class("Primary 1", order=1)
        self.p2 = self.make_class("Primary 2", order=2)
        self.jss1 = self.make_class("JSS 1", order=1, level=self.jss)

        # Not current, so the Student post_save enrolment signal stays out of
        # the way unless a test opts in.
        self.session = AcademicSession.objects.create(
            tenant=self.tenant,
            name="2025/2026",
            start_date=date(2025, 9, 1),
            end_date=date(2026, 7, 31),
        )
        self.exam_type, _ = ExamType.objects.get_or_create(
            tenant=self.tenant, code="promo-exam", defaults={"name": "Exam"})

        self.terms = []
        self.exam_sessions = []
        for i, (code, name, start, end) in enumerate([
            ("FT", "First Term", date(2025, 9, 1), date(2025, 12, 15)),
            ("ST", "Second Term", date(2026, 1, 5), date(2026, 4, 1)),
            ("TT", "Third Term", date(2026, 4, 20), date(2026, 7, 20)),
        ], start=1):
            term_type, _ = TermType.objects.get_or_create(
                tenant=self.tenant, code=code,
                defaults={"name": name, "display_order": i})
            term = Term.objects.create(
                tenant=self.tenant, term_type=term_type, academic_session=self.session,
                start_date=start, end_date=end)
            self.terms.append(term)
            self.exam_sessions.append(ExamSession.objects.create(
                tenant=self.tenant, name=f"{name} Exam", exam_type=self.exam_type,
                academic_session=self.session, term=term,
                start_date=start, end_date=end))

    def make_level(self, code, name, level_type, display_order):
        level, _ = EducationLevel.objects.update_or_create(
            tenant=self.tenant, code=code,
            defaults={"name": name, "level_type": level_type, "display_order": display_order})
        return level

    def make_class(self, name, order, level=None):
        return Class.objects.create(
            tenant=self.tenant, name=name, code=name.upper().replace(" ", "_"),
            education_level=level or self.primary, grade_number=order, order=order)

    def make_student(self, username, student_class=None, section=None):
        user = User.objects.create_user(
            username=username, email=f"{username}@example.com",
            first_name=username.title(), last_name="Test", role="student",
            password="testpass123", is_active=True, tenant=self.tenant)
        return Student.objects.create(
            user=user, gender="F", date_of_birth=date(2016, 1, 1),
            student_class=student_class or self.p1, section=section,
            tenant=self.tenant)

    def give_results(self, student, averages, status_="PUBLISHED"):
        for exam_session, avg in zip(self.exam_sessions, averages):
            PrimaryTermReport.objects.create(
                tenant=self.tenant, student=student, exam_session=exam_session,
                average_score=Decimal(str(avg)), status=status_)

    def run_auto(self, student_class=None):
        return PromotionEngine(self.tenant).run_for_class(
            academic_session=self.session, student_class=student_class or self.p1)

    def apply(self, student_class=None, dry_run=False):
        return PromotionEngine(self.tenant).apply_promotions(
            academic_session=self.session, student_class=student_class or self.p1,
            dry_run=dry_run)


class RunAutoPromotionTest(PromotionFixtureMixin, TestCase):
    def setUp(self):
        self.make_school()

    def test_reads_all_three_terms_and_decides(self):
        """The regression: term="FIRST" against a FK raised ValueError for every class."""
        passing = self.make_student("passing")
        failing = self.make_student("failing")
        self.give_results(passing, [60, 70, 80])
        self.give_results(failing, [40, 45, 30])

        self.run_auto()

        promo = StudentPromotion.objects.get(student=passing)
        self.assertEqual(
            (promo.term1_average, promo.term2_average, promo.term3_average),
            (Decimal("60.00"), Decimal("70.00"), Decimal("80.00")))
        self.assertEqual(promo.terms_counted, 3)
        self.assertEqual(promo.status, "PROMOTED")
        self.assertEqual(StudentPromotion.objects.get(student=failing).status, "FLAGGED")

    def test_draft_reports_do_not_count(self):
        student = self.make_student("drafty")
        self.give_results(student, [60, 70, 80], status_="DRAFT")

        self.run_auto()

        promo = StudentPromotion.objects.get(student=student)
        self.assertEqual(promo.terms_counted, 0)
        self.assertEqual(promo.status, "PENDING")

    def test_report_on_another_exam_session_of_the_same_term_is_found(self):
        student = self.make_student("second_exam")
        self.give_results(student, [60, 70])
        ca_type, _ = ExamType.objects.get_or_create(
            tenant=self.tenant, code="promo-ca", defaults={"name": "CA"})
        term3 = self.terms[2]
        # A CA session in the same term, with the same start date, so picking
        # "the" exam session for the term is a coin toss.
        ExamSession.objects.create(
            tenant=self.tenant, name="Third Term CA", exam_type=ca_type,
            academic_session=self.session, term=term3,
            start_date=term3.start_date, end_date=term3.end_date)
        PrimaryTermReport.objects.create(
            tenant=self.tenant, student=student, exam_session=self.exam_sessions[2],
            average_score=Decimal("80"), status="APPROVED")

        self.run_auto()

        promo = StudentPromotion.objects.get(student=student)
        self.assertEqual(promo.term3_average, Decimal("80.00"))
        self.assertEqual(promo.status, "PROMOTED")


class ApplyPromotionsTest(PromotionFixtureMixin, TestCase):
    def setUp(self):
        self.make_school()
        self.promoted = self.make_student("promoted")
        self.flagged = self.make_student("flagged")
        self.pending = self.make_student("pending")
        self.give_results(self.promoted, [60, 70, 80])
        self.give_results(self.flagged, [40, 45, 30])
        self.give_results(self.pending, [60, 70])
        self.run_auto()

    def test_moves_only_promoted_students_to_the_next_class(self):
        result = self.apply()

        for s in (self.promoted, self.flagged, self.pending):
            s.refresh_from_db()
        self.assertEqual(self.promoted.student_class, self.p2)
        self.assertEqual(self.flagged.student_class, self.p1)
        self.assertEqual(self.pending.student_class, self.p1)

        self.assertEqual(result["to_class"], {"id": self.p2.id, "name": "Primary 2"})
        self.assertEqual([r["student_id"] for r in result["moved"]], [str(self.promoted.id)])
        self.assertEqual(result["remaining"], {"flagged": 1, "pending": 1, "held_back": 0})

        record = StudentPromotion.objects.get(student=self.promoted)
        self.assertEqual(record.promoted_to_class, self.p2)
        self.assertIsNotNone(record.applied_at)

    def test_dry_run_changes_nothing(self):
        result = self.apply(dry_run=True)

        self.promoted.refresh_from_db()
        self.assertEqual(self.promoted.student_class, self.p1)
        self.assertEqual(len(result["moved"]), 1)
        self.assertIsNone(StudentPromotion.objects.get(student=self.promoted).applied_at)

    def test_applying_again_picks_up_only_new_decisions(self):
        self.make_class("Primary 3", order=3)
        self.apply()
        PromotionEngine(self.tenant).manual_promote(
            student=self.flagged, academic_session=self.session,
            status="PROMOTED", reason="Reviewed by the head teacher", acted_by=None)

        result = self.apply()

        self.assertEqual([r["student_id"] for r in result["moved"]], [str(self.flagged.id)])
        self.flagged.refresh_from_db()
        self.promoted.refresh_from_db()
        self.assertEqual(self.flagged.student_class, self.p2)
        self.assertEqual(self.promoted.student_class, self.p2)  # not moved on to Primary 3

    def test_applied_record_is_not_reevaluated_or_overridden(self):
        self.apply()
        # The moved student is now in Primary 2; running Primary 2 for the
        # same session must not touch the record that moved them.
        self.run_auto(student_class=self.p2)

        record = StudentPromotion.objects.get(student=self.promoted)
        self.assertEqual(record.status, "PROMOTED")
        self.assertEqual(record.student_class, self.p1)
        with self.assertRaises(ValueError):
            PromotionEngine(self.tenant).manual_promote(
                student=self.promoted, academic_session=self.session,
                status="HELD_BACK", reason="Changed our mind about this", acted_by=None)

    def test_student_moved_by_hand_is_skipped(self):
        self.promoted.student_class = self.make_class("Primary 1 Gold", order=5)
        self.promoted.save()

        result = self.apply()

        self.assertEqual(result["moved"], [])
        self.assertEqual(len(result["skipped"]), 1)
        self.assertIsNone(StudentPromotion.objects.get(student=self.promoted).applied_at)

    def test_same_order_in_another_education_level_is_not_a_tie(self):
        # Nursery 2 and Primary 2 are both order 2; only Primary 2 follows Primary 1.
        self.assertEqual(self.apply(dry_run=True)["to_class"]["name"], "Primary 2")

    def test_last_class_of_a_level_moves_to_the_first_class_of_the_next(self):
        student = self.make_student("primary_two", student_class=self.p2)
        self.give_results(student, [60, 70, 80])
        self.run_auto(student_class=self.p2)

        self.apply(student_class=self.p2)

        student.refresh_from_db()
        self.assertEqual(student.student_class, self.jss1)

    def test_nursery_leads_into_primary(self):
        self.assertEqual(self.apply(student_class=self.nursery2, dry_run=True)["to_class"]["name"],
                         "Primary 1")

    def test_last_class_cannot_be_applied(self):
        with self.assertRaises(PromotionApplyError):
            self.apply(student_class=self.jss1)

    def test_ambiguous_next_class_is_refused(self):
        self.make_class("Primary 2 Science", order=2)

        with self.assertRaises(PromotionApplyError):
            self.apply()
        self.promoted.refresh_from_db()
        self.assertEqual(self.promoted.student_class, self.p1)

    def test_inactive_next_class_is_passed_over(self):
        self.p2.is_active = False
        self.p2.save()
        p3 = self.make_class("Primary 3", order=3)

        self.apply()

        self.promoted.refresh_from_db()
        self.assertEqual(self.promoted.student_class, p3)


class ApplyPromotionsSectionTest(PromotionFixtureMixin, TestCase):
    def setUp(self):
        self.make_school()

    def _promoted_student(self, username, section):
        student = self.make_student(username, section=section)
        self.give_results(student, [60, 70, 80])
        return student

    def test_section_with_the_same_name_is_kept(self):
        p1_a = Section.objects.create(tenant=self.tenant, class_grade=self.p1, name="A")
        p2_a = Section.objects.create(tenant=self.tenant, class_grade=self.p2, name="A")
        student = self._promoted_student("sectioned", p1_a)
        self.run_auto()

        self.apply()

        student.refresh_from_db()
        self.assertEqual(student.section, p2_a)

    def test_section_is_cleared_and_old_enrolment_ended_when_no_match(self):
        p1_a = Section.objects.create(tenant=self.tenant, class_grade=self.p1, name="A")
        student = self._promoted_student("orphaned", p1_a)
        classroom = Classroom.objects.create(
            tenant=self.tenant, name="Primary 1 A", section=p1_a,
            academic_session=self.session, term=self.terms[2])
        enrolment = StudentEnrollment.objects.create(
            tenant=self.tenant, student=student, classroom=classroom)
        self.run_auto()

        self.apply()

        student.refresh_from_db()
        enrolment.refresh_from_db()
        self.assertEqual(student.student_class, self.p2)
        self.assertIsNone(student.section)
        self.assertFalse(enrolment.is_active)


class ApplyPromotionsAPITest(PromotionFixtureMixin, APITestCase):
    def setUp(self):
        self.make_school()
        self.student = self.make_student("api_student")
        self.give_results(self.student, [60, 70, 80])
        self.run_auto()
        admin = User.objects.create_user(
            username="promo_admin", email="promo_admin@example.com", role="admin",
            password="testpass123", is_active=True, tenant=self.tenant)
        self.client.force_authenticate(user=admin)

    def _post(self, **extra):
        payload = {"academic_session_id": self.session.id, "student_class_id": self.p1.id, **extra}
        return self.client.post(
            "/api/student_promotions/apply/", payload, format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug)

    def test_preview_then_apply(self):
        preview = self._post(dry_run=True)
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        self.assertEqual(len(preview.data["moved"]), 1)
        self.student.refresh_from_db()
        self.assertEqual(self.student.student_class, self.p1)

        applied = self._post()
        self.assertEqual(applied.status_code, status.HTTP_200_OK, applied.data)
        self.student.refresh_from_db()
        self.assertEqual(self.student.student_class, self.p2)

    def test_last_class_is_a_400(self):
        response = self.client.post(
            "/api/student_promotions/apply/",
            {"academic_session_id": self.session.id, "student_class_id": self.jss1.id},
            format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("last class", response.data["detail"])
