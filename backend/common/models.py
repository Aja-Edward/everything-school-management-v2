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

    # How long a record may sit without any progress before the polling
    # endpoint declares it dead.  Every processed row bumps updated_at, so
    # this only trips when nothing is working on the record at all.
    STALL_TIMEOUT_SECONDS = 5 * 60

    def mark_failed_if_stalled(self):
        """
        Fail a record that has stopped making progress.

        A job whose worker never picked it up (or died mid-run) would
        otherwise stay on "pending"/"processing" forever, and the frontend
        polls a non-terminal status indefinitely.  Returns True when the
        record was failed by this call.
        """
        from django.utils import timezone

        if self.is_done:
            return False

        idle_seconds = (timezone.now() - self.updated_at).total_seconds()
        if idle_seconds < self.STALL_TIMEOUT_SECONDS:
            return False

        self.status = "failed"
        self.result_data = {
            "error": (
                "Processing stopped responding. The background worker did not "
                "pick up this upload — check that the Celery worker is running, "
                "then try again."
            )
        }
        self.save(update_fields=["status", "result_data", "updated_at"])
        return True
