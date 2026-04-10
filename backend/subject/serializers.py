from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import (
    Subject,
    SubjectCategory,
    SubjectType,
    SchoolStreamConfiguration,
    SchoolStreamSubjectAssignment,
    SubjectCombination,
)

# GradeLevel lives in classroom app
from classroom.models import GradeLevel, Stream

# EducationLevel lives in students app — used for FK validation in filters
from academics.models import EducationLevel

# ---------------------------------------------------------------------------
# Minimal nested serializers (avoid circular imports)
# ---------------------------------------------------------------------------


class SubjectCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubjectCategory
        fields = ["id", "name", "code", "description", "color_code", "is_active"]
        read_only_fields = ["id"]


class SubjectTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubjectType
        fields = ["id", "name", "code", "description", "is_active"]
        read_only_fields = ["id"]


class GradeLevelMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = ["id", "name", "order", "education_level"]
        read_only_fields = ["id"]


# ---------------------------------------------------------------------------
# Main Subject serializer
# ---------------------------------------------------------------------------

class SubjectSerializer(serializers.ModelSerializer):
    # Read-only computed properties from model
    display_name = serializers.ReadOnlyField()
    nursery_levels_display = serializers.ReadOnlyField()
    full_level_display = serializers.ReadOnlyField()

    # category → FK to SubjectCategory (replaces old CharField)
    category = serializers.PrimaryKeyRelatedField(
        source="category_new",
        queryset=SubjectCategory.objects.all(),
        required=False,
        allow_null=True,
    )
    category_detail = SubjectCategorySerializer(source="category_new", read_only=True)
    category_name = serializers.CharField(
        source="category_new.name", read_only=True, allow_null=True
    )
    category_code = serializers.CharField(
        source="category_new.code", read_only=True, allow_null=True
    )

    # ss_subject_type → FK to SubjectType (replaces old CharField)
    ss_subject_type = serializers.PrimaryKeyRelatedField(
        source="subject_type_new",
        queryset=SubjectType.objects.all(),
        required=False,
        allow_null=True,
    )
    ss_subject_type_detail = SubjectTypeSerializer(
        source="subject_type_new", read_only=True
    )
    ss_subject_type_name = serializers.CharField(
        source="subject_type_new.name", read_only=True, allow_null=True
    )

    # grade_levels — M2M replacing old education_levels JSONField
    grade_levels = serializers.PrimaryKeyRelatedField(
        queryset=GradeLevel.objects.all(),
        many=True,
        required=False,
    )
    grade_levels_info = serializers.SerializerMethodField()

    # education_levels — old JSONField but now writable to support frontend
    education_levels = serializers.JSONField(required=False, allow_null=True)
    education_levels_display = serializers.ReadOnlyField()

    # nursery levels (still JSONField on model for now)
    nursery_levels = serializers.JSONField(required=False, allow_null=True)

    # Prerequisites / dependents
    prerequisites = serializers.StringRelatedField(many=True, read_only=True)
    compatible_streams = serializers.StringRelatedField(many=True, read_only=True)
    prerequisite_subjects = serializers.SerializerMethodField()
    dependent_subjects = serializers.SerializerMethodField()

    is_cross_cutting = serializers.BooleanField(required=False)
    default_stream_role = serializers.CharField(read_only=True)

    stream_assignments = serializers.SerializerMethodField()

    education_level_details = serializers.SerializerMethodField()

    code = serializers.CharField(
        max_length=15,
        help_text="Unique subject code (e.g., MATH-NUR, ENG-PRI, PHY-SS)",
    )

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "short_name",
            "display_name",
            "code",
            "description",
            # Category (FK)
            "category",
            "category_detail",
            "category_name",
            "category_code",
            # Education level (old JSONField — read-only backward compat)
            "education_levels",
            "education_levels_display",
            # Nursery levels (still JSONField)
            "nursery_levels",
            "nursery_levels_display",
            "full_level_display",
            "education_level_details",
            # Senior Secondary subject type (FK)
            "ss_subject_type",
            "ss_subject_type_detail",
            "ss_subject_type_name",
            "is_cross_cutting",
            "default_stream_role",
            # Grade level M2M
            "grade_levels",
            "grade_levels_info",
            # Prerequisites & dependencies
            "prerequisites",
            "prerequisite_subjects",
            "dependent_subjects",
            "compatible_streams",
            # Status
            "is_active",
            "subject_order",
            # Timestamps
            "created_at",
            "updated_at",
            # Stream assignments
            "stream_assignments",
        ]
        read_only_fields = ("id", "created_at", "updated_at")

    # ------------------------------------------------------------------
    # SerializerMethodFields
    # ------------------------------------------------------------------

    def get_grade_levels_info(self, obj):
        try:
            return [
                {"id": gl.id, "name": gl.name, "order": gl.order}
                for gl in obj.grade_levels.all().order_by("order")
            ]
        except Exception:
            return []

    def get_prerequisite_subjects(self, obj):
        try:
            prerequisites = (
                obj.get_prerequisite_subjects()
                if hasattr(obj, "get_prerequisite_subjects")
                else obj.prerequisites.filter(is_active=True)
            )
            return [
                {
                    "id": s.id,
                    "name": s.name,
                    "short_name": s.short_name,
                    "code": s.code,
                    "display_name": s.display_name,
                }
                for s in prerequisites
            ]
        except Exception:
            return []

    def get_dependent_subjects(self, obj):
        try:
            dependents = (
                obj.get_dependent_subjects()
                if hasattr(obj, "get_dependent_subjects")
                else obj.unlocks_subjects.filter(is_active=True)
            )
            return [
                {
                    "id": s.id,
                    "name": s.name,
                    "short_name": s.short_name,
                    "code": s.code,
                    "display_name": s.display_name,
                }
                for s in dependents
            ]
        except Exception:
            return []

    def get_education_level_details(self, obj):
        """
        Derive education level details from grade_levels M2M FK chain.
        grade_level.education_level is still a CharField on classroom.GradeLevel.
        Falls back to old education_levels JSONField if grade_levels is empty.
        """
        grade_levels = (
            list(obj.grade_levels.all().select_related())
            if hasattr(obj, "grade_levels")
            else []
        )
        # Collect level_type values from FK chain
        level_types = {gl.education_level for gl in grade_levels if gl.education_level}

        # Fall back to old JSONField if transition is incomplete
        if not level_types:
            level_types = set(getattr(obj, "education_levels", []) or [])

        details = {
            "applicable_levels": [
                {"code": lt, "name": lt.replace("_", " ").title()}
                for lt in sorted(level_types)
            ],
            "nursery_specific": [],
            "level_compatibility": {
                "nursery": "NURSERY" in level_types,
                "primary": "PRIMARY" in level_types,
                "junior_secondary": "JUNIOR_SECONDARY" in level_types,
                "senior_secondary": "SENIOR_SECONDARY" in level_types,
            },
        }

        nursery_levels = getattr(obj, "nursery_levels", []) or []
        if nursery_levels:
            details["nursery_specific"] = [
                {"code": nl, "name": nl.replace("_", " ").title()}
                for nl in nursery_levels
            ]

        return details

    def get_stream_assignments(self, obj):
        return SchoolStreamSubjectAssignmentSerializer(
            obj.stream_assignments.all(), many=True
        ).data

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    def validate_code(self, value):
        if not value:
            raise serializers.ValidationError("Subject code is required.")
        value = value.upper()
        import re

        if not re.match(r"^[A-Z][A-Z0-9\.\-]{1,14}$", value):
            raise serializers.ValidationError(
                "Subject code must follow format: SUBJECT-LEVEL "
                "(e.g., MATH-NUR, ENG-PRI, PHY-SS)"
            )
        return value

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Subject name cannot be empty.")
        if len(value.strip()) < 2:
            raise serializers.ValidationError(
                "Subject name must be at least 2 characters long."
            )
        return value.strip().title()

    def validate_nursery_levels(self, value):
        if not value:
            return value
        if not isinstance(value, list):
            raise serializers.ValidationError("Nursery levels must be a list.")
        # Validate against known nursery level codes (still a static list — these
        # sub-levels haven't been migrated to a FK model yet)
        valid_levels = ["PRE_NURSERY", "NURSERY_1", "NURSERY_2", "RECEPTION"]
        for level in value:
            if level not in valid_levels:
                raise serializers.ValidationError(
                    f"Invalid nursery level: {level}. Must be one of {valid_levels}"
                )
        return value

    def validate(self, data):
        # Derive level_types from the provided grade_levels FKs
        grade_levels = data.get("grade_levels", [])
        level_types = {gl.education_level for gl in grade_levels if gl.education_level}

        # Fall back to old education_levels JSONField during transition
        if not level_types:
            level_types = set(getattr(self.instance, "education_levels", []) or [])

        subject_type = data.get(
            "subject_type_new"
        )  # FK field (internal key after source mapping)
        is_cross_cutting = data.get("is_cross_cutting", False)

        # SS validations
        if "SENIOR_SECONDARY" in level_types and not subject_type:
            raise serializers.ValidationError(
                {
                    "ss_subject_type": "Senior Secondary subjects must have a subject type."
                }
            )

        if is_cross_cutting and "SENIOR_SECONDARY" not in level_types:
            raise serializers.ValidationError(
                {
                    "is_cross_cutting": "Cross-cutting subjects can only be applied to Senior Secondary level."
                }
            )

        # Nursery validations
        nursery_levels = data.get("nursery_levels", [])
        if nursery_levels and "NURSERY" not in level_types:
            raise serializers.ValidationError(
                {
                    "nursery_levels": "Nursery levels can only be specified for nursery subjects."
                }
            )

        return data

    def create(self, validated_data):
        try:
            instance = super().create(validated_data)
            instance.full_clean()
            return instance
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict)

    def update(self, instance, validated_data):
        try:
            instance = super().update(instance, validated_data)
            instance.full_clean()
            return instance
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            if hasattr(request.user, "is_staff") and request.user.is_staff:
                data["admin_info"] = {
                    "last_updated": getattr(instance, "updated_at", None),
                    "requires_attention": not getattr(instance, "is_active", True),
                    "has_resource_requirements": (
                        getattr(instance, "requires_lab", False)
                        or getattr(instance, "requires_special_equipment", False)
                    ),
                    "curriculum_alignment": getattr(
                        instance, "curriculum_version", None
                    )
                    or "Not specified",
                }
        return data


