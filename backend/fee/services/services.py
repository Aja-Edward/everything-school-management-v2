# fees/services.py
from django.db import transaction
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.db.models import Sum, Count, Avg, Q
from decimal import Decimal
import csv
import io
from datetime import datetime, timedelta
from ..models import (
    StudentFee,
    Payment,
    FeeStructure,
    StudentDiscount,
    FeeDiscount,
    PaymentPlan,
    PaymentInstallment,
    PaymentAttempt,
    PaymentWebhook,
    PaymentGatewayConfig,
)
from .paystack_service import PaystackService
from students.models import Student
from academics.models import AcademicSession


class FeeService:
    # bulk_generate_fees lived here. It read fee_structure.academic_session
    # and .due_date, which a fee item does not have, and started from
    # Student.objects.all(), so it could bill another school's students.
    # Issuing fees is fee.billing.issue_fees, scoped to one school.

    @staticmethod
    def apply_automatic_discounts(student_fee):
        """Apply automatic discounts to a student fee"""
        # Get active discounts for this student
        active_discounts = StudentDiscount.objects.filter(
            student=student_fee.student, is_active=True
        ).select_related("discount")

        for student_discount in active_discounts:
            FeeService.recalculate_student_fee(student_fee)

    @staticmethod
    def recalculate_student_fee(student_fee):
        """Recalculate student fee with discounts"""
        base_amount = student_fee.fee_structure.amount

        # Get active discounts for this student
        active_discounts = StudentDiscount.objects.filter(
            student=student_fee.student, is_active=True
        ).select_related("discount")

        total_discount = Decimal("0")
        for student_discount in active_discounts:
            discount = student_discount.discount
            if discount.discount_type == "PERCENTAGE":
                total_discount += base_amount * (discount.value / 100)
            elif discount.discount_type == "FIXED":
                total_discount += discount.value

        # Update amount_due
        student_fee.amount_due = base_amount - total_discount
        if student_fee.amount_due < 0:
            student_fee.amount_due = Decimal("0")

        # Recalculate balance
        student_fee.balance = student_fee.amount_due - student_fee.amount_paid

        # Update status
        if student_fee.balance <= 0:
            student_fee.status = "PAID"
        elif student_fee.amount_paid > 0:
            student_fee.status = "PARTIAL"
        elif student_fee.due_date and student_fee.due_date < timezone.now().date():
            student_fee.status = "OVERDUE"
        else:
            student_fee.status = "PENDING"

        student_fee.save()

    @staticmethod
    @transaction.atomic
    def create_payment_plan(student_fee, data):
        """Create a payment plan for a student fee"""
        number_of_installments = data.get("number_of_installments", 3)
        start_date = data.get("start_date")

        if not start_date:
            start_date = timezone.now().date()

        # Calculate installment amount
        total_amount = student_fee.balance
        installment_amount = total_amount / number_of_installments

        # Create payment plan
        payment_plan = PaymentPlan.objects.create(
            student_fee=student_fee,
            total_amount=total_amount,
            number_of_installments=number_of_installments,
            installment_amount=installment_amount,
            start_date=start_date,
            is_active=True,
            is_completed=False,
        )

        # Create installments
        current_date = start_date
        for i in range(1, number_of_installments + 1):
            PaymentInstallment.objects.create(
                payment_plan=payment_plan,
                installment_number=i,
                amount=installment_amount,
                due_date=current_date,
                is_paid=False,
            )
            # Next installment due in 30 days
            current_date = current_date + timedelta(days=30)

        return payment_plan


