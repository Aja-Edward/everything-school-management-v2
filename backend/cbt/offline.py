"""
cbt/offline.py

Sitting a CBT paper on a school's own exam station, a computer on the school
network that works with no internet (see docs/cbt-offline-station.md).

The cloud's side:

1. make_package() takes a published paper to the station. The package has
   the paper and its questions without answer keys, and the students who may
   sit it, each with a one-off PIN. PINs are shown to staff once, for the
   printed slips, and only hashes go in the package.
2. The station runs the exam with the same engine (cbt/station.py) and sends
   back every finished attempt, each signed with the package's secret.
3. import_results() checks each attempt and stores it here, then marks it
   against the keys that never left.

An attempt is uploaded under the station's id for it, so uploading the same
results twice changes nothing. Attempts can arrive in several batches.
"""

import hashlib
import hmac
import json
import re
import secrets
import uuid
from decimal import Decimal

from django.contrib.auth.hashers import PBKDF2PasswordHasher
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.dateparse import parse_datetime

from exam.models import ExamRegistration
from students.models import Student

from . import scoring
from .engine import MAX_TEXT_ANSWER, Refused, eligible_students
from .marking import mark_attempt
from .models import CBTAnswer, CBTAttempt, CBTEvent, CBTOfflinePackage, CBTPaper, CBTQuestion
from .student_payload import question_for_student

PACKAGE_FORMAT = "cbt-offline-package"
RESULTS_FORMAT = "cbt-offline-results"
VERSION = 1

PIN_DIGITS = 6
# PINs are six digits and only good for one sitting. The hash slows guessing
# from a copied package without making a station take seconds per sign-in.
PIN_ITERATIONS = 20_000

MAX_ATTEMPTS_PER_UPLOAD = 200
MAX_EVENTS_PER_ATTEMPT = 2000
FINISHED = (CBTAttempt.Status.SUBMITTED, CBTAttempt.Status.TIMED_OUT)


# ── Signing ───────────────────────────────────────────────────────────────────


def _plain(value):
    """
    A value as it reads back from any JSON writer. A browser that splits a
    results file into batches writes the float 5.0 as 5, so a whole-number
    float is signed as the integer.
    """
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


