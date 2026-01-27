# fees/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Q, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.core.exceptions import ValidationError
import csv
import io
from datetime import datetime
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination, StandardResultsPagination


from .models import (
    FeeStructure,
    StudentFee,
    Payment,
    PaymentAttempt,
    PaymentWebhook,
    PaymentGatewayConfig,
    PaymentPlan,
    PaymentInstallment,
    FeeDiscount,
    StudentDiscount,
    PaymentReminder,
)
from academics.models import Term, AcademicSession
from academics.serializers import AcademicSessionSerializer
from .serializers import (
    FeeStructureSerializer,
    StudentFeeSerializer,
    StudentFeeListSerializer,
    PaymentSerializer,
    PaymentInitiationSerializer,
    PaymentVerificationSerializer,
    StudentDashboardSerializer,
    FeeDiscountSerializer,
    StudentDiscountSerializer,
    PaymentReminderSerializer,
    BulkFeeGenerationSerializer,
    FeeReportSerializer,
    PaymentGatewayConfigSerializer,
    PaymentPlanSerializer,
    PaymentInstallmentSerializer,
    PaymentAttemptSerializer,
    PaymentWebhookSerializer,
)
from .filters import StudentFeeFilter, PaymentFilter
from .permissions import IsAdminOrReadOnly, IsOwnerOrAdmin
from .services.services import PaymentService, FeeService, ReportService
from students.models import Student


class FeeStructureViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing fee structures
    """

    queryset = FeeStructure.objects.all().order_by("name")
    serializer_class = FeeStructureSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate fee structures
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "education_level",
        "student_class",
        "fee_type",
        "frequency",
        "is_active",
    ]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "amount", "created_at"]
    ordering = ["name"]

    @action(detail=False, methods=["get"])
    def by_class(self, request):
        """Get fee structures filtered by education level and class"""
        education_level = request.query_params.get("education_level")
        student_class = request.query_params.get("student_class")

        queryset = self.get_queryset().filter(is_active=True)

        if education_level:
            queryset = queryset.filter(education_level=education_level)
        if student_class:
            queryset = queryset.filter(student_class=student_class)

        # PERFORMANCE: Add pagination to handle large datasets
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class StudentFeeViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing student fees
    """

    queryset = (
        StudentFee.objects.select_related(
            "student", "fee_structure", "academic_session"
        )
        .all()
        .order_by("-created_at")
    )
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large fee datasets
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = StudentFeeFilter
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "fee_structure__name",
        "student__admission_number",
    ]
    ordering_fields = ["amount_due", "amount_paid", "due_date", "created_at"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return StudentFeeListSerializer
        return StudentFeeSerializer

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        # If user is a student, only show their own fees
        if hasattr(self.request.user, "student_profile"):
            queryset = queryset.filter(student=self.request.user.student_profile)

        return queryset

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Get student fee dashboard data"""
        if hasattr(request.user, "student_profile"):
            student = request.user.student_profile
            serializer = StudentDashboardSerializer(student)
            return Response(serializer.data)
        return Response({"error": "User is not a student"}, status=400)

    @action(detail=False, methods=["get"])
    def overdue(self, request):
        """Get overdue fees"""
        queryset = self.get_queryset().filter(
            due_date__lt=timezone.now().date(), status__in=["PENDING", "PARTIAL"]
        )

        # PERFORMANCE: Add pagination to handle large datasets
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def apply_discount(self, request, pk=None):
        """Apply discount to a student fee"""
        student_fee = self.get_object()
        discount_id = request.data.get("discount_id")

        try:
            discount = FeeDiscount.objects.get(id=discount_id, is_active=True)

            # Check if discount already applied
            if StudentDiscount.objects.filter(
                student=student_fee.student, discount=discount
            ).exists():
                return Response(
                    {"error": "Discount already applied to this student"}, status=400
                )

            # Apply discount
            student_discount = StudentDiscount.objects.create(
                student=student_fee.student, discount=discount, applied_by=request.user
            )

            # Recalculate fee amount
            FeeService.recalculate_student_fee(student_fee)

            return Response(
                {
                    "message": "Discount applied successfully",
                    "discount": StudentDiscountSerializer(student_discount).data,
                }
            )

        except FeeDiscount.DoesNotExist:
            return Response({"error": "Discount not found"}, status=404)

    @action(detail=False, methods=["post"])
    def bulk_generate(self, request):
        """Bulk generate fees for students"""
        serializer = BulkFeeGenerationSerializer(data=request.data)
        if serializer.is_valid():
            result = FeeService.bulk_generate_fees(serializer.validated_data)
            return Response(result)
        return Response(serializer.errors, status=400)

    @action(detail=True, methods=["post"])
    def create_payment_plan(self, request, pk=None):
        """Create payment plan for a student fee"""
        student_fee = self.get_object()

        # Check if user can create payment plans
        if not (request.user.is_staff or hasattr(request.user, "student_profile")):
            return Response({"error": "Permission denied"}, status=403)

        # Validate that this is the student's own fee if not staff
        if (
            hasattr(request.user, "student_profile")
            and student_fee.student != request.user.student_profile
        ):
            return Response(
                {"error": "Can only create payment plans for your own fees"}, status=403
            )

        serializer = PaymentPlanSerializer(data=request.data)
        if serializer.is_valid():
            try:
                payment_plan = FeeService.create_payment_plan(
                    student_fee, serializer.validated_data
                )
                return Response(PaymentPlanSerializer(payment_plan).data)
            except Exception as e:
                return Response({"error": str(e)}, status=400)
        return Response(serializer.errors, status=400)


class PaymentViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing payments with multi-gateway support
    """

    queryset = (
        Payment.objects.select_related(
            "student_fee__student", "student_fee__fee_structure"
        )
        .all()
        .order_by("-created_at")
    )
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large payment datasets
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = PaymentFilter
    search_fields = [
        "reference",
        "gateway_reference",
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
        "receipt_number",
    ]
    ordering_fields = ["amount", "payment_date", "created_at", "gateway_status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        # If user is a student, only show their own payments
        if hasattr(self.request.user, "student_profile"):
            queryset = queryset.filter(
                student_fee__student=self.request.user.student_profile
            )

        return queryset

    @action(detail=False, methods=["post"])
    def initiate(self, request):
        """Initiate a payment with specified gateway"""
        serializer = PaymentInitiationSerializer(data=request.data)
        if serializer.is_valid():
            try:
                result = PaymentService.initiate_payment(
                    serializer.validated_data, request.user
                )
                return Response(result)
            except Exception as e:
                return Response({"error": str(e)}, status=400)
        return Response(serializer.errors, status=400)

    @action(detail=False, methods=["post"])
    def verify(self, request):
        """Verify a payment from any gateway"""
        serializer = PaymentVerificationSerializer(data=request.data)
        if serializer.is_valid():
            try:
                result = PaymentService.verify_payment(
                    serializer.validated_data["reference"]
                )
                return Response(result)
            except Exception as e:
                return Response({"error": str(e)}, status=400)
        return Response(serializer.errors, status=400)

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """Generate payment receipt"""
        payment = self.get_object()

        if not payment.verified:
            return Response({"error": "Payment not verified"}, status=400)

        # Generate PDF receipt (you'll need to implement this)
        # For now, return payment details
        return Response(
            {
                "payment": PaymentSerializer(payment).data,
                "receipt_url": f"/api/payments/{payment.id}/receipt/",
                "receipt_number": payment.receipt_number,
            }
        )

    @action(detail=False, methods=["get"])
    def gateways(self, request):
        """Get available payment gateways"""
        gateways = PaymentGatewayConfig.objects.filter(is_active=True)
        serializer = PaymentGatewayConfigSerializer(gateways, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_gateway(self, request):
        """Get payments by gateway"""
        gateway = request.query_params.get("gateway")
        status_filter = request.query_params.get("status")

        queryset = self.get_queryset()

        if gateway:
            queryset = queryset.filter(payment_gateway=gateway)
        if status_filter:
            queryset = queryset.filter(gateway_status=status_filter)

        # PERFORMANCE: Add pagination to handle large datasets
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        """Initiate payment refund"""
        payment = self.get_object()

        if not payment.verified or payment.gateway_status != "SUCCESS":
            return Response({"error": "Payment cannot be refunded"}, status=400)

        try:
            result = PaymentService.initiate_refund(payment, request.data.get("reason"))
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class PaymentGatewayConfigViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing payment gateway configurations
    """

    queryset = PaymentGatewayConfig.objects.all().order_by("gateway")
    serializer_class = PaymentGatewayConfigSerializer
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate gateway configs
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["gateway", "is_active", "is_test_mode"]
    search_fields = ["gateway"]
    ordering_fields = ["gateway", "created_at"]
    ordering = ["gateway"]

    @action(detail=True, methods=["post"])
    def toggle_status(self, request, pk=None):
        """Toggle gateway active status"""
        gateway_config = self.get_object()
        gateway_config.is_active = not gateway_config.is_active
        gateway_config.save()

        return Response(
            {
                "message": f"Gateway {gateway_config.gateway} {'activated' if gateway_config.is_active else 'deactivated'}",
                "is_active": gateway_config.is_active,
            }
        )

    @action(detail=True, methods=["post"])
    def test_connection(self, request, pk=None):
        """Test gateway connection"""
        gateway_config = self.get_object()

        try:
            result = PaymentService.test_gateway_connection(gateway_config)
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class PaymentAttemptViewSet(TenantFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for viewing payment attempts
    """

    queryset = PaymentAttempt.objects.all().order_by("-created_at")
    serializer_class = PaymentAttemptSerializer
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate payment attempts
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["gateway", "status", "student_fee"]
    search_fields = ["attempt_reference", "error_message"]
    ordering_fields = ["created_at", "amount"]
    ordering = ["-created_at"]

    @action(detail=False, methods=["get"])
    def failure_analysis(self, request):
        """Get payment failure analysis"""
        try:
            analysis = PaymentService.get_failure_analysis()
            return Response(analysis)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class PaymentWebhookViewSet(TenantFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing payment webhooks
    """

    queryset = PaymentWebhook.objects.all().order_by("-created_at")
    serializer_class = PaymentWebhookSerializer
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate webhooks
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["gateway", "event_type", "processed"]
    search_fields = ["event_type", "event_id"]
    ordering_fields = ["created_at", "processed_at"]
    ordering = ["-created_at"]

    @action(detail=True, methods=["post"])
    def reprocess(self, request, pk=None):
        """Reprocess a webhook"""
        webhook = self.get_object()

        try:
            result = PaymentService.process_webhook(webhook)
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["get"])
    def unprocessed(self, request):
        """Get unprocessed webhooks"""
        queryset = self.get_queryset().filter(processed=False)

        # PERFORMANCE: Add pagination to handle large datasets
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class PaymentPlanViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing payment plans
    """

    queryset = (
        PaymentPlan.objects.select_related("student_fee__student")
        .all()
        .order_by("-created_at")
    )
    serializer_class = PaymentPlanSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate payment plans
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "is_completed", "student_fee"]
    search_fields = [
        "name",
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
    ]
    ordering_fields = ["created_at", "total_amount"]
    ordering = ["-created_at"]

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        # If user is a student, only show their own payment plans
        if hasattr(self.request.user, "student_profile"):
            queryset = queryset.filter(
                student_fee__student=self.request.user.student_profile
            )

        return queryset

    @action(detail=True, methods=["get"])
    def installments(self, request, pk=None):
        """Get installments for a payment plan"""
        payment_plan = self.get_object()
        installments = payment_plan.installments.all()
        serializer = PaymentInstallmentSerializer(installments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def pay_installment(self, request, pk=None):
        """Pay a specific installment"""
        payment_plan = self.get_object()
        installment_number = request.data.get("installment_number")

        try:
            installment = payment_plan.installments.get(
                installment_number=installment_number
            )

            if installment.is_paid:
                return Response({"error": "Installment already paid"}, status=400)

            # Create payment for installment
            result = PaymentService.create_installment_payment(
                installment, request.data, request.user
            )
            return Response(result)

        except PaymentInstallment.DoesNotExist:
            return Response({"error": "Installment not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class FeeDiscountViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing fee discounts
    """

    queryset = FeeDiscount.objects.all().order_by("name")
    serializer_class = FeeDiscountSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate discounts
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["discount_type", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "value", "created_at"]
    ordering = ["name"]

    @action(detail=False, methods=["get"])
    def active(self, request):
        """Get active discounts"""
        queryset = self.get_queryset().filter(is_active=True)

        # PERFORMANCE: Add pagination for consistency
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class StudentDiscountViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing student discounts
    """

    queryset = (
        StudentDiscount.objects.select_related("student", "discount", "applied_by")
        .all()
        .order_by("-applied_date")
    )
    serializer_class = StudentDiscountSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate student discounts
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["student", "discount", "is_active"]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "discount__name",
    ]
    ordering_fields = ["applied_date"]
    ordering = ["-applied_date"]

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Deactivate a student discount"""
        student_discount = self.get_object()
        student_discount.is_active = False
        student_discount.save()

        # Recalculate affected fees
        student_fees = StudentFee.objects.filter(student=student_discount.student)
        for fee in student_fees:
            FeeService.recalculate_student_fee(fee)

        return Response({"message": "Discount deactivated successfully"})


class PaymentReminderViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for managing payment reminders
    """

    queryset = (
        PaymentReminder.objects.select_related(
            "student_fee__student", "student_fee__fee_structure"
        )
        .all()
        .order_by("-created_at")
    )
    serializer_class = PaymentReminderSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate reminders
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["sent", "reminder_type"]
    search_fields = [
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
    ]
    ordering_fields = ["created_at", "sent_date"]
    ordering = ["-created_at"]

    @action(detail=False, methods=["post"])
    def send_bulk(self, request):
        """Send bulk payment reminders"""
        reminder_type = request.data.get("reminder_type", "EMAIL")
        student_ids = request.data.get("student_ids", [])

        try:
            count = PaymentService.send_bulk_reminders(
                student_ids=student_ids, reminder_type=reminder_type
            )
            return Response({"message": f"{count} reminders sent successfully"})
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"])
    def mark_sent(self, request, pk=None):
        """Mark reminder as sent"""
        reminder = self.get_object()
        reminder.sent = True
        reminder.sent_date = timezone.now()
        reminder.save()

        return Response({"message": "Reminder marked as sent"})


class ReportViewSet(viewsets.ViewSet):
    """ViewSet for generating reports"""

    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Generate fee reports"""
        serializer = FeeReportSerializer(data=request.data)
        if serializer.is_valid():
            try:
                report_data = ReportService.generate_report(serializer.validated_data)
                return Response(report_data)
            except Exception as e:
                return Response({"error": str(e)}, status=400)
        return Response(serializer.errors, status=400)

    @action(detail=False, methods=["post"])
    def export_csv(self, request):
        """Export report as CSV"""
        serializer = FeeReportSerializer(data=request.data)
        if serializer.is_valid():
            try:
                # Generate CSV content
                csv_content = ReportService.export_csv(serializer.validated_data)

                response = HttpResponse(csv_content, content_type="text/csv")
                response["Content-Disposition"] = (
                    'attachment; filename="fee_report.csv"'
                )
                return response

            except Exception as e:
                return Response({"error": str(e)}, status=400)
        return Response(serializer.errors, status=400)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Get fee summary statistics"""
        active_session = AcademicSession.objects.filter(is_active=True).first()

        if not active_session:
            return Response({"error": "No active academic session"}, status=400)

        # Calculate summary statistics
        total_fees = StudentFee.objects.filter(
            academic_session=active_session
        ).aggregate(
            total_due=Sum("amount_due"),
            total_paid=Sum("amount_paid"),
            total_balance=Sum("amount_due") - Sum("amount_paid"),
        )

        # Count statistics
        fee_counts = {
            "total_students": Student.objects.count(),
            "total_fees": StudentFee.objects.filter(
                academic_session=active_session
            ).count(),
            "paid_fees": StudentFee.objects.filter(
                academic_session=active_session, status="PAID"
            ).count(),
            "overdue_fees": StudentFee.objects.filter(
                academic_session=active_session, status="OVERDUE"
            ).count(),
            "pending_fees": StudentFee.objects.filter(
                academic_session=active_session, status__in=["PENDING", "PARTIAL"]
            ).count(),
        }

        # Gateway statistics
        gateway_stats = (
            Payment.objects.filter(
                student_fee__academic_session=active_session, verified=True
            )
            .values("payment_gateway")
            .annotate(total_amount=Sum("amount"), count=Count("id"))
            .order_by("-total_amount")
        )

        return Response(
            {
                "session": AcademicSessionSerializer(active_session).data,
                "financial_summary": total_fees,
                "fee_counts": fee_counts,
                "gateway_statistics": list(gateway_stats),
            }
        )

    @action(detail=False, methods=["get"])
    def payment_analytics(self, request):
        """Get payment analytics"""
        try:
            analytics = ReportService.get_payment_analytics(
                start_date=request.query_params.get("start_date"),
                end_date=request.query_params.get("end_date"),
                gateway=request.query_params.get("gateway"),
            )
            return Response(analytics)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["get"])
    def gateway_performance(self, request):
        """Get gateway performance metrics"""
        try:
            performance = ReportService.get_gateway_performance()
            return Response(performance)
        except Exception as e:
            return Response({"error": str(e)}, status=400)
