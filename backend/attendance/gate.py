"""
Gate scanning: turning one tap of a chip into an attendance record.

Everything the scanner cannot know is derived here rather than asked of the
client. A phone at the gate has exactly two facts — which chip it read and
when — so section, date, session, and present-versus-late are all worked out
server-side from the school's own configured windows.

One rule shapes the error handling throughout: **never refuse a real scan for
a policy reason.** A rejected scan is a child who crossed the gate with no
record of it, which is worse than an odd-looking record. So an exit with no
matching entry, a tap before the school opens, a device with a skewed clock —
all of these are recorded and flagged in `warnings` for the operator and for
the alerting policy to act on. Only genuine identity or integrity failures
refuse: a chip nobody enrolled, a retired chip, a student with no section to
file attendance against.
"""
import logging
from dataclasses import dataclass, field
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import (
    Attendance,
    AttendanceSession,
    AttendanceSettings,
    GateScan,
    ScanDirection,
    StudentTag,
    TagStatus,
    normalize_tag_uid,
)

logger = logging.getLogger(__name__)

# How far ahead of the server a device's clock may be before we say so.
CLOCK_SKEW_TOLERANCE = timedelta(minutes=5)


# ── Failures ──────────────────────────────────────────────────────────────────

class ScanError(Exception):
    """A scan that cannot be recorded at all. Carries a client-facing code."""

    code = "scan_failed"
    status_code = 400

    def __init__(self, detail, **extra):
        super().__init__(detail)
        self.detail = detail
        self.extra = extra

    def as_payload(self):
        return {"code": self.code, "detail": self.detail, **self.extra}


class TagNotEnrolled(ScanError):
    code = "uid_not_enrolled"
    status_code = 404


class TagNotActive(ScanError):
    code = "uid_not_active"
    status_code = 404


class StudentHasNoSection(ScanError):
    """
    Attendance.section is required while Student.section is nullable, so a
    student who has never been placed in a section has nowhere to file a
    record. Worth saying plainly rather than surfacing as a 500.
    """

    code = "student_has_no_section"
    status_code = 422


# ── Result ────────────────────────────────────────────────────────────────────

@dataclass
class ScanOutcome:
    scan: GateScan
    attendance: Attendance | None
    session: str
    derived_status: str | None
    duplicate: bool = False
    replayed: bool = False
    warnings: list = field(default_factory=list)

    @property
    def notifiable(self):
        """
        Whether this scan should reach a parent. Duplicates and replays never
        do — a second tap at the gate must not send a second message. The
        alert policy decides the rest, in step 5.
        """
        return not (self.duplicate or self.replayed)


# ── Settings ──────────────────────────────────────────────────────────────────

def settings_for(tenant):
    """
    This school's attendance windows, created with defaults on first use so a
    school that has never opened the settings screen still scans correctly.
    """
    row, _ = AttendanceSettings.objects.get_or_create(tenant=tenant)
    return row


# ── Resolution ────────────────────────────────────────────────────────────────

def resolve_tag(tenant, uid):
    """Find the active tag for a UID, or explain why there isn't one."""
    uid = normalize_tag_uid(uid)
    if not uid:
        raise TagNotEnrolled("A tag UID is required.", uid=uid)

    active = (
        StudentTag.objects
        .filter(tenant=tenant, uid=uid, status=TagStatus.ACTIVE)
        .select_related(
            "student__user",
            "student__section",
            "student__student_class",
            "student__student_class__education_level",
        )
        .first()
    )
    if active:
        return active

    retired = (
        StudentTag.objects
        .filter(tenant=tenant, uid=uid)
        .order_by("-revoked_at", "-issued_at")
        .first()
    )
    if retired:
        raise TagNotActive(
            f"This chip was {retired.get_status_display().lower()} and is no "
            f"longer in use.",
            uid=uid,
            revoked_at=retired.revoked_at,
        )

    raise TagNotEnrolled(
        "This chip is not enrolled for any student.", uid=uid)


# ── Derivation ────────────────────────────────────────────────────────────────

def derive_session(local_time, settings):
    """Which half of the school day a tap belongs to."""
    if local_time < settings.afternoon_opens:
        return AttendanceSession.MORNING
    return AttendanceSession.AFTERNOON


def derive_status(local_time, session, settings):
    """
    Present or Late, for an arrival.

    Lateness is a morning notion: the afternoon window covers returns from
    break and dismissal, where "late" has no meaning the register can use.
    """
    if session == AttendanceSession.MORNING and local_time >= settings.late_after:
        return "L"
    return "P"


# ── Recording ─────────────────────────────────────────────────────────────────

