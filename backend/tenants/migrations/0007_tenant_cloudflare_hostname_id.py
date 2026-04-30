from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0006_tenantsettings_animations_enabled_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='cloudflare_hostname_id',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