def canonical(value):
    return json.dumps(_plain(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def signature(secret, item):
    """The signature of a dict, leaving out any "signature" it already has."""
    body = {k: v for k, v in item.items() if k != "signature"}
    return hmac.new(secret.encode(), canonical(body).encode(), hashlib.sha256).hexdigest()


def hash_pin(pin):
    return PBKDF2PasswordHasher().encode(pin, get_random_string(16), iterations=PIN_ITERATIONS)


# ── Packages ──────────────────────────────────────────────────────────────────


def _new_pins(count):
    """`count` different PINs, none with a leading zero so a spreadsheet can't eat it."""
    pins = set()
    while len(pins) < count:
        pins.add(str(secrets.randbelow(9 * 10 ** (PIN_DIGITS - 1)) + 10 ** (PIN_DIGITS - 1)))
    return list(pins)


def _question(question):
    item = question_for_student(question, question.order)
    del item["number"]
    item.update({"source_number": question.source_number, "order": question.order})
    return item


ONLINE_LINK = re.compile(r"""(?:src|href)\s*=\s*["']?\s*https?://""", re.IGNORECASE)


def _texts(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _texts(item)
    elif isinstance(value, list):
        for item in value:
            yield from _texts(item)


def needs_internet(item):
    """Whether a packaged question shows a picture or plays a sound from the internet, which a station may not reach."""
    if item.get("image_url") or (item.get("audio") or {}).get("url"):
        return True
    return any(ONLINE_LINK.search(text) for text in _texts([item.get(k) for k in ("content", "options", "parts")]))


def make_package(paper, user):
    """
    A package for `paper`, and the PIN slips: (package, slips). Each call
    makes new PINs; earlier packages stay valid for results already sat.
    """
    if paper.status not in (CBTPaper.Status.PUBLISHED, CBTPaper.Status.CLOSED):
        raise Refused("Publish the paper before taking it offline.")

    questions = list(paper.questions.order_by("order"))
    students = list(eligible_students(paper).select_related("user", "student_class").order_by(
        "user__last_name", "user__first_name", "id"))
    if not students:
        raise Refused("No students may sit this paper, so there is no one to make PINs for.")
    extra_time = dict(ExamRegistration.objects.filter(exam=paper.exam, student__in=students)
                      .values_list("student_id", "extra_time_minutes"))

    exam = paper.exam
    package_id = uuid.uuid4()
    secret = secrets.token_hex(32)
    slips, roster = [], []
    for number, (student, pin) in enumerate(zip(students, _new_pins(len(students))), start=1):
        details = {
            "number": number,
            "name": student.full_name,
            "registration_number": student.registration_number or "",
            "class": student.student_class.name if student.student_class_id else "",
        }
        slips.append({**details, "pin": pin})
        roster.append({**details, "id": student.id, "extra_time_minutes": extra_time.get(student.id, 0),
                       "pin_hash": hash_pin(pin)})

    content = {
        "format": PACKAGE_FORMAT,
        "version": VERSION,
        "package_id": str(package_id),
        "secret": secret,
        "made_at": timezone.now().isoformat(),
        "school": {"name": paper.tenant.name, "slug": paper.tenant.slug},
        "paper": {
            "id": paper.id,
            "exam_title": exam.title,
            "subject": exam.subject.name if exam.subject_id else "",
            "grade_level": exam.grade_level.name if exam.grade_level_id else "",
            "instructions": paper.instructions,
            "sections": paper.sections,
            "opens_at": paper.opens_at.isoformat() if paper.opens_at else None,
            "closes_at": paper.closes_at.isoformat() if paper.closes_at else None,
            "duration_minutes": paper.duration_minutes,
            "objective_questions_per_attempt": paper.objective_questions_per_attempt,
            "shuffle_questions": paper.shuffle_questions,
            "shuffle_options": paper.shuffle_options,
            "allow_backtracking": paper.allow_backtracking,
            "max_attempts": paper.max_attempts,
            "access_code": paper.access_code,
        },
        "questions": [_question(q) for q in questions],
        "students": roster,
    }
    package = CBTOfflinePackage.objects.create(
        id=package_id, tenant=paper.tenant, paper=paper, secret=secret, created_by=user,
        question_ids=[q.id for q in questions], student_ids=[s.id for s in students], content=content)
    return package, slips


def package_summary(package):
    """`package` may carry attempt_count, annotated, to save a query per package in a list."""
    maker = package.created_by
    attempts = getattr(package, "attempt_count", None)
    return {
        "id": str(package.id),
        "created_at": package.created_at,
        "created_by": (maker.get_full_name() or maker.username) if maker else "",
        "students": len(package.student_ids),
        "questions": len(package.question_ids),
        "questions_needing_internet": sum(1 for q in package.content.get("questions", []) if needs_internet(q)),
        "attempts_imported": package.attempts.count() if attempts is None else attempts,
    }


# ── Results ───────────────────────────────────────────────────────────────────


def _when(value, name):
    moment = parse_datetime(str(value or ""))
    if moment is None or timezone.is_naive(moment):
        raise ValidationError(f"Its {name} isn't a time with a time zone.")
    return moment


def _check_answer(question, item):
    if not isinstance(item, dict):
        raise ValidationError("An answer isn't in the right form.")
    text = item.get("text_answer") or ""
    if not isinstance(text, str) or len(text) > MAX_TEXT_ANSWER:
        raise ValidationError("A typed answer is too long.")
    try:
        selected = scoring.read_choice(question.kind, question.option_keys, item.get("selected_option") or "") \
            if question.is_choice else ""
    except ValueError:
        raise ValidationError("An answer chooses an option its question doesn't have.")
    if question.is_choice and text:
        raise ValidationError("A choice question has a typed answer.")
    return selected, text if not question.is_choice else ""


def _import_attempt(paper, package, item, questions):
    """Store one attempt: "imported" or "already imported". Raises ValidationError for one that can't be."""
    if not isinstance(item, dict) or not hmac.compare_digest(signature(package.secret, item), str(item.get("signature"))):
        raise ValidationError("It isn't signed by the station this package went to, or it was changed afterwards.")
    try:
        offline_id = uuid.UUID(str(item.get("id")))
    except ValueError:
        raise ValidationError("It has no station id.")
    if CBTAttempt.objects.filter(offline_id=offline_id).exists():
        return "already imported"

    student_id = item.get("student_id")
    if student_id not in package.student_ids:
        raise ValidationError("Its student wasn't given a PIN in this package.")
    student = Student.objects.filter(pk=student_id, tenant=paper.tenant).first()
    if student is None:
        raise ValidationError("Its student is no longer at this school.")

    question_ids = item.get("question_ids")
    if (not isinstance(question_ids, list) or not question_ids
            or any(qid not in package.question_ids for qid in question_ids)
            or any(qid not in questions for qid in question_ids)):
        raise ValidationError("Its questions aren't this paper's questions, which have changed since the package was made.")

    status = item.get("status")
    if status not in FINISHED:
        raise ValidationError("It hadn't finished when the results were saved.")
    started_at, deadline, submitted_at = (_when(item.get(k), k.replace("_", " ")) for k in
                                           ("started_at", "deadline", "submitted_at"))
    if not started_at <= submitted_at:
        raise ValidationError("It was handed in before it started.")

    option_order = item.get("option_order") or {}
    if not isinstance(option_order, dict):
        raise ValidationError("Its option order isn't in the right form.")
    for key, keys in option_order.items():
        question = questions.get(int(key)) if str(key).isdigit() else None
        if question is None or sorted(keys or []) != sorted(question.option_keys):
            raise ValidationError("Its option order doesn't match the paper's options.")

    answers = []
    for answer in item.get("answers") or []:
        question = questions.get(answer.get("question_id")) if isinstance(answer, dict) else None
        if question is None or question.id not in question_ids:
            raise ValidationError("It answers a question that wasn't on its paper.")
        selected, text = _check_answer(question, answer)
        answers.append(CBTAnswer(
            tenant=paper.tenant, question=question, selected_option=selected, text_answer=text,
            flagged=bool(answer.get("flagged")),
            answered_at=_when(answer["answered_at"], "answer time") if answer.get("answered_at") else None))
    if len({a.question_id for a in answers}) != len(answers):
        raise ValidationError("It answers the same question twice.")

    events = []
    kinds = set(CBTEvent.Kind.values)
    for event in (item.get("events") or [])[:MAX_EVENTS_PER_ATTEMPT]:
        if not isinstance(event, dict) or event.get("kind") not in kinds:
            continue
        detail = event.get("detail") if isinstance(event.get("detail"), dict) else {}
        if len(canonical(detail)) > 2000:
            detail = {"truncated": True}
        detail = {**detail, "on_station_at": event.get("recorded_at")}
        client_time = parse_datetime(str(event.get("client_time") or "")) if event.get("client_time") else None
        events.append(CBTEvent(tenant=paper.tenant, kind=event["kind"], detail=detail, client_time=client_time))

    furthest = item.get("furthest_position")
    attempt = CBTAttempt(
        tenant=paper.tenant, paper=paper, student=student,
        registration=ExamRegistration.objects.filter(exam=paper.exam, student=student).first(),
        status=status, started_at=started_at, deadline=deadline, submitted_at=submitted_at,
        question_ids=question_ids, option_order={str(k): v for k, v in option_order.items()},
        max_score=sum((questions[qid].marks for qid in question_ids), Decimal(0)),
        furthest_position=max(0, min(furthest if isinstance(furthest, int) else 0, len(question_ids) - 1)),
        time_on_questions={k: v for k, v in _whole_numbers(item.get("time_on_questions")).items()
                           if k.isdigit() and int(k) in question_ids},
        audio_plays=_whole_numbers(item.get("audio_plays")),
        user_agent="Exam station", last_seen_at=submitted_at,
        offline_package=package, offline_id=offline_id,
    )
    try:
        with transaction.atomic():
            attempt.number = (CBTAttempt.objects.filter(paper=paper, student=student)
                              .aggregate(Max("number"))["number__max"] or 0) + 1
            attempt.save()
            for row in answers + events:
                row.attempt = attempt
            CBTAnswer.objects.bulk_create(answers)
            CBTEvent.objects.bulk_create(events)
            mark_attempt(attempt)
    except IntegrityError:
        # The same results uploaded twice at once: the other upload stored it.
        if CBTAttempt.objects.filter(offline_id=offline_id).exists():
            return "already imported"
        raise
    return "imported"


def _whole_numbers(values):
    return {str(k): v for k, v in (values if isinstance(values, dict) else {}).items()
            if isinstance(v, int) and not isinstance(v, bool) and v >= 0}


def import_results(paper, data):
    """
    Store the attempts in a results file, or a batch of them. Returns
    {"imported", "already_imported", "refused": [{"student", "reason"}]}.
    One attempt that can't be stored doesn't stop the others.
    """
    if not isinstance(data, dict) or data.get("format") != RESULTS_FORMAT:
        raise Refused("That isn't a results file from an exam station.")
    if data.get("version") != VERSION:
        raise Refused("That results file comes from a different version of the exam station. Update the station.")
    try:
        package = CBTOfflinePackage.objects.filter(paper=paper, pk=uuid.UUID(str(data.get("package_id")))).first()
    except ValueError:
        package = None
    if package is None:
        raise Refused("These results are for a different paper, or from a package this paper didn't make.")
    attempts = data.get("attempts")
    if not isinstance(attempts, list):
        raise Refused("The results file has no attempts in it.")
    if len(attempts) > MAX_ATTEMPTS_PER_UPLOAD:
        raise Refused(f"Send at most {MAX_ATTEMPTS_PER_UPLOAD} attempts at a time.")

    questions = {q.id: q for q in paper.questions.all()}
    names = {s.id: s.full_name for s in Student.objects.filter(id__in=package.student_ids).select_related("user")}
    report = {"imported": 0, "already_imported": 0, "refused": []}
    for item in attempts:
        try:
            outcome = _import_attempt(paper, package, item, questions)
        except ValidationError as error:
            student = item.get("student_id") if isinstance(item, dict) else None
            report["refused"].append({"student": names.get(student) or "Unknown student", "reason": error.messages[0]})
            continue
        report["imported" if outcome == "imported" else "already_imported"] += 1
    return report
