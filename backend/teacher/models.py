from django.db import models
from django.conf import settings
from django.utils import timezone
from classroom.models import GradeLevel, Section
from subject.models import Subject
from tenants.models import TenantMixin


class Teacher(TenantMixin, models.Model):
    """Teacher profile extending User model"""

    STAFF_TYPE_CHOICES = [
        ("teaching", "Teaching"),
        ("non-teaching", "Non-Teaching"),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    employee_id = models.CharField(max_length=20)
    subjects = models.ManyToManyField(
        Subject,
        blank=True,
        related_name="teaching_teachers",
        help_text="Subjects this teacher is qualified/assigned to teach",
    )
    education_levels = models.ManyToManyField(
        "academics.EducationLevel",
        blank=True,
        related_name="teachers",
        help_text=(
            "Education levels this teacher is assigned to. "
            "Leave blank to allow teaching across all levels. "
            "Schools can define their own levels in Academic Settings."
        ),
    )
    staff_type = models.CharField(
        max_length=20, choices=STAFF_TYPE_CHOICES, default="teaching"
    )
    # Kept for backward compatibility and display. Use education_levels (M2M)
    # for multi-level assignment. This field is no longer choices-restricted.
    level = models.CharField(max_length=200, blank=True, null=True)
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

    class Meta:
        unique_together = ["tenant", "employee_id"]

    def __str__(self):
        return f"{self.user.full_name} ({self.employee_id})"


class StaffActivityCategory(TenantMixin, models.Model):
    """
    Tenant-configurable activity categories for non-teaching (and teaching) staff.
    Each category defines what type of activity can be logged and what extra
    fields the log entry should collect.

    Default categories seeded: Vehicle Trip, Maintenance/Repair, Marketing Attendance,
    Cleaning/Sanitation, Student Care, General Duty.
    """

    APPLICABLE_CHOICES = [
        ("all", "All Staff"),
        ("teaching", "Teaching Staff Only"),
        ("non-teaching", "Non-Teaching Staff Only"),
    ]

    name = models.CharField(max_length=100, help_text="e.g. 'Vehicle Trip', 'Maintenance'")
    code = models.SlugField(max_length=60)
    icon = models.CharField(max_length=10, blank=True, help_text="Emoji icon, e.g. 🚌")
    applicable_to = models.CharField(
        max_length=20, choices=APPLICABLE_CHOICES, default="non-teaching"
    )
    description = models.TextField(blank=True)
    # JSON list of extra field definitions:
    # [{"key": "route", "label": "Route / Destination", "type": "text", "required": True},
    #  {"key": "passengers", "label": "No. of Students", "type": "number", "required": False}]
    # Supported types: text, number, textarea, time, select (add "options": ["a","b"])
    fields_config = models.JSONField(
        default=list,
        help_text="List of extra field definitions for this category",
    )
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_system_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["tenant", "code"]
        ordering = ["display_order", "name"]

    def __str__(self):
        return f"{self.icon} {self.name}" if self.icon else self.name


class StaffActivityLog(TenantMixin, models.Model):
    """
    A single activity entry submitted by a staff member.
    Admin can view, approve, or reject entries.
    """

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending Review"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    teacher = models.ForeignKey(
        "Teacher",
        on_delete=models.CASCADE,
        related_name="activity_logs",
    )
    category = models.ForeignKey(
        StaffActivityCategory,
        on_delete=models.PROTECT,
        related_name="logs",
    )
    activity_date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # Stores responses to category.fields_config keys
    details = models.JSONField(default=dict, blank=True)
    attachment_url = models.URLField(null=True, blank=True)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    admin_note = models.TextField(blank=True, help_text="Admin feedback on this entry")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_activity_logs",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-activity_date", "-created_at"]

    def __str__(self):
        return f"{self.teacher.user.get_full_name()} — {self.category.name} ({self.activity_date})"


# ─── Default categories seeded for every new tenant ───────────────────────────

