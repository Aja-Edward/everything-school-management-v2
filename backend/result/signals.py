"""
result/signals.py

Design principles:
  1. Signals are LIGHTWEIGHT. They only:
       - Create the bare term report shell (get_or_create, no metrics)
       - Link the result to its term report
     They do NOT call bulk_recalculate_class, calculate_metrics,
     or calculate_class_position. Those are expensive and belong in
     explicit service calls (RecalculateView, bulk_create pipeline, etc.)

  2. ONE receiver per model. The old code had two post_save receivers
     per model (one for recalc, one for term report generation), causing
     every save to trigger both. Merged into a single slim receiver.

  3. NurseryResult uses transaction.on_commit so the term report is
     created after the outer transaction commits (avoids nested atomic
     blocks from NurseryTermReport.save() calling super().save() twice).

  4. _skip_signals must be set on the INSTANCE, not the class. The old
     code used `SeniorSecondaryResult._skip_signals = False` as a class
     attribute — that means setting it True on one instance affects all
     instances. Use `instance._skip_signals = True` before saving.

  5. All signal code lives here. The signal blocks at the bottom of
     models.py have been removed to prevent double-firing.

  6. Delete handlers call BaseTermReport.bulk_recalculate_positions()
     (a classmethod using SQL RANK) — there is no calculate_class_position()
     instance method on any term report model.

  7. The SeniorSecondarySessionReport post_save receiver has been removed.
     That model has no inbound FK from a result model (session reports are
     created explicitly or via compute_from_term_reports()), so the signal
     was dead code.
"""

import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.db import transaction

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SENIOR SECONDARY
# ---------------------------------------------------------------------------


@receiver(post_save, sender="result.SeniorSecondaryResult")
def handle_senior_secondary_result_save(sender, instance, created, **kwargs):
    """
    Slim handler: only creates/links the SeniorSecondaryTermReport shell.
    No recalculation — call RecalculateView explicitly after bulk operations.
    """
    if kwargs.get("raw", False):
        return
    if getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ("APPROVED", "PUBLISHED"):
        return

    _ensure_term_report(
        instance=instance,
        report_model_path="result.SeniorSecondaryTermReport",
        extra_defaults=_senior_stream_defaults(instance),
        level_name="SeniorSecondary",
    )


@receiver(post_delete, sender="result.SeniorSecondaryResult")
def handle_senior_secondary_result_delete(sender, instance, **kwargs):
    """
    On deletion, recalculate the remaining subject stats and term report
    positions for the affected class.  We use on_commit so the deleted row
    is gone before we re-aggregate.

    Note: calculate_class_position() does not exist on any term report model.
    Position recalculation uses the classmethod bulk_recalculate_positions().
    """
    exam_session_id = instance.exam_session_id
    subject_id = instance.subject_id
    student_class_id = instance.student.student_class_id
    education_level = instance.student.education_level
    term_report_id = instance.term_report_id

    def _recalc():
        try:
            from result.models import SeniorSecondaryResult, SeniorSecondaryTermReport
            from classroom.models import Class as StudentClass
            from result.models import ExamSession
            from subject.models import Subject

            exam_session = ExamSession.objects.get(id=exam_session_id)
            subject = Subject.objects.get(id=subject_id)
            student_class = StudentClass.objects.get(id=student_class_id)

            SeniorSecondaryResult.bulk_recalculate_class(
                exam_session, subject, student_class, education_level
            )
            if term_report_id:
                try:
                    report = SeniorSecondaryTermReport.objects.get(id=term_report_id)
                    report.calculate_metrics()
                    # Recalculate positions for the whole class via SQL RANK().
                    SeniorSecondaryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session,
                        student_class=student_class,
                        education_level=education_level,
                    )
                except SeniorSecondaryTermReport.DoesNotExist:
                    pass
        except Exception as e:
            logger.error(
                f"Error recalculating after SeniorSecondaryResult delete: {e}",
                exc_info=True,
            )

    transaction.on_commit(_recalc)


