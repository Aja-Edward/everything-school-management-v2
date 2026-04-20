# result/admin.py
from django.contrib import admin
from django.apps import apps

from classroom.models import Section
from .models import (
    AssessmentComponent,
    ComponentScore,
    ExamSession,
    Grade,
    GradingSystem,
    JuniorSecondaryResult,
    JuniorSecondaryTermReport,
    NurseryResult,
    NurseryTermReport,
    PrimaryResult,
    PrimaryTermReport,
    ScoringConfiguration,
    SeniorSecondaryResult,
    SeniorSecondaryTermReport,
)


# ── Grading System ────────────────────────────────────────────────────────────


class GradeInline(admin.TabularInline):
    model = Grade
    extra = 1


@admin.register(GradingSystem)
class GradingSystemAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "grading_type",
        "min_score",
        "max_score",
        "pass_mark",
        "is_active",
    ]
    list_filter = ["grading_type", "is_active"]
    search_fields = ["name", "description"]
    inlines = [GradeInline]
    ordering = ["name"]


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ["grade", "min_score", "max_score", "grading_system", "is_passing"]
    list_filter = ["grading_system", "is_passing"]
    search_fields = ["grade", "description"]
    ordering = ["grading_system", "-min_score"]


# ── Assessment Component ──────────────────────────────────────────────────────


@admin.register(AssessmentComponent)
class AssessmentComponentAdmin(admin.ModelAdmin):
    """
    The primary place for school admins to configure which assessment
    components exist for each education level (e.g. First Test, Exam).
    """

    list_display = [
        "name",
        "code",
        "education_level",
        "component_type",
        "max_score",
        "contributes_to_ca",
        "display_order",
        "is_active",
    ]
    list_filter = [
        "education_level",
        "component_type",
        "contributes_to_ca",
        "is_active",
    ]
    search_fields = ["name", "code"]
    ordering = ["education_level", "display_order", "name"]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("education_level")


@admin.register(ScoringConfiguration)
class ScoringConfigurationAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "education_level",
        "result_type",
        "total_max_score",
        "is_active",
        "is_default",
    ]
    list_filter = ["education_level", "result_type", "is_active", "is_default"]
    search_fields = ["name", "description"]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("education_level")


# ── Component Score ───────────────────────────────────────────────────────────


@admin.register(ComponentScore)
class ComponentScoreAdmin(admin.ModelAdmin):
    """
    Read-only in practice — scores are created via the API.
    Admin registration allows inspection and manual correction if needed.
    """

    list_display = ["component", "score", "result_label", "created_via"]
    list_filter = ["component__education_level", "component"]
    search_fields = ["component__name"]
    readonly_fields = [
        "senior_result",
        "junior_result",
        "primary_result",
        "nursery_result",
        "component",
        "score",
    ]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related(
                "component",
                "component__education_level",
                "senior_result",
                "junior_result",
                "primary_result",
                "nursery_result",
            )
        )

    @admin.display(description="Result")
    def result_label(self, obj):
        for fk in (
            "senior_result",
            "junior_result",
            "primary_result",
            "nursery_result",
        ):
            result = getattr(obj, fk, None)
            if result:
                return str(result)
        return "—"

    @admin.display(description="Level")
    def created_via(self, obj):
        if obj.senior_result_id:
            return "Senior Secondary"
        if obj.junior_result_id:
            return "Junior Secondary"
        if obj.primary_result_id:
            return "Primary"
        if obj.nursery_result_id:
            return "Nursery"
        return "—"

    def has_add_permission(self, request):
        # Scores are created via the API — block accidental manual creation
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


# ── Exam Session ──────────────────────────────────────────────────────────────


@admin.register(ExamSession)
class ExamSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "term_name", "academic_session", "is_active")
    list_filter = ("is_active", "is_published", "academic_session")
    search_fields = ("name", "term__term_type__name", "academic_session__name")

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("academic_session", "term", "term__term_type")
        )

    @admin.display(description="Term")
    def term_name(self, obj):
        return obj.term.name if obj.term else "—"


# ── Shared teacher helper ─────────────────────────────────────────────────────


def _get_teacher(user):
    try:
        Teacher = apps.get_model("teacher", "Teacher")
        return Teacher.objects.get(user=user)
    except Exception:
        return None


def _teacher_education_levels(teacher):
    return list(
        Section.objects.filter(class_teacher=teacher, is_active=True)
        .values_list("class_grade__education_level__level_type", flat=True)
        .distinct()
    )


# ── Base Result Admin ─────────────────────────────────────────────────────────


