"""
True-or-false, choose-all-that-apply and numeric questions: reading numbers,
marking, publishing them from the exam, sitting them, correcting their keys,
and how they show in the marking overview and the analysis.
"""

import json
from decimal import Decimal
from fractions import Fraction
from types import SimpleNamespace

from django.test import SimpleTestCase
from rest_framework import status

from cbt import engine, scoring
from cbt.models import CBTAnswer, CBTAnswerKeyChange, CBTAttempt, CBTQuestion
from cbt.tests import CBTTestCase, User, objective
from cbt.tests_engine import ATTEMPTS, EngineTest

PAPERS = "/api/cbt/papers/"


def true_false(answer="False", **extra):
    return {"questionType": "true_false", "question": "<p>The sun is a planet.</p>", "correctAnswer": answer,
            "marks": 1, **extra}


def choose_all(answer="A, C", **extra):
    return {"questionType": "multiple", "question": "<p>Which are prime?</p>",
            "optionA": "2", "optionB": "4", "optionC": "5", "optionD": "9", "correctAnswer": answer,
            "marks": 4, **extra}


def numeric(answer="1/2", **extra):
    return {"questionType": "numeric", "question": "<p>How long is the rod?</p>", "correctAnswer": answer,
            "tolerance": "0.01", "unit": "m", "marks": 2, **extra}


def question(**fields):
    defaults = {"kind": "objective", "marks": Decimal("4"), "award_all": False, "correct_option": "",
                "partial_credit": False, "numeric_answer": "", "tolerance": Decimal(0), "unit": ""}
    return SimpleNamespace(**{**defaults, **fields})


class ReadingNumbersTest(SimpleTestCase):
    def test_the_ways_a_number_may_be_written(self):
        for text, value in [
            ("12", 12), ("-3.5", Fraction(-7, 2)), (".75", Fraction(3, 4)), ("5.", 5), ("+4", 4),
            ("1,250,000", 1250000), ("1,250.5", Fraction(2501, 2)), ("6.02e23", 602 * 10**21),
            ("3/4", Fraction(3, 4)), ("-3 / 4", Fraction(-3, 4)), ("1 1/2", Fraction(3, 2)),
            ("−2", -2), ("  7  ", 7), ("0.1", Fraction(1, 10)),
        ]:
            with self.subTest(text=text):
                self.assertEqual(scoring.parse_number(text), value)

    def test_what_is_not_a_number(self):
        for text in ["", "   ", "abc", "1.2.3", "12,34", "1/0", "1 1/0", "--2", "2-", "1e999", "7" * 51, None, "1,5"]:
            with self.subTest(text=text):
                self.assertIsNone(scoring.parse_number(text))

    def test_the_question_unit_may_follow_the_number(self):
        self.assertEqual(scoring.parse_number("12.5 cm", unit="cm"), Fraction(25, 2))
        self.assertEqual(scoring.parse_number("12.5CM", unit="cm"), Fraction(25, 2))
        self.assertEqual(scoring.parse_number("45%", unit="%"), 45)
        self.assertIsNone(scoring.parse_number("12.5 cm"))


