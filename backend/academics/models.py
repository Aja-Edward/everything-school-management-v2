# academics/models.py
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import date

from subject.models import Subject
from tenants.models import TenantMixin
from .constant import DEFAULT_EDUCATION_LEVELS


# ==============================================================================
# NEW FK MODELS — Replace CharField choices
# ==============================================================================


class TermType(TenantMixin, models.Model):
    """
    Term Type model — REPLACES Term.name TERM_CHOICES CharField.
    Examples: First Term, Second Term, Third Term
    Stored per-tenant so schools can define their own term structure
    (e.g. Semester 1 / Semester 2 for universities).
    """

    name = models.CharField(
        max_length=100,
        help_text="Display name (e.g. 'First Term', 'Semester 1')",
    )
    code = models.CharField(
        max_length=50,
        help_text="Unique code (e.g. 'first', 'second', 'third')",
    )
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Order in which terms appear (1 = first, 2 = second, …)",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academics_term_type"
        ordering = ["display_order", "name"]
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return self.name


class CalendarEventType(TenantMixin, models.Model):
    """
    Calendar Event Type model — REPLACES AcademicCalendar.event_type EVENT_TYPES CharField.
    Examples: Term Start, Holiday, Exam, Graduation, etc.
    """

    name = models.CharField(
        max_length=100,
        help_text="Display name (e.g. 'Term Start', 'Holiday')",
    )
    code = models.CharField(
        max_length=50,
        help_text="Unique code (e.g. 'term_start', 'holiday', 'exam')",
    )
    description = models.TextField(blank=True)

    # UI hint
    color_code = models.CharField(
        max_length=7,
        blank=True,
        help_text="Hex color for calendar UI (e.g. '#4CAF50')",
    )
    icon = models.CharField(
        max_length=50,
        blank=True,
        help_text="Optional icon identifier for the UI",
    )

    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academics_calendar_event_type"
        ordering = ["display_order", "name"]
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return self.name

