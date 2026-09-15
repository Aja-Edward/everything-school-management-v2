"""
Every CBT endpoint, called by another school's staff and students: none of
them sees or changes anything of this school's.

Each endpoint also has its own permission tests elsewhere. This sweep exists
so that a new endpoint added without a school check shows up here as a
failure. When you add an endpoint to cbt/urls.py, add it to STAFF_CALLS or
STUDENT_CALLS below.
"""

from datetime import date

from rest_framework import status

from cbt import engine
from cbt.models import CBTAnswer, CBTAnswerKeyChange, CBTAttempt, CBTEvent, CBTPaper, CBTQuestion
from cbt.tests import User, objective
from cbt.tests_engine import EngineTest
from classroom.models import Class, GradeLevel
from students.models import Student

REFUSED = {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND}


def staff_calls(paper, objective_q, text_q, attempt):
    base = f"/api/cbt/papers/{paper.id}/"
    board = f"/api/cbt/invigilate/{paper.id}/"
    body = {"attempt": attempt.id, "minutes": 10, "reason": "Rival"}
    return [
        ("get", base, None),
        ("patch", base, {"access_code": "HIJACK", "closes_at": None}),
        ("delete", base, None),
        ("post", f"{base}check/", {}),
        ("get", f"{base}preview/", None),
        ("post", f"{base}publish/", {}),
        ("post", f"{base}unpublish/", {}),
        ("get", f"{base}bank/", None),
        ("post", f"{base}draw/", {"question_type": "objective", "count": 1}),
        ("get", f"{base}marking/", None),
        ("get", f"{base}marking/questions/{text_q.id}/", None),
        ("post", f"{base}marking/marks/", {"marks": [{"attempt": attempt.id, "question": text_q.id, "marks": 10}]}),
        ("post", f"{base}questions/{objective_q.id}/answer-key/", {"award_all": True, "reason": "Rival"}),
        ("get", f"{base}results/targets/", None),
        ("post", f"{base}results/push/", {}),
        ("post", f"{base}results/release/", {}),
        ("post", f"{base}results/withhold/", {}),
        ("get", f"{base}analysis/", None),
        ("post", f"{base}analysis/apply-difficulty/", {"questions": [objective_q.id]}),
        ("get", board, None),
        ("get", f"{board}events/?attempt={attempt.id}", None),
        ("post", f"{board}extend/", body),
        ("post", f"{board}submit/", body),
        ("post", f"{board}reopen/", body),
        ("post", f"{board}void/", body),
    ]


def student_calls(paper, attempt):
    base = f"/api/cbt/attempts/{attempt.id}/"
    return [
        ("post", f"/api/cbt/my/exams/{paper.id}/start/", {}),
        ("get", base, None),
        ("post", f"{base}answers/", {"answers": [{"question_id": attempt.question_ids[0], "selected_option": "A"}]}),
        ("post", f"{base}heartbeat/", {"position": 1, "time_spent": {str(attempt.question_ids[0]): 30}}),
        ("post", f"{base}events/", {"events": [{"kind": "focus_lost"}]}),
        ("post", f"{base}submit/", {}),
    ]


class OtherSchoolsSeeNothingTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.exam = self.make_exam(
            objective_questions=[objective(1), objective(2)],
            theory_questions=[{"question": "Explain.", "marks": 5}])
        self.paper = self.open_paper(self.exam, include_theory=True, shuffle_questions=False, access_code="HOME")
        self.objective_q = self.paper.questions.get(order=1)
        self.text_q = self.paper.questions.get(section="theory")

        self.as_student(self.student)
        self.attempt = self.started(access_code="HOME")
        self.save(self.attempt, [{"question_id": self.objective_q.id, "selected_option": "B"},
                                 {"question_id": self.text_q.id, "text_answer": "My answer."}])
        # A second student has finished, so marking and release have something to act on.
        self.finished = CBTAttempt.start(self.paper, self.sitting_student())
        CBTAnswer.objects.create(tenant=self.school, attempt=self.finished, question=self.text_q, text_answer="Done.")
        engine.submit(self.finished)

        self.rival = self.make_school("Rival CBT School", "rival-cbt-school")
        self.rival_admin = User.objects.create_user(
            username="rival_admin", email="rival_admin@example.com", role="superadmin", password="x",
            is_active=True, tenant=self.rival, is_staff=False)
        rival_level = GradeLevel.objects.filter(tenant=self.rival, education_level__code="primary").first()
        rival_user = User.objects.create_user(
            username="rival_student", email="rival_student@example.com", role="student", password="x",
            is_active=True, tenant=self.rival)
        self.rival_student = Student.objects.create(
            user=rival_user, gender="F", date_of_birth=date(2015, 1, 1), tenant=self.rival,
            student_class=Class.objects.get(tenant=self.rival, grade_level=rival_level))

    def snapshot(self):
        paper = CBTPaper.objects.get(pk=self.paper.pk)
        return {
            "paper": (paper.status, paper.access_code, paper.closes_at, paper.results_released_at,
                      paper.results_pushed_at),
            "questions": list(CBTQuestion.objects.filter(paper=self.paper).values_list("id", "correct_option", "award_all")),
            "attempts": list(CBTAttempt.objects.filter(paper=self.paper).order_by("id").values_list(
                "id", "status", "deadline", "furthest_position", "time_on_questions", "session_token_hash")),
            "answers": list(CBTAnswer.objects.filter(attempt__paper=self.paper).order_by("id").values_list(
                "id", "selected_option", "text_answer", "marks_awarded")),
            "events": CBTEvent.objects.filter(attempt__paper=self.paper).count(),
            "key_changes": CBTAnswerKeyChange.objects.count(),
        }

    def call(self, user, slug, method, url, data):
        self.client.force_authenticate(user=user)
        return getattr(self.client, method)(url, data, format="json", HTTP_X_TENANT_SLUG=slug)

    def assert_refused_everywhere(self, user, calls, *, token=None):
        before = self.snapshot()
        for slug in (self.rival.slug, self.school.slug):
            for method, url, data in calls:
                with self.subTest(user=user.username, school=slug, method=method, url=url):
                    extra = {"HTTP_X_CBT_SESSION": token} if token else {}
                    self.client.force_authenticate(user=user)
                    response = getattr(self.client, method)(url, data, format="json", HTTP_X_TENANT_SLUG=slug, **extra)
                    self.assertIn(response.status_code, REFUSED, getattr(response, "data", response))
                    self.assertNotIn(b"My answer.", response.content)
        self.assertEqual(self.snapshot(), before)

    def test_another_schools_admin_is_refused_on_every_staff_endpoint(self):
        self.assert_refused_everywhere(
            self.rival_admin, staff_calls(self.paper, self.objective_q, self.text_q, self.attempt))

    def test_another_schools_admin_lists_none_of_this_schools_papers(self):
        for slug in (self.rival.slug, self.school.slug):
            with self.subTest(school=slug):
                papers = self.call(self.rival_admin, slug, "get", "/api/cbt/papers/", None)
                invigilate = self.call(self.rival_admin, slug, "get", "/api/cbt/invigilate/", None)
                self.assertIn(papers.status_code, REFUSED | {status.HTTP_200_OK})
                if papers.status_code == status.HTTP_200_OK:
                    self.assertEqual(papers.data, [])
                if invigilate.status_code == status.HTTP_200_OK:
                    self.assertEqual(invigilate.data["papers"], [])

    def test_another_schools_student_is_refused_on_every_student_endpoint_even_with_the_session_token(self):
        # The token leaking along with the attempt id is the worst case.
        self.assert_refused_everywhere(
            self.rival_student.user, student_calls(self.paper, self.attempt), token=self.token)

    def test_another_schools_student_sees_none_of_this_schools_exams(self):
        for slug in (self.rival.slug, self.school.slug):
            with self.subTest(school=slug):
                response = self.call(self.rival_student.user, slug, "get", "/api/cbt/my/exams/", None)
                if response.status_code == status.HTTP_200_OK:
                    self.assertNotIn(self.paper.id, [e["paper"] for e in response.data["exams"]])
                else:
                    self.assertIn(response.status_code, REFUSED)

    def test_this_schools_students_are_refused_on_every_staff_endpoint(self):
        self.assert_refused_everywhere(
            self.student.user, staff_calls(self.paper, self.objective_q, self.text_q, self.attempt))
