from rest_framework import serializers
from .models import Student, ResultCheckToken
from academics.models import EducationLevel
from users.models import CustomUser
from parent.models import ParentProfile
from django.contrib.auth.models import BaseUserManager
from utils import generate_unique_username
from classroom.models import Stream, Class
from classroom.models import ClassSchedule, ClassroomTeacherAssignment, Section


class StudentScheduleSerializer(serializers.ModelSerializer):
    """Enhanced schedule serializer for students based on teacher serializer patterns"""

    # Subject information
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_id = serializers.IntegerField(source="subject.id", read_only=True)

    # Teacher information
    teacher_name = serializers.SerializerMethodField()
    teacher_id = serializers.IntegerField(source="teacher.id", read_only=True)
    teacher_qualification = serializers.CharField(
        source="teacher.qualification", read_only=True
    )

    # Classroom information
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    classroom_id = serializers.IntegerField(source="classroom.id", read_only=True)
    room_number = serializers.CharField(source="classroom.room_number", read_only=True)

    # Section and Grade information
    section_name = serializers.CharField(
        source="classroom.section.name", read_only=True
    )
    section_id = serializers.IntegerField(source="classroom.section.id", read_only=True)

    grade_level_name = serializers.CharField(
        source="classroom.section.class_grade.name", read_only=True
    )
    grade_level_id = serializers.IntegerField(
        source="classroom.section.class_grade.id", read_only=True
    )
    education_level = serializers.CharField(
        source="classroom.section.class_grade.education_level.level_type",
        read_only=True,
    )

    # Stream information — uses new FK field
    stream_name = serializers.CharField(source="classroom.stream.name", read_only=True)
    stream_type = serializers.CharField(
        source="classroom.stream.stream_type_new.name", read_only=True
    )

    # Academic period information
    academic_year = serializers.CharField(
        source="classroom.academic_session.name", read_only=True
    )
    term = serializers.CharField(
        source="classroom.term.get_name_display", read_only=True
    )

    # Time formatting
    start_time_display = serializers.SerializerMethodField()
    end_time_display = serializers.SerializerMethodField()
    duration = serializers.SerializerMethodField()
    day_display = serializers.SerializerMethodField()

    # Additional computed fields
    is_current_period = serializers.SerializerMethodField()
    periods_per_week = serializers.SerializerMethodField()

    class Meta:
        model = ClassSchedule
        fields = [
            "id",
            "day_of_week",
            "start_time",
            "end_time",
            # Subject fields
            "subject_id",
            "subject_name",
            "subject_code",
            # Teacher fields
            "teacher_id",
            "teacher_name",
            "teacher_qualification",
            # Classroom fields
            "classroom_id",
            "classroom_name",
            "room_number",
            # Section and Grade fields
            "section_id",
            "section_name",
            "grade_level_id",
            "grade_level_name",
            "education_level",
            # Stream fields (for Senior Secondary)
            "stream_name",
            "stream_type",
            # Academic period fields
            "academic_year",
            "term",
            # Time display fields
            "start_time_display",
            "end_time_display",
            "duration",
            "day_display",
            # Computed fields
            "is_current_period",
            "periods_per_week",
            "is_active",
        ]
        read_only_fields = ["id", "is_active"]

    def get_teacher_name(self, obj):
        user = getattr(getattr(obj, "teacher", None), "user", None)
        if not user:
            return ""
        full = getattr(user, "full_name", None)
        if full:
            return full
        first = getattr(user, "first_name", "") or ""
        last = getattr(user, "last_name", "") or ""
        name = f"{first} {last}".strip()
        return name or getattr(user, "username", "")

    def get_start_time_display(self, obj):
        if obj.start_time:
            return obj.start_time.strftime("%I:%M %p")
        return None

    def get_end_time_display(self, obj):
        if obj.end_time:
            return obj.end_time.strftime("%I:%M %p")
        return None

    def get_duration(self, obj):
        if obj.start_time and obj.end_time:
            from datetime import datetime

            start = datetime.combine(datetime.today(), obj.start_time)
            end = datetime.combine(datetime.today(), obj.end_time)
            return int((end - start).total_seconds() / 60)
        return None

    def get_day_display(self, obj):
        day_mapping = {
            "MONDAY": "Monday",
            "TUESDAY": "Tuesday",
            "WEDNESDAY": "Wednesday",
            "THURSDAY": "Thursday",
            "FRIDAY": "Friday",
            "SATURDAY": "Saturday",
            "SUNDAY": "Sunday",
        }
        return day_mapping.get(obj.day_of_week, obj.day_of_week)

    def get_is_current_period(self, obj):
        from datetime import datetime

        now = datetime.now()
        # ClassSchedule.DAYS_OF_WEEK uses full names e.g. "MONDAY"
        current_day = now.strftime("%A").upper()
        current_time = now.time()
        return (
            obj.day_of_week == current_day
            and obj.start_time <= current_time <= obj.end_time
        )

    def get_periods_per_week(self, obj):
        if (
            hasattr(obj, "teacher")
            and hasattr(obj, "classroom")
            and hasattr(obj, "subject")
        ):
            try:
                assignment = ClassroomTeacherAssignment.objects.get(
                    teacher=obj.teacher,
                    classroom=obj.classroom,
                    subject=obj.subject,
                    is_active=True,
                )
                return assignment.periods_per_week
            except ClassroomTeacherAssignment.DoesNotExist:
                return 1
        return 1


