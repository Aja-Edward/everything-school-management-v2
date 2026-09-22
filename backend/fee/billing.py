"""
Issuing a school's fees to its students.

A fee item (FeeStructure) says what a fee is and what it costs. Issuing it
turns it into a bill per student (StudentFee) for one term of one session,
which is what parents see, pay and are reminded about.

Every child after the first in a family pays SIBLING_DISCOUNT less on tuition:
children are ranked by when they joined the school, so the eldest joiner pays
in full. A family here means children sharing a parent at this school.

Nothing is issued twice: a student who already has this fee for this term is
left alone, so issuing again after adding a student bills only the new one.
"""
from collections import defaultdict
from decimal import Decimal

from django.db import transaction

from parent.models import ParentStudentRelationship
from students.models import Student

from .models import FeeStructure, StudentFee

# Off tuition, for each child after the first in the same family.
SIBLING_DISCOUNT = Decimal("0.10")
SIBLING_DISCOUNT_APPLIES_TO = ("TUITION",)


class BillingError(Exception):
    """The fees cannot be issued as asked; the message says why."""


def _rank_in_family(tenant, students):
    """
    How many siblings joined the school before each student, by student id.

    Ranked by admission date, then by id for children admitted the same day
    (or with no date recorded), so the order never changes between runs.
    """
    links = (ParentStudentRelationship.objects
             .filter(student__tenant=tenant)
             .values_list("parent_id", "student_id"))
    children_of = defaultdict(set)
    parents_of = defaultdict(set)
    for parent_id, student_id in links:
        children_of[parent_id].add(student_id)
        parents_of[student_id].add(parent_id)

    family_ids = set()
    for student in students:
        for parent_id in parents_of[student.id]:
            family_ids |= children_of[parent_id]

    joined = {
        student.id: (student.admission_date or student.user.date_joined.date(), student.id)
        for student in Student.objects.filter(
            tenant=tenant, id__in=family_ids).select_related("user")
    }

    rank = {}
    for student in students:
        siblings = set()
        for parent_id in parents_of[student.id]:
            siblings |= children_of[parent_id]
        siblings.discard(student.id)
        mine = joined.get(student.id)
        if mine is None:
            rank[student.id] = 0
            continue
        rank[student.id] = sum(
            1 for sibling in siblings
            if sibling in joined and joined[sibling] < mine)
    return rank


def sibling_discount(fee_structure, amount, older_siblings):
    """What comes off this fee for a child with `older_siblings` ahead of them."""
    if not older_siblings or fee_structure.fee_type not in SIBLING_DISCOUNT_APPLIES_TO:
        return Decimal("0.00")
    return (amount * SIBLING_DISCOUNT).quantize(Decimal("0.01"))


def students_for(tenant, student_ids=None, student_class=None, education_level=None):
    students = Student.objects.filter(tenant=tenant, is_active=True).select_related("user")
    if student_ids:
        students = students.filter(id__in=student_ids)
    if student_class is not None:
        students = students.filter(student_class=student_class)
    if education_level is not None:
        students = students.filter(student_class__education_level=education_level)
    return students


@transaction.atomic
def issue_fees(tenant, fee_structure, academic_session, term, due_date,
               student_ids=None, student_class=None, education_level=None):
    """
    Give each chosen student this fee for this term. Returns what happened:
    how many were billed, how many already had it, and what came off for
    siblings.
    """
    if fee_structure.tenant_id != tenant.id:
        raise BillingError("That fee belongs to another school.")
    if academic_session.tenant_id != tenant.id:
        raise BillingError("That academic session belongs to another school.")

    students = list(students_for(tenant, student_ids, student_class, education_level))
    if not students:
        raise BillingError("No active students match that class or level.")

    already = set(
        StudentFee.objects
        .filter(tenant=tenant, fee_structure=fee_structure,
                academic_session=academic_session, term=term)
        .values_list("student_id", flat=True))

    rank = _rank_in_family(tenant, students)
    amount = Decimal(fee_structure.amount)
    bills, discounted, total_discount = [], 0, Decimal("0.00")

    for student in students:
        if student.id in already:
            continue
        discount = sibling_discount(fee_structure, amount, rank.get(student.id, 0))
        if discount:
            discounted += 1
            total_discount += discount
        bills.append(StudentFee(
            tenant=tenant, student=student, fee_structure=fee_structure,
            academic_session=academic_session, term=term, amount_due=amount,
            discount_amount=discount, due_date=due_date, status="PENDING",
            remarks=(f"Sibling discount: {int(SIBLING_DISCOUNT * 100)}% off "
                     f"for a younger child" if discount else ""),
        ))

    StudentFee.objects.bulk_create(bills)
    return {
        "billed": len(bills),
        "already_had_it": len(students) - len(bills),
        "students_with_sibling_discount": discounted,
        "sibling_discount_total": str(total_discount),
        "amount_each": str(amount),
    }
