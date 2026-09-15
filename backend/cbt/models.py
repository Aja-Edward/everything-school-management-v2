"""
cbt/models.py

Computer-based testing: an exam sat on screen.

    CBTPaper     one per exam: how it is delivered, plus a frozen copy of its questions
    CBTQuestion  one question as it stood when the paper was published
    CBTAttempt   one student's sitting: their deadline, questions and order
    CBTAnswer    one answer per question per attempt
    CBTEvent     what happened during an attempt, for invigilators

The exam keeps its questions as JSON (Exam.objective_questions and friends),
which teachers go on editing. Answers need a stable row to point at, and
correcting a question must not change what students who already sat the paper
are marked against, so publishing copies the questions into CBTQuestion rows.
"""

import random
from datetime import datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.db.models import Max, Q
from django.utils import timezone

from exam.models import Exam, ExamRegistration, QuestionBank
from students.models import Student
from tenants.models import TenantMixin

from . import scoring
from .snapshot import OBJECTIVE_SECTION, build_paper


class CBTPaper(TenantMixin, models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        CLOSED = "closed", "Closed"

    class ResultRelease(models.TextChoices):
        ON_SUBMIT = "on_submit", "As soon as the student submits"
        AFTER_CLOSE = "after_close", "When the exam window closes"
        MANUAL = "manual", "When staff release them"

    exam = models.OneToOneField(Exam, on_delete=models.CASCADE, related_name="cbt_paper")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    # When students may start, and how long each gets once they do.
    opens_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(
        null=True, blank=True, help_text="No one can start after this. Anyone still writing finishes at "
                                         "this time, plus any extra time they are allowed.")
    duration_minutes = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)])

    include_objective = models.BooleanField(default=True)
    include_theory = models.BooleanField(
        default=False, help_text="Theory and custom-section questions, answered by typing and marked "
                                 "by a teacher. Practical questions are never included.")
    objective_questions_per_attempt = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)],
        help_text="Give each student this many objective questions, drawn at random. Blank gives them all.")
    shuffle_questions = models.BooleanField(default=True)
    shuffle_options = models.BooleanField(default=True)
    allow_backtracking = models.BooleanField(default=True)
    max_attempts = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1)])
    access_code = models.CharField(
        max_length=20, blank=True, help_text="If set, students must enter it to start.")
    result_release = models.CharField(
        max_length=20, choices=ResultRelease.choices, default=ResultRelease.MANUAL)
    results_released_at = models.DateTimeField(null=True, blank=True)

    # Where scores go in the school's results: a score column (component) in an exam session.
    result_exam_session = models.ForeignKey(
        "result.ExamSession", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    result_component = models.ForeignKey(
        "result.AssessmentComponent", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        help_text="The score column CBT scores are written to, scaled to its maximum")
    results_pushed_at = models.DateTimeField(null=True, blank=True)
    results_pushed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    # Copied from the exam when published.
    instructions = models.TextField(blank=True)
    sections = models.JSONField(
        default=list, blank=True, help_text='[{"key", "title", "instructions", "audio"?}] in paper order')

    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cbt_paper"
        indexes = [models.Index(fields=["tenant", "status"])]

    def __str__(self):
        return f"CBT: {self.exam.title} ({self.get_status_display()})"

    @classmethod
    def for_exam(cls, exam):
        """An unsaved draft paper with its window and duration taken from the exam."""
        def at(time_of_day):
            if not (exam.exam_date and time_of_day):
                return None
            return timezone.make_aware(datetime.combine(exam.exam_date, time_of_day))

        return cls(tenant=exam.tenant, exam=exam, opens_at=at(exam.start_time),
                   closes_at=at(exam.end_time), duration_minutes=exam.duration_minutes)

    def _setting_problems(self):
        """Settings that are wrong whatever stage the paper is at."""
        problems = []
        if self.opens_at and self.closes_at and self.closes_at <= self.opens_at:
            problems.append("The exam must close after it opens.")
        if not (self.include_objective or self.include_theory):
            problems.append("Include objective questions, theory questions, or both.")
        return problems

    def _missing_settings(self):
        """Settings a draft may leave blank but a published paper needs."""
        problems = []
        if not self.opens_at or not self.closes_at:
            problems.append("Set when the exam opens and closes.")
        if not self.duration_minutes:
            problems.append("Set how many minutes each student has.")
        return problems

    def clean(self):
        problems = self._setting_problems()
        if problems:
            raise ValidationError(problems)

    def prepare(self):
        """
        What publishing now would put on the paper: (sections, questions, problems).

        Writes nothing. `questions` are field dicts for CBTQuestion; publishing
        refuses while `problems` has anything in it.
        """
        sections, questions, problems = build_paper(
            self.exam, include_objective=self.include_objective, include_theory=self.include_theory)
        problems = self._missing_settings() + self._setting_problems() + problems
        if not questions:
            problems.append("The exam has no questions to put on the paper.")
        objective_count = sum(1 for q in questions if q["section"] == OBJECTIVE_SECTION)
        if self.objective_questions_per_attempt and self.objective_questions_per_attempt > objective_count:
            problems.append(
                f"Each student is to get {self.objective_questions_per_attempt} objective questions, "
                f"but the exam only has {objective_count}.")
        return sections, questions, problems

    def publish(self, user=None):
        """
        Copy the exam's current questions onto the paper and open it for its window.

        Republishing replaces the questions, so it is refused once anyone has
        started: their answers point at the questions they were given.
        """
        with transaction.atomic():
            paper = CBTPaper.objects.select_for_update().get(pk=self.pk)
            if paper.attempts.exists():
                raise ValidationError(
                    "Students have already started this paper, so its questions can't be replaced.")

            sections, questions, problems = self.prepare()
            if problems:
                raise ValidationError(problems)

            # Keep only links to bank questions that exist in this school.
            linked = {f.get("bank_question_id") for f in questions} - {None}
            known = set(QuestionBank.objects.filter(tenant=self.tenant, id__in=linked).values_list("id", flat=True))
            for fields in questions:
                if fields.get("bank_question_id") not in known:
                    fields["bank_question_id"] = None

            self.questions.all().delete()
            CBTQuestion.objects.bulk_create(
                CBTQuestion(tenant=self.tenant, paper=self, **fields) for fields in questions)
            self.instructions = self.exam.instructions or ""
            self.sections = sections
            self.status = self.Status.PUBLISHED
            self.published_at = timezone.now()
            self.published_by = user
            self.save()

    def draw_questions(self, questions=None, rng=None):
        """
        One student's questions and option order: (questions, {question_id: [keys]}).

        Sections stay in paper order. Within each, questions are shuffled if
        the paper says so, after drawing the objective sample. `questions`
        defaults to the paper's published ones; a draft preview passes unsaved
        rows instead.
        """
        rng = rng or random.SystemRandom()
        if questions is None:
            questions = self.questions.all()
        by_section = {}
        for question in sorted(questions, key=lambda q: q.order):
            by_section.setdefault(question.section, []).append(question)

        served = []
        for key, group in by_section.items():
            wanted = self.objective_questions_per_attempt
            if key == OBJECTIVE_SECTION and wanted and wanted < len(group):
                drawn = set(rng.sample(group, wanted))
                group = [question for question in group if question in drawn]
            if self.shuffle_questions:
                rng.shuffle(group)
            served.extend(group)

        option_order = {}
        for question in served:
            if question.is_choice:
                keys = question.option_keys
                # True stays before False.
                if self.shuffle_options and question.kind != CBTQuestion.Kind.TRUE_FALSE:
                    rng.shuffle(keys)
                option_order[str(question.id)] = keys
        return served, option_order


class CBTQuestion(TenantMixin, models.Model):
    # See cbt/scoring.py for how each kind is answered and marked.
    class Kind(models.TextChoices):
        OBJECTIVE = scoring.OBJECTIVE, "Objective (choose one option)"
        TRUE_FALSE = scoring.TRUE_FALSE, "True or false"
        MULTIPLE = scoring.MULTIPLE, "Choose all that apply"
        NUMERIC = scoring.NUMERIC, "Numeric answer"
        TEXT = scoring.TEXT, "Typed answer (marked by a teacher)"

    paper = models.ForeignKey(CBTPaper, on_delete=models.CASCADE, related_name="questions")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    section = models.CharField(max_length=40, help_text="Key of the paper section it belongs to")
    source_number = models.PositiveIntegerField(help_text="Its number within that section of the exam")
    order = models.PositiveIntegerField(help_text="Position on the paper before any shuffling")

    content = models.TextField(blank=True, help_text="HTML from the exam editor")
    image_url = models.TextField(blank=True)
    audio = models.JSONField(
        default=dict, blank=True,
        help_text='A sound clip to listen to: {"url", "title", "plays", "duration"}. plays 0 is as often as they like.')
    options = models.JSONField(default=list, blank=True, help_text='[{"key": "A", "text": "..."}]')
    correct_option = models.CharField(
        max_length=10, blank=True, help_text='The correct key, or every correct key in order for "choose all that apply": "AC"')
    partial_credit = models.BooleanField(
        default=False, help_text="For choose all that apply: marks for part of the right choices, less wrong ones")
    numeric_answer = models.CharField(max_length=50, blank=True, help_text="For a numeric question, as the teacher wrote it")
    tolerance = models.DecimalField(
        max_digits=20, decimal_places=8, default=0, help_text="How far either side of the numeric answer still counts")
    unit = models.CharField(max_length=30, blank=True, help_text="Shown beside a numeric answer box, e.g. cm")
    award_all = models.BooleanField(
        default=False, help_text="Every student gets this question's marks, for a question found to be faulty")
    marking_guide = models.TextField(blank=True, help_text="For teachers marking typed answers; never sent to students")
    bank_question = models.ForeignKey(
        "exam.QuestionBank", on_delete=models.SET_NULL, null=True, blank=True, related_name="cbt_questions",
        help_text="The question-bank question this came from, when it was drawn from the bank")
    parts = models.JSONField(default=list, blank=True, help_text="Sub-questions, as written on the exam")
    table = models.JSONField(null=True, blank=True)
    marks = models.DecimalField(
        max_digits=6, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cbt_question"
        ordering = ["order"]
        constraints = [
            models.UniqueConstraint(fields=["paper", "order"], name="uq_cbt_question_order"),
            models.CheckConstraint(
                condition=Q(kind=scoring.TEXT)
                | (Q(kind=scoring.NUMERIC) & ~Q(numeric_answer=""))
                | (Q(kind__in=sorted(scoring.CHOICE_KINDS)) & ~Q(correct_option="")),
                name="chk_cbt_question_has_answer"),
        ]

    def __str__(self):
        return f"Q{self.order} ({self.get_kind_display()})"

    @property
    def option_keys(self):
        return [option["key"] for option in self.options]

    @property
    def is_choice(self):
        return self.kind in scoring.CHOICE_KINDS

    @property
    def is_auto_marked(self):
        return self.kind in scoring.AUTO_MARKED_KINDS


class CBTAttempt(TenantMixin, models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        SUBMITTED = "submitted", "Submitted"
        TIMED_OUT = "timed_out", "Submitted when time ran out"
        VOIDED = "voided", "Voided"

    # PROTECT: deleting an exam must not silently delete the scripts of students who sat it.
    paper = models.ForeignKey(CBTPaper, on_delete=models.PROTECT, related_name="attempts")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="cbt_attempts")
    registration = models.ForeignKey(
        ExamRegistration, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    number = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)

    started_at = models.DateTimeField()
    deadline = models.DateTimeField()
    submitted_at = models.DateTimeField(null=True, blank=True)

    question_ids = models.JSONField(
        default=list, help_text="The questions this student was given, in the order they see them")
    option_order = models.JSONField(
        default=dict, help_text='{"<question id>": ["C", "A", "D", "B"]}')

    max_score = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    objective_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    text_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    total_score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    session_token_hash = models.CharField(
        max_length=64, blank=True, help_text="SHA-256 of the token the device sitting the attempt holds")
    furthest_position = models.PositiveIntegerField(
        default=0, help_text="Furthest question the student has reached, counting from 0")
    audio_plays = models.JSONField(
        default=dict, blank=True,
        help_text='Times the student has started each sound clip, as the exam page reports it: '
                  '{"question:<id>" or "section:<key>": plays}')
    time_on_questions = models.JSONField(
        default=dict, blank=True,
        help_text='Seconds the student\'s screen showed each question, as the exam page reports it: {"<question id>": seconds}')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cbt_attempt"
        ordering = ["started_at"]
        constraints = [
            models.UniqueConstraint(fields=["paper", "student", "number"], name="uq_cbt_attempt_number"),
            # A second in-progress attempt would give a student two clocks and two sets of answers.
            models.UniqueConstraint(
                fields=["paper", "student"], condition=Q(status="in_progress"),
                name="uq_cbt_one_attempt_in_progress"),
        ]
        indexes = [models.Index(fields=["tenant", "paper", "status"])]

    def __str__(self):
        return f"{self.student} - {self.paper.exam.title} (attempt {self.number})"

    @classmethod
    def start(cls, paper, student, now=None, ip_address=None, user_agent=""):
        """
        Start `student` on `paper`, or return the attempt they already have in progress.

        An attempt in progress is returned even after its deadline; ending it
        is the caller's job, so a student can't dodge a time-out by restarting.

        The deadline is fixed here: the paper's duration, cut short if the
        window closes sooner, then any extra time on the student's exam
        registration. Extra time is added after the cut so a student allowed
        it still gets it when they start close to closing time.
        """
        now = now or timezone.now()
        if student.tenant_id != paper.tenant_id:
            raise ValidationError("This student is not at the school that set this exam.")

        with transaction.atomic():
            paper = CBTPaper.objects.select_for_update().get(pk=paper.pk)
            mine = cls.objects.filter(paper=paper, student=student)

            in_progress = mine.filter(status=cls.Status.IN_PROGRESS).first()
            if in_progress:
                return in_progress

            if paper.status != CBTPaper.Status.PUBLISHED:
                raise ValidationError("This exam is not open for computer-based testing.")
            if now < paper.opens_at:
                raise ValidationError("This exam has not opened yet.")
            if now >= paper.closes_at:
                raise ValidationError("This exam has closed.")
            if mine.exclude(status=cls.Status.VOIDED).count() >= paper.max_attempts:
                raise ValidationError("You have no attempts left for this exam.")

            registration = ExamRegistration.objects.filter(exam=paper.exam, student=student).first()
            extra_minutes = registration.extra_time_minutes if registration else 0
            deadline = min(now + timedelta(minutes=paper.duration_minutes), paper.closes_at)
            deadline += timedelta(minutes=extra_minutes)

            questions, option_order = paper.draw_questions()
            attempt = cls.objects.create(
                tenant=paper.tenant, paper=paper, student=student, registration=registration,
                number=(mine.aggregate(Max("number"))["number__max"] or 0) + 1,
                started_at=now, deadline=deadline,
                question_ids=[question.id for question in questions], option_order=option_order,
                max_score=sum((question.marks for question in questions), Decimal(0)),
                ip_address=ip_address, user_agent=(user_agent or "")[:255], last_seen_at=now,
            )
            CBTEvent.objects.create(
                tenant=paper.tenant, attempt=attempt, kind=CBTEvent.Kind.STARTED, ip_address=ip_address)
        return attempt

    def is_past_deadline(self, now=None):
        return (now or timezone.now()) >= self.deadline


class CBTAnswer(TenantMixin, models.Model):
    attempt = models.ForeignKey(CBTAttempt, on_delete=models.CASCADE, related_name="answers")
    # PROTECT: a paper's questions are only replaced before anyone has answered them.
    question = models.ForeignKey(CBTQuestion, on_delete=models.PROTECT, related_name="answers")
    selected_option = models.CharField(
        max_length=10, blank=True, help_text='The key chosen, or every key chosen in order for "choose all that apply": "AC"')
    text_answer = models.TextField(blank=True, help_text="A typed answer, or a number as the student wrote it")
    flagged = models.BooleanField(default=False, help_text="Marked by the student to come back to")
    answered_at = models.DateTimeField(null=True, blank=True)

    is_correct = models.BooleanField(null=True, blank=True)
    marks_awarded = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    marked_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cbt_answer"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "question"], name="uq_cbt_answer_per_question"),
        ]

    def __str__(self):
        return f"{self.attempt} - Q{self.question.order}"

    def clean(self):
        question = self.question
        if question.id not in self.attempt.question_ids:
            raise ValidationError("That question is not on this student's paper.")
        if question.is_choice:
            if self.text_answer:
                raise ValidationError("This question is answered by choosing an option, not by typing.")
            try:
                scoring.read_choice(question.kind, question.option_keys, self.selected_option)
            except ValueError:
                raise ValidationError("That option is not one of this question's options.")
        elif self.selected_option:
            raise ValidationError("This question is answered by typing, not by choosing an option.")


class CBTAnswerKeyChange(TenantMixin, models.Model):
    """A correction to a published question's answer, which re-marks everyone who had it."""

    question = models.ForeignKey(CBTQuestion, on_delete=models.CASCADE, related_name="key_changes")
    # The key as staff read it (scoring.describe_key): "B", "A, C", "12.5 ± 0.1 cm".
    previous_option = models.CharField(max_length=100, blank=True)
    previous_award_all = models.BooleanField(default=False)
    new_option = models.CharField(max_length=100, blank=True)
    new_award_all = models.BooleanField(default=False)
    reason = models.CharField(max_length=500, blank=True)
    remarked_attempts = models.PositiveIntegerField(default=0)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cbt_answer_key_change"
        ordering = ["-changed_at"]


class CBTEvent(TenantMixin, models.Model):
    class Kind(models.TextChoices):
        STARTED = "started", "Started"
        RESUMED = "resumed", "Resumed"
        DEVICE_CHANGED = "device_changed", "Continued on a different device"
        FOCUS_LOST = "focus_lost", "Left the exam window"
        FOCUS_RETURNED = "focus_returned", "Came back to the exam window"
        FULLSCREEN_EXITED = "fullscreen_exited", "Left full screen"
        COPY_ATTEMPTED = "copy_attempted", "Tried to copy"
        PASTE_ATTEMPTED = "paste_attempted", "Tried to paste"
        CONNECTION_LOST = "connection_lost", "Lost connection"
        RECONNECTED = "reconnected", "Reconnected"
        AUDIO_PLAYED = "audio_played", "Played a sound clip"
        AUDIO_FAILED = "audio_failed", "A sound clip wouldn't play"
        TIME_EXTENDED = "time_extended", "Given extra time"
        REOPENED = "reopened", "Let back in"
        SUBMITTED = "submitted", "Submitted"
        TIMED_OUT = "timed_out", "Submitted when time ran out"
        VOIDED = "voided", "Voided"

    attempt = models.ForeignKey(CBTAttempt, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    detail = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        help_text="Staff member who acted, for extensions and voids")
    client_time = models.DateTimeField(null=True, blank=True, help_text="When the browser says it happened")
    recorded_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "cbt_event"
        ordering = ["recorded_at"]
        indexes = [models.Index(fields=["attempt", "recorded_at"])]

    def __str__(self):
        return f"{self.attempt}: {self.get_kind_display()}"