# ---------------------------------------------------------------------------
# List serializer (simplified)
# ---------------------------------------------------------------------------

class SubjectListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(
        source="category_new.name", read_only=True, allow_null=True
    )
    category_code = serializers.CharField(
        source="category_new.code", read_only=True, allow_null=True
    )
    category_new = serializers.SerializerMethodField()
    subject_type_new = serializers.SerializerMethodField()
    grade_level_names = serializers.SerializerMethodField()
    education_levels = serializers.JSONField(read_only=True)
    education_levels_display = serializers.CharField(read_only=True)
    status_summary = serializers.SerializerMethodField()
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "display_name",
            "short_name",
            "code",
            "category_new",
            "category_name",
            "category_code",
            "subject_type_new",
            "grade_level_names",
            "education_levels",
            "education_levels_display",
            "is_cross_cutting",
            "is_active",
            "status_summary",
            "subject_order",
        ]

    def get_category_new(self, obj):
        if obj.category_new:
            return {
                "id": obj.category_new.id,
                "name": obj.category_new.name,
                "code": obj.category_new.code,
                "color_code": getattr(obj.category_new, "color_code", None),
            }
        return None

    def get_subject_type_new(self, obj):
        if obj.subject_type_new:
            return {
                "id": obj.subject_type_new.id,
                "name": obj.subject_type_new.name,
                "code": obj.subject_type_new.code,
            }
        return None

    def get_grade_level_names(self, obj):
        return [gl.name for gl in obj.grade_levels.all().order_by("order")]

    def get_status_summary(self, obj):
        return "Active" if getattr(obj, "is_active", True) else "Inactive"


