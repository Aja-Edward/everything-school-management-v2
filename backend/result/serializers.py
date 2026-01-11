from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone
from students.models import Student
from subject.models import Subject
from academics.models import AcademicSession
from students.serializers import StudentDetailSerializer
from subject.serializers import SubjectSerializer
from academics.serializers import AcademicSessionSerializer
from .models import (
    GradingSystem,
    Grade,
    AssessmentType,
    ExamSession,
    StudentResult,
    StudentTermResult,
    ResultSheet,
    AssessmentScore,
    ResultComment,
    SeniorSecondaryResult,
    SeniorSecondarySessionResult,
    SeniorSecondaryTermReport,
    SeniorSecondarySessionReport,
    JuniorSecondaryResult,
    JuniorSecondaryTermReport,
    PrimaryResult,
    PrimaryTermReport,
    NurseryResult,
    NurseryTermReport,
    ScoringConfiguration,
    ResultTemplate,
)


# ===== BASE SERIALIZERS =====


class StudentMinimalSerializer(serializers.ModelSerializer):
    """Minimal student serializer to avoid circular imports"""

    admission_number = serializers.CharField(
        source="registration_number", read_only=True
    )
    full_name = serializers.CharField(read_only=True)
    student_class_display = serializers.CharField(
        source="get_student_class_display", read_only=True
    )
    education_level_display = serializers.CharField(
        source="get_education_level_display", read_only=True
    )

    # ✅ ADD: Classroom information from current enrollment
    classroom_id = serializers.SerializerMethodField()
    classroom_name = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id",
            "admission_number",
            "full_name",
            "student_class",
            "student_class_display",
            "education_level",
            "education_level_display",
            "classroom_id",  # ✅ NEW
            "classroom_name",  # ✅ NEW
        ]

    def get_classroom_id(self, obj):
        """Get the student's current classroom ID from active enrollment"""
        try:
            # Get active enrollment for this student
            enrollment = (
                obj.studentenrollment_set.filter(is_active=True)
                .select_related("classroom")
                .first()
            )

            if enrollment and enrollment.classroom:
                return enrollment.classroom.id
            return None
        except Exception:
            return None

    def get_classroom_name(self, obj):
        """Get the student's current classroom name from active enrollment"""
        try:
            # Get active enrollment for this student
            enrollment = (
                obj.studentenrollment_set.filter(is_active=True)
                .select_related("classroom")
                .first()
            )

            if enrollment and enrollment.classroom:
                return enrollment.classroom.name
            return None
        except Exception:
            return None


class SubjectMinimalSerializer(serializers.ModelSerializer):
    """Minimal subject serializer"""

    class Meta:
        model = Subject
        fields = ["id", "name", "code"]


class AcademicSessionMinimalSerializer(serializers.ModelSerializer):
    """Minimal academic session serializer"""

    class Meta:
        model = AcademicSession
        fields = ["id", "name", "start_date", "end_date", "is_active"]


# ===== GRADING SYSTEM SERIALIZERS =====


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


# ===== SCORING CONFIGURATION SERIALIZERS =====


class ScoringConfigurationSerializer(serializers.ModelSerializer):
    education_level_display = serializers.CharField(
        source="get_education_level_display", read_only=True
    )
    result_type_display = serializers.CharField(
        source="get_result_type_display", read_only=True
    )
    total_ca_max_score = serializers.DecimalField(
        source="ca_total_max_score", read_only=True, max_digits=5, decimal_places=2
    )
    created_by_name = serializers.CharField(
        source="created_by.get_full_name", read_only=True, allow_null=True
    )

    first_test_max_score = serializers.DecimalField(
        source="test1_max_score", read_only=True, max_digits=5, decimal_places=2
    )
    second_test_max_score = serializers.DecimalField(
        source="test2_max_score", read_only=True, max_digits=5, decimal_places=2
    )
    third_test_max_score = serializers.DecimalField(
        source="test3_max_score", read_only=True, max_digits=5, decimal_places=2
    )

    class Meta:
        model = ScoringConfiguration
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]


