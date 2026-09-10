from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Subject
from .utils import grade_levels_for_education_levels


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

    if not levels and instance.education_levels:
        # An empty M2M is not evidence that a subject has no levels. It is also
        # the state a subject sits in before derive_grade_levels runs, and the
        # state it is left in when a school has not seeded grade levels for the
        # level the admin chose (only Nursery and Primary get defaults). The
        # JSON field is what the admin UI actually writes, so blanking it here
        # erases their own selection — which is exactly what editing a subject
        # used to do.
        return

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
    overwritten. Changing the levels on an existing subject goes through
    SubjectCreateUpdateSerializer.update() instead, which re-derives.
    """
    if not instance.tenant_id or not instance.education_levels:
        return
    if instance.grade_levels.exists():
        return

    grade_levels = grade_levels_for_education_levels(
        instance.tenant_id, instance.education_levels
    )
    if grade_levels.exists():
        instance.grade_levels.add(*grade_levels)
