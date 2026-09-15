"""
The CBT endpoints that get busy during an exam must not issue more database
queries as the class grows.

Each test measures one endpoint on a small class and on one five times the
size, and requires the same number of queries for both. An N+1 slipped into
the board, the analysis, the marking overview, the exam list, saving
answers or submitting shows up here as a difference, long before a hall of
students finds it.
"""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework import status

from cbt import engine
from cbt.models import CBTAnswer, CBTAttempt, CBTEvent
from cbt.tests import User, objective
from cbt.tests_engine import ATTEMPTS, MY_EXAMS, EngineTest
from classroom.models import GradeLevel


class QueryCountTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(username="counter", email="counter@example.com", role="admin",
                                              password="x", is_active=True, tenant=self.school)
        self.levels = list(GradeLevel.objects.filter(tenant=self.school, education_level__code="primary").order_by("order"))

    def class_sitting(self, level, students):
        """A paper for its own class, with `students` students: a third writing, the rest finished."""
        exam = self.make_exam(
            objective_questions=[objective(n) for n in range(1, 5)],
            theory_questions=[{"question": "Explain.", "marks": 5}])
        exam.grade_level = level
        exam.save()
        paper = self.open_paper(exam, include_theory=True)
        for n in range(students):
            attempt = CBTAttempt.start(paper, self.sitting_student(grade_level=level))
            questions = list(paper.questions.filter(id__in=attempt.question_ids))
            for question in questions:
                fields = {"text_answer": "An answer."} if question.kind == "text" else {"selected_option": "B"}
                CBTAnswer.objects.create(tenant=self.school, attempt=attempt, question=question, **fields)
            CBTEvent.objects.create(tenant=self.school, attempt=attempt, kind=CBTEvent.Kind.FOCUS_LOST)
            engine.heartbeat(attempt, time_spent={str(questions[0].id): 20})
            if n % 3:
                engine.submit(attempt)
        return paper

    def queries(self, method, url, data=None, user=None, token=None):
        self.client.force_authenticate(user=user or self.admin)
        extra = {"HTTP_X_CBT_SESSION": token} if token else {}
        with CaptureQueriesContext(connection) as captured:
            response = getattr(self.client, method)(url, data, format="json",
                                                    HTTP_X_TENANT_SLUG=self.school.slug, **extra)
        self.assertEqual(response.status_code, status.HTTP_200_OK, getattr(response, "data", response))
        return len(captured)

    def assert_flat(self, small, large, what):
        self.assertEqual(small, large, f"{what}: {small} queries for the small class, {large} for the large one")

    def test_staff_pages_dont_grow_with_the_class(self):
        small = self.class_sitting(self.levels[1], 3)
        large = self.class_sitting(self.levels[2], 15)

        for what, path in [
            ("invigilation board", "/api/cbt/invigilate/{}/"),
            ("marking overview", "/api/cbt/papers/{}/marking/"),
            ("question analysis", "/api/cbt/papers/{}/analysis/"),
            ("typed answers to mark", "/api/cbt/papers/{}/marking/questions/{}/"),
        ]:
            with self.subTest(what=what):
                def url(paper):
                    text_q = paper.questions.get(section="theory")
                    return path.format(paper.id, text_q.id)
                self.assert_flat(self.queries("get", url(small)), self.queries("get", url(large)), what)

    def test_a_students_exam_list_doesnt_grow_with_their_papers(self):
        level = self.levels[3]
        student = self.sitting_student(grade_level=level)

        def sit(paper):
            attempt = CBTAttempt.start(paper, student)
            engine.submit(attempt)

        def one_more_paper():
            exam = self.make_exam(objective_questions=[objective(1)])
            exam.grade_level = level
            exam.save()
            return self.open_paper(exam)

        sit(one_more_paper())
        one = self.queries("get", MY_EXAMS, user=student.user)
        for _ in range(4):
            sit(one_more_paper())
        five = self.queries("get", MY_EXAMS, user=student.user)

        self.assert_flat(one, five, "exam list")

    def test_saving_and_submitting_dont_grow_with_the_number_of_answers(self):
        exam = self.make_exam(objective_questions=[objective(n) for n in range(1, 21)])
        self.paper = self.open_paper(exam)

        def sitting(count):
            self.as_student(self.sitting_student())
            attempt = self.started()
            answers = [{"question_id": qid, "selected_option": "B"} for qid in attempt.question_ids[:count]]
            saved = self.queries("post", f"{ATTEMPTS}{attempt.id}/answers/", {"answers": answers},
                                 user=attempt.student.user, token=self.token)
            submitted = self.queries("post", f"{ATTEMPTS}{attempt.id}/submit/", {},
                                     user=attempt.student.user, token=self.token)
            return saved, submitted

        few_saved, few_submitted = sitting(2)
        many_saved, many_submitted = sitting(20)

        self.assert_flat(few_saved, many_saved, "saving answers")
        self.assert_flat(few_submitted, many_submitted, "submitting (with marking)")
