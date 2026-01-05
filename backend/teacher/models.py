from django.db import models
from django.conf import settings
from django.utils import timezone
from classroom.models import GradeLevel, Section
from subject.models import Subject


class Teacher(models.Model):
    """Teacher profile extending User model"""

    STAFF_TYPE_CHOICES = [
        ("teaching", "Teaching"),
        ("non-teaching", "Non-Teaching"),
    ]
    LEVEL_CHOICES = [
        ("nursery", "Nursery"),
        ("primary", "Primary"),
        ("junior_secondary", "Junior Secondary"),
        ("senior_secondary", "Senior Secondary"),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    employee_id = models.CharField(max_length=20, unique=True)
    staff_type = models.CharField(
        max_length=20, choices=STAFF_TYPE_CHOICES, default="teaching"
    )
    level = models.CharField(
        max_length=20, choices=LEVEL_CHOICES, blank=True, null=True
    )
    phone_number = models.CharField(max_length=15, blank=True)
    address = models.TextField(blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    hire_date = models.DateField(default=timezone.now)
    qualification = models.CharField(max_length=200, blank=True)
    specialization = models.CharField(max_length=100, blank=True)
    photo = models.URLField(blank=True, null=True, help_text="Profile picture URL")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    signature_url = models.URLField(
        blank=True, null=True, verbose_name="Digital Signature URL"
    )
    signature_uploaded_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"{self.user.full_name} ({self.employee_id})"


class AssignmentRequest(models.Model):
    """Model for teacher assignment requests"""

    REQUEST_TYPE_CHOICES = [
        ("subject", "Subject Assignment"),
        ("class", "Class Assignment"),
        ("schedule", "Schedule Change"),
        ("additional", "Additional Assignment"),
    ]

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("cancelled", "Cancelled"),
    ]

    teacher = models.ForeignKey(
        Teacher, on_delete=models.CASCADE, related_name="assignment_requests"
    )
    request_type = models.CharField(max_length=20, choices=REQUEST_TYPE_CHOICES)
    title = models.CharField(max_length=200)
    description = models.TextField()
    requested_subjects = models.ManyToManyField(Subject, blank=True)
    requested_grade_levels = models.ManyToManyField(GradeLevel, blank=True)
    requested_sections = models.ManyToManyField(Section, blank=True)
    preferred_schedule = models.TextField(
        blank=True, help_text="Preferred teaching schedule"
    )
    reason = models.TextField(help_text="Reason for the request")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    admin_notes = models.TextField(blank=True, help_text="Admin notes on the request")
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_requests",
    )

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.teacher} - {self.title} ({self.status})"


class TeacherSchedule(models.Model):
    """Model for teacher weekly schedules"""

    DAY_CHOICES = [
        ("monday", "Monday"),
        ("tuesday", "Tuesday"),
        ("wednesday", "Wednesday"),
        ("thursday", "Thursday"),
        ("friday", "Friday"),
        ("saturday", "Saturday"),
        ("sunday", "Sunday"),
    ]

    teacher = models.ForeignKey(
        Teacher, on_delete=models.CASCADE, related_name="schedules"
    )
    day_of_week = models.CharField(max_length=10, choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE)
    section = models.ForeignKey(Section, on_delete=models.CASCADE)
    room_number = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    academic_session = models.CharField(max_length=10, blank=True)
    term = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (
            "teacher",
            "day_of_week",
            "start_time",
            "end_time",
            "academic_session",
            "term",
        )
        ordering = ["day_of_week", "start_time"]

    def __str__(self):
        return f"{self.teacher} - {self.subject} ({self.day_of_week} {self.start_time}-{self.end_time})"
