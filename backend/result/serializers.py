import logging
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from academics.models import AcademicSession, EducationLevel, Term
from academics.serializers import AcademicSessionSerializer
from classroom.models import Class as StudentClass
from students.models import Student
from students.serializers import StudentDetailSerializer
from subject.models import Subject
from subject.serializers import SubjectSerializer

from .models import (
    AssessmentComponent,
    AssessmentScore,
    AssessmentType,
    ComponentScore,
    ExamSession,
    ExamType,
    Grade,
    GradingSystem,
    JuniorSecondaryResult,
    JuniorSecondarySessionReport,
    JuniorSecondaryTermReport,
    NurseryResult,
    NurserySessionReport,
    NurseryTermReport,
    PrimaryResult,
    PrimarySessionReport,
    PrimaryTermReport,
    ResultComment,
    ResultSheet,
    ResultTemplate,
    ScoringConfiguration,
    SeniorSecondaryResult,
    SeniorSecondarySessionReport,
    SeniorSecondaryTermReport,
    StudentResult,
    StudentTermResult,
)

logger = logging.getLogger(__name__)


# ============================================================
# UTILITY
# ============================================================


def _position_suffix(position) -> str:
    """
    Convert an integer position to an ordinal string.
    Handles 11th-13th and 21st-23rd correctly.
    """
    if not position:
        return ""
    n = int(position)
    if 11 <= (n % 100) <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


# ============================================================
# MINIMAL HELPERS
# ============================================================


class StudentMinimalSerializer(serializers.ModelSerializer):
    """
    Caller must:
        .select_related('student_class', 'student_class__education_level')
        .prefetch_related(
            Prefetch('studentenrollment_set',
                     queryset=StudentEnrollment.objects.filter(is_active=True)
                              .select_related('classroom'),
                     to_attr='active_enrollments')
        )
    """

    admission_number = serializers.CharField(
        source="registration_number", read_only=True
    )
    full_name = serializers.CharField(read_only=True)
    student_class_name = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )
    student_class = serializers.PrimaryKeyRelatedField(read_only=True)
    education_level = serializers.CharField(read_only=True)
    education_level_display = serializers.CharField(
        source="education_level_display", read_only=True
    )
    classroom_id = serializers.SerializerMethodField()
    classroom_name = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id",
            "admission_number",
            "full_name",
            "student_class",
            "student_class_name",
            "education_level",
            "education_level_display",
            "classroom_id",
            "classroom_name",
        ]

    def _get_active_enrollment(self, obj):
        prefetched = getattr(obj, "active_enrollments", None)
        if prefetched is not None:
            return prefetched[0] if prefetched else None
        logger.warning(
            "StudentMinimalSerializer: active_enrollments not prefetched for student %s",
            obj.id,
        )
        return (
            obj.studentenrollment_set.filter(is_active=True)
            .select_related("classroom")
            .first()
        )

    def get_classroom_id(self, obj):
        e = self._get_active_enrollment(obj)
        return e.classroom.id if e and e.classroom else None

    def get_classroom_name(self, obj):
        e = self._get_active_enrollment(obj)
        return e.classroom.name if e and e.classroom else None


class SubjectMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ["id", "name", "code"]


class AcademicSessionMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicSession
        fields = ["id", "name", "start_date", "end_date", "is_active"]


class EducationLevelMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationLevel
        fields = ["id", "name", "code", "level_type"]


# ============================================================
# GRADING SYSTEM
# ============================================================


class GradeSerializer(serializers.ModelSerializer):
    grading_system_name = serializers.CharField(
        source="grading_system.name", read_only=True
    )

    class Meta:
        model = Grade
        fields = "__all__"
        read_only_fields = ["id"]


class GradeCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = [
            "grade",
            "min_score",
            "max_score",
            "grade_point",
            "description",
            "is_passing",
        ]
        extra_kwargs = {
            "grade_point": {"required": False, "allow_null": True},
            "description": {"required": False, "allow_blank": True},
            "is_passing": {"required": False},
        }

    def validate(self, data):
        if data.get("min_score", 0) >= data.get("max_score", 0):
            raise serializers.ValidationError(
                "Minimum score must be less than maximum score"
            )
        return data


class GradingSystemSerializer(serializers.ModelSerializer):
    """Caller must: .prefetch_related('grades')"""

    grades = GradeSerializer(many=True, read_only=True)
    grading_type_display = serializers.CharField(
        source="get_grading_type_display", read_only=True
    )

    class Meta:
        model = GradingSystem
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class GradingSystemCreateUpdateSerializer(serializers.ModelSerializer):
    grades = GradeCreateUpdateSerializer(many=True, required=False)

    class Meta:
        model = GradingSystem
        fields = [
            "name",
            "grading_type",
            "description",
            "min_score",
            "max_score",
            "pass_mark",
            "is_active",
            "grades",
        ]

    def validate(self, data):
        if data.get("min_score", 0) >= data.get("max_score", 0):
            raise serializers.ValidationError(
                "Minimum score must be less than maximum score"
            )
        if data.get("pass_mark", 0) < data.get("min_score", 0):
            raise serializers.ValidationError(
                "Pass mark cannot be less than minimum score"
            )
        if data.get("pass_mark", 0) > data.get("max_score", 0):
            raise serializers.ValidationError("Pass mark cannot exceed maximum score")
        return data

    def create(self, validated_data):
        grades_data = validated_data.pop("grades", [])
        grading_system = GradingSystem.objects.create(**validated_data)
        for grade_data in grades_data:
            Grade.objects.create(grading_system=grading_system, **grade_data)
        return grading_system

    def update(self, instance, validated_data):
        grades_data = validated_data.pop("grades", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if grades_data is not None:
            instance.grades.all().delete()
            for grade_data in grades_data:
                Grade.objects.create(grading_system=instance, **grade_data)
        return instance


# ============================================================
# ASSESSMENT COMPONENT
# ============================================================


class AssessmentComponentSerializer(serializers.ModelSerializer):
    """
    Read serializer for listing configured components per education level.
    Caller must: .select_related('education_level')
    """

    education_level_detail = EducationLevelMinimalSerializer(
        source="education_level", read_only=True
    )
    component_type_display = serializers.CharField(
        source="get_component_type_display", read_only=True
    )

    class Meta:
        model = AssessmentComponent
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class AssessmentComponentCreateUpdateSerializer(serializers.ModelSerializer):
    education_level = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all()
    )

    class Meta:
        model = AssessmentComponent
        fields = [
            "education_level",
            "name",
            "code",
            "component_type",
            "max_score",
            "contributes_to_ca",
            "display_order",
            "is_active",
        ]

    def validate_max_score(self, value):
        if value <= 0:
            raise serializers.ValidationError("max_score must be greater than zero")
        return value

    def validate_code(self, value):
        if not value.replace("_", "").replace("-", "").isalnum():
            raise serializers.ValidationError(
                "code must contain only letters, numbers, hyphens, and underscores"
            )
        return value.lower()


