# management/commands/backfill_term_reports.py
from django.core.management.base import BaseCommand
from django.db import transaction
from result.models import (
    SeniorSecondaryResult, JuniorSecondaryResult,
    PrimaryResult, NurseryResult,
    SeniorSecondaryTermReport, JuniorSecondaryTermReport,
    PrimaryTermReport, NurseryTermReport,
)

class Command(BaseCommand):
    help = "Backfill missing term reports for all result types"

    def handle(self, *args, **options):
        self._backfill(
            SeniorSecondaryResult,
            SeniorSecondaryTermReport,
            "Senior Secondary",
        )
        self._backfill(
            JuniorSecondaryResult,
            JuniorSecondaryTermReport,
            "Junior Secondary",
        )
        self._backfill(PrimaryResult, PrimaryTermReport, "Primary")
        self._backfill(NurseryResult, NurseryTermReport, "Nursery")

    def _backfill(self, result_model, report_model, label):
        # Find results with no term_report linked
        orphans = result_model.objects.filter(
            term_report__isnull=True,
            status__in=["APPROVED", "PUBLISHED"],
        ).select_related("student", "exam_session")

        count = orphans.count()
        self.stdout.write(f"{label}: {count} orphaned results found")

        fixed = 0
        for result in orphans.iterator():
            try:
                with transaction.atomic():
                    report, _ = report_model.objects.get_or_create(
                        student=result.student,
                        exam_session=result.exam_session,
                        defaults={"status": "DRAFT"},
                    )
                    result_model.objects.filter(id=result.id).update(
                        term_report=report
                    )
                    report.calculate_metrics()
                    report.calculate_class_position()
                    fixed += 1
            except Exception as e:
                self.stderr.write(f"  ❌ Failed for result {result.id}: {e}")

        self.stdout.write(self.style.SUCCESS(
            f"{label}: fixed {fixed}/{count} orphaned results ✅"
        ))