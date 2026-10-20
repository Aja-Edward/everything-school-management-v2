"""
The notification bell: who gets a line in it, and that nobody reads or marks
anyone else's, or another school's.
"""
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from assignment.models import AssignmentSubmission
from assignment.tests import School
from schoolSettings.models import SchoolAnnouncement

from .models import Notification, NotificationKind
from .notify import notify

URL = "/api/inbox/"


class BellTestCase(APITestCase):
    def setUp(self):
        self.school = School("bell-school")
        self.other = School("bell-other")

    def as_user(self, user, school=None):
        self.client.force_authenticate(user=user)
        self.slug = (school or self.school).slug

    def bell(self):
        response = self.client.get(URL, HTTP_X_TENANT_SLUG=self.slug)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def titles_for(self, user):
        return sorted(Notification.objects.filter(recipient=user).values_list("title", flat=True))


class InboxApiTest(BellTestCase):
    def setUp(self):
        super().setUp()
        s = self.school
        self.mine = Notification.objects.create(
            tenant=s.tenant, recipient=s.jss1_parent.user, kind=NotificationKind.ANNOUNCEMENT,
            title="Mine")
        Notification.objects.create(
            tenant=s.tenant, recipient=s.jss2_parent.user, kind=NotificationKind.ANNOUNCEMENT,
            title="Someone else's")
        # The same person's line in another school does not show here.
        Notification.objects.create(
            tenant=self.other.tenant, recipient=s.jss1_parent.user,
            kind=NotificationKind.ANNOUNCEMENT, title="Other school")

    def test_lists_only_your_own_in_this_school(self):
        self.as_user(self.school.jss1_parent.user)

        data = self.bell()

        self.assertEqual([n["title"] for n in data["results"]], ["Mine"])
        self.assertEqual(data["unread"], 1)
        self.assertFalse(data["results"][0]["is_read"])

    def test_mark_one_and_all_read(self):
        s = self.school
        Notification.objects.create(
            tenant=s.tenant, recipient=s.jss1_parent.user, kind=NotificationKind.ANNOUNCEMENT,
            title="Second")
        self.as_user(s.jss1_parent.user)

        one = self.client.post(f"{URL}{self.mine.id}/read/", HTTP_X_TENANT_SLUG=self.slug)
        self.assertEqual(one.data["unread"], 1)
        self.assertEqual(self.client.get(f"{URL}unread-count/", HTTP_X_TENANT_SLUG=self.slug).data["unread"], 1)

        self.client.post(f"{URL}read-all/", HTTP_X_TENANT_SLUG=self.slug)
        self.assertEqual(self.bell()["unread"], 0)
        # Another school's unread line for the same person is left alone.
        self.assertTrue(Notification.objects.filter(tenant=self.other.tenant, read_at__isnull=True).exists())

    def test_cannot_mark_someone_elses_read(self):
        self.as_user(self.school.jss2_parent.user)

        response = self.client.post(f"{URL}{self.mine.id}/read/", HTTP_X_TENANT_SLUG=self.slug)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.mine.refresh_from_db()
        self.assertIsNone(self.mine.read_at)

    def test_signed_out_gets_nothing(self):
        response = self.client.get(URL, HTTP_X_TENANT_SLUG=self.school.slug)
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_notify_never_raises(self):
        s = self.school
        with patch("inbox.notify.Notification.objects.bulk_create", side_effect=RuntimeError("db down")):
            added = notify([s.admin], tenant=s.tenant, kind=NotificationKind.ANNOUNCEMENT, title="x")
        self.assertEqual(added, 0)


