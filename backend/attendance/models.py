from django.db import models
from django.db.models import UniqueConstraint

from tenants.models import TenantMixin
from students.models import Student
from teacher.models import Teacher
from classroom.models import Section


class Attendance(TenantMixin, models.Model):
    STATUS_CHOICES = [
        ("P", "Present"),
        ("A", "Absent"),
        ("L", "Late"),
        ("E", "Excused"),
    ]
    date = models.DateField()
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="attendances"
    )
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.CASCADE,
        related_name="attendances",
        null=True,
        blank=True,
    )
    section = models.ForeignKey(
        Section, on_delete=models.CASCADE, related_name="attendances"
    )
    status = models.CharField(max_length=1, choices=STATUS_CHOICES)
    time_in = models.TimeField(
        null=True, blank=True, help_text="Time when student arrived"
    )
    time_out = models.TimeField(
        null=True, blank=True, help_text="Time when student left"
    )

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["tenant", "date", "student", "section"],
                name="unique_attendance_per_student_section_date",
            )
        ]
        indexes = [
            models.Index(fields=["tenant", "date"]),
            models.Index(fields=["tenant", "teacher", "date"]),
            models.Index(fields=["tenant", "student", "date"]),
            models.Index(fields=["tenant", "date", "status"]),
            models.Index(fields=["tenant", "section", "date"]),
        ]

    def __str__(self):
        student = str(self.student) if self.student_id else "Unknown"
        return f"{student} - {self.date} - {self.get_status_display()}"
