# result/models.py
import logging
from django.db import models, transaction
from django.conf import settings
from django.core.cache import cache
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from subject.models import Subject
from academics.models import AcademicSession
from django.utils import timezone
from decimal import Decimal
import uuid
from datetime import timedelta

from students.models import Student
from students.models import (
    Class as StudentClass,
    EducationLevel,
)
from classroom.models import Stream
from tenants.models import TenantMixin

from students.constants import (
    EDUCATION_LEVEL_CHOICES,
    CLASS_CHOICES,
)

logger = logging.getLogger(__name__)


# ============================================
# GRADING SYSTEM
# ============================================

class GradingSystem(TenantMixin, models.Model):
    """Grading system configuration"""

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
        verbose_name = "Grading System"
        verbose_name_plural = "Grading Systems"
        unique_together = ["tenant", "name"]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return self.name

    def get_grade(self, percentage):
        if percentage is None:
            return None
        try:
            grade_objects = self.grades.all().order_by("-min_score")
            if not grade_objects.exists():
                logger.warning(f"⚠️ No grades defined for grading system: {self.name}")
                return None
            for grade_obj in grade_objects:
                if grade_obj.min_score <= percentage <= grade_obj.max_score:
                    return grade_obj.grade
            lowest_grade = grade_objects.last()
            return lowest_grade.grade if lowest_grade else None
        except Exception as e:
            logger.error(f"Error getting grade for {self.name}: {str(e)}")
            return None


# ============================================
# GRADE
# ============================================

class Grade(TenantMixin, models.Model):
    """Individual grade definitions within a grading system"""

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
        indexes = [
            models.Index(fields=["tenant", "grading_system"]),
        ]

    def __str__(self):
        return f"{self.grade} ({self.min_score}-{self.max_score})"

    def clean(self):
        if self.min_score >= self.max_score:
            raise ValidationError("Minimum score must be less than maximum score")


# ============================================
# SCORING CONFIGURATION
# ============================================

class ScoringConfiguration(TenantMixin, models.Model):
    """Configuration for scoring systems across different education levels"""

    RESULT_TYPE_CHOICES = [
        ("TERMLY", "Termly Result"),
        ("SESSION", "Session Result"),
    ]

    id = models.AutoField(primary_key=True)

    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="scoring_configurations",
        verbose_name="Education Level",
    )
    result_type = models.CharField(
        max_length=20, choices=RESULT_TYPE_CHOICES, verbose_name="Result Type"
    )
    name = models.CharField(max_length=100, verbose_name="Configuration Name")
    description = models.TextField(blank=True, verbose_name="Description")

    test1_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=10,
        validators=[MinValueValidator(0)],
        verbose_name="Test 1 Max Score",
    )
    test2_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=10,
        validators=[MinValueValidator(0)],
        verbose_name="Test 2 Max Score",
    )
    test3_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=10,
        validators=[MinValueValidator(0)],
        verbose_name="Test 3 Max Score",
    )
    continuous_assessment_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=15,
        validators=[MinValueValidator(0)],
        verbose_name="Continuous Assessment Max Score",
    )
    take_home_test_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=5,
        validators=[MinValueValidator(0)],
        verbose_name="Take Home Test Max Score",
    )
    appearance_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=5,
        validators=[MinValueValidator(0)],
        verbose_name="Appearance Max Score",
    )
    practical_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=5,
        validators=[MinValueValidator(0)],
        verbose_name="Practical Max Score",
    )
    project_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=5,
        validators=[MinValueValidator(0)],
        verbose_name="Project Max Score",
    )
    note_copying_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=5,
        validators=[MinValueValidator(0)],
        verbose_name="Note Copying Max Score",
    )
    exam_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=70,
        validators=[MinValueValidator(0)],
        verbose_name="Exam Max Score",
    )
    ca_weight_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=40,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="CA Weight Percentage",
    )
    exam_weight_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=60,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Exam Weight Percentage",
    )
    total_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0)],
        verbose_name="Total Max Score",
    )
    is_active = models.BooleanField(default=True, verbose_name="Active")
    is_default = models.BooleanField(
        default=False, verbose_name="Default Configuration"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_scoring_configs",
        verbose_name="Created By",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_scoring_configuration"
        unique_together = ["tenant", "education_level", "result_type", "name"]
        ordering = ["education_level__order", "result_type", "name"]
        indexes = [
            models.Index(fields=["tenant", "education_level", "result_type"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "is_default"]),
        ]
        verbose_name = "Scoring Configuration"
        verbose_name_plural = "Scoring Configurations"

    def __str__(self):
        return f"{self.education_level.name} - {self.get_result_type_display()} - {self.name}"


# ============================================
# ASSESSMENT TYPE (single definition)
# ============================================

class AssessmentType(TenantMixin, models.Model):
    """Types of assessments (Continuous Assessment, Exam, etc.)"""

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10)
    description = models.TextField(blank=True)

    education_level_legacy = models.CharField(
        max_length=20,
        choices=EDUCATION_LEVEL_CHOICES + (("ALL", "All Levels"),),
        default="ALL",
        help_text="Legacy education level (DEPRECATED)",
        null=True,
        blank=True,
    )
    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.PROTECT,
        related_name="assessment_types",
        null=True,
        blank=True,
        help_text="Education level this assessment type applies to (None = ALL)",
    )
    max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=10,
        validators=[MinValueValidator(0)],
        help_text="Maximum score for this assessment type",
    )
    weight_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Weight in final score calculation",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "results_assessment_type"
        verbose_name = "Assessment Type"
        verbose_name_plural = "Assessment Types"
        ordering = ["name"]
        unique_together = [
            ["tenant", "name"],
            ["tenant", "code"],
        ]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "education_level"]),
        ]

    def __str__(self):
        level_name = self.education_level.name if self.education_level else "All Levels"
        return f"{self.name} - {level_name} ({self.weight_percentage}%)"


# ============================================
# EXAM SESSION
# ============================================

class ExamSession(TenantMixin, models.Model):
    """Exam sessions within an academic session"""

    EXAM_TYPES = [
        ("FIRST_CA", "First Continuous Assessment"),
        ("SECOND_CA", "Second Continuous Assessment"),
        ("THIRD_CA", "Third Continuous Assessment"),
        ("MID_TERM", "Mid-term Examination"),
        ("FINAL_EXAM", "Final Examination"),
        ("MOCK_EXAM", "Mock Examination"),
        ("PRACTICAL", "Practical Examination"),
        ("PROJECT", "Project Assessment"),
        ("OTHER", "Other"),
    ]

    TERMS = [
        ("FIRST", "First Term"),
        ("SECOND", "Second Term"),
        ("THIRD", "Third Term"),
    ]

    name = models.CharField(max_length=100)
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPES)
    academic_session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name="exam_sessions"
    )
    term = models.CharField(max_length=10, choices=TERMS)
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
        ]

    def __str__(self):
        return f"{self.name} - {self.academic_session.name} ({self.get_term_display()})"

    def clean(self):
        if self.start_date >= self.end_date:
            raise ValidationError("Start date must be before end date")


# ============================================
# STUDENT RESULT
# ============================================

