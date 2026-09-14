"""
Invigilating a CBT paper: who may watch it, what the board shows, and the
actions staff take on one student's attempt, each kept in the record.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import status

from cbt import engine
from cbt.models import CBTAnswer, CBTAttempt, CBTEvent, CBTPaper
from cbt.tests import User, objective
from cbt.tests_engine import ATTEMPTS, EngineTest
from classroom.models import GradeLevel
from exam.models import ExamRegistration
from teacher.models import Teacher

BOARD = "/api/cbt/invigilate/"


class InvigilationTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username="invig_admin", email="invig_admin@example.com", role="admin",
            password="x", is_active=True, tenant=self.school)

    def as_staff(self, user):
        self.client.force_authenticate(user=user)
        self.token = None

    def teacher(self, username):
        user = User.objects.create_user(username=username, email=f"{username}@example.com", role="teacher",
                                        password="x", is_active=True, tenant=self.school)
        Teacher.objects.create(user=user, tenant=self.school, employee_id=username[:20])
        return user

    def board(self, paper=None):
        response = self.request("get", f"{BOARD}{(paper or self.paper).id}/", token=None)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def act(self, action, attempt, **data):
        return self.request("post", f"{BOARD}{self.paper.id}/{action}/", {"attempt": attempt.id, **data}, token=None)

    def row(self, board, student):
        return next(r for r in board["students"] if r["student"]["id"] == student.id)


class BoardTest(InvigilationTest):
    def test_the_board_shows_every_student_and_where_each_one_is(self):
        writer = self.student
        attempt = self.started()
        self.save(attempt, [{"question_id": attempt.question_ids[0], "selected_option": "A"},
                            {"question_id": attempt.question_ids[1], "selected_option": ""}])
        self.request("post", f"{ATTEMPTS}{attempt.id}/events/", {"events": [
            {"kind": "focus_lost"}, {"kind": "focus_lost"}, {"kind": "paste_attempted"}]})

        finisher = self.sitting_student()
        self.as_student(finisher)
        done = self.started()
        self.request("post", f"{ATTEMPTS}{done.id}/submit/")
        idle = self.sitting_student()

        other_grade = GradeLevel.objects.filter(tenant=self.school).exclude(pk=self.exam.grade_level_id).first()
        outsider = self.sitting_student(grade_level=other_grade)
        ExamRegistration.objects.create(tenant=self.school, exam=self.exam, student=outsider, extra_time_minutes=15)

        self.as_staff(self.admin)
        board = self.board()

        self.assertEqual(board["summary"], {"students": 4, "not_started": 2, "in_progress": 1, "finished": 1,
                                            "voided": 0, "offline": 0})
        writing = self.row(board, writer)
        self.assertEqual(writing["state"], "in_progress")
        self.assertEqual(writing["attempt"]["answered"], 1)
        self.assertEqual(writing["warnings"], {"focus_lost": 2, "paste_attempted": 1})
        self.assertEqual(self.row(board, finisher)["state"], "submitted")
        self.assertEqual(self.row(board, idle)["state"], "not_started")
        self.assertEqual(self.row(board, outsider)["extra_time_minutes"], 15)
        self.assertEqual([e["label"] for e in board["recent_events"]][:1], ["Submitted"])

    def test_the_board_lists_exactly_the_students_who_see_the_paper(self):
        other_grade = GradeLevel.objects.filter(tenant=self.school).exclude(pk=self.exam.grade_level_id).first()
        candidates = [self.student, self.sitting_student(), self.sitting_student(grade_level=other_grade),
                      self.sitting_student(grade_level=other_grade)]
        ExamRegistration.objects.create(tenant=self.school, exam=self.exam, student=candidates[2])
        ExamRegistration.objects.create(tenant=self.school, exam=self.exam, student=candidates[1], is_registered=False)

        sees_it = {s.id for s in candidates if engine.eligible_papers(s).filter(pk=self.paper.pk).exists()}

        self.as_staff(self.admin)
        self.assertEqual({r["student"]["id"] for r in self.board()["students"]}, sees_it)
        self.assertEqual(sees_it, {candidates[0].id, candidates[2].id})

    def test_a_computer_that_stops_checking_in_shows_as_offline(self):
        attempt = self.started()
        CBTAttempt.objects.filter(pk=attempt.pk).update(last_seen_at=timezone.now() - timedelta(minutes=3))

        self.as_staff(self.admin)
        board = self.board()

        self.assertTrue(self.row(board, self.student)["offline"])
        self.assertEqual(board["summary"]["offline"], 1)

    def test_named_invigilators_and_the_exams_teacher_can_watch_but_other_staff_cannot(self):
        invigilator = self.teacher("named_invig")
        self.exam.invigilators.add(invigilator.teacher)
        owner = self.teacher("exam_owner")
        self.exam.teacher = owner.teacher
        self.exam.save()
        stranger = self.teacher("stranger")

        for user in (invigilator, owner, self.admin):
            with self.subTest(user=user.username):
                self.as_staff(user)
                self.assertEqual(self.board()["paper"]["id"], self.paper.id)
                listed = self.request("get", BOARD, token=None).data["papers"]
                self.assertEqual([p["id"] for p in listed], [self.paper.id])

        self.as_staff(stranger)
        self.assertEqual(self.request("get", f"{BOARD}{self.paper.id}/", token=None).status_code,
                         status.HTTP_404_NOT_FOUND)
        self.as_student(self.student)
        self.assertEqual(self.request("get", f"{BOARD}{self.paper.id}/", token=None).status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_draft_papers_have_no_board(self):
        draft = CBTPaper.objects.create(tenant=self.school, exam=self.make_exam(objective_questions=[objective(1)]))
        self.as_staff(self.admin)

        self.assertEqual(self.request("get", f"{BOARD}{draft.id}/", token=None).status_code, status.HTTP_404_NOT_FOUND)


class ActionsTest(InvigilationTest):
    def setUp(self):
        super().setUp()
        self.attempt = self.started()
        self.student_token = self.token

    def as_the_student(self):
        self.as_student(self.student, token=self.student_token)

    def test_extra_time_moves_the_deadline_and_is_recorded_with_who_gave_it(self):
        before = self.attempt.deadline
        self.as_staff(self.admin)

        response = self.act("extend", self.attempt, minutes=10, reason="Computer froze")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.deadline, before + timedelta(minutes=10))
        event = self.attempt.events.get(kind=CBTEvent.Kind.TIME_EXTENDED)
        self.assertEqual(event.actor, self.admin)
        self.assertEqual((event.detail["minutes"], event.detail["reason"]), (10, "Computer froze"))

        self.as_the_student()
        seconds = self.request("post", f"{ATTEMPTS}{self.attempt.id}/heartbeat/").data["seconds_left"]
        self.assertAlmostEqual(seconds, 40 * 60, delta=10)

    def test_extra_time_needs_a_sensible_number_of_minutes_and_a_student_still_writing(self):
        self.as_staff(self.admin)
        self.assertEqual(self.act("extend", self.attempt, minutes=0).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.act("extend", self.attempt, minutes=999).status_code, status.HTTP_400_BAD_REQUEST)

        self.act("submit", self.attempt)
        refused = self.act("extend", self.attempt, minutes=5)
        self.assertEqual(refused.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("let them back in", refused.data["detail"])

    def test_handing_in_for_a_student_ends_their_attempt(self):
        self.as_staff(self.admin)

        response = self.act("submit", self.attempt, reason="Left the hall")

        self.assertEqual(self.row(response.data, self.student)["state"], "submitted")
        self.assertEqual(self.attempt.events.get(kind=CBTEvent.Kind.SUBMITTED).actor, self.admin)
        self.as_the_student()
        self.assertEqual(self.save(self.attempt, [{"question_id": self.attempt.question_ids[0],
                                                   "selected_option": "A"}]).data["code"], "ended")

    def test_letting_a_student_back_in_needs_a_reason_and_gives_them_the_minutes_set(self):
        self.save(self.attempt, [{"question_id": self.attempt.question_ids[0], "selected_option": "A"}])
        self.request("post", f"{ATTEMPTS}{self.attempt.id}/submit/")
        self.as_staff(self.admin)

        self.assertEqual(self.act("reopen", self.attempt, minutes=10).status_code, status.HTTP_400_BAD_REQUEST)
        response = self.act("reopen", self.attempt, minutes=10, reason="Submitted by mistake")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.status, CBTAttempt.Status.IN_PROGRESS)
        self.assertAlmostEqual((self.attempt.deadline - timezone.now()).total_seconds(), 600, delta=10)
        self.assertEqual(self.attempt.events.get(kind=CBTEvent.Kind.REOPENED).detail["previous_status"], "submitted")

        self.as_the_student()
        self.assertEqual(self.save(self.attempt, [{"question_id": self.attempt.question_ids[1],
                                                   "selected_option": "B"}]).status_code, status.HTTP_200_OK)
        self.assertEqual(CBTAnswer.objects.filter(attempt=self.attempt).count(), 2)

    def test_voiding_lets_the_student_start_again_and_keeps_the_old_attempt(self):
        self.as_staff(self.admin)

        self.assertEqual(self.act("void", self.attempt).status_code, status.HTTP_400_BAD_REQUEST)
        voided = self.act("void", self.attempt, reason="Wrong student logged in")

        self.assertEqual(self.row(voided.data, self.student)["state"], "voided")
        self.as_student(self.student)
        again = self.start()
        self.assertEqual(again.status_code, status.HTTP_200_OK, again.data)
        self.assertEqual(again.data["number"], 2)
        self.assertEqual(CBTAttempt.objects.filter(student=self.student).count(), 2)

    def test_actions_only_reach_attempts_on_this_paper(self):
        other = self.open_paper(self.make_exam(objective_questions=[objective(1)]))
        theirs = CBTAttempt.start(other, self.sitting_student())
        self.as_staff(self.admin)

        response = self.act("submit", theirs)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        theirs.refresh_from_db()
        self.assertEqual(theirs.status, CBTAttempt.Status.IN_PROGRESS)

    def test_one_attempts_full_log_is_available(self):
        self.as_staff(self.admin)
        self.act("extend", self.attempt, minutes=5, reason="Late start")

        events = self.request("get", f"{BOARD}{self.paper.id}/events/?attempt={self.attempt.id}", token=None).data["events"]

        self.assertEqual([e["kind"] for e in events], ["started", "time_extended"])
        self.assertEqual(events[1]["actor"], self.admin.full_name or self.admin.username)
