"""
Section admins use the admin screens their section needs, and no more.

They used to be made staff, which let them through every staff-only endpoint
for the whole school. Now they are not staff, so each endpoint they need lets
them in by role and limits what it touches to their section.
"""
import csv
import os
import tempfile
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from common.admin_access import IsSchoolOrSectionAdmin, is_whole_school_staff
from common.education_levels import expand_tokens
from tenants.models import Tenant

User = get_user_model()


def _school(slug):
    return Tenant.objects.create(
        name=slug.replace("-", " ").title(), slug=slug, status="active",
        is_active=True, owner_email=f"{slug}@example.com",
    )


def _user(name, role, tenant, **extra):
    # password=None: hashing costs seconds per user and nobody logs in.
    return User.objects.create_user(
        username=name, email=f"{name}@example.com", first_name=name,
        last_name="User", role=role, password=None, is_active=True,
        tenant=tenant, **extra,
    )


class WhoCountsAsWholeSchoolTest(APITestCase):
    def setUp(self):
        self.school = _school("rank-school")

    def test_the_staff_flag_does_not_widen_a_section_admin(self):
        section_admin = _user("staff-primary", "primary_admin", self.school, is_staff=True)

        self.assertFalse(is_whole_school_staff(section_admin))

    def test_a_school_admin_is_still_whole_school(self):
        admin = _user("school-admin", "admin", self.school, is_staff=True)

        self.assertTrue(is_whole_school_staff(admin))

    def _allowed(self, user, school):
        request = SimpleNamespace(user=user, tenant=school)
        return IsSchoolOrSectionAdmin().has_permission(request, None)

    def test_a_section_admin_is_let_into_their_own_school(self):
        self.assertTrue(self._allowed(_user("primary", "primary_admin", self.school), self.school))

    def test_but_not_into_another(self):
        other = _school("rank-other")

        self.assertFalse(self._allowed(_user("primary", "primary_admin", self.school), other))

    def test_a_teacher_is_not_an_admin(self):
        self.assertFalse(self._allowed(_user("teacher", "teacher", self.school), self.school))


class UploadDownloadsStayInTheirSchoolTest(APITestCase):
    """
    The template, credential export and error report downloads read the JWT
    themselves, outside DRF, and never checked the user belonged to the
    school named in the request. A staff user of one school could name
    another's slug and download that school's credential sheet.
    """

    def setUp(self):
        from students.models import BulkUploadRecord

        self.school = _school("sheet-school")
        self.other = _school("sheet-other")
        self.owner = _user("sheet-owner", "superadmin", self.school, is_staff=True)
        self.outsider = _user("sheet-outsider", "superadmin", self.other, is_staff=True)
        self.section_admin = _user("sheet-primary", "primary_admin", self.school)
        self.record = BulkUploadRecord.objects.create(
            tenant=self.school, uploaded_by=self.owner,
            original_filename="pupils.xlsx", file_path="/tmp/pupils.xlsx",
            file_ext=".xlsx", status="completed", imported_rows=1,
            result_data={"imported": [{
                "row": 2, "full_name": "Ada Obi", "username": "STU/001",
                "password": "secret-pass", "registration_number": "R1",
            }], "errors": [], "summary": {"total": 1, "imported": 1, "skipped": 0}},
        )

    def _export(self, user):
        token = str(RefreshToken.for_user(user).access_token)
        return self.client.post(
            reverse("student-export-credentials", args=[self.record.pk]),
            {"format": "csv"}, format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_TENANT_SLUG=self.school.slug,
        )

    def test_the_schools_own_admin_downloads_the_sheet(self):
        response = self._export(self.owner)

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"secret-pass", response.content)

    def test_another_schools_admin_gets_nothing(self):
        response = self._export(self.outsider)

        self.assertNotEqual(response.status_code, 200)
        self.assertNotIn(b"secret-pass", response.content)

    def test_a_section_admin_cannot_download_someone_elses_upload(self):
        response = self._export(self.section_admin)

        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"secret-pass", response.content)

    def test_a_section_admin_sees_the_status_of_their_own_upload_only(self):
        from students.models import BulkUploadRecord

        own = BulkUploadRecord.objects.create(
            tenant=self.school, uploaded_by=self.section_admin,
            original_filename="mine.xlsx", file_path="/tmp/mine.xlsx",
            file_ext=".xlsx", status="completed",
        )
        self.client.force_authenticate(self.section_admin)

        def status_of(record):
            return self.client.get(
                reverse("student-bulk-upload-status", args=[record.pk]),
                HTTP_X_TENANT_SLUG=self.school.slug,
            ).status_code

        self.assertEqual(status_of(own), 200)
        self.assertEqual(status_of(self.record), 404)