class EducationLevel(TenantMixin, models.Model):
    """
    Configurable Education Level per tenant.

    Default levels (e.g. Nursery, Primary, JSS, SSS) are seeded,
    but tenants are free to modify or create theirs.
    """

    # Optional soft classification (NOT enforced by choices)
    level_type = models.CharField(
        max_length=30,
        blank=True,
        help_text="Optional category (e.g. NURSERY, PRIMARY, JSS, SSS)",
    )

    name = models.CharField(
        max_length=100,
        help_text="Display name (e.g. 'Primary', 'Junior Secondary')",
    )

    code = models.CharField(
        max_length=50,
        help_text="Unique identifier per tenant (e.g. 'primary', 'jss')",
    )

    description = models.TextField(
        blank=True,
        help_text="Optional description of this education level",
    )

    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Controls ordering (lower comes first)",
    )

    is_active = models.BooleanField(default=True)

    # Track whether this came from system defaults
    is_system_default = models.BooleanField(
        default=False,
        help_text="Indicates if this was auto-created as a default",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academics_education_level"
        ordering = ["display_order", "name"]
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return self.name


# ==============================================================================
# EXISTING MODELS — Updated with FK fields
# ==============================================================================

class AcademicSession(TenantMixin, models.Model):
    """Academic year/session model"""

    name = models.CharField(max_length=50)  # e.g., "2024/2025"
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academics_session"
        ordering = ["-start_date"]
        verbose_name = "Academic Session"
        verbose_name_plural = "Academic Sessions"
        unique_together = ["tenant", "name"]

    def __str__(self):
        return self.name

    def clean(self):
        if self.start_date >= self.end_date:
            raise ValidationError("Start date must be before end date")

        if self.is_current:
            current_sessions = AcademicSession.objects.filter(
                tenant=self.tenant, is_current=True
            )
            if self.pk:
                current_sessions = current_sessions.exclude(pk=self.pk)
            if current_sessions.exists():
                raise ValidationError(
                    "Only one academic session can be current at a time"
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def is_ongoing(self):
        today = date.today()
        return self.start_date <= today <= self.end_date


class Term(TenantMixin, models.Model):
    """
    Academic term model.
    UPDATED: term_type is now a FK to TermType (replaces old name CharField with
    TERM_CHOICES). The original `name` field is kept as a property alias so
    existing code that reads term.name still works without changes.
    """

    # UPDATED: FK replaces TERM_CHOICES CharField
    term_type = models.ForeignKey(
        TermType, on_delete=models.CASCADE, null=True, blank=True
    )

    academic_session = models.ForeignKey(
        "academics.AcademicSession",
        on_delete=models.CASCADE,
        related_name="terms",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    next_term_begins = models.DateField(null=True, blank=True)
    holidays_start = models.DateField(null=True, blank=True)
    holidays_end = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academics_term"
        # UPDATED: unique_together now uses term_type FK
        unique_together = ["tenant", "academic_session", "term_type"]
        ordering = ["academic_session", "term_type__display_order"]
        verbose_name = "Academic Term"
        verbose_name_plural = "Academic Terms"

    def __str__(self):
        term_name = self.term_type.name if self.term_type else "Unknown"
        session_name = (
            self.academic_session.name if self.academic_session else "Unknown"
        )
        return f"{term_name} - {session_name}"

    # ------------------------------------------------------------------
    # Backward-compatibility property so existing code using term.name
    # or term.get_name_display() continues to work unchanged.
    # ------------------------------------------------------------------
    @property
    def name(self):
        """Alias for term_type.name — keeps old CharField interface intact."""
        return self.term_type.name if self.term_type else ""

    def get_name_display(self):
        """Mimics the old CharField get_FOO_display() method."""
        return self.term_type.name if self.term_type else ""

    def clean(self):
        if self.start_date >= self.end_date:
            raise ValidationError("Start date must be before end date")

        if self.academic_session:
            if (
                self.start_date < self.academic_session.start_date
                or self.end_date > self.academic_session.end_date
            ):
                raise ValidationError(
                    "Term dates must be within academic session dates"
                )

        if self.is_current and self.academic_session:
            current_terms = Term.objects.filter(
                tenant=self.tenant,
                academic_session=self.academic_session,
                is_current=True,
            )
            if self.pk:
                current_terms = current_terms.exclude(pk=self.pk)
            if current_terms.exists():
                raise ValidationError(
                    "Only one term can be current per academic session"
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def is_ongoing(self):
        today = date.today()
        return self.start_date <= today <= self.end_date


class SubjectAllocation(TenantMixin, models.Model):
    """
    Subject allocation to teachers and classes.
    UPDATED: education_level is now a FK to EducationLevel (replaces CharField).
    student_class CharField is retained — it holds a free-text class name or
    identifier; FK to GradeLevel is handled at the classroom/grade level app.
    """

    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="allocations"
    )
    teacher = models.ForeignKey(
        "teacher.Teacher",
        on_delete=models.CASCADE,
        related_name="subject_allocations",
    )
    academic_session = models.ForeignKey(
        "academics.AcademicSession",
        on_delete=models.CASCADE,
        related_name="subject_allocations",
    )

    # UPDATED: FK replaces education_level CharField
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="subject_allocations",
        help_text="Education level this allocation belongs to",
    )

    # student_class kept as CharField — it stores a human label
    # (e.g. "JSS 1A") that does not require a separate lookup table.
    student_class = models.CharField(max_length=50)

    periods_per_week = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "academics_subject_allocation"
        unique_together = [
            "tenant",
            "subject",
            "teacher",
            "academic_session",
            "education_level",
            "student_class",
        ]
        ordering = ["academic_session", "education_level", "student_class", "subject"]
        verbose_name = "Subject Allocation"
        verbose_name_plural = "Subject Allocations"

    def __str__(self):
        level_name = self.education_level.name if self.education_level else ""
        return (
            f"{self.subject.name} - {self.teacher.user.full_name} "
            f"({level_name} / {self.student_class})"
        )


class Curriculum(TenantMixin, models.Model):
    """
    Curriculum structure for different education levels.
    UPDATED: education_level is now a FK to EducationLevel (replaces CharField).
    """

    name = models.CharField(max_length=100)

    # UPDATED: FK replaces education_level CharField
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="curricula",
        help_text="Education level this curriculum is designed for",
    )

    academic_session = models.ForeignKey(
        "academics.AcademicSession",
        on_delete=models.CASCADE,
        related_name="curricula",
    )
    subjects = models.ManyToManyField(
        Subject, through="CurriculumSubject", related_name="curricula"
    )

    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academics_curriculum"
        # UPDATED: unique_together now uses education_level FK
        unique_together = ["tenant", "name", "education_level", "academic_session"]
        ordering = ["education_level", "name"]
        verbose_name = "Curriculum"
        verbose_name_plural = "Curricula"

    def __str__(self):
        level_name = self.education_level.name if self.education_level else ""
        session_name = self.academic_session.name if self.academic_session else ""
        return f"{self.name} - {level_name} ({session_name})"


class CurriculumSubject(TenantMixin, models.Model):
    """Through model for Curriculum-Subject relationship — unchanged"""

    curriculum = models.ForeignKey(
        Curriculum,
        on_delete=models.CASCADE,
        related_name="curriculum_subjects",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="curriculum_subjects",
    )

    is_compulsory = models.BooleanField(default=True)
    minimum_score = models.DecimalField(max_digits=5, decimal_places=2, default=40.00)
    maximum_score = models.DecimalField(max_digits=5, decimal_places=2, default=100.00)
    weight_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100.00,
        help_text="Weight in overall computation",
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "academics_curriculum_subject"
        unique_together = ["tenant", "curriculum", "subject"]
        ordering = ["curriculum", "order", "subject__name"]

    def __str__(self):
        return f"{self.curriculum.name} - {self.subject.name}"


class AcademicCalendar(TenantMixin, models.Model):
    """
    Academic calendar events.
    UPDATED: event_type is now a FK to CalendarEventType (replaces EVENT_TYPES CharField).
    """

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # UPDATED: FK replaces EVENT_TYPES CharField
    event_type = models.ForeignKey(
        CalendarEventType,
        on_delete=models.PROTECT,
        related_name="calendar_events",
        help_text="Type of calendar event",
    )

    academic_session = models.ForeignKey(
        "academics.AcademicSession",
        on_delete=models.CASCADE,
        related_name="calendar_events",
    )
    term = models.ForeignKey(
        Term,
        on_delete=models.CASCADE,
        related_name="calendar_events",
        null=True,
        blank=True,
    )

    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    location = models.CharField(max_length=200, blank=True)
    is_public = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "academics_calendar"
        ordering = ["start_date", "start_time"]
        verbose_name = "Academic Calendar Event"
        verbose_name_plural = "Academic Calendar Events"

    def __str__(self):
        return f"{self.title} - {self.start_date}"

    def clean(self):
        if self.end_date and self.start_date > self.end_date:
            raise ValidationError("Start date must be before or equal to end date")

        if (
            self.start_time
            and self.end_time
            and self.end_date == self.start_date
            and self.start_time >= self.end_time
        ):
            raise ValidationError(
                "Start time must be before end time for same-day events"
            )
