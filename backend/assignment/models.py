from django.conf import settings
from django.db import models
from django.utils import timezone

from tenants.models import TenantMixin


class Assignment(TenantMixin, models.Model):
    """
    Work a teacher sets for a classroom. Parents of the classroom's enrolled
    students and the students themselves see it; nobody submits against it
    yet (submissions are a later step).
    """

    classroom = models.ForeignKey(
        "classroom.Classroom",
        on_delete=models.CASCADE,
        related_name="homework_assignments",
    )
    # Optional: a class teacher in Nursery/Primary may set work that is not
    # tied to one subject. A subject-only teacher must name the subject.
    subject = models.ForeignKey(
        "subject.Subject",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homework_assignments",
    )
    teacher = models.ForeignKey(
        "teacher.Teacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homework_assignments",
        help_text="Teacher who set the assignment",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True)
    due_date = models.DateField()

    # Stored on Cloudinary as a raw file, as bulk uploads are; the URL is
    # what parents and students open.
    attachment_url = models.URLField(max_length=500, blank=True)
    attachment_name = models.CharField(max_length=255, blank=True)
    attachment_public_id = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-due_date", "-created_at"]
        indexes = [
            models.Index(fields=["tenant", "classroom", "due_date"]),
            models.Index(fields=["tenant", "teacher"]),
        ]

    def save(self, *args, **kwargs):
        # Same hole ClassroomTeacherAssignment.save closes: a row saved
        # without a tenant is invisible to the school that owns it.
        if self.tenant_id is None and self.classroom_id:
            from classroom.models import Classroom

            self.tenant_id = (
                Classroom.objects.filter(pk=self.classroom_id)
                .values_list("tenant_id", flat=True)
                .first()
            )
        super().save(*args, **kwargs)

    @property
    def is_overdue(self):
        return self.due_date < timezone.localdate()

    def __str__(self):
        return f"{self.title} ({self.classroom})"
