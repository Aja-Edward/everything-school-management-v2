from django.db import migrations


def migrate_student_class_fk(apps, schema_editor):
    ResultSheet = apps.get_model("result", "ResultSheet")
    StudentClass = apps.get_model("students", "Class")

    # Create mapping {class_name: class_object}
    class_map = {
        cls.name: cls for cls in StudentClass.objects.all()
    }

    for sheet in ResultSheet.objects.all():
        if sheet.student_class:
            cls = class_map.get(sheet.student_class)

            if cls:
                sheet.student_class_fk = cls
                sheet.save(update_fields=["student_class_fk"])


class Migration(migrations.Migration):

    dependencies = [
        ("result", "0009_alter_scoringconfiguration_options_and_more"),
    ]

    operations = [
        migrations.RunPython(migrate_student_class_fk, reverse_code=migrations.RunPython.noop),
    ]