class StudentWeeklyScheduleSerializer(serializers.Serializer):
    """Serializer for student's complete weekly schedule"""

    student_id = serializers.IntegerField()
    student_name = serializers.CharField()
    classroom_name = serializers.CharField()
    # education_level comes from Student.education_level property (level_type string)
    education_level = serializers.CharField()
    academic_year = serializers.CharField()
    term = serializers.CharField()

    monday = StudentScheduleSerializer(many=True)
    tuesday = StudentScheduleSerializer(many=True)
    wednesday = StudentScheduleSerializer(many=True)
    thursday = StudentScheduleSerializer(many=True)
    friday = StudentScheduleSerializer(many=True)
    saturday = StudentScheduleSerializer(many=True, required=False)
    sunday = StudentScheduleSerializer(many=True, required=False)

    total_periods_per_week = serializers.IntegerField()
    total_subjects = serializers.IntegerField()
    total_teachers = serializers.IntegerField()
    average_daily_periods = serializers.FloatField()


class StudentDailyScheduleSerializer(serializers.Serializer):
    """Serializer for student's daily schedule"""

    student_id = serializers.IntegerField()
    student_name = serializers.CharField()
    classroom_name = serializers.CharField()
    date = serializers.DateField()
    day_of_week = serializers.CharField()

    periods = StudentScheduleSerializer(many=True)

    total_periods = serializers.IntegerField()
    current_period = StudentScheduleSerializer(required=False, allow_null=True)
    next_period = StudentScheduleSerializer(required=False, allow_null=True)
    break_times = serializers.ListField(child=serializers.DictField(), required=False)


