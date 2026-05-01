# tenants/serializers.py
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
import secrets
import string

from .models import (
    Tenant, TenantService, ServicePricing, TenantSettings,
    TenantInvoice, TenantInvoiceLineItem, TenantPayment, TenantInvitation,
    TenantSetupToken
)

User = get_user_model()


class TenantSerializer(serializers.ModelSerializer):
    """Serializer for Tenant model."""
    subdomain_url = serializers.ReadOnlyField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'custom_domain', 'custom_domain_verified',
            'status', 'is_active', 'owner_email', 'owner_name', 'owner_phone',
            'subdomain_url', 'created_at', 'activated_at'
        ]
        read_only_fields = ['id', 'slug', 'status', 'is_active', 'created_at', 'activated_at']


class TenantSettingsSerializer(serializers.ModelSerializer):
    """Serializer for TenantSettings model."""
    school_name = serializers.CharField(source="tenant.name", read_only=True)

    class Meta:
        model = TenantSettings
        fields = [
            "tenant",
            "school_name",
            "school_code",
            "school_motto",
            "address",
            "city",
            "state",
            "country",
            "postal_code",
            "phone",
            "email",
            "website",
            "logo",
            "favicon",
            # Design & Branding
            "primary_color",
            "secondary_color",
            "theme",
            "typography",
            "border_radius",
            "shadow_style",
            "animations_enabled",
            "compact_mode",
            "dark_mode",
            "high_contrast",
            # Current Session/Term
            "current_session",
            "current_term",
            "billing_period",
            "timezone",
            "date_format",
            "language",
            "currency",
            "allow_student_registration",
            "allow_parent_registration",
            "require_email_verification",
            "session_timeout_minutes",
            "max_login_attempts",
            "student_portal_enabled",
            "teacher_portal_enabled",
            "parent_portal_enabled",
            "show_position_on_result",
            "show_class_average_on_result",
            "require_token_for_result",
            # Academic Year
            "academic_year_start",
            "academic_year_end",
            "terms_per_year",
            "weeks_per_term",
            # Class Settings
            "allow_class_overflow",
            "enable_streaming",
            "enable_subject_electives",
            # Grading
            "grading_system",
            "pass_percentage",
            "enable_grade_curving",
            "enable_grade_weighting",
            # Attendance
            "require_attendance",
            "minimum_attendance_percentage",
            "enable_attendance_tracking",
            "allow_late_arrival",
            # Curriculum
            "enable_cross_cutting_subjects",
            "enable_subject_prerequisites",
            "allow_subject_changes",
            "enable_credit_system",
            # Teaching model per education level
            "nursery_use_subject_teachers",
            "primary_use_subject_teachers",
            "junior_secondary_use_subject_teachers",
            "senior_secondary_use_subject_teachers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ['tenant', 'created_at', 'updated_at']


class DesignSettingsSerializer(serializers.ModelSerializer):
    """Simplified serializer for design/branding settings only."""

    class Meta:
        model = TenantSettings
        fields = [
            "primary_color",
            "secondary_color",
            "theme",
            "typography",
            "border_radius",
            "shadow_style",
            "animations_enabled",
            "compact_mode",
            "dark_mode",
            "high_contrast",
        ]


class TenantServiceSerializer(serializers.ModelSerializer):
    """Serializer for TenantService model."""
    service_display = serializers.CharField(source='get_service_display', read_only=True)
    is_default = serializers.ReadOnlyField()
    is_removable = serializers.ReadOnlyField()

    class Meta:
        model = TenantService
        fields = [
            'id', 'tenant', 'service', 'service_display',
            'is_enabled', 'is_default', 'is_removable',
            'enabled_at', 'disabled_at', 'config'
        ]
        read_only_fields = ['id', 'tenant', 'enabled_at', 'disabled_at']


class ServicePricingSerializer(serializers.ModelSerializer):
    """Serializer for ServicePricing model."""
    service_display = serializers.CharField(source='get_service_display', read_only=True)

    class Meta:
        model = ServicePricing
        fields = [
            'id', 'service', 'service_display', 'price_per_student',
            'is_base_service', 'description', 'is_active'
        ]


class AvailableServiceSerializer(serializers.Serializer):
    """Serializer for available services list."""
    service = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    price_per_student = serializers.DecimalField(max_digits=10, decimal_places=2)
    is_default = serializers.BooleanField()
    is_enabled = serializers.BooleanField()
    category = serializers.CharField()


class TenantInvoiceLineItemSerializer(serializers.ModelSerializer):
    """Serializer for TenantInvoiceLineItem model."""

    class Meta:
        model = TenantInvoiceLineItem
        fields = [
            'id', 'item_type', 'service', 'description',
            'quantity', 'unit_price', 'amount', 'created_at'
        ]
        read_only_fields = ['id', 'amount', 'created_at']


class TenantPaymentSerializer(serializers.ModelSerializer):
    """Serializer for TenantPayment model."""
    confirmed_by_name = serializers.CharField(source='confirmed_by.full_name', read_only=True)

    class Meta:
        model = TenantPayment
        fields = [
            'id', 'invoice', 'amount', 'payment_method', 'status',
            'reference', 'paystack_reference', 'paystack_transaction_id',
            'bank_name', 'account_name', 'payment_proof',
            'confirmed_by', 'confirmed_by_name', 'confirmed_at', 'confirmation_notes',
            'created_at'
        ]
        read_only_fields = ['id', 'reference', 'confirmed_by', 'confirmed_at', 'created_at']


class TenantInvoiceSerializer(serializers.ModelSerializer):
    """Serializer for TenantInvoice model."""
    school_name = serializers.CharField(source="tenant.name", read_only=True)
    line_items = TenantInvoiceLineItemSerializer(many=True, read_only=True)
    payments = TenantPaymentSerializer(many=True, read_only=True)
    academic_session_name = serializers.CharField(source='academic_session.name', read_only=True)
    term_name = serializers.SerializerMethodField()

    class Meta:
        model = TenantInvoice
        fields = [
            "id",
            "invoice_number",
            "tenant",
            "school_name",
            "billing_period",
            "academic_session",
            "academic_session_name",
            "term",
            "term_name",
            "base_price_per_student",
            "student_count",
            "base_amount",
            "services_amount",
            "subtotal",
            "discount_amount",
            "discount_reason",
            "total_amount",
            "amount_paid",
            "balance_due",
            "status",
            "issue_date",
            "due_date",
            "paid_at",
            "notes",
            "line_items",
            "payments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            'id', 'invoice_number', 'base_amount', 'services_amount',
            'subtotal', 'total_amount', 'balance_due', 'paid_at',
            'created_at', 'updated_at'
        ]

    def get_term_name(self, obj):
        return obj.term.get_name_display() if obj.term else None


class TenantInvitationSerializer(serializers.ModelSerializer):
    """Serializer for TenantInvitation model."""
    school_name = serializers.CharField(source="tenant.name", read_only=True)
    invited_by_name = serializers.SerializerMethodField()
    is_valid = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()

    class Meta:
        model = TenantInvitation
        fields = [
            "id",
            "tenant",
            "school_name",
            "email",
            "role",
            "section",
            "token",
            "status",
            "is_valid",
            "is_expired",
            "invited_by",
            "invited_by_name",
            "created_at",
            "expires_at",
            "accepted_at",
        ]
        read_only_fields = ['id', 'token', 'status', 'invited_by', 'created_at', 'accepted_at']

    def get_invited_by_name(self, obj):
        return obj.invited_by.full_name if obj.invited_by else None


# ============ Registration Serializers ============

class SchoolRegistrationSerializer(serializers.Serializer):
    """Serializer for school registration."""
    # School Info
    school_name = serializers.CharField(max_length=255)

    # Admin Info
    admin_email = serializers.EmailField()
    admin_first_name = serializers.CharField(max_length=150)
    admin_last_name = serializers.CharField(max_length=150)
    admin_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)

    # Optional
    billing_period = serializers.ChoiceField(
        choices=TenantInvoice.BILLING_PERIOD_CHOICES,
        default='term',
        required=False
    )

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match'})

        # Check if email already exists
        if User.objects.filter(email=data['admin_email']).exists():
            raise serializers.ValidationError({'admin_email': 'Email already registered'})

        return data

    @transaction.atomic
    def create(self, validated_data):
        """Create tenant and super admin user."""
        from utils import generate_unique_username

        # Create tenant - set as active immediately for onboarding to work
        # Can be changed to 'pending' if manual approval is needed
        tenant = Tenant.objects.create(
            name=validated_data['school_name'],
            owner_email=validated_data['admin_email'],
            owner_name=f"{validated_data['admin_first_name']} {validated_data['admin_last_name']}",
            owner_phone=validated_data.get('admin_phone', ''),
            status='active',
            is_active=True,
        )

        # Enable default services
        for service in TenantService.DEFAULT_SERVICES:
            TenantService.objects.create(tenant=tenant, service=service, is_enabled=True)

        # Create tenant settings
        TenantSettings.objects.create(
            tenant=tenant,
            billing_period=validated_data.get('billing_period', 'term'),
        )

        # Generate username
        username = generate_unique_username('superadmin')

        # Create super admin user
        admin_user = User.objects.create_user(
            username=username,
            email=validated_data['admin_email'],
            password=validated_data['password'],
            first_name=validated_data['admin_first_name'],
            last_name=validated_data['admin_last_name'],
            phone=validated_data.get('admin_phone', ''),
            role='superadmin',
            is_staff=True,
            is_superuser=False,
            is_active=True,
            email_verified=True,
            tenant=tenant,
        )

        # Create one-time setup token for subdomain redirect
        setup_token = TenantSetupToken.create_for_user(user=admin_user, tenant=tenant)

        return {
            'tenant': tenant,
            'admin_user': admin_user,
            'username': username,
            'setup_token': setup_token.token,
        }


