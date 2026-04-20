# result/filters.py
import django_filters

from .models import StudentTermResult


class StudentTermResultFilter(django_filters.FilterSet):
    # student pk is UUID — NumberFilter rejects UUID strings
    student = django_filters.UUIDFilter(field_name="student_id")

    # academic_session pk is an integer AutoField — NumberFilter correct
    academic_session = django_filters.NumberFilter(field_name="academic_session_id")

    # term is now a FK to academics.Term — filter by its integer pk
    term = django_filters.NumberFilter(field_name="term_id")

    # ChoiceFilter validates the value before hitting the DB
    status = django_filters.ChoiceFilter(choices=StudentTermResult.RESULT_STATUS)

    class Meta:
        model = StudentTermResult
        fields = ["student", "academic_session", "term", "status"]
