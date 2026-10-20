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


def display_name(user):
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
    child = display_name(submission.student.user)
    first = child.split()[0] if child else "Your child"
    subject_name = assignment.subject.name if assignment.subject_id else None
    school = submission.tenant.name if submission.tenant_id else "School"

    lines = [
        f"Dear {display_name(parent_user)},",
        "",
        f'{child}\'s assignment "{assignment.title}"'
        + (f" ({subject_name})" if subject_name else "")
        + " has been marked"
        + (f" by {display_name(submission.graded_by.user)}" if submission.graded_by_id else "")
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


# ── In-app (the notification bell) ────────────────────────────────────────────

def _due(assignment):
    return assignment.due_date.strftime("%a %d %b").replace(" 0", " ")


def assignments_page(user):
    """Where a bell line about an assignment opens: a student's Assignments section."""
    from inbox.notify import dashboard_for

    if (getattr(user, "role", "") or "").lower() == "student":
        return "/student/dashboard?section=assignments"
    return dashboard_for(user)


def bell_new_assignment(assignment):
    """Each pupil in the class, and their parents, get a line in their bell."""
    from inbox.models import NotificationKind
    from inbox.notify import notify

    from .access import class_roster

    subject = assignment.subject.name if assignment.subject_id else "General"
    pupils = list(class_roster(assignment.classroom))
    notify(
        [p.user for p in pupils],
        tenant=assignment.tenant, kind=NotificationKind.ASSIGNMENT_SET,
        title=f"New assignment: {assignment.title}",
        body=f"{subject} · due {_due(assignment)}",
        link=assignments_page,
    )
    for pupil in pupils:
        notify(
            [user for _, user in parents_of(pupil)],
            tenant=assignment.tenant, kind=NotificationKind.ASSIGNMENT_SET,
            title=f"New assignment for {display_name(pupil.user).split()[0]}: {assignment.title}",
            body=f"{subject} · due {_due(assignment)}",
            link=assignments_page,
        )


def bell_marked(submission):
    """The pupil and their parents see the mark in their bell."""
    from inbox.models import NotificationKind
    from inbox.notify import notify

    assignment = submission.assignment
    mark = f"Grade: {submission.grade}" if submission.grade else "Your teacher left feedback."
    student = submission.student
    notify(
        [student.user], tenant=submission.tenant, kind=NotificationKind.ASSIGNMENT_MARKED,
        title=f"{assignment.title} has been marked", body=mark, link=assignments_page,
    )
    notify(
        [user for _, user in parents_of(student)],
        tenant=submission.tenant, kind=NotificationKind.ASSIGNMENT_MARKED,
        title=f"{display_name(student.user).split()[0]}'s {assignment.title} has been marked",
        body=mark.replace("Your teacher", "The teacher"), link=assignments_page,
    )


def bell_handed_in(submission):
    """The teacher who set the assignment hears that a pupil handed it in."""
    from inbox.models import NotificationKind
    from inbox.notify import notify

    assignment = submission.assignment
    teacher = assignment.teacher
    if teacher is None or teacher.user_id is None:
        return
    student = submission.student
    by_parent = submission.submitted_by_id not in (None, student.user_id)
    notes = (["Late"] if submission.is_late else []) + (["handed in by a parent"] if by_parent else [])
    notify(
        [teacher.user], tenant=submission.tenant, kind=NotificationKind.ASSIGNMENT_HANDED_IN,
        title=f"{display_name(student.user)} handed in {assignment.title}",
        body=", ".join(notes).capitalize(),
        link="/teacher/assignments",
    )
