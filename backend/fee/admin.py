# fees/admin.py - Enhanced for Multi-Gateway Support
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.http import HttpResponse, JsonResponse
from django.contrib import messages
from django.shortcuts import redirect
import csv
import json
from decimal import Decimal
from datetime import timedelta


# Note: Student import is only needed for foreign key references in admin
from .models import (
    FeeStructure,
    StudentFee,
    Payment,
    PaymentGatewayConfig,
    PaymentAttempt,
    PaymentWebhook,
    PaymentPlan,
    PaymentInstallment,
    FeeDiscount,
    StudentDiscount,
    PaymentReminder,
)


class StudentFeeInline(admin.TabularInline):
    model = StudentFee
    extra = 0
    fields = ("fee_structure", "amount_due", "amount_paid", "due_date", "status")
    readonly_fields = ("created_at", "updated_at")


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = (
        "reference",
        "amount",
        "payment_gateway",
        "payment_method",
        "verified",
        "gateway_status",
        "payment_date",
    )
    readonly_fields = ("payment_date", "created_at", "gateway_reference")


class PaymentAttemptInline(admin.TabularInline):
    model = PaymentAttempt
    extra = 0
    fields = ("gateway", "amount", "status", "error_code", "created_at")
    readonly_fields = ("created_at", "attempt_reference")


class PaymentInstallmentInline(admin.TabularInline):
    model = PaymentInstallment
    extra = 0
    fields = ("installment_number", "amount", "due_date", "is_paid", "paid_date")
    readonly_fields = ("paid_date",)


@admin.register(PaymentGatewayConfig)
class PaymentGatewayConfigAdmin(admin.ModelAdmin):
    list_display = (
        "gateway",
        "is_active",
        "test_mode_display",
        "min_amount",
        "max_amount",
        "fee_display",
        "created_at",
    )
    list_filter = ("gateway", "is_active", "is_test_mode")
    search_fields = ("gateway",)

    fieldsets = (
        ("Gateway Information", {"fields": ("gateway", "is_active", "is_test_mode")}),
        (
            "API Configuration",
            {
                "fields": ("public_key", "secret_key", "webhook_url", "callback_url"),
                "classes": ("collapse",),
            },
        ),
        ("Transaction Limits", {"fields": ("min_amount", "max_amount")}),
        ("Fees & Charges", {"fields": ("transaction_fee_percentage", "fixed_charge")}),
    )

    def test_mode_display(self, obj):
        if obj.is_test_mode:
            return format_html('<span style="color: orange;">Test Mode</span>')
        else:
            return format_html('<span style="color: green;">Live Mode</span>')

    test_mode_display.short_description = "Mode"

    def fee_display(self, obj):
        return f"{obj.transaction_fee_percentage}% + ₦{obj.fixed_charge}"

    fee_display.short_description = "Fees"


