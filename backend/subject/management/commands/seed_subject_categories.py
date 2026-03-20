from django.core.management.base import BaseCommand
from django.db import transaction
from subject.models import SubjectCategory
from tenants.models import Tenant

class Command(BaseCommand):
    help = 'Seeds initial subject categories for all tenants'

    @transaction.atomic
    def handle(self, *args, **kwargs):
        tenants = Tenant.objects.all()
        
        categories = [
            {'name': 'Core Subject', 'code': 'core', 'color': '#4CAF50'},
            {'name': 'Elective Subject', 'code': 'elective', 'color': '#2196F3'},
            {'name': 'Cross Cutting Subject', 'code': 'cross_cutting', 'color': '#FF9800'},
            {'name': 'Core Science', 'code': 'core_science', 'color': '#9C27B0'},
            {'name': 'Core Art', 'code': 'core_art', 'color': '#E91E63'},
            {'name': 'Core Humanities', 'code': 'core_humanities', 'color': '#3F51B5'},
            {'name': 'Vocational', 'code': 'vocational', 'color': '#FF5722'},
            {'name': 'Cultural & Creative Arts', 'code': 'creative_arts', 'color': '#FFC107'},
            {'name': 'Religious Studies', 'code': 'religious', 'color': '#795548'},
            {'name': 'Physical & Health Education', 'code': 'physical', 'color': '#00BCD4'},
            {'name': 'Language', 'code': 'language', 'color': '#CDDC39'},
            {'name': 'Practical/Skills', 'code': 'practical', 'color': '#607D8B'},
            {'name': 'Nursery Activities', 'code': 'nursery_activities', 'color': '#F44336'},
        ]
        
        created_count = 0
        for tenant in tenants:
            for idx, cat_data in enumerate(categories):
                _, created = SubjectCategory.objects.get_or_create(
                    tenant=tenant,
                    code=cat_data['code'],
                    defaults={
                        'name': cat_data['name'],
                        'color_code': cat_data['color'],
                        'display_order': idx,
                        'is_active': True
                    }
                )
                if created:
                    created_count += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully seeded {created_count} subject categories across {tenants.count()} tenants'
            )
        )