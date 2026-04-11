from django.core.management.base import BaseCommand
from teacher.models import Teacher
import traceback


class Command(BaseCommand):
    help = "Track grade_level relation issue"

    def handle(self, *args, **kwargs):
        try:
            teachers = Teacher.objects.select_related('user')[:1]
            print(list(teachers))
            self.stdout.write(self.style.SUCCESS("✅ Query executed successfully"))
        except Exception as e:
            traceback.print_exc()
            self.stdout.write(self.style.ERROR("❌ Error occurred"))