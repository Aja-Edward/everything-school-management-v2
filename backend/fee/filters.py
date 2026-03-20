# fee/filters.py
import django_filters
from .models import (
    StudentFee,
    Payment,
    FeeStructure,
    FEE_TYPE_CHOICES,
    PAYMENT_STATUS_CHOICES,
)


class StudentFeeFilter(django_filters.FilterSet):
    student_name = django_filters.CharFilter(
        field_name="student__user__first_name", lookup_expr="icontains"
    )
    fee_type = django_filters.ChoiceFilter(
        field_name="fee_structure__fee_type", choices=FEE_TYPE_CHOICES
    )
    status = django_filters.ChoiceFilter(choices=PAYMENT_STATUS_CHOICES)
    due_date_from = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    due_date_to = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")
    amount_due_min = django_filters.NumberFilter(
        field_name="amount_due", lookup_expr="gte"
    )
    amount_due_max = django_filters.NumberFilter(
        field_name="amount_due", lookup_expr="lte"
    )

    class Meta:
        model = StudentFee
        fields = ["student", "fee_structure", "academic_session", "term", "status"]


class PaymentFilter(django_filters.FilterSet):
    payment_date_from = django_filters.DateFilter(
        field_name="payment_date", lookup_expr="gte"
    )
    payment_date_to = django_filters.DateFilter(
        field_name="payment_date", lookup_expr="lte"
    )
    amount_min = django_filters.NumberFilter(field_name="amount", lookup_expr="gte")
    amount_max = django_filters.NumberFilter(field_name="amount", lookup_expr="lte")

    class Meta:
        model = Payment
        fields = ["payment_method", "verified", "student_fee"]
