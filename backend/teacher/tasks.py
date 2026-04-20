"""
teacher/tasks.py

Celery tasks for bulk teacher upload processing.
Handles parsing, per-row validation, teacher creation,
staff type/level assignment, and credential generation
— all within tenant context.
"""

import logging
import secrets
import string
from datetime import date
from celery import shared_task
from django.db import transaction

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_age(dob):
    today = date.today()
    return (
        today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    )


def _validate_row(row_num, row, tenant_id):
    """
    Validate a single CSV/Excel row dict for teacher upload.
    Returns (errors: list[str], cleaned: dict | None).
    cleaned is None when there are blocking errors.
    """
    errors = []

    # ---- Required plain fields ----
    required = [
        "employee_id", "staff_type", "first_name", "last_name",
        "email", "phone_number", "hire_date", 
        "qualification", "specialization",
    ]
    for field in required:
        if not row.get(field, "").strip():
            errors.append(f"Row {row_num}: '{field}' is required.")

    if errors:
        return errors, None

    # ---- Staff Type validation ----
    staff_type_raw = row["staff_type"].strip().lower()
    staff_type_map = {"teaching": "teaching", "non-teaching": "non-teaching"}
    # Also accept variations
    if staff_type_raw in ("teaching", "teach"):
        staff_type = "teaching"
    elif staff_type_raw in ("non-teaching", "non teaching", "non-teach"):
        staff_type = "non-teaching"
    else:
        errors.append(
            f"Row {row_num}: Invalid staff_type '{row['staff_type']}'. "
            "Use 'Teaching' or 'Non-Teaching'."
        )

    # ---- Level validation ----
    level_raw = row.get("level", "").strip().lower()
    level_map = {
        "nursery": "nursery",
        "primary": "primary",
        "junior secondary": "junior_secondary",
        "junior_secondary": "junior_secondary",
        "secondary": "junior_secondary",
        "senior secondary": "senior_secondary",
        "senior_secondary": "senior_secondary",
        "ss": "senior_secondary",
    }
    level = level_map.get(level_raw)
    if not level:
        errors.append(
            f"Row {row_num}: Invalid level '{row.get('level', '')}'. "
            "Use: Nursery, Primary, Junior Secondary, or Senior Secondary."
        )

    # ---- Hire Date validation ----
    from datetime import datetime
    hire_date = None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            hire_date = datetime.strptime(row["hire_date"].strip(), fmt).date()
            break
        except ValueError:
            continue
    if not hire_date:
        errors.append(
            f"Row {row_num}: Invalid hire_date '{row['hire_date']}'. Use YYYY-MM-DD."
        )

    # ---- Optional Date of Birth ----
    dob = None
    if row.get("date_of_birth", "").strip():
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                dob = datetime.strptime(row["date_of_birth"].strip(), fmt).date()
                break
            except ValueError:
                continue
        if not dob:
            errors.append(
                f"Row {row_num}: Invalid date_of_birth '{row['date_of_birth']}'. Use YYYY-MM-DD."
            )

    if errors:
        return errors, None

    # ---- Employee ID uniqueness ----
    employee_id = row["employee_id"].strip()
    from teacher.models import Teacher
    if Teacher.objects.filter(
        tenant_id=tenant_id,
        employee_id=employee_id,
    ).exists():
        errors.append(
            f"Row {row_num}: Employee ID '{employee_id}' already exists in this school."
        )
        return errors, None

    # ---- Email uniqueness ----
    email = row["email"].strip()
    from users.models import CustomUser

    if CustomUser.objects.filter(email=email).exists():
        errors.append(
            f"Row {row_num}: Email '{email}' is already in use."
        )
        return errors, None

    # ---- Build cleaned dict ----
    cleaned = {
        "row_num": row_num,
        "employee_id": employee_id,
        "staff_type": staff_type,
        "level": level,
        "first_name": row["first_name"].strip(),
        "last_name": row["last_name"].strip(),
        "middle_name": row.get("middle_name", "").strip() or "",
        "email": email,
        "phone_number": row["phone_number"].strip(),
        "hire_date": hire_date,
        "date_of_birth": dob,
        "qualification": row["qualification"].strip(),
        "specialization": row["specialization"].strip(),
        "address": row.get("address", "").strip() or "",
        "photo_url": row.get("profile_picture_url", "").strip() or None,
        "is_active": row.get("is_active", "true").strip().lower()
        not in ("false", "0", "no"),
    }
    return [], cleaned


