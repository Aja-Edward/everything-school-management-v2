import re
from datetime import date

from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import UserProfile

# The shape phone_number is stored in, matching the RegexValidator on the
# model field.
_NG_PHONE_RE = re.compile(r"^\+?234\d{10}$")

User = get_user_model()


class UserBasicSerializer(serializers.ModelSerializer):
    """Basic user information serializer"""

    full_name = serializers.ReadOnlyField()
    short_name = serializers.ReadOnlyField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "username",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "short_name",
            "role",
            "role_display",
            "is_active",
            "email_verified",
            "date_joined",
            "last_login",
        ]
        read_only_fields = [
            "id",
            "email",
            "is_active",
            "email_verified",
            "date_joined",
            "last_login",
        ]


class UserProfileSerializer(serializers.ModelSerializer):
    """Complete user profile serializer"""

    user = UserBasicSerializer(read_only=True)
    # Add student_data field
    student_data = serializers.SerializerMethodField()
    # Add teacher_data field
    teacher_data = serializers.SerializerMethodField()

    # Read-only computed fields from the model
    display_name = serializers.ReadOnlyField()
    short_name = serializers.ReadOnlyField()
    user_role = serializers.ReadOnlyField()
    is_verified = serializers.ReadOnlyField()
    primary_phone = serializers.ReadOnlyField()
    profile_image_url = serializers.ReadOnlyField()

    # Gender display
    gender_display = serializers.CharField(source="get_gender_display", read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "id",
            "user",
            "phone_number",
            "address",
            "profile_picture",
            "bio",
            "date_of_birth",
            "gender",
            "gender_display",
            "linkedin_url",
            "twitter_url",
            "facebook_url",
            "is_profile_public",
            "receive_notifications",
            "display_name",
            "short_name",
            "user_role",
            "is_verified",
            "primary_phone",
            "profile_image_url",
            "created_at",
            "updated_at",
            "student_data",
            "teacher_data",
        ]
        read_only_fields = [
            "id",
            "user",
            "display_name",
            "short_name",
            "user_role",
            "is_verified",
            "primary_phone",
            "profile_image_url",
            "created_at",
            "updated_at",
            "student_data",
            "teacher_data",
        ]

    def validate_phone_number(self, value):
        """Validate phone number format"""
        if value and not value.startswith("+234"):
            # Auto-format if user enters without country code
            if value.startswith("0"):
                value = "+234" + value[1:]
            elif value.startswith("234"):
                value = "+" + value
            elif len(value) == 10:
                value = "+234" + value
        return value

    def validate_date_of_birth(self, value):
        """Validate date of birth"""
        if value:
            from datetime import date

            if value > date.today():
                raise serializers.ValidationError(
                    "Date of birth cannot be in the future."
                )

            # Check if user is at least 13 years old (common age requirement)
            age = date.today().year - value.year
            if age < 13:
                raise serializers.ValidationError("User must be at least 13 years old.")
        return value

    def validate_bio(self, value):
        """Validate bio length"""
        if value and len(value) > 500:
            raise serializers.ValidationError("Bio cannot exceed 500 characters.")
        return value

    def get_student_data(self, obj):
        # Return student id and full_name if user is a student
        user = obj.user
        # Find the Student object linked to this user
        try:
            student = getattr(user, "student_profile", None)
            if student:
                return {
                    "id": student.id,  # This is the correct student ID
                    "full_name": getattr(student, "full_name", None),
                }
        except Exception:
            pass
        return None

    def get_teacher_data(self, obj):
        # Return teacher data if user is a teacher
        user = obj.user
        try:
            # Check if user has a teacher profile
            if hasattr(user, 'teacher'):
                teacher = user.teacher
                return {
                    "id": teacher.id,
                    "employee_id": teacher.employee_id,
                    "staff_type": teacher.staff_type,
                    "level": teacher.level,
                    "phone_number": teacher.phone_number,
                    "address": teacher.address,
                    "hire_date": teacher.hire_date,
                    "qualification": teacher.qualification,
                    "specialization": teacher.specialization,
                    "photo": teacher.photo,  # This is the profile picture URL
                    "is_active": teacher.is_active,
                }
        except Exception as e:
            print(f"Error getting teacher data: {e}")
            pass
        return None


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating profile information only"""

    # Declared explicitly to drop the model field's RegexValidator, which
    # DRF would otherwise copy onto this field and run in to_internal_value()
    # -- i.e. before validate_phone_number below. That rejected "0803..."
    # outright, making every normalisation branch there unreachable for the
    # exact inputs it exists to convert. The same check is applied by hand
    # after normalising instead.
    phone_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=20
    )

    class Meta:
        model = UserProfile
        fields = [
            "phone_number",
            "address",
            "bio",
            "date_of_birth",
            "gender",
            "linkedin_url",
            "twitter_url",
            "facebook_url",
            "is_profile_public",
            "receive_notifications",
        ]

    def validate_phone_number(self, value):
        """Normalise a Nigerian number, then validate the normalised form."""
        if not value:
            return value

        value = value.strip().replace(" ", "")
        if not value.startswith("+234"):
            if value.startswith("0"):
                value = "+234" + value[1:]
            elif value.startswith("234"):
                value = "+" + value
            elif len(value) == 10:
                value = "+234" + value

        if not _NG_PHONE_RE.match(value):
            raise serializers.ValidationError(
                "Enter a valid Nigerian phone number (e.g., +234XXXXXXXXXX)."
            )
        return value

    def validate_date_of_birth(self, value):
        """Reject dates in the future."""
        if value and value > date.today():
            raise serializers.ValidationError(
                "Date of birth cannot be in the future."
            )
        return value


class UserProfileSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer for profile summary"""

    display_name = serializers.ReadOnlyField()
    short_name = serializers.ReadOnlyField()
    user_role = serializers.ReadOnlyField()
    is_verified = serializers.ReadOnlyField()
    primary_phone = serializers.ReadOnlyField()
    profile_image_url = serializers.ReadOnlyField()
    email = serializers.CharField(source="user.email", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    date_joined = serializers.DateTimeField(source="user.date_joined", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)
    # Add student_data and teacher_data fields
    student_data = serializers.SerializerMethodField()
    teacher_data = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "display_name",
            "short_name",
            "user_role",
            "is_verified",
            "primary_phone",
            "profile_image_url",
            "email",
            "is_active",
            "date_joined",
            "last_login",
            "bio",
            "address",
            "student_data",
            "teacher_data",
        ]

    def get_student_data(self, obj):
        # Return student id and full_name if user is a student
        user = obj.user
        # Find the Student object linked to this user
        try:
            student = getattr(user, "student_profile", None)
            if student:
                return {
                    "id": student.id,  # This is the correct student ID
                    "full_name": getattr(student, "full_name", None),
                }
        except Exception:
            pass
        return None

    def get_teacher_data(self, obj):
        # Return teacher data if user is a teacher
        user = obj.user
        try:
            # Check if user has a teacher profile
            if hasattr(user, 'teacher'):
                teacher = user.teacher
                return {
                    "id": teacher.id,
                    "employee_id": teacher.employee_id,
                    "staff_type": teacher.staff_type,
                    "level": teacher.level,
                    "phone_number": teacher.phone_number,
                    "address": teacher.address,
                    "hire_date": teacher.hire_date,
                    "qualification": teacher.qualification,
                    "specialization": teacher.specialization,
                    "photo": teacher.photo,  # This is the profile picture URL
                    "is_active": teacher.is_active,
                }
        except Exception as e:
            print(f"Error getting teacher data: {e}")
            pass
        return None


