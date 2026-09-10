import logging
from django.utils import timezone
from rest_framework import serializers

from teacher.models import Teacher
from .models import (
    Attendance,
    AttendanceSession,
    AttendanceSettings,
    GateScan,
    ScanDirection,
    ScanNotification,
    StudentTag,
    TagStatus,
    normalize_tag_uid,
)

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


# ── Gate scanning: tag enrollment ─────────────────────────────────────────────

_HEX = set("0123456789ABCDEF")


def _validate_uid(value):
    """
    Normalize and sanity-check a scanned UID.

    Kept lenient on length: the exact tag family is a hardware decision, and
    UIDs run from 4 bytes (Mifare Classic) to 7 (NTAG21x) and longer. What is
    worth rejecting is obvious rubbish — an empty field, or a value that
    is not a hex rendering of some bytes at all.
    """
    normalized = normalize_tag_uid(value)
    if not normalized:
        raise serializers.ValidationError("A tag UID is required.")
    if len(normalized) < 4:
        raise serializers.ValidationError(
            "That UID looks too short to be a real tag.")
    if len(normalized) > 64:
        raise serializers.ValidationError("That UID is too long.")
    unexpected = set(normalized) - _HEX
    if unexpected:
        raise serializers.ValidationError(
            f"A UID should be hex. Unexpected characters: "
            f"{''.join(sorted(unexpected))}"
        )
    return normalized


def _student_identity(student):
    """
    The bundle a scanner shows the operator: enough to confirm the right
    child at a glance, and nothing more than that.
    """
    if student is None:
        return None
    user = getattr(student, "user", None)
    name = f"{user.first_name} {user.last_name}".strip() if user else ""
    return {
        "id": student.id,
        "name": name or None,
        "registration_number": student.registration_number,
        "class_display": student.get_class_display(),
        "section": student.section_id,
        "section_name": student.section.name if student.section_id else None,
        "profile_picture": student.profile_picture,
    }


class StudentTagSerializer(serializers.ModelSerializer):
    """Read shape for an enrolled tag."""

    student_detail = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    issued_by_name = serializers.SerializerMethodField()
    revoked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentTag
        fields = [
            "id",
            "uid",
            "label",
            "status", "status_display",
            "student", "student_detail",
            "issued_at", "issued_by", "issued_by_name",
            "revoked_at", "revoked_by", "revoked_by_name", "revoke_reason",
        ]
        read_only_fields = [
            "status", "issued_at", "issued_by",
            "revoked_at", "revoked_by", "revoke_reason",
        ]

    def get_student_detail(self, obj):
        return _student_identity(obj.student if obj.student_id else None)

    def get_status_display(self, obj):
        return obj.get_status_display()

    def _user_name(self, user):
        if not user:
            return None
        return f"{user.first_name} {user.last_name}".strip() or user.username

    def get_issued_by_name(self, obj):
        return self._user_name(obj.issued_by if obj.issued_by_id else None)

    def get_revoked_by_name(self, obj):
        return self._user_name(obj.revoked_by if obj.revoked_by_id else None)


class TagEnrollSerializer(serializers.Serializer):
    """Bind a chip to a student. The phone reads the UID; this records it."""

    student = serializers.IntegerField()
    uid = serializers.CharField(max_length=128)
    label = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default="")

    def validate_uid(self, value):
        return _validate_uid(value)


class TagRevokeSerializer(serializers.Serializer):
    """Retire a tag. Lost and deliberately revoked are tracked separately."""

    status = serializers.ChoiceField(
        choices=[TagStatus.REVOKED, TagStatus.LOST],
        required=False,
        default=TagStatus.REVOKED,
    )
    reason = serializers.CharField(
        required=False, allow_blank=True, default="")


class TagReassignSerializer(serializers.Serializer):
    """
    Move a UID to a different student in one atomic step: the tag holding it
    is retired and a fresh one is issued. Used when a chip turns out to be on
    the wrong bag — replacing a lost chip for the same student is a revoke
    followed by an ordinary enroll.
    """

    uid = serializers.CharField(max_length=128)
    student = serializers.IntegerField()
    reason = serializers.CharField(
        required=False, allow_blank=True, default="")

    def validate_uid(self, value):
        return _validate_uid(value)


# ── Gate scanning: recording a tap ────────────────────────────────────────────

