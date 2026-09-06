from django.contrib import admin
from .models import (
    Attendance,
    AttendanceSettings,
    GateScan,
    ParentAlertPreference,
    ScanNotification,
    StudentTag,
)


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = (
        "student",
        "section",
        "teacher",
        "date",
        "status",
        "time_in",
        "time_out",
    )

    list_filter = (
        "status",
        "date",
        "section",
        "teacher",
    )

    search_fields = (
        "student__first_name",
        "student__last_name",
        "student__admission_number",
        "section__name",
        "teacher__user__first_name",
        "teacher__user__last_name",
    )

    autocomplete_fields = (
        "student",
        "teacher",
        "section",
    )

    date_hierarchy = "date"

    ordering = ("-date",)

    list_per_page = 25

    fieldsets = (
        ("Attendance Information", {"fields": ("tenant", "date", "status")}),
        ("Student & Section", {"fields": ("student", "section", "teacher")}),
        ("Time Tracking", {"fields": ("time_in", "time_out")}),
    )


@admin.register(StudentTag)
class StudentTagAdmin(admin.ModelAdmin):
    list_display = (
        "uid",
        "student",
        "status",
        "label",
        "issued_at",
        "issued_by",
    )
    list_filter = ("status", "issued_at")
    search_fields = (
        "uid",
        "label",
        "student__user__first_name",
        "student__user__last_name",
        "student__registration_number",
    )
    autocomplete_fields = ("student",)
    readonly_fields = ("issued_at", "revoked_at")
    date_hierarchy = "issued_at"
    ordering = ("-issued_at",)
    list_per_page = 50

    fieldsets = (
        ("Tag", {"fields": ("tenant", "uid", "label", "status")}),
        ("Student", {"fields": ("student",)}),
        ("Issue", {"fields": ("issued_at", "issued_by")}),
        ("Revocation", {"fields": ("revoked_at", "revoked_by", "revoke_reason")}),
    )


@admin.register(GateScan)
class GateScanAdmin(admin.ModelAdmin):
    """
    Read-only: GateScan is an append-only event log, and the point of that
    log is that nobody can quietly rewrite what a gate recorded. Corrections
    belong on the Attendance row it projected onto.
    """

    list_display = (
        "scanned_at",
        "student",
        "direction",
        "uid",
        "is_duplicate",
        "scanned_by",
        "device_id",
    )
    list_filter = ("direction", "is_duplicate", "scanned_at")
    search_fields = (
        "uid",
        "device_id",
        "client_scan_id",
        "student__user__first_name",
        "student__user__last_name",
    )
    date_hierarchy = "scanned_at"
    ordering = ("-scanned_at",)
    list_per_page = 50
    list_select_related = ("student__user", "scanned_by", "tag")

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(AttendanceSettings)
class AttendanceSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "tenant",
        "morning_opens",
        "late_after",
        "afternoon_opens",
        "dismissal_after",
        "alert_policy",
    )
    list_filter = ("alert_policy",)
    search_fields = ("tenant__name", "tenant__slug")
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        ("School", {"fields": ("tenant",)}),
        (
            "Morning",
            {
                "fields": ("morning_opens", "late_after"),
                "description": "A tap at or after the late cut-off is marked Late.",
            },
        ),
        (
            "Afternoon",
            {
                "fields": ("afternoon_opens", "dismissal_after"),
                "description": "An exit before dismissal is an early departure.",
            },
        ),
        (
            "Scanning and alerts",
            {"fields": ("duplicate_scan_window_seconds", "alert_policy")},
        ),
        ("Audit", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(ParentAlertPreference)
class ParentAlertPreferenceAdmin(admin.ModelAdmin):
    list_display = (
        "parent",
        "in_app_enabled",
        "email_enabled",
        "sms_enabled",
        "muted",
    )
    list_filter = ("in_app_enabled", "email_enabled", "sms_enabled", "muted")
    search_fields = (
        "parent__user__first_name",
        "parent__user__last_name",
        "parent__user__email",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(ScanNotification)
class ScanNotificationAdmin(admin.ModelAdmin):
    """
    Read-only: this is the delivery record that answers "was the parent told?".
    Editing it would make that answer worthless. Retries go through
    flush_pending_scan_notifications.
    """

    list_display = (
        "queued_at",
        "student",
        "recipient",
        "channel",
        "status",
        "provider",
        "attempts",
        "sent_at",
    )
    list_filter = ("channel", "status", "provider", "queued_at")
    search_fields = (
        "destination",
        "subject",
        "provider_message_id",
        "student__user__first_name",
        "student__user__last_name",
    )
    date_hierarchy = "queued_at"
    ordering = ("-queued_at",)
    list_per_page = 50
    list_select_related = ("student__user", "recipient", "scan")

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
