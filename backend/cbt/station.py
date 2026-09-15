"""
cbt/station.py

The exam station's side of offline CBT (cbt/offline.py has the cloud's).

A station is this same backend, run on a computer on the school network with
CBT_STATION=true (see docs/cbt-offline-station.md). It holds no answer keys
and marks nothing. Students sit the paper with the normal exam engine, and the
finished attempts go back to the cloud to be marked.

import_package() turns a package file into a school, an exam and a published
paper, with a student account and exam registration for each student in it.
The ids in the package are the cloud's; the station keeps each one beside
the station's own id, and export_results() turns them back.

Students sign in with the number and PIN on their slip. Staff unlock the
station's own pages with its key, CBT_STATION_KEY, which also signs them in
as the station's staff account for the invigilation board.
"""

import hmac
import uuid
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from exam.models import Exam, ExamRegistration, ExamStatus, ExamType
from classroom.models import GradeLevel
from students.models import Student
from subject.models import Subject
from tenants.models import Tenant

from .engine import Refused, close_expired_attempts, finalize_if_expired
from .models import CBTAttempt, CBTEvent, CBTOfflinePackage, CBTPaper, CBTQuestion
from .offline import PACKAGE_FORMAT, RESULTS_FORMAT, VERSION, signature

User = get_user_model()
STAFF_USERNAME = "station-staff"


def is_station():
    return bool(getattr(settings, "CBT_STATION", False))


MIN_KEY_LENGTH = 12


def key_matches(key):
    """A station with no key, or one too short to be safe, opens to no key at all."""
    expected = getattr(settings, "CBT_STATION_KEY", "") or ""
    return len(expected) >= MIN_KEY_LENGTH and bool(key) and hmac.compare_digest(str(key), expected)


# ── Importing a package ──────────────────────────────────────────────────────


def _moment(value):
    moment = parse_datetime(str(value or ""))
    return moment if moment and timezone.is_aware(moment) else None


def _cloud_parts(parts):
    """Student payload parts back into the exam editor's shape, which the engine reads."""
    result = []
    for part in parts or []:
        if not isinstance(part, dict):
            continue
        item = {k: v for k, v in part.items() if k != "parts"}
        if part.get("parts"):
            item["subSubQuestions"] = _cloud_parts(part["parts"])
        result.append(item)
    return result


def _school(school):
    """The station's school, made from the first package loaded. A station serves one school."""
    held = CBTOfflinePackage.objects.select_related("tenant").first()
    if held and held.tenant.slug != school["slug"]:
        raise Refused(f"This station holds papers for {held.tenant.name}. A package from another school "
                      "needs its own station.", status=409, code="other_school")
    tenant = Tenant.objects.filter(slug=school["slug"]).first()
    if tenant is None:
        # Creating the school seeds its grade levels, exam types and statuses.
        tenant = Tenant.objects.create(
            name=school.get("name") or school["slug"], slug=school["slug"], status="active", is_active=True,
            owner_email=f"station@{school['slug']}.invalid")
    staff = User.objects.filter(username=STAFF_USERNAME).first()
    if staff is None:
        staff = User.objects.create_user(
            username=STAFF_USERNAME, email=f"staff@{school['slug']}.invalid", role="admin", password=None,
            first_name="Exam", last_name="Station", is_active=True, tenant=tenant)
    return tenant


def _student(tenant, exam, entry):
    first, _, last = (entry.get("name") or "Student").partition(" ")
    user = User.objects.filter(username=f"station-student-{entry['id']}").first()
    if user is None:
        user = User.objects.create_user(
            username=f"station-student-{entry['id']}", email=f"student-{entry['id']}@station.invalid",
            role="student", password=None, first_name=first, last_name=last or "", is_active=True, tenant=tenant)
    student = Student.objects.filter(user=user).first()
    if student is None:
        # Gender and date of birth are required by the model but never used on a station.
        student = Student.objects.create(
            user=user, tenant=tenant, gender="M", date_of_birth=date(2000, 1, 1),
            registration_number=(entry.get("registration_number") or "")[:20] or None)
    ExamRegistration.objects.update_or_create(
        exam=exam, student=student,
        defaults={"is_registered": True, "extra_time_minutes": int(entry.get("extra_time_minutes") or 0)})
    return student


