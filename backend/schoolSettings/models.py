from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import FileExtensionValidator
from django.utils import timezone
import uuid
from tenants.models import Tenant

User = get_user_model()


class SchoolSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Basic Information
    school_name = models.CharField(max_length=255, default="School Name")
    site_name = models.CharField(max_length=255, blank=True, null=True)
    school_address = models.TextField(blank=True, null=True)
    school_phone = models.CharField(max_length=20, blank=True, null=True)
    school_email = models.EmailField(blank=True, null=True)
    school_motto = models.CharField(max_length=500, blank=True, null=True)
    
    # NEW FIELD: School Code for username generation
    school_code = models.CharField(
        max_length=10,
        default='SCH',
        help_text="Short code used in username generation (e.g., AIS, GTS, HIS, KCS)"
    )

    # UPDATED: Change from ImageField to URLField for Cloudinary
    logo = models.URLField(
        max_length=500, blank=True, null=True, help_text="School logo (Cloudinary URL)"
    )
    favicon = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="School favicon (Cloudinary URL)",
    )

    @property
    def favicon_url(self):
        """Return the full Cloudinary URL"""
        # Since favicon already stores the full URL, just return it
        return self.favicon if self.favicon else None

    # Academic Year
    academic_year = models.CharField(max_length=50, blank=True, null=True)
    current_term = models.CharField(max_length=50, blank=True, null=True)

    # Localization
    timezone = models.CharField(max_length=50, default="UTC")
    date_format = models.CharField(max_length=20, default="YYYY-MM-DD")
    language = models.CharField(max_length=50, default="English")

    # Design Settings
    theme = models.CharField(max_length=20, default="light")
    primary_color = models.CharField(max_length=7, default="#3B82F6")

    typography = models.CharField(max_length=50, default="Inter")

    # Security Settings
    allow_self_registration = models.BooleanField(default=True)
    email_verification_required = models.BooleanField(default=True)
    registration_approval_required = models.BooleanField(default=False)
    default_user_role = models.CharField(max_length=20, default="student")
    password_min_length = models.IntegerField(default=8)
    password_reset_interval = models.IntegerField(default=90)
    password_require_numbers = models.BooleanField(default=True)
    password_require_symbols = models.BooleanField(default=False)
    password_require_uppercase = models.BooleanField(default=False)
    # 🔥 ADD THESE NEW FIELDS 🔥
    password_expiration = models.IntegerField(
        default=90, help_text="Password expiration period in days"
    )
    session_timeout = models.IntegerField(
        default=30, help_text="Session timeout in minutes"
    )
    account_lock_duration = models.IntegerField(
        default=15,
        help_text="Account lock duration in minutes after failed login attempts",
    )
    max_login_attempts = models.IntegerField(
        default=5, help_text="Maximum login attempts before account lock"
    )
    allow_profile_image_upload = models.BooleanField(default=True)
    profile_image_max_size = models.IntegerField(default=2)

    # Notifications
    notifications_enabled = models.BooleanField(default=True)

    # Portal Access Control
    student_portal_enabled = models.BooleanField(default=True)
    teacher_portal_enabled = models.BooleanField(default=True)
    parent_portal_enabled = models.BooleanField(default=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "School Settings"
        verbose_name_plural = "School Settings"

    def __str__(self):
        return f"Settings for {self.school_name} ({self.school_code})"

    def save(self, *args, **kwargs):
        # Ensure only one SchoolSettings instance exists
        if not self.pk and SchoolSettings.objects.exists():
            # Update existing instead of creating new
            existing = SchoolSettings.objects.first()
            self.pk = existing.pk
        
        # Always uppercase the school code
        if self.school_code:
            self.school_code = self.school_code.upper().strip()
        
        super().save(*args, **kwargs)


class CommunicationSettings(models.Model):
    """Communication settings for email and SMS providers"""
    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name="communication_settings",
        null=True,  # null during migration, then make required
        blank=True,
    )
    # Brevo (Email) Settings
    brevo_api_key = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Brevo API key for email delivery",
    )
    brevo_sender_email = models.EmailField(
        blank=True, null=True, help_text="Default sender email address"
    )
    brevo_sender_name = models.CharField(
        max_length=100, blank=True, null=True, help_text="Default sender name"
    )
    brevo_test_mode = models.BooleanField(
        default=True, help_text="Enable test mode to prevent actual email sending"
    )

    # Twilio (SMS) Settings
    twilio_account_sid = models.CharField(
        max_length=255, blank=True, null=True, help_text="Twilio Account SID"
    )
    twilio_auth_token = models.CharField(
        max_length=255, blank=True, null=True, help_text="Twilio Auth Token"
    )
    twilio_phone_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Twilio phone number for sending SMS",
    )
    twilio_test_mode = models.BooleanField(
        default=True, help_text="Enable test mode to prevent actual SMS sending"
    )

    # Notification Preferences
    email_notifications_enabled = models.BooleanField(
        default=True, help_text="Enable email notifications"
    )
    sms_notifications_enabled = models.BooleanField(
        default=False, help_text="Enable SMS notifications"
    )
    in_app_notifications_enabled = models.BooleanField(
        default=True, help_text="Enable in-app notifications"
    )
    digest_frequency = models.CharField(
        max_length=20,
        default="daily",
        choices=[
            ("realtime", "Real-time"),
            ("hourly", "Hourly"),
            ("daily", "Daily"),
            ("weekly", "Weekly"),
        ],
        help_text="Frequency for digest notifications",
    )

    # Connection Status
    brevo_configured = models.BooleanField(
        default=False, help_text="Brevo is properly configured"
    )
    twilio_configured = models.BooleanField(
        default=False, help_text="Twilio is properly configured"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        verbose_name = "Communication Setting"
        verbose_name_plural = "Communication Settings"

    def __str__(self):
        return f"Communication Settings - {self.tenant.name if self.tenant else 'Unassigned'}"

    def save(self, *args, **kwargs):
        # ✅ Remove the singleton guard — each tenant gets their own row now
        super().save(*args, **kwargs)


class NotificationSettings(models.Model):
    email_notifications_enabled = models.BooleanField(default=True)
    sms_notifications_enabled = models.BooleanField(default=False)
    push_notifications_enabled = models.BooleanField(default=False)

    def __str__(self):
        return f"Notifications (Email: {self.email_notifications_enabled}, SMS: {self.sms_notifications_enabled})"


class SystemPreferences(models.Model):
    timezone = models.CharField(max_length=100, default="UTC")
    date_format = models.CharField(max_length=20, default="YYYY-MM-DD")
    time_format = models.CharField(max_length=10, default="24-hour")
    language = models.CharField(max_length=50, default="English")

    def __str__(self):
        return f"{self.language} ({self.timezone})"


class SchoolHoliday(models.Model):
    """School holidays and breaks"""

    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "School Holiday"
        verbose_name_plural = "School Holidays"
        ordering = ["start_date"]

    def __str__(self):
        return f"{self.name} ({self.start_date} - {self.end_date})"


class Permission(models.Model):
    """Granular permissions for different modules"""

    MODULE_CHOICES = [
        ("dashboard", "Dashboard"),
        ("students", "Students"),
        ("teachers", "Teachers"),
        ("parents", "Parents"),
        ("attendance", "Attendance"),
        ("results", "Results"),
        ("exams", "Exams"),
        ("messaging", "Messaging"),
        ("finance", "Finance"),
        ("reports", "Reports"),
        ("settings", "Settings"),
        ("announcements", "Announcements"),
        ("events", "Events"),
        ("library", "Library"),
        ("timetable", "Timetable"),
        ("subjects", "Subjects"),
        ("classes", "Classes"),
    ]

    PERMISSION_TYPE_CHOICES = [
        ("read", "Read"),
        ("write", "Write"),
        ("delete", "Delete"),
        ("admin", "Admin"),
    ]

    SECTION_CHOICES = [
        ("all", "All Sections"),
        ("primary", "Primary Section"),
        ("secondary", "Secondary Section"),
        ("nursery", "Nursery Section"),
    ]

    module = models.CharField(max_length=20, choices=MODULE_CHOICES)
    permission_type = models.CharField(max_length=10, choices=PERMISSION_TYPE_CHOICES)
    section = models.CharField(max_length=15, choices=SECTION_CHOICES, default="all")
    granted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"
        unique_together = ["module", "permission_type", "section"]
        ordering = ["module", "permission_type", "section"]

    def __str__(self):
        return f"{self.get_module_display()} - {self.get_permission_type_display()} - {self.get_section_display()}"


class Role(models.Model):
    """Custom roles with specific permissions"""

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    color = models.CharField(
        max_length=7, default="#3B82F6", help_text="Hex color for role display"
    )
    is_system = models.BooleanField(
        default=False, help_text="System roles cannot be deleted"
    )
    is_active = models.BooleanField(default=True)

    # Permissions
    permissions = models.ManyToManyField(Permission, blank=True, related_name="roles")

    # Section restrictions
    primary_section_access = models.BooleanField(default=True)
    secondary_section_access = models.BooleanField(default=True)
    nursery_section_access = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roles_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Role"
        verbose_name_plural = "Roles"
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def user_count(self):
        """Get the number of users with this role"""
        from users.models import CustomUser

        return CustomUser.objects.filter(role=self.name).count()

    def has_permission(self, module, permission_type, section="all"):
        """Check if role has specific permission"""
        return self.permissions.filter(
            module=module, permission_type=permission_type, section__in=[section, "all"]
        ).exists()


class UserRole(models.Model):
    """User-specific role assignments with section restrictions"""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(
        Role, on_delete=models.CASCADE, related_name="user_assignments"
    )

    # Section-specific permissions
    primary_section_access = models.BooleanField(default=True)
    secondary_section_access = models.BooleanField(default=True)
    nursery_section_access = models.BooleanField(default=True)

    # Grade level restrictions (JSONField storing list of grade level names)
    # If empty/null, user has access to all grades in their assigned sections
    # Example: ["JSS 1", "JSS 2", "JSS 3"] or ["Primary 1", "Primary 2"]
    allowed_grade_levels = models.JSONField(
        blank=True,
        null=True,
        default=list,
        help_text="Specific grade levels this user can access. If empty, user can access all grades in assigned sections."
    )

    # Custom permissions override
    custom_permissions = models.ManyToManyField(
        Permission, blank=True, related_name="user_role_assignments"
    )

    # Assignment details
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_role_assignments_made",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "User Role Assignment"
        verbose_name_plural = "User Role Assignments"
        unique_together = ["user", "role"]
        ordering = ["-assigned_at"]

    def __str__(self):
        return f"{self.user.full_name} - {self.role.name}"

    def is_expired(self):
        """Check if role assignment has expired"""
        if self.expires_at:
            return timezone.now() > self.expires_at
        return False

    def has_permission(self, module, permission_type, section="all"):
        """Check if user has specific permission through this role"""
        if not self.is_active or self.is_expired():
            return False

        # Check custom permissions first
        custom_perm = self.custom_permissions.filter(
            module=module, permission_type=permission_type, section__in=[section, "all"]
        ).first()

        if custom_perm:
            return custom_perm.granted

        # Check role permissions
        return self.role.has_permission(module, permission_type, section)


class SchoolAnnouncement(models.Model):
    """School-wide announcements"""

    ANNOUNCEMENT_TYPES = [
        ("general", "General"),
        ("academic", "Academic"),
        ("event", "Event"),
        ("emergency", "Emergency"),
    ]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="announcements",
        null=True,  # null during migration, then make required
        blank=True,
    )

    title = models.CharField(max_length=200)
    content = models.TextField()
    announcement_type = models.CharField(
        max_length=20, choices=ANNOUNCEMENT_TYPES, default="general"
    )
    is_active = models.BooleanField(default=True)
    is_pinned = models.BooleanField(default=False)

    # Target audience
    target_audience = models.JSONField(
        default=list, help_text="List of user types to target"
    )

    # Schedule
    start_date = models.DateTimeField(default=timezone.now)
    end_date = models.DateTimeField(blank=True, null=True)

    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "School Announcement"
        verbose_name_plural = "School Announcements"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


