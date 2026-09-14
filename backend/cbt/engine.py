"""
cbt/engine.py

A student sitting a CBT paper: which papers they may sit, starting and resuming
an attempt, saving answers, and ending it.

Only the server's clock counts. The deadline is fixed when the attempt starts,
and answers are accepted until then plus GRACE, which covers a save that was
already on its way when time ran out. After that the attempt ends as timed out.
It ends the next time anything touches it, or when close_expired_attempts()
sweeps it up, whichever comes first.

An attempt belongs to one device at a time. Starting or resuming issues a
session token that every later request must carry. Opening the exam on another
device issues a new token, logs the switch for invigilators, and locks the
first device out. If the paper has an access code, a new device needs the code
as well, so a shared login alone isn't enough to take over someone's exam.
"""

import hashlib
import json
import secrets
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from exam.models import ExamRegistration
from students.models import Student

from .models import CBTAnswer, CBTAttempt, CBTEvent, CBTPaper, CBTQuestion
from .student_payload import paper_for_student

GRACE = timedelta(seconds=30)
MAX_TEXT_ANSWER = 20_000
MAX_ANSWERS_PER_SAVE = 200
MAX_EVENTS_PER_REQUEST = 50

# The events a student's browser may report. The rest are recorded by the server.
CLIENT_EVENT_KINDS = frozenset({
    CBTEvent.Kind.FOCUS_LOST, CBTEvent.Kind.FOCUS_RETURNED, CBTEvent.Kind.FULLSCREEN_EXITED,
    CBTEvent.Kind.COPY_ATTEMPTED, CBTEvent.Kind.PASTE_ATTEMPTED,
    CBTEvent.Kind.CONNECTION_LOST, CBTEvent.Kind.RECONNECTED,
})


class Refused(Exception):
    """Something the exam's rules don't allow, with the HTTP status and a code the client can act on."""

    def __init__(self, message, status=400, code="refused"):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code


# ── Who may sit what ─────────────────────────────────────────────────────────


def student_for(user, tenant):
    if tenant is None:
        return None
    return (Student.objects.select_related("student_class")
            .filter(user=user, tenant=tenant, is_active=True).first())


def eligible_papers(student):
    """
    Published (or closed) papers `student` may sit.

    A student may sit an exam if they are registered for it, or if they are in
    its class: their class's grade level, and the exam's section and stream
    when it names one. A registration marked not registered keeps them out.
    """
    registrations = ExamRegistration.objects.filter(student=student)
    in_class = Q(pk__in=[])
    grade_level_id = student.student_class.grade_level_id if student.student_class_id else None
    if grade_level_id:
        in_class = (
            Q(exam__grade_level_id=grade_level_id)
            & (Q(exam__section__isnull=True) | Q(exam__section_id=student.section_id))
            & (Q(exam__stream__isnull=True) | Q(exam__stream_id=student.stream_id))
        )
    return (
        CBTPaper.objects.filter(tenant=student.tenant,
                                status__in=[CBTPaper.Status.PUBLISHED, CBTPaper.Status.CLOSED])
        .filter(in_class | Q(exam_id__in=registrations.filter(is_registered=True).values("exam_id")))
        .exclude(exam_id__in=registrations.filter(is_registered=False).values("exam_id"))
        .exclude(exam__status__code="cancelled")
        .select_related("exam", "exam__subject")
    )


# ── Attempt state ─────────────────────────────────────────────────────────────


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _new_session(attempt):
    token = secrets.token_urlsafe(32)
    attempt.session_token_hash = _hash(token)
    return token


def _session_matches(attempt, token):
    return bool(token) and secrets.compare_digest(attempt.session_token_hash, _hash(token))


def attempt_state(attempt, now, session_token=None):
    in_progress = attempt.status == CBTAttempt.Status.IN_PROGRESS
    state = {
        "id": attempt.id,
        "paper": attempt.paper_id,
        "exam_title": attempt.paper.exam.title,
        "number": attempt.number,
        "status": attempt.status,
        "started_at": attempt.started_at,
        "deadline": attempt.deadline,
        "submitted_at": attempt.submitted_at,
        "server_time": now,
        "seconds_left": max(0, int((attempt.deadline - now).total_seconds())) if in_progress else 0,
        "allow_backtracking": attempt.paper.allow_backtracking,
        "furthest_position": attempt.furthest_position,
        "question_count": len(attempt.question_ids),
    }
    if session_token:
        state["session_token"] = session_token
    return state


