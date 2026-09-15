"""
cbt/marking.py

Marking CBT attempts and sending the scores to the school's results.

Objective answers (choices and numbers, see cbt/scoring.py) are marked as soon
as an attempt ends; the attempt's objective_score is their total. Typed answers
are marked by teachers, one question at a time across every student. A blank
typed answer scores 0 and needs no marking. An attempt's total is only set
once everything in it is marked.

A published question's answer can still be corrected, or the question can
give every student its marks when it turns out to be faulty. Either change
re-marks everyone who had the question and is logged in CBTAnswerKeyChange.

Scores go to the results as a score in one component (score column) of one
exam session, scaled to that component's maximum. They are written to the
student's DRAFT result row for the exam's subject, creating it if needed, and
the result model recalculates its total and grade. A result that has already
been approved or published is left alone and reported as skipped.
"""

from collections import Counter
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from common.education_levels import canonical_level_type

from . import scoring
from .engine import Refused
from .models import CBTAnswer, CBTAnswerKeyChange, CBTAttempt, CBTPaper, CBTQuestion
from .snapshot import tolerance

FINISHED = (CBTAttempt.Status.SUBMITTED, CBTAttempt.Status.TIMED_OUT)
TWO_PLACES = Decimal("0.01")


# ── Marking ───────────────────────────────────────────────────────────────────


def mark_attempt(attempt):
    """
    Mark the attempt's objective answers and total up what is marked.
    Returns how many typed answers are still to be marked.
    """
    questions = {q.id: q for q in CBTQuestion.objects.filter(id__in=attempt.question_ids)}
    answers = {a.question_id: a for a in attempt.answers.all()}
    objective = text = Decimal(0)
    unmarked = 0
    changed = []

    for question_id in attempt.question_ids:
        question = questions.get(question_id)
        if question is None:
            continue
        answer = answers.get(question_id)
        if question.is_auto_marked:
            correct, earned = scoring.score(
                question, answer.selected_option if answer else "", answer.text_answer if answer else "")
            objective += earned
            if answer:
                answer.is_correct, answer.marks_awarded = correct, earned
                changed.append(answer)
        elif answer and answer.text_answer.strip():
            if answer.marks_awarded is None:
                unmarked += 1
            else:
                text += answer.marks_awarded

    CBTAnswer.objects.bulk_update(changed, ["is_correct", "marks_awarded"])
    attempt.objective_score = objective
    attempt.text_score = text
    attempt.total_score = objective + text if unmarked == 0 else None
    attempt.save(update_fields=["objective_score", "text_score", "total_score", "updated_at"])
    return unmarked


def _finished_attempts_with(question):
    return CBTAttempt.objects.filter(paper=question.paper, status__in=FINISHED,
                                     question_ids__contains=[question.id])


def _new_key(question, correct_option, numeric_answer, margin):
    """The fields a corrected key sets, checked. Refuses a key the question can't have."""
    if question.kind == CBTQuestion.Kind.NUMERIC:
        answer = str(numeric_answer if numeric_answer is not None else "").strip()
        if scoring.parse_number(answer) is None:
            raise Refused("Write the answer as a number.")
        margin = tolerance(margin)
        if margin is None:
            raise Refused("The margin either side of the answer must be a number, 0 or more.")
        return {"numeric_answer": answer, "tolerance": margin}

    refusal = ("Tick every option that is right." if question.kind == CBTQuestion.Kind.MULTIPLE
               else "Choose one of the question's options.")
    try:
        option = scoring.read_choice(question.kind, question.option_keys, correct_option)
    except ValueError:
        raise Refused(refusal)
    if not option:
        raise Refused(refusal)
    return {"correct_option": option}


