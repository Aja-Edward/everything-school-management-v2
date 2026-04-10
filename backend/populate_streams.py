#!/usr/bin/env python
"""
Populate stream_type_new FK field from Stream name matching StreamType name.
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

print("🚀 Starting stream_type population...\n")

# Mapping of stream names to StreamType codes
NAME_TO_CODE = {
    'Science': 'SCIENCE',
    'SCIENCE': 'SCIENCE',
    'Arts': 'ARTS',
    'ARTS': 'ARTS',
    'Commercial': 'COMMERCIAL',
    'COMMERCIAL': 'COMMERCIAL',
    'Technical': 'TECHNICAL',
    'TECHNICAL': 'TECHNICAL',
    'Art': 'ARTS',
    'ART': 'ARTS',
}

total_streams = 0
updated_streams = 0
skipped_streams = 0

# Process all streams
for stream in Stream.objects.exclude(stream_type_new__isnull=False):
    total_streams += 1
    tenant = stream.tenant
    
    if stream.stream_type_new:
        print(f"⏭️  {stream.name} (Tenant: {tenant.name}): Already has stream_type_new")
        skipped_streams += 1
        continue
    
    # Try to find matching StreamType by name
    stream_name = stream.name.strip()
    code = NAME_TO_CODE.get(stream_name)
    
    if not code:
        print(f"⚠️  {stream.name} (Tenant: {tenant.name}): No mapping found for name '{stream_name}'")
        skipped_streams += 1
        continue
    
    try:
        stream_type_obj = StreamType.objects.get(
            tenant=tenant,
            code=code
        )
        stream.stream_type_new = stream_type_obj
        stream.save(update_fields=['stream_type_new'])
        print(f"✅ {stream.name} (Tenant: {tenant.name}): → {stream_type_obj.name}")
        updated_streams += 1
    except StreamType.DoesNotExist:
        print(f"❌ {stream.name} (Tenant: {tenant.name}): StreamType '{code}' not found")
        skipped_streams += 1
    except Stream.MultipleObjectsReturned:
        print(f"❌ {stream.name} (Tenant: {tenant.name}): Multiple StreamType matches found")
        skipped_streams += 1

# Summary
print("\n" + "=" * 60)
print("📊 Summary:")
print(f"  ✅ Streams updated: {updated_streams}")
print(f"  Total streams processed: {total_streams}")
print(f"  Skipped: {skipped_streams}")
print("=" * 60)

if updated_streams > 0:
    print("\n✅ Stream type population complete!")
else:
    print("\n⚠️  No streams were updated.")
