from academics.constant import DEFAULT_EDUCATION_LEVELS
from academics.models import EducationLevel


def seed_education_levels(tenant):
    if EducationLevel.objects.filter(tenant=tenant).exists():
        return  # already seeded

    for level in DEFAULT_EDUCATION_LEVELS:
        EducationLevel.objects.get_or_create(
            tenant=tenant,
            code=level["code"],
            defaults={**level, "is_system_default": True},
        )