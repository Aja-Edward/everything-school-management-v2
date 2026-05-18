"""
Data migration: seed default staff activity categories for every existing tenant.
Runs automatically via `python manage.py migrate` (called in build.sh on deploy).
Safe to re-run — uses get_or_create so existing records are never duplicated.
"""
from django.db import migrations


DEFAULT_CATEGORIES = [
    {
        "name": "Vehicle Trip",
        "code": "vehicle_trip",
        "icon": "\U0001f68c",
        "applicable_to": "non-teaching",
        "description": "Record student pick-up / drop-off routes and journey details.",
        "display_order": 1,
        "fields_config": [
            {"key": "route", "label": "Route / Destination", "type": "text", "required": True},
            {"key": "departure_time", "label": "Departure Time", "type": "time", "required": True},
            {"key": "arrival_time", "label": "Arrival Time", "type": "time", "required": True},
            {"key": "students_picked", "label": "Students Picked Up", "type": "number", "required": False},
            {"key": "students_dropped", "label": "Students Dropped Off", "type": "number", "required": False},
            {"key": "odometer_start", "label": "Odometer Start (km)", "type": "number", "required": False},
            {"key": "odometer_end", "label": "Odometer End (km)", "type": "number", "required": False},
            {"key": "fuel_added", "label": "Fuel Added (litres)", "type": "number", "required": False},
            {"key": "vehicle", "label": "Vehicle / Plate No.", "type": "text", "required": False},
        ],
    },
    {
        "name": "Vehicle Servicing / Repair",
        "code": "vehicle_maintenance",
        "icon": "\U0001f527",
        "applicable_to": "non-teaching",
        "description": "Record vehicle maintenance, servicing, or repair activities.",
        "display_order": 2,
        "fields_config": [
            {"key": "vehicle", "label": "Vehicle / Plate No.", "type": "text", "required": True},
            {"key": "service_type", "label": "Service Type", "type": "select", "required": True,
             "options": ["Routine Service", "Tyre Change", "Engine Repair", "Electrical Fault", "Body Work", "Other"]},
            {"key": "workshop", "label": "Workshop / Mechanic", "type": "text", "required": False},
            {"key": "cost", "label": "Cost (NGN)", "type": "number", "required": False},
            {"key": "parts_replaced", "label": "Parts Replaced", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "Marketing / Outreach",
        "code": "marketing_outreach",
        "icon": "\U0001f4e3",
        "applicable_to": "all",
        "description": "Record school marketing visits, community outreach, or promotional activities.",
        "display_order": 3,
        "fields_config": [
            {"key": "location", "label": "Location Visited", "type": "text", "required": True},
            {"key": "activity_type", "label": "Activity Type", "type": "select", "required": True,
             "options": ["Flyer Distribution", "Community Visit", "School Visit", "Event Attendance", "Social Media", "Other"]},
            {"key": "contacts_reached", "label": "People / Contacts Reached", "type": "number", "required": False},
            {"key": "outcome", "label": "Outcome / Observations", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "Cleaning / Sanitation",
        "code": "cleaning",
        "icon": "\U0001f9f9",
        "applicable_to": "non-teaching",
        "description": "Log cleaning and sanitation tasks completed.",
        "display_order": 4,
        "fields_config": [
            {"key": "areas_covered", "label": "Areas / Rooms Covered", "type": "textarea", "required": True},
            {"key": "tasks_done", "label": "Tasks Completed", "type": "select", "required": True,
             "options": ["Sweeping & Mopping", "Toilet Cleaning", "Bin Emptying", "Window Cleaning",
                         "General Disinfection", "Outdoor/Compound", "Other"]},
            {"key": "materials_used", "label": "Materials / Products Used", "type": "text", "required": False},
        ],
    },
    {
        "name": "Student Care / Creche",
        "code": "student_care",
        "icon": "\U0001f476",
        "applicable_to": "non-teaching",
        "description": "Record child care, creche, and nursery support activities.",
        "display_order": 5,
        "fields_config": [
            {"key": "children_count", "label": "Number of Children", "type": "number", "required": True},
            {"key": "activities", "label": "Activities Conducted", "type": "textarea", "required": True},
            {"key": "incidents", "label": "Incidents / Observations", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "Security Duty",
        "code": "security",
        "icon": "\U0001f512",
        "applicable_to": "non-teaching",
        "description": "Log security checks, gate duty, and incidents.",
        "display_order": 6,
        "fields_config": [
            {"key": "shift", "label": "Shift", "type": "select", "required": True,
             "options": ["Morning", "Afternoon", "Evening", "Night", "Full Day"]},
            {"key": "visitors_logged", "label": "Visitors Logged", "type": "number", "required": False},
            {"key": "incidents", "label": "Incidents / Observations", "type": "textarea", "required": False},
        ],
    },
    {
        "name": "General Duty",
        "code": "general_duty",
        "icon": "\U0001f4cb",
        "applicable_to": "all",
        "description": "Any other task or duty not covered by the above categories.",
        "display_order": 99,
        "fields_config": [
            {"key": "task_summary", "label": "Task Summary", "type": "textarea", "required": True},
            {"key": "outcome", "label": "Outcome", "type": "textarea", "required": False},
        ],
    },
]


def seed_categories(apps, schema_editor):
    StaffActivityCategory = apps.get_model("teacher", "StaffActivityCategory")
    Tenant = apps.get_model("tenants", "Tenant")

    created_total = 0
    for tenant in Tenant.objects.all():
        for cat in DEFAULT_CATEGORIES:
            _, created = StaffActivityCategory.objects.get_or_create(
                tenant=tenant,
                code=cat["code"],
                defaults={**cat, "tenant": tenant, "is_system_default": True, "is_active": True},
            )
            if created:
                created_total += 1

    if created_total:
        print(f"\n  Seeded {created_total} activity categories across all tenants.")


def unseed_categories(apps, schema_editor):
    """Reverse: remove only system-default categories (tenant-created ones are untouched)."""
    StaffActivityCategory = apps.get_model("teacher", "StaffActivityCategory")
    codes = [c["code"] for c in DEFAULT_CATEGORIES]
    StaffActivityCategory.objects.filter(code__in=codes, is_system_default=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("teacher", "0008_add_staff_activity_models"),
        ("tenants", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_categories, reverse_code=unseed_categories),
    ]
