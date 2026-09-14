"""
A student sitting a CBT paper through the API: which papers they see, starting
and resuming on one device at a time, saving answers against the server's
clock, and ending the attempt.
"""

from datetime import date, timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from cbt import engine
from cbt.models import CBTAnswer, CBTAttempt, CBTEvent, CBTPaper
from cbt.tests import CBTTestCase, User, objective
from classroom.models import Class, GradeLevel, Section
from exam.models import ExamRegistration, ExamStatus
from students.models import Student

MY_EXAMS = "/api/cbt/my/exams/"
ATTEMPTS = "/api/cbt/attempts/"


class EngineTest(CBTTestCase):
    client_class = APIClient

    def setUp(self):
        super().setUp()
        cache.clear()  # Rate-limit counters live in the cache.
        self.now = timezone.now()
        self.exam = self.make_exam(objective_questions=[objective(n) for n in range(1, 5)])
        self.paper = self.open_paper(self.exam)
        self.student = self.sitting_student()
        self.as_student(self.student)

    def open_paper(self, exam, **settings):
        paper = CBTPaper.objects.create(
            tenant=exam.tenant, exam=exam, opens_at=self.now - timedelta(minutes=10),
            closes_at=self.now + timedelta(hours=2), duration_minutes=30, **settings)
        paper.publish()
        return paper

    def sitting_student(self, grade_level=None, **fields):
        """A student in the class that goes with the exam's grade level."""
        grade_level = grade_level or self.exam.grade_level
        student_class = Class.objects.get(tenant=self.school, grade_level=grade_level)
        n = User.objects.count()
        user = User.objects.create_user(
            username=f"sitter_{n}", email=f"sitter_{n}@example.com", role="student",
            password="testpass123", is_active=True, tenant=self.school)
        return Student.objects.create(user=user, gender="M", date_of_birth=date(2015, 5, 5),
                                      student_class=student_class, tenant=self.school, **fields)

    def as_student(self, student, token=None):
        self.client.force_authenticate(user=student.user)
        self.token = token

    def request(self, method, url, data=None, token="__current__"):
        token = self.token if token == "__current__" else token
        headers = {"HTTP_X_TENANT_SLUG": self.school.slug}
        if token:
            headers["HTTP_X_CBT_SESSION"] = token
        return getattr(self.client, method)(url, data, format="json", **headers)

    def start(self, paper=None, **data):
        response = self.request("post", f"{MY_EXAMS}{(paper or self.paper).id}/start/", data)
        if response.status_code == 200 and response.data.get("session_token"):
            self.token = response.data["session_token"]
        return response

    def started(self, **data):
        response = self.start(**data)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return CBTAttempt.objects.get(pk=response.data["id"])

    def save(self, attempt, answers, **kwargs):
        return self.request("post", f"{ATTEMPTS}{attempt.id}/answers/", {"answers": answers}, **kwargs)

    def expire(self, attempt, seconds_ago):
        CBTAttempt.objects.filter(pk=attempt.pk).update(
            deadline=timezone.now() - timedelta(seconds=seconds_ago))


class MyExamsTest(EngineTest):
    def states(self):
        response = self.request("get", MY_EXAMS)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return {item["paper"]: item["state"] for item in response.data["exams"]}

    def test_a_student_sees_the_papers_for_their_class_and_where_they_are_with_each(self):
        later = self.make_exam(objective_questions=[objective(1)])
        upcoming = self.open_paper(later)
        CBTPaper.objects.filter(pk=upcoming.pk).update(opens_at=self.now + timedelta(days=1),
                                                       closes_at=self.now + timedelta(days=1, hours=2))
        draft = CBTPaper.objects.create(tenant=self.school, exam=self.make_exam(objective_questions=[objective(1)]))

        self.assertEqual(self.states(), {self.paper.id: "open", upcoming.id: "upcoming"})
        self.assertNotIn(draft.id, self.states())

        self.started()
        self.assertEqual(self.states()[self.paper.id], "in_progress")

    def test_other_classes_sections_and_cancelled_exams_are_left_out(self):
        other_grade = GradeLevel.objects.filter(tenant=self.school).exclude(pk=self.exam.grade_level_id).first()
        other_class_exam = self.make_exam(objective_questions=[objective(1)])
        other_class_exam.grade_level = other_grade
        other_class_exam.save()
        other_class = self.open_paper(other_class_exam)

        section_exam = self.make_exam(objective_questions=[objective(1)])
        section_exam.section = Section.objects.create(
            tenant=self.school, class_grade=self.student.student_class, name="Gold")
        section_exam.save()
        other_section = self.open_paper(section_exam)

        cancelled_exam = self.make_exam(objective_questions=[objective(1)])
        cancelled = self.open_paper(cancelled_exam)
        cancelled_exam.status = ExamStatus.objects.get(tenant=self.school, code="cancelled")
        cancelled_exam.save()

        states = self.states()
        for paper in (other_class, other_section, cancelled):
            self.assertNotIn(paper.id, states)

    def test_registration_brings_in_a_student_from_another_class_and_can_keep_one_out(self):
        other_grade = GradeLevel.objects.filter(tenant=self.school).exclude(pk=self.exam.grade_level_id).first()
        outsider = self.sitting_student(grade_level=other_grade)
        ExamRegistration.objects.create(tenant=self.school, exam=self.exam, student=outsider)
        ExamRegistration.objects.create(tenant=self.school, exam=self.exam, student=self.student,
                                        is_registered=False)

        self.assertEqual(self.states(), {})
        self.as_student(outsider)
        self.assertEqual(self.states(), {self.paper.id: "open"})

    def test_teachers_are_refused(self):
        teacher = User.objects.create_user(username="engine_teacher", email="engine_teacher@example.com",
                                           role="teacher", password="x", is_active=True, tenant=self.school)
        self.client.force_authenticate(user=teacher)

        self.assertEqual(self.request("get", MY_EXAMS).status_code, status.HTTP_403_FORBIDDEN)


