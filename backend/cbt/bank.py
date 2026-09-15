"""
cbt/bank.py

Drawing random question-bank questions into an exam, by topic and difficulty.

The drawn questions are written into the exam itself, not onto the CBT paper.
The exam stays the one thing teachers edit, admins approve and CBT papers are
published from. It also means the questions show up in the exam editor and on
the printed paper like any others.

Objective questions are written in the exam editor's shape (optionA, optionB,
... and a letter answer). QuestionBankViewSet.import_to_exam writes the bank's
`options` list instead, which the editor and print view don't show.

A question is not drawn twice into the same exam. Drawn questions carry the
bank question's id, and questions imported some other way are matched on
their text.
"""

import random
import re
import time

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from exam.models import Exam, QuestionBank

from .snapshot import LETTERS

SECTIONS = {"objective": "objective_questions", "theory": "theory_questions"}

_SPACE_RE = re.compile(r"\s+")
_TAG_RE = re.compile(r"<[^>]*>")


def _same_text(html):
    """Question text reduced to what a reader sees, for spotting duplicates."""
    return _SPACE_RE.sub(" ", _TAG_RE.sub(" ", html or "").replace("&nbsp;", " ")).strip().lower()


def topic_key(topic):
    return _SPACE_RE.sub(" ", topic or "").strip().lower()


def visible_questions(user, tenant):
    """
    The bank questions `user` may use, matching QuestionBankViewSet: a teacher
    sees their own and shared ones, staff see all, anyone else shared ones.
    """
    questions = QuestionBank.objects.filter(tenant=tenant)
    teacher = getattr(user, "teacher", None)
    if teacher is not None:
        return questions.filter(Q(created_by=teacher) | Q(is_shared=True))
    if user.is_staff or user.is_superuser:
        return questions
    return questions.filter(is_shared=True)


def candidates(user, exam, question_type, any_grade_level=False):
    """Bank questions that could be drawn into `exam`, leaving out ones it already has."""
    if question_type not in SECTIONS:
        raise ValidationError("Choose objective or theory questions.")

    questions = visible_questions(user, exam.tenant).filter(
        question_type=question_type, subject=exam.subject)
    if not any_grade_level:
        questions = questions.filter(grade_level=exam.grade_level)

    existing = getattr(exam, SECTIONS[question_type]) or []
    used_ids = {q.get("bankQuestionId") for q in existing if isinstance(q, dict)}
    used_text = {_same_text(q.get("question")) for q in existing if isinstance(q, dict)}
    used_text.discard("")

    return [
        question for question in questions.select_related("difficulty").order_by("id")
        if question.id not in used_ids and _same_text(question.question) not in used_text
    ]


def summary(user, exam, question_type, any_grade_level=False):
    """How many questions are available, by topic and difficulty, for the draw form."""
    counts = {}
    for question in candidates(user, exam, question_type, any_grade_level):
        key = (topic_key(question.topic), question.difficulty.code)
        entry = counts.setdefault(key, {
            "topic": (question.topic or "").strip(),
            "difficulty": question.difficulty.code,
            "difficulty_name": question.difficulty.name,
            "count": 0,
        })
        entry["count"] += 1
    return sorted(counts.values(), key=lambda e: (e["topic"].lower(), e["difficulty"]))


def _as_exam_question(question, number):
    image = next((url for url in question.images or [] if isinstance(url, str) and url), "")
    content = question.question or ""
    if (question.table_data or "").lstrip().startswith("<"):
        content += question.table_data
    fields = {
        "id": number,
        "question": content,
        "marks": question.marks,
        "bankQuestionId": question.id,
        "topic": question.topic,
    }
    if image:
        fields["imageUrl"] = image
    if question.question_type == "objective":
        for letter, text in zip(LETTERS, question.options or []):
            fields[f"option{letter}"] = text
        fields["correctAnswer"] = question.correct_answer
        fields.update(question.answer_type_fields())
    else:
        fields["expectedPoints"] = question.expected_points or question.answer_guideline
    return fields


def draw(user, exam, question_type, count, topics=None, difficulties=None,
         any_grade_level=False, rng=None):
    """
    Add `count` random bank questions to `exam`, chosen from the given topics
    and difficulties (all of them when none are given). Returns the bank
    questions drawn, in the order they were added.
    """
    if not isinstance(count, int) or count < 1:
        raise ValidationError("Choose how many questions to add.")

    topic_keys = {topic_key(t) for t in topics or []}
    difficulties = set(difficulties or [])
    rng = rng or random.SystemRandom()

    with transaction.atomic():
        # Locked so two draws at once can't both append to the same JSON and lose one.
        exam = Exam.objects.select_for_update().get(pk=exam.pk)
        pool = [
            question for question in candidates(user, exam, question_type, any_grade_level)
            if (not topic_keys or topic_key(question.topic) in topic_keys)
            and (not difficulties or question.difficulty.code in difficulties)
        ]
        if not pool:
            raise ValidationError("No questions in the bank match. Try other topics or difficulties.")
        if len(pool) < count:
            plural = "" if len(pool) == 1 else "s"
            raise ValidationError(
                f"Only {len(pool)} question{plural} in the bank match; choose {len(pool)} or fewer.")

        drawn = rng.sample(pool, count)
        field = SECTIONS[question_type]
        existing = list(getattr(exam, field) or [])
        # Numeric ids, like the exam editor's Date.now() ones.
        first_id = int(time.time() * 1000)
        existing.extend(_as_exam_question(q, first_id + i) for i, q in enumerate(drawn))
        setattr(exam, field, existing)
        exam.save(update_fields=[field, "updated_at"])

        QuestionBank.objects.filter(id__in=[q.id for q in drawn]).update(
            usage_count=F("usage_count") + 1, last_used=timezone.now())
    return drawn
