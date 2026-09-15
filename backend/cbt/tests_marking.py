"""
Marking CBT attempts and sending scores to the results: automatic objective
marking, teachers marking typed answers, answer-key corrections, scores in
the results, and when students see their score.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status

from academics.models import AcademicSession, EducationLevel
from cbt.models import CBTAnswer, CBTAnswerKeyChange, CBTAttempt, CBTPaper
from cbt.tests import User, objective
from cbt.tests_engine import ATTEMPTS, MY_EXAMS, EngineTest
from result.models import AssessmentComponent, ComponentScore, ExamSession, ExamType, GradingSystem, PrimaryResult
from teacher.models import Teacher

PAPERS = "/api/cbt/papers/"


class MarkingTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.exam = self.make_exam(
            objective_questions=[objective(n, marks=2) for n in range(1, 4)],
            theory_questions=[{"question": "Explain.", "marks": 10, "expectedPoints": "Mention both causes."}])
        self.paper = self.open_paper(self.exam, include_theory=True, shuffle_questions=False)
        self.q = {q.order: q for q in self.paper.questions.all()}  # 1-3 objective, 4 theory
        self.admin = User.objects.create_user(username="marker_admin", email="marker_admin@example.com",
                                              role="admin", password="x", is_active=True, tenant=self.school)

    def sit(self, student, answers, submit=True):
        self.as_student(student)
        attempt = self.started()
        self.save(attempt, [{"question_id": self.q[order].id, **fields} for order, fields in answers.items()])
        if submit:
            self.request("post", f"{ATTEMPTS}{attempt.id}/submit/")
        attempt.refresh_from_db()
        return attempt

    def as_staff(self, user):
        self.client.force_authenticate(user=user)
        self.token = None

    def staff(self, method, path, data=None):
        return self.request(method, f"{PAPERS}{self.paper.id}/{path}", data, token=None)


class AutomaticMarkingTest(MarkingTest):
    def test_objective_answers_are_marked_the_moment_the_attempt_ends(self):
        attempt = self.sit(self.student, {1: {"selected_option": "B"}, 2: {"selected_option": "A"}})

        self.assertEqual(attempt.objective_score, Decimal("2"))
        self.assertEqual(dict(CBTAnswer.objects.filter(attempt=attempt).values_list("question__order", "is_correct")),
                         {1: True, 2: False})
        # Question 4 (typed) was left blank, so there is nothing to mark and the total is final.
        self.assertEqual(attempt.total_score, Decimal("2"))

    def test_an_attempt_with_a_written_answer_has_no_total_until_it_is_marked(self):
        attempt = self.sit(self.student, {1: {"selected_option": "B"}, 4: {"text_answer": "Two causes."}})
        self.assertIsNone(attempt.total_score)

        self.as_staff(self.admin)
        overview = self.staff("get", "marking/").data
        self.assertEqual((overview["finished_attempts"], overview["fully_marked"], overview["still_to_mark"]), (1, 0, 1))

        to_mark = self.staff("get", f"marking/questions/{self.q[4].id}/").data
        self.assertEqual(to_mark["question"]["marking_guide"], "Mention both causes.")
        self.assertEqual([a["text_answer"] for a in to_mark["answers"]], ["Two causes."])

        response = self.staff("post", "marking/marks/", {"marks": [
            {"attempt": attempt.id, "question": self.q[4].id, "marks": 7.5}]})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        attempt.refresh_from_db()
        self.assertEqual((attempt.text_score, attempt.total_score), (Decimal("7.50"), Decimal("9.50")))
        self.assertEqual(CBTAnswer.objects.get(attempt=attempt, question=self.q[4]).marked_by, self.admin)

    def test_marks_must_fit_the_question_and_the_attempt(self):
        finished = self.sit(self.student, {2: {"selected_option": "B"}, 4: {"text_answer": "Something."}})
        writing = self.sit(self.sitting_student(), {4: {"text_answer": "Still going."}}, submit=False)
        self.as_staff(self.admin)

        for entry, code, message in [
            ({"attempt": finished.id, "question": self.q[4].id, "marks": 11}, 400, "between 0 and 10"),
            ({"attempt": finished.id, "question": self.q[2].id, "marks": 1}, 400, "marked automatically"),
            ({"attempt": writing.id, "question": self.q[4].id, "marks": 5}, 409, "Only finished attempts"),
        ]:
            with self.subTest(entry=entry):
                response = self.staff("post", "marking/marks/", {"marks": [entry]})
                self.assertEqual(response.status_code, code)
                self.assertIn(message, response.data["detail"])

    def test_a_blank_written_answer_cannot_be_marked(self):
        attempt = self.sit(self.student, {4: {"text_answer": "   "}})
        self.as_staff(self.admin)

        response = self.staff("post", "marking/marks/", {"marks": [
            {"attempt": attempt.id, "question": self.q[4].id, "marks": 3}]})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        attempt.refresh_from_db()
        self.assertEqual(attempt.total_score, Decimal("0"))

    def test_a_teacher_who_doesnt_manage_the_exam_cannot_mark_it(self):
        attempt = self.sit(self.student, {4: {"text_answer": "Answer."}})
        user = User.objects.create_user(username="other_marker", email="other_marker@example.com", role="teacher",
                                        password="x", is_active=True, tenant=self.school)
        Teacher.objects.create(user=user, tenant=self.school, employee_id="OTHER1")
        self.as_staff(user)

        response = self.staff("post", "marking/marks/", {"marks": [
            {"attempt": attempt.id, "question": self.q[4].id, "marks": 3}]})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AnswerKeyTest(MarkingTest):
    def test_correcting_an_answer_remarks_everyone_who_had_the_question(self):
        picked_b = self.sit(self.student, {1: {"selected_option": "B"}})
        picked_c = self.sit(self.sitting_student(), {1: {"selected_option": "C"}})
        self.as_staff(self.admin)

        before = self.staff("get", "marking/").data["objective"][0]
        self.assertEqual((before["option_counts"], before["correct"]), ({"B": 1, "C": 1}, 1))

        response = self.staff("post", f"questions/{self.q[1].id}/answer-key/",
                               {"correct_option": "c", "reason": "Key was wrong"})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["remarked_attempts"], 2)
        picked_b.refresh_from_db()
        picked_c.refresh_from_db()
        self.assertEqual((picked_b.total_score, picked_c.total_score), (Decimal("0"), Decimal("2")))
        change = CBTAnswerKeyChange.objects.get()
        self.assertEqual((change.previous_option, change.new_option, change.changed_by), ("B", "C", self.admin))

    def test_a_faulty_question_can_give_everyone_its_marks_even_unanswered(self):
        answered_wrong = self.sit(self.student, {1: {"selected_option": "A"}})
        left_blank = self.sit(self.sitting_student(), {})
        self.as_staff(self.admin)

        self.staff("post", f"questions/{self.q[1].id}/answer-key/", {"award_all": True, "reason": "Ambiguous"})

        for attempt in (answered_wrong, left_blank):
            attempt.refresh_from_db()
            self.assertEqual(attempt.total_score, Decimal("2"))

    def test_the_answer_must_be_one_of_the_options(self):
        self.as_staff(self.admin)

        response = self.staff("post", f"questions/{self.q[1].id}/answer-key/", {"correct_option": "Z"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CBTAnswerKeyChange.objects.exists())


class ResultsTest(MarkingTest):
    def setUp(self):
        super().setUp()
        self.primary = EducationLevel.objects.get(tenant=self.school, code="primary")
        self.column = AssessmentComponent.objects.get(tenant=self.school, education_level=self.primary, code="EXAM")
        session = AcademicSession.objects.create(tenant=self.school, name="2026/2027", start_date=date(2026, 9, 7),
                                                 end_date=date(2027, 7, 23), is_current=True)
        self.session = ExamSession.objects.create(
            tenant=self.school, name="First Term Exams", exam_type=ExamType.objects.filter(tenant=self.school).first(),
            academic_session=session, start_date=date(2026, 12, 1), end_date=date(2026, 12, 12))
        GradingSystem.objects.create(tenant=self.school, name="Standard", grading_type="PERCENTAGE")
        self.as_staff(self.admin)

    def choose_column(self):
        response = self.request("patch", f"{PAPERS}{self.paper.id}/", {
            "result_exam_session": self.session.id, "result_component": self.column.id}, token=None)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_the_targets_are_this_levels_columns_and_the_schools_sessions(self):
        targets = self.staff("get", "results/targets/").data

        self.assertTrue(targets["supported"])
        self.assertEqual({c["code"] for c in targets["components"]}, {"CA1", "CA2", "EXAM"})
        self.assertIn(self.session.id, [s["id"] for s in targets["exam_sessions"]])

    def test_a_column_from_another_level_is_refused(self):
        jss = EducationLevel.objects.get(tenant=self.school, code="jss")
        other = AssessmentComponent.objects.filter(tenant=self.school, education_level=jss).first()

        response = self.request("patch", f"{PAPERS}{self.paper.id}/", {"result_component": other.id}, token=None)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_scores_go_into_the_results_scaled_to_the_column_and_unmarked_ones_wait(self):
        # 2 + 2 of the 16 marks on offer: 25%, so 15 of the column's 60.
        marked = self.sit(self.student, {1: {"selected_option": "B"}, 2: {"selected_option": "B"}})
        waiting_student = self.sitting_student()
        self.sit(waiting_student, {4: {"text_answer": "Not marked yet."}})
        self.as_staff(self.admin)
        self.choose_column()

        response = self.staff("post", "results/push/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["pushed"], 1)
        self.assertEqual(response.data["skipped"], [{"student": waiting_student.full_name,
                                                      "reason": "Answers still to mark"}])
        result = PrimaryResult.objects.get(student=self.student, subject=self.exam.subject, exam_session=self.session)
        self.assertEqual(result.status, "DRAFT")
        self.assertEqual(ComponentScore.objects.get(primary_result=result, component=self.column).score, Decimal("15.00"))
        self.assertEqual(result.total_score, Decimal("15.00"))
        self.assertEqual(marked.max_score, Decimal("16"))

    def test_an_approved_result_is_not_overwritten(self):
        self.sit(self.student, {1: {"selected_option": "B"}})
        self.as_staff(self.admin)
        self.choose_column()
        self.staff("post", "results/push/")
        PrimaryResult.objects.filter(student=self.student).update(status="APPROVED")

        response = self.staff("post", "results/push/")

        self.assertEqual(response.data["pushed"], 0)
        self.assertEqual(response.data["skipped"][0]["reason"], "Result already approved")

    def test_pushing_without_a_column_is_refused(self):
        response = self.staff("post", "results/push/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Choose the exam session", response.data["detail"])


class StudentScoreTest(MarkingTest):
    def my_score(self):
        self.as_student(self.student)
        exams = self.request("get", MY_EXAMS).data["exams"]
        return next(e for e in exams if e["paper"] == self.paper.id)["attempt"]["score"]

    def test_with_manual_release_the_score_waits_for_staff(self):
        self.sit(self.student, {1: {"selected_option": "B"}})
        self.assertIsNone(self.my_score())

        self.as_staff(self.admin)
        self.staff("post", "results/release/")

        self.assertEqual(self.my_score(), {"total": "2.00", "max": "16.00", "percentage": 12.5})

    def test_on_submit_release_shows_the_score_once_it_is_fully_marked(self):
        CBTPaper.objects.filter(pk=self.paper.pk).update(result_release=CBTPaper.ResultRelease.ON_SUBMIT)
        attempt = self.sit(self.student, {1: {"selected_option": "B"}, 4: {"text_answer": "Answer."}})
        self.assertIsNone(self.my_score())

        self.as_staff(self.admin)
        self.staff("post", "marking/marks/", {"marks": [{"attempt": attempt.id, "question": self.q[4].id, "marks": 4}]})

        self.assertEqual(self.my_score()["total"], "6.00")

    def test_after_close_release_waits_for_the_window_to_close(self):
        CBTPaper.objects.filter(pk=self.paper.pk).update(result_release=CBTPaper.ResultRelease.AFTER_CLOSE)
        self.sit(self.student, {1: {"selected_option": "B"}})
        self.assertIsNone(self.my_score())

        CBTPaper.objects.filter(pk=self.paper.pk).update(closes_at=timezone.now() - timedelta(minutes=1))

        self.assertEqual(self.my_score()["total"], "2.00")
