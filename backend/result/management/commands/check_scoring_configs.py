# results/management/commands/check_scoring_configs.py
from django.core.management.base import BaseCommand
from result.models import ScoringConfiguration
from django.db import connection
from decimal import Decimal
import json


class Command(BaseCommand):
    help = "Check existing scoring configurations in Supabase database"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("\n=== CHECKING NEON DATABASE ===\n"))

        # 1. Check if table exists
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'results_scoring_configuration'
                );
            """
            )
            table_exists = cursor.fetchone()[0]

        if not table_exists:
            self.stdout.write(
                self.style.ERROR(
                    'Table "results_scoring_configuration" does not exist in database!'
                )
            )
            self.stdout.write(
                self.style.WARNING(
                    "Run: python manage.py makemigrations && python manage.py migrate"
                )
            )
            return

        self.stdout.write(self.style.SUCCESS("✓ Table exists\n"))

        # 2. Get all scoring configurations
        configs = ScoringConfiguration.objects.all().order_by(
            "education_level", "result_type"
        )

        if not configs.exists():
            self.stdout.write(
                self.style.WARNING("⚠ No scoring configurations found in database\n")
            )
            self.stdout.write(
                "Database is empty. Ready to create default configurations.\n"
            )
            return

        self.stdout.write(
            self.style.SUCCESS(f"Found {configs.count()} scoring configuration(s):\n")
        )

        # 3. Display configurations grouped by education level
        for level in ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"]:
            level_configs = configs.filter(education_level=level)

            if level_configs.exists():
                self.stdout.write(self.style.HTTP_INFO(f'\n{"-"*80}'))
                self.stdout.write(self.style.HTTP_INFO(f'{level.replace("_", " ")}'))
                self.stdout.write(self.style.HTTP_INFO(f'{"-"*80}'))

                for config in level_configs:
                    self.display_config(config)

        # 4. Check for default configurations
        self.stdout.write(self.style.HTTP_INFO(f'\n{"-"*80}'))
        self.stdout.write(self.style.HTTP_INFO("DEFAULT CONFIGURATIONS"))
        self.stdout.write(self.style.HTTP_INFO(f'{"-"*80}\n'))

        default_configs = configs.filter(is_default=True)
        if default_configs.exists():
            for config in default_configs:
                self.stdout.write(f"  ✓ {config.education_level}: {config.name}")
        else:
            self.stdout.write(self.style.WARNING("  ⚠ No default configurations set"))

        self.stdout.write("\n")

    def display_config(self, config):
        """Display a single configuration in detail"""
        self.stdout.write(f"\nID: {config.id}")
        self.stdout.write(f"Name: {config.name}")
        self.stdout.write(f"Result Type: {config.get_result_type_display()}")
        self.stdout.write(f'Is Default: {"Yes" if config.is_default else "No"}')
        self.stdout.write(f'Is Active: {"Yes" if config.is_active else "No"}')

        if config.education_level == "SENIOR_SECONDARY":
            self.stdout.write("\nScoring Breakdown:")
            if config.result_type == "TERMLY":
                self.stdout.write(f"  - 1st Test: {config.test1_max_score}")
                self.stdout.write(f"  - 2nd Test: {config.test2_max_score}")
                self.stdout.write(f"  - 3rd Test: {config.test3_max_score}")
                self.stdout.write(f"  - Exam: {config.exam_max_score}")
                self.stdout.write(f"  - Total CA: {config.ca_total_max_score}")
                self.stdout.write(f"  - CA Weight: {config.ca_weight_percentage}%")
                self.stdout.write(f"  - Exam Weight: {config.exam_weight_percentage}%")
            else:  # SESSION
                self.stdout.write(f"  - 1st Term Score: {config.test1_max_score}")
                self.stdout.write(f"  - 2nd Term Score: {config.test2_max_score}")
                self.stdout.write(f"  - 3rd Term Score: {config.test3_max_score}")
            self.stdout.write(f"  - Total Max Score: {config.total_max_score}")

        elif config.education_level in ["PRIMARY", "JUNIOR_SECONDARY"]:
            self.stdout.write("\nScoring Breakdown:")
            self.stdout.write(f"  - CA Score: {config.continuous_assessment_max_score}")
            self.stdout.write(f"  - Take Home Test: {config.take_home_test_max_score}")
            self.stdout.write(f"  - Appearance: {config.appearance_max_score}")
            self.stdout.write(f"  - Practical: {config.practical_max_score}")
            self.stdout.write(f"  - Project: {config.project_max_score}")
            self.stdout.write(f"  - Note Copying: {config.note_copying_max_score}")
            self.stdout.write(f"  - Exam: {config.exam_max_score}")
            self.stdout.write(f"  - Total Max Score: {config.total_max_score}")

        elif config.education_level == "NURSERY":
            self.stdout.write("\nScoring Breakdown:")
            self.stdout.write(f"  - Max Mark Obtainable: {config.total_max_score}")

        if config.created_by:
            self.stdout.write(
                f"\nCreated By: {config.created_by.first_name} ({config.created_by.email})"
            )
        self.stdout.write(
            f'Created At: {config.created_at.strftime("%Y-%m-%d %H:%M:%S")}'
        )
        self.stdout.write(
            f'Updated At: {config.updated_at.strftime("%Y-%m-%d %H:%M:%S")}'
        )


class Command2(BaseCommand):
    """Export configurations to JSON for backup"""

    help = "Export scoring configurations to JSON"

    def handle(self, *args, **options):
        configs = ScoringConfiguration.objects.all()

        if not configs.exists():
            self.stdout.write(self.style.WARNING("No configurations to export"))
            return

        export_data = []
        for config in configs:
            data = {
                "id": config.id,
                "name": config.name,
                "education_level": config.education_level,
                "result_type": config.result_type,
                "description": config.description,
                "is_default": config.is_default,
                "is_active": config.is_active,
            }

            # Add level-specific fields
            if config.education_level == "SENIOR_SECONDARY":
                data.update(
                    {
                        "test1_max_score": str(config.test1_max_score),
                        "test2_max_score": str(config.test2_max_score),
                        "test3_max_score": str(config.test3_max_score),
                        "exam_max_score": str(config.exam_max_score),
                        "ca_weight_percentage": str(config.ca_weight_percentage),
                        "exam_weight_percentage": str(config.exam_weight_percentage),
                    }
                )
            elif config.education_level in ["PRIMARY", "JUNIOR_SECONDARY"]:
                data.update(
                    {
                        "continuous_assessment_max_score": str(
                            config.continuous_assessment_max_score
                        ),
                        "take_home_test_max_score": str(
                            config.take_home_test_max_score
                        ),
                        "appearance_max_score": str(config.appearance_max_score),
                        "practical_max_score": str(config.practical_max_score),
                        "project_max_score": str(config.project_max_score),
                        "note_copying_max_score": str(config.note_copying_max_score),
                        "exam_max_score": str(config.exam_max_score),
                    }
                )

            data["total_max_score"] = str(config.total_max_score)
            export_data.append(data)

        output_file = "scoring_configs_backup.json"
        with open(output_file, "w") as f:
            json.dump(export_data, f, indent=2)

        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Exported {len(export_data)} configurations to {output_file}"
            )
        )
