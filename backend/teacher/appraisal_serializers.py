"""
teacher/appraisal_serializers.py
Serializers for the Performance Appraisal system and Staff Notes.
"""
from django.utils import timezone
from rest_framework import serializers
from .models import (
    AppraisalCriteria, PerformanceAppraisal, AppraisalScore, StaffNote
)


# ── Appraisal Criteria ────────────────────────────────────────────────────────

class AppraisalCriteriaSerializer(serializers.ModelSerializer):
    applicable_to_display = serializers.CharField(
        source="get_applicable_to_display", read_only=True
    )

    class Meta:
        model = AppraisalCriteria
        fields = "__all__"
        read_only_fields = ["id", "is_system_default", "created_at"]


class AppraisalCriteriaWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppraisalCriteria
        fields = [
            "name", "code", "description", "applicable_to",
            "max_score", "display_order", "is_active",
        ]


# ── Appraisal Score ───────────────────────────────────────────────────────────

class AppraisalScoreSerializer(serializers.ModelSerializer):
    criteria_name = serializers.CharField(source="criteria.name", read_only=True)
    criteria_code = serializers.CharField(source="criteria.code", read_only=True)
    max_score = serializers.IntegerField(source="criteria.max_score", read_only=True)
    score_percentage = serializers.SerializerMethodField()

    class Meta:
        model = AppraisalScore
        fields = [
            "id", "criteria", "criteria_name", "criteria_code",
            "max_score", "score", "score_percentage", "comment",
        ]

    def get_score_percentage(self, obj):
        if obj.criteria.max_score:
            return round((obj.score / obj.criteria.max_score) * 100, 1)
        return 0


class AppraisalScoreWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppraisalScore
        fields = ["criteria", "score", "comment"]

    def validate_score(self, value):
        if value < 1:
            raise serializers.ValidationError("Score must be at least 1.")
        return value


# ── Performance Appraisal ─────────────────────────────────────────────────────

class PerformanceAppraisalSerializer(serializers.ModelSerializer):
    scores = AppraisalScoreSerializer(many=True, read_only=True)
    teacher_name = serializers.SerializerMethodField()
    teacher_employee_id = serializers.CharField(
        source="teacher.employee_id", read_only=True
    )
    teacher_staff_type = serializers.CharField(
        source="teacher.staff_type", read_only=True
    )
    teacher_class_name = serializers.SerializerMethodField()
    appraiser_name = serializers.SerializerMethodField()
    period_display = serializers.CharField(source="get_period_display", read_only=True)
    appraiser_role_display = serializers.CharField(
        source="get_appraiser_role_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    overall_score = serializers.FloatField(read_only=True)
    overall_grade = serializers.CharField(read_only=True)

    class Meta:
        model = PerformanceAppraisal
        fields = "__all__"
        read_only_fields = [
            "id", "status", "submitted_at", "acknowledged_at",
            "teacher_response", "created_at", "updated_at",
        ]

    def get_teacher_name(self, obj):
        return obj.teacher.user.get_full_name()

    def get_teacher_class_name(self, obj):
        try:
            return obj.teacher.level or ""
        except Exception:
            return ""

    def get_appraiser_name(self, obj):
        if obj.appraiser:
            return obj.appraiser.get_full_name()
        return "—"


class PerformanceAppraisalCreateSerializer(serializers.ModelSerializer):
    scores = AppraisalScoreWriteSerializer(many=True, required=False)

    class Meta:
        model = PerformanceAppraisal
        fields = [
            "teacher", "appraiser_role", "period", "academic_year",
            "overall_comment", "recommendation", "scores",
        ]

    def create(self, validated_data):
        scores_data = validated_data.pop("scores", [])
        appraisal = PerformanceAppraisal.objects.create(**validated_data)
        for score_data in scores_data:
            AppraisalScore.objects.create(appraisal=appraisal, **score_data)
        return appraisal

    def update(self, instance, validated_data):
        scores_data = validated_data.pop("scores", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if scores_data is not None:
            # Replace all scores
            instance.scores.all().delete()
            for score_data in scores_data:
                AppraisalScore.objects.create(appraisal=instance, **score_data)
        return instance


class AppraisalSubmitSerializer(serializers.Serializer):
    """Used when appraiser submits a draft appraisal."""
    pass


class AppraisalAcknowledgeSerializer(serializers.Serializer):
    """Used when the teacher acknowledges an appraisal."""
    teacher_response = serializers.CharField(required=False, allow_blank=True)


# ── Staff Note ────────────────────────────────────────────────────────────────

class StaffNoteSerializer(serializers.ModelSerializer):
    teacher_name = serializers.SerializerMethodField()
    teacher_employee_id = serializers.CharField(
        source="teacher.employee_id", read_only=True
    )
    issued_by_name = serializers.SerializerMethodField()
    note_type_display = serializers.CharField(
        source="get_note_type_display", read_only=True
    )
    category_display = serializers.CharField(
        source="get_category_display", read_only=True
    )
    is_positive = serializers.BooleanField(read_only=True)

    class Meta:
        model = StaffNote
        fields = "__all__"
        read_only_fields = [
            "id", "issued_by", "is_acknowledged",
            "acknowledged_at", "teacher_comment", "created_at", "updated_at",
        ]

    def get_teacher_name(self, obj):
        return obj.teacher.user.get_full_name()

    def get_issued_by_name(self, obj):
        if obj.issued_by:
            return obj.issued_by.get_full_name()
        return "—"


class StaffNoteCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffNote
        fields = [
            "teacher", "note_type", "category", "title", "content",
        ]


class StaffNoteAcknowledgeSerializer(serializers.Serializer):
    teacher_comment = serializers.CharField(required=False, allow_blank=True)
