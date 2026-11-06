"""
A student's place in the school is recorded twice: their own class, section
and stream on Student, and their active StudentEnrollment in a Classroom.

Teachers' class lists read the enrollment. The student's own pages, the parent
pages, results, rankings and attendance read the Student fields. The two must
move together, or a transferred student shows up in one class for their
teacher and another on their own page.
"""


def student_fields_for_classroom(student, classroom):
    """The Student field values that put `student` in `classroom`'s section."""
    section = classroom.section
    target_class = section.class_grade
    fields = {"student_class": target_class, "section": section}
    if classroom.stream_id:
        fields["stream"] = classroom.stream
    elif (
        student.stream_id
        and student.student_class_id != target_class.id
        and student.stream.grade_level_id not in (None, target_class.grade_level_id)
    ):
        # A stream belongs to one grade level; don't carry an SSS 1 stream
        # into SSS 2.
        fields["stream"] = None
    return fields


def find_left_behind_transfers(students):
    """
    Students whose own class and section disagree with their enrollment.

    Before commit c6d0ef43 (23 Oct 2026) a transfer deactivated the old
    enrollment and activated the new one but left the Student fields alone.
    Such a student has exactly one active enrollment, in another section's
    classroom, and an ended enrollment in a classroom of the section their
    record still names. Only those are returned as `repairable`, paired with
    the enrollment to follow.

    Students that disagree in any other way (several active enrollments, or
    no record of ever leaving their own section) are returned as `unclear`:
    which side is right isn't knowable from the data, so they're left for a
    person to look at.
    """
    from classroom.models import StudentEnrollment

    repairable, unclear = [], []
    students = students.filter(is_active=True).select_related("section")
    for student in students:
        active = list(
            StudentEnrollment.objects.filter(student=student, is_active=True)
            .select_related("classroom__section__class_grade", "classroom__stream")
        )
        sections = {e.classroom.section_id for e in active}
        if not active or sections == {student.section_id}:
            continue
        if len(active) != 1 or active[0].classroom.section_id is None:
            unclear.append((student, active))
            continue
        left_own_section = StudentEnrollment.objects.filter(
            student=student,
            is_active=False,
            classroom__section_id=student.section_id,
        ).exists() if student.section_id else False
        if left_own_section:
            repairable.append((student, active[0]))
        else:
            unclear.append((student, active))
    return repairable, unclear
