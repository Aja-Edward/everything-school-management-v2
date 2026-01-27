# results/models.py
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

from students.models import Student, CLASS_CHOICES, EDUCATION_LEVEL_CHOICES
from classroom.models import Stream
from tenants.models import TenantMixin


# Initialize logger
logger = logging.getLogger(__name__)


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

    def get_grade(self, percentage):
        if percentage is None:
            return None

        try:
            grade_objects = self.grades.all().order_by("-min_score")

            if not grade_objects.exists():
                logger.warning(f"⚠️ No grades defined for grading system: {self.name}")
                return None

            # ✅ FIX: Check both min_score AND max_score
            for grade_obj in grade_objects:
                if grade_obj.min_score <= percentage <= grade_obj.max_score:
                    return grade_obj.grade

            # If no exact match, return the lowest grade
            lowest_grade = grade_objects.last()
            return lowest_grade.grade if lowest_grade else None

        except Exception as e:
            logger.error(f"Error getting grade for {self.name}: {str(e)}")
            return None


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


class ScoringConfiguration(TenantMixin, models.Model):
    """Configuration for scoring systems across different education levels"""

    EDUCATION_LEVEL_CHOICES = [
        ("NURSERY", "Nursery"),
        ("PRIMARY", "Primary"),
        ("JUNIOR_SECONDARY", "Junior Secondary"),
        ("SENIOR_SECONDARY", "Senior Secondary"),
    ]

    RESULT_TYPE_CHOICES = [
        ("TERMLY", "Termly Result"),
        ("SESSION", "Session Result"),
    ]

    id = models.AutoField(primary_key=True)
    education_level = models.CharField(
        max_length=20, choices=EDUCATION_LEVEL_CHOICES, verbose_name="Education Level"
    )
    result_type = models.CharField(
        max_length=20, choices=RESULT_TYPE_CHOICES, verbose_name="Result Type"
    )
    name = models.CharField(max_length=100, verbose_name="Configuration Name")
    description = models.TextField(blank=True, verbose_name="Description")

    # Test/Assessment configurations
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

    # CA components for Junior Secondary and Primary
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

    # Exam configuration
    exam_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=70,
        validators=[MinValueValidator(0)],
        verbose_name="Exam Max Score",
    )

    # Weight percentages
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

    # Total configuration
    total_max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0)],
        verbose_name="Total Max Score",
    )

    # Status
    is_active = models.BooleanField(default=True, verbose_name="Active")
    is_default = models.BooleanField(
        default=False, verbose_name="Default Configuration"
    )

    # Tracking
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
        ordering = ["education_level", "result_type", "name"]
        indexes = [
            models.Index(fields=["tenant", "education_level", "result_type"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "is_default"]),
        ]
        verbose_name = "Scoring Configuration"
        verbose_name_plural = "Scoring Configurations"

    def __str__(self):
        return f"{self.get_education_level_display()} - {self.get_result_type_display()} - {self.name}"

    def clean(self):
        """Validate scoring configuration based on result type"""
        if self.result_type == "TERMLY" and self.education_level != "NURSERY":
            if self.ca_weight_percentage + self.exam_weight_percentage != 100:
                raise ValidationError("CA and Exam weight percentages must sum to 100%")

            if self.education_level in ["JUNIOR_SECONDARY", "PRIMARY"]:
                expected_total = (
                    self.continuous_assessment_max_score
                    + self.take_home_test_max_score
                    + self.appearance_max_score
                    + self.practical_max_score
                    + self.project_max_score
                    + self.note_copying_max_score
                    + self.exam_max_score
                )
            elif self.education_level == "SENIOR_SECONDARY":
                expected_total = (
                    self.test1_max_score
                    + self.test2_max_score
                    + self.test3_max_score
                    + self.exam_max_score
                )
            elif self.education_level == "NURSERY":
                expected_total = self.total_max_score

            if expected_total != self.total_max_score:
                raise ValidationError(
                    f"Total max score must equal sum of components ({expected_total})"
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def ca_total_max_score(self):
        """Calculate total CA max score based on education level"""
        if self.education_level in ["JUNIOR_SECONDARY", "PRIMARY"]:
            return (
                self.continuous_assessment_max_score
                + self.take_home_test_max_score
                + self.appearance_max_score
                + self.practical_max_score
                + self.project_max_score
                + self.note_copying_max_score
            )
        else:
            return self.test1_max_score + self.test2_max_score + self.test3_max_score


class AssessmentType(TenantMixin, models.Model):
    """Types of assessments (Continuous Assessment, Exam, etc.)"""

    EDUCATION_LEVEL_CHOICES = [
        ("NURSERY", "Nursery"),
        ("PRIMARY", "Primary"),
        ("JUNIOR_SECONDARY", "Junior Secondary"),
        ("SENIOR_SECONDARY", "Senior Secondary"),
        ("ALL", "All Levels"),
    ]

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10)
    description = models.TextField(blank=True)
    education_level = models.CharField(
        max_length=20,
        choices=EDUCATION_LEVEL_CHOICES,
        default="ALL",
        help_text="Education level this assessment type applies to",
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
        ]

    def __str__(self):
        return f"{self.name} ({self.weight_percentage}%)"


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
    # Stream support for Senior Secondary
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_results",
        help_text="Stream for Senior Secondary results (Science, Arts, Commercial, Technical)",
    )

    # Score breakdown
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
        max_digits=5, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )

    # Grade information
    grade = models.CharField(max_length=5, blank=True)
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )

    # Status and metadata
    status = models.CharField(max_length=20, choices=RESULT_STATUS, default="DRAFT")
    is_passed = models.BooleanField(default=False)
    position = models.PositiveIntegerField(null=True, blank=True)
    remarks = models.TextField(blank=True)

    # Tracking - FIXED: Using settings.AUTH_USER_MODEL instead of "auth.User"
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
        # Calculate total score and percentage
        self.calculate_scores()
        # Determine grade
        self.determine_grade()
        super().save(*args, **kwargs)

    def calculate_scores(self):
        """Calculate total score and percentage"""
        ca = Decimal(self.ca_score or 0)
        exam = Decimal(self.exam_score or 0)
        self.total_score = ca + exam

        # Safely get max_score from grading system
        max_score = Decimal(getattr(self.grading_system, "max_score", 0) or 0)

        # Calculate percentage if max_score > 0
        self.percentage = (
            (self.total_score / max_score * 100) if max_score > 0 else Decimal(0)
        )

    def determine_grade(self):
        """Determine grade based on total score and grading system"""

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
            # if grade_point is present, use it; else None
            self.grade_point = grade_obj.grade_point
            self.is_passed = bool(grade_obj.is_passing)
            return

        # Fallback: direct score matching

        if gs.grading_type == "POINTS":
            # attempt to find an approximate grade by scaling total_score
            try:
                max_gp = gs.grades.aggregate(Max("grade_point"))["grade_point__max"]
                max_gp = float(max_gp) if max_gp is not None else None
            except Exception:
                max_gp = None

            if max_gp and float(gs.max_score or 0) > 0:
                point_score = (float(self.total_score) / float(gs.max_score)) * max_gp
                # find the grade with nearest grade_point where grade_point <= point_score (descending)
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


