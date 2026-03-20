# academics/serializers.py
from rest_framework import serializers
from .models import (
    TermType,
    CalendarEventType,
    EducationLevel,
    AcademicSession,
    Term,
    SubjectAllocation,
    Curriculum,
    AcademicCalendar,
)

from subject.models import Subject


# ==============================================================================
# NEW FK MODEL SERIALIZERS
# ==============================================================================


class TermTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TermType
        fields = [
            "id",
            "name",
            "code",
            "description",
            "display_order",
            "is_active",
        ]


class CalendarEventTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarEventType
        fields = [
            "id",
            "name",
            "code",
            "description",
            "color_code",
            "icon",
            "display_order",
            "is_active",
        ]


class EducationLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationLevel
        fields = [
            "id",
            "name",
            "code",
            "description",
            "display_order",
            "is_active",
        ]


# ==============================================================================
# ACADEMIC SESSION
# ==============================================================================

class AcademicSessionSerializer(serializers.ModelSerializer):
    """Serializer for Academic Session — no FK migration here"""

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
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        if start_date and end_date and start_date >= end_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be after start date"}
            )
        return data


# ==============================================================================
# TERM
# ==============================================================================

class TermSerializer(serializers.ModelSerializer):
    """
    Serializer for Term.
    UPDATED: term_type is a nested FK object on read; accepts PK on write via
    term_type_id.  The old 'name' and 'name_display' fields are kept as
    read-only computed fields so existing API consumers need no changes.
    """

    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    is_ongoing = serializers.BooleanField(read_only=True)

    # UPDATED: nested on read
    term_type = TermTypeSerializer(read_only=True)

    # UPDATED: PK on write
    term_type_id = serializers.PrimaryKeyRelatedField(
        queryset=TermType.objects.all(),
        source="term_type",
        write_only=True,
    )

    # Backward-compat read aliases
    name = serializers.SerializerMethodField()
    name_display = serializers.SerializerMethodField()

    class Meta:
        model = Term
        fields = [
            "id",
            "term_type",  # nested object (read)
            "term_type_id",  # PK (write)
            "name",  # backward-compat → term_type.name
            "name_display",  # backward-compat → term_type.name
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
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "is_ongoing",
            "name",
            "name_display",
        ]

    def get_name(self, obj):
        return obj.term_type.name if obj.term_type else ""

    def get_name_display(self, obj):
        return obj.term_type.name if obj.term_type else ""

    def validate(self, data):
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        academic_session = data.get("academic_session")

        if start_date and end_date and start_date >= end_date:
            raise serializers.ValidationError(
                {"end_date": "End date must be after start date"}
            )

        if academic_session and start_date and end_date:
            if start_date < academic_session.start_date:
                raise serializers.ValidationError(
                    {
                        "start_date": (
                            f"Term start date cannot be before session start date "
                            f"({academic_session.start_date})"
                        )
                    }
                )
            if end_date > academic_session.end_date:
                raise serializers.ValidationError(
                    {
                        "end_date": (
                            f"Term end date cannot be after session end date "
                            f"({academic_session.end_date})"
                        )
                    }
                )

        return data


# ==============================================================================
# SUBJECT
# ==============================================================================

class SubjectSerializer(serializers.ModelSerializer):
    """
    Subject serializer used within the academics app.
    subject_type on Subject is still a CharField with choices so
    get_subject_type_display() remains valid.
    """

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


# ==============================================================================
# SUBJECT ALLOCATION
# ==============================================================================

class SubjectAllocationSerializer(serializers.ModelSerializer):
    """
    Serializer for Subject Allocation.
    UPDATED: education_level is a nested FK object on read; PK on write.
    """

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.CharField(
        source="teacher.user.full_name", read_only=True
    )
    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )

    # UPDATED: nested on read
    education_level = EducationLevelSerializer(read_only=True)

    # UPDATED: PK on write
    education_level_id = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        source="education_level",
        write_only=True,
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
            "education_level",  # nested object (read)
            "education_level_id",  # PK (write)
            "student_class",
            "periods_per_week",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ==============================================================================
# CURRICULUM
# ==============================================================================

class CurriculumSerializer(serializers.ModelSerializer):
    """
    Serializer for Curriculum.
    UPDATED: education_level is a nested FK object on read; PK on write.
    """

    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    subjects_count = serializers.SerializerMethodField()

    # UPDATED: nested on read
    education_level = EducationLevelSerializer(read_only=True)

    # UPDATED: PK on write
    education_level_id = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        source="education_level",
        write_only=True,
    )

    class Meta:
        model = Curriculum
        fields = [
            "id",
            "name",
            "education_level",  # nested object (read)
            "education_level_id",  # PK (write)
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


# ==============================================================================
# ACADEMIC CALENDAR
# ==============================================================================

class AcademicCalendarSerializer(serializers.ModelSerializer):
    """
    Serializer for Academic Calendar Events.
    UPDATED: event_type is a nested FK object on read; PK on write via
    event_type_id.  event_type_display is kept as a backward-compat read field.
    """

    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    # term.name resolves through the backward-compat property on Term
    term_name = serializers.CharField(
        source="term.name", read_only=True, allow_null=True
    )

    # UPDATED: nested on read
    event_type = CalendarEventTypeSerializer(read_only=True)

    # UPDATED: PK on write
    event_type_id = serializers.PrimaryKeyRelatedField(
        queryset=CalendarEventType.objects.all(),
        source="event_type",
        write_only=True,
    )

    # Backward-compat display field (replaces get_event_type_display())
    event_type_display = serializers.SerializerMethodField()

    class Meta:
        model = AcademicCalendar
        fields = [
            "id",
            "title",
            "description",
            "event_type",  # nested object (read)
            "event_type_id",  # PK (write)
            "event_type_display",  # backward-compat string (read)
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
        read_only_fields = ["id", "created_at", "updated_at", "event_type_display"]

    def get_event_type_display(self, obj):
        """Mimics the old get_event_type_display() for API backward compat."""
        return obj.event_type.name if obj.event_type else ""

    def validate(self, data):
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
