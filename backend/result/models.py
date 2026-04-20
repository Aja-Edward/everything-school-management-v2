# result/models.py
"""
Design principles
──────────────────
1. No hardcoded score fields.  AssessmentComponent + ComponentScore replace
   first_test_score, continuous_assessment_score, exam_score, etc.

2. No hardcoded exam type choices.  ExamType FK replaces EXAM_TYPES CharField.

3. Session reports exist for ALL four education levels.
   Totals are computed from existing TermReport records — no manual entry,
   always in sync, handles any number of terms.

4. BaseResult / TermReportFields / BaseSessionReport abstract the shared
   logic so each education-level subclass stays thin.
"""

import logging
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.utils import timezone

from academics.models import AcademicSession, EducationLevel, Term
from classroom.models import Class as StudentClass, Stream
from students.models import Student
from subject.models import Subject
from tenants.models import TenantMixin

logger = logging.getLogger(__name__)


# ── Shared status choices ─────────────────────────────────────────────────────

_RESULT_STATUS = [
    ("DRAFT", "Draft"),
    ("SUBMITTED", "Submitted"),
    ("APPROVED", "Approved"),
    ("PUBLISHED", "Published"),
]

_DEFAULT_GRADE_THRESHOLDS = ((70, "A"), (60, "B"), (50, "C"), (45, "D"), (39, "E"))


def _default_grade(percentage):
    for threshold, grade in _DEFAULT_GRADE_THRESHOLDS:
        if float(percentage) >= threshold:
            return grade
    return "F"


# ============================================================
# GRADING SYSTEM
# ============================================================


class GradingSystem(TenantMixin, models.Model):
    GRADING_TYPES = [
        ("PERCENTAGE", "Percentage (0-100)"),
        ("POINTS", "Points (0-4.0, 0-5.0, etc.)"),
        ("LETTER", "Letter Grades (A, B, C, etc.)"),
        ("PASS_FAIL", "Pass/Fail"),
    ]

    name = models.CharField(max_length=100)
    grading_type = models.CharField(max_length=20, choices=GRADING_TYPES)
    description = models.TextField(blank=True)
    min_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    max_score = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    pass_mark = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_grading_system"
        unique_together = ["tenant", "name"]
        indexes = [models.Index(fields=["tenant", "is_active"])]

    def __str__(self):
        return self.name

    def get_grade(self, percentage):
        if percentage is None:
            return None
        try:
            for grade_obj in self.grades.order_by("-min_score"):
                if grade_obj.min_score <= percentage <= grade_obj.max_score:
                    return grade_obj.grade
            last = self.grades.order_by("-min_score").last()
            return last.grade if last else None
        except Exception as e:
            logger.error(f"Error getting grade for {self.name}: {e}")
            return None


class Grade(TenantMixin, models.Model):
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="grades"
    )
    grade = models.CharField(max_length=5)
    min_score = models.DecimalField(max_digits=5, decimal_places=2)
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    description = models.CharField(max_length=100, blank=True)
    is_passing = models.BooleanField(default=True)

    class Meta:
        db_table = "results_grade"
        unique_together = ["tenant", "grading_system", "grade"]
        ordering = ["-min_score"]
        indexes = [models.Index(fields=["tenant", "grading_system"])]

    def __str__(self):
        return f"{self.grade} ({self.min_score}-{self.max_score})"

    def clean(self):
        if self.min_score >= self.max_score:
            raise ValidationError("Minimum score must be less than maximum score")


# ============================================================
# ASSESSMENT COMPONENT  — replaces hardcoded score columns
# ============================================================


class AssessmentComponent(TenantMixin, models.Model):
    """
    Tenant-configurable assessment components per education level.
    Schools define their own breakdown (e.g. Test 1 + Test 2 + Exam,
    or CA + Practical + Theory) without any code changes.
    """

    COMPONENT_TYPES = [
        ("CA", "Continuous Assessment"),
        ("EXAM", "Examination"),
        ("PRACTICAL", "Practical"),
        ("PROJECT", "Project"),
        ("ORAL", "Oral Assessment"),
        ("OTHER", "Other"),
    ]

    education_level = models.ForeignKey(
        EducationLevel, on_delete=models.CASCADE, related_name="assessment_components"
    )
    name = models.CharField(max_length=80)
    code = models.SlugField(max_length=30)
    component_type = models.CharField(
        max_length=20, choices=COMPONENT_TYPES, default="CA"
    )
    max_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    contributes_to_ca = models.BooleanField(
        default=True,
        help_text="True = counted in CA sub-total; False = standalone (e.g. final Exam)",
    )
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_assessment_component"
        unique_together = [["tenant", "education_level", "code"]]
        ordering = ["display_order", "name"]
        indexes = [models.Index(fields=["tenant", "education_level", "is_active"])]

    def __str__(self):
        return f"{self.name} (max {self.max_score}) — {self.education_level.name}"

    def clean(self):
        if self.max_score is not None and self.max_score <= 0:
            raise ValidationError("max_score must be greater than zero")


# ============================================================
# SCORING CONFIGURATION
# ============================================================