def import_package(data):
    """Load a package file onto the station. Loading the same package again changes nothing."""
    if not isinstance(data, dict) or data.get("format") != PACKAGE_FORMAT:
        raise Refused("That isn't a CBT package file.")
    if data.get("version") != VERSION:
        raise Refused("That package was made by a different version. Update the exam station.")
    try:
        package_id = uuid.UUID(str(data.get("package_id")))
    except ValueError:
        raise Refused("That package file is damaged: it has no package id.")
    existing = CBTOfflinePackage.objects.filter(pk=package_id).first()
    if existing:
        return existing

    source = data.get("paper") or {}
    opens_at, closes_at = _moment(source.get("opens_at")), _moment(source.get("closes_at"))
    if not (opens_at and closes_at and source.get("duration_minutes")):
        raise Refused("That package file is damaged: the paper has no window or duration.")

    with transaction.atomic():
        tenant = _school(data["school"])
        subject, _ = Subject.objects.get_or_create(
            tenant=tenant, code=f"CBT{source['id']}"[:15], defaults={"name": (source.get("subject") or "Exam")[:100]})
        local_opens = timezone.localtime(opens_at)
        exam = Exam.objects.create(
            tenant=tenant, title=source.get("exam_title") or "Exam", subject=subject,
            # The invigilation board shows it; a station's school is seeded with the usual ones.
            grade_level=(GradeLevel.objects.filter(tenant=tenant, name=source.get("grade_level") or "").first()
                         or GradeLevel.objects.filter(tenant=tenant).first()),
            exam_type=ExamType.objects.filter(tenant=tenant).first(),
            status=ExamStatus.objects.filter(tenant=tenant, code="approved").first() or ExamStatus.objects.filter(tenant=tenant).first(),
            exam_date=local_opens.date(), start_time=local_opens.time().replace(microsecond=0),
            end_time=timezone.localtime(closes_at).time().replace(microsecond=0),
            duration_minutes=source["duration_minutes"], instructions=source.get("instructions") or "")
        paper = CBTPaper.objects.create(
            tenant=tenant, exam=exam, status=CBTPaper.Status.PUBLISHED, published_at=timezone.now(),
            opens_at=opens_at, closes_at=closes_at, duration_minutes=source["duration_minutes"],
            include_objective=True, include_theory=True,
            objective_questions_per_attempt=source.get("objective_questions_per_attempt"),
            shuffle_questions=bool(source.get("shuffle_questions")), shuffle_options=bool(source.get("shuffle_options")),
            allow_backtracking=bool(source.get("allow_backtracking", True)), max_attempts=source.get("max_attempts") or 1,
            access_code=source.get("access_code") or "", instructions=source.get("instructions") or "",
            sections=source.get("sections") or [])

        content = {**data, "questions": [], "students": []}
        for question in data.get("questions") or []:
            row = CBTQuestion.objects.create(
                tenant=tenant, paper=paper, kind=question["kind"], section=question["section"],
                source_number=question.get("source_number") or question["order"], order=question["order"],
                content=question.get("content") or "", image_url=question.get("image_url") or "",
                audio=question.get("audio") or {}, options=question.get("options") or [],
                parts=_cloud_parts(question.get("parts")), table=question.get("table"),
                marks=Decimal(str(question["marks"])), unit=question.get("unit") or "", key_withheld=True)
            content["questions"].append({**question, "local_id": row.id})
        for entry in data.get("students") or []:
            student = _student(tenant, exam, entry)
            content["students"].append({**entry, "local_id": student.id})

        return CBTOfflinePackage.objects.create(
            id=package_id, tenant=tenant, paper=paper, secret=data["secret"],
            question_ids=[q["id"] for q in data.get("questions") or []],
            student_ids=[s["id"] for s in data.get("students") or []], content=content)


def status():
    """What the station holds, for its front page. Nothing secret."""
    packages = CBTOfflinePackage.objects.select_related("paper__exam", "tenant").order_by("paper__opens_at")
    now = timezone.now()
    first = packages.first()
    return {
        "station": True,
        "server_time": now,
        "school": {"name": first.tenant.name, "slug": first.tenant.slug} if first else None,
        "papers": [{
            "package": str(p.id),
            "paper": p.paper_id,
            "exam_title": p.paper.exam.title,
            "subject": (p.content.get("paper") or {}).get("subject", ""),
            "opens_at": p.paper.opens_at,
            "closes_at": p.paper.closes_at,
            "duration_minutes": p.paper.duration_minutes,
            "is_open": p.paper.opens_at <= now < p.paper.closes_at,
            "students": len(p.student_ids),
        } for p in packages],
    }