@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "fee_type",
        "education_level",
        "student_class",
        "amount",
        "frequency",
        "is_active",
        "created_at",
    )
    list_filter = (
        "fee_type",
        "education_level",
        "frequency",
        "is_active",
        "created_at",
    )
    search_fields = ("name", "fee_type", "description")

    fieldsets = (
        ("Basic Information", {"fields": ("name", "fee_type", "description")}),
        (
            "Class Information",
            {"fields": ("education_level", "student_class", "academic_session")},
        ),
        (
            "Amount Settings",
            {
                "fields": (
                    "amount",
                    "frequency",
                    "is_mandatory",
                    "due_date_offset",
                    "late_fee_percentage",
                )
            },
        ),
        (
            "Settings",
            {"fields": ("is_active",)},
        ),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("academic_session")


@admin.register(StudentFee)
class StudentFeeAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "fee_structure",
        "amount_due",
        "amount_paid",
        "balance",
        "status",
        "due_date",
        "payment_percentage_display",
        "overdue_status",
        "created_at",
    )
    list_filter = (
        "status",
        "fee_structure__fee_type",
        "due_date",
        "created_at",
        "academic_session",
        "term",
    )
    search_fields = (
        "student__user__first_name",
        "student__user__last_name",
        "student__student_id",
        "fee_structure__name",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
        "balance",
        "payment_percentage",
        "is_overdue",
    )
    date_hierarchy = "due_date"

    fieldsets = (
        (
            "Student Information",
            {"fields": ("student", "academic_session", "term")},
        ),
        (
            "Fee Details",
            {
                "fields": (
                    "fee_structure",
                    "amount_due",
                    "discount_amount",
                    "late_fee",
                    "due_date",
                )
            },
        ),
        (
            "Payment Info",
            {"fields": ("amount_paid", "balance", "payment_percentage", "status")},
        ),
        (
            "Additional Information",
            {
                "fields": ("remarks", "is_overdue", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    actions = [
        "mark_as_paid",
        "send_payment_reminder",
        "export_as_csv",
        "update_payment_status",
        "create_payment_plan",
    ]
    inlines = [PaymentInline, PaymentAttemptInline]

    def payment_percentage_display(self, obj):
        percentage = obj.payment_percentage
        if percentage >= 100:
            color = "green"
        elif percentage > 0:
            color = "orange"
        else:
            color = "red"

        return format_html('<span style="color: {};">{:.1f}%</span>', color, percentage)

    payment_percentage_display.short_description = "Payment %"

    def overdue_status(self, obj):
        if obj.is_overdue:
            days_overdue = (timezone.now().date() - obj.due_date).days
            return format_html(
                '<span style="color: red;">Overdue ({} days)</span>', days_overdue
            )
        return format_html('<span style="color: green;">Current</span>')

    overdue_status.short_description = "Due Status"

    def mark_as_paid(self, request, queryset):
        updated = 0
        for fee in queryset:
            fee.amount_paid = fee.amount_due
            fee.status = "PAID"
            fee.save()
            updated += 1
        self.message_user(request, f"{updated} fees marked as paid.")

    mark_as_paid.short_description = "Mark selected fees as paid"

    def create_payment_plan(self, request, queryset):
        created = 0
        for fee in queryset.filter(status__in=["PENDING", "PARTIAL"]):
            if (
                not hasattr(fee, "payment_plans")
                or not fee.payment_plans.filter(is_active=True).exists()
            ):
                plan = PaymentPlan.objects.create(
                    student_fee=fee,
                    name=f"Payment Plan - {fee.fee_structure.name}",
                    total_amount=fee.balance,
                    number_of_installments=3,
                    installment_amount=fee.balance / 3,
                )
                # Create installments
                for i in range(3):
                    PaymentInstallment.objects.create(
                        payment_plan=plan,
                        installment_number=i + 1,
                        amount=fee.balance / 3,
                        due_date=timezone.now().date() + timedelta(days=30 * (i + 1)),
                    )
                created += 1
        self.message_user(request, f"{created} payment plans created.")

    create_payment_plan.short_description = "Create payment plans for selected fees"

    def send_payment_reminder(self, request, queryset):
        """Email the parents of the selected fees' students, school by school."""
        from .reminders import send_reminders

        students_by_school = {}
        for fee in queryset.select_related("tenant"):
            if fee.tenant is not None:
                students_by_school.setdefault(fee.tenant, set()).add(fee.student_id)

        sent = 0
        for school, student_ids in students_by_school.items():
            summary = send_reminders(school, ["email"], list(student_ids))
            sent += summary["email"]["sent"]
        self.message_user(request, f"{sent} reminder emails sent to parents.")

    send_payment_reminder.short_description = "Email payment reminders to parents"

    def update_payment_status(self, request, queryset):
        updated = 0
        for fee in queryset:
            fee.update_status()
            updated += 1
        self.message_user(request, f"{updated} fee statuses updated.")

    update_payment_status.short_description = "Update payment status"

    def export_as_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="student_fees.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "Student ID",
                "Student Name",
                "Fee Type",
                "Amount Due",
                "Amount Paid",
                "Balance",
                "Status",
                "Due Date",
                "Payment Methods Used",
                "Created",
            ]
        )

        for fee in queryset:
            payment_methods = ", ".join(
                fee.payments.filter(verified=True)
                .values_list("payment_method", flat=True)
                .distinct()
            )
            writer.writerow(
                [
                    fee.student.student_id,
                    fee.student.full_name,
                    fee.fee_structure.name,
                    fee.amount_due,
                    fee.amount_paid,
                    fee.balance,
                    fee.status,
                    fee.due_date,
                    payment_methods or "None",
                    fee.created_at.strftime("%Y-%m-%d"),
                ]
            )

        return response

    export_as_csv.short_description = "Export selected fees as CSV"


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "student_name",
        "amount",
        "gateway_display",
        "payment_method_display",
        "verified",
        "gateway_status_display",
        "payment_date",
        "receipt_number",
    )
    list_filter = (
        "payment_gateway",
        "payment_method",
        "verified",
        "gateway_status",
        "payment_date",
        "verification_date",
    )
    search_fields = (
        "reference",
        "gateway_reference",
        "gateway_transaction_id",
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
        "student_fee__student__student_id",
        "payer_email",
        "receipt_number",
    )
    readonly_fields = (
        "id",
        "reference",
        "gateway_reference",
        "gateway_transaction_id",
        "payment_date",
        "verification_date",
        "created_at",
        "updated_at",
        "receipt_number",
        "net_amount",
        "gateway_response_display",
    )
    date_hierarchy = "payment_date"

    fieldsets = (
        (
            "Payment Information",
            {"fields": ("student_fee", "reference", "amount", "currency")},
        ),
        (
            "Gateway Details",
            {
                "fields": (
                    "payment_gateway",
                    "payment_method",
                    "gateway_reference",
                    "gateway_transaction_id",
                    "gateway_status",
                )
            },
        ),
        ("Payer Details", {"fields": ("payer_name", "payer_email", "payer_phone")}),
        (
            "Card/Bank Information",
            {
                "fields": ("card_last_four", "card_type", "bank_name"),
                "classes": ("collapse",),
            },
        ),
        ("Financial Details", {"fields": ("gateway_fee", "net_amount", "description")}),
        (
            "Verification",
            {"fields": ("verified", "verification_date", "receipt_number")},
        ),
        (
            "System Information",
            {
                "fields": (
                    "gateway_response_display",
                    "metadata",
                    "notes",
                    "payment_date",
                    "created_at",
                    "updated_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    actions = [
        "verify_payments",
        "export_successful_payments",
        "generate_receipts",
        "refund_payments",
        "export_gateway_report",
    ]

    def student_name(self, obj):
        return obj.student_fee.student.full_name

    student_name.short_description = "Student"

    def gateway_display(self, obj):
        colors = {
            "PAYSTACK": "blue",
            "FLUTTERWAVE": "orange",
            "STRIPE": "purple",
            "MANUAL": "gray",
        }
        color = colors.get(obj.payment_gateway, "black")
        return format_html(
            '<span style="color: {};">{}</span>', color, obj.gateway_display_name
        )

    gateway_display.short_description = "Gateway"

    def payment_method_display(self, obj):
        method_colors = {
            "CARD": "green",
            "BANK": "blue",
            "MOBILE": "orange",
            "CASH": "gray",
        }
        # Extract main method type from payment method
        main_type = (
            obj.payment_method.split("_")[-1]
            if "_" in obj.payment_method
            else obj.payment_method
        )
        color = method_colors.get(main_type, "black")
        return format_html(
            '<span style="color: {};">{}</span>',
            color,
            obj.get_payment_method_display(),
        )

    payment_method_display.short_description = "Method"

    def gateway_status_display(self, obj):
        status_colors = {
            "SUCCESS": "green",
            "PENDING": "orange",
            "PROCESSING": "blue",
            "FAILED": "red",
            "CANCELLED": "gray",
            "REFUNDED": "purple",
        }
        color = status_colors.get(obj.gateway_status, "black")
        return format_html(
            '<span style="color: {};">{}</span>',
            color,
            obj.get_gateway_status_display(),
        )

    gateway_status_display.short_description = "Gateway Status"

    def gateway_response_display(self, obj):
        if obj.gateway_response:
            return format_html(
                "<pre>{}</pre>", json.dumps(obj.gateway_response, indent=2)
            )
        return "No response data"

    gateway_response_display.short_description = "Gateway Response"

    def verify_payments(self, request, queryset):
        verified_count = 0
        for payment in queryset.filter(verified=False):
            # Here you would integrate with your payment verification service
            if payment.gateway_status == "SUCCESS":
                payment.verified = True
                payment.verification_date = timezone.now()
                payment.save()
                verified_count += 1

        self.message_user(request, f"{verified_count} payments verified successfully.")

    verify_payments.short_description = "Verify selected payments"

    def generate_receipts(self, request, queryset):
        generated_count = 0
        for payment in queryset.filter(verified=True, receipt_number__isnull=True):
            payment.generate_receipt_number()
            generated_count += 1

        self.message_user(request, f"{generated_count} receipt numbers generated.")

    generate_receipts.short_description = "Generate receipt numbers"

    def export_gateway_report(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="gateway_payments_report.csv"'
        )

        writer = csv.writer(response)
        writer.writerow(
            [
                "Reference",
                "Gateway",
                "Method",
                "Student",
                "Amount",
                "Gateway Fee",
                "Net Amount",
                "Status",
                "Gateway Status",
                "Date",
                "Receipt",
            ]
        )

        for payment in queryset:
            writer.writerow(
                [
                    payment.reference,
                    payment.gateway_display_name,
                    payment.get_payment_method_display(),
                    payment.student_fee.student.full_name,
                    payment.amount,
                    payment.gateway_fee,
                    payment.net_amount,
                    payment.get_status_display(),
                    payment.get_gateway_status_display(),
                    payment.payment_date.strftime("%Y-%m-%d %H:%M"),
                    payment.receipt_number or "Not Generated",
                ]
            )

        return response

    export_gateway_report.short_description = "Export gateway report"

    def export_successful_payments(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="successful_payments.csv"'
        )

        writer = csv.writer(response)
        writer.writerow(
            [
                "Reference",
                "Student",
                "Amount",
                "Gateway",
                "Method",
                "Status",
                "Verified",
                "Date",
                "Receipt Number",
            ]
        )

        for payment in queryset.filter(verified=True):
            writer.writerow(
                [
                    payment.reference,
                    payment.student_fee.student.full_name,
                    payment.amount,
                    payment.gateway_display_name,
                    payment.get_payment_method_display(),
                    payment.get_gateway_status_display(),
                    "Yes" if payment.verified else "No",
                    payment.payment_date.strftime("%Y-%m-%d %H:%M"),
                    payment.receipt_number or "Not Generated",
                ]
            )

        return response

    export_successful_payments.short_description = "Export successful payments"


@admin.register(PaymentAttempt)
class PaymentAttemptAdmin(admin.ModelAdmin):
    list_display = (
        "attempt_reference",
        "student_name",
        "gateway",
        "amount",
        "status",
        "error_code",
        "created_at",
    )
    list_filter = ("gateway", "status", "created_at")
    search_fields = (
        "attempt_reference",
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
        "error_code",
    )
    readonly_fields = ("created_at", "gateway_response_display")

    fieldsets = (
        (
            "Attempt Information",
            {
                "fields": (
                    "student_fee",
                    "payment",
                    "gateway",
                    "amount",
                    "attempt_reference",
                )
            },
        ),
        ("Status & Errors", {"fields": ("status", "error_code", "error_message")}),
        (
            "Technical Details",
            {
                "fields": ("ip_address", "user_agent", "gateway_response_display"),
                "classes": ("collapse",),
            },
        ),
    )

    def student_name(self, obj):
        return obj.student_fee.student.full_name

    student_name.short_description = "Student"

    def gateway_response_display(self, obj):
        if obj.gateway_response:
            return format_html(
                "<pre>{}</pre>", json.dumps(obj.gateway_response, indent=2)
            )
        return "No response data"

    gateway_response_display.short_description = "Gateway Response"


@admin.register(PaymentWebhook)
class PaymentWebhookAdmin(admin.ModelAdmin):
    list_display = (
        "gateway",
        "event_type",
        "event_id",
        "processed",
        "payment_reference",
        "created_at",
    )
    list_filter = ("gateway", "event_type", "processed", "created_at")
    search_fields = ("event_type", "event_id")
    readonly_fields = ("created_at", "payload_display", "headers_display")

    fieldsets = (
        (
            "Webhook Information",
            {"fields": ("gateway", "event_type", "event_id", "payment")},
        ),
        (
            "Processing Status",
            {"fields": ("processed", "processed_at", "processing_error")},
        ),
        (
            "Webhook Data",
            {
                "fields": ("payload_display", "headers_display"),
                "classes": ("collapse",),
            },
        ),
    )

    def payment_reference(self, obj):
        if obj.payment:
            return obj.payment.reference
        return "Not linked"

    payment_reference.short_description = "Payment Ref"

    def payload_display(self, obj):
        return format_html("<pre>{}</pre>", json.dumps(obj.payload, indent=2))

    payload_display.short_description = "Payload"

    def headers_display(self, obj):
        if obj.headers:
            return format_html("<pre>{}</pre>", json.dumps(obj.headers, indent=2))
        return "No headers"

    headers_display.short_description = "Headers"


@admin.register(PaymentPlan)
class PaymentPlanAdmin(admin.ModelAdmin):
    list_display = (
        "student_name",
        "name",
        "total_amount",
        "installments_count",
        "installment_amount",
        "completed_installments",
        "is_completed",
        "is_active",
    )
    list_filter = ("is_active", "is_completed", "created_at")
    search_fields = (
        "name",
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
    )
    inlines = [PaymentInstallmentInline]

    def student_name(self, obj):
        return obj.student_fee.student.full_name

    student_name.short_description = "Student"

    def installments_count(self, obj):
        return obj.number_of_installments

    installments_count.short_description = "Total Installments"

    def completed_installments(self, obj):
        completed = obj.installments.filter(is_paid=True).count()
        total = obj.number_of_installments
        percentage = (completed / total * 100) if total > 0 else 0

        if percentage == 100:
            color = "green"
        elif percentage > 0:
            color = "orange"
        else:
            color = "red"

        return format_html(
            '<span style="color: {};">{}/{} ({:.0f}%)</span>',
            color,
            completed,
            total,
            percentage,
        )

    completed_installments.short_description = "Completed"


@admin.register(PaymentInstallment)
class PaymentInstallmentAdmin(admin.ModelAdmin):
    list_display = (
        "payment_plan_display",
        "installment_number",
        "amount",
        "due_date",
        "is_paid_display",
        "paid_date",
        "days_status",
    )
    list_filter = ("is_paid", "due_date", "paid_date")
    search_fields = (
        "payment_plan__student_fee__student__user__first_name",
        "payment_plan__student_fee__student__user__last_name",
    )
    readonly_fields = ("paid_date",)

    def payment_plan_display(self, obj):
        return f"{obj.payment_plan.student_fee.student.full_name} - {obj.payment_plan.name}"

    payment_plan_display.short_description = "Payment Plan"

    def is_paid_display(self, obj):
        if obj.is_paid:
            return format_html('<span style="color: green;">✓ Paid</span>')
        else:
            return format_html('<span style="color: red;">✗ Unpaid</span>')

    is_paid_display.short_description = "Status"

    def days_status(self, obj):
        today = timezone.now().date()
        if obj.is_paid:
            return format_html('<span style="color: green;">Completed</span>')
        elif obj.due_date < today:
            days_overdue = (today - obj.due_date).days
            return format_html(
                '<span style="color: red;">Overdue ({} days)</span>', days_overdue
            )
        elif obj.due_date == today:
            return format_html('<span style="color: orange;">Due Today</span>')
        else:
            days_remaining = (obj.due_date - today).days
            return format_html(
                '<span style="color: blue;">Due in {} days</span>', days_remaining
            )

    days_status.short_description = "Due Status"


# Keep existing admin classes for other models
# @admin.register(AcademicSession)
# class AcademicSessionAdmin(admin.ModelAdmin):
#     list_display = ("name", "start_date", "end_date", "is_active")
#     list_filter = ("is_active",)
#     search_fields = ("name",)

#     fieldsets = (
#         ("Session Details", {"fields": ("name", "start_date", "end_date")}),
#         ("Status", {"fields": ("is_active",)}),
#     )


@admin.register(FeeDiscount)
class FeeDiscountAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "discount_type",
        "value",
        "is_active",
        "valid_from",
        "valid_to",
        "created_at",
    )
    list_filter = ("discount_type", "is_active", "valid_from", "valid_to")
    search_fields = ("name", "description")

    fieldsets = (
        ("Discount Details", {"fields": ("name", "description")}),
        (
            "Discount Settings",
            {"fields": ("discount_type", "value", "applicable_fee_types")},
        ),
        ("Validity", {"fields": ("valid_from", "valid_to", "is_active")}),
    )


@admin.register(StudentDiscount)
class StudentDiscountAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "discount",
        "academic_session",
        "applied_by",
        "applied_date",
        "is_active",
    )
    list_filter = ("discount", "academic_session", "is_active", "applied_date")
    search_fields = (
        "student__user__first_name",
        "student__user__last_name",
        "student__student_id",
        "discount__name",
    )
    readonly_fields = ("applied_date",)

    fieldsets = (
        ("Assignment Details", {"fields": ("student", "discount", "academic_session")}),
        ("Applied By", {"fields": ("applied_by", "applied_date", "is_active")}),
    )


@admin.register(PaymentReminder)
class PaymentReminderAdmin(admin.ModelAdmin):
    list_display = (
        "student_fee",
        "reminder_type",
        "channel",
        "recipient",
        "sent_date",
        "is_sent",
    )
    list_filter = ("reminder_type", "channel", "is_sent", "sent_date")
    search_fields = (
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
        "recipient",
    )
    readonly_fields = ("sent_date",)

    fieldsets = (
        ("Reminder Details", {"fields": ("student_fee", "reminder_type", "channel", "recipient")}),
        ("Message", {"fields": ("message",)}),
        ("Status", {"fields": ("is_sent", "sent_date", "error")}),
    )


# Custom admin site configuration
admin.site.site_header = "Enhanced Fees Management System"
admin.site.site_title = "Fees Admin"
admin.site.index_title = "Welcome to Multi-Gateway Fees Management System"


# Add custom CSS for better styling
class AdminStyleMixin:
    class Media:
        css = {"all": ("admin/css/custom_admin.css",)}
        js = ("admin/js/custom_admin.js",)
