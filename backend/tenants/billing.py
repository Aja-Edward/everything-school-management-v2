"""
What a school owes the platform for a term or a session.

The Basic package covers every service except the add-ons, at
BASIC_PRICE_PER_STUDENT per student per term, whichever of those services the
school uses. Each add-on the school has switched on is billed on top at its
ServicePricing price. A session is billed as three terms: the Basic package is
tripled, and add-ons are charged at their session price.

Students are counted when the invoice is raised, and again whenever an unpaid
invoice is brought up to date.
"""

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import List, Optional

from django.db import transaction
from django.utils import timezone

from academics.models import AcademicSession, Term
from students.models import Student

from .models import (
    BASIC_PRICE_PER_STUDENT, TERMS_PER_SESSION,
    ServicePricing, TenantInvoice, TenantInvoiceLineItem, TenantService,
)

PAYMENT_DUE_AFTER = timedelta(days=14)


class BillingError(Exception):
    """The school cannot be invoiced yet; the message says why."""


@dataclass
class Line:
    item_type: str
    service: Optional[str]
    description: str
    quantity: int
    unit_price: Decimal

    @property
    def amount(self):
        return self.unit_price * self.quantity


@dataclass
class Quote:
    billing_period: str
    academic_session: AcademicSession
    term: Optional[Term]
    student_count: int
    lines: List[Line]

    @property
    def total(self):
        return sum((line.amount for line in self.lines), Decimal('0.00'))


def current_period(tenant, billing_period):
    """The session the school is in, and for termly billing its current term."""
    settings = getattr(tenant, 'settings', None)
    session = (
        getattr(settings, 'current_session', None)
        or AcademicSession.objects.filter(tenant=tenant, is_current=True).first()
    )
    if session is None:
        raise BillingError(
            "Set the current academic session in school settings before generating an invoice.")
    if billing_period == 'session':
        return session, None

    term = getattr(settings, 'current_term', None)
    if term is None or term.academic_session_id != session.id:
        term = Term.objects.filter(academic_session=session, is_current=True).first()
    if term is None:
        raise BillingError(
            "Set the current term in school settings before generating a termly invoice.")
    return session, term


def active_student_count(tenant):
    return Student.objects.filter(tenant=tenant, is_active=True).count()


def price_lines(tenant, billing_period, student_count):
    per_session = billing_period == 'session'
    terms = TERMS_PER_SESSION if per_session else 1
    lines = [Line(
        'base', None, 'Basic package', student_count, BASIC_PRICE_PER_STUDENT * terms)]

    enabled_add_ons = tenant.services.filter(
        is_enabled=True, service__in=TenantService.ADD_ON_SERVICES,
    ).values_list('service', flat=True)
    add_on_prices = ServicePricing.objects.filter(
        service__in=list(enabled_add_ons), is_active=True).order_by('service')
    for pricing in add_on_prices:
        lines.append(Line(
            'service', pricing.service, pricing.get_service_display(), student_count,
            pricing.session_price if per_session else pricing.price_per_student,
        ))
    return lines


def quote(tenant, billing_period):
    """What an invoice for the current term or session would come to now."""
    session, term = current_period(tenant, billing_period)
    students = active_student_count(tenant)
    return Quote(
        billing_period, session, term, students,
        price_lines(tenant, billing_period, students))


def is_settled_or_settling(invoice):
    """
    Money has been paid against it, or a bank transfer awaits confirmation:
    repricing now would leave the payment matching neither amount.
    """
    return invoice.amount_paid > 0 or invoice.payments.filter(
        payment_method='manual', status='pending').exists()


def refresh_invoice(invoice):
    """Recount the students and reprice the lines of an invoice nobody has paid."""
    students = active_student_count(invoice.tenant)
    lines = price_lines(invoice.tenant, invoice.billing_period, students)

    invoice.base_price_per_student = BASIC_PRICE_PER_STUDENT
    invoice.student_count = students
    invoice.line_items.all().delete()
    # bulk_create skips TenantInvoiceLineItem.save(), so amount is set here.
    TenantInvoiceLineItem.objects.bulk_create([
        TenantInvoiceLineItem(
            invoice=invoice, item_type=line.item_type, service=line.service,
            description=line.description, quantity=line.quantity,
            unit_price=line.unit_price, amount=line.amount)
        for line in lines
    ])
    invoice.save()  # recalculates the totals from the new lines


@transaction.atomic
def invoice_for_period(tenant, billing_period):
    """
    The school's invoice for its current term or session: raised now, or the
    one already raised brought up to date if nothing has been paid on it.
    Returns (invoice, created).
    """
    session, term = current_period(tenant, billing_period)
    if active_student_count(tenant) == 0:
        raise BillingError("There are no active students to bill for.")

    invoice = (
        TenantInvoice.objects.select_for_update()
        .filter(tenant=tenant, billing_period=billing_period,
                academic_session=session, term=term)
        .exclude(status='cancelled')
        .first()
    )
    if invoice is not None and is_settled_or_settling(invoice):
        return invoice, False

    created = invoice is None
    if created:
        invoice = TenantInvoice.objects.create(
            tenant=tenant, billing_period=billing_period,
            academic_session=session, term=term, status='pending',
            due_date=timezone.localdate() + PAYMENT_DUE_AFTER,
        )
    refresh_invoice(invoice)
    return invoice, created
