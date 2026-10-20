from django.contrib import admin

from .models import Assignment, AssignmentSubmission


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ["title", "classroom", "subject", "teacher", "due_date", "tenant"]
    list_filter = ["tenant", "due_date"]
    search_fields = ["title", "classroom__name"]
    raw_id_fields = ["classroom", "subject", "teacher", "created_by"]


@admin.register(AssignmentSubmission)
class AssignmentSubmissionAdmin(admin.ModelAdmin):
    list_display = ["assignment", "student", "submitted_at", "grade", "tenant"]
    list_filter = ["tenant"]
    search_fields = ["assignment__title", "student__user__first_name", "student__user__last_name"]
    raw_id_fields = ["assignment", "student", "graded_by"]
