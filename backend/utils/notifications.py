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
from django.conf import settings as django_settings

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
    permanent: bool = False

    @classmethod
    def failure(cls, provider, error):
        """A send that failed but might succeed on a retry."""
        return cls(ok=False, provider=provider, error=str(error))

    @classmethod
    def unavailable(cls, provider, error):
        """
        No credentials for this channel, so there is nothing to retry. Kept
        distinct from `failure` because retrying a school that has simply never
        configured email produces three identical errors per notification, and
        that noise buries the real failures.
        """
        return cls(ok=False, provider=provider, error=str(error), permanent=True)

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


# Values that mean "nobody has set this yet".
_PLACEHOLDER_KEYS = {"", "your-brevo-api-key-here"}


@dataclass
class BrevoCredentials:
    api_key: str
    sender_email: str
    sender_name: str
    provider: str


def _brevo_credentials(tenant):
    """
    Which Brevo account sends for this school, or None if nothing is set up.

    A school's own credentials win. When it has none, the platform account
    carries the message so that a school which never finished the settings
    screen still reaches its parents — asking every school to sign up for an
    email API and paste a key is a step many will not complete, and silently
    dropping "your child arrived at school" is the worst place to discover it.

    The fallback applies only when a school has configured *nothing*. A school
    whose own key is present but rejected fails loudly instead: quietly
    re-sending through the platform account would hide a misconfiguration and
    move the school's mail onto shared sending reputation without anyone
    choosing that.

    Which account was used is recorded on the notification as `brevo` or
    `brevo_platform`, so "who paid for this message, and from what address?"
    stays answerable.
    """
    comm = _communication_settings(tenant)
    if comm and comm.brevo_configured:
        api_key = (comm.brevo_api_key or "").strip()
        sender_email = (comm.brevo_sender_email or "").strip()
        if api_key and sender_email:
            return BrevoCredentials(
                api_key=api_key,
                sender_email=sender_email,
                sender_name=(comm.brevo_sender_name or "").strip()
                            or _school_name(tenant),
                provider="brevo",
            )

    platform_key = (getattr(django_settings, "BREVO_API_KEY", "") or "").strip()
    if platform_key in _PLACEHOLDER_KEYS:
        return None

    # Brevo refuses to send from an address it has not verified, so this only
    # works if DEFAULT_FROM_EMAIL is a verified sender on the platform account.
    platform_sender = (
        getattr(django_settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
    if not platform_sender:
        return None

    return BrevoCredentials(
        api_key=platform_key,
        sender_email=platform_sender,
        # The school's name still shows as the display name, so a parent sees
        # who it is from even though the address belongs to the platform.
        sender_name=_school_name(tenant),
        provider="brevo_platform",
    )


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
        credentials = _brevo_credentials(tenant)
        if credentials is None:
            return SendResult.unavailable(
                self.provider,
                "No Brevo account configured for this school, and no platform "
                "account to fall back on",
            )

        payload = {
            "sender": {
                "name": credentials.sender_name,
                "email": credentials.sender_email,
            },
            "to": [{"email": destination}],
            "subject": subject,
            "textContent": body,
        }
        headers = {
            "accept": "application/json",
            "api-key": credentials.api_key,
            "content-type": "application/json",
        }

        try:
            response = requests.post(
                BREVO_ENDPOINT, json=payload, headers=headers,
                timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.RequestException as error:
            return SendResult.failure(credentials.provider, error)

        if response.status_code in (200, 201, 202):
            message_id = ""
            try:
                message_id = (response.json() or {}).get("messageId", "") or ""
            except ValueError:
                pass
            return SendResult.success(credentials.provider, message_id)

        return SendResult.failure(
            credentials.provider,
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

        # There is no platform fallback for SMS, deliberately: texts cost real
        # money per message, so a school that has not set up an account has not
        # agreed to spend anything, and the platform should not spend it for
        # them. Checked up front so an unconfigured school is skipped rather
        # than retried three times.
        comm = _communication_settings(tenant)
        if not comm or not comm.twilio_configured:
            return SendResult.unavailable(
                self.provider, "SMS is not configured for this school")

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
