"""
Subject Models - BACKWARD COMPATIBLE VERSION
=============================================

This version maintains the old constants for backward compatibility
while adding the new models. This allows existing serializers and views
to continue working while we gradually migrate.

MIGRATION STRATEGY:
1. Deploy this version (has both old and new)
2. Update serializers to use new models
3. Remove old constants in final migration
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from tenants.models import TenantMixin


# ========================================
# BACKWARD COMPATIBILITY: Keep old constants temporarily
# These will be removed after serializers are updated
# ========================================

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


# ========================================
# NEW: SUBJECT CATEGORY MODEL
# ========================================
class SubjectCategory(TenantMixin, models.Model):
    """
    Configurable subject categories per tenant.
    Replaces hardcoded SUBJECT_CATEGORY_CHOICES.
    """

    name = models.CharField(
        max_length=100,
        help_text="Category name (e.g., 'Core Subject', 'Elective', 'Vocational')",
    )

    code = models.CharField(
        max_length=50,
        help_text="Unique code for this category (e.g., 'core', 'elective')",
    )

    description = models.TextField(blank=True, help_text="Description of this category")

    color_code = models.CharField(
        max_length=7,
        blank=True,
        null=True,
        help_text="Hex color code for UI display (e.g., '#FF5733')",
    )

    display_order = models.PositiveIntegerField(
        default=0, help_text="Order for displaying categories"
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]
        verbose_name = "Subject Category"
        verbose_name_plural = "Subject Categories"
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def subject_count(self):
        """Count of subjects in this category"""
        return self.subjects_new.filter(is_active=True).count()


# ========================================
# NEW: SUBJECT TYPE MODEL
# ========================================
class SubjectType(TenantMixin, models.Model):
    """
    Configurable subject types per tenant.
    Replaces SS_SUBJECT_TYPES for Senior Secondary classification.
    """

    name = models.CharField(
        max_length=100, help_text="Type name (e.g., 'Cross Cutting', 'Core Science')"
    )

    code = models.CharField(
        max_length=50,
        help_text="Unique code for this type (e.g., 'cross_cutting', 'core_science')",
    )

    description = models.TextField(
        blank=True, help_text="Description of this subject type"
    )

    applicable_levels = models.ManyToManyField(
        "classroom.GradeLevel",
        related_name="subject_types",
        blank=True,
        help_text="Education levels where this type applies",
    )

    is_cross_cutting = models.BooleanField(
        default=False, help_text="Whether subjects of this type apply to all streams"
    )

    display_order = models.PositiveIntegerField(
        default=0, help_text="Order for displaying types"
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]
        verbose_name = "Subject Type"
        verbose_name_plural = "Subject Types"
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def subject_count(self):
        """Count of subjects of this type"""
        return self.subjects_new.filter(is_active=True).count()


# ========================================
# UPDATED: SUBJECT MODEL (TRANSITION VERSION)
# ========================================
class Subject(TenantMixin, models.Model):
    """
    Subject model - TRANSITION VERSION
    Contains both old CharField fields and new ForeignKey fields.
    Old fields will be removed after migration is complete.
    """

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
        max_length=15, help_text="Subject code (e.g., MATH-NUR, ENG-PRI, PHY-SS)"
    )

    description = models.TextField(
        blank=True, help_text="Brief description of the subject content and objectives"
    )

    # ========================================
    # OLD FIELD: Keep for backward compatibility
    # Will be removed after migration
    # ========================================
    category = models.CharField(
        max_length=25,
        choices=SUBJECT_CATEGORY_CHOICES,
        default="core",
        help_text="Subject category for organization (DEPRECATED - use category_new)",
    )

    # ========================================
    # NEW FIELD: Use this going forward
    # ========================================
    category_new = models.ForeignKey(
        SubjectCategory,
        on_delete=models.PROTECT,
        related_name="subjects_new",
        null=True,
        blank=True,
        help_text="Subject category (new FK field)",
    )

    # ========================================
    # OLD FIELD: Keep for backward compatibility
    # ========================================
    education_levels = models.JSONField(
        default=list,
        help_text="Education levels this subject applies to (DEPRECATED - use grade_levels)",
    )

    nursery_levels = models.JSONField(
        default=list, blank=True, help_text="Specific nursery levels (DEPRECATED)"
    )

    # ========================================
    # NEW FIELD: Use this going forward
    # ========================================
    grade_levels = models.ManyToManyField(
        "classroom.GradeLevel",
        related_name="grade_subjects",
        blank=True,
        help_text="Grade levels where this subject is taught (new M2M field)",
    )

    # ========================================
    # OLD FIELD: Keep for backward compatibility
    # ========================================
    ss_subject_type = models.CharField(
        max_length=20,
        choices=SS_SUBJECT_TYPES,
        blank=True,
        null=True,
        help_text="Classification for Senior Secondary subjects (DEPRECATED - use subject_type_new)",
    )

    # ========================================
    # NEW FIELD: Use this going forward
    # ========================================
    subject_type_new = models.ForeignKey(
        SubjectType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subjects_new",
        help_text="Subject type classification (new FK field)",
    )

    # Legacy fields (keep these)
    is_cross_cutting = models.BooleanField(
        default=False,
        help_text="Whether this subject is cross-cutting across all streams",
    )

    default_stream_role = models.CharField(
        max_length=20,
        choices=[
            ("core", "Core Subjects"),
            ("elective", "Elective Subjects"),
            ("cross_cutting", "Cross-Cutting Subjects"),
        ],
        blank=True,
        null=True,
        help_text="Default role if not specifically configured by school",
    )

    parent_subject = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="component_subjects",
        help_text="Parent subject if this is a component subject",
    )

    prerequisites = models.ManyToManyField(
        "self",
        blank=True,
        symmetrical=False,
        related_name="unlocks_subjects",
        help_text="Subjects that must be completed before this one",
    )

    subject_order = models.PositiveIntegerField(
        default=0, help_text="Order for display in lists"
    )

    # New fields
    credit_hours = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=1.0,
        validators=[MinValueValidator(0.5), MaxValueValidator(10.0)],
        help_text="Credit hours for this subject",
    )

    passing_marks = models.PositiveIntegerField(
        default=40,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Minimum passing marks percentage",
    )

    max_marks = models.PositiveIntegerField(
        default=100,
        validators=[MinValueValidator(1), MaxValueValidator(1000)],
        help_text="Maximum marks for this subject",
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["subject_order", "name"]
        verbose_name = "Subject"
        verbose_name_plural = "Subjects"
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    def clean(self):
        """Custom validation"""

        # ── Tenant cross-contamination guards ──────────────────────────
        if self.category_new and self.tenant:
            if self.category_new.tenant != self.tenant:
                raise ValidationError(
                    "Subject category must belong to the same tenant as the subject."
                )

        if self.subject_type_new and self.tenant:
            if self.subject_type_new.tenant != self.tenant:
                raise ValidationError(
                    "Subject type must belong to the same tenant as the subject."
                )

        # ── Existing validation (keep as-is) ───────────────────────────
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
        # Don't run clean on save to avoid M2M issues
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        """Return display name - short name if available, otherwise full name"""
        return self.short_name or self.name

    @property
    def education_levels_display(self):
        """Return human-readable education levels"""
        # Try new field first
        if self.grade_levels.exists():
            levels = self.grade_levels.values_list(
                "education_level", flat=True
            ).distinct()
            level_names = []
            for level in levels:
                grade_level = self.grade_levels.filter(education_level=level).first()
                if grade_level:
                    level_names.append(grade_level.get_education_level_display())
            return ", ".join(level_names) if level_names else "No levels specified"

        # Fall back to old field
        if not self.education_levels:
            return "No levels specified"

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

        level_mapping = dict(NURSERY_LEVELS)
        display_levels = []
        for level_code in self.nursery_levels:
            display_name = level_mapping.get(level_code, level_code)
            display_levels.append(display_name)

        return ", ".join(display_levels)

    @property
    def is_nursery_subject(self):
        """Check if this is a nursery subject"""
        # Try new field first
        if self.grade_levels.exists():
            return self.grade_levels.filter(education_level="NURSERY").exists()
        # Fall back to old field
        return "NURSERY" in (self.education_levels or [])

    @property
    def is_primary_subject(self):
        """Check if this is a primary subject"""
        if self.grade_levels.exists():
            return self.grade_levels.filter(education_level="PRIMARY").exists()
        return "PRIMARY" in (self.education_levels or [])

    @property
    def is_junior_secondary_subject(self):
        """Check if this is a junior secondary subject"""
        if self.grade_levels.exists():
            return self.grade_levels.filter(education_level="JUNIOR_SECONDARY").exists()
        return "JUNIOR_SECONDARY" in (self.education_levels or [])

    @property
    def is_senior_secondary_subject(self):
        """Check if this is a senior secondary subject"""
        if self.grade_levels.exists():
            return self.grade_levels.filter(education_level="SENIOR_SECONDARY").exists()
        return "SENIOR_SECONDARY" in (self.education_levels or [])

    @classmethod
    def get_nursery_subjects(cls, tenant=None):
        """Get all nursery subjects"""
        queryset = cls.objects.filter(
            education_levels__contains=["NURSERY"], is_active=True
        )
        if tenant:
            queryset = queryset.filter(tenant=tenant)
        return queryset

    @classmethod
    def get_primary_subjects(cls, tenant=None):
        """Get all primary subjects"""
        queryset = cls.objects.filter(
            education_levels__contains=["PRIMARY"], is_active=True
        )
        if tenant:
            queryset = queryset.filter(tenant=tenant)
        return queryset

    @classmethod
    def get_junior_secondary_subjects(cls, tenant=None):
        """Get all junior secondary subjects"""
        queryset = cls.objects.filter(
            education_levels__contains=["JUNIOR_SECONDARY"], is_active=True
        )
        if tenant:
            queryset = queryset.filter(tenant=tenant)
        return queryset

    @classmethod
    def get_senior_secondary_subjects(cls, tenant=None):
        """Get all senior secondary subjects"""
        queryset = cls.objects.filter(
            education_levels__contains=["SENIOR_SECONDARY"], is_active=True
        )
        if tenant:
            queryset = queryset.filter(tenant=tenant)
        return queryset

    @classmethod
    def get_cross_cutting_subjects(cls, tenant=None):
        """Get cross-cutting subjects for Senior Secondary"""
        queryset = cls.objects.filter(
            education_levels__contains=["SENIOR_SECONDARY"],
            is_cross_cutting=True,
            is_active=True,
        )
        if tenant:
            queryset = queryset.filter(tenant=tenant)
        return queryset

    def get_dependent_subjects(self):
        """Get subjects that depend on this subject as a prerequisite"""
        return self.unlocks_subjects.filter(is_active=True)


# ========================================
# SUBJECT COMBINATION MODEL (NEW)
# ========================================
class SubjectCombination(TenantMixin, models.Model):
    """
    Predefined subject combinations that students can choose from.
    Examples: "Government for Arts", "Physics under Science", etc.
    """

    name = models.CharField(
        max_length=100,
        help_text="Combination name (e.g., 'Government Combination', 'Science with Physics')",
    )

    code = models.CharField(
        max_length=20,
        help_text="Unique code for this combination (e.g., 'GOV-ARTS', 'PHY-SCI')",
    )

    description = models.TextField(
        blank=True, help_text="Description of what this combination includes"
    )

    stream = models.ForeignKey(
        "classroom.Stream",
        on_delete=models.CASCADE,
        related_name="subject_combinations",
        help_text="Stream this combination belongs to",
    )

    # Subject selections for each role
    core_subjects = models.ManyToManyField(
        Subject,
        related_name="core_combinations",
        blank=True,
        help_text="Core subjects in this combination",
    )

    elective_subjects = models.ManyToManyField(
        Subject,
        related_name="elective_combinations",
        blank=True,
        help_text="Elective subjects in this combination",
    )

    cross_cutting_subjects = models.ManyToManyField(
        Subject,
        related_name="cross_cutting_combinations",
        blank=True,
        help_text="Cross-cutting subjects in this combination",
    )

    display_order = models.PositiveIntegerField(
        default=0, help_text="Order for displaying combinations"
    )

    is_active = models.BooleanField(
        default=True, help_text="Whether this combination is available for selection"
    )

    is_default = models.BooleanField(
        default=False,
        help_text="Whether this is the default combination for the stream",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["tenant", "stream", "code"]
        ordering = ["tenant", "stream", "display_order", "name"]
        verbose_name = "Subject Combination"
        verbose_name_plural = "Subject Combinations"

    def __str__(self):
        return f"{self.stream.name} - {self.name} ({self.code})"

    def clean(self):
        """Validate combination constraints"""
        # Check that subjects belong to appropriate stream configurations
        stream_configs = SchoolStreamConfiguration.objects.filter(
            tenant=self.tenant, stream=self.stream, is_active=True
        )

        # Validate core subjects
        if self.core_subjects.exists():
            core_config = stream_configs.filter(subject_role="core").first()
            if core_config:
                valid_core_ids = [
                    assignment.subject_id
                    for assignment in core_config.subject_assignments.filter(
                        is_active=True
                    )
                ]
                invalid_cores = self.core_subjects.exclude(id__in=valid_core_ids)
                if invalid_cores.exists():
                    raise ValidationError(
                        f"Core subjects {list(invalid_cores.values_list('name', flat=True))} "
                        "are not available in this stream's core configuration"
                    )

        # Validate elective subjects
        if self.elective_subjects.exists():
            elective_config = stream_configs.filter(subject_role="elective").first()
            if elective_config:
                valid_elective_ids = [
                    assignment.subject_id
                    for assignment in elective_config.subject_assignments.filter(
                        is_active=True
                    )
                ]
                invalid_electives = self.elective_subjects.exclude(
                    id__in=valid_elective_ids
                )
                if invalid_electives.exists():
                    raise ValidationError(
                        f"Elective subjects {list(invalid_electives.values_list('name', flat=True))} "
                        "are not available in this stream's elective configuration"
                    )

        # Validate cross-cutting subjects
        if self.cross_cutting_subjects.exists():
            cross_cutting_config = stream_configs.filter(
                subject_role="cross_cutting"
            ).first()
            if cross_cutting_config:
                valid_cross_cutting_ids = [
                    assignment.subject_id
                    for assignment in cross_cutting_config.subject_assignments.filter(
                        is_active=True
                    )
                ]
                invalid_cross_cutting = self.cross_cutting_subjects.exclude(
                    id__in=valid_cross_cutting_ids
                )
                if invalid_cross_cutting.exists():
                    raise ValidationError(
                        f"Cross-cutting subjects {list(invalid_cross_cutting.values_list('name', flat=True))} "
                        "are not available in this stream's cross-cutting configuration"
                    )

    @property
    def total_subjects(self):
        """Total number of subjects in this combination"""
        return (
            self.core_subjects.count()
            + self.elective_subjects.count()
            + self.cross_cutting_subjects.count()
        )


# ========================================
# STREAM CONFIGURATION MODELS (Keep as-is for now)
# ========================================
class SchoolStreamConfiguration(TenantMixin, models.Model):
    """Allows schools to configure their own stream subject structure"""

    stream = models.ForeignKey(
        "classroom.Stream",
        on_delete=models.CASCADE,
        related_name="school_configurations",
    )

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

    min_subjects_required = models.PositiveIntegerField(
        default=1, help_text="Minimum number of subjects required from this category"
    )

    max_subjects_allowed = models.PositiveIntegerField(
        default=5, help_text="Maximum number of subjects allowed from this category"
    )

    is_compulsory = models.BooleanField(
        default=True, help_text="Whether students must take subjects from this category"
    )

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
        school_name = self.tenant.name if self.tenant else "No Tenant"
        return f"{school_name} - {self.stream.name} - {self.get_subject_role_display()}"


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

    is_compulsory = models.BooleanField(
        default=False, help_text="Whether this specific subject is compulsory"
    )

    credit_weight = models.PositiveIntegerField(
        default=1, help_text="Credit weight for this subject in the stream"
    )

    prerequisites = models.ManyToManyField(
        Subject,
        blank=True,
        symmetrical=False,
        related_name="stream_assignment_prerequisites",
        help_text="Subjects that must be completed before this one",
    )

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
