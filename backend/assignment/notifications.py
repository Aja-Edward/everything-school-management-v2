"""
Telling parents a child's work has been marked.

One email per linked parent, sent when a teacher first marks a hand-in (or
marks it again after handing it back). Changing a mark that is already
there sends nothing, so a teacher correcting a typo doesn't email the
family twice.

Email only: it is free, and the shared channel already respects the
school's email-notifications switch and its own Brevo account. SMS would
cost the school per text, so it is left out until a school asks for it.

Delivery runs off the request (tasks.notify_parents_of_mark, handed off
with common.dispatch), so a slow provider never holds up the teacher
pressing Save. A failed send is logged, not retried: the mark is on the
parent's dashboard either way.
"""
from parent.models import ParentStudentRelationship


def _name(user):
    return (user.get_full_name() or user.username).strip()


def parents_of(student):
    """Each parent user linked to `student` in the student's own school, once."""
    links = (
        ParentStudentRelationship.objects
        .filter(tenant=student.tenant_id, student=student, parent__tenant=student.tenant_id)
        .select_related("parent__user")
    )
    seen = set()
    for link in links:
        user = link.parent.user if link.parent_id else None
        if user is None or not user.is_active or user.id in seen:
            continue
        seen.add(user.id)
        yield link.parent, user


def render(submission, parent_user):
    """(subject, body) for one parent."""
    assignment = submission.assignment
    child = _name(submission.student.user)
    first = child.split()[0] if child else "Your child"
    subject_name = assignment.subject.name if assignment.subject_id else None
    school = submission.tenant.name if submission.tenant_id else "School"

    lines = [
        f"Dear {_name(parent_user)},",
        "",
        f'{child}\'s assignment "{assignment.title}"'
        + (f" ({subject_name})" if subject_name else "")
        + " has been marked"
        + (f" by {_name(submission.graded_by.user)}" if submission.graded_by_id else "")
        + ".",
        "",
    ]
    if submission.grade:
        lines.append(f"Grade: {submission.grade}")
    if submission.feedback:
        lines.append(f"Feedback: {submission.feedback}")
    lines += [
        "",
        "You can see it on the Assignments tab of your parent dashboard.",
        "",
        school,
    ]
    return f"{first}'s {assignment.title} has been marked", "\n".join(lines)
