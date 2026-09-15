"""
cbt/scoring.py

The kinds of CBT question, and marking an answer to the automatically marked ones.

    objective   choose one option
    true_false  choose True or False
    multiple    choose every option that applies
    numeric     type a number
    text        type an answer, marked by a teacher

A student's choice is kept in CBTAnswer.selected_option as option keys. For a
multiple-choice question that is every key they chose, in order ("AC"), and the
question's correct_option holds its correct keys the same way. Keys are single
letters, so this is unambiguous.

A number is kept as the student typed it, in text_answer, and read when it is
marked. It may be written:
- as a whole number or decimal, with or without a sign: 12, -3.5, .75;
- with commas between thousands: 1,250,000;
- in e-notation: 6.02e23;
- as a fraction or mixed number: 3/4, 1 1/2.
The question's unit may follow it: "12.5 cm" for a question in cm.
"""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from fractions import Fraction

OBJECTIVE = "objective"
TRUE_FALSE = "true_false"
MULTIPLE = "multiple"
NUMERIC = "numeric"
TEXT = "text"

CHOICE_KINDS = frozenset({OBJECTIVE, TRUE_FALSE, MULTIPLE})
AUTO_MARKED_KINDS = CHOICE_KINDS | {NUMERIC}

MAX_NUMBER_LENGTH = 50
# Larger exponents would build enormous fractions for no real answer.
MAX_EXPONENT = 100
TWO_PLACES = Decimal("0.01")

_DECIMAL_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$", re.IGNORECASE)
_THOUSANDS_RE = re.compile(r"^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$")
_FRACTION_RE = re.compile(r"^([+-]?)(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$")
_MIXED_RE = re.compile(r"^([+-]?)(\d+)\s+(\d+)\s*/\s*(\d+)$")
_MINUS_SIGNS = str.maketrans({"\u2212": "-", "\u2013": "-", "\u2014": "-"})


def _decimal(text):
    if "," in text:
        if not _THOUSANDS_RE.match(text):
            return None
        text = text.replace(",", "")
    match = _DECIMAL_RE.match(text)
    if not match:
        return None
    if match.group(2) and abs(int(match.group(2)[1:])) > MAX_EXPONENT:
        return None
    try:
        return Fraction(Decimal(text))
    except (InvalidOperation, ValueError):
        return None


def parse_number(text, unit=""):
    """The number written in `text` as an exact Fraction, or None if it isn't one."""
    if text is None:
        return None
    text = str(text).translate(_MINUS_SIGNS).strip()
    if len(text) > MAX_NUMBER_LENGTH:
        return None
    unit = (unit or "").strip()
    if unit and text.lower().endswith(unit.lower()):
        text = text[: -len(unit)].strip()
    if not text:
        return None

    mixed = _MIXED_RE.match(text)
    if mixed:
        sign, whole, top, bottom = mixed.groups()
        if int(bottom) == 0:
            return None
        value = int(whole) + Fraction(int(top), int(bottom))
        return -value if sign == "-" else value

    fraction = _FRACTION_RE.match(text)
    if fraction:
        sign, top, bottom = fraction.groups()
        top, bottom = Fraction(Decimal(top)), Fraction(Decimal(bottom))
        if bottom == 0:
            return None
        return -(top / bottom) if sign == "-" else top / bottom

    return _decimal(text.replace(" ", ""))


def parse_keys(raw):
    """Option keys from "A,C", "A C", "AC" or ["A", "C"], upper-cased, in order, without repeats."""
    if isinstance(raw, (list, tuple)):
        raw = "".join(str(item) for item in raw)
    return sorted(set(re.sub(r"[\s,;/&]+", "", str(raw or "")).upper()))


def read_choice(kind, option_keys, raw):
    """
    A student's choice for a choice question, as stored: "" for none, "B", or
    "AC" for a multiple-choice question. Raises ValueError, with a message fit
    for the student, when it names a key the question doesn't have.
    """
    if kind == MULTIPLE:
        keys = parse_keys(raw)
        if any(key not in option_keys for key in keys):
            raise ValueError("That option is not one of the question's options.")
        return "".join(keys)
    choice = str(raw or "").strip().upper()
    if choice and choice not in option_keys:
        raise ValueError("That option is not one of the question's options.")
    return choice


def score(question, selected_option="", text_answer=""):
    """
    (is_correct, marks) for an answer to an automatically marked question.

    is_correct means fully right. A multiple-choice question with partial
    credit can earn some marks without it: marks times (right choices minus
    wrong choices) over the number of right options, never below zero. Choosing
    every option earns nothing that way.
    """
    marks = question.marks
    if question.award_all:
        return True, marks
    kind = question.kind

    if kind in (OBJECTIVE, TRUE_FALSE):
        right = bool(selected_option) and selected_option == question.correct_option
        return right, marks if right else Decimal(0)

    if kind == MULTIPLE:
        chosen, correct = set(selected_option or ""), set(question.correct_option)
        if chosen and chosen == correct:
            return True, marks
        if not (chosen and correct and question.partial_credit):
            return False, Decimal(0)
        share = Fraction(max(0, len(chosen & correct) - len(chosen - correct)), len(correct))
        earned = (marks * share.numerator / share.denominator).quantize(TWO_PLACES, ROUND_HALF_UP)
        return False, earned

    if kind == NUMERIC:
        right = number_matches(question, text_answer)
        return right, marks if right else Decimal(0)

    raise ValueError(f"{kind} questions are not marked automatically.")


def number_matches(question, text):
    """Whether `text` is a number within the question's tolerance of its answer."""
    value = parse_number(text, question.unit)
    key = parse_number(question.numeric_answer)
    return value is not None and key is not None and abs(value - key) <= Fraction(question.tolerance or 0)


COMMON_ANSWERS = 5


def common_numbers(question, texts):
    """
    The numbers students gave most often, most first, for spotting a wrong key:
    [{"answer", "students", "correct"}]. Equal values count together, so "0.5"
    and "1/2" are one answer, shown as it was first written.
    """
    groups = {}
    for text in texts:
        written = " ".join(text.split())
        if not written:
            continue
        value = parse_number(written, question.unit)
        group = groups.setdefault(value if value is not None else written.lower(), {"answer": written, "students": 0})
        group["students"] += 1
    ranked = sorted(groups.values(), key=lambda g: -g["students"])[:COMMON_ANSWERS]
    return [{**g, "correct": number_matches(question, g["answer"])} for g in ranked]


def plain_number(value):
    """A Decimal as it would be written: 0.1, not 0.100000 or 1E-1."""
    return format(Decimal(value).normalize(), "f")


def describe_key(question):
    """The answer key as staff read it: "B", "A, C", "12.5 ± 0.1 cm". Says nothing of award_all."""
    if question.kind == MULTIPLE:
        return ", ".join(question.correct_option)
    if question.kind == NUMERIC:
        text = question.numeric_answer
        if question.tolerance:
            text += f" ± {plain_number(question.tolerance)}"
        return f"{text} {question.unit}".strip()
    return question.correct_option
