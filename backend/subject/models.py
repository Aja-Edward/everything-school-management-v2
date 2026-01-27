from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from tenants.models import TenantMixin


# Updated subject categories to match your school structure
SUBJECT_CATEGORY_CHOICES = [
    ("core", "Core Subject"),
    ("elective", "Elective Subject"),
    ("cross_cutting", "Cross Cutting Subject"),
    ("core_science", "Core Science"),
    ("core_art", "Core Art"),
    ("core_humanities", "Core Humanities"),
    ("vocational", "Vocational/Pre-vocational"),
    ("creative_arts", "Cultural & Creative Arts"),
    ("religious", "Religious Studies"),
    ("physical", "Physical & Health Education"),
    ("language", "Language"),
    ("practical", "Practical/Skills"),
    ("nursery_activities", "Nursery Activities"),
]

# Education levels matching your school structure
EDUCATION_LEVELS = [
    ("NURSERY", "Nursery"),
    ("PRIMARY", "Primary"),
    ("JUNIOR_SECONDARY", "Junior Secondary"),
    ("SENIOR_SECONDARY", "Senior Secondary"),
]

# Nursery sub-levels
NURSERY_LEVELS = [
    ("PRE_NURSERY", "Pre-Nursery"),
    ("NURSERY_1", "Nursery 1"),
    ("NURSERY_2", "Nursery 2"),
]

# Subject classification for Senior Secondary
SS_SUBJECT_TYPES = [
    ("cross_cutting", "Cross Cutting"),
    ("core_science", "Core Science"),
    ("core_art", "Core Art"),
    ("core_humanities", "Core Humanities"),
    ("elective", "Elective"),
]


