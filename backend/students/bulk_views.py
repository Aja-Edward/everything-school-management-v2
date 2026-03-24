"""
students/bulk_views.py

Views for:
  1. POST   /students/bulk-upload/           — accept file, enqueue Celery task
  2. GET    /students/bulk-upload/<id>/status/ — poll task progress
  3. GET    /students/bulk-upload/template/   — download pre-filled CSV/Excel template
  4. POST   /students/bulk-upload/<id>/export-credentials/
                                              — export login details (CSV / Excel / PDF)

All views are tenant-aware and admin-only.
"""

import io
import csv
import logging
import os
import tempfile
from datetime import datetime

from django.http import HttpResponse, FileResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

# ---------------------------------------------------------------------------
# Helper: get tenant from request
# ---------------------------------------------------------------------------

def _get_tenant(request):
    return getattr(request, "tenant", None)


# ---------------------------------------------------------------------------
# 1. Upload endpoint
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
def bulk_upload_students(request):
    """
    Accept a CSV or Excel file and queue it for async processing.

    Body (multipart/form-data):
      file               — required: the CSV or Excel file
      academic_session   — optional: PK of AcademicSession used to resolve Sections

    Returns immediately with { upload_id, task_id, status: 'pending' }.
    Frontend polls /bulk-upload/<upload_id>/status/ for progress.
    """
    tenant = _get_tenant(request)
    if not tenant:
        return Response({"error": "Tenant not identified."}, status=400)

    file_obj = request.FILES.get("file")
    if not file_obj:
        return Response({"error": "No file provided."}, status=400)

    _, ext = os.path.splitext(file_obj.name)
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return Response(
            {"error": f"Unsupported file type '{ext}'. Upload .csv, .xlsx, or .xls."},
            status=400,
        )

    academic_session_id = request.data.get("academic_session") or None

    # Save to a temp location the Celery worker can read
    upload_dir = os.path.join(tempfile.gettempdir(), "bulk_uploads")
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"bulk_{tenant.id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}"
    file_path = os.path.join(upload_dir, safe_name)
    with open(file_path, "wb") as dest:
        for chunk in file_obj.chunks():
            dest.write(chunk)

    # Create tracking record
    from students.models import BulkUploadRecord
    record = BulkUploadRecord.objects.create(
        tenant=tenant,
        uploaded_by=request.user,
        original_filename=file_obj.name,
        file_path=file_path,
        file_ext=ext,
        status="pending",
    )

    # Enqueue Celery task
    from students.tasks import process_bulk_student_upload
    task = process_bulk_student_upload.delay(
        upload_record_id=record.pk,
        tenant_id=tenant.id,
        file_path=file_path,
        file_ext=ext,
        academic_session_id=int(academic_session_id) if academic_session_id else None,
        uploaded_by_id=request.user.pk,
    )

    record.result_data = {"celery_task_id": task.id}
    record.save(update_fields=["result_data"])

    return Response(
        {
            "upload_id": record.pk,
            "task_id": task.id,
            "status": "pending",
            "message": "File accepted. Processing started.",
        },
        status=202,
    )


# ---------------------------------------------------------------------------
# 2. Status polling endpoint
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAdminUser])
def bulk_upload_status(request, upload_id):
    """
    Poll the processing status of a bulk upload.

    Returns:
      status        — pending | processing | completed | failed
      progress      — 0-100
      total_rows, processed_rows, imported_rows, failed_rows
      result        — present only when status == 'completed'
        result.summary    { total, imported, skipped }
        result.errors     [ { row, errors, data } ]
        result.imported   [ { row, full_name, username, password, ... } ]
    """
    from students.models import BulkUploadRecord

    tenant = _get_tenant(request)
    try:
        record = BulkUploadRecord.objects.get(pk=upload_id, tenant=tenant)
    except BulkUploadRecord.DoesNotExist:
        return Response({"error": "Upload record not found."}, status=404)

    payload = {
        "upload_id": record.pk,
        "status": record.status,
        "progress": record.progress_percent,
        "total_rows": record.total_rows,
        "processed_rows": record.processed_rows,
        "imported_rows": record.imported_rows,
        "failed_rows": record.failed_rows,
        "created_at": record.created_at,
        "original_filename": record.original_filename,
    }

    if record.status in ("completed", "failed"):
        payload["result"] = record.result_data

    return Response(payload)


