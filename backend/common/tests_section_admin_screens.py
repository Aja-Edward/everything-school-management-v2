"""
A school makes one of its admins a section admin on the admin list, and from
then on that admin's screens show their section and nothing else.

Edward asked for the section-admin feature to be checked end to end, so that
any school can turn any of its admins into one. These follow that path: the
owner assigns the section through the admin list's endpoint, then the admin
opens the lists their dashboard is built from.
"""
from datetime import date

from django.urls import reverse
from rest_framework.test import APITestCase

from academics.models import EducationLevel
from assignment.tests import School
from classroom.models import Class, Classroom, Section


def _ids(response):
    body = response.data
    rows = body["results"] if isinstance(body, dict) and "results" in body else body
    return {row["id"] for row in rows}


class SectionAdminScreensTest(APITestCase):
    def setUp(self):
        # School() has two JSS classes with their teachers, pupils and parents.
        s = self.school = School("screens-school")
        for child, classroom in ((s.jss1_child, s.jss1), (s.jss2_child, s.jss2)):
            child.student_class = classroom.section.class_grade
            child.save()

        # Add a Primary 4 class with its own teacher, pupil and parent.
        primary, _ = EducationLevel.objects.get_or_create(
            tenant=s.tenant, level_type="PRIMARY",
            defaults={"name": "Primary", "code": "pri"},
        )
        grade = Class.objects.create(
            tenant=s.tenant, name="Primary 4", code="screens-p4",
            education_level=primary, grade_number=4, order=4,
        )
        section = Section.objects.create(tenant=s.tenant, class_grade=grade, name="A")
        self.p4 = Classroom.objects.create(
            tenant=s.tenant, name="Primary 4", section=section,
            academic_session=s.jss1.academic_session, term=s.jss1.term,
        )
        self.p4_teacher = s.teacher("p4")
        s.teaches(self.p4_teacher, self.p4, s.maths)
        self.p4_child = s.student("chidi")
        self.p4_child.student_class = grade
        self.p4_child.save()
        s.enrol(self.p4_child, self.p4)
        self.p4_parent = s.parent("chidi_mum", self.p4_child)

        self.owner = s.user("owner", "superadmin", is_staff=True)
        self.head = s.user("head", "admin", is_staff=True)

    def _as(self, user):
        self.client.force_authenticate(user)
        return {"format": "json", "HTTP_X_TENANT_SLUG": self.school.slug}

    def _make_section_admin(self, role):
        response = self.client.patch(
            reverse("authentication:delete-admin", args=[self.head.pk]),
            {"role": role}, **self._as(self.owner),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.head.refresh_from_db()

    def _get(self, path):
        response = self.client.get(path, **self._as(self.head))
        self.assertEqual(response.status_code, 200, getattr(response, "data", response))
        return _ids(response)

    def test_before_the_owner_assigns_a_section_the_admin_sees_every_section(self):
        s = self.school

        self.assertTrue({s.jss1.id, s.jss2.id, self.p4.id} <= self._get("/api/classrooms/classrooms/"))
        self.assertTrue(
            {s.jss1_child.id, self.p4_child.id} <= self._get("/api/students/students/")
        )

    def test_a_primary_admin_lists_only_primary_classes(self):
        self._make_section_admin("primary_admin")

        self.assertEqual(self._get("/api/classrooms/classrooms/"), {self.p4.id})

    def test_a_primary_admin_lists_only_primary_sections(self):
        self._make_section_admin("primary_admin")

        self.assertEqual(
            self._get("/api/classrooms/sections/"), {self.p4.section_id}
        )

    def test_a_primary_admin_lists_only_primary_pupils(self):
        self._make_section_admin("primary_admin")

        self.assertEqual(self._get("/api/students/students/"), {self.p4_child.id})

    def test_a_primary_admin_lists_only_primary_teachers(self):
        self._make_section_admin("primary_admin")

        teachers = self._get("/api/teachers/teachers/")

        self.assertIn(self.p4_teacher.id, teachers)
        self.assertNotIn(self.school.jss2_teacher.id, teachers)
        self.assertNotIn(self.school.maths_teacher.id, teachers)

    def test_a_primary_admin_lists_only_primary_parents(self):
        self._make_section_admin("primary_admin")

        self.assertEqual(self._get("/api/parents/"), {self.p4_parent.id})

    def test_a_secondary_admin_sees_the_jss_side_only(self):
        s = self.school
        self._make_section_admin("secondary_admin")

        self.assertEqual(self._get("/api/classrooms/classrooms/"), {s.jss1.id, s.jss2.id})
        self.assertEqual(
            self._get("/api/students/students/"), {s.jss1_child.id, s.jss2_child.id}
        )

    def test_a_section_admin_cannot_open_another_sections_pupil(self):
        self._make_section_admin("primary_admin")

        response = self.client.get(
            f"/api/students/students/{self.school.jss1_child.id}/", **self._as(self.head)
        )

        self.assertEqual(response.status_code, 404)

    def test_a_section_admin_is_kept_off_whole_school_screens(self):
        self._make_section_admin("primary_admin")

        response = self.client.get(reverse("authentication:list-admins"), **self._as(self.head))

        self.assertEqual(response.status_code, 403)

    def test_turned_back_into_a_school_admin_they_see_everything_again(self):
        s = self.school
        self._make_section_admin("primary_admin")
        self._make_section_admin("admin")

        self.assertTrue({s.jss1.id, self.p4.id} <= self._get("/api/classrooms/classrooms/"))
