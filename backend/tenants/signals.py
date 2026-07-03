# tenants/signals.py

import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction, IntegrityError, connection

from tenants.models import Tenant
from academics.utils import seed_default_term_types
from classroom.services.grade_level_service import seed_grade_levels
from academics.services.education_level_service import seed_education_levels
from integrations.services import provision_subdomain
logger = logging.getLogger(__name__)


@receiver(post_save, sender=Tenant)
def seed_all_tenant_defaults(sender, instance, created, **kwargs):
    """
    Single receiver that seeds ALL defaults for a new tenant in the
    correct dependency order:

        GradeLevel → EducationLevel → TermTypes → ExamTypes → AssessmentComponents

    Wrapped in a single transaction so a failure in any step rolls
    everything back and leaves no half-seeded tenant.
    """
    if not created:
        return

    # Prevent concurrent seeding for the same tenant using a Postgres advisory lock.
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

    if not _try_acquire_lock(instance.id):
        logger.info(f"[{instance.slug}] Seeding already in progress by another process — skipping.")
        return

    try:
        with transaction.atomic():
            # ── 1. Grade levels (no dependencies) ────────────────────────────
            seed_grade_levels(instance)
            logger.info(f"[{instance.slug}] ✅ Grade levels seeded")

            # ── 2. Education levels (depends on grade levels) ─────────────────
            seed_education_levels(instance)
            logger.info(f"[{instance.slug}] ✅ Education levels seeded")

            # ── 3. Term types (depends on nothing, but logically after levels) ─
            seed_default_term_types(instance)
            logger.info(f"[{instance.slug}] ✅ Term types seeded")

            # ── 4. Exam types (depends on tenant only) ────────────────────────
            _seed_exam_types(instance)
            logger.info(f"[{instance.slug}] ✅ Exam types seeded")

            # ── 5. Assessment components (depends on education levels) ─────────
            _seed_assessment_components(instance)
            logger.info(f"[{instance.slug}] ✅ Assessment components seeded")

    except Exception as e:
        logger.error(
            f"[{instance.slug}] ❌ Seeding failed: {e}",
            exc_info=True,
        )
        raise  # re-raise so the transaction rolls back cleanly
    finally:
        _release_lock(instance.id)


@receiver(post_save, sender=Tenant)
def provision_tenant_subdomain(sender, instance, created, **kwargs):
    if created:
        provision_subdomain(instance)
# ── Seeder functions (also used by the management command) ────────────────────


EXAM_TYPE_DEFAULTS = [
    {"name": "First Term Examination",  "code": "FTE",
        "category": "EXAM",      "display_order": 1},
    {"name": "Second Term Examination", "code": "STE",
        "category": "EXAM",      "display_order": 2},
    {"name": "Third Term Examination",  "code": "TTE",
        "category": "EXAM",      "display_order": 3},
    {"name": "Continuous Assessment",   "code": "CA",
        "category": "CA",        "display_order": 4},
    {"name": "Mock Examination",        "code": "MOCK",
        "category": "EXAM",      "display_order": 5},
    {"name": "Practical Assessment",    "code": "PRAC",
        "category": "PRACTICAL", "display_order": 6},
]

COMPONENT_DEFAULTS = {
    "NURSERY": [
        {
            "name": "Class Work", "code": "CW", "component_type": "CA",
            "max_score": "100", "contributes_to_ca": True,
            "show_in_printed_report": True, "display_order": 1,
        },
    ],
    "PRIMARY": [
        {
            "name": "1st CA Test", "code": "CA1", "component_type": "CA",
            "max_score": "20", "contributes_to_ca": True,
            "show_in_printed_report": True, "display_order": 1,
        },
        {
            "name": "2nd CA Test", "code": "CA2", "component_type": "CA",
            "max_score": "20", "contributes_to_ca": True,
            "show_in_printed_report": True, "display_order": 2,
        },
        {
            "name": "Exam", "code": "EXAM", "component_type": "EXAM",
            "max_score": "60", "contributes_to_ca": False,
            "show_in_printed_report": True, "display_order": 3,
        },
    ],
    "JUNIOR_SECONDARY": [
        {
            "name": "1st CA Test", "code": "CA1", "component_type": "CA",
            "max_score": "20", "contributes_to_ca": True,
            "show_in_printed_report": True, "display_order": 1,
        },
        {
            "name": "2nd CA Test", "code": "CA2", "component_type": "CA",
            "max_score": "20", "contributes_to_ca": True,
            "show_in_printed_report": True, "display_order": 2,
        },
        {
            "name": "Exam", "code": "EXAM", "component_type": "EXAM",
            "max_score": "60", "contributes_to_ca": False,
            "show_in_printed_report": True, "display_order": 3,
        },
    ],
    "SENIOR_SECONDARY": [
        {
            "name": "1st CA Test", "code": "CA1", "component_type": "CA",
            "max_score": "20", "contributes_to_ca": True,
            "show_in_printed_report": True, "display_order": 1,
        },
        {
            "name": "2nd CA Test", "code": "CA2", "component_type": "CA",
            "max_score": "20", "contributes_to_ca": True,
            "show_in_printed_report": True, "display_order": 2,
        },
        {
            "name": "Exam", "code": "EXAM", "component_type": "EXAM",
            "max_score": "60", "contributes_to_ca": False,
            "show_in_printed_report": True, "display_order": 3,
        },
    ],
}


