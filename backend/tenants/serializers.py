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
    TenantSetupToken, PlatformContent
)

User = get_user_model()

PLATFORM_ROLES = ('superadmin', 'platform_admin', 'marketer')


class TenantSerializer(serializers.ModelSerializer):
    """Serializer for Tenant model."""
    subdomain_url = serializers.ReadOnlyField()
    referred_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'custom_domain', 'custom_domain_verified',
            'status', 'is_active', 'owner_email', 'owner_name', 'owner_phone',
            'subdomain_url', 'created_at', 'activated_at',
            'referred_by', 'referred_by_name',
        ]
        read_only_fields = ['id', 'slug', 'status',
                            'is_active', 'created_at', 'activated_at']

    def get_referred_by_name(self, obj):
        if not obj.referred_by_id:
            return None
        u = obj.referred_by
        name = f"{u.first_name} {u.last_name}".strip()
        return name or u.username

    def validate_referred_by(self, value):
        if value is not None and getattr(value, 'role', None) not in PLATFORM_ROLES:
            raise serializers.ValidationError(
                "referred_by must be a platform user (superadmin, platform_admin, or marketer)."
            )
        return value


class PlatformContentSerializer(serializers.ModelSerializer):
    """The main marketing site's editable About/Contact copy (singleton)."""
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PlatformContent
        fields = [
            'about_hero_title', 'about_hero_subtitle',
            'about_mission_title', 'about_mission_body',
            'about_vision_title', 'about_vision_body',
            'about_story_title', 'about_story_body',
            'about_values', 'about_stats',
            'contact_intro', 'contact_email', 'contact_phone',
            'contact_address', 'contact_office_hours',
            'updated_at', 'updated_by_name',
        ]
        read_only_fields = ['updated_at']

    def get_updated_by_name(self, obj):
        if not obj.updated_by_id:
            return None
        u = obj.updated_by
        name = f"{u.first_name} {u.last_name}".strip()
        return name or u.username

    def validate_about_values(self, value):
        return self._validate_list_of_pairs(value, 'title', 'description')

    def validate_about_stats(self, value):
        return self._validate_list_of_pairs(value, 'value', 'label')

    @staticmethod
    def _validate_list_of_pairs(value, key_a, key_b):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list.")
        for item in value:
            if not isinstance(item, dict) or key_a not in item or key_b not in item:
                raise serializers.ValidationError(
                    f"Each item must be an object with '{key_a}' and '{key_b}'."
                )
        return value


