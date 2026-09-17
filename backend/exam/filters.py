import django_filters
from django import forms
from django.utils import timezone

from .models import Exam
from academics.models import TermType  # UPDATED: FK model replaces Term.TERM_CHOICES
from classroom.models import Stream


class ExamFilter(django_filters.FilterSet):

    # ------------------------------------------------------------------
    # Date range filters — unchanged
    # ------------------------------------------------------------------
    start_date = django_filters.DateFilter(
        field_name="exam_date",
        lookup_expr="gte",
        widget=forms.DateInput(attrs={"type": "date", "class": "form-control"}),
        label="From Date",
    )
    end_date = django_filters.DateFilter(
        field_name="exam_date",
        lookup_expr="lte",
        widget=forms.DateInput(attrs={"type": "date", "class": "form-control"}),
        label="To Date",
    )
    exam_date = django_filters.DateFilter(
        field_name="exam_date",
        widget=forms.DateInput(attrs={"type": "date", "class": "form-control"}),
        label="Exact Date",
    )

    # ------------------------------------------------------------------
    # Text search filters — unchanged
    # ------------------------------------------------------------------
    title = django_filters.CharFilter(
        lookup_expr="icontains",
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "Search exam title..."}
        ),
        label="Exam Title",
    )
    code = django_filters.CharFilter(
        lookup_expr="icontains",
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "Search exam code..."}
        ),
        label="Exam Code",
    )

    # ------------------------------------------------------------------
    # UPDATED: FK-based filters replace ChoiceFilters
    # ------------------------------------------------------------------

    # Filter by ExamType, given as its id or its code ("quiz").
    exam_type = django_filters.CharFilter(method="filter_exam_type", label="Exam Type")

    # Filter by ExamType code string — lets API callers pass ?exam_type_code=quiz
    exam_type_code = django_filters.CharFilter(
        field_name="exam_type__code",
        lookup_expr="exact",
        label="Exam Type Code",
    )

    # Filter by ExamStatus, given as its id or its code ("pending_approval").
    status = django_filters.CharFilter(method="filter_status", label="Status")

    # Filter by ExamStatus code string — lets API callers pass ?status_code=scheduled
    status_code = django_filters.CharFilter(
        field_name="status__code",
        lookup_expr="exact",
        label="Status Code",
    )

    # Filter by DifficultyLevel, given as its id or its code ("hard").
    difficulty_level = django_filters.CharFilter(
        method="filter_difficulty_level", label="Difficulty")

    # Filter by DifficultyLevel code string — lets API callers pass ?difficulty_code=hard
    difficulty_code = django_filters.CharFilter(
        field_name="difficulty_level__code",
        lookup_expr="exact",
        label="Difficulty Code",
    )

    # UPDATED: Term is now a FK to TermType — filter via exam_schedule term's term_type
    # exam.term resolves through exam_schedule → term → term_type
    term_type = django_filters.ModelChoiceFilter(
        queryset=TermType.objects.all(),
        field_name="exam_schedule__term__term_type",
        empty_label="All Terms",
        widget=forms.Select(attrs={"class": "form-control"}),
        label="Term",
    )

    # Filter by term type code string — lets API callers pass ?term_code=first
    term_code = django_filters.CharFilter(
        field_name="exam_schedule__term__term_type__code",
        lookup_expr="exact",
        label="Term Code",
    )

    # ------------------------------------------------------------------
    # Stream filter — unchanged (Stream is already a ModelChoiceFilter)
    # ------------------------------------------------------------------
    stream = django_filters.ModelChoiceFilter(
        queryset=Stream.objects.all(),
        empty_label="All Streams",
        widget=forms.Select(attrs={"class": "form-control"}),
        label="Stream",
    )

    # ------------------------------------------------------------------
    # Academic session filter — unchanged
    # ------------------------------------------------------------------
    session_year = django_filters.CharFilter(
        lookup_expr="icontains",
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "e.g., 2024/2025"}
        ),
        label="Session Year",
    )

    # ------------------------------------------------------------------
    # Boolean filters
    #
    # No checkbox widget. A checkbox that isn't ticked reads as False rather
    # than as "not asked", so an exam list with no filters at all quietly
    # asked for exams that are not online and need no computer — and every
    # exam set as online, or needing a computer, was missing from the list.
    # Left plain, an absent parameter filters nothing, and ?is_online=true
    # (or false) still does.
    # ------------------------------------------------------------------
    is_practical = django_filters.BooleanFilter(label="Practical Exam")
    requires_computer = django_filters.BooleanFilter(label="Requires Computer")
    is_online = django_filters.BooleanFilter(label="Online Exam")

    # ------------------------------------------------------------------
    # Venue filter — unchanged
    # ------------------------------------------------------------------
    venue = django_filters.CharFilter(
        lookup_expr="icontains",
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "Search venue..."}
        ),
        label="Venue",
    )

    # ------------------------------------------------------------------
    # Time range filters — unchanged
    # ------------------------------------------------------------------
    start_time = django_filters.TimeFilter(
        field_name="start_time",
        lookup_expr="gte",
        widget=forms.TimeInput(attrs={"type": "time", "class": "form-control"}),
        label="Start Time From",
    )
    end_time = django_filters.TimeFilter(
        field_name="end_time",
        lookup_expr="lte",
        widget=forms.TimeInput(attrs={"type": "time", "class": "form-control"}),
        label="End Time To",
    )

    # ------------------------------------------------------------------
    # Marks / duration range filters — unchanged
    # ------------------------------------------------------------------
    total_marks_min = django_filters.NumberFilter(
        field_name="total_marks",
        lookup_expr="gte",
        widget=forms.NumberInput(
            attrs={"class": "form-control", "placeholder": "Min marks"}
        ),
        label="Min Total Marks",
    )
    total_marks_max = django_filters.NumberFilter(
        field_name="total_marks",
        lookup_expr="lte",
        widget=forms.NumberInput(
            attrs={"class": "form-control", "placeholder": "Max marks"}
        ),
        label="Max Total Marks",
    )
    duration_minutes_min = django_filters.NumberFilter(
        field_name="duration_minutes",
        lookup_expr="gte",
        widget=forms.NumberInput(
            attrs={"class": "form-control", "placeholder": "Min duration"}
        ),
        label="Min Duration (minutes)",
    )
    duration_minutes_max = django_filters.NumberFilter(
        field_name="duration_minutes",
        lookup_expr="lte",
        widget=forms.NumberInput(
            attrs={"class": "form-control", "placeholder": "Max duration"}
        ),
        label="Max Duration (minutes)",
    )

    # ------------------------------------------------------------------
    # Id or code
    #
    # These three name a row that every school has its own copy of. The
    # screens ask for them by code ("quiz"), because a code means the same
    # thing at every school while an id doesn't, and other callers have always
    # sent ids. Both are answered. Asking for one that doesn't exist finds no
    # exams, rather than refusing the whole request — a filter nobody can
    # satisfy shouldn't take the exam list down with it.
    # ------------------------------------------------------------------

    def _by_id_or_code(self, queryset, field, value):
        value = (value or "").strip()
        if not value:
            return queryset
        if value.isdigit():
            return queryset.filter(**{f"{field}_id": int(value)})
        return queryset.filter(**{f"{field}__code__iexact": value})

    def filter_exam_type(self, queryset, name, value):
        return self._by_id_or_code(queryset, "exam_type", value)

    def filter_status(self, queryset, name, value):
        return self._by_id_or_code(queryset, "status", value)

    def filter_difficulty_level(self, queryset, name, value):
        return self._by_id_or_code(queryset, "difficulty_level", value)

    class Meta:
        model = Exam
        fields = [
            # Basic FK relationships
            "subject",
            "grade_level",
            "section",
            "teacher",
            "exam_schedule",
            # Date and time filters
            "start_date",
            "end_date",
            "exam_date",
            "start_time",
            "end_time",
            # Text search
            "title",
            "code",
            "venue",
            # UPDATED: FK filters (id-based) + code-based aliases
            "exam_type",
            "exam_type_code",
            "status",
            "status_code",
            "difficulty_level",
            "difficulty_code",
            "term_type",
            "term_code",
            "session_year",
            # Boolean filters
            "is_practical",
            "requires_computer",
            "is_online",
            # Numeric ranges
            "total_marks_min",
            "total_marks_max",
            "duration_minutes_min",
            "duration_minutes_max",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Add CSS classes to foreign key fields
        for field_name in [
            "subject",
            "grade_level",
            "section",
            "teacher",
            "exam_schedule",
        ]:
            if field_name in self.form.fields:
                self.form.fields[field_name].widget.attrs.update(
                    {"class": "form-control"}
                )

        # Set empty labels for foreign key fields
        empty_labels = {
            "subject": "All Subjects",
            "grade_level": "All Grade Levels",
            "section": "All Sections",
            "teacher": "All Teachers",
            "exam_schedule": "All Schedules",
        }
        for field_name, label in empty_labels.items():
            if field_name in self.form.fields:
                self.form.fields[field_name].empty_label = label


# ==============================================================================
# SPECIALIZED FILTERS
# ==============================================================================

class UpcomingExamFilter(ExamFilter):
    """Filter for upcoming exams only"""

    class Meta(ExamFilter.Meta):
        model = Exam
        fields = ExamFilter.Meta.fields

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # UPDATED: filter via status FK traversal (status__code) instead of raw string
        self.queryset = self.queryset.filter(
            status__code__in=["scheduled", "in_progress"],
            exam_date__gte=timezone.now().date(),
        )


class CompletedExamFilter(ExamFilter):
    """Filter for completed exams only"""

    class Meta(ExamFilter.Meta):
        model = Exam
        fields = ExamFilter.Meta.fields

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # UPDATED: filter via status FK traversal (status__code) instead of raw string
        self.queryset = self.queryset.filter(status__code="completed")


class TodayExamFilter(ExamFilter):
    """Filter for today's exams"""

    class Meta(ExamFilter.Meta):
        model = Exam
        fields = [
            "subject",
            "grade_level",
            "section",
            "teacher",
            "exam_type",  # ModelChoiceFilter (FK)
            "exam_type_code",  # code string alias
            "status",  # ModelChoiceFilter (FK)
            "status_code",  # code string alias
            "venue",
            "start_time",
            "end_time",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # UPDATED: no FK changes needed here — just pre-filtering by date
        self.queryset = self.queryset.filter(exam_date=timezone.now().date())
