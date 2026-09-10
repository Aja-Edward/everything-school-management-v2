import logging
from datetime import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
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


# ══════════════════════════════════════════════════════════════════════════════
# Gate scanning — chip/card identity and entry/exit events
# ══════════════════════════════════════════════════════════════════════════════


def normalize_tag_uid(raw):
    """
    Canonical form for a tag UID: uppercase hex, separators stripped.

    Readers hand back the same physical tag as "04:a2:24:1b", "04-A2-24-1B"
    or "04a2241b" depending on platform and SDK, so the value is normalized
    on the way in and every lookup normalizes too. Returns "" for empty input.
    """
    if not raw:
        return ""
    return "".join(
        ch for ch in str(raw).upper()
        if ch not in {":", "-", " ", "."}
    )


class TagStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    LOST = "lost", "Lost"
    REVOKED = "revoked", "Revoked"


class StudentTag(TenantMixin, models.Model):
    """
    A physical chip/card on a student's bag, mapped to that student.

    The tag stores nothing but its own factory UID — no name, no class, no
    PII. Identity lives here, in the database, so it can be corrected and
    revoked without touching the hardware.

    Key design decisions
    ────────────────────
    • Its own table rather than a field on Student: bags get lost and chips
      get re-issued, and old GateScan rows must stay attributable to the tag
      that actually produced them.
    • Uniqueness is enforced only over ACTIVE rows, so a UID freed by a
      revoked tag can be issued again while history is preserved.
    • `uid` is normalized by `normalize_tag_uid` on save.
    """

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    uid = models.CharField(
        max_length=64,
        help_text="Tag's factory UID, normalized to uppercase hex.",
    )
    label = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Optional human note, e.g. 'blue rucksack'.",
    )
    status = models.CharField(
        max_length=10,
        choices=TagStatus.choices,
        default=TagStatus.ACTIVE,
    )

    issued_at = models.DateTimeField(default=timezone.now)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tags_issued",
        help_text="Staff member who enrolled this tag.",
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tags_revoked",
    )
    revoke_reason = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["tenant", "uid"],
                condition=models.Q(status=TagStatus.ACTIVE),
                name="unique_active_tag_uid_per_tenant",
            )
        ]
        indexes = [
            # The scan resolve lookup.
            models.Index(fields=["tenant", "uid", "status"]),
            models.Index(fields=["tenant", "student", "status"]),
        ]
        ordering = ["-issued_at"]

    def save(self, *args, **kwargs):
        self.uid = normalize_tag_uid(self.uid)
        super().save(*args, **kwargs)

    @property
    def is_usable(self):
        return self.status == TagStatus.ACTIVE

    def __str__(self):
        student = str(self.student) if self.student_id else "Unknown"
        return f"{student} — {self.uid} [{self.get_status_display()}]"


class ScanDirection(models.TextChoices):
    IN = "in", "Entry"
    OUT = "out", "Exit"


class GateScan(TenantMixin, models.Model):
    """
    One tap of one tag: an append-only record of a boundary crossing.

    Attendance holds one summary row per student per day per session; a child
    can cross the gate more than twice (an early collection, a medical
    appointment, a return), so the events are recorded here and projected
    onto that summary row rather than replacing it.

    Key design decisions
    ────────────────────
    • `direction` is supplied by the client, never inferred from prior state.
      Inferring it means a second tap at a busy gate silently flips a child
      to "left the premises" and alarms a parent whose child just walked in.
    • `scanned_at` is when the device read the tag; `received_at` is when the
      server heard about it. They differ whenever the gate was offline, and
      the first is the one that counts.
    • `uid` is denormalized alongside `tag` so a scan stays readable after
      its tag row is deleted.
    • `client_scan_id` is the caller's idempotency key: replaying a queued
      batch cannot create duplicate events.
    """

    tag = models.ForeignKey(
        StudentTag,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scans",
    )
    uid = models.CharField(
        max_length=64,
        help_text="UID as scanned, normalized. Kept even if the tag is deleted.",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="gate_scans",
    )
    direction = models.CharField(
        max_length=3,
        choices=ScanDirection.choices,
        help_text="Entry or exit. Sent explicitly by the scanner, never inferred.",
    )

    scanned_at = models.DateTimeField(
        help_text="When the device read the tag (may predate receipt if offline)."
    )
    received_at = models.DateTimeField(
        default=timezone.now,
        editable=False,
        help_text="When the server accepted the scan.",
    )

    scanned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="gate_scans_recorded",
        help_text="Staff account operating the scanner.",
    )
    device_id = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Caller-supplied device identifier, for auditing a disputed scan.",
    )
    client_scan_id = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="Client idempotency key; blank when the caller supplies none.",
    )

    attendance = models.ForeignKey(
        Attendance,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="gate_scans",
        help_text="The daily summary row this scan was projected onto.",
    )
    is_duplicate = models.BooleanField(
        default=False,
        help_text=(
            "True when this landed inside the tenant's duplicate-scan window "
            "and so did not move attendance or notify anyone."
        ),
    )

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["tenant", "client_scan_id"],
                condition=~models.Q(client_scan_id=""),
                name="unique_client_scan_id_per_tenant",
            )
        ]
        indexes = [
            models.Index(fields=["tenant", "uid", "scanned_at"]),
            models.Index(fields=["tenant", "student", "scanned_at"]),
            models.Index(fields=["tenant", "scanned_at"]),
            models.Index(fields=["tenant", "direction", "scanned_at"]),
        ]
        ordering = ["-scanned_at"]

    def save(self, *args, **kwargs):
        self.uid = normalize_tag_uid(self.uid)
        super().save(*args, **kwargs)

    def __str__(self):
        student = str(self.student) if self.student_id else "Unknown"
        when = self.scanned_at.strftime("%Y-%m-%d %H:%M") if self.scanned_at else "?"
        return f"{student} {self.get_direction_display()} @ {when}"


