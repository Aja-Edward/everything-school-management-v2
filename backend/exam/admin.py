from django.contrib import admin
from django.db import models
from django.forms import TextInput, Textarea
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from django.contrib.admin import SimpleListFilter
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Avg, Q

# Import from result app
from result.models import StudentResult

from .models import (
    ExamSchedule,
    Exam,
    ExamRegistration,
    ExamStatistics,
    QuestionBank,
    ExamTemplate,
    ExamReview,
    ExamReviewer,
    ExamReviewComment,
)


# Custom Filters
class ExamTypeFilter(SimpleListFilter):
    title = "Exam Type"
    parameter_name = "exam_type"

    def lookups(self, request, model_admin):
        return [
            ("final_exam", "Final Examinations"),
            ("mid_term", "Mid-Term Examinations"),
            ("test", "Class Tests"),
            ("practical", "Practical Examinations"),
            ("quiz", "Quizzes"),
        ]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(exam_type=self.value())
        return queryset


class ExamStatusFilter(SimpleListFilter):
    title = "Exam Status"
    parameter_name = "status"

    def lookups(self, request, model_admin):
        return [
            ("upcoming", "Upcoming"),
            ("today", "Today"),
            ("completed", "Completed"),
            ("overdue", "Overdue"),
        ]

    def queryset(self, request, queryset):
        today = timezone.now().date()
        if self.value() == "upcoming":
            return queryset.filter(exam_date__gt=today, status="scheduled")
        elif self.value() == "today":
            return queryset.filter(exam_date=today)
        elif self.value() == "completed":
            return queryset.filter(status="completed")
        elif self.value() == "overdue":
            return queryset.filter(exam_date__lt=today, status="scheduled")
        return queryset


class TermFilter(SimpleListFilter):
    title = "Academic Term"
    parameter_name = "term"

    def lookups(self, request, model_admin):
        from academics.models import Term

        return [(term.id, term.name) for term in Term.objects.all()]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(term__id=self.value())
        return queryset


class GradeFilter(SimpleListFilter):
    title = "Grade"
    parameter_name = "grade"

    def lookups(self, request, model_admin):
        return [
            ("A", "Grade A (Excellent)"),
            ("B", "Grade B (Very Good)"),
            ("C", "Grade C (Good)"),
            ("D", "Grade D (Satisfactory)"),
            ("E", "Grade E (Pass)"),
            ("F", "Grade F (Fail)"),
        ]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(grade=self.value())
        return queryset


class PassFailFilter(SimpleListFilter):
    title = "Pass/Fail Status"
    parameter_name = "pass_status"

    def lookups(self, request, model_admin):
        return [
            ("pass", "Passed"),
            ("fail", "Failed"),
        ]

    def queryset(self, request, queryset):
        if self.value() == "pass":
            return queryset.filter(is_pass=True)
        elif self.value() == "fail":
            return queryset.filter(is_pass=False)
        return queryset


# Inline Admin Classes
class ExamInline(admin.TabularInline):
    model = Exam
    extra = 0
    fields = ("title", "subject", "exam_date", "start_time", "status")
    readonly_fields = ("created_at",)
    show_change_link = True


class ExamRegistrationInline(admin.TabularInline):
    model = ExamRegistration
    extra = 0
    fields = (
        "student",
        "is_registered",
        "is_present",
        "seat_number",
        "has_special_needs",
    )
    readonly_fields = ("registration_date",)


class ResultInline(admin.TabularInline):
    model = StudentResult
    extra = 0
    fields = ("student", "score", "total_marks", "grade", "percentage", "is_pass")
    readonly_fields = ("percentage", "grade", "is_pass", "date_recorded")


# # Main Admin Classes
# @admin.register(ExamSchedule)
# class ExamScheduleAdmin(admin.ModelAdmin):
#     list_display = [
#         "name",
#         "academic_session",
#         "term",
#         "start_date",
#         "end_date",
#         "registration_status",
#         "exam_count",
#         "is_active",
#         "is_default",
#         "is_current",
#     ]
#     list_filter = ["academic_session", "term", "is_active", "is_default", "start_date"]
#     actions = ["set_as_default", "set_as_active"]
#     search_fields = ["name", "description", "academic_session__name"]
#     date_hierarchy = "start_date"
#     inlines = [ExamInline]
#     ordering = ["-start_date"]

