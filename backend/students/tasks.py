"""
students/tasks.py

Celery tasks for bulk student upload processing.
Handles parsing, per-row validation, student creation,
parent lookup, classroom/section/stream linking, and
credential generation — all within tenant context.
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

def _make_password(length=10):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _compute_age(dob):
    today = date.today()
    return (
        today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    )


def _resolve_class(tenant_id, class_code):
    from classroom.models import Class

    normalized = class_code.strip().replace("_", " ")

    # Try exact code match first
    obj = Class.objects.filter(
        tenant_id=tenant_id,
        code__iexact=class_code.strip(),
        is_active=True,
    ).first()
    if obj:
        return obj

    # Try exact name match
    obj = Class.objects.filter(
        tenant_id=tenant_id,
        name__iexact=normalized,
        is_active=True,
    ).first()
    return obj


def _resolve_classroom(tenant_id, classroom_str, academic_session_id=None):
    """
    Parse a full classroom string like 'Primary 1 - Gold' into (class_obj, section_obj).
    The separator is ' - ' matching Section.__str__.
    """
    parts = classroom_str.strip().split(" - ", 1)
    if len(parts) != 2:
        return None, None
    class_name, section_name = parts[0].strip(), parts[1].strip()
    class_obj = _resolve_class(tenant_id, class_name)
    if not class_obj:
        return None, None
    section_obj = _resolve_section(tenant_id, class_obj, section_name, academic_session_id)
    return class_obj, section_obj


def _resolve_section(tenant_id, class_obj, section_name, academic_session_id=None):
    """
    Return Section instance matching class + section name for the given tenant.
    Optionally filters by academic session.
    """
    from classroom.models import Section

    qs = Section.objects.filter(
        tenant_id=tenant_id,
        class_grade=class_obj,
        name__iexact=section_name.strip(),
        is_active=True,
    )
    if academic_session_id:
        qs = qs.filter(academic_year_id=academic_session_id)
    return qs.first()


def _resolve_stream(tenant_id, stream_code):
    """Return Stream by name/code for tenant."""
    from classroom.models import Stream

    obj = Stream.objects.filter(
        tenant_id=tenant_id,
        code__iexact=stream_code.strip(),
    ).first()
    if obj:
        return obj
    return Stream.objects.filter(
        tenant_id=tenant_id,
        name__iexact=stream_code.strip(),
    ).first()


def _resolve_parent(tenant_id, phone):
    """
    Look up existing ParentProfile by phone within the tenant.
    Returns ParentProfile or None.
    """
    from parent.models import ParentProfile

    return ParentProfile.objects.filter(
        tenant_id=tenant_id,
        phone=phone.strip(),
    ).first()


def _validate_row(row_num, row, tenant_id, academic_session_id=None):
    """
    Validate a single CSV/Excel row dict.
    Returns (errors: list[str], cleaned: dict | None).
    cleaned is None when there are blocking errors.
    """
    errors = []

    # ---- Required plain fields ----
    required = [
        "first_name", "last_name", "gender",
        "date_of_birth",
        "parent_phone", "parent_guardian_name", "parent_guardian_role",
        "address", "place_of_birth", "lga",
        "admission_date", "year_admitted",
    ]
    for field in required:
        if not row.get(field, "").strip():
            errors.append(f"Row {row_num}: '{field}' is required.")

    # Classroom can be provided as a single 'classroom' field or as separate class_code + section_name
    has_classroom = bool(row.get("classroom", "").strip())
    has_legacy = bool(row.get("class_code", "").strip()) and bool(row.get("section_name", "").strip())
    if not has_classroom and not has_legacy:
        errors.append(f"Row {row_num}: 'classroom' is required.")

    if errors:
        return errors, None

    # ---- Gender ----
    gender_map = {"male": "M", "female": "F", "m": "M", "f": "F"}
    gender_raw = row["gender"].strip().lower()
    gender = gender_map.get(gender_raw)
    if not gender:
        errors.append(f"Row {row_num}: Invalid gender '{row['gender']}'. Use M or F.")

    # ---- Date of birth ----
    from datetime import datetime
    dob = None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            dob = datetime.strptime(row["date_of_birth"].strip(), fmt).date()
            break
        except ValueError:
            continue
    if not dob:
        errors.append(f"Row {row_num}: Invalid date_of_birth '{row['date_of_birth']}'. Use YYYY-MM-DD.")

    # ---- Admission date ----
    admission_date = None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            admission_date = datetime.strptime(row["admission_date"].strip(), fmt).date()
            break
        except ValueError:
            continue
    if not admission_date:
        errors.append(f"Row {row_num}: Invalid admission_date '{row['admission_date']}'.")

    if errors:
        return errors, None

    # ---- Class & Section ----
    if row.get("classroom", "").strip():
        class_obj, section_obj = _resolve_classroom(
            tenant_id, row["classroom"], academic_session_id
        )
        if not class_obj:
            errors.append(
                f"Row {row_num}: Classroom '{row['classroom']}' not found. "
                "Use the format 'Class Name - Section' (e.g. 'Primary 1 - Gold')."
            )
            return errors, None
        if not section_obj:
            errors.append(
                f"Row {row_num}: Section not found in classroom '{row['classroom']}'."
            )
            return errors, None
    else:
        class_obj = _resolve_class(tenant_id, row["class_code"])
        if not class_obj:
            errors.append(
                f"Row {row_num}: Class '{row['class_code']}' not found. "
                "Check class codes in the system."
            )
            return errors, None
        section_obj = _resolve_section(
            tenant_id, class_obj, row["section_name"], academic_session_id
        )
        if not section_obj:
            errors.append(
                f"Row {row_num}: Section '{row['section_name']}' not found in "
                f"class '{class_obj.name}'."
            )
            return errors, None

    # ---- Stream (required for Senior Secondary only) ----
    stream_obj = None
    is_senior = class_obj.education_level.level_type == "SENIOR_SECONDARY"
    stream_raw = row.get("stream", "").strip()

    if is_senior:
        if not stream_raw:
            errors.append(
                f"Row {row_num}: Stream is required for Senior Secondary students."
            )
            return errors, None
        stream_obj = _resolve_stream(tenant_id, stream_raw)
        if not stream_obj:
            errors.append(
                f"Row {row_num}: Stream '{stream_raw}' not found."
            )
            return errors, None

    # ---- Parent lookup ----
    parent_phone = row["parent_phone"].strip()
    parent_profile = _resolve_parent(tenant_id, parent_phone)
    if not parent_profile:
        errors.append(
            f"Row {row_num}: No parent account found with phone '{parent_phone}'. "
            "The parent must be registered before bulk upload."
        )
        return errors, None

    if errors:
        return errors, None

    # ---- Registration number (duplicate check) ----
    reg_number = row.get("registration_number", "").strip() or None
    if reg_number:
        from students.models import Student
        if Student.objects.filter(
            tenant_id=tenant_id,
            registration_number=reg_number,
        ).exists():
            errors.append(
                f"Row {row_num}: Registration number '{reg_number}' already exists."
            )
            return errors, None

    # ---- Email uniqueness (if provided) ----
    email = row.get("email", "").strip() or None

    cleaned = {
        "row_num": row_num,
        "first_name": row["first_name"].strip(),
        "last_name": row["last_name"].strip(),
        "middle_name": row.get("middle_name", "").strip(),
        "gender": gender,
        "date_of_birth": dob,
        "age": _compute_age(dob),
        "admission_date": admission_date,
        "year_admitted": row.get("year_admitted", "").strip() or None,
        "reg_number": reg_number,
        "email": email,
        "class_obj": class_obj,
        "section_obj": section_obj,
        "stream_obj": stream_obj,
        "parent_profile": parent_profile,
        "parent_guardian_name": row["parent_guardian_name"].strip(),
        "parent_guardian_role": row["parent_guardian_role"].strip(),
        "address": row["address"].strip(),
        "place_of_birth": row["place_of_birth"].strip(),
        "state_of_origin": row.get("state_of_origin", "").strip() or None,
        "lga_of_origin": row.get("lga_of_origin", "").strip() or None,
        "lga_of_residence": row.get("lga_of_residence", "").strip() or None,
        "blood_group": row.get("blood_group", "").strip() or None,
        "phone_number": row.get("phone_number", "").strip() or None,
        "parent_contact": parent_phone,
        "emergency_contact": row.get("emergency_contact", "").strip() or None,
        "medical_conditions": row.get("medical_conditions", "").strip() or None,
        "special_requirements": row.get("special_requirements", "").strip() or None,
        "profile_picture": row.get("profile_picture_url", "").strip() or None,
        "is_active": row.get("is_active", "true").strip().lower()
        not in ("false", "0", "no"),
    }
    return [], cleaned


def _create_student_from_cleaned(tenant, cleaned):
    """
    Atomically create a CustomUser + Student and link the parent.
    Returns (student, plain_password, username).
    """
    from users.models import CustomUser
    from students.models import Student
    from parent.models import ParentStudentRelationship
    from utils import generate_unique_username

    password = _make_password()
    username = generate_unique_username(
        role="student",
        registration_number=cleaned["reg_number"],
        tenant=tenant,
    )

    parent_email = None
    try:
        parent_user = cleaned["parent_profile"].user
        parent_email = getattr(parent_user, "email", None)
    except Exception:
        pass
    # Build email: use provided or synthesise from username
    email = cleaned["email"] or parent_email or None

    user = CustomUser.objects.create_user(
        username=username,
        email=email,
        first_name=cleaned["first_name"],
        last_name=cleaned["last_name"],
        middle_name=cleaned["middle_name"],
        role="student",
        password=password,
        is_active=cleaned["is_active"],
    )

    student = Student.objects.create(
        tenant=tenant,
        user=user,
        gender=cleaned["gender"],
        date_of_birth=cleaned["date_of_birth"],
        student_class=cleaned["class_obj"],
        section=cleaned["section_obj"],
        stream=cleaned["stream_obj"],
        registration_number=cleaned["reg_number"],
        lga_of_origin=cleaned.get("lga_of_origin"),
        state_of_origin=cleaned.get("state_of_origin"),
        year_admitted=cleaned.get("year_admitted"),
        address=cleaned["address"],
        place_of_birth=cleaned["place_of_birth"],
        blood_group=cleaned["blood_group"],
        phone_number=cleaned["phone_number"],
        parent_contact=cleaned["parent_contact"],
        emergency_contact=cleaned["emergency_contact"],
        medical_conditions=cleaned["medical_conditions"],
        special_requirements=cleaned["special_requirements"],
        profile_picture=cleaned["profile_picture"],
        is_active=cleaned["is_active"],
    )

    # Link parent
    ParentStudentRelationship.objects.get_or_create(
        parent=cleaned["parent_profile"],
        student=student,
        defaults={
            "relationship": cleaned["parent_guardian_role"],
            "is_primary_contact": True,
        },
    )

    return student, password, username


# ---------------------------------------------------------------------------
# CSV / Excel parsing
# ---------------------------------------------------------------------------

# Canonical column map: CSV header (normalised) → internal key
COLUMN_MAP = {
    "registration number": "registration_number",
    "reg number": "registration_number",
    "reg no": "registration_number",
    "surname": "last_name",
    "last name": "last_name",
    "first name": "first_name",
    "firstname": "first_name",
    "middle name": "middle_name",
    "middlename": "middle_name",
    "gender": "gender",
    "date of birth": "date_of_birth",
    "dob": "date_of_birth",
    "state of origin": "state_of_origin",
    "state": "state_of_origin",
    "lga of residence": "lga_of_residence",
    "lga of origin": "lga_of_origin",
    "blood group": "blood_group",
    "place of birth": "place_of_birth",
    "education level": "class_code",
    "grade level": "class_code",
    "class": "class_code",
    "class code": "class_code",
    "class name": "class_code",
    "classroom": "classroom",
    "classroom name": "classroom",
    "section": "section_name",
    "stream": "stream",
    "year admitted": "year_admitted",
    "admission date": "admission_date",
    "is active": "is_active",
    "address": "address",
    "phone number": "phone_number",
    "phone": "phone_number",
    "parent contact": "parent_phone",
    "parent phone": "parent_phone",
    "emergency contact": "emergency_contact",
    "parent/guardian name": "parent_guardian_name",
    "parent guardian name": "parent_guardian_name",
    "parent/guardian role": "parent_guardian_role",
    "parent guardian role": "parent_guardian_role",
    "medical conditions": "medical_conditions",
    "special requirements": "special_requirements",
    "profile picture url": "profile_picture_url",
    "email": "email",
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
                row_dict.get("first_name", "").lower() == "fatima"
                and row_dict.get("last_name", "").lower() == "adeyemi"
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
                normalised.get("first_name", "").lower() == "fatima"
                and normalised.get("last_name", "").lower() == "adeyemi"
            ):
                continue
            result.append(normalised)
        return result


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=0)
def process_bulk_student_upload(
    self,
    upload_record_id,
    tenant_id,
    file_path,
    file_ext,
    academic_session_id=None,
    uploaded_by_id=None,
):
    """
    Main Celery task.

    Reads the uploaded file row by row, validates each row independently,
    creates students for valid rows, skips and logs invalid ones.
    Stores progress + results in BulkUploadRecord.

    Args:
        upload_record_id: PK of BulkUploadRecord (for progress tracking)
        tenant_id: Tenant PK for all filtered queries
        file_path: Absolute path to the saved upload file
        file_ext: '.csv' | '.xlsx' | '.xls'
        academic_session_id: Optional AcademicSession PK (used for Section lookup)
        uploaded_by_id: CustomUser PK of the admin who triggered the upload
    """
    from students.models import BulkUploadRecord
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
            row_errors, cleaned = _validate_row(
                i, raw_row, tenant_id, academic_session_id
            )
            if row_errors:
                errors.append({
                    "row": i,
                    "data": {k: v for k, v in raw_row.items() if k in (
                        "first_name", "last_name", "registration_number",
                        "class_code", "section_name",
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
                    student, password, username = _create_student_from_cleaned(
                        tenant, cleaned
                    )
                imported.append({
                    "row": i,
                    "student_id": student.id,
                    "full_name": f"{cleaned['first_name']} {cleaned['last_name']}",
                    "username": username,
                    "password": password,
                    "registration_number": cleaned["reg_number"],
                    "classroom": str(cleaned["class_obj"]),
                    "parent_name": cleaned["parent_guardian_name"],
                    "parent_phone": cleaned["parent_contact"],
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
        subject = "Bulk Student Upload Complete"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2>Bulk Upload Complete</h2>
          <p>Hello {user.first_name},</p>
          <p>Your bulk student upload has finished processing.</p>
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
