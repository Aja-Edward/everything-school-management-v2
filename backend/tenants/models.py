# tenants/models.py
import uuid
import secrets
import string
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from django.core.validators import RegexValidator, MinValueValidator


class TenantMixin(models.Model):
    """
    Abstract mixin that adds tenant field to models.
    Use this for all models that need tenant isolation.
    """
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='%(app_label)s_%(class)s_set',
        null=True,
        blank=True,
        help_text="Tenant this record belongs to",
        db_index=True,
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        # Auto-populate tenant from user if available
        if not self.tenant and hasattr(self, '_request') and self._request:
            self.tenant = getattr(self._request, 'tenant', None)
        super().save(*args, **kwargs)


class Tenant(models.Model):
    """
    Represents a school/organization on the platform.
    Core model for multi-tenancy.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending Activation'),
        ('active', 'Active'),
        ('suspended', 'Suspended'),
        ('inactive', 'Inactive'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Basic Information
    name = models.CharField(max_length=255, help_text="School/Organization name")
    slug = models.SlugField(
        max_length=100,
        unique=True,
        validators=[
            RegexValidator(
                regex=r'^[a-z0-9-]+$',
                message='Slug must contain only lowercase letters, numbers, and hyphens'
            )
        ],
        help_text="Unique identifier for subdomain"
    )

    # Custom Domain Support
    custom_domain = models.CharField(max_length=255, null=True, blank=True, unique=True)
    custom_domain_verified = models.BooleanField(default=False)
    domain_verification_token = models.CharField(max_length=64, null=True, blank=True)

    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    is_active = models.BooleanField(default=False)

    # Contact Information
    owner_email = models.EmailField(help_text="Primary contact email")
    owner_name = models.CharField(max_length=255, blank=True)
    owner_phone = models.CharField(max_length=20, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'tenants'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['custom_domain']),
            models.Index(fields=['status', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.slug})"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self.generate_unique_slug(self.name)
        if self.custom_domain and not self.domain_verification_token:
            self.domain_verification_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    @staticmethod
    def generate_unique_slug(name, max_attempts=100):
        base_slug = slugify(name)[:50]
        slug = base_slug
        for i in range(max_attempts):
            if not Tenant.objects.filter(slug=slug).exists():
                return slug
            suffix = ''.join(secrets.choice(string.digits) for _ in range(4))
            slug = f"{base_slug}-{suffix}"
        return f"{base_slug}-{uuid.uuid4().hex[:8]}"

    @property
    def subdomain_url(self):
        return f"https://{self.slug}.schoolplatform.com"

    def activate(self):
        self.is_active = True
        self.status = 'active'
        self.activated_at = timezone.now()
        self.save()

    def suspend(self):
        self.is_active = False
        self.status = 'suspended'
        self.save()


class TenantService(models.Model):
    """
    Services/features enabled for a tenant.
    Each service has a per-student cost that adds to the invoice.
    """

    SERVICE_CHOICES = [
        # Core Academic (Default - included in base price)
        ('exams', 'Examinations'),
        ('results', 'Results Management'),

        # Attendance & Tracking
        ('attendance', 'Attendance System'),
        ('arrival_notification', 'Arrival Notification System'),

        # Exam & Assessment Tools
        ('exam_proofreading', 'Exam Proofreading Assistant'),
        ('ai_question_generator', 'AI Question Generator'),
        ('question_bank', 'Question Bank'),
        ('exam_builder', 'Exam Builder'),

        # Communication
        ('sms_notifications', 'SMS Notifications'),

        # Finance
        ('fees', 'Fees & Payments'),

        # Scheduling
        ('timetable', 'Timetable Management'),
    ]

    # Default services (included in base price, cannot be removed)
    DEFAULT_SERVICES = ['exams', 'results']

    # Service categories for grouping in UI
    SERVICE_CATEGORIES = {
        'core': ['exams', 'results'],
        'attendance': ['attendance', 'arrival_notification'],
        'assessment': ['exam_proofreading', 'ai_question_generator', 'question_bank', 'exam_builder'],
        'communication': ['sms_notifications'],
        'finance': ['fees'],
        'scheduling': ['timetable'],
    }

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='services')
    service = models.CharField(max_length=50, choices=SERVICE_CHOICES)
    is_enabled = models.BooleanField(default=True)
    enabled_at = models.DateTimeField(auto_now_add=True)
    disabled_at = models.DateTimeField(null=True, blank=True)
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'tenant_services'
        unique_together = ['tenant', 'service']
        ordering = ['service']

    def __str__(self):
        status = "enabled" if self.is_enabled else "disabled"
        return f"{self.tenant.name} - {self.get_service_display()} ({status})"

    @property
    def is_default(self):
        return self.service in self.DEFAULT_SERVICES

    @property
    def is_removable(self):
        return not self.is_default

    def disable(self):
        if not self.is_removable:
            raise ValueError(f"Service '{self.service}' cannot be disabled")
        self.is_enabled = False
        self.disabled_at = timezone.now()
        self.save()

    def enable(self):
        self.is_enabled = True
        self.disabled_at = None
        self.save()


class ServicePricing(models.Model):
    """
    Pricing configuration for each service.
    Base services (exams + results) = ₦700/student
    Additional services have their own per-student cost.
    """

    service = models.CharField(max_length=50, choices=TenantService.SERVICE_CHOICES, unique=True)
    price_per_student = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Price per student in Naira"
    )
    is_base_service = models.BooleanField(default=False)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'service_pricing'
        verbose_name = 'Service Pricing'
        verbose_name_plural = 'Service Pricing'

    def __str__(self):
        return f"{self.get_service_display()} - ₦{self.price_per_student}/student"


class TenantInvoice(models.Model):
    """
    Invoice for a tenant for a billing period (term or session).
    Auto-updates based on student count and enabled services.
    """

    BILLING_PERIOD_CHOICES = [
        ('term', 'Per Term'),
        ('session', 'Per Session'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending Payment'),
        ('partially_paid', 'Partially Paid'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=50, unique=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='invoices')

    # Billing period
    billing_period = models.CharField(max_length=20, choices=BILLING_PERIOD_CHOICES, default='term')
    academic_session = models.ForeignKey(
        'academics.AcademicSession',
        on_delete=models.PROTECT,
        related_name='tenant_invoices'
    )
    term = models.ForeignKey(
        'academics.Term',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='tenant_invoices'
    )

    # Pricing
    base_price_per_student = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('700.00')
    )
    student_count = models.PositiveIntegerField(default=0)

    # Amounts
    base_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    services_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_reason = models.CharField(max_length=255, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # Status & Payment
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    paid_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        'users.CustomUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='confirmed_invoices'
    )

    # Dates
    issue_date = models.DateField(auto_now_add=True)
    due_date = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True)
    admin_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenant_invoices'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['invoice_number']),
        ]

    def __str__(self):
        return f"Invoice {self.invoice_number} - {self.tenant.name}"

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = self.generate_invoice_number()
        self.recalculate()
        super().save(*args, **kwargs)

    def generate_invoice_number(self):
        prefix = "INV"
        date_part = timezone.now().strftime("%Y%m")
        count = TenantInvoice.objects.filter(
            invoice_number__startswith=f"{prefix}-{date_part}"
        ).count() + 1
        return f"{prefix}-{date_part}-{count:04d}"

    def recalculate(self):
        self.base_amount = self.base_price_per_student * self.student_count
        self.services_amount = sum(
            item.amount for item in self.line_items.filter(item_type='service')
        ) if self.pk else Decimal('0.00')
        self.subtotal = self.base_amount + self.services_amount
        self.total_amount = self.subtotal - self.discount_amount
        self.balance_due = self.total_amount - self.amount_paid

        if self.amount_paid >= self.total_amount and self.total_amount > 0:
            self.status = 'paid'
        elif self.amount_paid > 0:
            self.status = 'partially_paid'

    def update_student_count(self, count):
        self.student_count = count
        self.save()

    def record_payment(self, amount):
        """Update invoice with payment amount (called after TenantPayment is created)."""
        self.amount_paid += amount
        if self.amount_paid >= self.total_amount:
            self.status = 'paid'
            self.paid_at = timezone.now()
            if self.tenant.status == 'pending':
                self.tenant.activate()
        else:
            self.status = 'partially_paid'
        self.save()

    def recalculate_totals(self):
        """Public method to recalculate invoice totals."""
        self.recalculate()
        self.save()


class TenantInvoiceLineItem(models.Model):
    """Line items on an invoice."""

    ITEM_TYPE_CHOICES = [
        ('base', 'Base Package'),
        ('service', 'Additional Service'),
        ('adjustment', 'Adjustment'),
    ]

    invoice = models.ForeignKey(TenantInvoice, on_delete=models.CASCADE, related_name='line_items')
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES)
    service = models.CharField(max_length=50, choices=TenantService.SERVICE_CHOICES, null=True, blank=True)
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tenant_invoice_line_items'
        ordering = ['item_type', 'service']

    def __str__(self):
        return f"{self.description} - ₦{self.amount}"

    def save(self, *args, **kwargs):
        self.amount = self.unit_price * self.quantity
        super().save(*args, **kwargs)


class TenantPayment(models.Model):
    """Payment records for tenant invoices."""

    PAYMENT_METHOD_CHOICES = [
        ('manual', 'Manual/Bank Transfer'),
        ('paystack', 'Paystack'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending Confirmation'),
        ('confirmed', 'Confirmed'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(TenantInvoice, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    reference = models.CharField(max_length=100, unique=True, null=True, blank=True)
    paystack_reference = models.CharField(max_length=100, null=True, blank=True)
    paystack_transaction_id = models.CharField(max_length=100, null=True, blank=True)

    bank_name = models.CharField(max_length=100, blank=True)
    account_name = models.CharField(max_length=255, blank=True)
    payment_proof = models.URLField(blank=True)

    confirmed_by = models.ForeignKey(
        'users.CustomUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='confirmed_payments'
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmation_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenant_payments'
        ordering = ['-created_at']

    def __str__(self):
        return f"Payment {self.reference} - ₦{self.amount}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"PAY-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)

    def confirm(self, confirmed_by, notes=''):
        self.status = 'confirmed'
        self.confirmed_by = confirmed_by
        self.confirmed_at = timezone.now()
        self.confirmation_notes = notes
        self.save()


class TenantSettings(models.Model):
    """School-specific settings and branding."""

    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='settings', primary_key=True)

    # School Information
    school_code = models.CharField(max_length=20, blank=True)
    school_motto = models.CharField(max_length=500, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default='Nigeria')
    postal_code = models.CharField(max_length=20, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)

    # Branding
    logo = models.URLField(blank=True)
    favicon = models.URLField(blank=True)
    primary_color = models.CharField(max_length=7, default='#4F46E5')
    secondary_color = models.CharField(max_length=7, default='#10B981')
    theme = models.CharField(max_length=20, default='light')
    typography = models.CharField(max_length=50, default='Inter')

    # Academic Settings
    current_session = models.ForeignKey(
        'academics.AcademicSession', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='tenant_current_session'
    )
    current_term = models.ForeignKey(
        'academics.Term', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='tenant_current_term'
    )

    # Billing preference
    billing_period = models.CharField(
        max_length=20, choices=TenantInvoice.BILLING_PERIOD_CHOICES, default='term'
    )

    # Localization
    timezone = models.CharField(max_length=50, default='Africa/Lagos')
    date_format = models.CharField(max_length=20, default='DD/MM/YYYY')
    language = models.CharField(max_length=10, default='en')
    currency = models.CharField(max_length=3, default='NGN')

    # Registration & User Settings
    allow_student_registration = models.BooleanField(default=False)
    allow_parent_registration = models.BooleanField(default=False)
    registration_approval_required = models.BooleanField(default=False)
    default_user_role = models.CharField(max_length=20, default='student')

    # Security & Authentication
    require_email_verification = models.BooleanField(default=True)
    session_timeout_minutes = models.PositiveIntegerField(default=30)
    max_login_attempts = models.PositiveIntegerField(default=5)
    account_lock_duration_minutes = models.PositiveIntegerField(default=15)

    # Password Policy
    password_min_length = models.PositiveIntegerField(default=8)
    password_reset_interval_days = models.PositiveIntegerField(default=90)
    password_require_numbers = models.BooleanField(default=True)
    password_require_symbols = models.BooleanField(default=False)
    password_require_uppercase = models.BooleanField(default=False)
    password_expiration_days = models.PositiveIntegerField(default=90)

    # Profile Settings
    allow_profile_image_upload = models.BooleanField(default=True)
    profile_image_max_size_mb = models.PositiveIntegerField(default=2)

    # Notifications
    notifications_enabled = models.BooleanField(default=True)

    # Portal Access
    student_portal_enabled = models.BooleanField(default=True)
    teacher_portal_enabled = models.BooleanField(default=True)
    parent_portal_enabled = models.BooleanField(default=True)

    # Result Settings
    show_position_on_result = models.BooleanField(default=True)
    show_class_average_on_result = models.BooleanField(default=True)
    require_token_for_result = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenant_settings'
        verbose_name = 'Tenant Settings'
        verbose_name_plural = 'Tenant Settings'

    def __str__(self):
        return f"Settings for {self.tenant.name}"

    def save(self, *args, **kwargs):
        if not self.school_code:
            words = self.tenant.name.upper().split()
            self.school_code = ''.join(word[0] for word in words[:3]) if len(words) >= 2 else self.tenant.name[:3].upper()
        super().save(*args, **kwargs)


class TenantInvitation(models.Model):
    """Invitations for users to join a tenant."""

    ROLE_CHOICES = [
        ('superadmin', 'Super Admin'),
        ('secondary_admin', 'Secondary Admin'),
        ('primary_admin', 'Primary Admin'),
        ('nursery_admin', 'Nursery Admin'),
        ('teacher', 'Teacher'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='invitations')
    email = models.EmailField()
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    section = models.CharField(max_length=20, blank=True, null=True)

    token = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    invited_by = models.ForeignKey(
        'users.CustomUser', on_delete=models.SET_NULL, null=True, related_name='sent_tenant_invitations'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'tenant_invitations'
        ordering = ['-created_at']

    def __str__(self):
        return f"Invitation for {self.email} to {self.tenant.name}"

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return self.status == 'pending' and not self.is_expired

    def regenerate_token(self):
        """Regenerate token and extend expiry date."""
        self.token = secrets.token_urlsafe(32)
        self.expires_at = timezone.now() + timezone.timedelta(days=7)
        self.save()


class TenantSetupToken(models.Model):
    """
    One-time setup tokens for cross-domain authentication.
    Used when redirecting from main domain to subdomain after registration.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='setup_tokens')
    user = models.ForeignKey(
        'users.CustomUser', on_delete=models.CASCADE, related_name='setup_tokens'
    )
    token = models.CharField(max_length=64, unique=True)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'tenant_setup_tokens'
        ordering = ['-created_at']

    def __str__(self):
        return f"Setup token for {self.user.email} ({self.tenant.name})"

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(32)
        if not self.expires_at:
            # Short-lived token - 15 minutes
            self.expires_at = timezone.now() + timezone.timedelta(minutes=15)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired

    def use(self):
        """Mark the token as used."""
        self.is_used = True
        self.used_at = timezone.now()
        self.save()

    @classmethod
    def create_for_user(cls, user, tenant):
        """Create a new setup token for a user."""
        return cls.objects.create(user=user, tenant=tenant)
