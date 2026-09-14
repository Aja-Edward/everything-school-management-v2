"""
The CBT data model: publishing copies an exam's questions onto a paper, and
starting a student fixes their deadline and the questions they are given.
"""

import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from django.utils import timezone

from academics.models import EducationLevel
from cbt.models import CBTAnswer, CBTAttempt, CBTEvent, CBTPaper, CBTQuestion
from classroom.models import Class, GradeLevel
from exam.models import Exam, ExamRegistration, ExamStatus, ExamType
from students.models import Student
from subject.models import Subject
from tenants.models import Tenant

User = get_user_model()

OPENS = timezone.make_aware(datetime(2026, 12, 1, 9, 0))


def objective(number, answer="B", **extra):
    return {"id": number, "question": f"<p>Question {number}</p>", "optionA": "1", "optionB": "2",
            "optionC": "3", "optionD": "4", "correctAnswer": answer, "marks": 1, **extra}


class CBTTestCase(TestCase):
    def setUp(self):
        self.school = self.make_school("CBT School", "cbt-school")

    def make_school(self, name, slug):
        return Tenant.objects.create(
            name=name, slug=slug, status="active", is_active=True, owner_email=f"owner@{slug}.example.com")

    def make_exam(self, school=None, **questions):
        school = school or self.school
        subject, _ = Subject.objects.get_or_create(
            tenant=school, code="MATH-PRI", defaults={"name": "Mathematics", "education_levels": ["PRIMARY"]})
        return Exam.objects.create(
            tenant=school, title="First Term Mathematics", subject=subject,
            grade_level=GradeLevel.objects.filter(tenant=school, education_level__code="primary").first(),
            exam_type=ExamType.objects.get(tenant=school, code="final_exam"),
            status=ExamStatus.objects.get(tenant=school, code="approved"),
            exam_date=date(2026, 12, 1), start_time=time(9), end_time=time(11),
            instructions="Answer all questions.", objective_instructions="Choose one option.",
            **questions)

    def make_paper(self, exam=None, publish=True, **settings):
        exam = exam or self.make_exam(objective_questions=[objective(n) for n in range(1, 6)])
        paper = CBTPaper.objects.create(
            tenant=exam.tenant, exam=exam, opens_at=OPENS, closes_at=OPENS + timedelta(hours=2),
            duration_minutes=60, **settings)
        if publish:
            paper.publish()
        return paper

    def make_student(self, school=None):
        school = school or self.school
        level = EducationLevel.objects.get(tenant=school, code="primary")
        primary_1, _ = Class.objects.get_or_create(
            tenant=school, code="PRIMARY_1_CBT",
            defaults={"name": "Primary 1 (cbt)", "education_level": level, "grade_number": 1, "order": 1})
        n = User.objects.count()
        user = User.objects.create_user(
            username=f"cbt_student_{n}", email=f"cbt_student_{n}@example.com", role="student",
            password="testpass123", is_active=True, tenant=school)
        return Student.objects.create(
            user=user, gender="F", date_of_birth=date(2018, 1, 1), student_class=primary_1, tenant=school)

    def problems(self, paper):
        with self.assertRaises(ValidationError) as caught:
            paper.publish()
        return caught.exception.messages


