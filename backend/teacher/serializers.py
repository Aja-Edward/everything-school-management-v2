from rest_framework import serializers
from .models import Teacher, AssignmentRequest, TeacherSchedule
from classroom.models import GradeLevel, Section, ClassroomTeacherAssignment, Classroom
from subject.models import Subject


class TeacherAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for the new ClassroomTeacherAssignment model"""

    grade_level_name = serializers.CharField(
        source="classroom.section.grade_level.name", read_only=True
    )
    section_name = serializers.CharField(
        source="classroom.section.name", read_only=True
    )
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    education_level = serializers.CharField(
        source="classroom.section.grade_level.education_level", read_only=True
    )
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    # Explicitly define assigned_date to avoid datetime/date coercion issues
    assigned_date = serializers.SerializerMethodField()

    class Meta:
        model = ClassroomTeacherAssignment
        fields = [
            "id",
            "teacher",
            "classroom",
            "subject",
            "grade_level_name",
            "section_name",
            "subject_name",
            "education_level",
            "classroom_name",
            "is_primary_teacher",
            "periods_per_week",
            "assigned_date",
            "is_active",
        ]

    def get_assigned_date(self, obj):
        """Ensure assigned_date is returned as a date string"""
        if obj.assigned_date:
            # If it's a datetime, convert to date first
            if hasattr(obj.assigned_date, "date"):
                return obj.assigned_date.date().isoformat()
            # If it's already a date, just convert to ISO format
            return obj.assigned_date.isoformat()
        return None


class AssignmentRequestSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(
        source="teacher.user.full_name", read_only=True
    )
    teacher_id = serializers.IntegerField(source="teacher.id", read_only=True)
    requested_subjects_names = serializers.SerializerMethodField()
    requested_grade_levels_names = serializers.SerializerMethodField()
    requested_sections_names = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(
        source="reviewed_by.full_name", read_only=True
    )
    days_since_submitted = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentRequest
        fields = [
            "id",
            "teacher",
            "teacher_name",
            "teacher_id",
            "request_type",
            "title",
            "description",
            "requested_subjects",
            "requested_subjects_names",
            "requested_grade_levels",
            "requested_grade_levels_names",
            "requested_sections",
            "requested_sections_names",
            "preferred_schedule",
            "reason",
            "status",
            "admin_notes",
            "submitted_at",
            "reviewed_at",
            "reviewed_by",
            "reviewed_by_name",
            "days_since_submitted",
        ]
        read_only_fields = ["teacher", "submitted_at", "reviewed_at", "reviewed_by"]

    def get_requested_subjects_names(self, obj):
        return [subject.name for subject in obj.requested_subjects.all()]

    def get_requested_grade_levels_names(self, obj):
        return [grade.name for grade in obj.requested_grade_levels.all()]

    def get_requested_sections_names(self, obj):
        return [section.name for section in obj.requested_sections.all()]

    def get_days_since_submitted(self, obj):
        from django.utils import timezone

        delta = timezone.now() - obj.submitted_at
        return delta.days


class TeacherScheduleSerializer(serializers.ModelSerializer):
    """Fixed serializer - removed non-existent classroom field"""

    subject_name = serializers.CharField(source="subject.name", read_only=True)

    class Meta:
        model = TeacherSchedule
        fields = [
            "id",
            "teacher",
            "subject",
            "subject_name",
            "day_of_week",
            "start_time",
            "end_time",
            "grade_level",
            "section",
            "room_number",
            "is_active",
        ]


class TeacherSerializer(serializers.ModelSerializer):
    # User creation fields (handle both formats)
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False)

    # Alternative user creation fields (from frontend)
    user_first_name = serializers.CharField(write_only=True, required=False)
    user_last_name = serializers.CharField(write_only=True, required=False)
    user_email = serializers.EmailField(write_only=True, required=False)
    user_middle_name = serializers.CharField(write_only=True, required=False)

    # User profile fields
    bio = serializers.CharField(write_only=True, required=False)
    profile_date_of_birth = serializers.DateField(
        write_only=True, required=False
    )  # Renamed

    # Assignment fields
    assignments = serializers.ListField(write_only=True, required=False)
    subjects = serializers.ListField(write_only=True, required=False)

    # Read-only computed fields
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email_readonly = serializers.CharField(source="user.email", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    user = serializers.SerializerMethodField()

    # Teacher assignments using the new model
    teacher_assignments = TeacherAssignmentSerializer(many=True, read_only=True)

    # New classroom assignments field for frontend compatibility
    classroom_assignments = serializers.SerializerMethodField()

    # Additional computed fields
    total_students = serializers.SerializerMethodField()
    total_subjects = serializers.SerializerMethodField()
    years_experience = serializers.SerializerMethodField()
    assigned_subjects = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = [
            "id",
            "user",
            "employee_id",
            "staff_type",
            "level",
            "phone_number",
            "address",
            "date_of_birth",
            "hire_date",
            "qualification",
            "specialization",
            "photo",
            "is_active",
            "created_at",
            "updated_at",
            # User creation fields
            "first_name",
            "last_name",
            "password",
            # Alternative user creation fields (from frontend)
            "user_first_name",
            "user_last_name",
            "user_email",
            "user_middle_name",
            # User profile fields
            "bio",
            "profile_date_of_birth",
            # Assignment fields
            "assignments",
            "subjects",
            # Read-only computed fields
            "full_name",
            "email_readonly",
            "username",
            "is_active",
            # Teacher assignments
            "teacher_assignments",
            # New classroom assignments
            "classroom_assignments",
            # Additional computed fields
            "total_students",
            "total_subjects",
            "years_experience",
            "assigned_subjects",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "user"]

    def get_total_students(self, obj):
        """Get total number of students taught by this teacher"""
        assignments = ClassroomTeacherAssignment.objects.filter(
            teacher=obj,
            is_active=True,
        ).select_related("classroom")

        unique_classroom_ids = set()
        unique_classrooms = []
        for assignment in assignments:
            classroom = assignment.classroom
            if classroom and classroom.id not in unique_classroom_ids:
                unique_classroom_ids.add(classroom.id)
                unique_classrooms.append(classroom)

        return sum(c.current_enrollment for c in unique_classrooms)

    def get_total_subjects(self, obj):
        """Get total number of subjects taught by this teacher"""
        return ClassroomTeacherAssignment.objects.filter(
            teacher=obj, is_active=True
        ).count()

    def get_years_experience(self, obj):
        """Calculate years of experience"""
        from datetime import date

        if obj.hire_date:
            today = date.today()
            return (
                today.year
                - obj.hire_date.year
                - ((today.month, today.day) < (obj.hire_date.month, obj.hire_date.day))
            )
        return 0

    def get_user(self, obj):
        """Returns user data including date_joined for sorting."""
        if obj.user:
            user_data = {
                "id": obj.user.id,
                "first_name": obj.user.first_name,
                "last_name": obj.user.last_name,
                "email": obj.user.email,
                "username": obj.user.username,
                "date_joined": (
                    obj.user.date_joined.isoformat() if obj.user.date_joined else None
                ),
                "is_active": obj.user.is_active,
            }

            try:
                if hasattr(obj.user, "profile") and obj.user.profile:
                    user_data["bio"] = obj.user.profile.bio
                    if obj.user.profile.date_of_birth:
                        dob = obj.user.profile.date_of_birth
                        if hasattr(dob, "isoformat"):
                            user_data["date_of_birth"] = dob.isoformat()
                        else:
                            user_data["date_of_birth"] = str(dob)
                    else:
                        user_data["date_of_birth"] = None
            except Exception as e:
                print(f"Error getting user profile data: {e}")

            return user_data
        return None

    def get_assigned_subjects(self, obj):
        """Returns the subjects assigned to this teacher."""
        assignments = ClassroomTeacherAssignment.objects.filter(
            teacher=obj, is_active=True
        ).select_related("subject")

        subjects = []
        seen_subject_ids = set()

        for assignment in assignments:
            if assignment.subject and assignment.subject.id not in seen_subject_ids:
                subjects.append(
                    {
                        "id": assignment.subject.id,
                        "name": assignment.subject.name,
                        "code": assignment.subject.code,
                    }
                )
                seen_subject_ids.add(assignment.subject.id)

        return subjects

    # def get_classroom_assignments(self, obj):
    #     """Returns the classroom assignments for this teacher in the format expected by the frontend."""
    #     from classroom.models import ClassroomTeacherAssignment

    #     # Fix: Use correct field names - academic_session not academic_year
    #     assignments = ClassroomTeacherAssignment.objects.filter(
    #         teacher=obj, is_active=True
    #     ).select_related(
    #         "classroom",
    #         "classroom__section",
    #         "classroom__section__grade_level",
    #         "classroom__academic_session",  # Changed from academic_year
    #         "classroom__term",
    #         "subject",
    #     )

    #     classroom_assignments = []
    #     for assignment in assignments:
    #         classroom = assignment.classroom
    #         section = classroom.section
    #         grade_level = section.grade_level

    #         student_count = classroom.current_enrollment

    #         assignment_data = {
    #             "id": assignment.id,
    #             "classroom_name": classroom.name,
    #             "classroom_id": classroom.id,
    #             "section_id": section.id,
    #             "section_name": section.name,
    #             "grade_level_id": grade_level.id,
    #             "grade_level_name": grade_level.name,
    #             "education_level": grade_level.education_level,
    #             "academic_session": (
    #                 classroom.academic_session.name
    #                 if classroom.academic_session
    #                 else "N/A"
    #             ),
    #             "term": (
    #                 classroom.term.get_name_display()
    #                 if hasattr(classroom.term, "get_name_display")
    #                 else str(classroom.term)
    #             ),
    #             "subject_id": assignment.subject.id,
    #             "subject_name": assignment.subject.name,
    #             "subject_code": assignment.subject.code,
    #             "assigned_date": (
    #                 assignment.assigned_date.isoformat()
    #                 if assignment.assigned_date
    #                 else None
    #             ),
    #             "room_number": classroom.room_number or "",
    #             "student_count": student_count,
    #             "max_capacity": classroom.max_capacity,
    #             "is_primary_teacher": assignment.is_primary_teacher,
    #             "periods_per_week": assignment.periods_per_week,
    #         }

    #         # Add stream information if available (for Senior Secondary)
    #         if hasattr(classroom, "stream") and classroom.stream:
    #             assignment_data["stream_name"] = classroom.stream.name
    #             assignment_data["stream_type"] = (
    #                 classroom.stream.get_stream_type_display()
    #             )

    #         classroom_assignments.append(assignment_data)

    #     return classroom_assignments
    def get_classroom_assignments(self, obj):
        """Get classroom assignments with optimized queries"""
        try:
            assignments = (
                obj.classroom_assignments.select_related(
                    "classroom", "classroom__section", "subject"
                )
                .prefetch_related(
                    "classroom__students"  # Prefetch students to avoid N+1
                )
                .all()
            )

            result = []
            for assignment in assignments:
                classroom = assignment.classroom

                # Use prefetched students count instead of current_enrollment property
                student_count = (
                    classroom.students.count() if hasattr(classroom, "students") else 0
                )

                result.append(
                    {
                        "id": assignment.id,
                        "classroom_id": classroom.id,
                        "classroom_name": classroom.name,
                        "section_id": (
                            classroom.section.id if classroom.section else None
                        ),
                        "section_name": (
                            classroom.section.name if classroom.section else ""
                        ),
                        "subject_id": (
                            assignment.subject.id if assignment.subject else None
                        ),
                        "subject_name": (
                            assignment.subject.name if assignment.subject else ""
                        ),
                        "subject_code": (
                            assignment.subject.code if assignment.subject else ""
                        ),
                        "student_count": student_count,
                        "is_primary_teacher": assignment.is_primary_teacher,
                        "periods_per_week": assignment.periods_per_week,
                    }
                )

            return result
        except Exception as e:
            logger.error(f"Error getting classroom assignments: {e}")
            return []

        # In teachers/serializers.py - Updated create() method

    def create(self, validated_data):
        print(f"TeacherSerializer.create called")
        print(f"Validated data keys BEFORE popping: {list(validated_data.keys())}")

        # CRITICAL: Pop ALL user-related fields FIRST before creating teacher
        # These are NOT Teacher model fields, only for User creation
        first_name = validated_data.pop("first_name", None) or validated_data.pop(
            "user_first_name", None
        )
        last_name = validated_data.pop("last_name", None) or validated_data.pop(
            "user_last_name", None
        )
        email = validated_data.pop("user_email", None) or validated_data.pop(
            "email", None
        )
        password = validated_data.pop("password", None)
        middle_name = validated_data.pop("user_middle_name", None)

        # Extract profile data
        bio = validated_data.pop("bio", None)
        profile_date_of_birth = validated_data.pop("profile_date_of_birth", None)

        # Extract assignment data
        assignments = validated_data.pop("assignments", None)
        subjects = validated_data.pop("subjects", [])

        print(
            f"Validated data keys AFTER popping user fields: {list(validated_data.keys())}"
        )

        # Validate required fields
        if not email:
            raise serializers.ValidationError(
                "Email is required to create a teacher user account"
            )

        if not first_name or not last_name:
            raise serializers.ValidationError("First name and last name are required")

        # Create user
        from django.contrib.auth import get_user_model

        User = get_user_model()

        # Generate password if not provided
        if not password:
            import secrets
            import string

            password = "".join(
                secrets.choice(string.ascii_letters + string.digits) for _ in range(12)
            )

        user = None
        try:
            from datetime import datetime

            current_date = datetime.now()
            month = current_date.strftime("%b").upper()
            year = str(current_date.year)[-2:]

            employee_id = validated_data.get("employee_id", "EMP001")
            username = f"TCH/GTS/{month}/{year}/{employee_id}"

            counter = 1
            original_username = username
            while User.objects.filter(username=username).exists():
                username = f"{original_username}_{counter}"
                counter += 1

            if User.objects.filter(email=email).exists():
                raise serializers.ValidationError(
                    f"A user with email {email} already exists"
                )

            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name or "",
                last_name=last_name or "",
                role="teacher",
                is_active=True,
            )
            print(f"goodCreated user: {user.username} with ID: {user.id}")

            # Create user profile if needed
            if bio or profile_date_of_birth:
                try:
                    from userprofile.models import UserProfile

                    user_profile, created = UserProfile.objects.get_or_create(user=user)
                    if bio:
                        user_profile.bio = bio
                    if profile_date_of_birth:
                        user_profile.date_of_birth = profile_date_of_birth
                    user_profile.save()
                    print(f"goodCreated user profile")
                except Exception as e:
                    print(f"⚠️  Warning: Could not create user profile: {e}")

            # Store credentials in context for response
            self.context["user_password"] = password
            self.context["user_username"] = username

        except serializers.ValidationError:
            raise
        except Exception as e:
            print(f"❌ Error creating user: {e}")
            import traceback

            print(traceback.format_exc())
            raise serializers.ValidationError(f"Error creating user: {str(e)}")

        try:
            # Make absolutely sure no user fields are left in validated_data
            print(
                f"Final validated_data keys before Teacher.objects.create(): {list(validated_data.keys())}"
            )
            print(f"Final validated_data: {validated_data}")

            # Create teacher - only pass fields that exist on the Teacher model
            teacher = Teacher.objects.create(
                user=user,
                is_active=True,
                **validated_data,
            )
            print(f"goodCreated teacher object with ID: {teacher.id}")
            print(f"goodTeacher is_active: {teacher.is_active}")
            print(f"goodTeacher user: {teacher.user}")

            # Verify it was actually saved
            verify = Teacher.objects.filter(id=teacher.id).first()
            print(
                f"goodVerification query successful - teacher {teacher.id} found in database"
            )
            assert verify is not None, "Teacher not found after creation!"
            assert verify.user_id == user.id, "User ID mismatch!"

            # Create assignments if provided
            if assignments or subjects:
                self._create_classroom_assignments(teacher, assignments, subjects)

            return teacher

        except TypeError as e:
            print(f"❌ TypeError creating teacher: {e}")
            print(
                f"❌ This means validated_data still contains fields not on Teacher model"
            )
            print(f"❌ Remaining validated_data: {validated_data}")
            import traceback

            print(traceback.format_exc())

            # Clean up user if teacher creation failed
            if user:
                print(f"🧹 Cleaning up user {user.id}")
                user.delete()

            raise serializers.ValidationError(f"Error creating teacher: {str(e)}")

        except Exception as e:
            print(f"❌ Error creating teacher: {e}")
            import traceback

            print(traceback.format_exc())

            # Clean up user if teacher creation failed
            if user:
                print(f"🧹 Cleaning up user {user.id}")
                user.delete()

            raise serializers.ValidationError(f"Error creating teacher: {str(e)}")

    def update(self, instance, validated_data):
        print(f"TeacherSerializer.update called for teacher {instance.id}")

        # Extract assignment data
        assignments = validated_data.pop("assignments", None)
        subjects = validated_data.pop("subjects", None)

        # Handle user profile updates
        bio = validated_data.pop("bio", None)
        profile_date_of_birth = validated_data.pop("profile_date_of_birth", None)

        if bio is not None or profile_date_of_birth is not None:
            try:
                from userprofile.models import UserProfile

                user_profile, created = UserProfile.objects.get_or_create(
                    user=instance.user
                )

                if bio is not None:
                    user_profile.bio = bio
                if profile_date_of_birth is not None:
                    user_profile.date_of_birth = profile_date_of_birth

                user_profile.save()
                print(f"Updated user profile for teacher {instance.id}")
            except Exception as e:
                print(f"Error updating user profile: {e}")
                import traceback

                print(traceback.format_exc())

        # Update teacher
        teacher = super().update(instance, validated_data)

        # Update classroom assignments if provided
        if assignments is not None or subjects is not None:
            self._create_classroom_assignments(teacher, assignments, subjects)

        return teacher

    def _create_classroom_assignments(self, teacher, assignments, subjects):
        """Create classroom assignments using the new ClassroomTeacherAssignment model"""
        print(f"Creating classroom assignments for teacher {teacher.id}")

        ClassroomTeacherAssignment.objects.filter(teacher=teacher).delete()

        if assignments:
            for assignment_data in assignments:
                try:
                    classroom_id = assignment_data.get("classroom_id")
                    subject_id = assignment_data.get("subject_id")
                    is_primary = assignment_data.get("is_primary_teacher", False)
                    periods_per_week = assignment_data.get("periods_per_week", 1)

                    if not classroom_id or not subject_id:
                        print(
                            "Skipping assignment - missing classroom_id or subject_id"
                        )
                        continue

                    try:
                        classroom = Classroom.objects.get(id=classroom_id)
                        subject = Subject.objects.get(id=subject_id)

                        ClassroomTeacherAssignment.objects.create(
                            teacher=teacher,
                            classroom=classroom,
                            subject=subject,
                            is_primary_teacher=is_primary,
                            periods_per_week=periods_per_week,
                        )
                        print(
                            f"Created assignment: {teacher} - {subject} - {classroom}"
                        )
                    except (Classroom.DoesNotExist, Subject.DoesNotExist) as e:
                        print(f"Skipping assignment - object not found: {e}")
                        continue

                except Exception as e:
                    print(f"Error processing assignment: {e}")
                    import traceback

                    print(traceback.format_exc())
