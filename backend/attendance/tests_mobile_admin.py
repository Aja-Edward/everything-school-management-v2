"""
A school's own admin using the attendance mobile app, through the same calls
docs/mobile-attendance-api.md gives the app: a token pair from
/api/auth/token/ on the backend's own host, then the Bearer token and the
school's header on every attendance request. Nothing is force-authenticated,
so the real login, token and school checks all run.
"""

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from tenants.models import Tenant
from users.models import CustomUser

HOST = "everything-school-management-v2.onrender.com"
PASSWORD = "Head-pass-2026"


@override_settings(ALLOWED_HOSTS=["*"])
class SchoolAdminOnMobileTest(TestCase):
    def setUp(self):
        cache.clear()  # Login rate-limit counters live in the cache.
        self.school = self.make_school("mobile-school")
        # As SchoolRegistrationSerializer makes a school's first admin: a
        # generated username that isn't their email.
        self.admin = self.make_user("superadmin_mobile_school", "head@mobile-school.example.com", "superadmin",
                                    self.school, is_staff=True)
        self.client = APIClient(HTTP_HOST=HOST)

    def make_school(self, slug):
        return Tenant.objects.create(name=slug.title(), slug=slug, status="active", is_active=True,
                                     owner_email=f"owner@{slug}.example.com")

    def make_user(self, username, email, role, school, **fields):
        return CustomUser.objects.create_user(
            username=username, email=email, password=PASSWORD, first_name="Head", last_name="Admin", role=role,
            is_active=True, email_verified=True, tenant=school, **fields)

    def log_in(self, username, password=PASSWORD):
        return self.client.post("/api/auth/token/", {"username": username, "password": password}, format="json")

    def token_for(self, username):
        response = self.log_in(username)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["access"]

    def call(self, method, path, token, school=None, data=None):
        return getattr(self.client, method)(path, data, format="json", HTTP_AUTHORIZATION=f"Bearer {token}",
                                            HTTP_X_TENANT_SLUG=(school or self.school).slug)

    def test_an_admin_can_log_in_with_their_email_or_their_username(self):
        by_email = self.log_in("head@mobile-school.example.com")
        by_username = self.log_in("superadmin_mobile_school")

        self.assertEqual(by_email.status_code, status.HTTP_200_OK, by_email.data)
        self.assertEqual(by_email.data["user"]["tenant_slug"], "mobile-school")
        self.assertEqual(by_username.status_code, status.HTTP_200_OK, by_username.data)

    def test_a_wrong_password_is_refused_in_the_documented_shape(self):
        response = self.log_in("head@mobile-school.example.com", password="not-it")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data, {"non_field_errors": ["Invalid username or password."]})

    def test_the_schools_own_admin_can_take_attendance_and_enrol_chips(self):
        token = self.token_for("head@mobile-school.example.com")

        roster = self.call("get", "/api/attendance/tags/roster/", token)
        resolve = self.call("get", "/api/attendance/tags/resolve/?uid=04a2241b", token)
        bulk = self.call("post", "/api/attendance/attendance/bulk-upsert/", token, data={"records": []})
        scan = self.call("post", "/api/attendance/scans/", token, data={"uid": "04a2241b", "direction": "in"})
        enrol = self.call("post", "/api/attendance/tags/", token, data={})

        self.assertEqual(roster.status_code, status.HTTP_200_OK, roster.data)
        # Past the permission check: what's left is about the data sent.
        for response in (resolve, bulk, scan, enrol):
            self.assertNotIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                             (response.request["PATH_INFO"], response.data))
        self.assertEqual(scan.data.get("code"), "uid_not_enrolled")

    def test_the_admin_gets_nothing_by_naming_another_school(self):
        rival = self.make_school("rival-school")
        token = self.token_for("head@mobile-school.example.com")

        for method, path, data in (("get", "/api/attendance/tags/roster/", None),
                                   ("post", "/api/attendance/scans/", {"uid": "04a2241b", "direction": "in"})):
            response = self.call(method, path, token, school=rival, data=data)
            self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN), path)

    def test_a_section_admin_still_needs_a_role_for_attendance(self):
        self.make_user("primary_head", "primary@mobile-school.example.com", "primary_admin", self.school)
        token = self.token_for("primary@mobile-school.example.com")

        response = self.call("get", "/api/attendance/tags/roster/", token)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_schools_admin_is_still_not_platform_staff(self):
        self.assertTrue(self.admin.is_school_superadmin)
        self.assertFalse(self.admin.is_platform_staff)
