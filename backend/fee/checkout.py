"""
Parents paying a term's fees, into the school's own Paystack account.

A parent sees one bill per child per term: every fee issued to that child for
that term (fee.billing), what was knocked off, what's been paid and what is
still owed. Paying it is one Paystack charge for everything still owed.

Each fee in the charge gets a PaymentAttempt, and they all carry the same
Paystack reference. When Paystack says the charge went through, by the parent
coming back to the dashboard (verify) or by the school's webhook, whichever
is first, `settle` turns each attempt into a verified Payment on its fee,
all under one receipt number. Settling twice records nothing new, so the two
can race harmlessly.
"""
import uuid
from collections import OrderedDict
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from parent.models import ParentProfile

from .models import Payment, PaymentAttempt, PaymentGatewayConfig, StudentFee
from .services.paystack_service import PaystackNotConfigured, PaystackService

TERM_ORDER = {"FIRST": 1, "SECOND": 2, "THIRD": 3}


class CheckoutError(Exception):
    """The payment cannot go ahead as asked; the message says why."""


def parent_of(user, tenant):
    """The user's parent profile at this school, or None."""
    if tenant is None or not getattr(user, "is_authenticated", False):
        return None
    return ParentProfile.objects.filter(user=user, tenant=tenant).first()


def can_pay_online(tenant):
    config = PaymentGatewayConfig.objects.filter(
        tenant=tenant, gateway="PAYSTACK", is_active=True).first()
    return bool(config and (config.secret_key or "").strip()
                and (config.public_key or "").strip())


def _money(value):
    return str(Decimal(value).quantize(Decimal("0.01")))


def _bill_line(fee):
    return {
        "id": fee.id,
        "name": fee.fee_structure.name,
        "fee_type": fee.fee_structure.fee_type,
        "amount_due": _money(fee.amount_due),
        "discount": _money(fee.discount_amount),
        "paid": _money(fee.amount_paid),
        "balance": _money(max(fee.balance, Decimal("0"))),
        "status": fee.status,
        "due_date": fee.due_date,
    }


def family_bills(parent):
    """
    Every child of this parent at this school, each with a bill per term,
    newest term first.
    """
    tenant = parent.tenant
    children = list(parent.get_students().select_related("user", "student_class"))
    fees = (StudentFee.objects
            .filter(tenant=tenant, student__in=children)
            .exclude(status="CANCELLED")
            .select_related("fee_structure", "academic_session")
            .order_by("fee_structure__name", "id"))

    terms_of = {child.id: OrderedDict() for child in children}
    for fee in fees:
        key = (fee.academic_session_id, fee.term)
        terms_of[fee.student_id].setdefault(key, []).append(fee)

    receipts = {}
    for payment in (Payment.objects
                    .filter(tenant=tenant, verified=True,
                            student_fee__student__in=children)
                    .exclude(receipt_number__isnull=True)
                    .select_related("student_fee")
                    .order_by("-payment_date")):
        fee = payment.student_fee
        key = (fee.student_id, fee.academic_session_id, fee.term)
        seen = receipts.setdefault(key, OrderedDict())
        if payment.gateway_reference or payment.reference:
            ref = payment.gateway_reference or payment.reference
            if ref not in seen:
                seen[ref] = {
                    "reference": ref,
                    "receipt_number": payment.receipt_number,
                    "paid_at": payment.payment_date,
                    "amount": Decimal("0"),
                }
            seen[ref]["amount"] += payment.amount

    result = []
    for child in children:
        bills = []
        for (session_id, term), items in terms_of[child.id].items():
            session = items[0].academic_session
            total_due = sum((f.amount_due for f in items), Decimal("0"))
            discount = sum((f.discount_amount for f in items), Decimal("0"))
            paid = sum((f.amount_paid for f in items), Decimal("0"))
            balance = sum((max(f.balance, Decimal("0")) for f in items), Decimal("0"))
            paid_receipts = list(receipts.get((child.id, session_id, term), {}).values())
            for receipt in paid_receipts:
                receipt["amount"] = _money(receipt["amount"])
            bills.append({
                "academic_session_id": session_id,
                "academic_session": session.name,
                "term": term,
                "term_display": items[0].get_term_display(),
                "items": [_bill_line(f) for f in items],
                "total_due": _money(total_due),
                "discount": _money(discount),
                "paid": _money(paid),
                "balance": _money(balance),
                "due_date": min(f.due_date for f in items),
                "is_overdue": balance > 0 and any(f.is_overdue for f in items),
                "receipts": paid_receipts,
            })
        bills.sort(key=lambda b: (b["academic_session"], TERM_ORDER.get(b["term"], 0)),
                   reverse=True)
        result.append({
            "student_id": child.id,
            "student": child.full_name,
            "student_class": child.student_class.name if child.student_class else None,
            "bills": bills,
        })
    return {"can_pay_online": can_pay_online(tenant), "children": result}


