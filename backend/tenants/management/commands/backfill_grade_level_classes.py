"""
Create the missing Class row for grade levels that have none.

Sections attach to Class, not GradeLevel, so a grade level with no Class shows
"(not ready)" on the Academic settings tab and cannot take sections.
seed_grade_levels creates GradeLevel rows only, so every freshly-seeded school
hits this.

For each unlinked grade level this either:
  - links an existing Class that already matches by code or name, rather than
    creating a second "Nursery 1"; or
  - creates one, deriving code/grade_number/order from the grade level.

Dry run by default; pass --apply to write.

    python manage.py backfill_grade_level_classes --slug gods-treasure-schools
    python manage.py backfill_grade_level_classes --slug gods-treasure-schools --apply
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from tenants.models import Tenant


def code_for(name: str) -> str:
    """'Nursery 1' -> 'NURSERY_1'. Matches the convention of existing rows."""
    return (
        name.strip().upper().replace("-", "_").replace(" ", "_")
    )[:20]


class Command(BaseCommand):
    help = "Create or link the Class each grade level needs before sections can be added."

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True, help="Tenant slug.")
        parser.add_argument(
            "--apply", action="store_true",
            help="Write the changes. Without this the command only reports.",
        )

    def handle(self, *args, **opts):
        from classroom.models import Class, GradeLevel

        w = self.stdout.write
        apply_changes = opts["apply"]

        try:
            tenant = Tenant.objects.get(slug=opts["slug"])
        except Tenant.DoesNotExist:
            w(self.style.ERROR(f"No tenant with slug '{opts['slug']}'."))
            return

        linked_ids = set(
            Class.objects.filter(tenant=tenant, grade_level__isnull=False)
            .values_list("grade_level_id", flat=True)
        )
        missing = list(
            GradeLevel.objects.filter(tenant=tenant)
            .exclude(id__in=linked_ids)
            .select_related("education_level")
            .order_by("order")
        )

        w("")
        w("=" * 74)
        w(f"  BACKFILL GRADE LEVEL CLASSES -- {tenant.name}"
          f"  [{'APPLY' if apply_changes else 'DRY RUN'}]")
        w("=" * 74)

        if not missing:
            w(self.style.SUCCESS(
                "  Every grade level already has a Class. Nothing to do."))
            return

        w(f"  {len(missing)} grade level(s) without a Class:")
        created = linked = skipped = 0

        for gl in missing:
            code = code_for(gl.name)

            # Reuse an existing unlinked Class before creating a second one.
            existing = Class.objects.filter(tenant=tenant).filter(
                grade_level__isnull=True
            ).filter(code=code).first() or Class.objects.filter(
                tenant=tenant, grade_level__isnull=True, name=gl.name
            ).first()

            if existing:
                w(f"    link   {gl.name:<20} -> existing Class id={existing.id} "
                  f"(code={existing.code})")
                linked += 1
                if apply_changes:
                    existing.grade_level = gl
                    existing.save(update_fields=["grade_level"])
                continue

            # A Class with this code may exist and already be linked elsewhere;
            # unique_together is (tenant, code), so do not collide with it.
            if Class.objects.filter(tenant=tenant, code=code).exists():
                w(self.style.WARNING(
                    f"    skip   {gl.name:<20} -> code {code!r} already used by "
                    f"another Class"))
                skipped += 1
                continue

            w(f"    create {gl.name:<20} -> code={code} "
              f"education_level={gl.education_level.name} order={gl.order}")
            created += 1
            if apply_changes:
                with transaction.atomic():
                    Class.objects.create(
                        tenant=tenant,
                        name=gl.name,
                        code=code,
                        education_level=gl.education_level,
                        grade_level=gl,
                        grade_number=gl.order,
                        order=gl.order,
                    )

        w("")
        w("-" * 74)
        if apply_changes:
            w(self.style.SUCCESS(
                f"  Created {created}, linked {linked}, skipped {skipped}."))
            w("  Re-run diagnose_grade_level_sections to confirm, then add")
            w("  sections from the Academic settings tab.")
        else:
            w(f"  Would create {created}, link {linked}, skip {skipped}.")
            w("  Dry run -- nothing written. Re-run with --apply to commit.")
