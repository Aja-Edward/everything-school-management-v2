# students/admin.py
from django.contrib import admin
from django.utils.html import format_html
import secrets
import string
from .models import Student


def reset_student_passwords(modeladmin, request, queryset):
    for student in queryset:
        student_user = student.user
        student_password = "".join(
            secrets.choice(string.ascii_letters + string.digits) for _ in range(10)
        )
        student_user.set_password(student_password)
        student_user.save()
        modeladmin.message_user(
            request, f"Student {student_user.username} new password: {student_password}"
        )


reset_student_passwords.short_description = (
    "Reset and display credentials for selected students"
)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "get_full_name",
        "registration_number",
        "get_age",
        "gender",
        "get_education_level",  # ✅ use method, not property
        "student_class",
        "get_parent_contact",
        "admission_date",
    ]

    list_filter = [
        "student_class__education_level",  # ✅ traverse FK to filter by education level
        "gender",
        "student_class",
        "admission_date",
        ("date_of_birth", admin.DateFieldListFilter),
    ]

    search_fields = [
        "user__email",
        "user__first_name",
        "user__middle_name",
        "user__last_name",
        "registration_number",
        "parent_contact",
        "emergency_contact",
    ]

    date_hierarchy = "admission_date"

    # ✅ Order by FK fields, not the derived property
    ordering = [
        "student_class__education_level__order",
        "student_class__order",
        "user__first_name",
        "user__last_name",
    ]

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "user",
                    "gender",
                    "date_of_birth",
                    "profile_picture",
                    "profile_picture_preview",
                )
            },
        ),
        (
            "Academic Information",
            {
                "fields": (
                    "student_class",
                    "section",
                    "registration_number",
                    "admission_date",
                ),
                "description": "Academic level and class information",
            },
        ),
        (
            "Contact Information",
            {
                "fields": ("parent_contact", "emergency_contact"),
                "description": "Parent and emergency contact details",
            },
        ),
        (
            "Health & Special Requirements",
            {
                "fields": ("medical_conditions", "special_requirements"),
                "classes": ("collapse",),
                "description": "Medical conditions, allergies, and special educational needs",
            },
        ),
    )

    readonly_fields = ("admission_date", "profile_picture_preview")
    list_per_page = 25
    list_max_show_all = 100

    actions = [reset_student_passwords]

    # ─── Display methods ───────────────────────────────────────────────────────

    def get_full_name(self, obj):
        return obj.user.full_name

    get_full_name.short_description = "Full Name"
    get_full_name.admin_order_field = "user__first_name"

    def get_education_level(self, obj):
        """Show education level derived from student_class FK."""
        return obj.education_level_display

    get_education_level.short_description = "Education Level"
    get_education_level.admin_order_field = "student_class__education_level__order"

    def get_age(self, obj):
        age = obj.age
        if age <= 5:
            return format_html(
                '<span style="color: #28a745; font-weight: bold;">{} yrs</span>', age
            )
        elif age <= 12:
            return format_html(
                '<span style="color: #007bff; font-weight: bold;">{} yrs</span>', age
            )
        else:
            return format_html(
                '<span style="color: #6f42c1; font-weight: bold;">{} yrs</span>', age
            )

    get_age.short_description = "Age"
    get_age.admin_order_field = "date_of_birth"

    def profile_picture_preview(self, obj):
        if obj.profile_picture:
            return format_html(
                '<img src="{}" width="100" height="100" style="object-fit: cover;" />',
                obj.profile_picture,
            )
        return "No image uploaded"
    profile_picture_preview.short_description = "Profile Picture Preview"

    def get_parent_contact(self, obj):
        if obj.parent_contact:
            return format_html(
                '<a href="tel:{}" style="color: #007bff;">{}</a>',
                obj.parent_contact,
                obj.parent_contact,
            )
        return "-"

    get_parent_contact.short_description = "Parent Contact"
    get_parent_contact.admin_order_field = "parent_contact"

    # ─── Queryset ──────────────────────────────────────────────────────────────

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related(
                "user", "student_class", "student_class__education_level", "section"
            )
        )

    # ─── Form ─────────────────────────────────────────────────────────────────

    def get_form(self, request, obj=None, **kwargs):
        return super().get_form(request, obj, **kwargs)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)

    class Media:
        css = {"all": ("admin/css/custom_student_admin.css",)}