class ComponentScoreInline(admin.TabularInline):
    """
    Inline on result admin pages so individual component scores are
    visible (read-only) without navigating to ComponentScore directly.
    """

    model = ComponentScore
    extra = 0
    readonly_fields = ["component", "score"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class BaseResultAdmin(admin.ModelAdmin):
    # total_score is a derived DecimalField on BaseResult — safe to display.
    # NurseryResultAdmin overrides this with mark_obtained / percentage.
    list_display = [
        "id",
        "student",
        "subject",
        "exam_session",
        "total_score",
        "percentage",
        "grade",
        "status",
        "created_at",
    ]
    list_filter = ["exam_session", "subject", "grade", "status", "is_passed"]
    search_fields = [
        "student__user__username",
        "student__user__first_name",
        "student__user__last_name",
        "subject__name",
    ]
    readonly_fields = [
        # Derived fields — never edited directly
        "total_score",
        "ca_total",
        "percentage",
        "grade",
        "grade_point",
        "is_passed",
        "class_average",
        "highest_in_class",
        "lowest_in_class",
        "subject_position",
        # Audit fields
        "created_at",
        "updated_at",
        "entered_by",
        "approved_by",
        "approved_date",
        "published_by",
        "published_date",
        "last_edited_by",
        "last_edited_at",
    ]
    inlines = [ComponentScoreInline]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user

        if user.is_superuser or getattr(user, "role", None) == "superadmin":
            return qs
        if getattr(user, "role", None) == "principal":
            return qs
        if getattr(user, "role", None) == "teacher":
            teacher = _get_teacher(user)
            if not teacher:
                return qs.none()
            levels = _teacher_education_levels(teacher)
            if not levels:
                return qs.none()
            return qs.filter(
                student__student_class__education_level__level_type__in=levels
            )
        if getattr(user, "role", None) == "student":
            return qs.filter(student__user=user)

        return qs.none()

    def has_view_permission(self, request, obj=None):
        role = getattr(request.user, "role", None)
        if request.user.is_superuser or role == "superadmin":
            return True
        return super().has_view_permission(request, obj)

    def has_change_permission(self, request, obj=None):
        role = getattr(request.user, "role", None)
        if request.user.is_superuser or role == "superadmin":
            return True
        return role in ("principal", "teacher")

    def has_delete_permission(self, request, obj=None):
        role = getattr(request.user, "role", None)
        if request.user.is_superuser or role == "superadmin":
            return True
        return role == "principal"

    def has_add_permission(self, request):
        role = getattr(request.user, "role", None)
        if request.user.is_superuser or role == "superadmin":
            return True
        return role in ("principal", "teacher")

    def save_model(self, request, obj, form, change):
        if not change:
            obj.entered_by = request.user
        else:
            obj.last_edited_by = request.user
        super().save_model(request, obj, form, change)


# ── Result model registrations ────────────────────────────────────────────────


@admin.register(SeniorSecondaryResult)
class SeniorSecondaryResultAdmin(BaseResultAdmin):
    pass


@admin.register(JuniorSecondaryResult)
class JuniorSecondaryResultAdmin(BaseResultAdmin):
    pass


@admin.register(PrimaryResult)
class PrimaryResultAdmin(BaseResultAdmin):
    pass


@admin.register(NurseryResult)
class NurseryResultAdmin(BaseResultAdmin):
    # NurseryResult uses mark_obtained/max_marks_obtainable instead of
    # component scores. No ComponentScoreInline needed by default, though
    # schools that configure nursery components will see them via the inline.
    list_display = [
        "id",
        "student",
        "subject",
        "exam_session",
        "mark_obtained",
        "max_marks_obtainable",
        "percentage",
        "grade",
        "status",
        "created_at",
    ]
    readonly_fields = [
        "percentage",
        "grade",
        "grade_point",
        "is_passed",
        "subject_position",
        "created_at",
        "updated_at",
        "entered_by",
        "approved_by",
        "approved_date",
        "published_by",
        "published_date",
        "last_edited_by",
        "last_edited_at",
    ]


# ── Base Term Report Admin ────────────────────────────────────────────────────


class BaseTermReportAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "student",
        "exam_session",
        "average_score",
        "overall_grade",
        "class_position",
        "status",
        "is_published",
        "created_at",
    ]
    list_filter = ["exam_session", "status", "is_published"]
    search_fields = [
        "student__user__username",
        "student__user__first_name",
        "student__user__last_name",
        "student__registration_number",
    ]
    readonly_fields = [
        "total_score",
        "average_score",
        "overall_grade",
        "class_position",
        "total_students",
        "created_at",
        "updated_at",
    ]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user

        if user.is_superuser or getattr(user, "role", None) == "superadmin":
            return qs
        if getattr(user, "role", None) == "principal":
            return qs
        if getattr(user, "role", None) == "teacher":
            teacher = _get_teacher(user)
            if not teacher:
                return qs.none()
            levels = _teacher_education_levels(teacher)
            if not levels:
                return qs.none()
            return qs.filter(
                student__student_class__education_level__level_type__in=levels
            )
        if getattr(user, "role", None) == "student":
            return qs.filter(student__user=user)

        return qs.none()

    def has_change_permission(self, request, obj=None):
        role = getattr(request.user, "role", None)
        if request.user.is_superuser or role == "superadmin":
            return True
        return role == "principal"

    def has_delete_permission(self, request, obj=None):
        role = getattr(request.user, "role", None)
        if request.user.is_superuser or role == "superadmin":
            return True
        return role == "principal"


# ── Term Report model registrations ──────────────────────────────────────────


@admin.register(SeniorSecondaryTermReport)
class SeniorSecondaryTermReportAdmin(BaseTermReportAdmin):
    pass


@admin.register(JuniorSecondaryTermReport)
class JuniorSecondaryTermReportAdmin(BaseTermReportAdmin):
    pass


@admin.register(PrimaryTermReport)
class PrimaryTermReportAdmin(BaseTermReportAdmin):
    pass


@admin.register(NurseryTermReport)
class NurseryTermReportAdmin(BaseTermReportAdmin):
    list_display = [
        "id",
        "student",
        "exam_session",
        "total_marks_obtained",
        "overall_percentage",
        "class_position",
        "status",
        "is_published",
        "created_at",
    ]
    readonly_fields = [
        "total_subjects",
        "total_max_marks",
        "total_marks_obtained",
        "overall_percentage",
        "class_position",
        "total_students_in_class",
        "created_at",
        "updated_at",
    ]
