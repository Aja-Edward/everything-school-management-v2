#!/usr/bin/env python
"""
Script to check existing Assessment Components and ExamTypes
for Kebi International Academy tenant.
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

django.setup()

from tenants.models import Tenant
from result.models import ExamType, AssessmentComponent
from academics.models import EducationLevel

# Find Kebi International Academy tenant
tenant = Tenant.objects.filter(
    name__icontains='kebi'
).first()

if not tenant:
    print("❌ Kebi International Academy tenant not found")
    sys.exit(1)

print(f"\n{'='*70}")
print(f"TENANT: {tenant.name} ({tenant.slug})")
print(f"{'='*70}\n")

# Check ExamTypes
print("📋 EXAM TYPES")
print("-" * 70)
exam_types = ExamType.objects.filter(tenant=tenant).order_by('display_order')
if exam_types.exists():
    print(f"Found {exam_types.count()} exam types:")
    for et in exam_types:
        print(f"  • {et.code:8} | {et.name:30} | Category: {et.category:10} | Active: {et.is_active}")
else:
    print("  No exam types found")

# Check AssessmentComponents
print(f"\n📊 ASSESSMENT COMPONENTS")
print("-" * 70)
levels = EducationLevel.objects.filter(
    tenant=tenant, is_active=True
).order_by('display_order')

if not levels.exists():
    print("  No education levels found")
else:
    for level in levels:
        components = AssessmentComponent.objects.filter(
            tenant=tenant, 
            education_level=level
        ).order_by('display_order')
        
        print(f"\n  {level.level_type} ({level.name}):")
        if components.exists():
            print(f"    Found {components.count()} components:")
            for comp in components:
                print(f"      • {comp.code:8} | {comp.name:20} | Type: {comp.component_type:10} | Max: {comp.max_score:6} | Active: {comp.is_active}")
        else:
            print(f"    No components found")

print(f"\n{'='*70}\n")
