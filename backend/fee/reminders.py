"""
Telling parents what their children still owe.

A reminder goes to each parent linked to a student with an unpaid fee: by
email, which is free in the Basic package, and by SMS if the school asks for
it and has the SMS add-on on (SMS_PRICE_PER_MESSAGE a text, on its next
invoice). One message per parent per child covers all of that child's unpaid
fees, so a parent with two fees outstanding pays for one text, not two.

Every message is saved as a PaymentReminder before anything is sent, then
delivered by deliver(): on a Celery worker when one is running, otherwise in
the request (CELERY_TASK_ALWAYS_EAGER). A message the request did not get to
stays queued - not sent, no error - and the next deliver() sends it, so
nothing is lost and nothing is sent twice.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from parent.models import ParentStudentRelationship
from tenants.models import SMS_PRICE_PER_MESSAGE, TenantService
from utils import notifications

from .models import PaymentReminder, StudentFee

UNPAID = ("PENDING", "PARTIAL", "OVERDUE")
CHANNELS = ("email", "sms")

# Not the same fee to the same parent on the same channel twice within this:
# it guards against a double click, and against paying for one text twice.
RESEND_AFTER = timedelta(hours=24)

# One SMS page. The text is kept to GSM characters (NGN, not the naira sign)
# because a single non-GSM character halves what fits and doubles the price.
SMS_LENGTH = 160


class ReminderError(Exception):
    """The reminders cannot be sent as asked; the message says why."""


@dataclass
class Message:
    channel: str
    recipient: str
    subject: str
    body: str
    fees: list


def unpaid_fees(tenant, student_ids=None):
    fees = (
        StudentFee.objects
        .filter(tenant=tenant, status__in=UNPAID)
        .select_related("student__user", "fee_structure")
        .order_by("student_id", "due_date")
    )
    if student_ids:
        fees = fees.filter(student_id__in=student_ids)
    return [fee for fee in fees if fee.balance > 0]


def _student_name(student):
    return student.user.get_full_name() or student.user.username


def _email(school, parent_name, student_name, fees):
    lines = "\n".join(
        f"- {fee.fee_structure.name}: ₦{fee.balance:,.2f}, due {fee.due_date:%d %B %Y}"
        for fee in fees)
    total = sum(fee.balance for fee in fees)
    body = (
        f"Dear {parent_name},\n\n"
        f"This is a reminder from {school} that {student_name} has school fees outstanding:\n\n"
        f"{lines}\n\n"
        f"Total outstanding: ₦{total:,.2f}\n\n"
        "Please pay at your earliest convenience. If you have already paid, "
        "please ignore this message.\n\n"
        f"{school}"
    )
    return f"School fees reminder for {student_name}", body


def _sms(school, student_name, fees):
    total = sum(fee.balance for fee in fees)
    due = min(fee.due_date for fee in fees)
    rest = (f"{student_name} owes NGN {total:,.0f} in school fees, due {due:%d/%m/%Y}. "
            "Please pay promptly. Ignore if already paid.")
    room = SMS_LENGTH - len(rest) - 2
    if room < 3:
        return rest[:SMS_LENGTH]
    return f"{school[:room]}: {rest}"


def plan(tenant, channel_names, student_ids=None):
    """
    The messages a send would go out as, and what stops the rest:
    (messages, no_address, already_reminded, students_owing), the counts
    keyed by channel.
    """
    fees_by_student = defaultdict(list)
    for fee in unpaid_fees(tenant, student_ids):
        fees_by_student[fee.student].append(fee)

    parents_by_student = defaultdict(list)
    links = (ParentStudentRelationship.objects
             .filter(student__in=list(fees_by_student))
             .select_related("parent__user"))
    for link in links:
        parents_by_student[link.student_id].append(link.parent)

    all_fees = [fee for fees in fees_by_student.values() for fee in fees]
    recently = set(
        PaymentReminder.objects
        .filter(tenant=tenant, student_fee__in=all_fees, error="",
                created_at__gte=timezone.now() - RESEND_AFTER)
        .values_list("student_fee_id", "channel", "recipient"))

    school = tenant.name
    messages = []
    no_address = defaultdict(int)
    already_reminded = defaultdict(int)
    for student, fees in fees_by_student.items():
        student_name = _student_name(student)
        for parent in parents_by_student[student.id]:
            parent_name = parent.user.get_full_name() or "Parent"
            for name in channel_names:
                recipient = notifications.get_channel(name).destination_for(parent, parent.user)
                if not recipient:
                    no_address[name] += 1
                    continue
                due = [fee for fee in fees if (fee.id, name, recipient) not in recently]
                if not due:
                    already_reminded[name] += 1
                    continue
                if name == "email":
                    subject, body = _email(school, parent_name, student_name, due)
                else:
                    subject, body = "", _sms(school, student_name, due)
                messages.append(Message(name, recipient, subject, body, due))
    return messages, no_address, already_reminded, len(fees_by_student)


def _checked_channels(tenant, channel_names):
    chosen = [name for name in CHANNELS if name in set(channel_names or [])]
    if not chosen:
        raise ReminderError("Choose email, SMS or both.")
    if "sms" in chosen and not TenantService.is_on(tenant, "sms_notifications"):
        raise ReminderError(
            "Switch on the SMS add-on under Settings → Services to send reminders by SMS.")
    return chosen


def preview(tenant, student_ids=None):
    """What reminding everyone who owes would send now, and what the texts would cost."""
    sms_on = TenantService.is_on(tenant, "sms_notifications")
    messages, no_address, already_reminded, students = plan(
        tenant, CHANNELS, student_ids)
    fees = unpaid_fees(tenant, student_ids)
    texts = sum(1 for m in messages if m.channel == "sms")
    return {
        "students_owing": students,
        "total_outstanding": str(sum((fee.balance for fee in fees), 0)),
        "email_messages": sum(1 for m in messages if m.channel == "email"),
        "sms_messages": texts,
        "no_email": no_address["email"],
        "no_phone": no_address["sms"],
        "already_reminded": dict(already_reminded),
        "sms_enabled": sms_on,
        "sms_price": str(SMS_PRICE_PER_MESSAGE),
        "sms_cost": str(SMS_PRICE_PER_MESSAGE * texts),
    }


def send_reminders(tenant, channel_names, student_ids=None):
    """Queue a reminder to every parent who should get one, deliver them, and report."""
    from .tasks import deliver_payment_reminders

    chosen = _checked_channels(tenant, channel_names)
    messages, no_address, already_reminded, students = plan(tenant, chosen, student_ids)
    today = timezone.localdate()

    with transaction.atomic():
        rows = PaymentReminder.objects.bulk_create([
            PaymentReminder(
                tenant=tenant, student_fee=fee, channel=message.channel,
                recipient=message.recipient, message=message.body,
                reminder_type="OVERDUE" if fee.due_date < today else "DUE_DATE")
            for message in messages for fee in message.fees
        ])
    ids = [row.id for row in rows]
    if ids:
        # Runs here and now unless a Celery worker is running.
        deliver_payment_reminders.delay(ids)

    summary = {"students_owing": students}
    for name in chosen:
        sent_rows = PaymentReminder.objects.filter(id__in=ids, channel=name)
        # Counted per message, not per fee: one message can cover several.
        by_message = {}
        for row in sent_rows:
            by_message[(row.recipient, row.message)] = row
        delivered = [row for row in by_message.values() if row.is_sent]
        failed = [row for row in by_message.values() if not row.is_sent and row.error]
        summary[name] = {
            "sent": len(delivered),
            "failed": len(failed),
            "queued": len(by_message) - len(delivered) - len(failed),
            "no_address": no_address[name],
            "already_reminded": already_reminded[name],
        }
    if "sms" in summary:
        summary["sms"]["cost"] = str(SMS_PRICE_PER_MESSAGE * summary["sms"]["sent"])
    return summary


def deliver(reminder_ids=None):
    """
    Send queued reminders. Rows that make up one message - the same parent,
    channel and text for several fees - are sent once and marked together.
    """
    queued = (PaymentReminder.objects
              .filter(is_sent=False, error="")
              .select_related("tenant", "student_fee__student__user")
              .order_by("id"))
    if reminder_ids is not None:
        queued = queued.filter(id__in=reminder_ids)

    groups = defaultdict(list)
    for row in queued:
        groups[(row.tenant_id, row.channel, row.recipient, row.message)].append(row)

    sent = failed = 0
    for (_, channel, recipient, body), rows in groups.items():
        student_name = _student_name(rows[0].student_fee.student)
        result = notifications.send(
            channel=channel, tenant=rows[0].tenant, destination=recipient,
            subject=f"School fees reminder for {student_name}", body=body)
        ids = [row.id for row in rows]
        if result.ok:
            PaymentReminder.objects.filter(id__in=ids).update(is_sent=True)
            sent += 1
        else:
            PaymentReminder.objects.filter(id__in=ids).update(
                error=(result.error or "Not sent")[:1000])
            failed += 1
    return {"sent": sent, "failed": failed}
