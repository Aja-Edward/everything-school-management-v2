#!/usr/bin/env python
"""Inspect Kebi grade-level result statuses and StudentResult sync behavior."""
from django.apps import apps
from django.db.models import Count
from result.models import StudentResult
from tenants.models import Tenant
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
django.setup()


STATUS_MODELS = [
    'NurseryResult',
    'PrimaryResult',
    'JuniorSecondaryResult',
    'SeniorSecondaryResult',
]

tenant = Tenant.objects.filter(name__icontains='kebi').first()
if not tenant:
    print('Tenant not found')
    sys.exit(1)

print('Tenant:', tenant.name, tenant.slug)
print('StudentResult count:', StudentResult.objects.filter(tenant=tenant).count())
print('StudentResult statuses:', list(StudentResult.objects.filter(
    tenant=tenant).values('status').annotate(count=Count('id')).order_by('-count')))

for model_name in STATUS_MODELS:
    model = apps.get_model('result', model_name)
    qs = model.objects.filter(tenant=tenant)
    total = qs.count()
    print(f'\n{model_name} total: {total}')
    if total == 0:
        continue
    for item in qs.values('status').annotate(count=Count('id')).order_by('-count'):
        print(' ', item)
    sample = qs.filter(status__in=['APPROVED', 'PUBLISHED']).order_by(
        '-created_at')[:5]
    print('approved/published sample:', sample.count())
    if sample.exists():
        for r in sample:
            print('  ', r.id, getattr(r, 'student_id', None), getattr(
                r, 'subject_id', None), getattr(r, 'grade', None), r.status)

print('\nDone.')
