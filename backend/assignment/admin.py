from django.contrib import admin

from .models import Assignment


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ["title", "classroom", "subject", "teacher", "due_date", "tenant"]
    list_filter = ["tenant", "due_date"]
    search_fields = ["title", "classroom__name"]
    raw_id_fields = ["classroom", "subject", "teacher", "created_by"]
