import django_filters
from django.db.models import Q
from .models import Attendance
from classroom.models import Stream
from students.models import Student
from students.constants import EDUCATION_LEVEL_CHOICES


class AttendanceFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(
        field_name="date", lookup_expr="gte"
    )
    end_date = django_filters.DateFilter(
        field_name="date", lookup_expr="lte"
    )
    date = django_filters.DateFilter(field_name="date")

    stream = django_filters.ModelChoiceFilter(
        field_name="student__stream",
        queryset=Stream.objects.none(),  # overridden in __init__
        label="Stream",
    )
    education_level = django_filters.ChoiceFilter(
        field_name="student__education_level",
        choices=EDUCATION_LEVEL_CHOICES,  # single source of truth
        label="Education Level",
    )

    class Meta:
        model = Attendance
        fields = [
            "start_date",
            "end_date",
            "date",
            "student",
            "teacher",
            "section",
            "status",
            "stream",
            "education_level",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.request
        if request and hasattr(request, "tenant"):
            self.filters["stream"].queryset = Stream.objects.filter(
                tenant=request.tenant
            )
        else:
            self.filters["stream"].queryset = Stream.objects.none()
