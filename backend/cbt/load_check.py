"""
Load check: a whole class sitting one CBT paper at the same time.

It isn't part of the test suite, because it takes minutes; the file name
doesn't start with "test", so discovery skips it. Run it on its own, and give
it a database name of its own so it doesn't disturb the test database the
suite keeps:

    ENV=dev LOCAL_DATABASE_URL=postgres://<user>:<password>@localhost:5433/school_local_load \
        python manage.py test cbt.load_check --noinput

Django creates test_school_local_load, runs the check and drops the database
again. Nothing here connects anywhere else. To check the production database
and pooler, see docs/cbt-pilot-runbook.md.

Every request goes through the whole API stack: middleware, school lookup,
permissions and rate limits. Each worker thread keeps its own database
connection, as a server worker would. Settings:

    CBT_LOAD_STUDENTS   300   students in the class
    CBT_LOAD_WORKERS    50    requests in flight at once
    CBT_LOAD_QUESTIONS  40    objective questions on the paper

1. Arriving. Every student lists their exams and starts. One in five presses
   Start twice at once.
2. Writing. Every student loads the paper and answers it five questions at a
   time. In each batch the first answer is saved as A and then corrected, with
   a check-in in between. Each student then sends three check-ins at once.
   Throughout, an invigilator reloads the board every two seconds.
3. Submitting. Everyone submits. One in five presses Submit twice at once.

Then it checks:
- each student has exactly one attempt, and it is submitted;
- every saved answer is the student's last choice;
- every objective score is right;
- the time on each question adds up across every check-in, including the
  simultaneous ones;
- no request failed.

It prints latency percentiles for each endpoint. All requests share one
Python process, so the timings include waiting on the GIL. They show how the
database copes with the class, and whether that changes between runs. They
are not what one production server would serve; the runbook covers that.
CBT_LOAD_MAX_P95_MS=<ms> fails the check when any endpoint's p95 is over it.
"""

import logging
import os
import queue
import statistics
import threading
import time
from collections import defaultdict
from datetime import date, timedelta

from django.core.cache import cache
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from cbt.models import CBTAnswer, CBTAttempt, CBTPaper
from cbt.tests import CBTTestCase, User, objective
from classroom.models import Class
from students.models import Student

STUDENTS = int(os.environ.get("CBT_LOAD_STUDENTS", 300))
WORKERS = int(os.environ.get("CBT_LOAD_WORKERS", 50))
QUESTIONS = int(os.environ.get("CBT_LOAD_QUESTIONS", 40))
BATCH = 5
SECONDS = 10  # reported on screen per check-in
TOGETHER_TIMEOUT = 120


def final_choice(student_index, position):
    """What a student ends up answering: mostly the right option (B), sometimes C."""
    return "C" if (student_index + position) % 4 == 0 else "B"


class Pool:
    """Worker threads that each keep one database connection until the pool is closed."""

    def __init__(self, size):
        self.tasks = queue.Queue()
        self.errors = []
        self.threads = [threading.Thread(target=self._work, daemon=True) for _ in range(size)]
        for thread in self.threads:
            thread.start()

    def _work(self):
        try:
            while True:
                task = self.tasks.get()
                if task is None:
                    self.tasks.task_done()
                    return
                try:
                    task()
                except Exception as error:  # noqa: BLE001 - reported with the results
                    self.errors.append(repr(error))
                finally:
                    self.tasks.task_done()
        finally:
            connection.close()

    def add(self, task):
        self.tasks.put(task)

    def wait(self):
        self.tasks.join()

    def close(self):
        for _ in self.threads:
            self.tasks.put(None)
        for thread in self.threads:
            thread.join()


