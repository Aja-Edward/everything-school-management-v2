# Create file: management/commands/migrate_stream_data.py
from django.core.management.base import BaseCommand
from django.db import transaction
from classroom.models import Stream, StreamType

class Command(BaseCommand):
    help = 'Migrates existing stream data to new structure'

    @transaction.atomic
    def handle(self, *args, **kwargs):
        streams = Stream.objects.all()
        
        for stream in streams:
            # Migrate stream_type CharField → ForeignKey
            if hasattr(stream, 'stream_type') and isinstance(stream.stream_type, str):
                stream_type_code = stream.stream_type
                try:
                    stream_type_obj = StreamType.objects.get(
                        tenant=stream.tenant,
                        code=stream_type_code
                    )
                    stream._stream_type_temp = stream_type_obj.pk
                except StreamType.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(
                            f'Stream type "{stream_type_code}" not found for stream {stream.code}'
                        )
                    )
        
        self.stdout.write(self.style.SUCCESS('Stream data migration preparation completed'))