"""
Who an assignment reaches, in one place.

A teacher teaches a classroom as its class teacher, as a co-teacher
(Nursery/Primary), or through an active ClassroomTeacherAssignment for a
subject. A student's class is their active StudentEnrollment in an active
classroom, as results and lessons already read it. Every lookup takes the
request's tenant, so nothing here can reach another school.
"""

from django.db.models import Q

from classroom.models import (
    Classroom,
    ClassroomCoTeacher,
    ClassroomTeacherAssignment,
    StudentEnrollment,
)
from parent.models import ParentStudentRelationship
from subject.models import Subject


def classrooms_taught_by(teacher, tenant):
    """Active classrooms of `tenant` that `teacher` teaches in any capacity."""
    as_co_teacher = ClassroomCoTeacher.objects.filter(
        classroom__tenant=tenant, teacher=teacher
    ).values("classroom_id")
    as_subject_teacher = ClassroomTeacherAssignment.objects.filter(
        classroom__tenant=tenant, teacher=teacher, is_active=True
    ).values("classroom_id")
    return Classroom.objects.filter(tenant=tenant, is_active=True).filter(
        Q(class_teacher=teacher) | Q(id__in=as_co_teacher) | Q(id__in=as_subject_teacher)
    )


def leads_classroom(teacher, classroom):
    """Class teacher or co-teacher: they teach the whole class, not one subject."""
    return (
        classroom.class_teacher_id == teacher.pk
        or ClassroomCoTeacher.objects.filter(classroom=classroom, teacher=teacher).exists()
    )


def subjects_for(teacher, classroom):
    """
    Subjects `teacher` may set work in for `classroom`: the ones assigned to
    them there, or, for whoever leads the class, every subject it takes.
    """
    assigned = ClassroomTeacherAssignment.objects.filter(
        classroom=classroom, is_active=True
    )
    if leads_classroom(teacher, classroom):
        ids = set(classroom.subjects.values_list("id", flat=True))
        ids |= set(assigned.values_list("subject_id", flat=True))
    else:
        ids = set(assigned.filter(teacher=teacher).values_list("subject_id", flat=True))
    return Subject.objects.filter(tenant=classroom.tenant_id, id__in=ids).order_by("name")


def enrolled_classroom_ids(student_ids, tenant):
    """Active classrooms of `tenant` the given students are actively enrolled in."""
    return StudentEnrollment.objects.filter(
        student_id__in=student_ids,
        student__tenant=tenant,
        classroom__tenant=tenant,
        classroom__is_active=True,
        is_active=True,
    ).values("classroom_id")


def children_of(user, tenant):
    """Active students of `tenant` linked to `user` as a parent there."""
    from students.models import Student

    linked = ParentStudentRelationship.objects.filter(
        tenant=tenant, parent__user=user, parent__tenant=tenant
    ).values("student_id")
    return (
        Student.objects.filter(tenant=tenant, is_active=True, id__in=linked)
        .select_related("user")
        .order_by("user__first_name", "user__last_name", "id")
    )
