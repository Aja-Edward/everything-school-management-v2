"""
Telling parents their child arrived or left.

Two things shape this module.

**The gate must never wait on a provider.** Queueing is a few database writes
and nothing else; actual delivery happens on Celery. That matters more than it
looks: CELERY_TASK_ALWAYS_EAGER is set whenever no worker is running, so a
naive `.delay()` would run Twilio inline and make every child at the gate wait
on an HTTP round-trip. So handoff happens only when a real worker exists, and
otherwise rows sit QUEUED for `flush_pending_scan_notifications` to pick up.
Queued work is never lost, and the queue is visible.

**Volume is the cost, not the per-message rate.** Alerting on every crossing
is roughly 190,000 messages a year for a 500-pupil school. The tenant's
`alert_policy` decides whether parents hear about every scan or only the
unexpected ones, and SMS stays opt-in per parent.
"""
import logging

from django.conf import settings as django_settings
from django.db import IntegrityError, transaction

from parent.models import ParentStudentRelationship
from utils import notifications as channels

from .models import (
    AlertPolicy,
    NotificationChannel,
    NotificationStatus,
    ParentAlertPreference,
    ScanDirection,
    ScanNotification,
)

logger = logging.getLogger(__name__)

# Warnings that make a scan worth reporting even under anomalies-only.
#
# late_arrival belongs here for the same reason before_opening does: a parent
# who hears nothing assumes the ordinary happened. Arriving after the start of
# the day is not ordinary, and render_message already writes the line for it —
# leaving it out meant the copy existed for an alert that never sent.
ANOMALY_WARNINGS = frozenset({
    "late_arrival",
    "early_departure",
    "exit_without_entry",
    "exit_before_entry",
    "before_opening",
})


# ── Policy ────────────────────────────────────────────────────────────────────

def is_notifiable(outcome, settings):
    """
    Whether this scan should reach a parent at all.

    A duplicate or a replay never does — a nervous second tap at the gate must
    not send a second message. Beyond that the school's policy decides.
    """
    if not outcome.notifiable:
        return False
    if settings.alert_policy == AlertPolicy.ALL_SCANS:
        return True
    return bool(ANOMALY_WARNINGS.intersection(outcome.warnings))


def preferences_for(parent):
    """
    This parent's choices, defaulting without writing a row.

    Read-on-write is worth avoiding here: this runs on the gate path, and a
    parent who has never opened the settings screen should not cause an INSERT
    every time their child walks in.
    """
    existing = getattr(parent, "alert_preference", None)
    if existing is not None:
        return existing
    return ParentAlertPreference(parent=parent)


# ── Message text ──────────────────────────────────────────────────────────────

def render_message(outcome, student, school_name):
    """
    The words a parent actually reads.

    Deliberately plain and short. An SMS is billed per 160 characters, and a
    parent glancing at a phone at 07:45 wants the fact, not prose.
    """
    name = _student_name(student) or "Your child"
    local_time = _local_time_string(outcome)

    if outcome.scan.direction == ScanDirection.IN:
        headline = f"{name} arrived at school at {local_time}."
        subject = f"{name} has arrived at school"
    else:
        headline = f"{name} left school at {local_time}."
        subject = f"{name} has left school"

    extras = []
    if "late_arrival" in outcome.warnings:
        extras.append("This was after the start of the school day.")
    if "early_departure" in outcome.warnings:
        extras.append("This was before normal dismissal time.")
    if "exit_without_entry" in outcome.warnings:
        extras.append("No arrival was recorded for them today.")

    body = " ".join([headline] + extras + [f"- {school_name}"])
    return subject, body


def _student_name(student):
    user = getattr(student, "user", None)
    if not user:
        return ""
    return f"{user.first_name} {user.last_name}".strip()


def _local_time_string(outcome):
    scanned_at = outcome.scan.scanned_at
    tzinfo = getattr(outcome, "tzinfo", None)
    if tzinfo is not None:
        scanned_at = scanned_at.astimezone(tzinfo)
    return scanned_at.strftime("%H:%M")


# ── Recipients ────────────────────────────────────────────────────────────────

def recipients_for(tenant, student):
    """
    The parents linked to this child, with their preferences.

    Uses ParentStudentRelationship directly so the tenant filter applies to
    the link as well as to the parent — a relationship row that somehow points
    across tenants must not leak a child's movements.
    """
    links = (
        ParentStudentRelationship.objects
        .filter(tenant=tenant, student=student)
        .select_related("parent__user", "parent__alert_preference")
    )
    seen = set()
    for link in links:
        parent = link.parent
        if parent is None or parent.user_id is None:
            continue
        if parent.user_id in seen:
            continue
        seen.add(parent.user_id)
        yield parent


