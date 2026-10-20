from django.conf import settings
from django.db import models

from tenants.models import TenantMixin


class NotificationKind(models.TextChoices):
    ASSIGNMENT_SET = "assignment_set", "New assignment"
    ASSIGNMENT_HANDED_IN = "assignment_handed_in", "Assignment handed in"
    ASSIGNMENT_MARKED = "assignment_marked", "Assignment marked"
    ANNOUNCEMENT = "announcement", "Announcement"
    GATE_SCAN = "gate_scan", "Arrival or departure"


class Notification(TenantMixin, models.Model):
    """
    One line in one person's bell: something that happened that they should
    know about. Stored, never sent; email and SMS have their own paths.
    """

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="inbox_notifications",
    )
    kind = models.CharField(max_length=30, choices=NotificationKind.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    # A path in the web app to open when it is clicked, e.g. "/parent/dashboard".
    link = models.CharField(max_length=255, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["tenant", "recipient", "-created_at"]),
            models.Index(fields=["recipient", "read_at"]),
        ]

    def __str__(self):
        return f"{self.recipient} – {self.title}"