# ---------------------------------------------------------------------------
# 3. Template download
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAdminUser])
def download_upload_template(request):
    """
    Download a blank CSV or Excel template with all required columns.
    Includes example rows, column descriptions in a second sheet (Excel only),
    and marks required fields with *.

    Query params:
      format — 'csv' (default) | 'excel'
    """
    fmt = request.query_params.get("format", "csv").lower()

    # Column definitions: (header, required, example, description)
    COLUMNS = [
        ("Registration Number",  False, "STU/2024/001",  "School-assigned reg number (optional, auto-generated if blank)"),
        ("Surname*",             True,  "Adeyemi",       "Student's surname / last name"),
        ("First Name*",          True,  "Fatima",        "Student's first name"),
        ("Middle Name",          False, "Grace",         "Optional middle name"),
        ("Gender*",              True,  "F",             "M or F"),
        ("Date of Birth*",       True,  "2010-03-15",    "Format: YYYY-MM-DD"),
        ("LGA*",                 True,  "Ikeja",         "Local Government Area of origin"),
        ("Blood Group",          False, "O+",            "e.g. A+, B-, O+, AB+"),
        ("Place of Birth*",      True,  "Lagos",         "City / town of birth"),
        ("Class Code*",          True,  "JSS_1",         "Exact class code from the system (e.g. JSS_1, SS_3, PRIMARY_4)"),
        ("Section*",             True,  "A",             "Section name (e.g. A, B, Gold)"),
        ("Stream",               False, "SCIENCE",       "Required only for Senior Secondary. Leave blank otherwise."),
        ("Year Admitted*",       True,  "2024",          "4-digit year (e.g. 2024)"),
        ("Admission Date*",      True,  "2024-09-02",    "Format: YYYY-MM-DD"),
        ("Is Active",            False, "TRUE",          "TRUE or FALSE. Defaults to TRUE."),
        ("Address*",             True,  "12 Broad St, Lagos", "Home address"),
        ("Phone Number",         False, "08012345678",   "Student's phone (optional for younger students)"),
        ("Parent Contact*",      True,  "08098765432",   "Parent/guardian phone — MUST match an existing parent account"),
        ("Emergency Contact*",   True,  "08011112222",   "Emergency contact number"),
        ("Parent/Guardian Name*",True,  "Mr. Adeyemi Bola", "Full name of parent/guardian"),
        ("Parent/Guardian Role*",True,  "Father",        "Father / Mother / Guardian / Sponsor"),
        ("Medical Conditions",   False, "Asthma",        "Comma-separated list of conditions, or leave blank"),
        ("Special Requirements", False, "Wheelchair access", "Any special educational or care needs"),
        ("Profile Picture URL",  False, "https://res.cloudinary.com/...", "Cloudinary URL (optional)"),
        ("Email",                False, "fatima@example.com", "Student email (optional)"),
    ]

    headers = [col[0] for col in COLUMNS]
    example = [col[2] for col in COLUMNS]

    if fmt == "excel":
        return _template_excel(headers, example, COLUMNS)
    else:
        return _template_csv(headers, example)


def _template_csv(headers, example):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerow(example)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="student_upload_template.csv"'
    return response