class ScoringConfiguration(TenantMixin, models.Model):
    RESULT_TYPE_CHOICES = [
        ("TERMLY", "Termly Result"),
        ("SESSION", "Session Result"),
    ]

    id = models.AutoField(primary_key=True)
    education_level = models.ForeignKey(
        EducationLevel, on_delete=models.PROTECT, related_name="scoring_configurations"
    )
    result_type = models.CharField(max_length=20, choices=RESULT_TYPE_CHOICES)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    total_max_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0)],
        help_text="Must equal sum of all active AssessmentComponent.max_score for this level",
    )
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_scoring_configs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_scoring_configuration"
        unique_together = ["tenant", "education_level", "result_type", "name"]
        ordering = ["result_type", "name"]
        indexes = [
            models.Index(fields=["tenant", "education_level", "result_type"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "is_default"]),
        ]

    def __str__(self):
        return f"{self.education_level.name} — {self.get_result_type_display()} — {self.name}"

    def clean(self):
        component_total = AssessmentComponent.objects.filter(
            tenant=self.tenant, education_level=self.education_level, is_active=True
        ).aggregate(total=models.Sum("max_score"))["total"] or Decimal(0)
        if component_total and component_total != self.total_max_score:
            raise ValidationError(
                f"Active component max_scores sum to {component_total}, "
                f"but total_max_score is {self.total_max_score}."
            )


# ============================================================
# ASSESSMENT TYPE  (legacy)
# ============================================================


class AssessmentType(TenantMixin, models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10)
    description = models.TextField(blank=True)
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="assessment_types",
        null=True,
        blank=True,
    )
    max_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=10, validators=[MinValueValidator(0)]
    )
    weight_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "results_assessment_type"
        ordering = ["name"]
        unique_together = [["tenant", "name"], ["tenant", "code"]]

    def __str__(self):
        level = self.education_level.name if self.education_level else "All Levels"
        return f"{self.name} — {level} ({self.weight_percentage}%)"


# ============================================================
# EXAM TYPE  — replaces hardcoded EXAM_TYPES CharField
# ============================================================


class ExamType(TenantMixin, models.Model):
    """
    Tenant-configurable exam session type.
    Seeded with defaults on tenant creation; schools can rename/add freely.
    """

    CATEGORY_CHOICES = [
        ("CA", "Continuous Assessment"),
        ("EXAM", "Examination"),
        ("PRACTICAL", "Practical"),
        ("PROJECT", "Project"),
        ("OTHER", "Other"),
    ]

    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50)
    category = models.CharField(
        max_length=20, choices=CATEGORY_CHOICES, default="OTHER"
    )
    description = models.TextField(blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_exam_type"
        unique_together = [["tenant", "code"]]
        ordering = ["display_order", "name"]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "code"]),
        ]

    def __str__(self):
        return self.name


DEFAULT_EXAM_TYPES = [
    {
        "name": "First Continuous Assessment",
        "code": "first_ca",
        "category": "CA",
        "display_order": 10,
    },
    {
        "name": "Second Continuous Assessment",
        "code": "second_ca",
        "category": "CA",
        "display_order": 20,
    },
    {
        "name": "Third Continuous Assessment",
        "code": "third_ca",
        "category": "CA",
        "display_order": 30,
    },
    {
        "name": "Mid-Term Examination",
        "code": "mid_term",
        "category": "EXAM",
        "display_order": 40,
    },
    {
        "name": "Final Examination",
        "code": "final_exam",
        "category": "EXAM",
        "display_order": 50,
    },
    {
        "name": "Mock Examination",
        "code": "mock_exam",
        "category": "EXAM",
        "display_order": 60,
    },
    {
        "name": "Practical Examination",
        "code": "practical",
        "category": "PRACTICAL",
        "display_order": 70,
    },
    {
        "name": "Project Assessment",
        "code": "project",
        "category": "PROJECT",
        "display_order": 80,
    },
    {"name": "Other", "code": "other", "category": "OTHER", "display_order": 90},
]


def seed_exam_types_for_tenant(tenant):
    """Seed default ExamType rows for a new tenant. Safe to call multiple times."""
    for d in DEFAULT_EXAM_TYPES:
        ExamType.objects.get_or_create(
            tenant=tenant,
            code=d["code"],
            defaults={
                "name": d["name"],
                "category": d["category"],
                "display_order": d["display_order"],
                "is_active": True,
            },
        )


# ============================================================
# EXAM SESSION
# ============================================================


class ExamSession(TenantMixin, models.Model):
    name = models.CharField(max_length=100)
    exam_type = models.ForeignKey(
        ExamType,
        on_delete=models.PROTECT,
        related_name="exam_sessions",
        help_text="Configured per school",
    )
    academic_session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name="exam_sessions"
    )
    term = models.ForeignKey(
        Term,
        on_delete=models.PROTECT,
        related_name="exam_sessions",
        null=True,
        blank=True,
    )
    start_date = models.DateField()
    end_date = models.DateField()
    result_release_date = models.DateField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_exam_session"
        unique_together = ["tenant", "academic_session", "term", "exam_type"]
        ordering = ["-start_date"]
        indexes = [
            models.Index(fields=["tenant", "academic_session"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "academic_session", "term"]),
            models.Index(fields=["tenant", "exam_type"]),
        ]

    def __str__(self):
        term_name = self.term.name if self.term else "No Term"
        return f"{self.name} — {self.academic_session.name} ({term_name})"

    def clean(self):
        if self.start_date >= self.end_date:
            raise ValidationError("Start date must be before end date")

    @property
    def exam_type_name(self):
        return self.exam_type.name if self.exam_type else ""

    @property
    def exam_type_category(self):
        return self.exam_type.category if self.exam_type else ""