# ===================================
# BASE TERM REPORT
# ====================================


class BaseTermReport(models.Model):
    """
    Abstract base for all term report models.
    Contains ONLY workflow + permission logic.
    """

    def first_signatory_role(self):
        student = getattr(self, "student", None)
        if not student:
            return None

        if student.education_level in ["NURSERY", "PRIMARY"]:
            return "CLASS_TEACHER"

        return "SUBJECT_TEACHER"

    def can_edit_teacher_remark(self, user):
        import logging
        from teacher.models import Teacher
        from classroom.models import StudentEnrollment, ClassroomTeacherAssignment

        logger = logging.getLogger(__name__)

        # Check user role
        if not hasattr(user, "role"):
            logger.error(f"❌ User {user.username} has no 'role' attribute")
            return False

        if user.role != "TEACHER":
            logger.info(f"❌ User {user.username} is not a teacher (role: {user.role})")
            return False

        try:
            teacher = Teacher.objects.get(user=user)
            student = self.student

            # Get the student's classroom
            student_enrollment = (
                StudentEnrollment.objects.filter(student=student, is_active=True)
                .select_related("classroom")
                .first()
            )

            if not student_enrollment:
                logger.warning(
                    f"⚠️ No active enrollment found for student {student.full_name}"
                )
                return False

            student_classroom = student_enrollment.classroom

            # Determine the role based on education level
            role = self.first_signatory_role()

            logger.info(f"🔍 Checking permission for {teacher.user.get_full_name()}")
            logger.info(f"📚 Education level: {student.education_level}")
            logger.info(f"👤 Required role: {role}")
            logger.info(f"🏫 Student classroom: {student_classroom.name}")

            # For NURSERY and PRIMARY: Must be the class teacher
            if role == "CLASS_TEACHER":
                is_class_teacher = student_classroom.class_teacher == teacher
                logger.info(f"✓ Is class teacher? {is_class_teacher}")
                return is_class_teacher

            # For JUNIOR_SECONDARY and SENIOR_SECONDARY: Must teach ANY subject to this class
            if role == "SUBJECT_TEACHER":
                # Check if teacher teaches ANY subject to this classroom
                teaches_this_classroom = ClassroomTeacherAssignment.objects.filter(
                    teacher=teacher, classroom=student_classroom
                ).exists()

                logger.info(f"✓ Teaches this classroom? {teaches_this_classroom}")

                if teaches_this_classroom:
                    # Get the subjects this teacher teaches in this classroom
                    assignments = ClassroomTeacherAssignment.objects.filter(
                        teacher=teacher, classroom=student_classroom
                    ).select_related("subject")

                    subjects = [a.subject.name for a in assignments]
                    logger.info(f"✓ Teaches subjects: {', '.join(subjects)}")

                return teaches_this_classroom

            return False

        except Teacher.DoesNotExist:
            logger.error(f"❌ Teacher object not found for user {user.username}")
            return False
        except Exception as e:
            logger.error(
                f"❌ Error checking teacher remark permission: {e}", exc_info=True
            )
            import traceback

            logger.error(traceback.format_exc())
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

            # these fields already exist on concrete models
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

    total_score = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        verbose_name="Total Score Across All Subjects",
    )
    average_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Average Score Percentage",
    )
    overall_grade = models.CharField(
        max_length=5, blank=True, verbose_name="Overall Grade"
    )

    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(
        default=0, verbose_name="Total Students in Class"
    )

    times_opened = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times School Opened"
    )
    times_present = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times Student was Present"
    )

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

    class_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Class Teacher Signature URL"
    )
    class_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Class Teacher Signature Date"
    )

    head_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Head Teacher Signature URL"
    )
    head_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Head Teacher Signature Date"
    )
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
        """
        goodIMPROVED: Efficient metric calculation with single query
        """
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
        """
        goodNEW: Bulk position recalculation
        """
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
        """Fallback grading system"""
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

    def calculate_class_position(self):
        """Calculate class position among peers"""
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
        """Sync term report status with individual subject results"""
        if self.status in ["APPROVED", "PUBLISHED"]:
            return

        subject_results = self.subject_results.all()

        if not subject_results.exists():
            self.status = "DRAFT"
            self.save()
            return

        statuses = subject_results.values_list("status", flat=True)

        if "DRAFT" in statuses:
            self.status = "DRAFT"
        else:
            self.status = "SUBMITTED"

        self.save()

    def _get_grade_for_percentage(self, percentage):
        """
        goodNEW: Get grade for a given percentage
        Uses grading system if available, otherwise fallback to default
        """
        try:
            # Try to get grading system from first subject result
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

        # Fallback to default grading
        return self._get_default_grade(percentage)


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
        help_text="Stream for Senior Secondary results (Science, Arts, Commercial, Technical)",
    )

    term_report = models.ForeignKey(
        "result.SeniorSecondaryTermReport",
        on_delete=models.CASCADE,
        related_name="subject_results",
        null=True,
        blank=True,
        help_text="Link to consolidated term report",
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

    total_ca_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Total CA Score (30 marks)",
    )
    total_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Total Score (100 marks)",
    )
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        db_index=True,
    )

    # Grade information
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
    subject_position = models.PositiveIntegerField(
        null=True, blank=True, db_index=True, verbose_name="Position in Subject"
    )

    teacher_remark = models.TextField(blank=True, verbose_name="Teacher's Remark")
    class_teacher_remark = models.TextField(
        blank=True, verbose_name="Class Teacher's Remark"
    )
    head_teacher_remark = models.TextField(
        blank=True, verbose_name="Head Teacher's Remark"
    )

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
        """
        goodIMPROVED: Use skip_recalculation flag to prevent recursive saves
        """
        skip_recalculation = kwargs.pop("skip_recalculation", False)

        # Always calculate scores before saving
        self.calculate_scores()
        self.determine_grade()

        # Only calculate class statistics if not skipping
        if not skip_recalculation:
            self.calculate_class_statistics()

        super().save(*args, **kwargs)

        # Update term report ONLY if not skipping and status is appropriate
        if not skip_recalculation and self.status in ["APPROVED", "PUBLISHED"]:
            self.update_term_report()

    def calculate_scores(self):
        """Calculate total CA score, total score, and percentage"""
        self.total_ca_score = (
            self.first_test_score + self.second_test_score + self.third_test_score
        )

        self.total_score = self.total_ca_score + self.exam_score

        if self.grading_system.max_score > 0:
            self.percentage = (self.total_score / self.grading_system.max_score) * 100
        else:
            self.percentage = 0

    def determine_grade(self):
        """Determine grade based on grading system"""
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
        """
        goodIMPROVED: Calculate ONLY this student's position without recalculating others
        Cache class statistics to avoid repeated queries
        """
        cache_key = f"class_stats_{self.subject.id}_{self.exam_session.id}_{self.student.student_class}"
        cached_stats = cache.get(cache_key)

        if cached_stats:
            self.class_average = cached_stats["avg"]
            self.highest_in_class = cached_stats["highest"]
            self.lowest_in_class = cached_stats["lowest"]
        else:
            # Calculate and cache statistics
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

            # Cache for 5 minutes
            cache.set(cache_key, stats, 300)

        # Calculate position
        self._calculate_position()

    def _calculate_position(self):
        """Calculate subject position efficiently"""
        higher_count = self.__class__.objects.filter(
            subject=self.subject,
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            status__in=["APPROVED", "PUBLISHED"],
            total_score__gt=self.total_score,
        ).count()

        self.subject_position = higher_count + 1

    def update_term_report(self):
        """
        goodIMPROVED: Update term report without triggering cascade saves
        """
        with transaction.atomic():
            (
                term_report,
                created,
            ) = SeniorSecondaryTermReport.objects.select_for_update().get_or_create(
                student=self.student,
                exam_session=self.exam_session,
                defaults={"status": "DRAFT"},
            )

            # Link this result to the term report using update (no save signal)
            if not self.term_report:
                self.__class__.objects.filter(id=self.id).update(
                    term_report=term_report
                )
                self.term_report = term_report

            # Recalculate term report metrics
            term_report.calculate_metrics()
            term_report.sync_status_with_subjects()

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        """
        goodNEW: Efficient bulk recalculation method
        Use this for batch operations instead of individual saves
        """
        with transaction.atomic():
            # Get all results
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

            # Calculate class statistics once
            stats = results.aggregate(
                avg=Avg("total_score"),
                highest=Max("total_score"),
                lowest=Min("total_score"),
            )

            # Update all results in bulk
            updates = []
            for position, result in enumerate(results, start=1):
                result.subject_position = position
                result.class_average = stats["avg"] or 0
                result.highest_in_class = stats["highest"] or 0
                result.lowest_in_class = stats["lowest"] or 0
                updates.append(result)

            # Bulk update without triggering signals
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

            # Clear cache
            cache_key = f"class_stats_{subject.id}_{exam_session.id}_{student_class}"
            cache.delete(cache_key)

    @property
    def position_formatted(self):
        """Format position with ordinal suffix"""
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

    term1_total = models.DecimalField(
        max_digits=8, decimal_places=2, default=0, verbose_name="First Term Total Score"
    )
    term2_total = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        verbose_name="Second Term Total Score",
    )
    term3_total = models.DecimalField(
        max_digits=8, decimal_places=2, default=0, verbose_name="Third Term Total Score"
    )

    taa_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Total Annual Average"
    )
    average_for_year = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Average for the Year"
    )
    obtainable = models.DecimalField(
        max_digits=8, decimal_places=2, default=0, verbose_name="Total Obtainable Marks"
    )
    obtained = models.DecimalField(
        max_digits=8, decimal_places=2, default=0, verbose_name="Total Obtained Marks"
    )
    overall_grade = models.CharField(
        max_length=5, blank=True, verbose_name="Overall Grade for Session"
    )

    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(
        default=0, verbose_name="Total Students in Class"
    )

    teacher_remark = models.TextField(blank=True, verbose_name="Form Master's Remark")
    head_teacher_remark = models.TextField(
        blank=True, verbose_name="Principal's Remark"
    )
    class_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Class Teacher Signature URL"
    )
    class_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Class Teacher Signature Date"
    )

    head_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Head Teacher Signature URL"
    )
    head_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Head Teacher Signature Date"
    )

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

    def calculate_session_metrics(self):
        """Calculate session metrics from individual subject session results"""
        from django.db.models import Sum, Count, Avg

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
        """Calculate individual term totals from term reports"""
        try:
            first_term_session = ExamSession.objects.filter(
                academic_session=self.academic_session, term="FIRST"
            ).first()
            second_term_session = ExamSession.objects.filter(
                academic_session=self.academic_session, term="SECOND"
            ).first()
            third_term_session = ExamSession.objects.filter(
                academic_session=self.academic_session, term="THIRD"
            ).first()

            if first_term_session:
                first_term_report = SeniorSecondaryTermReport.objects.filter(
                    student=self.student, exam_session=first_term_session
                ).first()
                if first_term_report:
                    self.term1_total = first_term_report.total_score

            if second_term_session:
                second_term_report = SeniorSecondaryTermReport.objects.filter(
                    student=self.student, exam_session=second_term_session
                ).first()
                if second_term_report:
                    self.term2_total = second_term_report.total_score

            if third_term_session:
                third_term_report = SeniorSecondaryTermReport.objects.filter(
                    student=self.student, exam_session=third_term_session
                ).first()
                if third_term_report:
                    self.term3_total = third_term_report.total_score

        except Exception as e:
            logger.error(f"Error calculating term totals: {e}")

    def _get_default_grade(self, percentage):
        """Fallback grading system"""
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

    def calculate_class_position(self):
        """Calculate class position for session results"""
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
        help_text="Link to consolidated session report",
    )

    first_term_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="1st Term Total Score"
    )
    second_term_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="2nd Term Total Score"
    )
    third_term_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="3rd Term Total Score"
    )

    average_for_year = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Average for the Year"
    )
    obtainable = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=300,
        verbose_name="Total Obtainable (300 marks)",
    )
    obtained = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Total Obtained"
    )

    class_average = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Class Average"
    )
    highest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Highest Score in Class"
    )
    lowest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Lowest Score in Class"
    )
    subject_position = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="Position in Subject"
    )

    teacher_remark = models.TextField(blank=True, verbose_name="Teacher's Remark")
    class_teacher_remark = models.TextField(
        blank=True, verbose_name="Class Teacher's Remark"
    )
    head_teacher_remark = models.TextField(
        blank=True, verbose_name="Head Teacher's Remark"
    )

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
        """Calculate Termly Accumulative Average"""
        self.obtained = (
            self.first_term_score + self.second_term_score + self.third_term_score
        )

        if self.obtainable > 0:
            self.average_for_year = (self.obtained / self.obtainable) * 100
        else:
            self.average_for_year = 0

    def calculate_class_statistics(self):
        """Calculate class statistics for this subject session result"""
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
        """Update or create the consolidated session report"""
        # Always update session report, even for DRAFT status
        # Get or create the session report
        session_report, created = SeniorSecondarySessionReport.objects.get_or_create(
            student=self.student,
            academic_session=self.academic_session,
            defaults={"status": "DRAFT"},
        )

        # Link this result to the session report (avoid recursive calls)
        if not self.session_report:
            self.__class__.objects.filter(id=self.id).update(
                session_report=session_report.id
            )

        # Recalculate session report metrics
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
            suffix = (
                "st"
                if self.subject_position == 1
                else (
                    "nd"
                    if self.subject_position == 2
                    else "rd" if self.subject_position == 3 else "th"
                )
            )
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

    total_score = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        verbose_name="Total Score Across All Subjects",
    )
    average_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Average Score Percentage",
    )
    overall_grade = models.CharField(
        max_length=5, blank=True, verbose_name="Overall Grade"
    )

    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(
        default=0, verbose_name="Total Students in Class"
    )

    times_opened = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times School Opened"
    )
    times_present = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times Student was Present"
    )

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
    class_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Class Teacher Signature URL"
    )
    class_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Class Teacher Signature Date"
    )

    head_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Head Teacher Signature URL"
    )
    head_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Head Teacher Signature Date"
    )

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

    def calculate_metrics(self):
        """Calculate consolidated metrics from individual subject results"""
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

                if grade_obj:
                    self.overall_grade = grade_obj.grade
                else:
                    self.overall_grade = self._get_default_grade(self.average_score)
            else:
                self.overall_grade = self._get_default_grade(self.average_score)

        self.save()

    def _get_default_grade(self, percentage):
        """Fallback grading system if no grading system is available"""
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

    def calculate_class_position(self):
        """Calculate class position among peers"""
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
        """Sync term report status with individual subject results"""
        if self.status in ["APPROVED", "PUBLISHED"]:
            return

        subject_results = self.subject_results.all()

        if not subject_results.exists():
            self.status = "DRAFT"
            self.save()
            return

        statuses = subject_results.values_list("status", flat=True)

        if "DRAFT" in statuses:
            self.status = "DRAFT"
        else:
            self.status = "SUBMITTED"

        self.save()

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        """Bulk position recalculation"""
        from django.db import transaction

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
        help_text="Link to consolidated term report",
    )
    # CA Components
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

    ca_total = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="C.A Total (35 marks)"
    )
    total_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Total (100 marks)"
    )

    ca_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Continuous Assessment (%)",
    )
    exam_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Examination (%)",
    )
    total_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Total (%)",
        db_index=True,
    )
    # Grade information
    grade = models.CharField(max_length=5, blank=True, db_index=True)  # goodADD INDEX
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    is_passed = models.BooleanField(default=False, db_index=True)  # goodADD INDEX

    class_average = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    highest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    lowest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, default=0
    )
    subject_position = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="Subject Position", db_index=True
    )

    previous_term_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Previous Term Score"
    )
    cumulative_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Cumulative Score"
    )

    teacher_remark = models.TextField(blank=True, verbose_name="Teacher's Remark")
    class_teacher_remark = models.TextField(
        blank=True, verbose_name="Class Teacher's Remark"
    )
    head_teacher_remark = models.TextField(
        blank=True, verbose_name="Head Teacher's Remark"
    )

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
                fields=["tenant", "exam_session", "subject", "status", "-total_percentage"]
            ),
            models.Index(fields=["tenant", "student", "status", "-total_percentage"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        """goodIMPROVED: Use skip_recalculation flag"""
        skip_recalculation = kwargs.pop("skip_recalculation", False)

        # Always calculate scores
        self.calculate_scores()
        self.determine_grade()

        # Only calculate class statistics if not skipping
        if not skip_recalculation:
            self.calculate_class_statistics()

        super().save(*args, **kwargs)

        # Update term report ONLY if not skipping and status is appropriate
        if not skip_recalculation and self.status in ["APPROVED", "PUBLISHED"]:
            self.update_term_report()

    def calculate_scores(self):
        """Calculate CA total, total score, and percentages"""
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
        """Determine grade based on grading system"""
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
        """goodIMPROVED: Cached class statistics"""
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

            cache.set(cache_key, stats, 300)  # Cache 5 minutes

        self._calculate_position()

    def _calculate_position(self):
        """Calculate subject position efficiently"""
        higher_count = self.__class__.objects.filter(
            subject=self.subject,
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            status__in=["APPROVED", "PUBLISHED"],
            total_percentage__gt=self.total_percentage,
        ).count()

        self.subject_position = higher_count + 1

    def update_term_report(self):
        """goodIMPROVED: Update term report without cascade"""
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
        """goodNEW: Efficient bulk recalculation"""
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
        """Format position with ordinal suffix"""
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

    total_score = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        verbose_name="Total Score Across All Subjects",
    )
    average_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Average Score Percentage",
    )
    overall_grade = models.CharField(
        max_length=5, blank=True, verbose_name="Overall Grade"
    )

    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students = models.PositiveIntegerField(
        default=0, verbose_name="Total Students in Class"
    )

    times_opened = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times School Opened"
    )
    times_present = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times Student was Present"
    )

    next_term_begins = models.DateField(null=True, blank=True)

    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)
    class_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Class Teacher Signature URL"
    )
    class_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Class Teacher Signature Date"
    )

    head_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Head Teacher Signature URL"
    )
    head_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Head Teacher Signature Date"
    )

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

    def calculate_metrics(self):
        """Calculate consolidated metrics from individual subject results"""
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

                if grade_obj:
                    self.overall_grade = grade_obj.grade
                else:
                    self.overall_grade = self._get_default_grade(self.average_score)
            else:
                self.overall_grade = self._get_default_grade(self.average_score)

        self.save()

    def _get_default_grade(self, percentage):
        """Fallback grading system if no grading system is available"""
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

    def calculate_class_position(self):
        """Calculate class position among peers"""
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
        """Sync term report status with individual subject results"""
        if self.status in ["APPROVED", "PUBLISHED"]:
            return

        subject_results = self.subject_results.all()

        if not subject_results.exists():
            self.status = "DRAFT"
            self.save()
            return

        statuses = subject_results.values_list("status", flat=True)

        if "DRAFT" in statuses:
            self.status = "DRAFT"
        else:
            self.status = "SUBMITTED"

        self.save()

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        """goodNEW: Bulk position recalculation"""
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
        help_text="Link to consolidated term report",
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

    ca_total = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="C.A Total (35 marks)"
    )
    total_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Total (100 marks)"
    )

    ca_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Continuous Assessment (%)",
    )
    exam_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Examination (%)",
    )
    total_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Total (%)",
        db_index=True,
    )

    grade = models.CharField(max_length=5, blank=True, db_index=True)  # goodADD INDEX
    grade_point = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True
    )
    is_passed = models.BooleanField(default=False, db_index=True)  # goodADD INDEX

    # Class statistics
    class_average = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    highest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )
    lowest_in_class = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, null=True, blank=True
    )

    subject_position = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="Subject Position", db_index=True
    )

    previous_term_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Previous Term Score"
    )
    cumulative_score = models.DecimalField(
        max_digits=5, decimal_places=2, default=0, verbose_name="Cumulative Score"
    )

    teacher_remark = models.TextField(blank=True, verbose_name="Teacher's Remark")
    class_teacher_remark = models.TextField(
        blank=True, verbose_name="Class Teacher's Remark"
    )
    head_teacher_remark = models.TextField(
        blank=True, verbose_name="Head Teacher's Remark"
    )

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
                fields=["tenant", "exam_session", "subject", "status", "-total_percentage"]
            ),
            models.Index(fields=["tenant", "student", "status", "-total_percentage"]),
            models.Index(fields=["tenant", "grade"]),
            models.Index(fields=["tenant", "is_passed"]),
            models.Index(fields=["tenant", "subject_position"]),
        ]

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} ({self.total_score})"

    def save(self, *args, **kwargs):
        """goodIMPROVED: Same pattern as Junior"""
        skip_recalculation = kwargs.pop("skip_recalculation", False)

        self.calculate_scores()
        self.determine_grade()

        if not skip_recalculation:
            self.calculate_class_statistics()

        super().save(*args, **kwargs)

        if not skip_recalculation and self.status in ["APPROVED", "PUBLISHED"]:
            self.update_term_report()

    def calculate_scores(self):
        """Calculate CA total, total score, and percentages"""
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
        """Determine grade based on grading system"""
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
        """Format position with ordinal suffix"""
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
    total_max_marks = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=0,
        verbose_name="Total Maximum Marks Obtainable",
    )
    total_marks_obtained = models.DecimalField(
        max_digits=8, decimal_places=2, default=0, verbose_name="Total Marks Obtained"
    )
    overall_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Overall Percentage",
    )

    class_position = models.PositiveIntegerField(null=True, blank=True)
    total_students_in_class = models.PositiveIntegerField(default=0)

    times_school_opened = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times School Opened"
    )
    times_student_present = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times Student was Present"
    )

    physical_development = models.CharField(
        max_length=20,
        choices=PHYSICAL_DEVELOPMENT_CHOICES,
        blank=True,
        verbose_name="Physical Development",
    )
    health = models.CharField(
        max_length=20,
        choices=PHYSICAL_DEVELOPMENT_CHOICES,
        blank=True,
        verbose_name="Health",
    )
    cleanliness = models.CharField(
        max_length=20,
        choices=PHYSICAL_DEVELOPMENT_CHOICES,
        blank=True,
        verbose_name="Cleanliness",
    )
    general_conduct = models.CharField(
        max_length=20,
        choices=PHYSICAL_DEVELOPMENT_CHOICES,
        blank=True,
        verbose_name="General Conduct",
    )
    physical_development_comment = models.TextField(
        blank=True, verbose_name="Physical Development Comment"
    )

    height_beginning = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Height at Beginning (cm)",
    )
    height_end = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Height at End (cm)",
    )
    weight_beginning = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Weight at Beginning (kg)",
    )
    weight_end = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Weight at End (kg)",
    )

    next_term_begins = models.DateField(null=True, blank=True)

    class_teacher_remark = models.TextField(blank=True)
    head_teacher_remark = models.TextField(blank=True)

    class_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Class Teacher Signature URL"
    )
    class_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Class Teacher Signature Date"
    )

    head_teacher_signature = models.URLField(
        blank=True, null=True, verbose_name="Head Teacher Signature URL"
    )
    head_teacher_signed_at = models.DateTimeField(
        blank=True, null=True, verbose_name="Head Teacher Signature Date"
    )

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
        """Save and calculate metrics"""
        skip_recalculation = kwargs.pop("skip_recalculation", False)

        if not skip_recalculation:
            # Calculate metrics first
            self.calculate_metrics()

            # Auto-calculate next term begins if not set
            if not self.next_term_begins:
                self.next_term_begins = self.calculate_next_term_begins()

        # ✅ Save FIRST to get created_at and id
        is_new = self.pk is None
        super().save(*args, **kwargs)

        # ✅ Calculate position AFTER save (when created_at exists)
        if not skip_recalculation and self.overall_percentage is not None:
            self.calculate_class_position()
            # Save again only if position was calculated
            if self.class_position is not None:
                super().save(
                    update_fields=["class_position", "total_students_in_class"]
                )

    def calculate_next_term_begins(self):
        """Calculate next term begin date from academic calendar"""
        try:
            from academics.models import Term  # Adjust import path

            current_exam_session = self.exam_session
            if not current_exam_session:
                return None

            # Get current term from exam session
            current_term = current_exam_session.term  # or however you access the term

            if not current_term:
                return None

            # Get academic session
            academic_session = current_term.academic_session

            # Get all terms in the same session, ordered
            terms = Term.objects.filter(academic_session=academic_session).order_by(
                "start_date"
            )

            # Find next term
            term_list = list(terms)
            try:
                current_index = term_list.index(current_term)
                if current_index < len(term_list) - 1:
                    # There's a next term in same session
                    next_term = term_list[current_index + 1]
                    return next_term.start_date
                else:
                    # This is the last term, get first term of next session
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

            # Fallback: Add reasonable days to current term end
            if current_term.end_date:
                return current_term.end_date + timedelta(days=14)  # 2 weeks vacation

            return None

        except Exception as e:
            logger.error(f"Error calculating next term begins: {e}")
            return None

    def calculate_metrics(self):
        """Calculate consolidated metrics from individual subject results"""
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

    # In models.py - NurseryTermReport

    def calculate_class_position(self):
        """Calculate class position among peers"""

        # ✅ FIX: Skip if overall_percentage or created_at is None
        if self.overall_percentage is None:
            logger.warning(
                f"⚠️ overall_percentage is None for report {self.id}, skipping position calculation"
            )
            self.class_position = None
            self.total_students_in_class = 0
            return

        if self.created_at is None:
            logger.warning(
                f"⚠️ created_at is None for report {self.id}, skipping position calculation"
            )
            self.class_position = None
            self.total_students_in_class = 0
            return

        # Get all reports for same class and exam session
        same_class_reports = NurseryTermReport.objects.filter(
            exam_session=self.exam_session,
            student__student_class=self.student.student_class,
            student__education_level=self.student.education_level,
            status__in=["APPROVED", "PUBLISHED"],  # Only count published results
        ).exclude(id=self.id)

        # ✅ FIX: Exclude reports with None overall_percentage
        same_class_reports = same_class_reports.exclude(overall_percentage__isnull=True)

        if same_class_reports.exists():
            # Count students with higher percentage
            higher_performers = same_class_reports.filter(
                overall_percentage__gt=self.overall_percentage
            ).count()

            # Count students with same percentage but created earlier (tie-breaker)
            same_performers_earlier = same_class_reports.filter(
                overall_percentage=self.overall_percentage,
                created_at__lt=self.created_at,
            ).count()

            self.class_position = higher_performers + same_performers_earlier + 1
            self.total_students_in_class = (
                same_class_reports.count() + 1
            )  # +1 for current student

            logger.info(
                f"✅ Position calculated: {self.class_position}/{self.total_students_in_class}"
            )
        else:
            # This is the only student
            self.class_position = 1
            self.total_students_in_class = 1
            logger.info(f"⚠️ Only student in class")

    # IMPORTANT: Make sure this is called when subject results are saved
    def update_from_subject_results(self):
        """Called when subject results change"""
        self.calculate_metrics()
        self.calculate_class_position()
        self.save(skip_recalculation=True)

    def sync_status_with_subjects(self):
        """Sync term report status with individual subject results"""
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

        if "DRAFT" in statuses:
            self.status = "DRAFT"
        else:
            self.status = "SUBMITTED"

        self.save()

    @classmethod
    def bulk_recalculate_positions(cls, exam_session, student_class, education_level):
        """Bulk position recalculation for entire class"""
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
        help_text="Link to consolidated term report",
    )

    max_marks_obtainable = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Max Marks Obtainable",
    )
    mark_obtained = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name="Mark Obtained",
    )
    subject_position = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="Position in Subject"
    )
    academic_comment = models.TextField(blank=True, verbose_name="Academic Comment")

    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Percentage",
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
        """
        Alias for percentage to maintain consistency with other result types.
        For Nursery, we use percentage as the total_score for term reports.
        """
        return self.percentage

    def save(self, *args, **kwargs):
        # Calculate percentage first
        if self.mark_obtained is not None and self.max_marks_obtainable > 0:
            self.percentage = (self.mark_obtained / self.max_marks_obtainable) * 100
        else:
            self.percentage = 0

        # ✅ FIX: Better grade determination with fallback
        if self.percentage is not None and self.grading_system:
            try:
                # Try to get grade from grading system
                calculated_grade = self.grading_system.get_grade(self.percentage)

                if calculated_grade:
                    self.grade = calculated_grade
                else:
                    # Fallback to default grading if no grade found
                    self.grade = self._get_default_grade(self.percentage)

                self.is_passed = self.percentage >= float(
                    self.grading_system.pass_mark or 40
                )

            except Exception as e:
                logger.error(f"Error determining grade: {e}")
                # Fallback to default grading
                self.grade = self._get_default_grade(self.percentage)
                self.is_passed = self.percentage >= 40

        # Save first to get created_at timestamp
        is_new = self.pk is None
        super().save(*args, **kwargs)

        # Calculate position AFTER save
        if self.percentage is not None and not is_new:
            self.calculate_subject_position()
            if self.subject_position is not None:
                super().save(update_fields=["subject_position"])

    def _get_default_grade(self, percentage):
        """Fallback grading system"""
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

    def update_term_report(self):
        """Update or create the consolidated term report"""
        term_report, created = NurseryTermReport.objects.get_or_create(
            student=self.student,
            exam_session=self.exam_session,
            defaults={"status": "DRAFT"},
        )

        if not self.term_report:
            self.__class__.objects.filter(id=self.id).update(term_report=term_report.id)

        # CRITICAL: Always recalculate when subject results change
        term_report.calculate_metrics()
        term_report.calculate_class_position()
        term_report.save(
            skip_recalculation=True
        )  # Skip recalc in save since we just did it

    def calculate_percentage(self):
        """Calculate percentage based on marks obtained and max marks"""
        if self.max_marks_obtainable > 0:
            self.percentage = (self.mark_obtained / self.max_marks_obtainable) * 100
        else:
            self.percentage = 0

    def determine_grade(self):
        """Determine grade based on grading system"""
        try:
            grade_obj = self.grading_system.grades.filter(
                min_score__lte=self.percentage, max_score__gte=self.percentage
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

    def calculate_subject_position(self):
        """Calculate the student's position in the subject for this exam session"""

        # ✅ FIX: Skip calculation if percentage is not yet calculated
        if self.percentage is None:
            logger.warning(
                f"⚠️ Percentage is None for result {self.id}, skipping position calculation"
            )
            self.subject_position = None
            return

        # ✅ FIX: Skip calculation if created_at is None (new unsaved instance)
        if self.created_at is None:
            logger.warning(
                f"⚠️ created_at is None for result {self.id}, skipping position calculation"
            )
            self.subject_position = None
            return

        # Get all results for the same subject, exam session, and education level
        class_results = NurseryResult.objects.filter(
            subject=self.subject,
            exam_session=self.exam_session,
            student__education_level="NURSERY",
        ).exclude(pk=self.pk)

        # ✅ FIX: Exclude results with None percentage
        class_results = class_results.exclude(percentage__isnull=True)

        # Count how many students scored higher
        higher_scores = class_results.filter(percentage__gt=self.percentage).count()

        # Count students with same score but created earlier (for consistent tie-breaking)
        same_score_earlier = class_results.filter(
            percentage=self.percentage, created_at__lt=self.created_at
        ).count()

        # Position is: (students with higher scores) + (ties created before this) + 1
        self.subject_position = higher_scores + same_score_earlier + 1

    def update_term_report(self):
        """Update or create the consolidated term report"""
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

    @property
    def position_formatted(self):
        """Format position with ordinal suffix"""
        if not self.subject_position:
            return ""
        suffix_map = {1: "st", 2: "nd", 3: "rd"}
        suffix = suffix_map.get(self.subject_position, "th")
        return f"{self.subject_position}{suffix}"

    @classmethod
    def bulk_recalculate_class(
        cls, exam_session, subject, student_class, education_level
    ):
        """goodNEW: Efficient bulk recalculation for Nursery"""
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

            # Calculate statistics
            stats = results.aggregate(
                avg=Avg("percentage"),
                highest=Max("percentage"),
                lowest=Min("percentage"),
            )

            # Update positions
            updates = []
            for position, result in enumerate(results, start=1):
                result.subject_position = position
                # Note: Nursery doesn't have class_average fields in individual results
                updates.append(result)

            cls.objects.bulk_update(updates, ["subject_position"], batch_size=50)


# ============================================
# ADDITIONAL MODELS (FROM DOCUMENT 2)
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
    student_class = models.CharField(max_length=50, choices=CLASS_CHOICES)
    education_level = models.CharField(max_length=50, choices=EDUCATION_LEVEL_CHOICES)

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
        unique_together = ["tenant", "exam_session", "student_class", "education_level"]
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "exam_session"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"{self.get_student_class_display()} - {self.exam_session.name}"

    def calculate_statistics(self):
        """Calculate class statistics"""
        results = StudentResult.objects.filter(
            exam_session=self.exam_session,
            student__student_class=self.student_class,
            student__education_level=self.education_level,
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
    total_students = models.PositiveIntegerField(
        default=0, verbose_name="Total Students in Class"
    )

    times_opened = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times School Opened"
    )
    times_present = models.PositiveIntegerField(
        default=0, verbose_name="Number of Times Student was Present"
    )

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
        indexes = [
            models.Index(fields=["tenant", "student"]),
            models.Index(fields=["tenant", "academic_session"]),
            models.Index(fields=["tenant", "status"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student.full_name} - {self.get_term_display()} {self.academic_session.name}"

    def calculate_metrics(self):
        """Calculate term performance metrics"""
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
    education_level = models.CharField(
        max_length=50, choices=EDUCATION_LEVEL_CHOICES, blank=True
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
        ]

    def __str__(self):
        return f"{self.name} ({self.get_template_type_display()})"


# ============================================
# SIGNAL HANDLERS FOR BULK RECALCULATION
# ============================================

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.db.models import Avg, Max, Min


# Helper function to recalculate all statistics for a subject/class
def recalculate_subject_statistics(
    result_model, subject, exam_session, student_class, education_level
):
    """
    Recalculate positions and statistics for all students in a subject/class.
    This is the KEY function that fixes your issue.
    """
    # Get all results for this subject and class
    all_results = result_model.objects.filter(
        subject=subject,
        exam_session=exam_session,
        student__student_class=student_class,
        student__education_level=education_level,
        status__in=["APPROVED", "PUBLISHED"],
    ).order_by(
        "-total_score"
        if hasattr(result_model.objects.first() or result_model(), "total_score")
        else "-percentage"
    )

    if not all_results.exists():
        return

    # Determine the scoring field to use
    if hasattr(all_results.first(), "total_percentage"):
        score_field = "total_percentage"
    elif hasattr(all_results.first(), "percentage"):
        score_field = "percentage"
    else:
        score_field = "total_score"

    # Calculate class statistics
    stats = all_results.aggregate(
        avg=Avg(score_field),
        highest=Max(score_field),
        lowest=Min(score_field),
    )

    class_average = stats["avg"] or 0
    highest_in_class = stats["highest"] or 0
    lowest_in_class = stats["lowest"] or 0

    # Get all scores sorted in descending order
    all_scores = list(all_results.values_list(score_field, flat=True))
    all_scores.sort(reverse=True)

    # Update each result with correct position and statistics
    for result in all_results:
        score = getattr(result, score_field)
        position = all_scores.index(score) + 1

        # Update without triggering save signals
        result_model.objects.filter(id=result.id).update(
            subject_position=position,
            class_average=class_average,
            highest_in_class=highest_in_class,
            lowest_in_class=lowest_in_class,
        )


def recalculate_class_positions(
    report_model, exam_session, student_class, education_level
):
    """
    Recalculate class positions for all students in a class.
    """
    # Get all reports for this class
    all_reports = report_model.objects.filter(
        exam_session=exam_session,
        student__student_class=student_class,
        student__education_level=education_level,
        status__in=["APPROVED", "PUBLISHED"],
    ).order_by("-average_score")

    if not all_reports.exists():
        return

    # Get all scores sorted
    all_scores = list(all_reports.values_list("average_score", flat=True))
    all_scores.sort(reverse=True)

    total_students = len(all_scores)

    # Update each report with correct class position
    for report in all_reports:
        position = all_scores.index(report.average_score) + 1

        # Update without triggering save signals
        report_model.objects.filter(id=report.id).update(
            class_position=position,
            total_students=total_students,
        )


# SENIOR SECONDARY SIGNALS
@receiver(post_save, sender=SeniorSecondaryResult)
def handle_senior_result_save(sender, instance, created, **kwargs):
    """
    goodIMPROVED: Only trigger recalculation when necessary
    Prevent recursive signal loops
    """
    # Skip if this is a bulk update or signal is disabled
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return

    # Only recalculate for APPROVED/PUBLISHED results
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return

    # Schedule bulk recalculation (run async if using Celery)
    # For now, run synchronously but efficiently
    try:
        SeniorSecondaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )

        # Update term report positions
        SeniorSecondaryTermReport.bulk_recalculate_positions(
            instance.exam_session,
            instance.student.student_class,
            instance.student.education_level,
        )
    except Exception as e:
        logger.error(f"Error in bulk recalculation: {e}")


@receiver(post_delete, sender=SeniorSecondaryResult)
def handle_senior_result_delete(sender, instance, **kwargs):
    """
    goodIMPROVED: Efficient deletion handling
    """
    try:
        # Recalculate remaining students
        SeniorSecondaryResult.bulk_recalculate_class(
            instance.exam_session,
            instance.subject,
            instance.student.student_class,
            instance.student.education_level,
        )

        # Update term report if it exists
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
    """Recalculate session statistics for all students"""
    if instance.status in ["APPROVED", "PUBLISHED"]:
        # Recalculate subject statistics
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

        # Update session report
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

        # Recalculate class positions
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


# JUNIOR SECONDARY SIGNALS
@receiver(post_save, sender=JuniorSecondaryResult)
def handle_junior_result_save(sender, instance, created, **kwargs):
    """goodIMPROVED: Efficient signal handling"""
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


@receiver(post_delete, sender=JuniorSecondaryResult)
def handle_junior_result_delete(sender, instance, **kwargs):
    """goodIMPROVED: Efficient deletion handling"""
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


# PRIMARY SIGNALS
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


# NURSERY SIGNALS
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


@receiver(post_save, sender=SeniorSecondaryResult)
def auto_generate_senior_term_report(sender, instance, created, **kwargs):
    """
    goodAUTO-GENERATE term report when a subject result is saved
    This ensures the report exists BEFORE the frontend tries to download it
    """
    if kwargs.get("raw", False) or getattr(instance, "_skip_signals", False):
        return

    # Only generate for APPROVED/PUBLISHED results
    if instance.status not in ["APPROVED", "PUBLISHED"]:
        return

    try:
        with transaction.atomic():
            # Get next term begins date
            from academics.models import Term, AcademicSession

            next_term_begins = None
            if hasattr(instance.exam_session, "academic_session"):
                current_term = instance.exam_session.term
                current_session = instance.exam_session.academic_session

                term_order = ["FIRST", "SECOND", "THIRD"]
                if current_term in term_order:
                    current_index = term_order.index(current_term)

                    # Try to get next term in same session
                    if current_index < len(term_order) - 1:
                        next_term_name = term_order[current_index + 1]
                        next_term = Term.objects.filter(
                            academic_session=current_session,
                            name=next_term_name,
                            is_active=True,
                        ).first()

                        if next_term:
                            next_term_begins = next_term.next_term_begins

            # Auto-create term report if it doesn't exist
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

            # Link this result to the term report
            if not instance.term_report:
                SeniorSecondaryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report

            # Recalculate metrics
            term_report.calculate_metrics()
            term_report.calculate_class_position()

            if report_created:
                logger.info(
                    f"goodAuto-generated term report {term_report.id} for {instance.student.full_name}"
                )
            else:
                logger.info(
                    f"goodUpdated existing term report {term_report.id} for {instance.student.full_name}"
                )

    except Exception as e:
        logger.error(f"❌ Error auto-generating term report: {e}", exc_info=True)


@receiver(post_save, sender=JuniorSecondaryResult)
def auto_generate_junior_term_report(sender, instance, created, **kwargs):
    """Auto-generate Junior Secondary term report"""
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
                defaults={
                    "status": "DRAFT",
                    "next_term_begins": next_term_begins,
                },
            )

            if not instance.term_report:
                JuniorSecondaryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report

            term_report.calculate_metrics()
            term_report.calculate_class_position()

            if report_created:
                logger.info(
                    f"goodAuto-generated junior term report for {instance.student.full_name}"
                )

    except Exception as e:
        logger.error(f"❌ Error auto-generating junior term report: {e}", exc_info=True)


@receiver(post_save, sender=PrimaryResult)
def auto_generate_primary_term_report(sender, instance, created, **kwargs):
    """Auto-generate Primary term report"""
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
                defaults={
                    "status": "DRAFT",
                    "next_term_begins": next_term_begins,
                },
            )

            if not instance.term_report:
                PrimaryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report

            term_report.calculate_metrics()
            term_report.calculate_class_position()

            if report_created:
                logger.info(
                    f"goodAuto-generated primary term report for {instance.student.full_name}"
                )

    except Exception as e:
        logger.error(
            f"❌ Error auto-generating primary term report: {e}", exc_info=True
        )


@receiver(post_save, sender=NurseryResult)
def auto_generate_nursery_term_report(sender, instance, created, **kwargs):
    """Auto-generate Nursery term report"""
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
                defaults={
                    "status": "DRAFT",
                    "next_term_begins": next_term_begins,
                },
            )

            if not instance.term_report:
                NurseryResult.objects.filter(id=instance.id).update(
                    term_report=term_report
                )
                instance.term_report = term_report

            term_report.calculate_metrics()
            term_report.calculate_class_position()

            if report_created:
                logger.info(
                    f"goodAuto-generated nursery term report for {instance.student.full_name}"
                )

    except Exception as e:
        logger.error(
            f"❌ Error auto-generating nursery term report: {e}", exc_info=True
        )