# ---------------------------------------------------------------------------
# Create / Update serializer
# ---------------------------------------------------------------------------

class SubjectCreateUpdateSerializer(serializers.ModelSerializer):
    # category → FK
    category = serializers.PrimaryKeyRelatedField(
        source="category_new",
        queryset=SubjectCategory.objects.all(),
        required=False,
        allow_null=True,
    )
    # ss_subject_type → FK
    ss_subject_type = serializers.PrimaryKeyRelatedField(
        source="subject_type_new",
        queryset=SubjectType.objects.all(),
        required=False,
        allow_null=True,
    )

    # Education levels (JSONField - writable)
    education_levels = serializers.JSONField(required=False, allow_null=True)

    # Writable M2M IDs
    grade_level_ids = serializers.PrimaryKeyRelatedField(
        source="grade_levels",
        queryset=GradeLevel.objects.all(),
        many=True,
        required=False,
        help_text="List of grade level IDs",
    )
    prerequisite_ids = serializers.PrimaryKeyRelatedField(
        source="prerequisites",
        queryset=Subject.objects.all(),
        many=True,
        required=False,
        help_text="List of prerequisite subject IDs",
    )

    class Meta:
        model = Subject
        fields = [
            "name",
            "short_name",
            "code",
            "description",
            "category",
            "education_levels",
            "nursery_levels",
            "ss_subject_type",
            "is_cross_cutting",
            "subject_order",
            "grade_level_ids",
            "prerequisite_ids",
        ]

    def validate_code(self, value):
        if not value:
            raise serializers.ValidationError("Subject code is required.")
        value = value.upper()
        import re

        if not re.match(r"^[A-Z][A-Z0-9\.\-]{1,14}$", value):
            raise serializers.ValidationError(
                "Subject code must follow format: SUBJECT-LEVEL "
                "(e.g., MATH-NUR, ENG-PRI, PHY-SS)"
            )
        queryset = Subject.objects.filter(code=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Subject with this code already exists.")
        return value

    def validate(self, data):
        # Derive level_types from the provided grade_levels FKs
        grade_levels = data.get("grade_levels", [])
        level_types = {gl.education_level for gl in grade_levels if gl.education_level}

        # Fall back to instance's existing grade_levels during partial update
        if not level_types and self.instance:
            level_types = {
                gl.education_level
                for gl in self.instance.grade_levels.all()
                if gl.education_level
            }

        if not level_types:
            raw_education_levels = self.initial_data.get("education_levels", [])
            if isinstance(raw_education_levels, list):
                level_types = set(raw_education_levels)
        subject_type = data.get("subject_type_new")
        is_cross_cutting = data.get("is_cross_cutting", False)

        if "SENIOR_SECONDARY" in level_types and not subject_type:
            raise serializers.ValidationError(
                {
                    "ss_subject_type": "Senior Secondary subjects must have a subject type."
                }
            )

        if is_cross_cutting and "SENIOR_SECONDARY" not in level_types:
            raise serializers.ValidationError(
                {
                    "is_cross_cutting": "Cross-cutting subjects can only be applied to Senior Secondary level."
                }
            )

        # Circular prerequisite check
        prerequisites = data.get("prerequisites", [])
        if self.instance and self.instance in prerequisites:
            raise serializers.ValidationError(
                {"prerequisite_ids": "Subject cannot be a prerequisite of itself."}
            )

        return data

    def create(self, validated_data):
        grade_levels = validated_data.pop("grade_levels", [])
        prerequisites = validated_data.pop("prerequisites", [])
        instance = super().create(validated_data)
        if grade_levels:
            instance.grade_levels.set(grade_levels)
        if prerequisites:
            instance.prerequisites.set(prerequisites)
        return instance

    def update(self, instance, validated_data):
        grade_levels = validated_data.pop("grade_levels", None)
        prerequisites = validated_data.pop("prerequisites", None)
        instance = super().update(instance, validated_data)
        if grade_levels is not None:
            instance.grade_levels.set(grade_levels)
        if prerequisites is not None:
            instance.prerequisites.set(prerequisites)
        return instance


# ---------------------------------------------------------------------------
# Specialised level-specific serializers
# ---------------------------------------------------------------------------


class NurserySubjectSerializer(serializers.ModelSerializer):
    nursery_levels_display = serializers.ReadOnlyField()
    is_activity_based = serializers.BooleanField(default=True)

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "short_name",
            "code",
            "description",
            "nursery_levels",
            "nursery_levels_display",
            "is_activity_based",
            "is_active",
            "subject_order",
        ]