# ============================================================
# COMPONENT SCORE
# ============================================================


class ComponentScore(TenantMixin, models.Model):
    """
    One row per AssessmentComponent per result.
    Exactly one of the four result FKs is set.
    """

    senior_result = models.ForeignKey(
        "SeniorSecondaryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    junior_result = models.ForeignKey(
        "JuniorSecondaryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    primary_result = models.ForeignKey(
        "PrimaryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    nursery_result = models.ForeignKey(
        "NurseryResult",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="component_scores",
    )
    component = models.ForeignKey(
        AssessmentComponent, on_delete=models.PROTECT, related_name="scores"
    )
    score = models.DecimalField(
        max_digits=6, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )

    class Meta:
        db_table = "results_component_score"
        constraints = [
            models.UniqueConstraint(
                fields=["senior_result", "component"],
                condition=models.Q(senior_result__isnull=False),
                name="uq_component_score_senior",
            ),
            models.UniqueConstraint(
                fields=["junior_result", "component"],
                condition=models.Q(junior_result__isnull=False),
                name="uq_component_score_junior",
            ),
            models.UniqueConstraint(
                fields=["primary_result", "component"],
                condition=models.Q(primary_result__isnull=False),
                name="uq_component_score_primary",
            ),
            models.UniqueConstraint(
                fields=["nursery_result", "component"],
                condition=models.Q(nursery_result__isnull=False),
                name="uq_component_score_nursery",
            ),
        ]
        indexes = [
            models.Index(fields=["component", "senior_result"]),
            models.Index(fields=["component", "junior_result"]),
            models.Index(fields=["component", "primary_result"]),
            models.Index(fields=["component", "nursery_result"]),
        ]

    def __str__(self):
        return f"{self.component.name}: {self.score}/{self.component.max_score}"

    def clean(self):
        set_count = sum(
            1
            for fk in [
                self.senior_result_id,
                self.junior_result_id,
                self.primary_result_id,
                self.nursery_result_id,
            ]
            if fk is not None
        )
        if set_count != 1:
            raise ValidationError(
                "Exactly one of senior/junior/primary/nursery result FK must be set."
            )
        if self.score > self.component.max_score:
            raise ValidationError(
                f"Score {self.score} exceeds component max {self.component.max_score}."
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


# ============================================================
# BASE RESULT
# ============================================================


class BaseResult(models.Model):
    """
    Abstract base for the four education-level result models.
    Aggregates ComponentScore rows; never touches individual score fields.
    """

    RESULT_FK_NAME: str = ""  # e.g. "senior_result"

    total_score = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    ca_total = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        db_index=True,
    )
    grade = models.CharField(max_length=5, blank=True, db_index=True)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    is_passed = models.BooleanField(default=False, db_index=True)
    class_average = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    highest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    lowest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    subject_position = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    class Meta:
        abstract = True

    def calculate_scores(self):
        if not self.RESULT_FK_NAME or not self.pk:
            return
        scores = ComponentScore.objects.filter(
            **{self.RESULT_FK_NAME: self}
        ).select_related("component")
        ca_sum = total_sum = Decimal(0)
        for cs in scores:
            total_sum += cs.score
            if cs.component.contributes_to_ca:
                ca_sum += cs.score
        self.ca_total = ca_sum
        self.total_score = total_sum
        gs = getattr(self, "grading_system", None)
        max_score = Decimal(gs.max_score) if gs and gs.max_score else Decimal(100)
        self.percentage = (total_sum / max_score * 100) if max_score > 0 else Decimal(0)

    def determine_grade(self):
        gs = getattr(self, "grading_system", None)
        pct = float(self.percentage or 0)
        if not gs:
            self.grade = _default_grade(pct)
            self.is_passed = pct >= 40
            return
        if gs.grading_type == "PASS_FAIL":
            self.is_passed = pct >= float(gs.pass_mark or 40)
            self.grade = "PASS" if self.is_passed else "FAIL"
            self.grade_point = None
            return
        grade_obj = (
            gs.grades.filter(min_score__lte=pct, max_score__gte=pct)
            .order_by("-min_score")
            .first()
        )
        if grade_obj:
            self.grade = grade_obj.grade
            self.grade_point = grade_obj.grade_point
            self.is_passed = bool(grade_obj.is_passing)
        else:
            self.grade = _default_grade(pct)
            self.grade_point = None
            self.is_passed = pct >= float(gs.pass_mark or 40)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)  # ensure pk exists
        self.calculate_scores()
        self.determine_grade()
        super().save(
            update_fields=[
                "total_score",
                "ca_total",
                "percentage",
                "grade",
                "grade_point",
                "is_passed",
                "updated_at",
            ]
        )

    @classmethod
    def _bulk_recalculate_positions(cls, qs):
        from django.db.models import Avg, Max, Min

        if not qs.exists():
            return
        stats = qs.aggregate(
            avg=Avg("percentage"), highest=Max("percentage"), lowest=Min("percentage")
        )
        updates = []
        current_position = 1
        count_at_current = 0
        prev_score = None
        for result in qs:
            score = result.percentage
            if score != prev_score:
                current_position += count_at_current
                count_at_current = 1
                prev_score = score
            else:
                count_at_current += 1
            result.subject_position = current_position
            result.class_average = stats["avg"] or 0
            result.highest_in_class = stats["highest"] or 0
            result.lowest_in_class = stats["lowest"] or 0
            updates.append(result)
        cls.objects.bulk_update(
            updates,
            [
                "subject_position",
                "class_average",
                "highest_in_class",
                "lowest_in_class",
            ],
            batch_size=100,
        )

    @property
    def position_formatted(self):
        if not self.subject_position:
            return ""
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(self.subject_position, "th")
        return f"{self.subject_position}{suffix}"