class ScoringConfigurationCreateUpdateSerializer(serializers.ModelSerializer):
    first_test_max_score = serializers.DecimalField(
        source="test1_max_score",
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    second_test_max_score = serializers.DecimalField(
        source="test2_max_score",
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    third_test_max_score = serializers.DecimalField(
        source="test3_max_score",
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ScoringConfiguration
        fields = [
            "name",
            "education_level",
            "result_type",
            "description",
            "first_test_max_score",
            "second_test_max_score",
            "third_test_max_score",
            "continuous_assessment_max_score",
            "take_home_test_max_score",
            "appearance_max_score",
            "practical_max_score",
            "project_max_score",
            "note_copying_max_score",
            "exam_max_score",
            "total_max_score",
            "ca_weight_percentage",
            "exam_weight_percentage",
            "is_active",
            "is_default",
        ]

    def validate(self, data):
        result_type = data.get("result_type", "TERMLY")
        education_level = data.get("education_level")

        if education_level in ["JUNIOR_SECONDARY", "PRIMARY"]:
            required_fields = [
                "continuous_assessment_max_score",
                "take_home_test_max_score",
                "appearance_max_score",
                "practical_max_score",
                "project_max_score",
                "note_copying_max_score",
            ]
            for field in required_fields:
                if field not in data or data[field] is None:
                    raise serializers.ValidationError(
                        {field: [f"This field is required for {education_level}"]}
                    )

        elif education_level == "SENIOR_SECONDARY":
            for field in ["test1_max_score", "test2_max_score", "test3_max_score"]:
                if field not in data or data[field] is None:
                    raise serializers.ValidationError(
                        {field: ["This field is required for Senior Secondary"]}
                    )

        elif education_level == "NURSERY":
            if "total_max_score" not in data or data["total_max_score"] is None:
                raise serializers.ValidationError(
                    {"total_max_score": ["Required for Nursery"]}
                )

        if result_type == "TERMLY" and education_level != "NURSERY":
            ca_weight = data.get("ca_weight_percentage", 0)
            exam_weight = data.get("exam_weight_percentage", 0)
            if ca_weight + exam_weight != 100:
                raise serializers.ValidationError("CA and exam weights must sum to 100")

        return data

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


# ===== ASSESSMENT TYPE SERIALIZERS =====


class AssessmentTypeSerializer(serializers.ModelSerializer):
    education_level_display = serializers.CharField(
        source="get_education_level_display", read_only=True
    )

    class Meta:
        model = AssessmentType
        fields = "__all__"
        read_only_fields = ["id", "created_at"]


class AssessmentTypeCreateUpdateSerializer(serializers.ModelSerializer):
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


# ===== EXAM SESSION SERIALIZERS =====


class ExamSessionSerializer(serializers.ModelSerializer):
    exam_type_display = serializers.CharField(
        source="get_exam_type_display", read_only=True
    )
    term_display = serializers.CharField(source="get_term_display", read_only=True)
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    academic_session_name = serializers.SerializerMethodField()

    class Meta:
        model = ExamSession
        fields = "__all__"

    def get_academic_session_name(self, obj):
        return obj.academic_session.name if obj.academic_session else None


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


# ===== ASSESSMENT SCORE SERIALIZERS =====


class AssessmentScoreSerializer(serializers.ModelSerializer):
    assessment_type = AssessmentTypeSerializer(read_only=True)
    assessment_type_name = serializers.CharField(
        source="assessment_type.name", read_only=True
    )

    class Meta:
        model = AssessmentScore
        fields = "__all__"
        read_only_fields = ["id", "percentage"]


# ===== RESULT COMMENT SERIALIZERS =====


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


# ===== SENIOR SECONDARY SERIALIZERS =====


class SeniorSecondaryResultSerializer(serializers.ModelSerializer):
    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)

    student_name = serializers.CharField(source="student.full_name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )

    test1_score = serializers.DecimalField(
        source="first_test_score", read_only=True, max_digits=5, decimal_places=2
    )
    test2_score = serializers.DecimalField(
        source="second_test_score", read_only=True, max_digits=5, decimal_places=2
    )
    test3_score = serializers.DecimalField(
        source="third_test_score", read_only=True, max_digits=5, decimal_places=2
    )
    position = serializers.SerializerMethodField()
    total_obtainable = serializers.SerializerMethodField()

    class Meta:
        model = SeniorSecondaryResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "total_ca_score",
            "total_score",
            "percentage",
            "grade",
            "grade_point",
            "is_passed",
            "created_at",
            "updated_at",
        ]

    def get_position(self, obj):
        if obj.subject_position:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(obj.subject_position, "th")
            return f"{obj.subject_position}{suffix}"
        return ""

    def get_total_obtainable(self, obj):
        return 100


class SeniorSecondaryResultCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeniorSecondaryResult
        fields = [
            "student",
            "subject",
            "exam_session",
            "grading_system",
            "stream",
            "first_test_score",
            "second_test_score",
            "third_test_score",
            "exam_score",
            "teacher_remark",
            "class_teacher_remark",
            "head_teacher_remark",
            "status",
        ]

    def validate(self, data):
        if data.get("first_test_score", 0) > 10:
            raise serializers.ValidationError("First test score cannot exceed 10 marks")
        if data.get("second_test_score", 0) > 10:
            raise serializers.ValidationError(
                "Second test score cannot exceed 10 marks"
            )
        if data.get("third_test_score", 0) > 10:
            raise serializers.ValidationError("Third test score cannot exceed 10 marks")
        if data.get("exam_score", 0) > 70:
            raise serializers.ValidationError("Exam score cannot exceed 70 marks")
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


class SeniorSecondaryTermReportSerializer(serializers.ModelSerializer):
    can_edit_teacher_remark = serializers.SerializerMethodField()
    can_edit_head_teacher_remark = serializers.SerializerMethodField()
    first_signatory_role = serializers.SerializerMethodField()

    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    # CHANGE: Use SerializerMethodField to manually fetch results
    subject_results = serializers.SerializerMethodField()

    position_formatted = serializers.CharField(read_only=True)

    class_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    class_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    head_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    head_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)
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
            "created_at",
            "updated_at",
            "class_teacher_signature",  # ✅ Add here too
            "class_teacher_signed_at",
            "head_teacher_signature",
            "head_teacher_signed_at",
        ]

    # ADD THIS METHOD:
    def get_subject_results(self, obj):
        """
        Fetch all subject results for this student and exam session.
        This works even without a direct foreign key relationship.
        """
        from result.models import SeniorSecondaryResult

        # Query by student and exam_session (matches what's in the term report)
        results = (
            SeniorSecondaryResult.objects.filter(
                student=obj.student, exam_session=obj.exam_session
            )
            .select_related("subject", "grading_system", "stream")
            .order_by("subject__name")
        )

        # Serialize the results
        return SeniorSecondaryResultSerializer(results, many=True).data

    def get_first_signatory_role(self, obj):
        return obj.first_signatory_role()

    def get_can_edit_teacher_remark(self, obj):
        return obj.can_edit_teacher_remark(self.context["request"].user)

    def get_can_edit_head_teacher_remark(self, obj):
        return obj.can_edit_head_teacher_remark(self.context["request"].user)

    def validate(self, attrs):
        user = self.context["request"].user
        instance = self.instance

        if "class_teacher_remark" in attrs:
            if not instance.can_edit_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        if "head_teacher_remark" in attrs:
            if not instance.can_edit_head_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        return attrs


class SeniorSecondarySessionResultSerializer(serializers.ModelSerializer):
    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    term1_score = serializers.DecimalField(
        source="first_term_score", read_only=True, max_digits=5, decimal_places=2
    )
    term2_score = serializers.DecimalField(
        source="second_term_score", read_only=True, max_digits=5, decimal_places=2
    )
    term3_score = serializers.DecimalField(
        source="third_term_score", read_only=True, max_digits=5, decimal_places=2
    )
    average_score = serializers.DecimalField(
        source="average_for_year", read_only=True, max_digits=5, decimal_places=2
    )
    position = serializers.SerializerMethodField()

    class Meta:
        model = SeniorSecondarySessionResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "average_for_year",
            "obtained",
            "created_at",
            "updated_at",
        ]

    def get_position(self, obj):
        if obj.subject_position:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(obj.subject_position, "th")
            return f"{obj.subject_position}{suffix}"
        return ""


