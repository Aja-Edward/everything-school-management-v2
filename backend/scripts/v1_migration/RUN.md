# v1 (God's Treasure Schools) → v2 multitenant migration

**Status: exports have been run against live Neon and verified.** The CSVs in this
folder are real data, not samples.

## What came out

| file | rows | note |
|---|---|---|
| `parents_ready.csv`   | 178 | upload as-is |
| `parents_review.csv`  | 20  | 12 broken phones + 8 missing genders |
| `students_ready.csv`  | 323 | upload as-is |
| `students_review.csv` | 32  | all of them blocked by a parent in review |
| `teachers_ready.csv`  | 20  | upload as-is |
| `teachers_review.csv` | 1   | missing specialization |

Verified on the ready files: every student's parent phone resolves to a parent in
`parents_ready.csv` (0 orphans), every phone is a well-formed Nigerian mobile,
every Senior Secondary student has a Stream, and no enforced field is blank.

## The whole manual job is 21 cells

- **12 parent phone numbers** are wrong in v1 and cannot be repaired mechanically:
  nine are 10 digits (one short), one is 9 digits, one is 12, one is empty.
  These 12 numbers are what block all 32 students in `students_review.csv`.
- **8 parent genders** — v1 has no gender column for parents. Father→M and
  Mother→F were derived automatically; these 8 are Guardians/Sponsors.
- **1 teacher specialization.**

Fix those and the migration is 198 parents / 355 students / 21 teachers, complete.

## Order is not optional

```
1. Create classrooms / sections / streams in v2   (student upload resolves against them)
2. Upload teachers                                (independent)
3. Upload parents                                 (students REQUIRE an existing parent)
4. Upload students
```

`students/tasks.py:301` rejects any student row whose parent phone has no
`ParentProfile`: *"The parent must be registered before bulk upload."*
`students/tasks.py:248` rejects any classroom name that does not already exist.

## Classrooms to create in v2

The v1 free-text `classroom` field was inconsistent (`JSS 1 A` vs `JSS1 A`, and
189 students had none at all), so the `Classroom*` column is derived from the
`student_class` enum instead — clean and uniform:

| class | students | | class | students |
|---|---|---|---|---|
| Pre-Nursery | 17 | | Primary 4 | 29 |
| Nursery 1 | 17 | | Primary 5 | 29 |
| Nursery 2 | 31 | | JSS 1 | 34 |
| Primary 1 | 27 | | JSS 2 | 28 |
| Primary 2 | 39 | | JSS 3 | 28 |
| Primary 3 | 29 | | SS 1 | 24 |
| | | | SS 2 | 13 |
| | | | SS 3 | 5 |

v2 wants `Class Name - Section` (e.g. `Primary 1 - Gold`). Once you have named the
sections in v2, find/replace in the `Classroom*` column. Streams already present:
Science 32, Arts 6, Commercial 4.

## Two judgement calls for the school

**110 student user accounts have no `Student` profile** (465 users vs 355
profiles). 85 have a `-1`/`-2` username suffix and 80 share a name with a real
student, none has ever logged in — they look like duplicate registrations. They
carry no DOB, class, or gender, so there is nothing to migrate even for the ~30
that might be genuine. They are excluded. Worth a look before you retire v1.

**Two pairs of parents share a phone number** and will merge into one account in
v2, which keys parents on phone:

- `Joseph Ndukama` / `Joseph Ndukamma`
- `Ogbu Ignitius` / `Ogbu Ignitus Eja`

Both look like the same person entered twice with a typo. Confirm with the school.

## Re-running

```bash
export PGURL='postgresql://...neon.tech/neondb?sslmode=require'
psql "$PGURL" -f 01_audit.sql
psql "$PGURL" -f 02_parents.sql
psql "$PGURL" -f 03_students.sql
psql "$PGURL" -f 04_teachers.sql
```

Everything is read-only (`SELECT` + session-local `TEMP` views). `\copy` writes to
your current working directory, so `cd` here first.

**Use the direct endpoint, not `-pooler`.** Neon's pooler reuses backend
connections, so `TEMP` views survive between runs and the second run fails with
*"relation already exists"*. The scripts now drop their views first, but the
direct endpoint avoids the problem entirely — just remove `-pooler` from the host.

## Phone normalisation

`00_common.sql` defines `pg_temp.norm_phone()`, used by all three exports. It
returns a canonical `0XXXXXXXXXX`, or `''` when the number cannot be trusted.

Returning `''` is deliberate. An earlier version padded any ≥10-digit value to
`'0' || right(digits,10)`, which silently turned the truncated `0806980045` into
`00806980045` — a number that looks valid, passes v2's validator, and reaches
nobody. Better to fail the row and let a human supply the missing digit.

This matters because the two link directions behave differently:

- student → parent uses `_normalise_phone` (`students/tasks.py:130`), which tries
  `8034…`, `08034…`, `2348034…`, `+2348034…`
- parent → student auto-link (`parent/tasks.py`) uses an **exact string match**
  against `Student.parent_contact`

Normalising both sides to one canonical format is what makes both directions work.
(For the record: no v1 number uses a `234`/`+234` prefix — all are local `0…`.)

## After upload

Both bulk uploads generate credentials. Pull the login sheets from
`/parents/bulk-upload/<id>/export-credentials/` (same for students and teachers)
— generated passwords are not recoverable afterwards.
