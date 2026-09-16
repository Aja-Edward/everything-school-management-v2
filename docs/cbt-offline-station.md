# CBT exam station: sitting papers without the internet

An exam station is a computer on the school's own network that runs a CBT paper
for the computer lab. Students sit the paper in a browser on the lab computers,
talking only to the station, so the exam carries on when the school's internet
is slow or down. Answers are marked back on the school system (the cloud) once
the results are brought back.

Use it for a lab with unreliable internet. Where the internet is good, students
sit papers on the school system directly and none of this is needed:
[cbt-how-it-works.md](cbt-how-it-works.md) covers that, and everything here
assumes it.

## How it works

1. **Package.** On the school system, staff make a package for a published
   paper. It is a `.json` file with the paper and its questions *without* the
   answer keys or marking guides, and the students who may sit it. Each student
   gets a slip number and a six-digit PIN. PINs are shown once, to print the
   slips; the file holds only a slow hash of each.
2. **Station.** Staff load the file onto the station with the station key.
   Students sign in with their slip number and PIN, and sit the paper with the
   same exam screen, rules, timer and invigilation board as online.
3. **Results.** Staff save a results file on the station and upload it on the
   school system. Each attempt in it is signed with a secret from the package,
   checked, stored, and marked against the answer keys that never left. Typed
   answers are marked by teachers as usual.

What the station never has: answer keys, marking guides, other papers, or any
other school data. It knows students only by name, registration number and
class.

Uploading the same results twice changes nothing: every attempt carries the
station's id for it. Results can be saved and uploaded as often as needed, for
example once mid-morning and again at the end.

## Setting up a station

**The computer.** Any machine that stays on for the exam and runs Docker.
Linux is best. Plug it into the lab's switch with a cable rather than Wi-Fi.
A class of 60 needs no more than a recent laptop.

**Install.** From a copy of this repository:

```bash
copy station.env.example station.env
```

Fill in `station.env`:

| Setting | What it is |
|---|---|
| `STATION_DB_PASSWORD` | Any long random string. Nobody types it. |
| `STATION_SECRET_KEY` | Any long random string. Nobody types it. |
| `CBT_STATION_KEY` | What staff type on the station. At least 12 characters. A station with a shorter key accepts no key at all. |
| `STATION_PORT` | Leave at 80. |

Then start it. The first build needs the internet; after that it doesn't:

```bash
docker compose -f docker-compose.station.yml --env-file station.env up -d --build
```

It restarts by itself when the computer does.

**Its address.** Find the station's address on the school network (for
example `192.168.1.20`) and give it a fixed one in the router, so it doesn't
change on exam day. Students and staff open `http://192.168.1.20/station`.
Allow port 80 through the station's firewall.

**Its clock.** The station's clock is the one that counts: it decides when the
paper opens and closes and when each student's time is up. Without the internet
it can't set itself, so check it against a phone before every exam. The station
pages show its clock in the top right corner. The lab computers' clocks don't
matter.

## Before exam day

1. On the school system, open the exam's CBT settings. Publish the paper, then
   go to **Exam station** and press **Make a package**. The file downloads.
2. Print the PIN slips straight away with **Print PIN slips**. The PINs can't be
   shown again. If slips are lost, make a new package and load that instead.
   Slips from one package only work with that package's file.
3. If the package says some questions show a picture or play a sound from the
   internet, those won't work on a station without internet. Replace them, or
   make sure the station's lab can reach the internet for those files.
4. Carry the file to the station on a flash drive. Open
   `http://<station>/station/staff`, enter the key, and **Load a package**.
5. Check the paper shows on the station with the right number of students and
   the right times. **Move the window** if the day or time has changed.

Who is in the package is fixed when it is made: the students who may sit the
paper, and their extra time. A student added to the class later needs a new
package. Don't publish the paper again after making a package: that replaces
its questions, and results sat from the package can't come back. The school
system warns before it lets you.

**Rehearse** with a practice paper the day before, on the real lab computers:
two or three staff sign in with slips, answer, submit, and staff bring the
results back.

## On the day

- Students open `http://<station>/station`, choose the paper if there is more
  than one, and sign in with their slip. A paper with an access code still asks
  for it.