# ============================================================
# COMPONENT SCORE
# ============================================================


class ComponentScoreInputSerializer(serializers.Serializer):
    """
    Validates a single {component_id, score} pair.
    Score is checked against component.max_score via a live DB lookup.
    """

    component_id = serializers.IntegerField()
    score = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0")
    )

    def validate(self, data):
        try:
            component = AssessmentComponent.objects.get(id=data["component_id"])
        except AssessmentComponent.DoesNotExist:
            raise serializers.ValidationError(
                {"component_id": f"Component {data['component_id']} does not exist"}
            )
        if not component.is_active:
            raise serializers.ValidationError(
                {"component_id": f"Component '{component.name}' is not active"}
            )
        if data["score"] > component.max_score:
            raise serializers.ValidationError(
                {
                    "score": (
                        f"Score {data['score']} exceeds the maximum "
                        f"{component.max_score} for '{component.name}'"
                    )
                }
            )
        data["component"] = component
        return data


class ResultComponentScoresSerializer(serializers.Serializer):
    """
    Accepts a list of component scores for one result row.

    POST body:
        {"scores": [{"component_id": 1, "score": "8.50"}, ...]}

    validate() checks for duplicate component IDs.
    save() upserts ComponentScore rows then recalculates via a targeted
    update_fields save — no double full-model save.
    """

    scores = ComponentScoreInputSerializer(many=True, min_length=1)

    def validate_scores(self, value):
        seen_ids = set()
        for item in value:
            cid = item["component_id"]
            if cid in seen_ids:
                raise serializers.ValidationError(
                    f"Component ID {cid} appears more than once"
                )
            seen_ids.add(cid)
        return value

    def save(self, result_instance):
        """
        Upsert ComponentScore rows and recalculate derived fields.
        result_instance must be one of the four result model instances.
        """
        _FK_MAP = {
            SeniorSecondaryResult: "senior_result",
            JuniorSecondaryResult: "junior_result",
            PrimaryResult: "primary_result",
            NurseryResult: "nursery_result",
        }
        fk_name = _FK_MAP.get(type(result_instance))
        if not fk_name:
            raise ValueError(f"Unsupported result type: {type(result_instance)}")

        for item in self.validated_data["scores"]:
            ComponentScore.objects.update_or_create(
                **{fk_name: result_instance, "component": item["component"]},
                defaults={"score": item["score"]},
            )

        result_instance.calculate_scores()
        result_instance.determine_grade()
        result_instance.save(
            update_fields=[
                "total_score",
                "ca_total",
                "percentage",
                "grade",
                "grade_point",
                "is_passed",
                "updated_at",
            ]
        )
        return result_instance


class ComponentScoreReadSerializer(serializers.ModelSerializer):
    """
    Read serializer for a ComponentScore row in API responses.
    Caller must: .select_related('component')
    """

    component_name = serializers.CharField(source="component.name", read_only=True)
    component_code = serializers.CharField(source="component.code", read_only=True)
    component_type = serializers.CharField(
        source="component.component_type", read_only=True
    )
    max_score = serializers.DecimalField(
        source="component.max_score", read_only=True, max_digits=6, decimal_places=2
    )
    contributes_to_ca = serializers.BooleanField(
        source="component.contributes_to_ca", read_only=True
    )
    display_order = serializers.IntegerField(
        source="component.display_order", read_only=True
    )

    class Meta:
        model = ComponentScore
        fields = [
            "id",
            "component",
            "component_name",
            "component_code",
            "component_type",
            "max_score",
            "contributes_to_ca",
            "display_order",
            "score",
        ]


# ============================================================
# SCORING CONFIGURATION
# ============================================================


class ScoringConfigurationSerializer(serializers.ModelSerializer):
    education_level_detail = EducationLevelMinimalSerializer(
        source="education_level", read_only=True
    )
    education_level_display = serializers.CharField(
        source="education_level.name", read_only=True, allow_null=True
    )
    result_type_display = serializers.CharField(
        source="get_result_type_display", read_only=True
    )
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = ScoringConfiguration
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]


