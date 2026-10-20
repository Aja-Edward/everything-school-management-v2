"""The old maintenance endpoints are gone, so nobody on the internet can run migrations or read the schema.

Migrations run from the Render Build Command on each deploy instead.
"""

from unittest import mock

from django.test import Client, TestCase
from django.urls import Resolver404, resolve


REMOVED_PATHS = [
    "/api/force-migrate/",
    "/api/check-schema/",
    "/api/school-settings/force-migrate/",
]


class RemovedMaintenanceEndpointsTest(TestCase):
    def test_anonymous_requests_get_404_and_never_migrate(self):
        client = Client()
        with mock.patch("django.core.management.call_command") as call_command:
            for path in REMOVED_PATHS:
                for query in ("", "?secret=mysecuretoken123", "?secret=migrate_now_2025"):
                    with self.subTest(path=path, query=query):
                        response = client.get(path + query)
                        self.assertEqual(response.status_code, 404)
        call_command.assert_not_called()

    def test_no_route_resolves_to_a_migrate_view(self):
        for path in REMOVED_PATHS:
            with self.subTest(path=path):
                with self.assertRaises(Resolver404):
                    resolve(path)

    def test_admin_force_migrate_is_only_the_admin_catch_all(self):
        # The admin site catches every /admin/ path itself, so this no longer reaches a migrate view.
        match = resolve("/admin/force-migrate/")
        self.assertNotIn("migrate", match.func.__name__)
        with mock.patch("django.core.management.call_command") as call_command:
            response = Client().get("/admin/force-migrate/?secret=mysecuretoken123")
        self.assertIn(response.status_code, (302, 404))
        call_command.assert_not_called()