class SeniorSecondarySessionReportSerializer(serializers.ModelSerializer):
    can_edit_teacher_remark = serializers.SerializerMethodField()
    can_edit_head_teacher_remark = serializers.SerializerMethodField()
    first_signatory_role = serializers.SerializerMethodField()
    student = StudentMinimalSerializer(read_only=True)
    academic_session = AcademicSessionMinimalSerializer(read_only=True)
    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    subject_results = SeniorSecondarySessionResultSerializer(many=True, read_only=True)

    class Meta:
        model = SeniorSecondarySessionReport
        fields = "__all__"
        read_only_fields = [
            "id",
            "term1_total",
            "term2_total",
            "term3_total",
            "taa_score",
            "average_for_year",
            "obtainable",
            "obtained",
            "overall_grade",
            "class_position",
            "total_students",
            "created_at",
            "updated_at",
        ]

    def get_first_signatory_role(self, obj):
        return obj.first_signatory_role()

    def get_can_edit_teacher_remark(self, obj):
        return obj.can_edit_teacher_remark(self.context["request"].user)

    def get_can_edit_head_teacher_remark(self, obj):
        return obj.can_edit_head_teacher_remark(self.context["request"].user)

    def validate(self, attrs):
        user = self.context["request"].user
        instance = self.instance

        if "class_teacher_remark" in attrs:
            if not instance.can_edit_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        if "head_teacher_remark" in attrs:
            if not instance.can_edit_head_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        return attrs


# ===== JUNIOR SECONDARY SERIALIZERS =====


class JuniorSecondaryResultSerializer(serializers.ModelSerializer):
    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    position_formatted = serializers.CharField(read_only=True)

    exam_marks = serializers.DecimalField(
        source="exam_score", read_only=True, max_digits=5, decimal_places=2
    )
    mark_obtained = serializers.DecimalField(
        source="total_score", read_only=True, max_digits=5, decimal_places=2
    )
    position = serializers.SerializerMethodField()
    total_obtainable = serializers.SerializerMethodField()

    class Meta:
        model = JuniorSecondaryResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "ca_total",
            "total_score",
            "ca_percentage",
            "exam_percentage",
            "total_percentage",
            "grade",
            "grade_point",
            "is_passed",
            "created_at",
            "updated_at",
        ]

    def get_position(self, obj):
        if obj.subject_position:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(obj.subject_position, "th")
            return f"{obj.subject_position}{suffix}"
        return ""

    def get_total_obtainable(self, obj):
        return 100


class JuniorSecondaryResultCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = JuniorSecondaryResult
        fields = [
            "student",
            "subject",
            "exam_session",
            "grading_system",
            "continuous_assessment_score",
            "take_home_test_score",
            "practical_score",
            "appearance_score",
            "project_score",
            "note_copying_score",
            "exam_score",
            "teacher_remark",
            "class_teacher_remark",
            "head_teacher_remark",
            "status",
        ]

    def validate(self, data):
        validations = {
            "continuous_assessment_score": (15, "Continuous Assessment"),
            "take_home_test_score": (5, "Take Home Test"),
            "practical_score": (5, "Practical"),
            "appearance_score": (5, "Appearance"),
            "project_score": (5, "Project"),
            "note_copying_score": (5, "Note Copying"),
            "exam_score": (60, "Exam score"),
        }
        for field, (max_val, label) in validations.items():
            if data.get(field, 0) > max_val:
                raise serializers.ValidationError(
                    f"{label} cannot exceed {max_val} marks"
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


class JuniorSecondaryTermReportSerializer(serializers.ModelSerializer):
    can_edit_teacher_remark = serializers.SerializerMethodField()
    can_edit_head_teacher_remark = serializers.SerializerMethodField()
    first_signatory_role = serializers.SerializerMethodField()
    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    subject_results = JuniorSecondaryResultSerializer(many=True, read_only=True)

    class_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    class_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    head_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    head_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)

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
            "created_at",
            "updated_at",
            "class_teacher_signature",  # ✅ Add here too
            "class_teacher_signed_at",
            "head_teacher_signature",
            "head_teacher_signed_at",
        ]

    def get_first_signatory_role(self, obj):
        return obj.first_signatory_role()

    def get_can_edit_teacher_remark(self, obj):
        return obj.can_edit_teacher_remark(self.context["request"].user)

    def get_can_edit_head_teacher_remark(self, obj):
        return obj.can_edit_head_teacher_remark(self.context["request"].user)

    def validate(self, attrs):
        user = self.context["request"].user
        instance = self.instance

        if "class_teacher_remark" in attrs:
            if not instance.can_edit_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        if "head_teacher_remark" in attrs:
            if not instance.can_edit_head_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        return attrs


# ===== PRIMARY SERIALIZERS =====


class PrimaryResultSerializer(serializers.ModelSerializer):
    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    position_formatted = serializers.CharField(read_only=True)

    exam_marks = serializers.DecimalField(
        source="exam_score", read_only=True, max_digits=5, decimal_places=2
    )
    mark_obtained = serializers.DecimalField(
        source="total_score", read_only=True, max_digits=5, decimal_places=2
    )
    position = serializers.SerializerMethodField()
    total_obtainable = serializers.SerializerMethodField()

    class Meta:
        model = PrimaryResult
        fields = "__all__"
        read_only_fields = [
            "id",
            "ca_total",
            "total_score",
            "ca_percentage",
            "exam_percentage",
            "total_percentage",
            "grade",
            "grade_point",
            "is_passed",
            "created_at",
            "updated_at",
        ]

    def get_position(self, obj):
        if obj.subject_position:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(obj.subject_position, "th")
            return f"{obj.subject_position}{suffix}"
        return ""

    def get_total_obtainable(self, obj):
        return 100


