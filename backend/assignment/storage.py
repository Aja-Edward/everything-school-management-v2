"""
Assignment attachments live on Cloudinary as raw files, the way parent bulk
uploads do (parent/bulk_view.py). Django's DEFAULT_FILE_STORAGE setting is
ignored since Django 5.1, so a FileField here would land on the web
container's own disk and vanish on the next deploy.
"""

import logging
import os
import uuid

logger = logging.getLogger(__name__)

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt",
    ".jpg", ".jpeg", ".png",
}


def upload_attachment(file_obj, tenant):
    """Upload `file_obj` and return (secure_url, public_id)."""
    import cloudinary.uploader

    ext = os.path.splitext(file_obj.name)[1].lower()
    file_obj.seek(0)
    result = cloudinary.uploader.upload(
        file_obj,
        resource_type="raw",
        folder=f"assignments/{tenant.id}",
        # Raw files keep their extension only if it is part of the id.
        public_id=f"{uuid.uuid4().hex}{ext}",
    )
    return result["secure_url"], result["public_id"]


def delete_attachment(public_id):
    """Best effort: a file left behind costs storage, not correctness."""
    if not public_id:
        return
    try:
        import cloudinary.uploader

        cloudinary.uploader.destroy(public_id, resource_type="raw")
    except Exception as exc:
        logger.warning("Could not delete assignment attachment %s: %s", public_id, exc)