# ============================================================
# BASE TERM REPORT
# ============================================================

class BaseTermReport(models.Model):
    """Permission helpers shared by all term and session report models."""

    def first_signatory_role(self):
        student = getattr(self, "student", None)
        if not student:
            return None
        return (
            "CLASS_TEACHER"
            if student.education_level in ("NURSERY", "PRIMARY")
            else "SUBJECT_TEACHER"
        )

    def can_edit_teacher_remark(self, user):
        from teacher.models import Teacher
        from classroom.models import ClassroomTeacherAssignment, StudentEnrollment

        if getattr(user, "role", None) != "TEACHER":
            return False
        try:
            teacher = Teacher.objects.get(user=user)
            enrollment = (
                StudentEnrollment.objects.filter(student=self.student, is_active=True)
                .select_related("classroom")
                .first()
            )
            if not enrollment:
                return False
            classroom = enrollment.classroom
            if self.first_signatory_role() == "CLASS_TEACHER":
                return classroom.class_teacher == teacher
            return ClassroomTeacherAssignment.objects.filter(
                teacher=teacher, classroom=classroom
            ).exists()
        except Exception as e:
            logger.error(
                f"Error checking teacher remark permission: {e}", exc_info=True
            )
            return False

    def can_edit_head_teacher_remark(self, user):
        return getattr(user, "role", None) in (
            "HEAD_TEACHER",
            "PROPRIETRESS",
            "PRINCIPAL",
            "admin",
            "superadmin",
        )

    def submit_by_teacher(self):
        if self.status == "DRAFT":
            self.status = "SUBMITTED"
            self.save(update_fields=["status"])

    def approve_by_proprietress(self, user):
        if self.status == "SUBMITTED":
            self.status = "APPROVED"
            self.published_by = user
            self.published_date = timezone.now()
            self.save()

    def publish(self):
        if self.status == "APPROVED":
            self.status = "PUBLISHED"
            self.is_published = True
            self.save(update_fields=["status", "is_published"])

    class Meta:
        abstract = True


# ============================================================
# TERM REPORT SHARED FIELDS
# ============================================================