def start(parent, student_id, academic_session_id, term, callback_url):
    """
    Open a Paystack checkout for everything a child still owes for one term.
    Returns where to send the parent, and the reference to verify on return.
    """
    tenant = parent.tenant
    child = parent.get_students().filter(id=student_id).first()
    if child is None:
        raise CheckoutError("That child is not linked to your account.")

    owed = [fee for fee in (StudentFee.objects
                            .filter(tenant=tenant, student=child,
                                    academic_session_id=academic_session_id, term=term)
                            .exclude(status="CANCELLED")
                            .select_related("fee_structure"))
            if fee.balance > 0]
    if not owed:
        raise CheckoutError("Nothing is owed for that term.")

    email = (parent.user.email or "").strip()
    if not email:
        raise CheckoutError(
            "Paystack needs an email address for the receipt. Ask the school "
            "to add one to your account.")
    if callback_url and not callback_url.startswith(("https://", "http://")):
        raise CheckoutError("That return address is not a web address.")

    try:
        paystack = PaystackService.for_school(tenant)
    except PaystackNotConfigured:
        raise CheckoutError("The school has not set up online payment yet.")

    total = sum((fee.balance for fee in owed), Decimal("0"))
    reference = f"FEES-{uuid.uuid4().hex[:20].upper()}"
    attempts = [
        PaymentAttempt.objects.create(
            tenant=tenant, student_fee=fee, amount=fee.balance, gateway="PAYSTACK",
            attempt_reference=reference, status="PENDING")
        for fee in owed
    ]

    result = paystack.initialize_payment(
        email=email, amount=total, reference=reference, callback_url=callback_url,
        metadata={
            "purpose": "school_fees",
            "tenant": str(tenant.id),
            "student_id": child.id,
            "academic_session_id": academic_session_id,
            "term": term,
            "custom_fields": [
                {"display_name": "Student", "variable_name": "student",
                 "value": child.full_name},
                {"display_name": "Term", "variable_name": "term",
                 "value": f"{owed[0].get_term_display()} {owed[0].academic_session.name}"},
            ],
        })
    data = result.get("data") or {}
    if not result.get("status") or not data.get("authorization_url"):
        PaymentAttempt.objects.filter(id__in=[a.id for a in attempts]).update(
            status="FAILED",
            error_message=result.get("message") or "Paystack did not start the payment.")
        raise CheckoutError("Paystack did not start the payment. Try again shortly.")

    PaymentAttempt.objects.filter(id__in=[a.id for a in attempts]).update(
        status="PROCESSING")
    return {
        "reference": reference,
        "authorization_url": data["authorization_url"],
        "access_code": data.get("access_code"),
        "amount": _money(total),
    }


def _next_receipt_number(tenant):
    year = datetime.now().year
    prefix = f"RCT{year}"
    issued = (Payment.objects
              .filter(tenant=tenant, receipt_number__startswith=prefix)
              .values("receipt_number").distinct().count())
    return f"{prefix}{issued + 1:06d}"


def _method(channel):
    return "PAYSTACK_CARD" if channel == "card" else "PAYSTACK_BANK"


