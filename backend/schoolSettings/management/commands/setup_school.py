from django.core.management.base import BaseCommand
from tenants.models import Tenant, TenantSettings


class Command(BaseCommand):
    help = "List all tenants or create TenantSettings for a tenant"

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-slug',
            type=str,
            help='Tenant slug to update settings for',
        )
        parser.add_argument(
            '--school-code',
            type=str,
            help='School code to set',
        )

    def handle(self, *args, **options):
        try:
            tenant_slug = options.get('tenant_slug')
            school_code = options.get('school_code')

            if tenant_slug:
                # Update specific tenant
                tenant = Tenant.objects.filter(slug=tenant_slug).first()
                if not tenant:
                    self.stdout.write(
                        self.style.ERROR(f"✗ Tenant with slug '{tenant_slug}' not found")
                    )
                    return

                settings, created = TenantSettings.objects.get_or_create(tenant=tenant)

                if school_code:
                    settings.school_code = school_code
                    settings.save(update_fields=['school_code'])

                action = "Created" if created else "Found"
                self.stdout.write(
                    self.style.SUCCESS(f"✓ {action} settings for: {tenant.name}")
                )
                self.stdout.write(f"  School Name: {tenant.name}")
                self.stdout.write(f"  School Code: {settings.school_code}")
                self.stdout.write(f"  Slug: {tenant.slug}")
            else:
                # List all tenants
                tenants = Tenant.objects.filter(is_active=True)
                self.stdout.write(self.style.SUCCESS(f"\n✓ Found {tenants.count()} active tenant(s):\n"))

                for tenant in tenants:
                    try:
                        settings = tenant.settings
                        school_code = settings.school_code
                    except TenantSettings.DoesNotExist:
                        school_code = "(no settings)"

                    self.stdout.write(f"  • {tenant.name}")
                    self.stdout.write(f"    Slug: {tenant.slug}")
                    self.stdout.write(f"    Code: {school_code}")
                    self.stdout.write("")

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"✗ Error: {str(e)}"))
            raise
