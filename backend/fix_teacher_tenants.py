#!/usr/bin/env python
"""
Data recovery script to assign tenants to teachers that have NULL tenant values
This script matches teachers to their school based on email domain or tries to assign to a default school
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from teacher.models import Teacher
from users.models import CustomUser
from tenants.models import Tenant
import logging

logger = logging.getLogger(__name__)

print("\n" + "="*80)
print("TEACHER TENANT RECOVERY")
print("="*80)

# Get all teachers with NULL tenant
null_tenant_teachers = Teacher.objects.filter(tenant__isnull=True).select_related('user')
print(f"Teachers with NULL tenant: {null_tenant_teachers.count()}\n")

fixed_count = 0
skipped_count = 0

for teacher in null_tenant_teachers:
    print(f"Processing teacher: {teacher.user.full_name} ({teacher.employee_id})")
    print(f"  Email: {teacher.user.email}")
    print(f"  User tenant: {teacher.user.tenant.slug if teacher.user.tenant else 'Still NULL'}")
    
    tenant_to_assign = None
    
    # Strategy 1: Use the user's tenant if available
    if teacher.user.tenant:
        tenant_to_assign = teacher.user.tenant
        print(f"  ✓ Found tenant from user: {tenant_to_assign.slug}")
    
    # Strategy 2: Match by email domain (e.g., @godstreasureschools.com → gods-treasure-schools)
    if not tenant_to_assign and teacher.user.email:
        email_domain = teacher.user.email.split('@')[1].lower() if '@' in teacher.user.email else None
        if email_domain:
            print(f"  Trying email domain match: {email_domain}")
            # Create a slug from domain (rough mapping)
            if 'godstreasure' in email_domain:
                tenant = Tenant.objects.filter(slug='gods-treasure-schools').first()
                if tenant:
                    tenant_to_assign = tenant
                    print(f"  ✓ Matched domain to tenant: {tenant.slug}")
    
    # Strategy 3: Assign to first active tenant (last resort)
    if not tenant_to_assign:
        tenant = Tenant.objects.filter(is_active=True, status='active').first()
        if tenant:
            tenant_to_assign = tenant
            print(f"  ⚠ Assigning to default active tenant: {tenant.slug}")
    
    # Apply the fix
    if tenant_to_assign:
        teacher.tenant = tenant_to_assign
        teacher.save()
        fixed_count += 1
        print(f"  ✅ FIXED: Assigned to {tenant_to_assign.slug}\n")
    else:
        skipped_count += 1
        print(f"  ❌ SKIPPED: Could not determine tenant\n")

print("="*80)
print(f"SUMMARY")
print("="*80)
print(f"Teachers fixed: {fixed_count}")
print(f"Teachers skipped: {skipped_count}")
print()

# Verify the fix
remaining_null = Teacher.objects.filter(tenant__isnull=True).count()
print(f"Teachers still with NULL tenant: {remaining_null}")

if remaining_null == 0:
    print("✅ All teachers now have tenant assignments!")
else:
    print(f"⚠ {remaining_null} teachers still need manual attention")

print("\n" + "="*80)
