from rest_framework import serializers
from django.contrib.auth.models import User
from django.utils import timezone
from academics.models import AcademicSession, Term

from .models import (
    GradeLevel,
    Section,
    Classroom,
    ClassroomTeacherAssignment,
    StudentEnrollment,
    ClassSchedule,
    Stream,
    StreamType,
    Class as StudentClass,
)
from subject.models import Subject
from students.models import Student
from teacher.models import Teacher
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# User Serializer
# ---------------------------------------------------------------------------

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "full_name"]
        read_only_fields = ["id"]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


# ---------------------------------------------------------------------------
# GradeLevel / Section
# ---------------------------------------------------------------------------


class GradeLevelSerializer(serializers.ModelSerializer):
    education_level_display = serializers.CharField(
        source="education_level.name",
        read_only=True,  # ✅ FK, not get_education_level_display
    )
    section_count = serializers.SerializerMethodField()

    class Meta:
        model = GradeLevel
        fields = [
            "id",
            "name",
            "description",
            "education_level",
            "education_level_display",
            "order",
            "is_active",
            "section_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_section_count(self, obj):
        return Section.objects.filter(
            class_grade__grade_level=obj, is_active=True
        ).count()


# SectionSerializer — correct traversal: section → class_grade → grade_level
class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(
        source="class_grade.grade_level.name", read_only=True, allow_null=True
    )
    education_level = serializers.CharField(
        source="class_grade.education_level.level_type",
        read_only=True,
        allow_null=True,
        # or source="class_grade.education_level.name" — check your EducationLevel model
    )
    education_level_display = serializers.CharField(
        source="class_grade.education_level.name", read_only=True, allow_null=True
    )
    classroom_name = serializers.CharField(source="class_grade.name", read_only=True)
    classroom_count = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id",
            "name",
            "class_grade",
            "classroom_name",
            "grade_level_name",
            "education_level",
            "education_level_display",
            "classroom_count",
            "is_active",
        ]
        read_only_fields = ["id"]

    def get_classroom_count(self, obj):
        return Classroom.objects.filter(section=obj, is_active=True).count()


# ---------------------------------------------------------------------------
# Academic session / Term (pass-through, no FK changes needed)
# ---------------------------------------------------------------------------