class StartAndDeviceTest(EngineTest):
    def test_starting_returns_the_clock_and_a_session(self):
        response = self.start()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "in_progress")
        self.assertTrue(response.data["session_token"])
        self.assertAlmostEqual(response.data["seconds_left"], 30 * 60, delta=5)
        attempt = CBTAttempt.objects.get(pk=response.data["id"])
        self.assertNotEqual(attempt.session_token_hash, response.data["session_token"])

    def test_resuming_on_the_same_device_keeps_the_session(self):
        attempt = self.started()

        again = self.start()

        self.assertEqual(again.data["id"], attempt.id)
        self.assertNotIn("session_token", again.data)
        self.assertEqual(self.save(attempt, [{"question_id": attempt.question_ids[0], "selected_option": "A"}])
                         .status_code, status.HTTP_200_OK)

    def test_opening_on_another_device_takes_over_and_locks_the_first_one_out(self):
        attempt = self.started()
        first_device = self.token

        takeover = self.request("post", f"{MY_EXAMS}{self.paper.id}/start/", {}, token=None)
        self.assertEqual(takeover.status_code, status.HTTP_200_OK)
        second_device = takeover.data["session_token"]
        self.assertNotEqual(second_device, first_device)

        locked_out = self.save(attempt, [{"question_id": attempt.question_ids[0], "selected_option": "A"}],
                               token=first_device)
        self.assertEqual(locked_out.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(locked_out.data["code"], "session_replaced")
        self.assertEqual(self.save(attempt, [{"question_id": attempt.question_ids[0], "selected_option": "A"}],
                                   token=second_device).status_code, status.HTTP_200_OK)
        self.assertTrue(attempt.events.filter(kind__in=[CBTEvent.Kind.RESUMED, CBTEvent.Kind.DEVICE_CHANGED]).exists())

    def test_an_access_code_is_needed_to_start_and_to_move_devices(self):
        CBTPaper.objects.filter(pk=self.paper.pk).update(access_code="LAB42")

        missing = self.start()
        self.assertEqual(missing.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(missing.data["code"], "access_code")
        self.assertEqual(self.start(access_code="wrong").data["detail"], "That access code isn't right.")

        self.started(access_code=" lab42 ")
        takeover = self.request("post", f"{MY_EXAMS}{self.paper.id}/start/", {}, token=None)
        self.assertEqual(takeover.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.request("post", f"{MY_EXAMS}{self.paper.id}/start/", {"access_code": "LAB42"},
                                      token=None).status_code, status.HTTP_200_OK)

    def test_a_student_not_entered_for_the_exam_cannot_start_it(self):
        other_grade = GradeLevel.objects.filter(tenant=self.school).exclude(pk=self.exam.grade_level_id).first()
        self.as_student(self.sitting_student(grade_level=other_grade))

        response = self.start()

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(CBTAttempt.objects.exists())

    def test_another_student_cannot_open_my_attempt(self):
        attempt = self.started()
        self.as_student(self.sitting_student(), token=self.token)

        self.assertEqual(self.request("get", f"{ATTEMPTS}{attempt.id}/").status_code, status.HTTP_404_NOT_FOUND)


class SittingTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.attempt = self.started()
        self.q = self.attempt.question_ids

    def test_the_paper_comes_in_my_order_with_my_saved_answers_and_no_answer_key(self):
        self.save(self.attempt, [{"question_id": self.q[1], "selected_option": "C", "flagged": True}])

        response = self.request("get", f"{ATTEMPTS}{self.attempt.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        questions = response.data["paper"]["questions"]
        self.assertEqual([q["id"] for q in questions], self.q)
        self.assertEqual([o["key"] for o in questions[0]["options"]], self.attempt.option_order[str(self.q[0])])
        self.assertEqual(response.data["answers"],
                         [{"question_id": self.q[1], "selected_option": "C", "text_answer": "", "flagged": True}])
        self.assertNotIn("correct", response.content.decode())

    def test_saving_again_replaces_the_answer_and_the_last_copy_in_a_batch_wins(self):
        self.save(self.attempt, [{"question_id": self.q[0], "selected_option": "A"}])

        response = self.save(self.attempt, [{"question_id": self.q[0], "selected_option": "b"},
                                            {"question_id": self.q[0], "selected_option": "D"}])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["saved"], 1)
        self.assertEqual(list(CBTAnswer.objects.values_list("selected_option", flat=True)), ["D"])

    def test_one_bad_answer_refuses_the_whole_batch(self):
        for bad, message in [
            ({"question_id": 999999, "selected_option": "A"}, "not on your paper"),
            ({"question_id": self.q[1], "selected_option": "Z"}, "not one of the question's options"),
            ({"question_id": self.q[1], "text_answer": "four"}, "answered by choosing an option"),
        ]:
            with self.subTest(bad=bad):
                response = self.save(self.attempt, [{"question_id": self.q[0], "selected_option": "A"}, bad])
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(message, response.data["detail"])
        self.assertFalse(CBTAnswer.objects.exists())

    def test_saves_are_accepted_for_a_moment_after_the_deadline_then_the_attempt_ends(self):
        self.expire(self.attempt, seconds_ago=10)
        in_grace = self.save(self.attempt, [{"question_id": self.q[0], "selected_option": "A"}])
        self.assertEqual(in_grace.status_code, status.HTTP_200_OK, in_grace.data)

        self.expire(self.attempt, seconds_ago=engine.GRACE.total_seconds() + 5)
        too_late = self.save(self.attempt, [{"question_id": self.q[0], "selected_option": "B"}])

        self.assertEqual(too_late.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(too_late.data["code"], "ended")
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.status, CBTAttempt.Status.TIMED_OUT)
        self.assertEqual(self.attempt.submitted_at, self.attempt.deadline)
        self.assertEqual(list(CBTAnswer.objects.values_list("selected_option", flat=True)), ["A"])

    def test_submitting_ends_the_attempt_and_the_paper_is_not_sent_again(self):
        response = self.request("post", f"{ATTEMPTS}{self.attempt.id}/submit/")

        self.assertEqual(response.data["status"], "submitted")
        self.assertEqual(self.request("post", f"{ATTEMPTS}{self.attempt.id}/submit/").data["status"], "submitted")
        self.assertEqual(self.save(self.attempt, [{"question_id": self.q[0], "selected_option": "A"}]).data["code"],
                         "ended")
        after = self.request("get", f"{ATTEMPTS}{self.attempt.id}/").data
        self.assertEqual(after["attempt"]["status"], "submitted")
        self.assertNotIn("paper", after)
        self.assertEqual(self.request("get", MY_EXAMS).data["exams"][0]["state"], "done")

    def test_without_backtracking_an_earlier_question_cannot_be_changed(self):
        CBTPaper.objects.filter(pk=self.paper.pk).update(allow_backtracking=False)

        self.assertEqual(self.save(self.attempt, [{"question_id": self.q[2], "selected_option": "A"}])
                         .status_code, status.HTTP_200_OK)
        back = self.save(self.attempt, [{"question_id": self.q[1], "selected_option": "A"}])
        self.assertEqual(back.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(back.data["code"], "no_backtracking")

        moved = self.request("post", f"{ATTEMPTS}{self.attempt.id}/heartbeat/", {"position": 3})
        self.assertEqual(moved.data["furthest_position"], 3)
        self.assertEqual(self.save(self.attempt, [{"question_id": self.q[2], "selected_option": "B"}])
                         .status_code, status.HTTP_409_CONFLICT)

    def test_the_browser_can_report_what_it_noticed_but_not_server_events(self):
        response = self.request("post", f"{ATTEMPTS}{self.attempt.id}/events/", {"events": [
            {"kind": "focus_lost", "client_time": timezone.now().isoformat(), "detail": {"away_seconds": 4}},
            {"kind": "submitted"},
            {"kind": "made_up"},
        ]})

        self.assertEqual(response.data["recorded"], 1)
        self.assertEqual(list(self.attempt.events.values_list("kind", flat=True)), ["started", "focus_lost"])

    def test_the_sweep_ends_only_attempts_whose_time_is_up(self):
        waiting = CBTAttempt.start(self.open_paper(self.make_exam(objective_questions=[objective(1)])),
                                   self.student)
        self.expire(self.attempt, seconds_ago=engine.GRACE.total_seconds() + 60)

        self.assertEqual(engine.close_expired_attempts(), 1)

        self.attempt.refresh_from_db()
        waiting.refresh_from_db()
        self.assertEqual(self.attempt.status, CBTAttempt.Status.TIMED_OUT)
        self.assertEqual(waiting.status, CBTAttempt.Status.IN_PROGRESS)
        self.assertEqual(self.attempt.events.last().kind, CBTEvent.Kind.TIMED_OUT)
