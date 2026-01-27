# serializers.py
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework.exceptions import ValidationError
from django.utils.crypto import get_random_string
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from datetime import timedelta
import random
import string
import calendar
import secrets

User = get_user_model()

# ============== REGISTRATION SERIALIZERS ==============

from dj_rest_auth.registration.serializers import RegisterSerializer
from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()


class CustomRegisterSerializer(RegisterSerializer):
    # Add any custom fields you need
    first_name = serializers.CharField(required=False)
    last_name = serializers.CharField(required=False)
    email = serializers.CharField(required=False)
    role = serializers.CharField(required=False)

    def get_cleaned_data(self):
        data = super().get_cleaned_data()
        data["first_name"] = self.validated_data.get("first_name", "")
        data["last_name"] = self.validated_data.get("last_name", "")
        data["email"] = self._validated_data.get("email", "")
        data["role"] = self.validated_data.get("role", "")
        return data

    def save(self, request):
        user = super().save(request)
        user.first_name = self.validated_data.get("first_name", "")
        user.last_name = self.validated_data.get("last_name", "")
        user.role = self.validated_data.get("role", "")
        user.save()
        return user


class RegisterSerializer(serializers.ModelSerializer):
    """Registration serializer - creates inactive user and sends verification"""

    password = serializers.CharField(write_only=True, validators=[validate_password], required=False)
    password_confirm = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(required=True)
    phone_number = serializers.CharField(required=False)  # For SMS verification
    verification_method = serializers.ChoiceField(
        choices=[("email", "Email"), ("sms", "SMS")], default="email"
    )

    # Student-specific fields (only required when role is student)
    student_class = serializers.CharField(required=False)
    education_level = serializers.CharField(required=False)
    date_of_birth = serializers.DateField(required=False)
    gender = serializers.CharField(required=False)
    registration_number = serializers.CharField(required=False, max_length=20)
    
    # Teacher-specific fields (only required when role is teacher)
    employee_id = serializers.CharField(required=False, max_length=20)
    
    # Parent fields (only required when role is student)
    parent_first_name = serializers.CharField(required=False)
    parent_last_name = serializers.CharField(required=False)
    parent_email = serializers.EmailField(required=False)
    parent_phone = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "password",
            "password_confirm",
            "first_name",
            "last_name",
            "role",
            "phone_number",
            "verification_method",
            "student_class",
            "education_level",
            "date_of_birth",
            "gender",
            "registration_number",
            "employee_id",
            "parent_first_name",
            "parent_last_name",
            "parent_email",
            "parent_phone",
        )
        extra_kwargs = {
            "username": {"required": False},
            "first_name": {"required": True},
            "last_name": {"required": True},
        }

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "A user with this username already exists."
            )
        return value

    def validate(self, attrs):
        role = attrs.get("role")
        # All roles now use auto-generated passwords, so password fields are optional
        # If SMS verification chosen, phone number is required
        if attrs.get("verification_method") == "sms" and not attrs.get("phone_number"):
            raise serializers.ValidationError(
                "Phone number is required for SMS verification."
            )
        # Validate student-specific fields when role is student
        if role == "student":
            required_student_fields = ["student_class", "education_level", "date_of_birth", "gender"]
            for field in required_student_fields:
                if not attrs.get(field):
                    raise serializers.ValidationError(f"{field.replace('_', ' ').title()} is required for student registration.")
            # Validate parent fields
            required_parent_fields = ["parent_first_name", "parent_last_name", "parent_email", "parent_phone"]
            for field in required_parent_fields:
                if not attrs.get(field):
                    raise serializers.ValidationError(f"{field.replace('_', ' ').title()} is required for student registration.")
            # Check if parent email already exists
            if User.objects.filter(email=attrs.get("parent_email")).exists():
                raise serializers.ValidationError("A parent with this email already exists.")
            
            # Check if registration number is already in use (if provided)
            registration_number = attrs.get("registration_number")
            if registration_number:
                from utils import generate_unique_username
                from users.models import CustomUser
                base_username = generate_unique_username("student", registration_number)
                if CustomUser.objects.filter(username=base_username).exists():
                    raise serializers.ValidationError(f"Student with registration number '{registration_number}' already exists.")
        
        # Validate teacher-specific fields when role is teacher
        elif role == "teacher":
            employee_id = attrs.get("employee_id")
            if employee_id:
                from utils import generate_unique_username
                from users.models import CustomUser
                base_username = generate_unique_username("teacher", None, employee_id)
                if CustomUser.objects.filter(username=base_username).exists():
                    raise serializers.ValidationError(f"Teacher with employment ID '{employee_id}' already exists.")
        
        return attrs

    def create(self, validated_data):
        from django.utils import timezone
        import secrets
        import string
        verification_method = validated_data.pop("verification_method", "email")
        role = validated_data.get("role")
        # Remove password fields for all roles (auto-generated)
        password = validated_data.pop("password", None)
        validated_data.pop("password_confirm", None)
        # Always generate password for all roles
        password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(10))
        # Generate username using the updated function
        from utils import generate_unique_username
        
        # Extract registration number for students and employee_id for teachers
        registration_number = None
        employee_id = None
        if role == "student":
            registration_number = validated_data.get("registration_number")
        elif role == "teacher":
            employee_id = validated_data.get("employee_id")
        
        # Generate username
        username = generate_unique_username(role, registration_number, employee_id)
        
        # Create user with generated username
        user = User(
            email=validated_data["email"], 
            first_name=validated_data["first_name"], 
            last_name=validated_data["last_name"], 
            role=role,
            username=username
        )
        user.set_password(password)
        user.is_active = False  # User needs to verify first
        user.save()
        # Generate verification code
        verification_code = "".join(random.choices(string.digits, k=6))
        user.verification_code = verification_code
        user.verification_code_expires = timezone.now() + timedelta(minutes=15)
        user.save()
        # If role is student, create student and parent records
        if role == "student":
            student_data = {}
            parent_data = {}
            student_fields = ["student_class", "education_level", "date_of_birth", "gender", "registration_number"]
            parent_fields = ["parent_first_name", "parent_last_name", "parent_email", "parent_phone"]
            for field in student_fields:
                if field in validated_data:
                    student_data[field] = validated_data.pop(field)
            for field in parent_fields:
                if field in validated_data:
                    parent_data[field] = validated_data.pop(field)
            self.create_student_and_parent(user, student_data, parent_data)
        # Send verification based on chosen method
        if verification_method == "email":
            self.send_verification_email(user, verification_code)
        elif verification_method == "sms":
            self.send_verification_sms(user, verification_code)
        
        # Store generated credentials as instance attributes for the view to access
        user._generated_username = username
        user._generated_password = password
        return user

    def create_student_and_parent(self, user, student_data, parent_data):
        """Create student and parent records for student registration"""
        from students.models import Student
        from parent.models import ParentProfile
        
        # Create parent user (inactive until verified)
        from utils import generate_unique_username
        parent_username = generate_unique_username("parent")
        parent_user = User.objects.create_user(
            email=parent_data["parent_email"],
            username=parent_username,
            first_name=parent_data["parent_first_name"],
            last_name=parent_data["parent_last_name"],
            role="parent",
            password=parent_data["parent_email"],  # Use email as initial password
            is_active=False,  # Parent also needs verification
        )
        
        # Create student record
        student = Student.objects.create(
            user=user,
            **student_data
        )
        
        # Create parent profile and link to student
        parent_profile = ParentProfile.objects.create(
            user=parent_user,
            phone=parent_data["parent_phone"],
        )
        parent_profile.students.add(student)

    def send_verification_email(self, user, code):
        """Send verification code via email using Brevo"""
        from utils.email import send_email_via_brevo
        
        subject = "Verify Your Account - SchoolMS"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333; text-align: center;">Welcome to SchoolMS!</h2>
            <p>Hi {user.first_name},</p>
            <p>Thank you for registering with SchoolMS. To complete your registration, please use the verification code below:</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">{code}</h1>
            </div>
            
            <p><strong>This code expires in 15 minutes.</strong></p>
            
            <p>If you didn't create this account, please ignore this email.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px; text-align: center;">
                This is an automated message from SchoolMS. Please do not reply to this email.
            </p>
        </div>
        """
        
        status_code, response = send_email_via_brevo(subject, html_content, user.email)
        
        if status_code not in [200, 201]:  # Accept both 200 (console) and 201 (Brevo) for success
            raise serializers.ValidationError("Failed to send verification email. Please try again.")

    def send_verification_sms(self, user, code):
        """Send verification code via SMS"""
        # Implement SMS sending logic here
        # Example with Twilio:
        # from twilio.rest import Client
        # client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # message = client.messages.create(
        #     body=f'Your verification code is: {code}',
        #     from_=settings.TWILIO_PHONE_NUMBER,
        #     to=user.phone_number
        # )
        pass  # Replace with actual SMS implementation


class VerifyAccountSerializer(serializers.Serializer):
    """Serializer for verifying account with code sent during registration"""

    email = serializers.EmailField()
    verification_code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        email = attrs.get("email")
        verification_code = attrs.get("verification_code")

        if not email or not verification_code:
            raise serializers.ValidationError(
                "Email and verification code are required."
            )

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid email address.")

        # Check if user is already active
        if user.is_active:
            raise serializers.ValidationError("Account is already verified.")

        # Check if verification code is valid
        if (
            not hasattr(user, "verification_code")
            or user.verification_code != verification_code
        ):
            raise serializers.ValidationError("Invalid verification code.")

        # Check if code is expired
        if (
            hasattr(user, "verification_code_expires")
            and user.verification_code_expires < timezone.now()
        ):
            raise serializers.ValidationError("Verification code has expired.")

        # Activate user and clear verification code
        user.is_active = True
        user.verification_code = None
        user.verification_code_expires = None
        user.save()

        attrs["user"] = user
        return attrs


class ResendVerificationSerializer(serializers.Serializer):
    """Serializer for resending verification code"""

    email = serializers.EmailField()
    verification_method = serializers.ChoiceField(
        choices=[("email", "Email"), ("sms", "SMS")], default="email"
    )

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value)
            if user.is_active:
                raise serializers.ValidationError("Account is already verified.")
        except User.DoesNotExist:
            raise serializers.ValidationError("No account found with this email.")
        return value

    def resend_code(self, validated_data):
        email = validated_data["email"]
        method = validated_data["verification_method"]
        user = User.objects.get(email=email)

        # Generate new verification code
        verification_code = "".join(random.choices(string.digits, k=6))
        user.verification_code = verification_code
        user.verification_code_expires = timezone.now() + timedelta(minutes=15)
        user.save()

        # Send based on method
        if method == "email":
            from utils.email import send_email_via_brevo
            
            subject = "Verify Your Account - SchoolMS"
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333; text-align: center;">Account Verification</h2>
                <p>Hi {user.first_name},</p>
                <p>You requested a new verification code. Here's your new code:</p>
                
                <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">{verification_code}</h1>
                </div>
                
                <p><strong>This code expires in 15 minutes.</strong></p>
                
                <p>If you didn't request this code, please ignore this email.</p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                <p style="color: #666; font-size: 12px; text-align: center;">
                    This is an automated message from SchoolMS. Please do not reply to this email.
                </p>
            </div>
            """
            
            status_code, response = send_email_via_brevo(subject, html_content, email)
            
            if status_code not in [200, 201]:  # Accept both 200 (console) and 201 (Brevo) for success
                raise serializers.ValidationError("Failed to send verification email. Please try again.")
        elif method == "sms":
            # Implement SMS sending logic
            pass

        return verification_code