class ServiceToggleSerializer(serializers.Serializer):
    """Serializer for toggling a service."""
    service = serializers.ChoiceField(choices=TenantService.SERVICE_CHOICES)
    enable = serializers.BooleanField()


class CustomDomainSerializer(serializers.Serializer):
    """Serializer for setting custom domain."""
    domain = serializers.CharField(max_length=255)

    def validate_domain(self, value):
        import re
        # Basic domain validation
        pattern = r'^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
        if not re.match(pattern, value):
            raise serializers.ValidationError('Invalid domain format')

        # Check if domain is already in use
        if Tenant.objects.filter(custom_domain=value).exists():
            raise serializers.ValidationError('Domain is already in use')

        return value.lower()


class ManualPaymentSerializer(serializers.Serializer):
    """Serializer for recording manual payment."""
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    bank_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    account_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    payment_proof = serializers.URLField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class PaystackInitializeSerializer(serializers.Serializer):
    """Serializer for initializing Paystack payment."""
    invoice_id = serializers.UUIDField()
    callback_url = serializers.URLField(required=False)


class PaystackVerifySerializer(serializers.Serializer):
    """Serializer for verifying Paystack payment."""
    reference = serializers.CharField(max_length=100)


class SlugCheckSerializer(serializers.Serializer):
    """Serializer for checking slug availability."""
    slug = serializers.SlugField(max_length=100)


class DomainCheckSerializer(serializers.Serializer):
    """Serializer for checking domain availability."""
    domain = serializers.CharField(max_length=255)