class AcademicSessionSerializer(serializers.ModelSerializer):
    term_count = serializers.SerializerMethodField()
    classroom_count = serializers.SerializerMethodField()
    is_current_session = serializers.BooleanField(source="is_current", read_only=True)

    class Meta:
        model = AcademicSession
        fields = [
            "id",
            "name",
            "start_date",
            "end_date",
            "is_current",
            "is_current_session",
            "is_active",
            "term_count",
            "classroom_count",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_term_count(self, obj):
        return obj.terms.filter(is_active=True).count()

    def get_classroom_count(self, obj):
        return obj.classrooms.filter(is_active=True).count()

    def validate(self, data):
        if data["start_date"] >= data["end_date"]:
            raise serializers.ValidationError("End date must be after start date.")
        return data


class TermSerializer(serializers.ModelSerializer):
    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    name_display = serializers.CharField(source="get_name_display", read_only=True)
    classroom_count = serializers.SerializerMethodField()

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
            "classroom_count",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_classroom_count(self, obj):
        return obj.classrooms.filter(is_active=True).count()

    def validate(self, data):
        if data["start_date"] >= data["end_date"]:
            raise serializers.ValidationError("End date must be after start date.")
        return data


# ---------------------------------------------------------------------------
# StreamType serializer (new model)
# ---------------------------------------------------------------------------


class StreamTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = StreamType
        fields = [
            "id",
            "name",
            "code",
            "description",
            "color_code",
            "display_order",
            "is_active",
        ]
        read_only_fields = ["id"]


# ---------------------------------------------------------------------------
# Stream serializer — updated for FK-based stream_type
# ---------------------------------------------------------------------------

class StreamSerializer(serializers.ModelSerializer):
    """Serializer for Stream model — Science, Arts, etc."""

    # New FK field: stream_type_new → StreamType
    stream_type_id = serializers.PrimaryKeyRelatedField(
        source="stream_type_new",
        queryset=StreamType.objects.all(),
        required=False,
        allow_null=True,
        help_text="FK to StreamType (replaces old stream_type CharField)",
    )

    stream_type_name = serializers.CharField(
        source="stream_type_new.name", read_only=True, allow_null=True
    )
    stream_type_code = serializers.CharField(
        source="stream_type_new.code", read_only=True, allow_null=True
    )
    stream_type_detail = StreamTypeSerializer(
        source="stream_type_new",
        read_only=True,
        allow_null=True,
    )

    # Keep old field as read-only for backward compat during transition
    stream_type_legacy = serializers.CharField(
        source="stream_type",
        read_only=True,
        allow_blank=True,
        allow_null=True,
        default="",
        help_text="Deprecated — use stream_type_name instead",
    )

    student_count = serializers.SerializerMethodField()

    class Meta:
        model = Stream
        fields = [
            "id",
            "name",
            "code",
            # new FK fields
            "stream_type_id",
            "stream_type_name",
            "stream_type_code",
            "stream_type_detail",
            # backward-compat read-only
            "stream_type_legacy",
            "description",
            "is_active",
            "student_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "stream_type_legacy"]

    def get_student_count(self, obj):
        return (
            obj.students.filter(is_active=True).count()
            if hasattr(obj, "students")
            else 0
        )


# ---------------------------------------------------------------------------
# Teacher serializer (unchanged — Teacher model has no FK changes)
# ---------------------------------------------------------------------------

class TeacherSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)
    full_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    primary_classes_count = serializers.SerializerMethodField()
    assigned_classes_count = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = [
            "id",
            "user",
            "user_id",
            "employee_id",
            "full_name",
            "phone_number",
            "address",
            "date_of_birth",
            "age",
            "hire_date",
            "qualification",
            "specialization",
            "primary_classes_count",
            "assigned_classes_count",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_age(self, obj):
        if obj.date_of_birth:
            today = timezone.now().date()
            return (
                today.year
                - obj.date_of_birth.year
                - (
                    (today.month, today.day)
                    < (obj.date_of_birth.month, obj.date_of_birth.day)
                )
            )
        return None

    def get_primary_classes_count(self, obj):
        return obj.primary_classes.filter(is_active=True).count()

    def get_assigned_classes_count(self, obj):
        return obj.assigned_classes.filter(is_active=True).count()

    def validate_employee_id(self, value):
        if (
            Teacher.objects.filter(employee_id=value)
            .exclude(pk=self.instance.pk if self.instance else None)
            .exists()
        ):
            raise serializers.ValidationError("Employee ID must be unique.")
        return value


# ---------------------------------------------------------------------------
# Student serializer — updated for FK-based student_class & education_level
# ---------------------------------------------------------------------------


class StudentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    age = serializers.SerializerMethodField()

    # student_class is now a FK to students.Class
    student_class = serializers.PrimaryKeyRelatedField(
        queryset=StudentClass.objects.all(), required=False, allow_null=True
    )
    student_class_name = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )

    # education_level is now a @property on Student → level_type string
    education_level = serializers.CharField(read_only=True)
    education_level_display = serializers.CharField(
        source="education_level_display", read_only=True
    )

    stream_name = serializers.CharField(source="stream.name", read_only=True)
    # stream_type via new FK
    stream_type = serializers.CharField(
        source="stream.stream_type_new.name", read_only=True, allow_null=True
    )

    # classroom is now a @property returning a string
    classroom = serializers.CharField(read_only=True)

    current_classroom = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            "id",
            "user",
            "full_name",
            "email",
            "registration_number",
            "gender",
            "date_of_birth",
            "age",
            "student_class",
            "student_class_name",
            "education_level",
            "education_level_display",
            "admission_date",
            "profile_picture",
            "classroom",
            "stream",
            "stream_name",
            "stream_type",
            "parent_contact",
            "emergency_contact",
            "medical_conditions",
            "special_requirements",
            "blood_group",
            "place_of_birth",
            "address",
            "phone_number",
            "payment_method",
            "is_active",
            "current_classroom",
        ]
        read_only_fields = ["id", "admission_date", "education_level", "classroom"]

    def get_age(self, obj):
        return obj.age

    # StudentSerializer.get_current_classroom
    def get_current_classroom(self, obj):
        enrollment = (
            obj.enrolled_classes.filter(
                studentenrollment__is_active=True, is_active=True
            )
            .select_related(
                "section__class_grade",
                "section__class_grade__grade_level",
            )
            .first()
        )
        if enrollment:
            grade_level = enrollment.section.class_grade.grade_level
            return {
                "id": enrollment.id,
                "name": enrollment.name,
                "section": enrollment.section.name,
                # ✅ fall back to class name if grade_level not yet assigned
                "grade_level": (
                    grade_level.name
                    if grade_level
                    else enrollment.section.class_grade.name
                ),
            }
        return None

    def validate_registration_number(self, value):
        if (
            Student.objects.filter(registration_number=value)
            .exclude(pk=self.instance.pk if self.instance else None)
            .exists()
        ):
            raise serializers.ValidationError("Registration number must be unique.")
        return value


