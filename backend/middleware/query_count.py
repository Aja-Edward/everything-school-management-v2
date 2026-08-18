"""
Per-request SQL query counter, for finding N+1 queries in production.

Django's usual trick -- len(connection.queries) -- only records anything when
DEBUG is True, so it is useless on a live instance. This uses
connection.execute_wrapper(), which works regardless of DEBUG.

Disabled by default and removed from the middleware chain entirely (via
MiddlewareNotUsed) unless switched on, so it costs nothing when off.

Enable on Render:

    QUERY_COUNT_LOGGING=true
    QUERY_COUNT_THRESHOLD=50      # optional, default 50

Then watch the logs for lines tagged N+1 SUSPECT. Each one names the endpoint,
its total query count, and the SQL fragments that repeated most -- which is
what identifies the missing select_related/prefetch_related.

Turn it off again by setting QUERY_COUNT_LOGGING=false. Leave it on for a day
of real traffic; a handful of endpoints will account for most of the volume.
"""

import logging
import os
import time
from collections import Counter

from django.core.exceptions import MiddlewareNotUsed
from django.db import connection

logger = logging.getLogger(__name__)

# Cap how many distinct statements we track per request so a pathological
# request cannot balloon memory -- the point is the repeats, not completeness.
_MAX_TRACKED_STATEMENTS = 200
_SQL_FINGERPRINT_LEN = 130


def _enabled() -> bool:
    return os.getenv("QUERY_COUNT_LOGGING", "").strip().lower() in ("1", "true", "yes")


class QueryCountMiddleware:
    """Log any request whose SQL query count crosses the threshold."""

    def __init__(self, get_response):
        if not _enabled():
            # Django drops the middleware from the chain completely.
            raise MiddlewareNotUsed
        self.get_response = get_response
        try:
            self.threshold = int(os.getenv("QUERY_COUNT_THRESHOLD", "50"))
        except ValueError:
            self.threshold = 50
        logger.warning(
            "QueryCountMiddleware ACTIVE (threshold=%d). This is a diagnostic "
            "tool -- set QUERY_COUNT_LOGGING=false when finished.",
            self.threshold,
        )

    def __call__(self, request):
        total = 0
        statements = Counter()

        def wrapper(execute, sql, params, many, context):
            nonlocal total
            total += 1
            if len(statements) < _MAX_TRACKED_STATEMENTS:
                statements[sql[:_SQL_FINGERPRINT_LEN]] += 1
            return execute(sql, params, many, context)

        started = time.monotonic()
        with connection.execute_wrapper(wrapper):
            response = self.get_response(request)
        elapsed_ms = (time.monotonic() - started) * 1000

        if total >= self.threshold:
            repeats = [(sql, n) for sql, n in statements.most_common(3) if n > 1]
            detail = " | ".join(f"{n}x {sql}" for sql, n in repeats) or "no repeats"
            logger.warning(
                "N+1 SUSPECT %s %s -> %d queries, %d distinct, %.0fms | %s",
                request.method,
                request.path,
                total,
                len(statements),
                elapsed_ms,
                detail,
            )

        return response