class PrimaryResultCreateUpdateSerializer(serializers.ModelSerializer):

    class Meta:
        model = PrimaryResult
        fields = [
            "student",
            "subject",
            "exam_session",
            "grading_system",
            "continuous_assessment_score",
            "take_home_test_score",
            "practical_score",
            "appearance_score",
            "project_score",
            "note_copying_score",
            "exam_score",
            "teacher_remark",
            "class_teacher_remark",
            "head_teacher_remark",
            "status",
        ]

    def validate(self, data):
        validations = {
            "continuous_assessment_score": (15, "Continuous Assessment"),
            "take_home_test_score": (5, "Take Home Test"),
            "practical_score": (5, "Practical"),
            "appearance_score": (5, "Appearance"),
            "project_score": (5, "Project"),
            "note_copying_score": (5, "Note Copying"),
            "exam_score": (60, "Exam score"),
        }
        for field, (max_val, label) in validations.items():
            if data.get(field, 0) > max_val:
                raise serializers.ValidationError(
                    f"{label} cannot exceed {max_val} marks"
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


class PrimaryTermReportSerializer(serializers.ModelSerializer):
    can_edit_teacher_remark = serializers.SerializerMethodField()
    can_edit_head_teacher_remark = serializers.SerializerMethodField()
    first_signatory_role = serializers.SerializerMethodField()
    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    subject_results = PrimaryResultSerializer(many=True, read_only=True)

    class_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    class_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    head_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    head_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)

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
            "created_at",
            "updated_at",
            "class_teacher_signature",  # ✅ Add here too
            "class_teacher_signed_at",
            "head_teacher_signature",
            "head_teacher_signed_at",
        ]

    def get_first_signatory_role(self, obj):
        return obj.first_signatory_role()

    def get_can_edit_teacher_remark(self, obj):
        return obj.can_edit_teacher_remark(self.context["request"].user)

    def get_can_edit_head_teacher_remark(self, obj):
        return obj.can_edit_head_teacher_remark(self.context["request"].user)

    def validate(self, attrs):
        user = self.context["request"].user
        instance = self.instance

        if "class_teacher_remark" in attrs:
            if not instance.can_edit_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        if "head_teacher_remark" in attrs:
            if not instance.can_edit_head_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        return attrs


# ===== NURSERY SERIALIZERS =====


class NurseryResultSerializer(serializers.ModelSerializer):
    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.get_full_name", read_only=True, allow_null=True
    )
    position = serializers.IntegerField(source="subject_position", read_only=True)
    position_formatted = serializers.CharField(read_only=True)

    physical_development = serializers.SerializerMethodField()
    health = serializers.SerializerMethodField()
    cleanliness = serializers.SerializerMethodField()
    general_conduct = serializers.SerializerMethodField()
    height_beginning = serializers.SerializerMethodField()
    height_end = serializers.SerializerMethodField()
    weight_beginning = serializers.SerializerMethodField()
    weight_end = serializers.SerializerMethodField()

    class Meta:
        model = NurseryResult
        fields = "__all__"

    def get_physical_development(self, obj):
        return obj.term_report.physical_development if obj.term_report else None

    def get_health(self, obj):
        return obj.term_report.health if obj.term_report else None

    def get_cleanliness(self, obj):
        return obj.term_report.cleanliness if obj.term_report else None

    def get_general_conduct(self, obj):
        return obj.term_report.general_conduct if obj.term_report else None

    def get_height_beginning(self, obj):
        return obj.term_report.height_beginning if obj.term_report else None

    def get_height_end(self, obj):
        return obj.term_report.height_end if obj.term_report else None

    def get_weight_beginning(self, obj):
        return obj.term_report.weight_beginning if obj.term_report else None

    def get_weight_end(self, obj):
        return obj.term_report.weight_end if obj.term_report else None


class NurseryResultCreateUpdateSerializer(serializers.ModelSerializer):
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
            "status",
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


class NurseryTermReportSerializer(serializers.ModelSerializer):
    can_edit_teacher_remark = serializers.SerializerMethodField()
    can_edit_head_teacher_remark = serializers.SerializerMethodField()
    first_signatory_role = serializers.SerializerMethodField()
    student = StudentMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
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

    class_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    class_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    head_teacher_signature = serializers.URLField(
        read_only=True, allow_null=True, allow_blank=True
    )
    head_teacher_signed_at = serializers.DateTimeField(read_only=True, allow_null=True)

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
            "created_at",
            "updated_at",
            "class_teacher_signature",  # ✅ Add here too
            "class_teacher_signed_at",
            "head_teacher_signature",
            "head_teacher_signed_at",
        ]

    def get_first_signatory_role(self, obj):
        return obj.first_signatory_role()

    def get_can_edit_teacher_remark(self, obj):
        return obj.can_edit_teacher_remark(self.context["request"].user)

    def get_can_edit_head_teacher_remark(self, obj):
        return obj.can_edit_head_teacher_remark(self.context["request"].user)

    def validate(self, attrs):
        user = self.context["request"].user
        instance = self.instance

        if "class_teacher_remark" in attrs:
            if not instance.can_edit_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        if "head_teacher_remark" in attrs:
            if not instance.can_edit_head_teacher_remark(user):
                raise serializers.ValidationError(
                    "You are not allowed to edit this remark."
                )

        return attrs


class NurseryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
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
            "status",
        ]


# ===== BASE STUDENT RESULT SERIALIZERS =====


