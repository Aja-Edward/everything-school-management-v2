"""
cbt/analysis.py

How a paper's questions performed once students have sat it.

For each objective question, whatever its kind (see cbt/scoring.py):
- facility: the average share of its marks the students given it earned. For
  a question marked right or wrong, that is the share who got it right;
- discrimination: how much more of its marks the top 27% of the class earned
  than the bottom 27%, ranked by score on the whole paper. Near zero or below
  means the question doesn't tell stronger students from weaker ones, which
  usually points to an ambiguous question or a wrong key. For a question
  marked right or wrong, the point-biserial correlation between getting it
  right and paper score is given as well;
- for a choice question, how many chose each option, overall and in the top
  and bottom groups. A wrong option that draws more of the top group than the
  bottom deserves a look. For choose all that apply, each option a student
  ticked counts;
- for a numeric question, the answers given most often;
- how many left it blank, and the median seconds it was on screen.

Discrimination and reliability mean little with a handful of students, so
they are left out below MIN_STUDENTS.

For the paper:
- a score summary and distribution;
- KR-20 reliability for the objective questions, when every student was given
  the same ones. With random draws, students answered different sets and
  KR-20 doesn't apply. It counts a question as right only when fully right, so
  part marks on a choose-all-that-apply question count as wrong.

A question drawn from the question bank also gets a suggested difficulty from
its facility, once MIN_RESPONSES_FOR_DIFFICULTY students have answered it.
Staff can apply the suggestion to the bank.

Each student's latest finished attempt is used. Scores are the marks awarded
so far out of the marks on offer, so typed answers not yet marked count as 0.
"""

from collections import Counter
from math import sqrt
from statistics import mean, median, pstdev, pvariance

from exam.models import DifficultyLevel

from .access import is_admin
from . import scoring
from .models import CBTAnswer, CBTAttempt, CBTQuestion

FINISHED = (CBTAttempt.Status.SUBMITTED, CBTAttempt.Status.TIMED_OUT)
MIN_STUDENTS = 10
GROUP_SHARE = 0.27
MIN_RESPONSES_FOR_DIFFICULTY = 10
# Facility at or above EASY_FROM suggests easy; below HARD_BELOW, hard; anything between, medium.
EASY_FROM, HARD_BELOW = 0.75, 0.40


def _latest_finished(paper):
    latest = {}
    for attempt in CBTAttempt.objects.filter(paper=paper, status__in=FINISHED).order_by("number"):
        latest[attempt.student_id] = attempt
    return list(latest.values())


def _score(attempt):
    if not attempt.max_score:
        return 0.0
    return float(((attempt.objective_score or 0) + (attempt.text_score or 0)) / attempt.max_score)


def _share(numerator, denominator):
    return round(numerator / denominator, 3) if denominator else None


def _suggested_difficulty(facility, responses):
    if facility is None or responses < MIN_RESPONSES_FOR_DIFFICULTY:
        return None
    if facility >= EASY_FROM:
        return "easy"
    return "hard" if facility < HARD_BELOW else "medium"


def _bank(question, facility, responses):
    bank_question = question.bank_question
    if bank_question is None:
        return None
    return {
        "id": bank_question.id,
        "difficulty": bank_question.difficulty.code if bank_question.difficulty_id else "",
        "suggested_difficulty": _suggested_difficulty(facility, responses),
    }


def _median_seconds(question, takers):
    seconds = [a.time_on_questions.get(str(question.id)) for a in takers]
    seconds = [s for s in seconds if s]
    return int(median(seconds)) if seconds else None


def analyse(paper):
    attempts = _latest_finished(paper)
    count = len(attempts)
    score = {a.id: _score(a) for a in attempts}
    served = {a.id: set(a.question_ids) for a in attempts}

    ranked = sorted(attempts, key=lambda a: score[a.id])
    group = max(1, round(count * GROUP_SHARE)) if count >= MIN_STUDENTS else 0
    lower = {a.id for a in ranked[:group]}
    upper = {a.id for a in ranked[-group:]} if group else set()

    answers = {(a.attempt_id, a.question_id): a for a in CBTAnswer.objects.filter(attempt__in=attempts)}
    questions = list(paper.questions.select_related("bank_question__difficulty").order_by("order"))

    items = []
    for question in questions:
        takers = [a for a in attempts if question.id in served[a.id]]
        if question.is_auto_marked:
            items.append(_objective_item(question, takers, answers, score, upper, lower))
        else:
            items.append(_text_item(question, takers, answers, score, upper, lower))

    return {
        "students": count,
        "enough_students": count >= MIN_STUDENTS,
        "min_students": MIN_STUDENTS,
        "summary": _summary(attempts, score, answers, questions, served),
        "questions": items,
    }


