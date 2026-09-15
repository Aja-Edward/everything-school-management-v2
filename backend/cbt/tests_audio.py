"""
Sound clips for listening tests: signing uploads, putting clips on a paper,
sending them to students, and keeping count of plays.
"""

import json
from types import SimpleNamespace
from unittest import mock

import cloudinary.utils
from rest_framework import status
from rest_framework.test import APIClient

from cbt.models import CBTEvent
from cbt.tests import CBTTestCase, User, objective
from cbt.tests_engine import ATTEMPTS, EngineTest

SIGNATURE = "/api/exams/audio/upload-signature/"
PAPERS = "/api/cbt/papers/"
CLIP = "https://res.cloudinary.com/demo/video/upload/v1/exam-audio/cbt-school/passage.mp3"


def clip(url=CLIP, plays=2, **extra):
    return {"url": url, "title": "Passage 1", "plays": plays, "duration": 45.24, **extra}


class UploadSignatureTest(CBTTestCase):
    client_class = APIClient

    def setUp(self):
        super().setUp()
        self.teacher = User.objects.create_user(username="audio_teacher", email="audio_teacher@example.com",
                                                role="teacher", password="x", is_active=True, tenant=self.school)
        self.config = SimpleNamespace(cloud_name="demo", api_key="key123", api_secret="secret456")

    def post(self, user):
        self.client.force_authenticate(user=user)
        with mock.patch("exam.audio_views.cloudinary.config", return_value=self.config):
            return self.client.post(SIGNATURE, {}, format="json", HTTP_X_TENANT_SLUG=self.school.slug)

    def test_a_teacher_gets_an_upload_signed_for_their_schools_audio_folder(self):
        response = self.post(self.teacher)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        fields = response.data["fields"]
        self.assertEqual(response.data["upload_url"], "https://api.cloudinary.com/v1_1/demo/video/upload")
        self.assertEqual((fields["folder"], fields["api_key"]), ("exam-audio/cbt-school", "key123"))
        self.assertIn("mp3", fields["allowed_formats"].split(","))
        signed = {k: fields[k] for k in ("timestamp", "folder", "allowed_formats")}
        self.assertEqual(fields["signature"], cloudinary.utils.api_sign_request(signed, "secret456"))
        self.assertNotIn("secret456", json.dumps(response.data))

    def test_students_cannot_get_one(self):
        student = User.objects.create_user(username="audio_student", email="audio_student@example.com",
                                           role="student", password="x", is_active=True, tenant=self.school)

        self.assertEqual(self.post(student).status_code, status.HTTP_403_FORBIDDEN)

    def test_a_server_without_file_storage_says_so(self):
        self.config = SimpleNamespace(cloud_name="", api_key="", api_secret="")

        response = self.post(self.teacher)

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


class ClipsOnThePaperTest(CBTTestCase):
    def test_question_and_section_clips_are_copied_onto_the_paper(self):
        exam = self.make_exam(
            objective_questions=[{**objective(1), "question": "", "audio": clip()}, objective(2)],
            theory_questions=[{"question": "Summarise what you heard.", "marks": 5, "audio": clip(plays=0)}],
            custom_sections=[{"id": 1, "name": "Listening", "instructions": "Listen twice.", "audio": clip(plays=1),
                              "questions": [{"question": "What happened?", "marks": 5}]}],
            section_audio={"objective": clip(title="Section A passage")})

        paper = self.make_paper(exam, include_theory=True)

        q = {x.order: x for x in paper.questions.all()}
        self.assertEqual(q[1].audio, {"url": CLIP, "title": "Passage 1", "plays": 2, "duration": 45.2})
        self.assertEqual((q[2].audio, q[3].audio["plays"]), ({}, 0))
        by_key = {s["key"]: s for s in paper.sections}
        self.assertEqual(by_key["objective"]["audio"]["title"], "Section A passage")
        self.assertNotIn("audio", by_key["theory"])
        self.assertEqual(by_key["custom-1"]["audio"]["plays"], 1)

    def test_a_clip_with_no_question_text_is_still_a_question(self):
        exam = self.make_exam(objective_questions=[{**objective(1), "question": "<p></p>", "audio": clip()}])

        self.assertEqual(self.make_paper(exam).questions.count(), 1)

    def test_clip_problems_are_named(self):
        exam = self.make_exam(
            objective_questions=[{**objective(1), "audio": clip(url="http://example.com/a.mp3")},
                                 {**objective(2), "audio": clip(plays=11)},
                                 {**objective(3), "audio": clip(plays="twice")}],
            section_audio={"objective": clip(url="ftp://example.com/a.mp3")})

        self.assertEqual(self.problems(self.make_paper(exam, publish=False)), [
            "The Objective section's sound clip has a link that doesn't start with https://.",
            "Objective question 1's sound clip has a link that doesn't start with https://.",
            "Objective question 2's sound clip can be allowed at most 10 plays.",
            "Objective question 3's sound clip can be allowed at most 10 plays.",
        ])

    def test_a_question_without_a_link_has_no_clip(self):
        exam = self.make_exam(objective_questions=[{**objective(1), "audio": {"url": "  ", "plays": 2}}])

        self.assertEqual(self.make_paper(exam).questions.get().audio, {})


