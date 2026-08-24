# Attendance API — Integration Reference

For the attendance tracker mobile app (a separate microservice consuming this backend's API).

Last verified against the live backend: 2026-08-24.

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

## 7. Notes and open items

- **No staging environment is documented here** — confirm with the platform admin whether one exists before pointing a build at production.
- **No dedicated rate limit** on the attendance endpoints themselves (only login/token issuing is rate-limited). Fine for launch; worth revisiting before real scale.
- **No OpenAPI/Swagger spec** exists yet — this document is hand-maintained. If the attendance app's shape changes, this doc needs a manual update alongside it.
