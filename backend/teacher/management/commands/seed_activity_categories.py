"""
Management command: seed default staff activity categories for all (or one) tenant.

Usage:
    # Seed for ALL tenants
    python manage.py seed_activity_categories

    # Seed for a specific tenant by slug
    python manage.py seed_activity_categories --tenant kebi-international-academy

    # Force re-create (update existing defaults)
    python manage.py seed_activity_categories --force
"""
from django.core.management.base import BaseCommand, CommandError
from teacher.models import StaffActivityCategory, DEFAULT_ACTIVITY_CATEGORIES
from tenants.models import Tenant


class Command(BaseCommand):
    help = "Seed default staff activity categories for tenants."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            type=str,
            default=None,
            help="Tenant slug to seed (omit to seed all tenants)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            default=False,
            help="Update existing system-default categories (re-apply field configs)",
        )

    def handle(self, *args, **options):
        slug = options["tenant"]
        force = options["force"]

        if slug:
            try:
                tenants = [Tenant.objects.get(slug=slug)]
            except Tenant.DoesNotExist:
                raise CommandError(f"Tenant '{slug}' not found.")
        else:
            tenants = list(Tenant.objects.all())

        if not tenants:
            self.stdout.write(self.style.WARNING("No tenants found."))
            return

        total_created = 0
        total_updated = 0

        for tenant in tenants:
            self.stdout.write(f"\nTenant: {tenant.name} ({tenant.slug})")
            for cat_data in DEFAULT_ACTIVITY_CATEGORIES:
                name = cat_data["name"]
                code = cat_data["code"]
                # Separate DB operation from display so encoding errors don't mask DB errors
                created = None
                obj = None
                db_error = None
                try:
                    obj, created = StaffActivityCategory.objects.get_or_create(
                        tenant=tenant,
                        code=code,
                        defaults={**cat_data, "tenant": tenant, "is_system_default": True},
                    )
                except Exception as exc:
                    db_error = exc

                if db_error:
                    self.stderr.write(self.style.ERROR(f"  ERROR [{code}]: {db_error}"))
                    continue

                if created:
                    total_created += 1
                    self.stdout.write(self.style.SUCCESS(f"  Created: [{code}] {name}"))
                elif force:
                    for field in ("name", "icon", "description", "fields_config", "display_order", "applicable_to"):
                        setattr(obj, field, cat_data[field])
                    obj.is_system_default = True
                    obj.save()
                    total_updated += 1
                    self.stdout.write(self.style.WARNING(f"  Updated: [{code}] {name}"))
                else:
                    self.stdout.write(f"  Exists:  [{code}] {name}")

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created: {total_created} | Updated: {total_updated} | Tenants: {len(tenants)}"
            )
        )