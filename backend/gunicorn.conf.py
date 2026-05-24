# gunicorn.conf.py (create this in your project root)
import threading


def post_fork(server, worker):
    """Start a Celery worker thread inside each Gunicorn worker."""
    import django
    django.setup()

    from celery import current_app
    thread = threading.Thread(
        target=current_app.Worker(
            loglevel="info",
            concurrency=1,
            pool="solo",
        ).start,
        daemon=True,
    )
    thread.start()