#     fieldsets = (
#         ("Basic Information", {"fields": ("name", "description")}),
#         ("Academic Period", {"fields": ("academic_session", "term")}),
#         ("Schedule", {"fields": ("start_date", "end_date")}),
#         (
#             "Registration",
#             {
#                 "fields": (
#                     "registration_start",
#                     "registration_end",
#                     "allow_late_registration",
#                 )
#             },
#         ),
#         ("Results", {"fields": ("results_publication_date",)}),
#         ("Status", {"fields": ("is_active",)}),
#     )

#     def registration_status(self, obj):
#         if obj.is_registration_open:
#             return format_html('<span style="color: green;">✓ Open</span>')
#         else:
#             return format_html('<span style="color: red;">✗ Closed</span>')

#     registration_status.short_description = "Registration"

#     def exam_count(self, obj):
#         count = obj.exams.count()
#         if count > 0:
#             url = (
#                 reverse("admin:exam_exam_changelist")
#                 + f"?exam_schedule__id__exact={obj.id}"
#             )
#             return format_html('<a href="{}">{} exams</a>', url, count)
#         return "0 exams"

#     exam_count.short_description = "Exams"

#     actions = ["activate_schedules", "deactivate_schedules"]

#     def activate_schedules(self, request, queryset):
#         updated = queryset.update(is_active=True)
#         self.message_user(request, f"{updated} exam schedules activated successfully.")

#     activate_schedules.short_description = "Activate selected exam schedules"

#     def deactivate_schedules(self, request, queryset):
#         updated = queryset.update(is_active=False)
#         self.message_user(
#             request, f"{updated} exam schedules deactivated successfully."
#         )

#     deactivate_schedules.short_description = "Deactivate selected exam schedules"


# @admin.register(Exam)
# class ExamAdmin(admin.ModelAdmin):
#     list_display = [
#         "title",
#         "subject",
#         "grade_level",
#         "exam_date",
#         "duration",
#         "total_marks",
#         "status",
#         "registration_count",
#     ]
#     list_filter = [
#         ExamStatusFilter,
#         ExamTypeFilter,
#         "grade_level",
#         "subject",
#         "exam_date",
#         "exam_schedule",
#     ]
#     search_fields = [
#         "title",
#         "subject__name",
#         "description",
#         "code",
#     ]
#     date_hierarchy = "exam_date"
#     ordering = ["-exam_date", "start_time"]
#     inlines = [ExamRegistrationInline]
#     # Now we can enable autocomplete fields since Subject admin is registered
#     autocomplete_fields = ["subject", "teacher"]
#     filter_horizontal = ["invigilators"]

#     fieldsets = (
#         (
#             "Basic Information",
#             {"fields": ("title", "code", "description", "exam_schedule")},
#         ),
#         (
#             "Academic Details",
#             {"fields": ("subject", "grade_level", "section", "exam_type")},
#         ),
#         (
#             "Schedule & Timing",
#             {"fields": ("exam_date", "start_time", "end_time", "duration_minutes")},
#         ),
#         (
#             "Assessment Details",
#             {"fields": ("total_marks", "pass_marks", "difficulty_level")},
#         ),
#         (
#             "Staff Assignment",
#             {"fields": ("teacher", "invigilators")},
#         ),
#         (
#             "Venue & Logistics",
#             {"fields": ("venue", "max_students")},
#         ),
#         (
#             "Instructions & Materials",
#             {
#                 "fields": ("instructions", "materials_allowed", "materials_provided"),
#                 "classes": ("collapse",),
#             },
#         ),
#         (
#             "File Uploads",
#             {
#                 "fields": ("questions_file", "answer_key"),
#                 "classes": ("collapse",),
#             },
#         ),
#         (
#             "Configuration",
#             {
#                 "fields": ("status", "is_practical", "requires_computer", "is_online"),
#             },
#         ),
#     )

#     readonly_fields = ["code", "duration"]

#     def registration_count(self, obj):
#         count = obj.examregistration_set.count()
#         if count > 0:
#             url = (
#                 reverse("admin:exam_examregistration_changelist")
#                 + f"?exam__id__exact={obj.id}"
#             )
#             return format_html('<a href="{}">{} students</a>', url, count)
#         return "0 students"