def correct_answer_key(question, actor, correct_option="", award_all=False, reason="",
                       numeric_answer=None, margin=None):
    """
    Change a published objective question's answer, or give everyone its marks, and re-mark.

    A choice question takes `correct_option`: one key, or for choose all that
    apply every right key ("A,C"). A numeric question takes `numeric_answer`
    and `margin`, how far either side still counts.
    """
    if not question.is_auto_marked:
        raise Refused("Only objective questions have an answer key.")
    award_all = bool(award_all)
    fields = {} if award_all else _new_key(question, correct_option, numeric_answer, margin)

    with transaction.atomic():
        question = CBTQuestion.objects.select_for_update().get(pk=question.pk)
        change = CBTAnswerKeyChange(
            tenant=question.tenant, question=question, changed_by=actor, reason=(reason or "").strip()[:500],
            previous_option=scoring.describe_key(question), previous_award_all=question.award_all,
            new_award_all=award_all)
        question.award_all = award_all
        for name, value in fields.items():
            setattr(question, name, value)
        question.save(update_fields=["award_all", *fields])
        change.new_option = scoring.describe_key(question)

        attempts = list(_finished_attempts_with(question).select_for_update())
        for attempt in attempts:
            mark_attempt(attempt)
        change.remarked_attempts = len(attempts)
        change.save()
    return change


def set_marks(paper, entries, actor, now=None):
    """
    Record teachers' marks for typed answers:
    [{"attempt": id, "question": id, "marks": number or null}].
    null clears a mark. The whole batch is refused if any entry is wrong.
    """
    now = now or timezone.now()
    if not isinstance(entries, list) or not entries:
        raise Refused("Send the marks to save.")

    with transaction.atomic():
        touched = {}
        for entry in entries:
            try:
                attempt_id, question_id = int(entry.get("attempt")), int(entry.get("question"))
            except (AttributeError, TypeError, ValueError):
                raise Refused("Each mark needs an attempt and a question.")
            attempt = touched.get(attempt_id) or CBTAttempt.objects.select_for_update().filter(
                pk=attempt_id, paper=paper).first()
            if attempt is None:
                raise Refused("That attempt isn't on this paper.", status=404)
            if attempt.status not in FINISHED:
                raise Refused("Only finished attempts can be marked.", status=409)
            question = CBTQuestion.objects.filter(pk=question_id, paper=paper).first()
            if question is None or question.id not in attempt.question_ids:
                raise Refused("That question wasn't on this student's paper.", status=404)
            if question.kind != CBTQuestion.Kind.TEXT:
                raise Refused("Objective questions are marked automatically.")
            answer = attempt.answers.filter(question=question).first()
            if answer is None or not answer.text_answer.strip():
                raise Refused("There is no answer to mark: a blank answer scores 0.")

            raw = entry.get("marks")
            if raw in (None, ""):
                marks = None
            else:
                try:
                    marks = Decimal(str(raw)).quantize(TWO_PLACES)
                except Exception:
                    raise Refused("Marks must be a number.")
                if not Decimal(0) <= marks <= question.marks:
                    # format(..., "f") so 10 reads "10", not normalize()'s "1E+1".
                    most = format(question.marks.normalize(), "f")
                    raise Refused(f"Marks for this question must be between 0 and {most}.")
            answer.marks_awarded = marks
            answer.marked_by = actor if marks is not None else None
            answer.marked_at = now if marks is not None else None
            answer.save(update_fields=["marks_awarded", "marked_by", "marked_at", "updated_at"])
            touched[attempt.id] = attempt

        for attempt in touched.values():
            mark_attempt(attempt)
    return list(touched.values())


# ── What staff see ────────────────────────────────────────────────────────────


def _name(user):
    if user is None:
        return ""
    return getattr(user, "full_name", "") or user.get_full_name() or user.username


def _objective_overview(q, answers, given_to):
    """One objective question's row: its key, and how students answered it."""
    right = sum(1 for a in answers if scoring.score(q, a["selected_option"], a["text_answer"])[0])
    item = {
        "id": q.id, "order": q.order, "number": q.source_number, "kind": q.kind, "content": q.content,
        "options": q.options, "correct_option": q.correct_option, "award_all": q.award_all,
        "partial_credit": q.partial_credit, "numeric_answer": q.numeric_answer,
        "tolerance": scoring.plain_number(q.tolerance), "unit": q.unit, "key": scoring.describe_key(q),
        "marks": str(q.marks), "given_to": given_to,
        "correct": given_to if q.award_all else right,
    }
    if q.kind == CBTQuestion.Kind.NUMERIC:
        texts = [a["text_answer"] for a in answers]
        item["answered"] = sum(1 for t in texts if t.strip())
        item["option_counts"] = {}
        item["common_answers"] = scoring.common_numbers(q, texts)
    else:
        # For choose all that apply, each key a student ticked counts once.
        item["option_counts"] = dict(Counter(key for a in answers for key in a["selected_option"]))
        item["answered"] = sum(1 for a in answers if a["selected_option"])
    return item