class ScoringConfigurationCreateUpdateSerializer(serializers.ModelSerializer):
    education_level = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all()
    )

    class Meta:
        model = ScoringConfiguration
        fields = [
            "name",
            "education_level",
            "result_type",
            "description",
            "total_max_score",
            "is_active",
            "is_default",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


# ============================================================
# ASSESSMENT TYPE (legacy)
# ============================================================


class AssessmentTypeSerializer(serializers.ModelSerializer):
    education_level_detail = EducationLevelMinimalSerializer(
        source="education_level", read_only=True
    )
    education_level_display = serializers.CharField(
        source="education_level.name", read_only=True, allow_null=True
    )

    class Meta:
        model = AssessmentType
        fields = "__all__"
        read_only_fields = ["id", "created_at"]


class AssessmentTypeCreateUpdateSerializer(serializers.ModelSerializer):
    education_level = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = AssessmentType
        fields = [
            "name",
            "code",
            "description",
            "education_level",
            "max_score",
            "weight_percentage",
            "is_active",
        ]

    def validate(self, data):
        if data.get("weight_percentage", 0) > 100:
            raise serializers.ValidationError("Weight percentage cannot exceed 100")
        return data


# ============================================================
# EXAM TYPE
# ============================================================


class ExamTypeSerializer(serializers.ModelSerializer):
    """
    Read serializer for ExamType.
    Caller must: .select_related() — no nested FKs on this model.
    """

    category_display = serializers.CharField(
        source="get_category_display", read_only=True
    )

    class Meta:
        model = ExamType
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ExamTypeCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamType
        fields = [
            "name",
            "code",
            "category",
            "description",
            "display_order",
            "is_active",
        ]

    def validate_code(self, value):
        if not value.replace("_", "").replace("-", "").isalnum():
            raise serializers.ValidationError(
                "code must contain only letters, numbers, hyphens, and underscores"
            )
        return value.lower()


# ============================================================
# EXAM SESSION
# ============================================================


class ExamSessionSerializer(serializers.ModelSerializer):
    """
    Caller must:
        .select_related('exam_type', 'academic_session', 'term')
    """

    exam_type_name = serializers.CharField(
        source="exam_type.name", read_only=True, allow_null=True
    )
    exam_type_code = serializers.CharField(
        source="exam_type.code", read_only=True, allow_null=True
    )
    exam_type_category = serializers.CharField(
        source="exam_type.category", read_only=True, allow_null=True
    )
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    term_name = serializers.CharField(
        source="term.name", read_only=True, allow_null=True
    )

    class Meta:
        model = ExamSession
        fields = "__all__"


class ExamSessionCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamSession
        fields = [
            "name",
            "exam_type",
            "academic_session",
            "term",
            "start_date",
            "end_date",
            "result_release_date",
            "is_published",
            "is_active",
        ]

    def validate(self, data):
        if data.get("start_date") and data.get("end_date"):
            if data["start_date"] >= data["end_date"]:
                raise serializers.ValidationError("Start date must be before end date")
        return data


# ============================================================
# RESULT COMMENT
# ============================================================


class ResultCommentSerializer(serializers.ModelSerializer):
    comment_type_display = serializers.CharField(
        source="get_comment_type_display", read_only=True
    )
    commented_by_name = serializers.CharField(
        source="commented_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = ResultComment
        fields = "__all__"
        read_only_fields = ["id", "commented_by", "created_at"]


class ResultCommentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResultComment
        fields = ["student_result", "term_result", "comment_type", "comment"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["commented_by"] = request.user
        return super().create(validated_data)


# ============================================================
# REMARK PERMISSION MIXIN
# ============================================================


class _RemarkPermissionMixin:
    """
    Shared validate() and SerializerMethodFields for all TermReport and
    SessionReport read serializers.

    Performance contract
    ─────────────────────
    get_can_edit_teacher_remark() calls model.can_edit_teacher_remark(user)
    which hits Teacher + StudentEnrollment + ClassroomTeacherAssignment.
    This is fine on DETAIL views.

    On LIST views set context['skip_permission_flags'] = True — the flags
    return None without any DB queries. Views can surface permission info
    via a separate lightweight endpoint if needed.
    """

    can_edit_teacher_remark = serializers.SerializerMethodField()
    can_edit_head_teacher_remark = serializers.SerializerMethodField()
    first_signatory_role = serializers.SerializerMethodField()

    def get_first_signatory_role(self, obj):
        # Method was renamed to _first_signatory_role() in models.py.
        return obj._first_signatory_role()

    def get_can_edit_teacher_remark(self, obj):
        if self.context.get("skip_permission_flags"):
            return None
        request = self.context.get("request")
        return obj.can_edit_teacher_remark(request.user) if request else False

    def get_can_edit_head_teacher_remark(self, obj):
        if self.context.get("skip_permission_flags"):
            return None
        request = self.context.get("request")
        return obj.can_edit_head_teacher_remark(request.user) if request else False

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user if request else None
        instance = self.instance
        if user and instance:
            if (
                "class_teacher_remark" in attrs
                and not instance.can_edit_teacher_remark(user)
            ):
                raise serializers.ValidationError(
                    "You are not allowed to edit the teacher remark."
                )
            if (
                "head_teacher_remark" in attrs
                and not instance.can_edit_head_teacher_remark(user)
            ):
                raise serializers.ValidationError(
                    "You are not allowed to edit the head teacher remark."
                )
        return attrs


# ============================================================
# BULK OPERATION SERIALIZERS
# ============================================================


class BulkApproveSerializer(serializers.Serializer):
    """
    Input for ModelClass.bulk_approve(qs, user).
    Views filter the queryset by result_ids then call the class method.
    """

    result_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        error_messages={"min_length": "At least one ID is required."},
    )

    def validate_result_ids(self, value):
        if len(value) != len({str(v) for v in value}):
            raise serializers.ValidationError("Duplicate IDs are not allowed.")
        return value


class BulkPublishSerializer(serializers.Serializer):
    """
    Input for ModelClass.bulk_publish(qs, user).
    Only APPROVED rows are advanced — others are silently skipped by the model.
    """

    result_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        error_messages={"min_length": "At least one ID is required."},
    )
    send_notifications = serializers.BooleanField(default=False)
    notification_message = serializers.CharField(required=False, allow_blank=True)

    def validate_result_ids(self, value):
        if len(value) != len({str(v) for v in value}):
            raise serializers.ValidationError("Duplicate IDs are not allowed.")
        return value


class BulkDeleteSerializer(serializers.Serializer):
    """
    Input for ModelClass.bulk_delete(qs, user).
    Permission rules enforced by the model:
      - admin roles  -> any status deleted
      - teachers     -> DRAFT only
    """

    result_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        error_messages={"min_length": "At least one ID is required."},
    )

    def validate_result_ids(self, value):
        if len(value) != len({str(v) for v in value}):
            raise serializers.ValidationError("Duplicate IDs are not allowed.")
        return value


class SingleApproveSerializer(serializers.Serializer):
    """
    Input for the single-record approve() action endpoint.
    The view calls report_instance.approve(user) after validation.
    An optional comment is accepted for audit logging purposes.
    """

    comment = serializers.CharField(required=False, allow_blank=True, default="")


