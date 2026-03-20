from django.core.management.base import BaseCommand
from django.db import transaction
from subject.models import SubjectType
from classroom.models import GradeLevel
from tenants.models import Tenant

class Command(BaseCommand):
    help = 'Seeds initial subject types for all tenants'

    @transaction.atomic
    def handle(self, *args, **kwargs):
        tenants = Tenant.objects.all()
        
        types = [
            {'name': 'Cross Cutting', 'code': 'cross_cutting', 'is_cross_cutting': True},
            {'name': 'Core Science', 'code': 'core_science', 'is_cross_cutting': False},
            {'name': 'Core Art', 'code': 'core_art', 'is_cross_cutting': False},
            {'name': 'Core Humanities', 'code': 'core_humanities', 'is_cross_cutting': False},
            {'name': 'Elective', 'code': 'elective', 'is_cross_cutting': False},
        ]
        
        created_count = 0
        for tenant in tenants:
            # Get Senior Secondary grade levels for this tenant
            ss_levels = GradeLevel.objects.filter(
                tenant=tenant,
                education_level='SENIOR_SECONDARY'
            )
            
            for idx, type_data in enumerate(types):
                subject_type, created = SubjectType.objects.get_or_create(
                    tenant=tenant,
                    code=type_data['code'],
                    defaults={
                        'name': type_data['name'],
                        'is_cross_cutting': type_data['is_cross_cutting'],
                        'display_order': idx,
                        'is_active': True
                    }
                )
                
                # Link to Senior Secondary levels
                if ss_levels.exists():
                    subject_type.applicable_levels.set(ss_levels)
                
                if created:
                    created_count += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully seeded {created_count} subject types across {tenants.count()} tenants'
            )
        )