class PublishTest(CBTTestCase):
    def test_exam_editor_questions_are_copied_onto_the_paper(self):
        paper = self.make_paper()

        question = paper.questions.get(order=1)
        self.assertEqual(paper.status, CBTPaper.Status.PUBLISHED)
        self.assertEqual(paper.questions.count(), 5)
        self.assertEqual(question.kind, CBTQuestion.Kind.OBJECTIVE)
        self.assertEqual(question.content, "<p>Question 1</p>")
        self.assertEqual(question.options, [
            {"key": "A", "text": "1"}, {"key": "B", "text": "2"},
            {"key": "C", "text": "3"}, {"key": "D", "text": "4"}])
        self.assertEqual(question.correct_option, "B")
        self.assertEqual(question.marks, Decimal("1"))
        self.assertEqual(paper.instructions, "Answer all questions.")
        self.assertEqual(paper.sections, [
            {"key": "objective", "title": "Objective", "instructions": "Choose one option."}])

    def test_question_bank_option_lists_are_lettered(self):
        """import_to_exam saves the bank's options as a list, not optionA..optionD."""
        exam = self.make_exam(objective_questions=[
            {"question": "Capital of Nigeria?", "options": ["Lagos", "Abuja", "Kano"],
             "correctAnswer": "B", "marks": 2}])

        question = self.make_paper(exam).questions.get()

        self.assertEqual(question.option_keys, ["A", "B", "C"])
        self.assertEqual(question.correct_option, "B")
        self.assertEqual(question.marks, Decimal("2"))

    def test_answers_written_as_option_text_or_lowercase_are_understood(self):
        exam = self.make_exam(objective_questions=[
            objective(1, answer="c"), objective(2, answer="4"), objective(3, answer=" D. ")])

        answers = list(self.make_paper(exam).questions.values_list("correct_option", flat=True))

        self.assertEqual(answers, ["C", "D", "D"])

    def test_a_blank_option_keeps_the_letters_after_it(self):
        exam = self.make_exam(objective_questions=[objective(1, answer="D", optionC="<p></p>")])

        question = self.make_paper(exam).questions.get()

        self.assertEqual(question.option_keys, ["A", "B", "D"])
        self.assertEqual(question.correct_option, "D")

    def test_theory_goes_on_only_when_included_and_practical_never(self):
        exam = self.make_exam(
            objective_questions=[objective(1)],
            theory_questions=[{"question": "Explain photosynthesis.", "marks": 10}],
            custom_sections=[{"id": 1, "name": "Comprehension", "instructions": "Read the passage.",
                              "questions": [{"question": "What happened?", "marks": 5}]}],
            practical_questions=[{"question": "Boil water.", "marks": 5}])

        objective_only = self.make_paper(exam)
        self.assertEqual(list(objective_only.questions.values_list("section", flat=True)), ["objective"])

        objective_only.include_theory = True
        objective_only.publish()
        self.assertEqual(
            list(objective_only.questions.values_list("section", "kind", "marks")),
            [("objective", "objective", Decimal("1")), ("theory", "text", Decimal("10")),
             ("custom-1", "text", Decimal("5"))])
        self.assertEqual([s["title"] for s in objective_only.sections], ["Objective", "Theory", "Comprehension"])

    def test_theory_marks_default_to_the_total_of_its_parts(self):
        exam = self.make_exam(theory_questions=[{
            "question": "Answer the following.", "marks": 0,
            "subQuestions": [{"question": "a", "marks": 3},
                             {"question": "b", "marks": 2, "subSubQuestions": [{"question": "i", "marks": 1}]}]}])

        question = self.make_paper(exam, include_objective=False, include_theory=True).questions.get()

        self.assertEqual(question.marks, Decimal("6"))
        self.assertEqual(len(question.parts), 2)

    def test_every_problem_is_reported_by_question_number_and_nothing_is_published(self):
        exam = self.make_exam(objective_questions=[
            objective(1),
            objective(2, answer=""),
            objective(3, optionB="", optionC="", optionD=""),
            objective(4, question=""),
            objective(5, marks=0),
        ])
        paper = self.make_paper(exam, publish=False)

        self.assertEqual(self.problems(paper), [
            "Objective question 2 has no correct answer, or its answer is not one of its options.",
            "Objective question 3 needs at least two options.",
            "Objective question 4 has no question text.",
            "Objective question 5 needs marks greater than zero.",
        ])
        paper.refresh_from_db()
        self.assertEqual(paper.status, CBTPaper.Status.DRAFT)
        self.assertFalse(paper.questions.exists())

    def test_a_paper_needs_its_window_duration_and_enough_questions(self):
        paper = self.make_paper(publish=False, objective_questions_per_attempt=6)
        paper.opens_at = None
        paper.duration_minutes = None

        self.assertEqual(self.problems(paper), [
            "Set when the exam opens and closes.",
            "Set how many minutes each student has.",
            "Each student is to get 6 objective questions, but the exam only has 5.",
        ])

    def test_closing_before_opening_is_invalid_even_for_a_draft(self):
        paper = self.make_paper(publish=False)
        paper.closes_at = paper.opens_at

        with self.assertRaises(ValidationError):
            paper.full_clean()

    def test_editing_the_exam_later_does_not_change_the_published_paper(self):
        paper = self.make_paper()
        exam = paper.exam
        exam.objective_questions[0]["correctAnswer"] = "A"
        exam.save()

        self.assertEqual(paper.questions.get(order=1).correct_option, "B")

    def test_republishing_replaces_questions_until_a_student_starts(self):
        paper = self.make_paper()
        exam = paper.exam
        exam.objective_questions = exam.objective_questions[:2]
        exam.save()

        paper.publish()
        self.assertEqual(paper.questions.count(), 2)

        CBTAttempt.start(paper, self.make_student(), now=OPENS)
        exam.objective_questions = exam.objective_questions[:1]
        exam.save()
        self.assertEqual(self.problems(paper), [
            "Students have already started this paper, so its questions can't be replaced."])
        self.assertEqual(paper.questions.count(), 2)

    def test_a_draft_takes_its_window_from_the_exam(self):
        exam = self.make_exam(objective_questions=[objective(1)])

        paper = CBTPaper.for_exam(exam)

        self.assertEqual(paper.opens_at, OPENS)
        self.assertEqual(paper.closes_at, OPENS + timedelta(hours=2))
        self.assertEqual(paper.duration_minutes, 120)
        self.assertEqual(paper.tenant, self.school)


