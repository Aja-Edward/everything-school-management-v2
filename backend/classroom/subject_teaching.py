"""
One teacher for every subject in a class section.

Nursery and primary schools often have one teacher per section (Primary 3
Gold, Primary 3 Silver) who teaches all of its subjects. A teacher only sees
the subjects and pupils they have ClassroomTeacherAssignment rows for (their
result-entry screen lists subjects from those rows), so being the section's
class teacher alone left them with nothing to record. These helpers give the
teacher a row for each of the section's subjects, whichever teaching model
the school uses for that level.
"""
from django.db import transaction

from subject.models import Subject

from .models import Classroom, ClassroomTeacherAssignment


def section_subjects(classroom):
    """The active subjects taught in this classroom's class (by grade level, else by education level)."""
    class_grade = classroom.section.class_grade
    subjects = Subject.objects.filter(tenant_id=classroom.tenant_id, is_active=True)
    if class_grade.grade_level_id:
        by_grade = subjects.filter(grade_levels=class_grade.grade_level_id)
        if by_grade.exists():
            return by_grade.distinct()
    level = class_grade.education_level.level_type if class_grade.education_level_id else None
    if not level:
        return Subject.objects.none()
    return subjects.filter(education_levels__contains=[level])


def current_classroom(section_id):
    """The section's classroom for the current session and term, else its latest."""
    return (
        Classroom.objects.filter(section_id=section_id, is_active=True)
        .order_by("-academic_session__is_current", "-term__is_current", "-id")
        .first()
    )


def give_all_subjects(classroom, teacher, subjects=None):
    """
    Make `teacher` the teacher of every subject in `classroom` (or of
    `subjects`), replacing whoever had them, and its class teacher if it has
    none. Returns the number of subjects assigned.
    """
    if subjects is None:
        subjects = section_subjects(classroom)
    subjects = list(subjects)
    with transaction.atomic():
        for subject in subjects:
            ClassroomTeacherAssignment.objects.update_or_create(
                classroom=classroom, subject=subject,
                defaults={"teacher": teacher, "is_active": True, "tenant_id": classroom.tenant_id},
            )
        if classroom.class_teacher_id is None:
            classroom.class_teacher = teacher
            classroom.save(update_fields=["class_teacher"])
    return len(subjects)