def _write_csv(rows):
    handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8")
    with handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return handle.name


class SectionAdminImportsStayInTheirSectionTest(APITestCase):
    """A section admin's bulk import only creates people in their section."""

    def setUp(self):
        from academics.models import EducationLevel

        self.school = _school("import-school")
        self.primary_admin = _user("import-primary", "primary_admin", self.school)
        levels = EducationLevel.objects.filter(tenant=self.school)
        self.nursery = levels.filter(level_type__in=expand_tokens(["NURSERY"])).first()
        self.primary = levels.filter(level_type__in=expand_tokens(["PRIMARY"])).first()
        self.assertIsNotNone(self.nursery, "school seeding should create a Nursery level")
        self.assertIsNotNone(self.primary, "school seeding should create a Primary level")

    def _run_teacher_import(self, rows):
        from teacher.models import BulkUploadRecord
        from teacher.tasks import process_bulk_teacher_upload

        path = _write_csv(rows)
        self.addCleanup(os.unlink, path)
        record = BulkUploadRecord.objects.create(
            tenant=self.school, uploaded_by=self.primary_admin,
            original_filename="t.csv", file_path=path, file_ext=".csv",
        )
        with mock.patch("teacher.tasks._notify_admin"):
            process_bulk_teacher_upload(
                upload_record_id=record.pk, tenant_id=str(self.school.id),
                file_path=path, file_ext=".csv", uploaded_by_id=self.primary_admin.pk,
            )
        record.refresh_from_db()
        return record

    def _teacher_row(self, employee_id, level):
        return {
            "Employee ID": employee_id, "First Name": "Tee", "Last Name": employee_id,
            "Email": f"{employee_id.lower()}@example.com", "Phone Number": "08012345678",
            "Staff Type": "Teaching", "Level": level, "Qualification": "B.Ed",
            "Specialization": "Maths", "Hire Date": "2026-01-10",
        }

    def test_a_teacher_for_another_section_is_refused(self):
        record = self._run_teacher_import([self._teacher_row("EMP-N", self.nursery.name)])

        self.assertEqual(record.imported_rows, 0)
        self.assertIn("not in your section", str(record.result_data["errors"]))

    def test_a_teacher_with_no_level_joins_the_admins_own_section(self):
        from teacher.models import Teacher

        record = self._run_teacher_import([self._teacher_row("EMP-P", "")])

        self.assertEqual(record.imported_rows, 1, record.result_data.get("errors"))
        teacher = Teacher.objects.get(employee_id="EMP-P", tenant=self.school)
        self.assertEqual(list(teacher.education_levels.all()), [self.primary])

    def test_a_pupil_for_another_sections_class_is_refused(self):
        from classroom.models import Class, Section
        from students.models import BulkUploadRecord
        from students.tasks import process_bulk_student_upload

        nursery_class = Class.objects.create(
            tenant=self.school, name="Test Nursery", code="TNUR",
            education_level=self.nursery, grade_number=1, order=1,
        )
        Section.objects.create(tenant=self.school, class_grade=nursery_class, name="Gold")
        # The import requires the parent to exist already; the row must fail
        # on its section, not on anything else.
        from parent.models import ParentProfile

        ParentProfile.objects.create(
            user=_user("import-parent", "parent", self.school),
            tenant=self.school, phone="08011112222",
        )
        path = _write_csv([{
            "First Name": "Ada", "Last Name": "Obi", "Gender": "Female",
            "Date of Birth": "2021-03-04", "Classroom": "Test Nursery - Gold",
            "Parent Phone": "08011112222", "Parent/Guardian Name": "Mrs Obi",
            "Parent/Guardian Role": "Mother", "Address": "1 Road",
            "Admission Date": "2026-01-10", "Year Admitted": "2026",
        }])
        self.addCleanup(os.unlink, path)
        record = BulkUploadRecord.objects.create(
            tenant=self.school, uploaded_by=self.primary_admin,
            original_filename="p.csv", file_path=path, file_ext=".csv",
        )

        with mock.patch("students.tasks._notify_admin"):
            process_bulk_student_upload(
                upload_record_id=record.pk, tenant_id=self.school.id,
                file_path=path, file_ext=".csv", uploaded_by_id=self.primary_admin.pk,
            )

        record.refresh_from_db()
        self.assertEqual(record.imported_rows, 0)
        self.assertIn("not in your section", str(record.result_data["errors"]))


