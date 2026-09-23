from django.db import migrations
from django.utils import timezone


def switch_off_arrivals_without_the_gate(apps, schema_editor):
    """
    Arrival notifications only work alongside the Gate Tracker. Schools that
    had them on without it get them switched off, as the toggle now does.
    """
    TenantService = apps.get_model('tenants', 'TenantService')
    with_gate = TenantService.objects.filter(
        service='gate_tracker', is_enabled=True).values_list('tenant_id', flat=True)
    TenantService.objects.filter(
        service='arrival_notification', is_enabled=True,
    ).exclude(tenant_id__in=list(with_gate)).update(
        is_enabled=False, disabled_at=timezone.now())


class Migration(migrations.Migration):
    dependencies = [('tenants', '0021_tenant_pricing')]

    operations = [
        migrations.RunPython(switch_off_arrivals_without_the_gate, migrations.RunPython.noop),
    ]
