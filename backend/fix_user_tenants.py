#!/usr/bin/env python
"""
Fix CustomUser tenant assignments for teachers
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from teacher.models import Teacher
from users.models import CustomUser
from tenants.models import Tenant

print("\n" + "="*80)
print("FIX CUSTOMUSER TENANT ASSIGNMENTS")
print("="*80)

# Get all teachers that have a tenant now
teachers_with_tenant = Teacher.objects.filter(tenant__isnull=False).select_related('user', 'tenant')
print(f"Teachers with tenant: {teachers_with_tenant.count()}\n")

fixed_users = 0

for teacher in teachers_with_tenant:
    user = teacher.user
    if user.tenant != teacher.tenant:
        print(f"Fixing user: {user.username}")
        print(f"  Current user tenant: {user.tenant.slug if user.tenant else 'NULL'}")
        print(f"  Teacher tenant: {teacher.tenant.slug}")
        
        user.tenant = teacher.tenant
        user.save()
        fixed_users += 1
        print(f"  ✅ FIXED\n")

print("="*80)
print(f"SUMMARY")
print("="*80)
print(f"Users fixed: {fixed_users}")

print("\n" + "="*80)
