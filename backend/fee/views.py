# fees/views.py - UPDATED FOR FK-BASED MODELS
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import (
    action, api_view, authentication_classes, permission_classes)
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Q, Count, Prefetch
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
    FeeStructureCreateUpdateSerializer,  # NEW: Separate writable serializer
    StudentFeeSerializer,
    StudentFeeListSerializer,
    PaymentSerializer,
    PaymentCreateSerializer,  # NEW: Use create serializer
    PaymentInitiationSerializer,
    PaymentVerificationSerializer,
    StudentDashboardSerializer,
    FeeDiscountSerializer,
    StudentDiscountSerializer,
    PaymentReminderSerializer,
    BulkFeeGenerationSerializer,
    FeeReportSerializer,
    PaymentGatewayConfigSerializer,
    PaymentGatewayConfigAdminSerializer,  # NEW: Admin serializer
    PaymentPlanSerializer,
    PaymentPlanCreateSerializer,  # NEW: Create serializer
    PaymentInstallmentSerializer,
    PaymentAttemptSerializer,
    PaymentWebhookSerializer,
)
from .filters import StudentFeeFilter, PaymentFilter
from .permissions import FamiliesReadOnly, IsAdminOrReadOnly, IsOwnerOrAdmin
from .services.services import PaymentService, FeeService, ReportService
from .services.paystack_service import PaystackNotConfigured, PaystackService
from . import billing, checkout, reminders
from schoolSettings.permissions import HasFinancePermission
from students.models import Student
from academics.models import EducationLevel
from classroom.models import Class as StudentClass
from tenants.models import Tenant


# ==============================================================================
# FeeStructure ViewSet - UPDATED FOR FK
# ==============================================================================
class FeeStructureViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing fee structures
    UPDATED: Uses FK-based education_level and student_class
    """

    queryset = FeeStructure.objects.all().order_by("name")
    serializer_class = FeeStructureSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]

    # UPDATED: Filter by FK IDs
    filterset_fields = [
        "education_level",  # FK to EducationLevel
        "student_class",  # FK to StudentClass
        "fee_type",
        "frequency",
        "is_active",
    ]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "amount", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        """Optimize queries with select_related for FK fields"""
        queryset = super().get_queryset()
        return queryset.select_related(
            "education_level",
            "student_class",
            "student_class__education_level",  # Nested FK
        )

    def get_serializer_class(self):
        """Use different serializers for read vs write operations"""
        if self.action in ["create", "update", "partial_update"]:
            return FeeStructureCreateUpdateSerializer
        return FeeStructureSerializer

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        """
        Get fee structures by education level
        Query params: education_level_id (FK ID)
        """
        education_level_id = request.query_params.get("education_level_id")

        if not education_level_id:
            return Response(
                {"error": "education_level_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(
            education_level_id=education_level_id, is_active=True
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_class(self, request):
        """
        Get fee structures by class
        Query params:
        - education_level_id: FK ID (optional)
        - student_class_id: FK ID (optional)
        """
        education_level_id = request.query_params.get("education_level_id")
        student_class_id = request.query_params.get("student_class_id")

        queryset = self.get_queryset().filter(is_active=True)

        if education_level_id:
            queryset = queryset.filter(education_level_id=education_level_id)
        if student_class_id:
            queryset = queryset.filter(student_class_id=student_class_id)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get fee structure statistics by education level"""
        queryset = self.get_queryset().filter(is_active=True)

        # Group by education level
        by_education_level = []
        education_levels = EducationLevel.objects.filter(is_active=True)

        for edu_level in education_levels:
            fee_structures = queryset.filter(education_level=edu_level)

            by_education_level.append(
                {
                    "education_level_id": edu_level.id,
                    "education_level_name": edu_level.name,
                    "education_level_code": edu_level.code,
                    "fee_structure_count": fee_structures.count(),
                    "total_amount": fee_structures.aggregate(total=Sum("amount"))[
                        "total"
                    ]
                    or 0,
                }
            )

        return Response(
            {
                "total_fee_structures": queryset.count(),
                "active_fee_structures": queryset.filter(is_active=True).count(),
                "by_education_level": by_education_level,
            }
        )