class BulkRecordEntrySerializer(serializers.Serializer):
    """
    Validates one entry in a bulk-record payload:
        {"result_id": "<uuid>", "component_id": <int>, "score": "8.50"}
    """

    result_id = serializers.UUIDField()
    component_id = serializers.IntegerField()
    score = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0")
    )

    def validate(self, data):
        try:
            component = AssessmentComponent.objects.get(id=data["component_id"])
        except AssessmentComponent.DoesNotExist:
            raise serializers.ValidationError(
                {"component_id": f"Component {data['component_id']} does not exist"}
            )
        if not component.is_active:
            raise serializers.ValidationError(
                {"component_id": f"Component '{component.name}' is not active"}
            )
        if data["score"] > component.max_score:
            raise serializers.ValidationError(
                {
                    "score": (
                        f"Score {data['score']} exceeds the maximum "
                        f"{component.max_score} for '{component.name}'"
                    )
                }
            )
        return data


class BulkRecordSerializer(serializers.Serializer):
    """
    Input for ModelClass.bulk_record(entries, user).

    POST body:
        {
            "entries": [
                {"result_id": "...", "component_id": 1, "score": "8.50"},
                {"result_id": "...", "component_id": 2, "score": "7.00"}
            ]
        }

    validate_entries() ensures no (result_id, component_id) pair is duplicated.
    """

    entries = BulkRecordEntrySerializer(many=True, min_length=1)

    def validate_entries(self, value):
        seen = set()
        for entry in value:
            key = (str(entry["result_id"]), entry["component_id"])
            if key in seen:
                raise serializers.ValidationError(
                    f"Duplicate (result_id={entry['result_id']}, "
                    f"component_id={entry['component_id']}) in submission."
                )
            seen.add(key)
        return value


# ============================================================
# SENIOR SECONDARY — RESULT
# ============================================================


class SeniorSecondaryResultSerializer(serializers.ModelSerializer):
    """
    Caller must:
        .select_related(
            'student', 'student__student_class',
            'student__student_class__education_level',
            'subject', 'exam_session', 'exam_session__academic_session',
            'exam_session__term', 'exam_session__exam_type',
            'grading_system', 'stream', 'stream__stream_type_new',
            'entered_by', 'approved_by',
        )
        .prefetch_related(
            'grading_system__grades',
            Prefetch('component_scores',
                     queryset=ComponentScore.objects.select_related('component')),
        )
    """

    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)

    student_name = serializers.CharField(source="student.full_name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    stream_type = serializers.CharField(
        source="stream.stream_type_new.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    component_scores = ComponentScoreReadSerializer(many=True, read_only=True)
    ca_total = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)
    position = serializers.SerializerMethodField()

    class Meta:
        model = SeniorSecondaryResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_score",
            "ca_total",
            "percentage",
            "grade",
            "grade_point",
            "is_passed",
            "class_average",
            "highest_in_class",
            "lowest_in_class",
            "subject_position",
            "created_at",
            "updated_at",
        ]

    def get_position(self, obj):
        return _position_suffix(obj.subject_position)


class SeniorSecondaryResultCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Creates/updates a result row — FK fields only.
    Scores submitted separately via ResultComponentScoresSerializer.
    status excluded — use approve/publish action endpoints.
    """

    class Meta:
        model = SeniorSecondaryResult
        fields = [
            "student",
            "subject",
            "exam_session",
            "grading_system",
            "stream",
            "teacher_remark",
            "class_teacher_remark",
            "head_teacher_remark",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["entered_by"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["last_edited_by"] = request.user
            validated_data["last_edited_at"] = timezone.now()
        return super().update(instance, validated_data)


# ============================================================
# SENIOR SECONDARY — TERM REPORT
# ============================================================


class SeniorSecondaryTermReportSerializer(
    _RemarkPermissionMixin, serializers.ModelSerializer
):
    """
    Caller must:
        .select_related(
            'student', 'exam_session', 'exam_session__academic_session',
            'exam_session__term', 'exam_session__exam_type',
            'stream', 'stream__stream_type_new', 'published_by', 'approved_by',
        )
        .prefetch_related(
            Prefetch('subject_results',
                     queryset=SeniorSecondaryResult.objects.select_related(
                         'subject', 'grading_system',
                         'stream', 'stream__stream_type_new', 'entered_by',
                     ).prefetch_related(
                         'grading_system__grades',
                         Prefetch('component_scores',
                                  queryset=ComponentScore.objects.select_related('component')),
                     ))
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    stream_type = serializers.CharField(
        source="stream.stream_type_new.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    subject_results = SeniorSecondaryResultSerializer(many=True, read_only=True)

    class Meta:
        model = SeniorSecondaryTermReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_score",
            "average_score",
            "overall_grade",
            "class_position",
            "total_students",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]


class SeniorSecondaryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = SeniorSecondaryTermReport
        fields = [
            "student",
            "exam_session",
            "stream",
            "times_opened",
            "times_present",
            "next_term_begins",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# SENIOR SECONDARY — SESSION REPORT
# ============================================================


class SeniorSecondarySessionReportSerializer(
    _RemarkPermissionMixin, serializers.ModelSerializer
):
    """
    Session totals are computed from SeniorSecondaryTermReport records
    via compute_from_term_reports() — no manual score entry here.

    Caller must:
        .select_related(
            'student', 'student__student_class',
            'academic_session', 'stream', 'published_by', 'approved_by',
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    term_totals = serializers.JSONField(read_only=True)
    overall_position_formatted = serializers.SerializerMethodField()
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = SeniorSecondarySessionReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "term_totals",
            "overall_total",
            "overall_average",
            "overall_grade",
            "overall_position",
            "total_students",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]

    def get_overall_position_formatted(self, obj):
        return _position_suffix(obj.overall_position)


class SeniorSecondarySessionReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = SeniorSecondarySessionReport
        fields = [
            "student",
            "academic_session",
            "stream",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# JUNIOR SECONDARY — RESULT
# ============================================================


class JuniorSecondaryResultSerializer(serializers.ModelSerializer):
    """
    Caller must:
        .select_related(
            'student', 'subject', 'exam_session',
            'exam_session__academic_session', 'exam_session__exam_type',
            'grading_system', 'entered_by', 'approved_by',
        )
        .prefetch_related(
            'grading_system__grades',
            Prefetch('component_scores',
                     queryset=ComponentScore.objects.select_related('component')),
        )
    """

    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)
    component_scores = ComponentScoreReadSerializer(many=True, read_only=True)
    ca_total = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    position = serializers.SerializerMethodField()

    class Meta:
        model = JuniorSecondaryResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_score",
            "ca_total",
            "percentage",
            "grade",
            "grade_point",
            "is_passed",
            "class_average",
            "highest_in_class",
            "lowest_in_class",
            "subject_position",
            "created_at",
            "updated_at",
        ]

    def get_position(self, obj):
        return _position_suffix(obj.subject_position)


class JuniorSecondaryResultCreateUpdateSerializer(serializers.ModelSerializer):
    """FK fields only — scores via /component-scores/. status excluded."""

    class Meta:
        model = JuniorSecondaryResult
        fields = [
            "student",
            "subject",
            "exam_session",
            "grading_system",
            "teacher_remark",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["entered_by"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["last_edited_by"] = request.user
            validated_data["last_edited_at"] = timezone.now()
        return super().update(instance, validated_data)


# ============================================================
# JUNIOR SECONDARY — TERM REPORT
# ============================================================


class JuniorSecondaryTermReportSerializer(
    _RemarkPermissionMixin, serializers.ModelSerializer
):
    """
    Caller must:
        .select_related(
            'student', 'exam_session', 'exam_session__academic_session',
            'exam_session__exam_type', 'published_by', 'approved_by',
        )
        .prefetch_related(
            Prefetch('subject_results',
                     queryset=JuniorSecondaryResult.objects.select_related(
                         'subject', 'grading_system', 'entered_by',
                     ).prefetch_related(
                         'grading_system__grades',
                         Prefetch('component_scores',
                                  queryset=ComponentScore.objects.select_related('component')),
                     ))
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    subject_results = JuniorSecondaryResultSerializer(many=True, read_only=True)

    class Meta:
        model = JuniorSecondaryTermReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_score",
            "average_score",
            "overall_grade",
            "class_position",
            "total_students",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]


class JuniorSecondaryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = JuniorSecondaryTermReport
        fields = [
            "student",
            "exam_session",
            "times_opened",
            "times_present",
            "next_term_begins",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# JUNIOR SECONDARY — SESSION REPORT
# ============================================================


class JuniorSecondarySessionReportSerializer(
    _RemarkPermissionMixin, serializers.ModelSerializer
):
    """
    Caller must:
        .select_related(
            'student', 'student__student_class',
            'academic_session', 'published_by', 'approved_by',
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    term_totals = serializers.JSONField(read_only=True)
    overall_position_formatted = serializers.SerializerMethodField()
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = JuniorSecondarySessionReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "term_totals",
            "overall_total",
            "overall_average",
            "overall_grade",
            "overall_position",
            "total_students",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]

    def get_overall_position_formatted(self, obj):
        return _position_suffix(obj.overall_position)


class JuniorSecondarySessionReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = JuniorSecondarySessionReport
        fields = [
            "student",
            "academic_session",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# PRIMARY — RESULT
# ============================================================


class PrimaryResultSerializer(serializers.ModelSerializer):
    """
    Caller must:
        .select_related(
            'student', 'subject', 'exam_session',
            'exam_session__academic_session', 'exam_session__exam_type',
            'grading_system', 'entered_by', 'approved_by',
        )
        .prefetch_related(
            'grading_system__grades',
            Prefetch('component_scores',
                     queryset=ComponentScore.objects.select_related('component')),
        )
    """

    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)
    component_scores = ComponentScoreReadSerializer(many=True, read_only=True)
    ca_total = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    position = serializers.SerializerMethodField()

    class Meta:
        model = PrimaryResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_score",
            "ca_total",
            "percentage",
            "grade",
            "grade_point",
            "is_passed",
            "class_average",
            "highest_in_class",
            "lowest_in_class",
            "subject_position",
            "created_at",
            "updated_at",
        ]

    def get_position(self, obj):
        return _position_suffix(obj.subject_position)


class PrimaryResultCreateUpdateSerializer(serializers.ModelSerializer):
    """FK fields only — scores via /component-scores/. status excluded."""

    class Meta:
        model = PrimaryResult
        fields = [
            "student",
            "subject",
            "exam_session",
            "grading_system",
            "teacher_remark",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["entered_by"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["last_edited_by"] = request.user
            validated_data["last_edited_at"] = timezone.now()
        return super().update(instance, validated_data)


# ============================================================
# PRIMARY — TERM REPORT
# ============================================================


class PrimaryTermReportSerializer(_RemarkPermissionMixin, serializers.ModelSerializer):
    """
    Caller must:
        .select_related(
            'student', 'exam_session', 'exam_session__academic_session',
            'exam_session__exam_type', 'published_by', 'approved_by',
        )
        .prefetch_related(
            Prefetch('subject_results',
                     queryset=PrimaryResult.objects.select_related(
                         'subject', 'grading_system', 'entered_by',
                     ).prefetch_related(
                         'grading_system__grades',
                         Prefetch('component_scores',
                                  queryset=ComponentScore.objects.select_related('component')),
                     ))
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    subject_results = PrimaryResultSerializer(many=True, read_only=True)

    class Meta:
        model = PrimaryTermReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_score",
            "average_score",
            "overall_grade",
            "class_position",
            "total_students",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]


class PrimaryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = PrimaryTermReport
        fields = [
            "student",
            "exam_session",
            "times_opened",
            "times_present",
            "next_term_begins",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# PRIMARY — SESSION REPORT
# ============================================================


class PrimarySessionReportSerializer(
    _RemarkPermissionMixin, serializers.ModelSerializer
):
    """
    Caller must:
        .select_related(
            'student', 'student__student_class',
            'academic_session', 'published_by', 'approved_by',
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    term_totals = serializers.JSONField(read_only=True)
    overall_position_formatted = serializers.SerializerMethodField()
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = PrimarySessionReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "term_totals",
            "overall_total",
            "overall_average",
            "overall_grade",
            "overall_position",
            "total_students",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]

    def get_overall_position_formatted(self, obj):
        return _position_suffix(obj.overall_position)


class PrimarySessionReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = PrimarySessionReport
        fields = [
            "student",
            "academic_session",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# NURSERY — RESULT
# ============================================================


class NurseryResultSerializer(serializers.ModelSerializer):
    """
    NurseryResult now inherits BaseResult so ca_total, component_scores,
    class_average, highest_in_class, lowest_in_class, subject_position,
    and position_formatted are all available.

    Caller must:
        .select_related(
            'student', 'subject', 'exam_session',
            'exam_session__academic_session', 'exam_session__exam_type',
            'grading_system', 'entered_by', 'approved_by', 'term_report',
        )
        .prefetch_related(
            'grading_system__grades',
            Prefetch('component_scores',
                     queryset=ComponentScore.objects.select_related('component')),
        )
    """

    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)
    component_scores = ComponentScoreReadSerializer(many=True, read_only=True)
    ca_total = serializers.DecimalField(read_only=True, max_digits=7, decimal_places=2)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    # position_formatted is a property on BaseResult.
    position_formatted = serializers.CharField(read_only=True)

    # Physical-development fields from term_report FK — zero extra queries
    # when term_report is in select_related.
    physical_development = serializers.CharField(
        source="term_report.physical_development",
        read_only=True,
        allow_null=True,
        default=None,
    )
    health = serializers.CharField(
        source="term_report.health",
        read_only=True,
        allow_null=True,
        default=None,
    )
    cleanliness = serializers.CharField(
        source="term_report.cleanliness",
        read_only=True,
        allow_null=True,
        default=None,
    )
    general_conduct = serializers.CharField(
        source="term_report.general_conduct",
        read_only=True,
        allow_null=True,
        default=None,
    )
    height_beginning = serializers.DecimalField(
        source="term_report.height_beginning",
        read_only=True,
        allow_null=True,
        max_digits=5,
        decimal_places=2,
        default=None,
    )
    height_end = serializers.DecimalField(
        source="term_report.height_end",
        read_only=True,
        allow_null=True,
        max_digits=5,
        decimal_places=2,
        default=None,
    )
    weight_beginning = serializers.DecimalField(
        source="term_report.weight_beginning",
        read_only=True,
        allow_null=True,
        max_digits=5,
        decimal_places=2,
        default=None,
    )
    weight_end = serializers.DecimalField(
        source="term_report.weight_end",
        read_only=True,
        allow_null=True,
        max_digits=5,
        decimal_places=2,
        default=None,
    )

    class Meta:
        model = NurseryResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_score",
            "ca_total",
            "percentage",
            "grade",
            "grade_point",
            "is_passed",
            "class_average",
            "highest_in_class",
            "lowest_in_class",
            "subject_position",
            "created_at",
            "updated_at",
        ]


class NurseryResultCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = NurseryResult
        fields = [
            "student",
            "subject",
            "exam_session",
            "grading_system",
            "max_marks_obtainable",
            "mark_obtained",
            "academic_comment",
        ]

    def validate(self, data):
        if data.get("mark_obtained", 0) > data.get("max_marks_obtainable", 0):
            raise serializers.ValidationError(
                "Mark obtained cannot exceed max marks obtainable"
            )
        return data

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["entered_by"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["last_edited_by"] = request.user
            validated_data["last_edited_at"] = timezone.now()
        return super().update(instance, validated_data)


# ============================================================
# NURSERY — TERM REPORT
# ============================================================


class NurseryTermReportSerializer(_RemarkPermissionMixin, serializers.ModelSerializer):
    """
    Caller must:
        .select_related(
            'student', 'exam_session', 'exam_session__academic_session',
            'exam_session__exam_type', 'published_by', 'approved_by',
        )
        .prefetch_related(
            Prefetch('subject_results',
                     queryset=NurseryResult.objects.select_related(
                         'subject', 'grading_system', 'entered_by', 'term_report',
                     ).prefetch_related(
                         'grading_system__grades',
                         Prefetch('component_scores',
                                  queryset=ComponentScore.objects.select_related('component')),
                     ))
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )
    subject_results = NurseryResultSerializer(many=True, read_only=True)

    physical_development_display = serializers.CharField(
        source="get_physical_development_display", read_only=True
    )
    health_display = serializers.CharField(source="get_health_display", read_only=True)
    cleanliness_display = serializers.CharField(
        source="get_cleanliness_display", read_only=True
    )
    general_conduct_display = serializers.CharField(
        source="get_general_conduct_display", read_only=True
    )

    class Meta:
        model = NurseryTermReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_subjects",
            "total_max_marks",
            "total_marks_obtained",
            "overall_percentage",
            "class_position",
            "total_students_in_class",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]


class NurseryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = NurseryTermReport
        fields = [
            "student",
            "exam_session",
            "times_school_opened",
            "times_student_present",
            "physical_development",
            "health",
            "cleanliness",
            "general_conduct",
            "physical_development_comment",
            "height_beginning",
            "height_end",
            "weight_beginning",
            "weight_end",
            "next_term_begins",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# NURSERY — SESSION REPORT
# ============================================================


class NurserySessionReportSerializer(
    _RemarkPermissionMixin, serializers.ModelSerializer
):
    """
    Caller must:
        .select_related(
            'student', 'student__student_class',
            'academic_session', 'published_by', 'approved_by',
        )
    List views: pass context['skip_permission_flags'] = True.
    """

    student = StudentMinimalSerializer(read_only=True)
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    term_totals = serializers.JSONField(read_only=True)
    overall_position_formatted = serializers.SerializerMethodField()
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = NurserySessionReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "term_totals",
            "overall_total",
            "overall_average",
            "overall_grade",
            "overall_position",
            "total_students",
            "approved_by",
            "approved_date",
            "created_at",
            "updated_at",
        ]

    def get_overall_position_formatted(self, obj):
        return _position_suffix(obj.overall_position)


class NurserySessionReportCreateUpdateSerializer(serializers.ModelSerializer):
    """status excluded — use approve/publish action endpoints."""

    class Meta:
        model = NurserySessionReport
        fields = [
            "student",
            "academic_session",
            "class_teacher_remark",
            "head_teacher_remark",
        ]


# ============================================================
# LEGACY — StudentResult / StudentTermResult
# ============================================================


class AssessmentScoreSerializer(serializers.ModelSerializer):
    assessment_type = AssessmentTypeSerializer(read_only=True)
    assessment_type_name = serializers.CharField(
        source="assessment_type.name", read_only=True
    )

    class Meta:
        model = AssessmentScore
        fields = "__all__"
        read_only_fields = ["id", "percentage"]


class StudentResultSerializer(serializers.ModelSerializer):
    """
    Caller must:
        .select_related(
            'student', 'subject', 'exam_session', 'grading_system',
            'exam_session__academic_session', 'exam_session__exam_type',
        )
        .prefetch_related(
            'assessment_scores__assessment_type',
            'comments__commented_by',
            'grading_system__grades',
        )
    """

    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)
    assessment_scores = AssessmentScoreSerializer(many=True, read_only=True)
    comments = ResultCommentSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = StudentResult
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class DetailedStudentResultSerializer(StudentResultSerializer):
    student = StudentDetailSerializer(read_only=True)
    subject = SubjectSerializer(read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )


# ── Routing helper ────────────────────────────────────────────────────────────

_TERM_RESULT_MODEL_MAP = {
    "SENIOR_SECONDARY": (SeniorSecondaryResult, SeniorSecondaryResultSerializer),
    "JUNIOR_SECONDARY": (JuniorSecondaryResult, JuniorSecondaryResultSerializer),
    "PRIMARY": (PrimaryResult, PrimaryResultSerializer),
    "NURSERY": (NurseryResult, NurseryResultSerializer),
}


def _get_subject_results_for_student(student, academic_session, term, context):
    """
    Fetches subject results for one student/term with the correct model and
    minimum prefetch chain.

    NOTE: Used in StudentTermResultSerializer.get_subject_results().
    Fires one query per student — fine for detail view, avoid for list views.
    """
    education_level = getattr(student, "education_level", None)
    model_class, serializer_class = _TERM_RESULT_MODEL_MAP.get(
        education_level, (StudentResult, StudentResultSerializer)
    )
    base_filter = dict(
        student=student,
        exam_session__academic_session=academic_session,
        exam_session__term=term,
    )
    if model_class is SeniorSecondaryResult:
        qs = (
            model_class.objects.filter(**base_filter)
            .select_related(
                "subject",
                "grading_system",
                "exam_session",
                "exam_session__academic_session",
                "exam_session__exam_type",
                "stream",
                "stream__stream_type_new",
                "entered_by",
                "approved_by",
            )
            .prefetch_related("grading_system__grades", "component_scores__component")
        )
    elif model_class in (JuniorSecondaryResult, PrimaryResult):
        qs = (
            model_class.objects.filter(**base_filter)
            .select_related(
                "subject",
                "grading_system",
                "exam_session",
                "exam_session__academic_session",
                "exam_session__exam_type",
                "entered_by",
                "approved_by",
            )
            .prefetch_related("grading_system__grades", "component_scores__component")
        )
    elif model_class is NurseryResult:
        qs = (
            model_class.objects.filter(**base_filter)
            .select_related(
                "subject",
                "grading_system",
                "exam_session",
                "exam_session__academic_session",
                "exam_session__exam_type",
                "entered_by",
                "approved_by",
                "term_report",
            )
            .prefetch_related("grading_system__grades", "component_scores__component")
        )
    else:
        qs = model_class.objects.filter(**base_filter).select_related(
            "subject",
            "grading_system",
            "exam_session",
        )
    return serializer_class(qs, many=True, context=context).data


class StudentTermResultSerializer(serializers.ModelSerializer):
    """Detail view only — get_subject_results fires one query per call."""

    student = StudentDetailSerializer(read_only=True)
    academic_session = AcademicSessionSerializer(read_only=True)
    comments = ResultCommentSerializer(many=True, read_only=True)
    term_display = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    subject_results = serializers.SerializerMethodField()

    class Meta:
        model = StudentTermResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_subjects",
            "subjects_passed",
            "subjects_failed",
            "total_score",
            "average_score",
            "gpa",
            "class_position",
            "total_students",
            "created_at",
            "updated_at",
        ]

    def get_term_display(self, obj):
        return obj.term.name if obj.term else ""

    def get_subject_results(self, obj):
        return _get_subject_results_for_student(
            obj.student, obj.academic_session, obj.term, self.context
        )


class StudentTermResultDetailSerializer(serializers.ModelSerializer):
    student = StudentDetailSerializer(read_only=True)
    academic_session = AcademicSessionSerializer(read_only=True)
    subject_results = serializers.SerializerMethodField()
    comments = ResultCommentSerializer(many=True, read_only=True)
    term_display = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = StudentTermResult
        fields = "__all__"

    @staticmethod
    def setup_eager_loading(queryset):
        return queryset.select_related("student", "academic_session").prefetch_related(
            "comments", "comments__commented_by"
        )

    def get_term_display(self, obj):
        return obj.term.name if obj.term else ""

    def get_subject_results(self, obj):
        return _get_subject_results_for_student(
            obj.student, obj.academic_session, obj.term, self.context
        )


class StudentTermResultCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentTermResult
        fields = [
            "student",
            "academic_session",
            "term",
            "times_opened",
            "times_present",
            "next_term_begins",
            "class_teacher_remark",
            "head_teacher_remark",
            "status",
        ]


# ============================================================
# RESULT SHEET / TEMPLATE
# ============================================================


class ResultSheetSerializer(serializers.ModelSerializer):
    """
    Caller must:
        .select_related(
            'exam_session', 'student_class',
            'student_class__education_level',
            'exam_session__exam_type',
            'exam_session__academic_session',
            'exam_session__term',
        )
    education_level uses source= paths — no per-row SerializerMethodField queries.
    """

    exam_session = ExamSessionSerializer(read_only=True)
    student_class_name = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )
    education_level = serializers.CharField(
        source="student_class.education_level.level_type",
        read_only=True,
        allow_null=True,
    )
    education_level_display = serializers.CharField(
        source="student_class.education_level.name",
        read_only=True,
        allow_null=True,
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ResultSheet
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_students",
            "students_passed",
            "students_failed",
            "class_average",
            "highest_score",
            "lowest_score",
            "created_at",
            "updated_at",
        ]


