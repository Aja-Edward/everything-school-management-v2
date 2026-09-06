# Celery worker setup

Parent notifications for gate scans are queued in the database and sent by a
Celery worker. **Without a worker running, parents get in-app alerts and
nothing else** — no email, no SMS.

That is deliberate, not a bug. `CELERY_TASK_ALWAYS_EAGER` is set whenever
`CELERY_WORKER_AVAILABLE` is not `true`, and in eager mode `.delay()` runs the
task inline on the web request. At a gate that would make every child wait on
an HTTP round-trip to Twilio. So the code refuses to send inline and leaves the
rows `queued` instead. Nothing is lost; it just does not go out.

## What has to be true

1. `REDIS_URL` is set. Without it the broker falls back to `memory://`, which
   cannot carry work between processes.
2. A worker process is running: `celery -A config worker`.
3. `CELERY_WORKER_AVAILABLE=true` on the **web** service, so it hands tasks off
   instead of running them inline.
4. Optionally a beat process for the periodic sweep: `celery -A config beat`.

Order matters: set `CELERY_WORKER_AVAILABLE=true` only **after** the worker is
up. Set it with no worker and tasks are handed to a queue nobody is draining.

## Render

Three services, all from the same repo and the same `backend/` root.

**1. The existing Web Service** — add an environment variable:

```
CELERY_WORKER_AVAILABLE=true
```

**2. A new Background Worker**

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `celery -A config worker --loglevel=info --pool=threads --concurrency=4`
- Environment: same variables as the web service, including `REDIS_URL`,
  `DJANGO_SECRET_KEY` and the database settings

**3. A second Background Worker for beat** (optional but recommended)

- Same root, build command and environment as above
- Start command: `celery -A config beat --loglevel=info`

Beat only *submits* scheduled tasks; the worker in step 2 executes them. Beat
without a worker does nothing at all.

`--pool=threads` matches `CELERY_WORKER_POOL` in settings. These tasks are
I/O-bound — waiting on Brevo and Twilio — so threads are the right pool and use
far less memory than processes, which matters on a small Render instance.

## Docker Compose

`docker-compose-production.yml` already defines `celery-worker` and
`celery-beat`. Add `CELERY_WORKER_AVAILABLE=true` to `.env.backend` and:

```bash
docker compose -f docker-compose-production.yml up -d celery-worker celery-beat
```

## Locally

Two terminals, plus Redis on `REDIS_URL`:

```bash
cd backend && celery -A config worker --loglevel=info --pool=threads
```

```bash
cd backend && celery -A config beat --loglevel=info
```

On Windows the `threads` pool is required — Celery's default `prefork` pool does
not work there.

## Checking it works

Queued notifications should drain within seconds of a scan, or within five
minutes via the sweep. To see the current backlog:

```bash
cd backend && python manage.py shell -c "from attendance.models import ScanNotification as N; from django.db.models import Count; print(list(N.objects.values('status','channel').annotate(n=Count('id'))))"
```

To flush by hand without a worker at all — useful for a one-off, or to confirm
the provider credentials work before wiring any of this up:

```bash
cd backend && python manage.py shell -c "from attendance.tasks import flush_pending_scan_notifications as f; print(f())"
```

That returns `{"sent": N, "failed": N}`. A row that keeps failing carries the
provider's own error message in `ScanNotification.error`, visible in the admin
and in the Gate Tracker "Parent alerts" tab.

## What the sweep does and does not do

`attendance.tasks.flush_pending_scan_notifications` runs every five minutes and
picks up anything `queued` or `failed` with fewer than
`attendance.tasks.MAX_ATTEMPTS` (3) attempts. It is a safety net for a broker
outage or a transient provider failure — the normal path is a direct handoff at
scan time.

It will not retry past three attempts. A notification that fails three times
stays `failed` with its error recorded, on the reasoning that a fourth attempt
at an invalid phone number is not going to succeed either.

One known rough edge: a school with no Brevo credentials configured produces a
`failed` email row per notification, retried three times. Harmless but noisy,
and it can mask real failures. "Not configured" should really be `skipped`
(permanent) rather than `failed` (transient).

## Other periodic tasks

`CELERY_BEAT_SCHEDULE` currently contains only the notification sweep. Several
tasks in `fee/tasks.py` look like they were written for a schedule —
`send_payment_reminders`, `update_overdue_fees`, `process_pending_webhooks`,
`generate_payment_reports` — but none are scheduled anywhere, so none run
automatically. Worth deciding on separately; adding them changes billing
behaviour and should not ride along with a notifications change.
