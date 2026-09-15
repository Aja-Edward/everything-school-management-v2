"""
cbt/student_payload.py

The paper as a student's browser receives it, with nothing that gives an answer away.

Staff previews use the same function, so a preview shows exactly what a
student will get.

Everything is built from an explicit list of keys, never by copying a stored
dict. Question JSON picks up extra keys from wherever it came from: a
question-bank import adds `expectedPoints`, which is the marking guide.
"""

from .scoring import CHOICE_KINDS, NUMERIC

PART_KEYS = ("id", "question", "marks", "table")
CLIP_KEYS = ("url", "title", "plays", "duration")


def clip_for_student(clip):
    return {key: clip.get(key) for key in CLIP_KEYS} if isinstance(clip, dict) and clip.get("url") else None


def _part(raw):
    if not isinstance(raw, dict):
        return None
    part = {key: raw[key] for key in PART_KEYS if key in raw}
    children = [_part(child) for child in raw.get("subSubQuestions") or []]
    children = [child for child in children if child]
    if children:
        part["parts"] = children
    return part


def question_for_student(question, number, option_order=None):
    payload = {
        "id": question.id,
        "number": number,
        "section": question.section,
        "kind": question.kind,
        "content": question.content,
        "image_url": question.image_url,
        "marks": str(question.marks),
    }
    if clip_for_student(question.audio):
        payload["audio"] = clip_for_student(question.audio)
    if question.kind in CHOICE_KINDS:
        text_by_key = {option["key"]: option["text"] for option in question.options}
        keys = option_order or list(text_by_key)
        payload["options"] = [{"key": key, "text": text_by_key[key]} for key in keys if key in text_by_key]
    elif question.kind == NUMERIC:
        # The unit only: the answer and its tolerance stay on the server.
        payload["unit"] = question.unit
    else:
        payload["parts"] = [part for part in map(_part, question.parts or []) if part]
        payload["table"] = question.table
    return payload


def paper_for_student(paper, questions, option_order, sections=None, instructions=None):
    """
    `questions` in the order this student sees them; `option_order` keyed by question id.

    `sections` and `instructions` default to the ones saved when the paper was
    published; a preview of a draft passes the exam's current ones.
    """
    return {
        "exam_title": paper.exam.title,
        "subject": paper.exam.subject.name if paper.exam.subject_id else "",
        "instructions": paper.instructions if instructions is None else instructions,
        "sections": [
            {"key": s.get("key"), "title": s.get("title"), "instructions": s.get("instructions"),
             **({"audio": clip_for_student(s.get("audio"))} if clip_for_student(s.get("audio")) else {})}
            for s in (paper.sections if sections is None else sections)
        ],
        "duration_minutes": paper.duration_minutes,
        "allow_backtracking": paper.allow_backtracking,
        "total_marks": str(sum(question.marks for question in questions)),
        "questions": [
            question_for_student(question, number, option_order.get(str(question.id)))
            for number, question in enumerate(questions, start=1)
        ],
    }