class TermReportFields(models.Model):
    """Shared fields on all four term report models."""

    total_score = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    average_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overall_grade = models.CharField(max_length=5, blank=True)
    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(default=0)
    times_opened = models.PositiveIntegerField(default=0)
    times_present = models.PositiveIntegerField(default=0)
    next_term_begins = models.DateField(null=True, blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def _grade_for_percentage(self, percentage):
        try:
            first = self.subject_results.select_related("grading_system").first()
            if first:
                grade_obj = first.grading_system.grades.filter(
                    min_score__lte=percentage, max_score__gte=percentage
                ).first()
                if grade_obj:
                    return grade_obj.grade
        except Exception:
            pass
        return _default_grade(float(percentage))

    def calculate_metrics(self):
        agg = self.subject_results.filter(
            status__in=("APPROVED", "PUBLISHED")
        ).aggregate(
            total=models.Sum("total_score"),
            count=models.Count("id"),
            avg_pct=models.Avg("percentage"),
        )
        if agg["count"]:
            self.total_score = agg["total"] or 0
            self.average_score = agg["avg_pct"] or 0
            self.overall_grade = self._grade_for_percentage(self.average_score)
        self.save(
            update_fields=[
                "total_score",
                "average_score",
                "overall_grade",
                "updated_at",
            ]
        )

    def calculate_class_position(self):
        ReportModel = self.__class__
        peers = ReportModel.objects.filter(
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=("APPROVED", "PUBLISHED"),
        ).exclude(id=self.id)
        self.class_position = (
            peers.filter(average_score__gt=self.average_score).count() + 1
        )
        self.total_students = peers.count() + 1
        self.save(update_fields=["class_position", "total_students", "updated_at"])

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        with transaction.atomic():
            reports = (
                cls.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .select_for_update()
                .order_by("-average_score")
            )
            total = reports.count()
            updates = []
            for pos, report in enumerate(reports, start=1):
                report.class_position = pos
                report.total_students = total
                updates.append(report)
            cls.objects.bulk_update(
                updates, ["class_position", "total_students"], batch_size=100
            )


# ============================================================
# BASE SESSION REPORT  — shared by all four levels
# ============================================================


class BaseSessionReport(BaseTermReport, models.Model):
    """
    Abstract base for all four session report models.

    Session totals are COMPUTED from existing TermReport records, not
    entered manually.  compute_from_term_reports() fetches all term
    reports for this student × academic_session, ordered by the term's
    display_order, and aggregates them.

    This means:
      • Schools running 2 terms get 2 term totals; 3 terms → 3 totals.
      • No manual "first_term_score" entry — always in sync.
      • Downloading a session report triggers recomputation so the PDF
        always reflects the latest approved term data.

    Subclasses must define:
        TERM_REPORT_MODEL  — the concrete TermReport class to query
        student FK + academic_session FK + status + is_published + published_by
        (published_by needs a unique related_name per subclass)
    """

    TERM_REPORT_MODEL = None  # set by each subclass

    # Aggregated from term reports
    term_totals = models.JSONField(
        default=list,
        help_text=(
            "List of {term_name, term_order, total_score, average_score, "
            "class_position} dicts, one per completed term, ordered by term."
        ),
    )
    overall_total = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    overall_average = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overall_grade = models.CharField(max_length=5, blank=True)
    overall_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(default=0)

    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def compute_from_term_reports(self):
        """
        Pull data from all approved/published TermReports for this
        student × academic_session and populate term_totals + overall_*.

        Ordered by term.term_type.display_order so Term 1 always comes
        first regardless of when the reports were created.
        """
        TermReportModel = self.__class__.TERM_REPORT_MODEL
        if TermReportModel is None:
            raise NotImplementedError(
                f"{self.__class__.__name__} must set TERM_REPORT_MODEL"
            )

        term_reports = (
            TermReportModel.objects.filter(
                student=self.student,
                exam_session__academic_session=self.academic_session,
                status__in=("APPROVED", "PUBLISHED"),
            )
            .select_related("exam_session__term__term_type")
            .order_by("exam_session__term__term_type__display_order")
        )

        totals = []
        overall_sum = Decimal(0)
        term_count = 0

        for report in term_reports:
            term = report.exam_session.term
            term_name = term.name if term else f"Term {term_count + 1}"
            term_order = (
                term.term_type.display_order if term and term.term_type else term_count
            )

            # NurseryTermReport uses overall_percentage / total_marks_obtained;
            # the others use average_score / total_score
            if hasattr(report, "overall_percentage"):
                avg = float(report.overall_percentage or 0)
                total = float(report.total_marks_obtained or 0)
            else:
                avg = float(report.average_score or 0)
                total = float(report.total_score or 0)

            totals.append(
                {
                    "term_name": term_name,
                    "term_order": term_order,
                    "total_score": total,
                    "average_score": avg,
                    "class_position": report.class_position,
                }
            )
            overall_sum += Decimal(str(avg))
            term_count += 1

        self.term_totals = totals
        self.overall_total = sum(Decimal(str(t["total_score"])) for t in totals)
        self.overall_average = (overall_sum / term_count) if term_count else Decimal(0)
        self.overall_grade = _default_grade(float(self.overall_average))
        self.save(
            update_fields=[
                "term_totals",
                "overall_total",
                "overall_average",
                "overall_grade",
                "updated_at",
            ]
        )

    def calculate_overall_position(self):
        """Rank this session report against peers in the same class."""
        SessionReportModel = self.__class__
        peers = SessionReportModel.objects.filter(
            academic_session=self.academic_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=("APPROVED", "PUBLISHED"),
        ).exclude(id=self.id)
        self.overall_position = (
            peers.filter(overall_average__gt=self.overall_average).count() + 1
        )
        self.total_students = peers.count() + 1
        self.save(update_fields=["overall_position", "total_students", "updated_at"])

    @classmethod
    def bulk_recalculate_positions(
        cls, academic_session, student_class, education_level
    ):
        with transaction.atomic():
            reports = (
                cls.objects.filter(
                    academic_session=academic_session,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .select_for_update()
                .order_by("-overall_average")
            )
            total = reports.count()
            updates = []
            for pos, report in enumerate(reports, start=1):
                report.overall_position = pos
                report.total_students = total
                updates.append(report)
            cls.objects.bulk_update(
                updates, ["overall_position", "total_students"], batch_size=100
            )


# ============================================================
# SENIOR SECONDARY — TERM REPORT + RESULT
# ============================================================


class SeniorSecondaryTermReport(
    TenantMixin, BaseTermReport, TermReportFields, models.Model
):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="senior_secondary_term_reports"
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="senior_secondary_term_reports",
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="senior_secondary_term_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_senior_secondary_term_reports",
    )

    class Meta:
        db_table = "results_senior_secondary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "is_published"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (SSS Term)"


class SeniorSecondaryResult(TenantMixin, BaseResult, models.Model):
    RESULT_FK_NAME = "senior_result"
    RESULT_STATUS = _RESULT_STATUS

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="senior_secondary_results"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="senior_secondary_results"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="senior_secondary_results"
    )
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="senior_secondary_results"
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="senior_secondary_results",
    )
    term_report = models.ForeignKey(
        SeniorSecondaryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    teacher_remark = models.TextField(blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_senior_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_senior_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_senior_secondary_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_senior_secondary_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_senior_secondary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            qs = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .select_for_update()
                .order_by("-percentage", "created_at")
            )
            cls._bulk_recalculate_positions(qs)


# ============================================================
# SENIOR SECONDARY — SESSION REPORT
# ============================================================


class SeniorSecondarySessionReport(TenantMixin, BaseSessionReport, models.Model):
    """
    Session report for a Senior Secondary student.
    Totals computed from SeniorSecondaryTermReport records via
    compute_from_term_reports().
    """

    TERM_REPORT_MODEL = None  # set after class definition (forward reference)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="senior_secondary_session_reports",
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="senior_secondary_session_reports",
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="senior_secondary_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_senior_secondary_session_reports",
    )

    class Meta:
        db_table = "results_senior_secondary_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "is_published"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.academic_session.name} (SSS Session)"


