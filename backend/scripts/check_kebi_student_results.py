#!/usr/bin/env python
"""Check Kebi tenant StudentResult population and related grade-level result counts."""
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


tenant = Tenant.objects.filter(name__icontains='kebi').first()
if not tenant:
    print('Tenant not found')
    sys.exit(1)

print('Tenant:', tenant.name, tenant.slug, tenant.id)
print('StudentResult count:', StudentResult.objects.filter(tenant=tenant).count())
print('StudentResult grade status:', list(StudentResult.objects.filter(
    tenant=tenant).values('status').annotate(c=Count('id'))))
print('StudentResult distinct students:', StudentResult.objects.filter(
    tenant=tenant).values('student').distinct().count())

for model_name in ['NurseryResult', 'PrimaryResult', 'JuniorSecondaryResult', 'SeniorSecondaryResult']:
    try:
        model = apps.get_model('result', model_name)
        print(f'{model_name} count:',
              model.objects.filter(tenant=tenant).count())
    except LookupError:
        print(f'{model_name} not found')

for r in StudentResult.objects.filter(tenant=tenant)[:10]:
    print('SR', r.id, r.student_id, r.subject_id,
          r.grade, r.status, r.total_score)
