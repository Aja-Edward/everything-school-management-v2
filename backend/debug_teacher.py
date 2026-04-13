#!/usr/bin/env python
"""
Debug script to find the newly created teacher and check its tenant assignment
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from teacher.models import Teacher
from users.models import CustomUser
from tenants.models import Tenant
from django.db import connection

# Get all teachers in the database
print("\n" + "="*80)
print("ALL TEACHERS IN DATABASE")
print("="*80)

all_teachers = Teacher.objects.all().select_related('user', 'tenant')
print(f"Total teachers in DB: {all_teachers.count()}\n")

for teacher in all_teachers:
    print(f"ID: {teacher.id}")
    print(f"  Full Name: {teacher.user.full_name if teacher.user else 'N/A'}")
    print(f"  Employee ID: {teacher.employee_id}")
    print(f"  Email: {teacher.user.email if teacher.user else 'N/A'}")
    print(f"  Tenant: {teacher.tenant.slug if teacher.tenant else 'NULL ⚠️'}")
    print(f"  Tenant ID: {teacher.tenant_id if hasattr(teacher, 'tenant_id') else 'N/A'}")
    print(f"  is_active: {teacher.is_active}")
    print(f"  created_at: {teacher.created_at}")
    print()

# Get all tenants to see what tenants exist
print("\n" + "="*80)
print("ALL TENANTS")
print("="*80)

all_tenants = Tenant.objects.all()
print(f"Total tenants: {all_tenants.count()}\n")

for tenant in all_tenants:
    teacher_count = Teacher.objects.filter(tenant=tenant).count()
    print(f"Tenant: {tenant.slug}")
    print(f"  Name: {tenant.name}")
    print(f"  Teachers: {teacher_count}")
    print()

# Check for teachers with NULL tenant
print("\n" + "="*80)
print("TEACHERS WITH NULL TENANT (PROBLEM!)")
print("="*80)

null_tenant_teachers = Teacher.objects.filter(tenant__isnull=True)
print(f"Count: {null_tenant_teachers.count()}\n")

for teacher in null_tenant_teachers:
    print(f"🚨 Teacher: {teacher.user.full_name if teacher.user else 'Unknown'}")
    print(f"   Employee ID: {teacher.employee_id}")
    print(f"   Email: {teacher.user.email if teacher.user else 'N/A'}")
    print()

# Check if there are duplicate employees
print("\n" + "="*80)
print("DUPLICATE EMPLOYEE_ID CHECK")
print("="*80)

from django.db.models import Count

duplicates = Teacher.objects.values('employee_id').annotate(count=Count('id')).filter(count__gt=1)
if duplicates.exists():
    print(f"Found {duplicates.count()} duplicate employee IDs:\n")
    for dup in duplicates:
        print(f"Employee ID: {dup['employee_id']}")
        teachers = Teacher.objects.filter(employee_id=dup['employee_id'])
        for t in teachers:
            print(f"  - ID: {t.id}, Tenant: {t.tenant.slug if t.tenant else 'NULL'}")
else:
    print("No duplicate employee IDs found.")

print("\n" + "="*80)
