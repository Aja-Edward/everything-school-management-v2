"""
Move students transferred before 23 Oct 2026 into the class their teachers
see them in.

Those transfers moved the enrollment only, so the student's own page, the
parent page and their results still name the old class. Dry run by default:

    manage.py repair_transferred_students                       # every school
    manage.py repair_transferred_students --tenant kebi-international-academy
    manage.py repair_transferred_students --tenant <slug> --apply

It also re-enrols students who are in no classroom at all although their
record names a class and section. Saving a student moved the old way used to
end their enrollment and then fail to create the new one.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from classroom.student_placement import (
    enroll,
    find_left_behind_transfers,
    find_unenrolled,
    student_fields_for_classroom,
)
from students.models import Student
from tenants.models import Tenant


def describe(student):
    if not student.student_class_id:
        return "no class"
    section = f" {student.section.name}" if student.section_id else ""
    return f"{student.student_class.name}{section}"


class Command(BaseCommand):
    help = (
        "Move students whose transfer only moved their enrollment into the "
        "class and section of that enrollment. Dry run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant", action="append", default=[],
            help="School slug; repeat for several. Default: every school.")
        parser.add_argument(
            "--apply", action="store_true",
            help="Make the changes. Without it nothing is written.")

    def handle(self, *args, **options):
        tenants = Tenant.objects.all().order_by("name")
        if options["tenant"]:
            tenants = tenants.filter(slug__in=options["tenant"])
            missing = set(options["tenant"]) - set(tenants.values_list("slug", flat=True))
            if missing:
                raise CommandError(f"No school with slug: {', '.join(sorted(missing))}")

        apply = options["apply"]
        total_fixed = total_unclear = total_enrolled = 0
        for tenant in tenants:
            students = Student.objects.filter(tenant=tenant).select_related(
                "user", "student_class", "section", "stream")
            repairable, unclear = find_left_behind_transfers(students)
            unenrolled = find_unenrolled(students)
            if not repairable and not unclear and not unenrolled:
                continue

            self.stdout.write(f"\n{tenant.name} ({tenant.slug})")
            with transaction.atomic():
                for student, enrollment in repairable:
                    fields = student_fields_for_classroom(student, enrollment.classroom)
                    target = enrollment.classroom.section
                    self.stdout.write(
                        f"  {'moved' if apply else 'would move'} {student.full_name} (id {student.id}): "
                        f"{describe(student)} -> {target.class_grade.name} {target.name}")
                    if apply:
                        # update() rather than save(): the post_save signal
                        # would pick its own classroom for the section.
                        Student.objects.filter(pk=student.pk).update(**fields)
                for student, classroom in unenrolled:
                    self.stdout.write(
                        f"  {'re-enrolled' if apply else 'would re-enrol'} {student.full_name} "
                        f"(id {student.id}), {describe(student)}, in no class -> {classroom.name}")
                    if apply:
                        enroll(student, classroom)
            for student, active in unclear:
                rooms = ", ".join(e.classroom.name for e in active) or "none"
                self.stdout.write(
                    f"  left alone, check by hand: {student.full_name} (id {student.id}) "
                    f"is {describe(student)} but enrolled in: {rooms}")
            total_fixed += len(repairable)
            total_unclear += len(unclear)
            total_enrolled += len(unenrolled)

        verb = "Moved" if apply else "Would move"
        self.stdout.write(
            f"\n{verb} {total_fixed} student(s); {total_unclear} disagree in a way "
            f"this command doesn't guess at.")
        verb = "Re-enrolled" if apply else "Would re-enrol"
        self.stdout.write(
            f"{verb} {total_enrolled} student(s) who were in no class."
            + ("" if apply else " Dry run: nothing written."))
