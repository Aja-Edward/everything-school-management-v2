"""
Setting up a CBT paper through the API: who may, and what the check, preview
and publish steps allow.
"""

from datetime import timedelta

from rest_framework import status
from rest_framework.test import APIClient

from cbt.models import CBTAttempt, CBTPaper
from cbt.tests import OPENS, CBTTestCase, User, objective
from exam.models import ExamStatus
from teacher.models import Teacher

PAPERS = "/api/cbt/papers/"


class AuthoringTest(CBTTestCase):
    client_class = APIClient

    def setUp(self):
        super().setUp()
        self.teacher = self.make_staff("teacher")
        self.exam = self.make_exam(objective_questions=[objective(n) for n in range(1, 4)])
        self.exam.teacher = self.teacher.teacher
        self.set_exam_status("draft")

    def make_staff(self, role, school=None, **extra):
        school = school or self.school
        n = User.objects.count()
        user = User.objects.create_user(
            username=f"cbt_{role}_{n}", email=f"cbt_{role}_{n}@example.com", role=role,
            password="testpass123", is_active=True, tenant=school, **extra)
        if role == "teacher":
            Teacher.objects.create(user=user, tenant=school, employee_id=f"CBT{n}")
        return user

    def set_exam_status(self, code):
        self.exam.status = ExamStatus.objects.get(tenant=self.school, code=code)
        self.exam.save()

    def as_user(self, user):
        self.client.force_authenticate(user=user)

    def call(self, method, url, data=None, school=None):
        return getattr(self.client, method)(
            url, data, format="json", HTTP_X_TENANT_SLUG=(school or self.school).slug)

    def create_paper(self, **settings):
        response = self.call("post", PAPERS, {"exam": self.exam.id, **settings})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return CBTPaper.objects.get(pk=response.data["id"])


