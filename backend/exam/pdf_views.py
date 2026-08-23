"""
exam/pdf_views.py

Server-side PDF rendering for exam papers.

The paper's layout lives in exactly one place — the frontend's
examHtmlGenerator, which already drives the print preview teachers see.
Reimplementing that layout in a Django template would duplicate several
hundred lines and let the two renderers drift apart, so this endpoint takes
the HTML the generator produces and renders it with WeasyPrint.

The result is a real PDF rather than a browser print: deterministic
pagination, proper "Page x of y" numbering, and none of the URL/date headers
Chrome stamps onto printed pages.
"""

import logging
import re
from ipaddress import ip_address
from socket import gethostbyname
from urllib.parse import urlparse

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Generated papers with embedded images run large; this is a sanity ceiling.
MAX_HTML_BYTES = 8 * 1024 * 1024

# Added on top of the document's own @page rules, so the margin box the
# frontend already reserves is used for a real page counter.
PAGE_NUMBER_CSS = """
@page {
    @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9pt;
        color: #555555;
    }
}
"""


def _safe_url_fetcher(url, *args, **kwargs):
    """
    Let WeasyPrint reach public http(s) resources only.

    The HTML is submitted by the browser, so an unrestricted fetcher would let
    a crafted document read server files through file:// or probe the internal
    network. WeasyPrint treats a raising fetcher as a missing resource, so a
    blocked image is simply dropped rather than failing the whole render.
    """
    from weasyprint import default_url_fetcher

    parsed = urlparse(url)

    if parsed.scheme == "data":
        return default_url_fetcher(url, *args, **kwargs)

    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Blocked URL scheme '{parsed.scheme or 'none'}'")

    host = parsed.hostname
    if not host:
        raise ValueError("Blocked URL with no host")

    try:
        resolved = ip_address(gethostbyname(host))
    except Exception as exc:
        raise ValueError(f"Could not resolve '{host}': {exc}")

    if (
        resolved.is_private
        or resolved.is_loopback
        or resolved.is_link_local
        or resolved.is_reserved
        or resolved.is_multicast
    ):
        raise ValueError(f"Blocked non-public address for '{host}'")

    return default_url_fetcher(url, *args, **kwargs)


def _filename(exam, copy_type):
    """Build a safe download filename from the exam title."""
    title = re.sub(r"[^A-Za-z0-9]+", "_", exam.title or "Exam").strip("_") or "Exam"
    suffix = "Marking_Guide" if copy_type == "teacher" else "Question_Paper"
    return f"{title[:80]}_{suffix}.pdf"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def export_exam_pdf(request, exam_id):
    """
    POST /api/exams/<exam_id>/export-pdf/

    Body (JSON):
      html          — required: the rendered exam paper from examHtmlGenerator
      copy_type     — optional: 'student' (default) or 'teacher'
      page_numbers  — optional: set false to omit the page footer

    Returns the PDF as an attachment.
    """
    try:
        from weasyprint import CSS, HTML as WeasyHTML
    except (ImportError, OSError) as exc:
        logger.warning("WeasyPrint unavailable: %s", exc)
        return Response(
            {"error": "PDF rendering is not available on this server."},
            status=503,
        )

    tenant = getattr(request, "tenant", None)
    if not tenant:
        return Response({"error": "Tenant context required."}, status=400)

    from exam.models import Exam

    try:
        exam = Exam.objects.get(pk=exam_id, tenant=tenant)
    except Exam.DoesNotExist:
        return Response({"error": "Exam not found."}, status=404)

    html = request.data.get("html") or ""
    if not html.strip():
        return Response({"error": "No exam content was supplied."}, status=400)
    if len(html.encode("utf-8")) > MAX_HTML_BYTES:
        return Response(
            {"error": "This exam paper is too large to render."},
            status=413,
        )

    copy_type = str(request.data.get("copy_type") or "student").strip().lower()
    page_numbers = request.data.get("page_numbers", True)

    stylesheets = [CSS(string=PAGE_NUMBER_CSS)] if page_numbers else []

    try:
        pdf = WeasyHTML(string=html, url_fetcher=_safe_url_fetcher).write_pdf(
            stylesheets=stylesheets
        )
    except Exception:
        logger.exception("Exam PDF render failed for exam %s", exam_id)
        return Response(
            {"error": "Could not render the exam paper. Please try again."},
            status=500,
        )

    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="{_filename(exam, copy_type)}"'
    )
    return response
