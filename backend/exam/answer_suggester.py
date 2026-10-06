"""
exam/answer_suggester.py

Suggesting the correct answer to imported objective questions that the paper
didn't mark. A school uploads a paper with no answer key - bold options,
"Answer: B" lines and marking guides are all read by document_parser first -
and would otherwise fill in every correct answer by hand.

Claude works out each unmarked answer. The question text and options are all
that is sent: no names, no school. Every answer filled in here is flagged
answerSuggested, for the form to show as needing a teacher's check before the
marking guide is printed or the paper is used for CBT.

Off unless ANTHROPIC_API_KEY is set. Nothing here may stop an import: any
failure leaves the questions as they came and adds a warning.
"""

import html
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"
# Enough for a long paper's answer list; one letter per question.
MAX_TOKENS = 8000
# The import waits on this, so it can't take long; a timeout just means no suggestions.
TIMEOUT_SECONDS = 25.0
LETTERS = ("A", "B", "C", "D", "E")

SYSTEM = (
    "You set the answer key for objective (multiple-choice) questions from a school exam paper, "
    "so a teacher has a marking guide to check. For each question, choose the letter of the one "
    "correct option. Give null instead when no option is correct, when more than one is, or when "
    "the question can't be answered from its text - for example it asks about a picture you "
    "can't see. A wrong letter is worse than null: the teacher fills in nulls themselves."
)

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "answer": {"anyOf": [{"type": "string", "enum": list(LETTERS)}, {"type": "null"}]},
                },
                "required": ["id", "answer"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["answers"],
    "additionalProperties": False,
}

_TAGS = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")


def _plain(markup):
    """Question HTML as plain text, saying where a picture was."""
    text = re.sub(r"<img\b[^>]*>", " [picture] ", str(markup or ""), flags=re.IGNORECASE)
    return _SPACES.sub(" ", html.unescape(_TAGS.sub(" ", text))).strip()


def _unanswered(sections):
    """[(id, question)] for each objective question with options and no answer yet."""
    found = []
    for section in sections:
        if section.get("type") != "objective":
            continue
        for question in section.get("questions", []):
            options = question.get("options") or {}
            if not question.get("correctAnswer") and len(options) >= 2:
                found.append((len(found) + 1, question))
    return found


def _ask(numbered):
    """Claude's answers, {id: letter or None}. Raises on any API failure."""
    import anthropic

    lines = []
    for number, question in numbered:
        lines.append(f"Question {number}: {_plain(question.get('question'))}")
        for key, text in sorted(question["options"].items()):
            lines.append(f"  {key[-1]}. {_plain(text)}")
        lines.append("")

    client = anthropic.Anthropic(timeout=TIMEOUT_SECONDS, max_retries=1)
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        # A safety classifier that declines is retried server-side on the model
        # Anthropic recommends for that kind of decline, instead of failing.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        # Short factual questions: low effort answers them well and quickly.
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": ANSWER_SCHEMA}},
        system=SYSTEM,
        messages=[{"role": "user", "content": "\n".join(lines)}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("the request was declined")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("the answer list was cut short")
    text = next(block.text for block in response.content if block.type == "text")
    return {item["id"]: item["answer"] for item in json.loads(text)["answers"]}


def suggest_answers(parsed):
    """
    Fill in suggested answers on a parsed paper's unmarked objective
    questions, in place. Returns how many were filled; adds a warning to
    parsed["metadata"]["warnings"] saying so, or why none could be.
    """
    warnings = parsed.setdefault("metadata", {}).setdefault("warnings", [])
    numbered = _unanswered(parsed.get("sections", []))
    if not numbered or not os.environ.get("ANTHROPIC_API_KEY"):
        return 0

    try:
        answers = _ask(numbered)
    except Exception as error:  # never let suggestions stop an import
        logger.warning("Could not suggest answers for %s questions: %s", len(numbered), error)
        warnings.append(
            f"Correct answers couldn't be suggested this time, so {len(numbered)} objective "
            "question(s) need their answer chosen by hand.")
        return 0

    filled = 0
    for number, question in numbered:
        letter = answers.get(number)
        # Only a letter that is one of this question's own options.
        if letter and f"option{letter}" in question["options"]:
            question["correctAnswer"] = letter
            question["answerSuggested"] = True
            filled += 1

    if filled:
        warnings.append(
            f"Suggested the correct answer for {filled} objective question(s) the paper didn't mark. "
            "They're flagged - please check each one.")
    if filled < len(numbered):
        warnings.append(
            f"{len(numbered) - filled} objective question(s) still need their correct answer chosen.")
    return filled
