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
        • NurseryTermReport.overall_percentage
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
                if student_promotions.graduated:
                    raise ValueError(
                        "This promotion was already applied — the student has graduated. "
                        "Reactivate them directly instead."
                    )
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

        In the school's final class there is nowhere to move them: they
        graduate instead.  A graduate keeps their class, for the record, and
        their login, so they and their parents can still see past results,
        but is no longer an active student — off class lists, attendance,
        fee runs and future promotions.

        Deliberately separate from run_for_class: flagged students can be
        reviewed and overridden first, and nobody changes class until an
        admin confirms.  Safe to call again later — records already applied
        are left alone, so newly promoted students are picked up.

        Raises PromotionApplyError when there is no single next class.

        Returns:
            {
                "dry_run":    bool,
                "graduating": bool,
                "from_class": {"id", "name"},
                "to_class":   {"id", "name"} | None,   # None when graduating
                "moved":      [{"student_id", "student_name", "section"}],
                "skipped":    [{"student_id", "student_name", "reason"}],
                "remaining":  {"flagged", "pending", "held_back"},
            }
        """
        from django.core.exceptions import ValidationError
        from django.db.models import F
        from classroom.models import Section, StudentEnrollment
        from .models import StudentPromotion

        next_class = self._next_class(student_class)
        graduating = next_class is None

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
                # must belong to the student's class. A graduate keeps theirs.
                new_section = None
                if graduating:
                    new_section = student.section
                elif student.section:
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

                # Student.save() validates the whole record, and older students'
                # users often have no school at all (teacher/parent-style
                # creation never set one) -- which it rejects. Fill that in from
                # the student record instead of failing the class; a user
                # recorded at a *different* school is left for a person to sort.
                repair_user_school = student.user.tenant_id is None
                if repair_user_school:
                    student.user.tenant_id = student.tenant_id

                if graduating:
                    student.is_active = False
                else:
                    student.student_class = next_class
                    student.section = new_section

                # Validate before touching anything, so one bad record is
                # reported and skipped rather than rolling back everyone else.
                try:
                    student.full_clean()
                except ValidationError as exc:
                    skipped.append(self._apply_row(
                        student, reason="Student record needs fixing first: " + "; ".join(exc.messages)))
                    continue

                moved.append(self._apply_row(
                    student, section=new_section.name if new_section else None))

                if dry_run:
                    continue

                if repair_user_school:
                    # A queryset update: saving the user would fire its
                    # profile signals, which validate records of their own.
                    student.user.__class__.objects.filter(pk=student.user_id).update(
                        tenant_id=student.tenant_id)

                # End enrolment in the old class's classrooms; the Student
                # post_save signal enrols them in the new section's classroom
                # (and skips graduates, who are inactive).
                StudentEnrollment.objects.filter(
                    tenant=self.tenant,
                    student=student,
                    is_active=True,
                    classroom__section__class_grade=student_class,
                ).update(is_active=False)

                student.save()

                record.promoted_to_class = next_class
                record.graduated = graduating
                record.applied_at = timezone.now()
                record.applied_by = acted_by
                record.save(update_fields=[
                    "promoted_to_class", "graduated", "applied_at", "applied_by", "updated_at"])

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
            "graduating": graduating,
            "from_class": {"id": student_class.id, "name": student_class.name},
            "to_class": None if graduating else {"id": next_class.id, "name": next_class.name},
            "moved": moved,
            "skipped": skipped,
            "remaining": remaining_counts,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _next_class(self, student_class):
        """
        The active class that follows this one, or None for the school's
        final class.

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
            return None

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
        Fetch the term percentage from the relevant TermReport model for
        each of the three terms and write them onto the student_promotions record.

        A session's terms are identified by position (term_type.display_order),
        not by name: TermTypes are configurable per tenant, and ExamSession.term
        is a FK to Term, so the old term="FIRST" filter raised ValueError.
        """
        student = student_promotions.student
        level_type = self._level_type(student.student_class)
        term_report_model, avg_field = self._resolve_term_report_model(level_type)
        if term_report_model is None:
            logger.warning(
                "Could not resolve education level for student %s — skipping term averages",
                student.id,
            )
            return

        terms = self._session_terms(academic_session)

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
                # No default: a field name the report doesn't have must fail,
                # not read as a missing term. That is how every Nursery pupil
                # sat in Pending with no averages.
                setattr(student_promotions, attr, getattr(report, avg_field))
            else:
                setattr(student_promotions, attr, None)

    def class_warnings(self, academic_session, student_class):
        """
        Plain-language reasons results for `student_class` in
        `academic_session` can't be counted.

        Every one of these used to surface only as a student showing 0/3
        terms, with nothing to say why.
        """
        from result.models import ExamSession

        warnings = []
        level_type = self._level_type(student_class)
        report_model, _ = self._resolve_term_report_model(level_type)
        if report_model is None:
            level = student_class.education_level
            return [
                f"{student_class.name}'s education level \"{level.name}\" isn't one promotion "
                "recognises (Nursery, Primary, Junior Secondary or Senior Secondary), "
                "so none of its results can be read."
            ]

        terms = self._session_terms(academic_session)
        if not terms:
            warnings.append(
                f"{academic_session.name} has no terms set up, so no results can be matched to a term."
            )
        elif len(terms) < 3:
            warnings.append(
                f"{academic_session.name} has only {len(terms)} term(s) set up "
                f"({', '.join(t.name for t in terms)}), so no student can have three."
            )

        reports = report_model.objects.filter(
            tenant=self.tenant,
            student__student_class=student_class,
            student__is_active=True,
        )
        in_session = reports.filter(exam_session__academic_session=academic_session)

        if not in_session.exists():
            elsewhere = sorted(set(
                reports.exclude(exam_session__academic_session=academic_session)
                .values_list("exam_session__academic_session__name", flat=True)
            ))
            if elsewhere:
                warnings.append(
                    f"No results for {student_class.name} are in {academic_session.name}; "
                    f"they are in {', '.join(elsewhere)}. Pick that session to promote on those results."
                )
            else:
                warnings.append(f"No results have been recorded for {student_class.name} yet.")
            return warnings

        termless = in_session.filter(exam_session__term__isnull=True)
        if termless.exists():
            names = sorted(set(
                ExamSession.objects.filter(pk__in=termless.values("exam_session"))
                .values_list("name", flat=True)
            ))
            warnings.append(
                f"{termless.count()} result(s) are on exam sessions with no term set "
                f"({', '.join(names)}), so they can't be counted towards any term. "
                "Set the term on those exam sessions, then run again."
            )

        drafts = in_session.exclude(status__in=["APPROVED", "PUBLISHED"]).count()
        if drafts:
            warnings.append(
                f"{drafts} result(s) are still in Draft. Only approved or published results count."
            )

        return warnings

    def _level_type(self, student_class):
        """
        The canonical level_type of a class's education level, or None.

        Schools were seeded with different spellings -- 'SSS' and 'JSS' as
        well as 'SENIOR_SECONDARY' -- so level_type, then code, then name are
        each tried through the shared alias table. An exact match on
        level_type alone left every JSS and SSS student at 0/3 in schools
        seeded the other way.
        """
        from common.education_levels import canonical_level_type

        level = getattr(student_class, "education_level", None)
        if level is None:
            return None
        for token in (level.level_type, level.code, level.name):
            level_type = canonical_level_type(token)
            if level_type:
                return level_type
        return None

    def _session_terms(self, academic_session):
        """The session's first three terms, in order."""
        from academics.models import Term

        return list(
            Term.objects.filter(tenant=self.tenant, academic_session=academic_session)
            .select_related("term_type")
            .order_by("term_type__display_order", "start_date")[:3]
        )

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

        # Nursery reports aggregate marks rather than subject averages, so
        # their term percentage lives in overall_percentage.
        mapping = {
            "NURSERY": (NurseryTermReport, "overall_percentage"),
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
