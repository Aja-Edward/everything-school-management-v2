from rest_framework import serializers
from .models import (
    NotificationSettings,
    SystemPreferences,
    SchoolHoliday,
    SchoolAnnouncement,
    CommunicationSettings,
    Permission,
    Role,
    UserRole,
    TenantLandingPage,
    LandingSection,
    NavigationLink,
)


class NotificationSettingsSerializer(serializers.ModelSerializer):
    """Serializer for notification settings"""

    class Meta:
        model = NotificationSettings
        fields = [
            "id",
            "user_type",
            "email_notifications",
            "sms_notifications",
            "push_notifications",
            "in_app_notifications",
            "academic_updates",
            "attendance_alerts",
            "fee_reminders",
            "exam_notifications",
            "general_announcements",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SystemPreferencesSerializer(serializers.ModelSerializer):
    """Serializer for system preferences"""

    class Meta:
        model = SystemPreferences
        fields = [
            "id",
            "grading_system",
            "pass_percentage",
            "max_attendance_percentage",
            "currency",
            "currency_symbol",
            "late_fee_percentage",
            "password_min_length",
            "password_require_special",
            "password_require_numbers",
            "password_require_uppercase",
            "auto_backup",
            "backup_frequency",
            "backup_retention_days",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SchoolHolidaySerializer(serializers.ModelSerializer):
    """Serializer for school holidays"""

    class Meta:
        model = SchoolHoliday
        fields = [
            "id",
            "name",
            "start_date",
            "end_date",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SchoolAnnouncementSerializer(serializers.ModelSerializer):
    """Serializer for school announcements"""

    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True
    )

    class Meta:
        model = SchoolAnnouncement
        fields = [
            "id",
            "title",
            "content",
            "announcement_type",
            "is_active",
            "is_pinned",
            "target_audience",
            "start_date",
            "end_date",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class GeneralSettingsUpdateSerializer(serializers.Serializer):
    """Serializer for updating general settings"""

    # School Information
    school_name = serializers.CharField(max_length=200, required=False)
    school_address = serializers.CharField(required=False, allow_blank=True)
    school_phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True
    )
    school_email = serializers.EmailField(required=False, allow_blank=True)
    school_website = serializers.URLField(required=False, allow_blank=True)

    # Academic Information
    academic_year = serializers.CharField(max_length=20, required=False)
    current_term = serializers.CharField(max_length=20, required=False)
    school_motto = serializers.CharField(
        max_length=200, required=False, allow_blank=True
    )

    # System Preferences
    timezone = serializers.CharField(max_length=50, required=False)
    date_format = serializers.CharField(max_length=20, required=False)
    time_format = serializers.ChoiceField(
        choices=[("12", "12-hour"), ("24", "24-hour")], required=False
    )
    language = serializers.ChoiceField(
        choices=[("en", "English"), ("es", "Spanish"), ("fr", "French")], required=False
    )

    # General Preferences
    auto_save = serializers.BooleanField(required=False)
    notifications_enabled = serializers.BooleanField(required=False)
    dark_mode = serializers.BooleanField(required=False)
    maintenance_mode = serializers.BooleanField(required=False)

    # Session Management
    session_timeout = serializers.IntegerField(
        min_value=5, max_value=480, required=False
    )
    max_login_attempts = serializers.IntegerField(
        min_value=1, max_value=20, required=False
    )


class LogoUploadSerializer(serializers.Serializer):
    """Serializer for logo upload"""

    logo = serializers.ImageField(
        max_length=None, allow_empty_file=False, use_url=True, required=True
    )

    def validate_logo(self, value):
        """Validate logo file"""
        # Check file size (max 2MB)
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Logo file size must be less than 2MB")

        # Check file extension
        allowed_extensions = ["jpg", "jpeg", "png", "gif"]
        file_extension = value.name.split(".")[-1].lower()
        if file_extension not in allowed_extensions:
            raise serializers.ValidationError(
                f"Only {', '.join(allowed_extensions)} files are allowed"
            )

        return value


class FaviconUploadSerializer(serializers.Serializer):
    """Serializer for favicon upload"""

    favicon = serializers.ImageField(
        max_length=None, allow_empty_file=False, use_url=True, required=True
    )

    def validate_favicon(self, value):
        """Validate favicon file"""
        # Check file size (max 1MB)
        if value.size > 1 * 1024 * 1024:
            raise serializers.ValidationError("Favicon file size must be less than 1MB")

        # Check file extension
        allowed_extensions = ["ico", "png"]
        file_extension = value.name.split(".")[-1].lower()
        if file_extension not in allowed_extensions:
            raise serializers.ValidationError(
                f"Only {', '.join(allowed_extensions)} files are allowed"
            )

        return value


class SettingsSummarySerializer(serializers.Serializer):
    """Serializer for settings summary"""

    school_name = serializers.CharField()
    academic_year = serializers.CharField()
    current_term = serializers.CharField()
    timezone = serializers.CharField()
    language = serializers.CharField()
    dark_mode = serializers.BooleanField()
    maintenance_mode = serializers.BooleanField()
    logo_url = serializers.CharField(allow_null=True)
    favicon_url = serializers.CharField(allow_null=True)
    last_updated = serializers.DateTimeField()


class CommunicationSettingsSerializer(serializers.ModelSerializer):
    """Serializer for communication settings"""

    class Meta:
        model = CommunicationSettings
        fields = [
            "id",
            # Brevo Settings
            "brevo_api_key",
            "brevo_sender_email",
            "brevo_sender_name",
            "brevo_test_mode",
            # Twilio Settings
            "twilio_account_sid",
            "twilio_auth_token",
            "twilio_phone_number",
            "twilio_test_mode",
            # Notification Preferences
            "email_notifications_enabled",
            "sms_notifications_enabled",
            "in_app_notifications_enabled",
            "digest_frequency",
            # Connection Status
            "brevo_configured",
            "twilio_configured",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        """Custom representation to mask sensitive data"""
        data = super().to_representation(instance)

        # Mask sensitive API keys and tokens
        if data.get("brevo_api_key"):
            data["brevo_api_key"] = (
                data["brevo_api_key"][:8] + "..." + data["brevo_api_key"][-4:]
            )
        if data.get("twilio_auth_token"):
            data["twilio_auth_token"] = (
                data["twilio_auth_token"][:8] + "..." + data["twilio_auth_token"][-4:]
            )

        return data


class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for permissions"""

    module_display = serializers.CharField(source="get_module_display", read_only=True)
    permission_type_display = serializers.CharField(
        source="get_permission_type_display", read_only=True
    )
    section_display = serializers.CharField(
        source="get_section_display", read_only=True
    )

    class Meta:
        model = Permission
        fields = [
            "id",
            "module",
            "module_display",
            "permission_type",
            "permission_type_display",
            "section",
            "section_display",
            "granted",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

class RoleSerializer(serializers.ModelSerializer):
    """Serializer for roles"""

    permissions = serializers.SerializerMethodField()
    user_count = serializers.ReadOnlyField()
    created_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True
    )

    # Nested permissions structure for frontend compatibility
    permissions_dict = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "description",
            "color",
            "is_system",
            "is_active",
            "user_count",
            "permissions",
            "permissions_dict",
            "primary_section_access",
            "secondary_section_access",
            "nursery_section_access",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user_count", "created_at", "updated_at"]

    def get_permissions(self, obj):
        """Get permissions for the role"""
        if obj.pk and hasattr(obj, "permissions"):
            return PermissionSerializer(obj.permissions.all(), many=True).data
        return []

    def get_permissions_dict(self, obj):
        """
        Convert permissions to nested dictionary structure
        matching the frontend format
        """
        permissions_dict = {}

        # Initialize all modules with default permissions
        modules = [
            "dashboard",
            "students",
            "teachers",
            "parents",
            "attendance",
            "results",
            "exams",
            "messaging",
            "finance",
            "reports",
            "settings",
            "announcements",
            "events",
            "library",
            "timetable",
            "subjects",
            "classes",
        ]

        for module in modules:
            permissions_dict[module] = {
                "read": False,
                "write": False,
                "delete": False,
                "admin": False,
            }

        # Set actual permissions only if the object is saved
        if obj.pk and hasattr(obj, "permissions"):
            for permission in obj.permissions.all():
                if permission.module in permissions_dict:
                    permissions_dict[permission.module][
                        permission.permission_type
                    ] = permission.granted

        return permissions_dict

    # 🔥 ADD THESE METHODS BELOW 🔥
    def create(self, validated_data):
        # Remove permissions if present (handled manually)
        permissions_data = self.initial_data.get("permissions", [])
        role = super().create(validated_data)

        if permissions_data:
            role.permissions.set(permissions_data)
        return role

    def update(self, instance, validated_data):
        # Same logic for update
        permissions_data = self.initial_data.get("permissions", None)
        role = super().update(instance, validated_data)

        if permissions_data is not None:
            role.permissions.set(permissions_data)
        return role


class RoleCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating and updating roles"""

    permissions = serializers.ListField(
        child=serializers.IntegerField(), required=False
    )

    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "description",
            "color",
            "is_active",
            "permissions",
            "primary_section_access",
            "secondary_section_access",
            "nursery_section_access",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        permissions_data = validated_data.pop("permissions", [])
        role = Role.objects.create(**validated_data)

        if permissions_data:
            permissions = Permission.objects.filter(id__in=permissions_data)
            role.permissions.set(permissions)

        return role

    def update(self, instance, validated_data):
        permissions_data = validated_data.pop("permissions", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if permissions_data is not None:
            permissions = Permission.objects.filter(id__in=permissions_data)
            instance.permissions.set(permissions)

        return instance


class UserRoleSerializer(serializers.ModelSerializer):
    """Serializer for user role assignments"""

    user_name = serializers.CharField(source="user.full_name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    role_color = serializers.CharField(source="role.color", read_only=True)
    assigned_by_name = serializers.CharField(
        source="assigned_by.full_name", read_only=True
    )
    custom_permissions = serializers.SerializerMethodField()

    class Meta:
        model = UserRole
        fields = [
            "id",
            "user",
            "user_name",
            "user_email",
            "role",
            "role_name",
            "role_color",
            "primary_section_access",
            "secondary_section_access",
            "nursery_section_access",
            "custom_permissions",
            "assigned_by",
            "assigned_by_name",
            "assigned_at",
            "expires_at",
            "is_active",
        ]
        read_only_fields = ["id", "assigned_at"]

    def get_custom_permissions(self, obj):
        """Get custom permissions for the user role"""
        if obj.pk and hasattr(obj, "custom_permissions"):
            return PermissionSerializer(obj.custom_permissions.all(), many=True).data
        return []


class UserRoleCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating and updating user role assignments"""

    custom_permissions = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    class Meta:
        model = UserRole
        fields = [
            "user",
            "role",
            "primary_section_access",
            "secondary_section_access",
            "nursery_section_access",
            "custom_permissions",
            "expires_at",
            "is_active",
        ]

    def create(self, validated_data):
        custom_permissions_data = validated_data.pop("custom_permissions", [])
        user_role = UserRole.objects.create(**validated_data)

        if custom_permissions_data:
            permissions = Permission.objects.filter(id__in=custom_permissions_data)
            user_role.custom_permissions.set(permissions)

        return user_role

    def update(self, instance, validated_data):
        custom_permissions_data = validated_data.pop("custom_permissions", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if custom_permissions_data is not None:
            permissions = Permission.objects.filter(id__in=custom_permissions_data)
            instance.custom_permissions.set(permissions)

        return instance


# ─── Landing Page Serializers ─────────────────────────────────────────────────

class NavigationLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = NavigationLink
        fields = [
            "id", "label", "url", "link_type", "open_in_new_tab",
            "is_enabled", "display_order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class LandingSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandingSection
        fields = [
            "id", "section_type", "title", "subtitle", "content", "image",
            "is_enabled", "display_order",
            # contact fields
            "contact_address", "contact_phone", "contact_email",
            "contact_hours", "contact_map_embed",
            # admissions fields
            "admissions_deadline", "admissions_fee",
            "admissions_contact_name", "admissions_contact_email",
            "admissions_contact_phone",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TenantLandingPageSerializer(serializers.ModelSerializer):
    sections = LandingSectionSerializer(many=True, read_only=True)
    nav_links = NavigationLinkSerializer(many=True, read_only=True)

    class Meta:
        model = TenantLandingPage
        fields = [
            "id", "is_published",
            "hero_type", "hero_image", "hero_title", "hero_subtitle",
            "hero_cta_text", "hero_cta_url",
            "hero_secondary_cta_text", "hero_secondary_cta_url",
            "ribbon_enabled", "ribbon_text", "ribbon_speed",
            "footer_text",
            "facebook_url", "twitter_url", "instagram_url", "youtube_url",
            "sections", "nav_links",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TenantLandingPageUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantLandingPage
        fields = [
            "is_published",
            "hero_type", "hero_image", "hero_title", "hero_subtitle",
            "hero_cta_text", "hero_cta_url",
            "hero_secondary_cta_text", "hero_secondary_cta_url",
            "ribbon_enabled", "ribbon_text", "ribbon_speed",
            "footer_text",
            "facebook_url", "twitter_url", "instagram_url", "youtube_url",
        ]