class StudentResult(TenantMixin, models.Model):
    """Main result record for a student in a subject"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
        help_text="Stream for Senior Secondary results (Science, Arts, Commercial, Technical)",
    )
    ca_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Continuous Assessment Score",
    )
    exam_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Examination Score",
    )
    total_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
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
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
    is_passed = models.BooleanField(default=False)
    position = models.PositiveIntegerField(null=True, blank=True)
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
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        self.calculate_scores()
        self.determine_grade()
        super().save(*args, **kwargs)

    def calculate_scores(self):
        ca = Decimal(self.ca_score or 0)
        exam = Decimal(self.exam_score or 0)
        self.total_score = ca + exam
        max_score = Decimal(getattr(self.grading_system, "max_score", 0) or 0)
        self.percentage = (
            (self.total_score / max_score * 100) if max_score > 0 else Decimal(0)
        )

    def determine_grade(self):
        gs = self.grading_system
        pct = float(self.percentage or 0)

        if gs.grading_type == "PASS_FAIL":
            try:
                pass_mark = float(gs.pass_mark or 0)
            except Exception:
                pass_mark = 0.0
            self.is_passed = pct >= pass_mark
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
            return

        if gs.grading_type == "POINTS":
            try:
                from django.db.models import Max as DMax

                max_gp = gs.grades.aggregate(Max("grade_point"))["grade_point__max"]
                max_gp = float(max_gp) if max_gp is not None else None
            except Exception:
                max_gp = None

            if max_gp and float(gs.max_score or 0) > 0:
                point_score = (float(self.total_score) / float(gs.max_score)) * max_gp
                fallback_grade = (
                    gs.grades.filter(grade_point__lte=point_score)
                    .order_by("-grade_point")
                    .first()
                )
                if fallback_grade:
                    self.grade = fallback_grade.grade
                    self.grade_point = fallback_grade.grade_point
                    self.is_passed = bool(fallback_grade.is_passing)
                    return

        self.grade = "F"
        self.grade_point = Decimal(0) if self.grade_point is None else self.grade_point
        self.is_passed = False


# ============================================
# ASSESSMENT SCORE
# ============================================


class AssessmentScore(TenantMixin, models.Model):
    """Detailed assessment scores for different assessment types"""

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
        indexes = [
            models.Index(fields=["tenant", "student_result"]),
        ]

    def __str__(self):
        return f"{self.student_result.student.full_name} - {self.assessment_type.name}: {self.score}"

    def save(self, *args, **kwargs):
        if self.max_score > 0:
            self.percentage = (self.score / self.max_score) * 100
        super().save(*args, **kwargs)


# ============================================
# RESULT SHEET (single definition)
# ============================================


class ResultSheet(TenantMixin, models.Model):
    """Class result sheet for an exam session"""

    SHEET_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
        help_text="Class for this result sheet",
    )

    total_students = models.PositiveIntegerField(default=0)
    students_passed = models.PositiveIntegerField(default=0)
    students_failed = models.PositiveIntegerField(default=0)
    class_average = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    highest_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    lowest_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=SHEET_STATUS, default="DRAFT")
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
        indexes = [
            models.Index(fields=["tenant", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "student_class"]),
        ]

    def __str__(self):
        return f"{self.student_class.name} - {self.exam_session.name}"

    @property
    def education_level(self):
        """Get education level from student_class"""
        return self.student_class.education_level

    def calculate_statistics(self):
        results = StudentResult.objects.filter(
            exam_session=self.exam_session,
            student__student_class=self.student_class,
            status="APPROVED",
        )
        if results.exists():
            self.total_students = results.count()
            self.students_passed = results.filter(is_passed=True).count()
            self.students_failed = self.total_students - self.students_passed
            scores = results.values_list("total_score", flat=True)
            if scores:
                self.class_average = sum(scores) / len(scores)
                self.highest_score = max(scores)
                self.lowest_score = min(scores)
        self.save()


# ============================================
# RESULT TEMPLATE (single definition)
# ============================================


class ResultTemplate(TenantMixin, models.Model):
    """Templates for result reports"""

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
        help_text="Education level this template applies to (None = ALL)",
    )
    template_content = models.TextField(help_text="HTML template content")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_result_template"
        ordering = ["name"]
        unique_together = ["tenant", "name"]
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "template_type"]),
            models.Index(fields=["tenant", "education_level"]),
        ]

    def __str__(self):
        level_name = self.education_level.name if self.education_level else "All Levels"
        return f"{self.name} ({self.get_template_type_display()}) - {level_name}"


# ============================================
# STUDENT TERM RESULT
# ============================================


class StudentTermResult(TenantMixin, models.Model):
    """Consolidated term results for a student"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="term_results"
    )
    academic_session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name="student_term_results"
    )
    term = models.CharField(max_length=10, choices=ExamSession.TERMS)
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
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
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
        return f"{self.student.full_name} - {self.get_term_display()} {self.academic_session.name}"

    def calculate_metrics(self):
        results = StudentResult.objects.filter(
            student=self.student,
            exam_session__academic_session=self.academic_session,
            exam_session__term=self.term,
            status="APPROVED",
        )
        if results.exists():
            self.total_subjects = results.count()
            self.subjects_passed = results.filter(is_passed=True).count()
            self.subjects_failed = self.total_subjects - self.subjects_passed
            self.total_score = sum(result.total_score for result in results)
            self.average_score = (
                self.total_score / self.total_subjects if self.total_subjects > 0 else 0
            )
            grade_points = [
                result.grade_point
                for result in results
                if result.grade_point is not None
            ]
            self.gpa = sum(grade_points) / len(grade_points) if grade_points else 0
        self.save()


# ============================================
# RESULT COMMENT
# ============================================


class ResultComment(TenantMixin, models.Model):
    """Comments on student results"""

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
        indexes = [
            models.Index(fields=["tenant", "student_result"]),
            models.Index(fields=["tenant", "term_result"]),
        ]

    def __str__(self):
        return f"Comment by {self.commented_by.username} on {self.created_at}"


# ============================================
# BASE TERM REPORT (abstract)
# ============================================

class BaseTermReport(models.Model):
    """Abstract base for all term report models."""

    def first_signatory_role(self):
        student = getattr(self, "student", None)
        if not student:
            return None
        if student.education_level in ["NURSERY", "PRIMARY"]:
            return "CLASS_TEACHER"
        return "SUBJECT_TEACHER"

    def can_edit_teacher_remark(self, user):
        from teacher.models import Teacher
        from classroom.models import StudentEnrollment, ClassroomTeacherAssignment

        if not hasattr(user, "role"):
            return False
        if user.role != "TEACHER":
            return False
        try:
            teacher = Teacher.objects.get(user=user)
            student = self.student
            student_enrollment = (
                StudentEnrollment.objects.filter(student=student, is_active=True)
                .select_related("classroom")
                .first()
            )
            if not student_enrollment:
                return False
            student_classroom = student_enrollment.classroom
            role = self.first_signatory_role()
            if role == "CLASS_TEACHER":
                return student_classroom.class_teacher == teacher
            if role == "SUBJECT_TEACHER":
                return ClassroomTeacherAssignment.objects.filter(
                    teacher=teacher, classroom=student_classroom
                ).exists()
            return False
        except Teacher.DoesNotExist:
            return False
        except Exception as e:
            logger.error(
                f"Error checking teacher remark permission: {e}", exc_info=True
            )
            return False

    def can_edit_head_teacher_remark(self, user):
        return hasattr(user, "role") and user.role in [
            "HEAD_TEACHER",
            "PROPRIETRESS",
            "PRINCIPAL",
            "admin",
            "superadmin",
        ]

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


# ============================================
# SENIOR SECONDARY MODELS
# ============================================

