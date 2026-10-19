"""
Emailing a payment receipt from Nuventa Cloud to the school that paid.

It goes to the owner email the school gave at registration, with any of the
school's other admins copied in, since that address is sometimes one nobody
reads any more. It is sent from the platform's Brevo account, not the
school's: the receipt is from Nuventa Cloud, and a school's own account may
not be set up. With no platform Brevo key configured it goes through Django's
mail backend instead, the console in development.
"""

import base64
import logging
from dataclasses import dataclass

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.mail import EmailMessage
from django.core.validators import validate_email

from .invoice_pdf import _money, receipt_filename, receipt_number, render_receipt_pdf
from .models import PlatformContent

logger = logging.getLogger(__name__)

BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"
REQUEST_TIMEOUT = 20
MAX_CC = 10

# The school admin roles (IsTenantOwner.ADMIN_ROLES).
ADMIN_ROLES = ("superadmin", "admin", "secondary_admin")


class ReceiptEmailError(Exception):
    """Why a receipt could not be sent, in words fit to show the admin."""


@dataclass
class Recipients:
    to: str
    cc: list


def school_admins(tenant):
    """The school's admins who have an email, as {name, email}, owner excluded."""
    owner = (tenant.owner_email or "").strip().lower()
    admins = (get_user_model().objects
              .filter(tenant=tenant, role__in=ADMIN_ROLES, is_active=True)
              .exclude(email="").order_by("first_name", "last_name"))
    seen, result = {owner}, []
    for user in admins:
        email = user.email.strip()
        if email.lower() in seen:
            continue
        seen.add(email.lower())
        result.append({"name": user.get_full_name() or user.username, "email": email})
    return result


def recipients_for(tenant, cc):
    """
    To the owner email, copying `cc`. With no owner email on record, the
    first address copied takes its place.
    """
    addresses = []
    for address in cc or []:
        address = str(address).strip()
        if not address:
            continue
        try:
            validate_email(address)
        except ValidationError:
            raise ReceiptEmailError(f"{address} is not an email address")
        if address.lower() not in (a.lower() for a in addresses):
            addresses.append(address)
    if len(addresses) > MAX_CC:
        raise ReceiptEmailError(f"Copy in at most {MAX_CC} addresses")

    owner = (tenant.owner_email or "").strip()
    addresses = [a for a in addresses if a.lower() != owner.lower()]
    if owner:
        return Recipients(to=owner, cc=addresses)
    if addresses:
        return Recipients(to=addresses[0], cc=addresses[1:])
    raise ReceiptEmailError("The school has no owner email on record. Add an address to copy in.")


def _message(payment, received_from):
    invoice = payment.invoice
    number = receipt_number(payment)
    subject = f"Payment receipt {number} from Nuventa Cloud"
    body = (
        f"Dear {received_from.strip() or invoice.tenant.name},\n\n"
        f"Thank you for your payment of {_money(payment.amount)} towards invoice "
        f"{invoice.invoice_number}. Your receipt, {number}, is attached.\n\n"
        f"Balance remaining on the invoice: {_money(max(invoice.balance_due, 0))}.\n\n"
        "Nuventa Cloud"
    )
    return subject, body


def send_receipt(payment, *, cc=None, received_from="", note="", issued_by=""):
    """Email the receipt; return the Recipients it went to. Raises ReceiptEmailError."""
    tenant = payment.invoice.tenant
    recipients = recipients_for(tenant, cc)
    pdf = render_receipt_pdf(
        payment, received_from=received_from, note=note, issued_by=issued_by)
    filename = receipt_filename(payment)
    subject, body = _message(payment, received_from)
    reply_to = (PlatformContent.load().contact_email or "").strip()

    api_key = (getattr(settings, "BREVO_API_KEY", "") or "").strip()
    if api_key and api_key != "your-brevo-api-key-here":
        payload = {
            "sender": {"name": "Nuventa Cloud", "email": settings.DEFAULT_FROM_EMAIL},
            "to": [{"email": recipients.to}],
            "subject": subject,
            "textContent": body,
            "attachment": [{"name": filename, "content": base64.b64encode(pdf).decode()}],
        }
        if recipients.cc:
            payload["cc"] = [{"email": a} for a in recipients.cc]
        if reply_to:
            payload["replyTo"] = {"email": reply_to, "name": "Nuventa Cloud"}
        try:
            response = requests.post(
                BREVO_ENDPOINT, json=payload, timeout=REQUEST_TIMEOUT, headers={
                    "accept": "application/json", "api-key": api_key,
                    "content-type": "application/json"})
        except requests.exceptions.RequestException as error:
            logger.warning("Receipt %s not sent: %s", filename, error)
            raise ReceiptEmailError("Could not reach the email service. Please try again.")
        if response.status_code not in (200, 201, 202):
            logger.warning("Receipt %s not sent: Brevo %s %s",
                           filename, response.status_code, response.text[:500])
            raise ReceiptEmailError("The email service refused the receipt. Please try again.")
    else:
        message = EmailMessage(
            subject, body, settings.DEFAULT_FROM_EMAIL, [recipients.to], cc=recipients.cc,
            reply_to=[reply_to] if reply_to else None)
        message.attach(filename, pdf, "application/pdf")
        message.send()

    logger.info("Receipt %s emailed to %s, cc %s", filename, recipients.to, recipients.cc)
    return recipients