class MessagingStaysInTheSchoolTest(APITestCase):
    """
    The compose screen listed every active user on the platform, names and
    emails, to anyone signed in, and a message could go to any user id.
    Section admins were refused messaging altogether.
    """

    def setUp(self):
        self.school = _school("message-school")
        self.other = _school("message-other")
        self.primary_admin = _user("message-primary", "primary_admin", self.school)
        self.colleague = _user("message-colleague", "teacher", self.school)
        self.stranger = _user("message-stranger", "teacher", self.other)
        self.client.force_authenticate(self.primary_admin)
        self.headers = {"HTTP_X_TENANT_SLUG": self.school.slug}

    def test_the_recipient_list_is_the_senders_school(self):
        response = self.client.get(reverse("message-users"), **self.headers)

        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.json()}
        self.assertIn(self.colleague.pk, ids)
        self.assertNotIn(self.stranger.pk, ids)

    def test_a_section_admin_messages_a_colleague(self):
        response = self.client.post(
            reverse("message-list"),
            {"recipient": self.colleague.pk, "subject": "Hi", "content": "Staff meeting"},
            format="json", **self.headers,
        )

        self.assertEqual(response.status_code, 201, response.content)

    def test_but_not_someone_at_another_school(self):
        response = self.client.post(
            reverse("message-list"),
            {"recipient": self.stranger.pk, "subject": "Hi", "content": "Hello"},
            format="json", **self.headers,
        )

        self.assertEqual(response.status_code, 400)


class SectionAdminEditsTheirPupilsTest(APITestCase):
    """Student edits were staff-only; a section admin may edit their own pupils."""

    def setUp(self):
        from datetime import date

        from academics.models import EducationLevel
        from classroom.models import Class
        from students.models import Student

        self.school = _school("pupil-school")
        levels = EducationLevel.objects.filter(tenant=self.school)
        primary = levels.filter(level_type__in=expand_tokens(["PRIMARY"])).first()
        nursery = levels.filter(level_type__in=expand_tokens(["NURSERY"])).first()
        self.primary_class = Class.objects.create(
            tenant=self.school, name="Test Primary", code="TPRI",
            education_level=primary, grade_number=1, order=1,
        )
        self.nursery_class = Class.objects.create(
            tenant=self.school, name="Test Nursery", code="TNUR",
            education_level=nursery, grade_number=1, order=1,
        )
        self.pupil = Student.objects.create(
            user=_user("pupil-kid", "student", self.school), gender="M",
            date_of_birth=date(2018, 1, 1), student_class=self.primary_class,
            tenant=self.school,
        )
        self.client.force_authenticate(_user("pupil-primary", "primary_admin", self.school))
        self.headers = {"format": "json", "HTTP_X_TENANT_SLUG": self.school.slug}

    def _patch(self, data):
        return self.client.patch(
            f"/api/students/students/{self.pupil.pk}/", data, **self.headers
        )

    def test_a_section_admin_edits_their_own_pupil(self):
        response = self._patch({"address": "2 New Road"})

        self.assertEqual(response.status_code, 200, response.content)

    def test_but_cannot_move_them_into_another_section(self):
        # parent_contact: a nursery pupil needs one, and the move must fail on
        # its section, not on that.
        response = self._patch({"student_class": self.nursery_class.pk, "parent_contact": "08011112222"})

        self.assertEqual(response.status_code, 403, response.content)
        self.pupil.refresh_from_db()
        self.assertEqual(self.pupil.student_class, self.primary_class)
