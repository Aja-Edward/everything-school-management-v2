from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
import secrets
from users.models import CustomUser
from tenants.models import TenantMixin
import string
from .constants import GENDER_CHOICES, EDUCATION_LEVEL_CHOICES, CLASS_CHOICES


# ========================================
# NEW MODELS: EducationLevel, Class, Section
# ========================================


class EducationLevel(TenantMixin, models.Model):
    """Education level categories"""

    LEVEL_CHOICES = (
        ("NURSERY", "Nursery"),
        ("PRIMARY", "Primary"),
        ("JUNIOR_SECONDARY", "Junior Secondary"),
        ("SENIOR_SECONDARY", "Senior Secondary"),
    )

    name = models.CharField(max_length=50)
    code = models.CharField(max_length=20)
    level_type = models.CharField(max_length=20, choices=LEVEL_CHOICES)
    order = models.IntegerField(help_text="Order for sorting (0=earliest)")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order"]
        verbose_name = "Education Level"
        verbose_name_plural = "Education Levels"
        unique_together = ["tenant", "code"]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return self.name


class Class(TenantMixin, models.Model):
    """Represents a grade/class (e.g., Primary 1, SS 3)"""

    name = models.CharField(
        max_length=50, help_text="Display name (e.g., 'Primary 1', 'SS 3')"
    )
    code = models.CharField(
        max_length=20, help_text="Unique code (e.g., 'PRIMARY_1', 'SS_3')"
    )

    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="classes",
        help_text="Education level this class belongs to",
    )

    grade_number = models.IntegerField(help_text="Grade number (1, 2, 3, etc.)")

    order = models.IntegerField(
        help_text="Overall order for sorting (0=earliest)", unique=False
    )

    default_capacity = models.IntegerField(
        default=30,
        null=True,
        blank=True,
        help_text="Default capacity for sections of this class",
    )
    is_active = models.BooleanField(default=True)

    description = models.TextField(
        blank=True, null=True, help_text="Additional information about this class"
    )

    class Meta:
        ordering = ["order"]
        verbose_name = "Class"
        verbose_name_plural = "Classes"
        unique_together = ["tenant", "code"]
        indexes = [
            models.Index(fields=["tenant", "education_level", "order"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "code"]),
        ]

    def __str__(self):
        return self.name

    @property
    def full_name(self):
        return f"{self.education_level.name} - {self.name}"

    def get_student_count(self):
        return self.students.filter(is_active=True).count()

    def get_sections(self):
        return self.sections.filter(is_active=True)


class Section(TenantMixin, models.Model):
    """Represents a section within a class (e.g., 'A', 'B', 'C')"""

    class_grade = models.ForeignKey(
        Class,
        on_delete=models.CASCADE,
        related_name="sections",
        help_text="The class this section belongs to",
    )

    name = models.CharField(
        max_length=10,
        help_text="Section name (e.g., 'A', 'B', 'C', 'Gold', 'Diamond')",
    )

    room_number = models.CharField(
        max_length=20, blank=True, null=True, help_text="Room/classroom number"
    )

    capacity = models.IntegerField(
        null=True, blank=True, help_text="Maximum number of students in this section"
    )

    # ✅ FIXED: was 'teachers.Teacher' — use correct app label
    class_teacher = models.ForeignKey(
        "teacher.Teacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_sections",
        help_text="Primary teacher for this section",
    )

    # ✅ FIXED: was 'academics.AcademicYear' — use the correct model name
    academic_year = models.ForeignKey(
        "academics.AcademicSession",
        on_delete=models.CASCADE,
        related_name="sections",
        null=True,
        blank=True,
        help_text="Academic session for this section",
    )

    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["class_grade__order", "name"]
        verbose_name = "Section"
        verbose_name_plural = "Sections"
        unique_together = ["tenant", "class_grade", "name", "academic_year"]
        indexes = [
            models.Index(fields=["tenant", "class_grade", "is_active"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.class_grade.name} - {self.name}"

    @property
    def full_name(self):
        return f"{self.class_grade.name} {self.name}"

    def get_student_count(self):
        return self.students.filter(is_active=True).count()

    def is_full(self):
        if not self.capacity:
            return False
        return self.get_student_count() >= self.capacity

    def get_available_slots(self):
        if not self.capacity:
            return None
        return max(0, self.capacity - self.get_student_count())


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
        "Class",
        on_delete=models.PROTECT,
        related_name="students",
        help_text="Student's current class/grade",
        null=True,
        blank=True,
    )

    section = models.ForeignKey(
        "Section",
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

    is_active = models.BooleanField(
        default=True, help_text="Is the student currently active/registered?"
    )

    class Meta:
        ordering = ["student_class__order", "section__name", "user__first_name"]
        verbose_name = "Student"
        verbose_name_plural = "Students"
        unique_together = ["tenant", "registration_number"]
        indexes = [
            models.Index(fields=["tenant", "student_class", "section"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "student_class"]),
        ]

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
        """Returns education level type string from class FK"""
        if not self.student_class:
            return None
        return self.student_class.education_level.level_type

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
        if (
            self.section
            and self.student_class
            and self.section.class_grade != self.student_class
        ):
            raise ValueError(
                f"Section {self.section} does not belong to class {self.student_class}"
            )
        super().save(*args, **kwargs)


# ========================================
# RESULT CHECK TOKEN MODEL
# ========================================

User = get_user_model()


class ResultCheckToken(TenantMixin, models.Model):
    """Token for result portal access - one per student per term"""

    student = models.ForeignKey(
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
            self.token = self.generate_readable_token()
        if not self.expires_at and self.school_term:
            from datetime import datetime, time

            self.expires_at = timezone.make_aware(
                datetime.combine(self.school_term.end_date, time.max)
            )
        super().save(*args, **kwargs)

    @staticmethod
    def generate_readable_token():
        """Generate human-readable token in format: ABC-123-XYZ-456"""
        chars = string.ascii_uppercase + string.digits
        parts = []
        for _ in range(4):
            part = "".join(secrets.choice(chars) for _ in range(3))
            parts.append(part)

        token = "-".join(parts)

        for _ in range(10):
            if not ResultCheckToken.objects.filter(token=token).exists():
                return token
            parts = ["".join(secrets.choice(chars) for _ in range(3)) for _ in range(4)]
            token = "-".join(parts)

        import uuid

        return str(uuid.uuid4())[:15].upper().replace("-", "")

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
