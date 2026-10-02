from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exam", "0004_sound_clips"),
    ]

    operations = [
        migrations.AddField(
            model_name="exam",
            name="plain_page",
            field=models.TextField(
                blank=True,
                help_text="HTML of the exam paper typed freely in the Plain Page tab",
            ),
        ),
        migrations.AddField(
            model_name="exam",
            name="print_plain_page",
            field=models.BooleanField(
                default=False,
                help_text="Print the plain page exactly as typed instead of the question sections",
            ),
        ),
    ]
