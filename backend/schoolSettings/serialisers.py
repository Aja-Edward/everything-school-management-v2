from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    NotificationSettings,
    SystemPreferences,
    CommunicationSettings,
    SchoolHoliday,
    Permission,
    Role,
    UserRole,
    SchoolAnnouncement,
)


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "name", "codename", "description"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "permissions",
            "permission_ids",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        permission_ids = validated_data.pop("permission_ids", [])
        role = Role.objects.create(**validated_data)

        if permission_ids:
            permissions = Permission.objects.filter(id__in=permission_ids)
            role.permissions.set(permissions)

        return role

    def update(self, instance, validated_data):
        permission_ids = validated_data.pop("permission_ids", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if permission_ids is not None:
            permissions = Permission.objects.filter(id__in=permission_ids)
            instance.permissions.set(permissions)

        return instance


class SchoolAnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolAnnouncement
        fields = [
            "id",
            "title",
            "content",
            "announcement_type",
            "priority",
            "is_active",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        ]


class RoleCreateUpdateSerializer(serializers.ModelSerializer):
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False
    )

    class Meta:
        model = Role
        fields = ["name", "description", "is_active", "permission_ids"]

    def create(self, validated_data):
        permission_ids = validated_data.pop("permission_ids", [])
        role = Role.objects.create(**validated_data)

        if permission_ids:
            permissions = Permission.objects.filter(id__in=permission_ids)
            role.permissions.set(permissions)

        return role

    def update(self, instance, validated_data):
        permission_ids = validated_data.pop("permission_ids", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if permission_ids is not None:
            permissions = Permission.objects.filter(id__in=permission_ids)
            instance.permissions.set(permissions)

        return instance


class SchoolAnnouncementCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolAnnouncement
        fields = [
            "title",
            "content",
            "announcement_type",
            "priority",
            "is_active",
            "start_date",
            "end_date",
        ]
