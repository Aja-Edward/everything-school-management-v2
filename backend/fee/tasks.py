from celery import shared_task
from django.utils import timezone


@shared_task
def deliver_payment_reminders(reminder_ids=None):
    """
    Send queued fee reminders (fee.reminders): the ones given, or every one
    still queued. Replaces a reminder task that used fields PaymentReminder
    never had and emailed the student rather than the parents.
    """
    from .reminders import deliver

    return deliver(reminder_ids)


@shared_task
def update_overdue_fees():
    """Update overdue fee statuses"""
    from .models import StudentFee

    updated_count = StudentFee.objects.filter(
        due_date__lt=timezone.now().date(), status__in=["PENDING", "PARTIAL"]
    ).update(status="OVERDUE")

    return f"Updated {updated_count} fees to overdue status"


@shared_task
def process_pending_webhooks():
    """Process unprocessed webhooks"""
    from .models import PaymentWebhook

    pending_webhooks = PaymentWebhook.objects.filter(processed=False).order_by(
        "created_at"
    )[
        :50
    ]  # Process in batches

    processed_count = 0

    for webhook in pending_webhooks:
        try:
            # Process webhook based on gateway and event type
            if webhook.gateway == "PAYSTACK" and webhook.event_type == "charge.success":
                # Process Paystack successful charge
                process_paystack_success_webhook(webhook)
            elif (
                webhook.gateway == "FLUTTERWAVE"
                and webhook.event_type == "charge.completed"
            ):
                # Process Flutterwave successful charge
                process_flutterwave_success_webhook(webhook)
            # Add more webhook processors as needed

            webhook.processed = True
            webhook.processed_at = timezone.now()
            webhook.save()
            processed_count += 1

        except Exception as e:
            webhook.processing_error = str(e)
            webhook.save()

    return f"Processed {processed_count} webhooks"


def process_paystack_success_webhook(webhook):
    """Credit the fees a Paystack charge paid for (fee.checkout.settle)."""
    from . import checkout
    from .models import Payment

    data = webhook.payload.get("data", {})
    reference = data.get("reference")
    if reference:
        checkout.settle(webhook.tenant, reference, data)
        webhook.payment = Payment.objects.filter(
            tenant=webhook.tenant, gateway_reference=reference).first()
        webhook.save()


def process_flutterwave_success_webhook(webhook):
    """Process Flutterwave successful payment webhook"""
    from .models import Payment

    payload = webhook.payload
    tx_ref = payload.get("data", {}).get("tx_ref")

    if tx_ref:
        try:
            payment = Payment.objects.get(
                gateway_reference=tx_ref, payment_gateway="FLUTTERWAVE"
            )

            payment.verified = True
            payment.verification_date = timezone.now()
            payment.gateway_status = "SUCCESS"
            payment.gateway_response = payload
            payment.save()

            webhook.payment = payment
            webhook.save()

        except Payment.DoesNotExist:
            raise Exception(f"Payment not found for tx_ref: {tx_ref}")


@shared_task
def generate_payment_reports():
    """Generate daily payment reports"""
    from django.db.models import Sum, Count
    from datetime import datetime, timedelta
    from .models import Payment

    today = timezone.now().date()
    yesterday = today - timedelta(days=1)

    # Daily payment summary
    daily_payments = Payment.objects.filter(
        payment_date__date=yesterday, verified=True
    ).aggregate(total_amount=Sum("amount"), total_count=Count("id"))

    # Gateway breakdown
    gateway_summary = (
        Payment.objects.filter(payment_date__date=yesterday, verified=True)
        .values("payment_gateway")
        .annotate(total_amount=Sum("amount"), count=Count("id"))
    )

    report_data = {
        "date": yesterday.isoformat(),
        "total_amount": daily_payments["total_amount"] or 0,
        "total_transactions": daily_payments["total_count"] or 0,
        "gateway_breakdown": list(gateway_summary),
    }

    # You can save this to a model, send email, or log it
    # For now, we'll just return the data
    return report_data
