"""
A school's security settings save, come back, and are its admins' to change.

The "Enable Advanced Security Features" switch kept turning itself off: it was
not among the fields a save may set, and not in the response, so every reload
read it as off. The session timeout, lockout and password expiry also came
back under names the settings screen did not read, so it showed defaults.
And PublicReadOnly let any signed-in user of the school, pupils and parents
included, change its settings.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from tenants.models import Tenant, TenantSettings

User = get_user_model()
URL = "/api/school-settings/school-settings/"


class SecuritySettingsTest(APITestCase):
    def setUp(self):
        self.school = Tenant.objects.create(
            name="Secure School", slug="secure-school", status="active",
            is_active=True, owner_email="secure@example.com",
        )
        self.headers = {"HTTP_X_TENANT_SLUG": self.school.slug}

    def _user(self, name, role, **extra):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name, last_name="User",
            role=role, password=None, is_active=True, tenant=self.school, **extra,
        )

    def _save(self, user, data):
        self.client.force_authenticate(user)
        return self.client.put(URL, data, format="json", **self.headers)

    def test_the_switch_and_timeout_save_and_come_back(self):
        admin = self._user("secure-admin", "superadmin", is_staff=True)

        response = self._save(admin, {"security_features_enabled": True, "session_timeout_minutes": 45})

        self.assertEqual(response.status_code, 200, response.content)
        stored = TenantSettings.objects.get(tenant=self.school)
        self.assertTrue(stored.security_features_enabled)
        self.assertEqual(stored.session_timeout_minutes, 45)

        reread = self.client.get(URL, **self.headers).json()
        self.assertIs(reread["security_features_enabled"], True)
        # The names the settings screen reads.
        self.assertEqual(reread["session_timeout_minutes"], 45)
        self.assertIn("account_lock_duration_minutes", reread)
        self.assertIn("password_expiration_days", reread)

    def test_turning_it_off_sticks_too(self):
        admin = self._user("secure-admin2", "admin", is_staff=True)
        self._save(admin, {"security_features_enabled": True})

        self._save(admin, {"security_features_enabled": False})

        self.assertFalse(TenantSettings.objects.get(tenant=self.school).security_features_enabled)

    def test_a_teacher_cannot_change_the_schools_settings(self):
        response = self._save(self._user("secure-teacher", "teacher"), {"session_timeout_minutes": 5})

        self.assertEqual(response.status_code, 403)

    def test_a_parent_cannot_either(self):
        response = self._save(self._user("secure-parent", "parent"), {"security_features_enabled": False})

        self.assertEqual(response.status_code, 403)

    def test_the_public_still_reads_the_school_name(self):
        """The school's own pages read its name and colours signed out."""
        response = self.client.get(URL, **self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["school_name"], "Secure School")


class SecurityTabSaveTest(APITestCase):
    """
    The Security tab saves to /api/tenants/settings/current/, not the endpoint
    above, through TenantSettingsSerializer. That serializer had no field for
    the switch, the lockout duration or the password policy, so a save
    silently dropped them and the switch came back off.
    """

    URL = "/api/tenants/settings/current/"

    def setUp(self):
        self.school = Tenant.objects.create(
            name="Tab School", slug="tab-school", status="active",
            is_active=True, owner_email="tab@example.com",
        )
        self.owner = User.objects.create_user(
            username="tab-owner", email="tab-owner@example.com", first_name="Tab", last_name="Owner",
            role="superadmin", password=None, is_active=True, is_staff=True, tenant=self.school,
        )
        self.headers = {"HTTP_X_TENANT_SLUG": self.school.slug}

    def test_the_switch_lockout_and_password_policy_save_and_come_back(self):
        self.client.force_authenticate(self.owner)
        change = {
            "security_features_enabled": True,
            "session_timeout_minutes": 45,
            "account_lock_duration_minutes": 30,
            "password_min_length": 10,
            "password_require_symbols": True,
            "password_expiration_days": 60,
        }

        response = self.client.patch(self.URL, change, format="json", **self.headers)

        self.assertEqual(response.status_code, 200, response.content)
        reread = self.client.get(self.URL, **self.headers).json()
        for field, value in change.items():
            self.assertEqual(reread[field], value, field)

    def test_a_teacher_cannot_change_them(self):
        teacher = User.objects.create_user(
            username="tab-teacher", email="tab-teacher@example.com", first_name="Tab", last_name="Teacher",
            role="teacher", password=None, is_active=True, tenant=self.school,
        )
        self.client.force_authenticate(teacher)

        response = self.client.patch(self.URL, {"security_features_enabled": True}, format="json", **self.headers)

        self.assertEqual(response.status_code, 403)
        # Refused before the settings row is even made; either way, not on.
        self.assertFalse(
            TenantSettings.objects.filter(tenant=self.school, security_features_enabled=True).exists()
        )