class PaymentService:
    @staticmethod
    def initiate_payment(tenant, data, user):
        """
        Start a card payment for one of this school's fees, into the school's
        own Paystack account.

        Both the fee and the gateway used to be looked up by id alone, so a
        parent at one school could pay against another school's fee, and the
        charge went to the platform's Paystack account rather than the
        school's.
        """
        student_fee = StudentFee.objects.filter(
            id=data.get("student_fee_id"), tenant=tenant).first()
        if student_fee is None:
            raise ValueError("That fee is not this school's.")

        amount = Decimal(str(data.get("amount")))
        if amount <= 0:
            raise ValueError("Enter an amount to pay.")
        if amount > student_fee.balance:
            raise ValueError("That is more than the outstanding balance.")

        paystack = PaystackService.for_school(tenant)
        attempt = PaymentAttempt.objects.create(
            tenant=tenant, student_fee=student_fee, amount=amount,
            gateway="PAYSTACK", status="INITIATED")
        try:
            result = paystack.initialize_payment(
                email=data.get("email"),
                amount=amount,
                callback_url=data.get("callback_url"),
                metadata={
                    "tenant": str(tenant.id),
                    "student_fee_id": student_fee.id,
                    "attempt_id": attempt.id,
                },
            )
        except Exception as error:
            attempt.status = "FAILED"
            attempt.error_message = str(error)
            attempt.save()
            raise

        reference = (result.get("data") or {}).get("reference") or result.get("reference")
        attempt.attempt_reference = reference or ""
        attempt.status = "PROCESSING"
        attempt.save()
        return {**result, "public_key": paystack.public_key, "reference": reference}

    @staticmethod
    def verify_payment(tenant, reference):
        """Ask this school's Paystack account what became of one payment."""
        attempt = PaymentAttempt.objects.filter(
            tenant=tenant, attempt_reference=reference).first()
        if attempt is None:
            raise ValueError("No payment of this school carries that reference.")

        paystack = PaystackService.for_school(tenant)
        result = paystack.verify_payment(reference)
        paid = (result.get("data") or {}).get("status") or result.get("status")
        if paid == "success":
            attempt.status = "SUCCESSFUL"
        else:
            attempt.status = "FAILED"
            attempt.error_message = result.get("message", "Verification failed")
        attempt.save()
        return result

    # Testing a gateway's keys lives in PaystackService.verify_keys(), which
    # actually asks Paystack. What used to be here answered "Connection
    # successful" without asking anyone.

    @staticmethod
    def get_failure_analysis():
        """Get payment failure analysis"""
        # Analyze failed payment attempts
        total_attempts = PaymentAttempt.objects.count()
        failed_attempts = PaymentAttempt.objects.filter(status="FAILED").count()

        # Group by error message
        common_errors = (
            PaymentAttempt.objects.filter(status="FAILED")
            .values("error_message")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )

        # Group by gateway
        gateway_failures = (
            PaymentAttempt.objects.filter(status="FAILED")
            .values("gateway")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        return {
            "total_attempts": total_attempts,
            "failed_attempts": failed_attempts,
            "failure_rate": (
                (failed_attempts / total_attempts * 100) if total_attempts > 0 else 0
            ),
            "common_errors": list(common_errors),
            "gateway_failures": list(gateway_failures),
        }

    @staticmethod
    def process_webhook(webhook):
        """Process a payment webhook"""
        try:
            webhook.processed = True
            webhook.processed_at = timezone.now()
            webhook.save()

            # Process webhook based on event type
            # Implementation depends on gateway
            return {"status": "success", "message": "Webhook processed"}

        except Exception as e:
            webhook.processed = False
            webhook.error_message = str(e)
            webhook.save()
            raise

    @staticmethod
    @transaction.atomic
    def initiate_refund(payment, reason):
        """Initiate payment refund"""
        if payment.gateway_status == "REFUNDED":
            raise ValueError("Payment already refunded")

        # Update payment status
        payment.gateway_status = "REFUNDED"
        payment.refund_reason = reason
        payment.refund_date = timezone.now()
        payment.save()

        # Update student fee
        student_fee = payment.student_fee
        student_fee.amount_paid -= payment.amount
        student_fee.balance = student_fee.amount_due - student_fee.amount_paid
        student_fee.status = (
            "PAID"
            if student_fee.balance <= 0
            else "PARTIAL" if student_fee.amount_paid > 0 else "PENDING"
        )
        student_fee.save()

        return {"status": "success", "message": "Refund initiated successfully"}

    @staticmethod
    @transaction.atomic
    def create_installment_payment(installment, data, user):
        """Create payment for an installment"""
        if installment.is_paid:
            raise ValueError("Installment already paid")

        # Create payment record
        payment = Payment.objects.create(
            student_fee=installment.payment_plan.student_fee,
            amount=installment.amount,
            payment_method=data.get("payment_method", "CARD"),
            payment_date=timezone.now(),
            verified=True,
            gateway_status="SUCCESS",
        )

        # Mark installment as paid
        installment.is_paid = True
        installment.payment = payment
        installment.save()

        # Check if all installments are paid
        payment_plan = installment.payment_plan
        all_paid = all(inst.is_paid for inst in payment_plan.installments.all())
        if all_paid:
            payment_plan.is_completed = True
            payment_plan.save()

        return {"status": "success", "payment": payment.id}

class ReportService:
    @staticmethod
    def generate_report(data):
        """Generate fee reports"""
        report_type = data.get("report_type")
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        education_level_id = data.get("education_level_id")

        if report_type == "collection_summary":
            return ReportService._collection_summary_report(
                start_date, end_date, education_level_id
            )
        elif report_type == "outstanding_fees":
            return ReportService._outstanding_fees_report(education_level_id)
        elif report_type == "payment_history":
            return ReportService._payment_history_report(
                start_date, end_date, education_level_id
            )
        else:
            raise ValueError(f"Unknown report type: {report_type}")

    @staticmethod
    def _collection_summary_report(start_date, end_date, education_level_id):
        """Generate collection summary report"""
        queryset = StudentFee.objects.all()

        if education_level_id:
            queryset = queryset.filter(
                fee_structure__education_level_id=education_level_id
            )

        summary = queryset.aggregate(
            total_due=Sum("amount_due"),
            total_paid=Sum("amount_paid"),
            total_balance=Sum("balance"),
        )

        return {"report_type": "collection_summary", "data": summary}

    @staticmethod
    def _outstanding_fees_report(education_level_id):
        """Generate outstanding fees report"""
        queryset = StudentFee.objects.filter(status__in=["PENDING", "PARTIAL", "OVERDUE"])

        if education_level_id:
            queryset = queryset.filter(
                fee_structure__education_level_id=education_level_id
            )

        outstanding = queryset.values(
            "student__user__first_name",
            "student__user__last_name",
            "fee_structure__name",
            "amount_due",
            "amount_paid",
            "balance",
            "status",
        )

        return {"report_type": "outstanding_fees", "data": list(outstanding)}

    @staticmethod
    def _payment_history_report(start_date, end_date, education_level_id):
        """Generate payment history report"""
        queryset = Payment.objects.filter(verified=True)

        if start_date:
            queryset = queryset.filter(payment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(payment_date__lte=end_date)
        if education_level_id:
            queryset = queryset.filter(
                student_fee__fee_structure__education_level_id=education_level_id
            )

        payments = queryset.values(
            "reference",
            "student_fee__student__user__first_name",
            "student_fee__student__user__last_name",
            "amount",
            "payment_method",
            "payment_date",
            "gateway_status",
        )

        return {"report_type": "payment_history", "data": list(payments)}

    @staticmethod
    def export_csv(data):
        """Export report as CSV"""
        report_data = ReportService.generate_report(data)

        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)

        # Write headers based on report type
        report_type = report_data.get("report_type")
        data_list = report_data.get("data")

        if report_type == "collection_summary":
            writer.writerow(["Metric", "Amount"])
            for key, value in data_list.items():
                writer.writerow([key, value or 0])
        elif isinstance(data_list, list) and len(data_list) > 0:
            # Write headers
            headers = data_list[0].keys()
            writer.writerow(headers)
            # Write data
            for row in data_list:
                writer.writerow(row.values())

        return output.getvalue()

    @staticmethod
    def get_payment_analytics(start_date=None, end_date=None, gateway=None):
        """Get payment analytics"""
        queryset = Payment.objects.filter(verified=True)

        if start_date:
            queryset = queryset.filter(payment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(payment_date__lte=end_date)
        if gateway:
            queryset = queryset.filter(payment_gateway=gateway)

        analytics = queryset.aggregate(
            total_amount=Sum("amount"),
            total_count=Count("id"),
            average_amount=Avg("amount"),
        )

        # Group by payment method
        by_method = (
            queryset.values("payment_method")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total")
        )

        # Daily trend (last 30 days)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        daily_trend = (
            queryset.filter(payment_date__gte=thirty_days_ago)
            .extra(select={"day": "date(payment_date)"})
            .values("day")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("day")
        )

        return {
            "summary": analytics,
            "by_payment_method": list(by_method),
            "daily_trend": list(daily_trend),
        }

    @staticmethod
    def get_gateway_performance():
        """Get gateway performance metrics"""
        # Success rate by gateway
        gateway_stats = []

        for gateway in ["PAYSTACK", "FLUTTERWAVE", "STRIPE", "PAYPAL"]:
            total_attempts = PaymentAttempt.objects.filter(gateway=gateway).count()
            successful = PaymentAttempt.objects.filter(
                gateway=gateway, status="SUCCESSFUL"
            ).count()
            failed = PaymentAttempt.objects.filter(
                gateway=gateway, status="FAILED"
            ).count()

            if total_attempts > 0:
                gateway_stats.append(
                    {
                        "gateway": gateway,
                        "total_attempts": total_attempts,
                        "successful": successful,
                        "failed": failed,
                        "success_rate": (successful / total_attempts * 100),
                    }
                )

        return {"gateway_performance": gateway_stats}