def record_scan(
    *,
    tenant,
    uid,
    direction,
    scanned_at=None,
    scanned_by=None,
    device_id="",
    client_scan_id="",
    settings=None,
):
    """
    Record one tap and project it onto the day's attendance row.

    Raises ScanError subclasses for identity and integrity failures; anything
    else odd about the scan comes back in `outcome.warnings`.
    """
    settings = settings or settings_for(tenant)
    scanned_at = scanned_at or timezone.now()
    if timezone.is_naive(scanned_at):
        scanned_at = timezone.make_aware(scanned_at, settings.tzinfo)

    # An idempotent replay of a queued offline scan: hand back what we stored
    # the first time rather than recording it twice.
    if client_scan_id:
        existing = (
            GateScan.objects
            .filter(tenant=tenant, client_scan_id=client_scan_id)
            .select_related("student__user", "student__section", "attendance")
            .first()
        )
        if existing:
            return _outcome_for_existing(existing, settings, replayed=True)

    tag = resolve_tag(tenant, uid)
    student = tag.student

    if student.section_id is None:
        raise StudentHasNoSection(
            "This student is not assigned to a section, so attendance cannot "
            "be recorded for them yet.",
            student_id=student.id,
        )

    local = scanned_at.astimezone(settings.tzinfo)
    local_date = local.date()
    local_time = local.time()
    session = derive_session(local_time, settings)

    warnings = []
    if scanned_at > timezone.now() + CLOCK_SKEW_TOLERANCE:
        warnings.append("future_timestamp")

    duplicate_of = _recent_scan(
        tenant, student, direction, scanned_at, settings)

    try:
        with transaction.atomic():
            if duplicate_of is not None:
                scan = _create_scan(
                    tenant=tenant, tag=tag, student=student,
                    direction=direction, scanned_at=scanned_at,
                    scanned_by=scanned_by, device_id=device_id,
                    client_scan_id=client_scan_id,
                    attendance=duplicate_of.attendance,
                    is_duplicate=True,
                )
                return ScanOutcome(
                    scan=scan,
                    attendance=duplicate_of.attendance,
                    session=session,
                    derived_status=None,
                    duplicate=True,
                    warnings=warnings,
                )

            attendance, derived_status, projection_warnings = _project(
                tenant=tenant,
                student=student,
                local_date=local_date,
                local_time=local_time,
                session=session,
                direction=direction,
                settings=settings,
            )
            warnings.extend(projection_warnings)

            scan = _create_scan(
                tenant=tenant, tag=tag, student=student,
                direction=direction, scanned_at=scanned_at,
                scanned_by=scanned_by, device_id=device_id,
                client_scan_id=client_scan_id,
                attendance=attendance,
                is_duplicate=False,
            )
    except IntegrityError:
        # Lost a race on client_scan_id: the other writer stored it, so use theirs.
        if client_scan_id:
            existing = (
                GateScan.objects
                .filter(tenant=tenant, client_scan_id=client_scan_id)
                .select_related("student__user", "student__section", "attendance")
                .first()
            )
            if existing:
                return _outcome_for_existing(existing, settings, replayed=True)
        raise

    return ScanOutcome(
        scan=scan,
        attendance=attendance,
        session=session,
        derived_status=derived_status,
        warnings=warnings,
    )


def _create_scan(**kwargs):
    kwargs.setdefault("received_at", timezone.now())
    return GateScan.objects.create(**kwargs)


def _recent_scan(tenant, student, direction, scanned_at, settings):
    """
    The scan this one duplicates, if any: same child, same direction, inside
    the school's window. Only real scans anchor the window — a run of taps
    collapses onto the first, not onto each other.
    """
    window = timedelta(seconds=settings.duplicate_scan_window_seconds)
    if not window:
        return None
    return (
        GateScan.objects
        .filter(
            tenant=tenant,
            student=student,
            direction=direction,
            is_duplicate=False,
            scanned_at__gt=scanned_at - window,
            scanned_at__lte=scanned_at,
        )
        .select_related("attendance")
        .order_by("-scanned_at")
        .first()
    )


def _project(*, tenant, student, local_date, local_time, session, direction,
             settings):
    """
    Fold a scan into the day's Attendance row, which stays the canonical
    record every report, export and dashboard already reads.
    """
    warnings = []
    section = student.section

    if direction == ScanDirection.IN:
        derived_status = derive_status(local_time, session, settings)

        if local_time < settings.morning_opens:
            warnings.append("before_opening")
        if derived_status == "L":
            warnings.append("late_arrival")

        attendance, created = Attendance.objects.get_or_create(
            tenant=tenant,
            student=student,
            section=section,
            date=local_date,
            session=session,
            defaults={"status": derived_status, "time_in": local_time},
        )
        if not created and attendance.time_in is None:
            # First arrival of the session sets both the time and the status;
            # a later entry scan must not overwrite either.
            attendance.time_in = local_time
            attendance.status = derived_status
            attendance.save()
        elif not created:
            derived_status = attendance.status

        return attendance, derived_status, warnings

    # ── Exit ──────────────────────────────────────────────────────────────────
    if not _has_entry_today(tenant, student, local_date):
        warnings.append("exit_without_entry")
    if local_time < settings.dismissal_after:
        warnings.append("early_departure")

    attendance, created = Attendance.objects.get_or_create(
        tenant=tenant,
        student=student,
        section=section,
        date=local_date,
        session=session,
        defaults={"status": "P", "time_out": local_time},
    )
    if not created:
        if attendance.time_in and local_time <= attendance.time_in:
            # Storing this would violate the model's own time_out > time_in
            # rule, so keep the record clean and let the operator see why.
            warnings.append("exit_before_entry")
        else:
            attendance.time_out = local_time
            attendance.save()

    return attendance, attendance.status, warnings


def _has_entry_today(tenant, student, local_date):
    """
    Whether this child has an entry scan today, across both sessions — the
    check behind the exit_without_entry warning.
    """
    return (
        Attendance.objects
        .filter(
            tenant=tenant,
            student=student,
            date=local_date,
            time_in__isnull=False,
        )
        .exists()
    )


def _outcome_for_existing(scan, settings, replayed=False):
    """Rebuild an outcome for a scan we already stored."""
    local_time = scan.scanned_at.astimezone(settings.tzinfo).time()
    return ScanOutcome(
        scan=scan,
        attendance=scan.attendance,
        session=derive_session(local_time, settings),
        derived_status=scan.attendance.status if scan.attendance_id else None,
        duplicate=scan.is_duplicate,
        replayed=replayed,
    )
