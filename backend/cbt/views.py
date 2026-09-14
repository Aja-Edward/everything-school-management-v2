"""
cbt/views.py

Staff endpoints for setting up a CBT paper: its settings, a check of the exam's
questions, a preview as a student will see it, and publishing.

    /api/cbt/papers/                  list (?exam=, ?exam__in=, ?status=), create
    /api/cbt/papers/<id>/             read, update, delete (until anyone has sat it)
    /api/cbt/papers/<id>/check/       POST: what stops the exam going on a paper now
    /api/cbt/papers/<id>/preview/     GET: one student's paper, without answers
    /api/cbt/papers/<id>/publish/     POST: copy the questions and open the paper
    /api/cbt/papers/<id>/unpublish/   POST: back to draft, until anyone has started
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from exam.permissions import IsTeacherOrAdmin
from tenants.mixins import TenantFilterMixin

from .access import manageable_exams, publish_refusal
from .models import CBTPaper, CBTQuestion
from .serializers import CBTPaperSerializer
from .student_payload import paper_for_student


def _problems(status_code, problems):
    return Response({"detail": problems[0], "problems": problems}, status=status_code)


class CBTPaperViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    serializer_class = CBTPaperSerializer
    permission_classes = [IsTeacherOrAdmin]
    queryset = CBTPaper.objects.select_related("exam", "exam__status", "exam__subject")
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {"exam": ["exact", "in"], "status": ["exact"]}
    # Exam screens look up the papers for a page of exams at once with ?exam__in=.
    pagination_class = None

    def get_queryset(self):
        exams = manageable_exams(self.request.user, getattr(self.request, "tenant", None))
        return super().get_queryset().filter(exam__in=exams).annotate(
            objective_count=Count("questions", filter=Q(questions__kind="objective"), distinct=True),
            text_count=Count("questions", filter=Q(questions__kind="text"), distinct=True),
            attempt_count=Count("attempts", distinct=True),
        )

    def _fresh(self, paper):
        return self.get_serializer(self.get_queryset().get(pk=paper.pk)).data

    def perform_create(self, serializer):
        exam = serializer.validated_data["exam"]
        from_exam = CBTPaper.for_exam(exam)
        extra = {"tenant": exam.tenant}
        for name in ("opens_at", "closes_at", "duration_minutes"):
            if serializer.validated_data.get(name) is None:
                extra[name] = getattr(from_exam, name)
        serializer.save(**extra)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().attempts.exists():
            return _problems(status.HTTP_400_BAD_REQUEST,
                             ["Students have sat this paper, so it can't be deleted."])
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="check")
    def check_paper(self, request, pk=None):
        paper = self.get_object()
        sections, questions, problems = paper.prepare()
        return Response({
            "ready": not problems,
            "problems": problems,
            "sections": sections,
            "objective_count": sum(1 for q in questions if q["kind"] == CBTQuestion.Kind.OBJECTIVE),
            "text_count": sum(1 for q in questions if q["kind"] == CBTQuestion.Kind.TEXT),
        })

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """
        A paper as one student would get it: drawn and shuffled by the paper's
        settings, with no answers. A draft is previewed from the exam as it
        stands, so teachers can look before publishing.
        """
        paper = self.get_object()
        if paper.status == CBTPaper.Status.DRAFT:
            sections, fields, problems = paper.prepare()
            # Unsaved rows; their order stands in for an id.
            questions = [
                CBTQuestion(id=f["order"], paper=paper, **{**f, "marks": f["marks"] or Decimal(0)})
                for f in fields
            ]
            instructions = paper.exam.instructions or ""
        else:
            questions = list(paper.questions.all())
            sections, instructions, problems = None, None, []

        served, option_order = paper.draw_questions(questions=questions)
        payload = paper_for_student(paper, served, option_order, sections=sections, instructions=instructions)
        payload["is_draft"] = paper.status == CBTPaper.Status.DRAFT
        payload["problems"] = problems
        return Response(payload)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        paper = self.get_object()
        refusal = publish_refusal(request.user, getattr(request, "tenant", None), paper.exam)
        if refusal:
            return _problems(status.HTTP_403_FORBIDDEN, [refusal])
        try:
            paper.publish(user=request.user)
        except ValidationError as error:
            return _problems(status.HTTP_400_BAD_REQUEST, error.messages)
        return Response(self._fresh(paper))

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        paper = self.get_object()
        if paper.attempts.exists():
            return _problems(status.HTTP_400_BAD_REQUEST,
                             ["Students have started this paper, so it can't be taken down."])
        paper.status = CBTPaper.Status.DRAFT
        paper.save(update_fields=["status", "updated_at"])
        return Response(self._fresh(paper))