class StudentResultSerializer(serializers.ModelSerializer):
    student = StudentMinimalSerializer(read_only=True)
    subject = SubjectMinimalSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)
    assessment_scores = AssessmentScoreSerializer(many=True, read_only=True)
    comments = ResultCommentSerializer(many=True, read_only=True)

    stream_name = serializers.CharField(
        source="stream.name", read_only=True, allow_null=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = StudentResult
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class StudentTermResultSerializer(serializers.ModelSerializer):
    student = StudentDetailSerializer(read_only=True)
    academic_session = AcademicSessionSerializer(read_only=True)
    comments = ResultCommentSerializer(many=True, read_only=True)

    term_display = serializers.CharField(source="get_term_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    published_by_name = serializers.CharField(
        source="published_by.get_full_name", read_only=True, allow_null=True
    )
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

    def get_subject_results(self, obj):
        """Get all subject results based on education level"""
        education_level = obj.student.education_level

        result_models = {
            "SENIOR_SECONDARY": (
                SeniorSecondaryResult,
                SeniorSecondaryResultSerializer,
            ),
            "JUNIOR_SECONDARY": (
                JuniorSecondaryResult,
                JuniorSecondaryResultSerializer,
            ),
            "PRIMARY": (PrimaryResult, PrimaryResultSerializer),
            "NURSERY": (NurseryResult, NurseryResultSerializer),
        }

        model_class, serializer_class = result_models.get(
            education_level, (StudentResult, StudentResultSerializer)
        )

        results = model_class.objects.filter(
            student=obj.student,
            exam_session__academic_session=obj.academic_session,
            exam_session__term=obj.term,
        ).select_related("subject", "grading_system", "exam_session")

        return serializer_class(results, many=True).data


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


# ===== RESULT SHEET SERIALIZERS =====


class ResultSheetSerializer(serializers.ModelSerializer):
    exam_session = ExamSessionSerializer(read_only=True)
    student_class_display = serializers.CharField(
        source="get_student_class_display", read_only=True
    )
    education_level_display = serializers.CharField(
        source="get_education_level_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    prepared_by_name = serializers.CharField(
        source="prepared_by.get_full_name", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.get_full_name", read_only=True, allow_null=True
    )

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


# ===== RESULT TEMPLATE SERIALIZERS =====


class ResultTemplateSerializer(serializers.ModelSerializer):
    template_type_display = serializers.CharField(
        source="get_template_type_display", read_only=True
    )
    education_level_display = serializers.CharField(
        source="get_education_level_display", read_only=True, allow_blank=True
    )

    class Meta:
        model = ResultTemplate
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]


class ResultTemplateCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResultTemplate
        fields = [
            "name",
            "template_type",
            "education_level",
            "template_content",
            "is_active",
        ]


# ===== TERM REPORT CREATE/UPDATE SERIALIZERS =====


class SeniorSecondaryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
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
            "status",
        ]


class JuniorSecondaryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
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
            "status",
        ]


class PrimaryTermReportCreateUpdateSerializer(serializers.ModelSerializer):
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
            "status",
        ]


# ===== SESSION REPORT CREATE/UPDATE SERIALIZERS =====


class SeniorSecondarySessionResultCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeniorSecondarySessionResult
        fields = [
            "student",
            "subject",
            "academic_session",
            "stream",
            "first_term_score",
            "second_term_score",
            "third_term_score",
            "teacher_remark",
            "class_teacher_remark",
            "head_teacher_remark",
            "status",
        ]

    def validate(self, data):
        for field, max_score in [
            ("first_term_score", 100),
            ("second_term_score", 100),
            ("third_term_score", 100),
        ]:
            if data.get(field, 0) > max_score:
                raise serializers.ValidationError(
                    f"{field} cannot exceed {max_score} marks"
                )
        return data


class SeniorSecondarySessionReportCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeniorSecondarySessionReport
        fields = [
            "student",
            "academic_session",
            "stream",
            "teacher_remark",
            "head_teacher_remark",
            "status",
        ]


# ===== CONSOLIDATED SERIALIZERS =====


class ConsolidatedTermReportSerializer(serializers.Serializer):
    """Unified serializer for all education level term reports"""

    def to_representation(self, instance):
        education_level = getattr(instance.student, "education_level", None)

        serializer_map = {
            "SENIOR_SECONDARY": SeniorSecondaryTermReportSerializer,
            "JUNIOR_SECONDARY": JuniorSecondaryTermReportSerializer,
            "PRIMARY": PrimaryTermReportSerializer,
            "NURSERY": NurseryTermReportSerializer,
        }

        serializer_class = serializer_map.get(education_level)
        if serializer_class:
            return serializer_class(instance, context=self.context).data

        return {
            "id": str(instance.id),
            "student": StudentMinimalSerializer(instance.student).data,
            "exam_session": ExamSessionSerializer(instance.exam_session).data,
            "education_level": education_level,
            "status": getattr(instance, "status", "DRAFT"),
        }


class ConsolidatedResultSerializer(serializers.Serializer):
    """Unified serializer for all education level results"""

    def to_representation(self, instance):
        education_level = getattr(instance.student, "education_level", None)

        serializer_map = {
            "SENIOR_SECONDARY": SeniorSecondaryResultSerializer,
            "JUNIOR_SECONDARY": JuniorSecondaryResultSerializer,
            "PRIMARY": PrimaryResultSerializer,
            "NURSERY": NurseryResultSerializer,
        }

        serializer_class = serializer_map.get(education_level, StudentResultSerializer)
        return serializer_class(instance, context=self.context).data


# ===== BULK OPERATIONS SERIALIZERS =====


class BulkResultCreateSerializer(serializers.Serializer):
    """Serializer for bulk result creation"""

    education_level = serializers.ChoiceField(
        choices=["SENIOR_SECONDARY", "JUNIOR_SECONDARY", "PRIMARY", "NURSERY"],
        required=True,
    )
    exam_session_id = serializers.UUIDField(required=True)
    grading_system_id = serializers.IntegerField(required=True)
    results = serializers.ListField(child=serializers.DictField(), required=True)

    def validate_exam_session_id(self, value):
        if not ExamSession.objects.filter(id=value).exists():
            raise serializers.ValidationError("Exam session does not exist")
        return value

    def validate_grading_system_id(self, value):
        if not GradingSystem.objects.filter(id=value).exists():
            raise serializers.ValidationError("Grading system does not exist")
        return value

    def validate_results(self, value):
        if not value:
            raise serializers.ValidationError("Results list cannot be empty")
        return value


