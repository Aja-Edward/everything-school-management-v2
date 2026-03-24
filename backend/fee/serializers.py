# fees/serializers.py - Enhanced for Multi-Gateway Support
from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Count, Q
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
from academics.models import Term, AcademicSession
from students.models import Student
from academics.models import EducationLevel
from classroom.models import Class as StudentClass


# ---------------------------------------------------------------------------
# Minimal nested serializers for FK display
# ---------------------------------------------------------------------------


class EducationLevelMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationLevel
        fields = ["id", "name", "code", "level_type"]
        read_only_fields = ["id"]


class StudentClassMinimalSerializer(serializers.ModelSerializer):
    education_level_name = serializers.CharField(
        source="education_level.name", read_only=True, allow_null=True
    )

    class Meta:
        model = StudentClass
        fields = ["id", "name", "code", "education_level_name"]
        read_only_fields = ["id"]


# ---------------------------------------------------------------------------
# FeeStructure serializer
# education_level and student_class are FK fields on the model
# ---------------------------------------------------------------------------

class FeeStructureSerializer(serializers.ModelSerializer):
    # FK nested detail (read)
    education_level_detail = EducationLevelMinimalSerializer(
        source="education_level", read_only=True
    )
    education_level_name = serializers.CharField(
        source="education_level.name", read_only=True, allow_null=True
    )
    # level_type string for backward compat (replaces get_education_level_display)
    education_level_display = serializers.CharField(
        source="education_level.name", read_only=True, allow_null=True
    )

    student_class_detail = StudentClassMinimalSerializer(
        source="student_class", read_only=True
    )
    student_class_name = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )
    # backward compat display (replaces get_student_class_display)
    student_class_display = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )

    fee_type_display = serializers.CharField(
        source="get_fee_type_display", read_only=True
    )
    frequency_display = serializers.CharField(
        source="get_frequency_display", read_only=True
    )

    class Meta:
        model = FeeStructure
        fields = "__all__"


class FeeStructureCreateUpdateSerializer(serializers.ModelSerializer):
    """Writable serializer for creating/updating fee structures."""

    education_level = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        help_text="EducationLevel FK id",
    )
    student_class = serializers.PrimaryKeyRelatedField(
        queryset=StudentClass.objects.all(),
        help_text="StudentClass FK id",
    )

    class Meta:
        model = FeeStructure
        fields = [
            "name",
            "fee_type",
            "education_level",
            "student_class",
            "amount",
            "frequency",
            "description",
            "is_active",
        ]

    def validate(self, data):
        # Ensure student_class belongs to the selected education_level
        education_level = data.get("education_level")
        student_class = data.get("student_class")
        if education_level and student_class:
            if student_class.education_level_id != education_level.id:
                raise serializers.ValidationError(
                    {
                        "student_class": "This class does not belong to the selected education level."
                    }
                )
        return data


# ---------------------------------------------------------------------------
# PaymentGatewayConfig
# ---------------------------------------------------------------------------

class PaymentGatewayConfigSerializer(serializers.ModelSerializer):
    """Public fields only"""

    gateway_display = serializers.CharField(
        source="get_gateway_display", read_only=True
    )
    mode = serializers.SerializerMethodField()

    class Meta:
        model = PaymentGatewayConfig
        fields = [
            "id",
            "gateway",
            "gateway_display",
            "is_active",
            "mode",
            "min_amount",
            "max_amount",
            "transaction_fee_percentage",
            "fixed_charge",
        ]

    def get_mode(self, obj):
        return "Test" if obj.is_test_mode else "Live"


class PaymentGatewayConfigAdminSerializer(PaymentGatewayConfigSerializer):
    """Admin serializer with sensitive fields"""

    class Meta:
        model = PaymentGatewayConfig
        fields = "__all__"


# ---------------------------------------------------------------------------
# PaymentAttempt
# ---------------------------------------------------------------------------

class PaymentAttemptSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="student_fee.student.full_name", read_only=True
    )
    fee_name = serializers.CharField(
        source="student_fee.fee_structure.name", read_only=True
    )
    gateway_display = serializers.CharField(
        source="get_gateway_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = PaymentAttempt
        fields = [
            "id",
            "student_name",
            "fee_name",
            "gateway",
            "gateway_display",
            "amount",
            "attempt_reference",
            "status",
            "status_display",
            "error_code",
            "error_message",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# PaymentInstallment / PaymentPlan
# ---------------------------------------------------------------------------

class PaymentInstallmentSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    days_until_due = serializers.SerializerMethodField()

    class Meta:
        model = PaymentInstallment
        fields = [
            "id",
            "installment_number",
            "amount",
            "due_date",
            "is_paid",
            "paid_date",
            "status",
            "days_until_due",
            "created_at",
        ]

    def get_status(self, obj):
        if obj.is_paid:
            return "PAID"
        today = timezone.now().date()
        if obj.due_date < today:
            return "OVERDUE"
        elif obj.due_date == today:
            return "DUE_TODAY"
        return "UPCOMING"

    def get_days_until_due(self, obj):
        if obj.is_paid:
            return None
        return (obj.due_date - timezone.now().date()).days


class PaymentPlanSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="student_fee.student.full_name", read_only=True
    )
    fee_name = serializers.CharField(
        source="student_fee.fee_structure.name", read_only=True
    )
    installments = PaymentInstallmentSerializer(many=True, read_only=True)
    completion_percentage = serializers.SerializerMethodField()
    next_due_installment = serializers.SerializerMethodField()

    class Meta:
        model = PaymentPlan
        fields = [
            "id",
            "student_name",
            "fee_name",
            "name",
            "total_amount",
            "number_of_installments",
            "installment_amount",
            "is_active",
            "is_completed",
            "completion_percentage",
            "next_due_installment",
            "installments",
            "created_at",
        ]

    def get_completion_percentage(self, obj):
        paid_count = obj.installments.filter(is_paid=True).count()
        return (
            (paid_count / obj.number_of_installments * 100)
            if obj.number_of_installments > 0
            else 0
        )

    def get_next_due_installment(self, obj):
        nxt = obj.installments.filter(is_paid=False).order_by("due_date").first()
        return PaymentInstallmentSerializer(nxt).data if nxt else None


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="student_fee.student.full_name", read_only=True
    )
    fee_name = serializers.CharField(
        source="student_fee.fee_structure.name", read_only=True
    )
    payment_method_display = serializers.CharField(
        source="get_payment_method_display", read_only=True
    )
    payment_gateway_display = serializers.CharField(
        source="get_payment_gateway_display", read_only=True
    )
    gateway_status_display = serializers.CharField(
        source="get_gateway_status_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_successful = serializers.BooleanField(read_only=True)
    gateway_display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "reference",
            "student_name",
            "fee_name",
            "amount",
            "currency",
            "payment_gateway",
            "payment_gateway_display",
            "gateway_display_name",
            "payment_method",
            "payment_method_display",
            "status",
            "status_display",
            "gateway_status",
            "gateway_status_display",
            "payment_date",
            "verified",
            "verification_date",
            "gateway_reference",
            "gateway_transaction_id",
            "payer_email",
            "payer_name",
            "payer_phone",
            "card_last_four",
            "card_type",
            "bank_name",
            "gateway_fee",
            "net_amount",
            "receipt_number",
            "description",
            "is_successful",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "verified",
            "verification_date",
            "receipt_number",
            "gateway_reference",
            "gateway_transaction_id",
            "net_amount",
            "created_at",
            "updated_at",
        ]


class PaymentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            "student_fee",
            "amount",
            "currency",
            "payment_gateway",
            "payment_method",
            "payer_email",
            "payer_name",
            "payer_phone",
            "description",
        ]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        student_fee = attrs.get("student_fee")
        amount = attrs.get("amount")
        if student_fee and amount:
            if amount > student_fee.balance:
                raise serializers.ValidationError(
                    {"amount": "Payment amount cannot exceed outstanding balance."}
                )
        return attrs


# ---------------------------------------------------------------------------
# PaymentWebhook
# ---------------------------------------------------------------------------

