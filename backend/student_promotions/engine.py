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


class PromotionApplyError(ValueError):
    """Promotions for a class can't be applied (e.g. no next class)."""


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
            if student_promotions.applied_at:
                raise ValueError(
                    f"This promotion was already applied — the student was moved to "
                    f"{student_promotions.promoted_to_class}. Change their class directly instead."
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

    def apply_promotions(self, academic_session, student_class, acted_by=None, dry_run=False):
        """
        Move every PROMOTED student of `student_class` for `academic_session`
        into the next class (see _next_class).

        Deliberately separate from run_for_class: flagged students can be
        reviewed and overridden first, and nobody changes class until an
        admin confirms.  Safe to call again later — records already applied
        are left alone, so newly promoted students are picked up.

        Raises PromotionApplyError when there is no single next class.

        Returns:
            {
                "dry_run":    bool,
                "from_class": {"id", "name"},
                "to_class":   {"id", "name"},
                "moved":      [{"student_id", "student_name", "section"}],
                "skipped":    [{"student_id", "student_name", "reason"}],
                "remaining":  {"flagged", "pending", "held_back"},
            }
        """
        from django.db.models import F
        from classroom.models import Section, StudentEnrollment
        from .models import StudentPromotion

        next_class = self._next_class(student_class)

        moved, skipped = [], []
        with transaction.atomic():
            records = (
                StudentPromotion.objects.select_for_update(of=("self",))
                .filter(
                    tenant=self.tenant,
                    academic_session=academic_session,
                    student_class=student_class,
                    status="PROMOTED",
                    applied_at__isnull=True,
                )
                .select_related("student__user", "student__section")
            )

            for record in records:
                student = record.student
                if student.student_class_id != student_class.id:
                    skipped.append(self._apply_row(
                        student, reason=f"No longer in {student_class.name}"))
                    continue
                if not student.is_active:
                    skipped.append(self._apply_row(student, reason="Student is inactive"))
                    continue

                # Keep the section letter if the next class has one of the same
                # name (JSS 1 A -> JSS 2 A); otherwise clear it, since a section
                # must belong to the student's class.
                new_section = None
                if student.section:
                    new_section = (
                        Section.objects.filter(
                            tenant=self.tenant,
                            class_grade=next_class,
                            name__iexact=student.section.name,
                            is_active=True,
                        )
                        .order_by(F("academic_year__is_current").desc(nulls_last=True))
                        .first()
                    )
                moved.append(self._apply_row(
                    student, section=new_section.name if new_section else None))

                if dry_run:
                    continue

                # End enrolment in the old class's classrooms; the Student
                # post_save signal enrols them in the new section's classroom.
                StudentEnrollment.objects.filter(
                    tenant=self.tenant,
                    student=student,
                    is_active=True,
                    classroom__section__class_grade=student_class,
                ).update(is_active=False)

                student.student_class = next_class
                student.section = new_section
                student.save()

                record.promoted_to_class = next_class
                record.applied_at = timezone.now()
                record.applied_by = acted_by
                record.save(update_fields=[
                    "promoted_to_class", "applied_at", "applied_by", "updated_at"])

            remaining = StudentPromotion.objects.filter(
                tenant=self.tenant,
                academic_session=academic_session,
                student_class=student_class,
            )
            remaining_counts = {
                "flagged": remaining.filter(status="FLAGGED").count(),
                "pending": remaining.filter(status="PENDING").count(),
                "held_back": remaining.filter(status="HELD_BACK").count(),
            }

        return {
            "dry_run": dry_run,
            "from_class": {"id": student_class.id, "name": student_class.name},
            "to_class": {"id": next_class.id, "name": next_class.name},
            "moved": moved,
            "skipped": skipped,
            "remaining": remaining_counts,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _next_class(self, student_class):
        """
        The active class that follows this one.

        Class.order restarts inside each education level (Primary 1, JSS 1
        and SSS 1 are all order 1), so classes are sequenced by
        (education level display_order, class order): the last Primary class
        is followed by the first Junior Secondary one.
        """
        from classroom.models import Class

        def position(cls):
            return (cls.education_level.display_order, cls.order)

        current = position(student_class)
        later = [
            cls for cls in Class.objects.filter(
                tenant=self.tenant, is_active=True, education_level__is_active=True,
            ).exclude(pk=student_class.pk).select_related("education_level")
            if position(cls) > current
        ]
        if not later:
            raise PromotionApplyError(
                f"{student_class.name} is the last class — there is no class to promote into."
            )

        candidate = min(later, key=position)
        tied = sorted(cls.name for cls in later if position(cls) == position(candidate))
        if len(tied) > 1:
            raise PromotionApplyError(
                f"Can't tell which class comes after {student_class.name}: "
                f"{', '.join(tied)} are in the same position. "
                "Give each class a distinct order first."
            )
        if (candidate.education_level_id != student_class.education_level_id
                and candidate.education_level.display_order == current[0]):
            raise PromotionApplyError(
                f"Can't tell which class comes after {student_class.name}: "
                f"{student_class.education_level.name} and {candidate.education_level.name} "
                "have the same display order. Give each education level a distinct order first."
            )
        return candidate

    @staticmethod
    def _apply_row(student, **extra):
        return {"student_id": str(student.id), "student_name": student.full_name, **extra}

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

        # Once applied the student has moved class; re-evaluating could flip
        # the status without moving them back.
        if student_promotions.applied_at:
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

        A session's terms are identified by position (term_type.display_order),
        not by name: TermTypes are configurable per tenant, and ExamSession.term
        is a FK to Term, so the old term="FIRST" filter raised ValueError.
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

        from academics.models import Term

        terms = list(
            Term.objects.filter(tenant=self.tenant, academic_session=academic_session)
            .order_by("term_type__display_order", "start_date")[:3]
        )

        for index, attr in enumerate(["term1_average", "term2_average", "term3_average"]):
            if index >= len(terms):
                setattr(student_promotions, attr, None)
                continue

            # A term can have several exam sessions (one per exam type), so
            # look across all of them rather than picking one arbitrarily.
            report = term_report_model.objects.filter(
                tenant=self.tenant,
                student=student,
                exam_session__academic_session=academic_session,
                exam_session__term=terms[index],
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