# ---------------------------------------------------------------------------
# JUNIOR SECONDARY
# ---------------------------------------------------------------------------


@receiver(post_save, sender="result.JuniorSecondaryResult")
def handle_junior_secondary_result_save(sender, instance, created, **kwargs):
    """
    Slim handler: only creates/links the JuniorSecondaryTermReport shell.
    """
    if kwargs.get("raw", False):
        return
    if getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ("APPROVED", "PUBLISHED"):
        return

    _ensure_term_report(
        instance=instance,
        report_model_path="result.JuniorSecondaryTermReport",
        extra_defaults={},
        level_name="JuniorSecondary",
    )


@receiver(post_delete, sender="result.JuniorSecondaryResult")
def handle_junior_secondary_result_delete(sender, instance, **kwargs):
    exam_session_id = instance.exam_session_id
    subject_id = instance.subject_id
    student_class_id = instance.student.student_class_id
    education_level = instance.student.education_level
    term_report_id = instance.term_report_id

    def _recalc():
        try:
            from result.models import JuniorSecondaryResult, JuniorSecondaryTermReport
            from classroom.models import Class as StudentClass
            from result.models import ExamSession
            from subject.models import Subject

            exam_session = ExamSession.objects.get(id=exam_session_id)
            subject = Subject.objects.get(id=subject_id)
            student_class = StudentClass.objects.get(id=student_class_id)

            JuniorSecondaryResult.bulk_recalculate_class(
                exam_session, subject, student_class, education_level
            )
            if term_report_id:
                try:
                    report = JuniorSecondaryTermReport.objects.get(id=term_report_id)
                    report.calculate_metrics()
                    JuniorSecondaryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session,
                        student_class=student_class,
                        education_level=education_level,
                    )
                except JuniorSecondaryTermReport.DoesNotExist:
                    pass
        except Exception as e:
            logger.error(
                f"Error recalculating after JuniorSecondaryResult delete: {e}",
                exc_info=True,
            )

    transaction.on_commit(_recalc)


# ---------------------------------------------------------------------------
# PRIMARY
# ---------------------------------------------------------------------------


@receiver(post_save, sender="result.PrimaryResult")
def handle_primary_result_save(sender, instance, created, **kwargs):
    """
    Slim handler: only creates/links the PrimaryTermReport shell.
    """
    if kwargs.get("raw", False):
        return
    if getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ("APPROVED", "PUBLISHED"):
        return

    _ensure_term_report(
        instance=instance,
        report_model_path="result.PrimaryTermReport",
        extra_defaults={},
        level_name="Primary",
    )


@receiver(post_delete, sender="result.PrimaryResult")
def handle_primary_result_delete(sender, instance, **kwargs):
    exam_session_id = instance.exam_session_id
    subject_id = instance.subject_id
    student_class_id = instance.student.student_class_id
    education_level = instance.student.education_level
    term_report_id = instance.term_report_id

    def _recalc():
        try:
            from result.models import PrimaryResult, PrimaryTermReport, ExamSession
            from classroom.models import Class as StudentClass
            from subject.models import Subject

            exam_session = ExamSession.objects.get(id=exam_session_id)
            subject = Subject.objects.get(id=subject_id)
            student_class = StudentClass.objects.get(id=student_class_id)

            PrimaryResult.bulk_recalculate_class(
                exam_session,
                subject,
                student_class,
                education_level,
            )

            if term_report_id:
                try:
                    report = PrimaryTermReport.objects.get(id=term_report_id)
                    report.calculate_metrics()
                    PrimaryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session,
                        student_class=student_class,
                        education_level=education_level,
                    )
                except PrimaryTermReport.DoesNotExist:
                    pass
        except Exception as e:
            logger.error(
                f"Error recalculating after PrimaryResult delete: {e}", exc_info=True
            )

    transaction.on_commit(_recalc)


