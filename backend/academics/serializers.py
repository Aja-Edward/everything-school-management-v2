# academics/serializers.py
from rest_framework import serializers
from .models import (
    AcademicSession,
    Term,
    SubjectAllocation,
    Curriculum,
    AcademicCalendar,
)

# goodImport Subject from subject app
from subject.models import Subject


class AcademicSessionSerializer(serializers.ModelSerializer):
    """Serializer for Academic Session"""

    is_ongoing = serializers.BooleanField(read_only=True)

    class Meta:
        model = AcademicSession
        fields = [
            "id",
            "name",
            "start_date",
            "end_date",
            "is_current",
            "is_active",
            "is_ongoing",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "is_ongoing"]

    def validate(self, data):
        """Validate session data"""
        start_date = data.get("start_date")
        end_date = data.get("end_date")

        if start_date and end_date and start_date >= end_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be after start date"}
            )

        return data


class TermSerializer(serializers.ModelSerializer):
    """Serializer for Term"""

    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    name_display = serializers.CharField(source="get_name_display", read_only=True)
    is_ongoing = serializers.BooleanField(read_only=True)

    class Meta:
        model = Term
        fields = [
            "id",
            "name",
            "name_display",
            "academic_session",
            "academic_session_name",
            "start_date",
            "end_date",
            "is_current",
            "is_active",
            "is_ongoing",
            "next_term_begins",
            "holidays_start",
            "holidays_end",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "is_ongoing"]

    def validate(self, data):
        """Validate term data"""
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        academic_session = data.get("academic_session")

        # Validate start and end dates
        if start_date and end_date and start_date >= end_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be after start date"}
            )

        # Validate term dates are within academic session
        if academic_session and start_date and end_date:
            if start_date < academic_session.start_date:
                raise serializers.ValidationError(
                    {
                        "start_date": f"Term start date cannot be before session start date ({academic_session.start_date})"
                    }
                )

            if end_date > academic_session.end_date:
                raise serializers.ValidationError(
                    {
                        "end_date": f"Term end date cannot be after session end date ({academic_session.end_date})"
                    }
                )

        return data


class SubjectSerializer(serializers.ModelSerializer):
    """Serializer for Subject"""

    subject_type_display = serializers.CharField(
        source="get_subject_type_display", read_only=True
    )
    education_level_list = serializers.ListField(read_only=True)

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "code",
            "description",
            "subject_type",
            "subject_type_display",
            "is_compulsory",
            "has_practical",
            "credit_units",
            "education_levels",
            "education_level_list",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]


class SubjectAllocationSerializer(serializers.ModelSerializer):
    """Serializer for Subject Allocation"""

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.CharField(
        source="teacher.user.full_name", read_only=True
    )
    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )

    class Meta:
        model = SubjectAllocation
        fields = [
            "id",
            "subject",
            "subject_name",
            "teacher",
            "teacher_name",
            "academic_session",
            "academic_session_name",
            "education_level",
            "student_class",
            "periods_per_week",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class CurriculumSerializer(serializers.ModelSerializer):
    """Serializer for Curriculum"""

    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    subjects_count = serializers.SerializerMethodField()

    class Meta:
        model = Curriculum
        fields = [
            "id",
            "name",
            "education_level",
            "academic_session",
            "academic_session_name",
            "description",
            "subjects_count",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_subjects_count(self, obj):
        return obj.subjects.count()


class AcademicCalendarSerializer(serializers.ModelSerializer):
    """Serializer for Academic Calendar Events"""

    event_type_display = serializers.CharField(
        source="get_event_type_display", read_only=True
    )
    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    term_name = serializers.CharField(
        source="term.get_name_display", read_only=True, allow_null=True
    )

    class Meta:
        model = AcademicCalendar
        fields = [
            "id",
            "title",
            "description",
            "event_type",
            "event_type_display",
            "academic_session",
            "academic_session_name",
            "term",
            "term_name",
            "start_date",
            "end_date",
            "start_time",
            "end_time",
            "location",
            "is_public",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, data):
        """Validate calendar event data"""
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        start_time = data.get("start_time")
        end_time = data.get("end_time")

        if end_date and start_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be after or equal to start date"}
            )

        if (
            start_time
            and end_time
            and end_date == start_date
            and end_time <= start_time
        ):
            raise serializers.ValidationError(
                {"end_time": "End time must be after start time for same-day events"}
            )

        return data
