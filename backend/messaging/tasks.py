"""Celery tasks for messaging."""
import logging

from celery import shared_task

from utils import notifications as channels

logger = logging.getLogger(__name__)


@shared_task
def email_messages(message_ids):
    """
    Email each message to its recipient, through the school's own email
    settings (utils.notifications), and record how it went on the message.
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
    return sent
