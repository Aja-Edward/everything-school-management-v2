"""
The parents' daily email of newly set assignments.

Once a day (Celery beat, 4pm Lagos time; or `manage.py
send_assignment_digests`), every assignment not yet announced is taken up,
and each parent of a pupil in those classes gets one email listing them,
covering all their children in that school. Nothing is sent on a day with
no new work.

One email per parent per day, rather than one per assignment, because a
class's parents would otherwise get one for every subject's homework, and
most schools send through the shared platform Brevo account and its daily
limit.

Assignments are claimed (parents_notified_at set) before anything is sent,
so two overlapping runs cannot announce the same work twice. A run that
dies part-way loses the rest of that day's emails rather than resending;
the work is on the parents' dashboards either way.
"""
import logging
from collections import defaultdict
from dataclasses import dataclass, field

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from utils import notifications as channels

from .access import class_roster
from .models import Assignment
from .notifications import display_name, parents_of

logger = logging.getLogger(__name__)


@dataclass
class ParentDigest:
    tenant: object
    profile: object
    user: object
    # student_id -> (student, classroom, [assignments])
    children: dict = field(default_factory=dict)


def claim_new_assignments(dry_run=False):
    """
    Ids of every assignment not yet announced, marked as announced unless
    this is a dry run. Rows another run holds are left to it.
    """
    with transaction.atomic():
        ids = list(
            Assignment.objects.select_for_update(skip_locked=True)
            .filter(parents_notified_at__isnull=True)
            .values_list("id", flat=True)
        )
        if ids and not dry_run:
            Assignment.objects.filter(id__in=ids).update(parents_notified_at=timezone.now())
    return ids


def digests_for(assignment_ids):
    """One ParentDigest per (school, parent), from the given assignments."""
    assignments = (
        Assignment.objects.filter(
            id__in=assignment_ids,
            # Already past due by the time the digest runs: not worth announcing.
            due_date__gte=timezone.localdate(),
            tenant__isnull=False,
            classroom__tenant=F("tenant"),
        )
        .select_related("tenant", "classroom", "subject")
        .order_by("due_date", "title")
    )

    rosters, parents = {}, {}
    digests = {}
    for assignment in assignments:
        if assignment.classroom_id not in rosters:
            rosters[assignment.classroom_id] = list(class_roster(assignment.classroom))
        for student in rosters[assignment.classroom_id]:
            if student.id not in parents:
                parents[student.id] = list(parents_of(student))
            for profile, user in parents[student.id]:
                digest = digests.setdefault(
                    (assignment.tenant_id, user.id),
                    ParentDigest(tenant=assignment.tenant, profile=profile, user=user),
                )
                entry = digest.children.setdefault(student.id, (student, assignment.classroom, []))
                entry[2].append(assignment)
    return list(digests.values())


def _join(names):
    """["Ada"] -> "Ada"; ["Ada", "Bayo", "Chidi"] -> "Ada, Bayo and Chidi"."""
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _due(assignment):
    return assignment.due_date.strftime("%a %d %b").replace(" 0", " ")


def render(digest):
    """(subject, body) for one parent."""
    children = sorted(digest.children.values(), key=lambda entry: display_name(entry[0].user))
    first_names = [(display_name(student.user).split() or ["Your child"])[0] for student, _, _ in children]
    count = sum(len(entry[2]) for entry in children)

    lines = [f"Dear {display_name(digest.user)},", ""]
    lines.append("A new assignment has been set:" if count == 1 else "New assignments have been set:")
    for student, classroom, assignments in children:
        lines += ["", f"{display_name(student.user)} ({classroom.name})"]
        for assignment in assignments:
            subject = assignment.subject.name if assignment.subject_id else "General"
            lines.append(f"- {subject}: {assignment.title}, due {_due(assignment)}")
    lines += [
        "",
        "You can read the instructions, download any attached files and hand "
        "the work in on the Assignments tab of your parent dashboard.",
        "",
        digest.tenant.name,
    ]
    subject = f"New assignment{'s' if count > 1 else ''} for {_join(first_names)}"
    return subject, "\n".join(lines)


def send_new_assignment_digests(dry_run=False):
    """
    Email every parent their digest. Returns counts for the beat log or the
    management command. A dry run claims nothing and sends nothing.
    """
    ids = claim_new_assignments(dry_run=dry_run)
    summary = {"assignments": len(ids), "parents": 0, "sent": 0, "failed": 0, "no_email": 0}
    if not ids:
        return summary

    email = channels.get_channel("email")
    for digest in digests_for(ids):
        summary["parents"] += 1
        destination = email.destination_for(digest.profile, digest.user)
        if not destination:
            summary["no_email"] += 1
            continue
        if dry_run:
            continue
        subject, body = render(digest)
        result = channels.send(
            channel="email", tenant=digest.tenant,
            destination=destination, subject=subject, body=body)
        if result.ok:
            summary["sent"] += 1
        else:
            summary["failed"] += 1
            logger.warning(
                "New-assignment digest to parent %s (school %s) not sent: %s",
                digest.user.id, digest.tenant.id, result.error)

    logger.info("New-assignment digests: %s", summary)
    return summary
