"""
Management command to populate stream_type_new FK field from old stream_type CharField.
This bridges the transition between old CharField and new ForeignKey field.
"""

from django.core.management.base import BaseCommand
from classroom.models import Stream, StreamType
from tenants.models import Tenant


class Command(BaseCommand):
    help = "Populate stream_type_new FK field from existing stream_type CharField values"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("🚀 Starting stream_type population..."))

        # Mapping of old stream_type values to StreamType names
        stream_type_mapping = {
            'SCIENCE': 'Science',
            'ARTS': 'Arts',
            'COMMERCIAL': 'Commercial',
            'TECHNICAL': 'Technical',
        }

        total_streams = 0
        updated_streams = 0
        skipped_streams = 0
        created_stream_types = 0

        # Process each tenant
        for tenant in Tenant.objects.all():
            self.stdout.write(f"\n📍 Processing tenant: {tenant.name}")

            # Get or create StreamType records for this tenant
            for code, name in stream_type_mapping.items():
                stream_type, created = StreamType.objects.get_or_create(
                    tenant=tenant,
                    code=code,
                    defaults={
                        'name': name,
                        'description': f'{name} stream for Senior Secondary students',
                        'display_order': list(stream_type_mapping.keys()).index(code),
                        'is_active': True,
                    }
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f"  ✅ Created StreamType: {name} ({code})"))
                    created_stream_types += 1
                else:
                    self.stdout.write(f"  ℹ️  StreamType exists: {name} ({code})")

            # Now populate stream_type_new for streams in this tenant
            streams = Stream.objects.filter(tenant=tenant).exclude(stream_type='')
            self.stdout.write(f"  Found {streams.count()} streams with stream_type values")

            for stream in streams:
                total_streams += 1
                old_type = stream.stream_type

                # Skip if already has stream_type_new set
                if stream.stream_type_new:
                    self.stdout.write(
                        f"  ⏭️  Skipping {stream.name} (stream_type_new already set)"
                    )
                    skipped_streams += 1
                    continue

                # Find matching StreamType
                try:
                    stream_type_obj = StreamType.objects.get(
                        tenant=tenant,
                        code=old_type
                    )
                    stream.stream_type_new = stream_type_obj
                    stream.save(update_fields=['stream_type_new'])
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✅ Updated {stream.name}: {old_type} → {stream_type_obj.name}"
                        )
                    )
                    updated_streams += 1
                except StreamType.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  ⚠️  {stream.name}: No StreamType found for code '{old_type}'"
                        )
                    )
                    skipped_streams += 1

        # Summary
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("📊 Summary:"))
        self.stdout.write(f"  StreamTypes created: {created_stream_types}")
        self.stdout.write(self.style.SUCCESS(f"  Streams updated: {updated_streams}"))
        self.stdout.write(f"  Total streams processed: {total_streams}")
        self.stdout.write(f"  Skipped: {skipped_streams}")
        self.stdout.write("=" * 60)

        if updated_streams > 0:
            self.stdout.write(
                self.style.SUCCESS("\n✅ Stream type population complete!")
            )
        else:
            self.stdout.write(
                self.style.WARNING("\n⚠️  No streams were updated. Check for existing stream_type_new values.")
            )
