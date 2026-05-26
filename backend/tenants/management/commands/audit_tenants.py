from django.core.management.base import BaseCommand
from tenants.models import Tenant
from users.models import CustomUser
from teacher.models import Teacher
from students.models import Student
from classroom.models import Class


class Command(BaseCommand):
    help = "Audit tenant data counts (parents, teachers, students, classes)"

    def handle(self, *args, **kwargs):
        self.stdout.write("\n===== TENANT DATA AUDIT =====\n")

        for tenant in Tenant.objects.all():
            self.stdout.write(f"\n==============================")
            self.stdout.write(f"TENANT: {tenant.name}")
            self.stdout.write(f"ID: {tenant.id}")

            parents = CustomUser.objects.filter(
                tenant=tenant,
                role="parent"
            ).count()

            teachers = Teacher.objects.filter(
                tenant=tenant
            ).count()

            students = Student.objects.filter(
                tenant=tenant
            ).count()

            classes = Class.objects.filter(
                tenant=tenant
            ).count()

            self.stdout.write(f"PARENTS: {parents}")
            self.stdout.write(f"TEACHERS: {teachers}")
            self.stdout.write(f"STUDENTS: {students}")
            self.stdout.write(f"CLASSES: {classes}")

        self.stdout.write("\n===== DONE =====\n")
