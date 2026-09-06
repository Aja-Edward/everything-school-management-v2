"""
Attendance views
────────────────
Changes from original
  #2  bulk_upsert action — single atomic POST replaces N individual saves
  #3  stats action     — server-side aggregation, no client-side counting
  #4  import_csv       — row-level error reporting, partial-success option
  #5  teacher SET_NULL — handled in model; view unchanged
  #10 export_pdf       — WeasyPrint-based server-side PDF export
      export_csv       — unchanged (still streaming)
"""

import csv
import io
import logging
from io import TextIOWrapper

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.http import HttpResponse, StreamingHttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from classroom.models import Section
from parent.models import ParentProfile
from schoolSettings.permissions import (
    HasAttendancePermission,
    HasAttendancePermissionOrReadOnly,
    HasStudentsPermission,
    HasStudentsPermissionOrReadOnly,
)
from security.utils import log_action
from students.models import Student
from teacher.models import Teacher
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination
from utils.section_filtering import AutoSectionFilterMixin

from .filters import AttendanceFilter
from .gate import ScanError, record_scan, settings_for
from .models import (
    Attendance,
    AttendanceSession,
    GateScan,
    StudentTag,
    TagStatus,
    normalize_tag_uid,
)
from .serializers import (
    AttendanceBulkUpsertSerializer,
    AttendanceSerializer,
    AttendanceStatsSerializer,
    GateScanSerializer,
    ScanBatchSerializer,
    ScanCreateSerializer,
    StudentTagSerializer,
    TagEnrollSerializer,
    TagReassignSerializer,
    TagRevokeSerializer,
    _student_identity,
)

logger = logging.getLogger(__name__)

# ── Shared select_related tuple ───────────────────────────────────────────────

_SELECT = (
    "student__user",
    "student__stream",
    "student__student_class",
    "student__student_class__education_level",
    "student__section",
    "teacher__user",
    "section",
)


class AttendanceViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.

    Endpoints
    ─────────
    GET    /attendance/                 list
    POST   /attendance/                 create
    GET    /attendance/{id}/            retrieve
    PATCH  /attendance/{id}/            partial update
    DELETE /attendance/{id}/            destroy
    POST   /attendance/bulk-upsert/     create-or-update many records atomically
    GET    /attendance/stats/           server-side aggregated statistics
    POST   /attendance/import-csv/      import from CSV with row-level error report
    GET    /attendance/export-csv/      streaming CSV download
    GET    /attendance/export-pdf/      WeasyPrint PDF download
    """

    serializer_class = AttendanceSerializer
    queryset = Attendance.objects.all()
    permission_classes = [IsAuthenticated, HasAttendancePermissionOrReadOnly]
    pagination_class = LargeResultsPagination
    filter_backends = [DjangoFilterBackend,
                       filters.SearchFilter, filters.OrderingFilter]
    filterset_class = AttendanceFilter
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "teacher__user__first_name",
        "teacher__user__last_name",
    ]
    ordering_fields = ["date", "student", "session", "created_at"]

    # ── Queryset ──────────────────────────────────────────────────────────────

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)

        # Students see only their own records.
        if user.is_authenticated and getattr(user, "role", None) == "student":
            try:
                student = Student.objects.get(user=user, tenant=tenant)
                return (
                    Attendance.objects
                    .filter(student=student, tenant=tenant)
                    .select_related(*_SELECT)
                )
            except Student.DoesNotExist:
                return Attendance.objects.none()

        # Parents see only their children's records. Built from scratch, like
        # the student branch above, rather than from super().get_queryset():
        # AutoSectionFilterMixin restricts by education-level access, which a
        # parent has none of, so building on it yields an empty queryset. A
        # parent's scope is defined by which children are theirs.
        if user.is_authenticated and getattr(user, "role", None) == "parent":
            try:
                parent_profile = ParentProfile.objects.get(
                    user=user, tenant=tenant)
            except ParentProfile.DoesNotExist:
                return Attendance.objects.none()
            return (
                Attendance.objects
                .filter(student__in=parent_profile.get_students(), tenant=tenant)
                .select_related(*_SELECT)
            )

        return super().get_queryset().select_related(*_SELECT)

    # ── FIX #2 — Bulk upsert ──────────────────────────────────────────────────

    @action(
        detail=False,
        methods=["post"],
        url_path="bulk-upsert",
        permission_classes=[IsAuthenticated, HasAttendancePermission],
    )
    def bulk_upsert(self, request):
        """
        Atomically create-or-update up to 500 attendance records.

        Lookup key: (tenant, student, section, date, session)
        If a matching record exists it is updated; otherwise created.

        Returns
        -------
        {
          "created": <int>,
          "updated": <int>,
          "records": [ <AttendanceSerializer> ... ]
        }
        """
        serializer = AttendanceBulkUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tenant = request.tenant
        raw_items = serializer.validated_data["records"]

        # Resolve FK objects once, outside the loop
        student_ids = {item["student"] for item in raw_items}
        section_ids = {item["section"] for item in raw_items}
        teacher_ids = {item.get("teacher")
                       for item in raw_items if item.get("teacher")}

        students = {s.id: s for s in Student.objects.filter(
            id__in=student_ids, tenant=tenant)}
        sections = {s.id: s for s in Section.objects.filter(
            id__in=section_ids, tenant=tenant)}
        teachers = {t.id: t for t in Teacher.objects.filter(
            id__in=teacher_ids, tenant=tenant)}

        missing_students = student_ids - set(students)
        missing_sections = section_ids - set(sections)
        if missing_students or missing_sections:
            return Response(
                {
                    "error": "Some IDs not found in this tenant.",
                    "missing_students": list(missing_students),
                    "missing_sections": list(missing_sections),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.localdate()
        created_list = []
        updated_list = []

        with transaction.atomic():
            for item in raw_items:
                student = students[item["student"]]
                section = sections[item["section"]]
                teacher = teachers.get(item.get("teacher"))
                session = item.get("session", AttendanceSession.MORNING)
                date = item["date"]

                defaults = {
                    "status":          item["status"],
                    "teacher":         teacher,
                    "time_in":         item.get("time_in"),
                    "time_out":        item.get("time_out"),
                    "marked_late":     date < today,
                    "back_fill_reason": item.get("back_fill_reason", ""),
                }

                obj, created = Attendance.objects.update_or_create(
                    tenant=tenant,
                    student=student,
                    section=section,
                    date=date,
                    session=session,
                    defaults=defaults,
                )
                (created_list if created else updated_list).append(obj)

        all_objs = created_list + updated_list
        out_serializer = AttendanceSerializer(
            all_objs,
            many=True,
            context={"request": request},
        )
        return Response(
            {
                "created": len(created_list),
                "updated": len(updated_list),
                "records": out_serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    # ── FIX #3 — Server-side statistics ──────────────────────────────────────

    @action(
        detail=False,
        methods=["get"],
        url_path="stats",
        permission_classes=[IsAuthenticated],
    )
    def stats(self, request):
        """
        Return aggregated attendance counts for the filtered queryset.
        Supports all the same filter params as the list endpoint.

        Response shape
        --------------
        {
          "total_records":   <int>,
          "present_count":   <int>,
          "absent_count":    <int>,
          "late_count":      <int>,
          "excused_count":   <int>,
          "attendance_rate": <float 0-100>,
          "session_breakdown": {
            "morning":   { "P": n, "A": n, "L": n, "E": n },
            "afternoon": { "P": n, "A": n, "L": n, "E": n }
          }
        }
        """
        qs = self.filter_queryset(self.get_queryset())

        # Single DB round-trip — annotate counts for every status/session combo
        agg = qs.aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status="P")),
            absent=Count("id", filter=Q(status="A")),
            late=Count("id", filter=Q(status="L")),
            excused=Count("id", filter=Q(status="E")),
            # session breakdown
            morning_P=Count("id", filter=Q(
                session=AttendanceSession.MORNING,   status="P")),
            morning_A=Count("id", filter=Q(
                session=AttendanceSession.MORNING,   status="A")),
            morning_L=Count("id", filter=Q(
                session=AttendanceSession.MORNING,   status="L")),
            morning_E=Count("id", filter=Q(
                session=AttendanceSession.MORNING,   status="E")),
            afternoon_P=Count("id", filter=Q(
                session=AttendanceSession.AFTERNOON, status="P")),
            afternoon_A=Count("id", filter=Q(
                session=AttendanceSession.AFTERNOON, status="A")),
            afternoon_L=Count("id", filter=Q(
                session=AttendanceSession.AFTERNOON, status="L")),
            afternoon_E=Count("id", filter=Q(
                session=AttendanceSession.AFTERNOON, status="E")),
        )

        total = agg["total"] or 0
        present = agg["present"] or 0
        late = agg["late"] or 0

        attendance_rate = round(
            ((present + late) / total * 100), 2) if total else 0.0

        payload = {
            "total_records":   total,
            "present_count":   present,
            "absent_count":    agg["absent"] or 0,
            "late_count":      late,
            "excused_count":   agg["excused"] or 0,
            "attendance_rate": attendance_rate,
            "session_breakdown": {
                "morning": {
                    "P": agg["morning_P"],
                    "A": agg["morning_A"],
                    "L": agg["morning_L"],
                    "E": agg["morning_E"],
                },
                "afternoon": {
                    "P": agg["afternoon_P"],
                    "A": agg["afternoon_A"],
                    "L": agg["afternoon_L"],
                    "E": agg["afternoon_E"],
                },
            },
        }
        return Response(payload)

    # ── FIX #4 — CSV import with row-level error reporting ────────────────────

    @action(
        detail=False,
        methods=["post"],
        url_path="import-csv",
        permission_classes=[IsAuthenticated, HasAttendancePermission],
    )
    def import_csv(self, request):
        """
        Import attendance from a CSV file.

        Expected columns
        ----------------
        student, section, date, session (optional), status,
        teacher (optional), time_in (optional), time_out (optional),
        back_fill_reason (optional)

        Query params
        ------------
        ?partial=true  — import valid rows, skip invalid ones (default: false)
                         When false, any error rolls back the entire upload.

        Response
        --------
        {
          "imported":  <int>,
          "skipped":   <int>,          # only when partial=true
          "errors": [
            { "row": 3, "data": {...}, "error": "Student 99 not found" },
            ...
          ]
        }
        """
        csv_file = request.FILES.get("file")
        if not csv_file:
            return Response({"error": "No CSV file uploaded."}, status=400)

        partial = request.query_params.get(
            "partial", "false").lower() == "true"
        tenant = request.tenant
        today = timezone.localdate()

        try:
            decoded_file = TextIOWrapper(csv_file.file, encoding="utf-8")
            reader = list(csv.DictReader(decoded_file))
        except Exception as exc:
            return Response({"error": f"Could not parse file: {exc}"}, status=400)

        # Collect required columns
        required_cols = {"student", "section", "date", "status"}
        if reader:
            missing_cols = required_cols - set(reader[0].keys())
            if missing_cols:
                return Response(
                    {"error": f"Missing required columns: {missing_cols}"},
                    status=400,
                )

        row_errors = []
        valid_rows = []

        for idx, row in enumerate(reader, start=2):   # row 1 = header
            try:
                student = Student.objects.get(
                    id=row["student"].strip(), tenant=tenant)
                section = Section.objects.get(
                    id=row["section"].strip(), tenant=tenant)
                teacher = None
                if row.get("teacher", "").strip():
                    teacher = Teacher.objects.get(
                        id=row["teacher"].strip(), tenant=tenant)

                date_val = row["date"].strip()
                status_val = row["status"].strip().upper()
                if status_val not in {"P", "A", "L", "E"}:
                    raise ValueError(
                        f"Invalid status '{status_val}'. Must be P, A, L or E.")

                session_val = (row.get("session")
                               or AttendanceSession.MORNING).strip().lower()
                if session_val not in {AttendanceSession.MORNING, AttendanceSession.AFTERNOON}:
                    raise ValueError(
                        f"Invalid session '{session_val}'. Must be 'morning' or 'afternoon'."
                    )

                from datetime import date as date_type
                from django.utils.dateparse import parse_date
                parsed_date = parse_date(date_val)
                if not parsed_date:
                    raise ValueError(
                        f"Invalid date format '{date_val}'. Use YYYY-MM-DD.")

                valid_rows.append({
                    "student":          student,
                    "section":          section,
                    "teacher":          teacher,
                    "date":             parsed_date,
                    "session":          session_val,
                    "status":           status_val,
                    "time_in":          row.get("time_in") or None,
                    "time_out":         row.get("time_out") or None,
                    "back_fill_reason": row.get("back_fill_reason", "").strip(),
                    "marked_late":      parsed_date < today,
                })

            except (Student.DoesNotExist, Teacher.DoesNotExist, Section.DoesNotExist) as exc:
                row_errors.append({"row": idx, "data": row, "error": str(exc)})
                if not partial:
                    return Response(
                        {
                            "imported": 0,
                            "errors":   row_errors,
                            "message":  "Import aborted. Fix errors or use ?partial=true.",
                        },
                        status=400,
                    )
            except (KeyError, ValueError) as exc:
                row_errors.append({"row": idx, "data": row, "error": str(exc)})
                if not partial:
                    return Response(
                        {
                            "imported": 0,
                            "errors":   row_errors,
                            "message":  "Import aborted. Fix errors or use ?partial=true.",
                        },
                        status=400,
                    )

        # All rows parsed — write in one transaction
        try:
            with transaction.atomic():
                for vr in valid_rows:
                    Attendance.objects.update_or_create(
                        tenant=tenant,
                        student=vr["student"],
                        section=vr["section"],
                        date=vr["date"],
                        session=vr["session"],
                        defaults={k: vr[k] for k in
                                  ("teacher", "status", "time_in", "time_out",
                                   "marked_late", "back_fill_reason")},
                    )
        except Exception as exc:
            logger.exception("CSV import DB write failed")
            return Response({"error": f"Database error: {exc}"}, status=500)

        return Response(
            {
                "imported": len(valid_rows),
                "skipped":  len(row_errors),
                "errors":   row_errors,
                "message":  "Import complete." if not row_errors else
                f"Imported {len(valid_rows)} rows; {len(row_errors)} skipped.",
            },
            status=201,
        )

    # ── Streaming CSV export (unchanged) ──────────────────────────────────────

    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):
        def stream_rows():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(
                ["student", "teacher", "section", "date", "session", "status",
                 "time_in", "time_out", "marked_late", "created_at", "updated_at"]
            )
            yield buf.getvalue()

            qs = self.filter_queryset(self.get_queryset())
            for record in qs.iterator(chunk_size=500):
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow([
                    record.student_id,
                    record.teacher_id or "",
                    record.section_id,
                    record.date,
                    record.session,
                    record.status,
                    record.time_in or "",
                    record.time_out or "",
                    record.marked_late,
                    record.created_at.isoformat(),
                    record.updated_at.isoformat(),
                ])
                yield buf.getvalue()

        response = StreamingHttpResponse(
            stream_rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="attendance.csv"'
        return response

    # ── FIX #10 — WeasyPrint PDF export ──────────────────────────────────────

    @action(detail=False, methods=["get"], url_path="export-pdf",
            permission_classes=[IsAuthenticated, HasAttendancePermission])
    def export_pdf(self, request):
        """
        Generate a formatted PDF attendance report using WeasyPrint.

        Supports all the same filter params as the list endpoint.
        Add ?title=My+Report to customise the report heading.
        """
        try:
            from weasyprint import HTML as WeasyHTML, CSS
        except ImportError:
            return Response(
                {"error": "PDF export requires WeasyPrint. Install it on the server."},
                status=500,
            )

        qs = self.filter_queryset(self.get_queryset()).order_by(
            "-date", "session", "student")

        # Collect stats in one query
        agg = qs.aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status="P")),
            absent=Count("id", filter=Q(status="A")),
            late=Count("id", filter=Q(status="L")),
            excused=Count("id", filter=Q(status="E")),
        )
        total = agg["total"] or 0
        present = agg["present"] or 0
        late = agg["late"] or 0
        rate = round((present + late) / total * 100, 1) if total else 0.0

        context = {
            "title":      request.query_params.get("title", "Attendance Report"),
            "generated":  timezone.now().strftime("%d %b %Y, %H:%M"),
            # cap for memory safety; streaming for larger exports
            "records":    qs[:2000],
            "stats": {
                "total":   total,
                "present": present,
                "absent":  agg["absent"] or 0,
                "late":    late,
                "excused": agg["excused"] or 0,
                "rate":    rate,
            },
            "sessions": {
                AttendanceSession.MORNING:   "Morning",
                AttendanceSession.AFTERNOON: "Afternoon",
            },
        }

        html_string = render_to_string("attendance/export_pdf.html", context)

        try:
            pdf_bytes = WeasyHTML(string=html_string).write_pdf()
        except Exception as exc:
            logger.exception("WeasyPrint PDF generation failed")
            return Response({"error": f"PDF generation failed: {exc}"}, status=500)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="attendance_report.pdf"'
        return response


class StudentTagViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    Chip/card enrollment for the gate scanner.

    Endpoints
    ─────────
    GET    /attendance/tags/                list enrolled tags
    POST   /attendance/tags/                enroll a chip for a student
    GET    /attendance/tags/{id}/           retrieve
    PATCH  /attendance/tags/{id}/           edit the label (uid and student are fixed)
    POST   /attendance/tags/{id}/revoke/    retire a tag (lost or revoked)
    POST   /attendance/tags/reassign/       move a UID to a different student
    GET    /attendance/tags/resolve/?uid=   identify a chip, no side effects
    GET    /attendance/tags/roster/         students plus enrollment state

    Deliberately no AutoSectionFilterMixin, unlike AttendanceViewSet. That
    mixin narrows a queryset to the caller's education levels and empties it
    for anyone with none — and a teacher's levels come from their assigned
    classrooms. A gate is school-wide: whoever is on the gate has to identify
    every child who walks through it, not only the ones in their own section.
    Tenant isolation is the security boundary here; section is not.

    Tags are never destroyed, only revoked, so history stays attributable.
    """

    serializer_class = StudentTagSerializer
    queryset = StudentTag.objects.all()
    permission_classes = [IsAuthenticated, HasStudentsPermissionOrReadOnly]
    pagination_class = LargeResultsPagination
    filter_backends = [DjangoFilterBackend,
                       filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["student", "status"]
    search_fields = [
        "uid",
        "label",
        "student__user__first_name",
        "student__user__last_name",
        "student__registration_number",
    ]
    ordering_fields = ["issued_at", "uid", "status"]

    _TAG_SELECT = (
        "student__user",
        "student__section",
        "student__student_class",
        "student__student_class__education_level",
        "issued_by",
        "revoked_by",
    )

    def get_queryset(self):
        return super().get_queryset().select_related(*self._TAG_SELECT)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _tenant(self):
        return getattr(self.request, "tenant", None)

    def _student_in_tenant(self, student_id):
        return (
            Student.objects
            .filter(id=student_id, tenant=self._tenant())
            .select_related(
                "user", "section", "student_class",
                "student_class__education_level",
            )
            .first()
        )

    def _active_tag_for_uid(self, uid):
        return (
            StudentTag.objects
            .filter(tenant=self._tenant(), uid=uid, status=TagStatus.ACTIVE)
            .select_related("student__user", "student__section",
                            "student__student_class")
            .first()
        )

    def _serialize(self, tag):
        return StudentTagSerializer(tag, context=self.get_serializer_context()).data

    # ── Create / update ───────────────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        """
        Enroll a chip. Called from the phone, which has just read the UID.

        Conflicts come back with a machine-readable `code` so the scanner can
        offer the right next step rather than showing a raw validation blob.
        """
        serializer = TagEnrollSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        tenant = self._tenant()
        student = self._student_in_tenant(data["student"])
        if student is None:
            return Response(
                {
                    "code": "student_not_found",
                    "detail": "No such student in this school.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        clash = self._active_tag_for_uid(data["uid"])
        if clash:
            return Response(
                {
                    "code": "uid_already_assigned",
                    "detail": "That chip is already enrolled for another student.",
                    "assigned_to": _student_identity(clash.student),
                    "tag": {"id": clash.id, "issued_at": clash.issued_at},
                },
                status=status.HTTP_409_CONFLICT,
            )

        tag = StudentTag.objects.create(
            tenant=tenant,
            student=student,
            uid=data["uid"],
            label=data.get("label", ""),
            issued_by=request.user,
        )
        log_action(
            "tag_enrolled",
            request=request,
            user=request.user,
            metadata={"tag_id": tag.id, "uid": tag.uid, "student_id": student.id},
        )
        return Response(self._serialize(tag), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Only the label is editable — rebinding a chip goes through reassign."""
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.save(
            uid=serializer.instance.uid,
            student=serializer.instance.student,
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {
                "code": "use_revoke",
                "detail": (
                    "Tags are revoked, not deleted, so past scans stay "
                    "attributable. POST to this tag's revoke/ endpoint."
                ),
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    # ── Revoke ────────────────────────────────────────────────────────────────

    @action(
        detail=True,
        methods=["post"],
        url_path="revoke",
        permission_classes=[IsAuthenticated, HasStudentsPermission],
    )
    def revoke(self, request, pk=None):
        """Retire a tag: a lost bag, or a chip taken out of service."""
        tag = self.get_object()
        serializer = TagRevokeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if tag.status != TagStatus.ACTIVE:
            return Response(
                {
                    "code": "tag_not_active",
                    "detail": f"This tag is already {tag.get_status_display().lower()}.",
                    "tag": self._serialize(tag),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        tag.status = data["status"]
        tag.revoked_at = timezone.now()
        tag.revoked_by = request.user
        tag.revoke_reason = data.get("reason", "")
        tag.save(update_fields=[
            "status", "revoked_at", "revoked_by", "revoke_reason", "uid",
        ])

        log_action(
            "tag_revoked",
            request=request,
            user=request.user,
            metadata={
                "tag_id": tag.id,
                "uid": tag.uid,
                "student_id": tag.student_id,
                "status": tag.status,
                "reason": tag.revoke_reason,
            },
        )
        return Response(self._serialize(tag), status=status.HTTP_200_OK)

    # ── Reassign ──────────────────────────────────────────────────────────────

    @action(
        detail=False,
        methods=["post"],
        url_path="reassign",
        permission_classes=[IsAuthenticated, HasStudentsPermission],
    )
    def reassign(self, request):
        """
        Point a UID at a different student, atomically: the tag holding it is
        revoked and a new one issued. For a chip found on the wrong bag.
        """
        serializer = TagReassignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        tenant = self._tenant()
        student = self._student_in_tenant(data["student"])
        if student is None:
            return Response(
                {
                    "code": "student_not_found",
                    "detail": "No such student in this school.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            previous = self._active_tag_for_uid(data["uid"])
            if previous and previous.student_id == student.id:
                return Response(
                    {
                        "code": "already_assigned_to_student",
                        "detail": "That chip is already enrolled for this student.",
                        "tag": self._serialize(previous),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            previous_student_id = None
            if previous:
                previous_student_id = previous.student_id
                previous.status = TagStatus.REVOKED
                previous.revoked_at = timezone.now()
                previous.revoked_by = request.user
                previous.revoke_reason = (
                    data.get("reason", "") or "Reassigned to another student"
                )
                previous.save(update_fields=[
                    "status", "revoked_at", "revoked_by", "revoke_reason", "uid",
                ])

            tag = StudentTag.objects.create(
                tenant=tenant,
                student=student,
                uid=data["uid"],
                issued_by=request.user,
            )

        log_action(
            "tag_reassigned",
            request=request,
            user=request.user,
            metadata={
                "tag_id": tag.id,
                "uid": tag.uid,
                "student_id": student.id,
                "previous_student_id": previous_student_id,
                "reason": data.get("reason", ""),
            },
        )
        return Response(self._serialize(tag), status=status.HTTP_201_CREATED)

    # ── Resolve ───────────────────────────────────────────────────────────────

    @action(
        detail=False,
        methods=["get"],
        url_path="resolve",
        permission_classes=[IsAuthenticated, HasAttendancePermission],
    )
    def resolve(self, request):
        """
        Identify a scanned chip. Read-only: this records nothing and moves no
        attendance, so the operator can check who a chip belongs to without
        marking anybody present.

        Unknown and retired UIDs are distinguished, because the scanner should
        offer to enroll the first and explain the second.
        """
        uid = normalize_tag_uid(request.query_params.get("uid", ""))
        if not uid:
            return Response(
                {"code": "uid_required", "detail": "Pass a uid query parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = self._tenant()
        active = self._active_tag_for_uid(uid)
        if active:
            return Response(
                {
                    "tag": self._serialize(active),
                    "student": _student_identity(active.student),
                },
                status=status.HTTP_200_OK,
            )

        retired = (
            StudentTag.objects
            .filter(tenant=tenant, uid=uid)
            .select_related("student__user", "student__section",
                            "student__student_class")
            .order_by("-revoked_at", "-issued_at")
            .first()
        )
        if retired:
            return Response(
                {
                    "code": "uid_not_active",
                    "detail": (
                        f"This chip was {retired.get_status_display().lower()} "
                        f"and is no longer in use."
                    ),
                    "tag": self._serialize(retired),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "code": "uid_not_enrolled",
                "detail": "This chip is not enrolled for any student.",
                "uid": uid,
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    # ── Roster ────────────────────────────────────────────────────────────────

    @action(
        detail=False,
        methods=["get"],
        url_path="roster",
        permission_classes=[IsAuthenticated, HasAttendancePermission],
    )
    def roster(self, request):
        """
        Students with their enrollment state, for working down a class list
        chip by chip.

        Query params: `section`, `enrolled` (true/false), `search`.
        `counts` is always over the whole section, not the filtered page, so
        the app can show real progress — "38 of 42 enrolled" — while listing
        only the four students still outstanding.
        """
        tenant = self._tenant()
        students = (
            Student.objects
            .filter(tenant=tenant, is_active=True)
            .select_related("user", "section", "student_class",
                            "student_class__education_level")
            .prefetch_related(
                Prefetch(
                    "tags",
                    queryset=StudentTag.objects.filter(
                        tenant=tenant, status=TagStatus.ACTIVE),
                    to_attr="active_tags",
                )
            )
        )

        section_id = request.query_params.get("section")
        section = None
        if section_id:
            section = Section.objects.filter(
                id=section_id, tenant=tenant).first()
            if section is None:
                return Response(
                    {
                        "code": "section_not_found",
                        "detail": "No such section in this school.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            students = students.filter(section=section)

        search = request.query_params.get("search")
        if search:
            students = students.filter(
                Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(registration_number__icontains=search)
            )

        # Counts describe the section as a whole, before the enrolled filter.
        enrolled_ids = set(
            StudentTag.objects
            .filter(tenant=tenant, status=TagStatus.ACTIVE,
                    student__in=students)
            .values_list("student_id", flat=True)
        )
        total = students.count()
        counts = {
            "total": total,
            "enrolled": len(enrolled_ids),
            "unenrolled": total - len(enrolled_ids),
        }

        enrolled_param = (request.query_params.get("enrolled") or "").lower()
        if enrolled_param in {"true", "1", "yes"}:
            students = students.filter(id__in=enrolled_ids)
        elif enrolled_param in {"false", "0", "no"}:
            students = students.exclude(id__in=enrolled_ids)

        students = students.order_by(
            "student_class__order", "section__name", "user__first_name")

        page = self.paginate_queryset(students)
        rows = [self._roster_row(student) for student in (page or students)]

        payload = {
            "section": (
                {"id": section.id, "name": section.name} if section else None
            ),
            "counts": counts,
            "students": rows,
        }

        if page is not None:
            paginated = self.get_paginated_response(rows)
            paginated.data["section"] = payload["section"]
            paginated.data["counts"] = counts
            return paginated

        return Response(payload, status=status.HTTP_200_OK)

    def _roster_row(self, student):
        active = getattr(student, "active_tags", [])
        row = _student_identity(student)
        row["tags"] = [
            {
                "id": tag.id,
                "uid": tag.uid,
                "label": tag.label,
                "issued_at": tag.issued_at,
            }
            for tag in active
        ]
        row["is_enrolled"] = bool(active)
        return row


class GateScanViewSet(TenantFilterMixin,
                      mixins.CreateModelMixin,
                      mixins.ListModelMixin,
                      mixins.RetrieveModelMixin,
                      viewsets.GenericViewSet):
    """
    The gate: recording arrivals and departures from a chip tap.

    Endpoints
    ─────────
    POST /attendance/scans/         record one tap
    POST /attendance/scans/batch/   flush a queue from an offline gate
    GET  /attendance/scans/         the scan log (read-only)
    GET  /attendance/scans/{id}/    one scan

    The log is read-only over HTTP for the same reason it is read-only in the
    admin: an append-only record nobody can quietly rewrite is the point of
    keeping one. Corrections belong on the Attendance row it projected onto.

    School-wide, not section-scoped — see StudentTagViewSet for why.
    """

    serializer_class = GateScanSerializer
    queryset = GateScan.objects.all()
    permission_classes = [IsAuthenticated, HasAttendancePermissionOrReadOnly]
    pagination_class = LargeResultsPagination
    filter_backends = [DjangoFilterBackend,
                       filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["student", "direction", "is_duplicate", "device_id"]
    search_fields = [
        "uid",
        "device_id",
        "student__user__first_name",
        "student__user__last_name",
        "student__registration_number",
    ]
    ordering_fields = ["scanned_at", "received_at"]

    _SCAN_SELECT = (
        "student__user",
        "student__section",
        "student__student_class",
        "student__student_class__education_level",
        "scanned_by",
        "tag",
        "attendance",
    )

    def get_queryset(self):
        return super().get_queryset().select_related(*self._SCAN_SELECT)

    # ── Response shaping ──────────────────────────────────────────────────────

    def _outcome_payload(self, outcome):
        """
        Everything the scanner needs to show a result without a second call:
        who the child is, what was recorded, and anything odd about it.
        """
        attendance = outcome.attendance
        return {
            "student": _student_identity(outcome.scan.student),
            "scan": GateScanSerializer(
                outcome.scan, context=self.get_serializer_context()).data,
            "attendance": (
                AttendanceSerializer(
                    attendance, context=self.get_serializer_context()).data
                if attendance is not None else None
            ),
            "session": outcome.session,
            "status": outcome.derived_status,
            "duplicate": outcome.duplicate,
            "replayed": outcome.replayed,
            "warnings": outcome.warnings,
        }

    # ── Record one scan ───────────────────────────────────────────────────────

    def get_permissions(self):
        """Recording a scan writes attendance; reading the log does not."""
        if self.action in {"create", "batch"}:
            return [IsAuthenticated(), HasAttendancePermission()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        """
        Record one tap. The scanner sends a UID, a direction and a timestamp;
        section, date, session and present-versus-late are derived here.
        """
        serializer = ScanCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        tenant = getattr(request, "tenant", None)
        try:
            outcome = record_scan(
                tenant=tenant,
                uid=data["uid"],
                direction=data["direction"],
                scanned_at=data.get("scanned_at"),
                scanned_by=request.user,
                device_id=data.get("device_id", ""),
                client_scan_id=data.get("client_scan_id", ""),
            )
        except ScanError as error:
            return Response(error.as_payload(), status=error.status_code)

        # A duplicate or a replay changed nothing, so it is not a creation.
        http_status = (
            status.HTTP_200_OK
            if (outcome.duplicate or outcome.replayed)
            else status.HTTP_201_CREATED
        )
        return Response(self._outcome_payload(outcome), status=http_status)

    # ── Offline flush ─────────────────────────────────────────────────────────

    @action(
        detail=False,
        methods=["post"],
        url_path="batch",
        permission_classes=[IsAuthenticated, HasAttendancePermission],
    )
    def batch(self, request):
        """
        Flush a queue of scans from a gate that was offline.

        Each item stands alone: one unenrolled chip must not cost the other
        199 children their attendance. Always 200, with per-item outcomes by
        index and a summary — the caller reconciles its queue from `results`.
        """
        serializer = ScanBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data["scans"]

        tenant = getattr(request, "tenant", None)
        settings_row = settings_for(tenant)

        results = []
        recorded = duplicates = replayed = failed = 0

        for index, data in enumerate(items):
            try:
                outcome = record_scan(
                    tenant=tenant,
                    uid=data["uid"],
                    direction=data["direction"],
                    scanned_at=data.get("scanned_at"),
                    scanned_by=request.user,
                    device_id=data.get("device_id", ""),
                    client_scan_id=data.get("client_scan_id", ""),
                    settings=settings_row,
                )
            except ScanError as error:
                failed += 1
                results.append({
                    "index": index,
                    "ok": False,
                    "uid": data.get("uid"),
                    "client_scan_id": data.get("client_scan_id", ""),
                    **error.as_payload(),
                })
                continue
            except Exception:
                # One malformed row must not abort the flush; the gate would
                # retry the whole queue and we would lose the rest again.
                logger.exception(
                    "Gate scan batch item %s failed unexpectedly", index)
                failed += 1
                results.append({
                    "index": index,
                    "ok": False,
                    "uid": data.get("uid"),
                    "client_scan_id": data.get("client_scan_id", ""),
                    "code": "scan_failed",
                    "detail": "This scan could not be recorded.",
                })
                continue

            if outcome.replayed:
                replayed += 1
            elif outcome.duplicate:
                duplicates += 1
            else:
                recorded += 1

            payload = self._outcome_payload(outcome)
            payload.update({"index": index, "ok": True})
            results.append(payload)

        return Response(
            {
                "summary": {
                    "submitted": len(items),
                    "recorded": recorded,
                    "duplicates": duplicates,
                    "replayed": replayed,
                    "failed": failed,
                },
                "results": results,
            },
            status=status.HTTP_200_OK,
        )
