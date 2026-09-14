"""
Adding a student creates working student and parent logins and hands back
their passwords, so it must be limited to people who manage students -- it
was open to anyone, signed in or not, in any school.
"""

from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import EducationLevel
from classroom.models import Class
from parent.models import ParentProfile
from students.models import Student
from tenants.models import Tenant

User = get_user_model()

URL = "/api/students/students/"


@patch("utils.email.send_email_via_brevo")
class AddStudentPermissionTest(APITestCase):
    def setUp(self):
        self.school = self.make_school("Add Student School", "add-student-school")
        self.primary = self.make_level(self.school, "primary", "Primary", "PRIMARY")
        self.jss = self.make_level(self.school, "jss", "Junior Secondary", "JUNIOR_SECONDARY")
        self.primary_1 = self.make_class(self.school, "Primary 1 (add)", self.primary)
        self.jss_1 = self.make_class(self.school, "JSS 1 (add)", self.jss)

    def make_school(self, name, slug):
        return Tenant.objects.create(
            name=name, slug=slug, status="active", is_active=True,
            owner_email=f"owner@{slug}.example.com")

    def make_level(self, school, code, name, level_type):
        level, _ = EducationLevel.objects.update_or_create(
            tenant=school, code=code, defaults={"name": name, "level_type": level_type})
        return level

    def make_class(self, school, name, level):
        return Class.objects.create(
            tenant=school, name=name, code=name.upper().replace(" ", "_")[:20],
            education_level=level, grade_number=1, order=1)

    def login(self, role, school=None, **extra):
        user = User.objects.create_user(
            username=f"add_{role}", email=f"add_{role}@example.com", role=role,
            password="testpass123", is_active=True, tenant=school or self.school, **extra)
        self.client.force_authenticate(user=user)
        return user

    def add(self, school=None, **overrides):
        payload = {
            "user_first_name": "Tobi", "user_last_name": "Ajayi", "gender": "M",
            "date_of_birth": "2015-02-01", "student_class": self.primary_1.id,
            "parent_first_name": "Funmi", "parent_last_name": "Ajayi",
            "parent_email": "funmi.ajayi@example.com", "parent_contact": "08034444444",
            **overrides,
        }
        return self.client.post(
            URL, payload, format="json", HTTP_X_TENANT_SLUG=(school or self.school).slug)

    def assert_nobody_created(self):
        self.assertFalse(User.objects.filter(email="funmi.ajayi@example.com").exists())
        self.assertFalse(Student.objects.filter(user__first_name="Tobi").exists())

    def test_anonymous_is_refused(self, _email):
        """The regression: this returned 201 with both new passwords."""
        response = self.add()

        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assert_nobody_created()

    def test_students_parents_and_teachers_are_refused(self, _email):
        for role in ("student", "parent", "teacher"):
            with self.subTest(role=role):
                self.login(role)
                self.assertEqual(self.add().status_code, status.HTTP_403_FORBIDDEN)
        self.assert_nobody_created()

    def test_school_admins_can_add(self, _email):
        # Deliberately not is_staff: the role alone has to be enough.
        self.login("superadmin", is_staff=False)

        response = self.add()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Student.objects.filter(user__first_name="Tobi", tenant=self.school).exists())

    def test_section_admin_adds_only_to_their_own_levels(self, _email):
        self.login("primary_admin")

        refused = self.add(student_class=self.jss_1.id)
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assert_nobody_created()

        allowed = self.add()
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED, allowed.data)

    def add_with_existing_parent(self, parent):
        payload = {
            "user_first_name": "Tobi", "user_last_name": "Ajayi", "gender": "M",
            "date_of_birth": "2015-02-01", "student_class": self.primary_1.id,
            "existing_parent_id": parent.id,
        }
        return self.client.post(URL, payload, format="json", HTTP_X_TENANT_SLUG=self.school.slug)

    def make_parent(self, school, username):
        user = User.objects.create_user(
            username=username, email=f"{username}@example.com", role="parent",
            password="testpass123", is_active=True, tenant=school)
        return ParentProfile.objects.create(tenant=school, user=user, phone="08035555555")

    def test_existing_parent_must_belong_to_this_school(self, _email):
        other = self.make_school("Other Add School", "other-add-school")
        theirs = self.make_parent(other, "their_parent")
        self.login("superadmin")

        response = self.add_with_existing_parent(theirs)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Parent not found", str(response.data))
        self.assertFalse(Student.objects.filter(user__first_name="Tobi").exists())

    def test_existing_parent_from_this_school_is_linked(self, _email):
        ours = self.make_parent(self.school, "our_parent")
        self.login("superadmin")

        response = self.add_with_existing_parent(ours)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