class BulkResultUpdateSerializer(serializers.Serializer):
    """Serializer for bulk result updates"""

    results = serializers.ListField(child=serializers.DictField(), required=True)

    def validate_results(self, value):
        if not value:
            raise serializers.ValidationError("Results list cannot be empty")

        for result in value:
            if "id" not in result:
                raise serializers.ValidationError("Each result must have an 'id' field")
        return value


class BulkStatusUpdateSerializer(serializers.Serializer):
    """Serializer for bulk status updates"""

    result_ids = serializers.ListField(child=serializers.UUIDField(), required=True)
    status = serializers.ChoiceField(
        choices=["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED"], required=True
    )
    comment = serializers.CharField(required=False, allow_blank=True)

    def validate_result_ids(self, value):
        if not value:
            raise serializers.ValidationError("Result IDs list cannot be empty")
        return value


# ===== STATUS TRANSITION SERIALIZERS =====


class StatusTransitionSerializer(serializers.Serializer):
    """Serializer for status transitions"""

    status = serializers.ChoiceField(
        choices=["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED"], required=True
    )
    comment = serializers.CharField(required=False, allow_blank=True)

    def validate_status(self, value):
        instance = self.context.get("instance")
        if not instance:
            return value

        current_status = instance.status

        valid_transitions = {
            "DRAFT": ["SUBMITTED", "APPROVED"],
            "SUBMITTED": ["APPROVED", "DRAFT"],
            "APPROVED": ["PUBLISHED", "SUBMITTED"],
            "PUBLISHED": [],
        }

        if current_status == value:
            return value

        if value not in valid_transitions.get(current_status, []):
            raise serializers.ValidationError(
                f"Cannot change status from {current_status} to {value}"
            )
        return value


class PublishResultSerializer(serializers.Serializer):
    """Serializer for publishing results"""

    result_ids = serializers.ListField(child=serializers.UUIDField(), required=True)
    publish_date = serializers.DateTimeField(required=False, allow_null=True)
    notification_message = serializers.CharField(required=False, allow_blank=True)
    send_notifications = serializers.BooleanField(default=True)

    def validate_result_ids(self, value):
        if not value:
            raise serializers.ValidationError("Result IDs list cannot be empty")
        return value


# ===== REPORT GENERATION SERIALIZERS =====


class ReportGenerationSerializer(serializers.Serializer):
    """Serializer for report generation requests"""

    student_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )
    exam_session_id = serializers.UUIDField(required=True)
    report_type = serializers.ChoiceField(
        choices=["TERM_REPORT", "SESSION_REPORT", "SUBJECT_REPORT"], required=True
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
        if value:
            existing_count = Student.objects.filter(id__in=value).count()
            if existing_count != len(value):
                raise serializers.ValidationError("Some student IDs do not exist")
        return value


class BulkReportGenerationSerializer(serializers.Serializer):
    """Serializer for bulk report generation"""

    exam_session_id = serializers.UUIDField(required=True)
    student_class = serializers.CharField(required=False, allow_blank=True)
    education_level = serializers.CharField(required=False, allow_blank=True)
    stream_id = serializers.IntegerField(required=False, allow_null=True)
    report_type = serializers.ChoiceField(
        choices=["TERM_REPORT", "SESSION_REPORT"], required=True
    )
    format = serializers.ChoiceField(choices=["PDF", "EXCEL"], default="PDF")

    def validate_exam_session_id(self, value):
        if not ExamSession.objects.filter(id=value).exists():
            raise serializers.ValidationError("Exam session does not exist")
        return value


# ===== STATISTICS SERIALIZERS =====
class ResultStatisticsSerializer(serializers.Serializer):
    """Serializer for result statistics"""

    total_students = serializers.IntegerField()
    students_passed = serializers.IntegerField()
    students_failed = serializers.IntegerField()
    pass_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)
    class_average = serializers.DecimalField(max_digits=5, decimal_places=2)
    highest_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    lowest_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    grade_distribution = serializers.DictField()
    attendance_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False
    )


class SubjectPerformanceSerializer(serializers.Serializer):
    """Serializer for subject performance statistics"""

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


class StudentPerformanceTrendSerializer(serializers.Serializer):
    """Serializer for student performance trends"""

    student = StudentMinimalSerializer()
    term_scores = serializers.ListField(child=serializers.DictField())
    average_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    trend = serializers.ChoiceField(choices=["IMPROVING", "DECLINING", "STABLE"])
    percentage_change = serializers.DecimalField(max_digits=5, decimal_places=2)
    best_subject = serializers.CharField(required=False, allow_null=True)
    worst_subject = serializers.CharField(required=False, allow_null=True)


class ClassPerformanceSerializer(serializers.Serializer):
    """Serializer for class-level performance"""

    student_class = serializers.CharField()
    education_level = serializers.CharField()
    total_students = serializers.IntegerField()
    class_average = serializers.DecimalField(max_digits=5, decimal_places=2)
    pass_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    top_performers = serializers.ListField(child=serializers.DictField())
    subject_performance = SubjectPerformanceSerializer(many=True)


class SessionComparisonSerializer(serializers.Serializer):
    """Serializer for comparing performance across sessions"""

    student_id = serializers.UUIDField()
    student_name = serializers.CharField()
    sessions = serializers.ListField(child=serializers.DictField())
    overall_trend = serializers.ChoiceField(
        choices=["IMPROVING", "DECLINING", "STABLE"]
    )
    average_improvement = serializers.DecimalField(max_digits=5, decimal_places=2)


# ===== VALIDATION SERIALIZERS =====


