"""
Data migration: seed default appraisal criteria for every existing tenant.
Runs automatically via `python manage.py migrate` (called in build.sh on deploy).
"""
from django.db import migrations

DEFAULT_CRITERIA = [
    {"name": "Punctuality & Attendance", "code": "punctuality",
     "description": "Regular and timely arrival to school and assigned duties.",
     "applicable_to": "all", "max_score": 5, "display_order": 1},
    {"name": "Lesson Preparation & Planning", "code": "lesson_planning",
     "description": "Quality of lesson notes, scheme of work, and teaching aids.",
     "applicable_to": "teaching", "max_score": 5, "display_order": 2},
    {"name": "Classroom Management", "code": "classroom_management",
     "description": "Ability to maintain order, engagement, and a conducive learning environment.",
     "applicable_to": "teaching", "max_score": 5, "display_order": 3},
    {"name": "Subject Knowledge & Delivery", "code": "subject_knowledge",
     "description": "Depth of subject expertise and clarity of teaching delivery.",
     "applicable_to": "teaching", "max_score": 5, "display_order": 4},
    {"name": "Student Assessment & Feedback", "code": "assessment",
     "description": "Quality and timeliness of marking, grading, and feedback to students.",
     "applicable_to": "teaching", "max_score": 5, "display_order": 5},
    {"name": "Student Relations & Welfare", "code": "student_relations",
     "description": "Positive, supportive relationship with students; attention to welfare.",
     "applicable_to": "teaching", "max_score": 5, "display_order": 6},
    {"name": "Professional Conduct", "code": "professional_conduct",
     "description": "Dress code, language, attitude, and adherence to school policies.",
     "applicable_to": "all", "max_score": 5, "display_order": 7},
    {"name": "Teamwork & Collaboration", "code": "teamwork",
     "description": "Works well with colleagues, participates in staff meetings and activities.",
     "applicable_to": "all", "max_score": 5, "display_order": 8},
    {"name": "Initiative & Innovation", "code": "initiative",
     "description": "Proactively improves processes, shows creativity in duties.",
     "applicable_to": "all", "max_score": 5, "display_order": 9},
    {"name": "Administrative Duties", "code": "admin_duties",
     "description": "Timely submission of reports, records, and administrative tasks.",
     "applicable_to": "all", "max_score": 5, "display_order": 10},
    {"name": "Duty Performance", "code": "duty_performance",
     "description": "Quality and consistency of assigned non-teaching duties.",
     "applicable_to": "non-teaching", "max_score": 5, "display_order": 11},
]


def seed_criteria(apps, schema_editor):
    AppraisalCriteria = apps.get_model("teacher", "AppraisalCriteria")
    Tenant = apps.get_model("tenants", "Tenant")
    created_total = 0
    for tenant in Tenant.objects.all():
        for item in DEFAULT_CRITERIA:
            _, created = AppraisalCriteria.objects.get_or_create(
                tenant=tenant,
                code=item["code"],
                defaults={**item, "tenant": tenant, "is_system_default": True, "is_active": True},
            )
            if created:
                created_total += 1
    if created_total:
        print(f"\n  Seeded {created_total} appraisal criteria across all tenants.")


def unseed_criteria(apps, schema_editor):
    AppraisalCriteria = apps.get_model("teacher", "AppraisalCriteria")
    codes = [c["code"] for c in DEFAULT_CRITERIA]
    AppraisalCriteria.objects.filter(code__in=codes, is_system_default=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("teacher", "0010_add_appraisal_and_staff_note_models"),
        ("tenants", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_criteria, reverse_code=unseed_criteria),
    ]