class StartAttemptTest(CBTTestCase):
    def setUp(self):
        super().setUp()
        self.student = self.make_student()

    def test_the_deadline_is_the_duration_from_starting(self):
        paper = self.make_paper()
        now = OPENS + timedelta(minutes=10)

        attempt = CBTAttempt.start(paper, self.student, now=now, ip_address="10.0.0.5", user_agent="Lab PC")

        self.assertEqual(attempt.status, CBTAttempt.Status.IN_PROGRESS)
        self.assertEqual(attempt.number, 1)
        self.assertEqual(attempt.started_at, now)
        self.assertEqual(attempt.deadline, now + timedelta(minutes=60))
        self.assertEqual(attempt.max_score, Decimal("5"))
        self.assertEqual(attempt.tenant, self.school)
        self.assertEqual(list(attempt.events.values_list("kind", flat=True)), [CBTEvent.Kind.STARTED])

    def test_starting_late_ends_at_closing_time(self):
        paper = self.make_paper()

        attempt = CBTAttempt.start(paper, self.student, now=paper.closes_at - timedelta(minutes=15))

        self.assertEqual(attempt.deadline, paper.closes_at)

    def test_extra_time_is_added_after_closing_time_cuts_the_duration(self):
        paper = self.make_paper()
        ExamRegistration.objects.create(
            tenant=self.school, exam=paper.exam, student=self.student, extra_time_minutes=20)

        attempt = CBTAttempt.start(paper, self.student, now=paper.closes_at - timedelta(minutes=15))

        self.assertEqual(attempt.deadline, paper.closes_at + timedelta(minutes=20))
        self.assertIsNotNone(attempt.registration)

    def test_starting_again_resumes_the_attempt_in_progress(self):
        paper = self.make_paper()
        first = CBTAttempt.start(paper, self.student, now=OPENS)

        again = CBTAttempt.start(paper, self.student, now=OPENS + timedelta(minutes=90))

        self.assertEqual(again.pk, first.pk)
        self.assertEqual(again.question_ids, first.question_ids)
        self.assertEqual(CBTAttempt.objects.count(), 1)

    def test_students_can_only_start_a_published_paper_inside_its_window(self):
        draft = self.make_paper(publish=False)
        with self.assertRaisesMessage(ValidationError, "not open for computer-based testing"):
            CBTAttempt.start(draft, self.student, now=OPENS)

        paper = self.make_paper(exam=self.make_exam(objective_questions=[objective(1)]))
        with self.assertRaisesMessage(ValidationError, "has not opened yet"):
            CBTAttempt.start(paper, self.student, now=OPENS - timedelta(minutes=1))
        with self.assertRaisesMessage(ValidationError, "has closed"):
            CBTAttempt.start(paper, self.student, now=paper.closes_at)

    def test_attempts_are_limited_but_a_voided_attempt_does_not_count(self):
        paper = self.make_paper()
        first = CBTAttempt.start(paper, self.student, now=OPENS)
        first.status = CBTAttempt.Status.VOIDED
        first.save()

        second = CBTAttempt.start(paper, self.student, now=OPENS + timedelta(minutes=5))
        second.status = CBTAttempt.Status.SUBMITTED
        second.save()

        self.assertEqual(second.number, 2)
        with self.assertRaisesMessage(ValidationError, "no attempts left"):
            CBTAttempt.start(paper, self.student, now=OPENS + timedelta(minutes=10))

    def test_a_student_from_another_school_cannot_start(self):
        paper = self.make_paper()
        theirs = self.make_student(self.make_school("Other CBT School", "other-cbt-school"))

        with self.assertRaisesMessage(ValidationError, "not at the school that set this exam"):
            CBTAttempt.start(paper, theirs, now=OPENS)
        self.assertFalse(CBTAttempt.objects.exists())

    def test_the_database_allows_one_attempt_in_progress_per_student(self):
        paper = self.make_paper()
        attempt = CBTAttempt.start(paper, self.student, now=OPENS)

        with self.assertRaises(IntegrityError), transaction.atomic():
            CBTAttempt.objects.create(
                tenant=self.school, paper=paper, student=self.student, number=2,
                started_at=OPENS, deadline=attempt.deadline)