# ---------------------------------------------------------------------------
# NURSERY
# ---------------------------------------------------------------------------


@receiver(post_save, sender="result.NurseryResult")
def handle_nursery_result_save(sender, instance, created, **kwargs):
    """
    Slim handler: only creates/links the NurseryTermReport shell.
    Uses on_commit because NurseryTermReport.save() has a double-save
    pattern internally — deferring avoids nested transaction conflicts.

    No transaction.atomic() wrapper inside the callback: on_commit already
    runs after the outer transaction has committed, and wrapping in a new
    atomic block would defer any further on_commit hooks registered inside it.
    """
    if kwargs.get("raw", False):
        return
    if getattr(instance, "_skip_signals", False):
        return
    if instance.status not in ("APPROVED", "PUBLISHED"):
        return

    # Capture primitive values before the closure — never capture ORM
    # objects in on_commit closures; the session may have closed.
    student_id = instance.student_id
    exam_session_id = instance.exam_session_id
    result_id = instance.id

    def _create_report():
        try:
            from result.models import NurseryResult, NurseryTermReport
            from students.models import Student
            from result.models import ExamSession

            student = Student.objects.get(id=student_id)
            exam_session = ExamSession.objects.get(id=exam_session_id)

            term_report, created = NurseryTermReport.objects.get_or_create(
                student=student,
                exam_session=exam_session,
                defaults={"status": "DRAFT", "is_published": False},
            )
            # Link the result to its term report if not already linked.
            # Uses update() to bypass save() and avoid re-triggering this signal.
            NurseryResult.objects.filter(id=result_id, term_report__isnull=True).update(
                term_report=term_report
            )

            if created:
                logger.info(
                    f"Created NurseryTermReport {term_report.id} "
                    f"for student {student_id}"
                )
        except Exception as e:
            logger.error(
                f"Error creating NurseryTermReport for student {student_id}: {e}",
                exc_info=True,
            )

    transaction.on_commit(_create_report)


@receiver(post_delete, sender="result.NurseryResult")
def handle_nursery_result_delete(sender, instance, **kwargs):
    """
    On deletion, recalculate subject stats and class positions.

    Note: NurseryTermReport has no calculate_class_position() instance method.
    Position recalculation uses NurseryTermReport.bulk_recalculate_positions()
    (classmethod, SQL RANK).
    """
    exam_session_id = instance.exam_session_id
    subject_id = instance.subject_id
    student_class_id = instance.student.student_class_id
    education_level = (
        instance.student.education_level
    )  # @property, returns string — safe
    term_report_id = instance.term_report_id  # capture primitive, not the object

    def _recalc():
        try:
            from result.models import NurseryResult, NurseryTermReport, ExamSession
            from classroom.models import Class as StudentClass
            from subject.models import Subject

            exam_session = ExamSession.objects.get(id=exam_session_id)
            subject = Subject.objects.get(id=subject_id)
            student_class = StudentClass.objects.get(id=student_class_id)

            NurseryResult.bulk_recalculate_class(
                exam_session,
                subject,
                student_class,
                education_level,
            )

            if term_report_id:
                try:
                    report = NurseryTermReport.objects.get(id=term_report_id)
                    report.calculate_metrics()
                    # NurseryTermReport.bulk_recalculate_positions() is the correct
                    # classmethod — there is no calculate_class_position() instance method.
                    NurseryTermReport.bulk_recalculate_positions(
                        exam_session=exam_session,
                        student_class=student_class,
                        education_level=education_level,
                    )
                except NurseryTermReport.DoesNotExist:
                    pass
        except Exception as e:
            logger.error(
                f"Error recalculating after NurseryResult delete: {e}", exc_info=True
            )

    transaction.on_commit(_recalc)


# ---------------------------------------------------------------------------
# SHARED HELPERS
# ---------------------------------------------------------------------------


def _senior_stream_defaults(instance):
    """Return stream default for SeniorSecondary term reports."""
    stream = getattr(instance, "stream", None)
    return {"stream": stream} if stream else {}


