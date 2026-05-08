from django.core.management.base import BaseCommand
from django.db import connection

class Command(BaseCommand):
    help = 'Fix results_component_score table missing columns'

    def handle(self, *args, **kwargs):
        with connection.cursor() as cursor:
            cursor.execute("""
                ALTER TABLE results_component_score 
                ADD COLUMN IF NOT EXISTS tenant_id bigint,
                ADD COLUMN IF NOT EXISTS student_id bigint,
                ADD COLUMN IF NOT EXISTS component_id bigint,
                ADD COLUMN IF NOT EXISTS exam_session_id bigint,
                ADD COLUMN IF NOT EXISTS subject_id bigint,
                ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
                ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
            """)
        self.stdout.write(self.style.SUCCESS('Successfully fixed results_component_score table'))