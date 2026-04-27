from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schoolSettings", "0005_tenant_landing_page"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenantlandingpage",
            name="ribbon_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="tenantlandingpage",
            name="ribbon_text",
            field=models.CharField(blank=True, max_length=300, null=True),
        ),
        migrations.AddField(
            model_name="tenantlandingpage",
            name="ribbon_speed",
            field=models.CharField(
                choices=[("slow", "Slow"), ("medium", "Medium"), ("fast", "Fast")],
                default="medium",
                max_length=10,
            ),
        ),
    ]
