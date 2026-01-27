from django.db import models

from tenants.models import TenantMixin
from classroom.models import Section
from subject.models import Subject
from teacher.models import Teacher


# Create your models here.
class Timetable(TenantMixin, models.Model):
    DAY_CHOICES = [
        ("Monday", "Monday"),
        ("Tuesday", "Tuesday"),
        ("Wednesday", "Wednesday"),
        ("Thursday", "Thursday"),
        ("Friday", "Friday"),
    ]

    section = models.ForeignKey(Section, on_delete=models.CASCADE)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE)
    day = models.CharField(max_length=10, choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        unique_together = [("tenant", "section", "day", "start_time")]
        ordering = ["day", "start_time"]

    def __str__(self):
        return f"{self.section} | {self.subject.name} | {self.day} {self.start_time}-{self.end_time}"