SeniorSecondarySessionReport.TERM_REPORT_MODEL = SeniorSecondaryTermReport


# ============================================================
# JUNIOR SECONDARY — TERM REPORT + RESULT + SESSION REPORT
# ============================================================


class JuniorSecondaryTermReport(
    TenantMixin, BaseTermReport, TermReportFields, models.Model
):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="junior_secondary_term_reports"
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="junior_secondary_term_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_junior_secondary_reports",
    )

    class Meta:
        db_table = "results_junior_secondary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (JSS Term)"


class JuniorSecondaryResult(TenantMixin, BaseResult, models.Model):
    RESULT_FK_NAME = "junior_result"
    RESULT_STATUS = _RESULT_STATUS

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="junior_secondary_results"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="junior_secondary_results"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="junior_secondary_results"
    )
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="junior_secondary_results"
    )
    term_report = models.ForeignKey(
        JuniorSecondaryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    teacher_remark = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_junior_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_junior_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_junior_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_junior_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_junior_secondary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            qs = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .select_for_update()
                .order_by("-percentage", "created_at")
            )
            cls._bulk_recalculate_positions(qs)


class JuniorSecondarySessionReport(TenantMixin, BaseSessionReport, models.Model):
    TERM_REPORT_MODEL = None

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="junior_secondary_session_reports",
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="junior_secondary_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_junior_secondary_session_reports",
    )

    class Meta:
        db_table = "results_junior_secondary_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.academic_session.name} (JSS Session)"


JuniorSecondarySessionReport.TERM_REPORT_MODEL = JuniorSecondaryTermReport


# ============================================================
# PRIMARY — TERM REPORT + RESULT + SESSION REPORT
# ============================================================


class PrimaryTermReport(TenantMixin, BaseTermReport, TermReportFields, models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="primary_term_reports"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="primary_term_reports"
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_primary_reports",
    )

    class Meta:
        db_table = "results_primary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (Primary Term)"


class PrimaryResult(TenantMixin, BaseResult, models.Model):
    RESULT_FK_NAME = "primary_result"
    RESULT_STATUS = _RESULT_STATUS

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="primary_results"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="primary_results"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="primary_results"
    )
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="primary_results"
    )
    term_report = models.ForeignKey(
        PrimaryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    teacher_remark = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_primary_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_primary_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_primary_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_primary_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_primary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            qs = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .select_for_update()
                .order_by("-percentage", "created_at")
            )
            cls._bulk_recalculate_positions(qs)


class PrimarySessionReport(TenantMixin, BaseSessionReport, models.Model):
    TERM_REPORT_MODEL = None

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="primary_session_reports"
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="primary_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_primary_session_reports",
    )

    class Meta:
        db_table = "results_primary_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return (
            f"{self.student.full_name} — {self.academic_session.name} (Primary Session)"
        )


PrimarySessionReport.TERM_REPORT_MODEL = PrimaryTermReport


# ============================================================
# NURSERY — TERM REPORT + RESULT + SESSION REPORT
# ============================================================

