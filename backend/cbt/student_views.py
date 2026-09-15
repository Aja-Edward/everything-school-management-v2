"""
cbt/student_views.py

The student side of CBT.

    GET  /api/cbt/my/exams/                  papers I may sit, and where I am with each
    POST /api/cbt/my/exams/<paper>/start/    {"access_code"}: start, resume, or move to this device
    GET  /api/cbt/attempts/<id>/             state, plus the paper and my answers while in progress
    POST /api/cbt/attempts/<id>/answers/     {"answers": [...]}: save a batch
    POST /api/cbt/attempts/<id>/heartbeat/   {"position", "time_spent"}: check in and get the clock
    POST /api/cbt/attempts/<id>/events/      {"events": [...]}: what the browser noticed
    POST /api/cbt/attempts/<id>/submit/      end the attempt

Every attempt request must carry the session token from start, in the
X-CBT-Session header. Refusals come back as {"detail", "code"}, and the client
acts on the code: "ended", "session_replaced", "access_code", and so on.
"""

from ipaddress import ip_address as parse_ip

from django.utils import timezone
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from security.utils import get_client_ip
from tenants.mixins import TenantRequiredMixin

from . import engine

SESSION_HEADER = "HTTP_X_CBT_SESSION"


class IsStudent(BasePermission):
    message = "Only students can sit computer-based tests."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (getattr(user, "role", "") or "").lower() == "student")


def _refused(error):
    return Response({"detail": error.message, "code": error.code}, status=error.status)


def _ip(request):
    try:
        return str(parse_ip(get_client_ip(request) or ""))
    except ValueError:
        return None


class StudentCBTMixin(TenantRequiredMixin):
    permission_classes = [IsStudent]
    lookup_value_regex = r"\d+"

    def student(self):
        student = engine.student_for(self.request.user, getattr(self.request, "tenant", None))
        if student is None:
            raise engine.Refused("No active student record was found for you at this school.",
                                 status=403, code="no_student")
        return student

    def handle_exception(self, exc):
        if isinstance(exc, engine.Refused):
            return _refused(exc)
        return super().handle_exception(exc)


class MyExamsViewSet(StudentCBTMixin, viewsets.ViewSet):
    def list(self, request):
        return Response(engine.my_exams(self.student()))

    @method_decorator(ratelimit(key="user", rate="20/m", method="POST", block=True))
    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        attempt, token = engine.start(
            self.student(), pk, access_code=request.data.get("access_code", ""),
            session_token=request.META.get(SESSION_HEADER), ip_address=_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""))
        return Response(engine.attempt_state(attempt, timezone.now(), session_token=token))


class AttemptViewSet(StudentCBTMixin, viewsets.ViewSet):
    def _attempt(self, pk):
        return engine.attempt_for(self.student(), pk, self.request.META.get(SESSION_HEADER))

    def retrieve(self, request, pk=None):
        return Response(engine.attempt_detail(self._attempt(pk), timezone.now()))

    # Generous, since the exam page saves as students answer. Keyed by student
    # rather than IP, because a whole computer lab can share one address.
    @method_decorator(ratelimit(key="user", rate="120/m", method="POST", block=True))
    @action(detail=True, methods=["post"])
    def answers(self, request, pk=None):
        attempt, saved = engine.save_answers(self._attempt(pk), request.data.get("answers"))
        return Response({"saved": saved, "attempt": engine.attempt_state(attempt, timezone.now())})

    @action(detail=True, methods=["post"])
    def heartbeat(self, request, pk=None):
        attempt = engine.heartbeat(self._attempt(pk), request.data.get("position"),
                                   time_spent=request.data.get("time_spent"))
        return Response(engine.attempt_state(attempt, timezone.now()))

    @method_decorator(ratelimit(key="user", rate="60/m", method="POST", block=True))
    @action(detail=True, methods=["post"])
    def events(self, request, pk=None):
        recorded = engine.record_events(self._attempt(pk), request.data.get("events"), ip_address=_ip(request))
        return Response({"recorded": recorded})

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        attempt = engine.submit(self._attempt(pk))
        return Response(engine.attempt_state(attempt, timezone.now()))
