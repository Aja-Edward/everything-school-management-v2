import logging
from django.db import models
from django.db.models import UniqueConstraint
from django.utils import timezone
from django.core.exceptions import ValidationError

from tenants.models import TenantMixin
from students.models import Student
from teacher.models import Teacher
from classroom.models import Section

logger = logging.getLogger(__name__)


class AttendanceSession(models.TextChoices):
    """
    Schools mark attendance twice daily:
      MORNING   — registration / start of day
      AFTERNOON — dismissal / end of day
    """
    MORNING = "morning",   "Morning"
    AFTERNOON = "afternoon", "Afternoon"


class Attendance(TenantMixin, models.Model):
    """
    One record = one student + one session (morning or afternoon) + one date.

    Key design decisions
    ────────────────────
    • UniqueConstraint on (tenant, date, student, section, session) — allows
      two records per day (morning + afternoon) while preventing duplicates.
    • `date` is unrestricted so teachers can back-fill historical records
      (schools joining mid-year still need to populate report cards).
    • `teacher` is SET_NULL so deleting a teacher never wipes attendance data.
    • `created_at` / `updated_at` provide a full audit trail.
    • `marked_late` flag: when True the record was created after the school day,
      useful for compliance reporting without blocking the operation.
    """

    STATUS_CHOICES = [
        ("P", "Present"),
        ("A", "Absent"),
        ("L", "Late"),
        ("E", "Excused"),
    ]

    # ── Core fields ───────────────────────────────────────────────────────────

    date = models.DateField(
        help_text="The calendar date this record is for. May be in the past."
    )
    session = models.CharField(
        max_length=10,
        choices=AttendanceSession.choices,
        default=AttendanceSession.MORNING,
        help_text="Morning (start-of-day) or Afternoon (dismissal) session.",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    teacher = models.ForeignKey(
        Teacher,
        # FIX #5: was CASCADE — teacher deletion no longer wipes records
        on_delete=models.SET_NULL,
        related_name="attendances",
        null=True,
        blank=True,
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    status = models.CharField(max_length=1, choices=STATUS_CHOICES)

    # ── Time tracking ─────────────────────────────────────────────────────────

    time_in = models.TimeField(
        null=True,
        blank=True,
        help_text="Time student arrived (morning) or returned from break (afternoon).",
    )
    time_out = models.TimeField(
        null=True,
        blank=True,
        help_text="Time student left for break (morning) or dismissed (afternoon).",
    )

    # ── Audit / back-fill tracking ────────────────────────────────────────────
    created_at = models.DateTimeField(
        default=timezone.now, editable=False,  help_text="When this record was first created in the system.",)

    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="When this record was last modified.",
    )
    marked_late = models.BooleanField(
        default=False,
        help_text=(
            "True when the record was created after the attendance date. "
            "Set automatically; used for compliance reporting."
        ),
    )
    back_fill_reason = models.TextField(
        blank=True,
        default="",
        help_text=(
            "Optional note explaining why a historical record is being created. "
            "Shown in audit logs when marked_late=True."
        ),
    )

    # ── Meta ──────────────────────────────────────────────────────────────────

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["tenant", "date", "student", "section", "session"],
                name="unique_attendance_per_student_section_date_session",
            )
        ]
        indexes = [
            models.Index(fields=["tenant", "date"]),
            models.Index(fields=["tenant", "teacher", "date"]),
            models.Index(fields=["tenant", "student", "date"]),
            models.Index(fields=["tenant", "date", "status"]),
            models.Index(fields=["tenant", "section", "date"]),
            # session queries
            models.Index(fields=["tenant", "date", "session"]),
            # upsert lookups
            models.Index(fields=["tenant", "student", "date", "session"]),
        ]
        ordering = ["-date", "session", "student"]

    def save(self, *args, **kwargs):
        """Auto-set marked_late when the record date is before today."""
        today = timezone.localdate()
        if self.date < today:
            self.marked_late = True
        super().save(*args, **kwargs)

    def clean(self):
        """Model-level validation (also enforced at the serializer layer)."""
        if self.time_in and self.time_out and self.time_in >= self.time_out:
            raise ValidationError(
                {"time_out": "Time out must be after time in."}
            )

    def __str__(self):
        student = str(self.student) if self.student_id else "Unknown"
        session = self.get_session_display()
        return f"{student} — {self.date} [{session}] — {self.get_status_display()}"