# ── Queueing ──────────────────────────────────────────────────────────────────

def queue_scan_notifications(outcome, *, tenant, settings):
    """
    Create the notification rows for one scan and hand them to Celery.

    Returns the rows created — empty when the policy says nothing to send.
    Never raises: a gate must record the scan even if alerting is broken.
    """
    try:
        if not is_notifiable(outcome, settings):
            return []

        student = outcome.scan.student
        school_name = getattr(tenant, "name", "") or "School"
        outcome.tzinfo = settings.tzinfo
        subject, body = render_message(outcome, student, school_name)

        created = []
        for parent in recipients_for(tenant, student):
            preference = preferences_for(parent)
            for channel_name in preference.channels():
                row = _queue_one(
                    tenant=tenant,
                    outcome=outcome,
                    student=student,
                    parent=parent,
                    channel_name=channel_name,
                    subject=subject,
                    body=body,
                )
                if row is not None:
                    created.append(row)

        _handoff(created)
        return created
    except Exception:  # noqa: BLE001 - alerting must not break the gate
        logger.exception(
            "Queueing notifications failed for scan %s",
            getattr(outcome.scan, "id", None),
        )
        return []


def _queue_one(*, tenant, outcome, student, parent, channel_name, subject, body):
    channel = channels.get_channel(channel_name)
    if channel is None:
        return None

    destination = channel.destination_for(parent, parent.user)

    defaults = {
        "student": student,
        "subject": subject if channel_name != NotificationChannel.SMS else "",
        "body": body,
        "destination": destination or "",
    }
    if not destination:
        # Keep the row: "we had no phone number for this parent" is the answer
        # to a complaint, and an empty one is invisible.
        defaults["status"] = NotificationStatus.SKIPPED
        defaults["error"] = "No destination for this channel"

    try:
        with transaction.atomic():
            row, created = ScanNotification.objects.get_or_create(
                tenant=tenant,
                scan=outcome.scan,
                recipient=parent.user,
                channel=channel_name,
                defaults=defaults,
            )
    except IntegrityError:
        return None

    if not created:
        return None

    # In-app needs no provider call; it is delivered the moment it is stored.
    if created and channel_name == NotificationChannel.IN_APP and destination:
        row.mark_sent(provider="in_app")
        return None

    if row.status == NotificationStatus.SKIPPED:
        return None
    return row


def _handoff(rows):
    """
    Push queued rows onto Celery, but only when a worker will pick them up.

    With CELERY_TASK_ALWAYS_EAGER, .delay() runs the provider call inline on
    the request thread — which is exactly what must not happen at a gate. In
    that case the rows stay QUEUED for the flush task.
    """
    if not rows:
        return
    if getattr(django_settings, "CELERY_TASK_ALWAYS_EAGER", False):
        logger.info(
            "No Celery worker configured; %s notification(s) left queued "
            "for flush_pending_scan_notifications.",
            len(rows),
        )
        return

    from .tasks import send_scan_notification

    for row in rows:
        try:
            send_scan_notification.delay(row.id)
        except Exception:  # noqa: BLE001 - broker down is not the gate's problem
            logger.exception(
                "Could not enqueue notification %s; left queued.", row.id)


# ── Delivery ──────────────────────────────────────────────────────────────────

def deliver(notification):
    """
    Send one queued notification. Called from Celery, safe to call directly.

    Idempotent on status: a row already sent is left alone, so a retried task
    cannot text a parent twice.
    """
    if notification.status == NotificationStatus.SENT:
        return notification

    channel = channels.get_channel(notification.channel)
    if channel is None:
        notification.mark_failed(f"Unknown channel {notification.channel}")
        return notification

    if not notification.destination:
        notification.mark_skipped("No destination for this channel")
        return notification

    notification.attempts += 1
    notification.save(update_fields=["attempts"])

    result = channels.send(
        channel=notification.channel,
        tenant=notification.tenant,
        destination=notification.destination,
        subject=notification.subject,
        body=notification.body,
    )

    if result.ok:
        notification.mark_sent(
            provider=result.provider, message_id=result.message_id)
    elif result.permanent:
        # Nothing to retry — the school has no credentials for this channel.
        # Recorded as skipped so it does not sit in the failed pile being
        # retried, where it would bury failures that are worth looking at.
        notification.provider = result.provider or notification.provider
        notification.mark_skipped(result.error)
    else:
        notification.mark_failed(result.error, provider=result.provider)
    return notification
