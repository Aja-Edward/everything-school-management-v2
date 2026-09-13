"""
One place that owns the subject cache.

What is cached, under what key, for how long, and how it is thrown away all
live here, because splitting those apart is what broke this layer twice.

Every payload cached from this app is built from a tenant-filtered queryset,
so every key carries the tenant. The keys used to be global: the first school
to call /api/subjects/by_category/ populated "subjects_by_category_v4", and
every other school on the platform read that school's subjects back for the
next half hour.

The names are also the invalidation list. There used to be four separate
clear_subject_caches() helpers with four different hand-written key lists, and
the version suffixes on the setters had been bumped while the deleters had
not -- so the live keys were deleted by nothing and expired only on TTL, while
ten keys that nothing ever wrote were diligently deleted. A call site here
names an entry and never spells a key, so the two halves cannot drift apart
again.

Reads and writes are wrapped. A cache is a performance layer; an unreachable
Redis should make a page slow, not return 500.
"""

import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)

# Bumped when the shape of any cached payload changes. Bumping retires every
# previous entry at once, which is the cheap way to deploy a serializer change
# without serving the old shape for an hour.
VERSION = "v5"

# entry name -> time to live in seconds.
TTLS = {
    "by_category": 60 * 30,
    "by_education_level": 60 * 30,
    "statistics": 60 * 10,
    "analytics_dashboard": 60 * 60,
    "management_dashboard": 60 * 60,
}

# Platform staff query across every school, so their payload is genuinely a
# different thing from any one school's and needs its own slot rather than
# sharing the "no tenant" one.
PLATFORM = "platform"


def key(name, tenant_id):
    """The cache key for one entry, for one school."""
    if name not in TTLS:
        raise KeyError(
            f"unknown subject cache entry {name!r}; add it to TTLS so it is "
            f"invalidated along with the rest"
        )
    return f"subjects:{VERSION}:{name}:t{tenant_id or PLATFORM}"


def read(name, tenant_id):
    """Cached value, or None on a miss or an unreachable backend."""
    try:
        return cache.get(key(name, tenant_id))
    except Exception:
        logger.warning("subject cache unavailable on read of %s", name, exc_info=True)
        return None


def write(name, tenant_id, value):
    """Store a value under this school's key. Never raises."""
    try:
        cache.set(key(name, tenant_id), value, TTLS[name])
    except Exception:
        logger.warning("subject cache unavailable on write of %s", name, exc_info=True)


def invalidate(tenant_id=None):
    """
    Throw away the cached subject views.

    With a tenant, drops that school's entries. Without one, drops every
    school's -- used by the platform-wide admin paths, which can change
    subjects belonging to more than one school in a single request.

    Every key is listed rather than matched by pattern: delete_pattern() only
    exists on django-redis, and passing a glob to delete_many() -- which the
    old classroom helper did -- deletes a key literally named "subject_*".
    """
    if tenant_id is None:
        from tenants.models import Tenant

        tenant_ids = list(Tenant.objects.values_list("id", flat=True)) + [None]
    else:
        tenant_ids = [tenant_id]

    keys = [key(name, tid) for tid in tenant_ids for name in TTLS]
    try:
        cache.delete_many(keys)
    except Exception:
        logger.warning("subject cache unavailable on invalidate", exc_info=True)
        return 0
    return len(keys)


def tenant_id_from(request):
    """The tenant a cached payload belongs to, or None for platform-wide."""
    return getattr(getattr(request, "tenant", None), "id", None)