def _template_excel(headers, example, column_defs):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        # Fallback to CSV if openpyxl not installed
        return _template_csv(headers, example)

    wb = openpyxl.Workbook()

    # ---- Sheet 1: Template ----
    ws = wb.active
    ws.title = "Student Upload Template"

    REQUIRED_COLOR = "FFF2CC"   # yellow for required
    OPTIONAL_COLOR = "FFFFFF"
    HEADER_COLOR  = "1F4E79"    # dark blue header
    HEADER_FONT   = Font(bold=True, color="FFFFFF", size=11)
    EXAMPLE_FONT  = Font(italic=True, color="595959", size=10)
    thin_border   = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    # Header row
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = HEADER_FONT
        cell.fill = PatternFill("solid", fgColor=HEADER_COLOR)
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = thin_border

    # Example row
    for col_idx, val in enumerate(example, 1):
        required = column_defs[col_idx - 1][1]
        cell = ws.cell(row=2, column=col_idx, value=val)
        cell.font = EXAMPLE_FONT
        cell.fill = PatternFill("solid", fgColor=REQUIRED_COLOR if required else OPTIONAL_COLOR)
        cell.alignment = Alignment(wrap_text=True)
        cell.border = thin_border

    # Column widths
    col_widths = [20, 18, 18, 16, 10, 16, 16, 12, 16, 16, 12, 14, 14, 16, 12,
                  30, 18, 18, 18, 24, 22, 20, 24, 30, 28]
    for i, width in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = width

    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"

    # ---- Sheet 2: Field Guide ----
    guide = wb.create_sheet("Field Guide")
    guide.column_dimensions["A"].width = 30
    guide.column_dimensions["B"].width = 12
    guide.column_dimensions["C"].width = 20
    guide.column_dimensions["D"].width = 50

    guide_headers = ["Column", "Required", "Example", "Description"]
    for col_idx, h in enumerate(guide_headers, 1):
        cell = guide.cell(row=1, column=col_idx, value=h)
        cell.font = HEADER_FONT
        cell.fill = PatternFill("solid", fgColor=HEADER_COLOR)
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="center")

    for row_idx, (header, required, ex, desc) in enumerate(column_defs, 2):
        guide.cell(row=row_idx, column=1, value=header).border = thin_border
        req_cell = guide.cell(row=row_idx, column=2, value="Yes" if required else "No")
        req_cell.border = thin_border
        req_cell.font = Font(color="C00000" if required else "595959", bold=required)
        guide.cell(row=row_idx, column=3, value=ex).border = thin_border
        desc_cell = guide.cell(row=row_idx, column=4, value=desc)
        desc_cell.border = thin_border
        desc_cell.alignment = Alignment(wrap_text=True)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(
        buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = 'attachment; filename="student_upload_template.xlsx"'
    return response


# ---------------------------------------------------------------------------
# 4. Credential export
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAdminUser])
def export_credentials(request, upload_id):
    """
    Export login credentials for all successfully imported students
    from a completed bulk upload.

    Body:
      format — 'csv' | 'excel' | 'pdf'

    The credential data is stored in BulkUploadRecord.result_data['imported'].
    Each entry has: full_name, username, password, registration_number, classroom.
    """
    from students.models import BulkUploadRecord

    tenant = _get_tenant(request)
    try:
        record = BulkUploadRecord.objects.get(pk=upload_id, tenant=tenant)
    except BulkUploadRecord.DoesNotExist:
        return Response({"error": "Upload record not found."}, status=404)

    if record.status != "completed":
        return Response(
            {"error": "Upload is not yet complete. Cannot export credentials."},
            status=400,
        )

    imported = record.result_data.get("imported", [])
    if not imported:
        return Response({"error": "No successfully imported students found."}, status=404)

    fmt = request.data.get("format", "csv").lower()
    if fmt not in ("csv", "excel", "pdf"):
        return Response({"error": "format must be csv, excel, or pdf."}, status=400)

    if fmt == "csv":
        return _export_csv(imported, record)
    elif fmt == "excel":
        return _export_excel(imported, record)
    else:
        return _export_pdf(imported, record)


def _cred_rows(imported):
    """Yield rows for credential tables."""
    for entry in imported:
        yield [
            entry.get("registration_number") or "—",
            entry.get("full_name", ""),
            entry.get("classroom", ""),
            entry.get("username", ""),
            entry.get("password", ""),
            entry.get("parent_name", ""),
            entry.get("parent_phone", ""),
        ]


CRED_HEADERS = [
    "Reg Number", "Full Name", "Classroom",
    "Username", "Password (initial)",
    "Parent Name", "Parent Phone",
]


