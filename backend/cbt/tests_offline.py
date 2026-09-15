"""
Offline CBT on a school's exam station: making a package with PIN slips,
loading it onto the station, students sitting the paper there, and the
results coming back to the cloud to be marked.

The station is another computer with its own database. The tests run both
sides in one database, so everything done as the station happens inside a
savepoint that is rolled back afterwards, with the cloud's school and packages
hidden from it while it runs. Only files pass between the two, as JSON text,
the way staff carry them on a flash drive.
"""

import json
from contextlib import contextmanager
from datetime import timedelta

from django.contrib.auth.hashers import check_password
from django.db import transaction
from rest_framework import status

from cbt import offline
from cbt.models import CBTAnswer, CBTAttempt, CBTEvent, CBTOfflinePackage, CBTPaper, CBTQuestion
from cbt.tests import User, objective
from cbt.tests_engine import ATTEMPTS, MY_EXAMS, EngineTest
from classroom.models import GradeLevel
from tenants.models import Tenant

PAPERS = "/api/cbt/papers/"
STATION = "/api/cbt/station/"
KEY = "the-station-key-for-tests"


def as_a_browser_writes_it(value):
    """JSON.parse then JSON.stringify: a whole-number float loses its point."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: as_a_browser_writes_it(v) for k, v in value.items()}
    if isinstance(value, list):
        return [as_a_browser_writes_it(v) for v in value]
    return value


class OfflineTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.exam = self.make_exam(
            objective_questions=[objective(n) for n in range(1, 4)],
            theory_questions=[{"question": "Explain your working.", "marks": 5,
                               "expectedPoints": "Mentions carrying."}])
        self.paper = self.open_paper(self.exam, include_theory=True)
        self.second = self.sitting_student()
        # Slips are found by name below, so the two need different ones.
        for student, (first, last) in ((self.student, ("Ada", "Obi")), (self.second, ("Bayo", "Adeyemi"))):
            User.objects.filter(pk=student.user_id).update(first_name=first, last_name=last)
            student.user.refresh_from_db()
        self.admin = User.objects.create_user(
            username="offline_admin", email="offline_admin@example.com", role="admin", password="x",
            is_active=True, tenant=self.school)

    # ── The cloud ────────────────────────────────────────────────────────────

    def as_staff(self, method, url, data=None, **extra):
        self.client.force_authenticate(user=self.admin)
        return getattr(self.client, method)(url, data, format="json", HTTP_X_TENANT_SLUG=self.school.slug, **extra)

    def make_package(self, paper=None):
        """The package file's text and the PIN slips."""
        paper = paper or self.paper
        made = self.as_staff("post", f"{PAPERS}{paper.id}/offline/packages/")
        self.assertEqual(made.status_code, status.HTTP_201_CREATED, made.data)
        file = self.as_staff("get", f"{PAPERS}{paper.id}/offline/packages/{made.data['package']['id']}/")
        self.assertEqual(file.status_code, status.HTTP_200_OK)
        self.assertIn("attachment", file["Content-Disposition"])
        return file.content.decode(), made.data["slips"]

    def upload(self, results, paper=None):
        self.client.force_authenticate(user=self.admin)
        text = results if isinstance(results, str) else json.dumps(results)
        return self.client.post(f"{PAPERS}{(paper or self.paper).id}/offline/results/", text,
                                content_type="application/json", HTTP_X_TENANT_SLUG=self.school.slug)

    # ── The station ──────────────────────────────────────────────────────────

    @contextmanager
    def station(self):
        """Act as the exam station. Nothing it writes outlasts the block."""
        self.client.force_authenticate(user=None)
        saved = transaction.savepoint()
        try:
            Tenant.objects.filter(pk=self.school.pk).update(slug="the-cloud-copy")
            CBTOfflinePackage.objects.all().delete()
            with self.settings(CBT_STATION=True, CBT_STATION_KEY=KEY,
                               RATELIMIT_IP_META_KEY="cbt.station_views.client_address"):
                yield
        finally:
            transaction.savepoint_rollback(saved)
            self.client.cookies.clear()

    def load(self, package_text, key=KEY):
        return self.client.post(f"{STATION}packages/", package_text, content_type="application/json",
                                HTTP_X_STATION_KEY=key)

    def sign_in(self, package_text, slip, pin=None):
        package = json.loads(package_text)
        return self.client.post(f"{STATION}sign-in/", {
            "package": package["package_id"], "number": slip["number"], "pin": pin or slip["pin"]}, format="json")

    def sit(self, package_text, slip, answer="B", submit=True):
        """Sign in with a slip, answer every question, and hand in. Returns the station's attempt."""
        signed_in = self.sign_in(package_text, slip)
        self.assertEqual(signed_in.status_code, status.HTTP_200_OK, signed_in.data)
        headers = {"HTTP_X_TENANT_SLUG": signed_in.data["tenant_slug"]}

        started = self.client.post(f"{MY_EXAMS}{signed_in.data['paper']}/start/", {}, format="json", **headers)
        self.assertEqual(started.status_code, status.HTTP_200_OK, started.data)
        attempt = started.data["id"]
        headers["HTTP_X_CBT_SESSION"] = started.data["session_token"]
        paper = self.client.get(f"{ATTEMPTS}{attempt}/", **headers).data["paper"]

        answers = [{"question_id": q["id"], "selected_option": answer} if q["kind"] == "objective"
                   else {"question_id": q["id"], "text_answer": "I carried the one."}
                   for q in paper["questions"]]
        saved = self.client.post(f"{ATTEMPTS}{attempt}/answers/", {"answers": answers}, format="json", **headers)
        self.assertEqual(saved.status_code, status.HTTP_200_OK, saved.data)
        self.client.post(f"{ATTEMPTS}{attempt}/events/", {"events": [
            {"kind": "focus_lost", "detail": {"seconds_away": 5.0}}]}, format="json", **headers)
        if submit:
            self.assertEqual(self.client.post(f"{ATTEMPTS}{attempt}/submit/", {}, format="json", **headers)
                             .status_code, status.HTTP_200_OK)
        self.client.post(f"{STATION}sign-out/")
        return CBTAttempt.objects.get(pk=attempt)

    def results(self, package_text):
        package = json.loads(package_text)
        response = self.client.get(f"{STATION}packages/{package['package_id']}/results/", HTTP_X_STATION_KEY=KEY)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.content.decode()

    def slip_for(self, slips, student):
        return next(s for s in slips if s["name"] == student.full_name)

    def sat_offline(self, *students, **sitting):
        """Package the paper, sit it on the station as each student, and bring back the results file."""
        package, slips = self.make_package()
        with self.station():
            self.assertEqual(self.load(package).status_code, status.HTTP_201_CREATED)
            for student in students:
                self.sit(package, self.slip_for(slips, student), **sitting)
            return self.results(package)