class ResultValidationSerializer(serializers.Serializer):
    """Serializer for validating result data before submission"""

    education_level = serializers.ChoiceField(
        choices=["SENIOR_SECONDARY", "JUNIOR_SECONDARY", "PRIMARY", "NURSERY"]
    )
    result_data = serializers.DictField()

    def validate(self, data):
        education_level = data.get("education_level")
        result_data = data.get("result_data", {})

        if education_level == "SENIOR_SECONDARY":
            required_fields = [
                "first_test_score",
                "second_test_score",
                "third_test_score",
                "exam_score",
            ]
            for field in required_fields:
                if field not in result_data:
                    raise serializers.ValidationError(
                        f"{field} is required for Senior Secondary"
                    )

        elif education_level in ["JUNIOR_SECONDARY", "PRIMARY"]:
            required_fields = ["continuous_assessment_score", "exam_score"]
            for field in required_fields:
                if field not in result_data:
                    raise serializers.ValidationError(f"{field} is required")

        elif education_level == "NURSERY":
            if (
                "mark_obtained" not in result_data
                or "max_marks_obtainable" not in result_data
            ):
                raise serializers.ValidationError(
                    "Both mark_obtained and max_marks_obtainable are required"
                )

        return data


# ===== IMPORT/EXPORT SERIALIZERS =====


class ResultImportSerializer(serializers.Serializer):
    """Serializer for importing results from file"""

    file = serializers.FileField(required=True)
    education_level = serializers.ChoiceField(
        choices=["SENIOR_SECONDARY", "JUNIOR_SECONDARY", "PRIMARY", "NURSERY"]
    )
    exam_session_id = serializers.UUIDField(required=True)
    grading_system_id = serializers.IntegerField(required=True)
    overwrite_existing = serializers.BooleanField(default=False)
    validate_only = serializers.BooleanField(default=False)

    def validate_file(self, value):
        if not value.name.endswith((".csv", ".xlsx", ".xls")):
            raise serializers.ValidationError("Only CSV and Excel files are supported")
        return value


class ResultExportSerializer(serializers.Serializer):
    """Serializer for exporting results"""

    exam_session_id = serializers.UUIDField(required=True)
    education_level = serializers.CharField(required=False, allow_blank=True)
    student_class = serializers.CharField(required=False, allow_blank=True)
    format = serializers.ChoiceField(choices=["CSV", "EXCEL", "PDF"], default="EXCEL")
    include_statistics = serializers.BooleanField(default=True)
    include_comments = serializers.BooleanField(default=False)


# ===== ANALYTICS SERIALIZERS =====


class TermComparisonSerializer(serializers.Serializer):
    """Serializer for comparing student performance across terms"""

    student_id = serializers.UUIDField()
    academic_session_id = serializers.IntegerField()
    terms = serializers.ListField(child=serializers.DictField())
    overall_performance = serializers.CharField()
    improvement_areas = serializers.ListField(child=serializers.CharField())
    declining_areas = serializers.ListField(child=serializers.CharField())


class GradeDistributionSerializer(serializers.Serializer):
    """Serializer for grade distribution analytics"""

    exam_session_id = serializers.UUIDField()
    education_level = serializers.CharField()
    student_class = serializers.CharField()
    grade_counts = serializers.DictField()
    percentages = serializers.DictField()
    total_students = serializers.IntegerField()


class AttendancePerformanceCorrelationSerializer(serializers.Serializer):
    """Serializer for correlating attendance with performance"""

    student_id = serializers.UUIDField()
    attendance_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    average_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    correlation_strength = serializers.CharField()
    recommendation = serializers.CharField()


# ===== NOTIFICATION SERIALIZERS =====


class ResultNotificationSerializer(serializers.Serializer):
    """Serializer for result notification"""

    student_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    exam_session_id = serializers.UUIDField(required=True)
    notification_type = serializers.ChoiceField(
        choices=["EMAIL", "SMS", "PUSH", "ALL"], default="ALL"
    )
    custom_message = serializers.CharField(required=False, allow_blank=True)
    include_pdf = serializers.BooleanField(default=True)

    def validate_exam_session_id(self, value):
        if not ExamSession.objects.filter(id=value).exists():
            raise serializers.ValidationError("Exam session does not exist")
        return value


# ===== SUMMARY SERIALIZERS =====


class ResultSummarySerializer(serializers.Serializer):
    """Serializer for result summary dashboard"""

    total_results = serializers.IntegerField()
    published_results = serializers.IntegerField()
    pending_approval = serializers.IntegerField()
    draft_results = serializers.IntegerField()
    overall_pass_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    average_class_performance = serializers.DecimalField(max_digits=5, decimal_places=2)
    top_performing_class = serializers.CharField()
    subjects_summary = serializers.ListField(child=serializers.DictField())


class StudentResultSummarySerializer(serializers.Serializer):
    """Serializer for individual student result summary"""

    student = StudentMinimalSerializer()
    total_subjects = serializers.IntegerField()
    subjects_passed = serializers.IntegerField()
    subjects_failed = serializers.IntegerField()
    average_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    gpa = serializers.DecimalField(max_digits=3, decimal_places=2)
    class_position = serializers.IntegerField()
    overall_grade = serializers.CharField()
    attendance_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    strengths = serializers.ListField(child=serializers.CharField())
    weaknesses = serializers.ListField(child=serializers.CharField())


class DetailedStudentResultSerializer(serializers.ModelSerializer):
    """Detailed serializer for StudentResult with full assessment breakdown"""

    student = StudentDetailSerializer(read_only=True)
    subject = SubjectSerializer(read_only=True)
    exam_session = ExamSessionSerializer(read_only=True)
    grading_system = GradingSystemSerializer(read_only=True)
    assessment_scores = AssessmentScoreSerializer(many=True, read_only=True)
    comments = ResultCommentSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    entered_by_name = serializers.CharField(
        source="entered_by.full_name", read_only=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.full_name", read_only=True
    )

    class Meta:
        model = StudentResult
        fields = "__all__"


