from django.http import JsonResponse
from django.conf import settings
import os
import sys


def _deployed_commit():
    """
    The commit this server is running, so "has it deployed yet?" has an answer
    without signing in. Render sets RENDER_GIT_COMMIT on every deploy; other
    hosts can set GIT_COMMIT or APP_VERSION instead.
    """
    for name in ("RENDER_GIT_COMMIT", "GIT_COMMIT", "APP_VERSION", "SOURCE_VERSION"):
        value = os.getenv(name)
        if value:
            return value[:12]
    return "unknown"


def health_check(request):
    """
    Enhanced health check endpoint to verify deployment configuration
    """
    return JsonResponse(
        {
            "status": "healthy",
            "commit": _deployed_commit(),
            "branch": os.getenv("RENDER_GIT_BRANCH", ""),
            "debug": settings.DEBUG,
            "allowed_hosts": settings.ALLOWED_HOSTS,
            "cors_origins": settings.CORS_ALLOWED_ORIGINS,
            "csrf_origins": settings.CSRF_TRUSTED_ORIGINS,
            "frontend_url": settings.FRONTEND_URL,
            "python_version": sys.version,
            "database": (
                "connected" if settings.DATABASES.get("default") else "not configured"
            ),
        }
    )
