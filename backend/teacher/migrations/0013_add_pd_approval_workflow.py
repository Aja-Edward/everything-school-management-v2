from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("teacher", "0012_add_professional_development"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add approval workflow fields
        migrations.AddField(
            model_name="professionaldevelopment",
            name="approval_status",
            field=models.CharField(
                choices=[
                    ("pending",  "Pending Review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="pending",
                max_length=20,
                help_text="Admin must approve a record for it to appear on the teacher's public profile.",
            ),
        ),
        migrations.AddField(
            model_name="professionaldevelopment",
            name="rejection_reason",
            field=models.TextField(
                blank=True,
                help_text="Reason given when a record is rejected (visible to the teacher).",
            ),
        ),
        migrations.AddField(
            model_name="professionaldevelopment",
            name="reviewed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reviewed_pd_records",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="professionaldevelopment",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        # Remove old is_verified / verified_by / verified_at fields
        migrations.RemoveField(
            model_name="professionaldevelopment",
            name="is_verified",
        ),
        migrations.RemoveField(
            model_name="professionaldevelopment",
            name="verified_by",
        ),
        migrations.RemoveField(
            model_name="professionaldevelopment",
            name="verified_at",
        ),
    ]