class PlatformUserSerializer(serializers.ModelSerializer):
    """
    Platform-level staff accounts (tenant=None): the root superadmin, other
    platform admins, and marketers. Created and managed by a platform admin
    from the platform admin dashboard.
    """
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    full_name = serializers.SerializerMethodField()
    referred_tenant_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'is_active', 'date_joined', 'password', 'referred_tenant_count',
            'referral_code',
        ]
        # referral_code is auto-assigned by CustomUser.save() the first time a
        # marketer is saved without one - never settable through this API.
        read_only_fields = ['id', 'date_joined', 'referral_code']

    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.username

    def get_referred_tenant_count(self, obj):
        return obj.referred_tenants.count()

    def validate_role(self, value):
        # Creating another root superadmin is deliberately not exposed here -
        # that account is provisioned once via the create_platform_admin
        # management command, not spawned casually through a web form.
        if value not in ('platform_admin', 'marketer'):
            raise serializers.ValidationError(
                "role must be 'platform_admin' or 'marketer'."
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        validated_data['tenant'] = None
        validated_data['is_staff'] = validated_data.get('role') == 'platform_admin'
        validated_data['is_superuser'] = False
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if 'role' in validated_data:
            instance.is_staff = validated_data['role'] == 'platform_admin'
        if password:
            instance.set_password(password)
        instance.save()
        return instance


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
            "show_subject_min_max",
            "show_physical_development",
            "physical_development_applies_to",
            "show_affective_domain",
            "show_psychomotor",
            "psychomotor_applies_to",
            "affective_domain_applies_to",
            "affective_domain_rating_mode",
            "psychomotor_rating_mode",
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


class NurseryReportStyleSerializer(serializers.ModelSerializer):
    """Simplified serializer for nursery report style setting only."""
    nursery_report_style_display = serializers.CharField(
        source="get_nursery_report_style_display", read_only=True
    )

    class Meta:
        model = TenantSettings
        fields = [
            "nursery_report_style",
            "nursery_report_style_display",
        ]


class TenantServiceSerializer(serializers.ModelSerializer):
    """Serializer for TenantService model."""
    service_display = serializers.CharField(
        source='get_service_display', read_only=True)
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
    service_display = serializers.CharField(
        source='get_service_display', read_only=True)

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
    price_per_student = serializers.DecimalField(
        max_digits=10, decimal_places=2)
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
    confirmed_by_name = serializers.CharField(
        source='confirmed_by.full_name', read_only=True)

    class Meta:
        model = TenantPayment
        fields = [
            'id', 'invoice', 'amount', 'payment_method', 'status',
            'reference', 'paystack_reference', 'paystack_transaction_id',
            'bank_name', 'account_name', 'payment_proof',
            'confirmed_by', 'confirmed_by_name', 'confirmed_at', 'confirmation_notes',
            'created_at'
        ]
        read_only_fields = ['id', 'reference',
                            'confirmed_by', 'confirmed_at', 'created_at']


class TenantInvoiceSerializer(serializers.ModelSerializer):
    """Serializer for TenantInvoice model."""
    school_name = serializers.CharField(source="tenant.name", read_only=True)
    line_items = TenantInvoiceLineItemSerializer(many=True, read_only=True)
    payments = TenantPaymentSerializer(many=True, read_only=True)
    academic_session_name = serializers.CharField(
        source='academic_session.name', read_only=True)
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
        read_only_fields = ['id', 'token', 'status',
                            'invited_by', 'created_at', 'accepted_at']

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
    admin_phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)

    # Optional
    billing_period = serializers.ChoiceField(
        choices=TenantInvoice.BILLING_PERIOD_CHOICES,
        default='term',
        required=False
    )
    # Affiliate attribution - the ?ref=<code> query param a marketer shares.
    # Write-only: looked up in create() below, never echoed back.
    referral_code = serializers.CharField(
        max_length=12, required=False, allow_blank=True, write_only=True
    )

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError(
                {'confirm_password': 'Passwords do not match'})

        # Check if email already exists
        if User.objects.filter(email=data['admin_email']).exists():
            raise serializers.ValidationError(
                {'admin_email': 'Email already registered'})

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

        # Attribute this signup to a marketer if a valid referral code was
        # supplied. Invalid/unknown codes are ignored rather than blocking
        # registration - a bad ?ref= link should never stop a school signing up.
        ref_code = (validated_data.get('referral_code') or '').strip()
        if ref_code:
            marketer = User.objects.filter(
                role='marketer', tenant__isnull=True, referral_code__iexact=ref_code
            ).first()
            if marketer:
                tenant.referred_by = marketer
                tenant.save(update_fields=['referred_by'])

        # Enable default services
        for service in TenantService.DEFAULT_SERVICES:
            TenantService.objects.create(
                tenant=tenant, service=service, is_enabled=True)

        # Create tenant settings
        TenantSettings.objects.create(
            tenant=tenant,
            billing_period=validated_data.get('billing_period', 'term'),
        )

        # Generate username
        username = generate_unique_username('superadmin', tenant=tenant)

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
        setup_token = TenantSetupToken.create_for_user(
            user=admin_user, tenant=tenant)

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
    bank_name = serializers.CharField(
        max_length=100, required=False, allow_blank=True)
    account_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True)
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
