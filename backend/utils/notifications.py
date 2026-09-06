"""
Channel-agnostic sending.

One `send()` call, one of several channels underneath, credentials resolved
per tenant. Callers describe *what* to say and *who* to say it to; which
service carries it is configuration, not code.

Adding a provider — Termii, Sendchamp, Arkesel, WhatsApp — means writing one
class with a `deliver()` method and registering it. Nothing above this module
changes. That seam matters here: Nigerian SMS pricing and DND reachability
vary enough between providers that the choice will change at least once, and
it should not be a rewrite when it does.

Note on email: utils.email.send_email_via_brevo is used in about ten places
for verification and invitation mail, and hardcodes both the sender address
and the platform name. Rather than change how all of that mail is sent, this
module has its own tenant-aware sender. The older helper still needs
migrating; it is not this layer's job.
"""
import logging
from dataclasses import dataclass

import requests

logger = logging.getLogger(__name__)

BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"
REQUEST_TIMEOUT = 15


@dataclass
class SendResult:
    """What happened when we tried. Never raises — callers record and move on."""

    ok: bool
    provider: str = ""
    message_id: str = ""
    error: str = ""

    @classmethod
    def failure(cls, provider, error):
        return cls(ok=False, provider=provider, error=str(error))

    @classmethod
    def success(cls, provider, message_id=""):
        return cls(ok=True, provider=provider, message_id=message_id or "")


def _communication_settings(tenant):
    """This tenant's provider credentials, or None. Never another tenant's."""
    if tenant is None:
        return None
    from schoolSettings.models import CommunicationSettings
    return CommunicationSettings.objects.filter(tenant=tenant).first()


def _school_name(tenant):
    if tenant is None:
        return "School"
    return getattr(tenant, "name", None) or "School"


# ── Channels ──────────────────────────────────────────────────────────────────

class Channel:
    """A way of reaching somebody."""

    name = ""
    provider = ""

    def destination_for(self, recipient_profile, user):
        """Where this channel would send. None means unreachable."""
        raise NotImplementedError

    def deliver(self, *, tenant, destination, subject, body):
        raise NotImplementedError


class InAppChannel(Channel):
    """
    Stored, not sent. The notification row *is* the message — the parent reads
    it in the portal. Free, instant, and immune to DND, which is why it is the
    default channel rather than a fallback.
    """

    name = "in_app"
    provider = "in_app"

    def destination_for(self, recipient_profile, user):
        return str(getattr(user, "id", "")) or None

    def deliver(self, *, tenant, destination, subject, body):
        return SendResult.success(self.provider)


class EmailChannel(Channel):
    name = "email"
    provider = "brevo"

    def destination_for(self, recipient_profile, user):
        return (getattr(user, "email", "") or "").strip() or None

    def deliver(self, *, tenant, destination, subject, body):
        comm = _communication_settings(tenant)
        if not comm or not comm.brevo_configured or not comm.brevo_api_key:
            return SendResult.failure(
                self.provider, "Brevo is not configured for this school")

        sender_email = (comm.brevo_sender_email or "").strip()
        if not sender_email:
            return SendResult.failure(
                self.provider, "No sender address configured for this school")

        payload = {
            "sender": {
                "name": (comm.brevo_sender_name or "").strip()
                        or _school_name(tenant),
                "email": sender_email,
            },
            "to": [{"email": destination}],
            "subject": subject,
            "textContent": body,
        }
        headers = {
            "accept": "application/json",
            "api-key": comm.brevo_api_key,
            "content-type": "application/json",
        }

        try:
            response = requests.post(
                BREVO_ENDPOINT, json=payload, headers=headers,
                timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.RequestException as error:
            return SendResult.failure(self.provider, error)

        if response.status_code in (200, 201, 202):
            message_id = ""
            try:
                message_id = (response.json() or {}).get("messageId", "") or ""
            except ValueError:
                pass
            return SendResult.success(self.provider, message_id)

        return SendResult.failure(
            self.provider,
            f"Brevo returned {response.status_code}: {response.text[:500]}",
        )


class SmsChannel(Channel):
    """
    Currently Twilio, because that is what the project already has credentials
    for. For Nigerian volume a local provider with a documented DND corporate
    route is the better answer — see the notes in docs — and swapping it in
    means another Channel subclass here, not changes upstream.
    """

    name = "sms"
    provider = "twilio"

    def destination_for(self, recipient_profile, user):
        candidates = [
            getattr(recipient_profile, "phone", None),
            getattr(user, "phone_number", None),
            getattr(user, "phone", None),
        ]
        for candidate in candidates:
            if candidate and str(candidate).strip():
                return str(candidate).strip()
        return None

    def deliver(self, *, tenant, destination, subject, body):
        from utils.sms import send_sms_via_twilio

        ok, detail, message_sid = send_sms_via_twilio(
            destination, body, tenant=tenant)
        if ok:
            return SendResult.success(self.provider, message_sid or "")
        return SendResult.failure(self.provider, detail)


_CHANNELS = {
    channel.name: channel
    for channel in (InAppChannel(), EmailChannel(), SmsChannel())
}


def get_channel(name):
    """The channel by name, or None if this build has no such channel."""
    return _CHANNELS.get(name)


def send(*, channel, tenant, destination, subject, body):
    """
    Deliver one message. Always returns a SendResult; provider errors are
    reported, never raised, so one unreachable parent cannot break a batch.
    """
    handler = get_channel(channel)
    if handler is None:
        return SendResult.failure(channel or "unknown", "Unknown channel")
    if not destination:
        return SendResult.failure(handler.provider, "No destination")

    try:
        return handler.deliver(
            tenant=tenant, destination=destination,
            subject=subject, body=body,
        )
    except Exception as error:  # noqa: BLE001 - a provider must never escape
        logger.exception("Channel %s failed unexpectedly", channel)
        return SendResult.failure(handler.provider, error)
