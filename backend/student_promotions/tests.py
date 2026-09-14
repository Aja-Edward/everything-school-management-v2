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
from result.models import ExamSession, ExamType, NurseryTermReport, PrimaryTermReport
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

    def give_nursery_results(self, student, percentages, status_="PUBLISHED"):
        for exam_session, pct in zip(self.exam_sessions, percentages):
            NurseryTermReport.objects.create(
                tenant=self.tenant, student=student, exam_session=exam_session,
                overall_percentage=Decimal(str(pct)), status=status_)

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

    def test_nursery_reads_the_overall_percentage(self):
        """The regression: Nursery reports have no average_score, so every pupil stayed Pending."""
        passing = self.make_student("nursery_passing", student_class=self.nursery2)
        failing = self.make_student("nursery_failing", student_class=self.nursery2)
        self.give_nursery_results(passing, [55, 65, 75])
        self.give_nursery_results(failing, [30, 35, 40])

        self.run_auto(student_class=self.nursery2)

        promo = StudentPromotion.objects.get(student=passing)
        self.assertEqual(
            (promo.term1_average, promo.term2_average, promo.term3_average),
            (Decimal("55.00"), Decimal("65.00"), Decimal("75.00")))
        self.assertEqual(promo.terms_counted, 3)
        self.assertEqual(promo.status, "PROMOTED")
        self.assertEqual(StudentPromotion.objects.get(student=failing).status, "FLAGGED")

    def test_every_level_reads_a_field_its_report_has(self):
        engine = PromotionEngine(self.tenant)
        for level_type in ("NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"):
            with self.subTest(level_type=level_type):
                model, field = engine._resolve_term_report_model(level_type)
                self.assertIn(field, {f.name for f in model._meta.get_fields()})

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


