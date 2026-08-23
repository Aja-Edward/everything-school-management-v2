from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Subject


@receiver(m2m_changed, sender=Subject.grade_levels.through)
def sync_education_levels(sender, instance, action, **kwargs):
    """
    Keep the legacy education_levels JSONField in sync with the grade_levels M2M.

    education_level is a foreign key, so it has to be traversed to level_type —
    reading it directly yields primary keys, which would replace values like
    'SENIOR_SECONDARY' with [4] and break every filter that reads this field.
    """
    if action not in ("post_add", "post_remove", "post_clear"):
        return

    levels = sorted(
        {
            level
            for level in instance.grade_levels.values_list(
                "education_level__level_type", flat=True
            )
            if level
        }
    )
    # update() rather than save() so this doesn't re-enter post_save below.
    Subject.objects.filter(pk=instance.pk).update(education_levels=levels)


@receiver(post_save, sender=Subject)
def derive_grade_levels(sender, instance, **kwargs):
    """
    Fill grade_levels from education_levels when a subject has none.

    Schools choose an education level ("Primary"), not eleven individual grade
    levels, so the UI collects the coarse value and this derives the fine one.
    Without it the M2M stays empty and every modern filter — education_level_id,
    grade_level_id, the teacher subject picker — finds nothing, while the
    deprecated JSON field silently carries the whole feature.

    Only fills an empty M2M, so an explicit per-grade selection is never
    overwritten.
    """
    if not instance.tenant_id or not instance.education_levels:
        return
    if instance.grade_levels.exists():
        return

    from classroom.models import GradeLevel
    from common.education_levels import expand_tokens

    wanted = expand_tokens(instance.education_levels)
    if not wanted:
        return

    grade_levels = GradeLevel.objects.filter(
        tenant_id=instance.tenant_id,
        education_level__level_type__in=wanted,
        is_active=True,
    )
    if grade_levels.exists():
        instance.grade_levels.add(*grade_levels)
