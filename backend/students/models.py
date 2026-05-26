from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
import secrets
from users.models import CustomUser
from tenants.models import TenantMixin
import string
from .constants import GENDER_CHOICES, EDUCATION_LEVEL_CHOICES, CLASS_CHOICES
from common.models import AbstractBulkUploadRecord


# ========================================
# NEW MODELS: EducationLevel, Class, Section
# ========================================


# ========================================
# STUDENT MODEL
# ========================================

class Student(TenantMixin, models.Model):
    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="student_profile"
    )
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()

    student_class = models.ForeignKey(
        "classroom.Class",
        on_delete=models.PROTECT,
        related_name="students",
        help_text="Student's current class/grade",
        null=True,
        blank=True,
    )

    section = models.ForeignKey(
        "classroom.Section",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
        help_text="Specific section assignment (e.g., 'A', 'B')",
    )

    admission_date = models.DateField(auto_now_add=True)

    registration_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Student's unique registration number",
    )

    profile_picture = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="Student profile picture (Cloudinary URL)",
    )

    stream = models.ForeignKey(
        "classroom.Stream",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
        help_text="Stream assignment for Senior Secondary students",
    )

    parent_contact = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Primary parent/guardian contact number",
    )

    emergency_contact = models.CharField(
        max_length=20, blank=True, null=True, help_text="Emergency contact number"
    )

    medical_conditions = models.TextField(
        blank=True, null=True, help_text="Any medical conditions or allergies"
    )

    special_requirements = models.TextField(
        blank=True, null=True, help_text="Any special educational or care requirements"
    )

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
        help_text="Preferred payment method",
    )
    state_of_origin = models.CharField(max_length=100, blank=True, null=True)
    lga_of_origin = models.CharField(max_length=100, blank=True, null=True)
    lga_of_residence = models.CharField(max_length=100, blank=True, null=True)
    year_admitted = models.CharField(max_length=4, blank=True, null=True)

    is_active = models.BooleanField(
        default=True, help_text="Is the student currently active/registered?"
    )

    class Meta:
        ordering = ["student_class__order",
                    "section__name", "user__first_name"]
        verbose_name = "Student"
        verbose_name_plural = "Students"
        unique_together = ["tenant", "registration_number"],
        ["tenant", "user"],
        indexes = [
            models.Index(fields=["tenant", "student_class", "section"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "student_class"]),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}

        if getattr(self.user, "tenant_id", None) != self.tenant_id:
            errors["user"] = "The selected user does not belong to this tenant."

        if self.student_class_id and self.student_class.tenant_id != self.tenant_id:
            errors["student_class"] = "The selected class does not belong to this tenant."

        if self.section_id and self.section.tenant_id != self.tenant_id:
            errors["section"] = "The selected section does not belong to this tenant."

        if self.stream_id and self.stream.tenant_id != self.tenant_id:
            errors["stream"] = "The selected stream does not belong to this tenant."

        if self.section_id and self.student_class_id:
            if self.section.class_grade_id != self.student_class_id:
                errors["section"] = (
                    f"Section '{self.section}' does not belong to class '{self.student_class}'."
                )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        if not self.student_class:
            return f"{self.user.full_name} - Not Assigned"
        section_str = f" - {self.section.name}" if self.section else ""
        return f"{self.user.full_name} - {self.student_class.name}{section_str}"

    @property
    def full_name(self):
        try:
            return self.user.full_name if self.user else "Unknown Student"
        except CustomUser.DoesNotExist:
            return "Unknown Student"

    @property
    def short_name(self):
        return self.user.short_name

    @property
    def classroom(self):
        """Returns classroom name for backward compatibility"""
        if not self.student_class:
            return "Not Assigned"
        if self.section:
            return self.section.full_name
        return self.student_class.name

    @property
    def education_level(self):
        if not self.student_class:
            return None
        level = self.student_class.education_level
        if not level:
            return None
        # Use level_type if set, otherwise derive from code
        if level.level_type:
            return level.level_type
        # Map code to the expected constant
        code_map = {
            "nursery": "NURSERY",
            "primary": "PRIMARY",
            "junior_secondary": "JUNIOR_SECONDARY",
            "senior_secondary": "SENIOR_SECONDARY",
        }
        return code_map.get(level.code, "")

    @property
    def education_level_display(self):
        """Returns education level display name"""
        if not self.student_class:
            return "Not Assigned"
        return self.student_class.education_level.name

    @property
    def age(self):
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
        return self.education_level == "NURSERY"

    @property
    def is_primary_student(self):
        return self.education_level == "PRIMARY"

    @property
    def is_secondary_student(self):
        return self.education_level in ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"]

    @property
    def is_junior_secondary_student(self):
        return self.education_level == "JUNIOR_SECONDARY"

    @property
    def is_senior_secondary_student(self):
        return self.education_level == "SENIOR_SECONDARY"

    def get_class_display(self):
        return self.student_class.name if self.student_class else "Not Assigned"

    def get_section_display(self):
        return self.section.name if self.section else "Not Assigned"

    def get_full_class_name(self):
        return self.classroom

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)


# ========================================
# RESULT CHECK TOKEN MODEL
# ========================================

User = get_user_model()


class ResultCheckToken(TenantMixin, models.Model):
    """Token for result portal access - one per student per term"""

    student = models.ForeignKey(
        "students.Student", on_delete=models.CASCADE, related_name="result_tokens"
    )
    token = models.CharField(max_length=64, db_index=True)
    school_term = models.ForeignKey("academics.Term", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [
            ("tenant", "student", "school_term"), ("tenant", "token")]
        indexes = [
            models.Index(fields=["tenant", "token"]),
            models.Index(fields=["expires_at"]),
            models.Index(fields=["is_used"]),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}

        if self.student_id and self.student.tenant_id != self.tenant_id:
            errors["student"] = "Student does not belong to this tenant."

        if self.school_term_id and self.school_term.tenant_id != self.tenant_id:
            errors["school_term"] = "Term does not belong to this tenant."

        if errors:
            raise ValidationError(errors)

    def _generate_unique_token(self):
        """Generate a human-readable token unique within this tenant — format: ABC-123-XYZ-456"""
        chars = string.ascii_uppercase + string.digits
        for _ in range(10):
            parts = ["".join(secrets.choice(chars)
                             for _ in range(3)) for _ in range(4)]
            token = "-".join(parts)
            if not ResultCheckToken.objects.filter(tenant=self.tenant, token=token).exists():
                return token
        # Fallback if 10 attempts all collide (astronomically unlikely)
        import uuid
        return str(uuid.uuid4())[:15].upper().replace("-", "")

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = self._generate_unique_token()
        if not self.expires_at and self.school_term_id:
            from datetime import datetime, time
            self.expires_at = timezone.make_aware(
                datetime.combine(self.school_term.end_date, time.max)
            )
        super().save(*args, **kwargs)

    def is_valid(self):
        return not self.is_used and timezone.now() <= self.expires_at

    def mark_as_used(self):
        self.is_used = True
        self.used_at = timezone.now()
        self.save()

    def time_until_expiry(self):
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

# ========================================
# BULK UPLOAD RECORD MODEL
# ========================================


class BulkUploadRecord(AbstractBulkUploadRecord):

    class Meta(AbstractBulkUploadRecord.Meta):
        verbose_name = "Student Bulk Upload Record"
        verbose_name_plural = "Student Bulk Upload Records"
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "uploaded_by"]),
        ]

    uploaded_by = models.ForeignKey(
        "users.CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_bulk_uploads",   # ← concrete related_name here
    )