# ─── Tenant Landing Page Models ───────────────────────────────────────────────

class TenantLandingPage(models.Model):
    """
    Master configuration for a tenant's public landing page.
    One record per tenant (OneToOne).
    """
    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name="landing_page",
    )
    is_published = models.BooleanField(
        default=False,
        help_text="When false the public landing page is not accessible.",
    )

    # Hero section
    HERO_TYPE_CHOICES = [("static", "Static Image"), ("carousel", "Carousel")]
    hero_type = models.CharField(max_length=10, choices=HERO_TYPE_CHOICES, default="static")
    hero_image = models.URLField(max_length=500, blank=True, null=True)
    hero_title = models.CharField(max_length=200, blank=True, null=True)
    hero_subtitle = models.TextField(blank=True, null=True)
    hero_cta_text = models.CharField(max_length=80, default="Enter Portal")
    hero_cta_url = models.CharField(max_length=200, default="/login")
    hero_secondary_cta_text = models.CharField(max_length=80, blank=True, null=True)
    hero_secondary_cta_url = models.CharField(max_length=200, blank=True, null=True)

    # Ribbon bar (scrolling text strip above navbar)
    ribbon_enabled = models.BooleanField(default=False)
    ribbon_text = models.CharField(max_length=300, blank=True, null=True)
    RIBBON_SPEED_CHOICES = [("slow", "Slow"), ("medium", "Medium"), ("fast", "Fast")]
    ribbon_speed = models.CharField(max_length=10, choices=RIBBON_SPEED_CHOICES, default="medium")

    # Stats strip
    stats_enabled = models.BooleanField(default=True)
    stat_1_label = models.CharField(max_length=80, default='Students')
    stat_1_value = models.CharField(max_length=40, default='1,000+')
    stat_2_label = models.CharField(max_length=80, default='Teachers')
    stat_2_value = models.CharField(max_length=40, default='80+')
    stat_3_label = models.CharField(max_length=80, default='Programmes')
    stat_3_value = models.CharField(max_length=40, default='20+')
    stat_4_label = models.CharField(max_length=80, default='Years of Excellence')
    stat_4_value = models.CharField(max_length=40, default='15+')

    # Footer
    footer_text = models.TextField(blank=True, null=True)
    facebook_url = models.URLField(blank=True, null=True)
    twitter_url = models.URLField(blank=True, null=True)
    instagram_url = models.URLField(blank=True, null=True)
    youtube_url = models.URLField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Tenant Landing Page"
        verbose_name_plural = "Tenant Landing Pages"

    def __str__(self):
        return f"Landing Page — {self.tenant.name}"