@transaction.atomic
def settle(tenant, reference, transaction_data):
    """
    Record what Paystack says became of one checkout. Returns the receipt if
    it was paid, else None. Settling a paid checkout again changes nothing.
    """
    attempts = list(PaymentAttempt.objects
                    .select_for_update()
                    .filter(tenant=tenant, gateway="PAYSTACK", attempt_reference=reference)
                    .select_related("student_fee")
                    .order_by("id"))
    if not attempts:
        raise CheckoutError("No payment of this school carries that reference.")
    if all(a.payment_id for a in attempts):
        return receipt(tenant, reference)

    outcome = transaction_data.get("status")
    if outcome != "success":
        # "abandoned" and "ongoing" are left open: the parent may still finish.
        if outcome in ("failed", "reversed"):
            for attempt in attempts:
                attempt.status = "FAILED"
                attempt.error_message = transaction_data.get("gateway_response") or outcome
                attempt.gateway_response = transaction_data
                attempt.save()
        return None

    expected = sum(int(a.amount * 100) for a in attempts)
    if transaction_data.get("amount") != expected or transaction_data.get("currency", "NGN") != "NGN":
        for attempt in attempts:
            attempt.status = "FAILED"
            attempt.error_message = (
                f"Paystack reports {transaction_data.get('amount')} kobo, "
                f"expected {expected}. Not credited.")
            attempt.gateway_response = transaction_data
            attempt.save()
        raise CheckoutError("The amount Paystack received does not match the bill.")

    customer = transaction_data.get("customer") or {}
    card = transaction_data.get("authorization") or {}
    paid_at = timezone.now()
    receipt_number = _next_receipt_number(tenant)
    payer_name = " ".join(
        part for part in (customer.get("first_name"), customer.get("last_name")) if part)

    for n, attempt in enumerate(attempts, start=1):
        payment = Payment.objects.create(
            tenant=tenant,
            student_fee=attempt.student_fee,
            reference=f"{reference}-{n}",
            amount=attempt.amount,
            payment_gateway="PAYSTACK",
            payment_method=_method(transaction_data.get("channel")),
            status="PAID",
            gateway_status="SUCCESS",
            verified=True,
            verification_date=paid_at,
            gateway_reference=reference,
            gateway_transaction_id=str(transaction_data.get("id") or ""),
            gateway_response=transaction_data,
            payer_email=customer.get("email"),
            payer_name=payer_name or None,
            card_last_four=card.get("last4"),
            card_type=card.get("card_type"),
            bank_name=card.get("bank"),
            receipt_number=receipt_number,
            description=f"{attempt.student_fee.fee_structure.name}, "
                        f"{attempt.student_fee.get_term_display()}",
        )
        attempt.payment = payment
        attempt.status = "SUCCESS"
        attempt.gateway_response = transaction_data
        attempt.save()

    return receipt(tenant, reference)


def verify(parent, reference):
    """
    The parent is back from Paystack: ask the school's account what happened
    and settle it. Only the parent's own children's checkouts can be asked about.
    """
    tenant = parent.tenant
    children = parent.get_students()
    attempts = PaymentAttempt.objects.filter(
        tenant=tenant, gateway="PAYSTACK", attempt_reference=reference)
    if not attempts.exists() or attempts.exclude(student_fee__student__in=children).exists():
        raise CheckoutError("No payment of yours carries that reference.")

    if all(a.payment_id for a in attempts):
        return {"status": "paid", "receipt": receipt(tenant, reference)}

    try:
        paystack = PaystackService.for_school(tenant)
    except PaystackNotConfigured:
        raise CheckoutError("The school has not set up online payment yet.")
    result = paystack.verify_payment(reference)
    data = result.get("data") or {}
    if not result.get("status") or not data:
        raise CheckoutError("Paystack could not be asked about that payment. Try again shortly.")

    paid = settle(tenant, reference, data)
    if paid:
        return {"status": "paid", "receipt": paid}
    return {"status": data.get("status") or "unknown", "receipt": None,
            "message": data.get("gateway_response")}


def receipt(tenant, reference, children=None):
    """One checkout's receipt: what was paid for which child, and when."""
    payments = (Payment.objects
                .filter(tenant=tenant, verified=True, gateway_reference=reference)
                .select_related("student_fee__student__user", "student_fee__fee_structure",
                                "student_fee__academic_session")
                .order_by("reference"))
    if children is not None:
        payments = payments.filter(student_fee__student__in=children)
    payments = list(payments)
    if not payments:
        return None

    first = payments[0]
    fee = first.student_fee
    return {
        "receipt_number": first.receipt_number,
        "reference": reference,
        "school": tenant.name,
        "student": fee.student.full_name,
        "academic_session": fee.academic_session.name,
        "term": fee.get_term_display(),
        "paid_at": first.verification_date or first.payment_date,
        "payer_name": first.payer_name,
        "payer_email": first.payer_email,
        "method": first.get_payment_method_display(),
        "card_last_four": first.card_last_four,
        "lines": [{"name": p.student_fee.fee_structure.name, "amount": _money(p.amount)}
                  for p in payments],
        "total": _money(sum((p.amount for p in payments), Decimal("0"))),
    }