class TermResultsVisibilityTest(PromotionFixtureMixin, TestCase):
    """Results that exist must be counted, and when they can't be, the run says why."""

    def setUp(self):
        self.make_school()
        self.student = self.make_student("visible")
        self.engine = PromotionEngine(self.tenant)

    def warnings(self, student_class=None, session=None):
        return self.engine.class_warnings(session or self.session, student_class or self.p1)

    def test_schools_seeded_with_short_level_spellings_read_their_results(self):
        """The regression: level_type 'JSS' matched no report model, so every JSS student showed 0/3."""
        from result.models import JuniorSecondaryTermReport

        for level_type, code in (("JSS", "jss"), ("", "jss")):
            with self.subTest(level_type=level_type, code=code):
                EducationLevel.objects.filter(pk=self.jss.pk).update(level_type=level_type, code=code)
                self.jss1.refresh_from_db()
                student = self.make_student(f"jss_{level_type or 'code'}", student_class=self.jss1)
                for exam_session, avg in zip(self.exam_sessions, [60, 70, 80]):
                    JuniorSecondaryTermReport.objects.create(
                        tenant=self.tenant, student=student, exam_session=exam_session,
                        average_score=Decimal(avg), status="PUBLISHED")

                self.run_auto(student_class=self.jss1)

                promo = StudentPromotion.objects.get(student=student)
                self.assertEqual(promo.terms_counted, 3)
                self.assertEqual(promo.term3_average, Decimal("80.00"))

    def test_school_that_started_in_the_third_term(self):
        """The regression: a session with only a Third Term read it as term 1."""
        for exam_session in self.exam_sessions[:2]:
            exam_session.delete()
        for term in self.terms[:2]:
            term.delete()
        PrimaryTermReport.objects.create(
            tenant=self.tenant, student=self.student, exam_session=self.exam_sessions[2],
            average_score=Decimal("72"), status="PUBLISHED")

        self.run_auto()

        promo = StudentPromotion.objects.get(student=self.student)
        self.assertEqual(
            (promo.term1_average, promo.term2_average, promo.term3_average),
            (None, None, Decimal("72.00")))
        self.assertEqual(promo.terms_counted, 1)
        self.assertEqual(promo.session_average, Decimal("72.00"))
        self.assertEqual(promo.status, "PENDING")
        [warning] = self.warnings()
        self.assertIn("only 1 term(s) set up (Third Term)", warning)
        self.assertIn("require all three terms", warning)

    def test_draft_report_card_with_approved_subject_results_counts(self):
        """The regression: approving subject results leaves the term report in Draft, which read as no result."""
        from result.models import GradingSystem, PrimaryResult
        from subject.models import Subject

        report = PrimaryTermReport.objects.create(
            tenant=self.tenant, student=self.student, exam_session=self.exam_sessions[2],
            average_score=Decimal("64"), status="DRAFT")
        grading = GradingSystem.objects.create(
            tenant=self.tenant, name="Promo grading", grading_type="PERCENTAGE")
        subject = Subject.objects.create(
            tenant=self.tenant, name="Promo Maths", code="PROMO-MATH", education_levels=["PRIMARY"])
        result = PrimaryResult.objects.create(
            tenant=self.tenant, student=self.student, subject=subject,
            exam_session=self.exam_sessions[2], grading_system=grading)
        PrimaryResult.objects.filter(pk=result.pk).update(term_report=report, status="APPROVED")

        self.run_auto()

        promo = StudentPromotion.objects.get(student=self.student)
        self.assertEqual(promo.term3_average, Decimal("64.00"))
        self.assertEqual(promo.terms_counted, 1)
        self.assertFalse(any("Draft" in w for w in self.warnings()), self.warnings())

    def test_a_clean_class_has_no_warnings(self):
        self.give_results(self.student, [60, 70, 80])
        self.assertEqual(self.warnings(), [])

    def test_results_on_an_exam_session_with_no_term(self):
        self.give_results(self.student, [60, 70])
        termless = ExamSession.objects.create(
            tenant=self.tenant, name="Third Term Exam (no term)", exam_type=self.exam_type,
            academic_session=self.session, term=None,
            start_date=date(2026, 6, 1), end_date=date(2026, 6, 20))
        PrimaryTermReport.objects.create(
            tenant=self.tenant, student=self.student, exam_session=termless,
            average_score=Decimal("75"), status="PUBLISHED")

        self.run_auto()

        self.assertEqual(StudentPromotion.objects.get(student=self.student).terms_counted, 2)
        [warning] = self.warnings()
        self.assertIn("no term set", warning)
        self.assertIn("Third Term Exam (no term)", warning)

    def test_results_on_an_exam_session_whose_term_is_from_another_session(self):
        next_session = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 31))
        next_first_term = Term.objects.create(
            tenant=self.tenant, term_type=self.terms[0].term_type, academic_session=next_session,
            start_date=date(2026, 9, 7), end_date=date(2026, 12, 16))
        ExamSession.objects.filter(pk=self.exam_sessions[2].pk).update(term=next_first_term)
        self.give_results(self.student, [60, 70, 80])

        self.run_auto()

        self.assertEqual(StudentPromotion.objects.get(student=self.student).terms_counted, 2)
        [warning] = self.warnings()
        self.assertIn("1 result(s)", warning)
        self.assertIn('"Third Term Exam" has First Term of 2026/2027', warning)
        self.assertIn("Change those exam sessions' term to one of 2025/2026's terms", warning)

    def test_session_with_no_terms_whose_results_use_another_sessions_term(self):
        """The real case: the June exam was filed under 2025/2026 with 2026/2027's First Term,
        and the only warning said 2025/2026 had no terms."""
        last_session = AcademicSession.objects.create(
            tenant=self.tenant, name="2024/2025",
            start_date=date(2024, 9, 1), end_date=date(2025, 7, 31))
        june_exam = ExamSession.objects.create(
            tenant=self.tenant, name="2024/2025", exam_type=self.exam_type,
            academic_session=last_session, term=self.terms[0],
            start_date=date(2025, 6, 15), end_date=date(2025, 7, 3))
        PrimaryTermReport.objects.create(
            tenant=self.tenant, student=self.student, exam_session=june_exam,
            average_score=Decimal("67.5"), status="PUBLISHED")

        warnings = self.warnings(session=last_session)

        self.assertEqual(len(warnings), 2, warnings)
        self.assertIn("2024/2025 has no terms set up", warnings[0])
        self.assertIn('"2024/2025" has First Term of 2025/2026', warnings[1])
        self.assertIn("Set up 2024/2025's terms, then change those exam sessions' term", warnings[1])

    def test_draft_results(self):
        self.give_results(self.student, [60, 70, 80], status_="DRAFT")
        [warning] = self.warnings()
        self.assertIn("3 result(s) are still in Draft", warning)

    def test_results_in_a_different_session(self):
        self.give_results(self.student, [60, 70, 80])
        next_session = AcademicSession.objects.create(
            tenant=self.tenant, name="2026/2027",
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 31))

        warnings = self.warnings(session=next_session)

        self.assertTrue(any("they are in 2025/2026" in w for w in warnings), warnings)

    def test_session_with_missing_terms(self):
        self.give_results(self.student, [60, 70, 80])
        self.exam_sessions[2].delete()  # and its report; ExamSession.term protects the term
        self.terms[2].delete()

        warnings = self.warnings()

        self.assertTrue(any("only 2 term(s)" in w for w in warnings), warnings)

    def test_unrecognised_education_level(self):
        odd = self.make_level("kg", "Kindergarten", "", 0)
        kg = self.make_class("KG", order=1, level=odd)

        [warning] = self.warnings(student_class=kg)

        self.assertIn("Kindergarten", warning)


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

    def test_student_whose_user_has_no_school_still_moves(self):
        """Real data: users created without a school made Student.save() reject the move."""
        User.objects.filter(pk=self.promoted.user_id).update(tenant=None)

        result = self.apply()

        self.assertEqual(result["skipped"], [])
        self.promoted.refresh_from_db()
        self.assertEqual(self.promoted.student_class, self.p2)
        self.assertEqual(self.promoted.user.tenant, self.tenant)

    def test_a_record_that_cannot_be_saved_is_skipped_not_fatal(self):
        other = Tenant.objects.create(
            name="Elsewhere", slug="elsewhere-school", status="active",
            is_active=True, owner_email="elsewhere@example.com")
        second = self.make_student("second_promoted")
        self.give_results(second, [70, 70, 70])
        self.run_auto()
        # A user recorded at a different school isn't guessed at.
        User.objects.filter(pk=self.promoted.user_id).update(tenant=other)

        result = self.apply()

        self.assertEqual([r["student_id"] for r in result["moved"]], [str(second.id)])
        self.assertEqual(len(result["skipped"]), 1)
        self.assertIn("needs fixing", result["skipped"][0]["reason"])
        self.promoted.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(self.promoted.student_class, self.p1)
        self.assertEqual(second.student_class, self.p2)
        self.assertIsNone(StudentPromotion.objects.get(student=self.promoted).applied_at)

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


