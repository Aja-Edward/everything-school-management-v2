# exam/management/commands/seed_exam_defaults.py
"""
Seed the exam lookup tables a school needs before anyone can create an exam.

ExamType, DifficultyLevel and ExamStatus back the dropdowns on the exam form
and the exam lifecycle actions. Nothing has ever populated them: tenant
provisioning seeds result.ExamType, which is a different model on a different
table, so exam.ExamType and its siblings start empty for every school. The
dropdowns render blank and status transitions fail to resolve a status.

The status codes here are the ones exam/views.py actually looks up — start,
end, cancel and postpone resolve 'in_progress', 'completed', 'cancelled' and
'postponed' by code, and the approval flow checks 'pending_approval', 'draft'
and 'rejected'. Renaming a code will break those actions.

Idempotent: everything is keyed on (tenant, code), so re-running only fills
gaps and never overwrites a school's own edits.
"""

from django.core.management.base import BaseCommand, CommandError

EXAM_TYPES = [
    {"name": "Quiz", "code": "quiz", "default_weight": 5, "display_order": 1},
    {"name": "Class Test", "code": "test", "default_weight": 10, "display_order": 2},
    {"name": "Assignment", "code": "assignment", "default_weight": 10, "display_order": 3},
    {"name": "Mid-Term Examination", "code": "mid_term", "default_weight": 30, "display_order": 4},
    {"name": "Final Examination", "code": "final_exam", "default_weight": 60, "display_order": 5},
    {"name": "Practical", "code": "practical", "default_weight": 20, "display_order": 6},
    {"name": "Oral", "code": "oral", "default_weight": 10, "display_order": 7},
]

DIFFICULTY_LEVELS = [
    {"name": "Easy", "code": "easy", "color_code": "#4CAF50", "display_order": 1},
    {"name": "Medium", "code": "medium", "color_code": "#FF9800", "display_order": 2},
    {"name": "Hard", "code": "hard", "color_code": "#F44336", "display_order": 3},
    {"name": "Mixed", "code": "mixed", "color_code": "#9C27B0", "display_order": 4},
]

# is_initial marks where a new exam starts; allows_editing controls whether the
# questions can still be changed; is_final closes the exam out.
EXAM_STATUSES = [
    {"name": "Draft", "code": "draft", "is_initial": True, "allows_editing": True,
     "color_code": "#9E9E9E", "display_order": 1},
    {"name": "Pending Approval", "code": "pending_approval", "allows_editing": False,
     "color_code": "#FF9800", "display_order": 2},
    {"name": "Approved", "code": "approved", "allows_editing": False,
     "color_code": "#4CAF50", "display_order": 3},
    {"name": "Rejected", "code": "rejected", "allows_editing": True,
     "color_code": "#F44336", "display_order": 4},
    {"name": "Scheduled", "code": "scheduled", "allows_editing": False,
     "color_code": "#2196F3", "display_order": 5},
    {"name": "In Progress", "code": "in_progress", "allows_editing": False,
     "color_code": "#00BCD4", "display_order": 6},
    {"name": "Completed", "code": "completed", "is_final": True, "allows_editing": False,
     "color_code": "#607D8B", "display_order": 7},
    {"name": "Cancelled", "code": "cancelled", "is_final": True, "allows_editing": False,
     "color_code": "#795548", "display_order": 8},
    {"name": "Postponed", "code": "postponed", "allows_editing": True,
     "color_code": "#FFC107", "display_order": 9},
]


class Command(BaseCommand):
    help = "Seed exam types, difficulty levels and exam statuses for one or all tenants."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", help="Tenant slug. Omit with --all-tenants.")
        parser.add_argument(
            "--all-tenants", action="store_true", help="Process every tenant."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created without writing.",
        )

    def handle(self, *args, **options):
        from exam.models import DifficultyLevel, ExamStatus, ExamType
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
            for model, rows, label in (
                (ExamType, EXAM_TYPES, "exam types"),
                (DifficultyLevel, DIFFICULTY_LEVELS, "difficulty levels"),
                (ExamStatus, EXAM_STATUSES, "exam statuses"),
            ):
                created = existing = 0
                for row in rows:
                    defaults = {k: v for k, v in row.items() if k != "code"}
                    if model.objects.filter(tenant=tenant, code=row["code"]).exists():
                        existing += 1
                        continue
                    if not dry_run:
                        model.objects.create(
                            tenant=tenant, code=row["code"], **defaults
                        )
                    created += 1

                verb = "would create" if dry_run else "created"
                self.stdout.write(
                    f"  {label}: {verb} {created}, {existing} already present"
                )
