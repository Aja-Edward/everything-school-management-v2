"""
cbt/access.py

Which exams a staff member may put on CBT, and who may open one to students.

This follows who can manage an exam elsewhere. School admins manage every exam
in their school. Section admins manage the exams at their levels. Teachers
manage the exams they are assigned to.
"""

from common.admin_access import admin_level_access
from exam.models import Exam
from teacher.models import Teacher

# The exam statuses in which an exam has been through approval.
APPROVED_STATUS_CODES = frozenset({"approved", "scheduled", "in_progress", "completed"})


def _is_school_wide(user, tenant):
    if user.is_superuser or user.is_staff or getattr(user, "is_platform_staff", False):
        return True
    if (getattr(user, "role", "") or "").lower() == "principal":
        return True
    return admin_level_access(user, tenant) is None


def manageable_exams(user, tenant):
    """The exams in `tenant` that `user` may set up, check, preview and publish."""
    if tenant is None:
        return Exam.objects.none()
    exams = Exam.objects.filter(tenant=tenant)
    if _is_school_wide(user, tenant):
        return exams

    levels = admin_level_access(user, tenant)
    if levels:
        return exams.filter(grade_level__education_level__level_type__in=levels)

    teacher = Teacher.objects.filter(user=user, tenant=tenant).first()
    if teacher:
        return exams.filter(teacher=teacher)
    return exams.none()


def publish_refusal(user, tenant, exam):
    """
    Why `user` may not open `exam` to students, or None if they may.

    Publishing puts the paper in front of students, which is what exam
    approval exists to guard. A teacher can only publish once their exam is
    approved. Admins are the approvers, so they may publish at any stage.
    """
    if _is_school_wide(user, tenant) or admin_level_access(user, tenant):
        return None
    if exam.status and exam.status.code in APPROVED_STATUS_CODES:
        return None
    return "This exam needs to be approved before it can be published for CBT."