class GraduationTest(PromotionFixtureMixin, TestCase):
    """JSS 1 is the fixture school's final class, so passing it means leaving."""

    def setUp(self):
        self.make_school()
        self.section = Section.objects.create(tenant=self.tenant, class_grade=self.jss1, name="A")
        self.leaver = self.make_student("leaver", student_class=self.jss1, section=self.section)
        self.repeater = self.make_student("repeater", student_class=self.jss1, section=self.section)
        for student, status_ in ((self.leaver, "PROMOTED"), (self.repeater, "FLAGGED")):
            StudentPromotion.objects.create(
                tenant=self.tenant, student=student, academic_session=self.session,
                student_class=self.jss1, status=status_)
        classroom = Classroom.objects.create(
            tenant=self.tenant, name="JSS 1 A", section=self.section,
            academic_session=self.session, term=self.terms[2])
        self.enrolment = StudentEnrollment.objects.create(
            tenant=self.tenant, student=self.leaver, classroom=classroom)

    def test_promoted_students_graduate(self):
        result = self.apply(student_class=self.jss1)

        self.assertTrue(result["graduating"])
        self.assertIsNone(result["to_class"])
        self.assertEqual([r["student_id"] for r in result["moved"]], [str(self.leaver.id)])

        self.leaver.refresh_from_db()
        self.assertFalse(self.leaver.is_active)
        # Left in place for the record, and still able to sign in.
        self.assertEqual(self.leaver.student_class, self.jss1)
        self.assertEqual(self.leaver.section, self.section)
        self.assertTrue(self.leaver.user.is_active)

        self.enrolment.refresh_from_db()
        self.assertFalse(self.enrolment.is_active)

        record = StudentPromotion.objects.get(student=self.leaver)
        self.assertTrue(record.graduated)
        self.assertIsNone(record.promoted_to_class)
        self.assertIsNotNone(record.applied_at)

        self.repeater.refresh_from_db()
        self.assertTrue(self.repeater.is_active)
        self.assertFalse(StudentPromotion.objects.get(student=self.repeater).graduated)

    def test_leaver_whose_user_has_no_school_still_graduates(self):
        User.objects.filter(pk=self.leaver.user_id).update(tenant=None)

        self.apply(student_class=self.jss1)

        self.leaver.refresh_from_db()
        self.assertFalse(self.leaver.is_active)
        self.assertEqual(self.leaver.user.tenant, self.tenant)

    def test_dry_run_changes_nothing(self):
        User.objects.filter(pk=self.leaver.user_id).update(tenant=None)

        result = self.apply(student_class=self.jss1, dry_run=True)

        self.assertIsNone(User.objects.get(pk=self.leaver.user_id).tenant)
        self.assertTrue(result["graduating"])
        self.leaver.refresh_from_db()
        self.assertTrue(self.leaver.is_active)
        self.assertIsNone(StudentPromotion.objects.get(student=self.leaver).applied_at)

    def test_graduate_is_left_alone_afterwards(self):
        self.apply(student_class=self.jss1)

        self.run_auto(student_class=self.jss1)
        self.assertEqual(self.apply(student_class=self.jss1)["moved"], [])

        record = StudentPromotion.objects.get(student=self.leaver)
        self.assertEqual(record.status, "PROMOTED")
        self.assertTrue(record.graduated)
        with self.assertRaisesMessage(ValueError, "graduated"):
            PromotionEngine(self.tenant).manual_promote(
                student=self.leaver, academic_session=self.session,
                status="HELD_BACK", reason="Should have repeated the year", acted_by=None)


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

    def test_final_class_previews_as_graduating(self):
        response = self.client.post(
            "/api/student_promotions/apply/",
            {"academic_session_id": self.session.id, "student_class_id": self.jss1.id,
             "dry_run": True},
            format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["graduating"])
        self.assertIsNone(response.data["to_class"])


