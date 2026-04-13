#!/usr/bin/env python
"""
Debug script to find the user who created teachers and check their tenant
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from teacher.models import Teacher, BulkUploadRecord
from users.models import CustomUser
from tenants.models import Tenant

print("\n" + "="*80)
print("USERS WITH TENANT INFORMATION")
print("="*80)

# Get all users who are not superuser
users = CustomUser.objects.filter(is_superuser=False).select_related('tenant')
print(f"Total non-superuser accounts: {users.count()}\n")

for user in users:
    print(f"Username: {user.username}")
    print(f"  Email: {user.email}")
    print(f"  Role: {user.role}")
    print(f"  Tenant: {user.tenant.slug if user.tenant else 'NULL ⚠️'}")
    print(f"  is_staff: {user.is_staff}")
    print()

# Check BulkUploadRecord to understand the flow
print("\n" + "="*80)
print("BULK UPLOAD RECORDS (TEACHERS)")
print("="*80)

bulk_records = BulkUploadRecord.objects.all().select_related('uploaded_by', 'uploaded_by__tenant')
print(f"Total bulk upload records: {bulk_records.count()}\n")

for record in bulk_records:
    print(f"ID: {record.id}")
    print(f"  Filename: {record.original_filename}")
    print(f"  Status: {record.status}")
    print(f"  Uploaded by: {record.uploaded_by.username if record.uploaded_by else 'Unknown'}")
    print(f"  Uploader's tenant: {record.uploaded_by.tenant.slug if record.uploaded_by and record.uploaded_by.tenant else 'NULL ⚠️'}")
    print(f"  Record tenant: {record.tenant.slug if record.tenant else 'NULL ⚠️'}")
    print(f"  Created: {record.created_at}")
    print()

# Check which user created the latest teacher
print("\n" + "="*80)
print("ANALYZING LATEST TEACHER (2026-04-10)")
print("="*80)

latest_teacher = Teacher.objects.filter(employee_id='EMP0001').first()
if latest_teacher:
    print(f"Teacher: {latest_teacher.user.full_name}")
    print(f"Employee ID: {latest_teacher.employee_id}")
    print(f"User ID: {latest_teacher.user.id}")
    print(f"User tenant: {latest_teacher.user.tenant.slug if latest_teacher.user.tenant else 'NULL ⚠️'}")
    print(f"Teacher tenant: {latest_teacher.tenant.slug if latest_teacher.tenant else 'NULL ⚠️'}")
    print()
    print("User details:")
    print(f"  Username: {latest_teacher.user.username}")
    print(f"  Email: {latest_teacher.user.email}")
    print(f"  Role: {latest_teacher.user.role}")
    print(f"  is_staff: {latest_teacher.user.is_staff}")
    print(f"  is_superuser: {latest_teacher.user.is_superuser}")

print("\n" + "="*80)
