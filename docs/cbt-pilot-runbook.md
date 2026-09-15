# CBT pilot runbook

The first live use of computer-based testing should be a mock exam: one class,
one paper, nothing riding on the score. The point is to find what goes wrong
while it is cheap. This covers deploying, a dress rehearsal the day before, the
exam itself, what to do afterwards, and how much load the system has been
checked against.

If the lab's internet can't be relied on, run the pilot on an exam station on
the school's own network instead: see [cbt-offline-station.md](cbt-offline-station.md).

**Suggested pilot:** one class of up to 60 students, in the computer lab, with
a 30–45 minute paper of 20–40 objective questions and at most one typed
question. Keep a printed copy of the paper, in case the pilot has to finish on
paper.

## 1. Deploy

| Check | How |
|---|---|
| Migrations `cbt` 0001–0008 and `exam` 0001–0004 are applied | The build runs `python manage.py migrate` (see `backend/build.sh`; Render's dashboard Build Command must match). Confirm with `python manage.py showmigrations cbt`. |
| The frontend build includes DOMPurify | `dompurify` is in `frontend/package.json`. A fresh `pnpm install` picks it up. Question text is sanitised with it before it is shown. |
| A Celery worker with beat is running, and `CELERY_WORKER_AVAILABLE=true` is set on the web service | See [celery-worker-setup.md](celery-worker-setup.md). Beat runs `close-expired-cbt-attempts` every minute. |
| `X-CBT-Session` gets through | It is in `CORS_ALLOW_HEADERS` in settings. A proxy or CDN with its own header allowlist needs it added there too. |
| Redis is set in production | Rate limits are counted in the cache. With Redis every web worker shares the count. |
| Cloudinary credentials are set on the web service, for sound clips | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. The server signs each upload, and the teacher's browser sends the file straight to Cloudinary. Without them, adding a clip says file storage isn't set up. |
| The computer lab's network allows `res.cloudinary.com` | Students' exam pages download every clip when the exam opens. A school filter that blocks the host leaves listening questions silent. |

**Without the worker**, an attempt still ends at its deadline as soon as
anything touches it: the student's page, their exam list, or the invigilation
board loading. What stops working is closing attempts nobody touches. A student
whose computer died stays "writing" in the database until someone opens the
board. The pilot can run like that, but the time-out check in the rehearsal
below will fail.

**If saves fail with "This exam has been opened on another device"** on every
computer, the `X-CBT-Session` header is being dropped on the way to Django.

## 2. School set-up

For the pilot school:

- **Students.** Every student in the class can sign in, and is in the right
  class, plus the right section or stream if the exam is set for one. A student
  whose exam registration is marked not registered is left out.
- **Extra time.** Students allowed extra time have it in `extra_time_minutes`
  on their exam registration. It is added even when they start close to closing
  time.
- **Results.** Needed only to push CBT scores into the result sheet:
  - an active grading system (Settings → Exams & Result);
  - an active exam session for the term;
  - a score column (assessment component) for the class's education level.

  CBT scores are scaled to that column's maximum and written to DRAFT results
  only.
- **Access code.** Set one on the paper. Without it, anyone signed in as a
  student can move that student's exam onto another computer. With it, they also
  need the code, which only the invigilator gives out, in the room.

Lab computers' clocks don't matter. Every deadline is kept on the server, and
the exam page corrects its countdown from the server's time.

## 3. Dress rehearsal (the day before)

This is the end-to-end check nobody has done yet: it needs real sign-ins. Use
one staff account and two test student accounts in the pilot class, on two
computers. Make a separate throwaway exam for it, not the pilot paper.

**Staff: set up the paper**

1. Go to Exams, open the rehearsal exam, and choose **CBT**. Set:
   - the window: opens now, closes in 2 hours;
   - duration: 10 minutes;
   - an access code;
   - results released when staff release them.
2. **Check** lists any problems by question number. Fix them in the exam
   editor.
3. **Preview** shows the paper as students will see it. Before this, give one
   question a formula with the editor's **√x Formula** button, and one option
   a formula with its own **√x** button, e.g. `\dfrac{1}{2}` and
   `\ce{H2SO4}`. Both are drawn in the preview. A formula that can't be drawn
   is listed above the preview. Download the exam's PDF as well: the formulas
   print there too.

   Give the objective section one question of each answer type as well:
   choose one, choose all that apply (with part marks on), true or false,
   and a number with a margin and a unit, e.g. 9.8 with 0.1 either side, in
   m/s². The preview shows ticks for choose all that apply and a number box
   with its unit.

   For listening, add a short sound clip to one question with **Add a sound
   clip**, allowed to play twice, and one to the objective section (under its
   instructions). Play both in the preview.
4. **Publish**. The exam list shows a "CBT published" badge.

**Student A, computer 1**

5. Go to Dashboard → CBT Exams. Start the paper with the access code. Answer a
   few questions. The formulas from step 3 are drawn, not shown as code.
   Tick two options on the choose-all question, and type the number as a
   fraction or with its unit, e.g. 49/5 or 9.8 m/s². Type "9.8." and check
   the warning that it can't be read as a number.
   Play the question's clip twice: the button then says both plays are used.
   Play the section's clip, move to the next question while it plays, and
   check it keeps playing. Reload the page: the plays used are still used.
6. Reload the page. The answers are still there, and so is the clock.
7. Turn off the Wi-Fi and answer two more. The page shows answers waiting.
   Turn the Wi-Fi back on: they save within a few seconds.
8. Switch to another window and back. This becomes a warning on the board.

**Student A, computer 2**

9. Start the same paper and enter the access code. The exam carries on here,
   with the saved answers. Computer 1 now says the exam was opened on another
   device and stops saving.

**Staff: CBT Invigilation** (in both the admin and teacher menus)

10. The board shows student A writing, with the answered count, the warning
    from step 8 and the device change from step 9.
11. **Extend** A by 5 minutes. A's countdown moves within 30 seconds, at the
    next check-in.
12. Student B starts, then stops touching the computer. After 90 seconds B
    shows as offline. **Submit** B's attempt, then **Reopen** it with 5
    minutes. B can carry on.
13. Student A submits. No score is shown, because release is set to manual.
    On the board, student A's event log shows "Played a sound clip" for each
    play. A clip that wouldn't play shows as a warning.

**Time-out, which checks the worker**

14. Student B closes the browser and nobody opens anything for 12 minutes.
    Then open the board. B is already "timed out", with its submitted time at
    the deadline. B's event log shows it was ended within about 90 seconds of
    the deadline: a 30-second grace period, then the next run of the
    once-a-minute task. If the event's time is when you opened the board, the
    worker or beat isn't running.

**Marking and results**

15. In the paper's **Marking** tab, give marks to the typed answers. Students
    are marked complete once every typed answer has a mark. The number
    question's row lists the answers students gave; 49/5 and 9.8 count as one.
    Use **Change answer** on it to widen the margin, and check that the
    scores are re-marked.
16. **Analysis** shows the paper. With two students it holds back
    discrimination and reliability; that is expected.
17. **Results**:
    - choose the exam session and score column, then **Push**. The students'
      result sheets now hold the scaled score in DRAFT;
    - **Release**. Student A's CBT Exams page now shows the score.
18. Leave the rehearsal exam as it is. Its attempts belong to that exam only,
    and a paper that has attempts can't be deleted, so students' scripts
    can't be lost by accident. Don't push results from it.

Note down anything confusing on the screens. It is exactly the feedback the
pilot is for.

## 4. On the day

**30 minutes before**

- Every computer is on the site, signed out. Browser: current Chrome, Edge or
  Firefox.
- The invigilator is signed in, with the board open on the pilot paper.
- The paper is published. Its window opens at the start time and closes with
  some slack: the latest start plus the duration plus 10 minutes.

**Start**

- Students sign in and open CBT Exams. Write the access code on the board only
  now.
- Starts appear on the board as they happen. Nobody has to start at the same
  second: each student's clock starts when they press Start, and a late start
  is cut off at the closing time (plus any extra time).

**During**

| You see | Do |
|---|---|
| A student offline (not seen for 90 seconds) | Check their computer and network. The page keeps unsaved answers and resends them once it's back. |
| A computer dies | Move the student to a spare computer, sign in, start with the access code. Saved answers carry over. Anything the dead computer never managed to send is lost: at most the last few seconds. Give the lost minutes back with **Extend**. |
| The whole lab loses network | Students keep answering; the pages save when the network returns. The server clocks keep running, so extend affected students afterwards. |
| Power cut | Same as a dead computer, for everyone. Extend each student by the time lost, with a reason. |
| Warnings pile up for one student | Look before acting. Focus lost is often a notification or an accidental click. Every staff action needs a reason and is kept in the exam's record. |
| A student submitted by mistake | **Reopen** with the minutes they had left. |
| A question is wrong | Carry on. After the exam, correct the answer key or award everyone the marks from the Marking tab. Scores are recalculated and the change is recorded. |

**End**

At the deadline each page submits by itself. Anyone whose page didn't is closed
by the worker within about 90 seconds, as timed out. Don't unpublish: once
anyone has started, a paper can't be taken down.

## 5. After the exam

1. Mark the typed answers in the **Marking** tab.
2. Read **Analysis** before releasing anything. Questions flagged very hard,
   with weaker students doing better, or with a popular wrong option are usually
   answer-key mistakes. Fix the key first.
3. **Push** to results, check a few result sheets, then **Release**.
4. From the Analysis tab, apply the bank difficulty suggestions if the
   questions came from the bank. They need at least 10 students.
5. Collect feedback from the invigilator and a few students:
   - Was anything unclear on the exam screen?
   - Did the clock or saving ever look wrong?
   - How long did signing in take the whole class?

## 6. Load

### Checked locally

`backend/cbt/load_check.py` runs a class sitting one paper at once through the
real API: middleware, school lookup, permissions and rate limits. It runs
against a throwaway local database (see the file's docstring for the command).

It checks that:
- nobody ends up with two attempts, even pressing Start twice at once;
- every saved answer is the student's last choice;
- every score is right;
- no time reported by a check-in is lost when three arrive at once;
- no request fails.

Results on a development Windows laptop, 15 September 2026: 300 students,
40 questions, 12,000 answers. All checks passed in both runs.

| Requests in flight | 10 | 50 |
|---|---|---|
| Throughput while writing | 70/s | 57/s |
| Save answers, p50 / p95 | 146 / 230 ms | 968 / 1,316 ms |
| Heartbeat, p50 / p95 | 135 / 224 ms | 938 / 1,300 ms |
| Start, p50 / p95 | 282 / 426 ms | 1,866 / 3,122 ms |
| Submit (marks the attempt), p50 / p95 | 247 / 493 ms | 1,763 / 3,651 ms |
| Load paper, p50 / p95 | 23 / 43 ms | 32 / 2,077 ms |
| Invigilation board, p50 / p95 | 155 / 379 ms | 187 / 470 ms |

Every request runs in one Python process, so the load check is limited by
that process, not the database. Adding requests in flight lowered throughput,
and the times grew in proportion: 50 in flight ÷ 57 per second ≈ 0.9 s of
waiting. Read these as "correct under a full class, and a single process
already serves about three times what 300 students need" (see below). They
are not per-request times for a production instance.

Starts are the slowest request relative to their work. Creating an attempt
locks the paper row while that student's questions are drawn, so starts for
one paper take turns. For a class arriving over a minute or two, that is well
within budget. If a whole school ever starts one paper at the same second,
lock the student instead; the database's one-attempt-in-progress constraint
already stops duplicates.

`backend/cbt/tests_queries.py` runs with the normal test suite. It makes sure
the board, marking, analysis, exam list, saving and submitting issue the same
number of database queries for a class of 3 as for 15. A busy screen can't
quietly get slower as classes grow.

`backend/cbt/tests_isolation.py` calls every CBT endpoint as another school's
admin and student, and as this school's students on staff endpoints. It checks
that each call is refused and changes nothing.

### What production needs to handle

The exam page checks in every 30 seconds and saves an answer shortly after it
is chosen (400 ms; 2.5 s after typing stops). A student answering one question
every 30–60 seconds sends about 4 requests a minute:

| Class size | Steady load | Bursts |
|---|---|---|
| 60 (the pilot) | ~4 requests/s | 60 starts over a few minutes; 60 submits in a few seconds at the deadline |
| 300 (several classes) | ~20 requests/s | the same, five times over |

The deadline burst is the heaviest moment, since every submit also marks the
objective answers. Starts for one paper take turns on the paper's row lock,
as described above.

### Before a whole-school CBT exam

The pilot class is itself the first production load test. Before scheduling
several classes at once, ops should:

1. **Watch the pilot.** Record:
   - web instance CPU and memory;
   - database connections in use on the pooler, against its limit;
   - response times for `/api/cbt/attempts/*/answers/` and `/submit/` in the
     logs;
   - any 429 or 5xx responses.
2. **Load-test staging, not production.** Use the same instance types and the
   same pooler mode as production, with an HTTP load tool (k6, Locust) against
   a test school. Model the class from the table above and include the deadline
   burst. Each request in flight holds one database connection, so the web
   workers × threads must fit inside the pooler's limit, leaving room for the
   Celery worker.
3. **Never run `SET SESSION` through the production pooler** while tuning,
   for example to try a statement timeout. The pooler hands that connection to
   other clients, including the live app. Use `SET LOCAL` inside a transaction,
   or a role-level setting.

## 7. If the pilot has to stop

- Tell students to stop, and hand out the printed paper for the time left.
- Nothing needs deleting. Every answer that reached the server stays on it,
  and the Marking tab shows them.
- To end all attempts at once, submit each from the board with a reason, such
  as "Pilot stopped, finished on paper".
- Write down what happened and at what time. The paper's event log keeps the
  server's side of it.