class AssignmentBellTest(BellTestCase):
    def test_new_assignment_rings_the_class_and_its_parents(self):
        s = self.school
        self.as_user(s.maths_teacher.user)

        self.client.post("/api/assignments/", {
            "classroom": s.jss1.id, "subject": s.maths.id, "title": "Fractions",
            "due_date": str(timezone.localdate() + timedelta(days=2)),
        }, format="json", HTTP_X_TENANT_SLUG=self.slug)

        self.assertEqual(self.titles_for(s.jss1_child.user), ["New assignment: Fractions"])
        self.assertEqual(self.titles_for(s.jss1_parent.user), ["New assignment for Ada: Fractions"])
        student_line = Notification.objects.get(recipient=s.jss1_child.user)
        self.assertEqual(student_line.link, "/student/dashboard?section=assignments")
        self.assertEqual(Notification.objects.get(recipient=s.jss1_parent.user).link, "/parent/dashboard")
        # Another class, and the teacher who set it, hear nothing.
        self.assertEqual(self.titles_for(s.jss2_child.user), [])
        self.assertEqual(self.titles_for(s.jss2_parent.user), [])
        self.assertEqual(self.titles_for(s.maths_teacher.user), [])

    def test_first_hand_in_rings_the_teacher_once(self):
        s = self.school
        fractions = s.assignment(s.jss1, s.maths_teacher, s.maths, title="Fractions")
        self.as_user(s.jss1_parent.user)
        url = f"/api/assignments/{fractions.id}/submit/"

        self.client.post(url, {"text": "a", "student": s.jss1_child.id}, format="json", HTTP_X_TENANT_SLUG=self.slug)
        self.client.post(url, {"text": "b", "student": s.jss1_child.id}, format="json", HTTP_X_TENANT_SLUG=self.slug)

        line = Notification.objects.get(recipient=s.maths_teacher.user)
        self.assertEqual(line.title, "Ada Test handed in Fractions")
        self.assertEqual(line.body, "Handed in by a parent")
        self.assertEqual(line.link, "/teacher/assignments")

    @patch("assignment.views.dispatch_task")
    def test_marking_rings_the_pupil_and_parents_once(self, _dispatch):
        s = self.school
        fractions = s.assignment(s.jss1, s.maths_teacher, s.maths, title="Fractions")
        work = AssignmentSubmission.objects.create(
            tenant=s.tenant, assignment=fractions, student=s.jss1_child, text="1/2")
        self.as_user(s.maths_teacher.user)
        url = f"/api/assignments/{fractions.id}/grade/"

        self.client.post(url, {"submission": work.id, "grade": "7/10"}, format="json", HTTP_X_TENANT_SLUG=self.slug)
        self.client.post(url, {"submission": work.id, "grade": "8/10"}, format="json", HTTP_X_TENANT_SLUG=self.slug)

        self.assertEqual(self.titles_for(s.jss1_child.user), ["Fractions has been marked"])
        self.assertEqual(self.titles_for(s.jss1_parent.user), ["Ada's Fractions has been marked"])
        self.assertEqual(Notification.objects.get(recipient=s.jss1_parent.user).body, "Grade: 7/10")


class AnnouncementBellTest(BellTestCase):
    def setUp(self):
        super().setUp()
        # The school's own top admin, who may post announcements.
        self.owner = self.school.user("owner", "superadmin")

    def post(self, audience, **extra):
        self.as_user(self.owner)
        response = self.client.post("/api/school-settings/announcements/", {
            "title": "Sports day", "content": "Friday at 10am.", "target_audience": audience,
            "announcement_type": "event", **extra,
        }, format="json", HTTP_X_TENANT_SLUG=self.slug)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response

    def test_rings_only_the_audience(self):
        s = self.school

        self.post("parents")

        self.assertEqual(self.titles_for(s.jss1_parent.user), ["Sports day"])
        self.assertEqual(self.titles_for(s.jss2_parent.user), ["Sports day"])
        self.assertEqual(self.titles_for(s.jss1_child.user), [])
        self.assertEqual(self.titles_for(s.maths_teacher.user), [])
        self.assertEqual(self.titles_for(self.other.jss1_parent.user), [])  # another school

    def test_everyone_but_the_poster(self):
        s = self.school

        self.post("all")

        for user in (s.jss1_child.user, s.maths_teacher.user, s.jss1_parent.user, s.admin):
            self.assertEqual(self.titles_for(user), ["Sports day"])
        self.assertEqual(self.titles_for(self.owner), [])

    def test_admins_audience_reaches_admins(self):
        s = self.school
        section_admin = s.user("jss_head", "junior_secondary_admin")

        self.post("admins")

        self.assertEqual(self.titles_for(s.admin), ["Sports day"])
        self.assertEqual(self.titles_for(section_admin), ["Sports day"])
        self.assertEqual(self.titles_for(s.maths_teacher.user), [])
        self.assertEqual(self.titles_for(self.other.admin), [])  # another school's

    def test_inactive_announcement_rings_nobody(self):
        self.post("all", is_active=False)

        self.assertFalse(Notification.objects.exists())
