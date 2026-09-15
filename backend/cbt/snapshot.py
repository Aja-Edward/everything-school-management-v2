"""
cbt/snapshot.py

Reads an exam's questions, stored as JSON on the Exam, into CBTQuestion rows.

Objective questions reach Exam.objective_questions in two shapes. The exam
editor and document import save flat optionA..optionE keys.
QuestionBankViewSet.import_to_exam saves the bank's `options` list instead.
Both record the correct answer as a letter, but a hand-edited or imported
answer is sometimes the option's text, or a lowercase letter.

An objective question's `questionType` says how it is answered (see
cbt/scoring.py). Missing, it is a choose-one question, as every question was
before types existed:
- "true_false": answered True or False. Its answer is "A"/"B" or the word;
- "multiple": choose all that apply. Its answer lists letters, "A,C", and
  `partialCredit` gives marks for part of the right choices;
- "numeric": its answer is a number, with an optional `tolerance` either side
  and a `unit` shown to students.

A question or section may have a sound clip, for listening tests:
    {"url": "https://...", "title": "...", "plays": 2, "duration": 45.2}
A question keeps it under "audio"; the objective and theory sections under
Exam.section_audio["objective"] and ["theory"]; a custom section under its
own "audio". `plays` is how many times a student may play it, 0 for as often
as they like. `duration` is in seconds, as the upload reported it.

Practical questions are never put on a CBT paper: they are done in person.
"""

import re
from decimal import Decimal, InvalidOperation

from .scoring import MULTIPLE, NUMERIC, OBJECTIVE, TRUE_FALSE, parse_keys, parse_number

LETTERS = "ABCDEFGHIJ"
TRUE_FALSE_OPTIONS = [{"key": "A", "text": "True"}, {"key": "B", "text": "False"}]
MAX_UNIT_LENGTH = 30
MAX_PLAYS = 10

_QUESTION_TYPES = {
    "": OBJECTIVE, "single": OBJECTIVE, "objective": OBJECTIVE,
    "true_false": TRUE_FALSE, "truefalse": TRUE_FALSE, "true-false": TRUE_FALSE,
    "multiple": MULTIPLE, "multi_select": MULTIPLE, "multiselect": MULTIPLE,
    "numeric": NUMERIC, "number": NUMERIC,
}

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


def question_type(raw):
    """The kind of an objective question, or None for a type this doesn't know."""
    return _QUESTION_TYPES.get(str(raw.get("questionType") or "").strip().lower())


def _answer(raw):
    return _text(raw.get("correctAnswer", raw.get("correct_answer")))


def true_false_answer(raw):
    """"A" for True, "B" for False, or "" if the answer is neither."""
    answer = _answer(raw).strip(" .").lower()
    return {"a": "A", "true": "A", "t": "A", "b": "B", "false": "B", "f": "B"}.get(answer, "")


def tolerance(value):
    """How far either side of a numeric answer still counts: a Decimal of 0 or more, or None if unreadable."""
    if value in (None, ""):
        return Decimal(0)
    try:
        margin = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None
    return margin if margin.is_finite() and 0 <= margin < Decimal("1e11") else None


def correct_option(raw, options):
    """The key of the correct option, or "" if the answer matches none."""
    answer = _answer(raw)
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


def _objective_answer(kind, raw, fields):
    """
    Fill in how the question is answered and marked. Returns what is wrong with
    it, each phrased to follow the question's name.
    """
    if kind is None:
        return ["has a question type this paper doesn't know."]

    if kind == TRUE_FALSE:
        fields["options"] = TRUE_FALSE_OPTIONS
        fields["correct_option"] = true_false_answer(raw)
        return [] if fields["correct_option"] else ["has no correct answer: choose True or False."]

    if kind == NUMERIC:
        answer, margin = _answer(raw), tolerance(raw.get("tolerance"))
        fields["numeric_answer"] = answer
        fields["tolerance"] = margin or Decimal(0)
        fields["unit"] = _text(raw.get("unit"))[:MAX_UNIT_LENGTH]
        problems = []
        if not answer:
            problems.append("has no correct answer.")
        elif parse_number(answer) is None:
            problems.append(f"has an answer that isn't a number: {answer}.")
        if margin is None:
            problems.append("needs its margin either side of the answer to be a number, 0 or more.")
        return problems

    options = objective_options(raw)
    fields["options"] = options
    if len(options) < 2:
        return ["needs at least two options."]

    if kind == MULTIPLE:
        # parse_keys reads a list of letters as well as "A,C".
        keys = parse_keys(raw.get("correctAnswer", raw.get("correct_answer")))
        fields["partial_credit"] = bool(raw.get("partialCredit"))
        if not keys:
            return ["has no correct answers: tick every option that is right."]
        if any(key not in {option["key"] for option in options} for key in keys):
            return ["has a correct answer that is not one of its options."]
        fields["correct_option"] = "".join(keys)
        return []

    fields["correct_option"] = correct_option(raw, options)
    return [] if fields["correct_option"] else ["has no correct answer, or its answer is not one of its options."]


