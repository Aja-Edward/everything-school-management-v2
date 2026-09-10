from django.core.cache import cache
import logging

logger = logging.getLogger(__name__)


def clear_subject_caches():
    """Clear all subject-related caches"""
    cache_keys = [
        "subjects_cache_v1",
        "subjects_by_category_v3",
        "subjects_by_education_level_v2",
        "nursery_subjects_v1",
        "ss_subjects_by_type_v1",
        "cross_cutting_subjects_v1",
        "subject_statistics_v1",
    ]

    cleared_count = 0
    for key in cache_keys:
        if cache.delete(key):
            cleared_count += 1

    logger.info(f"Cleared {cleared_count} subject cache keys")
    return cleared_count


# subject/utils.py — add this function


def filter_subjects_by_education_level(queryset, level_type: str):
    """
    Filter subjects by education level using both the new M2M path
    and the legacy JSON field, combined with OR + distinct.
    """
    m2m_qs = queryset.filter(grade_levels__education_level__level_type=level_type)
    legacy_qs = queryset.filter(education_levels__contains=[level_type])
    return (m2m_qs | legacy_qs).distinct()


def grade_levels_for_education_levels(tenant_id, education_levels):
    """
    The grade levels a school runs under the given coarse education levels.

    Schools pick "Primary", not six individual grades, so both the create
    signal and the update path have to widen the one into the other.
    expand_tokens absorbs the spelling differences between tenants seeded with
    'JSS' and tenants seeded with 'JUNIOR_SECONDARY'.

    Returns an empty queryset rather than raising when a school has not seeded
    grade levels for the level chosen -- a common state, since only Nursery
    and Primary get defaults.
    """
    from classroom.models import GradeLevel
    from common.education_levels import expand_tokens

    if not tenant_id or not education_levels:
        return GradeLevel.objects.none()

    wanted = expand_tokens(education_levels)
    if not wanted:
        return GradeLevel.objects.none()

    return GradeLevel.objects.filter(
        tenant_id=tenant_id,
        education_level__level_type__in=wanted,
        is_active=True,
    )