class ResultTemplateSerializer(serializers.ModelSerializer):
    template_type_display = serializers.CharField(
        source="get_template_type_display", read_only=True
    )
    education_level_detail = EducationLevelMinimalSerializer(
        source="education_level", read_only=True
    )
    education_level_display = serializers.CharField(
        source="education_level.name", read_only=True, allow_null=True
    )

    class Meta:
        model = ResultTemplate
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ResultTemplateCreateUpdateSerializer(serializers.ModelSerializer):
    education_level = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ResultTemplate
        fields = [
            "name",
            "template_type",
            "education_level",
            "template_content",
            "is_active",
        ]


# ============================================================
# STATUS TRANSITION (single-record)
# ============================================================


class StatusTransitionSerializer(serializers.Serializer):
    """
    Validates a status change on a single result/report instance.
    View must pass context['instance'] for transition validation.
    """

    status = serializers.ChoiceField(choices=["DRAFT", "APPROVED", "PUBLISHED"])
    comment = serializers.CharField(required=False, allow_blank=True)

    def validate_status(self, value):
        instance = self.context.get("instance")
        if not instance:
            return value
        valid_transitions = {
            "DRAFT": ["APPROVED"],
            "APPROVED": ["PUBLISHED", "DRAFT"],
            "PUBLISHED": [],
        }
        if value != instance.status and value not in valid_transitions.get(
            instance.status, []
        ):
            raise serializers.ValidationError(
                f"Cannot transition from {instance.status} to {value}"
            )
        return value