class SeniorSecondaryTermReport(TenantMixin, BaseTermReport, models.Model):
    """Consolidated senior secondary term report"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_senior_secondary_term_reports",
    )
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_senior_secondary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "is_published"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.exam_session.name} Senior Secondary Term Report"

    def calculate_metrics(self):
        subject_results = self.subject_results.filter(
            status__in=["APPROVED", "PUBLISHED"]
        ).aggregate(
            total=models.Sum("total_score"),
            count=models.Count("id"),
            avg_pct=models.Avg("percentage"),
        )
        if subject_results["count"]:
            self.total_score = subject_results["total"] or 0
            self.average_score = subject_results["avg_pct"] or 0
            self.overall_grade = self._get_grade_for_percentage(self.average_score)
        self.save(update_fields=["total_score", "average_score", "overall_grade"])

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        with transaction.atomic():
            reports = (
                cls.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-average_score")
            )
            total_students = reports.count()
            updates = []
            for position, report in enumerate(reports, start=1):
                report.class_position = position
                report.total_students = total_students
                updates.append(report)
            cls.objects.bulk_update(
                updates, ["class_position", "total_students"], batch_size=50
            )

    def _get_default_grade(self, percentage):
        if percentage >= 70:
            return "A"
        if percentage >= 60:
            return "B"
        if percentage >= 50:
            return "C"
        if percentage >= 45:
            return "D"
        if percentage >= 39:
            return "E"
        return "F"

    def _get_grade_for_percentage(self, percentage):
        try:
            first_result = self.subject_results.first()
            if first_result and hasattr(first_result, "grading_system"):
                grading_system = first_result.grading_system
                grade_obj = grading_system.grades.filter(
                    min_score__lte=percentage, max_score__gte=percentage
                ).first()
                if grade_obj:
                    return grade_obj.grade
        except Exception as e:
            logger.error(f"Error getting grade from grading system: {e}")
        return self._get_default_grade(percentage)

    def calculate_class_position(self):
        same_class_reports = SeniorSecondaryTermReport.objects.filter(
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=["APPROVED", "PUBLISHED"],
        ).exclude(id=self.id)
        if same_class_reports.exists():
            higher_performers = same_class_reports.filter(
                average_score__gt=self.average_score
            ).count()
            self.class_position = higher_performers + 1
            self.total_students = same_class_reports.count() + 1
        else:
            self.class_position = 1
            self.total_students = 1
        self.save()

    def sync_status_with_subjects(self):
        if self.status in ["APPROVED", "PUBLISHED"]:
            return
        subject_results = self.subject_results.all()
        if not subject_results.exists():
            self.status = "DRAFT"
            self.save()
            return
        statuses = subject_results.values_list("status", flat=True)
        self.status = "DRAFT" if "DRAFT" in statuses else "SUBMITTED"
        self.save()


class SeniorSecondaryResult(TenantMixin, models.Model):
    """Senior Secondary specific result model with detailed test scores"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
        "result.SeniorSecondaryTermReport",
        on_delete=models.CASCADE,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    first_test_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        verbose_name="1st Test Score (10 marks)",
    )
    second_test_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        verbose_name="2nd Test Score (10 marks)",
    )
    third_test_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        verbose_name="3rd Test Score (10 marks)",
    )
    exam_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(70)],
        verbose_name="Examination Score (70 marks)",
    )
    total_ca_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        db_index=True,
    )
    grade = models.CharField(max_length=5, blank=True)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    is_passed = models.BooleanField(default=False, db_index=True)
    class_average = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    highest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    lowest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    subject_position = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    teacher_remark = models.TextField(blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature_url = models.URLField(blank=True, null=True)
    head_teacher_signature_url = models.URLField(blank=True, null=True)
    principal_signature_url = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
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
    _skip_signals = False

    class Meta:
        db_table = "results_senior_secondary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(fields=["tenant", "exam_session", "subject", "status", "-total_score"]),
            models.Index(fields=["tenant", "student", "status", "-percentage"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        skip_recalculation = kwargs.pop("skip_recalculation", False)
        self.calculate_scores()
        self.determine_grade()
        if not skip_recalculation:
            self.calculate_class_statistics()
        super().save(*args, **kwargs)
        if not skip_recalculation and self.status in ["APPROVED", "PUBLISHED"]:
            self.update_term_report()

    def calculate_scores(self):
        self.total_ca_score = (
            self.first_test_score + self.second_test_score + self.third_test_score
        )
        self.total_score = self.total_ca_score + self.exam_score
        if self.grading_system.max_score > 0:
            self.percentage = (self.total_score / self.grading_system.max_score) * 100
        else:
            self.percentage = 0

    def determine_grade(self):
        try:
            grade_obj = self.grading_system.grades.filter(
                min_score__lte=self.total_score, max_score__gte=self.total_score
            ).first()
            if grade_obj:
                self.grade = grade_obj.grade
                self.grade_point = grade_obj.grade_point
                self.is_passed = grade_obj.is_passing
            else:
                self.grade = "N/A"
                self.grade_point = None
                self.is_passed = False
        except Exception:
            self.grade = "N/A"
            self.grade_point = None
            self.is_passed = False

    def calculate_class_statistics(self):
        from django.db.models import Avg, Max, Min

        cache_key = f"class_stats_{self.subject.id}_{self.exam_session.id}_{self.student.student_class}"
        cached_stats = cache.get(cache_key)
        if cached_stats:
            self.class_average = cached_stats["avg"]
            self.highest_in_class = cached_stats["highest"]
            self.lowest_in_class = cached_stats["lowest"]
        else:
            stats = self.__class__.objects.filter(
                subject=self.subject,
                exam_session=self.exam_session,
                student__student_class=self.student.student_class,
                status__in=["APPROVED", "PUBLISHED"],
            ).aggregate(
                avg=Avg("total_score"),
                highest=Max("total_score"),
                lowest=Min("total_score"),
            )
            self.class_average = stats["avg"] or 0
            self.highest_in_class = stats["highest"] or 0
            self.lowest_in_class = stats["lowest"] or 0
            cache.set(cache_key, stats, 300)
        self._calculate_position()

    def _calculate_position(self):
        higher_count = self.__class__.objects.filter(
            subject=self.subject,
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            status__in=["APPROVED", "PUBLISHED"],
            total_score__gt=self.total_score,
        ).count()
        self.subject_position = higher_count + 1

    def update_term_report(self):
        with transaction.atomic():
            (
                term_report,
                created,
            ) = SeniorSecondaryTermReport.objects.select_for_update().get_or_create(
                student=self.student,
                exam_session=self.exam_session,
                defaults={"status": "DRAFT"},
            )
            if not self.term_report:
                self.__class__.objects.filter(id=self.id).update(
                    term_report=term_report
                )
                self.term_report = term_report
            term_report.calculate_metrics()
            term_report.sync_status_with_subjects()

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        from django.db.models import Avg, Max, Min

        with transaction.atomic():
            results = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-total_score")
            )
            if not results.exists():
                return
            stats = results.aggregate(
                avg=Avg("total_score"),
                highest=Max("total_score"),
                lowest=Min("total_score"),
            )
            updates = []
            for position, result in enumerate(results, start=1):
                result.subject_position = position
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
                batch_size=50,
            )
            cache_key = f"class_stats_{subject.id}_{exam_session.id}_{student_class}"
            cache.delete(cache_key)

    @property
    def position_formatted(self):
        if not self.subject_position:
            return ""
        suffix_map = {1: "st", 2: "nd", 3: "rd"}
        suffix = suffix_map.get(self.subject_position, "th")
        return f"{self.subject_position}{suffix}"


class SeniorSecondarySessionReport(TenantMixin, BaseTermReport, models.Model):
    """Consolidated senior secondary session report with TAA"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
    term1_total = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    term2_total = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    term3_total = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    taa_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    average_for_year = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    obtainable = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    obtained = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    overall_grade = models.CharField(max_length=5, blank=True)
    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(default=0)
    teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
        return f"{self.student.full_name} - {self.academic_session.name} Senior Secondary Session Report"

    def _get_default_grade(self, percentage):
        if percentage >= 70:
            return "A"
        if percentage >= 60:
            return "B"
        if percentage >= 50:
            return "C"
        if percentage >= 45:
            return "D"
        if percentage >= 39:
            return "E"
        return "F"

    def calculate_session_metrics(self):
        from django.db.models import Sum, Avg

        session_results = SeniorSecondarySessionResult.objects.filter(
            student=self.student,
            academic_session=self.academic_session,
            status__in=["APPROVED", "PUBLISHED"],
        )
        if session_results.exists():
            totals = session_results.aggregate(
                total_obtained=Sum("obtained"),
                total_obtainable=Sum("obtainable"),
                avg_for_year=Avg("average_for_year"),
            )
            self.obtained = totals["total_obtained"] or 0
            self.obtainable = totals["total_obtainable"] or 0
            self.average_for_year = totals["avg_for_year"] or 0
            if self.obtainable > 0:
                self.taa_score = (self.obtained / self.obtainable) * 100
            else:
                self.taa_score = 0
            self._calculate_term_totals()
            self.overall_grade = self._get_default_grade(self.average_for_year)
        self.save()

    def _calculate_term_totals(self):
        try:
            for term_name, attr in [
                ("FIRST", "term1_total"),
                ("SECOND", "term2_total"),
                ("THIRD", "term3_total"),
            ]:
                exam_session = ExamSession.objects.filter(
                    academic_session=self.academic_session, term=term_name
                ).first()
                if exam_session:
                    term_report = SeniorSecondaryTermReport.objects.filter(
                        student=self.student, exam_session=exam_session
                    ).first()
                    if term_report:
                        setattr(self, attr, term_report.total_score)
        except Exception as e:
            logger.error(f"Error calculating term totals: {e}")

    def calculate_class_position(self):
        same_class_reports = SeniorSecondarySessionReport.objects.filter(
            academic_session=self.academic_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=["APPROVED", "PUBLISHED"],
        ).exclude(id=self.id)
        if same_class_reports.exists():
            higher_performers = same_class_reports.filter(
                average_for_year__gt=self.average_for_year
            ).count()
            self.class_position = higher_performers + 1
            self.total_students = same_class_reports.count() + 1
        else:
            self.class_position = 1
            self.total_students = 1
        self.save()


class SeniorSecondarySessionResult(TenantMixin, models.Model):
    """Senior Secondary session result with Termly Accumulative Average (TAA)"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="senior_session_results"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="senior_session_results"
    )
    academic_session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name="senior_session_results"
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="senior_session_results",
    )
    session_report = models.ForeignKey(
        SeniorSecondarySessionReport,
        on_delete=models.CASCADE,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    first_term_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    second_term_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    third_term_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    average_for_year = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    obtainable = models.DecimalField(max_digits=5, decimal_places=2, default=300)
    obtained = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    class_average = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    highest_in_class = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    lowest_in_class = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    subject_position = models.PositiveIntegerField(null=True, blank=True)
    teacher_remark = models.TextField(blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature_url = models.URLField(blank=True, null=True)
    head_teacher_signature_url = models.URLField(blank=True, null=True)
    principal_signature_url = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_senior_secondary_session_result"
        unique_together = ["tenant", "student", "subject", "academic_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "academic_session"]),
            models.Index(fields=["tenant", "subject", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "session_report"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} Session Result"

    def save(self, *args, **kwargs):
        self.calculate_class_statistics()
        self.calculate_taa()
        super().save(*args, **kwargs)
        self.update_term_report()

    def calculate_taa(self):
        self.obtained = (
            self.first_term_score + self.second_term_score + self.third_term_score
        )
        if self.obtainable > 0:
            self.average_for_year = (self.obtained / self.obtainable) * 100
        else:
            self.average_for_year = 0

    def calculate_class_statistics(self):
        from django.db.models import Avg, Max, Min

        class_results = self.__class__.objects.filter(
            subject=self.subject,
            academic_session=self.academic_session,
            student__student_class=self.student.student_class,
            status__in=["APPROVED", "PUBLISHED"],
        ).exclude(id=self.id)
        if class_results.exists():
            self.class_average = (
                class_results.aggregate(avg=Avg("average_for_year"))["avg"] or 0
            )
            self.highest_in_class = (
                class_results.aggregate(max=Max("average_for_year"))["max"] or 0
            )
            self.lowest_in_class = (
                class_results.aggregate(min=Min("average_for_year"))["min"] or 0
            )
            all_scores = list(
                class_results.values_list("average_for_year", flat=True)
            ) + [self.average_for_year]
            all_scores.sort(reverse=True)
            self.subject_position = all_scores.index(self.average_for_year) + 1

    def update_term_report(self):
        session_report, created = SeniorSecondarySessionReport.objects.get_or_create(
            student=self.student,
            academic_session=self.academic_session,
            defaults={"status": "DRAFT"},
        )
        if not self.session_report:
            self.__class__.objects.filter(id=self.id).update(
                session_report=session_report.id
            )
        session_report.calculate_session_metrics()
        session_report.calculate_class_position()

    @property
    def term1_score(self):
        return self.first_term_score

    @property
    def term2_score(self):
        return self.second_term_score

    @property
    def term3_score(self):
        return self.third_term_score

    @property
    def average_score(self):
        return self.average_for_year

    @property
    def position(self):
        if self.subject_position:
            suffix_map = {1: "st", 2: "nd", 3: "rd"}
            suffix = suffix_map.get(self.subject_position, "th")
            return f"{self.subject_position}{suffix}"
        return ""


# ============================================
# JUNIOR SECONDARY MODELS
# ============================================

class JuniorSecondaryTermReport(TenantMixin, BaseTermReport, models.Model):
    """Consolidated junior secondary term report"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="junior_secondary_term_reports"
    )
    exam_session = models.ForeignKey(
        ExamSession,
        on_delete=models.CASCADE,
        related_name="junior_secondary_term_reports",
    )
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
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_junior_secondary_reports",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    class_teacher_signature = models.URLField(blank=True, null=True)
    class_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    head_teacher_signature = models.URLField(blank=True, null=True)
    head_teacher_signed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_junior_secondary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "is_published"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.exam_session.name} Junior Secondary Report"

    def _get_default_grade(self, percentage):
        if percentage >= 70:
            return "A"
        if percentage >= 60:
            return "B"
        if percentage >= 50:
            return "C"
        if percentage >= 45:
            return "D"
        if percentage >= 39:
            return "E"
        return "F"

    def calculate_metrics(self):
        from django.db.models import Sum, Count, Avg

        subject_results = JuniorSecondaryResult.objects.filter(
            student=self.student,
            exam_session=self.exam_session,
            status__in=["APPROVED", "PUBLISHED"],
        )
        if subject_results.exists():
            totals = subject_results.aggregate(
                total_score_sum=Sum("total_score"),
                subject_count=Count("id"),
                avg_percentage=Avg("total_percentage"),
            )
            self.total_score = totals["total_score_sum"] or 0
            self.average_score = totals["avg_percentage"] or 0
            if hasattr(subject_results.first(), "grading_system"):
                grading_system = subject_results.first().grading_system
                grade_obj = grading_system.grades.filter(
                    min_score__lte=self.average_score, max_score__gte=self.average_score
                ).first()
                self.overall_grade = (
                    grade_obj.grade
                    if grade_obj
                    else self._get_default_grade(self.average_score)
                )
            else:
                self.overall_grade = self._get_default_grade(self.average_score)
        self.save()

    def calculate_class_position(self):
        same_class_reports = JuniorSecondaryTermReport.objects.filter(
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=["APPROVED", "PUBLISHED"],
        ).exclude(id=self.id)
        if same_class_reports.exists():
            higher_performers = same_class_reports.filter(
                average_score__gt=self.average_score
            ).count()
            self.class_position = higher_performers + 1
            self.total_students = same_class_reports.count() + 1
        else:
            self.class_position = 1
            self.total_students = 1
        self.save()

    def sync_status_with_subjects(self):
        if self.status in ["APPROVED", "PUBLISHED"]:
            return
        subject_results = self.subject_results.all()
        if not subject_results.exists():
            self.status = "DRAFT"
            self.save()
            return
        statuses = subject_results.values_list("status", flat=True)
        self.status = "DRAFT" if "DRAFT" in statuses else "SUBMITTED"
        self.save()

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        with transaction.atomic():
            reports = (
                cls.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-average_score")
            )
            total_students = reports.count()
            updates = []
            for position, report in enumerate(reports, start=1):
                report.class_position = position
                report.total_students = total_students
                updates.append(report)
            cls.objects.bulk_update(
                updates, ["class_position", "total_students"], batch_size=50
            )


class JuniorSecondaryResult(TenantMixin, models.Model):
    """Junior Secondary specific result model with detailed CA breakdown"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
        on_delete=models.CASCADE,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    continuous_assessment_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(15)],
        verbose_name="Continuous Assessment (15 marks)",
    )
    take_home_test_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Take Home Test (5 marks)",
    )
    practical_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Practical (5 marks)",
    )
    appearance_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Appearance (5 marks)",
    )
    project_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Project (5 marks)",
    )
    note_copying_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Note Copying (5 marks)",
    )
    exam_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(60)],
        verbose_name="Examination (60 marks)",
    )
    ca_total = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    ca_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    exam_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    total_percentage = models.DecimalField(
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
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    highest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    lowest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    subject_position = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    previous_term_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cumulative_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    teacher_remark = models.TextField(blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature_url = models.URLField(blank=True, null=True)
    head_teacher_signature_url = models.URLField(blank=True, null=True)
    principal_signature_url = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
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
    _skip_signals = False

    class Meta:
        db_table = "results_junior_secondary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(
                fields=[
                    "tenant",
                    "exam_session",
                    "subject",
                    "status",
                    "-total_percentage",
                ]
            ),
            models.Index(fields=["tenant", "student", "status", "-total_percentage"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        skip_recalculation = kwargs.pop("skip_recalculation", False)
        self.calculate_scores()
        self.determine_grade()
        if not skip_recalculation:
            self.calculate_class_statistics()
        super().save(*args, **kwargs)
        if not skip_recalculation and self.status in ["APPROVED", "PUBLISHED"]:
            self.update_term_report()

    def calculate_scores(self):
        self.ca_total = (
            self.continuous_assessment_score
            + self.take_home_test_score
            + self.practical_score
            + self.project_score
            + self.appearance_score
            + self.note_copying_score
        )
        self.total_score = self.ca_total + self.exam_score
        self.ca_percentage = (self.ca_total / 35) * 100 if self.ca_total > 0 else 0
        self.exam_percentage = (
            (self.exam_score / 60) * 100 if self.exam_score > 0 else 0
        )
        self.total_percentage = (
            (self.total_score / 100) * 100 if self.total_score > 0 else 0
        )

    def determine_grade(self):
        try:
            grade_obj = self.grading_system.grades.filter(
                min_score__lte=self.total_percentage,
                max_score__gte=self.total_percentage,
            ).first()
            if grade_obj:
                self.grade = grade_obj.grade
                self.grade_point = grade_obj.grade_point
                self.is_passed = grade_obj.is_passing
            else:
                self.grade = "N/A"
                self.grade_point = None
                self.is_passed = False
        except Exception as e:
            logger.error(f"Error determining grade: {e}")
            self.grade = "N/A"
            self.grade_point = None
            self.is_passed = False

    def calculate_class_statistics(self):
        from django.db.models import Avg, Max, Min

        cache_key = f"class_stats_junior_{self.subject.id}_{self.exam_session.id}_{self.student.student_class}"
        cached_stats = cache.get(cache_key)
        if cached_stats:
            self.class_average = cached_stats["avg"]
            self.highest_in_class = cached_stats["highest"]
            self.lowest_in_class = cached_stats["lowest"]
        else:
            stats = self.__class__.objects.filter(
                subject=self.subject,
                exam_session=self.exam_session,
                student__student_class=self.student.student_class,
                status__in=["APPROVED", "PUBLISHED"],
            ).aggregate(
                avg=Avg("total_percentage"),
                highest=Max("total_percentage"),
                lowest=Min("total_percentage"),
            )
            self.class_average = stats["avg"] or 0
            self.highest_in_class = stats["highest"] or 0
            self.lowest_in_class = stats["lowest"] or 0
            cache.set(cache_key, stats, 300)
        self._calculate_position()

    def _calculate_position(self):
        higher_count = self.__class__.objects.filter(
            subject=self.subject,
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            status__in=["APPROVED", "PUBLISHED"],
            total_percentage__gt=self.total_percentage,
        ).count()
        self.subject_position = higher_count + 1

    def update_term_report(self):
        with transaction.atomic():
            (
                term_report,
                created,
            ) = JuniorSecondaryTermReport.objects.select_for_update().get_or_create(
                student=self.student,
                exam_session=self.exam_session,
                defaults={"status": "DRAFT"},
            )
            if not self.term_report:
                self.__class__.objects.filter(id=self.id).update(
                    term_report=term_report
                )
                self.term_report = term_report
            term_report.calculate_metrics()
            term_report.sync_status_with_subjects()

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        from django.db.models import Avg, Max, Min

        with transaction.atomic():
            results = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-total_percentage")
            )
            if not results.exists():
                return
            stats = results.aggregate(
                avg=Avg("total_percentage"),
                highest=Max("total_percentage"),
                lowest=Min("total_percentage"),
            )
            updates = []
            for position, result in enumerate(results, start=1):
                result.subject_position = position
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
                batch_size=50,
            )
            cache_key = (
                f"class_stats_junior_{subject.id}_{exam_session.id}_{student_class}"
            )
            cache.delete(cache_key)

    @property
    def exam_marks(self):
        return self.exam_score

    @property
    def mark_obtained(self):
        return self.total_score

    @property
    def total_obtainable(self):
        return 100

    @property
    def position_formatted(self):
        if not self.subject_position:
            return ""
        suffix_map = {1: "st", 2: "nd", 3: "rd"}
        suffix = suffix_map.get(self.subject_position, "th")
        return f"{self.subject_position}{suffix}"


# ============================================
# PRIMARY MODELS
# ============================================

class PrimaryTermReport(TenantMixin, BaseTermReport, models.Model):
    """Consolidated primary term report"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="primary_term_reports"
    )
    exam_session = models.ForeignKey(
        ExamSession, on_delete=models.CASCADE, related_name="primary_term_reports"
    )
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
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
    is_published = models.BooleanField(default=False)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_primary_reports",
    )
    published_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "results_primary_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "is_published"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.exam_session.name} Primary Report"

    def _get_default_grade(self, percentage):
        if percentage >= 70:
            return "A"
        if percentage >= 60:
            return "B"
        if percentage >= 50:
            return "C"
        if percentage >= 45:
            return "D"
        if percentage >= 39:
            return "E"
        return "F"

    def calculate_metrics(self):
        from django.db.models import Sum, Count, Avg

        subject_results = PrimaryResult.objects.filter(
            student=self.student,
            exam_session=self.exam_session,
            status__in=["APPROVED", "PUBLISHED"],
        )
        if subject_results.exists():
            totals = subject_results.aggregate(
                total_score_sum=Sum("total_score"),
                subject_count=Count("id"),
                avg_percentage=Avg("total_percentage"),
            )
            self.total_score = totals["total_score_sum"] or 0
            self.average_score = totals["avg_percentage"] or 0
            if hasattr(subject_results.first(), "grading_system"):
                grading_system = subject_results.first().grading_system
                grade_obj = grading_system.grades.filter(
                    min_score__lte=self.average_score, max_score__gte=self.average_score
                ).first()
                self.overall_grade = (
                    grade_obj.grade
                    if grade_obj
                    else self._get_default_grade(self.average_score)
                )
            else:
                self.overall_grade = self._get_default_grade(self.average_score)
        self.save()

    def calculate_class_position(self):
        same_class_reports = PrimaryTermReport.objects.filter(
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=["APPROVED", "PUBLISHED"],
        ).exclude(id=self.id)
        if same_class_reports.exists():
            higher_performers = same_class_reports.filter(
                average_score__gt=self.average_score
            ).count()
            self.class_position = higher_performers + 1
            self.total_students = same_class_reports.count() + 1
        else:
            self.class_position = 1
            self.total_students = 1
        self.save()

    def sync_status_with_subjects(self):
        if self.status in ["APPROVED", "PUBLISHED"]:
            return
        subject_results = self.subject_results.all()
        if not subject_results.exists():
            self.status = "DRAFT"
            self.save()
            return
        statuses = subject_results.values_list("status", flat=True)
        self.status = "DRAFT" if "DRAFT" in statuses else "SUBMITTED"
        self.save()

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        with transaction.atomic():
            reports = (
                cls.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-average_score")
            )
            total_students = reports.count()
            updates = []
            for position, report in enumerate(reports, start=1):
                report.class_position = position
                report.total_students = total_students
                updates.append(report)
            cls.objects.bulk_update(
                updates, ["class_position", "total_students"], batch_size=50
            )


class PrimaryResult(TenantMixin, models.Model):
    """Primary School specific result model with detailed CA breakdown"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
        on_delete=models.CASCADE,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    continuous_assessment_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(15)],
        verbose_name="Continuous Assessment (15 marks)",
    )
    take_home_test_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Take Home Test (5 marks)",
    )
    practical_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Practical (5 marks)",
    )
    appearance_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Appearance (5 marks)",
    )
    project_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Project (5 marks)",
    )
    note_copying_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        verbose_name="Note Copying (5 marks)",
    )
    exam_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(60)],
        verbose_name="Examination (60 marks)",
    )
    ca_total = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    ca_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    exam_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    total_percentage = models.DecimalField(
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
    previous_term_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cumulative_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    teacher_remark = models.TextField(blank=True)
    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature_url = models.URLField(blank=True, null=True)
    head_teacher_signature_url = models.URLField(blank=True, null=True)
    principal_signature_url = models.URLField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
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
    _skip_signals = False

    class Meta:
        db_table = "results_primary_result"
        unique_together = ["tenant", "student", "subject", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "subject", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "term_report"]),
            models.Index(
                fields=[
                    "tenant",
                    "exam_session",
                    "subject",
                    "status",
                    "-total_percentage",
                ]
            ),
            models.Index(fields=["tenant", "student", "status", "-total_percentage"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        skip_recalculation = kwargs.pop("skip_recalculation", False)
        self.calculate_scores()
        self.determine_grade()
        if not skip_recalculation:
            self.calculate_class_statistics()
        super().save(*args, **kwargs)
        if not skip_recalculation and self.status in ["APPROVED", "PUBLISHED"]:
            self.update_term_report()

    def calculate_scores(self):
        self.ca_total = (
            self.continuous_assessment_score
            + self.take_home_test_score
            + self.practical_score
            + self.project_score
            + self.appearance_score
            + self.note_copying_score
        )
        self.total_score = self.ca_total + self.exam_score
        self.ca_percentage = (self.ca_total / 35) * 100 if self.ca_total > 0 else 0
        self.exam_percentage = (
            (self.exam_score / 60) * 100 if self.exam_score > 0 else 0
        )
        self.total_percentage = (
            (self.total_score / 100) * 100 if self.total_score > 0 else 0
        )

    def determine_grade(self):
        try:
            grade_obj = self.grading_system.grades.filter(
                min_score__lte=self.total_percentage,
                max_score__gte=self.total_percentage,
            ).first()
            if grade_obj:
                self.grade = grade_obj.grade
                self.grade_point = grade_obj.grade_point
                self.is_passed = grade_obj.is_passing
            else:
                self.grade = "N/A"
                self.grade_point = None
                self.is_passed = False
        except Exception as e:
            logger.error(f"Error determining grade: {e}")
            self.grade = "N/A"
            self.grade_point = None
            self.is_passed = False

    def calculate_class_statistics(self):
        from django.db.models import Avg, Max, Min

        cache_key = f"class_stats_primary_{self.subject.id}_{self.exam_session.id}_{self.student.student_class}"
        cached_stats = cache.get(cache_key)
        if cached_stats:
            self.class_average = cached_stats["avg"]
            self.highest_in_class = cached_stats["highest"]
            self.lowest_in_class = cached_stats["lowest"]
        else:
            stats = self.__class__.objects.filter(
                subject=self.subject,
                exam_session=self.exam_session,
                student__student_class=self.student.student_class,
                status__in=["APPROVED", "PUBLISHED"],
            ).aggregate(
                avg=Avg("total_percentage"),
                highest=Max("total_percentage"),
                lowest=Min("total_percentage"),
            )
            self.class_average = stats["avg"] or 0
            self.highest_in_class = stats["highest"] or 0
            self.lowest_in_class = stats["lowest"] or 0
            cache.set(cache_key, stats, 300)
        self._calculate_position()

    def _calculate_position(self):
        higher_count = self.__class__.objects.filter(
            subject=self.subject,
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            status__in=["APPROVED", "PUBLISHED"],
            total_percentage__gt=self.total_percentage,
        ).count()
        self.subject_position = higher_count + 1

    def update_term_report(self):
        with transaction.atomic():
            (
                term_report,
                created,
            ) = PrimaryTermReport.objects.select_for_update().get_or_create(
                student=self.student,
                exam_session=self.exam_session,
                defaults={"status": "DRAFT"},
            )
            if not self.term_report:
                self.__class__.objects.filter(id=self.id).update(
                    term_report=term_report
                )
                self.term_report = term_report
            term_report.calculate_metrics()
            term_report.sync_status_with_subjects()

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        from django.db.models import Avg, Max, Min

        with transaction.atomic():
            results = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-total_percentage")
            )
            if not results.exists():
                return
            stats = results.aggregate(
                avg=Avg("total_percentage"),
                highest=Max("total_percentage"),
                lowest=Min("total_percentage"),
            )
            updates = []
            for position, result in enumerate(results, start=1):
                result.subject_position = position
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
                batch_size=50,
            )
            cache_key = (
                f"class_stats_primary_{subject.id}_{exam_session.id}_{student_class}"
            )
            cache.delete(cache_key)

    @property
    def exam_marks(self):
        return self.exam_score

    @property
    def mark_obtained(self):
        return self.total_score

    @property
    def total_obtainable(self):
        return 100

    @property
    def position_formatted(self):
        if not self.subject_position:
            return ""
        suffix_map = {1: "st", 2: "nd", 3: "rd"}
        suffix = suffix_map.get(self.subject_position, "th")
        return f"{self.subject_position}{suffix}"