class PaymentWebhookSerializer(serializers.ModelSerializer):
    gateway_display = serializers.CharField(
        source="get_gateway_display", read_only=True
    )
    payment_reference = serializers.CharField(
        source="payment.reference", read_only=True
    )

    class Meta:
        model = PaymentWebhook
        fields = [
            "id",
            "gateway",
            "gateway_display",
            "event_type",
            "event_id",
            "processed",
            "processed_at",
            "processing_error",
            "payment_reference",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# StudentFee serializers
# student.student_class is now a FK — use .name for display
# ---------------------------------------------------------------------------

class StudentFeeListSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    # student_class is now FK on Student — expose name
    student_class = serializers.CharField(
        source="student.student_class.name", read_only=True, allow_null=True
    )
    student_class_id = serializers.IntegerField(
        source="student.student_class.id", read_only=True, allow_null=True
    )

    fee_type = serializers.CharField(
        source="fee_structure.get_fee_type_display", read_only=True
    )
    fee_name = serializers.CharField(source="fee_structure.name", read_only=True)
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payment_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True
    )
    is_overdue = serializers.BooleanField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    term_display = serializers.CharField(source="get_term_display", read_only=True)
    payment_methods_used = serializers.SerializerMethodField()
    has_payment_plan = serializers.SerializerMethodField()

    class Meta:
        model = StudentFee
        fields = [
            "id",
            "student_name",
            "student_class",
            "student_class_id",
            "fee_type",
            "fee_name",
            "amount_due",
            "amount_paid",
            "balance",
            "discount_amount",
            "late_fee",
            "status",
            "status_display",
            "due_date",
            "payment_percentage",
            "is_overdue",
            "term",
            "term_display",
            "remarks",
            "payment_methods_used",
            "has_payment_plan",
        ]

    def get_payment_methods_used(self, obj):
        return list(
            obj.payments.filter(verified=True)
            .values_list("payment_method", flat=True)
            .distinct()
        )

    def get_has_payment_plan(self, obj):
        return obj.payment_plans.filter(is_active=True).exists()


class StudentFeeSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    # student_class is now FK
    student_class = serializers.CharField(
        source="student.student_class.name", read_only=True, allow_null=True
    )
    student_class_id = serializers.IntegerField(
        source="student.student_class.id", read_only=True, allow_null=True
    )

    fee_structure_details = FeeStructureSerializer(
        source="fee_structure", read_only=True
    )
    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payment_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True
    )
    is_overdue = serializers.BooleanField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    term_display = serializers.CharField(source="get_term_display", read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    payment_attempts = PaymentAttemptSerializer(many=True, read_only=True)
    payment_plans = PaymentPlanSerializer(many=True, read_only=True)
    available_gateways = serializers.SerializerMethodField()

    class Meta:
        model = StudentFee
        fields = "__all__"

    def get_available_gateways(self, obj):
        active_gateways = PaymentGatewayConfig.objects.filter(
            is_active=True,
            min_amount__lte=obj.balance,
            max_amount__gte=obj.balance,
        )
        return PaymentGatewayConfigSerializer(active_gateways, many=True).data


# ---------------------------------------------------------------------------
# Payment initiation / verification
# ---------------------------------------------------------------------------

class PaymentInitiationSerializer(serializers.Serializer):
    student_fee_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    payment_gateway = serializers.ChoiceField(choices=[])
    payment_method = serializers.ChoiceField(choices=[])
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False)
    callback_url = serializers.URLField(required=False)
    metadata = serializers.JSONField(required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .constants import PAYMENT_GATEWAYS, PAYMENT_METHODS

        self.fields["payment_gateway"].choices = PAYMENT_GATEWAYS
        self.fields["payment_method"].choices = PAYMENT_METHODS

    def validate_student_fee_id(self, value):
        try:
            self.student_fee = StudentFee.objects.get(id=value)
            return value
        except StudentFee.DoesNotExist:
            raise serializers.ValidationError("Student fee record not found.")

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_payment_gateway(self, value):
        try:
            self.gateway_config = PaymentGatewayConfig.objects.get(
                gateway=value, is_active=True
            )
            return value
        except PaymentGatewayConfig.DoesNotExist:
            raise serializers.ValidationError("Payment gateway not available.")

    def validate(self, attrs):
        student_fee = getattr(self, "student_fee", None)
        gateway_config = getattr(self, "gateway_config", None)
        amount = attrs.get("amount")

        if student_fee and amount:
            if amount > student_fee.balance:
                raise serializers.ValidationError(
                    {"amount": "Payment amount cannot exceed outstanding balance."}
                )

        if gateway_config and amount:
            if amount < gateway_config.min_amount or amount > gateway_config.max_amount:
                raise serializers.ValidationError(
                    {
                        "amount": (
                            f"Amount must be between {gateway_config.min_amount} "
                            f"and {gateway_config.max_amount} for this gateway."
                        )
                    }
                )

        return attrs


class PaymentVerificationSerializer(serializers.Serializer):
    reference = serializers.CharField(max_length=100)
    gateway = serializers.ChoiceField(choices=[], required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .constants import PAYMENT_GATEWAYS

        self.fields["gateway"].choices = PAYMENT_GATEWAYS


# ---------------------------------------------------------------------------
# PaymentPlan create
# ---------------------------------------------------------------------------

class PaymentPlanCreateSerializer(serializers.ModelSerializer):
    installments_data = serializers.ListField(
        child=serializers.DictField(), write_only=True, required=False
    )

    class Meta:
        model = PaymentPlan
        fields = [
            "student_fee",
            "name",
            "total_amount",
            "number_of_installments",
            "installment_amount",
            "installments_data",
        ]

    def validate(self, attrs):
        student_fee = attrs.get("student_fee")
        total_amount = attrs.get("total_amount")
        if student_fee and total_amount:
            if total_amount > student_fee.balance:
                raise serializers.ValidationError(
                    {"total_amount": "Plan amount cannot exceed outstanding balance."}
                )
        return attrs

    def create(self, validated_data):
        installments_data = validated_data.pop("installments_data", [])
        payment_plan = PaymentPlan.objects.create(**validated_data)
        for installment_data in installments_data:
            PaymentInstallment.objects.create(
                payment_plan=payment_plan, **installment_data
            )
        return payment_plan


# ---------------------------------------------------------------------------
# StudentDashboardSerializer
# education_level is now a @property; student_class is now a FK
# ---------------------------------------------------------------------------


class StudentDashboardSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="user.full_name", read_only=True)

    # student_class is now FK — expose name for display
    student_class_display = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )
    student_class_id = serializers.IntegerField(
        source="student_class.id", read_only=True, allow_null=True
    )

    # education_level is now a @property returning level_type string
    education_level = serializers.CharField(read_only=True)
    education_level_display = serializers.CharField(
        source="education_level_display", read_only=True
    )

    profile_picture = serializers.CharField(read_only=True)
    admission_date = serializers.DateField(read_only=True)
    total_fees = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    total_balance = serializers.SerializerMethodField()
    overdue_count = serializers.SerializerMethodField()
    pending_count = serializers.SerializerMethodField()
    recent_payments = serializers.SerializerMethodField()
    active_payment_plans = serializers.SerializerMethodField()
    upcoming_assignments = serializers.SerializerMethodField()
    recent_grades = serializers.SerializerMethodField()
    today_schedule = serializers.SerializerMethodField()
    notifications = serializers.SerializerMethodField()
    attendance_summary = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id",
            "student_name",
            "student_class_display",
            "student_class_id",
            "education_level",
            "education_level_display",
            "profile_picture",
            "admission_date",
            "total_fees",
            "total_paid",
            "total_balance",
            "overdue_count",
            "pending_count",
            "recent_payments",
            "active_payment_plans",
            "upcoming_assignments",
            "recent_grades",
            "today_schedule",
            "notifications",
            "attendance_summary",
        ]

    def _get_current_session(self):
        return AcademicSession.objects.filter(is_active=True).first()

    def get_total_fees(self, obj):
        session = self._get_current_session()
        if session:
            return (
                obj.fees.filter(academic_session=session).aggregate(
                    total=Sum("amount_due")
                )["total"]
                or 0
            )
        return 0

    def get_total_paid(self, obj):
        session = self._get_current_session()
        if session:
            return (
                obj.fees.filter(academic_session=session).aggregate(
                    total=Sum("amount_paid")
                )["total"]
                or 0
            )
        return 0

    def get_total_balance(self, obj):
        return self.get_total_fees(obj) - self.get_total_paid(obj)

    def get_overdue_count(self, obj):
        session = self._get_current_session()
        if session:
            return obj.fees.filter(academic_session=session, status="OVERDUE").count()
        return 0

    def get_pending_count(self, obj):
        session = self._get_current_session()
        if session:
            return obj.fees.filter(
                academic_session=session, status__in=["PENDING", "PARTIAL"]
            ).count()
        return 0

    def get_recent_payments(self, obj):
        recent = Payment.objects.filter(
            student_fee__student=obj, verified=True
        ).order_by("-payment_date")[:5]
        return PaymentSerializer(recent, many=True).data

    def get_active_payment_plans(self, obj):
        plans = PaymentPlan.objects.filter(
            student_fee__student=obj, is_active=True, is_completed=False
        )
        return PaymentPlanSerializer(plans, many=True).data

    def get_upcoming_assignments(self, obj):
        from lesson.models import LessonAssessment
        from datetime import datetime

        now = datetime.now()
        return [
            {
                "id": a.id,
                "title": a.title,
                "description": a.description,
                "due_date": a.due_date,
                "lesson": str(a.lesson),
                "assessment_type": a.assessment_type,
            }
            for a in LessonAssessment.objects.filter(
                lesson__classroom__students=obj, due_date__gte=now
            ).order_by("due_date")[:5]
        ]

    def get_recent_grades(self, obj):
        from result.models import StudentResult

        return [
            {
                "id": r.id,
                "subject": str(r.subject),
                "exam_session": str(r.exam_session),
                "total_score": r.total_score,
                "grade": r.grade,
                "status": r.status,
                "created_at": r.created_at,
            }
            for r in StudentResult.objects.filter(student=obj).order_by("-created_at")[
                :5
            ]
        ]

    def get_today_schedule(self, obj):
        from lesson.models import Lesson
        from datetime import date

        today = date.today()
        return [
            {
                "id": l.id,
                "title": l.title,
                "subject": str(l.subject),
                "start_time": l.start_time,
                "end_time": l.end_time,
                "teacher": str(l.teacher),
            }
            for l in Lesson.objects.filter(
                classroom__students=obj, date=today
            ).order_by("start_time")
        ]

    def get_notifications(self, obj):
        from schoolSettings.models import SchoolAnnouncement
        from django.utils import timezone as tz

        now = tz.now()
        announcements = SchoolAnnouncement.objects.filter(
            is_active=True, start_date__lte=now
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=now))
        return [
            {
                "id": n.id,
                "title": n.title,
                "content": n.content,
                "announcement_type": n.announcement_type,
                "start_date": n.start_date,
                "end_date": n.end_date,
            }
            for n in announcements
            if "student" in (n.target_audience or [])
        ][:5]

    def get_attendance_summary(self, obj):
        from attendance.models import Attendance
        qs = Attendance.objects.filter(student=obj)
        return {
            "total": qs.count(),
            "present": qs.filter(status="P").count(),
            "absent": qs.filter(status="A").count(),
            "late": qs.filter(status="L").count(),
            "excused": qs.filter(status="E").count(),
        }


