from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from academics.models import AcademicSession, Term
from tenants.models import TenantMixin


def get_current_date():
    """Get current date for default values"""
    return timezone.now().date()


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
        db_table = "classroom_gradelevely"  # ADD THIS LINE to match existing table
        ordering = ["education_level", "order"]
        unique_together = ["tenant", "education_level", "order"]

    def __str__(self):
        return self.name


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

    def __str__(self):
        return f"{self.grade_level.name} - Section {self.name}"


class Stream(TenantMixin, models.Model):
    """Stream model for Senior Secondary education (Science, Arts, Commercial, Technical)"""

    STREAM_CHOICES = [
        ("SCIENCE", "Science"),
        ("ARTS", "Arts"),
        ("COMMERCIAL", "Commercial"),
        ("TECHNICAL", "Technical"),
    ]

    name = models.CharField(max_length=50)
    code = models.CharField(max_length=10)
    stream_type = models.CharField(max_length=20, choices=STREAM_CHOICES)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["stream_type", "name"]
        unique_together = ["tenant", "code"]

    def __str__(self):
        return f"{self.name} ({self.get_stream_type_display()})"


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

    @property
    def education_level(self):
        return self.section.grade_level.education_level

    def __str__(self):
        return f"{self.section} - {self.academic_session.name} ({self.term.get_name_display()})"

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


class ClassroomTeacherAssignment(TenantMixin, models.Model):
    """Teacher assignment to classroom for specific subjects"""
    classroom = models.ForeignKey(Classroom, on_delete=models.CASCADE)
    teacher = models.ForeignKey(
        "teacher.Teacher",
        on_delete=models.CASCADE,
        related_name="classroom_assignments",  # ✅ ADD THIS LINE
    )
    subject = models.ForeignKey("subject.Subject", on_delete=models.CASCADE)

    # Enhanced assignment details
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

    def __str__(self):
        return f"{self.classroom} - {self.subject} ({self.get_day_of_week_display()} {self.start_time})"

    @property
    def duration(self):
        """Calculate class duration in minutes"""
        from datetime import datetime

        start = datetime.combine(datetime.today(), self.start_time)
        end = datetime.combine(datetime.today(), self.end_time)
        return int((end - start).total_seconds() / 60)