class ClassSitsAPaperTogether(TransactionTestCase):
    make_school = CBTTestCase.make_school
    make_exam = CBTTestCase.make_exam

    def setUp(self):
        cache.clear()
        # Per-request debug logging would be most of what gets timed.
        logging.disable(logging.INFO)
        self.addCleanup(logging.disable, logging.NOTSET)
        self.lock = threading.Lock()
        self.timings = defaultdict(list)
        self.failures = []

        self.school = self.make_school("Load Check School", "load-check-school")
        exam = self.make_exam(objective_questions=[objective(n) for n in range(1, QUESTIONS + 1)])
        now = timezone.now()
        self.paper = CBTPaper.objects.create(
            tenant=self.school, exam=exam, opens_at=now - timedelta(minutes=5), closes_at=now + timedelta(hours=3),
            duration_minutes=120, allow_backtracking=True)
        self.paper.publish()

        self.invigilator = User.objects.create_user(
            username="load_invigilator", email="load_invigilator@example.com", role="admin",
            password=None, is_active=True, tenant=self.school)
        student_class = Class.objects.get(tenant=self.school, grade_level=exam.grade_level)
        self.students = []
        for n in range(STUDENTS):
            user = User.objects.create_user(
                username=f"load_{n}", email=f"load_{n}@example.com", role="student",
                password=None, is_active=True, tenant=self.school)
            self.students.append(Student.objects.create(
                user=user, gender="F", date_of_birth=date(2014, 1, 1), student_class=student_class,
                tenant=self.school))

    # ── Requests ────────────────────────────────────────────────────────────

    def call(self, name, user, method, url, data=None, token=None, allowed=(200,)):
        client = APIClient()
        client.force_authenticate(user=user)
        headers = {"HTTP_X_TENANT_SLUG": self.school.slug}
        if token:
            headers["HTTP_X_CBT_SESSION"] = token
        began = time.perf_counter()
        response = getattr(client, method)(url, data, format="json", **headers)
        elapsed = time.perf_counter() - began
        with self.lock:
            self.timings[name].append(elapsed)
            if response.status_code not in allowed:
                self.failures.append((name, response.status_code, getattr(response, "data", None)))
        return response

    def together(self, pool, tasks):
        """Queue tasks that wait for each other, so they reach the server at the same moment."""
        barrier = threading.Barrier(len(tasks), timeout=TOGETHER_TIMEOUT)

        def aligned(task):
            def run():
                barrier.wait()
                task()
            return run

        for task in tasks:
            pool.add(aligned(task))

    def phase(self, title, queue_work):
        pool = Pool(WORKERS)
        before = sum(len(t) for t in self.timings.values())
        began = time.perf_counter()
        try:
            queue_work(pool)
            pool.wait()
        finally:
            pool.close()
        elapsed = time.perf_counter() - began
        requests = sum(len(t) for t in self.timings.values()) - before
        print(f"  {title}: {requests} requests in {elapsed:.1f}s ({requests / elapsed:.0f}/s)")
        self.assertEqual(pool.errors, [], f"{title}: a worker raised")

    # ── The sitting ─────────────────────────────────────────────────────────

    def test_a_class_sits_a_paper_together(self):
        print(f"\nLoad check: {STUDENTS} students, {WORKERS} requests in flight, {QUESTIONS} questions")
        tokens, attempts = {}, {}
        start_url = f"/api/cbt/my/exams/{self.paper.id}/start/"

        def arrive(i, student):
            def list_exams():
                self.call("list exams", student.user, "get", "/api/cbt/my/exams/")

            def start():
                response = self.call("start", student.user, "post", start_url, {})
                if response.status_code == 200:
                    with self.lock:
                        tokens.setdefault(i, []).append(response.data.get("session_token"))
                        attempts[i] = response.data["id"]
            return list_exams, start

        def arriving(pool):
            for i, student in enumerate(self.students):
                list_exams, start = arrive(i, student)
                pool.add(list_exams)
                if i % 5 == 0:
                    self.together(pool, [start, start])
                else:
                    pool.add(start)

        self.phase("arriving", arriving)
        self.assertEqual(self.failures, [], "starting")

        question_ids = dict(CBTAttempt.objects.filter(paper=self.paper).values_list("id", "question_ids"))
        expected_answers, expected_time = {}, {}

        def sit(i, student):
            attempt_id = attempts[i]
            ids = question_ids[attempt_id]
            base = f"/api/cbt/attempts/{attempt_id}/"
            user = student.user

            # A double start leaves one of the two tokens current, and the page
            # that holds the other one is told it was replaced.
            token = None
            for candidate in tokens[i]:
                response = self.call("load paper", user, "get", base, token=candidate, allowed=(200, 409))
                if response.status_code == 200:
                    token = candidate
                    break
            if token is None:
                with self.lock:
                    self.failures.append(("load paper", "no current session", tokens[i]))
                return

            self.call("events", user, "post", f"{base}events/", {"events": [{"kind": "focus_lost"}]}, token=token)
            answers, seconds = {}, defaultdict(int)
            for first in range(0, len(ids), BATCH):
                batch = [{"question_id": qid, "selected_option": final_choice(i, first + n)}
                         for n, qid in enumerate(ids[first:first + BATCH])]
                batch[0]["selected_option"] = "A"
                self.call("save answers", user, "post", f"{base}answers/", {"answers": batch}, token=token)
                self.call("heartbeat", user, "post", f"{base}heartbeat/",
                          {"position": first, "time_spent": {str(ids[first]): SECONDS}}, token=token)
                seconds[str(ids[first])] += SECONDS
                correction = [{"question_id": ids[first], "selected_option": final_choice(i, first)}]
                self.call("save answers", user, "post", f"{base}answers/", {"answers": correction}, token=token)
                answers.update({qid: final_choice(i, position)
                                for position, qid in enumerate(ids) if first <= position < first + BATCH})

            def check_in():
                self.call("heartbeat", user, "post", f"{base}heartbeat/",
                          {"time_spent": {str(ids[1]): SECONDS}}, token=token)
            seconds[str(ids[1])] += 3 * SECONDS

            with self.lock:
                tokens[i] = [token]
                expected_answers[attempt_id] = answers
                expected_time[attempt_id] = dict(seconds)
            return check_in

        stop_board = threading.Event()

        def watch_board():
            try:
                while not stop_board.is_set():
                    self.call("invigilation board", self.invigilator, "get", f"/api/cbt/invigilate/{self.paper.id}/")
                    stop_board.wait(2)
            finally:
                connection.close()

        def writing(pool):
            def student_task(i, student):
                def run():
                    check_in = sit(i, student)
                    if check_in:
                        self.together(pool, [check_in, check_in, check_in])
                return run

            for i, student in enumerate(self.students):
                pool.add(student_task(i, student))

        board = threading.Thread(target=watch_board, daemon=True)
        board.start()
        try:
            self.phase("writing", writing)
        finally:
            stop_board.set()
            board.join()
        self.assertEqual(self.failures, [], "writing")

        def submitting(pool):
            for i, student in enumerate(self.students):
                url = f"/api/cbt/attempts/{attempts[i]}/submit/"

                def submit(user=student.user, url=url, token=tokens[i][0]):
                    self.call("submit", user, "post", url, {}, token=token)
                if i % 5 == 0:
                    self.together(pool, [submit, submit])
                else:
                    pool.add(submit)

        self.phase("submitting", submitting)
        self.report()
        self.assertEqual(self.failures, [], "submitting")
        self.check_what_was_stored(attempts, expected_answers, expected_time)

    # ── Results ─────────────────────────────────────────────────────────────

    def report(self):
        print(f"\n  {'endpoint':<20} {'requests':>8} {'p50 ms':>8} {'p95 ms':>8} {'p99 ms':>8} {'max ms':>8}")
        for name, times in self.timings.items():
            ms = sorted(t * 1000 for t in times)

            def pct(p):
                return ms[min(len(ms) - 1, int(round(p / 100 * (len(ms) - 1))))]
            print(f"  {name:<20} {len(ms):>8} {statistics.median(ms):>8.0f} {pct(95):>8.0f} "
                  f"{pct(99):>8.0f} {ms[-1]:>8.0f}")

        limit = os.environ.get("CBT_LOAD_MAX_P95_MS")
        if limit:
            for name, times in self.timings.items():
                ms = sorted(t * 1000 for t in times)
                p95 = ms[min(len(ms) - 1, int(round(0.95 * (len(ms) - 1))))]
                self.assertLessEqual(p95, float(limit), f"{name}: p95 {p95:.0f}ms is over {limit}ms")

    def check_what_was_stored(self, attempts, expected_answers, expected_time):
        rows = list(CBTAttempt.objects.filter(paper=self.paper).values_list(
            "id", "student_id", "status", "objective_score", "time_on_questions"))
        per_student = defaultdict(int)
        for _, student_id, _, _, _ in rows:
            per_student[student_id] += 1
        self.assertEqual(len(per_student), STUDENTS, "every student has an attempt")
        self.assertEqual(max(per_student.values()), 1, "nobody has a second attempt")
        self.assertEqual({status for _, _, status, _, _ in rows}, {CBTAttempt.Status.SUBMITTED})
        self.assertEqual(set(attempts.values()), {attempt_id for attempt_id, *_ in rows})

        saved = defaultdict(dict)
        for attempt_id, question_id, option in CBTAnswer.objects.filter(attempt__paper=self.paper).values_list(
                "attempt_id", "question_id", "selected_option"):
            saved[attempt_id][question_id] = option

        wrong_answers, wrong_scores, wrong_time = [], [], []
        for attempt_id, _, _, score, time_on in rows:
            expected = expected_answers[attempt_id]
            if saved[attempt_id] != expected:
                wrong_answers.append(attempt_id)
            if score != sum(1 for option in expected.values() if option == "B"):
                wrong_scores.append((attempt_id, score))
            if time_on != expected_time[attempt_id]:
                wrong_time.append((attempt_id, time_on, expected_time[attempt_id]))

        self.assertEqual(wrong_answers, [], "attempts whose saved answers aren't the last ones sent")
        self.assertEqual(wrong_scores, [], "attempts scored wrongly")
        self.assertEqual(wrong_time[:5], [], "attempts that lost a check-in's time")
        print(f"\n  Stored correctly: {STUDENTS} attempts, {sum(len(a) for a in saved.values())} answers.")