# ---------------------------------------------------------------------------
# FeeDiscount / StudentDiscount / PaymentReminder
# ---------------------------------------------------------------------------

class FeeDiscountSerializer(serializers.ModelSerializer):
    discount_type_display = serializers.CharField(
        source="get_discount_type_display", read_only=True
    )

    class Meta:
        model = FeeDiscount
        fields = "__all__"


class StudentDiscountSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    discount_name = serializers.CharField(source="discount.name", read_only=True)
    discount_value = serializers.DecimalField(
        source="discount.value", max_digits=10, decimal_places=2, read_only=True
    )
    discount_type = serializers.CharField(
        source="discount.discount_type", read_only=True
    )
    applied_by_name = serializers.CharField(
        source="applied_by.full_name", read_only=True
    )

    class Meta:
        model = StudentDiscount
        fields = "__all__"


class PaymentReminderSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="student_fee.student.full_name", read_only=True
    )
    fee_name = serializers.CharField(
        source="student_fee.fee_structure.name", read_only=True
    )
    amount_due = serializers.DecimalField(
        source="student_fee.amount_due", max_digits=10, decimal_places=2, read_only=True
    )
    due_date = serializers.DateField(source="student_fee.due_date", read_only=True)

    class Meta:
        model = PaymentReminder
        fields = "__all__"


