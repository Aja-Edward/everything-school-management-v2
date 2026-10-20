"""Celery tasks for assignments."""
import logging

from celery import shared_task

from utils import notifications as channels

from .notifications import parents_of, render

logger = logging.getLogger(__name__)


@shared_task
def notify_parents_of_mark(submission_id):
    """Email each parent of the pupil whose hand-in was just marked."""
    from .models import AssignmentSubmission

    submission = (
        AssignmentSubmission.objects
        .filter(id=submission_id)
        .select_related(
            "tenant", "student__user", "assignment__subject", "graded_by__user")
        .first()
    )
    # Handed back again before this ran: there is no mark to report.
    if submission is None or not submission.is_graded:
        return 0

    email = channels.get_channel("email")
    sent = 0
    for profile, user in parents_of(submission.student):
        destination = email.destination_for(profile, user)
        if not destination:
            continue
        subject, body = render(submission, user)
        result = channels.send(
            channel="email", tenant=submission.tenant,
            destination=destination, subject=subject, body=body)
        if result.ok:
            sent += 1
        else:
            logger.warning(
                "Marked-assignment email to parent %s for submission %s not sent: %s",
                user.id, submission.id, result.error)
    return sent
