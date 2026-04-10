from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver
from .models import Subject


@receiver(m2m_changed, sender=Subject.grade_levels.through)
def sync_education_levels(sender, instance, action, **kwargs):
    """
    Keep legacy education_levels JSONField in sync with grade_levels M2M.
    This prevents the bug where subjects don't show in UI due to empty
    education_levels even though grade_levels is correctly set.
    """
    if action in ["post_add", "post_remove", "post_clear"]:
        levels = list(
            instance.grade_levels
            .values_list("education_level", flat=True)
            .distinct()
        )
        # Use update() to avoid triggering save() signals recursively
        Subject.objects.filter(pk=instance.pk).update(
            education_levels=levels
        )