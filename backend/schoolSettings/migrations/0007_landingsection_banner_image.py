from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('schoolSettings', '0006_tenantlandingpage_ribbon'),
    ]

    operations = [
        migrations.AddField(
            model_name='landingsection',
            name='banner_image',
            field=models.URLField(
                blank=True,
                null=True,
                max_length=500,
                help_text='Full-width banner shown at the top of the section\'s dedicated page',
            ),
        ),
    ]
