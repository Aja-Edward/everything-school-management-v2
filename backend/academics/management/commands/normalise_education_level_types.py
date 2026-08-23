# academics/management/commands/normalise_education_level_types.py
"""
Rewrite EducationLevel.level_type to the identifiers the codebase compares against.

Tenants seeded before the defaults were corrected carry level_type 'JSS'/'SSS',
while every filter in the codebase looks for 'JUNIOR_SECONDARY'/'SENIOR_SECONDARY'.
Those comparisons return no rows rather than raising, so the mismatch shows up as
missing data — teachers seeing no secondary grade levels, subject pickers coming
back empty.

Only level_type is touched. `name` and `code` are left exactly as they are, and a
level whose type names nothing recognisable is skipped rather than guessed at.

Read the warning printed for senior secondary before running this: making SSS
canonical activates the student importer's stream requirement.
"""

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Normalise EducationLevel.level_type to canonical identifiers."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", help="Tenant slug. Omit with --all-tenants.")
        parser.add_argument(
            "--all-tenants", action="store_true", help="Process every tenant."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )

    def handle(self, *args, **options):
        from academics.models import EducationLevel
        from classroom.models import Stream
        from common.education_levels import canonical_level_type
        from tenants.models import Tenant

        slug = options.get("tenant")
        if not slug and not options.get("all_tenants"):
            raise CommandError("Pass --tenant <slug> or --all-tenants.")

        tenants = (
            Tenant.objects.all() if options.get("all_tenants")
            else Tenant.objects.filter(slug=slug)
        )
        if not tenants.exists():
            raise CommandError(f"No tenant matches '{slug}'.")

        dry_run = options.get("dry_run")

        for tenant in tenants:
            self.stdout.write(f"\n=== {tenant.name} ({tenant.slug}) ===")

            changed = 0
            senior_affected = False

            for level in EducationLevel.objects.filter(tenant=tenant):
                canonical = canonical_level_type(
                    level.level_type or level.code or level.name
                )

                if canonical is None:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  skipped {level.name!r} — level_type "
                            f"{level.level_type!r} matches no known level"
                        )
                    )
                    continue

                if level.level_type == canonical:
                    self.stdout.write(f"  {level.name}: already {canonical}")
                    continue

                self.stdout.write(
                    f"  {level.name}: {level.level_type!r} -> {canonical!r}"
                )
                if canonical == "SENIOR_SECONDARY":
                    senior_affected = True

                if not dry_run:
                    level.level_type = canonical
                    level.save(update_fields=["level_type"])
                changed += 1

            verb = "would update" if dry_run else "updated"
            self.stdout.write(self.style.SUCCESS(f"  {verb} {changed} levels"))

            # Making SSS canonical switches on a rule that was previously inert.
            if senior_affected and not Stream.objects.filter(tenant=tenant).exists():
                self.stdout.write(
                    self.style.WARNING(
                        "  ⚠ This school has no Stream records. Senior secondary is\n"
                        "    now recognised as such, so the student bulk importer will\n"
                        "    require a stream for every SS student and reject rows\n"
                        "    without one. Create Science/Arts/Commercial before the\n"
                        "    next student upload."
                    )
                )