def _create_teacher_from_cleaned(tenant, cleaned):
    """
    Atomically create a CustomUser + Teacher.
    Returns (teacher, plain_password, username).
    """
    from users.models import CustomUser
    from teacher.models import Teacher
    from utils import generate_unique_username, generate_temp_password

    password = generate_temp_password()
    username = generate_unique_username(
        role="teacher",
        employee_id=cleaned["employee_id"],
        tenant=tenant,
    )

    # Create CustomUser
    user = CustomUser.objects.create_user(
        username=username,
        email=cleaned["email"],
        first_name=cleaned["first_name"],
        last_name=cleaned["last_name"],
        middle_name=cleaned["middle_name"],
        role="teacher",
        password=password,
        is_active=cleaned["is_active"],
    )

    # Create Teacher profile
    teacher = Teacher.objects.create(
        tenant=tenant,
        user=user,
        employee_id=cleaned["employee_id"],
        staff_type=cleaned["staff_type"],
        level=cleaned["level"],
        phone_number=cleaned["phone_number"],
        address=cleaned["address"],
        date_of_birth=cleaned["date_of_birth"],
        hire_date=cleaned["hire_date"],
        qualification=cleaned["qualification"],
        specialization=cleaned["specialization"],
        photo=cleaned["photo_url"],
        is_active=cleaned["is_active"],
    )

    return teacher, password, username


# ---------------------------------------------------------------------------
# CSV / Excel parsing
# ---------------------------------------------------------------------------

# Canonical column map: CSV header (normalised) → internal key
COLUMN_MAP = {
    "employee id": "employee_id",
    "employee_id": "employee_id",
    "emp id": "employee_id",
    "first name": "first_name",
    "firstname": "first_name",
    "last name": "last_name",
    "lastname": "last_name",
    "surname": "last_name",
    "middle name": "middle_name",
    "middlename": "middle_name",
    "email": "email",
    "phone number": "phone_number",
    "phone": "phone_number",
    "contact": "phone_number",
    "staff type": "staff_type",
    "stafftype": "staff_type",
    "employment type": "staff_type",
    "level": "level",
    "education level": "level",
    "qualification": "qualification",
    "qualifications": "qualification",
    "specialization": "specialization",
    "specialisation": "specialization",
    "expertise": "specialization",
    "date of birth": "date_of_birth",
    "dob": "date_of_birth",
    "hire date": "hire_date",
    "hire_date": "hire_date",
    "employment date": "hire_date",
    "start date": "hire_date",
    "address": "address",
    "is active": "is_active",
    "is_active": "is_active",
    "active": "is_active",
    "profile picture url": "profile_picture_url",
    "photo url": "profile_picture_url",
    "photo": "profile_picture_url",
}


def _normalise_header(h):
    return h.strip().lower().replace("*", "").replace("/", "/")