# ============================================
# NURSERY MODELS
# ============================================

class NurseryTermReport(TenantMixin, BaseTermReport, models.Model):
    """Consolidated nursery term report"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
        max_length=20,
        choices=PHYSICAL_DEVELOPMENT_CHOICES,
        blank=True,
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
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
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
    _skip_signals = False

    class Meta:
        db_table = "results_nursery_term_report"
        unique_together = ["tenant", "student", "exam_session"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "student", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "exam_session", "status"]),
            models.Index(fields=["tenant", "student", "status"]),
            models.Index(fields=["tenant", "-overall_percentage"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.exam_session.name} Report"

    def save(self, *args, **kwargs):
        skip_recalculation = kwargs.pop("skip_recalculation", False)
        if not skip_recalculation:
            self.calculate_metrics()
            if not self.next_term_begins:
                self.next_term_begins = self.calculate_next_term_begins()
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if not skip_recalculation and self.overall_percentage is not None:
            self.calculate_class_position()
            if self.class_position is not None:
                super().save(
                    update_fields=["class_position", "total_students_in_class"]
                )

    def calculate_next_term_begins(self):
        try:
            from academics.models import Term

            current_exam_session = self.exam_session
            if not current_exam_session:
                return None
            current_term = current_exam_session.term
            if not current_term:
                return None
            academic_session = current_term.academic_session
            terms = Term.objects.filter(academic_session=academic_session).order_by(
                "start_date"
            )
            term_list = list(terms)
            try:
                current_index = term_list.index(current_term)
                if current_index < len(term_list) - 1:
                    return term_list[current_index + 1].start_date
                else:
                    next_session = AcademicSession.objects.filter(
                        start_year=academic_session.end_year
                    ).first()
                    if next_session:
                        first_term = (
                            Term.objects.filter(academic_session=next_session)
                            .order_by("start_date")
                            .first()
                        )
                        if first_term:
                            return first_term.start_date
            except ValueError:
                pass
            if current_term.end_date:
                return current_term.end_date + timedelta(days=14)
            return None
        except Exception as e:
            logger.error(f"Error calculating next term begins: {e}")
            return None

    def calculate_metrics(self):
        from django.db.models import Sum, Count

        subject_results = NurseryResult.objects.filter(
            student=self.student,
            exam_session=self.exam_session,
            status__in=["APPROVED", "PUBLISHED"],
        )
        if subject_results.exists():
            totals = subject_results.aggregate(
                total_max=Sum("max_marks_obtainable"),
                total_obtained=Sum("mark_obtained"),
                subject_count=Count("id"),
            )
            self.total_subjects = totals["subject_count"] or 0
            self.total_max_marks = totals["total_max"] or 0
            self.total_marks_obtained = totals["total_obtained"] or 0
            if self.total_max_marks > 0:
                self.overall_percentage = (
                    self.total_marks_obtained / self.total_max_marks
                ) * 100
            else:
                self.overall_percentage = 0

    def calculate_class_position(self):
        if self.overall_percentage is None or self.created_at is None:
            self.class_position = None
            self.total_students_in_class = 0
            return
        same_class_reports = (
            NurseryTermReport.objects.filter(
                exam_session=self.exam_session,
                student__student_class=self.student.student_class,
                student__education_level=self.student.education_level,
                status__in=["APPROVED", "PUBLISHED"],
            )
            .exclude(id=self.id)
            .exclude(overall_percentage__isnull=True)
        )
        if same_class_reports.exists():
            higher_performers = same_class_reports.filter(
                overall_percentage__gt=self.overall_percentage
            ).count()
            same_performers_earlier = same_class_reports.filter(
                overall_percentage=self.overall_percentage,
                created_at__lt=self.created_at,
            ).count()
            self.class_position = higher_performers + same_performers_earlier + 1
            self.total_students_in_class = same_class_reports.count() + 1
        else:
            self.class_position = 1
            self.total_students_in_class = 1

    def update_from_subject_results(self):
        self.calculate_metrics()
        self.calculate_class_position()
        self.save(skip_recalculation=True)

    def sync_status_with_subjects(self):
        if self.status in ["APPROVED", "PUBLISHED"]:
            return
        subject_results = NurseryResult.objects.filter(
            student=self.student,
            exam_session=self.exam_session,
        )
        if not subject_results.exists():
            self.status = "DRAFT"
            self.save()
            return
        statuses = subject_results.values_list("status", flat=True)
        self.status = "DRAFT" if "DRAFT" in statuses else "SUBMITTED"
        self.save()

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        with transaction.atomic():
            reports = (
                cls.objects.filter(
                    exam_session=exam_session,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-overall_percentage")
            )
            total_students = reports.count()
            updates = []
            for position, report in enumerate(reports, start=1):
                report.class_position = position
                report.total_students_in_class = total_students
                updates.append(report)
            cls.objects.bulk_update(
                updates, ["class_position", "total_students_in_class"], batch_size=50
            )


class NurseryResult(TenantMixin, models.Model):
    """Individual subject results for nursery students"""

    RESULT_STATUS = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("APPROVED", "Approved"),
        ("PUBLISHED", "Published"),
    ]

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
        on_delete=models.CASCADE,
        related_name="subject_results",
        null=True,
        blank=True,
    )
    max_marks_obtainable = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    mark_obtained = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    subject_position = models.PositiveIntegerField(null=True, blank=True)
    academic_comment = models.TextField(blank=True)
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
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
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
        return f"{self.student.full_name} - {self.subject.name} ({self.mark_obtained})"

    @property
    def total_score(self):
        return self.percentage

    def _get_default_grade(self, percentage):
        if percentage >= 70:
            return "A"
        if percentage >= 60:
            return "B"
        if percentage >= 50:
            return "C"
        if percentage >= 45:
            return "D"
        if percentage >= 40:
            return "E"
        return "F"

    def save(self, *args, **kwargs):
        if self.mark_obtained is not None and self.max_marks_obtainable > 0:
            self.percentage = (self.mark_obtained / self.max_marks_obtainable) * 100
        else:
            self.percentage = 0

        if self.percentage is not None and self.grading_system:
            try:
                calculated_grade = self.grading_system.get_grade(self.percentage)
                self.grade = (
                    calculated_grade
                    if calculated_grade
                    else self._get_default_grade(self.percentage)
                )
                self.is_passed = self.percentage >= float(
                    self.grading_system.pass_mark or 40
                )
            except Exception as e:
                logger.error(f"Error determining grade: {e}")
                self.grade = self._get_default_grade(self.percentage)
                self.is_passed = self.percentage >= 40

        is_new = self.pk is None
        super().save(*args, **kwargs)

        if self.percentage is not None and not is_new:
            self.calculate_subject_position()
            if self.subject_position is not None:
                super().save(update_fields=["subject_position"])

    def calculate_subject_position(self):
        if self.percentage is None or self.created_at is None:
            self.subject_position = None
            return
        class_results = (
            NurseryResult.objects.filter(
                subject=self.subject,
                exam_session=self.exam_session,
                student__education_level="NURSERY",
            )
            .exclude(pk=self.pk)
            .exclude(percentage__isnull=True)
        )
        higher_scores = class_results.filter(percentage__gt=self.percentage).count()
        same_score_earlier = class_results.filter(
            percentage=self.percentage, created_at__lt=self.created_at
        ).count()
        self.subject_position = higher_scores + same_score_earlier + 1

    def update_term_report(self):
        term_report, created = NurseryTermReport.objects.get_or_create(
            student=self.student,
            exam_session=self.exam_session,
            defaults={"status": "DRAFT"},
        )
        if not self.term_report:
            self.__class__.objects.filter(id=self.id).update(term_report=term_report.id)
        term_report.calculate_metrics()
        term_report.calculate_class_position()
        term_report.sync_status_with_subjects()

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        from django.db.models import Avg, Max, Min

        with transaction.atomic():
            results = (
                cls.objects.filter(
                    exam_session=exam_session,
                    subject=subject,
                    student__student_class=student_class,
                    student__education_level=education_level,
                    status__in=["APPROVED", "PUBLISHED"],
                )
                .select_for_update()
                .order_by("-percentage")
            )
            if not results.exists():
                return
            updates = []
            for position, result in enumerate(results, start=1):
                result.subject_position = position
                updates.append(result)
            cls.objects.bulk_update(updates, ["subject_position"], batch_size=50)

    @property
    def position_formatted(self):
        if not self.subject_position:
            return ""
        suffix_map = {1: "st", 2: "nd", 3: "rd"}
        suffix = suffix_map.get(self.subject_position, "th")
        return f"{self.subject_position}{suffix}"


# ============================================
# SIGNAL HANDLERS
# ============================================

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.db.models import Avg, Max, Min


@receiver(post_save, sender=SeniorSecondaryResult)
def handle_senior_result_save(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        SeniorSecondaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        SeniorSecondaryTermReport.bulk_recalculate_positions(
            instance.exam_session,
            instance.student.student_class,
            instance.student.education_level,
        )
    except Exception as e:
        logger.error(f"Error in bulk recalculation: {e}")


@receiver(post_save, sender=SeniorSecondaryResult)
def auto_generate_senior_term_report(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        with transaction.atomic():
            from academics.models import Term

            next_term_begins = None
            if hasattr(instance.exam_session, "academic_session"):
                current_term = instance.exam_session.term
                current_session = instance.exam_session.academic_session
                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)
                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()
                        if next_term:
                            next_term_begins = next_term.next_term_begins

            (
                term_report,
                report_created,
            ) = SeniorSecondaryTermReport.objects.select_for_update().get_or_create(
                student=instance.student,
                exam_session=instance.exam_session,
                defaults={
                    "status": "DRAFT",
                    "stream": instance.stream,
                    "next_term_begins": next_term_begins,
                },
            )
            if not instance.term_report:
                SeniorSecondaryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report
            term_report.calculate_metrics()
            term_report.calculate_class_position()
    except Exception as e:
        logger.error(f"❌ Error auto-generating term report: {e}", exc_info=True)


@receiver(post_delete, sender=SeniorSecondaryResult)
def handle_senior_result_delete(sender, instance, **kwargs):
    try:
        SeniorSecondaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        if instance.term_report:
            instance.term_report.calculate_metrics()
            SeniorSecondaryTermReport.bulk_recalculate_positions(
                instance.exam_session,
                instance.student.student_class,
                instance.student.education_level,
            )
    except Exception as e:
        logger.error(f"Error handling result deletion: {e}")


@receiver(post_save, sender=SeniorSecondarySessionResult)
def recalculate_senior_session_on_save(sender, instance, created, **kwargs):
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    all_results = SeniorSecondarySessionResult.objects.filter(
        subject=instance.subject,
        academic_session=instance.academic_session,
        student__student_class=instance.student.student_class,
        status__in=["APPROVED", "PUBLISHED"],
    ).order_by("-average_for_year")
    if all_results.exists():
        stats = all_results.aggregate(
            avg=Avg("average_for_year"),
            highest=Max("average_for_year"),
            lowest=Min("average_for_year"),
        )
        all_scores = list(all_results.values_list("average_for_year", flat=True))
        all_scores.sort(reverse=True)
        for result in all_results:
            position = all_scores.index(result.average_for_year) + 1
            SeniorSecondarySessionResult.objects.filter(id=result.id).update(
                subject_position=position,
                class_average=stats["avg"] or 0,
                highest_in_class=stats["highest"] or 0,
                lowest_in_class=stats["lowest"] or 0,
            )
    session_report, _ = SeniorSecondarySessionReport.objects.get_or_create(
        student=instance.student,
        academic_session=instance.academic_session,
        defaults={"status": "DRAFT"},
    )
    if not instance.session_report:
        SeniorSecondarySessionResult.objects.filter(id=instance.id).update(
            session_report=session_report
        )
    session_report.calculate_session_metrics()
    all_reports = SeniorSecondarySessionReport.objects.filter(
        academic_session=instance.academic_session,
        student__student_class=instance.student.student_class,
        student__education_level=instance.student.education_level,
        status__in=["APPROVED", "PUBLISHED"],
    ).order_by("-average_for_year")
    if all_reports.exists():
        all_scores = list(all_reports.values_list("average_for_year", flat=True))
        all_scores.sort(reverse=True)
        total_students = len(all_scores)
        for report in all_reports:
            position = all_scores.index(report.average_for_year) + 1
            SeniorSecondarySessionReport.objects.filter(id=report.id).update(
                class_position=position,
                total_students=total_students,
            )


@receiver(post_save, sender=JuniorSecondaryResult)
def handle_junior_result_save(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        JuniorSecondaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        JuniorSecondaryTermReport.bulk_recalculate_positions(
            instance.exam_session,
            instance.student.student_class,
            instance.student.education_level,
        )
    except Exception as e:
        logger.error(f"Error in Junior bulk recalculation: {e}")


@receiver(post_save, sender=JuniorSecondaryResult)
def auto_generate_junior_term_report(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        with transaction.atomic():
            from academics.models import Term

            next_term_begins = None
            if hasattr(instance.exam_session, "academic_session"):
                current_term = instance.exam_session.term
                current_session = instance.exam_session.academic_session
                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)
                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()
                        if next_term:
                            next_term_begins = next_term.next_term_begins
            (
                term_report,
                report_created,
            ) = JuniorSecondaryTermReport.objects.select_for_update().get_or_create(
                student=instance.student,
                exam_session=instance.exam_session,
                defaults={"status": "DRAFT", "next_term_begins": next_term_begins},
            )
            if not instance.term_report:
                JuniorSecondaryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report
            term_report.calculate_metrics()
            term_report.calculate_class_position()
    except Exception as e:
        logger.error(f"❌ Error auto-generating junior term report: {e}", exc_info=True)


@receiver(post_delete, sender=JuniorSecondaryResult)
def handle_junior_result_delete(sender, instance, **kwargs):
    try:
        JuniorSecondaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        if instance.term_report:
            instance.term_report.calculate_metrics()
            JuniorSecondaryTermReport.bulk_recalculate_positions(
                instance.exam_session,
                instance.student.student_class,
                instance.student.education_level,
            )
    except Exception as e:
        logger.error(f"Error handling Junior result deletion: {e}")


@receiver(post_save, sender=PrimaryResult)
def handle_primary_result_save(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        PrimaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        PrimaryTermReport.bulk_recalculate_positions(
            instance.exam_session,
            instance.student.student_class,
            instance.student.education_level,
        )
    except Exception as e:
        logger.error(f"Error in Primary bulk recalculation: {e}")


@receiver(post_save, sender=PrimaryResult)
def auto_generate_primary_term_report(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        with transaction.atomic():
            from academics.models import Term

            next_term_begins = None
            if hasattr(instance.exam_session, "academic_session"):
                current_term = instance.exam_session.term
                current_session = instance.exam_session.academic_session
                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)
                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()
                        if next_term:
                            next_term_begins = next_term.next_term_begins
            (
                term_report,
                report_created,
            ) = PrimaryTermReport.objects.select_for_update().get_or_create(
                student=instance.student,
                exam_session=instance.exam_session,
                defaults={"status": "DRAFT", "next_term_begins": next_term_begins},
            )
            if not instance.term_report:
                PrimaryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report
            term_report.calculate_metrics()
            term_report.calculate_class_position()
    except Exception as e:
        logger.error(
            f"❌ Error auto-generating primary term report: {e}", exc_info=True
        )


@receiver(post_delete, sender=PrimaryResult)
def handle_primary_result_delete(sender, instance, **kwargs):
    try:
        PrimaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        if instance.term_report:
            instance.term_report.calculate_metrics()
            PrimaryTermReport.bulk_recalculate_positions(
                instance.exam_session,
                instance.student.student_class,
                instance.student.education_level,
            )
    except Exception as e:
        logger.error(f"Error handling Primary result deletion: {e}")


@receiver(post_save, sender=NurseryResult)
def handle_nursery_result_save(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        NurseryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        NurseryTermReport.bulk_recalculate_positions(
            instance.exam_session,
            instance.student.student_class,
            instance.student.education_level,
        )
    except Exception as e:
        logger.error(f"Error in Nursery bulk recalculation: {e}")


@receiver(post_save, sender=NurseryResult)
def auto_generate_nursery_term_report(sender, instance, created, **kwargs):
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return
    try:
        with transaction.atomic():
            from academics.models import Term

            next_term_begins = None
            if hasattr(instance.exam_session, "academic_session"):
                current_term = instance.exam_session.term
                current_session = instance.exam_session.academic_session
                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)
                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()
                        if next_term:
                            next_term_begins = next_term.next_term_begins
            (
                term_report,
                report_created,
            ) = NurseryTermReport.objects.select_for_update().get_or_create(
                student=instance.student,
                exam_session=instance.exam_session,
                defaults={"status": "DRAFT", "next_term_begins": next_term_begins},
            )
            if not instance.term_report:
                NurseryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report
            term_report.calculate_metrics()
            term_report.calculate_class_position()
    except Exception as e:
        logger.error(
            f"❌ Error auto-generating nursery term report: {e}", exc_info=True
        )


@receiver(post_delete, sender=NurseryResult)
def handle_nursery_result_delete(sender, instance, **kwargs):
    try:
        NurseryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )
        if instance.term_report:
            instance.term_report.calculate_metrics()
            NurseryTermReport.bulk_recalculate_positions(
                instance.exam_session,
                instance.student.student_class,
                instance.student.education_level,
            )
    except Exception as e:
        logger.error(f"Error handling Nursery result deletion: {e}")
