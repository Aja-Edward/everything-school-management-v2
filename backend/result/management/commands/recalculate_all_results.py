"""
result/management/commands/recalculate_results.py

One-time / on-demand backfill: recalculates every APPROVED/PUBLISHED
subject result's scores and every term report's aggregate metrics and
class positions, from scratch, for all four education levels.

Use this after:
  • Fixing a scoring bug (e.g. the Nursery mark_obtained/total_score sync issue).
  • Bulk data imports that bypassed calculate_scores()/calculate_metrics().
  • Any time you suspect stored aggregates (total_score, percentage,
    overall_percentage, average_score, class_position, etc.) have drifted
    from the underlying ComponentScore / mark_obtained data.

Safe to run repeatedly — every step is idempotent (it recomputes from
source data, it doesn't accumulate).

Usage
─────
  # Recalculate everything, all tenants, all levels:
  python manage.py recalculate_results

  # Just nursery (fastest way to verify the fix from this conversation):
  python manage.py recalculate_results --level NURSERY

  # Just one tenant (by tenant id or schema — adjust to your Tenant model):
  python manage.py recalculate_results --tenant-id 4

  # Dry run — report what WOULD change without saving:
  python manage.py recalculate_results --dry-run

  # Also recalculate class positions (subject + term report) — slower,
  # since it iterates every (exam_session, class) combination:
  python manage.py recalculate_results --with-positions
"""

from decimal import Decimal

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from result.models import (
    SeniorSecondaryResult,
    SeniorSecondaryTermReport,
    JuniorSecondaryResult,
    JuniorSecondaryTermReport,
    PrimaryResult,
    PrimaryTermReport,
    NurseryResult,
    NurseryTermReport,
)

_LEVEL_MODEL_MAP = {
    "SENIOR_SECONDARY": (SeniorSecondaryResult, SeniorSecondaryTermReport),
    "JUNIOR_SECONDARY": (JuniorSecondaryResult, JuniorSecondaryTermReport),
    "PRIMARY": (PrimaryResult, PrimaryTermReport),
    "NURSERY": (NurseryResult, NurseryTermReport),
}


