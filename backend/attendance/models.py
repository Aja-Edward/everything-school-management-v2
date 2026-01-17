from django.db import models


from students.models import Student
from teacher.models import Teacher
from classroom.models import Section


class Attendance(models.Model):
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
        Teacher, on_delete=models.CASCADE, related_name="attendances", null=True, blank=True
    )
    section = models.ForeignKey(
        Section, on_delete=models.CASCADE, related_name="attendances"
    )
    status = models.CharField(max_length=1, choices=STATUS_CHOICES)
    time_in = models.TimeField(null=True, blank=True, help_text="Time when student/teacher arrived")
    time_out = models.TimeField(null=True, blank=True, help_text="Time when student/teacher left")

    class Meta:
        unique_together = ("date", "student", "section")
        indexes = [
            models.Index(fields=["date"]),  # For date-based queries
            models.Index(fields=["teacher", "date"]),  # For teacher dashboard
            models.Index(fields=["student", "date"]),  # For student queries
            models.Index(fields=["date", "status"]),  # For attendance reports
            models.Index(fields=["section", "date"]),  # For section queries
        ]

    def __str__(self):
        return f"{self.student} - {self.date} - {self.get_status_display()}"