#     registration_count.short_description = "Registrations"

#     actions = ["mark_completed", "mark_scheduled", "generate_statistics"]

#     def mark_completed(self, request, queryset):
#         updated = queryset.update(status="completed")
#         self.message_user(request, f"{updated} exams marked as completed.")

#     mark_completed.short_description = "Mark selected exams as completed"

#     def mark_scheduled(self, request, queryset):
#         updated = queryset.update(status="scheduled")
#         self.message_user(request, f"{updated} exams marked as scheduled.")

#     mark_scheduled.short_description = "Mark selected exams as scheduled"

#     def generate_statistics(self, request, queryset):
#         count = 0
#         for exam in queryset:
#             stats, created = ExamStatistics.objects.get_or_create(exam=exam)
#             stats.calculate_statistics()
#             count += 1
#         self.message_user(request, f"Statistics generated for {count} exams.")

#     generate_statistics.short_description = "Generate statistics for selected exams"


@admin.register(ExamSchedule)
class ExamScheduleAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "academic_session",
        "term",
        "start_date",
        "end_date",
        "is_active",
        "is_default",
        "is_current",
    ]
    list_filter = ["is_active", "is_default", "academic_session", "term"]
    search_fields = ["name", "academic_session__name", "term__name"]
    actions = ["set_as_default", "set_as_active"]

    fieldsets = (
        ("Basic Information", {"fields": ("name", "description")}),
        ("Academic Period", {"fields": ("academic_session", "term")}),
        ("Schedule Dates", {"fields": ("start_date", "end_date")}),
        (
            "Registration",
            {
                "fields": (
                    "registration_start",
                    "registration_end",
                    "results_publication_date",
                )
            },
        ),
        (
            "Settings",
            {"fields": ("is_active", "is_default", "allow_late_registration")},
        ),
    )

    def is_current(self, obj):
        return obj.is_current

    is_current.boolean = True
    is_current.short_description = "Current"

    def set_as_default(self, request, queryset):
        """Admin action to set selected schedule as default"""
        if queryset.count() != 1:
            self.message_user(
                request,
                "Please select exactly one schedule to set as default.",
                level="ERROR",
            )
            return

        with transaction.atomic():
            # Remove default from all schedules
            ExamSchedule.objects.update(is_default=False)

            # Set selected as default
            schedule = queryset.first()
            schedule.is_default = True
            schedule.save()

            self.message_user(
                request, f'Set "{schedule.name}" as default exam schedule.'
            )

    set_as_default.short_description = "Set as default exam schedule"

    def set_as_active(self, request, queryset):
        """Admin action to set selected schedules as active"""
        count = queryset.update(is_active=True)
        self.message_user(request, f"Set {count} exam schedule(s) as active.")

    set_as_active.short_description = "Set as active"


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "subject",
        "grade_level",
        "section",
        "exam_schedule",
        "exam_date",
        "start_time",
        "status",
    ]
    list_filter = [
        "exam_schedule",
        "subject",
        "grade_level",
        "exam_type",
        "status",
        "is_practical",
        "is_online",
    ]
    search_fields = ["title", "code", "subject__name"]

    fieldsets = (
        (
            "Basic Information",
            {"fields": ("title", "code", "description", "exam_schedule")},
        ),
        (
            "Academic Details",
            {
                "fields": (
                    "subject",
                    "grade_level",
                    "section",
                    "exam_type",
                    "difficulty_level",
                )
            },
        ),
        (
            "Scheduling",
            {"fields": ("exam_date", "start_time", "end_time", "duration_minutes")},
        ),
        ("Staff Assignment", {"fields": ("teacher", "invigilators")}),
        (
            "Exam Configuration",
            {"fields": ("total_marks", "pass_marks", "venue", "max_students")},
        ),
        (
            "Instructions",
            {"fields": ("instructions", "materials_allowed", "materials_provided")},
        ),
        ("Files", {"fields": ("questions_file", "answer_key")}),
        (
            "Settings",
            {"fields": ("status", "is_practical", "requires_computer", "is_online")},
        ),
    )

    readonly_fields = ["code"]

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        # Set default exam schedule in form
        if not obj:  # Creating new exam
            default_schedule = ExamSchedule.get_default()
            if default_schedule:
                form.base_fields["exam_schedule"].initial = default_schedule
        return form


