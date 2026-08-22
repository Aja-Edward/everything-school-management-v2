# parent/management/commands/backfill_relationship_tenants.py
from django.core.management.base import BaseCommand
from django.db import transaction

from parent.models import ParentStudentRelationship


class Command(BaseCommand):
    help = (
        "Stamp the tenant on ParentStudentRelationship rows that were created "
        "without one. Views that scope this table by tenant cannot see those rows."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        rows = ParentStudentRelationship.objects.filter(
            tenant__isnull=True
        ).select_related("student", "parent")

        total = rows.count()
        self.stdout.write(f"Relationships with no tenant: {total}")
        if not total:
            return

        fixed = 0
        problems = []

        for rel in rows:
            # The student is the authoritative side — a student belongs to
            # exactly one school. Fall back to the parent if it is missing.
            tenant_id = rel.student.tenant_id or rel.parent.tenant_id
            if not tenant_id:
                problems.append((rel.pk, "neither student nor parent has a tenant"))
                continue

            if dry_run:
                fixed += 1
                continue

            try:
                with transaction.atomic():
                    rel.tenant_id = tenant_id
                    rel.save(update_fields=["tenant"])
                fixed += 1
            except Exception as exc:
                # Stamping the tenant activates the uniqueness constraints that
                # a NULL tenant kept dormant, so a collision is possible here.
                problems.append((rel.pk, str(exc)[:160]))

        verb = "would be updated" if dry_run else "updated"
        self.stdout.write(self.style.SUCCESS(f"{fixed} {verb}"))

        if problems:
            self.stdout.write(self.style.WARNING(f"{len(problems)} need attention:"))
            for pk, reason in problems[:20]:
                self.stdout.write(f"  relationship {pk}: {reason}")
            if len(problems) > 20:
                self.stdout.write(f"  … and {len(problems) - 20} more")
