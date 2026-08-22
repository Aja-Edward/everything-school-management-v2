"""
common/dispatch.py

Hand a long-running job to a Celery worker when one is actually listening,
and run it in a background thread when one is not.

`task.delay()` succeeds as long as the broker accepts the message — it says
nothing about whether anybody is going to consume it.  When CELERY_WORKER_
AVAILABLE is set but no worker service is running (or the broker is the
in-memory transport), the message is published into a queue nobody reads and
the caller's progress record sits on "pending" forever, which the frontend
polls indefinitely.  `dispatch_task` closes that gap.
"""

import logging
import threading

from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)

# How long to wait for a worker to answer a ping before assuming there is none.
PING_TIMEOUT_SECONDS = float(
    getattr(settings, "CELERY_WORKER_PING_TIMEOUT", 1.0))


def _workers_online():
    """True when at least one Celery worker replies to a control ping."""
    try:
        from config.celery import app
        return bool(app.control.ping(timeout=PING_TIMEOUT_SECONDS))
    except Exception as exc:
        logger.warning(
            "Celery ping failed (%s) — treating the worker as offline.", exc)
        return False


def _run_in_thread(task, kwargs):
    """Run the task in a daemon thread so the request can return immediately."""

    def _runner():
        try:
            task(**kwargs)
        except Exception:
            logger.exception("Background task %s failed.", task.name)
        finally:
            # Threads get their own DB connection — don't leak it.
            connection.close()

    threading.Thread(
        target=_runner,
        name=f"bg-{task.name}",
        daemon=True,
    ).start()


def dispatch_task(task, **kwargs):
    """
    Queue `task` for a Celery worker and return the Celery task id.

    Returns None when the job was started in a background thread instead,
    which happens when Celery is in eager mode, when no worker answers a
    ping, or when publishing to the broker fails.
    """
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        # Eager mode would run the job inline and hold the HTTP request open
        # until it finishes — long enough for gunicorn to kill the worker.
        logger.info(
            "Celery is in eager mode — running %s in a background thread.",
            task.name,
        )
        _run_in_thread(task, kwargs)
        return None

    if not _workers_online():
        logger.warning(
            "No Celery worker is consuming the queue — running %s in a "
            "background thread instead.",
            task.name,
        )
        _run_in_thread(task, kwargs)
        return None

    try:
        return task.delay(**kwargs).id
    except Exception as exc:
        logger.warning(
            "Celery dispatch failed (%s) — running %s in a background thread.",
            exc, task.name,
        )
        _run_in_thread(task, kwargs)
        return None