def my_exams(student, now=None):
    """Every paper the student may sit, with where they are with it."""
    now = now or timezone.now()
    papers = list(eligible_papers(student).order_by("opens_at"))
    attempts = {}
    for attempt in (CBTAttempt.objects.filter(student=student, paper__in=papers)
                    .select_related("paper__exam").order_by("number")):
        finalize_if_expired(attempt, now)
        attempts.setdefault(attempt.paper_id, []).append(attempt)

    items = []
    for paper in papers:
        mine = attempts.get(paper.id, [])
        counted = [a for a in mine if a.status != CBTAttempt.Status.VOIDED]
        latest = mine[-1] if mine else None
        attempts_left = max(0, paper.max_attempts - len(counted))
        if latest and latest.status == CBTAttempt.Status.IN_PROGRESS:
            state = "in_progress"
        elif now < paper.opens_at:
            state = "upcoming"
        elif now < paper.closes_at and attempts_left and paper.status == CBTPaper.Status.PUBLISHED:
            state = "open"
        elif any(a.status in (CBTAttempt.Status.SUBMITTED, CBTAttempt.Status.TIMED_OUT) for a in counted):
            state = "done"
        else:
            state = "missed"
        items.append({
            "paper": paper.id,
            "exam_title": paper.exam.title,
            "subject": paper.exam.subject.name if paper.exam.subject_id else "",
            "opens_at": paper.opens_at,
            "closes_at": paper.closes_at,
            "duration_minutes": paper.duration_minutes,
            "requires_access_code": bool(paper.access_code),
            "state": state,
            "attempts_left": attempts_left,
            "attempt": attempt_state(latest, now) if latest else None,
        })
    return {"server_time": now, "exams": items}


# ── Starting and resuming ────────────────────────────────────────────────────


def _code_matches(paper, access_code):
    return not paper.access_code or (access_code or "").strip().upper() == paper.access_code.strip().upper()


def start(student, paper_id, access_code="", session_token=None, ip_address=None, user_agent="", now=None):
    """
    Start the student on a paper, or pick up the attempt they have in progress.

    Returns (attempt, token). The token is None when the caller's existing
    session carries on, and a new token whenever a session is issued.
    """
    now = now or timezone.now()
    paper = eligible_papers(student).filter(pk=paper_id).first()
    if paper is None:
        raise Refused("This exam isn't one you are entered for.", status=404, code="not_found")

    attempt = CBTAttempt.objects.filter(
        paper=paper, student=student, status=CBTAttempt.Status.IN_PROGRESS).first()
    if attempt:
        attempt = finalize_if_expired(attempt, now)
        if attempt.status != CBTAttempt.Status.IN_PROGRESS:
            return attempt, None
        if _session_matches(attempt, session_token):
            return attempt, None
        if not _code_matches(paper, access_code):
            raise Refused("Enter the access code to continue this exam on this device.",
                          status=403, code="access_code")
        return _take_over(attempt, ip_address, user_agent, now)

    if not _code_matches(paper, access_code):
        raise Refused("That access code isn't right." if access_code else "Enter the access code to start.",
                      status=403, code="access_code")
    try:
        attempt = CBTAttempt.start(paper, student, now=now, ip_address=ip_address, user_agent=user_agent)
    except ValidationError as error:
        raise Refused(error.messages[0], status=409, code="cannot_start")
    token = _new_session(attempt)
    attempt.save(update_fields=["session_token_hash", "updated_at"])
    return attempt, token


def _take_over(attempt, ip_address, user_agent, now):
    with transaction.atomic():
        attempt = CBTAttempt.objects.select_for_update().select_related("paper__exam").get(pk=attempt.pk)
        moved = (ip_address, (user_agent or "")[:255]) != (attempt.ip_address, attempt.user_agent)
        token = _new_session(attempt)
        attempt.ip_address, attempt.user_agent, attempt.last_seen_at = ip_address, (user_agent or "")[:255], now
        attempt.save(update_fields=["session_token_hash", "ip_address", "user_agent", "last_seen_at", "updated_at"])
        CBTEvent.objects.create(
            tenant=attempt.tenant, attempt=attempt, ip_address=ip_address,
            kind=CBTEvent.Kind.DEVICE_CHANGED if moved else CBTEvent.Kind.RESUMED,
            detail={"user_agent": (user_agent or "")[:255]})
    return attempt, token


