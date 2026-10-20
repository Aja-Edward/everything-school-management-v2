"""
Getting a message to the people it is for.

A message is stored once per recipient (Message), which is what their
Messages inbox lists. Sending it marks it sent, rings each recipient's
notification bell, and for an email message also emails them, off the
request (tasks.email_messages). SMS is not offered: each text costs the
school money, and nothing here bills for it.
"""
import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from common.dispatch import dispatch_task
from inbox.models import NotificationKind
from inbox.notify import ADMIN_ROLES, notify
from tenants.membership import in_school_q, user_school_id
from users.models import CustomUser

from .models import Message

logger = logging.getLogger(__name__)

# What the bulk form offers, and the user roles each one means.
AUDIENCES = {
    "teachers": ("teacher",),
    "parents": ("parent",),
    "students": ("student",),
    "admins": ADMIN_ROLES,
}

# Where a recipient's bell sends them to read a message.
MESSAGES_PAGE = {"teacher": "/teacher/messages", **{role: "/admin/messages" for role in ADMIN_ROLES}}


def messages_page(user):
    return MESSAGES_PAGE.get((getattr(user, "role", "") or "").lower(), "")


def is_school_admin(user):
    return (getattr(user, "role", "") or "").lower() in ADMIN_ROLES or getattr(user, "is_platform_staff", False)


def school_users(sender):
    """Active users in the sender's school, never including the sender."""
    school_id = user_school_id(sender)
    if school_id is None:
        return CustomUser.objects.none()
    return (
        CustomUser.objects.filter(in_school_q(school_id), is_active=True)
        .exclude(pk=sender.pk)
        .distinct()
    )


def bulk_recipients(bulk):
    """Everyone a bulk message reaches: its audiences plus any named people, in the sender's school."""
    roles = {role for audience in bulk.recipient_roles or [] for role in AUDIENCES.get(audience, ())}
    named = [int(pk) for pk in bulk.custom_recipients or [] if str(pk).isdigit()]
    users = school_users(bulk.sender)
    wanted = Q(pk__in=[])
    if roles:
        wanted |= Q(role__in=roles)
    if named:
        wanted |= Q(pk__in=named)
    return users.filter(wanted)


def deliver(messages, tenant):
    """
    Mark the messages sent, ring each recipient's bell, and queue the email
    ones. `messages` are saved Message rows from one sender.
    """
    messages = list(messages)
    if not messages:
        return
    now = timezone.now()
    Message.objects.filter(pk__in=[m.pk for m in messages]).update(status="sent", sent_at=now)

    sender = messages[0].sender
    sender_name = sender.get_full_name() or sender.username
    # A bulk send is one subject and text to many people: one insert for all
    # of their bells rather than one each.
    by_text = {}
    for message in messages:
        by_text.setdefault((message.subject, message.content), []).append(message.recipient)
    for (subject, content), recipients in by_text.items():
        notify(
            recipients, tenant=tenant, kind=NotificationKind.MESSAGE,
            title=f"Message from {sender_name}: {subject}",
            body=content[:300], link=messages_page,
        )

    email_ids = [m.pk for m in messages if m.message_type == "email"]
    if email_ids:
        transaction.on_commit(lambda: dispatch_task(_email_task(), message_ids=email_ids))


def _email_task():
    from .tasks import email_messages

    return email_messages
