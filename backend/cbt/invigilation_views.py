"""
cbt/invigilation_views.py

Staff endpoints for watching a paper being sat.

    GET  /api/cbt/invigilate/                       papers I can invigilate
    GET  /api/cbt/invigilate/<paper>/               the live board
    GET  /api/cbt/invigilate/<paper>/events/?attempt=<id>   one attempt's full log
    POST /api/cbt/invigilate/<paper>/extend/        {"attempt", "minutes", "reason"}
    POST /api/cbt/invigilate/<paper>/submit/        {"attempt", "reason"}
    POST /api/cbt/invigilate/<paper>/reopen/        {"attempt", "minutes", "reason"}
    POST /api/cbt/invigilate/<paper>/void/          {"attempt", "reason"}

Each action answers with the refreshed board.
"""

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from exam.permissions import IsTeacherOrAdmin
from tenants.mixins import TenantRequiredMixin

from . import invigilation
from .engine import Refused
from .models import CBTAttempt


class InvigilationViewSet(TenantRequiredMixin, viewsets.ViewSet):
    permission_classes = [IsTeacherOrAdmin]
    lookup_value_regex = r"\d+"

    def handle_exception(self, exc):
        if isinstance(exc, Refused):
            return Response({"detail": exc.message, "code": exc.code}, status=exc.status)
        return super().handle_exception(exc)

    def _papers(self):
        return invigilation.invigilable_papers(self.request.user, getattr(self.request, "tenant", None))

    def _paper(self, pk):
        paper = self._papers().filter(pk=pk).first()
        if paper is None:
            raise Refused("Paper not found.", status=404, code="not_found")
        return paper

    def _attempt(self, paper):
        attempt = CBTAttempt.objects.filter(paper=paper, pk=self.request.data.get("attempt")).first() \
            if str(self.request.data.get("attempt", "")).isdigit() else None
        if attempt is None:
            raise Refused("Attempt not found.", status=404, code="not_found")
        return attempt

    def list(self, request):
        papers = self._papers().annotate(
            in_progress=Count("attempts", filter=Q(attempts__status=CBTAttempt.Status.IN_PROGRESS), distinct=True),
            finished=Count("attempts", filter=Q(attempts__status__in=[
                CBTAttempt.Status.SUBMITTED, CBTAttempt.Status.TIMED_OUT]), distinct=True),
        ).order_by("-opens_at")[:100]
        now = timezone.now()
        return Response({"server_time": now, "papers": [{
            "id": p.id,
            "exam_title": p.exam.title,
            "subject": p.exam.subject.name if p.exam.subject_id else "",
            "grade_level": p.exam.grade_level.name if p.exam.grade_level_id else "",
            "status": p.status,
            "opens_at": p.opens_at,
            "closes_at": p.closes_at,
            "is_open": bool(p.opens_at and p.closes_at and p.opens_at <= now < p.closes_at),
            "in_progress": p.in_progress,
            "finished": p.finished,
        } for p in papers]})

    def retrieve(self, request, pk=None):
        return Response(invigilation.board(self._paper(pk)))

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        paper = self._paper(pk)
        attempt_id = request.query_params.get("attempt", "")
        attempt = CBTAttempt.objects.filter(paper=paper, pk=attempt_id).first() if attempt_id.isdigit() else None
        if attempt is None:
            raise Refused("Attempt not found.", status=404, code="not_found")
        return Response({"events": invigilation.attempt_events(attempt)})

    def _act(self, pk, work):
        paper = self._paper(pk)
        work(self._attempt(paper))
        return Response(invigilation.board(paper))

    @action(detail=True, methods=["post"])
    def extend(self, request, pk=None):
        data = request.data
        return self._act(pk, lambda a: invigilation.extend_time(a, data.get("minutes"), request.user, data.get("reason")))

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return self._act(pk, lambda a: invigilation.force_submit(a, request.user, request.data.get("reason")))

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        data = request.data
        return self._act(pk, lambda a: invigilation.reopen(a, data.get("minutes"), request.user, data.get("reason")))

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        return self._act(pk, lambda a: invigilation.void(a, request.user, request.data.get("reason")))
