"""Celery tasks for messaging."""
import logging

from celery import shared_task

from utils import notifications as channels

logger = logging.getLogger(__name__)


@shared_task
def email_messages(message_ids, bulk_id=None):
    """
    Email each message to its recipient, through the school's own email
    settings (utils.notifications), and record how it went on the message.
    For a bulk send, also settle the bulk message's delivered and failed
    counts, which until now only said how many were queued.
    """
    from .models import Message

    messages = Message.objects.filter(pk__in=message_ids, message_type="email").select_related(
        "tenant", "sender", "recipient")
    email = channels.get_channel("email")
    sent = 0
    for message in messages:
        destination = email.destination_for(None, message.recipient)
        if not destination:
            message.status, message.delivery_status = "failed", "The recipient has no email address"
            message.save(update_fields=["status", "delivery_status"])
            continue
        sender = message.sender.get_full_name() or message.sender.username
        signature = "\n".join(filter(None, [sender, message.tenant.name if message.tenant_id else ""]))
        result = channels.send(
            channel="email", tenant=message.tenant, destination=destination,
            subject=message.subject, body=f"{message.content}\n\n{signature}",
        )
        if result.ok:
            sent += 1
            message.status = "delivered"
            message.external_id = result.message_id or None
            message.save(update_fields=["status", "external_id"])
        else:
            logger.warning("Email for message %s not sent: %s", message.pk, result.error)
            message.status, message.delivery_status = "failed", result.error[:1000]
            message.save(update_fields=["status", "delivery_status"])
    if bulk_id is not None:
        settle_bulk(bulk_id, message_ids)
    return sent


def settle_bulk(bulk_id, message_ids):
    """Count how a bulk email's messages went, and mark the bulk failed if none got through."""
    from .models import BulkMessage, Message

    outcomes = Message.objects.filter(pk__in=message_ids)
    delivered = outcomes.filter(status="delivered").count()
    failed = outcomes.filter(status="failed").count()
    # 'sent' stays for a mix of the two: the counts say how many failed.
    if failed and not delivered:
        status = "failed"
    elif delivered and not failed:
        status = "delivered"
    else:
        status = "sent"
    BulkMessage.objects.filter(pk=bulk_id).update(
        delivered_count=delivered, failed_count=failed, status=status)
