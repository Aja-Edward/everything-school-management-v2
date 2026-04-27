"""
student_promotions/engine.py

The PromotionEngine is a pure-Python service class — it has no Django model
of its own.  Import it in views.py and call it from there.

Usage:
    engine = PromotionEngine(tenant=request.tenant)
    results = engine.run_for_class(
        academic_session=session,
        student_class=cls,
        acted_by=request.user,
    )
"""

import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


class PromotionEngine:
    """
    Resolves term averages for every student in a class and writes
    StudentPromotion records.

    Education-level routing
    ───────────────────────
    NURSERY / PRIMARY / JUNIOR_SECONDARY / SENIOR_SECONDARY each store their term
    average in a different model:
        • PrimaryTermReport.average_score
        • JuniorSecondaryTermReport.average_score
        • SeniorSecondaryTermReport.average_score

    The field `average_score` is the *percentage average across subjects*
    for that term — exactly what we need.

    For SeniorSecondary we also have SeniorSecondarySessionReport which
    already stores average_for_year, but we intentionally re-derive from
    the three term reports so the logic is consistent across all levels.
    """

    TERM_KEYS = ["FIRST", "SECOND", "THIRD"]

    def __init__(self, tenant):
        self.tenant = tenant

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_for_class(self, academic_session, student_class, acted_by=None):
        """
        Run auto-student_promotions for every student in `student_class` for the
        given `academic_session`.

        Returns a list of dicts summarising each student's outcome:
            {
                "student_id":    str,
                "student_name":  str,
                "term1":         float | None,
                "term2":         float | None,
                "term3":         float | None,
                "session_avg":   float | None,
                "terms_counted": int,
                "status":        str,
                "skipped":       bool,  # True when require_all_three_terms is set
                                        # and not all three terms have a report
            }
        """
        from students.models import Student
        from .models import StudentPromotion, PromotionRule

        # Fetch the rule for this education level
        education_level = student_class.education_level
        rule = self._get_rule(education_level)

        # All active students in this class
        students = Student.objects.filter(
            tenant=self.tenant,
            student_class=student_class,
            is_active=True,
        ).select_related("student_class")

        results = []

        with transaction.atomic():
            for student in students:
                outcome = self._process_student(
                    student=student,
                    academic_session=academic_session,
                    student_class=student_class,
                    rule=rule,
                    acted_by=acted_by,
                )
                results.append(outcome)

        return results

    def run_for_student(self, student, academic_session, acted_by=None):
        """
        Run auto-student_promotions for a single student.
        Useful when re-evaluating after a result correction.
        """
        from .models import PromotionRule

        student_class = student.student_class
        education_level = student_class.education_level
        rule = self._get_rule(education_level)

        with transaction.atomic():
            return self._process_student(
                student=student,
                academic_session=academic_session,
                student_class=student_class,
                rule=rule,
                acted_by=acted_by,
            )

    def manual_promote(self, student, academic_session, status, reason, acted_by):
        """
        Manually set a student's student_promotions status.

        `status` must be one of: 'PROMOTED', 'HELD_BACK'
        `reason` is required.
        """
        if status not in ("PROMOTED", "HELD_BACK"):
            raise ValueError("Manual status must be PROMOTED or HELD_BACK")
        if not reason or not reason.strip():
            raise ValueError("A reason is required for manual student_promotions changes")

        from .models import StudentPromotion

        with transaction.atomic():
            student_promotions, _ = StudentPromotion.objects.select_for_update().get_or_create(
                tenant=self.tenant,
                student=student,
                academic_session=academic_session,
                defaults={
                    "student_class": student.student_class,
                },
            )
            # Refresh term averages in case they've changed
            self._populate_term_averages(student_promotions, academic_session)
            student_promotions.compute_session_average()

            student_promotions.status = status
            student_promotions.promotion_type = "MANUAL"
            student_promotions.reason = reason.strip()
            student_promotions.processed_by = acted_by
            student_promotions.processed_at = timezone.now()
            student_promotions.save()

        return student_promotions

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_rule(self, education_level):
        """Return the active PromotionRule for this level, or a default."""
        from .models import PromotionRule
        from decimal import Decimal

        try:
            return PromotionRule.objects.get(
                tenant=self.tenant,
                education_level=education_level,
                is_active=True,
            )

        except PromotionRule.DoesNotExist:
            logger.warning(
                "No active PromotionRule for tenant=%s education_level=%s — "
                "falling back to defaults (threshold=49, require_all_three_terms=True)",
                self.tenant,
                education_level,
            )
            class DefaultRule:
                pass_threshold = Decimal("49.00")
                require_all_three_terms = True
            return DefaultRule()

    def _process_student(self, student, academic_session, student_class, rule, acted_by):
        """Core per-student logic. Must be called inside a transaction."""
        from .models import StudentPromotion

        student_promotions, _ = StudentPromotion.objects.select_for_update().get_or_create(
            tenant=self.tenant,
            student=student,
            academic_session=academic_session,
            defaults={
                "student_class": student_class,
                "status": "PENDING",
            },
        )

        # Never overwrite a manual decision with auto
        if student_promotions.promotion_type == "MANUAL" and student_promotions.status in ("PROMOTED", "HELD_BACK"):
            return self._result_dict(student_promotions, skipped=True)

        # Populate / refresh term averages
        self._populate_term_averages(student_promotions, academic_session)
        student_promotions.compute_session_average()

        # Eligibility check
        if rule.require_all_three_terms and student_promotions.terms_counted < 3:
            student_promotions.status = "PENDING"
            student_promotions.save()
            return self._result_dict(student_promotions, skipped=True)

        # Evaluate
        threshold = Decimal(str(rule.pass_threshold))
        avg = student_promotions.session_average or Decimal("0")

        if avg > threshold:
            student_promotions.status = "PROMOTED"
        else:
            # Below threshold → flag for admin review (they decide HELD_BACK)
            student_promotions.status = "FLAGGED"

        student_promotions.promotion_type = "AUTO"
        student_promotions.pass_threshold_applied = threshold
        student_promotions.processed_by = acted_by
        student_promotions.processed_at = timezone.now()
        student_promotions.save()

        return self._result_dict(student_promotions, skipped=False)

    def _populate_term_averages(self, student_promotions, academic_session):
        """
        Fetch the average_score from the relevant TermReport model for
        each of the three terms and write them onto the student_promotions record.
        """
        student = student_promotions.student
        education_level = student.education_level
        if hasattr(education_level, "level_type"):
            level_type = education_level.level_type
        elif isinstance(education_level, str):
            level_type = education_level
        else:
            logger.warning(
                "Could not resolve education level for student %s — skipping term averages",
                student.id,
            )
            return

        term_report_model, avg_field = self._resolve_term_report_model(level_type)
        if term_report_model is None:
            return

        from result.models import ExamSession

        for term_key, attr in [
            ("FIRST", "term1_average"),
            ("SECOND", "term2_average"),
            ("THIRD", "term3_average"),
        ]:
            exam_session = ExamSession.objects.filter(
                tenant=self.tenant,
                academic_session=academic_session,
                term=term_key,
            ).first()
            if not exam_session:
                setattr(student_promotions, attr, None)
                continue

            report = term_report_model.objects.filter(
                tenant=self.tenant,
                student=student,
                exam_session=exam_session,
                status__in=["APPROVED", "PUBLISHED"],
            ).first()

            if report:
                setattr(student_promotions, attr, getattr(report, avg_field, None))
            else:
                setattr(student_promotions, attr, None)

    def _resolve_term_report_model(self, level_type):
        """
        Return (ModelClass, average_field_name) for the given level_type.
        """
        # Import here to avoid circular imports at module level
        from result.models import (
            NurseryTermReport,
            PrimaryTermReport,
            JuniorSecondaryTermReport,
            SeniorSecondaryTermReport,
        )

        mapping = {
            "NURSERY": (NurseryTermReport, "average_score"),
            "PRIMARY": (PrimaryTermReport, "average_score"),
            "JUNIOR_SECONDARY": (JuniorSecondaryTermReport, "average_score"),
            "SENIOR_SECONDARY": (SeniorSecondaryTermReport, "average_score"),
        }
        return mapping.get(level_type, (None, None))

    @staticmethod
    def _result_dict(student_promotions, skipped=False):
        return {
            "student_id": str(student_promotions.student_id),
            "student_name": student_promotions.student.full_name,
            "term1": float(student_promotions.term1_average) if student_promotions.term1_average is not None else None,
            "term2": float(student_promotions.term2_average) if student_promotions.term2_average is not None else None,
            "term3": float(student_promotions.term3_average) if student_promotions.term3_average is not None else None,
            "session_avg": float(student_promotions.session_average) if student_promotions.session_average is not None else None,
            "terms_counted": student_promotions.terms_counted,
            "status": student_promotions.status,
            "skipped": skipped,
        }