def _export_csv(imported, record):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CRED_HEADERS)
    for row in _cred_rows(imported):
        writer.writerow(row)
    buf.seek(0)
    fname = f"credentials_{record.id}_{datetime.now().strftime('%Y%m%d')}.csv"
    response = HttpResponse(buf.read(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{fname}"'
    return response


def _export_excel(imported, record):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        return _export_csv(imported, record)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Student Credentials"

    HEADER_FONT  = Font(bold=True, color="FFFFFF", size=11)
    HEADER_FILL  = PatternFill("solid", fgColor="1F4E79")
    PASS_FILL    = PatternFill("solid", fgColor="FFF2CC")
    thin         = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    # Header
    for col_idx, h in enumerate(CRED_HEADERS, 1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.border = thin
        cell.alignment = Alignment(horizontal="center")

    # Data
    for row_idx, row_data in enumerate(_cred_rows(imported), 2):
        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.border = thin
            # Highlight password column
            if col_idx == 5:
                cell.fill = PASS_FILL
                cell.font = Font(name="Courier New", size=10)

    # Column widths
    for i, w in enumerate([18, 28, 20, 22, 22, 28, 18], 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"

    # Summary sheet
    summary = wb.create_sheet("Summary")
    summary["A1"] = "Upload ID"
    summary["B1"] = record.id
    summary["A2"] = "File"
    summary["B2"] = record.original_filename
    summary["A3"] = "Imported"
    summary["B3"] = record.imported_rows
    summary["A4"] = "Skipped"
    summary["B4"] = record.failed_rows
    summary["A5"] = "Export Date"
    summary["B5"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    summary["A6"] = ""
    summary["A7"] = "IMPORTANT"
    summary["A7"].font = Font(bold=True, color="C00000")
    summary["B7"] = "Passwords shown are initial. Students/parents should change them on first login."

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"credentials_{record.id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    response = HttpResponse(
        buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{fname}"'
    return response


def _export_pdf(imported, record):
    """
    Generate a PDF with:
      - Cover page summary
      - Table of all credentials
    Uses reportlab. Falls back to CSV if not installed.
    """
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph,
            Spacer, PageBreak,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        logger.warning("reportlab not installed — falling back to CSV export")
        return _export_csv(imported, record)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=18, spaceAfter=6, alignment=TA_CENTER,
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"],
        fontSize=10, spaceAfter=4, alignment=TA_CENTER, textColor=colors.grey,
    )
    warn_style = ParagraphStyle(
        "Warn", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#C00000"),
    )

    elements = []

    # Cover / header
    elements.append(Paragraph("Student Login Credentials", title_style))
    elements.append(Paragraph(
        f"Generated: {datetime.now().strftime('%d %B %Y, %H:%M')}  |  "
        f"Upload: {record.original_filename}  |  "
        f"Total imported: {record.imported_rows}",
        sub_style,
    ))
    elements.append(Spacer(1, 4 * mm))
    elements.append(Paragraph(
        "⚠ Confidential — These are initial passwords. "
        "Distribute securely and advise students/parents to change on first login.",
        warn_style,
    ))
    elements.append(Spacer(1, 6 * mm))

    # Table
    NAVY  = colors.HexColor("#1F4E79")
    AMBER = colors.HexColor("#FFF2CC")
    STRIPE = colors.HexColor("#F2F2F2")

    table_data = [CRED_HEADERS]
    for row in _cred_rows(imported):
        table_data.append(row)

    col_widths = [30*mm, 50*mm, 35*mm, 40*mm, 38*mm, 50*mm, 30*mm]
    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        # Header
        ("BACKGROUND",   (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, 0), 9),
        ("ALIGN",        (0, 0), (-1, 0), "CENTER"),
        ("BOTTOMPADDING",(0, 0), (-1, 0), 8),
        ("TOPPADDING",   (0, 0), (-1, 0), 8),
        # Body
        ("FONTNAME",     (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 1), (-1, -1), 8),
        ("TOPPADDING",   (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 1), (-1, -1), 5),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, STRIPE]),
        # Password column highlight
        ("BACKGROUND",   (4, 1), (4, -1), AMBER),
        ("FONTNAME",     (4, 1), (4, -1), "Courier"),
        # Grid
        ("GRID",         (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(tbl)

    doc.build(elements)
    buf.seek(0)
    fname = f"credentials_{record.id}_{datetime.now().strftime('%Y%m%d')}.pdf"
    response = HttpResponse(buf.read(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{fname}"'
    return response


# ---------------------------------------------------------------------------
# 5. Error report download
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAdminUser])
def download_error_report(request, upload_id):
    """
    Download a CSV of all rows that failed validation for a completed upload.
    Schools use this to fix their data and re-upload.
    """
    from students.models import BulkUploadRecord

    tenant = _get_tenant(request)
    try:
        record = BulkUploadRecord.objects.get(pk=upload_id, tenant=tenant)
    except BulkUploadRecord.DoesNotExist:
        return Response({"error": "Upload record not found."}, status=404)

    errors = record.result_data.get("errors", [])
    if not errors:
        return Response({"message": "No errors to report."}, status=200)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Row Number", "First Name", "Last Name", "Reg Number", "Class", "Section", "Error Details"])
    for err in errors:
        data = err.get("data", {})
        writer.writerow([
            err.get("row", ""),
            data.get("first_name", ""),
            data.get("last_name", ""),
            data.get("registration_number", ""),
            data.get("class_code", ""),
            data.get("section_name", ""),
            " | ".join(err.get("errors", [])),
        ])

    buf.seek(0)
    fname = f"upload_errors_{record.id}_{datetime.now().strftime('%Y%m%d')}.csv"
    response = HttpResponse(buf.read(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{fname}"'
    return response