class SeniorSecondarySubjectSerializer(serializers.ModelSerializer):
    # ss_subject_type via FK
    ss_subject_type = serializers.PrimaryKeyRelatedField(
        source="subject_type_new",
        queryset=SubjectType.objects.all(),
        required=False,
        allow_null=True,
    )
    ss_subject_type_name = serializers.CharField(
        source="subject_type_new.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "short_name",
            "code",
            "description",
            "ss_subject_type",
            "ss_subject_type_name",
            "is_cross_cutting",
            "is_active",
        ]

    def validate(self, data):
        if not data.get("subject_type_new"):
            raise serializers.ValidationError(
                {
                    "ss_subject_type": "Senior Secondary subjects must have a subject type."
                }
            )
        return super().validate(data)


# ---------------------------------------------------------------------------
# Education level detail serializer
# ---------------------------------------------------------------------------


class SubjectEducationLevelSerializer(serializers.ModelSerializer):
    applicable_education_levels = serializers.SerializerMethodField()
    education_level_compatibility = serializers.SerializerMethodField()
    level_specific_info = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "code",
            # old JSONField kept read-only
            "education_levels",
            "nursery_levels",
            "applicable_education_levels",
            "education_level_compatibility",
            "level_specific_info",
        ]

    def _get_level_types(self, obj):
        """Derive level_type set from grade_levels FK chain, fall back to JSONField."""
        try:
            level_types = {
                gl.education_level
                for gl in obj.grade_levels.all()
                if gl.education_level
            }
        except Exception:
            level_types = set()
        if not level_types:
            level_types = set(getattr(obj, "education_levels", []) or [])
        return level_types

    def get_applicable_education_levels(self, obj):
        level_types = self._get_level_types(obj)
        result = []
        for lt in sorted(level_types):
            level_info = {
                "code": lt,
                "name": lt.replace("_", " ").title(),
                "is_current": True,
            }
            if lt == "NURSERY":
                nursery_levels = getattr(obj, "nursery_levels", []) or []
                if nursery_levels:
                    level_info["sub_levels"] = [
                        {"code": nl, "name": nl.replace("_", " ").title()}
                        for nl in nursery_levels
                    ]
            result.append(level_info)
        return result

    def get_education_level_compatibility(self, obj):
        level_types = self._get_level_types(obj)
        return {
            "nursery_compatible": "NURSERY" in level_types,
            "primary_compatible": "PRIMARY" in level_types,
            "junior_secondary_compatible": "JUNIOR_SECONDARY" in level_types,
            "senior_secondary_compatible": "SENIOR_SECONDARY" in level_types,
            "all_levels": not level_types,
            "cross_cutting": obj.is_cross_cutting,
            "activity_based": False,
        }

    def get_level_specific_info(self, obj):
        level_types = self._get_level_types(obj)
        info = {"general": {}}
        if "NURSERY" in level_types:
            info["nursery"] = {
                "is_activity_based": False,
                "applicable_levels": getattr(obj, "nursery_levels_display", ""),
            }
        if "SENIOR_SECONDARY" in level_types:
            info["senior_secondary"] = {
                # type name via new FK
                "subject_type": (
                    obj.subject_type_new.name if obj.subject_type_new else None
                ),
                "is_cross_cutting": obj.is_cross_cutting,
            }
        return info