class PackageTest(OfflineTest):
    def test_a_package_has_the_paper_without_its_answers_and_a_pin_for_each_student(self):
        text, slips = self.make_package()

        package = json.loads(text)
        self.assertEqual({s["name"] for s in slips}, {self.student.full_name, self.second.full_name})
        pins = [s["pin"] for s in slips]
        self.assertTrue(all(len(pin) == 6 and pin.isdigit() for pin in pins))
        self.assertEqual(len(set(pins)), len(pins))
        for slip in slips:
            entry = next(e for e in package["students"] if e["number"] == slip["number"])
            self.assertTrue(check_password(slip["pin"], entry["pin_hash"]))
            self.assertNotIn(slip["pin"], json.dumps(entry))

        self.assertEqual(len(package["questions"]), 4)
        for word in ("correct", "numeric_answer", "tolerance", "marking_guide", "expectedPoints",
                     "Mentions carrying", "award_all", "partial_credit"):
            self.assertNotIn(word, text)

    def test_only_a_published_paper_with_students_to_sit_it_can_be_packaged(self):
        draft = CBTPaper.objects.create(tenant=self.school, exam=self.make_exam(objective_questions=[objective(1)]))
        response = self.as_staff("post", f"{PAPERS}{draft.id}/offline/packages/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Publish the paper before taking it offline.")

        empty_exam = self.make_exam(objective_questions=[objective(1)])
        empty_exam.grade_level = GradeLevel.objects.filter(tenant=self.school).exclude(pk=self.exam.grade_level_id).first()
        empty_exam.save()
        response = self.as_staff("post", f"{PAPERS}{self.open_paper(empty_exam).id}/offline/packages/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No students may sit this paper", response.data["detail"])

        # A closed paper can still go to a station, for a sitting that has to be moved.
        CBTPaper.objects.filter(pk=self.paper.pk).update(status=CBTPaper.Status.CLOSED)
        self.assertEqual(self.as_staff("post", f"{PAPERS}{self.paper.id}/offline/packages/").status_code,
                         status.HTTP_201_CREATED)

    def test_packages_are_listed_with_what_came_back(self):
        self.make_package()
        self.make_package()

        listed = self.as_staff("get", f"{PAPERS}{self.paper.id}/offline/packages/").data["packages"]

        self.assertEqual([(p["students"], p["questions"], p["attempts_imported"]) for p in listed], [(2, 4, 0)] * 2)
        # The paper says so too, so staff are warned before publishing it again.
        self.assertEqual(self.as_staff("get", f"{PAPERS}{self.paper.id}/").data["offline_package_count"], 2)

    def test_questions_needing_the_internet_are_counted(self):
        exam = self.make_exam(objective_questions=[
            {**objective(1), "question": '<p>Look: <img src="https://res.cloudinary.com/demo/a.png"></p>'},
            {**objective(2), "question": "<p>See https://example.com, typed as text.</p>"},
            objective(3)])
        paper = self.open_paper(exam)

        made = self.as_staff("post", f"{PAPERS}{paper.id}/offline/packages/")

        self.assertEqual(made.data["package"]["questions_needing_internet"], 1)

    def test_students_cannot_make_or_fetch_packages_or_send_results(self):
        self.make_package()
        package = self.paper.offline_packages.get()
        self.client.force_authenticate(user=self.student.user)

        for method, url in (("post", f"{PAPERS}{self.paper.id}/offline/packages/"),
                            ("get", f"{PAPERS}{self.paper.id}/offline/packages/{package.id}/"),
                            ("post", f"{PAPERS}{self.paper.id}/offline/results/")):
            response = getattr(self.client, method)(url, {}, format="json", HTTP_X_TENANT_SLUG=self.school.slug)
            self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND), url)


