"""
teacher/pd_views.py
Professional Development — ViewSet with approval workflow and PDF export.

Lifecycle:  PENDING → APPROVED (visible on profile) | REJECTED (teacher edits & resubmits)

Permissions:
  Teacher : create / read own / edit+delete own PENDING or REJECTED records
  Admin   : read all / approve / reject / download PDF report
"""
import io
import logging
from datetime import date

from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers as drf_serializers

from tenants.mixins import TenantFilterMixin
from .models import ProfessionalDevelopment, Teacher

logger = logging.getLogger(__name__)


# ─── helpers ─────────────────────────────────────────────────────────────────

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


# ─── Serializers ──────────────────────────────────────────────────────────────

class PDSerializer(drf_serializers.ModelSerializer):
    dev_type_display    = drf_serializers.CharField(source="get_dev_type_display", read_only=True)
    approval_status_display = drf_serializers.CharField(source="get_approval_status_display", read_only=True)
    teacher_name        = drf_serializers.SerializerMethodField()
    teacher_employee_id = drf_serializers.CharField(source="teacher.employee_id", read_only=True)
    reviewed_by_name    = drf_serializers.SerializerMethodField()
    is_verified         = drf_serializers.BooleanField(read_only=True)   # property
    is_expired          = drf_serializers.SerializerMethodField()

    class Meta:
        model  = ProfessionalDevelopment
        fields = "__all__"
        read_only_fields = [
            "id", "teacher", "approval_status", "rejection_reason",
            "reviewed_by", "reviewed_at", "created_at", "updated_at",
        ]

    def get_teacher_name(self, obj):
        return obj.teacher.user.get_full_name()

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None

    def get_is_expired(self, obj):
        return bool(obj.date_expires and obj.date_expires < date.today())


class PDWriteSerializer(drf_serializers.ModelSerializer):
    class Meta:
        model  = ProfessionalDevelopment
        fields = [
            "title", "dev_type", "provider", "date_completed",
            "date_expires", "duration_hours", "certificate_url", "description",
        ]

    def validate_duration_hours(self, value):
        if value is not None and value <= 0:
            raise drf_serializers.ValidationError("Duration must be greater than zero.")
        return value

    def validate(self, attrs):
        expires   = attrs.get("date_expires")
        completed = attrs.get("date_completed")
        if expires and completed and expires <= completed:
            raise drf_serializers.ValidationError(
                {"date_expires": "Expiry date must be after the completion date."}
            )
        return attrs


class PDReviewSerializer(drf_serializers.Serializer):
    action           = drf_serializers.ChoiceField(choices=["approve", "reject"])
    rejection_reason = drf_serializers.CharField(required=False, allow_blank=True)


# ─── ViewSet ──────────────────────────────────────────────────────────────────

class ProfessionalDevelopmentViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    permission_classes  = [IsAuthenticated]
    filter_backends     = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields    = ["dev_type", "approval_status", "teacher"]
    search_fields       = ["title", "provider", "description"]
    ordering_fields     = ["date_completed", "created_at", "dev_type", "approval_status"]
    ordering            = ["-date_completed", "-created_at"]

    def get_queryset(self):
        qs = ProfessionalDevelopment.objects.select_related("teacher__user", "reviewed_by")
        if _is_admin(self.request.user):
            return qs
        teacher = _get_teacher(self.request.user)
        return qs.filter(teacher=teacher) if teacher else qs.none()

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return PDWriteSerializer
        return PDSerializer

    # ── Create (teacher submits; starts as PENDING) ───────────────────────────

    def create(self, request, *args, **kwargs):
        write_ser = PDWriteSerializer(data=request.data, context=self.get_serializer_context())
        write_ser.is_valid(raise_exception=True)
        self.perform_create(write_ser)
        read_ser = PDSerializer(write_ser.instance, context=self.get_serializer_context())
        return Response(read_ser.data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        if _is_admin(self.request.user):
            teacher_id = self.request.data.get("teacher")
            if not teacher_id:
                raise ValidationError({"teacher": "Required when created by admin."})
            try:
                teacher = Teacher.objects.get(pk=teacher_id)
            except Teacher.DoesNotExist:
                raise ValidationError({"teacher": "Teacher not found."})
        else:
            teacher = _get_teacher(self.request.user)
            if not teacher:
                raise PermissionDenied("No staff profile linked to this account.")
        # All new records start as PENDING — awaiting admin approval
        serializer.save(tenant=tenant, teacher=teacher,
                        approval_status=ProfessionalDevelopment.STATUS_PENDING)
        logger.info("PD record submitted by %s: %s", teacher.user.get_full_name(), serializer.instance.title)

    # ── Update / Delete (only allowed on PENDING or REJECTED, own records) ────

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not _is_admin(request.user):
            teacher = _get_teacher(request.user)
            if not teacher or instance.teacher != teacher:
                raise PermissionDenied("You can only edit your own records.")
            if instance.approval_status == ProfessionalDevelopment.STATUS_APPROVED:
                raise ValidationError(
                    "Approved records cannot be edited. Contact the admin to revoke approval first."
                )
        # Editing a rejected record automatically resets it to PENDING for re-review
        response = super().update(request, *args, **kwargs)
        if not _is_admin(request.user) and instance.approval_status == ProfessionalDevelopment.STATUS_REJECTED:
            instance.refresh_from_db()
            instance.approval_status = ProfessionalDevelopment.STATUS_PENDING
            instance.rejection_reason = ""
            instance.reviewed_by = None
            instance.reviewed_at = None
            instance.save(update_fields=["approval_status", "rejection_reason", "reviewed_by", "reviewed_at"])
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not _is_admin(request.user):
            teacher = _get_teacher(request.user)
            if not teacher or instance.teacher != teacher:
                raise PermissionDenied("You can only delete your own records.")
            if instance.approval_status == ProfessionalDevelopment.STATUS_APPROVED:
                raise ValidationError("Approved records cannot be deleted.")
        return super().destroy(request, *args, **kwargs)

    # ── Admin: approve or reject ───────────────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pk=None):
        """Admin approves or rejects a PD record."""
        if not _is_admin(request.user):
            raise PermissionDenied("Admin only.")
        instance = self.get_object()
        ser = PDReviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        action_val       = ser.validated_data["action"]
        rejection_reason = ser.validated_data.get("rejection_reason", "")

        if action_val == "reject" and not rejection_reason.strip():
            raise ValidationError({"rejection_reason": "Please provide a reason for rejection."})

        instance.approval_status  = (
            ProfessionalDevelopment.STATUS_APPROVED
            if action_val == "approve"
            else ProfessionalDevelopment.STATUS_REJECTED
        )
        instance.rejection_reason = rejection_reason if action_val == "reject" else ""
        instance.reviewed_by  = request.user
        instance.reviewed_at  = timezone.now()
        instance.save(update_fields=[
            "approval_status", "rejection_reason",
            "reviewed_by", "reviewed_at", "updated_at",
        ])
        logger.info(
            "PD record %s %s by %s",
            instance.id, instance.approval_status, request.user.get_full_name()
        )
        return Response(PDSerializer(instance, context={"request": request}).data)

    # ── Admin: revoke an approval so teacher can edit ─────────────────────────

    @action(detail=True, methods=["post"], url_path="revoke-approval")
    def revoke_approval(self, request, pk=None):
        if not _is_admin(request.user):
            raise PermissionDenied("Admin only.")
        instance = self.get_object()
        instance.approval_status = ProfessionalDevelopment.STATUS_PENDING
        instance.rejection_reason = ""
        instance.reviewed_by = None
        instance.reviewed_at = None
        instance.save(update_fields=["approval_status", "rejection_reason", "reviewed_by", "reviewed_at", "updated_at"])
        return Response(PDSerializer(instance, context={"request": request}).data)

    # ── Summary stats (only APPROVED records count) ───────────────────────────

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        qs = self.get_queryset()
        approved_qs = qs.filter(approval_status=ProfessionalDevelopment.STATUS_APPROVED)
        from django.db.models import Sum, Count
        stats = approved_qs.aggregate(total_hours=Sum("duration_hours"), total_records=Count("id"))
        by_type      = list(approved_qs.values("dev_type").annotate(count=Count("id")).order_by("-count"))
        certifications = approved_qs.filter(dev_type="certification").count()
        workshops      = approved_qs.filter(dev_type__in=["workshop", "seminar", "conference"]).count()
        pending_count  = qs.filter(approval_status=ProfessionalDevelopment.STATUS_PENDING).count()
        return Response({
            "total_records":   stats["total_records"] or 0,
            "total_hours":     float(stats["total_hours"] or 0),
            "certifications":  certifications,
            "workshops":       workshops,
            "by_type":         by_type,
            "pending_review":  pending_count,
        })

    # ── Admin: PDF report for one teacher ─────────────────────────────────────

    @action(detail=False, methods=["get"], url_path="teacher-report")
    def teacher_report(self, request):
        """
        GET /api/teachers/professional-development/teacher-report/?teacher=<id>
        Returns a PDF listing all APPROVED PD records for that teacher.
        """
        if not _is_admin(request.user):
            raise PermissionDenied("Admin only.")

        teacher_id = request.query_params.get("teacher")
        if not teacher_id:
            return Response({"error": "teacher query param required."}, status=400)
        try:
            teacher = Teacher.objects.select_related("user").get(pk=teacher_id)
        except Teacher.DoesNotExist:
            return Response({"error": "Teacher not found."}, status=404)

        records = ProfessionalDevelopment.objects.filter(
            teacher=teacher,
            approval_status=ProfessionalDevelopment.STATUS_APPROVED,
        ).select_related("reviewed_by").order_by("dev_type", "-date_completed")

        return _generate_pd_pdf(teacher, records, request)


# ─── PDF generator ────────────────────────────────────────────────────────────

def _generate_pd_pdf(teacher, records, request):
    """Generate a professional-looking PDF of approved PD records."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph,
            Spacer, HRFlowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        from django.http import HttpResponse
    except ImportError:
        return Response({"error": "reportlab not installed."}, status=500)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
    )

    styles = getSampleStyleSheet()
    NAVY   = colors.HexColor("#1F4E79")
    TEAL   = colors.HexColor("#0D6E6E")
    LIGHT  = colors.HexColor("#E8F4FD")
    STRIPE = colors.HexColor("#F8FAFC")

    title_s = ParagraphStyle("T", parent=styles["Title"],
                              fontSize=18, textColor=NAVY, spaceAfter=4, alignment=TA_CENTER)
    sub_s   = ParagraphStyle("S", parent=styles["Normal"],
                              fontSize=10, textColor=colors.grey, spaceAfter=2, alignment=TA_CENTER)
    h2_s    = ParagraphStyle("H2", parent=styles["Heading2"],
                              fontSize=12, textColor=NAVY, spaceAfter=6, spaceBefore=10)
    body_s  = ParagraphStyle("B", parent=styles["Normal"], fontSize=9, leading=13)
    small_s = ParagraphStyle("Sm", parent=styles["Normal"], fontSize=8,
                              textColor=colors.grey, leading=11)

    # ── Get tenant/school info ────────────────────────────────────────────────
    school_name = "School"
    try:
        tenant = getattr(request, "tenant", None)
        if tenant:
            school_name = tenant.name
    except Exception:
        pass

    teacher_name = teacher.user.get_full_name()
    qualification = teacher.qualification or "—"
    specialization = teacher.specialization or "—"
    hire_date = teacher.hire_date.strftime("%d %B %Y") if teacher.hire_date else "—"

    elements = []

    # ── Header ────────────────────────────────────────────────────────────────
    elements.append(Paragraph(school_name.upper(), title_s))
    elements.append(Paragraph("Professional Development Certificate", sub_s))
    elements.append(HRFlowable(width="100%", thickness=2, color=NAVY))
    elements.append(Spacer(1, 4*mm))

    # ── Teacher info table ────────────────────────────────────────────────────
    info_data = [
        ["Teacher:", teacher_name,        "Employee ID:", teacher.employee_id or "—"],
        ["Qualification:", qualification,  "Specialization:", specialization],
        ["Hire Date:", hire_date,          "Staff Type:", (teacher.staff_type or "—").title()],
    ]
    info_tbl = Table(info_data, colWidths=[32*mm, 60*mm, 32*mm, 46*mm])
    info_tbl.setStyle(TableStyle([
        ("FONTNAME",   (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",   (2, 0), (2, -1), "Helvetica-Bold"),
        ("TEXTCOLOR",  (0, 0), (0, -1), NAVY),
        ("TEXTCOLOR",  (2, 0), (2, -1), NAVY),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT, colors.white]),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_tbl)
    elements.append(Spacer(1, 5*mm))

    if not records:
        elements.append(Paragraph("No approved professional development records found.", body_s))
    else:
        # ── Group by type ──────────────────────────────────────────────────────
        from collections import defaultdict
        grouped: dict = defaultdict(list)
        for r in records:
            grouped[r.get_dev_type_display()].append(r)

        for dev_type_label, type_records in sorted(grouped.items()):
            elements.append(Paragraph(dev_type_label, h2_s))

            tbl_data = [["Title / Programme", "Provider", "Completed", "Hrs", "Expires"]]
            for r in type_records:
                exp = r.date_expires.strftime("%b %Y") if r.date_expires else "—"
                hrs = str(r.duration_hours) if r.duration_hours else "—"
                tbl_data.append([
                    Paragraph(r.title, body_s),
                    Paragraph(r.provider or "—", small_s),
                    r.date_completed.strftime("%d %b %Y"),
                    hrs, exp,
                ])

            tbl = Table(tbl_data, colWidths=[65*mm, 45*mm, 28*mm, 14*mm, 18*mm], repeatRows=1)
            tbl.setStyle(TableStyle([
                # Header
                ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
                ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",      (0, 0), (-1, 0), 9),
                ("ALIGN",         (0, 0), (-1, 0), "CENTER"),
                ("TOPPADDING",    (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                # Body
                ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE",      (0, 1), (-1, -1), 8),
                ("TOPPADDING",    (0, 1), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                ("LEFTPADDING",   (0, 1), (-1, -1), 4),
                ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, STRIPE]),
                ("ALIGN",         (2, 1), (-1, -1), "CENTER"),
                ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ]))
            elements.append(tbl)
            elements.append(Spacer(1, 4*mm))

    # ── Summary footer ────────────────────────────────────────────────────────
    from django.db.models import Sum
    total_hrs = records.aggregate(h=Sum("duration_hours"))["h"] or 0
    elements.append(HRFlowable(width="100%", thickness=1, color=NAVY))
    elements.append(Spacer(1, 2*mm))
    summary_data = [
        [
            f"Total approved records: {len(list(records))}",
            f"Total CPD hours: {float(total_hrs):.1f}",
            f"Generated: {date.today().strftime('%d %B %Y')}",
        ]
    ]
    summary_tbl = Table(summary_data, colWidths=[60*mm, 60*mm, 50*mm])
    summary_tbl.setStyle(TableStyle([
        ("FONTNAME",  (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",  (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(summary_tbl)

    doc.build(elements)
    buf.seek(0)

    safe_name = teacher_name.replace(" ", "_")
    from django.http import HttpResponse as DjHttp
    response = DjHttp(buf.read(), content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="PD_Report_{safe_name}.pdf"'
    )
    return response
