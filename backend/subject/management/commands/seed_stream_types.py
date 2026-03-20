from django.core.management.base import BaseCommand
from django.db import transaction
from classroom.models import StreamType, GradeLevel
from tenants.models import Tenant

class Command(BaseCommand):
    help = 'Seeds initial stream types for all tenants'

    @transaction.atomic
    def handle(self, *args, **kwargs):
        tenants = Tenant.objects.all()
        
        stream_types = [
            {'name': 'Science', 'code': 'SCIENCE', 'color': '#4CAF50'},
            {'name': 'Arts', 'code': 'ARTS', 'color': '#2196F3'},
            {'name': 'Commercial', 'code': 'COMMERCIAL', 'color': '#FF9800'},
            {'name': 'Technical', 'code': 'TECHNICAL', 'color': '#9C27B0'},
        ]
        
        created_count = 0
        for tenant in tenants:
            # Get Senior Secondary grade levels
            ss_levels = GradeLevel.objects.filter(
                tenant=tenant,
                education_level='SENIOR_SECONDARY'
            )
            
            for idx, st_data in enumerate(stream_types):
                stream_type, created = StreamType.objects.get_or_create(
                    tenant=tenant,
                    code=st_data['code'],
                    defaults={
                        'name': st_data['name'],
                        'color_code': st_data['color'],
                        'display_order': idx,
                        'is_active': True
                    }
                )
                
                # Link to Senior Secondary levels
                if ss_levels.exists():
                    stream_type.applicable_levels.set(ss_levels)
                
                if created:
                    created_count += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully seeded {created_count} stream types across {tenants.count()} tenants'
            )
        )