# ============================================================
# REPORT GENERATION / IMPORT / EXPORT
# ============================================================


class ReportGenerationSerializer(serializers.Serializer):
    student_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )
    exam_session_id = serializers.UUIDField()
    report_type = serializers.ChoiceField(
        choices=["TERM_REPORT", "SESSION_REPORT", "SUBJECT_REPORT"]
    )
    format = serializers.ChoiceField(
        choices=["PDF", "EXCEL", "JSON", "CSV"], default="PDF"
    )
    include_comments = serializers.BooleanField(default=True)
    include_attendance = serializers.BooleanField(default=True)
    include_statistics = serializers.BooleanField(default=True)

    def validate_exam_session_id(self, value):
        if not ExamSession.objects.filter(id=value).exists():
            raise serializers.ValidationError("Exam session does not exist")
        return value

    def validate_student_ids(self, value):
        if value and Student.objects.filter(id__in=value).count() != len(value):
            raise serializers.ValidationError("Some student IDs do not exist")
        return value


class BulkReportGenerationSerializer(serializers.Serializer):
    exam_session_id = serializers.UUIDField()
    student_class_id = serializers.PrimaryKeyRelatedField(
        queryset=StudentClass.objects.all(),
        required=False,
        allow_null=True,
        source="student_class",
    )
    education_level_id = serializers.PrimaryKeyRelatedField(
        queryset=EducationLevel.objects.all(),
        required=False,
        allow_null=True,
        source="education_level",
    )
    stream_id = serializers.IntegerField(required=False, allow_null=True)
    report_type = serializers.ChoiceField(choices=["TERM_REPORT", "SESSION_REPORT"])
    format = serializers.ChoiceField(choices=["PDF", "EXCEL"], default="PDF")

    def validate_exam_session_id(self, value):
        if not ExamSession.objects.filter(id=value).exists():
            raise serializers.ValidationError("Exam session does not exist")
        return value


