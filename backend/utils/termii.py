"""
Termii, the platform's SMS provider.

One platform account sends every school's texts, and each school pays the
platform per message (tenants.SentSms). Configured in settings:

- TERMII_API_KEY and TERMII_BASE_URL, from the Termii dashboard.
- TERMII_SENDER_ID, a sender ID approved on that account. Termii refuses a
  text that names none.
- TERMII_CHANNEL: "generic" reaches numbers that are not on DND; "dnd"
  reaches every number, once the sender ID is approved for the DND route.
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


def is_configured():
    return bool(
        (settings.TERMII_API_KEY or "").strip() and (settings.TERMII_SENDER_ID or "").strip())


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

    payload = {
        "api_key": settings.TERMII_API_KEY.strip(),
        "to": number,
        "from": settings.TERMII_SENDER_ID.strip(),
        "sms": message,
        "type": "plain",
        "channel": (settings.TERMII_CHANNEL or "generic").strip(),
    }
    url = f"{settings.TERMII_BASE_URL.rstrip('/')}/api/sms/send"

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
        logger.info("SMS to %s sent through Termii: %s", number, message_id)
        return True, body.get("message") or "Sent", str(message_id)

    detail = (body.get("message") if isinstance(body, dict) else "") or response.text[:300]
    return False, f"Termii returned {response.status_code}: {detail}", None
