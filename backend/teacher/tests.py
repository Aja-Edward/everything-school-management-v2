"""
Creating a teacher through the API puts them in the school that asked for
them. A teacher with no school is refused every page of the site and is
missing from their school's own teacher list, so this is the thing to get
right at the moment the account is made.
"""

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
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


class PagedListsShowEveryoneOnceTest(TestCase):
    """
    A paginated list with no order repeats and skips rows.

    Reported by a school: one teacher appeared on page 1 and again on page 2,
    and another never appeared at all although she could still sign in.
    Deleting the "duplicate" deleted her only record.
    """

    client_class = APIClient
    PAGE_SIZE = 20

    def setUp(self):
        self.school = Tenant.objects.create(
            name="Kebi Academy", slug="kebi-academy", status="active", is_active=True,
            owner_email="owner@kebi-academy.example.com")
        self.admin = CustomUser.objects.create_user(
            username="kebi_admin", email="head@kebi-academy.example.com", password=None,
            role="superadmin", is_active=True, is_staff=True, tenant=self.school)
        self.client.force_authenticate(user=self.admin)

    def make_user(self, username, role, first, last):
        return CustomUser.objects.create_user(
            username=username, email=f"{username}@kebi-academy.example.com", password=None,
            role=role, first_name=first, last_name=last, is_active=True, tenant=self.school)

    def every_id(self, url, table):
        """
        Every id the paginated list hands out, page by page, with repeats kept.

        The query that fetches each page is checked for an ORDER BY: without
        one the database may order the rows differently per page, and with a
        handful of test rows it usually doesn't, so comparing the pages alone
        would pass whether or not the bug is there.
        """
        ids, page = [], 1
        while True:
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(url, {"page": page}, HTTP_X_TENANT_SLUG=self.school.slug)
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

            # The query that fetches the page: a LIMIT (the last page's is
            # short, "LIMIT 5 OFFSET 20") over the listed table. Not the row
            # count, and not a `get()` elsewhere in the view, which Django
            # writes as LIMIT 21.
            paged = [q["sql"] for q in queries.captured_queries
                     if f'FROM "{table}"' in q["sql"] and " LIMIT " in q["sql"]
                     and "COUNT(*)" not in q["sql"] and " LIMIT 21" not in q["sql"]]
            self.assertTrue(paged, f"no paginated query against {table}")
            for sql in paged:
                self.assertIn("ORDER BY", sql, "a page was fetched in no particular order")

            ids += [row["id"] for row in response.data["results"]]
            if not response.data.get("next"):
                return ids, response.data["count"]
            page += 1

    def test_every_teacher_shows_exactly_once_across_the_pages(self):
        # More than one page, and namesakes, which is where ties get shuffled.
        made = [
            Teacher.objects.create(
                tenant=self.school, employee_id=f"EMP-{n:03d}",
                user=self.make_user(f"teacher{n}", "teacher", "Mercy", "Iko"))
            for n in range(self.PAGE_SIZE + 5)
        ]

        ids, count = self.every_id(TEACHERS, "teacher_teacher")

        self.assertEqual(count, len(made))
        self.assertEqual(len(ids), len(set(ids)), "a teacher was listed on two pages")
        self.assertEqual(set(ids), {teacher.id for teacher in made}, "a teacher was never listed")

    def test_every_parent_shows_exactly_once_across_the_pages(self):
        from parent.models import ParentProfile

        made = [
            ParentProfile.objects.create(
                tenant=self.school, user=self.make_user(f"parent{n}", "parent", "Mercy", "Iko"))
            for n in range(self.PAGE_SIZE + 5)
        ]

        ids, count = self.every_id("/api/parents/", "parent_parentprofile")

        self.assertEqual(count, len(made))
        self.assertEqual(len(ids), len(set(ids)), "a parent was listed on two pages")
        self.assertEqual(set(ids), {parent.id for parent in made}, "a parent was never listed")
