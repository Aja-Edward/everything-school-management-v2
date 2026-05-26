from django.db import models
from tenants.models import TenantMixin


class AbstractBulkUploadRecord(TenantMixin, models.Model):

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    )

    uploaded_by = models.ForeignKey(
        "users.CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",   # ← "+" disables reverse relation — each subclass defines its own
    )
    original_filename = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)
    file_ext = models.CharField(max_length=10)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending")

    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    imported_rows = models.IntegerField(default=0)
    failed_rows = models.IntegerField(default=0)

    result_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True                      # ← critical — no DB table created for this
        ordering = ["-created_at"]

    def __str__(self):
        return f"Bulk Upload {self.id} — {self.status} ({self.imported_rows}/{self.total_rows})"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.uploaded_by_id and self.tenant_id:
            if getattr(self.uploaded_by, "tenant_id", None) != self.tenant_id:
                raise ValidationError(
                    {"uploaded_by": "Uploader does not belong to this tenant."}
                )

    @property
    def progress_percent(self):
        if not self.total_rows:
            return 0
        return round((self.processed_rows / self.total_rows) * 100)

    @property
    def is_done(self):
        return self.status in ("completed", "failed")
