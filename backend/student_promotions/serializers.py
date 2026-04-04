"""
student_promotions/serializers.py
"""

from rest_framework import serializers
from .models import StudentPromotion, PromotionRule
from academics.models import AcademicSession, EducationLevel
from classroom.models import Class as StudentClass


class PromotionRuleSerializer(serializers.ModelSerializer):
    education_level_name = serializers.CharField(
        source="education_level.name", read_only=True
    )
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = PromotionRule
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]


class PromotionRuleCreateUpdateSerializer(serializers.ModelSerializer):
    education_level = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all()
    )

    class Meta:
        model = PromotionRule
        fields = [
            "education_level",
            "pass_threshold",
            "require_all_three_terms",
            "is_active",
        ]

    def validate_pass_threshold(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Threshold must be between 0 and 100")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class StudentPromotionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_admission_number = serializers.CharField(
        source="student.registration_number", read_only=True
    )
    student_class_name = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )
    education_level = serializers.CharField(
        source="student.education_level", read_only=True
    )
    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    promotion_type_display = serializers.CharField(
        source="get_promotion_type_display", read_only=True, allow_null=True
    )
    processed_by_name = serializers.CharField(
        source="processed_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = StudentPromotion
        fields = [
            "id",
            "student",
            "student_name",
            "student_admission_number",
            "student_class",
            "student_class_name",
            "education_level",
            "academic_session",
            "academic_session_name",
            "term1_average",
            "term2_average",
            "term3_average",
            "session_average",
            "terms_counted",
            "status",
            "status_display",
            "promotion_type",
            "promotion_type_display",
            "reason",
            "processed_by",
            "processed_by_name",
            "processed_at",
            "pass_threshold_applied",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "term1_average",
            "term2_average",
            "term3_average",
            "session_average",
            "terms_counted",
            "pass_threshold_applied",
            "processed_at",
            "created_at",
            "updated_at",
        ]


# ── Action serializers ────────────────────────────────────────────────────────

class RunAutoPromotionSerializer(serializers.Serializer):
    """Input for POST /student_promotions/run-auto/"""

    academic_session_id = serializers.IntegerField(required=True)
    student_class_id = serializers.IntegerField(required=True)

    def validate_academic_session_id(self, value):
        if not AcademicSession.objects.filter(id=value).exists():
            raise serializers.ValidationError("Academic session not found")
        return value

    def validate_student_class_id(self, value):
        if not StudentClass.objects.filter(id=value).exists():
            raise serializers.ValidationError("Student class not found")
        return value


class ManualPromotionSerializer(serializers.Serializer):
    """Input for POST /student_promotions/{id}/manual-promote/"""

    status = serializers.ChoiceField(choices=["PROMOTED", "HELD_BACK"], required=True)
    reason = serializers.CharField(
        required=True,
        min_length=10,
        error_messages={"min_length": "Please provide a reason of at least 10 characters"},
    )


class PromotionSummarySerializer(serializers.Serializer):
    """Summary stats returned alongside a list of student_promotions."""

    total = serializers.IntegerField()
    promoted = serializers.IntegerField()
    held_back = serializers.IntegerField()
    flagged = serializers.IntegerField()
    pending = serializers.IntegerField()
    promotion_rate = serializers.DecimalField(max_digits=5, decimal_places=1)
    class_average = serializers.DecimalField(
        max_digits=5, decimal_places=2, allow_null=True
    )