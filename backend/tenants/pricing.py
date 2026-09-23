"""
What one school pays for each thing it is billed for.

A platform admin agrees prices with each school when it subscribes
(TenantPricing and TenantAddOnPrice). Whatever was not agreed is charged at
the standard price: BASIC_PRICE_PER_STUDENT, the add-on's ServicePricing row,
and SMS_PRICE_PER_MESSAGE.
"""
from decimal import Decimal

from django.db import transaction

from .models import (
    BASIC_PRICE_PER_STUDENT, SMS_PRICE_PER_MESSAGE, TERMS_PER_SESSION,
    ServicePricing, TenantAddOnPrice, TenantPricing, TenantService,
)


class PricingError(Exception):
    """The prices given cannot be saved; the message says why."""


def agreement(tenant):
    """The school's TenantPricing, or None if it pays the standard prices."""
    return TenantPricing.objects.filter(tenant=tenant).first()


def basic_price(tenant, per_session=False, agreed=None):
    """The Basic package, per student, for a term or a whole session."""
    agreed = agreed if agreed is not None else agreement(tenant)
    term_price = agreed.basic_price_per_student if agreed else BASIC_PRICE_PER_STUDENT
    if not per_session:
        return term_price
    if agreed and agreed.basic_price_per_student_per_session is not None:
        return agreed.basic_price_per_student_per_session
    return term_price * TERMS_PER_SESSION


def sms_price(tenant, agreed=None):
    """Per text sent."""
    agreed = agreed if agreed is not None else agreement(tenant)
    if agreed and agreed.sms_price_per_message is not None:
        return agreed.sms_price_per_message
    return SMS_PRICE_PER_MESSAGE


def add_on_prices(tenant, services):
    """
    {service: (term price, session price)} for the per-student add-ons given:
    the school's own where one was agreed, else the standard. An add-on with
    neither is left out, since nothing says what to charge for it.
    """
    services = list(services)
    prices = {
        p.service: (p.price_per_student, p.session_price)
        for p in ServicePricing.objects.filter(service__in=services, is_active=True)
    }
    for agreed in TenantAddOnPrice.objects.filter(tenant=tenant, service__in=services):
        prices[agreed.service] = (agreed.price_per_student, agreed.session_price)
    return prices


def per_student_add_ons():
    return [s for s in TenantService.ADD_ON_SERVICES
            if s not in TenantService.PER_MESSAGE_ADD_ONS]


def _money(value):
    return None if value is None else str(Decimal(value).quantize(Decimal('0.01')))


def summary(tenant):
    """A school's prices for the platform admin: what was agreed, and the standard."""
    agreed = agreement(tenant)
    services = per_student_add_ons()
    standard = {p.service: p for p in ServicePricing.objects.filter(
        service__in=services, is_active=True)}
    own = {p.service: p for p in TenantAddOnPrice.objects.filter(tenant=tenant)}
    names = dict(TenantService.SERVICE_CHOICES)

    return {
        'agreed': agreed is not None,
        'notes': agreed.notes if agreed else '',
        'updated_at': agreed.updated_at if agreed else None,
        'basic': {
            'price_per_student': _money(agreed.basic_price_per_student) if agreed else None,
            'price_per_student_per_session':
                _money(agreed.basic_price_per_student_per_session) if agreed else None,
            'standard_price_per_student': _money(BASIC_PRICE_PER_STUDENT),
            'standard_price_per_student_per_session':
                _money(BASIC_PRICE_PER_STUDENT * TERMS_PER_SESSION),
        },
        'sms': {
            'price_per_message': _money(agreed.sms_price_per_message) if agreed else None,
            'standard_price_per_message': _money(SMS_PRICE_PER_MESSAGE),
            'is_enabled': TenantService.is_on(tenant, 'sms_notifications'),
        },
        'add_ons': [{
            'service': service,
            'name': names.get(service, service),
            'is_enabled': TenantService.is_on(tenant, service),
            'price_per_student': _money(own[service].price_per_student) if service in own else None,
            'price_per_student_per_session':
                _money(own[service].price_per_student_per_session) if service in own else None,
            'standard_price_per_student':
                _money(standard[service].price_per_student) if service in standard else None,
            'standard_price_per_student_per_session':
                _money(standard[service].session_price) if service in standard else None,
        } for service in services],
    }


def _price(value, label, required=False):
    if value in (None, ''):
        if required:
            raise PricingError(f"Enter the {label}.")
        return None
    try:
        price = Decimal(str(value))
    except Exception:
        raise PricingError(f"The {label} must be a number.")
    if price < 0 or not price.is_finite():
        raise PricingError(f"The {label} cannot be negative.")
    return price.quantize(Decimal('0.01'))


@transaction.atomic
def save(tenant, data, user):
    """
    Record the prices agreed with a school. An add-on price left blank goes
    back to the standard price. Returns the new summary.
    """
    basic = data.get('basic') or {}
    sms = data.get('sms') or {}
    TenantPricing.objects.update_or_create(tenant=tenant, defaults={
        'basic_price_per_student': _price(
            basic.get('price_per_student'), 'Basic price per student per term', required=True),
        'basic_price_per_student_per_session': _price(
            basic.get('price_per_student_per_session'), 'Basic price per student per session'),
        'sms_price_per_message': _price(sms.get('price_per_message'), 'price per SMS'),
        'notes': (data.get('notes') or '').strip(),
        'updated_by': user,
    })

    allowed = set(per_student_add_ons())
    for row in data.get('add_ons') or []:
        service = row.get('service')
        if service not in allowed:
            raise PricingError(f"{service} is not an add-on priced per student.")
        term = _price(row.get('price_per_student'), 'add-on price per student per term')
        session = _price(row.get('price_per_student_per_session'),
                         'add-on price per student per session')
        if term is None:
            if session is not None:
                raise PricingError("Give a term price for an add-on before its session price.")
            TenantAddOnPrice.objects.filter(tenant=tenant, service=service).delete()
            continue
        TenantAddOnPrice.objects.update_or_create(
            tenant=tenant, service=service,
            defaults={'price_per_student': term, 'price_per_student_per_session': session})
    return summary(tenant)


def reset(tenant):
    """Forget what was agreed: the school pays the standard prices again."""
    TenantPricing.objects.filter(tenant=tenant).delete()
    TenantAddOnPrice.objects.filter(tenant=tenant).delete()
    return summary(tenant)
