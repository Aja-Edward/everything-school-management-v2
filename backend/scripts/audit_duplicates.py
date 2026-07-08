#!/usr/bin/env python
"""
Non-destructive audit script to find duplicate ExamTypes and AssessmentComponents
for all tenants or a single tenant slug. Prints a report but does not modify data.

Usage:
  python scripts/audit_duplicates.py            # audits all tenants
  python scripts/audit_duplicates.py --slug kebi-international-academy
"""
from academics.models import EducationLevel
from result.models import ExamType, AssessmentComponent
from tenants.models import Tenant
import os
import sys
import django
from collections import defaultdict
import argparse

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

django.setup()


parser = argparse.ArgumentParser()
parser.add_argument('--slug', help='Tenant slug to audit', default=None)
args = parser.parse_args()

qs = Tenant.objects.filter(
    slug=args.slug) if args.slug else Tenant.objects.all()

for tenant in qs:
    print('\n' + '='*70)
    print(f'Tenant: {tenant.name} ({tenant.slug})')
    print('='*70)

    # ExamType duplicates
    print('\nExamType duplicates:')
    exam_by_code = defaultdict(list)
    for et in ExamType.objects.filter(tenant=tenant).order_by('code', 'created_at'):
        exam_by_code[et.code.lower()].append(et)

    any_dup = False
    for code, items in exam_by_code.items():
        if len(items) > 1:
            any_dup = True
            print(f"  {code}: {len(items)} entries")
            for i, e in enumerate(items, 1):
                print(
                    f"    {i}. id={e.id} name={e.name!r} created_at={e.created_at}")
    if not any_dup:
        print('  None')

    # AssessmentComponent duplicates per education level (by normalized name)
    print('\nAssessmentComponent potential duplicates (by normalized name):')
    levels = EducationLevel.objects.filter(tenant=tenant)

    def _norm(s):
        return ''.join(ch for ch in (s or '').lower() if ch.isalnum())

    any_dup = False
    for lvl in levels:
        comps = AssessmentComponent.objects.filter(
            tenant=tenant, education_level=lvl).order_by('name', 'created_at')
        by_norm = defaultdict(list)
        for c in comps:
            by_norm[_norm(c.name)].append(c)
        lvl_dups = {k: v for k, v in by_norm.items() if len(v) > 1}
        if lvl_dups:
            any_dup = True
            print(f"  {lvl.level_type} ({lvl.name}):")
            for k, items in lvl_dups.items():
                print(f"    Normalized='{k}' -> {len(items)} entries")
                for i, c in enumerate(items, 1):
                    print(
                        f"      {i}. id={c.id} code={c.code!r} name={c.name!r} created_at={c.created_at}")
    if not any_dup:
        print('  None')

print('\nAudit complete.')
