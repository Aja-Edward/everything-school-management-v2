# Register your models here.
from django.contrib import admin
from .models import (
    SchoolAnnouncement,
    CommunicationSettings,
    Permission,
    Role,
    UserRole,
)


@admin.register(SchoolAnnouncement)
class SchoolAnnouncementAdmin(admin.ModelAdmin):
    list_display = ["title", "announcement_type", "is_active", "is_pinned", "created_at"]
    search_fields = ["title", "content"]
    list_filter = ["announcement_type", "is_active", "is_pinned"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(CommunicationSettings)
class CommunicationSettingsAdmin(admin.ModelAdmin):
    list_display = ["brevo_configured", "twilio_configured", "email_notifications_enabled"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ["module", "permission_type", "section", "granted"]
    list_filter = ["module", "permission_type", "section"]


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ["name", "is_system", "is_active", "created_at"]
    search_fields = ["name", "description"]
    list_filter = ["is_system", "is_active"]


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ["user", "role", "is_active", "assigned_at"]
    search_fields = ["user__email", "role__name"]
    list_filter = ["role", "is_active"]
