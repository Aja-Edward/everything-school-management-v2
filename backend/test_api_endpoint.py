#!/usr/bin/env python
"""
Test the TeacherViewSet API directly to see what it returns
"""
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import RequestFactory
from teacher.views import TeacherViewSet
from users.models import CustomUser
from tenants.models import Tenant
from django.contrib.auth.models import AnonymousUser

print("\n" + "="*80)
print("TEST TEACHER API ENDPOINT")
print("="*80)

# Get a tenant to use for context
tenant = Tenant.objects.filter(slug='gods-treasure-schools').first()
print(f"\nTesting with tenant: {tenant.name if tenant else 'Not found'}")

if not tenant:
    print("❌ Tenant not found!")
else:
    # Create a request factory
    factory = RequestFactory()
    
    # Create a GET request to /api/teachers/teachers/
    request = factory.get('/api/teachers/teachers/')
    
    # Set the tenant on the request (simulating middleware)
    request.tenant = tenant
    request.user = AnonymousUser()
    
    # Create viewset instance and set request
    viewset = TeacherViewSet()
    viewset.request = request
    viewset.action = 'list'
    
    # Call get_queryset
    queryset = viewset.get_queryset()
    
    print(f"\nTeachers in queryset: {queryset.count()}")
    
    for teacher in queryset:
        print(f"  - {teacher.user.full_name} ({teacher.employee_id}) - Tenant: {teacher.tenant.slug}")
    
    print("\n" + "="*80)
    print("DIRECT DATABASE QUERY")
    print("="*80)
    
    from teacher.models import Teacher
    
    # Query directly
    direct_query = Teacher.objects.filter(tenant=tenant)
    print(f"\nDirect DB query - Teachers: {direct_query.count()}")
    for teacher in direct_query:
        print(f"  - {teacher.user.full_name} ({teacher.employee_id}) - Tenant: {teacher.tenant.slug}")

print("\n" + "="*80)