class PromotionPermissionTest(PromotionFixtureMixin, APITestCase):
    """Only admins reach promotions, and section admins only their own levels."""

    BASE = "/api/student_promotions/"

    def setUp(self):
        self.make_school()
        self.primary_student = self.make_student("perm_primary")
        self.give_results(self.primary_student, [60, 70, 80])
        self.run_auto()
        self.primary_record = StudentPromotion.objects.get(student=self.primary_student)

        self.jss_student = self.make_student("perm_jss", student_class=self.jss1)
        self.jss_record = StudentPromotion.objects.create(
            tenant=self.tenant, student=self.jss_student, academic_session=self.session,
            student_class=self.jss1, status="FLAGGED")

    def login(self, role, tenant=None, username=None):
        user = User.objects.create_user(
            username=username or f"perm_{role}", email=f"{username or role}@example.com",
            role=role, password="testpass123", is_active=True, tenant=tenant or self.tenant)
        self.client.force_authenticate(user=user)
        return user

    def get(self, path, params=None):
        return self.client.get(self.BASE + path, params or {}, HTTP_X_TENANT_SLUG=self.tenant.slug)

    def post(self, path, data=None):
        return self.client.post(
            self.BASE + path, data or {}, format="json", HTTP_X_TENANT_SLUG=self.tenant.slug)

    def for_class(self, student_class, **extra):
        return {"academic_session_id": self.session.id, "student_class_id": student_class.id, **extra}

    def assert_refused_everywhere(self):
        self.assertEqual(self.get("").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.get("summary/", self.for_class(self.p1)).status_code,
                         status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.get("rules/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.post("run-auto/", self.for_class(self.p1)).status_code,
                         status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.post("apply/", self.for_class(self.p1)).status_code,
                         status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.post(f"{self.jss_record.id}/manual-promote/",
                      {"status": "PROMOTED", "reason": "Promoting myself, thanks"}).status_code,
            status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.post("rules/", {"education_level": self.primary.id, "pass_threshold": "1.00"}).status_code,
            status.HTTP_403_FORBIDDEN)

    def assert_nothing_changed(self):
        self.primary_student.refresh_from_db()
        self.jss_record.refresh_from_db()
        self.assertEqual(self.primary_student.student_class, self.p1)
        self.assertEqual(self.jss_record.status, "FLAGGED")

    def test_students_parents_and_teachers_are_refused(self):
        for role in ("student", "parent", "teacher"):
            with self.subTest(role=role):
                self.login(role)
                self.assert_refused_everywhere()
        self.assert_nothing_changed()

    def test_admin_of_another_school_is_refused(self):
        other = Tenant.objects.create(
            name="Other School", slug="other-promo-school", status="active",
            is_active=True, owner_email="other@example.com")
        self.login("superadmin", tenant=other, username="other_superadmin")

        self.assert_refused_everywhere()
        self.assert_nothing_changed()

    def test_school_admins_have_full_access(self):
        for role in ("superadmin", "admin"):
            with self.subTest(role=role):
                self.login(role)
                listed = self.get("")
                self.assertEqual(listed.status_code, status.HTTP_200_OK)
                self.assertEqual(len(listed.data["results"] if "results" in listed.data else listed.data), 2)
                self.assertEqual(self.post("apply/", self.for_class(self.p1, dry_run=True)).status_code,
                                 status.HTTP_200_OK)

        applied = self.post("apply/", self.for_class(self.p1))
        self.assertEqual(applied.status_code, status.HTTP_200_OK)
        self.primary_student.refresh_from_db()
        self.assertEqual(self.primary_student.student_class, self.p2)

    def test_section_admin_manages_only_their_own_levels(self):
        self.login("primary_admin")

        listed = self.get("")
        rows = listed.data["results"] if "results" in listed.data else listed.data
        self.assertEqual([r["id"] for r in rows], [str(self.primary_record.id)])

        self.assertEqual(self.post("apply/", self.for_class(self.p1)).status_code, status.HTTP_200_OK)
        self.primary_student.refresh_from_db()
        self.assertEqual(self.primary_student.student_class, self.p2)

        refused = self.post("run-auto/", self.for_class(self.jss1))
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Junior Secondary", refused.data["detail"])
        self.assertEqual(self.post("apply/", self.for_class(self.jss1)).status_code,
                         status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.post(f"{self.jss_record.id}/manual-promote/",
                      {"status": "PROMOTED", "reason": "Not my section at all"}).status_code,
            status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.get("summary/", self.for_class(self.jss1)).data["total"], 0)

        self.assertEqual(
            self.post("rules/", {"education_level": self.jss.id, "pass_threshold": "1.00"}).status_code,
            status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.post("rules/", {"education_level": self.primary.id, "pass_threshold": "45.00"}).status_code,
            status.HTTP_201_CREATED)
        self.jss_record.refresh_from_db()
        self.assertEqual(self.jss_record.status, "FLAGGED")

    def test_rule_cannot_point_at_another_schools_level(self):
        other = Tenant.objects.create(
            name="Rule Other School", slug="rule-other-school", status="active",
            is_active=True, owner_email="rules@example.com")
        foreign_level = EducationLevel.objects.filter(tenant=other).first() or EducationLevel.objects.create(
            tenant=other, code="primary", name="Primary", level_type="PRIMARY")
        self.login("superadmin")

        response = self.post("rules/", {"education_level": foreign_level.id, "pass_threshold": "45.00"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
