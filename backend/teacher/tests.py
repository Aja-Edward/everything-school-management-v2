"""
Creating a teacher through the API puts them in the school that asked for
them. A teacher with no school is refused every page of the site and is
missing from their school's own teacher list, so this is the thing to get
right at the moment the account is made.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from teacher.models import Teacher
from tenants.membership import user_school_id
from tenants.models import Tenant, TenantSettings
from users.models import CustomUser

TEACHERS = "/api/teachers/teachers/"


class CreateTeacherTest(TestCase):
    client_class = APIClient

    def setUp(self):
        self.school = self.make_school("hill-school")
        self.admin = CustomUser.objects.create_user(
            username="superadmin_hill", email="head@hill-school.example.com", password="x", role="superadmin",
            first_name="Head", last_name="Admin", is_active=True, is_staff=True, tenant=self.school)
        self.client.force_authenticate(user=self.admin)

    def make_school(self, slug):
        return Tenant.objects.create(name=slug.title(), slug=slug, status="active", is_active=True,
                                     owner_email=f"owner@{slug}.example.com")

    def create_teacher(self, email="new.teacher@hill-school.example.com", employee_id="EMP-001", school=None):
        return self.client.post(TEACHERS, {
            "user_email": email, "user_first_name": "Ada", "user_last_name": "Bello", "employee_id": employee_id,
        }, format="json", HTTP_X_TENANT_SLUG=(school or self.school).slug)

    def test_a_new_teacher_belongs_to_the_school_that_created_them(self):
        response = self.create_teacher()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        teacher = Teacher.objects.get(pk=response.data["id"])
        self.assertEqual(teacher.tenant, self.school)
        self.assertEqual(teacher.user.tenant, self.school)
        # What every request checks to decide which school someone is in.
        self.assertEqual(user_school_id(teacher.user), self.school.id)

    def test_their_username_carries_their_own_schools_code(self):
        TenantSettings.objects.create(tenant=self.school, school_code="HIL")

        response = self.create_teacher(employee_id="EMP-042")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        username = response.data["username"]
        self.assertTrue(username.startswith("TCH/HIL/"), username)
        self.assertIn("EMP-042", username)
        # It used to read TCH/GTS/... whichever school was adding the teacher.
        self.assertNotIn("GTS", username)

    def test_a_school_with_no_code_yet_doesnt_borrow_another_schools(self):
        rival = self.make_school("rival-school")
        TenantSettings.objects.create(tenant=rival, school_code="RIV")

        response = self.create_teacher()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertNotIn("RIV", response.data["username"])

    def test_the_school_sees_its_own_new_teacher_in_its_list(self):
        self.create_teacher()

        listed = self.client.get(TEACHERS, HTTP_X_TENANT_SLUG=self.school.slug)

        self.assertEqual(listed.status_code, status.HTTP_200_OK, listed.data)
        results = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        self.assertEqual(len(results), 1)

    def test_another_school_does_not_see_it(self):
        rival = self.make_school("rival-school")
        self.create_teacher()

        listed = self.client.get(TEACHERS, HTTP_X_TENANT_SLUG=rival.slug)

        self.assertIn(listed.status_code, (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        if listed.status_code == status.HTTP_200_OK:
            results = listed.data["results"] if isinstance(listed.data, dict) else listed.data
            self.assertEqual(results, [])
