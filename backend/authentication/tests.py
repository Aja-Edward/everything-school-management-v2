import inspect

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from security.utils import record_login_attempt
from tenants.models import Tenant

User = get_user_model()


class WebLoginUpdatesLastLoginTest(APITestCase):
    """
    last_login has to survive the web login path.

    SimpleLoginView mints its token with RefreshToken.for_user(), which does
    nothing but mint a token. SIMPLE_JWT["UPDATE_LAST_LOGIN"] only reaches
    TokenObtainPairSerializer, so for every account that had only ever signed
    in through the browser last_login stayed None -- and it read as though
    nobody on the platform had ever logged in.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Login School",
            slug="login-school",
            status="active",
            is_active=True,
            owner_email="login@example.com",
        )
        self.password = "testpass123"
        self.user = User.objects.create_user(
            username="loginuser",
            email="loginuser@example.com",
            first_name="Login",
            last_name="User",
            role="teacher",
            password=self.password,
            is_active=True,
            tenant=self.tenant,
        )

    def _login(self, identifier):
        return self.client.post(
            reverse("authentication:login"),
            {"email": identifier, "password": self.password},
            format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug,
        )

    def test_last_login_is_set_after_a_web_login(self):
        self.assertIsNone(self.user.last_login)

        response = self._login(self.user.email)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(
            self.user.last_login,
            "web login left last_login unset - the field is unusable for "
            "answering whether an account is in use",
        )

    def test_it_works_when_signing_in_by_username(self):
        """The serializer accepts either; both are the same login."""
        response = self._login(self.user.username)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_a_failed_login_does_not_set_it(self):
        response = self.client.post(
            reverse("authentication:login"),
            {"email": self.user.email, "password": "wrong-password"},
            format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug,
        )

        self.assertNotEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.last_login)


class RecordLoginAttemptIsDefinedOnceTest(APITestCase):
    """
    There were two definitions of record_login_attempt in security/utils.py.
    The later one won, so the earlier one's opt-in gate never ran.

    Reviving that gate would have been worse than deleting it: its early
    return skipped the brute-force check too, so honouring it would switch off
    account lockout for any tenant that had not opted in.
    """

    def test_brute_force_check_still_reachable(self):
        source = inspect.getsource(record_login_attempt)
        self.assertIn(
            "_check_and_handle_brute_force",
            source,
            "account lockout must stay reachable from the recording path",
        )

    def test_recording_is_not_gated_on_the_security_opt_in(self):
        source = inspect.getsource(record_login_attempt)
        self.assertNotIn(
            "_is_security_enabled",
            source,
            "gating here also gates brute-force lockout - see the docstring",
        )


class AdminEndpointsStayInsideTheSchoolTest(APITestCase):
    """
    Password reset, activation, admin creation and role change act on the
    school the caller runs, and no further.

    All four were gated by IsAdminUser, which is only is_staff, and every
    school's own admin is staff. Each then looked its target up across the
    whole platform, so the admin of one school could reset the password of
    another school's owner by user id, and sign in as them.
    """

    def setUp(self):
        self.school = Tenant.objects.create(
            name="Home School", slug="home-school", status="active",
            is_active=True, owner_email="home@example.com",
        )
        self.other = Tenant.objects.create(
            name="Other School", slug="other-school", status="active",
            is_active=True, owner_email="other@example.com",
        )
        self.owner = self._user("owner", "superadmin", self.school, is_staff=True)
        self.admin = self._user("admin", "admin", self.school, is_staff=True)
        self.teacher = self._user("teacher", "teacher", self.school)
        self.other_owner = self._user("other-owner", "superadmin", self.other, is_staff=True)
        self.other_teacher = self._user("other-teacher", "teacher", self.other)
        self.platform = self._user(
            "platform", "platform_admin", None, is_staff=True, is_superuser=True,
        )

    def _user(self, name, role, tenant, **extra):
        # password=None: hashing costs seconds per user and nobody logs in.
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name,
            last_name="User", role=role, password=None, is_active=True,
            tenant=tenant, **extra,
        )

    def _as(self, user, school=None):
        self.client.force_authenticate(user)
        school = school or self.school
        return {"format": "json", "HTTP_X_TENANT_SLUG": school.slug}

    def _reset(self, actor, target, school=None):
        return self.client.post(
            reverse("authentication:admin_reset_password"),
            {"user_id": target.pk, "new_password": "N3w-pass!word"},
            **self._as(actor, school),
        )

    def _activate(self, actor, target, is_active):
        return self.client.patch(
            reverse("authentication:activate_user", args=[target.pk]),
            {"is_active": is_active},
            **self._as(actor),
        )

    # ── Password reset ────────────────────────────────────────────────────────

    def test_an_admin_resets_a_password_in_their_own_school(self):
        response = self._reset(self.admin, self.teacher)

        self.assertEqual(response.status_code, 200)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.check_password("N3w-pass!word"))

    def test_another_schools_owner_is_out_of_reach(self):
        response = self._reset(self.owner, self.other_owner)

        # 404, not 403: whether an id exists elsewhere is not theirs to learn.
        self.assertEqual(response.status_code, 404)
        self.other_owner.refresh_from_db()
        self.assertFalse(self.other_owner.check_password("N3w-pass!word"))

    def test_a_platform_account_is_out_of_reach(self):
        response = self._reset(self.owner, self.platform)

        self.assertEqual(response.status_code, 404)
        self.platform.refresh_from_db()
        self.assertFalse(self.platform.check_password("N3w-pass!word"))

    def test_an_admin_cannot_take_over_the_owners_account(self):
        response = self._reset(self.admin, self.owner)

        self.assertEqual(response.status_code, 403)
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.check_password("N3w-pass!word"))

    def test_platform_staff_still_reach_every_school(self):
        response = self._reset(self.platform, self.other_teacher, school=self.other)

        self.assertEqual(response.status_code, 200)

    # ── Activation ────────────────────────────────────────────────────────────

    def test_an_admin_deactivates_their_own_schools_teacher(self):
        response = self._activate(self.admin, self.teacher, False)

        self.assertEqual(response.status_code, 200)
        self.teacher.refresh_from_db()
        self.assertFalse(self.teacher.is_active)

    def test_another_schools_teacher_cannot_be_deactivated(self):
        response = self._activate(self.admin, self.other_teacher, False)

        self.assertEqual(response.status_code, 404)
        self.other_teacher.refresh_from_db()
        self.assertTrue(self.other_teacher.is_active)

    # ── Creating admins ───────────────────────────────────────────────────────

    def _create_admin(self, actor, role):
        return self.client.post(
            reverse("authentication:create-admin"),
            {"email": f"new-{role}@example.com", "first_name": "New",
             "last_name": "Admin", "role": role},
            **self._as(actor),
        )

    def test_a_superadmin_cannot_be_created_through_the_endpoint(self):
        response = self._create_admin(self.admin, "superadmin")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(role="superadmin", email__startswith="new-").exists())

    def test_a_section_admin_is_created_in_the_callers_school(self):
        response = self._create_admin(self.owner, "primary_admin")

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email="new-primary_admin@example.com")
        self.assertEqual(created.tenant_id, self.school.id)
        self.assertEqual(created.role, "primary_admin")

    def test_a_staff_section_admin_cannot_add_admins(self):
        section_admin = self._user("section", "primary_admin", self.school, is_staff=True)

        response = self._create_admin(section_admin, "admin")

        self.assertEqual(response.status_code, 403)

    # ── Role change ───────────────────────────────────────────────────────────

    def _set_role(self, actor, target, role):
        return self.client.post(
            reverse("schoolSettings:update-user-role"),
            {"email": target.email, "role": role},
            **self._as(actor),
        )

    def test_an_admin_gives_their_own_teacher_a_section_role(self):
        response = self._set_role(self.admin, self.teacher, "primary_admin")

        self.assertEqual(response.status_code, 200)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.role, "primary_admin")

    def test_another_schools_user_is_not_found_by_email(self):
        response = self._set_role(self.admin, self.other_teacher, "admin")

        self.assertEqual(response.status_code, 404)
        self.other_teacher.refresh_from_db()
        self.assertEqual(self.other_teacher.role, "teacher")

    def test_nobody_is_made_a_superadmin_by_role_change(self):
        response = self._set_role(self.owner, self.teacher, "superadmin")

        self.assertEqual(response.status_code, 400)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.role, "teacher")

    def test_an_admin_cannot_demote_the_owner(self):
        response = self._set_role(self.admin, self.owner, "teacher")

        self.assertEqual(response.status_code, 403)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.role, "superadmin")