class GateScanSerializer(serializers.ModelSerializer):
    """Read shape for a recorded scan."""

    student_detail = serializers.SerializerMethodField()
    direction_display = serializers.SerializerMethodField()
    scanned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = GateScan
        fields = [
            "id",
            "uid",
            "tag",
            "student", "student_detail",
            "direction", "direction_display",
            "scanned_at", "received_at",
            "scanned_by", "scanned_by_name",
            "device_id", "client_scan_id",
            "attendance",
            "is_duplicate",
        ]
        read_only_fields = fields

    def get_student_detail(self, obj):
        return _student_identity(obj.student if obj.student_id else None)

    def get_direction_display(self, obj):
        return obj.get_direction_display()

    def get_scanned_by_name(self, obj):
        user = obj.scanned_by if obj.scanned_by_id else None
        if not user:
            return None
        return f"{user.first_name} {user.last_name}".strip() or user.username


class ScanCreateSerializer(serializers.Serializer):
    """
    One tap. The scanner sends what it knows; everything else is derived
    server-side from the school's configured windows.
    """

    uid = serializers.CharField(max_length=128)
    direction = serializers.ChoiceField(choices=ScanDirection.choices)
    scanned_at = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="When the device read the tag. Defaults to now.",
    )
    device_id = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default="")
    client_scan_id = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default="",
        help_text="Idempotency key. Replaying it returns the stored scan.",
    )

    def validate_uid(self, value):
        return _validate_uid(value)


class ScanBatchSerializer(serializers.Serializer):
    """
    A flush of queued scans from a gate that was offline.

    Items are applied independently rather than as one transaction: if one
    scan carries an unenrolled chip, the other 199 children still get their
    attendance. The response reports each item's outcome by index.
    """

    scans = ScanCreateSerializer(many=True)

    def validate_scans(self, value):
        if not value:
            raise serializers.ValidationError("At least one scan is required.")
        if len(value) > 500:
            raise serializers.ValidationError(
                "Maximum 500 scans per batch request.")
        return value


class ScanNotificationSerializer(serializers.ModelSerializer):
    """What a parent sees in their alert list, and what staff see in the log."""

    student_detail = serializers.SerializerMethodField()
    channel_display = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()

    class Meta:
        model = ScanNotification
        fields = [
            "id",
            "scan", "direction",
            "student", "student_detail",
            "recipient",
            "channel", "channel_display",
            "destination",
            "subject", "body",
            "status", "status_display",
            "provider", "provider_message_id",
            "error", "attempts",
            "queued_at", "sent_at", "read_at",
        ]
        read_only_fields = fields

    def get_student_detail(self, obj):
        return _student_identity(obj.student if obj.student_id else None)

    def get_channel_display(self, obj):
        return obj.get_channel_display()

    def get_status_display(self, obj):
        return obj.get_status_display()

    def get_direction(self, obj):
        return obj.scan.direction if obj.scan_id else None


class AttendanceSettingsSerializer(serializers.ModelSerializer):
    """
    A school's attendance configuration.

    Read-only outside the model's own fields: tenant is never accepted from the
    body. The row is looked up from the request's tenant, so allowing it here
    would let one school rewrite another's settings by posting an id.
    """

    alert_policy_display = serializers.CharField(
        source="get_alert_policy_display", read_only=True
    )

    class Meta:
        model = AttendanceSettings
        fields = [
            "morning_opens",
            "late_after",
            "afternoon_opens",
            "dismissal_after",
            "duplicate_scan_window_seconds",
            "alert_policy",
            "alert_policy_display",
            "updated_at",
        ]
        read_only_fields = ["alert_policy_display", "updated_at"]

    def validate(self, attrs):
        """
        Run the model's own clean().

        ModelSerializer does not call it, and the rules here are cross-field --
        the late cut-off has to follow the morning opening, the afternoon
        cannot start before the late cut-off. Field-level validation cannot see
        those, so without this the API would accept a school day the admin form
        rejects, and the incoherent row would only surface later as scans
        landing in the wrong session.

        Merged onto the existing instance because updates are partial: a PATCH
        of alert_policy alone must still be checked against the times already
        stored, not against empty values.
        """
        instance = self.instance or AttendanceSettings()
        candidate = AttendanceSettings(
            pk=instance.pk,
            tenant_id=instance.tenant_id,
            morning_opens=attrs.get("morning_opens", instance.morning_opens),
            late_after=attrs.get("late_after", instance.late_after),
            afternoon_opens=attrs.get("afternoon_opens", instance.afternoon_opens),
            dismissal_after=attrs.get("dismissal_after", instance.dismissal_after),
        )
        candidate.clean()
        return attrs
