"""
teacher/activity_serializers.py
Serializers for StaffActivityCategory and StaffActivityLog.
"""
from django.utils import timezone
from rest_framework import serializers
from .models import StaffActivityCategory, StaffActivityLog


class StaffActivityCategorySerializer(serializers.ModelSerializer):
    applicable_to_display = serializers.CharField(
        source="get_applicable_to_display", read_only=True
    )
    log_count = serializers.SerializerMethodField()

    class Meta:
        model = StaffActivityCategory
        fields = "__all__"
        read_only_fields = ["id", "is_system_default", "created_at", "updated_at"]

    def get_log_count(self, obj):
        return obj.logs.count()


class StaffActivityCategoryCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffActivityCategory
        fields = [
            "name", "code", "icon", "applicable_to",
            "description", "fields_config", "display_order", "is_active",
        ]

    def validate_fields_config(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("fields_config must be a list.")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each field definition must be an object.")
            if "key" not in item or "label" not in item or "type" not in item:
                raise serializers.ValidationError(
                    "Each field definition must have 'key', 'label', and 'type'."
                )
        return value


class StaffActivityLogSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_icon = serializers.CharField(source="category.icon", read_only=True)
    category_fields_config = serializers.JSONField(
        source="category.fields_config", read_only=True
    )
    staff_name = serializers.SerializerMethodField()
    staff_employee_id = serializers.CharField(
        source="teacher.employee_id", read_only=True
    )
    staff_type = serializers.CharField(source="teacher.staff_type", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()

    class Meta:
        model = StaffActivityLog
        fields = "__all__"
        read_only_fields = [
            "id", "teacher", "status", "admin_note",
            "reviewed_by", "reviewed_at", "created_at", "updated_at",
        ]

    def get_staff_name(self, obj):
        return obj.teacher.user.get_full_name()

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name()
        return None

    def get_duration_minutes(self, obj):
        if obj.start_time and obj.end_time:
            from datetime import datetime, date
            start = datetime.combine(date.today(), obj.start_time)
            end = datetime.combine(date.today(), obj.end_time)
            diff = (end - start).total_seconds() / 60
            return int(diff) if diff > 0 else None
        return None


class StaffActivityLogCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffActivityLog
        fields = [
            "category", "activity_date", "start_time", "end_time",
            "title", "description", "details", "attachment_url",
        ]

    def validate(self, attrs):
        category = attrs.get("category")
        details = attrs.get("details", {})
        if category:
            for field_def in (category.fields_config or []):
                if field_def.get("required") and not details.get(field_def["key"]):
                    raise serializers.ValidationError(
                        {field_def["key"]: f"'{field_def['label']}' is required for this activity type."}
                    )
        return attrs


class ActivityReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject"])
    admin_note = serializers.CharField(required=False, allow_blank=True)
