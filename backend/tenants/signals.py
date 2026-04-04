# tenants/signals.py

from django.db.models.signals import post_save
from django.dispatch import receiver
from academics.utils import seed_default_term_types
from tenants.models import Tenant
from classroom.services.grade_level_service import seed_grade_levels
from academics.services.education_level_service import seed_education_levels

@receiver(post_save, sender=Tenant)
def create_default_grade_levels(sender, instance, created, **kwargs):
    if created:
        seed_grade_levels(instance)


@receiver(post_save, sender=Tenant)
def create_default_education_levels(sender, instance, created, **kwargs):
    if created:
        seed_education_levels(instance)


@receiver(post_save, sender=Tenant)
def create_default_academic_data(sender, instance, created, **kwargs):
    if created:
        seed_default_term_types(instance)