DEFAULT_ACTIVITY_CATEGORIES = [
    {
        "name": "Vehicle Trip",
        "code": "vehicle_trip",
        "icon": "🚌",
        "applicable_to": "non-teaching",
        "description": "Record student pick-up / drop-off routes and journey details.",
        "display_order": 1,
        "fields_config": [
            {"key": "route", "label": "Route / Destination", "type": "text", "required": True},
            {"key": "departure_time", "label": "Departure Time", "type": "time", "required": True},
            {"key": "arrival_time", "label": "Arrival Time", "type": "time", "required": True},
            {"key": "students_picked", "label": "Students Picked Up", "type": "number", "required": False},
            {"key": "students_dropped", "label": "Students Dropped Off", "type": "number", "required": False},
            {"key": "odometer_start", "label": "Odometer Start (km)", "type": "number", "required": False},
            {"key": "odometer_end", "label": "Odometer End (km)", "type": "number", "required": False},
            {"key": "fuel_added", "label": "Fuel Added (litres)", "type": "number", "required": False},
            {"key": "vehicle", "label": "Vehicle / Plate No.", "type": "text", "required": False},
        ],
    },
    {
        "name": "Vehicle Servicing / Repair",
        "code": "vehicle_maintenance",
        "icon": "🔧",
        "applicable_to": "non-teaching",
        "description": "Record vehicle maintenance, servicing, or repair activities.",
        "display_order": 2,
        "fields_config": [
            {"key": "vehicle", "label": "Vehicle / Plate No.", "type": "text", "required": True},
            {"key": "service_type", "label": "Service Type", "type": "select", "required": True,
             "options": ["Routine Service", "Tyre Change", "Engine Repair", "Electrical Fault", "Body Work", "Other"]},
            {"key": "workshop", "label": "Workshop / Mechanic", "type": "text", "required": False},
            {"key": "cost", "label": "Cost (₦)", "type": "number", "required": False},
            {"key": "parts_replaced", "label": "Parts Replaced", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "Marketing / Outreach",
        "code": "marketing_outreach",
        "icon": "📣",
        "applicable_to": "all",
        "description": "Record school marketing visits, community outreach, or promotional activities.",
        "display_order": 3,
        "fields_config": [
            {"key": "location", "label": "Location Visited", "type": "text", "required": True},
            {"key": "activity_type", "label": "Activity Type", "type": "select", "required": True,
             "options": ["Flyer Distribution", "Community Visit", "School Visit", "Event Attendance", "Social Media", "Other"]},
            {"key": "contacts_reached", "label": "People / Contacts Reached", "type": "number", "required": False},
            {"key": "outcome", "label": "Outcome / Observations", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "Cleaning / Sanitation",
        "code": "cleaning",
        "icon": "🧹",
        "applicable_to": "non-teaching",
        "description": "Log cleaning and sanitation tasks completed.",
        "display_order": 4,
        "fields_config": [
            {"key": "areas_covered", "label": "Areas / Rooms Covered", "type": "textarea", "required": True},
            {"key": "tasks_done", "label": "Tasks Completed", "type": "select", "required": True,
             "options": ["Sweeping & Mopping", "Toilet Cleaning", "Bin Emptying", "Window Cleaning", "General Disinfection", "Outdoor/Compound", "Other"]},
            {"key": "materials_used", "label": "Materials / Products Used", "type": "text", "required": False},
        ],
    },
    {
        "name": "Student Care / Crèche",
        "code": "student_care",
        "icon": "👶",
        "applicable_to": "non-teaching",
        "description": "Record child care, crèche, and nursery support activities.",
        "display_order": 5,
        "fields_config": [
            {"key": "children_count", "label": "Number of Children", "type": "number", "required": True},
            {"key": "activities", "label": "Activities Conducted", "type": "textarea", "required": True},
            {"key": "incidents", "label": "Incidents / Observations", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "Security Duty",
        "code": "security",
        "icon": "🔒",
        "applicable_to": "non-teaching",
        "description": "Log security checks, gate duty, and incidents.",
        "display_order": 6,
        "fields_config": [
            {"key": "shift", "label": "Shift", "type": "select", "required": True,
             "options": ["Morning", "Afternoon", "Evening", "Night", "Full Day"]},
            {"key": "visitors_logged", "label": "Visitors Logged", "type": "number", "required": False},
            {"key": "incidents", "label": "Incidents / Observations", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "General Duty",
        "code": "general_duty",
        "icon": "📋",
        "applicable_to": "all",
        "description": "Any other task or duty not covered by the above categories.",
        "display_order": 99,
        "fields_config": [
            {"key": "task_summary", "label": "Task Summary", "type": "textarea", "required": True},
            {"key": "outcome", "label": "Outcome", "type": "textarea", "required": False},
        ],
    },
]


class AssignmentRequest(TenantMixin, models.Model):
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


class TeacherSchedule(TenantMixin, models.Model):
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
            "tenant",
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


class BulkUploadRecord(TenantMixin, models.Model):
    """
    Tracks state and results of a single bulk student upload job.
    Created immediately when the file is accepted; updated by the Celery task.
    """

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    )

    uploaded_by = models.ForeignKey(
        "users.CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teacher_bulk_uploads",
    )
    original_filename = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)  # absolute path on server
    file_ext = models.CharField(max_length=10)  # '.csv' | '.xlsx'

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    imported_rows = models.IntegerField(default=0)
    failed_rows = models.IntegerField(default=0)

    # Full result JSON: { imported: [...], errors: [...], summary: {...} }
    result_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Bulk Upload Record"
        verbose_name_plural = "Bulk Upload Records"
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "uploaded_by"]),
        ]

    def __str__(self):
        return f"Bulk Upload {self.id} — {self.status} ({self.imported_rows}/{self.total_rows})"

    @property
    def progress_percent(self):
        if not self.total_rows:
            return 0
        return round((self.processed_rows / self.total_rows) * 100)

    @property
    def is_done(self):
        return self.status in ("completed", "failed")
