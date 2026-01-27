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
