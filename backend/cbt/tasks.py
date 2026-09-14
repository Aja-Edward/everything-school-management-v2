"""
cbt/tasks.py

Ending attempts whose time has run out.

An attempt is also ended whenever anything touches it after its deadline: the
student's page, the exams list, a save. This sweep catches the ones nobody
touches, such as a student who closed the browser, so they don't sit in
progress until someone looks.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="cbt.tasks.close_expired_attempts")
def close_expired_attempts():
    from cbt.engine import close_expired_attempts as close

    ended = close()
    if ended:
        logger.info("Ended %s CBT attempt(s) whose time ran out", ended)
    return ended
