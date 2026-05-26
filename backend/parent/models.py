from django.db import models

from tenants.models import TenantMixin
from users.models import CustomUser
from students.models import Student
from common.models import AbstractBulkUploadRecord


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

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        if hasattr(self.sender, "tenant") and self.sender.tenant != self.tenant:
            errors["sender"] = "Sender does not belong to this tenant."
        if hasattr(self.recipient, "tenant") and self.recipient.tenant != self.tenant:
            errors["recipient"] = "Recipient does not belong to this tenant."
        if errors:
            raise ValidationError(errors)


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
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "student"],
                condition=models.Q(is_primary_contact=True),
                name="unique_primary_contact_per_student_per_tenant",
            )
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        if self.parent.tenant_id != self.tenant_id:
            errors["parent"] = "Parent profile belongs to a different tenant."
        if self.student.tenant_id != self.tenant_id:
            errors["student"] = "Student belongs to a different tenant."
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.parent} - {self.student} ({self.relationship})"


class ParentProfile(TenantMixin, models.Model):
    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="parent_profile",
        limit_choices_to={"role": "parent"},
    )
    phone = models.CharField(max_length=20, blank=True,
                             null=True, help_text="Parent's phone number")
    address = models.CharField(
        max_length=255, blank=True, null=True, help_text="Parent's address")
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
        unique_together = [("tenant", "user")]

    def clean(self):
        from django.core.exceptions import ValidationError
        if getattr(self.user, "tenant_id", None) != self.tenant_id:
            raise ValidationError(
                "The selected user does not belong to this tenant.")

    def get_students(self):
        """Always use this instead of .students.all() — ensures tenant scope."""
        return self.students.filter(tenant=self.tenant)

    def get_primary_contact_relationships(self):
        return self.parentstudentrelationship_set.filter(
            tenant=self.tenant, is_primary_contact=True
        )


class BulkUploadRecord(AbstractBulkUploadRecord):

    class Meta(AbstractBulkUploadRecord.Meta):
        verbose_name = "Parent Bulk Upload Record"
        verbose_name_plural = "Parent Bulk Upload Records"
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "uploaded_by"]),
        ]

    uploaded_by = models.ForeignKey(
        "users.CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="parent_bulk_uploads",    # ← concrete related_name here
    )
