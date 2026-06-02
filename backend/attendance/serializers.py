import logging
from django.utils import timezone
from rest_framework import serializers

from teacher.models import Teacher
from .models import Attendance, AttendanceSession

logger = logging.getLogger(__name__)


class AttendanceSerializer(serializers.ModelSerializer):
    """
    Full read/write serializer for Attendance.

    Write fields  : student, teacher, section, date, session, status, time_in, time_out,
                    back_fill_reason
    Computed read : all _name / _display helpers, marked_late, audit timestamps
    """

    # ── Computed display fields ───────────────────────────────────────────────

    student_name = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()
    session_display = serializers.SerializerMethodField()
    student_stream = serializers.SerializerMethodField()
    student_stream_name = serializers.SerializerMethodField()
    student_stream_type = serializers.SerializerMethodField()
    student_education_level = serializers.SerializerMethodField()
    student_education_level_display = serializers.SerializerMethodField()
    student_class_display = serializers.SerializerMethodField()

    # ── Writable FK ──────────────────────────────────────────────────────────

    teacher = serializers.PrimaryKeyRelatedField(
        queryset=Teacher.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Attendance
        fields = [
            # identifiers
            "id",
            # core
            "student",        "student_name",
            "teacher",        "teacher_name",
            "section",        "section_name",
            "date",
            "session",        "session_display",
            "status",
            # times
            "time_in",        "time_out",
            # audit
            "marked_late",
            "back_fill_reason",
            "created_at",     "updated_at",
            # student extras
            "student_stream",        "student_stream_name",
            "student_stream_type",
            "student_education_level",
            "student_education_level_display",
            "student_class_display",
        ]
        read_only_fields = ["marked_late", "created_at", "updated_at"]
        extra_kwargs = {
            "student": {"required": True},
            "section": {"required": True},
            "date":    {"required": True},
            "status":  {"required": True},
            "session": {"required": False},   # defaults to MORNING
        }

    # ── Getters ───────────────────────────────────────────────────────────────

    def get_student_name(self, obj):
        if obj.student_id and obj.student.user:
            return f"{obj.student.user.first_name} {obj.student.user.last_name}"
        return None

    def get_teacher_name(self, obj):
        if obj.teacher_id and obj.teacher.user:
            return f"{obj.teacher.user.first_name} {obj.teacher.user.last_name}"
        return None

    def get_section_name(self, obj):
        return obj.section.name if obj.section_id else None

    def get_session_display(self, obj):
        return obj.get_session_display()

    def get_student_stream(self, obj):
        if obj.student_id and obj.student.stream:
            return obj.student.stream.id
        return None

    def get_student_stream_name(self, obj):
        if obj.student_id and obj.student.stream:
            return obj.student.stream.name
        return None

    def get_student_stream_type(self, obj):
        if obj.student_id and obj.student.stream:
            return obj.student.stream.stream_type
        return None

    def get_student_education_level(self, obj):
        return obj.student.education_level if obj.student_id else None

    def get_student_education_level_display(self, obj):
        return obj.student.education_level_display if obj.student_id else None

    def get_student_class_display(self, obj):
        return obj.student.get_class_display() if obj.student_id else None

    # ── Validation ────────────────────────────────────────────────────────────

    def validate(self, data):
        time_in = data.get("time_in")
        time_out = data.get("time_out")
        if time_in and time_out and time_in >= time_out:
            raise serializers.ValidationError(
                {"time_out": "Time out must be after time in."}
            )

        # Duplicate check on create only (UPDATE is always allowed — it's an upsert)
        if self.instance is None:
            student = data.get("student")
            date = data.get("date")
            section = data.get("section")
            session = data.get("session", AttendanceSession.MORNING)
            if student and date and section and session:
                if Attendance.objects.filter(
                    student=student,
                    date=date,
                    section=section,
                    session=session,
                ).exists():
                    raise serializers.ValidationError(
                        "Attendance for this student, date, section, and session already exists."
                    )
        return data


# ── Lightweight serializer for bulk operations ────────────────────────────────

class AttendanceBulkItemSerializer(serializers.Serializer):
    """Single item inside a bulk-upsert payload."""

    student = serializers.IntegerField()
    section = serializers.IntegerField()
    date = serializers.DateField()
    session = serializers.ChoiceField(
        choices=AttendanceSession.choices,
        default=AttendanceSession.MORNING,
    )
    status = serializers.ChoiceField(choices=Attendance.STATUS_CHOICES)
    teacher = serializers.IntegerField(required=False, allow_null=True)
    time_in = serializers.TimeField(required=False, allow_null=True)
    time_out = serializers.TimeField(required=False, allow_null=True)
    back_fill_reason = serializers.CharField(
        required=False, allow_blank=True, default="")

    def validate(self, data):
        time_in = data.get("time_in")
        time_out = data.get("time_out")
        if time_in and time_out and time_in >= time_out:
            raise serializers.ValidationError(
                {"time_out": "Time out must be after time in."}
            )
        return data


class AttendanceBulkUpsertSerializer(serializers.Serializer):
    """Wrapper for the bulk-upsert action."""
    records = AttendanceBulkItemSerializer(many=True)

    def validate_records(self, value):
        if not value:
            raise serializers.ValidationError(
                "At least one record is required.")
        if len(value) > 500:
            raise serializers.ValidationError(
                "Maximum 500 records per bulk request."
            )
        return value


# ── Statistics serializer (response shape for /stats/ endpoint) ───────────────

class AttendanceStatsSerializer(serializers.Serializer):
    """Read-only response for the aggregated stats endpoint."""
    total_records = serializers.IntegerField()
    present_count = serializers.IntegerField()
    absent_count = serializers.IntegerField()
    late_count = serializers.IntegerField()
    excused_count = serializers.IntegerField()
    attendance_rate = serializers.FloatField()
    session_breakdown = serializers.DictField(child=serializers.DictField())