# ---------------------------------------------------------------------------
# BulkFeeGenerationSerializer
# education_level and student_class replaced with FK id fields
# ---------------------------------------------------------------------------

class BulkFeeGenerationSerializer(serializers.Serializer):
    """Serializer for bulk fee generation"""

    academic_session_id = serializers.IntegerField()

    # education_level: FK id to EducationLevel (replaces old ChoiceField from constants)
    education_level_id = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        required=False,
        allow_null=True,
        help_text="Filter by EducationLevel FK id",
    )
    # student_class: FK id to StudentClass (replaces old ChoiceField from constants)
    student_class_id = serializers.PrimaryKeyRelatedField(
        queryset=StudentClass.objects.all(),
        required=False,
        allow_null=True,
        help_text="Filter by StudentClass FK id",
    )

    term = serializers.ChoiceField(
        choices=[
            ("FIRST", "First Term"),
            ("SECOND", "Second Term"),
            ("THIRD", "Third Term"),
        ],
        required=False,
    )
    fee_structure_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text=(
            "List of fee structure IDs to generate. "
            "If empty, all applicable fees will be generated."
        ),
    )

    def validate_academic_session_id(self, value):
        try:
            AcademicSession.objects.get(id=value)
            return value
        except AcademicSession.DoesNotExist:
            raise serializers.ValidationError("Academic session not found.")

    def validate(self, data):
        """If student_class provided, ensure it belongs to the given education_level."""
        education_level = data.get("education_level_id")
        student_class = data.get("student_class_id")
        if education_level and student_class:
            if student_class.education_level_id != education_level.id:
                raise serializers.ValidationError(
                    {
                        "student_class_id": "This class does not belong to the selected education level."
                    }
                )
        return data


# ---------------------------------------------------------------------------
# FeeReportSerializer
# education_level and student_class replaced with FK id fields
# ---------------------------------------------------------------------------

class FeeReportSerializer(serializers.Serializer):
    """Serializer for fee reports"""

    academic_session_id = serializers.IntegerField(required=False)

    # FK id fields (replace old ChoiceField using constants.EDUCATION_LEVELS / CLASSES)
    education_level_id = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        required=False,
        allow_null=True,
        help_text="Filter by EducationLevel FK id",
    )
    student_class_id = serializers.PrimaryKeyRelatedField(
        queryset=StudentClass.objects.all(),
        required=False,
        allow_null=True,
        help_text="Filter by StudentClass FK id",
    )

    # fee_type and status are still plain choice fields on the Payment / FeeStructure model
    fee_type = serializers.ChoiceField(choices=[], required=False)
    status = serializers.ChoiceField(choices=[], required=False)
    payment_gateway = serializers.ChoiceField(choices=[], required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    report_type = serializers.ChoiceField(
        choices=[
            ("SUMMARY", "Summary Report"),
            ("DETAILED", "Detailed Report"),
            ("OVERDUE", "Overdue Report"),
            ("PAYMENT_HISTORY", "Payment History"),
            ("GATEWAY_ANALYSIS", "Gateway Analysis"),
            ("INSTALLMENT_REPORT", "Installment Report"),
        ]
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .constants import FEE_TYPES, PAYMENT_STATUS, PAYMENT_GATEWAYS

        self.fields["fee_type"].choices = FEE_TYPES
        self.fields["status"].choices = PAYMENT_STATUS
        self.fields["payment_gateway"].choices = PAYMENT_GATEWAYS


# ---------------------------------------------------------------------------
# Statistics / analytics (output-only, no FK changes needed)
# ---------------------------------------------------------------------------


class PaymentStatsSerializer(serializers.Serializer):
    total_payments = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    successful_payments = serializers.IntegerField()
    failed_payments = serializers.IntegerField()
    pending_payments = serializers.IntegerField()
    gateway_breakdown = serializers.DictField()
    method_breakdown = serializers.DictField()
    daily_trends = serializers.ListField()
    average_transaction_value = serializers.DecimalField(
        max_digits=10, decimal_places=2
    )


class GatewayAnalyticsSerializer(serializers.Serializer):
    gateway = serializers.CharField()
    total_transactions = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    success_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    average_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_fees = serializers.DecimalField(max_digits=10, decimal_places=2)
    net_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