class WhoMaySetUpCBTTest(AuthoringTest):
    def test_a_teacher_sets_up_their_exam_with_its_window_taken_from_the_exam(self):
        self.as_user(self.teacher)

        paper = self.create_paper()

        self.assertEqual(paper.status, CBTPaper.Status.DRAFT)
        self.assertEqual(paper.tenant, self.school)
        self.assertEqual(paper.opens_at, OPENS)
        self.assertEqual(paper.closes_at, OPENS + timedelta(hours=2))
        self.assertEqual(paper.duration_minutes, 120)

    def test_a_teacher_cannot_set_up_another_teachers_exam(self):
        self.as_user(self.make_staff("teacher"))

        response = self.call("post", PAPERS, {"exam": self.exam.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exam", response.data)
        self.assertFalse(CBTPaper.objects.exists())

    def test_an_exam_gets_one_paper(self):
        self.as_user(self.teacher)
        self.create_paper()

        response = self.call("post", PAPERS, {"exam": self.exam.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["exam"], ["This exam already has a CBT paper."])

    def test_students_and_parents_are_refused(self):
        for role in ("student", "parent"):
            with self.subTest(role=role):
                self.as_user(self.make_staff(role))
                self.assertEqual(self.call("get", PAPERS).status_code, status.HTTP_403_FORBIDDEN)
                self.assertEqual(self.call("post", PAPERS, {"exam": self.exam.id}).status_code,
                                 status.HTTP_403_FORBIDDEN)

    def test_another_schools_admin_cannot_see_the_paper(self):
        self.as_user(self.teacher)
        paper = self.create_paper()
        other = self.make_school("Other Authoring School", "other-authoring-school")
        self.as_user(self.make_staff("superadmin", school=other))

        self.assertEqual(self.call("get", PAPERS, school=other).data, [])
        self.assertEqual(self.call("get", f"{PAPERS}{paper.id}/", school=other).status_code,
                         status.HTTP_404_NOT_FOUND)

    def test_closing_before_opening_is_refused(self):
        self.as_user(self.teacher)

        response = self.call("post", PAPERS, {
            "exam": self.exam.id, "opens_at": OPENS.isoformat(), "closes_at": OPENS.isoformat()})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("The exam must close after it opens.", str(response.data))


class CheckPreviewAndPublishTest(AuthoringTest):
    def setUp(self):
        super().setUp()
        self.as_user(self.teacher)

    def test_check_lists_what_is_wrong_without_publishing(self):
        self.exam.objective_questions[1]["correctAnswer"] = ""
        self.exam.save()
        paper = self.create_paper()

        response = self.call("post", f"{PAPERS}{paper.id}/check/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["ready"])
        self.assertEqual(response.data["problems"], [
            "Objective question 2 has no correct answer, or its answer is not one of its options."])
        self.assertEqual(response.data["objective_count"], 3)
        paper.refresh_from_db()
        self.assertEqual(paper.status, CBTPaper.Status.DRAFT)

    def test_a_draft_preview_shows_the_paper_without_any_answers(self):
        self.exam.theory_questions = [{
            "question": "Explain.", "marks": 5, "expectedPoints": "The marking guide",
            "subQuestions": [{"question": "Part a", "marks": 5, "answer": "Also secret"}]}]
        self.exam.save()
        paper = self.create_paper(include_theory=True, shuffle_questions=False, shuffle_options=False)

        response = self.call("get", f"{PAPERS}{paper.id}/preview/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_draft"])
        first, theory = response.data["questions"][0], response.data["questions"][3]
        self.assertEqual(first["options"], [{"key": k, "text": t} for k, t in zip("ABCD", "1234")])
        self.assertEqual(theory["parts"], [{"question": "Part a", "marks": 5}])
        body = response.content.decode()
        for secret in ("correct", "The marking guide", "Also secret"):
            self.assertNotIn(secret, body)

    def test_a_published_preview_uses_the_published_questions(self):
        paper = self.create_paper(shuffle_questions=False)
        self.set_exam_status("approved")
        self.call("post", f"{PAPERS}{paper.id}/publish/")
        self.exam.objective_questions = []
        self.exam.save()

        response = self.call("get", f"{PAPERS}{paper.id}/preview/")

        self.assertFalse(response.data["is_draft"])
        self.assertEqual(len(response.data["questions"]), 3)
        self.assertNotIn("correct", response.content.decode())

    def test_a_teacher_can_publish_only_once_the_exam_is_approved(self):
        paper = self.create_paper()

        refused = self.call("post", f"{PAPERS}{paper.id}/publish/")
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refused.data["detail"],
                         "This exam needs to be approved before it can be published for CBT.")

        self.set_exam_status("approved")
        published = self.call("post", f"{PAPERS}{paper.id}/publish/")
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        self.assertEqual(published.data["status"], "published")
        self.assertEqual(published.data["objective_count"], 3)

    def test_an_admin_can_publish_an_exam_still_in_draft(self):
        paper = self.create_paper()
        admin = self.make_staff("admin")
        self.as_user(admin)

        response = self.call("post", f"{PAPERS}{paper.id}/publish/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        paper.refresh_from_db()
        self.assertEqual(paper.published_by, admin)

    def test_publishing_a_broken_exam_returns_its_problems(self):
        self.exam.objective_questions[0]["optionB"] = ""
        self.exam.objective_questions[0]["optionC"] = ""
        self.exam.objective_questions[0]["optionD"] = ""
        self.set_exam_status("approved")
        paper = self.create_paper()

        response = self.call("post", f"{PAPERS}{paper.id}/publish/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["problems"], ["Objective question 1 needs at least two options."])

    def test_once_students_start_the_questions_are_locked_but_the_window_is_not(self):
        self.set_exam_status("approved")
        paper = self.create_paper()
        self.call("post", f"{PAPERS}{paper.id}/publish/")
        CBTAttempt.start(paper, self.make_student(), now=OPENS)
        url = f"{PAPERS}{paper.id}/"

        locked = self.call("patch", url, {"include_theory": True})
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)

        later = OPENS + timedelta(hours=3)
        moved = self.call("patch", url, {"closes_at": later.isoformat()})
        self.assertEqual(moved.status_code, status.HTTP_200_OK, moved.data)

        for action, message in (("unpublish/", "can't be taken down"), ("", "can't be deleted")):
            with self.subTest(action=action or "delete"):
                method = "post" if action else "delete"
                response = self.call(method, f"{url}{action}")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(message, response.data["detail"])

    def test_exam_screens_can_look_up_papers_for_a_page_of_exams(self):
        paper = self.create_paper()
        other_exam = self.make_exam(objective_questions=[objective(1)])
        other_exam.teacher = self.teacher.teacher
        other_exam.save()

        response = self.call("get", f"{PAPERS}?exam__in={self.exam.id},{other_exam.id}")

        self.assertEqual([p["id"] for p in response.data], [paper.id])
        self.assertEqual(response.data[0]["exam_title"], "First Term Mathematics")