- Staff open **Invigilation board** from the station's staff page. It works as
  it does online: extra time, letting a student back in, ending or voiding an
  attempt.
- When a student finishes, the screen asks them to sign out, so the next student
  can use the computer.
- **Wrong PIN.** Ten wrong PINs at one slip number lock that slip for ten
  minutes, and thirty from one computer lock that computer for a minute. Check
  the student has the right slip.
- **A computer dies.** The student signs in on another computer and carries on.
  Their saved answers and remaining time come with them.
- **The station dies.** Start it again. Answers already saved are kept; the
  exam pages keep answers while the station is away and send them when it's
  back, as they do online. Time keeps running.

## Afterwards

1. On the station's staff page, press **Save results** for the paper. Attempts
   still in progress aren't included; time-ups are ended first. Save again
   later to include students who were still writing.
2. On the school system, open the exam's CBT settings, **Exam station**, and
   **Upload results from the station**. The report says how many attempts came
   in, and names any that were refused and why.
3. Mark typed answers, push scores to results, and release them, from
   **Marking & results**, as for any paper. If scores were pushed before an
   upload, push them again.

An attempt is refused when:

- it was changed after the station saved it, or signed by a different package;
- the paper was published again after the package was made;
- its student has left the school.

## Security notes

- Treat the package file like a printed exam paper: it has the questions. It
  also holds the package's signing secret and the PIN hashes. Someone with the
  file and a school staff login could forge results, and someone with the file
  and time could work out PINs from their hashes. Delete it from flash drives
  after the exam.
- The station key unlocks the invigilation board and results. Wrong keys from
  one computer are limited to ten a minute, across every page that takes the
  key.
- The station is reached over plain HTTP on the school network, as a lab's
  printers are. Keep it off the school's guest Wi-Fi.

## Reference

**Settings** (backend environment):

| Setting | Meaning |
|---|---|
| `CBT_STATION=true` | Run as a station: its endpoints exist, and it marks nothing. |
| `CBT_STATION_KEY` | The staff key, 12 characters or more. |
| `CBT_STATION_ORIGINS` | Extra trusted origins, comma-separated, if the station is reached by a name. |
| `CBT_STATION_CACHE_DIR` | Where rate-limit counts are kept without Redis. Default `/tmp/cbt-station-cache`. |

A station turns off HTTPS redirects and secure cookies, and reads client
addresses from the `X-Real-IP` header its nginx sets. `ENV=station` loads no
`.env.*` file.

**Endpoints on the school system** (teachers and admins who manage the exam):

    GET  /api/cbt/papers/<id>/offline/packages/            packages made
    POST /api/cbt/papers/<id>/offline/packages/            make one; returns the PIN slips
    GET  /api/cbt/papers/<id>/offline/packages/<package>/  the package file
    POST /api/cbt/papers/<id>/offline/results/             a results file, or up to 200 of its attempts

**Endpoints on a station** (404 anywhere else). Staff send the key in
`X-Station-Key`:

    GET  /api/cbt/station/                                 what the station holds
    POST /api/cbt/station/sign-in/                         {"package", "number", "pin"}
    POST /api/cbt/station/sign-out/
    POST /api/cbt/station/staff/key/                       {"key"}: whether it's right
    POST /api/cbt/station/staff/sign-in/                   {"key"}: for the invigilation board
    POST /api/cbt/station/packages/                        load a package file
    GET  /api/cbt/station/packages/<package>/results/      the results file
    POST /api/cbt/station/packages/<package>/window/       {"opens_at", "closes_at"}

**Files.** A package has `"format": "cbt-offline-package"`, a results file
`"format": "cbt-offline-results"`, both `"version": 1`. Each attempt in a
results file is signed with HMAC-SHA256 over its canonical JSON (sorted keys,
no spaces, whole-number floats written as integers so a browser can split the
file into batches), using the package's secret. The school system's upload page
sends 20 attempts at a time.

The code is in `backend/cbt/offline.py` (the school system's side),
`backend/cbt/station.py` and `backend/cbt/station_views.py` (the station's), and
their tests in `backend/cbt/tests_offline.py`.
