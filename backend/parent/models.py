from django.db import models

from tenants.models import TenantMixin
from users.models import CustomUser
from students.models import Student


class Message(TenantMixin, models.Model):
    sender = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="sent_messages"
    )
    recipient = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="received_messages"
    )
    subject = models.CharField(max_length=255)
    content = models.TextField()
    sent_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    def __str__(self):
        return f"From {self.sender} to {self.recipient}: {self.subject}"


class ParentStudentRelationship(TenantMixin, models.Model):
    parent = models.ForeignKey('ParentProfile', on_delete=models.CASCADE)
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE)
    relationship = models.CharField(max_length=20, choices=[
        ("Father", "Father"),
        ("Mother", "Mother"),
        ("Guardian", "Guardian"),
        ("Sponsor", "Sponsor"),
    ])
    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        unique_together = [('tenant', 'parent', 'student')]

    def __str__(self):
        return f"{self.parent} - {self.student} ({self.relationship})"


class ParentProfile(TenantMixin, models.Model):
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="parent_profile",
        limit_choices_to={"role": "parent"},
    )
    phone = models.CharField(max_length=20, blank=True, null=True, help_text="Parent's phone number")
    address = models.CharField(max_length=255, blank=True, null=True, help_text="Parent's address")
    students = models.ManyToManyField(
        'students.Student',
        through='ParentStudentRelationship',
        related_name="parents",
        help_text="Students linked to this parent"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return getattr(self.user, "full_name", str(self.user))

    class Meta:
        verbose_name = "Parent Profile"
        verbose_name_plural = "Parent Profiles"


class BulkUploadRecord(TenantMixin, models.Model):
    """
    Tracks state and results of a single bulk parent upload job.
    Created immediately when the file is accepted; updated by the Celery task.
    """

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
        related_name="parent_bulk_uploads",
    )
    original_filename = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)  # absolute path on server
    file_ext = models.CharField(max_length=10)  # '.csv' | '.xlsx'

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    imported_rows = models.IntegerField(default=0)
    failed_rows = models.IntegerField(default=0)

    # Full result JSON: { imported: [...], errors: [...], summary: {...} }
    result_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Bulk Upload Record"
        verbose_name_plural = "Bulk Upload Records"
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "uploaded_by"]),
        ]

    def __str__(self):
        return f"Bulk Upload {self.id} — {self.status} ({self.imported_rows}/{self.total_rows})"

    @property
    def progress_percent(self):
        if not self.total_rows:
            return 0
        return round((self.processed_rows / self.total_rows) * 100)

    @property
    def is_done(self):
        return self.status in ("completed", "failed")
