"""
Subject combinations: a school admin saves them, per stream; nobody else edits them.

The viewset set no permission_classes, so it fell back to the platform's
AllowAny default and anyone, signed in or not, could change a school's
combinations. It also ignored ?stream=, so the settings screen showed every
stream's combinations under whichever stream was picked.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from classroom.models import Stream
from subject.models import SubjectCombination
from tenants.models import Tenant

User = get_user_model()
URL = "/api/subjects/subject-combinations/"


class SubjectCombinationsTest(APITestCase):
    def setUp(self):
        self.school = Tenant.objects.create(
            name="Combo School", slug="combo-school", status="active",
            is_active=True, owner_email="combo@example.com",
        )
        self.science = Stream.objects.create(tenant=self.school, name="Science", code="SCI", stream_type="SCIENCE")
        self.arts = Stream.objects.create(tenant=self.school, name="Arts", code="ART", stream_type="ARTS")
        self.admin = self._user("combo-admin", "admin", is_staff=True)
        self.headers = {"HTTP_X_TENANT_SLUG": self.school.slug}

    def _user(self, name, role, **extra):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", first_name=name, last_name="User",
            role=role, password=None, is_active=True, tenant=self.school, **extra,
        )

    def _create(self, stream, code="PCB"):
        return self.client.post(
            URL, {"name": "Physics, Chemistry, Biology", "code": code, "stream": stream.pk},
            format="json", **self.headers,
        )

    def test_a_school_admin_saves_a_combination(self):
        self.client.force_authenticate(self.admin)

        response = self._create(self.science)

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(SubjectCombination.objects.get().tenant, self.school)

    def test_the_list_is_the_chosen_streams_only(self):
        self.client.force_authenticate(self.admin)
        self._create(self.science, "PCB")
        self._create(self.arts, "LIT")

        response = self.client.get(URL, {"stream": self.arts.pk}, **self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["code"] for row in response.json()], ["LIT"])

    def test_signed_out_visitors_cannot_create_one(self):
        response = self._create(self.science)

        self.assertIn(response.status_code, (401, 403))
        self.assertFalse(SubjectCombination.objects.exists())

    def test_a_teacher_reads_but_cannot_create(self):
        self.client.force_authenticate(self._user("combo-teacher", "teacher"))

        self.assertEqual(self.client.get(URL, **self.headers).status_code, 200)
        self.assertEqual(self._create(self.science).status_code, 403)