def _objective_item(question, takers, answers, score, upper, lower):
    overall, top, bottom = Counter(), Counter(), Counter()
    marked, typed, omitted = [], [], 0
    for attempt in takers:
        answer = answers.get((attempt.id, question.id))
        chosen = answer.selected_option if answer else ""
        text = answer.text_answer if answer else ""
        right, earned = scoring.score(question, chosen, text)
        marked.append((attempt, right, float(earned / question.marks) if question.marks else 0.0))
        if question.kind == CBTQuestion.Kind.NUMERIC:
            if not text.strip():
                omitted += 1
            typed.append(text)
            continue
        if not chosen:
            omitted += 1
            continue
        for key in chosen:
            overall[key] += 1
            if attempt.id in upper:
                top[key] += 1
            if attempt.id in lower:
                bottom[key] += 1

    right = sum(1 for _, r, _ in marked if r)
    facility = _share(sum(share for _, _, share in marked), len(takers))

    discrimination = None
    top_shares = [share for a, _, share in marked if a.id in upper]
    bottom_shares = [share for a, _, share in marked if a.id in lower]
    if top_shares and bottom_shares:
        discrimination = round(mean(top_shares) - mean(bottom_shares), 3)

    # Only for a question marked right or wrong, where facility is the share right.
    point_biserial = None
    part_marks = question.kind == CBTQuestion.Kind.MULTIPLE and question.partial_credit
    if not part_marks and len(takers) >= MIN_STUDENTS and facility not in (None, 0, 1):
        scores = [score[a.id] for a, _, _ in marked]
        spread = pstdev(scores)
        if spread:
            mean_right = mean(score[a.id] for a, r, _ in marked if r)
            mean_wrong = mean(score[a.id] for a, r, _ in marked if not r)
            point_biserial = round((mean_right - mean_wrong) / spread * sqrt(facility * (1 - facility)), 3)

    flags = []
    if facility is not None and takers:
        if facility < 0.3:
            flags.append({"code": "very_hard"})
        elif facility > 0.9:
            flags.append({"code": "very_easy"})
    if discrimination is not None:
        if discrimination < 0:
            flags.append({"code": "negative_discrimination"})
        elif discrimination < 0.2:
            flags.append({"code": "weak_discrimination"})
    if question.is_choice and not question.award_all and upper:
        for key in question.option_keys:
            if key in question.correct_option:
                continue
            if top[key] >= 2 and top[key] > bottom[key]:
                flags.append({"code": "distractor_draws_strong", "option": key})
            elif overall[key] == 0 and len(takers) >= MIN_STUDENTS:
                flags.append({"code": "unused_option", "option": key})

    item = {
        "id": question.id, "order": question.order, "number": question.source_number, "section": question.section,
        "kind": question.kind, "content": question.content, "marks": str(question.marks),
        "options": question.options, "correct_option": question.correct_option, "award_all": question.award_all,
        "partial_credit": question.partial_credit, "key": scoring.describe_key(question), "unit": question.unit,
        "given_to": len(takers), "correct": right, "omitted": omitted,
        "facility": facility, "discrimination": discrimination, "point_biserial": point_biserial,
        "option_counts": dict(overall), "top_group_counts": dict(top), "bottom_group_counts": dict(bottom),
        "median_seconds": _median_seconds(question, takers),
        "flags": flags,
        "bank": _bank(question, facility, len(takers)),
    }
    if question.kind == CBTQuestion.Kind.NUMERIC:
        item["common_answers"] = scoring.common_numbers(question, typed)
    return item


def _text_item(question, takers, answers, score, upper, lower):
    marks = float(question.marks)
    earned, unmarked, blank = {}, 0, 0
    for attempt in takers:
        answer = answers.get((attempt.id, question.id))
        if answer is None or not answer.text_answer.strip():
            blank += 1
            earned[attempt.id] = 0.0
        elif answer.marks_awarded is None:
            unmarked += 1
        else:
            earned[attempt.id] = float(answer.marks_awarded) / marks if marks else 0.0

    facility = round(mean(earned.values()), 3) if earned else None
    top = [v for k, v in earned.items() if k in upper]
    bottom = [v for k, v in earned.items() if k in lower]
    discrimination = round(mean(top) - mean(bottom), 3) if top and bottom else None
    flags = []
    if facility is not None and facility < 0.3:
        flags.append({"code": "very_hard"})
    if discrimination is not None and discrimination < 0:
        flags.append({"code": "negative_discrimination"})

    return {
        "id": question.id, "order": question.order, "number": question.source_number, "section": question.section,
        "kind": question.kind, "content": question.content, "marks": str(question.marks),
        "given_to": len(takers), "blank": blank, "unmarked": unmarked,
        # For a typed question, facility is the average share of its marks awarded.
        "facility": facility, "discrimination": discrimination,
        "median_seconds": _median_seconds(question, takers),
        "flags": flags,
        "bank": _bank(question, facility, len(earned)),
    }