# ---------------------------------------------------------------------------
# Filter serializer — now accepts FK ids for category / ss_subject_type
# ---------------------------------------------------------------------------

class SubjectFilterSerializer(serializers.Serializer):
    """Serializer for filtering subjects by various criteria."""

    # education_level: filter by level_type string derived from grade_levels
    education_level = serializers.ChoiceField(
        choices=[
            ("NURSERY", "Nursery"),
            ("PRIMARY", "Primary"),
            ("JUNIOR_SECONDARY", "Junior Secondary"),
            ("SENIOR_SECONDARY", "Senior Secondary"),
        ],
        required=False,
        help_text="Filter by education level (matches grade_levels FK chain)",
    )

    nursery_level = serializers.ChoiceField(
        choices=[
            ("PRE_NURSERY", "Pre Nursery"),
            ("NURSERY_1", "Nursery 1"),
            ("NURSERY_2", "Nursery 2"),
            ("RECEPTION", "Reception"),
        ],
        required=False,
        help_text="Filter by nursery level",
    )

    # category: FK id (replaces old SUBJECT_CATEGORY_CHOICES CharField filter)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=SubjectCategory.objects.all(),
        required=False,
        allow_null=True,
        help_text="Filter by SubjectCategory id",
    )

    # ss_subject_type: FK id (replaces old SS_SUBJECT_TYPES CharField filter)
    ss_subject_type_id = serializers.PrimaryKeyRelatedField(
        queryset=SubjectType.objects.all(),
        required=False,
        allow_null=True,
        help_text="Filter by SubjectType id",
    )

    is_cross_cutting = serializers.BooleanField(
        required=False, help_text="Filter cross-cutting subjects"
    )

    is_active = serializers.BooleanField(
        default=True, help_text="Filter by active status"
    )


