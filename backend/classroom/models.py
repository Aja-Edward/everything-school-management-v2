"""
Classroom Models - BACKWARD COMPATIBLE VERSION
===============================================

This version maintains old fields for backward compatibility
while adding new models and fields.
"""

from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.utils import timezone
from academics.models import AcademicSession, Term
from tenants.models import TenantMixin


def get_current_date():
    """Get current date for default values"""
    return timezone.now().date()


# ========================================
# BACKWARD COMPATIBILITY: Keep old choices
# ========================================
STREAM_CHOICES = [
    ("SCIENCE", "Science"),
    ("ARTS", "Arts"),
    ("COMMERCIAL", "Commercial"),
    ("TECHNICAL", "Technical"),
]


# ========================================
# EXISTING: GRADE LEVEL MODEL (No changes)
# ========================================
class GradeLevel(TenantMixin, models.Model):
    """Educational grade levels (Nursery, Primary, Secondary)"""

    EDUCATION_LEVELS = [
        ("NURSERY", "Nursery"),
        ("PRIMARY", "Primary"),
        ("JUNIOR_SECONDARY", "Junior Secondary"),
        ("SENIOR_SECONDARY", "Senior Secondary"),
    ]

    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    education_level = models.CharField(max_length=20, choices=EDUCATION_LEVELS)
    order = models.PositiveIntegerField(
        help_text="Order of grade level (e.g., 1 for Grade 1)"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "classroom_gradelevely"
        ordering = ["education_level", "order"]
        unique_together = ["tenant", "education_level", "order"]
        indexes = [
            models.Index(fields=["tenant", "education_level"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return self.name


# ========================================
# EXISTING: SECTION MODEL (No changes)
# ========================================
class Section(TenantMixin, models.Model):
    """Class sections within a grade level"""

    name = models.CharField(max_length=50)
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.CASCADE, related_name="sections"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["tenant", "grade_level", "name"]
        ordering = ["grade_level", "name"]
        indexes = [
            models.Index(fields=["tenant", "grade_level"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.grade_level.name} - Section {self.name}"


# ========================================
# NEW: STREAM TYPE MODEL
# ========================================
class StreamType(TenantMixin, models.Model):
    """
    Configurable stream types per tenant.
    Replaces hardcoded STREAM_CHOICES.
    """

    name = models.CharField(
        max_length=100,
        help_text="Stream type name (e.g., 'Science', 'Arts', 'Commercial')",
    )

    code = models.CharField(
        max_length=20,
        help_text="Unique code for this stream type (e.g., 'SCIENCE', 'ARTS')",
    )

    description = models.TextField(
        blank=True, help_text="Description of this stream type and its focus areas"
    )

    color_code = models.CharField(
        max_length=7,
        blank=True,
        null=True,
        help_text="Hex color code for UI display (e.g., '#4CAF50')",
    )

    applicable_levels = models.ManyToManyField(
        GradeLevel,
        related_name="stream_types",
        blank=True,
        help_text="Education levels where this stream type is available",
    )

    display_order = models.PositiveIntegerField(
        default=0, help_text="Order for displaying stream types"
    )

    requires_entrance_exam = models.BooleanField(
        default=False, help_text="Whether this stream requires an entrance exam"
    )

    min_grade_requirement = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Minimum grade percentage required to join this stream",
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]
        verbose_name = "Stream Type"
        verbose_name_plural = "Stream Types"
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def stream_count(self):
        """Count of active streams of this type"""
        return self.streams_new.filter(is_active=True).count()


# ========================================
# UPDATED: STREAM MODEL (TRANSITION VERSION)
# ========================================
class Stream(TenantMixin, models.Model):
    """
    Stream model - TRANSITION VERSION
    Contains both old CharField and new ForeignKey fields.
    """

    name = models.CharField(max_length=50)
    code = models.CharField(max_length=10)

    # ========================================
    # OLD FIELD: Keep for backward compatibility
    # ========================================
    stream_type = models.CharField(
        max_length=20,
        choices=STREAM_CHOICES,
        help_text="Stream type (DEPRECATED - use stream_type_new)",
    )

    # ========================================
    # NEW FIELD: Use this going forward
    # ========================================
    stream_type_new = models.ForeignKey(
        StreamType,
        on_delete=models.PROTECT,
        related_name="streams_new",
        null=True,
        blank=True,
        help_text="Type of stream (new FK field)",
    )

    # New fields
    grade_level = models.ForeignKey(
        GradeLevel,
        on_delete=models.PROTECT,
        related_name="streams",
        null=True,
        blank=True,
        help_text="Grade level this stream is for",
    )

    academic_session = models.ForeignKey(
        "academics.AcademicSession",
        on_delete=models.CASCADE,
        related_name="streams",
        null=True,
        blank=True,
        help_text="Academic session for this stream",
    )

    description = models.TextField(blank=True)

    max_capacity = models.PositiveIntegerField(
        default=40,
        validators=[MinValueValidator(1), MaxValueValidator(200)],
        help_text="Maximum number of students in this stream",
    )

    stream_coordinator = models.ForeignKey(
        "teacher.Teacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="coordinated_streams",
        help_text="Teacher coordinating this stream",
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        unique_together = [("tenant", "code")]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        # Try new field first, fall back to old
        if self.stream_type_new:
            return f"{self.name} - {self.stream_type_new.name}"
        return f"{self.name} ({self.get_stream_type_display()})"

    @property
    def current_enrollment(self):
        """Get current number of enrolled students"""
        from students.models import Student

        return Student.objects.filter(stream=self, is_active=True).count()

    @property
    def is_full(self):
        """Check if stream is at capacity"""
        return self.current_enrollment >= self.max_capacity

    @property
    def available_spots(self):
        """Get number of available spots"""
        return max(0, self.max_capacity - self.current_enrollment)

    @property
    def enrollment_percentage(self):
        """Get enrollment as percentage of capacity"""
        if self.max_capacity == 0:
            return 0
        return (self.current_enrollment / self.max_capacity) * 100


# ========================================
# UPDATED: CLASSROOM MODEL
# ========================================
class Classroom(TenantMixin, models.Model):
    """Main classroom model linking all components"""

    name = models.CharField(max_length=100)

    section = models.ForeignKey(
        Section, on_delete=models.CASCADE, related_name="classrooms"
    )

    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="classrooms",
        help_text="Academic session this classroom belongs to",
    )

    term = models.ForeignKey(
        Term,
        on_delete=models.CASCADE,
        related_name="classrooms",
        help_text="Term within the academic session",
    )

    # New: Optional stream for Senior Secondary classrooms
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="classrooms",
        help_text="Stream for Senior Secondary classrooms",
    )

    # Teacher assignments
    class_teacher = models.ForeignKey(
        "teacher.Teacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="primary_classes",
        help_text="Main class teacher",
    )

    subject_teachers = models.ManyToManyField(
        "teacher.Teacher",
        through="ClassroomTeacherAssignment",
        related_name="assigned_classes",
    )

    # Nursery & Primary subjects linked directly to the classroom
    subjects = models.ManyToManyField(
        "subject.Subject",
        related_name="classrooms",
        blank=True,
        help_text="Subjects taught in this classroom (mainly for Nursery & Primary)",
    )

    # Students
    students = models.ManyToManyField(
        "students.Student", through="StudentEnrollment", related_name="enrolled_classes"
    )

    # Classroom details
    room_number = models.CharField(max_length=20, blank=True)

    max_capacity = models.PositiveIntegerField(
        default=30, validators=[MinValueValidator(1), MaxValueValidator(100)]
    )

    # Status
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("tenant", "section", "academic_session", "term", "name")]
        ordering = ["section__grade_level", "section__name", "academic_session"]
        indexes = [
            models.Index(fields=["tenant", "section"]),
            models.Index(fields=["tenant", "academic_session", "term"]),
            models.Index(fields=["tenant", "stream"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    @property
    def education_level(self):
        return self.section.grade_level.education_level

    def __str__(self):
        stream_info = f" - {self.stream.name}" if self.stream else ""
        return f"{self.section} - {self.academic_session.name} ({self.term.get_name_display()}){stream_info}"

    @property
    def current_enrollment(self):
        return self.studentenrollment_set.filter(
            is_active=True, student__is_active=True
        ).count()

    @property
    def is_full(self):
        return self.current_enrollment >= self.max_capacity

    @property
    def available_spots(self):
        return max(0, self.max_capacity - self.current_enrollment)


# ========================================
# EXISTING MODELS (No changes)
# ========================================
class ClassroomTeacherAssignment(TenantMixin, models.Model):
    """Teacher assignment to classroom for specific subjects"""

    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE)

    teacher = models.ForeignKey(
        "teacher.Teacher",
        on_delete=models.CASCADE,
        related_name="classroom_assignments",
    )

    subject = models.ForeignKey("subject.Subject", on_delete=models.CASCADE)

    is_primary_teacher = models.BooleanField(
        default=False,
        help_text="Whether this teacher is the primary teacher for this subject in this classroom",
    )

    periods_per_week = models.PositiveIntegerField(
        default=1, help_text="Number of periods per week for this subject"
    )

    assigned_date = models.DateField(default=get_current_date)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["classroom", "subject"]
        ordering = ["classroom", "subject"]
        indexes = [
            models.Index(fields=["tenant", "classroom"]),
            models.Index(fields=["tenant", "teacher"]),
            models.Index(fields=["tenant", "subject"]),
        ]

    def __str__(self):
        return f"{self.teacher} - {self.subject} ({self.classroom})"


class StudentEnrollment(TenantMixin, models.Model):
    """Student enrollment in classroom"""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE)

    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE)

    enrollment_date = models.DateField(default=get_current_date)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["student", "classroom"]
        ordering = [
            "classroom",
            "student__user__first_name",
            "student__user__last_name",
        ]
        indexes = [
            models.Index(fields=["tenant", "student"]),
            models.Index(fields=["tenant", "classroom"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return f"{self.student} enrolled in {self.classroom}"


class ClassSchedule(TenantMixin, models.Model):
    """Class schedule/timetable"""

    DAYS_OF_WEEK = [
        ("MONDAY", "Monday"),
        ("TUESDAY", "Tuesday"),
        ("WEDNESDAY", "Wednesday"),
        ("THURSDAY", "Thursday"),
        ("FRIDAY", "Friday"),
        ("SATURDAY", "Saturday"),
    ]

    classroom = models.ForeignKey(
        Classroom, on_delete=models.CASCADE, related_name="schedules"
    )

    subject = models.ForeignKey("subject.Subject", on_delete=models.CASCADE)

    teacher = models.ForeignKey("teacher.Teacher", on_delete=models.CASCADE)

    day_of_week = models.CharField(max_length=10, choices=DAYS_OF_WEEK)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["classroom", "day_of_week", "start_time"]
        ordering = ["classroom", "day_of_week", "start_time"]
        indexes = [
            models.Index(fields=["tenant", "classroom"]),
            models.Index(fields=["tenant", "teacher"]),
            models.Index(fields=["day_of_week", "start_time"]),
        ]

    def __str__(self):
        return f"{self.classroom} - {self.subject} ({self.get_day_of_week_display()} {self.start_time})"

    @property
    def duration(self):
        """Calculate class duration in minutes"""
        from datetime import datetime

        start = datetime.combine(datetime.today(), self.start_time)
        end = datetime.combine(datetime.today(), self.end_time)
        return int((end - start).total_seconds() / 60)
