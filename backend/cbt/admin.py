from django.contrib import admin

from .models import CBTAnswer, CBTAttempt, CBTEvent, CBTPaper, CBTQuestion


class CBTQuestionInline(admin.TabularInline):
    model = CBTQuestion
    extra = 0
    can_delete = False
    fields = ("order", "section", "kind", "marks", "correct_option")
    readonly_fields = fields
    show_change_link = True


@admin.register(CBTPaper)
class CBTPaperAdmin(admin.ModelAdmin):
    list_display = ("exam", "tenant", "status", "opens_at", "closes_at", "duration_minutes", "published_at")
    list_filter = ("status", "tenant")
    search_fields = ("exam__title", "exam__code")
    raw_id_fields = ("exam", "published_by")
    readonly_fields = ("sections", "instructions", "published_at", "published_by", "created_at", "updated_at")
    inlines = [CBTQuestionInline]


@admin.register(CBTQuestion)
class CBTQuestionAdmin(admin.ModelAdmin):
    list_display = ("paper", "order", "section", "kind", "marks")
    list_filter = ("kind",)
    raw_id_fields = ("paper",)


class CBTEventInline(admin.TabularInline):
    model = CBTEvent
    extra = 0
    can_delete = False
    fields = ("recorded_at", "kind", "detail", "actor", "ip_address")
    readonly_fields = fields


@admin.register(CBTAttempt)
class CBTAttemptAdmin(admin.ModelAdmin):
    list_display = ("student", "paper", "number", "status", "started_at", "deadline", "total_score")
    list_filter = ("status", "tenant")
    search_fields = ("paper__exam__title", "student__user__first_name", "student__user__last_name")
    raw_id_fields = ("paper", "student", "registration")
    readonly_fields = ("question_ids", "option_order", "created_at", "updated_at")
    inlines = [CBTEventInline]


@admin.register(CBTAnswer)
class CBTAnswerAdmin(admin.ModelAdmin):
    list_display = ("attempt", "question", "selected_option", "is_correct", "marks_awarded", "flagged")
    raw_id_fields = ("attempt", "question", "marked_by")
