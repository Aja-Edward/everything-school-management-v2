# fees/models.py - Enhanced for Multi-Gateway Support
from django.db import models
from django.contrib.auth import get_user_model
from students.models import Student, EDUCATION_LEVEL_CHOICES, CLASS_CHOICES
from decimal import Decimal
import uuid
from academics.models import AcademicSession
from datetime import date, datetime
import json
from tenants.models import TenantMixin

User = get_user_model()

# Enhanced Payment Method Choices
PAYMENT_METHOD_CHOICES = (
    # Gateway methods
    ("PAYSTACK_CARD", "Paystack - Card Payment"),
    ("PAYSTACK_BANK", "Paystack - Bank Transfer"),
    ("FLUTTERWAVE_CARD", "Flutterwave - Card Payment"),
    ("FLUTTERWAVE_BANK", "Flutterwave - Bank Transfer"),
    ("FLUTTERWAVE_MOBILE", "Flutterwave - Mobile Money"),
    ("STRIPE_CARD", "Stripe - Card Payment"),
    ("STRIPE_BANK", "Stripe - Bank Transfer"),
    # Traditional methods
    ("BANK_TRANSFER", "Direct Bank Transfer"),
    ("CASH", "Cash"),
    ("CHEQUE", "Cheque"),
)

# Payment Gateway Choices
PAYMENT_GATEWAY_CHOICES = (
    ("PAYSTACK", "Paystack"),
    ("FLUTTERWAVE", "Flutterwave"),
    ("STRIPE", "Stripe"),
    ("MANUAL", "Manual Payment"),
)

# Gateway Transaction Status
GATEWAY_STATUS_CHOICES = (
    ("PENDING", "Pending"),
    ("PROCESSING", "Processing"),
    ("SUCCESS", "Success"),
    ("FAILED", "Failed"),
    ("CANCELLED", "Cancelled"),
    ("ABANDONED", "Abandoned"),
    ("REFUNDED", "Refunded"),
)

# Your existing choices remain the same...
FEE_TYPE_CHOICES = (
    ("TUITION", "Tuition Fee"),
    ("LIBRARY", "Library Fee"),
    ("LABORATORY", "Laboratory Fee"),
    ("SPORTS", "Sports Fee"),
    ("EXAM", "Examination Fee"),
    ("DEVELOPMENT", "Development Fee"),
    ("TRANSPORT", "Transport Fee"),
    ("HOSTEL", "Hostel Fee"),
    ("UNIFORM", "Uniform Fee"),
    ("BOOKS", "Books Fee"),
    ("COMPUTER", "Computer Fee"),
    ("MEDICAL", "Medical Fee"),
    ("REGISTRATION", "Registration Fee"),
    ("GRADUATION", "Graduation Fee"),
    ("MISCELLANEOUS", "Miscellaneous Fee"),
)

FEE_FREQUENCY_CHOICES = (
    ("ANNUAL", "Annual"),
    ("TERMLY", "Termly"),
    ("MONTHLY", "Monthly"),
    ("ONE_TIME", "One Time"),
)

PAYMENT_STATUS_CHOICES = (
    ("PENDING", "Pending"),
    ("PARTIAL", "Partial"),
    ("PAID", "Paid"),
    ("OVERDUE", "Overdue"),
    ("CANCELLED", "Cancelled"),
)

TERM_CHOICES = (
    ("FIRST", "First Term"),
    ("SECOND", "Second Term"),
    ("THIRD", "Third Term"),
)

DISCOUNT_TYPE_CHOICES = (
    ("PERCENTAGE", "Percentage"),
    ("FIXED_AMOUNT", "Fixed Amount"),
)

REMINDER_TYPE_CHOICES = (
    ("DUE_DATE", "Due Date Reminder"),
    ("OVERDUE", "Overdue Reminder"),
    ("PAYMENT_CONFIRMATION", "Payment Confirmation"),
)


# class AcademicSession(models.Model):
#     """Academic session model"""

#     name = models.CharField(max_length=100)
#     start_date = models.DateField()
#     end_date = models.DateField()
#     is_current = models.BooleanField(default=False)
#     is_active = models.BooleanField(default=True)
#     created_at = models.DateTimeField(auto_now_add=True)
#     updated_at = models.DateTimeField(auto_now=True)

#     class Meta:
#         verbose_name = "Academic Session"
#         verbose_name_plural = "Academic Sessions"
#         ordering = ["-start_date"]

