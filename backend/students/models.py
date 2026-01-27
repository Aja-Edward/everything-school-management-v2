from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
import secrets
from users.models import CustomUser
from tenants.models import TenantMixin

GENDER_CHOICES = (
    ("M", "Male"),
    ("F", "Female"),
)

EDUCATION_LEVEL_CHOICES = (
    ("NURSERY", "Nursery"),
    ("PRIMARY", "Primary"),
    ("JUNIOR_SECONDARY", "Junior Secondary"),
    ("SENIOR_SECONDARY", "Senior Secondary"),
)

CLASS_CHOICES = (
    # Nursery Classes
    ("PRE_NURSERY", "Pre-nursery"),
    ("NURSERY_1", "Nursery 1"),
    ("NURSERY_2", "Nursery 2"),
    # Primary Classes
    ("PRIMARY_1", "Primary 1"),
    ("PRIMARY_2", "Primary 2"),
    ("PRIMARY_3", "Primary 3"),
    ("PRIMARY_4", "Primary 4"),
    ("PRIMARY_5", "Primary 5"),
    ("PRIMARY_6", "Primary 6"),
    # Junior Secondary Classes
    ("JSS_1", "Junior Secondary 1 (JSS1)"),
    ("JSS_2", "Junior Secondary 2 (JSS2)"),
    ("JSS_3", "Junior Secondary 3 (JSS3)"),
    # Senior Secondary Classes
    ("SS_1", "Senior Secondary 1 (SS1)"),
    ("SS_2", "Senior Secondary 2 (SS2)"),
    ("SS_3", "Senior Secondary 3 (SS3)"),
)


class Student(TenantMixin, models.Model):
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="student_profile"
    )
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()

    # Enhanced class field with predefined choices
    student_class = models.CharField(
        max_length=20,
        choices=CLASS_CHOICES,
        help_text="Select the student's current class/grade",
    )

    # New field to categorize education level
    education_level = models.CharField(
        max_length=20,
        choices=EDUCATION_LEVEL_CHOICES,
        help_text="Education level category",
    )

    admission_date = models.DateField(auto_now_add=True)

    # Registration number field
    registration_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Student's unique registration number",
    )

    # ADD THIS: Profile picture field for students
    profile_picture = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="Student profile picture (Cloudinary URL)",
    )

    # New: Classroom assignment (e.g., 'Primary 1 A', 'SS3 B')
    classroom = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Specific classroom assignment (e.g., 'Primary 1 A', 'SS3 B')",
    )

    # Stream assignment for Senior Secondary students
    stream = models.ForeignKey(
        "classroom.Stream",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
        help_text="Stream assignment for Senior Secondary students",
    )

    # Optional: Add fields that might be useful for nursery students
    parent_contact = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Primary parent/guardian contact number",
    )

    emergency_contact = models.CharField(
        max_length=20, blank=True, null=True, help_text="Emergency contact number"
    )

    # Medical information might be more critical for younger students
    medical_conditions = models.TextField(
        blank=True, null=True, help_text="Any medical conditions or allergies"
    )

    # Special needs or requirements
    special_requirements = models.TextField(
        blank=True, null=True, help_text="Any special educational or care requirements"
    )

    # Additional student information fields
    blood_group = models.CharField(
        max_length=5,
        blank=True,
        null=True,
        help_text="Student's blood group (e.g., A+, B-, O+)",
    )

    place_of_birth = models.CharField(
        max_length=100, blank=True, null=True, help_text="Student's place of birth"
    )

    address = models.TextField(
        blank=True, null=True, help_text="Student's home address"
    )

    phone_number = models.CharField(
        max_length=20, blank=True, null=True, help_text="Student's phone number"
    )

    payment_method = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Preferred payment method (e.g., Bank Transfer, Cash, etc.)",
    )

    # New: Track if student is active (registered/activated)
    is_active = models.BooleanField(
        default=True, help_text="Is the student currently active/registered?"
    )

    class Meta:
        ordering = ["education_level", "student_class", "user__first_name"]
        verbose_name = "Student"
        verbose_name_plural = "Students"
        unique_together = ["tenant", "registration_number"]
        indexes = [
            models.Index(fields=["tenant", "education_level", "student_class"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "classroom"]),
        ]

    def __str__(self):
        user = self.user
        classroom_str = f" ({self.classroom})" if self.classroom else ""
        return f"{user.full_name} - {self.get_student_class_display()}{classroom_str}"

    @property
    def full_name(self):
        """Returns the full name of the student."""
        try:
            return self.user.full_name if self.user else "Unknown Student"
        except CustomUser.DoesNotExist:
            return "Unknown Student"
    @property
    def short_name(self):
        """Returns the short name of the student (First Last only)."""
        return self.user.short_name

    @property
    def age(self):
        """Calculate and return the student's current age."""
        from datetime import date

        today = date.today()
        return (
            today.year
            - self.date_of_birth.year
            - (
                (today.month, today.day)
                < (self.date_of_birth.month, self.date_of_birth.day)
            )
        )

    @property
    def is_nursery_student(self):
        """Check if student is in nursery level."""
        return self.education_level == "NURSERY"

    @property
    def is_primary_student(self):
        """Check if student is in primary level."""
        return self.education_level == "PRIMARY"

    @property
    def is_secondary_student(self):
        """Check if student is in secondary level."""
        return self.education_level in ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

    @property
    def is_junior_secondary_student(self):
        """Check if student is in junior secondary level."""
        return self.education_level == "JUNIOR_SECONDARY"

    @property
    def is_senior_secondary_student(self):
        """Check if student is in senior secondary level."""
        return self.education_level == "SENIOR_SECONDARY"

    def save(self, *args, **kwargs):
        """Override save to automatically set education_level based on student_class."""
        if not self.education_level:
            if self.student_class in [
                "PRE_NURSERY",
                "NURSERY_1",
                "NURSERY_2",
            ]:
                self.education_level = "NURSERY"
            elif self.student_class in [
                "PRIMARY_1",
                "PRIMARY_2",
                "PRIMARY_3",
                "PRIMARY_4",
                "PRIMARY_5",
                "PRIMARY_6",
            ]:
                self.education_level = "PRIMARY"
            elif self.student_class in [
                "JSS_1",
                "JSS_2",
                "JSS_3",
            ]:
                self.education_level = "JUNIOR_SECONDARY"
            elif self.student_class in [
                "SS_1",
                "SS_2",
                "SS_3",
            ]:
                self.education_level = "SENIOR_SECONDARY"
        super().save(*args, **kwargs)

