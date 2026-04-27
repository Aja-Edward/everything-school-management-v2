from django.db import migrations


class Migration(migrations.Migration):
    # tenant was already added to ExamType in migration 0014; this is a no-op
    # to keep the migration history intact without duplicating the column.

    dependencies = [
        ('result', '0015_alter_seniorsecondarysessionresult_unique_together_and_more'),
    ]

    operations = []