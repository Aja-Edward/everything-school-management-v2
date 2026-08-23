# subject/management/commands/link_subject_grade_levels.py
"""
Populate Subject.grade_levels from the deprecated Subject.education_levels JSON.

Subjects carry their level tagging in a JSON field marked deprecated, while
every current filter path reads the grade_levels M2M. Where that M2M is empty,
filtering by education level or grade level silently returns nothing.

This walks the legacy tags and links each subject to the matching grade levels.
It is additive and idempotent — existing links are left alone, so it is safe to
re-run after adding grade levels.
"""

import json
import re

from django.core.management.base import BaseCommand, CommandError

# Schools seed level identifiers inconsistently: the legacy JSON uses
# JUNIOR_SECONDARY/SENIOR_SECONDARY while EducationLevel rows are often seeded
# as JSS/SSS. Treat these as the same level.
LEVEL_ALIASES = {
    "NURSERY": {"NURSERY", "NUR", "PRE NURSERY", "PRENURSERY"},
    "PRIMARY": {"PRIMARY", "PRI"},
    "JUNIOR SECONDARY": {"JUNIOR SECONDARY", "JSS", "JS", "JHS"},
    "SENIOR SECONDARY": {"SENIOR SECONDARY", "SSS", "SS", "SHS"},
}


def normalise(value):
    """Upper-case and collapse separators so 'senior_secondary' == 'Senior Secondary'."""
    return re.sub(r"[\s_\-]+", " ", str(value or "").strip().upper())


def alias_set(token):
    """Every spelling that should be considered the same level as `token`."""
    key = normalise(token)
    for canonical, aliases in LEVEL_ALIASES.items():
        if key == canonical or key in aliases:
            return {canonical} | aliases
    return {key} if key else set()


def level_identities(education_level):
    """The spellings an EducationLevel row answers to."""
    return {
        normalise(education_level.level_type),
        normalise(education_level.code),
        normalise(education_level.name),
    } - {""}


def parse_legacy_tags(raw):
    """The legacy field may hold a JSON list, a JSON string, or a bare string."""
    if not raw:
        return []
    if isinstance(raw, (list, tuple)):
        return [str(v) for v in raw if v]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            # Not valid JSON (e.g. "['PRIMARY', 'JSS']" with single quotes) —
            # fall back to splitting and stripping list/quote punctuation.
            parts = (part.strip(" []'\"") for part in re.split(r"[,;]", raw))
            return [part for part in parts if part]
        return parse_legacy_tags(parsed)
    return []


class Command(BaseCommand):
    help = "Link subjects to grade levels using their deprecated education_levels tags."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", help="Tenant slug. Omit with --all-tenants.")
        parser.add_argument(
            "--all-tenants", action="store_true", help="Process every tenant."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )

    def handle(self, *args, **options):
        from classroom.models import GradeLevel
        from subject.models import Subject
        from tenants.models import Tenant

        slug = options.get("tenant")
        if not slug and not options.get("all_tenants"):
            raise CommandError("Pass --tenant <slug> or --all-tenants.")

        tenants = (
            Tenant.objects.all() if options.get("all_tenants")
            else Tenant.objects.filter(slug=slug)
        )
        if not tenants.exists():
            raise CommandError(f"No tenant matches '{slug}'.")

        dry_run = options.get("dry_run")

        for tenant in tenants:
            self.stdout.write(f"\n=== {tenant.name} ({tenant.slug}) ===")

            # Map each level to its grade levels once, rather than per subject.
            grade_levels_by_level = {}
            for grade_level in GradeLevel.objects.filter(
                tenant=tenant, is_active=True
            ).select_related("education_level"):
                grade_levels_by_level.setdefault(
                    grade_level.education_level_id, []
                ).append(grade_level)

            levels = {
                lvl.id: (lvl, level_identities(lvl))
                for lvl in {
                    gl.education_level
                    for gls in grade_levels_by_level.values()
                    for gl in gls
                }
            }
            if not levels:
                self.stdout.write(
                    self.style.WARNING("  No active grade levels — nothing to link to.")
                )
                continue

            linked = untagged = unresolved = 0
            unmatched_tags = set()

            for subject in Subject.objects.filter(tenant=tenant).prefetch_related(
                "grade_levels"
            ):
                tags = parse_legacy_tags(subject.education_levels)
                if not tags:
                    untagged += 1
                    continue

                targets = []
                matched_any = False
                for tag in tags:
                    wanted = alias_set(tag)
                    hit = False
                    for level_id, (_lvl, identities) in levels.items():
                        if identities & wanted:
                            targets.extend(grade_levels_by_level.get(level_id, []))
                            hit = True
                    if hit:
                        matched_any = True
                    else:
                        unmatched_tags.add(normalise(tag))

                if not matched_any:
                    unresolved += 1
                    continue

                existing = set(subject.grade_levels.values_list("id", flat=True))
                new = [gl for gl in targets if gl.id not in existing]
                if not new:
                    continue

                if not dry_run:
                    subject.grade_levels.add(*new)
                linked += 1
                self.stdout.write(
                    f"  {subject.name}: +{len(new)} grade levels "
                    f"({', '.join(sorted({gl.name for gl in new}))})"
                )

            verb = "would link" if dry_run else "linked"
            self.stdout.write(
                self.style.SUCCESS(f"  {verb} {linked} subjects")
            )
            if untagged:
                self.stdout.write(f"  {untagged} subjects had no legacy tags")
            if unresolved:
                self.stdout.write(
                    self.style.WARNING(
                        f"  {unresolved} subjects had tags matching no education level"
                    )
                )
            if unmatched_tags:
                self.stdout.write(
                    self.style.WARNING(
                        f"  unmatched tags: {', '.join(sorted(unmatched_tags))}"
                    )
                )
