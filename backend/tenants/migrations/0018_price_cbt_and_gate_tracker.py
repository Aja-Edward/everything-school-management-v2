from decimal import Decimal

from django.db import migrations

# service: (per student per term, per student per session, description)
PRICES = {
    "cbt": (
        Decimal("100.00"), Decimal("300.00"),
        "Students sit exams on computers, with objective questions marked automatically.",
    ),
    "gate_tracker": (
        Decimal("1300.00"), Decimal("3900.00"),
        "Records each student's arrival and departure at the school gate by chip scan.",
    ),
}


def set_prices(apps, schema_editor):
    ServicePricing = apps.get_model("tenants", "ServicePricing")
    for service, (term, session, description) in PRICES.items():
        ServicePricing.objects.update_or_create(
            service=service,
            defaults={
                "price_per_student": term,
                "price_per_student_per_session": session,
                "description": description,
                "is_base_service": False,
                "is_active": True,
            },
        )


def remove_prices(apps, schema_editor):
    ServicePricing = apps.get_model("tenants", "ServicePricing")
    ServicePricing.objects.filter(service__in=PRICES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0017_cbt_gate_tracker_session_pricing"),
    ]

    operations = [
        migrations.RunPython(set_prices, remove_prices),
    ]
