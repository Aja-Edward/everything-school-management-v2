from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Backfill NULL tenant_id on result tables'

    def handle(self, *args, **options):
        tables = [
            'results_component_score',
            'results_nursery_result',
            'results_primary_result',
            'results_junior_secondary_result',
            'results_senior_secondary_result',
        ]
        with connection.cursor() as c:
            c.execute("SELECT id, slug FROM tenants WHERE is_active = TRUE")
            tenants = c.fetchall()
            for tenant_id, slug in tenants:
                for table in tables:
                    c.execute(
                        f"UPDATE {table} SET tenant_id = %s WHERE tenant_id IS NULL",
                        [tenant_id]
                    )
                    if c.rowcount:
                        self.stdout.write(
                            f"  {table}: fixed {c.rowcount} rows for {slug}")
        self.stdout.write(self.style.SUCCESS('Done'))
