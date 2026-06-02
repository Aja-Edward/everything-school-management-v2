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
from django.db.models import Count, Q
from django.http import HttpResponse, StreamingHttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from classroom.models import Section
from parent.models import ParentProfile
from schoolSettings.permissions import HasAttendancePermission, HasAttendancePermissionOrReadOnly
from students.models import Student
from teacher.models import Teacher
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination
from utils.section_filtering import AutoSectionFilterMixin

from .filters import AttendanceFilter
from .models import Attendance, AttendanceSession
from .serializers import (
    AttendanceBulkUpsertSerializer,
    AttendanceSerializer,
    AttendanceStatsSerializer,
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

        queryset = super().get_queryset().select_related(*_SELECT)

        # Parents see only their children's records.
        if user.is_authenticated and getattr(user, "role", None) == "parent":
            try:
                parent_profile = ParentProfile.objects.get(user=user)
                return queryset.filter(student__in=parent_profile.children.all())
            except ParentProfile.DoesNotExist:
                return Attendance.objects.none()

        return queryset

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