# ==============================================================================
# StudentFee ViewSet - UPDATED FOR FK
# ==============================================================================
class StudentFeeViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing student fees
    UPDATED: Optimized queries for FK relationships
    """

    queryset = StudentFee.objects.all().order_by("-created_at")
    permission_classes = [permissions.IsAuthenticated, FamiliesReadOnly]
    pagination_class = LargeResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = StudentFeeFilter
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "fee_structure__name",
        "student__registration_number",
    ]
    ordering_fields = ["amount_due", "amount_paid", "due_date", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """
        Optimize queries with select_related and prefetch_related
        UPDATED: Include FK chains for student_class and education_level
        """
        queryset = super().get_queryset()

        # Optimize with select_related for FK fields
        queryset = queryset.select_related(
            "student",
            "student__user",
            "student__student_class",  # FK to StudentClass
            "student__student_class__education_level",  # Nested FK
            "student__stream",  # FK to Stream
            "student__stream__stream_type_new",  # FK to StreamType
            "fee_structure",
            "fee_structure__education_level",  # FK
            "fee_structure__student_class",  # FK
            "academic_session",
        )

        # Prefetch related payments and plans
        queryset = queryset.prefetch_related(
            Prefetch(
                "payments",
                queryset=Payment.objects.filter(verified=True).order_by(
                    "-payment_date"
                ),
            ),
            Prefetch(
                "payment_plans", queryset=PaymentPlan.objects.filter(is_active=True)
            ),
        )

        # A student sees only their own fees, and a parent only their
        # children's. Parents used to fall through and see the whole school's.
        user = self.request.user
        if hasattr(user, "student_profile"):
            queryset = queryset.filter(student=user.student_profile)
        elif getattr(user, "role", None) == "parent":
            parent = checkout.parent_of(user, getattr(self.request, "tenant", None))
            queryset = (queryset.filter(student__in=parent.get_students())
                        if parent else queryset.none())

        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return StudentFeeListSerializer
        return StudentFeeSerializer

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """Get student fee dashboard data"""
        if hasattr(request.user, "student_profile"):
            student = request.user.student_profile
            serializer = StudentDashboardSerializer(student)
            return Response(serializer.data)
        return Response({"error": "User is not a student"}, status=400)

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        """
        Get fees by education level
        Query params: education_level_id (FK ID)
        """
        education_level_id = request.query_params.get("education_level_id")

        if not education_level_id:
            return Response(
                {"error": "education_level_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(
            student__student_class__education_level_id=education_level_id
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_class(self, request):
        """
        Get fees by student class
        Query params: student_class_id (FK ID)
        """
        student_class_id = request.query_params.get("student_class_id")

        if not student_class_id:
            return Response(
                {"error": "student_class_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(
            student__student_class_id=student_class_id
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def overdue(self, request):
        """Get overdue fees"""
        queryset = self.get_queryset().filter(
            due_date__lt=timezone.now().date(), status__in=["PENDING", "PARTIAL"]
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

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
                    {"error": "Discount already applied to this student"},
                    status=status.HTTP_400_BAD_REQUEST,
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
            return Response(
                {"error": "Discount not found"}, status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=["post"],
            permission_classes=[permissions.IsAuthenticated, HasFinancePermission])
    def bulk_generate(self, request):
        """
        Issue one fee to a class, a level or the whole school for a term
        (fee.billing), with the sibling discount applied as it goes.
        """
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return Response({"error": "Name the school."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BulkFeeGenerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Every id is read within this school, so none of them can reach
        # another school's students, classes or sessions.
        try:
            fee_structure = FeeStructure.objects.get(
                pk=data["fee_structure_id"], tenant=tenant)
            academic_session = AcademicSession.objects.get(
                pk=data["academic_session_id"], tenant=tenant)
            student_class = (
                StudentClass.objects.get(pk=data["student_class_id"], tenant=tenant)
                if data.get("student_class_id") else None)
            education_level = (
                EducationLevel.objects.get(pk=data["education_level_id"], tenant=tenant)
                if data.get("education_level_id") else None)
        except (FeeStructure.DoesNotExist, AcademicSession.DoesNotExist,
                StudentClass.DoesNotExist, EducationLevel.DoesNotExist):
            return Response(
                {"error": "That fee, session, class or level is not this school's."},
                status=status.HTTP_400_BAD_REQUEST)

        try:
            summary = billing.issue_fees(
                tenant, fee_structure, academic_session, data["term"], data["due_date"],
                student_ids=data.get("student_ids") or None,
                student_class=student_class, education_level=education_level)
        except billing.BillingError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(summary)

    @action(detail=True, methods=["post"])
    def create_payment_plan(self, request, pk=None):
        """Create payment plan for a student fee"""
        student_fee = self.get_object()

        # Check if user can create payment plans
        if not (request.user.is_staff or hasattr(request.user, "student_profile")):
            return Response(
                {"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN
            )

        # Validate that this is the student's own fee if not staff
        if (
            hasattr(request.user, "student_profile")
            and student_fee.student != request.user.student_profile
        ):
            return Response(
                {"error": "Can only create payment plans for your own fees"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PaymentPlanCreateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                payment_plan = FeeService.create_payment_plan(
                    student_fee, serializer.validated_data
                )
                return Response(PaymentPlanSerializer(payment_plan).data)
            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """
        Get fee statistics
        UPDATED: Group by education level using FK
        """
        queryset = self.get_queryset()

        # Overall statistics
        overall_stats = queryset.aggregate(
            total_fees=Count("id"),
            total_amount_due=Sum("amount_due"),
            total_amount_paid=Sum("amount_paid"),
            total_balance=Sum("amount_due") - Sum("amount_paid"),
        )

        # By education level
        by_education_level = []
        education_levels = EducationLevel.objects.filter(is_active=True)

        for edu_level in education_levels:
            level_fees = queryset.filter(
                student__student_class__education_level=edu_level
            )

            level_stats = level_fees.aggregate(
                count=Count("id"),
                total_due=Sum("amount_due"),
                total_paid=Sum("amount_paid"),
            )

            by_education_level.append(
                {
                    "education_level_id": edu_level.id,
                    "education_level_name": edu_level.name,
                    "education_level_code": edu_level.code,
                    "fee_count": level_stats["count"] or 0,
                    "total_due": level_stats["total_due"] or 0,
                    "total_paid": level_stats["total_paid"] or 0,
                    "balance": (level_stats["total_due"] or 0)
                    - (level_stats["total_paid"] or 0),
                }
            )

        # By status
        by_status = {
            "paid": queryset.filter(status="PAID").count(),
            "pending": queryset.filter(status="PENDING").count(),
            "partial": queryset.filter(status="PARTIAL").count(),
            "overdue": queryset.filter(status="OVERDUE").count(),
        }

        return Response(
            {
                "overall": overall_stats,
                "by_education_level": by_education_level,
                "by_status": by_status,
            }
        )


# ==============================================================================
# Payment ViewSet - UPDATED
# ==============================================================================
class PaymentViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing payments with multi-gateway support
    UPDATED: Optimized queries
    """

    queryset = Payment.objects.all().order_by("-created_at")
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated, FamiliesReadOnly]
    pagination_class = LargeResultsPagination
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
        """
        Optimize queries with select_related
        UPDATED: Include FK chains for student class and education level
        """
        queryset = super().get_queryset()

        queryset = queryset.select_related(
            "student_fee",
            "student_fee__student",
            "student_fee__student__user",
            "student_fee__student__student_class",
            "student_fee__student__student_class__education_level",
            "student_fee__fee_structure",
            "student_fee__academic_session",
        )

        # A student sees only their own payments, and a parent only their
        # children's. Parents used to fall through and see the whole school's.
        user = self.request.user
        if hasattr(user, "student_profile"):
            queryset = queryset.filter(student_fee__student=user.student_profile)
        elif getattr(user, "role", None) == "parent":
            parent = checkout.parent_of(user, getattr(self.request, "tenant", None))
            queryset = (queryset.filter(student_fee__student__in=parent.get_students())
                        if parent else queryset.none())

        return queryset

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == "create":
            return PaymentCreateSerializer
        return PaymentSerializer

    @action(detail=False, methods=["post"])
    def initiate(self, request):
        """Initiate a payment with specified gateway"""
        serializer = PaymentInitiationSerializer(data=request.data)
        if serializer.is_valid():
            try:
                result = PaymentService.initiate_payment(
                    request.tenant, serializer.validated_data, request.user
                )
                return Response(result)
            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"])
    def verify(self, request):
        """Verify a payment from any gateway"""
        serializer = PaymentVerificationSerializer(data=request.data)
        if serializer.is_valid():
            try:
                result = PaymentService.verify_payment(
                    request.tenant, serializer.validated_data["reference"]
                )
                return Response(result)
            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """Generate payment receipt"""
        payment = self.get_object()

        if not payment.verified:
            return Response(
                {"error": "Payment not verified"}, status=status.HTTP_400_BAD_REQUEST
            )

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

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        """
        Get payments by education level
        Query params: education_level_id (FK ID)
        """
        education_level_id = request.query_params.get("education_level_id")

        if not education_level_id:
            return Response(
                {"error": "education_level_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(
            student_fee__student__student_class__education_level_id=education_level_id
        )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        """Initiate payment refund"""
        payment = self.get_object()

        if not payment.verified or payment.gateway_status != "SUCCESS":
            return Response(
                {"error": "Payment cannot be refunded"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = PaymentService.initiate_refund(payment, request.data.get("reason"))
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get payment statistics"""
        queryset = self.get_queryset()

        overall_stats = queryset.aggregate(
            total_payments=Count("id"),
            total_amount=Sum("amount"),
            verified_payments=Count("id", filter=Q(verified=True)),
            total_verified_amount=Sum("amount", filter=Q(verified=True)),
        )

        # By gateway
        by_gateway = (
            queryset.filter(verified=True)
            .values("payment_gateway")
            .annotate(count=Count("id"), total_amount=Sum("amount"))
            .order_by("-total_amount")
        )

        # By education level
        by_education_level = []
        education_levels = EducationLevel.objects.filter(is_active=True)

        for edu_level in education_levels:
            level_payments = queryset.filter(
                student_fee__student__student_class__education_level=edu_level,
                verified=True,
            )

            level_stats = level_payments.aggregate(
                count=Count("id"), total_amount=Sum("amount")
            )

            by_education_level.append(
                {
                    "education_level_id": edu_level.id,
                    "education_level_name": edu_level.name,
                    "education_level_code": edu_level.code,
                    "payment_count": level_stats["count"] or 0,
                    "total_amount": level_stats["total_amount"] or 0,
                }
            )

        return Response(
            {
                "overall": overall_stats,
                "by_gateway": list(by_gateway),
                "by_education_level": by_education_level,
            }
        )


# ==============================================================================
# PaymentGatewayConfig ViewSet
# ==============================================================================
class PaymentGatewayConfigViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    How a school collects fees online: its own Paystack account.

    Finance access, not is_staff: the keys charge that school's account, and
    reading them is as sensitive as writing them.
    """

    queryset = PaymentGatewayConfig.objects.all().order_by("gateway")
    serializer_class = PaymentGatewayConfigSerializer
    permission_classes = [permissions.IsAuthenticated, HasFinancePermission]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["gateway", "is_active", "is_test_mode"]
    search_fields = ["gateway"]
    ordering_fields = ["gateway", "created_at"]
    ordering = ["gateway"]

    def get_serializer_class(self):
        """Use admin serializer for detail/create/update"""
        if self.action in ["retrieve", "create", "update", "partial_update"]:
            return PaymentGatewayConfigAdminSerializer
        return PaymentGatewayConfigSerializer

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
        """
        Ask the gateway whether it accepts this school's keys. Reads only:
        nothing is charged. It used to answer "connection successful" without
        asking anybody, so a wrong key looked fine until a parent tried to pay.
        """
        gateway_config = self.get_object()
        if gateway_config.gateway != "PAYSTACK":
            return Response(
                {"success": False,
                 "message": f"{gateway_config.get_gateway_display()} is not wired up yet."},
                status=status.HTTP_400_BAD_REQUEST)

        try:
            paystack = PaystackService.from_config(gateway_config)
        except PaystackNotConfigured as error:
            return Response({"success": False, "message": str(error)},
                            status=status.HTTP_400_BAD_REQUEST)

        ok, message = paystack.verify_keys()
        return Response({"success": ok, "message": message},
                        status=status.HTTP_200_OK if ok else status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# PaymentAttempt ViewSet
# ==============================================================================
class PaymentAttemptViewSet(TenantFilterMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing payment attempts"""

    queryset = PaymentAttempt.objects.all().order_by("-created_at")
    serializer_class = PaymentAttemptSerializer
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    pagination_class = LargeResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["gateway", "status", "student_fee"]
    search_fields = ["attempt_reference", "error_message"]
    ordering_fields = ["created_at", "amount"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """Optimize queries"""
        queryset = super().get_queryset()
        return queryset.select_related(
            "student_fee",
            "student_fee__student",
            "student_fee__student__user",
            "student_fee__fee_structure",
        )

    @action(detail=False, methods=["get"])
    def failure_analysis(self, request):
        """Get payment failure analysis"""
        try:
            analysis = PaymentService.get_failure_analysis()
            return Response(analysis)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# PaymentWebhook ViewSet
# ==============================================================================
class PaymentWebhookViewSet(TenantFilterMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for managing payment webhooks"""

    queryset = PaymentWebhook.objects.all().order_by("-created_at")
    serializer_class = PaymentWebhookSerializer
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["gateway", "event_type", "processed"]
    search_fields = ["event_type", "event_id"]
    ordering_fields = ["created_at", "processed_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """Optimize queries"""
        queryset = super().get_queryset()
        return queryset.select_related("payment")

    @action(detail=True, methods=["post"])
    def reprocess(self, request, pk=None):
        """Reprocess a webhook"""
        webhook = self.get_object()

        try:
            result = PaymentService.process_webhook(webhook)
            return Response(result)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def unprocessed(self, request):
        """Get unprocessed webhooks"""
        queryset = self.get_queryset().filter(processed=False)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


# ==============================================================================
# PaymentPlan ViewSet
# ==============================================================================
class PaymentPlanViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """ViewSet for managing payment plans"""

    queryset = PaymentPlan.objects.all().order_by("-created_at")
    serializer_class = PaymentPlanSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination
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
        """Optimize queries"""
        queryset = super().get_queryset()

        queryset = queryset.select_related(
            "student_fee",
            "student_fee__student",
            "student_fee__student__user",
            "student_fee__fee_structure",
        ).prefetch_related(
            Prefetch(
                "installments", queryset=PaymentInstallment.objects.order_by("due_date")
            )
        )

        # If user is a student, only show their own payment plans
        if hasattr(self.request.user, "student_profile"):
            queryset = queryset.filter(
                student_fee__student=self.request.user.student_profile
            )

        return queryset

    def get_serializer_class(self):
        """Use create serializer for create action"""
        if self.action == "create":
            return PaymentPlanCreateSerializer
        return PaymentPlanSerializer

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
                return Response(
                    {"error": "Installment already paid"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create payment for installment
            result = PaymentService.create_installment_payment(
                installment, request.data, request.user
            )
            return Response(result)

        except PaymentInstallment.DoesNotExist:
            return Response(
                {"error": "Installment not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# FeeDiscount ViewSet
# ==============================================================================
class FeeDiscountViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """ViewSet for managing fee discounts"""

    queryset = FeeDiscount.objects.all().order_by("name")
    serializer_class = FeeDiscountSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["discount_type", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "value", "created_at"]
    ordering = ["name"]

    @action(detail=False, methods=["get"])
    def active(self, request):
        """Get active discounts"""
        queryset = self.get_queryset().filter(is_active=True)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


# ==============================================================================
# StudentDiscount ViewSet
# ==============================================================================
class StudentDiscountViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """ViewSet for managing student discounts"""

    queryset = StudentDiscount.objects.all().order_by("-applied_date")
    serializer_class = StudentDiscountSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
    pagination_class = LargeResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["student", "discount", "is_active"]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "discount__name",
    ]
    ordering_fields = ["applied_date"]
    ordering = ["-applied_date"]

    def get_queryset(self):
        """Optimize queries"""
        queryset = super().get_queryset()
        return queryset.select_related(
            "student", "student__user", "discount", "applied_by"
        )

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


# ==============================================================================
# PaymentReminder ViewSet
# ==============================================================================
class PaymentReminderViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    Fee reminders to parents (fee.reminders).

    Finance access only, for reading as well: every row names a child and
    what their family owes, which IsAdminOrReadOnly showed to any signed-in
    user of the school, parents and students included.
    """

    queryset = PaymentReminder.objects.all().order_by("-created_at")
    serializer_class = PaymentReminderSerializer
    permission_classes = [permissions.IsAuthenticated, HasFinancePermission]
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_sent", "reminder_type", "channel"]
    search_fields = [
        "student_fee__student__user__first_name",
        "student_fee__student__user__last_name",
    ]
    ordering_fields = ["created_at", "sent_date"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """Optimize queries"""
        queryset = super().get_queryset()
        return queryset.select_related(
            "student_fee",
            "student_fee__student",
            "student_fee__student__user",
            "student_fee__fee_structure",
        )

    @action(detail=False, methods=["get"])
    def preview(self, request):
        """Who a reminder would reach now, by which channel, and what the texts cost."""
        if request.tenant is None:
            return Response({"error": "Name the school."}, status=status.HTTP_400_BAD_REQUEST)
        student_ids = request.query_params.getlist("student_ids") or None
        return Response(reminders.preview(request.tenant, student_ids))

    @action(detail=False, methods=["post"])
    def send_bulk(self, request):
        """
        Remind the parents of every student who owes, or of `student_ids`,
        through `channels`: "email" (free), "sms" (per text) or both.
        """
        if request.tenant is None:
            return Response({"error": "Name the school."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = reminders.send_reminders(
                request.tenant,
                request.data.get("channels") or ["email"],
                request.data.get("student_ids") or None,
            )
        except reminders.ReminderError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(summary)

    @action(detail=True, methods=["post"])
    def mark_sent(self, request, pk=None):
        """Mark reminder as sent"""
        reminder = self.get_object()
        reminder.is_sent = True
        reminder.error = ""
        reminder.save()

        return Response({"message": "Reminder marked as sent"})


# ==============================================================================
# Report ViewSet - UPDATED
# ==============================================================================
class ReportViewSet(viewsets.ViewSet):
    """
    ViewSet for generating reports
    UPDATED: Uses FK-based filtering
    """

    permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """
        Generate fee reports
        UPDATED: Uses education_level_id and student_class_id
        """
        serializer = FeeReportSerializer(data=request.data)
        if serializer.is_valid():
            try:
                report_data = ReportService.generate_report(serializer.validated_data)
                return Response(report_data)
            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"])
    def export_csv(self, request):
        """Export report as CSV"""
        serializer = FeeReportSerializer(data=request.data)
        if serializer.is_valid():
            try:
                csv_content = ReportService.export_csv(serializer.validated_data)

                response = HttpResponse(csv_content, content_type="text/csv")
                response["Content-Disposition"] = (
                    'attachment; filename="fee_report.csv"'
                )
                return response

            except Exception as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        Get fee summary statistics
        UPDATED: Groups by education level using FK
        """
        active_session = AcademicSession.objects.filter(is_active=True).first()

        if not active_session:
            return Response(
                {"error": "No active academic session"},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            "total_students": Student.objects.filter(is_active=True).count(),
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

        # NEW: Education level statistics
        by_education_level = []
        education_levels = EducationLevel.objects.filter(is_active=True)

        for edu_level in education_levels:
            level_fees = StudentFee.objects.filter(
                academic_session=active_session,
                student__student_class__education_level=edu_level,
            )

            level_stats = level_fees.aggregate(
                count=Count("id"),
                total_due=Sum("amount_due"),
                total_paid=Sum("amount_paid"),
            )

            by_education_level.append(
                {
                    "education_level_id": edu_level.id,
                    "education_level_name": edu_level.name,
                    "education_level_code": edu_level.code,
                    "fee_count": level_stats["count"] or 0,
                    "total_due": level_stats["total_due"] or 0,
                    "total_paid": level_stats["total_paid"] or 0,
                    "balance": (level_stats["total_due"] or 0)
                    - (level_stats["total_paid"] or 0),
                }
            )

        return Response(
            {
                "session": AcademicSessionSerializer(active_session).data,
                "financial_summary": total_fees,
                "fee_counts": fee_counts,
                "gateway_statistics": list(gateway_stats),
                "by_education_level": by_education_level,
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
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def gateway_performance(self, request):
        """Get gateway performance metrics"""
        try:
            performance = ReportService.get_gateway_performance()
            return Response(performance)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# A parent's fees: one bill per child per term, paid into the school's account
# ==============================================================================
class FamilyFeesViewSet(viewsets.ViewSet):
    """
    What a parent owes for each of their children, and paying it (fee.checkout).
    Only the signed-in parent's own children at this school are ever in reach.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _parent(self, request):
        parent = checkout.parent_of(request.user, getattr(request, "tenant", None))
        if parent is None:
            raise PermissionDenied("Only a parent at this school can see family fees.")
        return parent

    def list(self, request):
        return Response(checkout.family_bills(self._parent(request)))

    @action(detail=False, methods=["post"])
    def pay(self, request):
        parent = self._parent(request)
        try:
            started = checkout.start(
                parent,
                student_id=request.data.get("student_id"),
                academic_session_id=request.data.get("academic_session_id"),
                term=request.data.get("term"),
                callback_url=request.data.get("callback_url"),
            )
        except checkout.CheckoutError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(started)

    @action(detail=False, methods=["post"])
    def verify(self, request):
        parent = self._parent(request)
        reference = (request.data.get("reference") or "").strip()
        if not reference:
            return Response({"error": "Which payment?"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(checkout.verify(parent, reference))
        except checkout.CheckoutError as error:
            return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def receipt(self, request):
        parent = self._parent(request)
        found = checkout.receipt(
            parent.tenant, request.query_params.get("reference", ""),
            children=parent.get_students())
        if found is None:
            return Response({"error": "No receipt of yours carries that reference."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(found)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def paystack_webhook(request, tenant_id):
    """
    Paystack telling a school that a charge went through, so a parent who
    closes the tab before coming back is still credited.

    Each school points its own Paystack account here, and the school is in the
    address because Paystack calls the API host, not the school's domain. The
    body must be signed with that school's secret key, or nothing is recorded.
    """
    tenant = Tenant.objects.filter(id=tenant_id, is_active=True).first()
    config = tenant and PaymentGatewayConfig.objects.filter(
        tenant=tenant, gateway="PAYSTACK", is_active=True).first()
    try:
        paystack = PaystackService.from_config(config) if config else None
    except PaystackNotConfigured:
        paystack = None
    signature = request.headers.get("X-Paystack-Signature", "")
    body = request.body.decode("utf-8")
    if paystack is None or not signature or not paystack.webhook_signature_valid(body, signature):
        return Response(status=status.HTTP_401_UNAUTHORIZED)

    event = request.data.get("event", "")
    data = request.data.get("data") or {}
    webhook = PaymentWebhook.objects.create(
        tenant=tenant, gateway="PAYSTACK", event_type=event[:100],
        event_id=str(data.get("id") or "")[:100] or None, payload=request.data)

    if event == "charge.success" and data.get("reference"):
        try:
            if checkout.settle(tenant, data["reference"], data):
                webhook.payment = Payment.objects.filter(
                    tenant=tenant, gateway_reference=data["reference"]).first()
        except checkout.CheckoutError as error:
            webhook.processing_error = str(error)
    webhook.processed = True
    webhook.processed_at = timezone.now()
    webhook.save()
    # Paystack retries anything but a 200, so a charge that isn't a fee
    # checkout is still acknowledged once its signature checks out.
    return Response({"received": True})