# ── Signing in ────────────────────────────────────────────────────────────────


def student_for_pin(package_id, number, pin):
    """The station's student with this slip number and PIN, or None."""
    try:
        package = CBTOfflinePackage.objects.filter(pk=uuid.UUID(str(package_id))).first()
    except ValueError:
        return None
    if package is None:
        return None
    entry = next((s for s in package.content.get("students", []) if str(s.get("number")) == str(number).strip()), None)
    if entry is None or not check_password(str(pin).strip(), entry.get("pin_hash") or "!"):
        return None
    return Student.objects.select_related("user").filter(pk=entry["local_id"]).first()


def staff_user():
    return User.objects.filter(username=STAFF_USERNAME).first()


def set_window(package, opens_at, closes_at):
    """Move the paper's window, for an exam day that didn't go to plan."""
    opens, closes = _moment(opens_at), _moment(closes_at)
    if not (opens and closes and closes > opens):
        raise Refused("Give an opening and closing time, closing after it opens.")
    paper = package.paper
    paper.opens_at, paper.closes_at = opens, closes
    paper.save(update_fields=["opens_at", "closes_at", "updated_at"])
    return paper


# ── Exporting results ─────────────────────────────────────────────────────────


def export_results(package, now=None):
    """
    The package's finished attempts as a results file for the cloud, each
    signed. Attempts whose time is up are ended first. Attempts still in
    progress, and voided ones, are counted but not sent.
    """
    now = now or timezone.now()
    close_expired_attempts(now)
    cloud_question = {q["local_id"]: q["id"] for q in package.content.get("questions", [])}
    cloud_student = {s["local_id"]: s["id"] for s in package.content.get("students", [])}

    def cloud_clip(key):
        kind, _, local = key.partition(":")
        if kind == "question" and local.isdigit():
            return f"question:{cloud_question.get(int(local))}" if int(local) in cloud_question else None
        return key

    attempts, in_progress, voided = [], 0, 0
    for attempt in (CBTAttempt.objects.filter(paper=package.paper).select_related("student")
                    .prefetch_related("answers", "events").order_by("id")):
        attempt = finalize_if_expired(attempt, now)
        if attempt.status == CBTAttempt.Status.IN_PROGRESS:
            in_progress += 1
            continue
        if attempt.status == CBTAttempt.Status.VOIDED:
            voided += 1
            continue
        if attempt.offline_id is None:
            attempt.offline_id = uuid.uuid4()
            attempt.save(update_fields=["offline_id", "updated_at"])
        item = {
            "id": str(attempt.offline_id),
            "student_id": cloud_student[attempt.student_id],
            "status": attempt.status,
            "started_at": attempt.started_at.isoformat(),
            "deadline": attempt.deadline.isoformat(),
            "submitted_at": attempt.submitted_at.isoformat(),
            "question_ids": [cloud_question[qid] for qid in attempt.question_ids],
            "option_order": {str(cloud_question[int(k)]): v for k, v in (attempt.option_order or {}).items()},
            "furthest_position": attempt.furthest_position,
            "time_on_questions": {str(cloud_question[int(k)]): v for k, v in (attempt.time_on_questions or {}).items()
                                  if k.isdigit() and int(k) in cloud_question},
            "audio_plays": {cloud_clip(k): v for k, v in (attempt.audio_plays or {}).items() if cloud_clip(k)},
            "answers": [{
                "question_id": cloud_question[a.question_id], "selected_option": a.selected_option,
                "text_answer": a.text_answer, "flagged": a.flagged,
                "answered_at": a.answered_at.isoformat() if a.answered_at else None,
            } for a in attempt.answers.all()],
            "events": [{
                "kind": e.kind, "detail": e.detail,
                "client_time": e.client_time.isoformat() if e.client_time else None,
                "recorded_at": e.recorded_at.isoformat(),
            } for e in attempt.events.all()],
        }
        item["signature"] = signature(package.secret, item)
        attempts.append(item)

    return {
        "format": RESULTS_FORMAT,
        "version": VERSION,
        "package_id": str(package.id),
        "exported_at": now.isoformat(),
        "exam_title": package.paper.exam.title,
        "attempts": attempts,
        "still_in_progress": in_progress,
        "voided": voided,
    }