def _seed_exam_types(tenant):
    from result.models import ExamType

    existing_codes = set(
        ExamType.objects.filter(tenant=tenant).values_list("code", flat=True)
    )

    for d in EXAM_TYPE_DEFAULTS:
        # Skip if this exam type already exists for this tenant
        if d["code"] in existing_codes:
            logger.debug(
                f"[{tenant.slug}] ExamType '{d['code']}' already exists — skipping."
            )
            continue

        try:
            obj, created = ExamType.objects.get_or_create(
                tenant=tenant,
                code=d["code"],
                defaults={**d, "is_active": True},
            )
            if created:
                logger.info(
                    f"[{tenant.slug}] ✅ Created exam type: {obj.code}"
                )
        except IntegrityError:
            # Handle race condition where another process created the row
            logger.warning(
                f"[{tenant.slug}] IntegrityError creating ExamType '{d['code']}', fetching existing."
            )
            obj = ExamType.objects.filter(tenant=tenant, code=d["code"]).first()


def _seed_assessment_components(tenant):
    from academics.models import EducationLevel
    from result.models import AssessmentComponent

    levels = EducationLevel.objects.filter(tenant=tenant, is_active=True)

    if not levels.exists():
        logger.warning(
            f"[{tenant.slug}] No EducationLevel rows found — "
            "assessment components not seeded. "
            "Ensure seed_education_levels ran first."
        )
        return

    for level in levels:
        templates = COMPONENT_DEFAULTS.get(level.level_type, [])
        existing_codes = set(
            AssessmentComponent.objects.filter(
                tenant=tenant, education_level=level
            ).values_list("code", flat=True)
        )
        # Also gather normalized existing names to avoid creating near-duplicates
        def _normalize(s):
            return "".join(ch for ch in (s or "").lower() if ch.isalnum())

        existing_names_norm = set(
            _normalize(n) for n in AssessmentComponent.objects.filter(
                tenant=tenant, education_level=level
            ).values_list("name", flat=True)
        )

        for t in templates:
            # Skip this component if it already exists for this level
            if t["code"] in existing_codes or _normalize(t.get("name")) in existing_names_norm:
                logger.debug(
                    f"[{tenant.slug}] {level.level_type} already has component "
                    f"'{t['code']}' — skipping."
                )
                continue
            try:
                obj, created = AssessmentComponent.objects.get_or_create(
                    tenant=tenant,
                    education_level=level,
                    code=t["code"],
                    defaults={
                        "name":                   t["name"],
                        "component_type":         t["component_type"],
                        "max_score":              t["max_score"],
                        "contributes_to_ca":      t["contributes_to_ca"],
                        "show_in_printed_report": t["show_in_printed_report"],
                        "display_order":          t["display_order"],
                        "is_active":              True,
                    },
                )
                if created:
                    logger.info(
                        f"[{tenant.slug}] ✅ Created component: "
                        f"{obj.code} / {level.level_type}"
                    )
            except IntegrityError:
                logger.warning(
                    f"[{tenant.slug}] IntegrityError creating component '{t['code']}' for {level.level_type}, fetching existing."
                )
                obj = AssessmentComponent.objects.filter(
                    tenant=tenant, education_level=level, code=t["code"]
                ).first()