class AlertPolicy(models.TextChoices):
    ALL_SCANS = "all_scans", "Notify on every scan"
    ANOMALIES_ONLY = "anomalies_only", "Notify only on unexpected scans"


class AttendanceSettings(models.Model):
    """
    Per-school attendance windows, used to derive session and status from the
    moment a tag was scanned.

    Deliberately keyed on tenant as its primary key, the same shape as
    tenants.TenantSettings. schoolSettings.SchoolSettings and
    NotificationSettings are unscoped singletons whose save() collapses every
    school into one row, so one school's 8am would become every school's.
    This model cannot be used that way.

    Times are local to the school; the zone comes from
    TenantSettings.timezone via `tzinfo`.
    """

    tenant = models.OneToOneField(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="attendance_settings",
    )

    morning_opens = models.TimeField(
        default=time(6, 30),
        help_text="Earliest a tap counts as that day's arrival.",
    )
    late_after = models.TimeField(
        default=time(8, 0),
        help_text="An arrival at or after this time is marked Late, not Present.",
    )
    afternoon_opens = models.TimeField(
        default=time(12, 0),
        help_text="From this time, a tap belongs to the afternoon session.",
    )
    dismissal_after = models.TimeField(
        default=time(14, 0),
        help_text=(
            "Normal end of day. An exit before this is an early departure, "
            "which is what anomaly-only alerting notifies on."
        ),
    )

    duplicate_scan_window_seconds = models.PositiveIntegerField(
        default=90,
        help_text=(
            "Re-reading the same tag in the same direction inside this many "
            "seconds is treated as one scan — no second record, no second alert."
        ),
    )
    # Defaults to anomalies only, deliberately. Alerting on every crossing is
    # roughly 190,000 messages a year for a 500-pupil school; at the ~N7.35 per
    # SMS quoted by Nigerian aggregators that is over a million naira a year
    # for one school, which is more than most will pay for the whole system.
    # A school that wants every scan can still say so, but it should be a
    # decision someone made rather than the setting they were given.
    alert_policy = models.CharField(
        max_length=20,
        choices=AlertPolicy.choices,
        default=AlertPolicy.ANOMALIES_ONLY,
        help_text=(
            "Whether parents hear about every crossing or only unexpected "
            "ones. Drives the messaging bill as much as the provider does."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Attendance Settings"
        verbose_name_plural = "Attendance Settings"

    def clean(self):
        if self.morning_opens >= self.late_after:
            raise ValidationError(
                {"late_after": "Late cut-off must be after the morning opens."}
            )
        if self.afternoon_opens >= self.dismissal_after:
            raise ValidationError(
                {"dismissal_after": "Dismissal must be after the afternoon opens."}
            )
        if self.late_after > self.afternoon_opens:
            raise ValidationError(
                {"afternoon_opens": "Afternoon cannot begin before the late cut-off."}
            )

    @property
    def tzinfo(self):
        """The school's timezone, from TenantSettings. Falls back to Africa/Lagos."""
        name = "Africa/Lagos"
        tenant_settings = getattr(self.tenant, "settings", None)
        if tenant_settings and tenant_settings.timezone:
            name = tenant_settings.timezone
        try:
            return ZoneInfo(name)
        except ZoneInfoNotFoundError:
            logger.warning(
                "Unknown timezone %r for tenant %s; falling back to Africa/Lagos",
                name, self.tenant_id,
            )
            return ZoneInfo("Africa/Lagos")

    def __str__(self):
        return f"Attendance settings for {self.tenant}"


# ══════════════════════════════════════════════════════════════════════════════
# Parent notifications for gate scans
# ══════════════════════════════════════════════════════════════════════════════


class NotificationChannel(models.TextChoices):
    IN_APP = "in_app", "In-app"
    EMAIL = "email", "Email"
    SMS = "sms", "SMS"


class NotificationStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    SKIPPED = "skipped", "Skipped"


class ParentAlertPreference(models.Model):
    """
    What one parent wants to hear about, and how.

    SMS is off by default and stays opt-in. At two messages per child per day
    a 500-pupil school sends around 190,000 texts a year, which can cost more
    than the software; in-app and email cost nothing. Nobody should be able to
    turn that bill on for a whole school by accident.
    """

    parent = models.OneToOneField(
        "parent.ParentProfile",
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="alert_preference",
    )

    in_app_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    sms_enabled = models.BooleanField(
        default=False,
        help_text="Opt-in. Costs real money per message — see the alert policy.",
    )
    muted = models.BooleanField(
        default=False,
        help_text="Suppress every channel without losing the parent's choices.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Parent Alert Preference"
        verbose_name_plural = "Parent Alert Preferences"

    def channels(self):
        """The channels this parent should be reached on, cheapest first."""
        if self.muted:
            return []
        wanted = []
        if self.in_app_enabled:
            wanted.append(NotificationChannel.IN_APP)
        if self.email_enabled:
            wanted.append(NotificationChannel.EMAIL)
        if self.sms_enabled:
            wanted.append(NotificationChannel.SMS)
        return wanted

    def __str__(self):
        return f"Alert preferences for {self.parent}"


class ScanNotification(TenantMixin, models.Model):
    """
    One message about one scan to one recipient on one channel.

    Split per recipient and per channel rather than per scan, because a scan
    fans out — two parents, each on their own channels — and "did the mother
    get the text?" has to be answerable on its own. The rendered subject and
    body are stored so a school can show a parent exactly what was sent,
    months later, without reconstructing it from a template that has changed.
    """

    scan = models.ForeignKey(
        GateScan,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="scan_notifications",
        help_text="Denormalized from the scan for querying.",
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scan_notifications",
    )

    channel = models.CharField(
        max_length=10,
        choices=NotificationChannel.choices,
    )
    destination = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="The address actually used — which number or inbox it went to.",
    )

    subject = models.CharField(max_length=255, blank=True, default="")
    body = models.TextField(blank=True, default="")

    status = models.CharField(
        max_length=10,
        choices=NotificationStatus.choices,
        default=NotificationStatus.QUEUED,
        db_index=True,
    )
    provider = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Which service carried it, e.g. brevo or twilio.",
    )
    provider_message_id = models.CharField(
        max_length=255, blank=True, default="")
    error = models.TextField(blank=True, default="")
    attempts = models.PositiveIntegerField(default=0)

    queued_at = models.DateTimeField(default=timezone.now, editable=False)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="In-app only: when the parent opened it.",
    )

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["tenant", "scan", "recipient", "channel"],
                name="unique_scan_notification_per_recipient_channel",
            )
        ]
        indexes = [
            models.Index(fields=["tenant", "status", "queued_at"]),
            models.Index(fields=["tenant", "recipient", "queued_at"]),
            models.Index(fields=["tenant", "student", "queued_at"]),
        ]
        ordering = ["-queued_at"]

    def mark_sent(self, provider="", message_id=""):
        self.status = NotificationStatus.SENT
        self.provider = provider or self.provider
        self.provider_message_id = message_id or self.provider_message_id
        self.sent_at = timezone.now()
        self.error = ""
        self.save(update_fields=[
            "status", "provider", "provider_message_id", "sent_at", "error",
        ])

    def mark_failed(self, error, provider=""):
        self.status = NotificationStatus.FAILED
        self.provider = provider or self.provider
        self.error = str(error)[:2000]
        self.save(update_fields=["status", "provider", "error"])

    def mark_skipped(self, reason):
        self.status = NotificationStatus.SKIPPED
        self.error = str(reason)[:2000]
        self.save(update_fields=["status", "error"])

    def __str__(self):
        return (
            f"{self.get_channel_display()} to {self.recipient} "
            f"about {self.student} [{self.get_status_display()}]"
        )
