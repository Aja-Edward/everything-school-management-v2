"""
The subject cache must not hand one school another school's data.

Three endpoints built a tenant-filtered payload and cached it under a key with
no tenant in it -- "subjects_by_category_v4" and friends. Whichever school
called first populated the cache; every other school on the platform read that
school's subjects back for the next thirty minutes.

The second half of the same story is invalidation. There were four separate
clear_subject_caches() helpers with four hand-written key lists, and the
version suffixes on the setters had been bumped while the deleters' had not,
so the live keys were deleted by nothing at all and expired only on TTL. Both
halves are covered here, because fixing one without the other leaves the
feature broken in a way that looks fixed.
"""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from subject import cache as subject_cache
from subject.models import Subject, SubjectCategory
from tenants.models import Tenant

User = get_user_model()


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "subject-cache-tests",
        }
    }
)
class TwoSchoolsTestCase(APITestCase):
    """
    Two schools with different subjects, each with its own admin.

    Pinned to a local-memory cache. settings.py already keeps the test
    suite off Redis, but this class calls cache.clear(), which the Redis
    backend implements as FLUSHDB -- it would empty the whole database,
    Celery's queues included. Worth being certain about twice.
    """

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

        self.category = SubjectCategory.objects.create(
            name="Core", code="CORE", display_order=1
        )
        self.alpha = self._school("Alpha Academy", "alpha", ["Alpha Only Subject"])
        self.beta = self._school(
            "Beta College", "beta", ["Beta Only Subject", "Beta Second Subject"]
        )

    def _school(self, name, slug, subject_names):
        tenant = Tenant.objects.create(
            name=name,
            slug=slug,
            status="active",
            is_active=True,
            owner_email="{0}@example.com".format(slug),
        )
        for index, subject_name in enumerate(subject_names):
            Subject.objects.create(
                tenant=tenant,
                name=subject_name,
                code="{0}-{1:03d}".format(slug[:3].upper(), index + 1),
                education_levels=["PRIMARY"],
                category_new=self.category,
            )
        user = User.objects.create_user(
            username="{0}-admin".format(slug),
            email="admin@{0}.example.com".format(slug),
            first_name=name,
            last_name="Admin",
            role="admin",
            password="testpass123",
            is_active=True,
            tenant=tenant,
        )
        return {"tenant": tenant, "user": user}

    def get(self, school, path):
        self.client.force_authenticate(user=school["user"])
        return self.client.get(path, HTTP_X_TENANT_SLUG=school["tenant"].slug)

    def subject_names(self, payload):
        """Every subject name in a grouped by_category / by_education_level body."""
        names = []
        for group in payload.values():
            if isinstance(group, dict):
                names.extend(s.get("name") for s in group.get("subjects", []))
        return names


class CacheIsolationTest(TwoSchoolsTestCase):
    def test_by_category_does_not_leak_between_schools(self):
        first = self.get(self.alpha, "/api/subjects/by_category/")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertIn("Alpha Only Subject", self.subject_names(first.data))

        second = self.get(self.beta, "/api/subjects/by_category/")
        self.assertEqual(second.status_code, 200, second.data)
        names = self.subject_names(second.data)

        self.assertNotIn(
            "Alpha Only Subject",
            names,
            "Beta College was served Alpha Academy's subjects",
        )
        self.assertIn("Beta Only Subject", names)

    def test_by_education_level_does_not_leak_between_schools(self):
        self.get(self.alpha, "/api/subjects/by_education_level/")

        second = self.get(self.beta, "/api/subjects/by_education_level/")
        self.assertEqual(second.status_code, 200, second.data)

        self.assertNotIn(
            "Alpha Only Subject",
            self.subject_names(second.data),
            "Beta College was served Alpha Academy's subjects",
        )

    def test_statistics_does_not_leak_between_schools(self):
        """Counts, not names -- the leak is just as real and harder to spot."""
        first = self.get(self.alpha, "/api/subjects/statistics/")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data["overview"]["total_subjects"], 1)

        second = self.get(self.beta, "/api/subjects/statistics/")
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(
            second.data["overview"]["total_subjects"],
            2,
            "Beta College was served Alpha Academy's subject counts",
        )

    def test_the_second_school_is_served_from_its_own_cache_entry(self):
        """Both schools cached at once, each reading back its own."""
        self.get(self.alpha, "/api/subjects/by_category/")
        self.get(self.beta, "/api/subjects/by_category/")

        alpha_entry = subject_cache.read("by_category", self.alpha["tenant"].id)
        beta_entry = subject_cache.read("by_category", self.beta["tenant"].id)

        self.assertIsNotNone(alpha_entry)
        self.assertIsNotNone(beta_entry)
        self.assertIn("Alpha Only Subject", self.subject_names(alpha_entry))
        self.assertIn("Beta Only Subject", self.subject_names(beta_entry))

    def test_the_key_names_the_tenant(self):
        key = subject_cache.key("by_category", self.alpha["tenant"].id)

        self.assertIn(str(self.alpha["tenant"].id), key)
        self.assertNotEqual(
            key, subject_cache.key("by_category", self.beta["tenant"].id)
        )


