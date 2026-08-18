"""
Explain why a teacher sees no students / classes / subjects.

Teacher visibility depends on a chain of rows, and a break anywhere in it
produces the same silent symptom -- empty lists, no error:

    User -> Teacher -> ClassroomTeacherAssignment -> Classroom -> enrolled Students

The most common break is a NULL tenant_id. TenantMixin declares tenant as
null=True, and TenantFilterMixin filters with .filter(tenant=tenant), which
excludes NULL rows entirely. A row with no tenant is invisible to every
school, including the one it belongs to.

Read-only. Reports counts, not fixes.

    python manage.py diagnose_teacher_access --slug kebi-international-academy
    python manage.py diagnose_teacher_access --slug kebi-international-academy --username TCH/KIA/001
"""

from django.core.management.base import BaseCommand
from django.db.models import Q

from tenants.models import Tenant


class Command(BaseCommand):
    help = "Diagnose why teachers cannot see their assigned students, classes or subjects."

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True,
                            help="Tenant slug to inspect.")
        parser.add_argument(
            "--username", help="Drill into one teacher by username.")
        parser.add_argument("--limit", type=int, default=5,
                            help="How many teachers to detail (default 5).")

    def handle(self, *args, **opts):
        from classroom.models import Classroom, ClassroomTeacherAssignment
        from students.models import Student
        from teacher.models import Teacher

        w = self.stdout.write
        try:
            tenant = Tenant.objects.get(slug=opts["slug"])
        except Tenant.DoesNotExist:
            w(self.style.ERROR(f"No tenant with slug '{opts['slug']}'."))
            return

        w("")
        w("=" * 74)
        w(f"  TEACHER ACCESS DIAGNOSTIC -- {tenant.name} ({tenant.slug})")
        w("=" * 74)

        # ── NULL tenant audit ────────────────────────────────────────────────
        # These rows are invisible to every tenant, which is the usual cause.
        w("")
        w("  NULL tenant_id audit (invisible to ALL schools):")
        checks = [
            ("Teacher", Teacher),
            ("ClassroomTeacherAssignment", ClassroomTeacherAssignment),
            ("Classroom", Classroom),
            ("Student", Student),
        ]
        any_null = False
        for label, model in checks:
            try:
                total = model.objects.count()
                nulls = model.objects.filter(tenant__isnull=True).count()
                mine = model.objects.filter(tenant=tenant).count()
            except Exception as exc:
                w(f"    {label:<28} error: {exc}")
                continue
            flag = self.style.ERROR(
                f"{nulls} NULL") if nulls else self.style.SUCCESS("0 NULL")
            any_null = any_null or bool(nulls)
            w(f"    {label:<28} {mine} for this tenant, {total} total, {flag}")

        if any_null:
            w("")
            w(self.style.ERROR(
                "    NULL tenant rows exist. These are excluded by "
                "TenantFilterMixin"))
            w(self.style.ERROR(
                "    and are the most likely reason teachers see nothing."))

        # ── Assignment health ────────────────────────────────────────────────
        assignments = ClassroomTeacherAssignment.objects.filter(tenant=tenant)
        inactive = assignments.filter(is_active=False).count()
        w("")
        w("  Teacher assignments for this tenant:")
        w(f"    total   : {assignments.count()}")
        w(f"    inactive: {inactive}  (is_active=False rows are filtered out)")

        # ── Per-teacher detail, mirroring the app's own lookups ──────────────
        teachers = Teacher.objects.filter(tenant=tenant).select_related("user")
        if opts["username"]:
            teachers = teachers.filter(user__username=opts["username"])
        teachers = list(teachers[: opts["limit"]])

        w("")
        w(f"  Per-teacher visibility ({len(teachers)} shown):")
        if not teachers:
            w(self.style.ERROR(
                "    No Teacher rows for this tenant. If teachers exist but "
                "have NULL"))
            w(self.style.ERROR(
                "    tenant_id, that is the bug -- see the audit above."))
            return

        for t in teachers:
            uname = getattr(t.user, "username", "?") if t.user_id else "NO USER"
            w("")
            w(f"    {uname}  (Teacher id={t.id})")

            # Same query the Classroom filter uses in utils/section_filtering.py
            try:
                classes = (
                    Classroom.objects.filter(tenant=tenant)
                    .filter(Q(class_teacher=t) | Q(classroomteacherassignment__teacher=t))
                    .distinct()
                )
                n_classes = classes.count()
            except Exception as exc:
                n_classes, classes = f"error: {exc}", None

            # Same query the Student filter uses.
            try:
                students = (
                    Student.objects.filter(tenant=tenant)
                    .filter(enrolled_classes__classroomteacherassignment__teacher=t)
                    .distinct()
                )
                n_students = students.count()
            except Exception as exc:
                n_students = f"error: {exc}"

            my_assignments = assignments.filter(teacher=t)
            n_assign = my_assignments.count()
            n_active = my_assignments.filter(is_active=True).count()
            subjects = (
                my_assignments.filter(is_active=True)
                # .order_by() clears Meta.ordering. Without it Django adds the
                # ordering columns to the SELECT, so DISTINCT applies to
                # (classroom, subject, name) and the same subject name comes
                # back once per classroom.
                .order_by()
                .values_list("subject__name", flat=True)
                .distinct()
            )

            style = self.style.ERROR if n_assign == 0 else self.style.SUCCESS
            w(f"      assignments : {style(str(n_assign))} ({n_active} active)")
            w(f"      classrooms  : {n_classes}")
            w(f"      students    : {n_students}")
            w(f"      subjects    : {', '.join(s for s in subjects if s) or '(none)'}")

            if n_assign == 0:
                w(self.style.ERROR(
                    "      -> no assignments for this tenant. Either none exist, "
                    "or they carry a NULL/other tenant_id."))
            elif n_active == 0:
                w(self.style.ERROR(
                    "      -> assignments exist but all are is_active=False."))