def attempt_for(student, attempt_id, session_token, now=None):
    """
    The student's own attempt, ended first if its time is up. An attempt still in
    progress must be asked for from the device holding its session.
    """
    now = now or timezone.now()
    attempt = (CBTAttempt.objects.select_related("paper__exam", "paper__exam__subject")
               .filter(pk=attempt_id, student=student).first())
    if attempt is None:
        raise Refused("Attempt not found.", status=404, code="not_found")
    attempt = finalize_if_expired(attempt, now)
    if attempt.status == CBTAttempt.Status.IN_PROGRESS and not _session_matches(attempt, session_token):
        raise Refused("This exam has been opened on another device.", status=409, code="session_replaced")
    return attempt


def attempt_detail(attempt, now):
    """State, plus the paper and saved answers while the attempt is in progress."""
    detail = {"attempt": attempt_state(attempt, now)}
    if attempt.status != CBTAttempt.Status.IN_PROGRESS:
        # Once finished, the paper isn't sent again: others may still be sitting it.
        return detail
    by_id = {q.id: q for q in CBTQuestion.objects.filter(id__in=attempt.question_ids)}
    questions = [by_id[qid] for qid in attempt.question_ids if qid in by_id]
    detail["paper"] = paper_for_student(attempt.paper, questions, attempt.option_order)
    detail["answers"] = [
        {"question_id": a.question_id, "selected_option": a.selected_option,
         "text_answer": a.text_answer, "flagged": a.flagged}
        for a in attempt.answers.all()
    ]
    return detail


# ── Answers, activity and ending ─────────────────────────────────────────────


def _locked_in_progress(attempt, now):
    """
    Re-read the attempt under a row lock, refusing if it has ended. Call inside
    a transaction, after finalize_if_expired(). Ending it here would be rolled
    back along with the refusal.
    """
    attempt = CBTAttempt.objects.select_for_update().select_related("paper__exam").get(pk=attempt.pk)
    if attempt.status != CBTAttempt.Status.IN_PROGRESS or now > attempt.deadline + GRACE:
        raise Refused("This attempt has ended.", status=409, code="ended")
    return attempt


def save_answers(attempt, answers, now=None):
    """
    Save a batch of answers. Each item is the whole current answer to one
    question: {"question_id", "selected_option", "text_answer", "flagged"}.
    One bad item refuses the whole batch.
    """
    now = now or timezone.now()
    if not isinstance(answers, list) or not answers:
        raise Refused("Send the answers to save.")
    if len(answers) > MAX_ANSWERS_PER_SAVE:
        raise Refused(f"Send at most {MAX_ANSWERS_PER_SAVE} answers at a time.")

    attempt = finalize_if_expired(attempt, now)
    with transaction.atomic():
        attempt = _locked_in_progress(attempt, now)
        positions = {qid: i for i, qid in enumerate(attempt.question_ids)}
        questions = {q.id: q for q in CBTQuestion.objects.filter(id__in=attempt.question_ids)}

        rows, furthest = {}, attempt.furthest_position
        for item in answers:
            try:
                question = questions[int(item.get("question_id"))]
            except (AttributeError, KeyError, TypeError, ValueError):
                raise Refused("That question is not on your paper.")
            selected = str(item.get("selected_option") or "").strip().upper()
            text = item.get("text_answer") or ""
            if not isinstance(text, str) or len(text) > MAX_TEXT_ANSWER:
                raise Refused(f"Answers can be at most {MAX_TEXT_ANSWER:,} characters.")
            if question.kind == CBTQuestion.Kind.OBJECTIVE:
                if text:
                    raise Refused("Objective questions are answered by choosing an option.")
                if selected and selected not in question.option_keys:
                    raise Refused("That option is not one of the question's options.")
            elif selected:
                raise Refused("This question is answered by typing.")

            position = positions[question.id]
            if not attempt.paper.allow_backtracking and position < attempt.furthest_position:
                raise Refused("This exam doesn't allow going back to earlier questions.",
                              status=409, code="no_backtracking")
            furthest = max(furthest, position)
            # A question sent twice in one batch keeps its last answer.
            rows[question.id] = CBTAnswer(
                tenant=attempt.tenant, attempt=attempt, question=question, selected_option=selected,
                text_answer=text, flagged=bool(item.get("flagged")), answered_at=now)

        CBTAnswer.objects.bulk_create(
            rows.values(), update_conflicts=True, unique_fields=["attempt", "question"],
            update_fields=["selected_option", "text_answer", "flagged", "answered_at", "updated_at"])
        attempt.furthest_position, attempt.last_seen_at = furthest, now
        attempt.save(update_fields=["furthest_position", "last_seen_at", "updated_at"])
    return attempt, len(rows)


