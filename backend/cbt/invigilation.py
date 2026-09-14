"""
cbt/invigilation.py

Watching a CBT paper while it is sat, and stepping in.

The board shows every student who may sit the paper, with where each one is:
not started, writing, finished or voided. For each it shows how many
questions they have answered, when their computer last checked in, and
counts of the things the exam page reports (leaving the window, copy and
paste, reconnects, device switches).

Staff can:
- give one student more time;
- hand in an attempt for them;
- let a student who has finished back in, with a set number of minutes;
- void an attempt, so it doesn't count and the student can start again.

Every action is written to the attempt's event log with who did it, when,
and the reason given. Letting back in and voiding need a reason.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from exam.models import ExamRegistration
from students.models import Student
from teacher.models import Teacher

from .access import manageable_exams
from .engine import GRACE, Refused, _end, eligible_students, finalize_if_expired
from .models import CBTAnswer, CBTAttempt, CBTEvent, CBTPaper

# A computer that hasn't checked in for this long is shown as offline. The exam page checks in every 30 seconds.
OFFLINE_AFTER = timedelta(seconds=90)
MAX_EXTRA_MINUTES = 240

WARNING_KINDS = [
    CBTEvent.Kind.FOCUS_LOST, CBTEvent.Kind.FULLSCREEN_EXITED, CBTEvent.Kind.COPY_ATTEMPTED,
    CBTEvent.Kind.PASTE_ATTEMPTED, CBTEvent.Kind.CONNECTION_LOST, CBTEvent.Kind.DEVICE_CHANGED,
]
STAFF_KINDS = [
    CBTEvent.Kind.TIME_EXTENDED, CBTEvent.Kind.REOPENED, CBTEvent.Kind.VOIDED,
    CBTEvent.Kind.SUBMITTED, CBTEvent.Kind.TIMED_OUT,
]


def invigilable_papers(user, tenant):
    """
    Papers `user` may watch and act on: those for exams they manage, and
    those for exams they are named as an invigilator on. Drafts have
    nothing to watch.
    """
    if tenant is None:
        return CBTPaper.objects.none()
    allowed = Q(exam__in=manageable_exams(user, tenant))
    teacher = Teacher.objects.filter(user=user, tenant=tenant).first()
    if teacher:
        allowed |= Q(exam__invigilators=teacher)
    return (CBTPaper.objects.filter(tenant=tenant).filter(allowed)
            .exclude(status=CBTPaper.Status.DRAFT)
            .select_related("exam", "exam__subject", "exam__grade_level").distinct())


def _seconds(delta):
    return max(0, int(delta.total_seconds()))


def _name(user):
    if user is None:
        return ""
    return getattr(user, "full_name", "") or user.get_full_name() or user.username


def board(paper, now=None):
    now = now or timezone.now()
    students = {s.id: s for s in eligible_students(paper).select_related("user", "student_class", "section")}

    attempts = list(CBTAttempt.objects.filter(paper=paper).order_by("number"))
    attempts = [finalize_if_expired(a, now) for a in attempts]
    missing = {a.student_id for a in attempts} - set(students)
    if missing:
        # Someone who has sat the paper stays on the board even if they have since changed class.
        students.update({s.id: s for s in Student.objects.filter(id__in=missing)
                         .select_related("user", "student_class", "section")})

    by_student = {}
    for attempt in attempts:
        by_student.setdefault(attempt.student_id, []).append(attempt)

    answered = dict(
        CBTAnswer.objects.filter(attempt__paper=paper)
        .filter(~Q(selected_option="") | ~Q(text_answer=""))
        .values("attempt_id").annotate(n=Count("id")).values_list("attempt_id", "n"))
    warnings = {}
    for attempt_id, kind, n in (CBTEvent.objects.filter(attempt__paper=paper, kind__in=WARNING_KINDS)
                                .values("attempt_id", "kind").annotate(n=Count("id"))
                                .values_list("attempt_id", "kind", "n")):
        warnings.setdefault(attempt_id, {})[kind] = n
    extra_time = dict(ExamRegistration.objects.filter(exam=paper.exam, student_id__in=students)
                      .values_list("student_id", "extra_time_minutes"))

    rows = []
    summary = {"students": len(students), "not_started": 0, "in_progress": 0, "finished": 0, "voided": 0, "offline": 0}
    for student in students.values():
        mine = by_student.get(student.id, [])
        latest = mine[-1] if mine else None
        state = latest.status if latest else "not_started"
        attempt = None
        offline = False
        if latest:
            in_progress = latest.status == CBTAttempt.Status.IN_PROGRESS
            since_seen = _seconds(now - latest.last_seen_at) if latest.last_seen_at else None
            offline = in_progress and since_seen is not None and since_seen > OFFLINE_AFTER.total_seconds()
            attempt = {
                "id": latest.id,
                "number": latest.number,
                "status": latest.status,
                "started_at": latest.started_at,
                "deadline": latest.deadline,
                "seconds_left": _seconds(latest.deadline - now) if in_progress else 0,
                "submitted_at": latest.submitted_at,
                "answered": answered.get(latest.id, 0),
                "question_count": len(latest.question_ids),
                "last_seen_at": latest.last_seen_at,
                "seconds_since_seen": since_seen,
                "ip_address": latest.ip_address,
                "user_agent": latest.user_agent,
            }
        summary["finished" if state in ("submitted", "timed_out") else state] += 1
        summary["offline"] += int(offline)
        rows.append({
            "student": {
                "id": student.id,
                "name": student.full_name,
                "registration_number": student.registration_number or "",
                "class": student.student_class.name if student.student_class_id else "",
                "section": student.section.name if student.section_id else "",
            },
            "state": state,
            "offline": offline,
            "attempt": attempt,
            "attempts_used": sum(1 for a in mine if a.status != CBTAttempt.Status.VOIDED),
            "extra_time_minutes": extra_time.get(student.id, 0),
            "warnings": warnings.get(latest.id, {}) if latest else {},
        })
    rows.sort(key=lambda r: r["student"]["name"].lower())

    recent = (CBTEvent.objects.filter(attempt__paper=paper, kind__in=WARNING_KINDS + STAFF_KINDS)
              .select_related("attempt__student__user", "actor").order_by("-recorded_at")[:30])
    return {
        "server_time": now,
        "paper": {
            "id": paper.id,
            "exam_title": paper.exam.title,
            "subject": paper.exam.subject.name if paper.exam.subject_id else "",
            "grade_level": paper.exam.grade_level.name if paper.exam.grade_level_id else "",
            "status": paper.status,
            "opens_at": paper.opens_at,
            "closes_at": paper.closes_at,
            "duration_minutes": paper.duration_minutes,
            "access_code": paper.access_code,
            "max_attempts": paper.max_attempts,
        },
        "summary": summary,
        "students": rows,
        "recent_events": [event_row(e) for e in recent],
    }


def event_row(event):
    return {
        "id": event.id,
        "attempt": event.attempt_id,
        "student": event.attempt.student.full_name,
        "kind": event.kind,
        "label": event.get_kind_display(),
        "recorded_at": event.recorded_at,
        "client_time": event.client_time,
        "actor": _name(event.actor),
        "detail": event.detail,
        "ip_address": event.ip_address,
    }


def attempt_events(attempt):
    return [event_row(e) for e in attempt.events.select_related("attempt__student__user", "actor").order_by("recorded_at")]


# ── Stepping in ───────────────────────────────────────────────────────────────


def _minutes(value, what):
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        minutes = 0
    if not 1 <= minutes <= MAX_EXTRA_MINUTES:
        raise Refused(f"Choose between 1 and {MAX_EXTRA_MINUTES} minutes {what}.")
    return minutes


def _reason(value, required):
    reason = (value or "").strip()[:500]
    if required and not reason:
        raise Refused("Give a reason. It is kept in the exam's record.")
    return reason


def _locked(attempt):
    return CBTAttempt.objects.select_for_update().select_related("paper__exam").get(pk=attempt.pk)


def extend_time(attempt, minutes, actor, reason="", now=None):
    now = now or timezone.now()
    minutes = _minutes(minutes, "of extra time")
    reason = _reason(reason, required=False)
    attempt = finalize_if_expired(attempt, now)
    with transaction.atomic():
        attempt = _locked(attempt)
        if attempt.status != CBTAttempt.Status.IN_PROGRESS or now > attempt.deadline + GRACE:
            raise Refused("Only a student who is still writing can be given more time. "
                          "To give time to one who has finished, let them back in.", status=409, code="not_in_progress")
        previous = attempt.deadline
        attempt.deadline = previous + timedelta(minutes=minutes)
        attempt.save(update_fields=["deadline", "updated_at"])
        CBTEvent.objects.create(
            tenant=attempt.tenant, attempt=attempt, kind=CBTEvent.Kind.TIME_EXTENDED, actor=actor,
            detail={"minutes": minutes, "reason": reason,
                    "previous_deadline": previous.isoformat(), "deadline": attempt.deadline.isoformat()})
    return attempt


def force_submit(attempt, actor, reason="", now=None):
    now = now or timezone.now()
    reason = _reason(reason, required=False)
    attempt = finalize_if_expired(attempt, now)
    with transaction.atomic():
        attempt = _locked(attempt)
        if attempt.status != CBTAttempt.Status.IN_PROGRESS:
            raise Refused("This attempt has already ended.", status=409, code="not_in_progress")
        _end(attempt, now, timed_out=False, actor=actor, detail={"reason": reason, "handed_in_by_staff": True})
    return attempt


def reopen(attempt, minutes, actor, reason, now=None):
    """Let a student who has finished back in, with `minutes` from now to carry on."""
    now = now or timezone.now()
    minutes = _minutes(minutes, "to carry on")
    reason = _reason(reason, required=True)
    with transaction.atomic():
        attempt = _locked(attempt)
        if attempt.status not in (CBTAttempt.Status.SUBMITTED, CBTAttempt.Status.TIMED_OUT):
            raise Refused("Only a finished attempt can be reopened.", status=409, code="not_finished")
        if CBTAttempt.objects.filter(paper=attempt.paper, student=attempt.student,
                                     status=CBTAttempt.Status.IN_PROGRESS).exists():
            raise Refused("This student already has an attempt in progress.", status=409, code="in_progress")
        previous = attempt.status
        attempt.status = CBTAttempt.Status.IN_PROGRESS
        attempt.submitted_at = None
        attempt.deadline = now + timedelta(minutes=minutes)
        attempt.save(update_fields=["status", "submitted_at", "deadline", "updated_at"])
        CBTEvent.objects.create(
            tenant=attempt.tenant, attempt=attempt, kind=CBTEvent.Kind.REOPENED, actor=actor,
            detail={"minutes": minutes, "reason": reason, "previous_status": previous,
                    "deadline": attempt.deadline.isoformat()})
    return attempt


def void(attempt, actor, reason, now=None):
    """Void an attempt: it no longer counts, and the student may start again while the paper is open."""
    now = now or timezone.now()
    reason = _reason(reason, required=True)
    with transaction.atomic():
        attempt = _locked(attempt)
        if attempt.status == CBTAttempt.Status.VOIDED:
            raise Refused("This attempt is already voided.", status=409, code="voided")
        previous = attempt.status
        attempt.status = CBTAttempt.Status.VOIDED
        attempt.submitted_at = attempt.submitted_at or now
        attempt.save(update_fields=["status", "submitted_at", "updated_at"])
        CBTEvent.objects.create(
            tenant=attempt.tenant, attempt=attempt, kind=CBTEvent.Kind.VOIDED, actor=actor,
            detail={"reason": reason, "previous_status": previous})
    return attempt
