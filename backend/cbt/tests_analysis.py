"""
How a paper's questions performed: facility, discrimination, option choices,
time on screen, reliability, and difficulty ratings fed back to the question bank.
"""

from rest_framework import status

from cbt import engine
from cbt.models import CBTAnswer, CBTAttempt
from cbt.tests import User, objective
from cbt.tests_engine import ATTEMPTS, EngineTest
from exam.models import DifficultyLevel, QuestionBank
from teacher.models import Teacher

PAPERS = "/api/cbt/papers/"


class AnalysisTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(username="analyst", email="analyst@example.com", role="admin",
                                              password="x", is_active=True, tenant=self.school)
        self.use_exam(self.make_exam(objective_questions=[objective(n) for n in range(1, 4)]))

    def use_exam(self, exam, **settings):
        self.exam = exam
        self.paper = self.open_paper(exam, shuffle_questions=False, **settings)
        self.q = {q.order: q for q in self.paper.questions.all()}

    def sit(self, choices, student=None):
        """Sit the paper with {question order: option key}, straight through the engine."""
        attempt = CBTAttempt.start(self.paper, student or self.sitting_student())
        for order, key in choices.items():
            question = self.q[order]
            if question.id in attempt.question_ids:
                CBTAnswer.objects.create(tenant=self.school, attempt=attempt, question=question, selected_option=key)
        return engine.submit(attempt)

    def analysis(self):
        self.client.force_authenticate(user=self.admin)
        response = self.request("get", f"{PAPERS}{self.paper.id}/analysis/", token=None)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def item(self, analysis, order):
        return next(i for i in analysis["questions"] if i["order"] == order)


class ItemStatisticsTest(AnalysisTest):
    def test_facility_option_choices_and_blanks(self):
        for choice in ("B", "B", "A", None):
            self.sit({1: choice} if choice else {})

        analysis = self.analysis()
        first = self.item(analysis, 1)

        self.assertEqual(analysis["students"], 4)
        self.assertEqual((first["given_to"], first["correct"], first["omitted"], first["facility"]), (4, 2, 1, 0.5))
        self.assertEqual(first["option_counts"], {"B": 2, "A": 1})
        # Four students aren't enough to compare the strongest with the weakest.
        self.assertIsNone(first["discrimination"])
        self.assertIsNone(analysis["summary"]["kr20"])
        self.assertIn("at least 10 students", analysis["summary"]["kr20_note"])

    def test_discrimination_picks_out_a_question_the_weaker_students_get_right(self):
        # Six strong students get questions 1 and 2 right and are drawn to option C on question 3.
        # Six weak students get 1 and 2 wrong but answer question 3 correctly.
        for _ in range(6):
            self.sit({1: "B", 2: "B", 3: "C"})
        for _ in range(6):
            self.sit({1: "A", 2: "A", 3: "B"})

        analysis = self.analysis()
        good, backwards = self.item(analysis, 1), self.item(analysis, 3)

        self.assertEqual(good["discrimination"], 1.0)
        self.assertGreater(good["point_biserial"], 0.9)
        self.assertEqual(backwards["discrimination"], -1.0)
        codes = {(f["code"], f.get("option")) for f in backwards["flags"]}
        self.assertIn(("negative_discrimination", None), codes)
        self.assertIn(("distractor_draws_strong", "C"), codes)
        self.assertEqual((backwards["top_group_counts"], backwards["bottom_group_counts"]), ({"C": 3}, {"B": 3}))

    def test_the_score_summary_and_reliability(self):
        for _ in range(5):
            self.sit({1: "B", 2: "B", 3: "B"})   # 100%
        for _ in range(5):
            self.sit({1: "A", 2: "A", 3: "A"})   # 0%
        self.sit({1: "B", 2: "A", 3: "A"})       # 33.3%

        summary = self.analysis()["summary"]

        self.assertEqual((summary["mean"], summary["median"], summary["highest"], summary["lowest"]),
                         (48.5, 33.3, 100.0, 0.0))
        self.assertEqual([b["students"] for b in summary["distribution"]], [5, 0, 0, 1, 0, 0, 0, 0, 0, 5])
        # Items that rise and fall together make a highly reliable (if tiny) test.
        self.assertGreater(summary["kr20"], 0.9)

    def test_reliability_is_not_given_when_students_got_different_questions(self):
        self.use_exam(self.make_exam(objective_questions=[objective(n) for n in range(1, 5)]),
                      objective_questions_per_attempt=2)
        for n in range(12):
            self.sit({1: "B", 2: "A", 3: "B", 4: "A"} if n % 2 else {1: "A", 2: "B", 3: "A", 4: "B"})

        summary = self.analysis()["summary"]

        self.assertIsNone(summary["kr20"])
        self.assertIn("different objective questions", summary["kr20_note"])


