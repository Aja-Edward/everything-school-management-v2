# fees/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from academics.views import AcademicSessionViewSet, TermViewSet

# Import all Fee Management ViewSets
from .views import (
    FeeStructureViewSet,
    StudentFeeViewSet,
    PaymentViewSet,
    PaymentGatewayConfigViewSet,
    PaymentAttemptViewSet,
    PaymentWebhookViewSet,
    PaymentPlanViewSet,
    FeeDiscountViewSet,
    StudentDiscountViewSet,
    PaymentReminderViewSet,
    ReportViewSet,
)

app_name = "fees"

# Create router and register all ViewSets
router = DefaultRouter()

# Fee Structure Management
router.register(r"fee-structures", FeeStructureViewSet, basename="fee-structure")

# Student Fee Management
router.register(r"student-fees", StudentFeeViewSet, basename="student-fee")

# Payment Management
router.register(r"payments", PaymentViewSet, basename="payment")

# Payment Gateway Configuration
router.register(r"payment-gateways", PaymentGatewayConfigViewSet, basename="payment-gateway")

# Payment Tracking (Read-only)
router.register(r"payment-attempts", PaymentAttemptViewSet, basename="payment-attempt")
router.register(r"payment-webhooks", PaymentWebhookViewSet, basename="payment-webhook")

# Payment Plans & Discounts
router.register(r"payment-plans", PaymentPlanViewSet, basename="payment-plan")
router.register(r"fee-discounts", FeeDiscountViewSet, basename="fee-discount")
router.register(r"student-discounts", StudentDiscountViewSet, basename="student-discount")

# Payment Reminders
router.register(r"payment-reminders", PaymentReminderViewSet, basename="payment-reminder")

# Financial Reports
router.register(r"reports", ReportViewSet, basename="fee-report")

# Academic Session and Term (for backward compatibility)
router.register(r"academic-sessions", AcademicSessionViewSet, basename="academic-session")
router.register(r"terms", TermViewSet, basename="term")

# Legacy route for backward compatibility
router.register(r"studentfee", StudentFeeViewSet, basename="studentfee")

urlpatterns = router.urls
