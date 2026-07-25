"""
management/commands/diagnose_subject_rankings_v2.py

Read-only diagnostic for subject_position correctness — adapted for the
v2 schema (BaseResult / AssessmentComponent / tenant-scoped models).

RANKING CONVENTION (confirmed with the school): DENSE ranking.
  Example: scores 88, 84, 73, 73, 61 -> positions 1, 2, 3, 3, 4
  After a tie, the next distinct score does NOT skip position slots.

  In v2, this MUST be implemented with Django's DenseRank, not Rank:

      from django.db.models.functions import DenseRank
      ...
      Window(expression=DenseRank(), order_by=F("percentage").desc())

  If BaseResult.bulk_recalculate_positions (or any of the term/session
  report equivalents) is still using Rank() instead of DenseRank(), this
  diagnostic will show MISMATCH rows for every tie group, the same way
  the v1 diagnostic did before the convention was fixed there.

WHAT'S DIFFERENT FROM v1
-------------------------
  - Score field is now uniformly "percentage" for every result model
    (SeniorSecondaryResult, JuniorSecondaryResult, PrimaryResult,
    NurseryResult) via BaseResult — no more per-model SCORE_FIELD map.
  - student_class is now a ForeignKey (classroom.models.Class), not a
    CharField. This command resolves it by name via StudentClass lookup
    instead of comparing raw strings, so v1's "SS2A vs 'SS2 A'" class of
    bug can no longer happen the same way (a FK either matches the
    target or it doesn't — there's no silent string-casing split).
  - Every model is now TenantMixin-scoped. Pass --tenant-id if your
    environment does not auto-scope querysets via middleware/thread-local.

This command does NOT change any data.

Run with (single line on Windows cmd.exe):
    python manage.py diagnose_subject_rankings_v2 --exam-session-id=<id> --subject-name="Mathematics" --student-class="SS_1" --education-level=SENIOR_SECONDARY
    python manage.py diagnose_subject_rankings_v2 --exam-session-id=<id> --subject-name="Mathematics" --student-class="SS_1" --education-level=SENIOR_SECONDARY --tenant-id=<id>
"""

from django.core.management.base import BaseCommand, CommandError
from subject.models import Subject
from classroom.models import Class as StudentClass

from result.models import (
    SeniorSecondaryResult,
    JuniorSecondaryResult,
    PrimaryResult,
    NurseryResult,
    ExamSession,
)

MODEL_MAP = {
    "SENIOR_SECONDARY": SeniorSecondaryResult,
    "JUNIOR_SECONDARY": JuniorSecondaryResult,
    "PRIMARY": PrimaryResult,
    "NURSERY": NurseryResult,
}

# v2: uniform score field across every level via BaseResult.
SCORE_FIELD = "percentage"


def dense_positions(rows, score_field):
    """
    Confirmed school convention: DENSE ranking.
    Ties share a position; the next distinct score does not skip slots.
    Mirrors what BaseResult.bulk_recalculate_positions should produce
    when using DenseRank() (NOT Rank()).
    """
    ordered = sorted(rows, key=lambda r: getattr(
        r, score_field) or 0, reverse=True)
    positions = {}
    current_position = 0
    previous_score = object()
    for r in ordered:
        score = getattr(r, score_field) or 0
        if score != previous_score:
            current_position += 1
            previous_score = score
        positions[r.id] = current_position
    return positions


