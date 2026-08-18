# classroom/services/grade_level_service.py

from django.core.exceptions import ValidationError
from academics.models import EducationLevel
from classroom.models import Class, GradeLevel
from classroom.constant import DEFAULT_GRADE_LEVELS  # your pre-defined defaults


def seed_grade_levels(tenant):
    """
    Seed default GradeLevels for a given tenant.
    
    For each EducationLevel in the tenant, this will create 
    default GradeLevels if they do not already exist.
    """
    # Safety: don't reseed if GradeLevels already exist for this tenant
    if GradeLevel.objects.filter(tenant=tenant).exists():
        return

    # Loop through all EducationLevels for this tenant
    for edu_level in EducationLevel.objects.filter(tenant=tenant):
        # Get the default grade levels for this education level code
        levels = DEFAULT_GRADE_LEVELS.get(edu_level.code, [])

        for level in levels:
            # Create GradeLevel if not already present
            grade_level, _ = GradeLevel.objects.get_or_create(
                tenant=tenant,
                education_level=edu_level,
                order=level["order"],
                defaults={
                    "name": level["name"],
                    "description": level.get("description", ""),
                    "is_system_default": True,
                    "is_active": True,
                },
            )

            # Sections attach to Class, not GradeLevel, so a grade level with
            # no Class shows "(not ready)" on the Academic settings tab and
            # cannot take sections. Seeding grade levels alone left every
            # newly-registered school in that state.
            _ensure_class_for_grade_level(tenant, edu_level, grade_level)


def _ensure_class_for_grade_level(tenant, education_level, grade_level):
    """Create the companion Class for a grade level, if one is not there."""
    if Class.objects.filter(tenant=tenant, grade_level=grade_level).exists():
        return

    code = (
        grade_level.name.strip().upper().replace("-", "_").replace(" ", "_")
    )[:20]

    # unique_together is (tenant, code): adopt a matching unlinked Class
    # rather than colliding with it or creating a duplicate.
    existing = Class.objects.filter(tenant=tenant, code=code).first()
    if existing:
        if existing.grade_level_id is None:
            existing.grade_level = grade_level
            existing.save(update_fields=["grade_level"])
        return

    Class.objects.create(
        tenant=tenant,
        name=grade_level.name,
        code=code,
        education_level=education_level,
        grade_level=grade_level,
        grade_number=grade_level.order,
        order=grade_level.order,
    )


def create_grade_level(tenant, education_level, name, order, description="", is_active=True):
    """
    Utility function to create a single GradeLevel, tenant-aware.
    Validates that EducationLevel belongs to the same tenant.
    """
    if education_level.tenant != tenant:
        raise ValidationError("EducationLevel must belong to the same tenant.")

    grade_level, created = GradeLevel.objects.get_or_create(
        tenant=tenant,
        education_level=education_level,
        order=order,
        defaults={
            "name": name,
            "description": description,
            "is_system_default": False,
            "is_active": is_active,
        },
    )
    return grade_level, created