# Subject model must be defined first since other models reference it
class Subject(TenantMixin, models.Model):
    """Enhanced Subject model with flexible stream configuration"""

    name = models.CharField(
        max_length=100,
        help_text="Full subject name (e.g., 'Basic Science and Technology')",
    )

    short_name = models.CharField(
        max_length=50,
        blank=True,
        help_text="Abbreviated name for display (e.g., 'Basic Science')",
    )

    code = models.CharField(
        max_length=15,
        help_text="Subject code (e.g., MATH-NUR, ENG-PRI, PHY-SS)",
    )

    description = models.TextField(
        blank=True, help_text="Brief description of the subject content and objectives"
    )

    # Category and classification
    category = models.CharField(
        max_length=25,
        choices=SUBJECT_CATEGORY_CHOICES,
        default="core",
        help_text="Subject category for organization",
    )

    # Education level compatibility - Updated for your structure
    education_levels = models.JSONField(
        default=list,
        help_text="Education levels this subject applies to (NURSERY, PRIMARY, JUNIOR_SECONDARY, SENIOR_SECONDARY)",
    )

    # Nursery specific levels
    nursery_levels = models.JSONField(
        default=list,
        blank=True,
        help_text="Specific nursery levels (PRE_NURSERY, NURSERY_1, NURSERY_2)",
    )

    # Senior Secondary classification
    ss_subject_type = models.CharField(
        max_length=20,
        choices=SS_SUBJECT_TYPES,
        blank=True,
        null=True,
        help_text="Classification for Senior Secondary subjects",
    )

    # Add new fields for flexible configuration
    # Note: This field is kept for backward compatibility but the new system
    # uses SchoolStreamConfiguration for flexible stream management
    is_cross_cutting = models.BooleanField(
        default=False,
        help_text="Whether this subject is cross-cutting across all streams (legacy field)",
    )

    # Note: This field is kept for backward compatibility but the new system
    # uses SchoolStreamConfiguration for flexible stream management
    default_stream_role = models.CharField(
        max_length=20,
        choices=[
            ("core", "Core Subjects"),
            ("elective", "Elective Subjects"),
            ("cross_cutting", "Cross-Cutting Subjects"),
        ],
        blank=True,
        null=True,
        help_text="Default role if not specifically configured by school (legacy field)",
    )

    # Integration with GradeLevel model
    grade_levels = models.ManyToManyField(
        "classroom.GradeLevel",
        related_name="subjects",
        blank=True,
        help_text="Specific grade levels where this subject is taught",
    )

    # Parent subject for component subjects (e.g., Basic Science is a component of Basic Science and Technology)
    parent_subject = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="component_subjects",
        help_text="Parent subject if this is a component subject",
    )

    # Prerequisites for this subject
    prerequisites = models.ManyToManyField(
        "self",
        blank=True,
        symmetrical=False,
        related_name="unlocks_subjects",
        help_text="Subjects that must be completed before this one",
    )

    # Subject order for display
    subject_order = models.PositiveIntegerField(
        default=0,
        help_text="Order for display in lists",
    )

    # Whether the subject is active
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["education_levels", "category", "subject_order", "name"]
        verbose_name = "Subject"
        verbose_name_plural = "Subjects"
        unique_together = ["tenant", "code"]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def clean(self):
        """Custom validation"""
        if self.education_levels:
            valid_levels = [choice[0] for choice in EDUCATION_LEVELS]
            for level in self.education_levels:
                if level not in valid_levels:
                    raise ValidationError(f"Invalid education level: {level}")

        if self.nursery_levels and "NURSERY" not in self.education_levels:
            raise ValidationError(
                "Nursery levels can only be set for NURSERY education level"
            )

        if self.ss_subject_type and "SENIOR_SECONDARY" not in self.education_levels:
            raise ValidationError(
                "SS subject type can only be set for SENIOR_SECONDARY education level"
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def education_levels_display(self):
        """Return human-readable education levels"""
        if not self.education_levels:
            return "No levels specified"

        # Create a mapping of education level codes to display names
        level_mapping = dict(EDUCATION_LEVELS)

        display_levels = []
        for level_code in self.education_levels:
            display_name = level_mapping.get(level_code, level_code)
            display_levels.append(display_name)

        return ", ".join(display_levels)

    @property
    def nursery_levels_display(self):
        """Return human-readable nursery levels"""
        if not self.nursery_levels:
            return "Not applicable"

        # Create a mapping of nursery level codes to display names
        level_mapping = dict(NURSERY_LEVELS)

        display_levels = []
        for level_code in self.nursery_levels:
            display_name = level_mapping.get(level_code, level_code)
            display_levels.append(display_name)

        return ", ".join(display_levels)

    @property
    def display_name(self):
        """Return display name - short name if available, otherwise full name"""
        return self.short_name or self.name

    @property
    def is_nursery_subject(self):
        """Check if this is a nursery subject"""
        return "NURSERY" in (self.education_levels or [])

    @property
    def is_primary_subject(self):
        """Check if this is a primary subject"""
        return "PRIMARY" in (self.education_levels or [])

    @property
    def is_junior_secondary_subject(self):
        """Check if this is a junior secondary subject"""
        return "JUNIOR_SECONDARY" in (self.education_levels or [])

    @property
    def is_senior_secondary_subject(self):
        """Check if this is a senior secondary subject"""
        return "SENIOR_SECONDARY" in (self.education_levels or [])

    @classmethod
    def get_nursery_subjects(cls):
        """Get all nursery subjects"""
        return cls.objects.filter(
            education_levels__contains=["NURSERY"], is_active=True
        )

    @classmethod
    def get_primary_subjects(cls):
        """Get all primary subjects"""
        return cls.objects.filter(
            education_levels__contains=["PRIMARY"], is_active=True
        )

    @classmethod
    def get_junior_secondary_subjects(cls):
        """Get all junior secondary subjects"""
        return cls.objects.filter(
            education_levels__contains=["JUNIOR_SECONDARY"], is_active=True
        )

    @classmethod
    def get_senior_secondary_subjects(cls):
        """Get all senior secondary subjects"""
        return cls.objects.filter(
            education_levels__contains=["SENIOR_SECONDARY"], is_active=True
        )

    @classmethod
    def get_cross_cutting_subjects(cls):
        """Get cross-cutting subjects for Senior Secondary"""
        return cls.objects.filter(
            education_levels__contains=["SENIOR_SECONDARY"],
            is_cross_cutting=True,
            is_active=True,
        )

    def get_dependent_subjects(self):
        """Get subjects that depend on this subject as a prerequisite"""
        return self.unlocks_subjects.filter(is_active=True)


# New model for school-specific stream configurations
class SchoolStreamConfiguration(TenantMixin, models.Model):
    """Allows schools to configure their own stream subject structure"""

    stream = models.ForeignKey(
        "classroom.Stream",  # Using the existing Stream model from classroom app
        on_delete=models.CASCADE,
        related_name="school_configurations",
    )

    # Subject categorization within this stream
    CORE_SUBJECTS = "core"
    ELECTIVE_SUBJECTS = "elective"
    CROSS_CUTTING_SUBJECTS = "cross_cutting"

    SUBJECT_ROLE_CHOICES = [
        (CORE_SUBJECTS, "Core Subjects"),
        (ELECTIVE_SUBJECTS, "Elective Subjects"),
        (CROSS_CUTTING_SUBJECTS, "Cross-Cutting Subjects"),
    ]

    subject_role = models.CharField(
        max_length=20,
        choices=SUBJECT_ROLE_CHOICES,
        help_text="Role of subjects in this stream",
    )

    # Minimum and maximum subjects required
    min_subjects_required = models.PositiveIntegerField(
        default=1, help_text="Minimum number of subjects required from this category"
    )

    max_subjects_allowed = models.PositiveIntegerField(
        default=5, help_text="Maximum number of subjects allowed from this category"
    )

    # Whether this category is compulsory for the stream
    is_compulsory = models.BooleanField(
        default=True, help_text="Whether students must take subjects from this category"
    )

    # Priority/order for display
    display_order = models.PositiveIntegerField(
        default=0, help_text="Display order for this configuration"
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["tenant", "stream", "subject_role"]
        ordering = ["tenant", "stream", "display_order"]
        verbose_name = "School Stream Configuration"
        verbose_name_plural = "School Stream Configurations"

    def __str__(self):
        tenant_name = self.tenant.name if self.tenant else "No Tenant"
        return f"{tenant_name} - {self.stream.name} - {self.get_subject_role_display()}"


class SchoolStreamSubjectAssignment(TenantMixin, models.Model):
    """Links specific subjects to school stream configurations"""

    stream_config = models.ForeignKey(
        SchoolStreamConfiguration,
        on_delete=models.CASCADE,
        related_name="subject_assignments",
    )

    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="stream_assignments"
    )

    # Whether this subject is compulsory within the category
    is_compulsory = models.BooleanField(
        default=False, help_text="Whether this specific subject is compulsory"
    )

    # Credit weight for the subject
    credit_weight = models.PositiveIntegerField(
        default=1, help_text="Credit weight for this subject in the stream"
    )

    # Prerequisites (if any)
    prerequisites = models.ManyToManyField(
        Subject,
        blank=True,
        symmetrical=False,
        related_name="stream_assignment_prerequisites",
        help_text="Subjects that must be completed before this one",
    )

    # Whether this subject can be taken as an elective in other streams
    can_be_elective_elsewhere = models.BooleanField(
        default=True,
        help_text="Whether this subject can be taken as elective in other streams",
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["stream_config", "subject"]
        ordering = ["stream_config", "subject__name"]
        verbose_name = "Stream Subject Assignment"
        verbose_name_plural = "Stream Subject Assignments"

    def __str__(self):
        return f"{self.stream_config} - {self.subject.name}"
