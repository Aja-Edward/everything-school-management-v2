from rest_framework import serializers

from classroom.models import Section
from subject.models import Subject
from teacher.models import Teacher

from .models import Timetable


class TimetableSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.__str__", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.__str__", read_only=True)

    class Meta:
        model = Timetable
        fields = [
            "id",
            "section",
            "section_name",
            "subject",
            "subject_name",
            "teacher",
            "teacher_name",
            "day",
            "start_time",
            "end_time",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Section, subject and teacher took any id on the platform, so an
        # entry could point at another school's class, subject or teacher.
        # Offered only the request's school's, another school's id reads as
        # one that does not exist. Bulk and CSV uploads share this serializer
        # (many=True passes the context to each row), so they are held too.
        # Platform staff with no school in view keep the whole list.
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return
        for name, model in (("section", Section), ("subject", Subject), ("teacher", Teacher)):
            if name in self.fields:
                self.fields[name].queryset = model.objects.filter(tenant=tenant)
