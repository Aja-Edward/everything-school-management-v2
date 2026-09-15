# Attendance API — Integration Reference

## 1. Base URL

```
https://everything-school-management-v2.onrender.com
```

Every path below is relative to this host.

## Logging in

Log in at `/api/auth/token/`, **not** `/api/auth/login/`. The latter is the web app's login: in production it puts the tokens in browser cookies only, so a mobile app gets no token from it and every later call answers "not authorized".

```
POST /api/auth/token/
Content-Type: application/json

{ "username": "head@school.example.com", "password": "..." }
```

`username` takes the account's username or its email. **200** returns `access`, `refresh` and `user`, including `user.tenant_slug`. A wrong username or password is **400** `{"non_field_errors": ["Invalid username or password."]}`; more than 5 tries a minute from one address is **429**.

Then send both headers on every request:

```
Authorization: Bearer <access>
X-Tenant-Slug: <user.tenant_slug>
```

The access token lasts 60 minutes. Swap the refresh token for a new pair at `POST /api/auth/token/refresh/` with `{"refresh": "..."}`, and keep the new `refresh`: the old one stops working once used.

**Who can use these endpoints.** The school's own top admin (the account made when the school registered) can use all of them. Teachers can take attendance, record scans and look chips up, but enrolling, revoking or reassigning a chip needs students write access, which teachers don't have. Other admins, such as a primary or secondary section admin, need a role with attendance access (and students write access, for chips), given in the web app under Settings → Roles & Permissions. Without the access, a call gets **403** "You do not have permission to perform this action."


## Attendance endpoints

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

### Field reference

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

## Getting IDs — student and section rosters

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


### UIDs are normalized

Readers report the same physical tag differently by platform. `04:a2:24:1b`, `04-A2-24-1B`, `04 a2 24 1b` and `04a2241b` are all stored and matched as `04A2241B`. Send whatever your reader gives you; don't normalize client-side. A UID must be at least 4 hex characters after normalization, and hex only.

### Enroll a chip

```
POST /api/attendance/tags/
{ "student": 101, "uid": "04:a2:24:1b", "label": "blue rucksack" }
```

`label` is optional free text. **201** returns the full tag including `student_detail`.

Failure shapes carry a machine-readable `code` so the app can branch instead of showing a raw error:

### Resolve a chip — "who is this?"

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


### Roster — working down a class list

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

```
**`counts` always describes the whole section, never the filtered page.** So with `enrolled=false` you get the four outstanding students in `results` while `counts` still says "38 of 42 done" — enough to render real progress.

A `section` belonging to another school returns **400** `section_not_found`.

### Retire a chip

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

### Recording attendance from a chip

These endpoints identify a chip; **section 8** covers recording an actual arrival or departure from one. Use `resolve/` when you only need to know who a chip belongs to without marking anybody present.

Parent notifications happen server-side when a scan is recorded — see **section 9**. The mobile app does not send them and needs no code for them.

## Recording arrivals and departures

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

So you can show **"Vincent Edward — Present, 07:45"** straight from this response with no second lookup.

### 8.3 `warnings` — recorded, but worth a look

**A scan is never refused for a policy reason.** A refused scan is a child who crossed the gate with no record of it, which is worse than an odd-looking record. Anything unusual is recorded and reported here:

### 8.4 Duplicate taps

Re-reading the same chip **in the same direction** inside the school's duplicate window (90 seconds by default) returns **200** with `"duplicate": true`, pointing at the same attendance record. No second arrival, and in step 5, no second message to the parent.


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

### 8.7 Configuring the school day

The windows live per school in `AttendanceSettings`, with defaults of opens 06:30, late from 08:00, afternoon from 12:00, dismissal from 14:00, and a 90-second duplicate window. The timezone comes from the school's own settings (default `Africa/Lagos`). There is no API for editing these yet — it is the Django admin for now, and a settings screen in the web app later.

## 9. Parent notifications

Scanning a chip can tell a parent their child arrived or left. **Nothing in the mobile app needs to do anything for this** — it happens server-side when a scan is recorded. This section is here so you know what the school sees and why a scan response reports it.

### 9.1 What the scan response tells you

Every successful scan response carries:

```json
"notifications_queued": 2
```

That is how many messages were queued for that scan — across all parents and channels. `0` is normal and not an error: a duplicate tap queues nothing, and under anomalies-only policy an ordinary arrival queues nothing either. Don't surface it to a gate operator as a failure.


### 9.3 Alert policy — the real cost lever

Per school, in `AttendanceSettings.alert_policy`:

- **`all_scans`** (default) — a message on every crossing. ~190,000/year for 500 pupils.
- **`anomalies_only`** — a message only when something is unexpected: an early departure, an exit with no arrival recorded, an exit timestamped before its entry, or an arrival before the school opened. Roughly **15,000/year** for the same school.

A late arrival is *not* treated as an anomaly. It is already on the register and it is not a safeguarding event.

`anomalies_only` is about a 90% volume cut and usually a better product — parents stop tuning out routine noise and read the messages that matter.


| Method | Path | Purpose |
|---|---|---|
| GET | `/api/attendance/notifications/` | A parent's own alerts. Staff with attendance access see the school's whole delivery log. |
| GET | `/api/attendance/notifications/{id}/` | One alert. |
| POST | `/api/attendance/notifications/{id}/read/` | Mark mine read. |
| GET | `/api/attendance/notifications/unread-count/` | `{"unread": 3}` for a badge. |


### 9.6 Choosing an SMS provider

The SMS channel currently uses Twilio, because that is what the project already has credentials for. For Nigerian volume that is the wrong choice: Twilio needs alphanumeric sender-ID pre-registration above 30,000 SMS/month, requiring four separate No Objection Certificates, and its Nigeria rates run to ₦395/message at the top of the range.

A local provider with a documented DND corporate route — Termii or Sendchamp — is the better answer, and matters more than price: over 30 million Nigerian numbers are on DND, so a promotional route silently fails to reach them. For a safeguarding message that is the worst failure mode there is.

