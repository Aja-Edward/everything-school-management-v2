"""
A CBT paper keeps its own window, copied from its exam when the paper is made,
and students' exam lists go by that window. A school moved an exam from a
past day to today and republished, but the paper still closed on the old day,
so students kept seeing it as missed.
"""

from datetime import datetime, time, timedelta

from django.utils import timezone

from cbt.models import CBTAttempt, CBTPaper
from cbt.tests import User
from cbt.tests_engine import MY_EXAMS, EngineTest

EXAMS = "/api/exams/exams/"
PAPERS = "/api/cbt/papers/"


class PaperWindowFollowsTheExamTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(username="window_admin", email="window_admin@example.com",
                                              role="admin", password=None, is_active=True, tenant=self.school)
        # The paper as it is made from the exam: its window is the exam's day and times.
        made = CBTPaper.for_exam(self.exam)
        CBTPaper.objects.filter(pk=self.paper.pk).update(
            opens_at=made.opens_at, closes_at=made.closes_at, duration_minutes=made.duration_minutes)
        self.paper.refresh_from_db()

    def as_staff(self):
        self.client.force_authenticate(user=self.admin)
        self.token = None

    def move_exam(self, day, start, end):
        self.as_staff()
        response = self.request("patch", f"{EXAMS}{self.exam.id}/", {
            "exam_date": str(day), "start_time": start.strftime("%H:%M"), "end_time": end.strftime("%H:%M")},
            token=None)
        self.assertEqual(response.status_code, 200, response.data)
        self.paper.refresh_from_db()

    def at(self, day, time_of_day):
        return timezone.make_aware(datetime.combine(day, time_of_day))

    def state_for_student(self):
        self.as_student(self.student)
        exams = self.request("get", MY_EXAMS).data["exams"]
        return next(e for e in exams if e["paper"] == self.paper.id)["state"]

    def test_moving_the_exam_moves_its_paper(self):
        tomorrow = timezone.localdate() + timedelta(days=1)

        self.move_exam(tomorrow, time(9), time(10, 30))

        self.assertEqual((self.paper.opens_at, self.paper.closes_at),
                         (self.at(tomorrow, time(9)), self.at(tomorrow, time(10, 30))))
        self.assertEqual(self.state_for_student(), "upcoming")

    def test_a_window_set_on_the_cbt_screen_stays(self):
        chosen = (self.now + timedelta(days=3), self.now + timedelta(days=3, hours=1))
        CBTPaper.objects.filter(pk=self.paper.pk).update(opens_at=chosen[0], closes_at=chosen[1])

        self.move_exam(timezone.localdate() + timedelta(days=1), time(9), time(10, 30))

        self.assertEqual((self.paper.opens_at, self.paper.closes_at), chosen)

    def test_a_paper_students_have_started_stays(self):
        CBTAttempt.start(self.paper, self.student, now=self.paper.opens_at)
        before = (self.paper.opens_at, self.paper.closes_at)

        self.move_exam(timezone.localdate() + timedelta(days=1), time(9), time(10, 30))

        self.assertEqual((self.paper.opens_at, self.paper.closes_at), before)

    def test_a_paper_that_has_already_closed_is_not_published(self):
        """A school set 02:47-02:59 meaning the afternoon; published at 2:45 PM, it was already over."""
        early = self.now - timedelta(hours=12)
        CBTPaper.objects.filter(pk=self.paper.pk).update(opens_at=early, closes_at=early + timedelta(minutes=12))
        # The exam's own day is past too, so there is no later day to take from it.
        self.exam.exam_date = timezone.localdate() - timedelta(days=2)
        self.exam.save(update_fields=["exam_date"])

        self.as_staff()
        response = self.request("post", f"{PAPERS}{self.paper.id}/publish/", token=None)

        self.assertEqual(response.status_code, 400)
        self.assertIn("already passed", response.data["problems"][0])
        self.assertIn("AM and PM", response.data["problems"][0])

    def test_republishing_a_paper_whose_day_has_passed_takes_the_exams_new_day(self):
        """The school's case: the exam was moved, the paper kept the old day."""
        yesterday = self.now - timedelta(days=1)
        CBTPaper.objects.filter(pk=self.paper.pk).update(
            opens_at=yesterday, closes_at=yesterday + timedelta(hours=1))
        self.assertEqual(self.state_for_student(), "missed")
        # Moved before this fix, so the paper didn't follow.
        tomorrow = timezone.localdate() + timedelta(days=1)
        self.exam.exam_date, self.exam.start_time, self.exam.end_time = tomorrow, time(9), time(10)
        self.exam.save()

        self.as_staff()
        response = self.request("post", f"{PAPERS}{self.paper.id}/publish/", token=None)

        self.assertEqual(response.status_code, 200, response.data)
        self.paper.refresh_from_db()
        self.assertEqual((self.paper.opens_at, self.paper.closes_at),
                         (self.at(tomorrow, time(9)), self.at(tomorrow, time(10))))
        self.assertEqual(self.state_for_student(), "upcoming")