#     def __str__(self):
#         return self.name


class FeeStructure(TenantMixin, models.Model):
    """Fee structure model"""

    FEE_TYPE_CHOICES = FEE_TYPE_CHOICES
    name = models.CharField(max_length=100)
    fee_type = models.CharField(max_length=20, choices=FEE_TYPE_CHOICES)
    education_level = models.CharField(max_length=20, choices=EDUCATION_LEVEL_CHOICES)
    student_class = models.CharField(max_length=20, choices=CLASS_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    frequency = models.CharField(max_length=10, choices=FEE_FREQUENCY_CHOICES)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Fee Structure"
        verbose_name_plural = "Fee Structures"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["tenant", "fee_type"]),
            models.Index(fields=["tenant", "education_level"]),
        ]

    def __str__(self):
        return f"{self.name} - {self.get_fee_type_display()}"


class StudentFee(TenantMixin, models.Model):
    """Student fee model"""

    PAYMENT_STATUS_CHOICES = PAYMENT_STATUS_CHOICES
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="fee")
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.CASCADE)
    academic_session = models.ForeignKey(AcademicSession, on_delete=models.CASCADE)
    term = models.CharField(max_length=10, choices=TERM_CHOICES)

    # Amount fields
    amount_due = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    late_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    # Dates
    due_date = models.DateField()

    # Status
    status = models.CharField(
        max_length=10, choices=PAYMENT_STATUS_CHOICES, default="PENDING"
    )

    # Additional info
    remarks = models.TextField(blank=True, null=True)
    is_overdue = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Student Fee"
        verbose_name_plural = "Student Fees"
        ordering = ["-created_at"]
        unique_together = ["tenant", "student", "fee_structure", "academic_session", "term"]
        indexes = [
            models.Index(fields=["tenant", "student"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.fee_structure.name}"

    @property
    def balance(self):
        """Calculate remaining balance"""
        return self.amount_due - self.amount_paid - self.discount_amount

    @property
    def payment_percentage(self):
        """Calculate payment percentage"""
        if self.amount_due == 0:
            return 0
        total_paid = self.amount_paid + self.discount_amount
        return (total_paid / self.amount_due) * 100

    def update_status(self):
        """Update payment status based on amounts"""
        total_paid = self.amount_paid + self.discount_amount

        if total_paid >= self.amount_due:
            self.status = "PAID"
        elif total_paid > 0:
            self.status = "PARTIAL"
        else:
            self.status = "PENDING"

        # Check if overdue
        if self.due_date < date.today() and self.status != "PAID":
            self.is_overdue = True
            if self.status == "PENDING":
                self.status = "OVERDUE"

        self.save()


class FeeDiscount(TenantMixin, models.Model):
    """Fee discount model"""

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    discount_type = models.CharField(max_length=15, choices=DISCOUNT_TYPE_CHOICES)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    applicable_fee_types = models.JSONField(default=list)
    valid_from = models.DateField()
    valid_to = models.DateField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Fee Discount"
        verbose_name_plural = "Fee Discounts"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} - {self.get_discount_type_display()}"


class StudentDiscount(TenantMixin, models.Model):
    """Student discount application model"""

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="discounts"
    )
    discount = models.ForeignKey(FeeDiscount, on_delete=models.CASCADE)
    academic_session = models.ForeignKey(AcademicSession, on_delete=models.CASCADE)
    applied_by = models.ForeignKey(User, on_delete=models.CASCADE)
    applied_date = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Student Discount"
        verbose_name_plural = "Student Discounts"
        unique_together = ["tenant", "student", "discount", "academic_session"]
        indexes = [
            models.Index(fields=["tenant", "student"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.discount.name}"


class PaymentReminder(TenantMixin, models.Model):
    """Payment reminder model"""

    student_fee = models.ForeignKey(
        StudentFee, on_delete=models.CASCADE, related_name="reminders"
    )
    reminder_type = models.CharField(max_length=20, choices=REMINDER_TYPE_CHOICES)
    sent_date = models.DateTimeField(auto_now_add=True)
    is_sent = models.BooleanField(default=False)
    message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Payment Reminder"
        verbose_name_plural = "Payment Reminders"
        ordering = ["-sent_date"]
        indexes = [
            models.Index(fields=["tenant", "is_sent"]),
        ]

    def __str__(self):
        return (
            f"{self.student_fee.student.full_name} - {self.get_reminder_type_display()}"
        )


class PaymentGatewayConfig(TenantMixin, models.Model):
    """Configuration for different payment gateways"""

    gateway = models.CharField(
        max_length=20, choices=PAYMENT_GATEWAY_CHOICES
    )
    is_active = models.BooleanField(default=True)
    is_test_mode = models.BooleanField(default=True)

    # API Keys (encrypted in production)
    public_key = models.TextField(blank=True, null=True)
    secret_key = models.TextField(blank=True, null=True)

    # Gateway specific settings
    webhook_url = models.URLField(blank=True, null=True)
    callback_url = models.URLField(blank=True, null=True)

    # Transaction limits
    min_amount = models.DecimalField(max_digits=10, decimal_places=2, default=100.00)
    max_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=1000000.00
    )

    # Fees and charges
    transaction_fee_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=0.00
    )
    fixed_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Payment Gateway Config"
        verbose_name_plural = "Payment Gateway Configs"
        unique_together = ["tenant", "gateway"]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.gateway} ({'Live' if not self.is_test_mode else 'Test'})"