def sound_clip(raw):
    """
    (clip, problems) for a question's or section's "audio": the clip as
    {"url", "title", "plays", "duration"}, or None when there isn't one, and
    what is wrong with it, each phrased to follow "its sound clip".
    """
    if not isinstance(raw, dict) or not str(raw.get("url") or "").strip():
        return None, []
    problems = []
    url = str(raw["url"]).strip()
    if not url.lower().startswith("https://"):
        problems.append("has a link that doesn't start with https://.")
    try:
        plays = int(raw.get("plays") or 0)
    except (TypeError, ValueError):
        plays = -1
    if not 0 <= plays <= MAX_PLAYS:
        problems.append(f"can be allowed at most {MAX_PLAYS} plays.")
    try:
        duration = float(raw.get("duration"))
    except (TypeError, ValueError):
        duration = None
    clip = {
        "url": url, "title": _text(raw.get("title"))[:200], "plays": max(plays, 0),
        "duration": round(duration, 1) if duration and duration > 0 else None,
    }
    return clip, problems


def build_paper(exam, include_objective=True, include_theory=False):
    """
    Read `exam` into (sections, questions, problems).

    sections  -- [{"key", "title", "instructions"}], in paper order, with
                 "audio" for a section that has a sound clip
    questions -- unsaved field dicts for CBTQuestion, in paper order
    problems  -- one sentence per question that can't go on a paper as it
                 stands, naming it the way the teacher numbered it
    """
    sections, questions, problems = [], [], []

    def add(section, number, fields):
        questions.append({"section": section, "source_number": number,
                          "order": len(questions) + 1, **fields})

    def add_section(key, title, instructions, raw_clip):
        section = {"key": key, "title": title, "instructions": instructions}
        clip, clip_problems = sound_clip(raw_clip)
        if clip:
            section["audio"] = clip
        problems.extend(f"The {title} section's sound clip {problem}" for problem in clip_problems)
        sections.append(section)

    def question_clip(name, raw, fields):
        clip, clip_problems = sound_clip(raw.get("audio"))
        fields["audio"] = clip or {}
        problems.extend(f"{name}'s sound clip {problem}" for problem in clip_problems)
        return clip

    section_audio = exam.section_audio if isinstance(exam.section_audio, dict) else {}

    if include_objective and exam.objective_questions:
        add_section(OBJECTIVE_SECTION, "Objective", exam.objective_instructions or "", section_audio.get(OBJECTIVE_SECTION))
        for number, raw in enumerate(exam.objective_questions, start=1):
            name = f"Objective question {number}"
            kind = question_type(raw)
            marks = _marks(raw.get("marks", 1))
            image = _image(raw)
            fields = {
                "kind": kind or OBJECTIVE, "content": raw.get("question") or "", "image_url": image,
                "marks": marks, "bank_question_id": _bank_id(raw),
            }
            clip = question_clip(name, raw, fields)
            if is_blank(raw.get("question")) and not image and not clip:
                problems.append(f"{name} has no question text.")
            problems.extend(f"{name} {problem}" for problem in _objective_answer(kind, raw, fields))
            if marks is None:
                problems.append(f"{name} needs marks greater than zero.")
            add(OBJECTIVE_SECTION, number, fields)

    text_sections = []
    if include_theory:
        if exam.theory_questions:
            text_sections.append((THEORY_SECTION, "Theory", exam.theory_instructions or "",
                                  exam.theory_questions, section_audio.get(THEORY_SECTION)))
        for index, custom in enumerate(exam.custom_sections or [], start=1):
            if isinstance(custom, dict) and custom.get("questions"):
                text_sections.append((f"custom-{index}", custom.get("name") or f"Section {index}",
                                      custom.get("instructions") or "", custom["questions"], custom.get("audio")))

    for key, title, instructions, raw_questions, raw_clip in text_sections:
        add_section(key, title, instructions, raw_clip)
        for number, raw in enumerate(raw_questions, start=1):
            name = f"{title} question {number}"
            parts = raw.get("subQuestions") or []
            marks = _marks(raw.get("marks")) or _marks(_total_part_marks(parts))
            image = _image(raw)
            fields = {
                "kind": "text", "content": raw.get("question") or "", "image_url": image,
                "parts": parts, "table": raw.get("table") or None, "marks": marks, "bank_question_id": _bank_id(raw),
            }
            clip = question_clip(name, raw, fields)
            if is_blank(raw.get("question")) and not image and not parts and not clip:
                problems.append(f"{name} has no question text.")
            if marks is None:
                problems.append(f"{name} needs marks greater than zero.")
            guide = raw.get("expectedPoints") or raw.get("answerGuideline") or raw.get("markingGuide") or ""
            fields["marking_guide"] = guide if isinstance(guide, str) else ""
            add(key, number, fields)

    return sections, questions, problems
