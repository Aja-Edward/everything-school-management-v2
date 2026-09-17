"""The health endpoint says which commit is running, so a deploy can be checked without signing in."""

from unittest import mock

from django.test import Client, TestCase


class HealthCheckTest(TestCase):
    def get(self):
        return Client().get("/health/")

    def test_it_reports_the_commit_the_host_deployed(self):
        with mock.patch.dict("os.environ", {"RENDER_GIT_COMMIT": "cffd9bdabc123456789", "RENDER_GIT_BRANCH": "main"}):
            response = self.get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["commit"], "cffd9bdabc12")
        self.assertEqual(response.json()["branch"], "main")

    def test_a_host_that_says_nothing_leaves_it_unknown(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            response = self.get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["commit"], "unknown")
        self.assertEqual(response.json()["status"], "healthy")
