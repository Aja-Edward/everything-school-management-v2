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
