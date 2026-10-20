from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["title", "recipient", "kind", "created_at", "read_at", "tenant"]
    list_filter = ["kind", "tenant"]
    search_fields = ["title", "recipient__username", "recipient__email"]
    raw_id_fields = ["recipient"]
