"""
parent/tasks.py

Celery task for bulk parent upload processing.

Flow per row:
  1. Validate required fields
  2. Create CustomUser (role='parent') + ParentProfile
  3. Optionally link to existing Students by phone number
  4. Store credentials in BulkUploadRecord.result_data
"""

import logging
import secrets
import string

from celery import shared_task
from django.db import transaction

logger = logging.getLogger(__name__)

# Example phone numbers to skip during parsing
EXAMPLE_PHONES = [
    "+1234567890",
    "1234567890",
    "123-456-7890",
    "+234-800-000-0000",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_password(length=10):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _validate_row(row_num, row):
    """
    Validate a single row dict.
    Returns (errors: list[str], cleaned: dict | None).
    cleaned is None when there are blocking errors.
    """
    errors = []

    # Required fields
    required_fields = {
        "first_name": "First Name",
        "last_name":  "Last Name",
        "gender":     "Gender",
        "phone":      "Phone Number",
        "address":    "Address",
        "relationship": "Parent/Guardian Role",
    }
    for field, label in required_fields.items():
        if not row.get(field, "").strip():
            errors.append(f"'{label}' is required.")

    if errors:
        return errors, None

    # Gender
    gender_map = {"male": "M", "female": "F", "m": "M", "f": "F"}
    gender_raw = row["gender"].strip().lower()
    gender = gender_map.get(gender_raw)
    if not gender:
        errors.append(f"Invalid gender '{row['gender']}'. Use M or F.")
        return errors, None

    # Role
    valid_roles = {"father", "mother", "guardian", "sponsor"}
    relationship = row["relationship"].strip()
    if relationship.lower() not in valid_roles:
        errors.append(
            f"Invalid role '{relationship}'. Use: Father, Mother, Guardian, or Sponsor."
        )
        return errors, None

    # Phone — basic sanity check
    phone = row["phone"].strip()
    digits_only = phone.replace("+", "").replace("-", "").replace(" ", "")
    if not digits_only.isdigit() or len(digits_only) < 7:
        errors.append(f"Invalid phone number '{phone}'.")
        return errors, None

    cleaned = {
        "row_num":      row_num,
        "first_name":   row["first_name"].strip(),
        "last_name":    row["last_name"].strip(),
        "gender":       gender,
        "phone":        phone,
        "email":        row.get("email", "").strip(),
        "address":      row["address"].strip(),
        "relationship": relationship.capitalize(),
    }
    return [], cleaned


def _create_parent(tenant, cleaned):
    """
    Atomically create CustomUser + ParentProfile.
    Optionally links to existing Students who share the same phone.
    Returns (parent_profile, plain_password, username, email).
    """
    from users.models import CustomUser
    from parent.models import ParentProfile, ParentStudentRelationship
    from students.models import Student

    from utils import generate_unique_username

    existing_user = ParentProfile.objects.filter(
        tenant=tenant, phone=cleaned["phone"]
    ).first()
    if existing_user:
        return (
            existing_user,
            None,
            existing_user.user.username,
            existing_user.user.email,
        )
    password = _make_password()

    username = generate_unique_username(role="parent", tenant=tenant)

    # Use provided email or synthesise one
    email = cleaned["email"] or f"{username}@{tenant.slug}.internal"

    user = CustomUser.objects.create_user(
        email=email,
        username=username,
        first_name=cleaned["first_name"],
        last_name=cleaned["last_name"],
        role="parent",
        password=password,
        is_active=True,
    )

    parent = ParentProfile.objects.create(
        tenant=tenant,
        user=user,
        phone=cleaned["phone"],
        address=cleaned["address"],
    )

    # Auto-link to any existing students whose parent_contact matches this phone
    matching_students = Student.objects.filter(
        tenant=tenant,
        parent_contact=cleaned["phone"],
    )
    for student in matching_students:
        ParentStudentRelationship.objects.get_or_create(
            tenant=tenant,
            parent=parent,
            student=student,
            defaults={
                "relationship": cleaned["relationship"],
                "is_primary_contact": True,
            },
        )
        logger.info(
            f"Linked parent {username} to student {student} "
            f"via phone {cleaned['phone']}"
        )

    return parent, password, username, email


# ---------------------------------------------------------------------------
# CSV / Excel parsing
# ---------------------------------------------------------------------------

# Maps normalised CSV headers → internal keys
COLUMN_MAP = {
    "last name":            "last_name",
    "surname":              "last_name",
    "first name":           "first_name",
    "firstname":            "first_name",
    "gender":               "gender",
    "phone number":         "phone",
    "phone":                "phone",
    "email":                "email",
    "address":              "address",
    "parent/guardian role": "relationship",
    "role":                 "relationship",
    "relationship":         "relationship",
}


def _normalise_header(h):
    return str(h).strip().lower().replace("*", "").strip()


def _parse_file(file_path, file_ext):
    if file_ext in (".xlsx", ".xls"):
        import openpyxl
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []

        # ✅ Find the real header row by looking for known column names
        header_row_idx = None
        for idx, row in enumerate(rows):
            normalised = [_normalise_header(h) for h in row if h]
            if any(h in COLUMN_MAP for h in normalised):
                header_row_idx = idx
                break

        if header_row_idx is None:
            raise ValueError("Could not find header row. Check your file format.")

        raw_headers = [_normalise_header(h) if h else "" for h in rows[header_row_idx]]
        mapped_headers = [COLUMN_MAP.get(h, h) for h in raw_headers]

        result = []
        # Start from the row AFTER the header, skip the example/sample row too
        data_rows = rows[header_row_idx + 1 :]

        def _cell_to_str(val):
            if val is None:
                return ""
            if isinstance(val, float) and val == int(val):
                return str(int(val))  # ← strips the .0
            return str(val).strip()

        for row in data_rows:
            if all(cell is None or str(cell).strip() == "" for cell in row):
                continue
            row_dict = {
                mapped_headers[i]: _cell_to_str(row[i])
                for i in range(len(mapped_headers))
            }
            # Skip known example/placeholder rows
            if (
                row_dict.get("phone", "") in EXAMPLE_PHONES
                and row_dict.get("last_name", "").lower() == "adeyemi"
            ):
                continue
            if row_dict.get("first_name", "").lower() in (
                "fatima",
                "firstname",
            ) and row_dict.get("last_name", "").lower() in ("adeyemi", "lastname"):
                continue
            result.append(row_dict)
        return result

    else:
        import csv
        with open(file_path, newline="", encoding="utf-8-sig") as f:
            # Skip lines until we find the header row
            lines = f.readlines()
            header_line_idx = None
            for idx, line in enumerate(lines):
                normalised = [_normalise_header(h) for h in line.strip().split(",")]
                if any(h in COLUMN_MAP for h in normalised):
                    header_line_idx = idx
                    break

            if header_line_idx is None:
                raise ValueError("Could not find header row in CSV.")

            import io

            csv_content = "".join(lines[header_line_idx:])
            reader = csv.DictReader(io.StringIO(csv_content))
            field_map = {
                k: COLUMN_MAP.get(_normalise_header(k), _normalise_header(k))
                for k in (reader.fieldnames or [])
            }
            result = []
            first_row = True
            for row in reader:
                normalised = {field_map[k]: v.strip() for k, v in row.items()}
                if all(v == "" for v in normalised.values()):
                    continue
                # Skip example row
                if first_row and normalised.get("first_name", "").lower() in (
                    "fatima",
                    "firstname",
                ):
                    first_row = False
                    continue
                first_row = False
                result.append(normalised)
        return result


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=0)
def process_bulk_parent_upload(
    self,
    upload_record_id,
    tenant_id,
    file_path,
    file_ext,
    uploaded_by_id=None,
):
    """
    Main Celery task for bulk parent upload.

    Reads the uploaded file row by row, validates each row,
    creates ParentProfile for valid rows, skips and logs invalid ones.
    Stores progress + results in BulkUploadRecord.
    """
    from parent.models import BulkUploadRecord
    from tenants.models import Tenant

    record = BulkUploadRecord.objects.get(pk=upload_record_id)
    record.status = "processing"
    record.save(update_fields=["status"])

    try:
        tenant = Tenant.objects.get(pk=tenant_id)
        rows   = _parse_file(file_path, file_ext)
        total  = len(rows)

        record.total_rows = total
        record.save(update_fields=["total_rows"])

        imported = []
        errors   = []

        for i, raw_row in enumerate(rows, start=2):  # row 1 = header
            row_errors, cleaned = _validate_row(i, raw_row)

            if row_errors:
                errors.append({
                    "row": i,
                    "data": {
                        "first_name":   raw_row.get("first_name", ""),
                        "last_name":    raw_row.get("last_name", ""),
                        "phone":        raw_row.get("phone", ""),
                        "relationship": raw_row.get("relationship", ""),
                    },
                    "errors": row_errors,
                })
                record.processed_rows = i - 1
                record.failed_rows    = len(errors)
                record.save(update_fields=["processed_rows", "failed_rows"])
                continue

            try:
                with transaction.atomic():
                    parent, password, username, email = _create_parent(tenant, cleaned)

                entry = {
                    "row":       i,
                    "parent_id": parent.id,
                    "full_name": f"{cleaned['first_name']} {cleaned['last_name']}",
                    "phone":     cleaned["phone"],
                    "role":      cleaned["relationship"],
                    "username":  username,
                    "email":     email,
                }
                # Only include password if account was freshly created
                if password:
                    entry["password"] = password
                else:
                    entry["password"] = "(existing account — password unchanged)"

                imported.append(entry)

            except Exception as exc:
                logger.exception(f"Row {i} failed during DB write: {exc}")
                errors.append({
                    "row": i,
                    "data": {
                        "first_name": cleaned.get("first_name", ""),
                        "last_name":  cleaned.get("last_name", ""),
                        "phone":      cleaned.get("phone", ""),
                    },
                    "errors": [f"Database error: {str(exc)}"],
                })

            record.processed_rows = i - 1
            record.imported_rows  = len(imported)
            record.failed_rows    = len(errors)
            record.save(update_fields=["processed_rows", "imported_rows", "failed_rows"])

        # Final save
        record.status        = "completed"
        record.processed_rows = total
        record.imported_rows  = len(imported)
        record.failed_rows    = len(errors)
        record.result_data    = {
            "imported": imported,
            "errors":   errors,
            "summary": {
                "total":    total,
                "imported": len(imported),
                "skipped":  len(errors),
            },
        }
        record.save()

        if uploaded_by_id:
            _notify_admin(uploaded_by_id, len(imported), len(errors), total)

        logger.info(
            f"Parent bulk upload {upload_record_id} complete: "
            f"{len(imported)} imported, {len(errors)} skipped out of {total}."
        )

    except Exception as exc:
        logger.exception(f"Parent bulk upload task {upload_record_id} failed: {exc}")
        record.status      = "failed"
        record.result_data = {"error": str(exc)}
        record.save(update_fields=["status", "result_data"])
        raise


# ---------------------------------------------------------------------------
# Admin notification email
# ---------------------------------------------------------------------------

def _notify_admin(user_id, imported, skipped, total):
    try:
        from users.models import CustomUser
        from utils.email import send_email_via_brevo
        user    = CustomUser.objects.get(pk=user_id)
        subject = "Bulk Parent Upload Complete"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2>Bulk Parent Upload Complete</h2>
          <p>Hello {user.first_name},</p>
          <p>Your bulk parent upload has finished processing.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Total rows</strong></td>
              <td style="padding:8px;border:1px solid #ddd">{total}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Imported</strong></td>
              <td style="padding:8px;border:1px solid #ddd;color:green">{imported}</td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd"><strong>Skipped (errors)</strong></td>
              <td style="padding:8px;border:1px solid #ddd;color:red">{skipped}</td>
            </tr>
          </table>
          <p>Log in to the admin panel to download credentials and the error report.</p>
          <p><em>Upload parents before students so phone-number linking works correctly.</em></p>
        </div>
        """
        send_email_via_brevo(subject, html, user.email)
    except Exception as e:
        logger.warning(f"Could not send admin parent upload notification: {e}")
