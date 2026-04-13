#!/usr/bin/env python
"""
Diagnostic script to check Stream records
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from classroom.models import Stream, StreamType
from tenants.models import Tenant

print("🔍 Diagnostic: Stream Records\n")

for tenant in Tenant.objects.all():
    print(f"📍 Tenant: {tenant.name}")
    print(f"   Streams total: {Stream.objects.filter(tenant=tenant).count()}")
    
    streams = Stream.objects.filter(tenant=tenant).all()[:5]
    for stream in streams:
        print(f"   - {stream.name}")
        print(f"     ID: {stream.id}")
        print(f"     stream_type (CharField): '{stream.stream_type}'")
        print(f"     stream_type_new (FK): {stream.stream_type_new}")
    
    print()

print("\n🔍 Diagnostic: StreamType Records\n")

stream_types = StreamType.objects.all()
print(f"Total StreamType records: {stream_types.count()}")

for st in stream_types[:10]:
    print(f"  - {st.name} ({st.code}) [Tenant: {st.tenant.name}]")
