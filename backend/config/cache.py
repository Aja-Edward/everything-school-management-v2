"""
A Redis cache that degrades instead of breaking.

Moving off LocMemCache fixes invalidation across gunicorn workers, but it also
introduces a failure mode that did not exist before: a dict in local memory
cannot be unreachable, and a Redis server can. Every cache call in the codebase
was written against a backend that could not fail, so an outage would surface
as errors on endpoints that only wanted a cached copy -- the school settings
endpoint, for one, reads the cache first and is called on nearly every page.

django-redis solves this with IGNORE_EXCEPTIONS. Django's own Redis backend has
no equivalent, so this is it: connection failures are logged and treated as a
miss, and the request carries on to the database.

Only connection-level failures are swallowed. RedisError covers the client's
own errors and OSError covers DNS and socket failures; everything else --
a TypeError from an unpicklable value, say -- still raises, because that is a
bug in the caller rather than a sick server.
"""

import logging

from django.core.cache.backends.redis import RedisCache
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

_UNREACHABLE = (RedisError, OSError)


class ResilientRedisCache(RedisCache):
    """RedisCache, but an unreachable server behaves like an empty cache."""

    def _soft(self, operation, call, default=None):
        try:
            return call()
        except _UNREACHABLE:
            logger.warning("cache unavailable on %s", operation, exc_info=True)
            return default

    def get(self, key, default=None, version=None):
        return self._soft(
            "get", lambda: super(ResilientRedisCache, self).get(key, default, version), default
        )

    def set(self, key, value, timeout=None, version=None):
        return self._soft(
            "set", lambda: super(ResilientRedisCache, self).set(key, value, timeout, version)
        )

    def add(self, key, value, timeout=None, version=None):
        return self._soft(
            "add",
            lambda: super(ResilientRedisCache, self).add(key, value, timeout, version),
            False,
        )

    def delete(self, key, version=None):
        return self._soft(
            "delete", lambda: super(ResilientRedisCache, self).delete(key, version), False
        )

    def get_many(self, keys, version=None):
        return self._soft(
            "get_many", lambda: super(ResilientRedisCache, self).get_many(keys, version), {}
        )

    def set_many(self, data, timeout=None, version=None):
        return self._soft(
            "set_many",
            lambda: super(ResilientRedisCache, self).set_many(data, timeout, version),
            list(data),
        )

    def delete_many(self, keys, version=None):
        return self._soft(
            "delete_many", lambda: super(ResilientRedisCache, self).delete_many(keys, version)
        )

    def has_key(self, key, version=None):
        return self._soft(
            "has_key", lambda: super(ResilientRedisCache, self).has_key(key, version), False
        )

    def touch(self, key, timeout=None, version=None):
        return self._soft(
            "touch", lambda: super(ResilientRedisCache, self).touch(key, timeout, version), False
        )

    def get_or_set(self, key, default, timeout=None, version=None):
        try:
            return super().get_or_set(key, default, timeout, version)
        except _UNREACHABLE:
            logger.warning("cache unavailable on get_or_set", exc_info=True)
            return default() if callable(default) else default
