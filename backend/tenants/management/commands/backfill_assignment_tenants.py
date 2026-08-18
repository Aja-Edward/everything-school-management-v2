"""
Backfill NULL tenant_id on ClassroomTeacherAssignment (and ClassroomCoTeacher)
by deriving each row's tenant from its OWN classroom.

Why not fix_null_tenants: that command loops over every tenant running
"UPDATE ... SET tenant_id = <tenant> WHERE tenant_id IS NULL", so whichever
tenant is processed first claims every orphaned row on the platform,
including rows belonging to other schools. Correct on a single-tenant
database, silently destructive on a multi-tenant one.

This derives the tenant per row from classroom.tenant_id, cross-checks it
against teacher.tenant_id, and refuses to touch any row where the two
disagree or where neither is known.

Dry run by default -- pass --apply to write.

    python manage.py backfill_assignment_tenants
    python manage.py backfill_assignment_tenants --apply
    python manage.py backfill_assignment_tenants --apply --slug kebi-international-academy
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = ("Backfill NULL tenant_id on teacher assignments, deriving each "
            "row's tenant from its classroom.")

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Write the changes. Without this the command only reports.",
        )
        parser.add_argument(
            "--slug",
            help="Restrict to rows whose classroom belongs to this tenant.",
        )

    def handle(self, *args, **opts):
        from classroom.models import ClassroomCoTeacher, ClassroomTeacherAssignment

        w = self.stdout.write
        apply_changes = opts["apply"]

        w("")
        w("=" * 72)
        w("  BACKFILL ASSIGNMENT TENANTS"
          f"  [{'APPLY' if apply_changes else 'DRY RUN'}]")
        w("=" * 72)

        total_fixed = 0
        for model in (ClassroomTeacherAssignment, ClassroomCoTeacher):
            name = model.__name__
            qs = model.objects.filter(tenant__isnull=True).select_related(
                "classroom", "teacher")
            if opts["slug"]:
                qs = qs.filter(classroom__tenant__slug=opts["slug"])

            rows = list(qs)
            w("")
            w(f"  {name}: {len(rows)} row(s) with NULL tenant_id")
            if not rows:
                continue

            by_tenant = {}
            skipped_no_source = []
            skipped_mismatch = []

            for row in rows:
                classroom_tenant = getattr(row.classroom, "tenant_id", None)
                teacher_tenant = getattr(row.teacher, "tenant_id", None)

                if classroom_tenant is None:
                    # Fall back to the teacher only when the classroom cannot say.
                    if teacher_tenant is None:
                        skipped_no_source.append(row.pk)
                        continue
                    resolved = teacher_tenant
                else:
                    resolved = classroom_tenant
                    # Cross-check: a disagreement means the row is genuinely
                    # ambiguous and must not be guessed at.
                    if teacher_tenant is not None and teacher_tenant != classroom_tenant:
                        skipped_mismatch.append(row.pk)
                        continue

                by_tenant.setdefault(resolved, []).append(row.pk)

            for tenant_id, pks in by_tenant.items():
                slug = self._slug_for(tenant_id)
                w(f"    -> {len(pks):>4} row(s) resolve to {slug}")
                if apply_changes:
                    with transaction.atomic():
                        model.objects.filter(pk__in=pks).update(
                            tenant_id=tenant_id)
                    total_fixed += len(pks)

            if skipped_mismatch:
                w(self.style.ERROR(
                    f"    !! {len(skipped_mismatch)} row(s) SKIPPED: classroom "
                    f"and teacher belong to different tenants"))
                w(f"       ids: {skipped_mismatch[:20]}")
            if skipped_no_source:
                w(self.style.WARNING(
                    f"    ?? {len(skipped_no_source)} row(s) SKIPPED: neither "
                    f"classroom nor teacher has a tenant"))
                w(f"       ids: {skipped_no_source[:20]}")

        w("")
        w("-" * 72)
        if apply_changes:
            w(self.style.SUCCESS(f"  Updated {total_fixed} row(s)."))
            w("  Re-run diagnose_teacher_access to confirm teachers can now")
            w("  see their subjects.")
        else:
            w("  Dry run -- nothing was written. Re-run with --apply to commit.")

    def _slug_for(self, tenant_id):
        from tenants.models import Tenant
        if tenant_id is None:
            return "(none)"
        return (
            Tenant.objects.filter(pk=tenant_id)
            .values_list("slug", flat=True)
            .first()
            or str(tenant_id)
        )
