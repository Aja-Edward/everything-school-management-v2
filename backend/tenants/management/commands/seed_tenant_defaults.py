# tenants/management/commands/seed_tenant_defaults.py

from django.core.management.base import BaseCommand
from django.db import transaction

from tenants.models import Tenant
from academics.utils import seed_default_term_types
from classroom.services.grade_level_service import seed_grade_levels
from academics.services.education_level_service import seed_education_levels
from tenants.signals import _seed_exam_types, _seed_assessment_components
from django.db import connection


class Command(BaseCommand):
    help = (
        "Seed all defaults (GradeLevel → EducationLevel → TermTypes → "
        "ExamTypes → AssessmentComponents) for all active tenants. "
        "Safe to run repeatedly — uses get_or_create throughout."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--slug',
            type=str,
            default=None,
            help='Seed only this tenant slug. Omit to seed ALL active tenants.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would be seeded without writing anything.',
        )
        parser.add_argument(
            '--step',
            type=str,
            default=None,
            choices=['grades', 'levels', 'terms', 'exam-types', 'components'],
            help='Run only one seeding step (useful for partial backfills).',
        )

    def handle(self, *args, **options):
        slug = options['slug']
        dry_run = options['dry_run']
        step = options['step']

        qs = (
            Tenant.objects.filter(slug=slug, is_active=True)
            if slug
            else Tenant.objects.filter(is_active=True)
        )

        if not qs.exists():
            self.stderr.write(self.style.ERROR(
                f"No active tenants found"
                f"{f' with slug={slug}' if slug else ''}."
            ))
            return

        self.stdout.write(f"\nSeeding {qs.count()} tenant(s)…\n")

        for tenant in qs:
            self.stdout.write(f"  → {tenant.name} ({tenant.slug})")

            if dry_run:
                self.stdout.write("    [dry-run] no writes performed\n")
                continue

            # Acquire an advisory lock per-tenant to avoid concurrent seeding/race conditions
            def _try_acquire_lock(tid):
                try:
                    with connection.cursor() as cur:
                        cur.execute("SELECT pg_try_advisory_lock(%s)", [tid])
                        return cur.fetchone()[0]
                except Exception:
                    return False

            def _release_lock(tid):
                try:
                    with connection.cursor() as cur:
                        cur.execute("SELECT pg_advisory_unlock(%s)", [tid])
                        return cur.fetchone()[0]
                except Exception:
                    return False

            if not _try_acquire_lock(tenant.id):
                self.stdout.write(
                    f"    ⏭ Seeding already in progress for {tenant.slug} — skipping\n")
                continue

            try:
                with transaction.atomic():
                    if not step or step == 'grades':
                        seed_grade_levels(tenant)
                        self.stdout.write("    ✓ grade levels")

                    if not step or step == 'levels':
                        seed_education_levels(tenant)
                        self.stdout.write("    ✓ education levels")

                    if not step or step == 'terms':
                        seed_default_term_types(tenant)
                        self.stdout.write("    ✓ term types")

                    if not step or step == 'exam-types':
                        _seed_exam_types(tenant)
                        self.stdout.write("    ✓ exam types")

                    if not step or step == 'components':
                        _seed_assessment_components(tenant)
                        self.stdout.write("    ✓ assessment components")

                self.stdout.write(
                    self.style.SUCCESS(f"    ✅ Done\n")
                )
            except Exception as e:
                self.stderr.write(
                    self.style.ERROR(f"    ❌ Failed: {e}\n")
                )
            finally:
                _release_lock(tenant.id)