# ---------------------------------------------------------------------------
# Subject serializer — updated for new M2M grade_levels and no is_core field
# ---------------------------------------------------------------------------

class SubjectSerializer(serializers.ModelSerializer):
    # grade_levels is the new M2M field (replacing old education_levels JSONField)
    grade_levels_display = serializers.SerializerMethodField()

    # category via new FK
    category_name = serializers.CharField(
        source="category_new.name", read_only=True, allow_null=True
    )
    category_code = serializers.CharField(
        source="category_new.code", read_only=True, allow_null=True
    )

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "short_name",
            "code",
            "description",
            "grade_levels",
            "grade_levels_display",
            "category_name",
            "category_code",
            "is_cross_cutting",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_grade_levels_display(self, obj):
        return [
            {
                "id": gl.id,
                "name": gl.name,
                # education_level is still a CharField on classroom.GradeLevel
                "education_level": gl.education_level,
            }
            for gl in obj.grade_levels.all()
        ]

    def validate_code(self, value):
        if (
            Subject.objects.filter(code=value)
            .exclude(pk=self.instance.pk if self.instance else None)
            .exists()
        ):
            raise serializers.ValidationError("Subject code must be unique.")
        return value


# ---------------------------------------------------------------------------
# ClassroomTeacherAssignment serializer
# education_level fix: traverse section → grade_level, not classroom.grade_level
# ---------------------------------------------------------------------------

