from django.core.management.base import BaseCommand, CommandError
from teacher.models import AppraisalCriteria, DEFAULT_APPRAISAL_CRITERIA
from tenants.models import Tenant


class Command(BaseCommand):
    help = "Seed default appraisal criteria for all (or one) tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", type=str, default=None)
        parser.add_argument("--force", action="store_true", default=False)

    def handle(self, *args, **options):
        slug = options["tenant"]
        force = options["force"]
        tenants = [Tenant.objects.get(slug=slug)] if slug else list(Tenant.objects.all())
        created_total = updated_total = 0
        for tenant in tenants:
            self.stdout.write(f"\nTenant: {tenant.name}")
            for item in DEFAULT_APPRAISAL_CRITERIA:
                obj, created = AppraisalCriteria.objects.get_or_create(
                    tenant=tenant, code=item["code"],
                    defaults={**item, "tenant": tenant, "is_system_default": True, "is_active": True},
                )
                if created:
                    created_total += 1
                    self.stdout.write(self.style.SUCCESS(f"  Created: [{item['code']}] {item['name']}"))
                elif force:
                    for field in ("name", "description", "applicable_to", "max_score", "display_order"):
                        setattr(obj, field, item[field])
                    obj.is_system_default = True
                    obj.save()
                    updated_total += 1
                    self.stdout.write(self.style.WARNING(f"  Updated: [{item['code']}] {item['name']}"))
                else:
                    self.stdout.write(f"  Exists:  [{item['code']}] {item['name']}")
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Done. Created: {created_total} | Updated: {updated_total} | Tenants: {len(tenants)}"
        ))