class UserProfileContactSerializer(serializers.ModelSerializer):
    """Serializer for contact information"""

    email = serializers.CharField(source="user.email", read_only=True)
    primary_phone = serializers.ReadOnlyField()

    class Meta:
        model = UserProfile
        fields = [
            "email",
            "primary_phone",
            "address",
            "linkedin_url",
            "twitter_url",
            "facebook_url",
        ]


class UserProfilePictureSerializer(serializers.ModelSerializer):
    """Serializer for profile picture upload"""

    profile_image_url = serializers.ReadOnlyField()

    class Meta:
        model = UserProfile
        fields = ["profile_picture", "profile_image_url"]

    def validate_profile_picture(self, value):
        """Validate profile picture"""
        if value:
            # Check file size (max 5MB)
            if value.size > 5 * 1024 * 1024:
                raise serializers.ValidationError("Profile picture cannot exceed 5MB.")

            # Check file type
            allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
            if value.content_type not in allowed_types:
                raise serializers.ValidationError(
                    "Only JPEG, PNG, GIF, and WebP images are allowed."
                )
        return value


class UserVerificationStatusSerializer(serializers.ModelSerializer):
    """Serializer for user verification status"""

    email_verified = serializers.BooleanField(
        source="user.email_verified", read_only=True
    )
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    verification_code_valid = serializers.SerializerMethodField()
    can_login = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ["email_verified", "is_active", "verification_code_valid", "can_login"]

    def get_verification_code_valid(self, obj):
        """Check if verification code is valid"""
        return (
            hasattr(obj.user, "is_verification_code_valid")
            and obj.user.is_verification_code_valid()
        )

    def get_can_login(self, obj):
        """Check if user can login"""
        return obj.user.is_active and obj.user.email_verified


class UserPreferencesSerializer(serializers.ModelSerializer):
    """Serializer for user preferences"""

    subscribe_newsletter = serializers.BooleanField(
        source="user.subscribe_newsletter", read_only=True
    )

    class Meta:
        model = UserProfile
        fields = ["is_profile_public", "receive_notifications", "subscribe_newsletter"]
        read_only_fields = ["subscribe_newsletter"]


class UserFullProfileDataSerializer(serializers.Serializer):
    """Serializer for the complete profile data dictionary"""

    user_id = serializers.IntegerField()
    email = serializers.EmailField()
    username = serializers.CharField()
    full_name = serializers.CharField()
    short_name = serializers.CharField()
    first_name = serializers.CharField()
    middle_name = serializers.CharField(allow_null=True)
    last_name = serializers.CharField()
    role = serializers.CharField()
    phone_number = serializers.CharField(allow_null=True)
    address = serializers.CharField(allow_null=True)
    bio = serializers.CharField(allow_null=True)
    date_of_birth = serializers.DateField(allow_null=True)
    gender = serializers.CharField(allow_null=True)
    profile_picture = serializers.URLField(allow_null=True)
    is_verified = serializers.BooleanField()
    is_active = serializers.BooleanField()
    date_joined = serializers.DateTimeField()
    last_login = serializers.DateTimeField(allow_null=True)
    social_media = serializers.DictField()
    preferences = serializers.DictField()