def _ensure_term_report(instance, report_model_path, extra_defaults, level_name):
    """
    Synchronously get_or_create the term report and link the result.
    Called directly (not via on_commit) for Senior/Junior/Primary because
    their term report models don't have the double-save issue.

    Uses queryset.update() to link the result, which bypasses save()
    and avoids re-triggering this signal.
    """
    app_label, model_name = report_model_path.split(".")
    try:
        from django.apps import apps

        ReportModel = apps.get_model(app_label, model_name)
        ResultModel = type(instance)

        defaults = {"status": "DRAFT", "is_published": False}
        defaults.update(extra_defaults)

        with transaction.atomic():
            (
                term_report,
                created,
            ) = ReportModel.objects.select_for_update().get_or_create(
                student=instance.student,
                exam_session=instance.exam_session,
                defaults=defaults,
            )
            # Link using update() — avoids triggering another post_save on the result
            ResultModel.objects.filter(id=instance.id, term_report__isnull=True).update(
                term_report=term_report
            )

            if created:
                logger.info(
                    f"Created {level_name} TermReport {term_report.id} "
                    f"for student {instance.student_id}"
                )
    except Exception as e:
        logger.error(
            f"Error in _ensure_term_report for {level_name} "
            f"(student={instance.student_id}): {e}",
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# MANAGEMENT UTILITIES  (callable from shell / management commands)
# ---------------------------------------------------------------------------


def bulk_generate_all_missing_reports(exam_session=None):
    """
    Generate missing term reports for ALL education levels.

    Usage:
        from result.models import ExamSession
        from result.signals import bulk_generate_all_missing_reports

        session = ExamSession.objects.get(id=123)
        bulk_generate_all_missing_reports(session)   # one session
        bulk_generate_all_missing_reports()           # all sessions
    """
    from result.models import ExamSession

    sessions = [exam_session] if exam_session else list(ExamSession.objects.all())
    levels = ("NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY")
    total_created = 0

    for session in sessions:
        for level in levels:
            total_created += _bulk_generate_for_level(session, level)

    logger.info(f"bulk_generate_all_missing_reports: created {total_created} reports")
    return total_created


def _bulk_generate_for_level(exam_session, education_level):
    """
    Create missing term reports for one education level / exam session pair.
    Metrics are calculated once per report — not once per subject result.
    """
    _MODEL_MAP = {
        "NURSERY": ("NurseryResult", "NurseryTermReport"),
        "PRIMARY": ("PrimaryResult", "PrimaryTermReport"),
        "JUNIOR_SECONDARY": ("JuniorSecondaryResult", "JuniorSecondaryTermReport"),
        "SENIOR_SECONDARY": ("SeniorSecondaryResult", "SeniorSecondaryTermReport"),
    }
    if education_level not in _MODEL_MAP:
        raise ValueError(f"Invalid education level: {education_level}")

    from django.apps import apps

    result_name, report_name = _MODEL_MAP[education_level]
    ResultModel = apps.get_model("result", result_name)
    ReportModel = apps.get_model("result", report_name)

    students_with_results = set(
        ResultModel.objects.filter(
            exam_session=exam_session,
            status__in=("APPROVED", "PUBLISHED"),
        ).values_list("student_id", flat=True)
    )
    students_with_reports = set(
        ReportModel.objects.filter(
            exam_session=exam_session,
        ).values_list("student_id", flat=True)
    )
    missing = students_with_results - students_with_reports

    if not missing:
        return 0

    from students.models import Student

    created_count = 0

    for student_id in missing:
        try:
            with transaction.atomic():
                student = Student.objects.get(id=student_id)
                defaults = {"status": "DRAFT", "is_published": False}

                if education_level == 'SENIOR_SECONDARY':
                    first_result = ResultModel.objects.filter(
                        student=student,
                        exam_session=exam_session,
                        status__in=("APPROVED", "PUBLISHED"),
                    ).first()
                    if first_result and getattr(first_result, "stream", None):
                        defaults["stream"] = first_result.stream

                term_report = ReportModel.objects.create(
                    student=student,
                    exam_session=exam_session,
                    **defaults,
                )
                term_report.calculate_metrics()
                created_count += 1
        except Exception as e:
            logger.error(
                f"_bulk_generate_for_level: failed for student {student_id} "
                f"({education_level}): {e}",
                exc_info=True,
            )

    logger.info(
        f"_bulk_generate_for_level: {education_level} session={exam_session.id} "
        f"created={created_count}"
    )
    return created_count


def fix_specific_student_report(student_id, exam_session_id, education_level):
    """
    Create or recalculate the term report for one student.

    Usage:
        from result.signals import fix_specific_student_report
        fix_specific_student_report(
            student_id='<uuid>',
            exam_session_id='<uuid>',
            education_level='NURSERY',   # NURSERY | PRIMARY | JUNIOR_SECONDARY | SENIOR_SECONDARY
        )
    """
    _MODEL_MAP = {
        "NURSERY": ("NurseryResult", "NurseryTermReport"),
        "PRIMARY": ("PrimaryResult", "PrimaryTermReport"),
        "JUNIOR_SECONDARY": ("JuniorSecondaryResult", "JuniorSecondaryTermReport"),
        "SENIOR_SECONDARY": ("SeniorSecondaryResult", "SeniorSecondaryTermReport"),
    }
    if education_level not in _MODEL_MAP:
        raise ValueError(f"Invalid education level: {education_level}")

    from django.apps import apps
    from students.models import Student
    from result.models import ExamSession

    result_name, report_name = _MODEL_MAP[education_level]
    ResultModel = apps.get_model("result", result_name)
    ReportModel = apps.get_model("result", report_name)

    try:
        student = Student.objects.get(id=student_id)
        exam_session = ExamSession.objects.get(id=exam_session_id)
    except (Student.DoesNotExist, ExamSession.DoesNotExist) as e:
        logger.error(f"fix_specific_student_report: {e}")
        return None

    existing = ReportModel.objects.filter(
        student=student, exam_session=exam_session
    ).first()

    if existing:
        existing.calculate_metrics()
        # Use bulk_recalculate_positions (classmethod) — no instance method exists.
        from classroom.models import Class as StudentClass

        student_class = StudentClass.objects.filter(id=student.student_class_id).first()
        if student_class:
            ReportModel.bulk_recalculate_positions(
                exam_session=exam_session,
                student_class=student_class,
                education_level=student.education_level,
            )
        logger.info(
            f"fix_specific_student_report: recalculated existing report {existing.id}"
        )
        return existing

    has_results = ResultModel.objects.filter(
        student=student,
        exam_session=exam_session,
        status__in=("APPROVED", "PUBLISHED"),
    ).exists()

    if not has_results:
        logger.warning(
            f"fix_specific_student_report: no approved results for "
            f"student {student_id} in session {exam_session_id}"
        )
        return None

    with transaction.atomic():
        defaults = {"status": "DRAFT", "is_published": False}
        if education_level == "SENIOR_SECONDARY":
            first_result = ResultModel.objects.filter(
                student=student,
                exam_session=exam_session,
                status__in=("APPROVED", "PUBLISHED"),
            ).first()
            if first_result and getattr(first_result, "stream", None):
                defaults["stream"] = first_result.stream

        term_report = ReportModel.objects.create(
            student=student, exam_session=exam_session, **defaults
        )
        term_report.calculate_metrics()

        from classroom.models import Class as StudentClass

        student_class = StudentClass.objects.filter(id=student.student_class_id).first()
        if student_class:
            ReportModel.bulk_recalculate_positions(
                exam_session=exam_session,
                student_class=student_class,
                education_level=student.education_level,
            )

    logger.info(f"fix_specific_student_report: created report {term_report.id}")
    return term_report