class CacheInvalidationTest(TwoSchoolsTestCase):
    def test_invalidate_drops_the_key_the_endpoint_actually_wrote(self):
        self.get(self.alpha, "/api/subjects/by_category/")
        self.assertIsNotNone(
            subject_cache.read("by_category", self.alpha["tenant"].id),
            "the endpoint did not populate its own cache entry",
        )

        subject_cache.invalidate(self.alpha["tenant"].id)

        self.assertIsNone(
            subject_cache.read("by_category", self.alpha["tenant"].id),
            "invalidate() left the live key in place",
        )

    def test_invalidating_one_school_leaves_the_other_alone(self):
        self.get(self.alpha, "/api/subjects/by_category/")
        self.get(self.beta, "/api/subjects/by_category/")

        subject_cache.invalidate(self.alpha["tenant"].id)

        self.assertIsNone(subject_cache.read("by_category", self.alpha["tenant"].id))
        self.assertIsNotNone(
            subject_cache.read("by_category", self.beta["tenant"].id),
            "invalidating one school threw away another school's cache",
        )

    def test_invalidate_with_no_tenant_clears_every_school(self):
        self.get(self.alpha, "/api/subjects/by_category/")
        self.get(self.beta, "/api/subjects/by_category/")

        subject_cache.invalidate()

        self.assertIsNone(subject_cache.read("by_category", self.alpha["tenant"].id))
        self.assertIsNone(subject_cache.read("by_category", self.beta["tenant"].id))

    def test_editing_a_subject_invalidates_that_school(self):
        """The whole point: the next read has to see the edit."""
        self.get(self.alpha, "/api/subjects/by_category/")
        subject = Subject.objects.get(name="Alpha Only Subject")

        self.client.force_authenticate(user=self.alpha["user"])
        response = self.client.patch(
            "/api/subjects/{0}/".format(subject.id),
            {"name": "Renamed Subject", "code": subject.code},
            format="json",
            HTTP_X_TENANT_SLUG=self.alpha["tenant"].slug,
        )
        self.assertEqual(response.status_code, 200, response.data)

        refreshed = self.get(self.alpha, "/api/subjects/by_category/")
        self.assertIn("Renamed Subject", self.subject_names(refreshed.data))

    def test_every_entry_is_covered_by_invalidation(self):
        """
        A new cached endpoint has to be registered here or it will never be
        invalidated -- which is exactly how the previous four key lists rotted.
        """
        for name in subject_cache.TTLS:
            subject_cache.write(name, self.alpha["tenant"].id, {"probe": True})

        subject_cache.invalidate(self.alpha["tenant"].id)

        for name in subject_cache.TTLS:
            self.assertIsNone(
                subject_cache.read(name, self.alpha["tenant"].id),
                "{0} survived invalidation".format(name),
            )

    def test_an_unknown_entry_is_refused_rather_than_silently_cached(self):
        with self.assertRaises(KeyError):
            subject_cache.key("not_registered", self.alpha["tenant"].id)


class UnscopedEndpointTest(TwoSchoolsTestCase):
    """
    Two endpoints queried Subject.objects directly, with no tenant filter at
    all -- no cache involved, unscoped at the source.
    """

    def test_the_analytics_viewset_scopes_its_queryset(self):
        """
        Driven at the viewset rather than over HTTP. Its dashboard action
        cannot answer a request at all: it reads Subject.is_discontinued,
        is_activity_based, has_practical, requires_lab and
        requires_specialist_teacher, none of which exist on the model any
        more, so it raises FieldError before returning. The queryset every
        one of those reads is built from is what changed here.
        """
        from subject.analyticalviewset import SubjectAnalyticsViewSet

        request = self.client.request().wsgi_request
        request.tenant = self.beta["tenant"]
        request.user = self.beta["user"]

        viewset = SubjectAnalyticsViewSet()
        viewset.request = request
        viewset.kwargs = {}
        viewset.format_kwarg = None

        names = set(viewset.get_queryset().values_list("name", flat=True))

        self.assertEqual(names, {"Beta Only Subject", "Beta Second Subject"})
        self.assertNotIn(
            "Alpha Only Subject",
            names,
            "the analytics viewset reached another school's subjects",
        )

    def test_analytics_dashboard_does_not_reuse_the_management_key(self):
        """Two endpoints shared one key and returned each other's payloads."""
        self.assertNotEqual(
            subject_cache.key("analytics_dashboard", self.alpha["tenant"].id),
            subject_cache.key("management_dashboard", self.alpha["tenant"].id),
        )

    def test_subjects_by_level_filters_on_the_tenant(self):
        """
        SubjectByEducationLevelView filtered on education level alone, so any
        authenticated user got every school's subjects for that level.

        Read from the source rather than driven: the route registered for it,
        classrooms/subjects/by-level/, is shadowed by the router registered at
        "subjects" in the same urls.py, which matches "by-level" as a detail
        primary key. The view is unreachable today. The filter is asserted
        here so that whenever the routing is untangled it does not come back
        unscoped.
        """
        import inspect

        from classroom.views import SubjectByEducationLevelView

        source = inspect.getsource(SubjectByEducationLevelView.get)

        self.assertIn("queryset.filter(tenant=tenant)", source)
        self.assertNotIn(
            "cache_page",
            source,
            "a page cache keys on the URL, which does not carry the tenant",
        )
