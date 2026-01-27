from rest_framework import serializers
from .models import ParentProfile
from students.models import Student
from users.models import CustomUser


from rest_framework import serializers
from .models import Message


class MessageSerializer(serializers.ModelSerializer):
    sender = serializers.StringRelatedField(read_only=True)
    recipient = serializers.StringRelatedField()

    class Meta:
        model = Message
        fields = [
            "id",
            "sender",
            "recipient",
            "subject",
            "content",
            "sent_at",
            "is_read",
        ]
        read_only_fields = ["id", "sender", "sent_at", "is_read"]


class StudentMinimalSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    full_name = serializers.SerializerMethodField()
    education_level_display = serializers.CharField(source="get_education_level_display", read_only=True)
    student_class_display = serializers.CharField(source="get_student_class_display", read_only=True)
    stream_name = serializers.CharField(source="stream.name", read_only=True)
    stream_type = serializers.CharField(source="stream.stream_type", read_only=True)

    class Meta:
        model = Student
        fields = [
            "id", 
            "first_name", 
            "last_name", 
            "full_name", 
            "education_level",
            "education_level_display",
            "student_class_display",
            "stream_name",
            "stream_type"
        ]

    def get_full_name(self, obj):
        return obj.user.full_name if obj.user else str(obj)


class ParentProfileSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField(read_only=True)
    students = StudentMinimalSerializer(many=True, read_only=True)
    is_active = serializers.SerializerMethodField(read_only=True)
    
    # Read-only fields mapped to frontend names
    parent_contact = serializers.CharField(source='phone', read_only=True)
    parent_address = serializers.CharField(source='address', read_only=True)

    # Write-only field to update related students by their IDs
    student_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Student.objects.all(),
        source="students",
        help_text="List of student IDs to link with this parent profile",
        required=False,  # <-- Make it optional
    )
    # User creation fields
    user_email = serializers.EmailField(write_only=True, required=False)
    user_first_name = serializers.CharField(write_only=True, required=False)
    user_last_name = serializers.CharField(write_only=True, required=False)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    address = serializers.CharField(write_only=True, required=False, allow_blank=True)

    parent_username = serializers.CharField(read_only=True)
    parent_password = serializers.CharField(read_only=True)

    class Meta:
        model = ParentProfile
        fields = [
            "id", "user", "students", "student_ids",
            "user_email", "user_first_name", "user_last_name",
            "parent_contact", "parent_address",
            "phone", "address",
            "parent_username", "parent_password",
            "is_active"
        ]
        read_only_fields = ["id", "user", "parent_username", "parent_password", "is_active"]

    def update(self, instance, validated_data):
        students = validated_data.pop("students", None)
        if students is not None:
            instance.students.set(students)
        
        # Handle user name updates
        user_first_name = validated_data.pop("user_first_name", None)
        user_last_name = validated_data.pop("user_last_name", None)
        phone = validated_data.pop("phone", None)
        address = validated_data.pop("address", None)
        
        # Update user fields if provided
        if user_first_name is not None or user_last_name is not None:
            if instance.user:
                if user_first_name is not None:
                    instance.user.first_name = user_first_name
                if user_last_name is not None:
                    instance.user.last_name = user_last_name
                instance.user.save()
        
        # Update parent profile fields
        if phone is not None:
            validated_data["phone"] = phone
        if address is not None:
            validated_data["address"] = address
            
        return super().update(instance, validated_data)

    def create(self, validated_data):
        from utils import generate_unique_username
        import secrets
        import string
        user_email = validated_data.pop("user_email", None)
        user_first_name = validated_data.pop("user_first_name", None)
        user_last_name = validated_data.pop("user_last_name", None)
        phone = validated_data.pop("phone", None)
        address = validated_data.pop("address", None)
        # Extract students if provided (student_ids becomes students via source="students")
        students = validated_data.pop("students", None)

        parent_username = None
        parent_password = None
        user = None
        if not (user_email and user_first_name and user_last_name):
            raise serializers.ValidationError("user_email, user_first_name, and user_last_name are required to create a parent user.")
        user_qs = CustomUser.objects.filter(email=user_email, role="parent")
        if user_qs.exists():
            user = user_qs.first()
            if ParentProfile.objects.filter(user=user).exists():
                raise serializers.ValidationError("A parent profile for this user already exists.")
        else:
            parent_username = generate_unique_username("parent")
            parent_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(10))
            user = CustomUser.objects.create_user(
                email=user_email,
                username=parent_username,
                first_name=user_first_name,
                last_name=user_last_name,
                role="parent",
                password=parent_password,
                is_active=True,
            )
        print(f"Creating ParentProfile for user: {user} (username: {user.username})")
        validated_data["user"] = user
        if phone:
            validated_data["phone"] = phone
        if address:
            validated_data["address"] = address
        parent_profile = super().create(validated_data)

        # Link students if provided
        if students is not None:
            parent_profile.students.set(students)

        parent_profile.parent_username = parent_username or user.username
        parent_profile.parent_password = parent_password or ""
        return parent_profile

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Attach credentials if present
        data["parent_username"] = getattr(instance, "parent_username", "")
        data["parent_password"] = getattr(instance, "parent_password", "")
        return data

    def get_user(self, obj):
        if obj.user:
            return {
                "id": obj.user.id,
                "username": obj.user.username,
                "email": obj.user.email,
                "first_name": obj.user.first_name,
                "last_name": obj.user.last_name,
                "is_active": obj.user.is_active,
                "date_joined": obj.user.date_joined,
            }
        return None

    def get_is_active(self, obj):
        return obj.user.is_active if obj.user else False