# 4. Forms with default handling
from django import forms


class ExamForm(forms.ModelForm):
    class Meta:
        model = Exam
        fields = [
            "title",
            "description",
            "subject",
            "grade_level",
            "section",
            "exam_schedule",
            "exam_type",
            "exam_date",
            "start_time",
            "end_time",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Set default exam schedule for new exams
        if not self.instance.pk:
            default_schedule = ExamSchedule.get_default()
            if default_schedule:
                self.fields["exam_schedule"].initial = default_schedule

        # Make exam_schedule field more user-friendly
        self.fields["exam_schedule"].empty_label = "Select Exam Schedule"
        self.fields["exam_schedule"].queryset = ExamSchedule.objects.filter(
            is_active=True
        ).order_by("-is_default", "-start_date")


@admin.register(ExamRegistration)
class ExamRegistrationAdmin(admin.ModelAdmin):
    list_display = [
        "student_name",
        "exam_title",
        "exam_date",
        "registration_date",
        "is_registered",
        "is_present",
        "seat_number",
        "special_needs_indicator",
    ]
    list_filter = [
        "is_registered",
        "is_present",
        "has_special_needs",
        "exam__exam_date",
        "exam__subject",
        "registration_date",
    ]
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "student__user__email",  # If you want to search by email
        "student__student_class",  # Search by class (GRADE_1, NURSERY_1, etc.)
        "exam__title",
        "exam__subject__name",
    ]
    autocomplete_fields = ["exam", "student"]
    date_hierarchy = "registration_date"
    ordering = ["-registration_date"]

    fieldsets = (
        ("Registration Details", {"fields": ("exam", "student", "is_registered")}),
        ("Attendance", {"fields": ("is_present", "seat_number")}),
        (
            "Special Considerations",
            {
                "fields": (
                    "has_special_needs",
                    "special_needs_description",
                    "extra_time_minutes",
                )
            },
        ),
    )

    def student_name(self, obj):
        return obj.student.get_full_name()

    student_name.short_description = "Student"
    # Remove admin_order_field that might be causing issues
    # student_name.admin_order_field = "student__first_name"

    def exam_title(self, obj):
        return obj.exam.title

    exam_title.short_description = "Exam"
    exam_title.admin_order_field = "exam__title"

    def exam_date(self, obj):
        return obj.exam.exam_date

    exam_date.short_description = "Exam Date"
    exam_date.admin_order_field = "exam__exam_date"

    def special_needs_indicator(self, obj):
        if obj.has_special_needs:
            return format_html('<span style="color: orange;">✓ Special Needs</span>')
        return ""

    special_needs_indicator.short_description = "Special Needs"

    actions = [
        "mark_present",
        "mark_absent",
        "register_students",
        "unregister_students",
    ]

    def mark_present(self, request, queryset):
        updated = queryset.update(is_present=True)
        self.message_user(request, f"{updated} students marked as present.")

    mark_present.short_description = "Mark selected students as present"

    def mark_absent(self, request, queryset):
        updated = queryset.update(is_present=False)
        self.message_user(request, f"{updated} students marked as absent.")

    mark_absent.short_description = "Mark selected students as absent"

    def register_students(self, request, queryset):
        updated = queryset.update(is_registered=True)
        self.message_user(request, f"{updated} students registered successfully.")

    register_students.short_description = "Register selected students"

    def unregister_students(self, request, queryset):
        updated = queryset.update(is_registered=False)
        self.message_user(request, f"{updated} students unregistered.")

    unregister_students.short_description = "Unregister selected students"


