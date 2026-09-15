"""
cbt/snapshot.py

Reads an exam's questions, stored as JSON on the Exam, into CBTQuestion rows.

Objective questions reach Exam.objective_questions in two shapes. The exam
editor and document import save flat optionA..optionE keys.
QuestionBankViewSet.import_to_exam saves the bank's `options` list instead.
Both record the correct answer as a letter, but a hand-edited or imported
answer is sometimes the option's text, or a lowercase letter.

Practical questions are never put on a CBT paper: they are done in person.
"""

import re
from decimal import Decimal, InvalidOperation

LETTERS = "ABCDEFGHIJ"

OBJECTIVE_SECTION = "objective"
THEORY_SECTION = "theory"

_TAG_RE = re.compile(r"<[^>]*>")


def is_blank(value):
    """True for None, whitespace, or HTML with no visible text or image."""
    if value is None:
        return True
    text = str(value)
    if "<img" in text.lower():
        return False
    text = _TAG_RE.sub("", text).replace("&nbsp;", " ")
    return not text.strip()


def _text(value):
    if isinstance(value, dict):
        value = value.get("text", value.get("value"))
    return "" if value is None else str(value).strip()


def objective_options(raw):
    """
    The question's non-blank options as [{"key": "A", "text": ...}].

    A blank option keeps the letters after it where they were, so an answer
    recorded as "D" still points at the fourth option.
    """
    options = raw.get("options")
    if isinstance(options, list):
        pairs = zip(LETTERS, options)
    elif isinstance(options, dict):
        pairs = ((letter, options.get(f"option{letter}")) for letter in LETTERS)
    else:
        pairs = (
            (letter, raw.get(f"option{letter}", raw.get(f"option_{letter.lower()}")))
            for letter in LETTERS
        )
    return [{"key": key, "text": _text(value)} for key, value in pairs if not is_blank(value)]


def correct_option(raw, options):
    """The key of the correct option, or "" if the answer matches none."""
    answer = _text(raw.get("correctAnswer", raw.get("correct_answer")))
    if not answer:
        return ""
    keys = {option["key"] for option in options}
    letter = answer.strip(" .()").upper()
    if letter in keys:
        return letter
    for option in options:
        if option["text"].lower() == answer.lower():
            return option["key"]
    return ""


def _marks(value):
    """Marks as a Decimal, or None when missing, unreadable or not positive."""
    if value in (None, ""):
        return None
    try:
        marks = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return marks if marks > 0 else None


def _total_part_marks(parts):
    total = Decimal(0)
    for part in parts or []:
        if not isinstance(part, dict):
            continue
        total += _marks(part.get("marks")) or Decimal(0)
        total += _total_part_marks(part.get("subSubQuestions"))
    return total


def _bank_id(raw):
    """The question-bank id cbt.bank writes onto questions it draws, if there is one."""
    try:
        return int(raw.get("bankQuestionId"))
    except (TypeError, ValueError):
        return None


def _image(raw):
    return _text(raw.get("imageUrl") or raw.get("image") or raw.get("image_url"))


def build_paper(exam, include_objective=True, include_theory=False):
    """
    Read `exam` into (sections, questions, problems).

    sections  -- [{"key", "title", "instructions"}], in paper order
    questions -- unsaved field dicts for CBTQuestion, in paper order
    problems  -- one sentence per question that can't go on a paper as it
                 stands, naming it the way the teacher numbered it
    """
    sections, questions, problems = [], [], []

    def add(section, number, fields):
        questions.append({"section": section, "source_number": number,
                          "order": len(questions) + 1, **fields})

    if include_objective and exam.objective_questions:
        sections.append({"key": OBJECTIVE_SECTION, "title": "Objective",
                         "instructions": exam.objective_instructions or ""})
        for number, raw in enumerate(exam.objective_questions, start=1):
            name = f"Objective question {number}"
            options = objective_options(raw)
            answer = correct_option(raw, options)
            marks = _marks(raw.get("marks", 1))
            image = _image(raw)
            if is_blank(raw.get("question")) and not image:
                problems.append(f"{name} has no question text.")
            if len(options) < 2:
                problems.append(f"{name} needs at least two options.")
            elif not answer:
                problems.append(f"{name} has no correct answer, or its answer is not one of its options.")
            if marks is None:
                problems.append(f"{name} needs marks greater than zero.")
            add(OBJECTIVE_SECTION, number, {
                "kind": "objective", "content": raw.get("question") or "", "image_url": image,
                "options": options, "correct_option": answer, "marks": marks, "bank_question_id": _bank_id(raw),
            })

    text_sections = []
    if include_theory:
        if exam.theory_questions:
            text_sections.append((THEORY_SECTION, "Theory", exam.theory_instructions or "",
                                  exam.theory_questions))
        for index, custom in enumerate(exam.custom_sections or [], start=1):
            if isinstance(custom, dict) and custom.get("questions"):
                text_sections.append((f"custom-{index}", custom.get("name") or f"Section {index}",
                                      custom.get("instructions") or "", custom["questions"]))

    for key, title, instructions, raw_questions in text_sections:
        sections.append({"key": key, "title": title, "instructions": instructions})
        for number, raw in enumerate(raw_questions, start=1):
            name = f"{title} question {number}"
            parts = raw.get("subQuestions") or []
            marks = _marks(raw.get("marks")) or _marks(_total_part_marks(parts))
            image = _image(raw)
            if is_blank(raw.get("question")) and not image and not parts:
                problems.append(f"{name} has no question text.")
            if marks is None:
                problems.append(f"{name} needs marks greater than zero.")
            guide = raw.get("expectedPoints") or raw.get("answerGuideline") or raw.get("markingGuide") or ""
            add(key, number, {
                "kind": "text", "content": raw.get("question") or "", "image_url": image,
                "parts": parts, "table": raw.get("table") or None, "marks": marks,
                "marking_guide": guide if isinstance(guide, str) else "", "bank_question_id": _bank_id(raw),
            })

    return sections, questions, problems