def heartbeat(attempt, position=None, now=None):
    """The exam page checking in: keeps last_seen current and records how far the student has moved."""
    now = now or timezone.now()
    attempt = finalize_if_expired(attempt, now)
    with transaction.atomic():
        attempt = _locked_in_progress(attempt, now)
        fields = ["last_seen_at", "updated_at"]
        attempt.last_seen_at = now
        if isinstance(position, int) and 0 <= position < len(attempt.question_ids) \
                and position > attempt.furthest_position:
            attempt.furthest_position = position
            fields.append("furthest_position")
        attempt.save(update_fields=fields)
    return attempt


def record_events(attempt, events, ip_address=None):
    """Log what the browser saw. Kinds a browser may not report are ignored."""
    if not isinstance(events, list):
        raise Refused("Send a list of events.")
    rows = []
    for item in events[:MAX_EVENTS_PER_REQUEST]:
        if not isinstance(item, dict) or item.get("kind") not in CLIENT_EVENT_KINDS:
            continue
        detail = item.get("detail") if isinstance(item.get("detail"), dict) else {}
        if len(json.dumps(detail, default=str)) > 2000:
            detail = {"truncated": True}
        client_time = parse_datetime(str(item.get("client_time") or "")) if item.get("client_time") else None
        rows.append(CBTEvent(tenant=attempt.tenant, attempt=attempt, kind=item["kind"], detail=detail,
                             client_time=client_time, ip_address=ip_address))
    CBTEvent.objects.bulk_create(rows)
    return len(rows)


def _end(attempt, now, timed_out):
    """End a locked, in-progress attempt."""
    attempt.status = CBTAttempt.Status.TIMED_OUT if timed_out else CBTAttempt.Status.SUBMITTED
    # A timed-out attempt ended when its time ran out, however late it is noticed.
    attempt.submitted_at = attempt.deadline if timed_out else now
    attempt.save(update_fields=["status", "submitted_at", "updated_at"])
    CBTEvent.objects.create(
        tenant=attempt.tenant, attempt=attempt,
        kind=CBTEvent.Kind.TIMED_OUT if timed_out else CBTEvent.Kind.SUBMITTED)


def submit(attempt, now=None):
    """
    End the attempt at the student's request. Submitting twice is harmless.

    A submit that arrives after the deadline counts as timed out, even inside
    the grace window. The exam page submits by itself when its clock reaches
    zero, and those students did run out of time.
    """
    now = now or timezone.now()
    with transaction.atomic():
        attempt = CBTAttempt.objects.select_for_update().select_related("paper__exam").get(pk=attempt.pk)
        if attempt.status == CBTAttempt.Status.IN_PROGRESS:
            _end(attempt, now, timed_out=now > attempt.deadline)
    return attempt


def finalize_if_expired(attempt, now=None):
    """End an in-progress attempt whose time is up; return the attempt as it now stands."""
    now = now or timezone.now()
    if attempt.status != CBTAttempt.Status.IN_PROGRESS or now <= attempt.deadline + GRACE:
        return attempt
    with transaction.atomic():
        attempt = CBTAttempt.objects.select_for_update().select_related("paper__exam").get(pk=attempt.pk)
        if attempt.status == CBTAttempt.Status.IN_PROGRESS:
            _end(attempt, now, timed_out=True)
    return attempt


def close_expired_attempts(now=None):
    """End every attempt whose time is up. Returns how many were ended."""
    now = now or timezone.now()
    ended = 0
    for attempt in CBTAttempt.objects.filter(
            status=CBTAttempt.Status.IN_PROGRESS, deadline__lt=now - GRACE):
        if finalize_if_expired(attempt, now).status == CBTAttempt.Status.TIMED_OUT:
            ended += 1
    return ended
