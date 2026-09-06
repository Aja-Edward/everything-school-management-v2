"""
Celery tasks for parent notifications.

`send_scan_notification` handles one message. `flush_pending_scan_notifications`
sweeps anything still queued — which is everything, on a deployment with no
Celery worker, since the gate deliberately declines to send inline. Run it on
beat, or by hand, or parents get nothing.
"""
import logging

from celery import shared_task
from django.utils import timezone

from .models import NotificationStatus, ScanNotification
from .notifications import deliver

logger = logging.getLogger(__name__)

# A safety valve on the sweeper, so one run cannot sit on a worker all day.
FLUSH_BATCH_SIZE = 200

# Retry ceiling for a permanently unreachable destination.
MAX_ATTEMPTS = 3


@shared_task
def send_scan_notification(notification_id):
    """Deliver one queued notification."""
    notification = (
        ScanNotification.objects
        .filter(id=notification_id)
        .select_related("tenant", "recipient", "student__user")
        .first()
    )
    if notification is None:
        logger.warning(
            "send_scan_notification: %s no longer exists", notification_id)
        return None

    deliver(notification)
    return notification.status


@shared_task
def flush_pending_scan_notifications(limit=FLUSH_BATCH_SIZE):
    """
    Send everything still waiting.

    Picks up both notifications queued while no worker was running and ones
    whose provider call failed, up to MAX_ATTEMPTS. Returns a small summary so
    a beat log says something useful.
    """
    pending = (
        ScanNotification.objects
        .filter(
            status__in=[NotificationStatus.QUEUED, NotificationStatus.FAILED],
            attempts__lt=MAX_ATTEMPTS,
        )
        .select_related("tenant", "recipient", "student__user")
        .order_by("queued_at")[:limit]
    )

    sent = failed = 0
    for notification in pending:
        deliver(notification)
        if notification.status == NotificationStatus.SENT:
            sent += 1
        else:
            failed += 1

    if sent or failed:
        logger.info(
            "flush_pending_scan_notifications: %s sent, %s still failing",
            sent, failed,
        )
    return {"sent": sent, "failed": failed, "checked_at": timezone.now().isoformat()}
