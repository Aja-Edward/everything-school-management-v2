"""
Drawing random question-bank questions into an exam from its CBT paper.
"""

from rest_framework import status

from cbt.models import CBTPaper
from cbt.tests_authoring import PAPERS, AuthoringTest
from classroom.models import GradeLevel
from exam.models import DifficultyLevel, QuestionBank
from subject.models import Subject


class BankDrawTest(AuthoringTest):
    def setUp(self):
        super().setUp()
        self.as_user(self.teacher)
        self.paper = self.create_paper(include_theory=True)
        self.url = f"{PAPERS}{self.paper.id}/"

    def bank_question(self, topic="Algebra", difficulty="easy", teacher=None, school=None, **fields):
        school = school or self.school
        if teacher is None:
            teacher = self.teacher.teacher if school == self.school else self.make_staff("teacher", school).teacher
        n = QuestionBank.objects.count() + 1
        values = {
            "question_type": "objective", "question": f"<p>Bank question {n}</p>",
            "options": ["one", "two", "three", "four"], "correct_answer": "C", "marks": 2,
            "subject": self.exam.subject if school == self.school else Subject.objects.get_or_create(
                tenant=school, code="MATH-PRI", defaults={"name": "Mathematics"})[0],
            "grade_level": self.exam.grade_level if school == self.school else GradeLevel.objects.filter(
                tenant=school).first(),
            **fields,
        }
        return QuestionBank.objects.create(
            tenant=school, created_by=teacher, topic=topic,
            difficulty=DifficultyLevel.objects.get(tenant=school, code=difficulty), **values)

    def summary(self, **params):
        response = self.call("get", f"{self.url}bank/", params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return [(e["topic"], e["difficulty"], e["count"]) for e in response.data["available"]]

    def draw(self, **data):
        return self.call("post", f"{self.url}draw/", {"question_type": "objective", **data})

    def test_the_summary_counts_only_what_this_teacher_may_draw_into_this_exam(self):
        self.bank_question()
        self.bank_question()
        self.bank_question(topic="algebra ", difficulty="hard")
        self.bank_question(topic="Geometry")
        colleague = self.make_staff("teacher").teacher
        self.bank_question(topic="Geometry", teacher=colleague, is_shared=True)
        self.bank_question(topic="Geometry", teacher=colleague)
        other_grade = GradeLevel.objects.filter(tenant=self.school).exclude(pk=self.exam.grade_level_id).first()
        self.bank_question(grade_level=other_grade)
        english = Subject.objects.create(tenant=self.school, code="ENG-PRI", name="English")
        self.bank_question(subject=english)
        self.bank_question(question_type="theory", options=[], correct_answer="")
        self.bank_question(school=self.make_school("Other Bank School", "other-bank-school"))
        # Already on the exam, imported some other way.
        self.bank_question(question="<p>Question 1</p>")

        self.assertEqual(self.summary(), [
            ("Algebra", "easy", 2), ("algebra", "hard", 1), ("Geometry", "easy", 2)])
        self.assertEqual(self.summary(any_grade_level="true")[0], ("Algebra", "easy", 3))
        self.assertEqual(self.summary(question_type="theory"), [("Algebra", "easy", 1)])

    def test_drawn_questions_join_the_exam_in_the_editors_shape_and_publish(self):
        chosen = [self.bank_question(), self.bank_question()]

        response = self.draw(count=2, topics=["Algebra"])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["added"], 2)
        self.exam.refresh_from_db()
        added = self.exam.objective_questions[3:]
        self.assertEqual(sorted(q["bankQuestionId"] for q in added), sorted(q.id for q in chosen))
        self.assertEqual(
            {k: added[0][k] for k in ("optionA", "optionB", "optionC", "optionD", "correctAnswer", "marks")},
            {"optionA": "one", "optionB": "two", "optionC": "three", "optionD": "four",
             "correctAnswer": "C", "marks": 2})
        self.assertEqual(set(QuestionBank.objects.values_list("usage_count", flat=True)), {1})

        self.set_exam_status("approved")
        published = self.call("post", f"{self.url}publish/")
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        paper = CBTPaper.objects.get(pk=self.paper.pk)
        self.assertEqual(paper.questions.filter(section="objective").count(), 5)
        self.assertEqual(list(paper.questions.filter(order__gt=3).values_list("correct_option", flat=True)), ["C", "C"])

    def test_drawn_questions_keep_how_they_are_answered(self):
        self.bank_question(answer_type="true_false", options=["True", "False"], correct_answer="False")
        self.bank_question(answer_type="multiple", correct_answer="A,C", partial_credit=True)
        self.bank_question(answer_type="numeric", options=[], correct_answer="9.8", tolerance="0.1", unit="m/s²")

        self.assertEqual(self.draw(count=3).status_code, status.HTTP_200_OK)

        self.exam.refresh_from_db()
        added = {q.get("questionType"): q for q in self.exam.objective_questions[3:]}
        self.assertEqual((added["true_false"]["optionA"], added["true_false"]["correctAnswer"]), ("True", "False"))
        self.assertEqual((added["multiple"]["correctAnswer"], added["multiple"]["partialCredit"]), ("A,C", True))
        self.assertEqual({k: added["numeric"][k] for k in ("correctAnswer", "tolerance", "unit")},
                         {"correctAnswer": "9.8", "tolerance": "0.1", "unit": "m/s²"})

        self.set_exam_status("approved")
        self.assertEqual(self.call("post", f"{self.url}publish/").status_code, status.HTTP_200_OK)
        kinds = dict(CBTPaper.objects.get(pk=self.paper.pk).questions.filter(order__gt=3)
                     .values_list("kind", "correct_option"))
        self.assertEqual(kinds, {"true_false": "B", "multiple": "AC", "numeric": ""})

    def test_the_bank_checks_an_answer_against_its_answer_type(self):
        url = "/api/exams/question-bank/"
        base = {"question_type": "objective", "question": "<p>Q</p>", "marks": 1, "subject": self.exam.subject_id,
                "grade_level": self.exam.grade_level_id, "difficulty": DifficultyLevel.objects.get(
                    tenant=self.school, code="easy").id, "options": ["one", "two", "three"]}

        created = self.call("post", url, {**base, "answer_type": "true_false", "options": [], "correct_answer": "True"})
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(QuestionBank.objects.get(question="<p>Q</p>").options, ["True", "False"])

        for fields, field in [
            ({"answer_type": "true_false", "correct_answer": "Maybe"}, "correct_answer"),
            ({"answer_type": "multiple", "correct_answer": "A,D"}, "correct_answer"),
            ({"answer_type": "multiple", "correct_answer": ""}, "correct_answer"),
            ({"answer_type": "numeric", "correct_answer": "ten"}, "correct_answer"),
            ({"answer_type": "numeric", "correct_answer": "10", "tolerance": "-1"}, "tolerance"),
        ]:
            with self.subTest(fields=fields):
                response = self.call("post", url, {**base, **fields})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_only_the_chosen_topics_and_difficulties_are_drawn(self):
        self.bank_question()
        hard = self.bank_question(topic="Algebra", difficulty="hard")
        self.bank_question(topic="Geometry", difficulty="hard")

        response = self.draw(count=1, topics=["ALGEBRA"], difficulties=["hard"])

        self.assertEqual(response.data["question_ids"], [hard.id])

    def test_a_question_is_never_drawn_twice_into_the_same_exam(self):
        self.bank_question()
        self.bank_question()
        self.assertEqual(self.draw(count=2).status_code, status.HTTP_200_OK)

        self.assertEqual(self.summary(), [])
        again = self.draw(count=1)
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(again.data["detail"], "No questions in the bank match. Try other topics or difficulties.")

    def test_asking_for_more_than_match_adds_nothing(self):
        self.bank_question()
        self.bank_question()

        response = self.draw(count=5)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Only 2 questions in the bank match; choose 2 or fewer.")
        self.exam.refresh_from_db()
        self.assertEqual(len(self.exam.objective_questions), 3)

    def test_a_teacher_cannot_add_to_an_exam_awaiting_approval_but_an_admin_can(self):
        self.bank_question(is_shared=True)
        self.set_exam_status("pending_approval")

        refused = self.draw(count=1)
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("pending approval", refused.data["detail"])
        self.assertIn("pending approval", self.call("get", f"{self.url}bank/").data["edit_refusal"])

        self.as_user(self.make_staff("admin"))
        self.assertEqual(self.draw(count=1).status_code, status.HTTP_200_OK)

    def test_theory_questions_bring_their_table_and_marking_guide(self):
        self.bank_question(question_type="theory", question="<p>Explain the table.</p>", options=[],
                           correct_answer="", expected_points="Rows add up to 10.",
                           table_data="<table><tr><td>5</td><td>5</td></tr></table>")

        self.assertEqual(self.draw(question_type="theory", count=1).status_code, status.HTTP_200_OK)

        self.exam.refresh_from_db()
        theory = self.exam.theory_questions[-1]
        self.assertEqual(theory["question"], "<p>Explain the table.</p><table><tr><td>5</td><td>5</td></tr></table>")
        self.assertEqual(theory["expectedPoints"], "Rows add up to 10.")
        self.assertNotIn("correctAnswer", theory)
