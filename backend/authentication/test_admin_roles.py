"""
The admin list: the school's owner gives each fellow admin a title and a
section, and everyone else sees an admin by that title, never by name.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from common.admin_access import admin_level_access
from common.admin_identity import public_name
from common.education_levels import expand_tokens
from tenants.models import Tenant

User = get_user_model()


class AdminRolesTestCase(APITestCase):
    def setUp(self):
        self.school = Tenant.objects.create(
            name="Roles School", slug="roles-school", status="active",
            is_active=True, owner_email="roles@example.com",
        )
        self.other = Tenant.objects.create(
            name="Other Roles School", slug="other-roles-school", status="active",
            is_active=True, owner_email="other-roles@example.com",
        )
        # The owner is what school registration makes: role superadmin, staff.
        self.owner = self._user("owner", "superadmin", is_staff=True)
        self.admin = self._user("general", "admin", is_staff=True)
        self.teacher = self._user("teacher", "teacher")

    def _user(self, name, role, school=None, **extra):
        # password=None: hashing costs seconds per user and nobody logs in.
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name.title(),
            last_name="Person", role=role, password=None, is_active=True,
            tenant=school or self.school, **extra,
        )

    def _as(self, user, school=None):
        self.client.force_authenticate(user)
        return {"format": "json", "HTTP_X_TENANT_SLUG": (school or self.school).slug}

    def _assign(self, actor, target, school=None, **body):
        return self.client.patch(
            reverse("authentication:delete-admin", args=[target.pk]), body,
            **self._as(actor, school),
        )

    def _create(self, actor, email, **body):
        return self.client.post(
            reverse("authentication:create-admin"),
            {"email": email, "first_name": "New", "last_name": "Admin", **body},
            **self._as(actor),
        )


class TheOwnerIsTheProprietorTest(AdminRolesTestCase):
    def test_the_owner_is_proprietor_until_they_pick_a_title(self):
        self.assertEqual(public_name(self.owner), "Proprietor/Proprietress")

    def test_the_admin_list_marks_the_owner_and_gives_every_title(self):
        response = self.client.get(reverse("authentication:list-admins"), **self._as(self.owner))

        self.assertEqual(response.status_code, 200)
        rows = {row["id"]: row for row in response.data}
        self.assertTrue(rows[self.owner.pk]["is_owner"])
        self.assertEqual(rows[self.owner.pk]["admin_title"], "Proprietor/Proprietress")
        self.assertFalse(rows[self.admin.pk]["is_owner"])
        self.assertEqual(rows[self.admin.pk]["admin_title"], "School Admin")

    def test_the_owner_may_be_titled_proprietress(self):
        response = self._assign(self.owner, self.owner, admin_title="Proprietress")

        self.assertEqual(response.status_code, 200, response.data)
        self.owner.refresh_from_db()
        self.assertEqual(public_name(self.owner), "Proprietress")
        self.assertEqual(self.owner.role, "superadmin")

    def test_nobody_changes_the_owners_access(self):
        response = self._assign(self.owner, self.owner, role="primary_admin")

        self.assertEqual(response.status_code, 400)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.role, "superadmin")

    def test_nobody_is_made_owner_here(self):
        response = self._assign(self.owner, self.admin, role="superadmin")

        self.assertEqual(response.status_code, 400)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, "admin")


class NewAdminsAreNumberedTest(AdminRolesTestCase):
    def test_admins_added_without_a_title_are_numbered(self):
        # self.admin was made without the API and has no stored title.
        first = self._create(self.owner, "a1@example.com", role="admin")
        second = self._create(self.owner, "a2@example.com", role="admin")

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["admin_title"], "School Admin 2")
        self.assertEqual(second.data["admin_title"], "School Admin 3")
        self.assertEqual(
            User.objects.get(email="a2@example.com").admin_title, "School Admin 3"
        )

    def test_a_title_given_when_adding_is_kept(self):
        response = self._create(self.owner, "vp@example.com", role="admin", admin_title="Vice Principal")

        self.assertEqual(response.data["admin_title"], "Vice Principal")


class AssigningRolesTest(AdminRolesTestCase):
    def test_the_owner_titles_an_admin(self):
        response = self._assign(self.owner, self.admin, admin_title="School General Admin 1")

        self.assertEqual(response.status_code, 200, response.data)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.admin_title, "School General Admin 1")
        self.assertEqual(self.admin.role, "admin")

    def test_a_section_limits_what_the_admin_sees(self):
        response = self._assign(self.owner, self.admin, role="primary_admin")

        self.assertEqual(response.status_code, 200, response.data)
        self.admin.refresh_from_db()
        self.assertEqual((self.admin.role, self.admin.section), ("primary_admin", "primary"))
        # Staff is what the whole-school endpoints check (admin_account_flags).
        self.assertFalse(self.admin.is_staff)
        self.assertEqual(
            admin_level_access(self.admin, self.school), expand_tokens(["PRIMARY"])
        )
        # Their old numbered-by-role title would now be wrong.
        self.assertEqual(response.data["admin_title"], "Primary Admin 1")

    def test_a_section_admin_can_be_given_the_whole_school_again(self):
        self._assign(self.owner, self.admin, role="nursery_admin")

        response = self._assign(self.owner, self.admin, role="admin")

        self.assertEqual(response.status_code, 200, response.data)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_staff)
        self.assertIsNone(self.admin.section)
        self.assertIsNone(admin_level_access(self.admin, self.school))

    def test_a_chosen_title_survives_a_change_of_section(self):
        self._assign(self.owner, self.admin, admin_title="Head of Lower School")

        self._assign(self.owner, self.admin, role="nursery_admin")

        self.admin.refresh_from_db()
        self.assertEqual(self.admin.admin_title, "Head of Lower School")

    def test_only_the_owner_assigns_roles(self):
        other_admin = self._user("second", "admin", is_staff=True)

        response = self._assign(self.admin, other_admin, role="primary_admin")

        self.assertEqual(response.status_code, 403)
        other_admin.refresh_from_db()
        self.assertEqual(other_admin.role, "admin")

    def test_an_unknown_role_is_refused(self):
        response = self._assign(self.owner, self.admin, role="principal")

        self.assertEqual(response.status_code, 400)

    def test_a_teacher_is_not_given_an_admin_role_here(self):
        response = self._assign(self.owner, self.teacher, role="admin")

        self.assertEqual(response.status_code, 400)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.role, "teacher")

    def test_another_schools_admin_is_out_of_reach(self):
        theirs = self._user("theirs", "admin", school=self.other, is_staff=True)

        response = self._assign(self.owner, theirs, role="primary_admin")

        self.assertEqual(response.status_code, 404)
        theirs.refresh_from_db()
        self.assertEqual(theirs.role, "admin")


class AdminsAreKnownByTitleTest(AdminRolesTestCase):
    """Wherever an admin's work is shown to others, it carries their title."""

    def setUp(self):
        super().setUp()
        self.admin.admin_title = "Vice Principal"
        self.admin.save()

    def test_a_message_from_an_admin_carries_their_title(self):
        from inbox.models import Notification

        response = self.client.post(
            "/api/messaging/messages/",
            {"recipient": self.teacher.pk, "subject": "Staff meeting",
             "content": "Monday at 2pm.", "message_type": "in_app"},
            **self._as(self.admin),
        )
        self.assertEqual(response.status_code, 201, response.data)

        inbox = self.client.get("/api/messaging/messages/?type=inbox", **self._as(self.teacher))
        row = inbox.data["results"][0]
        self.assertEqual(row["sender_name"], "Vice Principal")
        self.assertIsNone(row["sender_email"])
        bell = Notification.objects.get(recipient=self.teacher)
        self.assertEqual(bell.title, "Message from Vice Principal: Staff meeting")
        self.assertNotIn("General", bell.title)

    def test_the_email_is_signed_with_the_title(self):
        from unittest.mock import patch

        from messaging.models import Message
        from messaging.tasks import email_messages
        from utils.notifications import SendResult

        message = Message.objects.create(
            tenant=self.school, sender=self.admin, recipient=self.teacher,
            subject="Report cards", content="Due Friday.", message_type="email",
        )
        with patch("messaging.tasks.channels.send", return_value=SendResult.success("brevo", "m-1")) as send:
            email_messages([message.pk])

        body = send.call_args.kwargs["body"]
        self.assertIn("Vice Principal", body)
        self.assertNotIn("General Person", body)

    def test_a_teacher_is_still_known_by_name(self):
        self.assertEqual(public_name(self.teacher), "Teacher Person")

    def test_the_recipient_list_shows_admins_by_title(self):
        response = self.client.get("/api/messaging/messages/users/", **self._as(self.teacher))

        rows = {row["id"]: row for row in response.data}
        self.assertEqual(rows[self.admin.pk]["full_name"], "Vice Principal")
        self.assertIsNone(rows[self.admin.pk]["email"])

    def test_an_announcement_carries_the_title(self):
        from schoolSettings.models import SchoolAnnouncement
        from schoolSettings.serializers import SchoolAnnouncementSerializer

        announcement = SchoolAnnouncement(title="Sports day", content="Friday", created_by=self.owner)

        data = SchoolAnnouncementSerializer(announcement).data

        self.assertEqual(data["created_by_name"], "Proprietor/Proprietress")

    def test_a_staff_note_carries_the_title(self):
        from teacher.appraisal_serializers import StaffNoteSerializer
        from types import SimpleNamespace

        serializer = StaffNoteSerializer()
        note = SimpleNamespace(issued_by=self.admin)

        self.assertEqual(serializer.get_issued_by_name(note), "Vice Principal")