class DrawQuestionsTest(CBTTestCase):
    def mixed_exam(self):
        return self.make_exam(
            objective_questions=[objective(n) for n in range(1, 11)],
            theory_questions=[{"question": f"Essay {n}", "marks": 10} for n in range(1, 4)])

    def test_each_student_gets_a_draw_from_the_objective_pool_before_the_theory(self):
        paper = self.make_paper(self.mixed_exam(), include_theory=True, objective_questions_per_attempt=4)
        questions = {q.id: q for q in paper.questions.all()}

        served, option_order = paper.draw_questions(random.Random(7))

        self.assertEqual([q.section for q in served], ["objective"] * 4 + ["theory"] * 3)
        self.assertEqual(len({q.id for q in served}), 7)
        self.assertEqual(set(option_order), {str(q.id) for q in served[:4]})
        for question_id, keys in option_order.items():
            self.assertCountEqual(keys, questions[int(question_id)].option_keys)

    def test_questions_and_options_are_shuffled(self):
        paper = self.make_paper(self.mixed_exam(), include_theory=True)

        served, option_order = paper.draw_questions(random.Random(7))

        self.assertNotEqual([q.order for q in served], sorted(q.order for q in served))
        self.assertNotEqual(
            [keys for keys in option_order.values()], [["A", "B", "C", "D"]] * len(option_order))

    def test_without_shuffling_everyone_gets_the_paper_in_order(self):
        paper = self.make_paper(self.mixed_exam(), include_theory=True,
                                shuffle_questions=False, shuffle_options=False)

        served, option_order = paper.draw_questions(random.Random(7))

        self.assertEqual([q.order for q in served], list(range(1, 14)))
        self.assertEqual(set(map(tuple, option_order.values())), {("A", "B", "C", "D")})

    def test_an_attempt_keeps_only_what_it_was_given(self):
        paper = self.make_paper(self.mixed_exam(), include_theory=True, objective_questions_per_attempt=4)

        attempt = CBTAttempt.start(paper, self.make_student(), now=OPENS)

        self.assertEqual(len(attempt.question_ids), 7)
        self.assertEqual(attempt.max_score, Decimal("34"))


class AnswerTest(CBTTestCase):
    def setUp(self):
        super().setUp()
        exam = self.make_exam(
            objective_questions=[objective(1), objective(2)],
            theory_questions=[{"question": "Explain.", "marks": 5}])
        self.paper = self.make_paper(exam, include_theory=True)
        self.attempt = CBTAttempt.start(self.paper, self.make_student(), now=OPENS)
        self.objective = self.paper.questions.get(order=1)
        self.theory = self.paper.questions.get(section="theory")

    def answer(self, question, **fields):
        return CBTAnswer(tenant=self.school, attempt=self.attempt, question=question, **fields)

    def test_one_answer_per_question_per_attempt(self):
        self.answer(self.objective, selected_option="A").save()

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.answer(self.objective, selected_option="B").save()

    def test_answers_must_fit_the_question(self):
        for question, fields, message in [
            (self.objective, {"selected_option": "E"}, "not one of this question's options"),
            (self.objective, {"text_answer": "B"}, "answered by choosing an option"),
            (self.theory, {"selected_option": "A"}, "answered by typing"),
        ]:
            with self.subTest(fields=fields), self.assertRaisesMessage(ValidationError, message):
                self.answer(question, **fields).clean()

        self.answer(self.objective, selected_option="C").clean()
        self.answer(self.theory, text_answer="Because.").clean()

    def test_a_question_not_given_to_this_student_cannot_be_answered(self):
        self.attempt.question_ids = [self.theory.id]
        self.attempt.save()

        with self.assertRaisesMessage(ValidationError, "not on this student's paper"):
            self.answer(self.objective, selected_option="A").clean()

    def test_a_question_with_answers_cannot_be_deleted(self):
        self.answer(self.objective, selected_option="A").save()

        with self.assertRaises(ProtectedError):
            self.objective.delete()

    def test_an_exam_with_sittings_cannot_be_deleted(self):
        with self.assertRaises(ProtectedError):
            self.paper.exam.delete()
