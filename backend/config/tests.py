"""
An unreachable cache must not take the site with it.

The subject caches moved from LocMemCache to Redis so that invalidation
reaches all four gunicorn workers instead of one. That swap introduced a
failure mode the codebase had never had to handle: a dict in local memory
cannot be unreachable, and every cache call in the project was written against
one that could not fail. The school settings endpoint, called on nearly every
page, reads the cache before the database.

These drive the backend against a Redis that does not exist.
"""

from django.test import SimpleTestCase

from config.cache import ResilientRedisCache

UNREACHABLE = "redis://no-such-host.invalid:6379"


def broken_cache():
    return ResilientRedisCache(UNREACHABLE, {})


class UnreachableCacheTest(SimpleTestCase):
    def setUp(self):
        self.cache = broken_cache()

    def test_get_returns_the_default(self):
        self.assertIsNone(self.cache.get("anything"))
        self.assertEqual(self.cache.get("anything", "fallback"), "fallback")

    def test_set_does_not_raise(self):
        self.cache.set("k", "v", 60)

    def test_delete_does_not_raise(self):
        self.assertIs(self.cache.delete("k"), False)

    def test_get_many_returns_nothing_found(self):
        self.assertEqual(self.cache.get_many(["a", "b"]), {})

    def test_delete_many_does_not_raise(self):
        self.cache.delete_many(["a", "b"])

    def test_has_key_is_false(self):
        self.assertIs(self.cache.has_key("k"), False)

    def test_get_or_set_falls_back_to_the_default(self):
        self.assertEqual(self.cache.get_or_set("k", "computed"), "computed")

    def test_get_or_set_calls_a_callable_default(self):
        self.assertEqual(self.cache.get_or_set("k", lambda: "computed"), "computed")

    def test_a_real_programming_error_still_raises(self):
        """
        Only connection failures are swallowed. Hiding everything would turn a
        bug in the caller into a silent cache miss that nobody ever finds.

        Raised from the backend beneath rather than by a contrived argument:
        against an unreachable server the connection fails first, so a bad
        argument never reaches the code being tested.
        """
        from unittest import mock

        from django.core.cache.backends.redis import RedisCache

        with mock.patch.object(RedisCache, "get", side_effect=TypeError("unpicklable")):
            with self.assertRaises(TypeError):
                self.cache.get("k")


class SubjectCacheSurvivesAnOutageTest(SimpleTestCase):
    """The subject helpers wrap their own calls as well; belt and braces."""

    def test_read_returns_none_and_write_does_not_raise(self):
        from unittest import mock

        from subject import cache as subject_cache

        with mock.patch.object(subject_cache, "cache", broken_cache()):
            subject_cache.write("by_category", 1, {"anything": True})
            self.assertIsNone(subject_cache.read("by_category", 1))
