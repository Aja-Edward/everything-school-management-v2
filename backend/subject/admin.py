from django.contrib import admin
from django.utils.html import format_html
from django.db.models import Q, Count
from django.urls import reverse
from django.utils.safestring import mark_safe

from .models import Subject, SchoolStreamConfiguration, SchoolStreamSubjectAssignment


class PrerequisiteInline(admin.TabularInline):
    """Inline for managing subject prerequisites"""

    model = Subject.prerequisites.through
    fk_name = "to_subject"
    verbose_name = "Prerequisite Subject"
    verbose_name_plural = "Prerequisite Subjects"
    extra = 0

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("from_subject")


@admin.register(SchoolStreamConfiguration)
class SchoolStreamConfigurationAdmin(admin.ModelAdmin):
    """Admin interface for school stream configurations"""

    list_display = [
        'tenant', 'stream', 'subject_role', 'min_subjects_required',
        'max_subjects_allowed', 'is_compulsory', 'is_active'
    ]

    list_filter = [
        'tenant', 'stream', 'subject_role', 'is_compulsory', 'is_active'
    ]

    search_fields = ['stream__name', 'tenant__name']

    ordering = ['tenant', 'stream', 'display_order']

    fieldsets = (
        ('Basic Information', {
            'fields': ('tenant', 'stream', 'subject_role')
        }),
        ('Requirements', {
            'fields': ('min_subjects_required', 'max_subjects_allowed', 'is_compulsory')
        }),
        ('Display', {
            'fields': ('display_order', 'is_active')
        }),
    )


