"""
Verify that result rows carry the tenant their own relations imply.

fix_null_tenants assigns orphaned rows by iterating tenants and running
"UPDATE ... WHERE tenant_id IS NULL", so the first tenant it processes claims
every NULL row on the platform -- including other schools'. It runs on every
deploy from the Render build command, which makes this worth checking rather
than trusting.

For each result row the tenant is derived from the row's own student, and for
each component score from its parent result's student. Any row whose stored
tenant_id disagrees is reported.

Read-only: reports mismatches, does not repair them.

    python manage.py audit_result_tenants
    python manage.py audit_result_tenants --show 20
"""

from django.core.management.base import BaseCommand
from django.db.models import F


class Command(BaseCommand):
    help = "Report result rows whose tenant_id disagrees with their student's tenant."

    def add_arguments(self, parser):
        parser.add_argument(
            "--show",
            type=int,
            default=10,
            help="How many example mismatched ids to print per table.",
        )

    def handle(self, *args, **opts):
        from result.models import (
            ComponentScore,
            JuniorSecondaryResult,
            NurseryResult,
            PrimaryResult,
            SeniorSecondaryResult,
        )

        w = self.stdout.write
        show = opts["show"]
        total_bad = 0
        total_null = 0

        # (label, model, ComponentScore FK name pointing at this model)
        result_models = [
            ("NurseryResult", NurseryResult, "nursery_result"),
            ("PrimaryResult", PrimaryResult, "primary_result"),
            ("JuniorSecondaryResult", JuniorSecondaryResult, "junior_result"),
            ("SeniorSecondaryResult", SeniorSecondaryResult, "senior_result"),
        ]

        w("")
        w("=" * 72)
        w("  RESULT TENANT AUDIT")
        w("=" * 72)
        w("")
        w("  Result rows (row tenant vs student's tenant):")

        for label, model, _fk in result_models:
            total = model.objects.count()
            nulls = model.objects.filter(tenant__isnull=True).count()

            # Rows where both tenants are known and they disagree.
            bad_qs = (
                model.objects.exclude(tenant__isnull=True)
                .exclude(student__tenant__isnull=True)
                .exclude(tenant_id=F("student__tenant_id"))
            )
            bad = bad_qs.count()

            total_bad += bad
            total_null += nulls

            style = self.style.ERROR if bad else self.style.SUCCESS
            w(f"    {label:<24} {total:>7} rows | {nulls:>5} NULL | "
              f"{style(f'{bad} mismatched')}")
            if bad:
                w(f"        example ids: {list(bad_qs.values_list('id', flat=True)[:show])}")

        w("")
        w("  ComponentScore (row tenant vs parent result's student's tenant):")

        cs_total = ComponentScore.objects.count()
        cs_null = ComponentScore.objects.filter(tenant__isnull=True).count()
        cs_bad = 0
        cs_ids = []

        for _label, _model, fk in result_models:
            qs = (
                ComponentScore.objects.filter(**{f"{fk}__isnull": False})
                .exclude(tenant__isnull=True)
                .exclude(**{f"{fk}__student__tenant__isnull": True})
                .exclude(tenant_id=F(f"{fk}__student__tenant_id"))
            )
            n = qs.count()
            cs_bad += n
            if n:
                cs_ids.extend(list(qs.values_list("id", flat=True)[:show]))

        total_bad += cs_bad
        total_null += cs_null

        style = self.style.ERROR if cs_bad else self.style.SUCCESS
        w(f"    {'ComponentScore':<24} {cs_total:>7} rows | {cs_null:>5} NULL | "
          f"{style(f'{cs_bad} mismatched')}")
        if cs_ids:
            w(f"        example ids: {cs_ids[:show]}")

        w("")
        w("-" * 72)
        if total_bad == 0:
            w(self.style.SUCCESS(
                "  No mismatches: every row's tenant agrees with its student's."))
            if total_null:
                w(f"  {total_null} row(s) still have a NULL tenant -- those are "
                  f"invisible to every school.")
        else:
            w(self.style.ERROR(
                f"  {total_bad} row(s) belong to a different tenant than their "
                f"student does."))
            w("  That is what fix_null_tenants produces once more than one school")
            w("  has orphaned rows: the first tenant in its loop claims them all.")
