"""
Roles & Permissions stay inside the school that uses them.

Role, UserRole and Permission have no school of their own, and their
viewsets listed them unfiltered. Any school's owner saw every other school's
role assignments, those users' names and emails included, and could edit or
delete the roles other schools had made.
"""
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from schoolSettings.models import Permission, Role, UserRole
from tenants.models import Tenant

User = get_user_model()


class RolesStayInTheirSchoolTest(APITestCase):
    def setUp(self):
        self.school = self._school("roles-home")
        self.other = self._school("roles-other")
        self.owner = self._user("roles-owner", "superadmin", self.school, is_staff=True)
        self.teacher = self._user("roles-teacher", "teacher", self.school)
        self.other_owner = self._user("roles-other-owner", "superadmin", self.other, is_staff=True)

        self.own_role = Role.objects.create(
            name="Home Bursar", created_by=self.owner, tenant=self.school,
        )
        self.built_in = Role.objects.create(name="Built-in Viewer", is_system=True)
        UserRole.objects.create(user=self.teacher, role=self.own_role, assigned_by=self.owner)

    def _school(self, slug):
        return Tenant.objects.create(
            name=slug.title(), slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com",
        )

    def _user(self, name, role, tenant, **extra):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name,
            last_name="User", role=role, password=None, is_active=True,
            tenant=tenant, **extra,
        )

    def _as(self, user, school):
        self.client.force_authenticate(user)
        return {"format": "json", "HTTP_X_TENANT_SLUG": school.slug}

    @staticmethod
    def _ids(response):
        body = response.json()
        rows = body["results"] if isinstance(body, dict) and "results" in body else body
        return {row["id"] for row in rows}

    # ── Roles ─────────────────────────────────────────────────────────────────

    def test_a_school_sees_its_own_roles_and_the_built_in_ones(self):
        response = self.client.get(reverse("schoolSettings:role-list"), **self._as(self.owner, self.school))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ids(response), {self.own_role.pk, self.built_in.pk})

    def test_another_schools_roles_are_not_listed(self):
        response = self.client.get(
            reverse("schoolSettings:role-list"), **self._as(self.other_owner, self.other)
        )

        self.assertEqual(self._ids(response), {self.built_in.pk})

    def test_another_schools_role_cannot_be_edited(self):
        response = self.client.patch(
            reverse("schoolSettings:role-detail", args=[self.own_role.pk]),
            {"name": "Hijacked"}, **self._as(self.other_owner, self.other),
        )

        self.assertEqual(response.status_code, 404)
        self.own_role.refresh_from_db()
        self.assertEqual(self.own_role.name, "Home Bursar")

    def test_a_new_role_belongs_to_the_school_that_made_it(self):
        response = self.client.post(
            reverse("schoolSettings:role-list"), {"name": "Exams Officer"},
            **self._as(self.owner, self.school),
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Role.objects.get(name="Exams Officer").tenant, self.school)

    def test_two_schools_can_each_have_a_role_of_the_same_name(self):
        """The name used to be unique across the whole platform."""
        response = self.client.post(
            reverse("schoolSettings:role-list"), {"name": "Home Bursar"},
            **self._as(self.other_owner, self.other),
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(Role.objects.filter(name="Home Bursar").count(), 2)

    def test_but_not_one_school_twice(self):
        response = self.client.post(
            reverse("schoolSettings:role-list"), {"name": "Home Bursar"},
            **self._as(self.owner, self.school),
        )

        self.assertEqual(response.status_code, 400)

    def test_a_built_in_role_is_not_a_schools_to_edit(self):
        response = self.client.patch(
            reverse("schoolSettings:role-detail", args=[self.built_in.pk]),
            {"description": "changed"}, **self._as(self.owner, self.school),
        )

        self.assertEqual(response.status_code, 403)

    # ── Role assignments ──────────────────────────────────────────────────────

    def test_another_schools_assignments_are_not_listed(self):
        response = self.client.get(
            reverse("schoolSettings:user-role-list"), **self._as(self.other_owner, self.other)
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._ids(response), set())
        self.assertNotIn(self.teacher.email, response.content.decode())

    def test_a_school_sees_its_own_assignments(self):
        response = self.client.get(
            reverse("schoolSettings:user-role-list"), **self._as(self.owner, self.school)
        )

        self.assertEqual(len(self._ids(response)), 1)

    def test_another_schools_user_cannot_be_given_a_role(self):
        response = self.client.post(
            reverse("schoolSettings:user-role-list"),
            {"user": self.teacher.pk, "role": self.built_in.pk},
            **self._as(self.other_owner, self.other),
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(UserRole.objects.filter(user=self.teacher, role=self.built_in).exists())

    def test_another_schools_users_permissions_are_not_readable(self):
        self.client.force_authenticate(self.other_owner)

        response = self.client.get(
            reverse("schoolSettings:user-role-user-permissions"),
            {"user_id": self.teacher.pk},
            HTTP_X_TENANT_SLUG=self.other.slug,
        )

        self.assertEqual(response.status_code, 404)

    # ── The permission catalogue ──────────────────────────────────────────────

    def test_a_school_cannot_change_the_shared_permission_catalogue(self):
        permission = Permission.objects.create(module="finance", permission_type="read", granted=True)

        response = self.client.patch(
            reverse("schoolSettings:permission-detail", args=[permission.pk]),
            {"granted": False}, **self._as(self.owner, self.school),
        )

        self.assertEqual(response.status_code, 403)
        permission.refresh_from_db()
        self.assertTrue(permission.granted)