@admin.register(ExamStatistics)
class ExamStatisticsAdmin(admin.ModelAdmin):
    list_display = [
        "exam_title",
        "total_registered",
        "total_appeared",
        "average_score",
        "pass_percentage_display",
        "calculated_at",
    ]
    list_filter = [
        "exam__exam_type",
        "exam__subject",
        "exam__grade_level",
        "calculated_at",
    ]
    search_fields = ["exam__title", "exam__subject__name"]
    readonly_fields = [
        "total_registered",
        "total_appeared",
        "total_absent",
        "highest_score",
        "lowest_score",
        "average_score",
        "median_score",
        "grade_a_count",
        "grade_b_count",
        "grade_c_count",
        "grade_d_count",
        "grade_e_count",
        "grade_f_count",
        "total_passed",
        "total_failed",
        "pass_percentage",
        "calculated_at",
    ]
    ordering = ["-calculated_at"]

    fieldsets = (
        ("Exam Information", {"fields": ("exam",)}),
        (
            "Participation Statistics",
            {"fields": ("total_registered", "total_appeared", "total_absent")},
        ),
        (
            "Score Statistics",
            {
                "fields": (
                    "highest_score",
                    "lowest_score",
                    "average_score",
                    "median_score",
                )
            },
        ),
        (
            "Grade Distribution",
            {
                "fields": (
                    ("grade_a_count", "grade_b_count"),
                    ("grade_c_count", "grade_d_count"),
                    ("grade_e_count", "grade_f_count"),
                )
            },
        ),
        (
            "Pass/Fail Analysis",
            {"fields": ("total_passed", "total_failed", "pass_percentage")},
        ),
        ("Last Updated", {"fields": ("calculated_at",)}),
    )

    def exam_title(self, obj):
        return obj.exam.title

    exam_title.short_description = "Exam"
    exam_title.admin_order_field = "exam__title"

    def pass_percentage_display(self, obj):
        if obj.pass_percentage:
            color = (
                "green"
                if obj.pass_percentage >= 75
                else "orange" if obj.pass_percentage >= 50 else "red"
            )
            return format_html(
                '<span style="color: {}; font-weight: bold;">{:.1f}%</span>',
                color,
                obj.pass_percentage,
            )
        return "N/A"

    pass_percentage_display.short_description = "Pass Rate"
    pass_percentage_display.admin_order_field = "pass_percentage"

    actions = ["recalculate_statistics", "export_statistics"]

    def recalculate_statistics(self, request, queryset):
        count = 0
        for stats in queryset:
            stats.calculate_statistics()
            count += 1
        self.message_user(request, f"Statistics recalculated for {count} exams.")

    recalculate_statistics.short_description = (
        "Recalculate statistics for selected exams"
    )

    def export_statistics(self, request, queryset):
        # This could be implemented to export statistics to CSV or Excel
        self.message_user(
            request,
            f"Export functionality for {queryset.count()} statistics records would be implemented here.",
        )

    export_statistics.short_description = "Export statistics for selected exams"

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("exam__subject")


# Additional customizations for better user experience
admin.site.site_header = "School Exam Management System"
admin.site.site_title = "Exam Admin"
admin.site.index_title = "Welcome to Exam Management"


# ============================================
# EXAM-003: NEW EXAM FEATURES ADMIN
# ============================================