class PlayingClipsTest(EngineTest):
    def setUp(self):
        super().setUp()
        self.exam = self.make_exam(
            objective_questions=[{**objective(1), "audio": clip(plays=2)}, {**objective(2), "audio": clip(plays=0)},
                                 objective(3)],
            section_audio={"objective": clip(plays=1)})
        self.paper = self.open_paper(self.exam, shuffle_questions=False)
        self.q = {x.order: x for x in self.paper.questions.all()}
        self.attempt = self.started()

    def beat(self, plays):
        response = self.request("post", f"{ATTEMPTS}{self.attempt.id}/heartbeat/", {"position": 0, "audio_plays": plays})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["audio_plays"]

    def test_the_paper_carries_clips_but_nothing_else_from_them(self):
        paper = self.request("get", f"{ATTEMPTS}{self.attempt.id}/").data["paper"]

        questions = {x["id"]: x for x in paper["questions"]}
        self.assertEqual(questions[self.q[1].id]["audio"],
                         {"url": CLIP, "title": "Passage 1", "plays": 2, "duration": 45.2})
        self.assertNotIn("audio", questions[self.q[3].id])
        self.assertEqual(paper["sections"][0]["audio"]["plays"], 1)

    def test_the_highest_count_is_kept_and_never_passes_the_limit(self):
        first, second, section = f"question:{self.q[1].id}", f"question:{self.q[2].id}", "section:objective"

        self.assertEqual(self.beat({first: 1, section: 1}), {first: 1, section: 1})
        # A late check-in from before the second play doesn't lower the count.
        self.assertEqual(self.beat({first: 0}), {first: 1, section: 1})
        self.assertEqual(self.beat({first: 5, second: 7, section: 3}), {first: 2, second: 7, section: 1})

        detail = self.request("get", f"{ATTEMPTS}{self.attempt.id}/").data
        self.assertEqual(detail["attempt"]["audio_plays"], {first: 2, second: 7, section: 1})

    def test_counts_for_clips_not_on_the_paper_or_that_arent_counts_are_ignored(self):
        self.assertEqual(self.beat({
            f"question:{self.q[3].id}": 1, "question:999999": 1, "section:theory": 1,
            f"question:{self.q[1].id}": "2", f"question:{self.q[2].id}": True,
        }), {})
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.audio_plays, {})

    def test_the_exam_page_can_report_plays_and_clips_that_failed(self):
        response = self.request("post", f"{ATTEMPTS}{self.attempt.id}/events/", {"events": [
            {"kind": "audio_played", "detail": {"clip": f"question:{self.q[1].id}", "play": 1}},
            {"kind": "audio_failed", "detail": {"clip": "section:objective", "error": "network"}},
        ]})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(list(CBTEvent.objects.filter(attempt=self.attempt, kind__startswith="audio")
                              .values_list("kind", flat=True).order_by("kind")), ["audio_failed", "audio_played"])

    def test_a_clip_that_failed_shows_on_the_invigilation_board(self):
        self.request("post", f"{ATTEMPTS}{self.attempt.id}/events/", {"events": [
            {"kind": "audio_failed", "detail": {"clip": "section:objective"}}]})
        admin = User.objects.create_user(username="audio_invigilator", email="audio_invigilator@example.com",
                                         role="admin", password="x", is_active=True, tenant=self.school)
        self.client.force_authenticate(user=admin)

        board = self.request("get", f"/api/cbt/invigilate/{self.paper.id}/", token=None).data

        row = next(r for r in board["students"] if r.get("attempt") and r["attempt"]["id"] == self.attempt.id)
        self.assertEqual(row["warnings"].get("audio_failed"), 1)


class MarkingWithClipsTest(EngineTest):
    def test_markers_hear_the_clip_the_typed_question_asked_about(self):
        self.exam = self.make_exam(theory_questions=[{"question": "Write what you heard.", "marks": 5, "audio": clip()}])
        self.paper = self.open_paper(self.exam, include_objective=False, include_theory=True)
        question = self.paper.questions.get()
        attempt = self.started()
        self.save(attempt, [{"question_id": question.id, "text_answer": "The cat sat on the mat."}])
        self.request("post", f"{ATTEMPTS}{attempt.id}/submit/")
        admin = User.objects.create_user(username="clip_marker", email="clip_marker@example.com", role="admin",
                                         password="x", is_active=True, tenant=self.school)
        self.client.force_authenticate(user=admin)

        data = self.request("get", f"{PAPERS}{self.paper.id}/marking/questions/{question.id}/", token=None).data

        self.assertEqual(data["question"]["audio"]["url"], CLIP)