class AssessmentScoreNestedSerializer(serializers.ModelSerializer):
    """Nested serializer for assessment scores within results"""

    assessment_type_name = serializers.CharField(
        source="assessment_type.name", read_only=True
    )
    assessment_type_code = serializers.CharField(
        source="assessment_type.code", read_only=True
    )

    class Meta:
        model = AssessmentScore
        fields = [
            "id",
            "assessment_type",
            "assessment_type_name",
            "assessment_type_code",
            "score",
            "max_score",
            "percentage",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ResultCommentNestedSerializer(serializers.ModelSerializer):
    """Nested serializer for result comments"""

    commented_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ResultComment
        fields = [
            "id",
            "comment_type",
            "comment",
            "commented_by",
            "commented_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_commented_by_name(self, obj):
        if obj.commented_by:
            return f"{obj.commented_by.first_name} {obj.commented_by.last_name}".strip()
        return None


class StudentTermResultDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for StudentTermResult with full subject breakdown"""

    student = StudentDetailSerializer(read_only=True)
    academic_session = AcademicSessionSerializer(read_only=True)
    subject_results = serializers.SerializerMethodField()
    comments = ResultCommentSerializer(many=True, read_only=True)
    term_display = serializers.CharField(source="get_term_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = StudentTermResult
        fields = "__all__"

    @staticmethod
    def setup_eager_loading(queryset):
        return queryset.select_related("student", "academic_session").prefetch_related(
            "comments", "comments__commented_by"
        )

    def get_subject_results(self, obj):
        """Get all results for this student in this term across education levels"""
        education_level = getattr(obj.student, "education_level", None)

        if education_level == "SENIOR_SECONDARY":
            senior_results = SeniorSecondaryResult.objects.filter(
                student=obj.student,
                exam_session__term=obj.term,
                exam_session__academic_session=obj.academic_session,
            ).select_related("subject", "grading_system", "exam_session", "stream")

            # Map Senior Secondary fields to a shape compatible with frontend SubjectResult
            mapped = []
            for r in senior_results:
                mapped.append(
                    {
                        "id": str(r.id),
                        "subject": SubjectMinimalSerializer(r.subject).data,
                        "exam_session": ExamSessionSerializer(r.exam_session).data,
                        "stream": (
                            {
                                "id": r.stream.id,
                                "name": r.stream.name,
                                "stream_type": getattr(r.stream, "stream_type", ""),
                            }
                            if r.stream
                            else None
                        ),
                        "stream_name": r.stream.name if r.stream else None,
                        "stream_type": (
                            getattr(r.stream, "stream_type", None) if r.stream else None
                        ),
                        "ca_score": r.total_ca_score,  # total of tests
                        "exam_score": r.exam_score,
                        "total_score": r.total_score,
                        "percentage": r.percentage,
                        "grade": r.grade,
                        "grade_point": r.grade_point,
                        "is_passed": r.is_passed,
                        "position": r.subject_position,
                        "remarks": r.teacher_remark,
                        "status": r.status,
                        "assessment_scores": [],
                        "created_at": (
                            r.created_at.isoformat() if hasattr(r, "created_at") else ""
                        ),
                    }
                )
            return mapped

        elif education_level == "JUNIOR_SECONDARY":
            return JuniorSecondaryResultSerializer(
                JuniorSecondaryResult.objects.filter(
                    student=obj.student,
                    exam_session__term=obj.term,
                    exam_session__academic_session=obj.academic_session,
                ).select_related("subject", "grading_system", "exam_session"),
                many=True,
            ).data

        elif education_level == "PRIMARY":
            return PrimaryResultSerializer(
                PrimaryResult.objects.filter(
                    student=obj.student,
                    exam_session__term=obj.term,
                    exam_session__academic_session=obj.academic_session,
                ).select_related("subject", "grading_system", "exam_session"),
                many=True,
            ).data

        elif education_level == "NURSERY":
            return NurseryResultSerializer(
                NurseryResult.objects.filter(
                    student=obj.student,
                    exam_session__term=obj.term,
                    exam_session__academic_session=obj.academic_session,
                ).select_related("subject", "grading_system", "exam_session"),
                many=True,
            ).data

        else:
            # Fallback to base StudentResult
            results = StudentResult.objects.filter(
                student=obj.student,
                exam_session__term=obj.term,
                exam_session__academic_session=obj.academic_session,
            ).select_related("subject", "grading_system", "exam_session")
            return StudentResultSerializer(results, many=True).data

# Add these to your serializers.py


class TeacherRemarkUpdateSerializer(serializers.Serializer):
    """For updating teacher remarks on term reports"""

    class_teacher_remark = serializers.CharField(
        max_length=500,
        required=True,
        help_text="Class teacher's remark (50-500 characters)",
    )

    def validate_class_teacher_remark(self, value):
        if len(value.strip()) < 50:
            raise serializers.ValidationError(
                "Remark must be at least 50 characters long"
            )
        return value.strip()


class HeadTeacherRemarkUpdateSerializer(serializers.Serializer):
    """For updating head teacher remarks on term reports"""

    head_teacher_remark = serializers.CharField(
        max_length=500,
        required=True,
        help_text="Head teacher's remark (50-500 characters)",
    )

    def validate_head_teacher_remark(self, value):
        if len(value.strip()) < 50:
            raise serializers.ValidationError(
                "Remark must be at least 50 characters long"
            )
        return value.strip()


class SignatureUploadSerializer(serializers.Serializer):
    """For uploading signatures to Cloudinary"""

    signature_image = serializers.ImageField(
        required=True, help_text="Signature image (PNG, JPG, max 2MB)"
    )

    def validate_signature_image(self, value):
        # Validate file size (max 2MB)
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Signature image must be less than 2MB")

        # Validate file type
        allowed_types = ["image/png", "image/jpeg", "image/jpg"]
        if value.content_type not in allowed_types:
            raise serializers.ValidationError("Only PNG and JPEG images are allowed")

        return value


class ProfessionalAssignmentStudentSerializer(serializers.Serializer):
    """Student info for Professional Assignment tab"""

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
    remark_status = serializers.CharField()  # 'completed', 'pending', 'draft'
    last_remark = serializers.CharField(allow_blank=True)
