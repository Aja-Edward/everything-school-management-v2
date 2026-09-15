"""
exam/audio_views.py

Sound clips for listening questions.

Clips are uploaded from the teacher's browser straight to Cloudinary, not
through this server. A clip of several minutes is many megabytes, more than
the proxy in front of the API accepts, and a slow school connection would
tie up a server worker for the whole upload. This endpoint signs the upload
instead: the signature fixes the school's folder and the audio formats
Cloudinary will take, so a teacher can only put sound files where their
school's clips go.

The clip's URL is then saved on the question like any other question field
(see cbt/snapshot.py for its shape).
"""

import time

import cloudinary
import cloudinary.utils
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .permissions import IsTeacherOrAdmin

AUDIO_FORMATS = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "webm"]
# Cloudinary keeps sound under its video resource type.
RESOURCE_TYPE = "video"
MAX_AUDIO_MB = 20


def audio_folder(tenant):
    return f"exam-audio/{tenant.slug}"


@api_view(["POST"])
@permission_classes([IsTeacherOrAdmin])
def audio_upload_signature(request):
    """
    POST /api/exams/audio/upload-signature/

    Returns what the browser posts to Cloudinary with the file:
    {"upload_url", "fields": {"api_key", "timestamp", "folder", "allowed_formats", "signature"},
     "max_mb", "formats"}.
    """
    tenant = getattr(request, "tenant", None)
    if tenant is None:
        return Response({"detail": "School context required."}, status=400)

    config = cloudinary.config()
    if not (config.cloud_name and config.api_key and config.api_secret):
        return Response({"detail": "Sound clips can't be uploaded: file storage isn't set up on this server."},
                        status=503)

    fields = {
        "timestamp": int(time.time()),
        "folder": audio_folder(tenant),
        "allowed_formats": ",".join(AUDIO_FORMATS),
    }
    fields["signature"] = cloudinary.utils.api_sign_request(fields, config.api_secret)
    fields["api_key"] = config.api_key
    return Response({
        "upload_url": f"https://api.cloudinary.com/v1_1/{config.cloud_name}/{RESOURCE_TYPE}/upload",
        "fields": fields,
        "max_mb": MAX_AUDIO_MB,
        "formats": AUDIO_FORMATS,
    })