# ---------------------------------------------------------------------------
# SchoolStreamConfiguration serializers
# ---------------------------------------------------------------------------


class SchoolStreamSubjectAssignmentSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_code = serializers.CharField(source="subject.code", read_only=True)

    class Meta:
        model = SchoolStreamSubjectAssignment
        fields = [
            "id",
            "stream_config",
            "subject",
            "subject_name",
            "subject_code",
            "is_compulsory",
            "credit_weight",
            "can_be_elective_elsewhere",
            "prerequisites",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class SchoolStreamConfigurationSerializer(serializers.ModelSerializer):

    stream_name = serializers.CharField(source="stream.name", read_only=True)
    # stream_type via new FK (replaces old CharField source="stream.stream_type")
    stream_type = serializers.CharField(
        source="stream.stream_type_new.name", read_only=True, allow_null=True
    )
    stream_type_code = serializers.CharField(
        source="stream.stream_type_new.code", read_only=True, allow_null=True
    )
    subject_role_display = serializers.CharField(
        source="get_subject_role_display", read_only=True
    )
    stream_id = serializers.IntegerField(source="stream.id", read_only=True)
    subjects = serializers.SerializerMethodField()

    class Meta:
        model = SchoolStreamConfiguration
        fields = [
            "id",
            "stream",
            "stream_id",
            "stream_name",
            "stream_type",
            "stream_type_code",
            "subject_role",
            "subject_role_display",
            "min_subjects_required",
            "max_subjects_allowed",
            "is_compulsory",
            "display_order",
            "is_active",
            "subjects",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_subjects(self, obj):
        assignments = obj.subject_assignments.filter(is_active=True)
        return [
            {
                "id": a.subject.id,
                "name": a.subject.name,
                "code": a.subject.code,
                "is_compulsory": a.is_compulsory,
                "credit_weight": a.credit_weight,
            }
            for a in assignments
        ]


class SchoolStreamSubjectAssignmentDetailSerializer(
    SchoolStreamSubjectAssignmentSerializer
):
    """Assignment serializer that includes full stream config detail."""

    stream_config_info = SchoolStreamConfigurationSerializer(
        source="stream_config", read_only=True
    )

    class Meta(SchoolStreamSubjectAssignmentSerializer.Meta):
        fields = SchoolStreamSubjectAssignmentSerializer.Meta.fields + [
            "stream_config_info"
        ]


# ---------------------------------------------------------------------------
# Stream configuration summary
# ---------------------------------------------------------------------------


class StreamConfigurationSummarySerializer(serializers.Serializer):
    stream_id = serializers.IntegerField()
    stream_name = serializers.CharField()
    # stream_type is a display name derived from the FK — plain CharField output
    stream_type = serializers.CharField(
        help_text="Stream type name (from stream.stream_type_new.name)"
    )
    cross_cutting_subjects = serializers.ListField(child=serializers.DictField())
    core_subjects = serializers.ListField(child=serializers.DictField())
    elective_subjects = serializers.ListField(child=serializers.DictField())
    total_subjects = serializers.IntegerField()
    min_subjects_required = serializers.IntegerField()
    max_subjects_allowed = serializers.IntegerField()


# ---------------------------------------------------------------------------
# SUBJECT COMBINATION SERIALIZERS
# ---------------------------------------------------------------------------


class SubjectCombinationSerializer(serializers.ModelSerializer):
    """Serializer for SubjectCombination model"""

    stream_name = serializers.CharField(source="stream.name", read_only=True)
    stream_code = serializers.CharField(source="stream.code", read_only=True)

    # Subject IDs for input/output
    core_subjects = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.all(), many=True, required=False
    )
    elective_subjects = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.all(), many=True, required=False
    )
    cross_cutting_subjects = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.all(), many=True, required=False
    )

    # Subject details for output
    core_subjects_detail = serializers.SerializerMethodField()
    elective_subjects_detail = serializers.SerializerMethodField()
    cross_cutting_subjects_detail = serializers.SerializerMethodField()

    total_subjects = serializers.ReadOnlyField()

    class Meta:
        model = SubjectCombination
        fields = [
            "id",
            "name",
            "code",
            "description",
            "stream",
            "stream_name",
            "stream_code",
            "core_subjects",
            "elective_subjects",
            "cross_cutting_subjects",
            "core_subjects_detail",
            "elective_subjects_detail",
            "cross_cutting_subjects_detail",
            "total_subjects",
            "display_order",
            "is_active",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_core_subjects_detail(self, obj):
        return [
            {
                "id": subject.id,
                "name": subject.name,
                "code": subject.code,
                "credit_weight": getattr(subject, "credit_weight", 1),
            }
            for subject in obj.core_subjects.all()
        ]

    def get_elective_subjects_detail(self, obj):
        return [
            {
                "id": subject.id,
                "name": subject.name,
                "code": subject.code,
                "credit_weight": getattr(subject, "credit_weight", 1),
            }
            for subject in obj.elective_subjects.all()
        ]

    def get_cross_cutting_subjects_detail(self, obj):
        return [
            {
                "id": subject.id,
                "name": subject.name,
                "code": subject.code,
                "credit_weight": getattr(subject, "credit_weight", 1),
            }
            for subject in obj.cross_cutting_subjects.all()
        ]

    def validate_code(self, value):
        """Ensure code is unique within the tenant and stream"""
        request = self.context.get("request")
        if request and hasattr(request, "tenant"):
            tenant = request.tenant
            stream_id = self.initial_data.get("stream")

            # Check for existing combination with same code
            existing = SubjectCombination.objects.filter(
                tenant=tenant, stream_id=stream_id, code=value
            )

            # Exclude current instance if updating
            if self.instance:
                existing = existing.exclude(id=self.instance.id)

            if existing.exists():
                raise serializers.ValidationError(
                    f"A combination with code '{value}' already exists for this stream."
                )

        return value

    def validate(self, data):
        """Validate that subjects are available in stream configurations"""
        stream = data.get("stream")
        if stream:
            # Get stream configurations
            configs = SchoolStreamConfiguration.objects.filter(
                tenant=getattr(self.context.get("request"), "tenant", None),
                stream=stream,
                is_active=True,
            )

            # Validate core subjects
            core_subjects = data.get("core_subjects", [])
            if core_subjects:
                core_config = configs.filter(subject_role="core").first()
                if core_config:
                    valid_subject_ids = set(
                        core_config.subject_assignments.filter(
                            is_active=True
                        ).values_list("subject_id", flat=True)
                    )
                    invalid_subjects = [
                        subj
                        for subj in core_subjects
                        if subj.id not in valid_subject_ids
                    ]
                    if invalid_subjects:
                        raise serializers.ValidationError(
                            {
                                "core_subjects": f"Subjects {', '.join([s.name for s in invalid_subjects])} are not available as core subjects in this stream."
                            }
                        )

            # Validate elective subjects
            elective_subjects = data.get("elective_subjects", [])
            if elective_subjects:
                elective_config = configs.filter(subject_role="elective").first()
                if elective_config:
                    valid_subject_ids = set(
                        elective_config.subject_assignments.filter(
                            is_active=True
                        ).values_list("subject_id", flat=True)
                    )
                    invalid_subjects = [
                        subj
                        for subj in elective_subjects
                        if subj.id not in valid_subject_ids
                    ]
                    if invalid_subjects:
                        raise serializers.ValidationError(
                            {
                                "elective_subjects": f"Subjects {', '.join([s.name for s in invalid_subjects])} are not available as elective subjects in this stream."
                            }
                        )

            # Validate cross-cutting subjects
            cross_cutting_subjects = data.get("cross_cutting_subjects", [])
            if cross_cutting_subjects:
                cross_cutting_config = configs.filter(
                    subject_role="cross_cutting"
                ).first()
                if cross_cutting_config:
                    valid_subject_ids = set(
                        cross_cutting_config.subject_assignments.filter(
                            is_active=True
                        ).values_list("subject_id", flat=True)
                    )
                    invalid_subjects = [
                        subj
                        for subj in cross_cutting_subjects
                        if subj.id not in valid_subject_ids
                    ]
                    if invalid_subjects:
                        raise serializers.ValidationError(
                            {
                                "cross_cutting_subjects": f"Subjects {', '.join([s.name for s in invalid_subjects])} are not available as cross-cutting subjects in this stream."
                            }
                        )

        return data
