from django.core.management.base import BaseCommand
from django.db import connection

class Command(BaseCommand):
    help = "Fix result app tables missing columns"

    def handle(self, *args, **kwargs):
        with connection.cursor() as cursor:
            cursor.execute("""
    ALTER TABLE results_component_score 
    DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE results_component_score 
    ADD COLUMN IF NOT EXISTS tenant_id uuid,
    ...

    ALTER TABLE results_assessment_component
    DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE results_assessment_component
    ADD COLUMN tenant_id uuid,
    ...

    ALTER TABLE results_exam_type
    DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE results_exam_type
    ADD COLUMN tenant_id uuid,
    ...
""")
        self.stdout.write(self.style.SUCCESS("Successfully fixed all result tables"))