class LandingSection(models.Model):
    """
    A content section (About / Admissions / Contact / Custom) on the landing page.
    Admins can enable/disable and reorder sections.
    """
    SECTION_TYPE_CHOICES = [
        ("about", "About"),
        ("admissions", "Admissions"),
        ("contact", "Contact"),
        ("school_activities", "School Activities"),
        ("custom", "Custom"),
    ]

    landing_page = models.ForeignKey(
        TenantLandingPage,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    section_type = models.CharField(max_length=20, choices=SECTION_TYPE_CHOICES)
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=300, blank=True, null=True)
    content = models.TextField(blank=True, null=True, help_text="Rich text / markdown content")
    image = models.URLField(max_length=500, blank=True, null=True)
    banner_image = models.URLField(max_length=500, blank=True, null=True, help_text="Full-width banner shown at the top of the section's dedicated page")
    is_enabled = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    # Contact-specific structured fields
    contact_address = models.TextField(blank=True, null=True)
    contact_phone = models.TextField(blank=True, null=True, help_text="One phone number per line — supports multiple numbers")
    contact_email = models.EmailField(blank=True, null=True)
    contact_hours = models.CharField(max_length=200, blank=True, null=True)
    contact_map_embed = models.TextField(blank=True, null=True, help_text="Google Maps embed URL")

    # Admissions-specific structured fields
    admissions_deadline = models.DateField(blank=True, null=True)
    admissions_fee = models.CharField(max_length=100, blank=True, null=True)
    admissions_contact_name = models.CharField(max_length=100, blank=True, null=True)
    admissions_contact_email = models.EmailField(blank=True, null=True)
    admissions_contact_phone = models.CharField(max_length=50, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Landing Section"
        verbose_name_plural = "Landing Sections"
        ordering = ["display_order"]

    def __str__(self):
        return f"{self.get_section_type_display()} — {self.landing_page.tenant.name}"


class LandingCarouselImage(models.Model):
    """Up to 5 hero carousel images per tenant landing page."""
    landing_page = models.ForeignKey(
        TenantLandingPage,
        on_delete=models.CASCADE,
        related_name='carousel_images',
    )
    image = models.URLField(max_length=500)
    title = models.CharField(max_length=200, blank=True)
    caption = models.CharField(max_length=300, blank=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['display_order']

    def __str__(self):
        return f"Carousel slide {self.display_order} — {self.landing_page.tenant.name}"


class NavigationLink(models.Model):
    """
    Custom navigation links shown in the tenant landing page navbar.
    """
    LINK_TYPE_CHOICES = [
        ("internal", "Internal Page"),
        ("section", "Page Section"),
        ("external", "External URL"),
    ]

    landing_page = models.ForeignKey(
        TenantLandingPage,
        on_delete=models.CASCADE,
        related_name="nav_links",
    )
    label = models.CharField(max_length=80)
    url = models.CharField(max_length=300)
    link_type = models.CharField(max_length=10, choices=LINK_TYPE_CHOICES, default="internal")
    open_in_new_tab = models.BooleanField(default=False)
    is_enabled = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Navigation Link"
        verbose_name_plural = "Navigation Links"
        ordering = ["display_order"]

    def __str__(self):
        return f"{self.label} → {self.url}"
