"""
Explain why a student's Academics tab is empty.

Students do not see every result recorded for them. _apply_role_filter in
result/views.py restricts subject results to status=PUBLISHED:

    queryset.filter(student=student, status=PUBLISHED)

Term reports are NOT status-filtered (_apply_report_role_filter), so a report
can load while every result inside it stays hidden. The usual cause of an
empty Academics tab is therefore results sitting in DRAFT or APPROVED that
were never published, not missing data.

Read-only. Reports counts by status so you can see exactly what the student
is allowed to load.

    python manage.py diagnose_student_results --username STU/KIA/JUN/26/KIAN047
    python manage.py diagnose_student_results --student-id 47
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Show a student's results grouped by status, and what they can actually see."

    def add_arguments(self, parser):
        parser.add_argument("--username", help="The student's login username.")
        parser.add_argument("--student-id", type=int,
                            help="Student primary key.")

    def handle(self, *args, **opts):
        from students.models import Student
        from result.models import (
            JuniorSecondaryResult,
            JuniorSecondaryTermReport,
            NurseryResult,
            NurseryTermReport,
            PrimaryResult,
            PrimaryTermReport,
            SeniorSecondaryResult,
            SeniorSecondaryTermReport,
        )

        w = self.stdout.write

        if not opts["username"] and not opts["student_id"]:
            w(self.style.ERROR("Pass --username or --student-id."))
            return

        qs = Student.objects.select_related("user", "tenant", "student_class")
        student = (
            qs.filter(user__username=opts["username"]).first()
            if opts["username"]
            else qs.filter(pk=opts["student_id"]).first()
        )
        if not student:
            w(self.style.ERROR("No student matched."))
            return

        name = getattr(student.user, "get_full_name", lambda: "")() or getattr(
            student.user, "username", "?")

        w("")
        w("=" * 72)
        w("  STUDENT RESULT VISIBILITY")
        w("=" * 72)
        w(f"  Student : {name} (id={student.pk})")
        w(f"  Tenant  : {getattr(student.tenant, 'slug', None)}")
        w(f"  Class   : {getattr(student.student_class, 'name', None)}")
        w(f"  Level   : {student.education_level}")

        pairs = [
            ("Nursery", NurseryResult, NurseryTermReport),
            ("Primary", PrimaryResult, PrimaryTermReport),
            ("Junior Secondary", JuniorSecondaryResult, JuniorSecondaryTermReport),
            ("Senior Secondary", SeniorSecondaryResult, SeniorSecondaryTermReport),
        ]

        grand_total = 0
        grand_published = 0

        w("")
        w("  Subject results by status (student sees PUBLISHED only):")
        for label, result_model, _report_model in pairs:
            rows = result_model.objects.filter(student=student)
            total = rows.count()
            if total == 0:
                continue
            grand_total += total

            counts = {}
            for status in ("DRAFT", "APPROVED", "PUBLISHED"):
                counts[status] = rows.filter(status=status).count()
            other = total - sum(counts.values())
            grand_published += counts["PUBLISHED"]

            visible = counts["PUBLISHED"]
            style = self.style.SUCCESS if visible else self.style.ERROR
            badge = style(f"{visible:>5}")
            w("")
            w(f"    {label}: {total} result(s)")
            w(f"      DRAFT     {counts['DRAFT']:>5}   (hidden from student)")
            w(f"      APPROVED  {counts['APPROVED']:>5}   (hidden from student)")
            w(f"      PUBLISHED {badge}   (VISIBLE)")
            if other:
                w(f"      other     {other:>5}   (unrecognised status)")

        if grand_total == 0:
            w("")
            w(self.style.ERROR(
                "    No result rows exist for this student at any level."))
            w("    The Academics tab is empty because nothing was recorded,")
            w("    not because of visibility rules.")

        w("")
        w("  Term reports (NOT status-filtered -- students see all of theirs):")
        for label, _result_model, report_model in pairs:
            reports = report_model.objects.filter(student=student)
            n = reports.count()
            if n:
                published = reports.filter(is_published=True).count()
                w(f"    {label}: {n} report(s), {published} marked is_published")

        w("")
        w("-" * 72)
        if grand_total and grand_published == 0:
            w(self.style.ERROR(
                f"  {grand_total} result(s) recorded, 0 PUBLISHED."))
            w("  This is the cause: results stay hidden until they are published.")
            w("  Publish them from the admin/teacher results screen, or via the")
            w("  bulk-publish action on the term report.")
        elif grand_published:
            w(self.style.SUCCESS(
                f"  {grand_published} of {grand_total} result(s) are PUBLISHED "
                f"and should appear."))
            w("  If the tab is still empty, the problem is not visibility --")
            w("  check the exam session the tab is querying.")
