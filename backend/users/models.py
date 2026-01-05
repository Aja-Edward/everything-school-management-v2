# users/models.py
from django.db import models
from django.contrib.auth.models import (
    AbstractBaseUser,
    PermissionsMixin,
    BaseUserManager,
    Group,
)
from django.utils import timezone

# User roles - EXPANDED to include section admins
ROLE_CHOICES = (
    ("superadmin", "Super Admin"),
    ("secondary_admin", "Secondary Admin"),  # NEW: Manages both JSS and SSS
    (
        "senior_secondary_admin",
        "Senior Secondary Admin",
    ),  # Keep for backward compatibility
    (
        "junior_secondary_admin",
        "Junior Secondary Admin",
    ),  # Keep for backward compatibility
    ("primary_admin", "Primary Admin"),
    ("nursery_admin", "Nursery Admin"),
    ("admin", "Admin"),
    ("teacher", "Teacher"),
    ("student", "Student"),
    ("parent", "Parent"),
)


SECTION_CHOICES = (
    ("nursery", "Nursery"),
    ("primary", "Primary"),
    ("secondary", "Secondary"),  # NEW: General secondary (covers both JSS and SSS)
    ("junior_secondary", "Junior Secondary"),
    ("senior_secondary", "Senior Secondary"),
)


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("User must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", "superadmin")

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)

    def create_staffuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        return self.create_user(email, password, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(blank=False, null=False)
    username = models.CharField(max_length=150, unique=True)
    first_name = models.CharField(max_length=150)
    middle_name = models.CharField(max_length=150, blank=True, null=True)
    last_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    agree_to_terms = models.BooleanField(default=False)
    subscribe_newsletter = models.BooleanField(default=False)
    profile_picture = models.URLField(blank=True, null=True)

    role = models.CharField(
        max_length=30, choices=ROLE_CHOICES
    )  # Increased to 30 for "junior_secondary_admin"

    # MULTI-TENANT FIELD - Links user to their school
    school = models.ForeignKey(
        "schoolSettings.SchoolSettings",
        on_delete=models.CASCADE,
        related_name="users",
        null=True,
        blank=True,
        help_text="School this user belongs to (required for multi-tenant isolation)",
        db_index=True,  # Index for faster queries
    )

    # Section assignment
    section = models.CharField(
        max_length=20,
        choices=SECTION_CHOICES,
        blank=True,
        null=True,
        help_text="School section (Nursery/Primary/Junior Secondary/Senior Secondary)",
    )

    reports_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subordinates",
        help_text="The admin this user reports to",
    )

    is_active = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)

    # Email/SMS verification fields
    verification_code = models.CharField(max_length=6, blank=True, null=True)
    verification_code_expires = models.DateTimeField(blank=True, null=True)
    email_verified = models.BooleanField(default=False)

    # Timestamps
    date_joined = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(blank=True, null=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email", "first_name", "last_name", "role"]

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["-date_joined"]
        # Add composite indexes for common queries
        indexes = [
            models.Index(fields=["school", "role"]),
            models.Index(fields=["school", "section"]),
            models.Index(fields=["school", "is_active"]),
        ]

    def __str__(self):
        school_code = self.school.school_code if self.school else "No School"
        return f"{self.email} ({school_code})"

    @property
    def full_name(self):
        """
        Returns the full name with optional middle name.
        Format: "First Middle Last" or "First Last" if no middle name.
        """
        if self.middle_name:
            return f"{self.first_name} {self.middle_name} {self.last_name}"
        return f"{self.first_name} {self.last_name}"

    def get_full_name(self):
        """
        Return the full name (implements Django's User interface).
        This is what serializers with source="user.get_full_name" will call.
        """
        return self.full_name  # Uses the property above

    @property
    def short_name(self):
        """
        Returns a shorter version of the name for display purposes.
        Format: "First Last" (excludes middle name)
        """
        return f"{self.first_name} {self.last_name}"

    def is_verification_code_valid(self):
        """Check if the verification code is still valid"""
        if not self.verification_code_expires:
            return False
        return timezone.now() < self.verification_code_expires

    def clear_verification_code(self):
        """Clear verification code and expiry"""
        self.verification_code = None
        self.verification_code_expires = None
        self.save()

    def save(self, *args, **kwargs):
        """Override save to automatically sync role with groups"""
        super().save(*args, **kwargs)

        # Sync role with Django groups
        if self.role:
            role_display = dict(ROLE_CHOICES).get(self.role, self.role).title()
            group, _ = Group.objects.get_or_create(name=role_display)
            self.groups.set([group])

        # Auto-assign reporting structure for teachers
        if self.role == "teacher" and self.section and not self.reports_to:
            # Map section to admin role
            section_to_admin = {
                "nursery": "nursery_admin",
                "primary": "primary_admin",
                "junior_secondary": "junior_secondary_admin",
                "senior_secondary": "senior_secondary_admin",
            }
            admin_role = section_to_admin.get(self.section)

            if admin_role:
                try:
                    # MULTI-TENANT: Only look for admins in the same school
                    section_admin = CustomUser.objects.filter(
                        role=admin_role,
                        section=self.section,
                        school=self.school,  # Same school only
                        is_active=True,
                    ).first()

                    if section_admin:
                        # Use update to avoid recursion
                        CustomUser.objects.filter(pk=self.pk).update(
                            reports_to=section_admin
                        )
                except Exception:
                    pass

    @property
    def is_admin(self):
        """Check if user has any admin role"""
        return self.role in [
            "superadmin",
            "secondary_admin",
            "senior_secondary_admin",
            "junior_secondary_admin",
            "primary_admin",
            "nursery_admin",
            "admin",
        ]

    @property
    def is_section_admin(self):
        """Check if user is a section admin (not superadmin)"""
        return self.role in [
            "secondary_admin",
            "senior_secondary_admin",
            "junior_secondary_admin",
            "primary_admin",
            "nursery_admin",
        ]

    @property
    def section_display(self):
        """Get the display name for the section"""
        return dict(SECTION_CHOICES).get(self.section, self.section)

    @property
    def school_name(self):
        """Get the school name"""
        return self.school.school_name if self.school else "No School"

    @property
    def school_code(self):
        """Get the school code"""
        return self.school.school_code if self.school else None

    def get_subordinates(self):
        """Get all users directly reporting to this admin (within same school)"""
        return self.subordinates.filter(school=self.school)

    def get_section_teachers(self):
        """Get all teachers in this admin's section (within same school)"""
        if not self.school:
            return CustomUser.objects.none()

        if self.is_section_admin and self.section:
            return CustomUser.objects.filter(
                role="teacher",
                section=self.section,
                school=self.school,  # Same school only
            )
        elif self.role == "superadmin":
            return CustomUser.objects.filter(
                role="teacher", school=self.school  # Same school only
            )
        return CustomUser.objects.none()

    def get_section_students(self):
        """Get all students in this admin's section (within same school)"""
        if not self.school:
            return CustomUser.objects.none()

        if self.is_section_admin and self.section:
            return CustomUser.objects.filter(
                role="student",
                section=self.section,
                school=self.school,  # Same school only
            )
        elif self.role == "superadmin":
            return CustomUser.objects.filter(
                role="student", school=self.school  # Same school only
            )
        return CustomUser.objects.none()

    def can_manage_user(self, target_user):
        """Check if this user can manage the target user"""
        # Cannot manage users from different schools
        if self.school != target_user.school:
            return False

        # Superadmin can manage everyone in their school
        if self.role == "superadmin" or self.is_superuser:
            return True

        # Section admins can manage users in their section (same school)
        if self.is_section_admin:
            return target_user.section == self.section

        return False

    # MULTI-TENANT HELPER METHODS
    @classmethod
    def get_school_users(cls, school):
        """Get all users for a specific school"""
        from schoolSettings.models import SchoolSettings

        if isinstance(school, str):
            # If school_code is provided
            return cls.objects.filter(school__school_code=school)
        elif isinstance(school, SchoolSettings):
            # If SchoolSettings instance is provided
            return cls.objects.filter(school=school)
        return cls.objects.none()

    @classmethod
    def get_school_admins(cls, school):
        """Get all admins for a specific school"""
        return cls.get_school_users(school).filter(
            role__in=[
                "superadmin",
                "secondary_admin",
                "senior_secondary_admin",
                "junior_secondary_admin",
                "primary_admin",
                "nursery_admin",
                "admin",
            ]
        )

    @classmethod
    def get_school_teachers(cls, school):
        """Get all teachers for a specific school"""
        return cls.get_school_users(school).filter(role="teacher")

    @classmethod
    def get_school_students(cls, school):
        """Get all students for a specific school"""
        return cls.get_school_users(school).filter(role="student")

    @classmethod
    def get_school_parents(cls, school):
        """Get all parents for a specific school"""
        return cls.get_school_users(school).filter(role="parent")
