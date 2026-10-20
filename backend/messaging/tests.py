"""
Messages: sending one actually delivers it, and an admin's bulk message
reaches the group it names in their own school, and nobody else.
"""
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APITestCase

from assignment.tests import School
from inbox.models import Notification, NotificationKind
from utils.notifications import SendResult

from .models import BulkMessage, Message
from .tasks import email_messages

URL = "/api/messaging/"


class MessagingTestCase(APITestCase):
    def setUp(self):
        self.school = School("msg-school")
        self.other = School("msg-other")

    def as_user(self, user, school=None):
        self.client.force_authenticate(user=user)
        self.slug = (school or self.school).slug

    def post(self, path, data):
        return self.client.post(URL + path, data, format="json", HTTP_X_TENANT_SLUG=self.slug)

    def get(self, path):
        return self.client.get(URL + path, HTTP_X_TENANT_SLUG=self.slug)


class MessageTest(MessagingTestCase):
    def test_recipient_list_is_this_schools_people(self):
        s = self.school
        self.as_user(s.admin)

        ids = {row["id"] for row in self.get("messages/users/").data}

        self.assertIn(s.maths_teacher.user.id, ids)
        self.assertIn(s.jss1_parent.user.id, ids)
        self.assertNotIn(s.admin.id, ids)
        self.assertNotIn(self.other.maths_teacher.user.id, ids)

    def test_a_message_is_sent_and_rings_the_recipients_bell(self):
        s = self.school
        self.as_user(s.admin)

        response = self.post("messages/", {
            "recipient": s.maths_teacher.user.id, "subject": "Staff meeting",
            "content": "Monday at 2pm.", "message_type": "in_app",
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        message = Message.objects.get()
        self.assertEqual((message.status, message.tenant), ("sent", s.tenant))
        self.assertIsNotNone(message.sent_at)
        bell = Notification.objects.get(recipient=s.maths_teacher.user)
        self.assertEqual(bell.kind, NotificationKind.MESSAGE)
        self.assertEqual(bell.title, "Message from Admin Test: Staff meeting")
        self.assertEqual(bell.link, "/teacher/messages")

        # It is in the teacher's inbox and in the admin's Sent, not Drafts.
        self.as_user(s.maths_teacher.user)
        self.assertEqual(self.get("messages/?type=inbox").data["count"], 1)
        self.as_user(s.admin)
        self.assertEqual(self.get("messages/?type=sent").data["count"], 1)
        self.assertEqual(self.get("messages/?type=drafts").data["count"], 0)

    def test_sms_is_refused(self):
        s = self.school
        self.as_user(s.admin)

        response = self.post("messages/", {
            "recipient": s.maths_teacher.user.id, "subject": "x", "content": "y", "message_type": "sms",
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Message.objects.exists())

    def test_cannot_message_someone_in_another_school(self):
        self.as_user(self.school.admin)

        response = self.post("messages/", {
            "recipient": self.other.maths_teacher.user.id, "subject": "x", "content": "y",
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("messaging.delivery.dispatch_task")
    def test_an_email_message_is_queued_then_emailed(self, dispatch):
        s = self.school
        self.as_user(s.admin)

        with self.captureOnCommitCallbacks(execute=True):
            self.post("messages/", {
                "recipient": s.maths_teacher.user.id, "subject": "Report cards",
                "content": "Due Friday.", "message_type": "email",
            })

        message = Message.objects.get()
        dispatch.assert_called_once_with(email_messages, message_ids=[message.id])

        with patch("messaging.tasks.channels.send", return_value=SendResult.success("brevo", "m-1")) as send:
            self.assertEqual(email_messages([message.id]), 1)
        self.assertEqual(send.call_args.kwargs["destination"], s.maths_teacher.user.email)
        self.assertEqual(send.call_args.kwargs["tenant"], s.tenant)
        self.assertIn("Due Friday.", send.call_args.kwargs["body"])
        message.refresh_from_db()
        self.assertEqual((message.status, message.external_id), ("delivered", "m-1"))

    def test_a_failed_email_is_recorded(self):
        s = self.school
        message = Message.objects.create(
            tenant=s.tenant, sender=s.admin, recipient=s.maths_teacher.user,
            subject="x", content="y", message_type="email", status="sent")

        with patch("messaging.tasks.channels.send", return_value=SendResult.failure("brevo", "Brevo returned 500")):
            email_messages([message.id])

        message.refresh_from_db()
        self.assertEqual(message.status, "failed")
        self.assertIn("500", message.delivery_status)


class BulkMessageTest(MessagingTestCase):
    def create(self, **data):
        payload = {"subject": "Staff briefing", "content": "Tomorrow 7:30am in the hall.",
                   "message_type": "in_app", "recipient_roles": ["teachers"], **data}
        return self.post("bulk-messages/", payload)

    def test_admin_sends_to_every_teacher_in_the_school(self):
        s = self.school
        self.as_user(s.admin)

        created = self.create()
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["total_recipients"], 4)  # form, maths, english, jss2 teachers

        sent = self.post(f"bulk-messages/{created.data['id']}/send_now/", {})

        self.assertEqual(sent.status_code, status.HTTP_200_OK, sent.data)
        self.assertEqual((sent.data["status"], sent.data["sent_count"]), ("sent", 4))
        teachers = {s.form_teacher.user, s.maths_teacher.user, s.english_teacher.user, s.jss2_teacher.user}
        self.assertEqual({m.recipient for m in Message.objects.all()}, teachers)
        self.assertTrue(all(m.status == "sent" for m in Message.objects.all()))
        self.assertEqual({n.recipient for n in Notification.objects.all()}, teachers)
        # Not parents, students, the sender, or another school's teachers.
        self.assertFalse(Message.objects.filter(recipient__in=[
            s.jss1_parent.user, s.jss1_child.user, s.admin, self.other.maths_teacher.user]).exists())

    def test_several_groups_and_named_people(self):
        s = self.school
        self.as_user(s.admin)

        created = self.create(recipient_roles=["parents"], custom_recipients=[s.maths_teacher.user.id])
        self.post(f"bulk-messages/{created.data['id']}/send_now/", {})

        self.assertEqual(
            {m.recipient for m in Message.objects.all()},
            {s.jss1_parent.user, s.jss2_parent.user, s.maths_teacher.user},
        )

    def test_named_people_from_another_school_are_refused(self):
        self.as_user(self.school.admin)

        response = self.create(custom_recipients=[self.other.maths_teacher.user.id])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BulkMessage.objects.exists())  # no draft left behind

    def test_unknown_group_and_sms_are_refused(self):
        self.as_user(self.school.admin)

        self.assertEqual(self.create(recipient_roles=["everyone"]).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.create(message_type="sms").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(BulkMessage.objects.exists())

    def test_teachers_and_parents_cannot_send_bulk_messages(self):
        s = self.school
        for user in (s.maths_teacher.user, s.jss1_parent.user):
            self.as_user(user)
            self.assertEqual(self.create().status_code, status.HTTP_403_FORBIDDEN, user.role)
        self.assertFalse(BulkMessage.objects.exists())

    def test_a_bulk_message_is_sent_once(self):
        self.as_user(self.school.admin)
        created = self.create()
        self.post(f"bulk-messages/{created.data['id']}/send_now/", {})

        again = self.post(f"bulk-messages/{created.data['id']}/send_now/", {})

        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Message.objects.count(), 4)