@admin.register(SchoolStreamSubjectAssignment)
class SchoolStreamSubjectAssignmentAdmin(admin.ModelAdmin):
    """Admin interface for stream subject assignments"""
    
    list_display = [
        'stream_config', 'subject', 'is_compulsory', 'credit_weight', 
        'can_be_elective_elsewhere', 'is_active'
    ]
    
    list_filter = [
        'stream_config__tenant', 'stream_config__stream', 'stream_config__subject_role',
        'is_compulsory', 'can_be_elective_elsewhere', 'is_active'
    ]
    
    search_fields = [
        'stream_config__stream__name', 'subject__name'
    ]
    
    ordering = ['stream_config', 'subject__name']
    
    fieldsets = (
        ('Assignment', {
            'fields': ('stream_config', 'subject')
        }),
        ('Subject Configuration', {
            'fields': ('is_compulsory', 'credit_weight', 'can_be_elective_elsewhere')
        }),
        ('Prerequisites', {
            'fields': ('prerequisites',),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
    )
    
    filter_horizontal = ['prerequisites']


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    """Admin interface for subjects - updated for current model structure"""
    
    # Display configuration - Only fields that exist
    list_display = (
        "id",
        "name",
        "short_name",
        "code",
        "category",
        "education_levels",
        "ss_subject_type",
        "is_cross_cutting",
        "is_active",
        "created_at",
    )

    list_display_links = ("id", "name")

    # Filtering options - Only fields that exist
    list_filter = (
        "category",
        "education_levels",
        "ss_subject_type",
        "is_cross_cutting",
        "is_active",
        "created_at",
    )

    # Search functionality - Only fields that exist
    search_fields = (
        "name",
        "short_name",
        "code",
        "description",
    )

    # Ordering
    ordering = ("education_levels", "category", "subject_order", "name")

    # Advanced filtering
    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .prefetch_related("grade_levels", "prerequisites")
        )

    # Fieldsets - Only fields that exist
    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "name",
                    "short_name",
                    "code",
                    "description",
                )
            },
        ),
        (
            "Classification & Levels",
            {
                "fields": (
                    "category",
                    "education_levels",
                    "nursery_levels",
                    "ss_subject_type",
                    "grade_levels",
                    "subject_order",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Academic Configuration",
            {
                "fields": (
                    "is_cross_cutting",
                    "default_stream_role",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Prerequisites",
            {
                "fields": ("prerequisites",),
                "classes": ("collapse",),
                "description": "Select subjects that students must complete before taking this subject.",
            },
        ),
        (
            "Status",
            {
                "fields": (
                    "is_active",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    # Read-only fields
    readonly_fields = ("created_at", "updated_at")

    # Form field configurations
    filter_horizontal = ("grade_levels", "prerequisites")

    # Bulk actions - Only actions that work with existing fields
    actions = [
        "activate_subjects",
        "deactivate_subjects",
        "make_cross_cutting",
        "remove_cross_cutting",
        "export_subjects_csv",
    ]

    # Enable list editing for quick changes
    list_editable = ("is_cross_cutting",)

    # Items per page
    list_per_page = 25

    # Enable date hierarchy
    date_hierarchy = "created_at"

    # Inlines
    inlines = [PrerequisiteInline]

    # Bulk actions
    @admin.action(description="✅ Activate selected subjects")
    def activate_subjects(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(
            request,
            f"Successfully activated {updated} subject(s).",
        )

    @admin.action(description="❌ Deactivate selected subjects")
    def deactivate_subjects(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(
            request,
            f"Successfully deactivated {updated} subject(s).",
        )

    @admin.action(description="🌐 Mark as cross-cutting")
    def make_cross_cutting(self, request, queryset):
        # Only apply to Senior Secondary subjects
        ss_subjects = queryset.filter(education_levels__contains=["SENIOR_SECONDARY"])
        updated = ss_subjects.update(is_cross_cutting=True)
        self.message_user(
            request,
            f"Successfully marked {updated} subject(s) as cross-cutting.",
        )

    @admin.action(description="❌ Remove cross-cutting status")
    def remove_cross_cutting(self, request, queryset):
        updated = queryset.update(is_cross_cutting=False)
        self.message_user(
            request,
            f"Successfully removed cross-cutting status from {updated} subject(s).",
        )

    @admin.action(description="📊 Export to CSV")
    def export_subjects_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="subjects_export.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "Name",
                "Short Name",
                "Code",
                "Category",
                "Education Levels",
                "Nursery Levels",
                "SS Subject Type",
                "Is Cross Cutting",
                "Has Prerequisites",
                "Is Active",
                "Created At",
            ]
        )

        for subject in queryset:
            writer.writerow(
                [
                    subject.name,
                    subject.short_name,
                    subject.code,
                    subject.get_category_display(),
                    str(subject.education_levels),
                    str(subject.nursery_levels),
                    subject.get_ss_subject_type_display() if subject.ss_subject_type else "",
                    "Yes" if subject.is_cross_cutting else "No",
                    "Yes" if subject.prerequisites.exists() else "No",
                    "Yes" if subject.is_active else "No",
                    subject.created_at.strftime("%Y-%m-%d") if subject.created_at else "",
                ]
            )

        self.message_user(
            request,
            f"Successfully exported {queryset.count()} subject(s) to CSV.",
        )
        return response

    # Form validation and customization
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)

        # Updated help text with existing fields
        help_texts = {
            "education_levels": 'Select education levels where this subject is taught (e.g., ["PRIMARY", "SECONDARY"])',
            "nursery_levels": "Select specific nursery levels if this is a nursery subject",
            "ss_subject_type": "Classification for Senior Secondary subjects (required for SS subjects)",
            "is_cross_cutting": "Cross-cutting subjects are required for all SS students",
            "subject_order": "Order for displaying subjects within a category (0 = first)",
        }

        for field_name, help_text in help_texts.items():
            if field_name in form.base_fields:
                form.base_fields[field_name].help_text = help_text

        return form

    # Custom save behavior with enhanced validation
    def save_model(self, request, obj, form, change):
        try:
            # Perform model validation
            obj.full_clean()
            super().save_model(request, obj, form, change)

            if not change:  # If creating new object
                self.message_user(
                    request,
                    format_html(
                        "Subject '<strong>{}</strong>' was created successfully. "
                        "Don't forget to assign it to appropriate grade levels!",
                        obj.name,
                    ),
                )
            else:  # If updating existing object
                self.message_user(
                    request,
                    format_html(
                        "Subject '<strong>{}</strong>' was updated successfully.",
                        obj.name,
                    ),
                )
        except Exception as e:
            self.message_user(request, f"Error saving subject: {str(e)}", level="ERROR")

    # Add custom CSS and JavaScript
    class Media:
        css = {"all": ("admin/css/subject_admin.css",)}
        js = ("admin/js/subject_admin.js",)


# Enhanced inline for use in other admin classes
class SubjectInline(admin.TabularInline):
    model = Subject.grade_levels.through
    verbose_name = "Subject Assignment"
    verbose_name_plural = "Subject Assignments"
    fields = (
        "subject",
        "subject_category",
        "subject_status",
        "subject_type",
    )
    readonly_fields = (
        "subject_category",
        "subject_status",
        "subject_type",
    )
    extra = 0
    show_change_link = True

    @admin.display(description="Category")
    def subject_category(self, obj):
        return obj.subject.get_category_display() if obj.subject else "-"

    @admin.display(description="Type")
    def subject_type(self, obj):
        if not obj.subject:
            return "-"

        if obj.subject.ss_subject_type:
            return obj.subject.get_ss_subject_type_display()
        return "Standard"

    @admin.display(description="Status")
    def subject_status(self, obj):
        if not obj.subject:
            return "-"

        status_parts = []
        if obj.subject.is_cross_cutting:
            status_parts.append("Cross-cutting")

        return " | ".join(status_parts) if status_parts else "Standard"
