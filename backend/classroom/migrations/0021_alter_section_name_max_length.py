from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('classroom', '0020_alter_stream_stream_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='section',
            name='name',
            field=models.CharField(
                max_length=100,
                help_text="Section name (e.g., 'A', 'B', 'C', 'Gold', 'Diamond')",
            ),
        ),
    ]
