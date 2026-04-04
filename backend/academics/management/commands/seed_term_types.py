from django.core.management.base import BaseCommand
from tenants.models import Tenant
from academics.models import TermType


class Command(BaseCommand):
    help = "Seed default term types for existing tenants"

    def handle(self, *args, **kwargs):
        created_count = 0
        skipped_count = 0

        for tenant in Tenant.objects.all():
            if TermType.objects.filter(tenant=tenant).exists():
                self.stdout.write(
                    self.style.WARNING(f"⏭️ Skipped: {tenant.name} (already has term types)")
                )
                skipped_count += 1
                continue

            TermType.objects.bulk_create([
                TermType(name="First Term", code="FT", display_order=1, tenant=tenant),
                TermType(name="Second Term", code="ST", display_order=2, tenant=tenant),
                TermType(name="Third Term", code="TT", display_order=3, tenant=tenant),
            ])

            self.stdout.write(
                self.style.SUCCESS(f"✅ Created term types for {tenant.name}")
            )
            created_count += 1

        self.stdout.write("\n📊 SUMMARY:")
        self.stdout.write(f"✅ Created: {created_count}")
        self.stdout.write(f"⏭️ Skipped: {skipped_count}")