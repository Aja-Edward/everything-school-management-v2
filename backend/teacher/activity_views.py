"""
teacher/activity_views.py
ViewSets for StaffActivityCategory and StaffActivityLog.

Permissions:
  - Categories:  admin → full CRUD; staff → read only
  - Logs:        staff → create + view own; admin → view all + approve/reject
"""
import logging
from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from tenants.mixins import TenantFilterMixin
from .models import StaffActivityCategory, StaffActivityLog, Teacher
from .activity_serializers import (
    StaffActivityCategorySerializer,
    StaffActivityCategoryCreateUpdateSerializer,
    StaffActivityLogSerializer,
    StaffActivityLogCreateSerializer,
    ActivityReviewSerializer,
)

logger = logging.getLogger(__name__)


def _is_admin(user):
    return user.is_staff or getattr(user, "role", "") in (
        "admin", "superadmin", "secondary_admin",
        "nursery_admin", "primary_admin",
        "junior_secondary_admin", "senior_secondary_admin",
    )


class StaffActivityCategoryViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    Tenant-scoped CRUD for activity categories.
    Admins: full CRUD.  Staff: list/retrieve only.
    """
    queryset = StaffActivityCategory.objects.all().order_by("display_order", "name")
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["applicable_to", "is_active"]
    search_fields = ["name", "code"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return StaffActivityCategoryCreateUpdateSerializer
        return StaffActivityCategorySerializer

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        serializer.save(tenant=tenant)

    def create(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"error": "Only admins can create activity categories."}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"error": "Only admins can edit activity categories."}, status=403)
        instance = self.get_object()
        if instance.is_system_default and request.method == "DELETE":
            return Response({"error": "System default categories cannot be deleted."}, status=400)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not _is_admin(request.user):
            return Response({"error": "Only admins can delete activity categories."}, status=403)
        instance = self.get_object()
        if instance.is_system_default:
            return Response({"error": "System default categories cannot be deleted."}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        """Admin-only: seed the default categories for this tenant."""
        if not _is_admin(request.user):
            return Response({"error": "Admin only."}, status=403)

        from .models import DEFAULT_ACTIVITY_CATEGORIES
        tenant = getattr(request, "tenant", None)

        if not tenant:
            return Response(
                {"error": "Tenant not found on request. Ensure X-Tenant-Slug header is sent."},
                status=400,
            )

        existing = StaffActivityCategory.objects.filter(tenant=tenant).count()
        created = 0
        errors = []

        for cat_data in DEFAULT_ACTIVITY_CATEGORIES:
            try:
                _, was_created = StaffActivityCategory.objects.get_or_create(
                    tenant=tenant,
                    code=cat_data["code"],
                    defaults={**cat_data, "tenant": tenant, "is_system_default": True},
                )
                if was_created:
                    created += 1
            except Exception as exc:
                errors.append(f"{cat_data['code']}: {exc}")
                logger.error("Failed to seed category %s: %s", cat_data["code"], exc)

        total_now = StaffActivityCategory.objects.filter(tenant=tenant).count()

        if errors:
            return Response(
                {
                    "seeded": created,
                    "existing": existing,
                    "total": total_now,
                    "errors": errors,
                    "message": f"Seeded {created} categories. {len(errors)} error(s): {'; '.join(errors)}",
                },
                status=207,
            )

        if created == 0:
            return Response({
                "seeded": 0,
                "existing": existing,
                "total": total_now,
                "message": f"All {total_now} default categories are already configured for this school.",
            })

        return Response({
            "seeded": created,
            "existing": existing,
            "total": total_now,
            "message": f"{created} default categories added successfully. Total: {total_now}.",
        })


class StaffActivityLogViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRUD for staff activity logs.
    - Staff users: see only their own logs, can create/edit pending logs.
    - Admins: see all logs, can approve/reject.
    """
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "category", "activity_date"]
    search_fields = [
        "title", "description",
        "teacher__user__first_name", "teacher__user__last_name",
        "teacher__employee_id",
    ]
    ordering_fields = ["activity_date", "created_at", "status"]
    ordering = ["-activity_date", "-created_at"]

    def get_queryset(self):
        qs = StaffActivityLog.objects.select_related(
            "teacher__user", "category", "reviewed_by"
        )
        # Tenant filtering is handled by TenantFilterMixin
        if not _is_admin(self.request.user):
            # Staff see only their own logs
            try:
                teacher = Teacher.objects.get(user=self.request.user)
                qs = qs.filter(teacher=teacher)
            except Teacher.DoesNotExist:
                return qs.none()
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return StaffActivityLogCreateSerializer
        return StaffActivityLogSerializer

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        try:
            teacher = Teacher.objects.get(user=self.request.user)
        except Teacher.DoesNotExist:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only staff members can create activity logs.")
        serializer.save(tenant=tenant, teacher=teacher, status=StaffActivityLog.STATUS_PENDING)
        logger.info(
            "Activity log created by %s (%s) — category: %s",
            teacher.user.get_full_name(),
            teacher.employee_id,
            serializer.instance.category.name,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Staff can only edit their own PENDING logs
        if not _is_admin(request.user):
            try:
                teacher = Teacher.objects.get(user=request.user)
            except Teacher.DoesNotExist:
                return Response({"error": "Not a staff member."}, status=403)
            if instance.teacher != teacher:
                return Response({"error": "You can only edit your own logs."}, status=403)
            if instance.status != StaffActivityLog.STATUS_PENDING:
                return Response(
                    {"error": "You can only edit logs that are still pending review."}, status=400
                )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not _is_admin(request.user):
            try:
                teacher = Teacher.objects.get(user=request.user)
            except Teacher.DoesNotExist:
                return Response({"error": "Not a staff member."}, status=403)
            if instance.teacher != teacher:
                return Response({"error": "You can only delete your own logs."}, status=403)
            if instance.status != StaffActivityLog.STATUS_PENDING:
                return Response(
                    {"error": "You cannot delete a log that has already been reviewed."}, status=400
                )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pk=None):
        """Admin: approve or reject an activity log."""
        if not _is_admin(request.user):
            return Response({"error": "Admin only."}, status=403)
        instance = self.get_object()
        ser = ActivityReviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        action_val = ser.validated_data["action"]
        note = ser.validated_data.get("admin_note", "")

        instance.status = (
            StaffActivityLog.STATUS_APPROVED
            if action_val == "approve"
            else StaffActivityLog.STATUS_REJECTED
        )
        instance.admin_note = note
        instance.reviewed_by = request.user
        instance.reviewed_at = timezone.now()
        instance.save(update_fields=["status", "admin_note", "reviewed_by", "reviewed_at", "updated_at"])

        return Response(
            StaffActivityLogSerializer(instance, context={"request": request}).data
        )

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Admin dashboard summary: counts by status and category."""
        if not _is_admin(request.user):
            return Response({"error": "Admin only."}, status=403)
        from django.db.models import Count
        qs = self.get_queryset()

        by_status = {
            s: qs.filter(status=s).count()
            for s in (StaffActivityLog.STATUS_PENDING, StaffActivityLog.STATUS_APPROVED, StaffActivityLog.STATUS_REJECTED)
        }
        by_category = list(
            qs.values("category__name", "category__icon")
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )
        by_staff = list(
            qs.values(
                "teacher__user__first_name",
                "teacher__user__last_name",
                "teacher__employee_id",
                "teacher__staff_type",
            )
            .annotate(count=Count("id"))
            .order_by("-count")[:10]
        )
        return Response({
            "by_status": by_status,
            "by_category": by_category,
            "by_staff": by_staff,
            "total": qs.count(),
        })
