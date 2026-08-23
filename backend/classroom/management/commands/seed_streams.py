# classroom/management/commands/seed_streams.py
"""
Create the standard senior secondary streams for a school.

Senior secondary students are placed in a stream (Science, Arts, Commercial),
and the student bulk importer requires one for every SS row once a school's
education levels are recognised as senior secondary. A school with no Stream
records cannot import SS students at all.

Creates a StreamType (the configurable catalogue the UI reads) and a Stream
(what students are actually assigned to) for each name. Both are keyed on
(tenant, code), so re-running only fills gaps — nothing is renamed or removed.
"""

from django.core.management.base import BaseCommand, CommandError

DEFAULT_STREAMS = ["Science", "Arts", "Commercial"]

# Names the legacy Stream.stream_type CharField accepts. Anything else is left
# blank rather than written as an invalid choice.
LEGACY_STREAM_CODES = {"SCIENCE", "ARTS", "COMMERCIAL", "TECHNICAL"}


def stream_code(name):
    return name.strip().upper().replace(" ", "_")


class Command(BaseCommand):
    help = "Create the standard senior secondary streams for one or all tenants."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", help="Tenant slug. Omit with --all-tenants.")
        parser.add_argument(
            "--all-tenants", action="store_true", help="Process every tenant."
        )
        parser.add_argument(
            "--streams",
            default=",".join(DEFAULT_STREAMS),
            help=f"Comma-separated stream names (default: {', '.join(DEFAULT_STREAMS)}).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created without writing.",
        )

    def handle(self, *args, **options):
        from classroom.models import Stream, StreamType
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

        names = [n.strip() for n in options["streams"].split(",") if n.strip()]
        if not names:
            raise CommandError("No stream names given.")

        dry_run = options.get("dry_run")

        for tenant in tenants:
            self.stdout.write(f"\n=== {tenant.name} ({tenant.slug}) ===")
            created = existing = 0

            for order, name in enumerate(names, start=1):
                code = stream_code(name)

                if Stream.objects.filter(tenant=tenant, code=code).exists():
                    self.stdout.write(f"  {name}: already present")
                    existing += 1
                    continue

                if dry_run:
                    self.stdout.write(f"  {name}: would create (code {code})")
                    created += 1
                    continue

                stream_type, _ = StreamType.objects.get_or_create(
                    tenant=tenant,
                    code=code,
                    defaults={"name": name, "display_order": order},
                )

                Stream.objects.create(
                    tenant=tenant,
                    name=name,
                    code=code,
                    stream_type_new=stream_type,
                    # Legacy CharField is choice-restricted; leave it blank for
                    # any custom stream a school adds.
                    stream_type=code if code in LEGACY_STREAM_CODES else "",
                )
                self.stdout.write(self.style.SUCCESS(f"  {name}: created"))
                created += 1

            verb = "would create" if dry_run else "created"
            self.stdout.write(
                self.style.SUCCESS(
                    f"  {verb} {created}, {existing} already present"
                )
            )