class Command(BaseCommand):
    help = "Read-only diagnostic for subject_position correctness (v2 schema, dense ranking)."

    def add_arguments(self, parser):
        parser.add_argument("--exam-session-id", required=True, type=str)
        parser.add_argument(
            "--subject-name",
            required=True,
            type=str,
            help="Matches Subject.name (case-insensitive, exact match).",
        )
        parser.add_argument(
            "--student-class",
            required=True,
            type=str,
            help="Matches classroom.Class.name (case-insensitive, exact match).",
        )
        parser.add_argument(
            "--education-level",
            required=False,
            choices=list(MODEL_MAP.keys()),
            help="Limit to one education level (matches EducationLevel.level_type). Omit to check all levels.",
        )
        parser.add_argument(
            "--tenant-id",
            required=False,
            type=str,
            help="Pass if your setup does not auto-scope querysets to the current tenant.",
        )

    def handle(self, *args, **options):
        exam_session_id = options["exam_session_id"]
        subject_name = options["subject_name"]
        student_class_name = options["student_class"]
        education_level_filter = options.get("education_level")
        tenant_id = options.get("tenant_id")

        tenant_kwargs = {"tenant_id": tenant_id} if tenant_id else {}

        try:
            exam_session = ExamSession.objects.filter(
                **tenant_kwargs).get(id=exam_session_id)
        except ExamSession.DoesNotExist:
            raise CommandError(f"ExamSession {exam_session_id} not found")

        levels = [education_level_filter] if education_level_filter else list(
            MODEL_MAP.keys())

        any_mismatch = False

        for education_level in levels:
            ResultModel = MODEL_MAP[education_level]

            self.stdout.write(self.style.NOTICE(
                f"\n{'#' * 70}\n# EDUCATION LEVEL: {education_level}\n{'#' * 70}"
            ))

            matching_subjects = Subject.objects.filter(
                **tenant_kwargs, name__iexact=subject_name)
            self.stdout.write(self.style.NOTICE(
                f"\n=== Subject lookup: '{subject_name}' ==="))
            if matching_subjects.count() > 1:
                self.stdout.write(
                    self.style.ERROR(
                        f"⚠️  FOUND {matching_subjects.count()} Subject rows with this name! "
                        "This alone can explain wrong rankings — each id is ranked separately."
                    )
                )
                for s in matching_subjects:
                    self.stdout.write(
                        f"    Subject id={s.id}  name={s.name!r}")
            elif matching_subjects.count() == 0:
                self.stdout.write(self.style.WARNING(
                    f"No Subject found matching name={subject_name!r} — skipping this level."
                ))
                continue
            else:
                self.stdout.write(
                    f"    OK — single Subject id={matching_subjects.first().id}")

            matching_classes = StudentClass.objects.filter(
                **tenant_kwargs,
                name__iexact=student_class_name,
                education_level__level_type=education_level,
            )
            if matching_classes.count() > 1:
                self.stdout.write(
                    self.style.ERROR(
                        f"⚠️  FOUND {matching_classes.count()} Class rows matching "
                        f"'{student_class_name}' at this level! Results may be split "
                        "across them the same way duplicate Subjects split rankings."
                    )
                )
                for c in matching_classes:
                    self.stdout.write(f"    Class id={c.id}  name={c.name!r}")
            elif matching_classes.count() == 0:
                self.stdout.write(self.style.WARNING(
                    f"No Class found matching name={student_class_name!r} at {education_level} — skipping."
                ))
                continue
            else:
                self.stdout.write(
                    f"    OK — single Class id={matching_classes.first().id}")

            all_rows = list(
                ResultModel.objects.filter(
                    **tenant_kwargs,
                    exam_session=exam_session,
                    subject__in=matching_subjects,
                    student__student_class__in=matching_classes,
                ).select_related("student")
            )

            if not all_rows:
                self.stdout.write(self.style.WARNING(
                    "\nNo results found for that exact combination."))
                continue

            approved_rows = [r for r in all_rows if r.status in (
                "APPROVED", "PUBLISHED")]
            correct_position = dense_positions(approved_rows, SCORE_FIELD)

            self.stdout.write(self.style.NOTICE(
                f"\n=== All {len(all_rows)} result rows "
                f"({len(approved_rows)} APPROVED/PUBLISHED, "
                f"{len(all_rows) - len(approved_rows)} DRAFT) ==="
            ))
            self.stdout.write(
                f"{'Student':30} {'Status':10} {'percentage':>12} {'current_pos':>12} {'correct_pos':>12}  note"
            )

            level_has_mismatch = False

            for r in sorted(all_rows, key=lambda r: getattr(r, SCORE_FIELD) or 0, reverse=True):
                score = getattr(r, SCORE_FIELD)
                current_pos = r.subject_position
                correct_pos = correct_position.get(r.id)

                if r.status not in ("APPROVED", "PUBLISHED"):
                    note = "EXCLUDED from repair (status not approved) — position is STALE"
                elif current_pos != correct_pos:
                    note = "MISMATCH — check bulk_recalculate_positions uses DenseRank(), not Rank()"
                    any_mismatch = True
                    level_has_mismatch = True
                else:
                    note = "ok"

                self.stdout.write(
                    f"{r.student.full_name[:30]:30} {r.status:10} {str(score):>12} "
                    f"{str(current_pos):>12} {str(correct_pos):>12}  {note}"
                )

            if not level_has_mismatch and approved_rows:
                self.stdout.write(self.style.SUCCESS(
                    f"\n[{education_level}] All positions correct (dense ranking)."))

        self.stdout.write(self.style.NOTICE(f"\n{'=' * 70}"))
        if any_mismatch:
            self.stdout.write(self.style.ERROR(
                "SUMMARY: MISMATCH rows found above. In v2 this almost always means "
                "bulk_recalculate_positions is still using Rank() instead of "
                "DenseRank() somewhere, OR the repair hasn't been run yet for this "
                "exam session/level."
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                "SUMMARY: no mismatches found."))
        self.stdout.write(self.style.NOTICE(f"{'=' * 70}"))
        self.stdout.write(self.style.SUCCESS("\nDone. No data was changed."))
