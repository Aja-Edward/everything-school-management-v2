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
2. A worker process is running: `celery -A config worker --beat`.
3. `CELERY_WORKER_AVAILABLE=true` on the **web** service, so it hands tasks off
   instead of running them inline.

Order matters: set `CELERY_WORKER_AVAILABLE=true` only **after** the worker is
up. Set it with no worker and tasks are handed to a queue nobody is draining —
which is worse than leaving it unset, because with it unset the tasks at least
run inline.

## One process, not two

Celery can run the beat scheduler inside the worker with `--beat`, so a single
process both schedules and executes. That is what everything below uses.

The textbook arrangement is a separate `celery -A config beat` process, and it
is the right answer at scale — beat inside the worker is a single point of
failure, and it only works with **exactly one worker instance**, because every
replica would run its own scheduler and fire each periodic task once per
replica.

At one school's volume neither concern bites, and on Render the split costs a
second Background Worker at $7/month for a process that submits one task every
five minutes. Start embedded. If you ever run more than one worker, drop
`--beat` and add a dedicated beat service then.

## Render

Background Workers have no free instance type — Starter is $7/month.

**1. The existing Web Service** — add an environment variable:

```
CELERY_WORKER_AVAILABLE=true
```

**2. One new Background Worker**

| Field | Value |
|---|---|
| Repository | this repo |
| Branch | `main` |
| Root Directory | `backend` |
| Runtime | Python |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `celery -A config worker --beat --loglevel=info --pool=threads --concurrency=4` |
| Region | **the same region as the web service** |
| Instance Type | Starter |

Keep it to one instance; see above.

Two things that catch people:

- **A new worker gets no environment variables.** It needs the same set as the
  web service — `REDIS_URL`, `DJANGO_SECRET_KEY`, the database settings, plus
  Cloudinary, Brevo and Twilio. If the variables live directly on the web
  service rather than in an Environment Group, they have to be copied across,
  and they then have to be kept in sync by hand. Moving the shared ones into an
  Environment Group and linking both services is the version that does not rot.
- **Region has to match.** A worker in another region cannot use Render's
  internal networking and pays latency on every Redis and Postgres call.

`--pool=threads` matches `CELERY_WORKER_POOL` in settings. These tasks are
I/O-bound — waiting on Brevo and Twilio — so threads are the right pool and use
far less memory than processes, which matters on a small instance.

## Docker Compose

`docker-compose-production.yml` defines a single `celery` service with `--beat`.
Add `CELERY_WORKER_AVAILABLE=true` to `.env.backend` and:

```bash
docker compose -f docker-compose-production.yml up -d celery
```

Do not `--scale` that service past 1 while `--beat` is on it.

## Locally

Needs Redis reachable on `REDIS_URL`. Note that Render's Redis/Valkey hostname
is internal — something like `red-xxxx:6379` — and resolves only from inside
Render's own network. Pointing a local worker at it fails with

```
consumer: Cannot connect to redis://red-xxxx:6379//: Error 11001 ... getaddrinfo failed
```

which means the URL is fine and your machine simply is not on that network. For
local work run your own Redis (`docker run -p 6379:6379 redis`) and set
`REDIS_URL=redis://localhost:6379/0`.

On macOS or Linux, one terminal:

```bash
cd backend && celery -A config worker --beat --loglevel=info --pool=threads
```

**On Windows `--beat` does not work.** Celery rejects it outright with
`-B option does not work on Windows. Please run celery beat as a separate
service.` So locally on Windows it is two terminals:

```bash
cd backend && celery -A config worker --loglevel=info --pool=threads
```

```bash
cd backend && celery -A config beat --loglevel=info
```

This only affects local development. Render and the Docker image both run Linux,
where the single `--beat` process is fine.

The `threads` pool is required on Windows too — Celery's default `prefork` pool
does not work there.

Beat writes a `celerybeat-schedule` file into the working directory to remember
when each task last ran. It is gitignored; delete it if the schedule changes and
beat seems to be using stale timings.

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

A channel a school has never configured is recorded as `skipped`, not `failed`,
so it is not retried — three identical "not configured" errors per notification
would bury the failures worth looking at.

Email falls back to the platform Brevo account when a school has not set up its
own, so alerts still reach parents at a school that never finished the settings
screen. Which account carried a message is recorded on the notification as
`brevo` (the school's own) or `brevo_platform`.

Two things follow from that fallback:

- It needs `BREVO_API_KEY` **and** a `DEFAULT_FROM_EMAIL` that is a *verified
  sender* on the platform Brevo account. Brevo refuses to send from an address
  it has not verified, so a key alone is not enough.
- A school whose own key is present but rejected fails loudly rather than
  falling back. Quietly re-sending through the platform account would hide the
  misconfiguration and move that school's mail onto shared sending reputation
  without anyone choosing it.

SMS has no fallback, deliberately: texts cost real money per message, and a
school that has not configured an account has not agreed to spend anything.

Alert emails carry a `Reply-To` pointing at the school — its own Brevo sender
address if it has one, otherwise its contact address, otherwise the address the
school registered with. Nothing to configure: `owner_email` is required at
registration, so every school has a working reply address. This matters under
the platform fallback, where the From address belongs to a domain with no MX
records, so a parent answering an alert would otherwise bounce.

## Other periodic tasks

`CELERY_BEAT_SCHEDULE` currently contains only the notification sweep. Several
tasks in `fee/tasks.py` look like they were written for a schedule —
`send_payment_reminders`, `update_overdue_fees`, `process_pending_webhooks`,
`generate_payment_reports` — but none are scheduled anywhere, so none run
automatically. Worth deciding on separately; adding them changes billing
behaviour and should not ride along with a notifications change.
