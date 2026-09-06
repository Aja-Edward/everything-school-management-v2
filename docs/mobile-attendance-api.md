# Attendance API — Integration Reference

For the attendance tracker mobile app (a separate microservice consuming this backend's API).

Last verified against the live backend: 2026-09-06.

## 1. Base URL

Use the backend host directly. **Do not** use `nuventacloud.com` or `www.nuventacloud.com` — that domain serves the web app (Vercel), and its rewrite rules silently return the website's HTML for any unmatched path, including `/api/*`. It will look like it worked (HTTP 200) and won't be JSON.

```
https://everything-school-management-v2.onrender.com
```

Every path below is relative to this host.

## 2. Quick start

1. **Get a token pair.**

   ```
   POST /api/auth/token/
   Content-Type: application/json

   { "username": "teacher@example.com", "password": "..." }
   ```

   `username` accepts either a username or an email. Response:

   ```json
   {
     "access": "eyJhbGciOi...",
     "refresh": "eyJhbGciOi...",
     "user": {
       "id": 42,
       "username": "teacher@example.com",
       "email": "teacher@example.com",
       "first_name": "Ada",
       "last_name": "Obi",
       "role": "teacher",
       "is_superuser": false,
       "is_staff": false,
       "is_active": true,
       "tenant_id": "b3f1...",
       "tenant_slug": "godstreasureschools"
     }
   }
   ```

   Rate-limited to 5 requests/minute per IP. Over that, you get `429` with `{"detail": "Too many requests. Please wait before trying again."}`.

2. **Call the API.** Send both of these headers on every request:

   ```
   Authorization: Bearer <access>
   X-Tenant-Slug: <tenant_slug from the login response>
   ```

3. **Refresh when the access token expires** (60 minutes):

   ```
   POST /api/auth/token/refresh/
   Content-Type: application/json

   { "refresh": "<refresh token>" }
   ```

   Response: `{ "access": "...", "refresh": "..." }`. **Store the new `refresh` value, not just the new `access`.** Refresh tokens rotate on every use — the old one is blacklisted immediately, so reusing it fails. The refresh token itself is valid for 7 days from issue; if the app hasn't refreshed in that window, log in again.

## 3. Authentication reference

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/token/` | Log in. Returns `access`, `refresh`, `user`. |
| POST | `/api/auth/token/refresh/` | Exchange a refresh token for a new pair. |
| POST | `/api/auth/token/verify/` | Optional: check whether a token is still valid. Body: `{"token": "..."}`. `200` if valid, `401` if not. |

All three are `AllowAny` — no auth header needed to call them (that would be circular). Every other endpoint in this doc requires `Authorization: Bearer <access>`.

**Failure shapes:**

- Missing/invalid/expired access token → `401`, `{"detail": "Authentication credentials were not provided."}` (or similar `detail` message for an expired/malformed token).
- Wrong username/password → `400`, `{"non_field_errors": ["Invalid username or password."]}`.
- Rate limited → `429`, `{"detail": "Too many requests. Please wait before trying again."}`.

## 4. Tenant context — required on every request

This backend is multi-tenant: every school is a separate tenant, and every attendance record belongs to exactly one. There is no subdomain for a mobile client to signal which school it's operating for, so you must send it explicitly:

```
X-Tenant-Slug: godstreasureschools
```

(An alternative `X-Tenant-ID: <uuid>` header also works, if you'd rather key off the ID from the login response's `tenant_id`.)

Without this header, tenant-scoped endpoints either 403 or return an empty result set — not an error you'd necessarily notice. The teacher's own account is tied to exactly one tenant already (`tenant_slug` in the login response above); just echo that value back on every call and you're covered for as long as that teacher is logged in.

## 5. Attendance endpoints

Base path: `/api/attendance/attendance/`

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List records. Paginated. |
| POST | `/` | Create one record. |
| GET | `/{id}/` | Retrieve one record. |
| PATCH | `/{id}/` | Update one record. |
| DELETE | `/{id}/` | Delete one record. |
| POST | `/bulk-upsert/` | Create-or-update up to 500 records in one atomic request. **Use this for "mark my class."** |
| GET | `/stats/` | Aggregated present/absent/late/excused counts for the current filters. |

List/stats filters (query params): `date`, `start_date`, `end_date`, `student`, `teacher`, `section`, `status`, `stream`, `education_level`.

### 5.1 Bulk upsert — the main endpoint for a mobile "take attendance" flow

```
POST /api/attendance/attendance/bulk-upsert/
Content-Type: application/json
Authorization: Bearer <access>
X-Tenant-Slug: <slug>

{
  "records": [
    {
      "student": 101,
      "section": 7,
      "date": "2026-08-24",
      "session": "morning",
      "status": "P",
      "teacher": 12,
      "time_in": "08:05:00"
    },
    {
      "student": 102,
      "section": 7,
      "date": "2026-08-24",
      "session": "morning",
      "status": "A"
    }
  ]
}
```

The lookup key is `(tenant, student, section, date, session)` — send it again with a different `status` for the same student/date/session and it updates the existing record instead of duplicating it. Useful if a teacher corrects a mistake five minutes after submitting.

Response:

```json
{
  "created": 1,
  "updated": 1,
  "records": [ /* full Attendance objects, see field reference below */ ]
}
```

If a `student` or `section` ID doesn't belong to the current tenant, the whole request is rejected before writing anything:

```json
{
  "error": "Some IDs not found in this tenant.",
  "missing_students": [101],
  "missing_sections": []
}
```

### 5.2 Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `student` | integer (Student ID) | yes | |
| `teacher` | integer (Teacher ID) | no | Who marked it. Null is fine. |
| `section` | integer (Section ID) | yes | |
| `date` | `YYYY-MM-DD` | yes | Can be in the past — the backend flags it as `marked_late` automatically. |
| `session` | `"morning"` \| `"afternoon"` | no | Defaults to `morning`. |
| `status` | `"P"` \| `"A"` \| `"L"` \| `"E"` | yes | Present / Absent / Late / Excused. |
| `time_in` | `HH:MM:SS` | no | |
| `time_out` | `HH:MM:SS` | no | Must be after `time_in` if both are set. |
| `back_fill_reason` | string | no | Free text; shown in audit views when a record is back-dated. |

Read-only fields you'll get back but never send: `marked_late`, `created_at`, `updated_at`, plus a set of `_name`/`_display` convenience fields (`student_name`, `section_name`, `session_display`, etc.) for anything that just needs to display a record without a second lookup.

## 6. Getting IDs — student and section rosters

`student`/`section`/`teacher` above are internal database IDs, not names. To build a "pick a class, see its students" flow, pull from the existing endpoints (same host, same two headers):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/classrooms/sections/` | List sections for the current tenant. |
| GET | `/api/students/students/` | List students (filterable; a teacher's own view is already scoped to their assigned section). |
| GET | `/api/teachers/teachers/` | List teachers. |

These aren't part of the attendance app itself, so treat this as a pointer rather than a full reference — ask if you need the filter params documented in more depth.

## 7. Chip/card enrollment

Base path: `/api/attendance/tags/`

The chip carries **nothing but its own UID** — no name, no class, no personal data. Identity lives in the database and is resolved through these endpoints. Nothing is ever written to the tag.

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/` | List enrolled tags. Paginated. | any authenticated user |
| POST | `/` | Enroll a chip for a student. | students **write** |
| GET | `/{id}/` | Retrieve one tag. | any authenticated user |
| PATCH | `/{id}/` | Edit `label` only. | students **write** |
| POST | `/{id}/revoke/` | Retire a tag (lost or revoked). | students **write** |
| POST | `/reassign/` | Move a UID to a different student. | students **write** |
| GET | `/resolve/?uid=` | Identify a chip. No side effects. | attendance **read** |
| GET | `/roster/` | Students plus enrollment state. | attendance **read** |

Two things to note about permissions:

- **Teachers can resolve and read the roster, but cannot enroll.** Binding a chip to a child is an identity operation, so it sits behind students-write, which the teacher role bypass does not grant. If schools want form teachers enrolling their own classes, say so — it is a one-line change.
- **These endpoints are school-wide, not section-scoped.** Unlike `/api/attendance/attendance/`, they are not narrowed to the caller's own education levels: whoever is on the gate has to identify every child who walks through it. Tenant isolation is still absolute — a chip enrolled at one school is invisible to every other.

`DELETE /{id}/` returns **405** with `{"code": "use_revoke"}`. Tags are never deleted, so past scans stay attributable.

### 7.1 UIDs are normalized

Readers report the same physical tag differently by platform. `04:a2:24:1b`, `04-A2-24-1B`, `04 a2 24 1b` and `04a2241b` are all stored and matched as `04A2241B`. Send whatever your reader gives you; don't normalize client-side. A UID must be at least 4 hex characters after normalization, and hex only.

### 7.2 Enroll a chip

```
POST /api/attendance/tags/
{ "student": 101, "uid": "04:a2:24:1b", "label": "blue rucksack" }
```

`label` is optional free text. **201** returns the full tag including `student_detail`.

Failure shapes carry a machine-readable `code` so the app can branch instead of showing a raw error:

| Status | `code` | Meaning |
|---|---|---|
| 409 | `uid_already_assigned` | Another student holds this chip. Response includes `assigned_to` (that student's identity) so you can offer "reassign to this student?". |
| 400 | `student_not_found` | No such student in this school. |
| 400 | — | Validation error on `uid` (empty, too short, non-hex). |

A student may hold more than one active tag (a bag chip *and* a card). Uniqueness is on the UID, not the student.

### 7.3 Resolve a chip — "who is this?"

```
GET /api/attendance/tags/resolve/?uid=04:a2:24:1b
```

**Read-only: this records nothing and marks nobody present.** Use it to confirm a chip belongs to who you think it does. Marking attendance is the scan endpoint (step 4, not built yet).

**200:**

```json
{
  "tag": { "id": 12, "uid": "04A2241B", "label": "blue rucksack", "status": "active", "...": "..." },
  "student": {
    "id": 101,
    "name": "Vincent Eze",
    "registration_number": "GTS/2024/041",
    "class_display": "Primary 4",
    "section": 7,
    "section_name": "A",
    "profile_picture": "https://res.cloudinary.com/..."
  }
}
```

Both failure cases are **404**, and the distinction matters to your UI:

| `code` | Meaning | Suggested UI |
|---|---|---|
| `uid_not_enrolled` | No tag has ever held this UID here. | Offer "enroll this chip". |
| `uid_not_active` | A tag held it but was revoked or reported lost. Response includes the `tag` so you can show when and why. | Explain the chip was retired — do **not** silently offer to enroll. |
| `uid_required` (400) | No `uid` query parameter. | — |

### 7.4 Roster — working down a class list

The enrollment flow this is built for: pick a section, the app shows who still needs a chip, staff taps each child's bag in turn.

```
GET /api/attendance/tags/roster/?section=7&enrolled=false
```

| Param | Purpose |
|---|---|
| `section` | Restrict to one section. Omit for the whole school. |
| `enrolled` | `false` for students still needing a chip, `true` for those done. Omit for all. |
| `search` | Matches first name, last name, or registration number. |

Response (paginated, plus two extra top-level keys):

```json
{
  "count": 4, "next": null, "previous": null,
  "total_pages": 1, "current_page": 1, "page_size": 50,
  "section": { "id": 7, "name": "A" },
  "counts": { "total": 42, "enrolled": 38, "unenrolled": 4 },
  "results": [
    {
      "id": 101, "name": "Vincent Eze", "registration_number": "GTS/2024/041",
      "class_display": "Primary 4", "section": 7, "section_name": "A",
      "profile_picture": null,
      "is_enrolled": false,
      "tags": []
    }
  ]
}
```

**`counts` always describes the whole section, never the filtered page.** So with `enrolled=false` you get the four outstanding students in `results` while `counts` still says "38 of 42 done" — enough to render real progress.

A `section` belonging to another school returns **400** `section_not_found`.

### 7.5 Retire a chip

```
POST /api/attendance/tags/{id}/revoke/
{ "status": "lost", "reason": "bag stolen on the bus" }
```

`status` is `"revoked"` (default) or `"lost"`; `reason` is optional free text. **200** returns the updated tag with `revoked_at` and `revoked_by` filled in.

Revoking an already-retired tag returns **400** `tag_not_active`.

Once revoked, **the UID can be enrolled again** — a replacement chip may legitimately reuse it, and the old row survives for history.

To replace a lost chip for the same student: revoke the old tag, then enroll the new UID normally.

### 7.6 Reassign — chip on the wrong bag

```
POST /api/attendance/tags/reassign/
{ "uid": "04A2241B", "student": 102, "reason": "chip was on the wrong bag" }
```

One atomic step: the tag currently holding that UID is revoked and a fresh one issued to the new student. **201** returns the new tag.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `already_assigned_to_student` | That student already holds this chip. |
| 400 | `student_not_found` | No such student in this school. |

If the UID isn't enrolled at all, reassign simply enrolls it — safe to call without checking first.

### 7.7 Recording attendance from a chip

These endpoints identify a chip; **section 8** covers recording an actual arrival or departure from one. Use `resolve/` when you only need to know who a chip belongs to without marking anybody present.

**Parent notifications are not built yet.** Nothing is sent to a parent by any endpoint in this document.

## 8. Recording arrivals and departures

Base path: `/api/attendance/scans/`

| Method | Path | Purpose | Permission |
|---|---|---|---|
| POST | `/` | Record one tap. | attendance **write** |
| POST | `/batch/` | Flush a queue from an offline gate. | attendance **write** |
| GET | `/` | The scan log. Paginated. | any authenticated user |
| GET | `/{id}/` | One scan. | any authenticated user |

The log is read-only: `PATCH` returns 405 and `DELETE` is refused. An append-only record nobody can quietly rewrite is the point of keeping one. Corrections go on the `Attendance` row the scan projected onto.

### 8.1 What you send, and what the server works out

The phone knows two things — which chip it read and when. Everything else is derived server-side from the school's configured windows, so **do not compute any of it client-side**:

| Derived | From |
|---|---|
| student | the chip's UID |
| section | that student's record |
| date | the scan time, in the school's timezone |
| session (morning/afternoon) | the scan time vs the school's afternoon start |
| Present vs Late | the scan time vs the school's late cut-off |
| `time_in` / `time_out` | the direction |

```
POST /api/attendance/scans/
{
  "uid": "04:a2:24:1b",
  "direction": "in",
  "scanned_at": "2026-09-07T07:45:00+01:00",
  "device_id": "gate-phone-1",
  "client_scan_id": "5f3c…"
}
```

Only `uid` and `direction` are required. `direction` is `"in"` or `"out"`.

**`direction` is never inferred from previous state.** Send it explicitly every time. Default it from the time of day in your UI if you like, but show the operator which mode they're in — if the app guessed, a second tap at a busy gate would flip a child to "left the premises" and alarm a parent whose child just walked in.

**`scanned_at`** defaults to now. Send the real device time when replaying a queue — a child who was late when the gate read them stays late, however long the flush took. A timestamp more than 5 minutes ahead of the server is still recorded but flagged `future_timestamp`.

**`client_scan_id`** is your idempotency key. Generate one per scan (a UUID is fine) and keep it with the queued item. Replaying it returns the stored scan instead of recording a second one.

### 8.2 Response

**201** for a scan that was recorded; **200** when nothing changed (a duplicate or a replay). One call gives you everything needed to render the result:

```json
{
  "student": {
    "id": 101, "name": "Vincent Eze",
    "registration_number": "GTS/2024/041",
    "class_display": "Primary 4", "section": 7, "section_name": "A",
    "profile_picture": "https://res.cloudinary.com/..."
  },
  "scan": { "id": 9001, "uid": "04A2241B", "direction": "in", "scanned_at": "...", "is_duplicate": false, "...": "..." },
  "attendance": { "id": 4412, "date": "2026-09-07", "session": "morning", "status": "P", "time_in": "07:45:00", "time_out": null, "...": "..." },
  "session": "morning",
  "status": "P",
  "duplicate": false,
  "replayed": false,
  "warnings": []
}
```

So you can show **"Vincent Eze — Present, 07:45"** straight from this response with no second lookup.

### 8.3 `warnings` — recorded, but worth a look

**A scan is never refused for a policy reason.** A refused scan is a child who crossed the gate with no record of it, which is worse than an odd-looking record. Anything unusual is recorded and reported here:

| Warning | Meaning | Suggested UI |
|---|---|---|
| `late_arrival` | Entry at or after the late cut-off. Status is `L`. | Normal; the badge already says Late. |
| `before_opening` | Entry before the school opens. | Quiet note. |
| `early_departure` | Exit before normal dismissal. | Worth showing — this is what anomaly-only alerting notifies parents about. |
| `exit_without_entry` | Exit with no arrival recorded today. | **Prominent.** Ask the operator to confirm; the child may have arrived before the system was in use. |
| `exit_before_entry` | Exit timestamped at or before the arrival on the same row. `time_out` is left unset to keep the record valid. | Prominent — usually a wrong direction or a bad clock. |
| `future_timestamp` | Device clock is more than 5 minutes ahead. | Check the device clock. |

### 8.4 Duplicate taps

Re-reading the same chip **in the same direction** inside the school's duplicate window (90 seconds by default) returns **200** with `"duplicate": true`, pointing at the same attendance record. No second arrival, and in step 5, no second message to the parent.

A run of taps all collapse onto the first, not onto each other — three taps in 80 seconds is one arrival plus two duplicates. Opposite directions are never duplicates, so an in-then-out within a few seconds both register.

Duplicates are still stored, flagged `is_duplicate`, so "the attendant tapped four times" is answerable later.

### 8.5 Failures

Only identity and integrity problems refuse a scan:

| Status | `code` | Meaning |
|---|---|---|
| 404 | `uid_not_enrolled` | No tag holds this UID at this school. |
| 404 | `uid_not_active` | The tag was revoked or reported lost. |
| 422 | `student_has_no_section` | The student is not assigned to a section, so there is nowhere to file attendance. An admin must place them first. |
| 400 | — | Validation error on `uid` or `direction`. |

### 8.6 Offline flush

```
POST /api/attendance/scans/batch/
{ "scans": [ { …one scan… }, { …another… } ] }
```

Up to 500 per request. **Always returns 200** — items are applied independently, so one unenrolled chip cannot cost the other 199 children their attendance. This is deliberately unlike `/attendance/bulk-upsert/`, which is all-or-nothing.

```json
{
  "summary": { "submitted": 3, "recorded": 2, "duplicates": 0, "replayed": 0, "failed": 1 },
  "results": [
    { "index": 0, "ok": true,  "student": {...}, "attendance": {...}, "status": "P", "warnings": [] },
    { "index": 1, "ok": false, "uid": "DEADBEEF", "client_scan_id": "q-1",
      "code": "uid_not_enrolled", "detail": "This chip is not enrolled for any student." },
    { "index": 2, "ok": true,  "student": {...}, "attendance": {...}, "status": "L", "warnings": ["late_arrival"] }
  ]
}
```

Reconcile your queue from `results`, matching on `index` or `client_scan_id`. Clear the items with `"ok": true`; keep the failures for someone to look at — a `uid_not_enrolled` needs an admin to enroll that chip, not a retry.

Re-flushing an already-sent queue is safe if every item carries a `client_scan_id`: they come back as `replayed` and nothing is recorded twice.

### 8.7 Configuring the school day

The windows live per school in `AttendanceSettings`, with defaults of opens 06:30, late from 08:00, afternoon from 12:00, dismissal from 14:00, and a 90-second duplicate window. The timezone comes from the school's own settings (default `Africa/Lagos`). There is no API for editing these yet — it is the Django admin for now, and a settings screen in the web app later.

## 9. Notes and open items

- **No staging environment is documented here** — confirm with the platform admin whether one exists before pointing a build at production.
- **No dedicated rate limit** on the attendance endpoints themselves (only login/token issuing is rate-limited). Fine for launch; worth revisiting before real scale.
- **No OpenAPI/Swagger spec** exists yet — this document is hand-maintained. If the attendance app's shape changes, this doc needs a manual update alongside it.
