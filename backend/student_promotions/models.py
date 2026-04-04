"""
student_promotions/models.py
"""

import uuid
import logging
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from decimal import Decimal

from tenants.models import TenantMixin
from students.models import Student
from academics.models import AcademicSession, EducationLevel
from classroom.models import Class as StudentClass

logger = logging.getLogger(__name__)


# ============================================================
# PROMOTION RULE
# ============================================================

class PromotionRule(TenantMixin, models.Model):
    """
    Configurable student_promotions threshold per education level.

    Default: a student must achieve > 49% average across all three terms
    to be automatically promoted.  Admins can adjust per level.
    """

    education_level = models.ForeignKey(
        EducationLevel,
        on_delete=models.CASCADE,
        related_name="promotion_rules",
        help_text="Education level this rule applies to",
    )
    pass_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("49.00"),
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Minimum session average (%) required for auto-student_promotions",
    )
    require_all_three_terms = models.BooleanField(
        default=True,
        help_text=(
            "If True, auto-student_promotions only runs when results for all three terms "
            "exist.  If False, available terms are averaged."
        ),
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_promotion_rules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "promotion_rule"
        # One active rule per education level per tenant
        unique_together = ["tenant", "education_level"]
        verbose_name = "Promotion Rule"
        verbose_name_plural = "Promotion Rules"
        indexes = [
            models.Index(fields=["tenant", "education_level"]),
            models.Index(fields=["tenant", "is_active"]),
        ]

    def __str__(self):
        return (
            f"{self.education_level.name} — "
            f"pass ≥ {self.pass_threshold}%"
        )


# ============================================================
# STUDENT PROMOTION
# ============================================================

class StudentPromotion(TenantMixin, models.Model):
    """
    One record per student per academic session capturing their
    student_promotions outcome.

    session_average is the mean of term1_average, term2_average,
    term3_average (each sourced from the relevant *TermReport model).
    """

    PROMOTION_STATUS = [
        ("PENDING", "Pending"),           # no result yet / not run
        ("PROMOTED", "Promoted"),         # passed threshold or manually promoted
        ("HELD_BACK", "Held back"),       # failed threshold or manually held
        ("FLAGGED", "Flagged for review"), # below threshold — awaiting admin decision
    ]

    PROMOTION_TYPE = [
        ("AUTO", "Auto-student_promotions"),
        ("MANUAL", "Manual override"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="student_promotions",
    )
    academic_session = models.ForeignKey(
        AcademicSession,
        on_delete=models.CASCADE,
        related_name="student_promotions",
    )
    student_class = models.ForeignKey(
        StudentClass,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_promotions",
        help_text="Class the student was in during this session",
    )

    # ----- term averages (%) pulled from term reports -----
    term1_average = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Average % from first-term report",
    )
    term2_average = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Average % from second-term report",
    )
    term3_average = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Average % from third-term report",
    )

    # ----- derived session average -----
    session_average = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Mean of available term averages",
    )
    terms_counted = models.PositiveSmallIntegerField(
        default=0,
        help_text="Number of terms included in session_average",
    )

    # ----- outcome -----
    status = models.CharField(
        max_length=20,
        choices=PROMOTION_STATUS,
        default="PENDING",
        db_index=True,
    )
    promotion_type = models.CharField(
        max_length=10,
        choices=PROMOTION_TYPE,
        null=True,
        blank=True,
    )
    reason = models.TextField(
        blank=True,
        help_text="Required for MANUAL overrides and HELD_BACK decisions",
    )

    # ----- who acted -----
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="processed_promotions",
    )
    processed_at = models.DateTimeField(null=True, blank=True)

    # ----- rule snapshot (for audit) -----
    pass_threshold_applied = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Threshold that was in effect when auto-student_promotions ran",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "student_promotion"
        unique_together = ["tenant", "student", "academic_session"]
        ordering = ["-created_at"]
        verbose_name = "Student Promotion"
        verbose_name_plural = "Student Promotions"
        indexes = [
            models.Index(fields=["tenant", "academic_session"]),
            models.Index(fields=["tenant", "student"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "student_class"]),
        ]

    def __str__(self):
        return (
            f"{self.student.full_name} — "
            f"{self.academic_session.name} — "
            f"{self.get_status_display()}"
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def compute_session_average(self):
        """Re-calculate session_average from whichever terms are available."""
        available = [
            v for v in [self.term1_average, self.term2_average, self.term3_average]
            if v is not None
        ]
        if available:
            self.session_average = sum(available) / len(available)
            self.terms_counted = len(available)
        else:
            self.session_average = None
            self.terms_counted = 0
        return self.session_average