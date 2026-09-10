"""
Housekeeping shared by the bulk upload flows.

Teacher, student and parent uploads all generate an account password per row
and keep it, in plain text, inside BulkUploadRecord.result_data. That is what
lets an admin download the credential sheet after an asynchronous import
finishes, and it is genuinely needed: the worker creates the accounts long
after the request that started them has returned.

What it is not is a thing to keep forever. Left alone, the row is a permanent
copy of a working password for every teacher, pupil and parent ever imported,
across every school on the platform, sitting in a JSON column that nothing
treats as a secret. One database leak hands over the estate.

So the passwords expire. The rest of result_data stays: the admin can still see
what was imported and what failed, which is the part that has lasting value.
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# How long a downloadable credential sheet stays downloadable.
#
# Not zero-on-download, which is the obvious alternative: an admin who loses
# the file — which is exactly how this came up — would have no way back except
# resetting every account. A window lets them come back for it, and the day
# after next week they use the password reset flow like anyone else.
DEFAULT_RETENTION_DAYS = 7


def _models():
    """
    The three record models, resolved late.

    Imported inside the function rather than at module scope because this
    module is loaded during app startup and the apps are not ready yet.
    """
    from django.apps import apps

    return [
        apps.get_model("teacher", "BulkUploadRecord"),
        apps.get_model("students", "BulkUploadRecord"),
        apps.get_model("parent", "BulkUploadRecord"),
    ]


def _strip_passwords(result_data):
    """
    Remove every password from one record's result payload.

    Returns (new_data, removed_count). Rows keep their name, username and
    error, so the import history stays readable — only the secret goes.
    """
    data = dict(result_data or {})
    imported = data.get("imported") or []
    removed = 0

    cleaned = []
    for row in imported:
        row = dict(row)
        if row.pop("password", None) is not None:
            removed += 1
        cleaned.append(row)

    if not removed:
        return None, 0

    data["imported"] = cleaned
    # A marker so the UI can say "these have expired, send a reset" rather
    # than rendering a blank column and looking broken.
    data["passwords_purged_at"] = timezone.now().isoformat()
    return data, removed


@shared_task(name="common.tasks.purge_expired_bulk_upload_passwords")
def purge_expired_bulk_upload_passwords():
    """
    Drop plain-text passwords from bulk upload records past their window.

    Idempotent: a record with no passwords left is skipped, so re-running costs
    a scan and nothing else.
    """
    days = getattr(
        settings, "BULK_UPLOAD_PASSWORD_RETENTION_DAYS", DEFAULT_RETENTION_DAYS
    )
    cutoff = timezone.now() - timedelta(days=days)

    records_cleaned = 0
    passwords_removed = 0

    for model in _models():
        for record in model.objects.filter(created_at__lt=cutoff).iterator():
            data, removed = _strip_passwords(record.result_data)
            if not removed:
                continue
            record.result_data = data
            record.save(update_fields=["result_data", "updated_at"])
            records_cleaned += 1
            passwords_removed += removed

    if records_cleaned:
        logger.info(
            "Purged %d plain-text password(s) from %d bulk upload record(s) "
            "older than %d day(s).",
            passwords_removed, records_cleaned, days,
        )
    return {"records": records_cleaned, "passwords": passwords_removed}