@admin.register(QuestionBank)
class QuestionBankAdmin(admin.ModelAdmin):
    list_display = [
        "question_preview",
        "question_type",
        "subject",
        "grade_level",
        "difficulty",
        "marks",
        "is_shared",
        "usage_count",
        "created_by_name",
        "created_at",
    ]
    list_filter = [
        "question_type",
        "difficulty",
        "is_shared",
        "subject",
        "grade_level",
        "created_at",
    ]
    search_fields = [
        "question",
        "topic",
        "subtopic",
        "tags",
        "created_by__user__first_name",
        "created_by__user__last_name",
    ]
    readonly_fields = ["usage_count", "last_used", "created_at", "updated_at"]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]

    fieldsets = (
        (
            "Question Content",
            {
                "fields": (
                    "question_type",
                    "question",
                    "options",
                    "correct_answer",
                    "answer_guideline",
                    "expected_points",
                    "marks",
                )
            },
        ),
        (
            "Classification",
            {
                "fields": (
                    "subject",
                    "grade_level",
                    "topic",
                    "subtopic",
                    "difficulty",
                    "tags",
                )
            },
        ),
        ("Media", {"fields": ("images", "table_data"), "classes": ("collapse",)}),
        ("Sharing & Usage", {"fields": ("is_shared", "usage_count", "last_used")}),
        (
            "Metadata",
            {
                "fields": ("created_by", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    def question_preview(self, obj):
        import re

        # Strip HTML and limit to 80 chars
        clean_text = re.sub(r"<[^>]+>", "", obj.question)
        preview = clean_text[:80] + "..." if len(clean_text) > 80 else clean_text
        return format_html('<span title="{}">{}</span>', obj.question, preview)

    question_preview.short_description = "Question"

    def created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else "N/A"

    created_by_name.short_description = "Created By"
    created_by_name.admin_order_field = "created_by__user__first_name"

    actions = ["mark_as_shared", "mark_as_private"]

    def mark_as_shared(self, request, queryset):
        updated = queryset.update(is_shared=True)
        self.message_user(request, f"{updated} questions marked as shared.")

    mark_as_shared.short_description = "Mark selected as shared"

    def mark_as_private(self, request, queryset):
        updated = queryset.update(is_shared=False)
        self.message_user(request, f"{updated} questions marked as private.")

    mark_as_private.short_description = "Mark selected as private"


class ExamReviewerInline(admin.TabularInline):
    model = ExamReviewer
    extra = 0
    fields = ("reviewer", "decision", "reviewed_at")
    readonly_fields = ("assigned_at", "reviewed_at")


class ExamReviewCommentInline(admin.TabularInline):
    model = ExamReviewComment
    extra = 0
    fields = ("author", "comment", "question_index", "section", "is_resolved")
    readonly_fields = ("author", "created_at")


@admin.register(ExamTemplate)
class ExamTemplateAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "grade_level",
        "subject",
        "total_marks",
        "duration_display",
        "section_count",
        "is_shared",
        "usage_count",
        "created_by_name",
        "created_at",
    ]
    list_filter = [
        "grade_level",
        "subject",
        "is_shared",
        "created_at",
    ]
    search_fields = [
        "name",
        "description",
        "created_by__user__first_name",
        "created_by__user__last_name",
    ]
    readonly_fields = ["usage_count", "created_at", "updated_at"]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]

    fieldsets = (
        ("Basic Information", {"fields": ("name", "description")}),
        (
            "Academic Details",
            {"fields": ("grade_level", "subject", "total_marks", "duration_minutes")},
        ),
        ("Template Structure", {"fields": ("structure", "default_instructions")}),
        ("Sharing & Usage", {"fields": ("is_shared", "usage_count")}),
        (
            "Metadata",
            {
                "fields": ("created_by", "created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    def section_count(self, obj):
        if obj.structure and isinstance(obj.structure, dict):
            sections = obj.structure.get("sections", [])
            return len(sections)
        return 0

    section_count.short_description = "Sections"

    def duration_display(self, obj):
        if obj.duration_minutes:
            hours = obj.duration_minutes // 60
            minutes = obj.duration_minutes % 60
            if hours > 0:
                return f"{hours}h {minutes}m"
            return f"{minutes}m"
        return "N/A"

    duration_display.short_description = "Duration"

    def created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else "N/A"

    created_by_name.short_description = "Created By"
    created_by_name.admin_order_field = "created_by__user__first_name"

    actions = ["duplicate_templates", "mark_as_shared", "mark_as_private"]

    def duplicate_templates(self, request, queryset):
        count = 0
        for template in queryset:
            template.pk = None
            template.name = f"{template.name} (Copy)"
            template.usage_count = 0
            template.save()
            count += 1
        self.message_user(request, f"{count} templates duplicated successfully.")

    duplicate_templates.short_description = "Duplicate selected templates"

    def mark_as_shared(self, request, queryset):
        updated = queryset.update(is_shared=True)
        self.message_user(request, f"{updated} templates marked as shared.")

    mark_as_shared.short_description = "Mark selected as shared"

    def mark_as_private(self, request, queryset):
        updated = queryset.update(is_shared=False)
        self.message_user(request, f"{updated} templates marked as private.")

    mark_as_private.short_description = "Mark selected as private"


@admin.register(ExamReview)
class ExamReviewAdmin(admin.ModelAdmin):
    list_display = [
        "exam_title",
        "status",
        "submitted_by_name",
        "submitted_at",
        "approved_by_name",
        "reviewer_count",
        "comment_count",
        "created_at",
    ]
    list_filter = [
        "status",
        "submitted_at",
        "approved_at",
        "created_at",
    ]
    search_fields = [
        "exam__title",
        "exam__code",
        "submitted_by__user__first_name",
        "submitted_by__user__last_name",
        "submission_note",
    ]
    readonly_fields = [
        "submitted_at",
        "approved_at",
        "created_at",
        "updated_at",
    ]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]
    inlines = [ExamReviewerInline, ExamReviewCommentInline]

    fieldsets = (
        ("Review Information", {"fields": ("exam", "status")}),
        (
            "Submission Details",
            {"fields": ("submitted_by", "submitted_at", "submission_note")},
        ),
        (
            "Approval Details",
            {"fields": ("approved_by", "approved_at", "rejection_reason")},
        ),
        (
            "Metadata",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def exam_title(self, obj):
        return obj.exam.title

    exam_title.short_description = "Exam"
    exam_title.admin_order_field = "exam__title"

    def submitted_by_name(self, obj):
        return obj.submitted_by.get_full_name() if obj.submitted_by else "N/A"

    submitted_by_name.short_description = "Submitted By"
    submitted_by_name.admin_order_field = "submitted_by__user__first_name"

    def approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else "N/A"

    approved_by_name.short_description = "Approved By"

    def reviewer_count(self, obj):
        return obj.reviewers.count()

    reviewer_count.short_description = "Reviewers"

    def comment_count(self, obj):
        count = obj.comments.count()
        unresolved = obj.comments.filter(is_resolved=False).count()
        if unresolved > 0:
            return format_html(
                '<span>{} ({} unresolved)</span>', count, unresolved
            )
        return count

    comment_count.short_description = "Comments"

    actions = ["approve_reviews", "request_changes"]

    def approve_reviews(self, request, queryset):
        count = 0
        for review in queryset:
            if review.status in ["submitted", "in_review", "changes_requested"]:
                # Note: This is simplified - in production you'd need proper user context
                review.status = "approved"
                review.save()
                count += 1
        self.message_user(request, f"{count} reviews approved.")

    approve_reviews.short_description = "Approve selected reviews"

    def request_changes(self, request, queryset):
        updated = queryset.update(status="changes_requested")
        self.message_user(request, f"{updated} reviews marked as changes requested.")

    request_changes.short_description = "Request changes for selected reviews"


@admin.register(ExamReviewComment)
class ExamReviewCommentAdmin(admin.ModelAdmin):
    list_display = [
        "review_exam",
        "author_name",
        "comment_preview",
        "section",
        "question_index",
        "is_resolved",
        "created_at",
    ]
    list_filter = [
        "is_resolved",
        "section",
        "created_at",
    ]
    search_fields = [
        "review__exam__title",
        "author__user__first_name",
        "author__user__last_name",
        "comment",
    ]
    readonly_fields = [
        "resolved_at",
        "created_at",
        "updated_at",
    ]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]

    fieldsets = (
        ("Comment Details", {"fields": ("review", "author", "comment")}),
        ("Question Reference", {"fields": ("section", "question_index")}),
        ("Resolution", {"fields": ("is_resolved", "resolved_by", "resolved_at")}),
        (
            "Metadata",
            {"fields": ("created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def review_exam(self, obj):
        return obj.review.exam.title

    review_exam.short_description = "Exam"

    def author_name(self, obj):
        return obj.author.get_full_name() if obj.author else "N/A"

    author_name.short_description = "Author"

    def comment_preview(self, obj):
        preview = obj.comment[:100] + "..." if len(obj.comment) > 100 else obj.comment
        return format_html('<span title="{}">{}</span>', obj.comment, preview)

    comment_preview.short_description = "Comment"

    actions = ["mark_resolved", "mark_unresolved"]

    def mark_resolved(self, request, queryset):
        from django.utils import timezone

        updated = queryset.update(is_resolved=True, resolved_at=timezone.now())
        self.message_user(request, f"{updated} comments marked as resolved.")

    mark_resolved.short_description = "Mark selected as resolved"

    def mark_unresolved(self, request, queryset):
        updated = queryset.update(is_resolved=False, resolved_at=None, resolved_by=None)
        self.message_user(request, f"{updated} comments marked as unresolved.")

    mark_unresolved.short_description = "Mark selected as unresolved"