class NurseryTermReport(TenantMixin, BaseTermReport, models.Model):
    """
    Nursery uses marks-based aggregation so it doesn't inherit TermReportFields.
    """

    RESULT_STATUS = _RESULT_STATUS
    PHYSICAL_DEVELOPMENT_CHOICES = [
        ("Excellent", "Excellent"),
        ("Very Good", "Very Good"),
        ("Good", "Good"),
        ("Fair", "Fair"),
        ("Poor", "Poor"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="nursery_term_reports"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="nursery_term_reports"
    )
    total_subjects = models.PositiveIntegerField(default=0)
    total_max_marks = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    total_marks_obtained = models.DecimalField(
        max_digits=8, decimal_places=2, default=0
    )
    overall_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students_in_class = models.PositiveIntegerField(default=0)
    times_school_opened = models.PositiveIntegerField(default=0)
    times_student_present = models.PositiveIntegerField(default=0)
    physical_development = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    health = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    cleanliness = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    general_conduct = models.CharField(
        max_length=20, choices=PHYSICAL_DEVELOPMENT_CHOICES, blank=True
    )
    physical_development_comment = models.TextField(blank=True)
    height_beginning = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    height_end = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    weight_beginning = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    weight_end = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    next_term_begins = models.DateField(null=True, blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_nursery_reports",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_nursery_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "-overall_percentage"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.exam_session.name} (Nursery Term)"

    def calculate_metrics(self):
        from django.db.models import Count, Sum

        agg = NurseryResult.objects.filter(
            student=self.student,
            exam_session=self.exam_session,
            status__in=("APPROVED", "PUBLISHED"),
        ).aggregate(
            total_max=Sum("max_marks_obtainable"),
            total_obtained=Sum("mark_obtained"),
            cnt=Count("id"),
        )
        self.total_subjects = agg["cnt"] or 0
        self.total_max_marks = agg["total_max"] or 0
        self.total_marks_obtained = agg["total_obtained"] or 0
        self.overall_percentage = (
            (self.total_marks_obtained / self.total_max_marks * 100)
            if self.total_max_marks > 0
            else 0
        )
        self.save(
            update_fields=[
                "total_subjects",
                "total_max_marks",
                "total_marks_obtained",
                "overall_percentage",
                "updated_at",
            ]
        )

    def calculate_class_position(self):
        peers = (
            NurseryTermReport.objects.filter(
                exam_session=self.exam_session,
                student__student_class=self.student.student_class,
                student__education_level=self.student.education_level,
                status__in=("APPROVED", "PUBLISHED"),
            )
            .exclude(id=self.id)
            .exclude(overall_percentage__isnull=True)
        )
        higher = peers.filter(overall_percentage__gt=self.overall_percentage).count()
        same_earlier = peers.filter(
            overall_percentage=self.overall_percentage,
            created_at__lt=self.created_at,
        ).count()
        self.class_position = higher + same_earlier + 1
        self.total_students_in_class = peers.count() + 1
        self.save(
            update_fields=["class_position", "total_students_in_class", "updated_at"]
        )

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        with transaction.atomic():
            reports = (
                cls.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .select_for_update()
                .order_by("-overall_percentage")
            )
            total = reports.count()
            updates = []
            for pos, report in enumerate(reports, start=1):
                report.class_position = pos
                report.total_students_in_class = total
                updates.append(report)
            cls.objects.bulk_update(
                updates, ["class_position", "total_students_in_class"], batch_size=100
            )


class NurseryResult(TenantMixin, models.Model):
    RESULT_STATUS = _RESULT_STATUS
    RESULT_FK_NAME = "nursery_result"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="nursery_results"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="nursery_results"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="nursery_results"
    )
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="nursery_results"
    )
    term_report = models.ForeignKey(
        NurseryTermReport,
        on_delete=models.SET_NULL,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    max_marks_obtainable = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Overridden by ComponentScore sum if nursery components are configured",
    )
    mark_obtained = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    grade = models.CharField(max_length=5, blank=True)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    is_passed = models.BooleanField(default=False)
    subject_position = models.PositiveIntegerField(null=True, blank=True)
    academic_comment = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_nursery_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_nursery_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_nursery_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_nursery_results",
    )
    last_edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_nursery_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.mark_obtained})"

    def save(self, *args, **kwargs):
        if self.pk:
            cs_qs = ComponentScore.objects.filter(nursery_result=self).select_related(
                "component"
            )
            if cs_qs.exists():
                self.mark_obtained = sum(cs.score for cs in cs_qs)
                self.max_marks_obtainable = sum(cs.component.max_score for cs in cs_qs)
        if self.max_marks_obtainable and self.max_marks_obtainable > 0:
            self.percentage = (self.mark_obtained / self.max_marks_obtainable) * 100
        else:
            self.percentage = 0
        if self.grading_system:
            try:
                grade = self.grading_system.get_grade(float(self.percentage))
                self.grade = grade if grade else _default_grade(float(self.percentage))
                self.is_passed = float(self.percentage) >= float(
                    self.grading_system.pass_mark or 40
                )
            except Exception as e:
                logger.error(f"Error determining nursery grade: {e}")
                self.grade = _default_grade(float(self.percentage))
                self.is_passed = float(self.percentage) >= 40
        super().save(*args, **kwargs)

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        with transaction.atomic():
            results = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=("APPROVED", "PUBLISHED"),
                )
                .select_for_update()
                .order_by("-percentage", "created_at")
            )
            if not results.exists():
                return
            current_position = 1
            count_at_current = 0
            prev_score = None
            updates = []
            for result in results:
                score = result.percentage
                if score != prev_score:
                    current_position += count_at_current
                    count_at_current = 1
                    prev_score = score
                else:
                    count_at_current += 1
                result.subject_position = current_position
                updates.append(result)
            cls.objects.bulk_update(updates, ["subject_position"], batch_size=100)

    @property
    def position_formatted(self):
        if not self.subject_position:
            return ""
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(self.subject_position, "th")
        return f"{self.subject_position}{suffix}"


class NurserySessionReport(TenantMixin, BaseSessionReport, models.Model):
    """
    Session report for a Nursery student.
    compute_from_term_reports() handles the marks-based NurseryTermReport
    by checking for overall_percentage / total_marks_obtained fields.
    """

    TERM_REPORT_MODEL = None

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="nursery_session_reports"
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="nursery_session_reports",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_nursery_session_reports",
    )

    class Meta:
        db_table = "results_nursery_session_report"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return (
            f"{self.student.full_name} — {self.academic_session.name} (Nursery Session)"
        )