def _parse_file(file_path, file_ext):
    if file_ext in (".xlsx", ".xls"):
        import openpyxl
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []

        header_row_idx = None
        for idx, row in enumerate(rows):
            normalised = [_normalise_header(str(h)) for h in row if h]
            if any(h in COLUMN_MAP for h in normalised):
                header_row_idx = idx
                break

        if header_row_idx is None:
            raise ValueError("Could not find header row. Check your file format.")

        raw_headers = [
            _normalise_header(str(h)) if h else "" for h in rows[header_row_idx]
        ]
        mapped_headers = [COLUMN_MAP.get(h, h) for h in raw_headers]

        def _cell_to_str(val):
            if val is None:
                return ""
            if hasattr(val, "strftime"):  # Excel date/datetime → YYYY-MM-DD
                return val.strftime("%Y-%m-%d")
            if isinstance(val, float) and val == int(val):
                return str(int(val))  # strips trailing .0
            return str(val).strip()

        result = []
        for row in rows[header_row_idx + 1 :]:
            if all(cell is None or str(cell).strip() == "" for cell in row):
                continue
            padded_row = list(row) + [""] * (len(mapped_headers) - len(row))
            row_dict = {
                mapped_headers[i]: _cell_to_str(padded_row[i])
                for i in range(len(mapped_headers))
            }
            if (
                row_dict.get("first_name", "").lower() == "john"
                and row_dict.get("last_name", "").lower() == "doe"
            ):
                continue
            result.append(row_dict)
        return result

    else:
        import csv, io

        with open(file_path, newline="", encoding="utf-8-sig") as f:
            lines = f.readlines()

        header_line_idx = None
        for idx, line in enumerate(lines):
            normalised = [_normalise_header(h) for h in line.strip().split(",")]
            if any(h in COLUMN_MAP for h in normalised):
                header_line_idx = idx
                break

        if header_line_idx is None:
            raise ValueError("Could not find header row in CSV.")

        csv_content = "".join(lines[header_line_idx:])
        reader = csv.DictReader(io.StringIO(csv_content))
        mapped = {
            _normalise_header(k): COLUMN_MAP.get(
                _normalise_header(k), _normalise_header(k)
            )
            for k in (reader.fieldnames or [])
        }
        result = []
        for row in reader:
            normalised = {
                mapped[_normalise_header(k)]: v.strip() for k, v in row.items()
            }
            if all(v == "" for v in normalised.values()):
                continue
            if (
                normalised.get("first_name", "").lower() == "john"
                and normalised.get("last_name", "").lower() == "doe"
            ):
                continue
            result.append(normalised)
        return result


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=0)
def process_bulk_teacher_upload(
    self,
    upload_record_id,
    tenant_id,
    file_path,
    file_ext,
    academic_session_id=None,
    uploaded_by_id=None,
):
    """
    Main Celery task for bulk teacher upload.

    Reads the uploaded file row by row, validates each row independently,
    creates teachers for valid rows, skips and logs invalid ones.
    Stores progress + results in BulkUploadRecord.

    Args:
        upload_record_id: PK of BulkUploadRecord (for progress tracking)
        tenant_id: Tenant PK for all filtered queries
        file_path: Absolute path to the saved upload file
        file_ext: '.csv' | '.xlsx' | '.xls'
        academic_session_id: (Not used for teachers, kept for interface consistency)
        uploaded_by_id: CustomUser PK of the admin who triggered the upload
    """
    from teacher.models import BulkUploadRecord
    from tenants.models import Tenant

    record = BulkUploadRecord.objects.get(pk=upload_record_id)
    record.status = "processing"
    record.save(update_fields=["status"])

    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        rows = _parse_file(file_path, file_ext)

        total = len(rows)
        record.total_rows = total
        record.save(update_fields=["total_rows"])

        imported = []
        errors = []

        for i, raw_row in enumerate(rows, start=2):  # row 1 = header
            row_errors, cleaned = _validate_row(i, raw_row, tenant_id)
            if row_errors:
                errors.append({
                    "row": i,
                    "data": {k: v for k, v in raw_row.items() if k in (
                        "first_name", "last_name", "employee_id",
                        "staff_type", "level",
                    )},
                    "errors": row_errors,
                })
                # Update progress every row
                record.processed_rows = i - 1
                record.failed_rows = len(errors)
                record.save(update_fields=["processed_rows", "failed_rows"])
                continue

            try:
                with transaction.atomic():
                    teacher, password, username = _create_teacher_from_cleaned(
                        tenant, cleaned
                    )
                imported.append({
                    "row": i,
                    "teacher_id": teacher.id,
                    "full_name": f"{cleaned['first_name']} {cleaned['last_name']}",
                    "username": username,
                    "password": password,
                    "employee_id": cleaned["employee_id"],
                })
            except Exception as exc:
                logger.exception(f"Row {i} failed during DB write: {exc}")
                errors.append({
                    "row": i,
                    "data": {
                        "first_name": cleaned.get("first_name"),
                        "last_name": cleaned.get("last_name"),
                    },
                    "errors": [f"Database error: {str(exc)}"],
                })

            # Update progress
            record.processed_rows = i - 1
            record.imported_rows = len(imported)
            record.failed_rows = len(errors)
            record.save(update_fields=["processed_rows", "imported_rows", "failed_rows"])

        # Final status
        record.status = "completed"
        record.processed_rows = total
        record.imported_rows = len(imported)
        record.failed_rows = len(errors)
        record.result_data = {
            "imported": imported,
            "errors": errors,
            "summary": {
                "total": total,
                "imported": len(imported),
                "skipped": len(errors),
            },
        }
        record.save()

        # Send notification email to admin if available
        if uploaded_by_id:
            _notify_admin(uploaded_by_id, len(imported), len(errors), total)

        logger.info(
            f"Bulk upload {upload_record_id} complete: "
            f"{len(imported)} imported, {len(errors)} skipped out of {total}."
        )

    except Exception as exc:
        logger.exception(f"Bulk upload task {upload_record_id} failed: {exc}")
        record.status = "failed"
        record.result_data = {"error": str(exc)}
        record.save(update_fields=["status", "result_data"])
        raise


def _notify_admin(user_id, imported, skipped, total):
    try:
        from users.models import CustomUser
        from utils.email import send_email_via_brevo
        user = CustomUser.objects.get(pk=user_id)
        subject = "Bulk Teacher Upload Complete"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2>Bulk Upload Complete</h2>
          <p>Hello {user.first_name},</p>
          <p>Your bulk teacher upload has finished processing.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;border:1px solid #ddd"><strong>Total rows</strong></td>
                <td style="padding:8px;border:1px solid #ddd">{total}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd"><strong>Imported</strong></td>
                <td style="padding:8px;border:1px solid #ddd;color:green">{imported}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd"><strong>Skipped (errors)</strong></td>
                <td style="padding:8px;border:1px solid #ddd;color:red">{skipped}</td></tr>
          </table>
          <p>Log in to the admin panel to download credentials and the error report.</p>
        </div>
        """
        send_email_via_brevo(subject, html, user.email)
    except Exception as e:
        logger.warning(f"Could not send admin upload notification: {e}")
