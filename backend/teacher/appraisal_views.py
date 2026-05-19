"""
teacher/appraisal_views.py
ViewSets for Performance Appraisal System and Staff Notes.

Permissions:
  Criteria:    admin → full CRUD; staff → read only (active only)
  Appraisals:  admin/head → create/edit/submit; teacher → read own + acknowledge
  Staff Notes: admin → create/read all; teacher → read own + acknowledge
"""
import logging
from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from tenants.mixins import TenantFilterMixin
from .models import (
    AppraisalCriteria, PerformanceAppraisal, AppraisalScore,
    StaffNote, Teacher, DEFAULT_APPRAISAL_CRITERIA,
)
from .appraisal_serializers import (
    AppraisalCriteriaSerializer, AppraisalCriteriaWriteSerializer,
    PerformanceAppraisalSerializer, PerformanceAppraisalCreateSerializer,
    AppraisalAcknowledgeSerializer,
    StaffNoteSerializer, StaffNoteCreateSerializer, StaffNoteAcknowledgeSerializer,
)

logger = logging.getLogger(__name__)


def _is_admin(user):
    return user.is_staff or getattr(user, "role", "") in (
        "admin", "superadmin", "secondary_admin",
        "nursery_admin", "primary_admin",
        "junior_secondary_admin", "senior_secondary_admin",
    )


def _get_teacher(user):
    try:
        return Teacher.objects.get(user=user)
    except Teacher.DoesNotExist:
        try:
            return Teacher.objects.get(user__email=user.email)
        except (Teacher.DoesNotExist, Teacher.MultipleObjectsReturned):
            return None


# ── Appraisal Criteria ────────────────────────────────────────────────────────

class AppraisalCriteriaViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    queryset = AppraisalCriteria.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["applicable_to", "is_active"]
    search_fields = ["name", "code"]

    def get_queryset(self):
        qs = super().get_queryset()
        if not _is_admin(self.request.user):
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return AppraisalCriteriaWriteSerializer
        return AppraisalCriteriaSerializer

    def perform_create(self, serializer):
        if not _is_admin(self.request.user):
            raise PermissionDenied("Only admins can manage appraisal criteria.")
        serializer.save(tenant=getattr(self.request, "tenant", None))

    def perform_update(self, serializer):
        if not _is_admin(self.request.user):
            raise PermissionDenied("Only admins can edit appraisal criteria.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            raise PermissionDenied("Only admins can delete appraisal criteria.")
        instance = self.get_object()
        if instance.is_system_default:
            return Response({"error": "System default criteria cannot be deleted."}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        if not _is_admin(request.user):
            raise PermissionDenied("Admin only.")
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return Response({"error": "Tenant not found."}, status=400)
        created = 0
        existing = AppraisalCriteria.objects.filter(tenant=tenant).count()
        for cat in DEFAULT_APPRAISAL_CRITERIA:
            _, was_created = AppraisalCriteria.objects.get_or_create(
                tenant=tenant,
                code=cat["code"],
                defaults={**cat, "tenant": tenant, "is_system_default": True, "is_active": True},
            )
            if was_created:
                created += 1
        total = AppraisalCriteria.objects.filter(tenant=tenant).count()
        if created == 0:
            return Response({
                "seeded": 0, "total": total,
                "message": f"All {total} default criteria are already configured.",
            })
        return Response({
            "seeded": created, "total": total,
            "message": f"{created} criteria added. Total: {total}.",
        })


# ── Performance Appraisal ─────────────────────────────────────────────────────

class PerformanceAppraisalViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "period", "appraiser_role", "teacher"]
    search_fields = [
        "teacher__user__first_name", "teacher__user__last_name",
        "teacher__employee_id", "academic_year",
    ]
    ordering_fields = ["created_at", "submitted_at", "period"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = PerformanceAppraisal.objects.select_related(
            "teacher__user", "appraiser"
        ).prefetch_related("scores__criteria")
        if _is_admin(self.request.user):
            return qs
        teacher = _get_teacher(self.request.user)
        if teacher:
            # Teachers only see submitted or acknowledged appraisals of themselves
            return qs.filter(
                teacher=teacher,
                status__in=(PerformanceAppraisal.STATUS_SUBMITTED, PerformanceAppraisal.STATUS_ACKNOWLEDGED),
            )
        return qs.none()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return PerformanceAppraisalCreateSerializer
        return PerformanceAppraisalSerializer

    def perform_create(self, serializer):
        if not _is_admin(self.request.user):
            raise PermissionDenied("Only admins can create appraisals.")
        serializer.save(
            tenant=getattr(self.request, "tenant", None),
            appraiser=self.request.user,
            status=PerformanceAppraisal.STATUS_DRAFT,
        )

    def perform_update(self, serializer):
        if not _is_admin(self.request.user):
            raise PermissionDenied("Only admins can edit appraisals.")
        instance = self.get_object()
        if instance.status == PerformanceAppraisal.STATUS_ACKNOWLEDGED:
            raise ValidationError("Acknowledged appraisals cannot be edited.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            raise PermissionDenied("Only admins can delete appraisals.")
        instance = self.get_object()
        if instance.status != PerformanceAppraisal.STATUS_DRAFT:
            return Response({"error": "Only draft appraisals can be deleted."}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        """Admin submits a draft — makes it visible to the teacher."""
        if not _is_admin(request.user):
            raise PermissionDenied("Only admins can submit appraisals.")
        instance = self.get_object()
        if instance.status != PerformanceAppraisal.STATUS_DRAFT:
            return Response({"error": "Only draft appraisals can be submitted."}, status=400)
        if not instance.scores.exists():
            return Response({"error": "Add at least one criterion score before submitting."}, status=400)
        instance.status = PerformanceAppraisal.STATUS_SUBMITTED
        instance.submitted_at = timezone.now()
        instance.save(update_fields=["status", "submitted_at", "updated_at"])
        return Response(PerformanceAppraisalSerializer(instance, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="acknowledge")
    def acknowledge(self, request, pk=None):
        """Teacher acknowledges and optionally responds to a submitted appraisal."""
        instance = self.get_object()
        if instance.status != PerformanceAppraisal.STATUS_SUBMITTED:
            return Response({"error": "Only submitted appraisals can be acknowledged."}, status=400)
        # Ensure the teacher is acknowledging their own appraisal
        if not _is_admin(request.user):
            teacher = _get_teacher(request.user)
            if not teacher or instance.teacher != teacher:
                raise PermissionDenied("You can only acknowledge your own appraisals.")
        ser = AppraisalAcknowledgeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        instance.status = PerformanceAppraisal.STATUS_ACKNOWLEDGED
        instance.acknowledged_at = timezone.now()
        instance.teacher_response = ser.validated_data.get("teacher_response", "")
        instance.save(update_fields=["status", "acknowledged_at", "teacher_response", "updated_at"])
        return Response(PerformanceAppraisalSerializer(instance, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Admin summary: counts by status, recent appraisals."""
        if not _is_admin(request.user):
            raise PermissionDenied("Admin only.")
        from django.db.models import Count, Avg
        qs = self.get_queryset()
        by_status = {s: qs.filter(status=s).count() for s in ("draft", "submitted", "acknowledged")}
        by_period = list(
            qs.values("period").annotate(count=Count("id")).order_by("-count")
        )
        recent = PerformanceAppraisalSerializer(
            qs.filter(status="submitted")[:5], many=True, context={"request": request}
        ).data
        return Response({
            "total": qs.count(),
            "by_status": by_status,
            "by_period": by_period,
            "pending_acknowledgment": recent,
        })


# ── Staff Notes ───────────────────────────────────────────────────────────────

class StaffNoteViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["note_type", "category", "is_acknowledged", "teacher"]
    search_fields = [
        "title", "content",
        "teacher__user__first_name", "teacher__user__last_name",
        "teacher__employee_id",
    ]
    ordering_fields = ["created_at", "note_type"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = StaffNote.objects.select_related("teacher__user", "issued_by")
        if _is_admin(self.request.user):
            return qs
        teacher = _get_teacher(self.request.user)
        if teacher:
            return qs.filter(teacher=teacher)
        return qs.none()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return StaffNoteCreateSerializer
        return StaffNoteSerializer

    def perform_create(self, serializer):
        if not _is_admin(self.request.user):
            raise PermissionDenied("Only admins can issue staff notes.")
        serializer.save(
            tenant=getattr(self.request, "tenant", None),
            issued_by=self.request.user,
        )
        logger.info(
            "Staff note issued by %s to teacher %s — type: %s",
            self.request.user.get_full_name(),
            serializer.instance.teacher.user.get_full_name(),
            serializer.instance.note_type,
        )

    def perform_update(self, serializer):
        if not _is_admin(self.request.user):
            raise PermissionDenied("Only admins can edit staff notes.")
        instance = self.get_object()
        if instance.is_acknowledged:
            raise ValidationError("Acknowledged notes cannot be edited.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            raise PermissionDenied("Only admins can delete staff notes.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="acknowledge")
    def acknowledge(self, request, pk=None):
        """Teacher acknowledges receipt of a staff note, optionally with a comment."""
        instance = self.get_object()
        if instance.is_acknowledged:
            return Response({"error": "Note already acknowledged."}, status=400)
        if not _is_admin(request.user):
            teacher = _get_teacher(request.user)
            if not teacher or instance.teacher != teacher:
                raise PermissionDenied("You can only acknowledge your own notes.")
        ser = StaffNoteAcknowledgeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        instance.is_acknowledged = True
        instance.acknowledged_at = timezone.now()
        instance.teacher_comment = ser.validated_data.get("teacher_comment", "")
        instance.save(update_fields=["is_acknowledged", "acknowledged_at", "teacher_comment", "updated_at"])
        return Response(StaffNoteSerializer(instance, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Admin summary counts by note_type."""
        if not _is_admin(request.user):
            raise PermissionDenied("Admin only.")
        from django.db.models import Count
        qs = self.get_queryset()
        by_type = list(qs.values("note_type").annotate(count=Count("id")).order_by("-count"))
        unacknowledged = qs.filter(is_acknowledged=False).count()
        return Response({
            "total": qs.count(),
            "unacknowledged": unacknowledged,
            "by_type": by_type,
        })