# ============== LOGIN SERIALIZERS (Normal Login After Verification) ==============


class UserDetailsSerializer(serializers.ModelSerializer):
    """Serializer for user details in dj-rest-auth"""
    
    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'role', 'is_active')
        read_only_fields = ('id', 'email', 'is_active')


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Normal login after account is verified - based on your original code"""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        print("🔍 validate() got attrs:", attrs)
        username = attrs.get("username")
        password = attrs.get("password")

        if not username or not password:
            raise serializers.ValidationError("Username and password are required.")

        user = authenticate(self.context.get('request'), username=username, password=password)
        if not user:
            raise serializers.ValidationError("Invalid username or password.")
        if not user.is_active:
            raise serializers.ValidationError("User account is not active.")

        refresh = self.get_token(user)
        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
                "is_superuser": user.is_superuser,
                "is_staff": user.is_staff,
                "is_active": user.is_active,
            },
        }
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims to the token
        token["id"] = user.id
        token["email"] = user.email
        token["role"] = user.role
        token["is_staff"] = user.is_staff
        return token


class SimpleLoginSerializer(serializers.Serializer):
    """Login serializer that accepts either email or username"""

    email = serializers.CharField(required=True)  # Accepts email or username
    password = serializers.CharField(
        style={"input_type": "password"}, trim_whitespace=False
    )

    def authenticate_user(self, identifier, password):
        """Try to authenticate with identifier as email first, then as username"""
        # First try with identifier as email
        user = authenticate(self.context["request"], username=identifier, password=password)
        if user:
            return user

        # If that fails, try to find user by email and authenticate with their username
        try:
            user_by_email = User.objects.get(email=identifier)
            user = authenticate(self.context["request"], username=user_by_email.username, password=password)
            if user:
                return user
        except User.DoesNotExist:
            pass

        # Try to find user by username directly
        try:
            user_by_username = User.objects.get(username=identifier)
            user = authenticate(self.context["request"], username=identifier, password=password)
            if user:
                return user
        except User.DoesNotExist:
            pass

        return None

    def validate(self, attrs):
        identifier = attrs.get("email")  # Can be email or username
        password = attrs.get("password")

        if identifier and password:
            user = self.authenticate_user(identifier, password)
            if not user:
                # Check if user exists but is inactive (unverified)
                try:
                    inactive_user = User.objects.filter(
                        Q(email=identifier) | Q(username=identifier)
                    ).first()
                    if inactive_user and not inactive_user.is_active:
                        msg = "Account is not verified. Please check your email/SMS for verification code."
                        raise serializers.ValidationError(msg, code="authorization")
                except Exception:
                    pass

                msg = "Unable to log in with provided credentials."
                raise serializers.ValidationError(msg, code="authorization")

            # Additional checks can go here
            if user.role == "parent":
                if (
                    not hasattr(user, "parent_profile")
                    or not user.parent_profile.students.exists()
                ):
                    raise ValidationError(
                        "No linked students. Contact the administrator."
                    )

        else:
            msg = 'Must include "email" and "password".'
            raise serializers.ValidationError(msg, code="authorization")

        attrs["user"] = user
        return attrs
