# Computer-based testing: how it works

A guide for the people running an exam: what each of teachers, students and
admins does, in the order they do it.

Two companion documents go further: [cbt-pilot-runbook.md](cbt-pilot-runbook.md)
for the first live exam, hour by hour, and
[cbt-offline-station.md](cbt-offline-station.md) for a lab whose internet
can't be relied on.

## What CBT is here

A CBT paper always belongs to an exam that already exists in the system, and
uses that exam's questions. Setting one up doesn't rewrite the exam: it says
how the exam is delivered on screen — when it opens, how long each student
gets, which questions they see and in what order.

Publishing takes a copy of the exam's questions. Editing the exam afterwards
leaves the published paper alone until someone publishes it again, so a
correction mid-exam can't change what students in the room are answering.

Question types: choose one, true or false, choose all that apply, a number,
and typed answers. Everything except typed answers is marked by the system the
moment a student hands in. Practical questions are never included.

## Who can do what

| | Teacher | Section admin | School admin |
|---|---|---|---|
| Set up a paper | their own exams | exams at their levels | every exam |
| Add questions from the bank | while the exam is still editable | yes | yes |
| Publish to students | once the exam is approved | yes | yes |
| Watch the live board | their own papers | their levels | every paper |
| Give extra time, reopen, void | yes, on those papers | yes | yes |
| Mark typed answers | yes | yes | yes |
| Send scores to results | yes | yes | yes |

Publishing is what puts a paper in front of students, which is what exam
approval exists to guard: a teacher publishes only after approval, while
admins, who are the approvers, may publish at any stage.

## 1. A teacher sets up the paper

Open the exam list (**Exams** in the teacher or admin menu), find the exam,
and press **Computer-based test**, then **Set up CBT**.

**Settings.**

| Setting | What it decides |
|---|---|
| Opens / closes | The window students may start in. Nobody can start after it closes. |
| Minutes per student | Each student's own clock, which starts when they press Start. |
| Objective / theory | Which of the exam's sections go on the paper. |
| Objective questions per student | Draws that many at random from the exam's objective questions. Blank gives everyone all of them. |
| Shuffle questions / options | A different order per student. True and False are never shuffled. |
| Allow going back | Off means a student can't return to an earlier question. |
| Attempts allowed | Usually 1. A voided attempt doesn't count against it. |
| Access code | If set, students type it to start, and to move their exam to another computer. Give it out in the room. |
| Students see their score | On submit, when the exam closes, or only when staff release it. |

**Question bank.** Top the exam up with random questions by topic and
difficulty. This edits the exam itself, so it follows the usual rule: a
teacher can't add questions to an exam that is already approved or awaiting
approval.

**Check paper.** Lists anything that would stop it going live: no window or
duration, a question with no answer key, a bad formula, a sound clip that
isn't https or allows too many plays.

**Preview as student.** One student's paper, drawn and shuffled the way the
settings say, with no answers on it. Draw again to see another student's.

**Publish.** Copies the questions onto the paper and opens it for its window.
Publishing again replaces those questions, and is refused once any student has
started.

## 2. A student sits the exam

Their dashboard has a **CBT Exams** tab listing each paper as upcoming, open,
in progress, done or missed, with the times and how long they get.

They press **Start**, type the access code if there is one, and the paper
opens: one question at a time, a countdown, and a grid showing which questions
are answered and which they have flagged to come back to. They can resize the
text, go full screen, and play any sound clip a question carries, up to the
number of plays it allows.

Things worth telling students beforehand:

- **The clock is the server's.** It keeps running if they leave the page, and
  a wrong clock on the lab computer changes nothing.
- **Answers save as they go.** If the network drops they should keep working:
  answers are held and sent when it comes back.
- **One computer at a time.** Opening the exam somewhere else moves it there,
  with their answers and remaining time, and locks the first machine. With an
  access code, they need it again to move.
- **Time runs out by itself.** Everything saved counts; there is nothing to
  press.

Time allowed is their minutes, cut short if the window closes sooner, plus any
extra time on their exam registration. Extra time is added after the cut, so a
student who is allowed it still gets it when they start late.

## 3. An admin coordinates the exam

**Before the day.** Check the exam is approved and published, the window and
duration are right, students are in the right class, section or stream, anyone
entitled to extra time has it on their exam registration, and an access code
is set. The [pilot runbook](cbt-pilot-runbook.md) has a dress-rehearsal
checklist.

**During.** Open **Live board** from the CBT window, or **CBT invigilation**
in the admin menu. The board refreshes itself and shows every student who may
sit the paper:

- not started, writing, or finished, with how many questions answered and time
  left;
- when the system last heard from them, and who has gone quiet;
- warnings: leaving the exam window, leaving full screen, copy or paste
  attempts, lost connection, a sound clip that wouldn't play.

Per student, staff can **give extra time**, **hand in** for them, **let them
back in** after an accidental submit or a crash, or **void** an attempt so it
doesn't count. Every action records who did it and why, and each student's own
event log can be opened in full.

**Common situations.**

| What happened | What to do |
|---|---|
| A computer died | The student signs in on another one and carries on: same answers, same clock. Give them the access code. |
| A student was disturbed | Give extra time on the board, with a reason. |
| A student handed in by accident | Let them back in, choosing how many minutes to give them. |
| Someone cheated | Void the attempt. It stops counting towards their attempts. |
| A question was wrong | Correct its answer key, or award it to everyone, in Marking & results. Everyone affected is re-marked. |

## 4. Marking and results

The **Marking & results** tab shows how many attempts are finished, how many
are fully marked, and how many answers are still to mark.

- **Each student's score** lists every finished attempt with its marks out of
  the marks on that student's paper, before any scaling. A student whose typed
  answers are still to be marked shows how many are left instead of a total.
  Where a student sat the paper twice, the earlier attempt is greyed out: only
  their last one goes to the results.
- **Objective, true/false, choose-all and numeric** answers are already
  marked. The tab shows how many students chose each option, so a question
  most of the class got wrong stands out.
- **Typed answers** are marked one question at a time across all students,
  with names hidden by default, so marking stays even-handed. The marking
  guide and any sound clip for that question are shown.
- **A wrong answer key** can be corrected, or the question awarded to
  everyone. Every student who had that question is re-marked, and the change
  is recorded with a reason.
- **Send scores to results** writes each student's score into a score column
  you choose for the exam session, scaled to that column's maximum. Only draft
  results are written; anything already approved or published is skipped and
  listed.
- **Release scores** decides when students see theirs, if the paper is set to
  release manually. Releasing doesn't show a score whose typed answers are
  still to be marked, so the tab says how many students are still waiting on
  marking. Each student's own exams list tells them which of the two they are
  waiting for.

## 5. Analysis, afterwards

The **Analysis** tab reports, per question: how many got it right, how well it
separated stronger students from weaker ones, which wrong options drew them,
how long they spent, and the spread of scores across the class. Questions that
look faulty are flagged — too hard, too easy, a wrong option that attracted
the strongest students, an option nobody chose. Where a question came from the
question bank, its measured difficulty can be written back to the bank so
future papers draw on better information.

## 6. If the lab's internet is unreliable

Use an exam station: a computer on the school's own network that runs the
paper for the lab. Staff make a package, print each student a slip with a PIN,
load the package onto the station, and upload the results afterwards for
marking. Answer keys never leave the school system. See
[cbt-offline-station.md](cbt-offline-station.md).