NurserySessionReport.TERM_REPORT_MODEL = NurseryTermReport


# ============================================================
# LEGACY MODELS
# ============================================================


class StudentResult(TenantMixin, models.Model):
    RESULT_STATUS = _RESULT_STATUS

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="results"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="student_results"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="student_results"
    )
    grading_system = models.ForeignKey(
        GradingSystem, on_delete=models.CASCADE, related_name="student_results"
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_results",
    )
    ca_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    exam_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    total_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    grade = models.CharField(max_length=5, blank=True)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_passed = models.BooleanField(default=False)
    remarks = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="entered_results",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_results",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_student_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student.full_name} — {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        ca = Decimal(self.ca_score or 0)
        exam = Decimal(self.exam_score or 0)
        self.total_score = ca + exam
        max_score = Decimal(self.grading_system.max_score or 100)
        self.percentage = (self.total_score / max_score * 100) if max_score > 0 else 0
        super().save(*args, **kwargs)


class StudentTermResult(TenantMixin, models.Model):
    RESULT_STATUS = _RESULT_STATUS

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="term_results"
    )
    academic_session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name="student_term_results"
    )
    term = models.ForeignKey(
        Term,
        on_delete=models.PROTECT,
        related_name="student_term_results",
        null=True,
        blank=True,
    )
    total_subjects = models.PositiveIntegerField(default=0)
    subjects_passed = models.PositiveIntegerField(default=0)
    subjects_failed = models.PositiveIntegerField(default=0)
    total_score = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    average_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    gpa = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(default=0)
    times_opened = models.PositiveIntegerField(default=0)
    times_present = models.PositiveIntegerField(default=0)
    next_term_begins = models.DateField(null=True, blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_term_results",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_student_term_result"
        unique_together = ["tenant", "student", "academic_session", "term"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student"]),
            models.Index(fields=["tenant", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        term_name = self.term.name if self.term else "Unknown"
        return f"{self.student.full_name} — {term_name} {self.academic_session.name}"


class AssessmentScore(TenantMixin, models.Model):
    student_result = models.ForeignKey(
        StudentResult, on_delete=models.CASCADE, related_name="assessment_scores"
    )
    assessment_type = models.ForeignKey(
        AssessmentType, on_delete=models.CASCADE, related_name="scores"
    )
    score = models.DecimalField(
        max_digits=5, decimal_places=2, validators=[MinValueValidator(0)]
    )
    max_score = models.DecimalField(
        max_digits=5, decimal_places=2, validators=[MinValueValidator(0)]
    )
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    remarks = models.TextField(blank=True)
    date_assessed = models.DateField(default=timezone.now)

    class Meta:
        db_table = "results_assessment_score"
        unique_together = ["tenant", "student_result", "assessment_type"]

    def save(self, *args, **kwargs):
        if self.max_score > 0:
            self.percentage = (self.score / self.max_score) * 100
        super().save(*args, **kwargs)


class ResultSheet(TenantMixin, models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="result_sheets"
    )
    student_class = models.ForeignKey(
        StudentClass,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="result_sheets",
    )
    total_students = models.PositiveIntegerField(default=0)
    students_passed = models.PositiveIntegerField(default=0)
    students_failed = models.PositiveIntegerField(default=0)
    class_average = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    highest_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    lowest_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=_RESULT_STATUS, default="DRAFT")
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="prepared_sheets",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_sheets",
    )
    approved_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_result_sheet"
        unique_together = ["tenant", "exam_session", "student_class"]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student_class.name} — {self.exam_session.name}"

    @property
    def education_level(self):
        return self.student_class.education_level


class ResultTemplate(TenantMixin, models.Model):
    TEMPLATE_TYPES = [
        ("REPORT_CARD", "Report Card"),
        ("TRANSCRIPT", "Academic Transcript"),
        ("CERTIFICATE", "Certificate"),
        ("RESULT_SLIP", "Result Slip"),
    ]

    name = models.CharField(max_length=100)
    template_type = models.CharField(max_length=20, choices=TEMPLATE_TYPES)
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="result_templates",
        null=True,
        blank=True,
    )
    template_content = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_result_template"
        ordering = ["name"]
        unique_together = ["tenant", "name"]

    def __str__(self):
        level = self.education_level.name if self.education_level else "All Levels"
        return f"{self.name} ({self.get_template_type_display()}) — {level}"


class ResultComment(TenantMixin, models.Model):
    COMMENT_TYPES = [
        ("GENERAL", "General Comment"),
        ("SUBJECT", "Subject-specific Comment"),
        ("BEHAVIOR", "Behavioral Comment"),
        ("RECOMMENDATION", "Recommendation"),
    ]

    student_result = models.ForeignKey(
        StudentResult,
        on_delete=models.CASCADE,
        related_name="comments",
        null=True,
        blank=True,
    )
    term_result = models.ForeignKey(
        StudentTermResult,
        on_delete=models.CASCADE,
        related_name="comments",
        null=True,
        blank=True,
    )
    comment_type = models.CharField(max_length=20, choices=COMMENT_TYPES)
    comment = models.TextField()
    commented_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="result_comments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "results_result_comment"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Comment by {self.commented_by} on {self.created_at:%Y-%m-%d}"