User = get_user_model()


class ResultCheckToken(TenantMixin, models.Model):
    """Token for result portal access - one per student per term"""

    student = models.ForeignKey(  # Changed from OneToOneField to ForeignKey
        User, on_delete=models.CASCADE, related_name="result_tokens"
    )
    token = models.CharField(max_length=64, db_index=True)
    school_term = models.ForeignKey("academics.Term", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("tenant", "student", "school_term"), ("tenant", "token")]
        indexes = [
            models.Index(fields=["tenant", "token"]),
            models.Index(fields=["expires_at"]),
            models.Index(fields=["is_used"]),
        ]

    def save(self, *args, **kwargs):
        if not self.token:
            # Generate human-readable token
            self.token = self.generate_readable_token()
        if not self.expires_at and self.school_term:
            # Token expires at end of school term
            from datetime import datetime, time

            self.expires_at = timezone.make_aware(
                datetime.combine(self.school_term.end_date, time.max)
            )
        super().save(*args, **kwargs)

    @staticmethod
    def generate_readable_token():
        """
        Generate human-readable token in format: ABC-123-XYZ-456
        Total: 12 characters (easy to type, very secure)
        Example: A7B-2C9-X3Y-5Z1
        """
        chars = string.ascii_uppercase + string.digits
        parts = []
        for _ in range(4):  # 4 groups
            part = "".join(secrets.choice(chars) for _ in range(3))  # 3 chars each
            parts.append(part)

        token = "-".join(parts)

        # Ensure uniqueness
        max_attempts = 10
        for _ in range(max_attempts):
            if not ResultCheckToken.objects.filter(token=token).exists():
                return token
            # Generate new token if collision
            parts = []
            for _ in range(4):
                part = "".join(secrets.choice(chars) for _ in range(3))
                parts.append(part)
            token = "-".join(parts)

        # Fallback to UUID if still collision (extremely rare)
        import uuid

        return str(uuid.uuid4())[:15].upper().replace("-", "")

    def is_valid(self):
        """Check if token is still valid"""
        return not self.is_used and timezone.now() <= self.expires_at

    def mark_as_used(self):
        """Mark token as used (optional - for tracking)"""
        self.is_used = True
        self.used_at = timezone.now()
        self.save()

    def time_until_expiry(self):
        """Get human-readable time until expiry"""
        if not self.is_valid():
            return "Expired"

        delta = self.expires_at - timezone.now()
        days = delta.days

        if days > 30:
            months = days // 30
            return f"{months} month{'s' if months != 1 else ''}"
        elif days > 0:
            return f"{days} day{'s' if days != 1 else ''}"
        else:
            hours = delta.seconds // 3600
            return f"{hours} hour{'s' if hours != 1 else ''}"

    def __str__(self):
        return f"Result Token - {self.student.username} - {self.school_term}"
