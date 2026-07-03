#!/usr/bin/env python
"""
Script to clean up duplicate ExamTypes and AssessmentComponents for Kebi.
This is a SAFE cleanup that:
1. Identifies duplicates
2. Keeps the FIRST occurrence (by created_at)
3. Removes subsequent duplicates
"""

import os
import sys
import django
from collections import defaultdict

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

django.setup()

from tenants.models import Tenant
from result.models import ExamType, AssessmentComponent
from academics.models import EducationLevel
from django.db import transaction

# Find Kebi International Academy tenant
tenant = Tenant.objects.filter(name__icontains='kebi').first()

if not tenant:
    print("❌ Kebi tenant not found")
    sys.exit(1)

print(f"\n{'='*70}")
print(f"CLEANUP: {tenant.name} ({tenant.slug})")
print(f"{'='*70}\n")

# ─────────────────────────────────────────────────────────────────────
# CLEANUP: ExamTypes
# ─────────────────────────────────────────────────────────────────────
print("🧹 CLEANING UP EXAM TYPES...")
print("-" * 70)

exam_types_by_code = defaultdict(list)
for et in ExamType.objects.filter(tenant=tenant).order_by('created_at'):
    exam_types_by_code[et.code].append(et)

duplicates_removed = 0
for code, entries in exam_types_by_code.items():
    if len(entries) > 1:
        print(f"  {code}: Found {len(entries)} copies → keeping first, removing {len(entries) - 1}")
        # Keep the first (oldest), delete the rest
        for et in entries[1:]:
            et.delete()
            duplicates_removed += 1

print(f"\n  ✅ Removed {duplicates_removed} duplicate exam types\n")

# ─────────────────────────────────────────────────────────────────────
# CLEANUP: AssessmentComponents
# ─────────────────────────────────────────────────────────────────────
print("🧹 CLEANING UP ASSESSMENT COMPONENTS...")
print("-" * 70)

levels = EducationLevel.objects.filter(
    tenant=tenant, is_active=True
).order_by('display_order')

comp_duplicates_removed = 0
for level in levels:
    comps_by_code = defaultdict(list)
    for comp in AssessmentComponent.objects.filter(
        tenant=tenant, 
        education_level=level
    ).order_by('created_at'):
        comps_by_code[comp.code].append(comp)
    
    for code, entries in comps_by_code.items():
        if len(entries) > 1:
            print(f"  {level.level_type}/{code}: Found {len(entries)} copies → keeping first, removing {len(entries) - 1}")
            for comp in entries[1:]:
                comp.delete()
                comp_duplicates_removed += 1

print(f"\n  ✅ Removed {comp_duplicates_removed} duplicate assessment components\n")

print(f"{'='*70}")
print(f"CLEANUP SUMMARY:")
print(f"  • ExamType duplicates removed: {duplicates_removed}")
print(f"  • AssessmentComponent duplicates removed: {comp_duplicates_removed}")
print(f"  • Total removed: {duplicates_removed + comp_duplicates_removed}")
print(f"{'='*70}\n")
