from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from .models import Lesson, LessonAttendance, LessonResource, LessonAssessment


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = [
        'title', 'classroom', 'teacher', 'subject', 'date', 'time_slot_display', 
        'status_display', 'duration_display', 'completion_percentage_display'
    ]
    list_filter = [
        "status",
        "lesson_type",
        "difficulty_level",
        "date",
        "classroom__section__class_grade__education_level",
        "subject__category",
        "is_recurring",
        "requires_special_equipment",
        "is_online_lesson",
    ]
    search_fields = ['title', 'description', 'teacher__user__first_name', 'teacher__user__last_name', 'subject__name']
    date_hierarchy = 'date'
    ordering = ['-date', 'start_time']

    fieldsets = (
        ('Basic Information', {
            'fields': ('title', 'description', 'lesson_type', 'difficulty_level')
        }),
        ('Scheduling', {
            'fields': ('classroom', 'teacher', 'subject', 'date', 'start_time', 'end_time', 'duration_minutes')
        }),
        ('Status & Progress', {
            'fields': ('status', 'actual_start_time', 'actual_end_time', 'completion_percentage')
        }),
        ('Educational Content', {
            'fields': ('learning_objectives', 'key_concepts', 'materials_needed', 'assessment_criteria'),
            'classes': ('collapse',)
        }),
        ('Notes & Feedback', {
            'fields': ('teacher_notes', 'lesson_notes', 'student_feedback', 'admin_notes'),
            'classes': ('collapse',)
        }),
        ('Attendance & Participation', {
            'fields': ('attendance_count', 'participation_score'),
            'classes': ('collapse',)
        }),
        ('Resources & Attachments', {
            'fields': ('resources', 'attachments'),
            'classes': ('collapse',)
        }),
        ('Recurring Settings', {
            'fields': ('is_recurring', 'recurring_pattern', 'parent_lesson'),
            'classes': ('collapse',)
        }),
        ('Flags', {
            'fields': ('is_active', 'requires_special_equipment', 'is_online_lesson', 'requires_substitution'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'last_modified_by'),
            'classes': ('collapse',)
        }),
    )

    readonly_fields = ['created_at', 'updated_at', 'completion_percentage_display']

    def time_slot_display(self, obj):
        return obj.time_slot
    time_slot_display.short_description = 'Time Slot'

    def status_display(self, obj):
        status_colors = {
            'scheduled': 'blue',
            'in_progress': 'orange',
            'completed': 'green',
            'cancelled': 'red',
            'postponed': 'purple',
        }
        color = status_colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, obj.get_status_display()
        )
    status_display.short_description = 'Status'

    def duration_display(self, obj):
        return obj.duration_formatted
    duration_display.short_description = 'Duration'

    def completion_percentage_display(self, obj):
        if obj.completion_percentage == 100:
            color = 'green'
        elif obj.completion_percentage >= 75:
            color = 'orange'
        else:
            color = 'red'
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}%</span>',
            color, obj.completion_percentage
        )
    completion_percentage_display.short_description = 'Completion'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'classroom', 'teacher__user', 'subject', 'created_by', 'last_modified_by'
        )

    def save_model(self, request, obj, form, change):
        if not change:  # Creating new lesson
            obj.created_by = request.user
        obj.last_modified_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(LessonAttendance)
class LessonAttendanceAdmin(admin.ModelAdmin):
    list_display = ['lesson', 'student', 'status', 'arrival_time', 'notes_preview']
    list_filter = ['status', 'lesson__date', 'lesson__classroom']
    search_fields = ['student__user__first_name', 'student__user__last_name', 'lesson__title']
    date_hierarchy = 'lesson__date'
    
    def notes_preview(self, obj):
        return obj.notes[:50] + '...' if len(obj.notes) > 50 else obj.notes
    notes_preview.short_description = 'Notes'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('lesson', 'student__user')


@admin.register(LessonResource)
class LessonResourceAdmin(admin.ModelAdmin):
    list_display = ['title', 'lesson', 'resource_type', 'is_required', 'url_preview']
    list_filter = ['resource_type', 'is_required', 'lesson__date']
    search_fields = ['title', 'description', 'lesson__title']
    
    def url_preview(self, obj):
        if obj.url:
            return format_html('<a href="{}" target="_blank">{}</a>', obj.url, obj.url[:50] + '...')
        return '-'
    url_preview.short_description = 'URL'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('lesson')


@admin.register(LessonAssessment)
class LessonAssessmentAdmin(admin.ModelAdmin):
    list_display = ['title', 'lesson', 'assessment_type', 'due_date', 'total_points', 'weight_percentage']
    list_filter = ['assessment_type', 'due_date', 'lesson__subject']
    search_fields = ['title', 'description', 'lesson__title']
    date_hierarchy = 'due_date'
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('title', 'assessment_type', 'description')
        }),
        ('Lesson & Due Date', {
            'fields': ('lesson', 'due_date')
        }),
        ('Scoring', {
            'fields': ('total_points', 'weight_percentage')
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('lesson')