class MarkingAnswersTest(SimpleTestCase):
    def test_choose_all_that_apply_is_all_or_nothing_by_default(self):
        q = question(kind="multiple", correct_option="AC")
        self.assertEqual(scoring.score(q, "AC"), (True, Decimal("4")))
        self.assertEqual(scoring.score(q, "A"), (False, Decimal(0)))
        self.assertEqual(scoring.score(q, "ABC"), (False, Decimal(0)))
        self.assertEqual(scoring.score(q, ""), (False, Decimal(0)))

    def test_partial_credit_takes_off_a_wrong_choice_for_each_right_one(self):
        q = question(kind="multiple", correct_option="ACD", partial_credit=True, marks=Decimal("3"))
        for chosen, marks in [("ACD", "3"), ("AC", "2.00"), ("A", "1.00"), ("AB", "0.00"),
                              ("ACB", "1.00"), ("ABCD", "2.00"), ("B", "0.00"), ("", "0")]:
            with self.subTest(chosen=chosen):
                self.assertEqual(scoring.score(q, chosen)[1], Decimal(marks))
        # Ticking everything can't beat leaving the wrong ones out.
        q = question(kind="multiple", correct_option="A", partial_credit=True, marks=Decimal("2"))
        self.assertEqual(scoring.score(q, "ABCD")[1], Decimal("0.00"))

    def test_part_marks_round_to_the_nearest_hundredth(self):
        q = question(kind="multiple", correct_option="ABC", partial_credit=True, marks=Decimal("1"))
        self.assertEqual(scoring.score(q, "A"), (False, Decimal("0.33")))

    def test_a_number_counts_within_the_tolerance_either_side(self):
        q = question(kind="numeric", numeric_answer="1/3", tolerance=Decimal("0.001"), unit="m", marks=Decimal("2"))
        for text, right in [("0.333", True), ("1/3", True), ("0.334", True), ("0.3345", False), ("0.33", False),
                            ("0.3333 m", True), ("", False), ("a third", False)]:
            with self.subTest(text=text):
                self.assertEqual(scoring.score(q, text_answer=text), (right, Decimal("2") if right else Decimal(0)))

    def test_with_no_tolerance_the_number_must_be_exact(self):
        q = question(kind="numeric", numeric_answer="2500")
        self.assertTrue(scoring.score(q, text_answer="2,500")[0])
        self.assertTrue(scoring.score(q, text_answer="2.5e3")[0])
        self.assertFalse(scoring.score(q, text_answer="2500.01")[0])

    def test_award_all_gives_every_kind_its_marks(self):
        for kind in ("objective", "true_false", "multiple", "numeric"):
            with self.subTest(kind=kind):
                self.assertEqual(scoring.score(question(kind=kind, award_all=True)), (True, Decimal("4")))

    def test_the_key_as_staff_read_it(self):
        self.assertEqual(scoring.describe_key(question(kind="multiple", correct_option="AC")), "A, C")
        self.assertEqual(scoring.describe_key(question(kind="true_false", correct_option="B")), "B")
        self.assertEqual(scoring.describe_key(
            question(kind="numeric", numeric_answer="12.5", tolerance=Decimal("0.10000000"), unit="cm")), "12.5 ± 0.1 cm")
        self.assertEqual(scoring.describe_key(question(kind="numeric", numeric_answer="7")), "7")

    def test_common_numbers_count_equal_values_together(self):
        q = question(kind="numeric", numeric_answer="0.5", unit="m")
        answers = ["0.5", "1/2", " 0.5 m", "5", "5.0", "5", "half", "HALF", ""]
        self.assertEqual(scoring.common_numbers(q, answers), [
            {"answer": "0.5", "students": 3, "correct": True},
            {"answer": "5", "students": 3, "correct": False},
            {"answer": "half", "students": 2, "correct": False},
        ])


class PublishingQuestionTypesTest(CBTTestCase):
    def test_each_type_is_copied_onto_the_paper(self):
        exam = self.make_exam(objective_questions=[
            objective(1), true_false(), choose_all(partialCredit=True), numeric()])

        q = {q.order: q for q in self.make_paper(exam).questions.all()}

        self.assertEqual((q[1].kind, q[1].correct_option), ("objective", "B"))
        self.assertEqual((q[2].kind, q[2].correct_option), ("true_false", "B"))
        self.assertEqual(q[2].options, [{"key": "A", "text": "True"}, {"key": "B", "text": "False"}])
        self.assertEqual((q[3].kind, q[3].correct_option, q[3].partial_credit), ("multiple", "AC", True))
        self.assertEqual(q[3].option_keys, ["A", "B", "C", "D"])
        self.assertEqual((q[4].kind, q[4].numeric_answer, q[4].tolerance, q[4].unit, q[4].options),
                         ("numeric", "1/2", Decimal("0.01"), "m", []))
        self.assertEqual({q.section for q in q.values()}, {"objective"})

    def test_answers_may_be_written_in_several_ways(self):
        exam = self.make_exam(objective_questions=[
            true_false("true"), true_false("F"), true_false("A"),
            choose_all("CA"), choose_all(["d", "b"]), choose_all("b;c"),
            numeric("3", tolerance=""), numeric("1,000", tolerance=None),
        ])

        q = {q.order: q for q in self.make_paper(exam).questions.all()}

        self.assertEqual([q[n].correct_option for n in range(1, 7)], ["A", "B", "A", "AC", "BD", "BC"])
        self.assertEqual((q[7].tolerance, q[8].numeric_answer), (Decimal(0), "1,000"))

    def test_each_problem_is_named(self):
        exam = self.make_exam(objective_questions=[
            {**objective(1), "questionType": "essay"},
            true_false("maybe"),
            choose_all(""),
            choose_all("A, E"),
            {**choose_all(), "optionB": "", "optionC": "", "optionD": ""},
            numeric(""),
            numeric("about ten"),
            numeric("10", tolerance="-1"),
        ])

        self.assertEqual(self.problems(self.make_paper(exam, publish=False)), [
            "Objective question 1 has a question type this paper doesn't know.",
            "Objective question 2 has no correct answer: choose True or False.",
            "Objective question 3 has no correct answers: tick every option that is right.",
            "Objective question 4 has a correct answer that is not one of its options.",
            "Objective question 5 needs at least two options.",
            "Objective question 6 has no correct answer.",
            "Objective question 7 has an answer that isn't a number: about ten.",
            "Objective question 8 needs its margin either side of the answer to be a number, 0 or more.",
        ])

    def test_every_type_counts_towards_questions_per_student(self):
        exam = self.make_exam(objective_questions=[objective(1), true_false(), choose_all(), numeric()])

        paper = self.make_paper(exam, objective_questions_per_attempt=4)

        self.assertEqual(paper.questions.count(), 4)


class SittingQuestionTypesTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.exam = self.make_exam(objective_questions=[
            true_false(), choose_all(partialCredit=True), numeric(), objective(4)])
        self.paper = self.open_paper(self.exam, shuffle_questions=False)
        self.q = {q.order: q for q in self.paper.questions.all()}
        self.attempt = self.started()

    def test_the_paper_says_how_to_answer_but_gives_nothing_away(self):
        detail = self.request("get", f"{ATTEMPTS}{self.attempt.id}/").data
        by_kind = {item["kind"]: item for item in detail["paper"]["questions"]}

        self.assertEqual(set(by_kind), {"true_false", "multiple", "numeric", "objective"})
        self.assertEqual([o["text"] for o in by_kind["true_false"]["options"]], ["True", "False"])
        self.assertEqual(len(by_kind["multiple"]["options"]), 4)
        self.assertEqual(by_kind["numeric"]["unit"], "m")
        self.assertNotIn("options", by_kind["numeric"])
        sent = json.dumps(detail["paper"])
        for secret in ("1/2", "0.01", "partial", "correct", "tolerance", "numeric_answer"):
            self.assertNotIn(secret, sent)

    def test_true_stays_before_false_when_options_are_shuffled(self):
        for _ in range(8):
            attempt = CBTAttempt.start(self.paper, self.sitting_student())
            self.assertEqual(attempt.option_order[str(self.q[1].id)], ["A", "B"])

    def test_answers_are_saved_as_the_student_gave_them(self):
        response = self.save(self.attempt, [
            {"question_id": self.q[1].id, "selected_option": "b"},
            {"question_id": self.q[2].id, "selected_option": "C,A"},
            {"question_id": self.q[3].id, "text_answer": "0.5 m"},
        ])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved = dict(CBTAnswer.objects.filter(attempt=self.attempt).values_list("question__order", "selected_option"))
        self.assertEqual(saved, {1: "B", 2: "AC", 3: ""})
        self.assertEqual(CBTAnswer.objects.get(attempt=self.attempt, question=self.q[3]).text_answer, "0.5 m")

    def test_clearing_every_tick_saves_no_choice(self):
        self.save(self.attempt, [{"question_id": self.q[2].id, "selected_option": "AC"}])
        self.save(self.attempt, [{"question_id": self.q[2].id, "selected_option": ""}])

        self.assertEqual(CBTAnswer.objects.get(attempt=self.attempt, question=self.q[2]).selected_option, "")

    def test_answers_that_dont_fit_the_question_are_refused(self):
        for item, message in [
            ({"question_id": self.q[1].id, "selected_option": "C"}, "not one of the question's options"),
            ({"question_id": self.q[2].id, "selected_option": "A,E"}, "not one of the question's options"),
            ({"question_id": self.q[2].id, "text_answer": "A and C"}, "answered by choosing an option"),
            ({"question_id": self.q[3].id, "selected_option": "A"}, "answered by typing"),
            ({"question_id": self.q[3].id, "text_answer": "1" * 51}, "at most 50 characters"),
        ]:
            with self.subTest(item=item):
                response = self.save(self.attempt, [item])
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(message, response.data["detail"])
        self.assertFalse(CBTAnswer.objects.filter(attempt=self.attempt).exists())

    def test_an_unfinished_number_is_kept_and_marked_wrong(self):
        response = self.save(self.attempt, [{"question_id": self.q[3].id, "text_answer": "1/"}])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        engine.submit(self.attempt)

        answer = CBTAnswer.objects.get(attempt=self.attempt, question=self.q[3])
        self.assertEqual((answer.text_answer, answer.is_correct, answer.marks_awarded), ("1/", False, Decimal(0)))

    def test_every_type_is_marked_when_the_attempt_ends(self):
        self.save(self.attempt, [
            {"question_id": self.q[1].id, "selected_option": "B"},       # right: 1 mark
            {"question_id": self.q[2].id, "selected_option": "ACD"},     # 2 right, 1 wrong: 4 x 1/2 = 2 marks
            {"question_id": self.q[3].id, "text_answer": "0.505"},       # within 0.01 of 1/2: 2 marks
            {"question_id": self.q[4].id, "selected_option": "A"},       # wrong: 0
        ])

        self.request("post", f"{ATTEMPTS}{self.attempt.id}/submit/")

        self.attempt.refresh_from_db()
        marks = dict(CBTAnswer.objects.filter(attempt=self.attempt).values_list("question__order", "marks_awarded"))
        right = dict(CBTAnswer.objects.filter(attempt=self.attempt).values_list("question__order", "is_correct"))
        self.assertEqual(marks, {1: Decimal("1"), 2: Decimal("2"), 3: Decimal("2"), 4: Decimal("0")})
        self.assertEqual(right, {1: True, 2: False, 3: True, 4: False})
        self.assertEqual((self.attempt.objective_score, self.attempt.total_score, self.attempt.max_score),
                         (Decimal("5"), Decimal("5"), Decimal("8")))

    def test_saving_through_the_model_checks_choices_too(self):
        answer = CBTAnswer(tenant=self.school, attempt=self.attempt, question=self.q[2], selected_option="AZ")
        with self.assertRaisesMessage(Exception, "not one of this question's options"):
            answer.full_clean()


class AnswerKeysForQuestionTypesTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.exam = self.make_exam(objective_questions=[true_false(), choose_all(), numeric()])
        self.paper = self.open_paper(self.exam, shuffle_questions=False)
        self.q = {q.order: q for q in self.paper.questions.all()}
        self.admin = User.objects.create_user(username="key_admin", email="key_admin@example.com", role="admin",
                                              password="x", is_active=True, tenant=self.school)
        self.attempts = []
        for tf, multiple, number in (("B", "AB", "0.25"), ("A", "AC", "0.5 m")):
            self.as_student(self.sitting_student())
            attempt = self.started()
            self.save(attempt, [
                {"question_id": self.q[1].id, "selected_option": tf},
                {"question_id": self.q[2].id, "selected_option": multiple},
                {"question_id": self.q[3].id, "text_answer": number},
            ])
            engine.submit(attempt)
            self.attempts.append(attempt)
        self.client.force_authenticate(user=self.admin)
        self.token = None

    def correct(self, order, **data):
        return self.request("post", f"{PAPERS}{self.paper.id}/questions/{self.q[order].id}/answer-key/",
                            {"reason": "Key was wrong", **data})

    def scores(self):
        return [CBTAttempt.objects.get(pk=a.pk).objective_score for a in self.attempts]

    def test_changing_which_options_are_right_remarks_everyone(self):
        self.assertEqual(self.scores(), [Decimal("1"), Decimal("6")])  # 1 + 0 + 0, then 0 + 4 + 2

        response = self.correct(2, correct_option=["B", "A"])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.scores(), [Decimal("5"), Decimal("2")])
        change = CBTAnswerKeyChange.objects.get(question=self.q[2])
        self.assertEqual((change.previous_option, change.new_option, change.remarked_attempts), ("A, C", "A, B", 2))

    def test_changing_a_numeric_answer_and_its_margin_remarks_everyone(self):
        response = self.correct(3, numeric_answer="0.3", tolerance="0.05")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.scores(), [Decimal("3"), Decimal("4")])
        change = CBTAnswerKeyChange.objects.get(question=self.q[3])
        self.assertEqual((change.previous_option, change.new_option), ("1/2 ± 0.01 m", "0.3 ± 0.05 m"))
        overview = response.data["marking"]["objective"][2]
        self.assertEqual((overview["numeric_answer"], overview["tolerance"], overview["key"]), ("0.3", "0.05", "0.3 ± 0.05 m"))

    def test_a_key_the_question_cant_have_is_refused(self):
        for order, data, message in [
            (1, {"correct_option": "C"}, "Choose one of the question's options."),
            (1, {"correct_option": "AB"}, "Choose one of the question's options."),
            (2, {"correct_option": ""}, "Tick every option that is right."),
            (2, {"correct_option": "A,Z"}, "Tick every option that is right."),
            (3, {"numeric_answer": "half"}, "Write the answer as a number."),
            (3, {"numeric_answer": "0.5", "tolerance": "-0.1"}, "The margin either side of the answer must be a number, 0 or more."),
        ]:
            with self.subTest(data=data):
                response = self.correct(order, **data)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.data["detail"], message)
        self.assertFalse(CBTAnswerKeyChange.objects.exists())

    def test_the_overview_shows_each_type_and_the_common_numbers(self):
        overview = self.request("get", f"{PAPERS}{self.paper.id}/marking/").data
        tf, multiple, number = overview["objective"]

        self.assertEqual((tf["kind"], tf["correct"], tf["option_counts"]), ("true_false", 1, {"B": 1, "A": 1}))
        self.assertEqual((multiple["kind"], multiple["key"], multiple["correct"], multiple["option_counts"]),
                         ("multiple", "A, C", 1, {"A": 2, "B": 1, "C": 1}))
        self.assertEqual((number["kind"], number["answered"], number["correct"], number["unit"]), ("numeric", 2, 1, "m"))
        self.assertEqual(sorted(number["common_answers"], key=lambda a: a["answer"]), [
            {"answer": "0.25", "students": 1, "correct": False},
            {"answer": "0.5 m", "students": 1, "correct": True},
        ])


class AnalysingQuestionTypesTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.exam = self.make_exam(objective_questions=[choose_all(partialCredit=True), numeric(), true_false()])
        self.paper = self.open_paper(self.exam, shuffle_questions=False)
        self.q = {q.order: q for q in self.paper.questions.all()}
        self.admin = User.objects.create_user(username="types_analyst", email="types_analyst@example.com",
                                              role="admin", password="x", is_active=True, tenant=self.school)

    def sit(self, multiple, number, tf):
        attempt = CBTAttempt.start(self.paper, self.sitting_student())
        for order, fields in ((1, {"selected_option": multiple}), (2, {"text_answer": number}),
                              (3, {"selected_option": tf})):
            CBTAnswer.objects.create(tenant=self.school, attempt=attempt, question=self.q[order], **fields)
        engine.submit(attempt)

    def test_part_marks_facility_option_ticks_and_common_numbers(self):
        self.sit("AC", "0.5", "B")    # full marks on 1
        self.sit("A", "1/2", "A")     # half the marks on 1
        self.sit("", "5", "B")        # left 1 blank

        self.client.force_authenticate(user=self.admin)
        analysis = self.request("get", f"{PAPERS}{self.paper.id}/analysis/", token=None).data
        items = {item["order"]: item for item in analysis["questions"]}

        self.assertEqual((items[1]["kind"], items[1]["correct"], items[1]["omitted"], items[1]["facility"]),
                         ("multiple", 1, 1, 0.5))
        self.assertEqual(items[1]["option_counts"], {"A": 2, "C": 1})
        self.assertIsNone(items[1]["point_biserial"])
        self.assertEqual((items[2]["kind"], items[2]["correct"], items[2]["facility"]), ("numeric", 2, 0.667))
        # "0.5" and "1/2" are one answer, shown as whichever was read first.
        first, second = items[2]["common_answers"]
        self.assertEqual((first["answer"] in ("0.5", "1/2"), first["students"], first["correct"]), (True, 2, True))
        self.assertEqual(second, {"answer": "5", "students": 1, "correct": False})
        self.assertEqual(items[2]["option_counts"], {})
        self.assertEqual((items[3]["kind"], items[3]["facility"], items[3]["key"]), ("true_false", 0.667, "B"))
