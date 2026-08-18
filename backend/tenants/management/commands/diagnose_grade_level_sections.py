"""
Explain why grade levels show "(not ready)" on the Academic settings tab.

Sections hang off Class, not off GradeLevel:

    EducationLevel -> GradeLevel
                          |
                          v  (Class.grade_level, nullable)
                        Class -> Section   (Section.class_grade)

AcademicGradeLevelTab labels a grade level "(not ready)" when no Class row
points at it:

    linkedClasses.find(c => c.grade_level === gradeLevelId)

Class.grade_level is null=True, so a school can have Class rows that exist but
are not linked to any grade level -- and seed_grade_levels creates GradeLevel
rows only, never the companion Class. Either case produces the same label and
blocks section creation.

Read-only.

    python manage.py diagnose_grade_level_sections --slug gods-treasure-schools
"""

from django.core.management.base import BaseCommand

from tenants.models import Tenant


class Command(BaseCommand):
    help = 'Diagnose grade levels showing "(not ready)" and blocked section creation.'

    def add_arguments(self, parser):
        parser.add_argument("--slug", required=True, help="Tenant slug.")

    def handle(self, *args, **opts):
        from classroom.models import Class, GradeLevel, Section

        w = self.stdout.write

        try:
            tenant = Tenant.objects.get(slug=opts["slug"])
        except Tenant.DoesNotExist:
            w(self.style.ERROR(f"No tenant with slug '{opts['slug']}'."))
            return

        grade_levels = list(
            GradeLevel.objects.filter(tenant=tenant)
            .select_related("education_level")
            .order_by("education_level__name", "order")
        )
        classes = list(
            Class.objects.filter(tenant=tenant).select_related("grade_level")
        )
        sections = list(Section.objects.filter(tenant=tenant))

        by_grade_level = {}
        unlinked = []
        for c in classes:
            if c.grade_level_id:
                by_grade_level.setdefault(c.grade_level_id, []).append(c)
            else:
                unlinked.append(c)

        sections_by_class = {}
        for s in sections:
            sections_by_class.setdefault(s.class_grade_id, []).append(s)

        w("")
        w("=" * 74)
        w(f"  GRADE LEVEL / SECTION READINESS -- {tenant.name}")
        w("=" * 74)
        w(f"  GradeLevels: {len(grade_levels)}   Classes: {len(classes)}   "
          f"Sections: {len(sections)}")

        w("")
        w("  Per grade level (\"not ready\" = no Class points at it):")
        not_ready = []
        for gl in grade_levels:
            linked = by_grade_level.get(gl.id, [])
            if linked:
                n_sections = sum(
                    len(sections_by_class.get(c.id, [])) for c in linked)
                names = ", ".join(c.name for c in linked)
                w(f"    {self.style.SUCCESS('ready    ')} {gl.name:<22} "
                  f"-> Class: {names} ({n_sections} section(s))")
            else:
                not_ready.append(gl)
                w(f"    {self.style.ERROR('NOT READY')} {gl.name:<22} "
                  f"-> no Class links to this grade level")

        if unlinked:
            w("")
            w(self.style.WARNING(
                f"  {len(unlinked)} Class row(s) exist but have grade_level = NULL:"))
            for c in unlinked[:20]:
                el = getattr(c, "education_level_id", None)
                w(f"      id={c.id:<5} name={c.name!r:<24} education_level_id={el}")
            w("      These are invisible to the tab, which matches on grade_level.")

        w("")
        w("-" * 74)
        if not not_ready:
            w(self.style.SUCCESS("  Every grade level has a Class. Sections can be created."))
        else:
            w(self.style.ERROR(
                f"  {len(not_ready)} grade level(s) have no Class, so sections "
                f"cannot be created for them."))
            if unlinked:
                w("  Classes DO exist but are not linked -- set their grade_level")
                w("  rather than creating duplicates.")
            else:
                w("  No Class rows reference these at all. seed_grade_levels")
                w("  creates GradeLevel rows only; the Class has to be created")
                w("  too, from the Classes screen or by an onboarding step.")