class ResultImportSerializer(serializers.Serializer):
    file = serializers.FileField()
    education_level = serializers.ChoiceField(
        choices=["SENIOR_SECONDARY", "JUNIOR_SECONDARY", "PRIMARY", "NURSERY"]
    )
    exam_session_id = serializers.UUIDField()
    overwrite_existing = serializers.BooleanField(default=False)
    validate_only = serializers.BooleanField(default=False)

    def validate_file(self, value):
        if not value.name.endswith((".csv", ".xlsx", ".xls")):
            raise serializers.ValidationError("Only CSV and Excel files are supported")
        return value


class ResultExportSerializer(serializers.Serializer):
    exam_session_id = serializers.UUIDField()
    education_level = serializers.CharField(required=False, allow_blank=True)
    student_class = serializers.CharField(required=False, allow_blank=True)
    format = serializers.ChoiceField(choices=["CSV", "EXCEL", "PDF"], default="EXCEL")
    include_statistics = serializers.BooleanField(default=True)
    include_comments = serializers.BooleanField(default=False)


# ============================================================
# STATISTICS
# ============================================================


class SubjectPerformanceSerializer(serializers.Serializer):
    subject_id = serializers.IntegerField()
    subject_name = serializers.CharField()
    subject_code = serializers.CharField()
    total_students = serializers.IntegerField()
    average_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    highest_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    lowest_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    pass_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    students_passed = serializers.IntegerField()
    students_failed = serializers.IntegerField()


# ============================================================
# REMARK / SIGNATURE UTILITIES
# ============================================================


class TeacherRemarkUpdateSerializer(serializers.Serializer):
    class_teacher_remark = serializers.CharField(max_length=500)

    def validate_class_teacher_remark(self, value):
        if len(value.strip()) < 50:
            raise serializers.ValidationError("Remark must be at least 50 characters")
        return value.strip()


class HeadTeacherRemarkUpdateSerializer(serializers.Serializer):
    head_teacher_remark = serializers.CharField(max_length=500)

    def validate_head_teacher_remark(self, value):
        if len(value.strip()) < 50:
            raise serializers.ValidationError("Remark must be at least 50 characters")
        return value.strip()


class SignatureUploadSerializer(serializers.Serializer):
    signature_image = serializers.ImageField()

    def validate_signature_image(self, value):
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Signature image must be less than 2MB")
        if value.content_type not in ("image/png", "image/jpeg", "image/jpg"):
            raise serializers.ValidationError("Only PNG and JPEG images are allowed")
        return value


class ProfessionalAssignmentStudentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    admission_number = serializers.CharField()
    student_class = serializers.CharField()
    education_level = serializers.CharField()
    average_score = serializers.DecimalField(
        max_digits=5, decimal_places=2, allow_null=True
    )
    term_report_id = serializers.UUIDField(allow_null=True)
    has_remark = serializers.BooleanField()
    remark_status = serializers.CharField()
    last_remark = serializers.CharField(allow_blank=True)
