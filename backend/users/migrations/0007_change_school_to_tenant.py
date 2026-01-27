# Generated migration to change school field to tenant field
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0006_fix_admin_username"),
        ("tenants", "0001_initial"),  # Depends on tenants app
    ]

    operations = [
        # Remove old indexes first
        migrations.RemoveIndex(
            model_name="customuser",
            name="users_custo_school__bdc208_idx",
        ),
        migrations.RemoveIndex(
            model_name="customuser",
            name="users_custo_school__2371f1_idx",
        ),
        migrations.RemoveIndex(
            model_name="customuser",
            name="users_custo_school__e7ca8f_idx",
        ),
        # Remove the old school field
        migrations.RemoveField(
            model_name="customuser",
            name="school",
        ),
        # Add the new tenant field
        migrations.AddField(
            model_name="customuser",
            name="tenant",
            field=models.ForeignKey(
                blank=True,
                db_index=True,
                help_text="Tenant (school) this user belongs to",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="users",
                to="tenants.tenant",
            ),
        ),
        # Add new indexes
        migrations.AddIndex(
            model_name="customuser",
            index=models.Index(
                fields=["tenant", "role"], name="users_custo_tenant__role_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="customuser",
            index=models.Index(
                fields=["tenant", "section"], name="users_custo_tenant__sect_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="customuser",
            index=models.Index(
                fields=["tenant", "is_active"], name="users_custo_tenant__actv_idx"
            ),
        ),
    ]
