"""
student_promotions/migrations/0001_initial.py

Run:  python manage.py migrate
"""

from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("academics", "0005_educationlevel_is_system_default_and_more"),     # adjust to your last academics migration
        ("classroom", "0018_class_grade_level"),     # adjust to your last classroom migration
        ("students", "0007_bulkuploadrecord_delete_educationlevel_and_more"),      # adjust to your last students migration
        ("tenants", "0003_add_settings_fields"),       # adjust to your last tenants migration
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── PromotionRule ────────────────────────────────────────────
        migrations.CreateModel(
            name="PromotionRule",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="tenants.tenant",
                    ),
                ),
                (
                    "education_level",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="promotion_rules",
                        to="academics.educationlevel",
                    ),
                ),
                (
                    "pass_threshold",
                    models.DecimalField(
                        decimal_places=2,
                        default=49.0,
                        max_digits=5,
                        validators=[
                            django.core.validators.MinValueValidator(0),
                            django.core.validators.MaxValueValidator(100),
                        ],
                    ),
                ),
                ("require_all_three_terms", models.BooleanField(default=True)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_promotion_rules",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "promotion_rule",
                "verbose_name": "Promotion Rule",
                "verbose_name_plural": "Promotion Rules",
            },
        ),
        migrations.AddConstraint(
            model_name="promotionrule",
            constraint=models.UniqueConstraint(
                fields=["tenant", "education_level"],
                name="unique_promotion_rule_per_level",
            ),
        ),
        migrations.AddIndex(
            model_name="promotionrule",
            index=models.Index(
                fields=["tenant", "education_level"],
                name="promo_rule_tenant_level_idx",
            ),
        ),

        # ── StudentPromotion ─────────────────────────────────────────
        migrations.CreateModel(
            name="StudentPromotion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="tenants.tenant",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="student_promotions",
                        to="students.student",
                    ),
                ),
                (
                    "academic_session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="student_promotions",
                        to="academics.academicsession",
                    ),
                ),
                (
                    "student_class",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="student_promotions",
                        to="classroom.class",
                    ),
                ),
                ("term1_average", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("term2_average", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("term3_average", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("session_average", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("terms_counted", models.PositiveSmallIntegerField(default=0)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("PROMOTED", "Promoted"),
                            ("HELD_BACK", "Held back"),
                            ("FLAGGED", "Flagged for review"),
                        ],
                        db_index=True,
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                (
                    "promotion_type",
                    models.CharField(
                        blank=True,
                        choices=[("AUTO", "Auto-student_promotions"), ("MANUAL", "Manual override")],
                        max_length=10,
                        null=True,
                    ),
                ),
                ("reason", models.TextField(blank=True)),
                (
                    "processed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="processed_promotions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("pass_threshold_applied", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "student_promotion",
                "verbose_name": "Student Promotion",
                "verbose_name_plural": "Student Promotions",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="studentpromotion",
            constraint=models.UniqueConstraint(
                fields=["tenant", "student", "academic_session"],
                name="unique_student_promotion_per_session",
            ),
        ),
        migrations.AddIndex(
            model_name="studentpromotion",
            index=models.Index(
                fields=["tenant", "academic_session"],
                name="promo_tenant_session_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="studentpromotion",
            index=models.Index(
                fields=["tenant", "student_class"],
                name="promo_tenant_class_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="studentpromotion",
            index=models.Index(
                fields=["tenant", "status"],
                name="promo_tenant_status_idx",
            ),
        ),
    ]