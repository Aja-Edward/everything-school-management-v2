from django.shortcuts import render

# Create your views here.
"""
student_promotions/views.py
"""

import logging
from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.db.models import Avg, Count, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from tenants.mixins import  TenantFilterMixin

from academics.models import AcademicSession
from classroom.models import Class as StudentClass
from students.models import Student

from .models import StudentPromotion, PromotionRule
from .engine import PromotionEngine
from .serializers import (
    StudentPromotionSerializer,
    PromotionRuleSerializer,
    PromotionRuleCreateUpdateSerializer,
    RunAutoPromotionSerializer,
    ManualPromotionSerializer,
    PromotionSummarySerializer,
)

logger = logging.getLogger(__name__)


# ── Helper mixin ──────────────────────────────────────────────────────────────


# ── Promotion Rule ViewSet ─────────────────────────────────────────────────────

class PromotionRuleViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRUD for student_promotions thresholds per education level.

    GET    /api/student_promotions/rules/
    POST   /api/student_promotions/rules/
    GET    /api/student_promotions/rules/{id}/
    PATCH  /api/student_promotions/rules/{id}/
    DELETE /api/student_promotions/rules/{id}/
    """

    queryset = PromotionRule.objects.all().select_related("education_level", "created_by")
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return PromotionRuleCreateUpdateSerializer
        return PromotionRuleSerializer

    def perform_create(self, serializer):
        serializer.save(tenant=self.get_tenant(), created_by=self.request.user)


# ── Student Promotion ViewSet ──────────────────────────────────────────────────

class StudentPromotionViewSet(TenantFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read + action endpoints for student student_promotions.

    GET  /api/student_promotions/                          — list all (filterable)
    GET  /api/student_promotions/{id}/                     — single record
    POST /api/student_promotions/run-auto/                 — trigger auto-student_promotions for a class
    POST /api/student_promotions/{id}/manual-promote/      — admin override per student
    GET  /api/student_promotions/summary/                  — stats for a class+session
    POST /api/student_promotions/{id}/recalculate/         — re-run auto for one student
    """

    queryset = (
        StudentPromotion.objects
        .select_related(
            "student",
            "student__student_class",
            "academic_session",
            "student_class",
            "processed_by",
        )
        .order_by("student__user__last_name", "student__user__first_name")
    )
    serializer_class = StudentPromotionSerializer
    permission_classes = [IsAuthenticated]

    # ── Filtering ──────────────────────────────────────────────────────

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        if session_id := params.get("academic_session_id"):
            qs = qs.filter(academic_session_id=session_id)

        if class_id := params.get("student_class_id"):
            qs = qs.filter(student_class_id=class_id)

        if status_val := params.get("status"):
            qs = qs.filter(status=status_val)

        if student_id := params.get("student_id"):
            qs = qs.filter(student_id=student_id)

        return qs

    # ── run-auto ───────────────────────────────────────────────────────

    @action(detail=False, methods=["post"], url_path="run-auto")
    def run_auto(self, request):
        """
        Trigger auto-student_promotions for all students in a class.

        Body:
            {
                "academic_session_id": 5,
                "student_class_id": 3
            }

        Returns a list of per-student outcomes plus a summary.
        """
        serializer = RunAutoPromotionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tenant = self.get_tenant()
        academic_session = get_object_or_404(
            AcademicSession,
            id=serializer.validated_data["academic_session_id"],
            tenant=tenant,
        )
        student_class = get_object_or_404(
            StudentClass,
            id=serializer.validated_data["student_class_id"],
            tenant=tenant,
        )

        engine = PromotionEngine(tenant=tenant)
        try:
            outcomes = engine.run_for_class(
                academic_session=academic_session,
                student_class=student_class,
                acted_by=request.user,
            )
        except Exception as exc:
            logger.exception("Error running auto-student_promotions")
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Reload updated student_promotions records for serialization
        student_promotions = StudentPromotion.objects.filter(
            tenant=tenant,
            academic_session=academic_session,
            student_class=student_class,
        ).select_related("student", "student_class", "academic_session", "processed_by")

        summary = self._build_summary(student_promotions)

        return Response(
            {
                "summary": summary,
                "outcomes": outcomes,
                "student_promotions": StudentPromotionSerializer(student_promotions, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    # ── manual-promote ─────────────────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="manual-promote")
    def manual_promote(self, request, pk=None):
        """
        Admin manually promotes or holds back a student.

        Body:
            {
                "status": "PROMOTED" | "HELD_BACK",
                "reason": "Student showed consistent improvement..."
            }
        """
        student_promotions = self.get_object()
        serializer = ManualPromotionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        engine = PromotionEngine(tenant=self.get_tenant())
        try:
            updated = engine.manual_promote(
                student=student_promotions.student,
                academic_session=student_promotions.academic_session,
                status=serializer.validated_data["status"],
                reason=serializer.validated_data["reason"],
                acted_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            StudentPromotionSerializer(updated).data,
            status=status.HTTP_200_OK,
        )

    # ── recalculate ────────────────────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="recalculate")
    def recalculate(self, request, pk=None):
        """
        Re-run auto-student_promotions for a single student (e.g. after a result edit).
        Will not override an existing manual decision.
        """
        student_promotions = self.get_object()
        engine = PromotionEngine(tenant=self.get_tenant())

        outcome = engine.run_for_student(
            student=student_promotions.student,
            academic_session=student_promotions.academic_session,
            acted_by=request.user,
        )

        student_promotions.refresh_from_db()
        return Response(
            {
                "outcome": outcome,
                "student_promotions": StudentPromotionSerializer(student_promotions).data,
            },
            status=status.HTTP_200_OK,
        )

    # ── summary ────────────────────────────────────────────────────────

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        GET /api/student_promotions/summary/?academic_session_id=5&student_class_id=3

        Returns aggregate stats for a class.
        """
        tenant = self.get_tenant()
        session_id = request.query_params.get("academic_session_id")
        class_id = request.query_params.get("student_class_id")

        if not session_id or not class_id:
            return Response(
                {"detail": "academic_session_id and student_class_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_promotions = StudentPromotion.objects.filter(
            tenant=tenant,
            academic_session_id=session_id,
            student_class_id=class_id,
        )

        return Response(self._build_summary(student_promotions), status=status.HTTP_200_OK)

    # ── helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _build_summary(queryset):
        totals = queryset.aggregate(
            total=Count("id"),
            promoted=Count("id", filter=Q(status="PROMOTED")),
            held_back=Count("id", filter=Q(status="HELD_BACK")),
            flagged=Count("id", filter=Q(status="FLAGGED")),
            pending=Count("id", filter=Q(status="PENDING")),
            class_average=Avg("session_average"),
        )
        total = totals["total"] or 0
        promoted = totals["promoted"] or 0
        rate = Decimal(str(round((promoted / total * 100), 1))) if total else Decimal("0")

        return {
            "total": total,
            "promoted": promoted,
            "held_back": totals["held_back"] or 0,
            "flagged": totals["flagged"] or 0,
            "pending": totals["pending"] or 0,
            "promotion_rate": rate,
            "class_average": (
                round(totals["class_average"], 2)
                if totals["class_average"]
                else None
            ),
        }