"""
Regression tests for the parent-facing attendance path.

`ParentProfile` links students through the `students` M2M (see
parent/models.py). Three call sites previously reached for a
non-existent `children` attribute, which raised AttributeError — a 500
— for any authenticated parent. These tests pin the working behaviour.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from classroom.models import Section
from parent.models import ParentProfile, ParentStudentRelationship
from students.models import Student
from tenants.models import Tenant

from .models import Attendance

User = get_user_model()


class ParentAttendanceAccessTest(APITestCase):
    """A parent listing attendance sees their own children and nobody else's."""

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Test School",
            slug="test-school",
            status="active",
            is_active=True,
            owner_email="owner@example.com",
        )
        self.section = Section.objects.create(
            name="A", tenant=self.tenant)

        self.parent_user = User.objects.create_user(
            username="parent1",
            email="parent1@example.com",
            first_name="Ada",
            last_name="Obi",
            role="parent",
            password="testpass123",
            tenant=self.tenant,
        )
        self.parent = ParentProfile.objects.create(
            user=self.parent_user, tenant=self.tenant)

        self.own_child = self._make_student("vincent", "Vincent", "Eze")
        self.other_child = self._make_student("ivan", "Ivan", "Bello")

        ParentStudentRelationship.objects.create(
            parent=self.parent,
            student=self.own_child,
            relationship="father",
            tenant=self.tenant,
        )

        self.own_record = self._make_attendance(self.own_child)
        self.other_record = self._make_attendance(self.other_child)

    def _make_student(self, username, first, last):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            first_name=first,
            last_name=last,
            role="student",
            password="testpass123",
            tenant=self.tenant,
        )
        return Student.objects.create(
            user=user,
            gender="M",
            date_of_birth=date(2014, 5, 1),
            section=self.section,
            tenant=self.tenant,
        )

    def _make_attendance(self, student):
        return Attendance.objects.create(
            student=student,
            section=self.section,
            date=date.today(),
            status="P",
            tenant=self.tenant,
        )

    def _list_as_parent(self):
        self.client.force_authenticate(user=self.parent_user)
        return self.client.get(
            reverse("attendance-list"),
            HTTP_X_TENANT_SLUG=self.tenant.slug,
        )

    def test_parent_listing_attendance_does_not_error(self):
        """The regression: this raised AttributeError -> 500."""
        response = self._list_as_parent()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_parent_sees_only_own_children(self):
        response = self._list_as_parent()
        returned_ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(returned_ids, {self.own_record.id})

    def test_get_students_is_tenant_scoped(self):
        """get_students() must not leak a student linked from another tenant."""
        other_tenant = Tenant.objects.create(
            name="Other School",
            slug="other-school",
            status="active",
            is_active=True,
            owner_email="other@example.com",
        )
        foreign_user = User.objects.create_user(
            username="foreign",
            email="foreign@example.com",
            first_name="Foreign",
            last_name="Child",
            role="student",
            password="testpass123",
            tenant=other_tenant,
        )
        foreign_student = Student.objects.create(
            user=foreign_user,
            gender="F",
            date_of_birth=date(2013, 3, 3),
            tenant=other_tenant,
        )
        ParentStudentRelationship.objects.create(
            parent=self.parent,
            student=foreign_student,
            relationship="guardian",
            tenant=self.tenant,
        )

        self.assertEqual(
            list(self.parent.get_students()), [self.own_child])
