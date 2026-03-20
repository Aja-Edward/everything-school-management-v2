from django.contrib import admin
from .models import Attendance


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
