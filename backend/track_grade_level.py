import traceback
try:
    from teacher.models import Teacher
    list(Teacher.objects.select_related('grade_level')[:1])
except Exception as e:
    traceback.print_exc()