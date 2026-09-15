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
    /api/cbt/papers/<id>/bank/        GET: bank questions available to draw, by topic and difficulty
    /api/cbt/papers/<id>/draw/        POST: add random bank questions to the exam

Marking and results (see cbt/marking.py):

    /api/cbt/papers/<id>/marking/                         GET: progress and answer-key statistics
    /api/cbt/papers/<id>/marking/questions/<question>/    GET: every written answer to one typed question
    /api/cbt/papers/<id>/marking/marks/                   POST: {"marks": [{"attempt", "question", "marks"}]}
    /api/cbt/papers/<id>/questions/<question>/answer-key/ POST: {"correct_option" | "award_all", "reason"}
    /api/cbt/papers/<id>/results/targets/                 GET: exam sessions and score columns to send to
    /api/cbt/papers/<id>/results/push/                    POST: write scores into the school's results
    /api/cbt/papers/<id>/results/release/                 POST: let students see their scores
    /api/cbt/papers/<id>/results/withhold/                POST: hide them again

Analysis (see cbt/analysis.py):

    /api/cbt/papers/<id>/analysis/                        GET: how each question performed
    /api/cbt/papers/<id>/analysis/apply-difficulty/       POST: {"questions": [ids]} rate bank questions from results
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from exam.permissions import IsTeacherOrAdmin
from tenants.mixins import TenantFilterMixin

from . import analysis, bank, marking
from .access import manageable_exams, publish_refusal, question_edit_refusal
from .engine import Refused
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

    def handle_exception(self, exc):
        if isinstance(exc, Refused):
            return Response({"detail": exc.message, "code": exc.code, "problems": [exc.message]}, status=exc.status)
        return super().handle_exception(exc)

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

    @action(detail=True, methods=["get"], url_path="bank")
    def bank_summary(self, request, pk=None):
        """?question_type=objective|theory&any_grade_level=true"""
        paper = self.get_object()
        question_type = request.query_params.get("question_type", "objective")
        any_grade_level = request.query_params.get("any_grade_level") == "true"
        try:
            available = bank.summary(request.user, paper.exam, question_type, any_grade_level)
        except ValidationError as error:
            return _problems(status.HTTP_400_BAD_REQUEST, error.messages)
        return Response({
            "subject": paper.exam.subject.name,
            "grade_level": paper.exam.grade_level.name,
            "question_type": question_type,
            "any_grade_level": any_grade_level,
            "available": available,
            "edit_refusal": question_edit_refusal(request.user, request.tenant, paper.exam),
        })

    @action(detail=True, methods=["post"])
    def draw(self, request, pk=None):
        """
        {"question_type": "objective", "count": 10, "topics": [...], "difficulties": [...],
         "any_grade_level": false}. Topics and difficulties left out mean all of them.
        """
        paper = self.get_object()
        refusal = question_edit_refusal(request.user, request.tenant, paper.exam)
        if refusal:
            return _problems(status.HTTP_403_FORBIDDEN, [refusal])

        data = request.data
        try:
            count = int(data.get("count"))
        except (TypeError, ValueError):
            count = 0
        try:
            drawn = bank.draw(
                request.user, paper.exam, data.get("question_type", "objective"), count,
                topics=data.get("topics") or [], difficulties=data.get("difficulties") or [],
                any_grade_level=bool(data.get("any_grade_level")))
        except ValidationError as error:
            return _problems(status.HTTP_400_BAD_REQUEST, error.messages)
        return Response({"added": len(drawn), "question_ids": [q.id for q in drawn]})

    # ── Marking and results ──────────────────────────────────────────────────

    def _question(self, paper, question_id):
        question = paper.questions.filter(pk=question_id).first()
        if question is None:
            raise Refused("Question not found on this paper.", status=404, code="not_found")
        return question

    @action(detail=True, methods=["get"])
    def marking(self, request, pk=None):
        return Response(marking.overview(self.get_object()))

    @action(detail=True, methods=["get"], url_path=r"marking/questions/(?P<question_id>\d+)")
    def marking_question(self, request, pk=None, question_id=None):
        paper = self.get_object()
        return Response(marking.answers_to_mark(paper, self._question(paper, question_id)))

    @action(detail=True, methods=["post"], url_path="marking/marks")
    def marks(self, request, pk=None):
        paper = self.get_object()
        marking.set_marks(paper, request.data.get("marks"), request.user)
        return Response(marking.overview(paper))

    @action(detail=True, methods=["post"], url_path=r"questions/(?P<question_id>\d+)/answer-key")
    def answer_key(self, request, pk=None, question_id=None):
        paper = self.get_object()
        data = request.data
        change = marking.correct_answer_key(
            self._question(paper, question_id), request.user, correct_option=data.get("correct_option", ""),
            award_all=bool(data.get("award_all")), reason=data.get("reason", ""))
        return Response({"remarked_attempts": change.remarked_attempts, "marking": marking.overview(paper)})

    @action(detail=True, methods=["get"], url_path="results/targets")
    def result_targets(self, request, pk=None):
        return Response(marking.result_targets(self.get_object()))

    @action(detail=True, methods=["post"], url_path="results/push")
    def push_results(self, request, pk=None):
        return Response(marking.push_results(self.get_object(), request.user))

    @action(detail=True, methods=["post"], url_path="results/release")
    def release_results(self, request, pk=None):
        paper = self.get_object()
        paper.results_released_at = timezone.now()
        paper.save(update_fields=["results_released_at", "updated_at"])
        return Response(self._fresh(paper))

    @action(detail=True, methods=["post"], url_path="results/withhold")
    def withhold_results(self, request, pk=None):
        paper = self.get_object()
        paper.results_released_at = None
        paper.save(update_fields=["results_released_at", "updated_at"])
        return Response(self._fresh(paper))

    @action(detail=True, methods=["get"], url_path="analysis")
    def question_analysis(self, request, pk=None):
        return Response(analysis.analyse(self.get_object()))

    @action(detail=True, methods=["post"], url_path="analysis/apply-difficulty")
    def apply_difficulty(self, request, pk=None):
        ids = request.data.get("questions")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids) or not ids:
            raise Refused("Choose the questions to update.")
        return Response(analysis.apply_bank_difficulty(self.get_object(), ids, request.user, request.tenant))