class StationTest(OfflineTest):
    def test_station_endpoints_do_not_exist_anywhere_else(self):
        for url in (STATION, f"{STATION}sign-in/", f"{STATION}staff/sign-in/", f"{STATION}packages/"):
            self.assertEqual(self.client.post(url, {}, format="json").status_code, status.HTTP_404_NOT_FOUND, url)

    def test_loading_a_package_needs_the_key_and_loading_it_again_changes_nothing(self):
        package, _ = self.make_package()
        with self.station():
            self.assertEqual(self.client.get(STATION).data["papers"], [])
            self.assertEqual(self.load(package, key="wrong-key-guess").status_code, status.HTTP_403_FORBIDDEN)

            self.assertEqual(self.load(package).status_code, status.HTTP_201_CREATED)
            self.assertEqual(self.load(package).status_code, status.HTTP_201_CREATED)

            papers = self.client.get(STATION).data["papers"]
            self.assertEqual(len(papers), 1)
            self.assertEqual((papers[0]["exam_title"], papers[0]["students"], papers[0]["is_open"]),
                             ("First Term Mathematics", 2, True))
            paper = CBTPaper.objects.get(pk=papers[0]["paper"])
            self.assertNotEqual(paper.tenant_id, self.school.id)
            self.assertEqual(paper.exam.grade_level.name, self.exam.grade_level.name)
            # The station never holds an answer key.
            self.assertEqual(set(paper.questions.values_list("correct_option", "numeric_answer", "marking_guide",
                                                             "key_withheld")), {("", "", "", True)})

    def test_wrong_keys_count_towards_one_limit_across_every_endpoint_that_takes_the_key(self):
        package, _ = self.make_package()
        with self.station():
            results = f"{STATION}packages/{json.loads(package)['package_id']}/results/"
            guesses = [self.client.get(results, HTTP_X_STATION_KEY=f"guess-{n:08d}").status_code for n in range(10)]
            limited = self.client.post(f"{STATION}staff/key/", {"key": "one-more-guess"}, format="json")
            # A guess that happens to be right tells the guesser nothing until the wait is over.
            right = self.client.post(f"{STATION}staff/sign-in/", {"key": KEY}, format="json")

        self.assertEqual(guesses, [status.HTTP_403_FORBIDDEN] * 10)
        self.assertEqual((limited.status_code, right.status_code), (status.HTTP_429_TOO_MANY_REQUESTS,) * 2)

    def test_wrong_pins_are_limited_at_each_slip_without_holding_up_the_rest_of_the_class(self):
        package, slips = self.make_package()
        guessed, other = self.slip_for(slips, self.student), self.slip_for(slips, self.second)
        wrong = next(pin for pin in ("111111", "222222") if pin != guessed["pin"])
        with self.station():
            self.load(package)
            guesses = [self.client.post(f"{STATION}sign-in/", {"package": json.loads(package)["package_id"],
                                                               "number": f" {guessed['number']} ", "pin": wrong},
                                        REMOTE_ADDR=f"10.0.0.{n}", format="json").status_code for n in range(10)]
            right_pin_too_late = self.sign_in(package, guessed)
            next_student = self.sign_in(package, other)

        self.assertEqual(guesses, [status.HTTP_403_FORBIDDEN] * 10)
        self.assertEqual(right_pin_too_late.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(next_student.status_code, status.HTTP_200_OK)

    def test_a_key_too_short_to_be_safe_opens_nothing(self):
        with self.station(), self.settings(CBT_STATION_KEY="short-key"):
            response = self.client.post(f"{STATION}staff/key/", {"key": "short-key"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_station_holds_one_schools_papers(self):
        package, _ = self.make_package()
        other = json.loads(package)
        other.update({"package_id": "5b0f4a52-8f59-4a1b-9d2b-2b9d7c1f0a11", "school": {"name": "Rival", "slug": "rival"}})
        with self.station():
            self.load(package)

            response = self.load(json.dumps(other))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("This station holds papers for CBT School", response.data["detail"])

    def test_a_student_signs_in_with_their_slip_and_the_paper_is_not_marked_on_the_station(self):
        package, slips = self.make_package()
        slip = self.slip_for(slips, self.student)
        with self.station():
            self.load(package)
            self.assertEqual(self.sign_in(package, slip, pin="000000").status_code, status.HTTP_403_FORBIDDEN)
            other = self.slip_for(slips, self.second)
            self.assertEqual(self.sign_in(package, slip, pin=other["pin"]).status_code, status.HTTP_403_FORBIDDEN)

            attempt = self.sit(package, slip)

            self.assertEqual(attempt.status, CBTAttempt.Status.SUBMITTED)
            self.assertIsNone(attempt.objective_score)
            self.assertEqual(set(attempt.answers.values_list("is_correct", flat=True)), {None})

    def test_staff_sign_in_with_the_key_and_can_watch_the_invigilation_board(self):
        package, slips = self.make_package()
        with self.station():
            self.assertEqual(self.client.post(f"{STATION}staff/sign-in/", {"key": KEY}, format="json").status_code,
                             status.HTTP_409_CONFLICT)
            self.load(package)
            self.sit(package, self.slip_for(slips, self.student), submit=False)
            self.assertEqual(self.client.post(f"{STATION}staff/sign-in/", {"key": "not-it-at-all"}, format="json")
                             .status_code, status.HTTP_403_FORBIDDEN)

            signed_in = self.client.post(f"{STATION}staff/sign-in/", {"key": KEY}, format="json")
            paper = self.client.get(STATION).data["papers"][0]["paper"]
            board = self.client.get(f"/api/cbt/invigilate/{paper}/", HTTP_X_TENANT_SLUG=signed_in.data["tenant_slug"])

        self.assertEqual(board.status_code, status.HTTP_200_OK, board.data)
        self.assertEqual(sorted(row["state"] for row in board.data["students"]), ["in_progress", "not_started"])

    def test_staff_can_move_the_window_for_a_day_that_went_wrong(self):
        package, _ = self.make_package()
        opens = self.now + timedelta(days=1)
        with self.station():
            self.load(package)
            url = f"{STATION}packages/{json.loads(package)['package_id']}/window/"

            backwards = self.client.post(url, {"opens_at": opens.isoformat(), "closes_at": self.now.isoformat()},
                                         format="json", HTTP_X_STATION_KEY=KEY)
            moved = self.client.post(url, {"opens_at": opens.isoformat(),
                                           "closes_at": (opens + timedelta(hours=2)).isoformat()},
                                     format="json", HTTP_X_STATION_KEY=KEY)

        self.assertEqual(backwards.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(moved.status_code, status.HTTP_200_OK)
        self.assertFalse(moved.data["papers"][0]["is_open"])


class ResultsTest(OfflineTest):
    def test_results_are_marked_when_they_come_back_and_uploading_again_changes_nothing(self):
        text = self.sat_offline(self.student)

        first = self.upload(text)
        again = self.upload(text)

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(first.data, {"imported": 1, "already_imported": 0, "refused": []})
        self.assertEqual(again.data, {"imported": 0, "already_imported": 1, "refused": []})
        attempt = CBTAttempt.objects.get(paper=self.paper)
        self.assertEqual((attempt.student, attempt.status, attempt.objective_score, attempt.total_score),
                         (self.student, CBTAttempt.Status.SUBMITTED, 3, None))
        self.assertEqual(attempt.max_score, 8)
        self.assertEqual(sorted(CBTQuestion.objects.get(pk=q).order for q in attempt.question_ids), [1, 2, 3, 4])
        self.assertEqual(CBTAnswer.objects.filter(attempt=attempt, is_correct=True).count(), 3)
        self.assertEqual(attempt.answers.get(question__kind="text").text_answer, "I carried the one.")
        self.assertTrue(CBTEvent.objects.filter(attempt=attempt, kind=CBTEvent.Kind.FOCUS_LOST).exists())
        self.assertEqual(attempt.offline_package, self.paper.offline_packages.get())
        # Imported attempts show up in marking like any other.
        self.assertEqual(self.as_staff("get", f"{PAPERS}{self.paper.id}/marking/").data["finished_attempts"], 1)

    def test_an_attempt_changed_after_the_station_signed_it_is_refused_and_the_rest_still_come_in(self):
        results = json.loads(self.sat_offline(self.student, self.second, answer="A"))
        changed = results["attempts"][0]
        for answer in changed["answers"]:
            if answer["selected_option"]:
                answer["selected_option"] = "B"

        report = self.upload(results).data

        self.assertEqual((report["imported"], report["already_imported"]), (1, 0))
        self.assertEqual(len(report["refused"]), 1)
        self.assertIn("changed afterwards", report["refused"][0]["reason"])
        self.assertEqual(CBTAttempt.objects.get(paper=self.paper).objective_score, 0)

    def test_results_still_check_out_after_a_browser_splits_them_into_batches(self):
        results = as_a_browser_writes_it(json.loads(self.sat_offline(self.student, self.second)))
        self.assertIn('"seconds_away":5', json.dumps(results, separators=(",", ":")))

        reports = [self.upload({**results, "attempts": [attempt]}).data for attempt in results["attempts"]]

        self.assertEqual([r["imported"] for r in reports], [1, 1], reports)

    def test_results_for_another_paper_or_from_a_station_that_isnt_ours_are_refused(self):
        text = self.sat_offline(self.student)
        other = self.open_paper(self.make_exam(objective_questions=[objective(1)]))

        wrong_paper = self.upload(text, paper=other)
        not_results = self.upload({"format": "something-else"})
        forged = json.loads(text)
        forged["attempts"][0]["signature"] = offline.signature("a secret the station never had", forged["attempts"][0])

        self.assertEqual(wrong_paper.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("different paper", wrong_paper.data["detail"])
        self.assertEqual(not_results.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(self.upload(forged).data["refused"]), 1)
        self.assertFalse(CBTAttempt.objects.filter(paper=self.paper).exists())

    def test_results_from_before_the_paper_was_republished_are_refused(self):
        text = self.sat_offline(self.student)
        self.paper.publish()

        report = self.upload(text).data

        self.assertEqual(report["imported"], 0)
        self.assertIn("have changed since the package was made", report["refused"][0]["reason"])

    def test_attempts_still_going_are_counted_but_not_sent(self):
        package, slips = self.make_package()
        with self.station():
            self.load(package)
            self.sit(package, self.slip_for(slips, self.student))
            self.sit(package, self.slip_for(slips, self.second), submit=False)

            results = json.loads(self.results(package))

        self.assertEqual((len(results["attempts"]), results["still_in_progress"]), (1, 1))
        self.assertEqual(results["attempts"][0]["student_id"], self.student.id)