class ClassroomTeacherAssignmentSerializer(serializers.ModelSerializer):
    # Accept _id fields from frontend
    classroom_id = serializers.IntegerField(write_only=True)
    teacher_id = serializers.IntegerField(write_only=True)
    subject_id = serializers.IntegerField(write_only=True)

    # Read-only FK display
    classroom = serializers.PrimaryKeyRelatedField(read_only=True)
    teacher = serializers.PrimaryKeyRelatedField(read_only=True)
    subject = serializers.PrimaryKeyRelatedField(read_only=True)

    teacher_name = serializers.CharField(
        source="teacher.user.full_name", read_only=True
    )
    teacher_email = serializers.CharField(source="teacher.user.email", read_only=True)
    teacher_phone = serializers.CharField(source="teacher.phone_number", read_only=True)
    teacher_employee_id = serializers.CharField(
        source="teacher.employee_id", read_only=True
    )
    teacher_first_name = serializers.CharField(
        source="teacher.user.first_name", read_only=True
    )
    teacher_last_name = serializers.CharField(
        source="teacher.user.last_name", read_only=True
    )
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_code = serializers.CharField(source="subject.code", read_only=True)

    # Correct traversal: classroom → section → grade_level → education_level
    # (classroom.GradeLevel still uses CharField for education_level)
    education_level = serializers.SerializerMethodField()

    class Meta:
        model = ClassroomTeacherAssignment
        fields = [
            "id",
            "classroom_id",
            "classroom",
            "teacher_id",
            "teacher",
            "teacher_name",
            "teacher_email",
            "teacher_phone",
            "teacher_employee_id",
            "teacher_first_name",
            "teacher_last_name",
            "education_level",
            "subject_id",
            "subject",
            "subject_name",
            "subject_code",
            "is_primary_teacher",
            "periods_per_week",
            "assigned_date",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "classroom", "teacher", "subject"]

    # ClassroomTeacherAssignmentSerializer.get_education_level

    # def get_education_level(self, obj):
    #     try:
    #         if obj.classroom and obj.classroom.section:
    #             # ✅ section → class_grade → education_level → level_type
    #             return obj.classroom.section.class_grade.education_level.level_type
    #         return None
    #     except (AttributeError, ValueError) as e:
    #         logger.warning(
    #             f"Could not get education_level for assignment {obj.id}: {e}"
    #         )
    #         return None
    def get_education_level(self, obj):
        try:
            # Try the current path
            val = obj.section.class_grade.education_level.level_type
            return val or ""
        except AttributeError:
            pass
        try:
            # Fallback: maybe it's directly on class_grade
            return obj.section.class_grade.level_type or ""
        except AttributeError:
            pass
        try:
            # Fallback: maybe education_level is a CharField not a FK
            return obj.section.class_grade.education_level or ""
        except AttributeError:
            return ""

    def create(self, validated_data):
        if "classroom_id" in validated_data:
            classroom_id = validated_data.pop("classroom_id")
            try:
                validated_data["classroom"] = Classroom.objects.get(id=classroom_id)
            except Classroom.DoesNotExist:
                raise serializers.ValidationError(
                    f"Classroom with id {classroom_id} does not exist"
                )

        if "teacher_id" in validated_data:
            teacher_id = validated_data.pop("teacher_id")
            try:
                validated_data["teacher"] = Teacher.objects.get(id=teacher_id)
            except Teacher.DoesNotExist:
                raise serializers.ValidationError(
                    f"Teacher with id {teacher_id} does not exist"
                )

        if "subject_id" in validated_data:
            subject_id = validated_data.pop("subject_id")
            try:
                validated_data["subject"] = Subject.objects.get(id=subject_id)
            except Subject.DoesNotExist:
                raise serializers.ValidationError(
                    f"Subject with id {subject_id} does not exist"
                )

        return ClassroomTeacherAssignment.objects.create(**validated_data)


# ---------------------------------------------------------------------------
# StudentEnrollment serializer
# student_class is now a FK — expose name instead of raw value
# ---------------------------------------------------------------------------


class StudentEnrollmentSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source="student.id", read_only=True)
    full_name = serializers.CharField(source="student.user.full_name", read_only=True)
    student_stream = serializers.CharField(
        source="student.stream.name", read_only=True, allow_null=True
    )
    registration_number = serializers.CharField(
        source="student.registration_number", read_only=True
    )
    profile_picture = serializers.CharField(
        source="student.profile_picture", read_only=True
    )
    gender = serializers.CharField(source="student.gender", read_only=True)

    # student_class is now a FK — expose name for display
    student_class = serializers.CharField(
        source="student.student_class.name", read_only=True, allow_null=True
    )
    student_class_id = serializers.IntegerField(
        source="student.student_class.id", read_only=True, allow_null=True
    )

    age = serializers.SerializerMethodField()
    enrollment_id = serializers.IntegerField(source="id", read_only=True)
    enrollment_date = serializers.DateField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = StudentEnrollment
        fields = [
            "enrollment_id",
            "student_id",
            "full_name",
            "registration_number",
            "profile_picture",
            "gender",
            "student_class",
            "student_class_id",
            "student_stream",
            "age",
            "enrollment_date",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["enrollment_id", "created_at"]

    def get_age(self, obj):
        return obj.student.age if obj.student else None


# ---------------------------------------------------------------------------
# ClassSchedule serializer (no FK changes needed)
# ---------------------------------------------------------------------------

class ClassScheduleSerializer(serializers.ModelSerializer):
    day_display = serializers.CharField(
        source="get_day_of_week_display", read_only=True
    )
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.CharField(
        source="teacher.user.get_full_name", read_only=True
    )
    duration_minutes = serializers.SerializerMethodField()
    time_slot = serializers.SerializerMethodField()

    class Meta:
        model = ClassSchedule
        fields = [
            "id",
            "subject",
            "subject_name",
            "teacher",
            "teacher_name",
            "day_of_week",
            "day_display",
            "start_time",
            "end_time",
            "time_slot",
            "duration_minutes",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_duration_minutes(self, obj):
        return obj.duration

    def get_time_slot(self, obj):
        return f"{obj.start_time.strftime('%H:%M')} - {obj.end_time.strftime('%H:%M')}"

    def validate(self, data):
        if data["start_time"] >= data["end_time"]:
            raise serializers.ValidationError("End time must be after start time.")
        return data


# ---------------------------------------------------------------------------
# Classroom serializer (no changes to FK chain — still section → grade_level)
# ---------------------------------------------------------------------------

class ClassroomSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.name", read_only=True)

    # ✅ Only ONE education_level — using .code which has the actual value
    education_level = serializers.CharField(
        source="section.class_grade.education_level.code", read_only=True
    )

    # ✅ Add the missing grade_level_name declaration
    grade_level_name = serializers.CharField(
        source="section.class_grade.grade_level.name", read_only=True, allow_null=True
    )

    academic_session_name = serializers.CharField(
        source="academic_session.name", read_only=True
    )
    term_name = serializers.CharField(source="term.get_name_display", read_only=True)
    class_teacher_name = serializers.CharField(
        source="class_teacher.user.get_full_name", read_only=True
    )
    class_teacher_phone = serializers.CharField(
        source="class_teacher.phone_number", read_only=True
    )
    class_teacher_employee_id = serializers.CharField(
        source="class_teacher.employee_id", read_only=True
    )
    subjects = SubjectSerializer(many=True, read_only=True)
    current_enrollment = serializers.IntegerField(
        source="current_enrollment_count", read_only=True
    )
    available_spots = serializers.SerializerMethodField()
    enrollment_percentage = serializers.SerializerMethodField()
    is_full = serializers.SerializerMethodField()
    co_teachers = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "section",
            "section_name",
            "grade_level_name",
            "education_level",
            "academic_session",
            "academic_session_name",
            "term",
            "term_name",
            "class_teacher",
            "class_teacher_name",
            "class_teacher_phone",
            "class_teacher_employee_id",
            "co_teachers",
            "subjects",
            "room_number",
            "max_capacity",
            "current_enrollment",
            "available_spots",
            "enrollment_percentage",
            "is_full",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_available_spots(self, obj):
        return obj.available_spots

    def get_enrollment_percentage(self, obj):
        if obj.max_capacity > 0:
            return round((obj.current_enrollment / obj.max_capacity) * 100, 1)
        return 0

    def get_is_full(self, obj):
        return obj.is_full

    def get_co_teachers(self, obj):
        return [
            {
                "id": a.id,
                "teacher_id": a.teacher_id,
                "teacher_name": a.teacher.user.get_full_name(),
                "teacher_phone": a.teacher.phone_number,
                "teacher_employee_id": a.teacher.employee_id,
                "assigned_date": str(a.assigned_date),
            }
            for a in obj.co_teacher_assignments.select_related("teacher__user").all()
        ]

    def validate_max_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Maximum capacity must be at least 1.")
        if value > 100:
            raise serializers.ValidationError("Maximum capacity cannot exceed 100.")
        return value


class ClassroomDetailSerializer(ClassroomSerializer):
    subjects = SubjectSerializer(many=True, read_only=True)
    teacher_assignments = serializers.SerializerMethodField()
    student_enrollments = StudentEnrollmentSerializer(
        source="studentenrollment_set", many=True, read_only=True
    )
    class_schedules = ClassScheduleSerializer(
        source="schedules", many=True, read_only=True
    )
    current_enrollment = serializers.SerializerMethodField()

    class Meta(ClassroomSerializer.Meta):
        fields = ClassroomSerializer.Meta.fields + [
            "subjects",
            "teacher_assignments",
            "student_enrollments",
            "class_schedules",
            "current_enrollment",
        ]

    def get_current_enrollment(self, obj):
        return obj.studentenrollment_set.filter(
            is_active=True, student__is_active=True
        ).count()

    def get_teacher_assignments(self, obj):
        assignments = getattr(obj, "active_assignments", [])
        return ClassroomTeacherAssignmentSerializer(assignments, many=True).data


class ClassSerializer(serializers.ModelSerializer):
    education_level_name = serializers.CharField(
        source="education_level.name", read_only=True
    )
    grade_level_name = serializers.CharField(
        source="grade_level.name", read_only=True, allow_null=True
    )

    class Meta:
        model = StudentClass
        fields = [
            "id",
            "name",
            "code",
            "education_level",
            "education_level_name",
            "grade_level",
            "grade_level_name",
            "grade_number",
            "order",
            "default_capacity",
            "is_active",
        ]
        read_only_fields = ["id"]


# ---------------------------------------------------------------------------
# Simple / dropdown serializers
# ---------------------------------------------------------------------------

class GradeLevelSimpleSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = ["id", "name", "education_level"]


# SectionSimpleSerializer
class SectionSimpleSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(
        source="class_grade.grade_level.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Section
        fields = ["id", "name", "class_grade", "grade_level_name"]


class TeacherSimpleSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = Teacher
        fields = ["id", "employee_id", "full_name", "specialization"]


class StudentSimpleSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    # student_class is now a FK — expose name for display
    student_class_name = serializers.CharField(
        source="student_class.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Student
        fields = [
            "id",
            "registration_number",
            "full_name",
            "student_class",
            "student_class_name",
            "profile_picture",
        ]


class SubjectSimpleSerializer(serializers.ModelSerializer):
    # is_core removed — replaced by category_new FK or is_cross_cutting bool
    category_name = serializers.CharField(
        source="category_new.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Subject
        fields = ["id", "name", "code", "category_name", "is_cross_cutting"]


class ClassroomSimpleSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Classroom
        fields = ["id", "name", "display_name"]

    def get_display_name(self, obj):
        return str(obj)


# ---------------------------------------------------------------------------
# Bulk operation serializers
# ---------------------------------------------------------------------------

class BulkStudentEnrollmentSerializer(serializers.Serializer):
    classroom_id = serializers.IntegerField()
    student_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1, max_length=50
    )
    enrollment_date = serializers.DateField(default=timezone.now().date())

    def validate_classroom_id(self, value):
        if not Classroom.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Invalid classroom ID.")
        return value

    def validate_student_ids(self, value):
        existing_ids = Student.objects.filter(id__in=value, is_active=True).values_list(
            "id", flat=True
        )
        invalid_ids = set(value) - set(existing_ids)
        if invalid_ids:
            raise serializers.ValidationError(
                f"Invalid student IDs: {list(invalid_ids)}"
            )
        return value
