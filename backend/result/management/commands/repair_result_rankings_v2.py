"""
management/commands/repair_result_rankings_v2.py

Repairs stale subject_position (and class_position / total_students on
term reports) by re-invoking each model's own bulk_recalculate_class /
bulk_recalculate_positions — adapted for the v2 schema.

WHY THIS IS NEEDED
------------------
Any subject_position/class_position written BEFORE the Rank() ->
DenseRank() fix in models.py is stale — it was computed with the wrong
ranking convention (ties skip slots) instead of the confirmed school
convention (ties do not skip slots). This command re-triggers the
now-correct bulk methods across every subject/class/session combination
so existing data gets overwritten with correct values.

v2 DIFFERENCES FROM v1's repair_result_rankings.py
----------------------------------------------------
  - student_class is now a ForeignKey (classroom.Class), not a string,
    so we iterate distinct Class objects, not distinct strings.
  - Every query must be tenant-scoped (TenantMixin). Pass --tenant-id.
  - education_level is now resolved via
    student__student_class__education_level__level_type, matching
    each model's own bulk_recalculate_class signature.
  - Score field is uniformly "percentage" across all four result models.

Run with:
    python manage.py repair_result_rankings_v2 --tenant-id=<id> --exam-session-id=<id>
    python manage.py repair_result_rankings_v2 --tenant-id=<id> --exam-session-id=<id> --education-level=SENIOR_SECONDARY
    python manage.py repair_result_rankings_v2 --tenant-id=<id> --exam-session-id=<id> --dry-run
"""

from django.core.management.base import BaseCommand, CommandError
from subject.models import Subject
from classroom.models import Class as StudentClass

from result.models import (
    SeniorSecondaryResult,
    SeniorSecondaryTermReport,
    JuniorSecondaryResult,
    JuniorSecondaryTermReport,
    PrimaryResult,
    PrimaryTermReport,
    NurseryResult,
    NurseryTermReport,
    ExamSession,
)

RESULT_TERMREPORT_PAIRS = [
    (SeniorSecondaryResult, SeniorSecondaryTermReport, "SENIOR_SECONDARY"),
    (JuniorSecondaryResult, JuniorSecondaryTermReport, "JUNIOR_SECONDARY"),
    (PrimaryResult, PrimaryTermReport, "PRIMARY"),
    (NurseryResult, NurseryTermReport, "NURSERY"),
]

SCORE_FIELD = "percentage"  # uniform across all four v2 result models


def dense_positions(rows, score_field):
    """Preview of what DenseRank() will assign, for --dry-run."""
    ordered = sorted(rows, key=lambda r: getattr(
        r, score_field) or 0, reverse=True)
    positions = {}
    current_position = 0
    previous_score = object()
    for r in ordered:
        score = getattr(r, score_field) or 0
        if score != previous_score:
            current_position += 1
            previous_score = score
        positions[r.id] = current_position
    return positions


class Command(BaseCommand):
    help = "Repairs stale subject/class positions for v2 schema (tenant-scoped, FK student_class)."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-id", required=True, type=str)
        parser.add_argument("--exam-session-id", type=str, required=False,
                            help="Limit to one exam session. Omit to repair all sessions for this tenant.")
        parser.add_argument("--education-level", type=str, required=False,
                            choices=["SENIOR_SECONDARY", "JUNIOR_SECONDARY", "PRIMARY", "NURSERY"])
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        tenant_id = options["tenant_id"]
        exam_session_id = options.get("exam_session_id")
        education_level_filter = options.get("education_level")
        dry_run = options.get("dry_run")

        exam_sessions = ExamSession.objects.filter(tenant_id=tenant_id)
        if exam_session_id:
            exam_sessions = exam_sessions.filter(id=exam_session_id)

        if not exam_sessions.exists():
            self.stdout.write(self.style.WARNING(
                "No matching exam sessions found."))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING(
                "\n*** DRY RUN — no data will be written ***\n"))

        grand_total_changed = 0
        grand_total_rows = 0

        for exam_session in exam_sessions:
            self.stdout.write(self.style.NOTICE(
                f"\n=== {exam_session.name} ==="))

            for ResultModel, TermReportModel, edu_level in RESULT_TERMREPORT_PAIRS:
                if education_level_filter and edu_level != education_level_filter:
                    continue

                classes = (
                    StudentClass.objects.filter(
                        tenant_id=tenant_id,
                        education_level__level_type=edu_level,
                    )
                )
                if not classes.exists():
                    continue

                self.stdout.write(f"  {edu_level}:")

                for student_class in classes:
                    subject_ids = (
                        ResultModel.objects.filter(
                            tenant_id=tenant_id,
                            exam_session=exam_session,
                            student__student_class=student_class,
                        )
                        .order_by()
                        .values_list("subject_id", flat=True)
                        .distinct()
                    )

                    if not subject_ids:
                        continue

                    for subject_id in subject_ids:
                        try:
                            subject = Subject.objects.get(id=subject_id)
                        except Subject.DoesNotExist:
                            self.stdout.write(self.style.WARNING(
                                f"    Subject id={subject_id} not found, skipping"))
                            continue

                        approved_rows = list(
                            ResultModel.objects.filter(
                                tenant_id=tenant_id,
                                exam_session=exam_session,
                                subject=subject,
                                student__student_class=student_class,
                                status__in=["APPROVED", "PUBLISHED"],
                            )
                        )
                        if not approved_rows:
                            continue

                        before = {
                            r.id: r.subject_position for r in approved_rows}
                        correct = dense_positions(approved_rows, SCORE_FIELD)
                        changed = sum(
                            1 for r in approved_rows if before[r.id] != correct[r.id])
                        grand_total_rows += len(approved_rows)
                        grand_total_changed += changed

                        if changed:
                            self.stdout.write(
                                f"    {subject.name} in {student_class.name}: "
                                f"{changed}/{len(approved_rows)} positions "
                                f"{'would change' if dry_run else 'changed'}"
                            )

                        if not dry_run:
                            ResultModel.bulk_recalculate_class(
                                exam_session=exam_session,
                                subject=subject,
                                student_class=student_class,
                                education_level=edu_level,
                            )

                    if not dry_run:
                        TermReportModel.bulk_recalculate_positions(
                            exam_session=exam_session,
                            student_class=student_class,
                        )

                    self.stdout.write(
                        f"    Class {student_class.name}: {len(subject_ids)} subject(s) processed"
                    )

        self.stdout.write(self.style.SUCCESS(
            f"\n{'Would change' if dry_run else 'Changed'} "
            f"{grand_total_changed}/{grand_total_rows} subject_position rows.\n"
            + ("\nDone (dry run — nothing written)." if dry_run else "\nDone.")
        ))
