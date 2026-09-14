from rest_framework import serializers

from exam.models import Exam

from .access import manageable_exams
from .models import CBTPaper

# Changing these once students have started would give later students a
# different paper from earlier ones.
LOCKED_ONCE_STARTED = ("include_objective", "include_theory", "objective_questions_per_attempt")


class CBTPaperSerializer(serializers.ModelSerializer):
    exam = serializers.PrimaryKeyRelatedField(queryset=Exam.objects.none())
    exam_title = serializers.CharField(source="exam.title", read_only=True)
    exam_status = serializers.CharField(source="exam.status.code", read_only=True, default="")
    objective_count = serializers.IntegerField(read_only=True, default=0)
    text_count = serializers.IntegerField(read_only=True, default=0)
    attempt_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = CBTPaper
        fields = [
            "id", "exam", "exam_title", "exam_status", "status",
            "opens_at", "closes_at", "duration_minutes",
            "include_objective", "include_theory", "objective_questions_per_attempt",
            "shuffle_questions", "shuffle_options", "allow_backtracking", "max_attempts",
            "access_code", "result_release", "results_released_at",
            "instructions", "sections", "published_at",
            "objective_count", "text_count", "attempt_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "status", "results_released_at", "instructions", "sections", "published_at",
            "created_at", "updated_at",
        ]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request is not None:
            fields["exam"].queryset = manageable_exams(request.user, getattr(request, "tenant", None))
        return fields

    def validate_exam(self, exam):
        if self.instance is not None and exam != self.instance.exam:
            raise serializers.ValidationError("A CBT paper can't be moved to a different exam.")
        if self.instance is None and CBTPaper.objects.filter(exam=exam).exists():
            raise serializers.ValidationError("This exam already has a CBT paper.")
        return exam

    def validate(self, attrs):
        paper = self.instance
        if paper is not None and paper.attempts.exists():
            changed = [name for name in LOCKED_ONCE_STARTED
                       if name in attrs and attrs[name] != getattr(paper, name)]
            if changed:
                raise serializers.ValidationError(
                    "Students have already started this paper, so its questions can't be changed.")

        merged = CBTPaper(**{
            name: attrs.get(name, getattr(paper, name) if paper else CBTPaper._meta.get_field(name).get_default())
            for name in ("opens_at", "closes_at", "include_objective", "include_theory")
        })
        problems = merged._setting_problems()
        if problems:
            raise serializers.ValidationError(problems)
        return attrs
