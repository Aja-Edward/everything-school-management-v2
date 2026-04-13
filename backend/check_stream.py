import django
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from students.models import Student
from classroom.models import Stream

# Check all streams
print("=== ALL STREAMS ===")
for s in Stream.objects.all():
    print(f"ID:{s.id} | name:{s.name} | tenant:{s.tenant_id}")

# Check this specific student
print("\n=== STUDENT STREAM ===")
student = Student.objects.get(id=7)
print(f"Student: {student.full_name}")
print(f"Stream FK value: {student.stream_id}")
print(f"Stream object: {student.stream}")