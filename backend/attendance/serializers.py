import logging
from rest_framework import serializers
from .models import Attendance
from teacher.models import Teacher

logger = logging.getLogger(__name__)


class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()
    teacher = serializers.PrimaryKeyRelatedField(
        queryset=Teacher.objects.all(), required=False, allow_null=True
    )
    student_stream = serializers.SerializerMethodField()
    student_stream_name = serializers.SerializerMethodField()
    student_stream_type = serializers.SerializerMethodField()
    student_education_level = serializers.SerializerMethodField()
    student_education_level_display = serializers.SerializerMethodField()
    student_class_display = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = [
            "id",
            "student",
            "student_name",
            "teacher",
            "teacher_name",
            "section",
            "section_name",
            "date",
            "status",
            "time_in",
            "time_out",
            "student_stream",
            "student_stream_name",
            "student_stream_type",
            "student_education_level",
            "student_education_level_display",
            "student_class_display",
        ]
        extra_kwargs = {
            "student": {"required": True},
            "section": {"required": True},
            "date": {"required": True},
            "status": {"required": True},
        }

    def get_student_name(self, obj):
        if obj.student and obj.student.user:
            return f"{obj.student.user.first_name} {obj.student.user.last_name}"
        return None

    def get_section_name(self, obj):
        if obj.section:
            return obj.section.name
        return None

    def get_teacher_name(self, obj):
        if obj.teacher and obj.teacher.user:
            return f"{obj.teacher.user.first_name} {obj.teacher.user.last_name}"
        return None

    def get_student_stream(self, obj):
        if obj.student and obj.student.stream:
            return obj.student.stream.id
        return None

    def get_student_stream_name(self, obj):
        if obj.student and obj.student.stream:
            return obj.student.stream.name
        return None

    def get_student_stream_type(self, obj):
        if obj.student and obj.student.stream:
            return obj.student.stream.stream_type
        return None

    def get_student_education_level(self, obj):
        return obj.student.education_level if obj.student else None

    def get_student_education_level_display(self, obj):
        return obj.student.education_level_display if obj.student else None

    def get_student_class_display(self, obj):
        return obj.student.get_class_display() if obj.student else None

    def validate(self, data):
        # Only check on create (not update)
        if self.instance is None:
            if all(k in data for k in ("student", "date", "section")):
                exists = Attendance.objects.filter(
                    student=data["student"],
                    date=data["date"],
                    section=data["section"],
                ).exists()
                if exists:
                    raise serializers.ValidationError(
                        "Attendance for this student, date, and section already exists."
                    )
        return data