class Payment(TenantMixin, models.Model):
    """Enhanced Payment model supporting multiple gateways"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student_fee = models.ForeignKey(
        "StudentFee", on_delete=models.CASCADE, related_name="payments"
    )

    # Payment details
    reference = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="NGN")

    # Gateway information
    payment_gateway = models.CharField(max_length=20, choices=PAYMENT_GATEWAY_CHOICES)
    payment_method = models.CharField(
        max_length=50, choices=PAYMENT_METHOD_CHOICES
    )  # ⚠️ CHANGE: 25 → 50

    # Payment status
    status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default="PENDING",  # ⚠️ CHANGE: 10 → 20
    )
    gateway_status = models.CharField(
        max_length=20,
        choices=GATEWAY_STATUS_CHOICES,
        default="PENDING",  # ⚠️ CHANGE: 15 → 20
    )

    # Timestamps
    payment_date = models.DateTimeField(auto_now_add=True)
    verified = models.BooleanField(default=False)
    verification_date = models.DateTimeField(blank=True, null=True)

    # Universal gateway fields
    gateway_reference = models.CharField(
        max_length=200, blank=True, null=True
    )  # ⚠️ CHANGE: 100 → 200
    gateway_transaction_id = models.CharField(
        max_length=200, blank=True, null=True
    )  # ⚠️ CHANGE: 100 → 200
    gateway_response = models.JSONField(blank=True, null=True)

    # Customer information
    payer_email = models.EmailField(blank=True, null=True)
    payer_name = models.CharField(
        max_length=200, blank=True, null=True
    )  # ⚠️ CHANGE: 100 → 200
    payer_phone = models.CharField(max_length=20, blank=True, null=True)

    # Card/Bank details
    card_last_four = models.CharField(max_length=4, blank=True, null=True)
    card_type = models.CharField(
        max_length=50, blank=True, null=True
    )  # ⚠️ CHANGE: 20 → 50
    bank_name = models.CharField(
        max_length=200, blank=True, null=True
    )  # ⚠️ CHANGE: 100 → 200

    # Transaction fees
    gateway_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    net_amount = models.DecimalField(
        max_digits=10, decimal_places=2, blank=True, null=True
    )

    # Receipt and documentation
    receipt_number = models.CharField(
        max_length=50, blank=True, null=True
    )  # ⚠️ CHANGE: 20 → 50
    description = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    # Metadata
    metadata = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-payment_date"]
        verbose_name = "Payment"
        verbose_name_plural = "Payments"
        unique_together = [
            ["tenant", "reference"],
            ["tenant", "receipt_number"],
        ]
        indexes = [
            models.Index(fields=["tenant", "gateway_reference"]),
            models.Index(fields=["tenant", "payment_gateway", "gateway_status"]),
            models.Index(fields=["tenant", "student_fee", "verified"]),
        ]

    def __str__(self):
        return f"Payment {self.reference} - ₦{self.amount} ({self.payment_gateway})"

    def save(self, *args, **kwargs):
        # Calculate net amount
        if self.net_amount is None:
            self.net_amount = self.amount - self.gateway_fee

        super().save(*args, **kwargs)

        if self.verified and not self.receipt_number:
            self.generate_receipt_number()

        # Update student fee payment status
        if self.verified:
            self.student_fee.amount_paid = (
                self.student_fee.payments.filter(verified=True).aggregate(
                    total=models.Sum("amount")
                )["total"]
                or 0
            )
            self.student_fee.update_status()

    def generate_receipt_number(self):
        """Generate unique receipt number"""
        if not self.receipt_number:
            year = datetime.now().year
            count = Payment.objects.filter(payment_date__year=year).count() + 1
            self.receipt_number = f"RCT{year}{count:06d}"
            self.save()

    @property
    def is_successful(self):
        """Check if payment was successful"""
        return self.verified and self.gateway_status == "SUCCESS"

    @property
    def gateway_display_name(self):
        """Get display name for the gateway"""
        gateway_names = {
            "PAYSTACK": "Paystack",
            "FLUTTERWAVE": "Flutterwave",
            "STRIPE": "Stripe",
            "MANUAL": "Manual",
        }
        return gateway_names.get(self.payment_gateway, self.payment_gateway)


class PaymentAttempt(TenantMixin, models.Model):
    """Track payment attempts and failures"""

    student_fee = models.ForeignKey(
        "StudentFee", on_delete=models.CASCADE, related_name="payment_attempts"
    )
    payment = models.ForeignKey(
        Payment,
        on_delete=models.CASCADE,
        related_name="attempts",
        blank=True,
        null=True,
    )

    gateway = models.CharField(max_length=20, choices=PAYMENT_GATEWAY_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    # Attempt tracking
    attempt_reference = models.CharField(max_length=200)
    status = models.CharField(max_length=15, choices=GATEWAY_STATUS_CHOICES)

    # Error tracking
    error_code = models.CharField(max_length=100, blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)

    # Gateway response
    gateway_response = models.JSONField(blank=True, null=True)

    # User info
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Payment Attempt"
        verbose_name_plural = "Payment Attempts"
        indexes = [
            models.Index(fields=["tenant", "gateway", "status"]),
        ]

    def __str__(self):
        return f"Attempt {self.attempt_reference} - {self.gateway} - {self.status}"


class PaymentWebhook(TenantMixin, models.Model):
    """Store webhook events from payment gateways"""

    gateway = models.CharField(max_length=20, choices=PAYMENT_GATEWAY_CHOICES)
    event_type = models.CharField(max_length=100)
    event_id = models.CharField(max_length=100, blank=True, null=True)

    # Webhook data
    payload = models.JSONField()
    headers = models.JSONField(blank=True, null=True)

    # Processing status
    processed = models.BooleanField(default=False)
    processed_at = models.DateTimeField(blank=True, null=True)
    processing_error = models.TextField(blank=True, null=True)

    # Related payment (if found)
    payment = models.ForeignKey(
        Payment, on_delete=models.SET_NULL, blank=True, null=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Payment Webhook"
        verbose_name_plural = "Payment Webhooks"
        indexes = [
            models.Index(fields=["tenant", "gateway", "event_type"]),
            models.Index(fields=["tenant", "processed", "created_at"]),
        ]

    def __str__(self):
        return f"{self.gateway} - {self.event_type} - {self.created_at}"


class PaymentPlan(TenantMixin, models.Model):
    """Installment payment plans"""

    student_fee = models.ForeignKey(
        "StudentFee", on_delete=models.CASCADE, related_name="payment_plans"
    )
    name = models.CharField(max_length=100)

    # Plan details
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    number_of_installments = models.IntegerField()
    installment_amount = models.DecimalField(max_digits=10, decimal_places=2)

    # Status
    is_active = models.BooleanField(default=True)
    is_completed = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.student_fee.student.full_name} - {self.name}"


class PaymentInstallment(TenantMixin, models.Model):
    """Individual installments in a payment plan"""

    payment_plan = models.ForeignKey(
        PaymentPlan, on_delete=models.CASCADE, related_name="installments"
    )
    installment_number = models.IntegerField()

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField()

    # Payment tracking
    payment = models.ForeignKey(
        Payment, on_delete=models.SET_NULL, blank=True, null=True
    )
    is_paid = models.BooleanField(default=False)
    paid_date = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["installment_number"]
        unique_together = ["tenant", "payment_plan", "installment_number"]
        indexes = [
            models.Index(fields=["tenant", "is_paid"]),
        ]

    def __str__(self):
        return f"Installment {self.installment_number} - ₦{self.amount}"