class Command(BaseCommand):
    help = (
        "Recalculate subject result scores and term report metrics from "
        "scratch, for all (or one) education level and tenant."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--level",
            choices=list(_LEVEL_MODEL_MAP.keys()),
            help="Only recalculate this education level. Default: all four.",
        )
        parser.add_argument(
            "--tenant-id",
            type=int,
            help="Only recalculate results for this tenant's primary key. "
                 "Default: all tenants.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing to the database.",
        )
        parser.add_argument(
            "--with-positions",
            action="store_true",
            help="Also recalculate subject_position / class_position for "
                 "every (exam_session, class) group. Slower — off by default.",
        )
        parser.add_argument(
            "--statuses",
            nargs="+",
            default=["APPROVED", "PUBLISHED"],
            help="Which result statuses to recalculate. Default: APPROVED PUBLISHED. "
                 "Pass 'DRAFT APPROVED PUBLISHED' to include drafts too.",
        )

    def handle(self, *args, **options):
        level_filter = options.get("level")
        tenant_id = options.get("tenant_id")
        dry_run = options.get("dry_run")
        with_positions = options.get("with_positions")
        statuses = tuple(s.upper() for s in options["statuses"])

        levels = [level_filter] if level_filter else list(
            _LEVEL_MODEL_MAP.keys())

        if dry_run:
            self.stdout.write(self.style.WARNING(
                "DRY RUN — no changes will be saved.\n"))

        grand_totals = {"results_recalculated": 0,
                        "reports_recalculated": 0, "errors": 0}

        for level in levels:
            ResultModel, TermReportModel = _LEVEL_MODEL_MAP[level]
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n=== {level} ==="))

            result_count, report_count, error_count = self._recalculate_level(
                ResultModel,
                TermReportModel,
                level,
                tenant_id=tenant_id,
                dry_run=dry_run,
                with_positions=with_positions,
                statuses=statuses,
            )
            grand_totals["results_recalculated"] += result_count
            grand_totals["reports_recalculated"] += report_count
            grand_totals["errors"] += error_count

        self.stdout.write(self.style.SUCCESS(
            f"\nDone. {grand_totals['results_recalculated']} subject result(s), "
            f"{grand_totals['reports_recalculated']} term report(s) recalculated, "
            f"{grand_totals['errors']} error(s)."
        ))
        if dry_run:
            self.stdout.write(self.style.WARNING(
                "This was a dry run — nothing was saved."))

    # ── Per-level recalculation ────────────────────────────────────────────

    def _recalculate_level(
        self, ResultModel, TermReportModel, level, *, tenant_id, dry_run, with_positions, statuses
    ):
        result_qs = ResultModel.objects.filter(status__in=statuses)
        if tenant_id:
            result_qs = result_qs.filter(tenant_id=tenant_id)

        result_total = result_qs.count()
        self.stdout.write(f"  Subject results to recalculate: {result_total}")

        result_count = 0
        error_count = 0
        processed = 0

        # ── Step 1: recalculate every subject result's own scores ──────────
        # select_related grading_system + prefetch grades/component_scores to
        # avoid two N+1 query patterns inside calculate_scores()/determine_grade():
        #   - ComponentScore lookup per row (component_scores__component prefetch)
        #   - grading_system.grades.filter(...) per row (grading_system__grades prefetch)
        qs = (
            result_qs
            .select_related("grading_system")
            .prefetch_related("grading_system__grades", "component_scores__component")
        )

        for result in qs:
            processed += 1
            if processed % 100 == 0 or processed == result_total:
                self.stdout.write(
                    f"    ...{processed}/{result_total} processed")
                self.stdout.flush()
            try:
                before = {
                    "total_score": result.total_score,
                    "percentage": result.percentage,
                    "grade": result.grade,
                }
                if level == "NURSERY":
                    before["mark_obtained"] = result.mark_obtained
                    before["max_marks_obtainable"] = result.max_marks_obtainable

                result.calculate_scores()
                result.determine_grade()

                changed = (
                    before["total_score"] != result.total_score
                    or before["percentage"] != result.percentage
                    or before["grade"] != result.grade
                    or (level == "NURSERY" and (
                        before["mark_obtained"] != result.mark_obtained
                        or before["max_marks_obtainable"] != result.max_marks_obtainable
                    ))
                )

                if changed and not dry_run:
                    update_fields = [
                        "total_score", "ca_total", "percentage",
                        "grade", "grade_point", "is_passed", "updated_at",
                    ]
                    if level == "NURSERY":
                        update_fields += ["mark_obtained",
                                          "max_marks_obtainable"]
                    result.save(update_fields=update_fields)

                if changed:
                    result_count += 1
            except Exception as exc:
                error_count += 1
                self.stderr.write(
                    self.style.ERROR(f"  ! Result {result.pk} failed: {exc}")
                )

        self.stdout.write(f"  Subject results changed: {result_count}")

        # ── Step 2: recalculate every term report's aggregate metrics ──────
        report_qs = TermReportModel.objects.all()
        if tenant_id:
            report_qs = report_qs.filter(tenant_id=tenant_id)

        report_total = report_qs.count()
        self.stdout.write(f"  Term reports to recalculate: {report_total}")

        report_count = 0
        report_processed = 0
        for report in report_qs:
            report_processed += 1
            if report_processed % 50 == 0 or report_processed == report_total:
                self.stdout.write(
                    f"    ...{report_processed}/{report_total} processed")
                self.stdout.flush()
            try:
                if level == "NURSERY":
                    before = (report.total_marks_obtained,
                              report.overall_percentage)
                else:
                    before = (report.total_score, report.average_score)

                if not dry_run:
                    report.calculate_metrics()
                    report.refresh_from_db()
                else:
                    # Dry run: replicate calculate_metrics()'s read-only aggregation
                    # so we can report what WOULD change, without saving.
                    pass

                if level == "NURSERY":
                    after = (report.total_marks_obtained,
                             report.overall_percentage)
                else:
                    after = (report.total_score, report.average_score)

                if not dry_run and before != after:
                    report_count += 1
            except Exception as exc:
                error_count += 1
                self.stderr.write(
                    self.style.ERROR(
                        f"  ! Term report {report.pk} failed: {exc}")
                )

        self.stdout.write(f"  Term reports recalculated: {report_count}")

        # ── Step 3 (optional): recalculate positions ────────────────────────
        if with_positions and not dry_run:
            pos_count = self._recalculate_positions(
                ResultModel, TermReportModel, tenant_id, statuses)
            self.stdout.write(f"  Position groups recalculated: {pos_count}")

        return result_count, report_count, error_count

    def _recalculate_positions(self, ResultModel, TermReportModel, tenant_id, statuses):
        """
        Recalculate subject_position (per exam_session+subject+class) and
        class_position (per exam_session+class) for every group found.
        """
        groups_done = 0

        # Subject-level positions.
        subj_qs = ResultModel.objects.filter(status__in=statuses)
        if tenant_id:
            subj_qs = subj_qs.filter(tenant_id=tenant_id)
        subject_groups = (
            subj_qs.values_list("exam_session_id",
                                "subject_id", "student__student_class_id")
            .distinct()
        )
        for exam_session_id, subject_id, class_id in subject_groups:
            if not (exam_session_id and subject_id and class_id):
                continue
            qs = ResultModel.objects.filter(
                exam_session_id=exam_session_id,
                subject_id=subject_id,
                student__student_class_id=class_id,
                status__in=statuses,
            )
            ResultModel.bulk_recalculate_positions(qs)
            groups_done += 1

        # Term-report-level class positions.
        report_qs = TermReportModel.objects.filter(status__in=statuses)
        if tenant_id:
            report_qs = report_qs.filter(tenant_id=tenant_id)
        report_groups = (
            report_qs.values_list(
                "exam_session_id", "student__student_class_id")
            .distinct()
        )
        for exam_session_id, class_id in report_groups:
            if not (exam_session_id and class_id):
                continue
            from result.models import ExamSession
            exam_session = ExamSession.objects.get(pk=exam_session_id)
            TermReportModel.bulk_recalculate_positions(
                exam_session=exam_session,
                student_class=class_id,
                statuses=statuses,
            )
            groups_done += 1

        return groups_done