def overview(paper):
    """Marking progress, answer-key statistics, and where results go."""
    attempts = list(CBTAttempt.objects.filter(paper=paper, status__in=FINISHED))
    attempt_ids = [a.id for a in attempts]
    questions = list(paper.questions.order_by("order"))
    answers = list(CBTAnswer.objects.filter(attempt_id__in=attempt_ids).values(
        "question_id", "selected_option", "text_answer", "marks_awarded"))
    served = Counter(qid for a in attempts for qid in a.question_ids)

    by_question = {}
    for answer in answers:
        by_question.setdefault(answer["question_id"], []).append(answer)

    objective, text = [], []
    for q in questions:
        mine = by_question.get(q.id, [])
        if q.is_auto_marked:
            objective.append(_objective_overview(q, mine, served[q.id]))
        else:
            written = [a for a in mine if a["text_answer"].strip()]
            text.append({
                "id": q.id, "order": q.order, "number": q.source_number, "section": q.section,
                "content": q.content, "marks": str(q.marks), "given_to": served[q.id],
                "answers": len(written), "marked": sum(1 for a in written if a["marks_awarded"] is not None),
            })

    return {
        "finished_attempts": len(attempts),
        "in_progress": CBTAttempt.objects.filter(paper=paper, status=CBTAttempt.Status.IN_PROGRESS).count(),
        "fully_marked": sum(1 for a in attempts if a.total_score is not None),
        "still_to_mark": sum(t["answers"] - t["marked"] for t in text),
        "objective": objective,
        "text": text,
        "results": {
            "exam_session": paper.result_exam_session_id,
            "exam_session_name": paper.result_exam_session.name if paper.result_exam_session_id else "",
            "component": paper.result_component_id,
            "component_name": paper.result_component.name if paper.result_component_id else "",
            "component_max": str(paper.result_component.max_score) if paper.result_component_id else "",
            "pushed_at": paper.results_pushed_at,
            "pushed_by": _name(paper.results_pushed_by),
        },
        "release": {"mode": paper.result_release, "released_at": paper.results_released_at},
    }


def answers_to_mark(paper, question):
    """Every written answer to one typed question, from finished attempts."""
    if question.kind != CBTQuestion.Kind.TEXT:
        raise Refused("Objective questions are marked automatically.")
    rows = (CBTAnswer.objects.filter(question=question, attempt__status__in=FINISHED)
            .exclude(text_answer="").select_related("attempt__student__user", "marked_by")
            .order_by("attempt_id"))
    return {
        "question": {
            "id": question.id, "number": question.source_number, "section": question.section,
            "content": question.content, "parts": question.parts, "marks": str(question.marks),
            "audio": question.audio or None,
            "marking_guide": question.marking_guide,
        },
        "answers": [{
            "attempt": a.attempt_id,
            "student": a.attempt.student.full_name,
            "text_answer": a.text_answer,
            "marks_awarded": None if a.marks_awarded is None else str(a.marks_awarded),
            "marked_by": _name(a.marked_by),
            "marked_at": a.marked_at,
        } for a in rows if a.text_answer.strip()],
    }


# ── Results ───────────────────────────────────────────────────────────────────


def _result_model(exam):
    from result.models import JuniorSecondaryResult, NurseryResult, PrimaryResult, SeniorSecondaryResult

    level = exam.grade_level.education_level if exam.grade_level_id else None
    return level, {
        "NURSERY": NurseryResult, "PRIMARY": PrimaryResult,
        "JUNIOR_SECONDARY": JuniorSecondaryResult, "SENIOR_SECONDARY": SeniorSecondaryResult,
    }.get(canonical_level_type(level.level_type) if level else None)


