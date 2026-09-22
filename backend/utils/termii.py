"""
Termii, the platform's SMS provider.

One platform account sends every school's texts, and each school pays the
platform per message (tenants.SentSms). Configured in settings:

- TERMII_API_KEY and TERMII_BASE_URL, from the Termii dashboard.
- TERMII_SENDER_ID, a sender ID the account may use (its own once approved,
  or Termii's shared N-Alert). Termii refuses a text that names none, except
  through the Number API.
- TERMII_CHANNEL: "generic" reaches numbers that are not on DND; "dnd"
  reaches every number, once the sender ID is whitelisted for the DND route;
  "number" sends from Termii's own auto-generated numbers through the Number
  API, with no sender ID. Termii allows that only for service alerts and
  notifications, on an account holding at least 2,000 units.
"""
import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PROVIDER = "termii"
REQUEST_TIMEOUT = 15


def normalize_number(raw):
    """
    The number as Termii wants it: international, digits only, no plus.
    A Nigerian local number (08012345678) becomes 2348012345678.
    """
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) == 11 and digits.startswith("0"):
        digits = "234" + digits[1:]
    return digits


NUMBER_CHANNEL = "number"


def _channel():
    return (settings.TERMII_CHANNEL or "generic").strip().lower()


def is_configured():
    if not (settings.TERMII_API_KEY or "").strip():
        return False
    return _channel() == NUMBER_CHANNEL or bool((settings.TERMII_SENDER_ID or "").strip())


def send_sms(to_number, message):
    """
    Send one text. Returns (ok, detail, message_id) and never raises, so one
    unreachable parent cannot break a batch.
    """
    if not is_configured():
        return False, "SMS is not set up on the platform (TERMII_API_KEY, TERMII_SENDER_ID)", None

    number = normalize_number(to_number)
    if len(number) < 10:
        return False, f"Not a phone number: {to_number!r}", None

    base_url = settings.TERMII_BASE_URL.rstrip('/')
    channel = _channel()
    if channel == NUMBER_CHANNEL:
        # Sent from Termii's own numbers: no sender ID, type or channel.
        url = f"{base_url}/api/sms/number/send"
        payload = {"api_key": settings.TERMII_API_KEY.strip(), "to": number, "sms": message}
    else:
        url = f"{base_url}/api/sms/send"
        payload = {
            "api_key": settings.TERMII_API_KEY.strip(),
            "to": number,
            "from": settings.TERMII_SENDER_ID.strip(),
            "sms": message,
            "type": "plain",
            "channel": channel,
        }

    try:
        response = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.RequestException as error:
        return False, f"Termii could not be reached: {error}", None

    try:
        body = response.json() or {}
    except ValueError:
        body = {}

    message_id = body.get("message_id") if isinstance(body, dict) else None
    if response.status_code == 200 and message_id:
        logger.info("SMS to %s sent through Termii (%s): %s", number, channel, message_id)
        return True, body.get("message") or "Sent", str(message_id)

    detail = (body.get("message") if isinstance(body, dict) else "") or response.text[:300]
    return False, f"Termii returned {response.status_code}: {detail}", None