def _summary(attempts, score, answers, questions, served):
    percentages = [round(score[a.id] * 100, 1) for a in attempts]
    buckets = [0] * 10
    for p in percentages:
        buckets[min(int(p // 10), 9)] += 1

    summary = {
        "fully_marked": sum(1 for a in attempts if a.total_score is not None),
        "mean": round(mean(percentages), 1) if percentages else None,
        "median": round(median(percentages), 1) if percentages else None,
        "spread": round(pstdev(percentages), 1) if len(percentages) > 1 else None,
        "highest": max(percentages) if percentages else None,
        "lowest": min(percentages) if percentages else None,
        "distribution": [{"from": i * 10, "to": 100 if i == 9 else i * 10 + 9, "students": n} for i, n in enumerate(buckets)],
        "kr20": None,
        "kr20_note": "",
    }

    objective_ids = {q.id for q in questions if q.is_auto_marked}
    sets = {frozenset(served[a.id] & objective_ids) for a in attempts}
    if len(attempts) < MIN_STUDENTS:
        summary["kr20_note"] = f"Needs at least {MIN_STUDENTS} students."
    elif len(sets) != 1:
        summary["kr20_note"] = "Students were given different objective questions, so KR-20 doesn't apply."
    else:
        items = sorted(next(iter(sets)))
        by_id = {q.id: q for q in questions}
        if len(items) < 2:
            summary["kr20_note"] = "Needs at least two objective questions."
        else:
            right = {}
            for attempt in attempts:
                for qid in items:
                    answer = answers.get((attempt.id, qid))
                    right[(attempt.id, qid)] = int(scoring.score(
                        by_id[qid], answer.selected_option if answer else "", answer.text_answer if answer else "")[0])
            totals = [sum(right[(a.id, qid)] for qid in items) for a in attempts]
            variance = pvariance(totals)
            if variance:
                k = len(items)
                pq = 0.0
                for qid in items:
                    p = mean(right[(a.id, qid)] for a in attempts)
                    pq += p * (1 - p)
                summary["kr20"] = round(k / (k - 1) * (1 - pq / variance), 3)
            else:
                summary["kr20_note"] = "Every student got the same number right, so KR-20 can't be worked out."
    return summary


def apply_bank_difficulty(paper, question_ids, user, tenant):
    """
    Set each chosen bank question's difficulty to the one its results suggest.
    Only a question's author, an admin or staff may change it.
    """
    items = {item["id"]: item for item in analyse(paper)["questions"]}
    levels = {d.code: d for d in DifficultyLevel.objects.filter(tenant=paper.tenant, code__in=["easy", "medium", "hard"])}
    teacher = getattr(user, "teacher", None)
    may_edit_any = user.is_staff or user.is_superuser or is_admin(user, tenant)
    questions = {q.id: q for q in CBTQuestion.objects.filter(paper=paper, id__in=question_ids)
                 .select_related("bank_question")}

    updated, skipped = [], []
    for qid in question_ids:
        question, item = questions.get(qid), items.get(qid)
        if question is None or item is None or question.bank_question is None:
            skipped.append({"question": qid, "reason": "Not from the question bank"})
            continue
        suggestion = item["bank"]["suggested_difficulty"]
        level = levels.get(suggestion)
        bank_question = question.bank_question
        if suggestion is None:
            skipped.append({"question": qid, "reason": f"Needs at least {MIN_RESPONSES_FOR_DIFFICULTY} students"})
        elif level is None:
            skipped.append({"question": qid, "reason": f"The school has no '{suggestion}' difficulty level"})
        elif not (may_edit_any or (teacher and bank_question.created_by_id == teacher.id)):
            skipped.append({"question": qid, "reason": "Only the question's author or an admin can change it"})
        elif bank_question.difficulty_id == level.id:
            skipped.append({"question": qid, "reason": "Already rated that way"})
        else:
            bank_question.difficulty = level
            bank_question.save(update_fields=["difficulty", "updated_at"])
            updated.append({"question": qid, "bank_question": bank_question.id, "difficulty": suggestion})
    return {"updated": updated, "skipped": skipped}