def result_targets(paper):
    """The exam sessions and score columns this paper's scores could go to."""
    from result.models import AssessmentComponent, ExamSession

    level, model = _result_model(paper.exam)
    components = AssessmentComponent.objects.filter(
        tenant=paper.tenant, education_level=level, is_active=True) if level else AssessmentComponent.objects.none()
    sessions = ExamSession.objects.filter(tenant=paper.tenant, is_active=True).select_related(
        "academic_session", "term__term_type").order_by("-start_date")
    return {
        "education_level": level.name if level else "",
        "supported": model is not None,
        "exam_sessions": [{"id": s.id, "name": s.name, "academic_session": s.academic_session.name,
                           "term": s.term.term_type.name if s.term_id and s.term.term_type_id else ""}
                          for s in sessions],
        "components": [{"id": c.id, "name": c.name, "code": c.code, "max_score": str(c.max_score),
                        "component_type": c.component_type} for c in components],
    }


def push_results(paper, actor, now=None):
    """
    Write each student's CBT score into their result for the exam's subject.
    Uses the latest finished attempt per student. Returns {"pushed", "skipped"}.
    """
    from result.models import ComponentScore, GradingSystem

    now = now or timezone.now()
    exam = paper.exam
    level, model = _result_model(exam)
    component, session = paper.result_component, paper.result_exam_session
    if component is None or session is None:
        raise Refused("Choose the exam session and score column for these results first.")
    if model is None or component.education_level_id != getattr(level, "id", None):
        raise Refused("That score column isn't for this exam's class level.")
    grading = GradingSystem.objects.filter(tenant=paper.tenant, is_active=True).order_by("id").first()
    if grading is None:
        raise Refused("Set up a grading system in the results settings first.")

    latest = {}
    for attempt in (CBTAttempt.objects.filter(paper=paper, status__in=FINISHED)
                    .select_related("student__user").order_by("number")):
        latest[attempt.student_id] = attempt

    pushed, skipped = 0, []
    for attempt in latest.values():
        student = attempt.student
        if attempt.total_score is None:
            skipped.append({"student": student.full_name, "reason": "Answers still to mark"})
            continue
        if not attempt.max_score:
            skipped.append({"student": student.full_name, "reason": "No marks on the paper"})
            continue
        score = (attempt.total_score / attempt.max_score * component.max_score).quantize(TWO_PLACES, ROUND_HALF_UP)
        with transaction.atomic():
            defaults = {"grading_system": grading, "entered_by": actor}
            if hasattr(model, "stream"):
                defaults["stream"] = student.stream
            result, _ = model.objects.select_for_update().get_or_create(
                tenant=paper.tenant, student=student, subject=exam.subject, exam_session=session,
                defaults=defaults)
            if result.status != "DRAFT":
                skipped.append({"student": student.full_name,
                                "reason": f"Result already {result.get_status_display().lower()}"})
                continue
            ComponentScore.objects.update_or_create(
                tenant=paper.tenant, component=component, **{model.RESULT_FK_NAME: result},
                defaults={"score": min(score, component.max_score)})
            result.save()
            pushed += 1

    paper.results_pushed_at, paper.results_pushed_by = now, actor
    paper.save(update_fields=["results_pushed_at", "results_pushed_by", "updated_at"])
    return {"pushed": pushed, "skipped": skipped}


# ── What students see ─────────────────────────────────────────────────────────


def score_for_student(attempt, now=None):
    """The attempt's score if the paper's release setting lets the student see it, else None."""
    now = now or timezone.now()
    paper = attempt.paper
    if attempt.status not in FINISHED or attempt.total_score is None:
        return None
    if paper.result_release == CBTPaper.ResultRelease.AFTER_CLOSE and not (paper.closes_at and now >= paper.closes_at):
        return None
    if paper.result_release == CBTPaper.ResultRelease.MANUAL and paper.results_released_at is None:
        return None
    percentage = float(attempt.total_score / attempt.max_score * 100) if attempt.max_score else 0.0
    return {"total": str(attempt.total_score), "max": str(attempt.max_score), "percentage": round(percentage, 1)}
