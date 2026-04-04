from .models import TermType

def seed_default_term_types(tenant):
    # Prevent duplicates
    if TermType.objects.filter(tenant=tenant).exists():
        return

    TermType.objects.bulk_create([
        TermType(name="First Term", code="FT", display_order=1, tenant=tenant),
        TermType(name="Second Term", code="ST", display_order=2, tenant=tenant),
        TermType(name="Third Term", code="TT", display_order=3, tenant=tenant),
    ])