class StudentSubjectScheduleSerializer(serializers.Serializer):
    """Serializer for a specific subject's schedule for a student"""

    student_id = serializers.IntegerField()
    student_name = serializers.CharField()
    subject_id = serializers.IntegerField()
    subject_name = serializers.CharField()
    subject_code = serializers.CharField()

    teacher_id = serializers.IntegerField()
    teacher_name = serializers.CharField()
    teacher_qualification = serializers.CharField()

    weekly_periods = StudentScheduleSerializer(many=True)

    periods_per_week = serializers.IntegerField()
    total_duration_per_week = serializers.IntegerField()  # in minutes
    next_class = StudentScheduleSerializer(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# Nested helper serializers for FK representations
# ---------------------------------------------------------------------------


class EducationLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = EducationLevel
        fields = ["id", "name", "code", "level_type"]


class ClassSerializer(serializers.ModelSerializer):
    education_level_detail = EducationLevelSerializer(
        source="education_level", read_only=True
    )

    class Meta:
        model = Class
        fields = [
            "id",
            "name",
            "code",
            "education_level",
            "education_level_detail",
            "grade_number",
        ]


class SectionSerializer(serializers.ModelSerializer):
    class_grade_name = serializers.CharField(source="class_grade.name", read_only=True)

    class Meta:
        model = Section
        fields = ["id", "name", "class_grade", "class_grade_name"]


class StreamSerializer(serializers.ModelSerializer):
    """Minimal stream representation for student serializers"""

    stream_type_name = serializers.CharField(
        source="stream_type_new.name", read_only=True
    )
    stream_type_code = serializers.CharField(
        source="stream_type_new.code", read_only=True
    )

    class Meta:
        model = Stream
        fields = ["id", "name", "code", "stream_type_name", "stream_type_code"]


# ---------------------------------------------------------------------------
# StudentDetailSerializer
# ---------------------------------------------------------------------------

class StudentDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    short_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    age = serializers.SerializerMethodField()

    # education_level is a @property on Student — read-only, returns level_type string
    education_level = serializers.CharField(read_only=True)
    education_level_display = serializers.CharField(read_only=True)

    # student_class is now a FK to Class
    student_class = serializers.PrimaryKeyRelatedField(
        queryset=Class.objects.all(), required=False, allow_null=True
    )
    student_class_detail = ClassSerializer(source="student_class", read_only=True)
    student_class_display = serializers.SerializerMethodField()

    # section is a FK to Section
    section = serializers.PrimaryKeyRelatedField(
        queryset=Section.objects.all(), required=False, allow_null=True
    )
    section_detail = SectionSerializer(source="section", read_only=True)

    # Frontend compat alias
    name = serializers.SerializerMethodField()

    is_nursery_student = serializers.BooleanField(read_only=True)
    is_primary_student = serializers.BooleanField(read_only=True)
    is_secondary_student = serializers.BooleanField(read_only=True)
    is_active = serializers.BooleanField(required=False)

    parents = serializers.SerializerMethodField()
    emergency_contacts = serializers.SerializerMethodField()
    profile_picture = serializers.URLField(
        required=False, allow_blank=True, allow_null=True
    )

    # classroom is now a computed @property string — read-only
    classroom = serializers.CharField(read_only=True)

    # stream FK
    stream = serializers.PrimaryKeyRelatedField(
        queryset=Stream.objects.all(), required=False, allow_null=True
    )
    stream_detail = StreamSerializer(source="stream", read_only=True)
    # Keep flat fields for backward-compat with frontend
    stream_name = serializers.CharField(source="stream.name", read_only=True)
    stream_type = serializers.CharField(
        source="stream.stream_type_new.name", read_only=True
    )

    class Meta:
        model = Student
        fields = [
            "id",
            "full_name",
            "name",
            "short_name",
            "email",
            "username",
            "gender",
            "date_of_birth",
            "age",
            "education_level",
            "education_level_display",
            "student_class",
            "student_class_detail",
            "student_class_display",
            "section",
            "section_detail",
            "is_nursery_student",
            "is_primary_student",
            "is_secondary_student",
            "is_active",
            "admission_date",
            "parent_contact",
            "emergency_contact",
            "emergency_contacts",
            "medical_conditions",
            "special_requirements",
            "blood_group",
            "place_of_birth",
            "address",
            "phone_number",
            "payment_method",
            "parents",
            "profile_picture",
            "classroom",
            "stream",
            "stream_detail",
            "stream_name",
            "stream_type",
        ]
        read_only_fields = ["id", "admission_date", "education_level", "classroom"]

    def get_full_name(self, obj):
        return obj.user.full_name

    def get_name(self, obj):
        return obj.user.full_name

    def get_short_name(self, obj):
        return obj.user.short_name

    def get_age(self, obj):
        return obj.age

    def get_student_class_display(self, obj):
        return obj.student_class.name if obj.student_class else "Not Assigned"

    def get_parents(self, obj):
        from parent.models import ParentStudentRelationship
        parent_data = []
        relationships = ParentStudentRelationship.objects.filter(
            student=obj
        ).select_related("parent__user")
        for rel in relationships:
            parent_profile = rel.parent
            parent_data.append(
                {
                    "id": parent_profile.id,
                    "full_name": parent_profile.user.full_name,
                    "email": parent_profile.user.email,
                    "phone": getattr(parent_profile, "phone", None),
                    "relationship": rel.relationship,
                    "is_primary_contact": rel.is_primary_contact,
                }
            )
        return parent_data

    def get_emergency_contacts(self, obj):
        contacts = []
        if obj.parent_contact:
            contacts.append(
                {"type": "Parent", "number": obj.parent_contact, "is_primary": True}
            )
        if obj.emergency_contact and obj.emergency_contact != obj.parent_contact:
            contacts.append(
                {
                    "type": "Emergency",
                    "number": obj.emergency_contact,
                    "is_primary": False,
                }
            )
        return contacts

    def validate_section(self, value):
        """Ensure section belongs to the selected student_class."""
        student_class = self.initial_data.get("student_class") or (
            self.instance.student_class_id if self.instance else None
        )
        if value and student_class:
            if value.class_grade_id != int(student_class):
                raise serializers.ValidationError(
                    "Section does not belong to the selected class."
                )
        return value

    def validate(self, data):
        # Stream required for Senior Secondary
        student_class = data.get("student_class") or (
            self.instance.student_class if self.instance else None
        )
        if student_class:
            level_type = student_class.education_level.level_type
            if level_type == "SENIOR_SECONDARY" and not data.get("stream"):
                if not (self.instance and self.instance.stream):
                    raise serializers.ValidationError(
                        {"stream": "Stream is required for Senior Secondary students."}
                    )
        # Nursery students need parent contact
        if student_class:
            level_type = student_class.education_level.level_type
            if level_type == "NURSERY":
                has_contact = data.get("parent_contact") or (
                    self.instance and self.instance.parent_contact
                )
                if not has_contact:
                    raise serializers.ValidationError(
                        "Parent contact is required for nursery students."
                    )
        return data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Keep backward-compat 'class' key for frontend
        data["class"] = instance.student_class.name if instance.student_class else None
        return data


# ---------------------------------------------------------------------------
# StudentListSerializer
# ---------------------------------------------------------------------------

class StudentListSerializer(serializers.ModelSerializer):
    """Simplified serializer for list views."""

    full_name = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    username = serializers.CharField(source="user.username", read_only=True)
    age = serializers.SerializerMethodField()

    # education_level — @property, read-only
    education_level = serializers.CharField(read_only=True)
    education_level_display = serializers.CharField(read_only=True)

    # student_class FK
    student_class = serializers.PrimaryKeyRelatedField(
        queryset=Class.objects.all(), required=False, allow_null=True
    )
    student_class_display = serializers.SerializerMethodField()

    is_active = serializers.BooleanField()
    parent_count = serializers.SerializerMethodField()
    profile_picture = serializers.URLField(
        required=False, allow_blank=True, allow_null=True
    )

    # classroom is a @property — read-only
    classroom = serializers.CharField(read_only=True)

    # section FK — expose id for list view
    section_id = serializers.IntegerField(
        source="section.id", read_only=True, allow_null=True
    )

    user = serializers.SerializerMethodField()

    # stream FK
    stream = serializers.PrimaryKeyRelatedField(
        queryset=Stream.objects.all(), required=False, allow_null=True
    )
    stream_name = serializers.CharField(source="stream.name", read_only=True)
    stream_type = serializers.CharField(
        source="stream.stream_type_new.name", read_only=True
    )

    class Meta:
        model = Student
        fields = [
            "id",
            "full_name",
            "name",
            "username",
            "age",
            "gender",
            "education_level",
            "education_level_display",
            "student_class",
            "student_class_display",
            "is_active",
            "parent_contact",
            "parent_count",
            "admission_date",
            "profile_picture",
            "classroom",
            "section_id",
            "user",
            "stream",
            "stream_name",
            "stream_type",
        ]

    def get_full_name(self, obj):
        return obj.user.full_name

    def get_name(self, obj):
        return obj.user.full_name

    def get_age(self, obj):
        return obj.age

    def get_student_class_display(self, obj):
        return obj.student_class.name if obj.student_class else "Not Assigned"

    def get_user(self, obj):
        return {
            "id": obj.user.id,
            "username": obj.user.username,
            "first_name": obj.user.first_name,
            "last_name": obj.user.last_name,
            "email": obj.user.email,
            "date_joined": obj.user.date_joined,
            "is_active": obj.user.is_active,
        }

    def get_parent_count(self, obj):
        from parent.models import ParentStudentRelationship

        return ParentStudentRelationship.objects.filter(student=obj).count()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["class"] = instance.student_class.name if instance.student_class else None
        return data


# ---------------------------------------------------------------------------
# StudentCreateSerializer
# ---------------------------------------------------------------------------

class StudentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new students with automatic parent creation."""

    user_email = serializers.EmailField(write_only=True)
    user_first_name = serializers.CharField(write_only=True, max_length=30)
    user_last_name = serializers.CharField(write_only=True, max_length=30)
    user_middle_name = serializers.CharField(
        write_only=True, max_length=30, required=False, allow_blank=True
    )

    registration_number = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True
    )
    profile_picture = serializers.URLField(required=False, allow_null=True)

    # student_class is now a FK to Class
    student_class = serializers.PrimaryKeyRelatedField(
        queryset=Class.objects.all(), required=False, allow_null=True
    )

    # section is now a FK to Section
    section = serializers.PrimaryKeyRelatedField(
        queryset=Section.objects.all(), required=False, allow_null=True
    )

    # stream FK
    stream = serializers.PrimaryKeyRelatedField(
        queryset=Stream.objects.all(), required=False, allow_null=True
    )

    # Parent fields
    existing_parent_id = serializers.IntegerField(write_only=True, required=False)
    parent_first_name = serializers.CharField(
        write_only=True, max_length=30, required=False
    )
    parent_last_name = serializers.CharField(
        write_only=True, max_length=30, required=False
    )
    parent_email = serializers.EmailField(write_only=True, required=False)
    parent_contact = serializers.CharField(
        write_only=True, max_length=15, required=False
    )
    parent_address = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )
    relationship = serializers.ChoiceField(
        choices=["Father", "Mother", "Guardian", "Sponsor"],
        write_only=True,
        required=False,
    )
    is_primary_contact = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Student
        fields = [
            "user_email",
            "user_first_name",
            "user_middle_name",
            "user_last_name",
            "gender",
            "date_of_birth",
            "student_class",
            "section",
            "registration_number",
            "profile_picture",
            "stream",
            "existing_parent_id",
            "parent_first_name",
            "parent_last_name",
            "parent_email",
            "parent_contact",
            "parent_address",
            "emergency_contact",
            "medical_conditions",
            "special_requirements",
            "relationship",
            "is_primary_contact",
        ]

    def validate_section(self, value):
        """Ensure section belongs to the selected student_class."""
        student_class_id = self.initial_data.get("student_class")
        if value and student_class_id:
            if str(value.class_grade_id) != str(student_class_id):
                raise serializers.ValidationError(
                    "Section does not belong to the selected class."
                )
        return value

    def validate(self, data):
        existing_parent_id = data.get("existing_parent_id")
        parent_fields = [
            "parent_first_name",
            "parent_last_name",
            "parent_email",
            "parent_contact",
        ]

        if existing_parent_id:
            for field in parent_fields:
                if data.get(field):
                    raise serializers.ValidationError(
                        f"Cannot provide {field} when linking to existing parent."
                    )
        else:
            for field in parent_fields:
                if not data.get(field):
                    raise serializers.ValidationError(
                        f"{field.replace('_', ' ').title()} is required when creating a new parent."
                    )

        # Validate registration number uniqueness
        registration_number = data.get("registration_number")
        if registration_number:
            base_username = generate_unique_username("student", registration_number)
            if CustomUser.objects.filter(username=base_username).exists():
                raise serializers.ValidationError(
                    f"Student with registration number '{registration_number}' already exists."
                )

        # Stream required for Senior Secondary
        student_class = data.get("student_class")
        if student_class:
            level_type = student_class.education_level.level_type
            if level_type == "SENIOR_SECONDARY" and not data.get("stream"):
                raise serializers.ValidationError(
                    {"stream": "Stream is required for Senior Secondary students."}
                )

        return data

    # -----------------------------------------------------------------------
    # PATCH for students/serializers.py  — StudentCreateSerializer.create()
    #
    # Changes made:
    #   1. Pass `tenant` to generate_unique_username so the correct school
    #      code (GTS, not LIS) is always used.
    #   2. Save the custom registration_number the admin typed in the form.
    #      Previously it was only used to build the username and then
    #      discarded; the Student record got NULL / auto-number instead.
    #   3. Guard against double-submit by wrapping everything in a DB
    #      transaction (atomic).
    # -----------------------------------------------------------------------

    # Replace the existing create() method inside StudentCreateSerializer
    # with the version below.  Everything outside create() stays the same.

    def create(self, validated_data):
        from parent.models import ParentProfile, ParentStudentRelationship
        from django.db import transaction

        with transaction.atomic():  # FIX 3: prevent partial saves / double-submit
            profile_picture = validated_data.pop("profile_picture", None)

            # FIX 2: pop the registration number the admin typed in the form
            # We'll store it on the Student record AND use it in the username.
            registration_number = validated_data.pop("registration_number", None)

            first_name = validated_data.pop("user_first_name")
            last_name = validated_data.pop("user_last_name")
            middle_name = validated_data.pop("user_middle_name", "")
            email = validated_data.pop("user_email")
            relationship = validated_data.pop("relationship", None)
            is_primary_contact = validated_data.pop("is_primary_contact", False)

            # ------------------------------------------------------------------
            # FIX 1: resolve the current tenant from the serializer context so
            # generate_unique_username uses the right school code (GTS not LIS).
            # The view must pass `request` in the serializer context, which
            # DRF does automatically for ViewSet/APIView serializers.
            # ------------------------------------------------------------------
            request = self.context.get("request")
            current_tenant = None
            if request is not None:
                # Works whether you use django-tenants, a custom middleware, or
                # store the tenant on the request object yourself.
                current_tenant = getattr(request, "tenant", None) or getattr(
                    request, "current_tenant", None
                )

            # ------------------------------------------------------------------
            # Parent resolution (unchanged logic, just moved inside atomic)
            # ------------------------------------------------------------------
            existing_parent_id = validated_data.pop("existing_parent_id", None)
            if existing_parent_id:
                try:
                    parent_profile = ParentProfile.objects.get(id=existing_parent_id)
                    parent_user = parent_profile.user
                    self._generated_parent_password = None
                    self._generated_parent_username = parent_user.username
                except ParentProfile.DoesNotExist:
                    raise serializers.ValidationError(
                        "Parent not found with the provided ID."
                    )
            else:
                parent_first_name = validated_data.pop("parent_first_name")
                parent_last_name = validated_data.pop("parent_last_name")
                parent_email = validated_data.pop("parent_email")
                parent_contact = validated_data.pop("parent_contact")
                parent_address = validated_data.pop("parent_address", "")

                if CustomUser.objects.filter(email=parent_email).exists():
                    raise serializers.ValidationError(
                        "A parent with this email already exists."
                    )

                import secrets, string

                parent_password = "".join(
                    secrets.choice(string.ascii_letters + string.digits)
                    for _ in range(10)
                )
                # FIX 1: pass tenant so parent username also gets GTS code
                parent_username = generate_unique_username(
                    "parent", tenant=current_tenant
                )
                parent_user = CustomUser.objects.create_user(
                    email=parent_email,
                    username=parent_username,
                    first_name=parent_first_name,
                    last_name=parent_last_name,
                    role="parent",
                    password=parent_password,
                    is_active=True,
                    tenant=current_tenant,
                )
                parent_profile, created = ParentProfile.objects.get_or_create(
                    user=parent_user,
                    defaults={"phone": parent_contact, "address": parent_address},
                )
                if not created:
                    parent_profile.phone = parent_contact
                    parent_profile.address = parent_address
                    parent_profile.save()

                self._generated_parent_password = parent_password
                self._generated_parent_username = parent_username

            # ------------------------------------------------------------------
            # Student user creation
            # FIX 1: pass tenant to get the correct school code
            # FIX 2: registration_number in the username comes from the form
            # ------------------------------------------------------------------
            import secrets, string

            student_password = "".join(
                secrets.choice(string.ascii_letters + string.digits) for _ in range(10)
            )
            student_username = generate_unique_username(
                "student",
                registration_number=registration_number,  # uses form value if provided
                tenant=current_tenant,  # FIX 1: correct school code
            )
            student_user = CustomUser.objects.create_user(
                email=email,
                username=student_username,
                first_name=first_name,
                last_name=last_name,
                middle_name=middle_name,
                role="student",
                password=student_password,
                is_active=True,
                tenant=current_tenant,
            )

            # FIX 2: explicitly store the admin-entered registration_number on
            # the Student record.  If left to the model default it became an
            # auto-generated value instead of what the admin typed.
            student = Student.objects.create(
                user=student_user,
                profile_picture=profile_picture,
                registration_number=registration_number,  # ← saves the typed value
                tenant=current_tenant,
                **validated_data,
            )

            ParentStudentRelationship.objects.create(
                parent=parent_profile,
                student=student,
                relationship=relationship or "Guardian",
                is_primary_contact=is_primary_contact,
            )

            if existing_parent_id and parent_profile.phone:
                student.parent_contact = parent_profile.phone
                student.save()

            self._generated_student_password = student_password
            self._generated_student_username = student_username

            # ------------------------------------------------------------------
            # Welcome emails (unchanged)
            # ------------------------------------------------------------------
            try:
                from utils.email import send_email_via_brevo

                if self._generated_parent_password:
                    parent_subject = "Welcome to SchoolMS - Your Parent Account Details"
                    parent_html_content = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #333; text-align: center;">Welcome to SchoolMS!</h2>
                        <p>Hello {parent_user.first_name} {parent_user.last_name},</p>
                        <p>Your parent account has been created successfully by the school administrator.</p>
                        <p>You are now linked to your child: {first_name} {last_name}</p>
                        <p><strong>Your Login Credentials:</strong></p>
                        <ul>
                            <li><strong>Email:</strong> {parent_user.email}</li>
                            <li><strong>Password:</strong> {self._generated_parent_password}</li>
                        </ul>
                        <p>Please change your password after your first login for security.</p>
                        <p>Best regards,<br>SchoolMS Team</p>
                    </div>
                    """
                    send_email_via_brevo(
                        parent_subject, parent_html_content, parent_user.email
                    )
                else:
                    parent_subject = "New Student Added to Your Account - SchoolMS"
                    parent_html_content = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #333; text-align: center;">New Student Added</h2>
                        <p>Hello {parent_user.first_name} {parent_user.last_name},</p>
                        <p>A new student has been linked to your account: {first_name} {last_name}</p>
                        <p>Best regards,<br>SchoolMS Team</p>
                    </div>
                    """
                    send_email_via_brevo(
                        parent_subject, parent_html_content, parent_user.email
                    )
            except Exception as e:
                import logging

                logging.getLogger(__name__).error(f"Failed to send welcome emails: {e}")

            return student


# ---------------------------------------------------------------------------
# ResultCheckToken serializers (unchanged logic, minor cleanup)
# ---------------------------------------------------------------------------

class ResultTokenSerializer(serializers.ModelSerializer):
    """Enhanced serializer with more token information"""

    is_valid = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    student_username = serializers.CharField(source="student.username", read_only=True)
    term_name = serializers.CharField(source="school_term.name", read_only=True)
    academic_session = serializers.CharField(
        source="school_term.academic_session", read_only=True
    )
    time_until_expiry = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = ResultCheckToken
        fields = [
            "id",
            "token",
            "student_name",
            "student_username",
            "school_term",
            "term_name",
            "academic_session",
            "created_at",
            "expires_at",
            "is_valid",
            "is_used",
            "used_at",
            "time_until_expiry",
            "status",
        ]
        read_only_fields = ["token", "created_at", "is_used", "used_at"]

    def get_is_valid(self, obj):
        return obj.is_valid()

    def get_student_name(self, obj):
        user = obj.student
        if hasattr(user, "full_name"):
            return user.full_name
        parts = [p for p in [user.first_name, user.last_name] if p]
        return " ".join(parts) if parts else user.username

    def get_time_until_expiry(self, obj):
        return obj.time_until_expiry()

    def get_status(self, obj):
        if obj.is_used:
            return "Used"
        elif not obj.is_valid():
            return "Expired"
        return "Active"


class ResultTokenListSerializer(serializers.ModelSerializer):
    """Simplified serializer for list views"""

    student_name = serializers.SerializerMethodField()
    student_class = serializers.SerializerMethodField()
    term_name = serializers.CharField(source="school_term.name", read_only=True)
    is_valid = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = ResultCheckToken
        fields = [
            "id",
            "token",
            "student_name",
            "student_class",
            "term_name",
            "expires_at",
            "is_valid",
            "status",
        ]

    def get_student_name(self, obj):
        user = obj.student
        if hasattr(user, "full_name"):
            return user.full_name
        parts = [p for p in [user.first_name, user.last_name] if p]
        return " ".join(parts) if parts else user.username

    def get_student_class(self, obj):
        """Get student's current class name via FK."""
        try:
            from students.models import Student
            student = Student.objects.select_related("student_class").get(
                user=obj.student
            )
            return student.student_class.name if student.student_class else "N/A"
        except Exception:
            return "N/A"

    def get_is_valid(self, obj):
        return obj.is_valid()

    def get_status(self, obj):
        if obj.is_used:
            return "Used"
        elif not obj.is_valid():
            return "Expired"
        return "Active"
