# gunicorn.conf.py — loaded automatically by gunicorn from the working directory.
#
# NOTE: this file previously started a full Celery worker thread inside every
# Gunicorn worker via post_fork(). That meant each web process also carried a
# Celery app, a Redis connection, and executed background jobs (WeasyPrint /
# ReportLab PDF generation, pandas imports) in the same process serving HTTP —
# which is what caused the out-of-memory restarts under load.
#
# Background work now belongs to a dedicated Render Background Worker:
#     celery -A config worker --loglevel=info --concurrency=2
# and CELERY_WORKER_AVAILABLE=true must be set so tasks stop running eagerly
# inside the request (see CELERY_TASK_ALWAYS_EAGER in config/settings.py).

import os

# Two sync workers fit comfortably in a small Render instance alongside
# Django + numpy/pandas. Raise only after watching real memory headroom.
workers = int(os.getenv("GUNICORN_WORKERS", "2"))
worker_class = "sync"
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
keepalive = 5

# Recycle workers periodically so any slow leak is bounded rather than
# accumulating until the instance is killed. Jitter avoids all workers
# restarting on the same request.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "500"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "50"))

# Load the app before forking so the interpreter, Django app registry and
# large libraries are shared copy-on-write between workers instead of being
# duplicated per worker.
preload_app = True

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