class TimeOnQuestionTest(AnalysisTest):
    def test_heartbeats_add_up_time_per_question_within_limits(self):
        attempt = self.started()
        q1, q2 = attempt.question_ids[0], attempt.question_ids[1]

        response = self.request("post", f"{ATTEMPTS}{attempt.id}/heartbeat/", {
            "time_spent": {str(q1): 50, str(q2): 70, "999999": 30, str(attempt.question_ids[2]): -5}})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.request("post", f"{ATTEMPTS}{attempt.id}/heartbeat/", {"time_spent": {str(q1): 20}})

        attempt.refresh_from_db()
        # 50 + 70 is more than one check-in can cover, so the second question gets what is left of 90 seconds.
        self.assertEqual(attempt.time_on_questions, {str(q1): 70, str(q2): 40})

        self.request("post", f"{ATTEMPTS}{attempt.id}/submit/")
        self.assertEqual(self.item(self.analysis(), 1)["median_seconds"], 70)


class BankDifficultyTest(AnalysisTest):
    def setUp(self):
        super().setUp()
        owner = User.objects.create_user(username="bank_owner", email="bank_owner@example.com", role="teacher",
                                         password="x", is_active=True, tenant=self.school)
        self.owner = owner
        Teacher.objects.create(user=owner, tenant=self.school, employee_id="OWNER1")
        self.bank_question = QuestionBank.objects.create(
            tenant=self.school, created_by=owner.teacher, question="<p>2 + 2?</p>", options=["3", "4"],
            correct_answer="B", marks=1, subject=self.exam.subject, grade_level=self.exam.grade_level,
            difficulty=DifficultyLevel.objects.get(tenant=self.school, code="hard"))
        self.use_exam(self.make_exam(objective_questions=[
            {**objective(1), "bankQuestionId": self.bank_question.id},
            {**objective(2), "bankQuestionId": 999999},  # Not in this school's bank: the link is dropped.
        ]))

    def test_published_questions_remember_which_bank_question_they_came_from(self):
        self.assertEqual(self.q[1].bank_question, self.bank_question)
        self.assertIsNone(self.q[2].bank_question)

    def test_a_bank_question_most_students_get_right_is_suggested_as_easy_once_enough_have_sat_it(self):
        for _ in range(9):
            self.sit({1: "B"})
        self.assertIsNone(self.item(self.analysis(), 1)["bank"]["suggested_difficulty"])

        self.sit({1: "B"})
        bank = self.item(self.analysis(), 1)["bank"]
        self.assertEqual((bank["difficulty"], bank["suggested_difficulty"]), ("hard", "easy"))

    def test_applying_the_suggestion_is_limited_to_the_author_and_admins(self):
        for _ in range(10):
            self.sit({1: "B"})
        stranger = User.objects.create_user(username="not_owner", email="not_owner@example.com", role="teacher",
                                            password="x", is_active=True, tenant=self.school)
        Teacher.objects.create(user=stranger, tenant=self.school, employee_id="STRANGER")
        self.exam.teacher = stranger.teacher
        self.exam.save()
        url = f"{PAPERS}{self.paper.id}/analysis/apply-difficulty/"

        self.client.force_authenticate(user=stranger)
        refused = self.request("post", url, {"questions": [self.q[1].id, self.q[2].id]}, token=None)
        self.assertEqual(refused.status_code, status.HTTP_200_OK, refused.data)
        self.assertEqual([s["reason"] for s in refused.data["skipped"]],
                         ["Only the question's author or an admin can change it", "Not from the question bank"])

        self.client.force_authenticate(user=self.admin)
        applied = self.request("post", url, {"questions": [self.q[1].id]}, token=None)
        self.assertEqual(applied.data["updated"], [
            {"question": self.q[1].id, "bank_question": self.bank_question.id, "difficulty": "easy"}])
        self.bank_question.refresh_from_db()
        self.assertEqual(self.bank_question.difficulty.code, "easy")
