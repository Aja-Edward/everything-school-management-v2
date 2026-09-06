"""
Tests for the attendance app.

ParentAttendanceAccessTest pins a regression: `ParentProfile` links
students through the `students` M2M (see parent/models.py), but three
call sites reached for a non-existent `children` attribute, raising
AttributeError — a 500 — for any authenticated parent.

The rest cover the gate-scanning models, where the constraints carry the
design: one active tag per UID per school, UIDs reusable once revoked,
and offline scan batches that cannot replay into duplicate events.
"""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from classroom.models import Section
from parent.models import ParentProfile, ParentStudentRelationship
from students.models import Student
from schoolSettings.models import Permission as SchoolPermission
from schoolSettings.models import Role, UserRole
from tenants.models import Tenant, TenantSettings

from .models import (
    AlertPolicy,
    Attendance,
    AttendanceSettings,
    GateScan,
    ScanDirection,
    StudentTag,
    TagStatus,
    normalize_tag_uid,
)

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
            is_active=True,
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
            is_active=True,
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
            is_active=True,
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


class GateModelFixtureMixin:
    """Shared fixture: one school, one section, two students."""

    def build_school(self):
        self.tenant = Tenant.objects.create(
            name="Gate School",
            slug="gate-school",
            status="active",
            is_active=True,
            owner_email="gate@example.com",
        )
        self.section = Section.objects.create(name="A", tenant=self.tenant)
        self.staff = User.objects.create_user(
            username="gatekeeper",
            email="gatekeeper@example.com",
            first_name="Gate",
            last_name="Keeper",
            role="teacher",
            password="testpass123",
            is_active=True,
            tenant=self.tenant,
        )
        self.vincent = self.make_student("vincent2", "Vincent", "Eze")
        self.ivan = self.make_student("ivan2", "Ivan", "Bello")

    def make_student(self, username, first, last, tenant=None):
        tenant = tenant or self.tenant
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            first_name=first,
            last_name=last,
            role="student",
            password="testpass123",
            is_active=True,
            tenant=tenant,
        )
        return Student.objects.create(
            user=user,
            gender="M",
            date_of_birth=date(2014, 5, 1),
            section=self.section if tenant == self.tenant else None,
            tenant=tenant,
        )


class NormalizeTagUidTest(TestCase):
    """Readers report the same physical tag in several shapes."""

    def test_separators_and_case_collapse_to_one_form(self):
        for raw in ("04:a2:24:1b", "04-A2-24-1B", "04 a2 24 1b", "04a2241b"):
            self.assertEqual(normalize_tag_uid(raw), "04A2241B", raw)

    def test_empty_input(self):
        self.assertEqual(normalize_tag_uid(None), "")
        self.assertEqual(normalize_tag_uid(""), "")


class StudentTagTest(GateModelFixtureMixin, TestCase):
    def setUp(self):
        self.build_school()

    def test_uid_is_normalized_on_save(self):
        tag = StudentTag.objects.create(
            student=self.vincent, uid="04:a2:24:1b", tenant=self.tenant)
        tag.refresh_from_db()
        self.assertEqual(tag.uid, "04A2241B")

    def test_one_active_tag_per_uid_per_school(self):
        StudentTag.objects.create(
            student=self.vincent, uid="04A2241B", tenant=self.tenant)

        with self.assertRaises(IntegrityError):
            StudentTag.objects.create(
                student=self.ivan, uid="04A2241B", tenant=self.tenant)

    def test_revoked_uid_can_be_issued_again(self):
        """A lost bag's chip is retired; the replacement may reuse the UID."""
        old = StudentTag.objects.create(
            student=self.vincent, uid="04A2241B", tenant=self.tenant)
        old.status = TagStatus.REVOKED
        old.revoked_at = timezone.now()
        old.save()

        reissued = StudentTag.objects.create(
            student=self.ivan, uid="04A2241B", tenant=self.tenant)

        self.assertEqual(
            StudentTag.objects.filter(uid="04A2241B").count(), 2)
        self.assertTrue(reissued.is_usable)
        self.assertFalse(old.is_usable)

    def test_same_uid_allowed_in_a_different_school(self):
        """Uniqueness is per tenant — two schools can hold the same UID."""
        StudentTag.objects.create(
            student=self.vincent, uid="04A2241B", tenant=self.tenant)

        other_tenant = Tenant.objects.create(
            name="Other Gate School",
            slug="other-gate-school",
            status="active",
            is_active=True,
            owner_email="other-gate@example.com",
        )
        foreign_student = self.make_student(
            "foreign2", "Foreign", "Child", tenant=other_tenant)

        StudentTag.objects.create(
            student=foreign_student, uid="04A2241B", tenant=other_tenant)

        self.assertEqual(
            StudentTag.objects.filter(uid="04A2241B").count(), 2)


class GateScanTest(GateModelFixtureMixin, TestCase):
    def setUp(self):
        self.build_school()
        self.tag = StudentTag.objects.create(
            student=self.vincent, uid="04A2241B", tenant=self.tenant)

    def _scan(self, **overrides):
        kwargs = {
            "tag": self.tag,
            "uid": self.tag.uid,
            "student": self.vincent,
            "direction": ScanDirection.IN,
            "scanned_at": timezone.now(),
            "scanned_by": self.staff,
            "tenant": self.tenant,
        }
        kwargs.update(overrides)
        return GateScan.objects.create(**kwargs)

    def test_client_scan_id_is_idempotent(self):
        """Replaying a queued offline batch must not duplicate events."""
        self._scan(client_scan_id="abc-123")

        with self.assertRaises(IntegrityError):
            self._scan(client_scan_id="abc-123")

    def test_blank_client_scan_id_does_not_collide(self):
        """The uniqueness is partial: callers may omit the key entirely."""
        self._scan(client_scan_id="")
        self._scan(client_scan_id="")

        self.assertEqual(GateScan.objects.filter(client_scan_id="").count(), 2)

    def test_scan_survives_deletion_of_its_tag(self):
        """uid is denormalized so history stays readable after a tag goes."""
        scan = self._scan()
        self.tag.delete()
        scan.refresh_from_db()

        self.assertIsNone(scan.tag_id)
        self.assertEqual(scan.uid, "04A2241B")
        self.assertEqual(scan.student, self.vincent)

    def test_direction_is_recorded_as_given(self):
        entry = self._scan(direction=ScanDirection.IN, client_scan_id="in-1")
        exit_ = self._scan(direction=ScanDirection.OUT, client_scan_id="out-1")

        self.assertEqual(entry.get_direction_display(), "Entry")
        self.assertEqual(exit_.get_direction_display(), "Exit")


class AttendanceSettingsTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Settings School",
            slug="settings-school",
            status="active",
            is_active=True,
            owner_email="settings@example.com",
        )

    def test_defaults_are_a_coherent_school_day(self):
        settings_row = AttendanceSettings.objects.create(tenant=self.tenant)
        settings_row.full_clean()  # must not raise

        self.assertEqual(settings_row.late_after, time(8, 0))
        self.assertEqual(settings_row.alert_policy, AlertPolicy.ALL_SCANS)
        self.assertEqual(settings_row.duplicate_scan_window_seconds, 90)

    def test_late_cutoff_must_follow_opening(self):
        settings_row = AttendanceSettings(
            tenant=self.tenant,
            morning_opens=time(9, 0),
            late_after=time(8, 0),
        )
        with self.assertRaises(ValidationError) as ctx:
            settings_row.full_clean()
        self.assertIn("late_after", ctx.exception.message_dict)

    def test_afternoon_cannot_begin_before_late_cutoff(self):
        settings_row = AttendanceSettings(
            tenant=self.tenant,
            late_after=time(13, 0),
            afternoon_opens=time(12, 0),
        )
        with self.assertRaises(ValidationError) as ctx:
            settings_row.full_clean()
        self.assertIn("afternoon_opens", ctx.exception.message_dict)

    def test_is_one_row_per_tenant(self):
        """Keyed on tenant, so it cannot become a shared global singleton."""
        AttendanceSettings.objects.create(tenant=self.tenant)

        with self.assertRaises(IntegrityError):
            AttendanceSettings.objects.create(tenant=self.tenant)

    def test_timezone_comes_from_tenant_settings(self):
        TenantSettings.objects.create(
            tenant=self.tenant, timezone="Africa/Accra")
        settings_row = AttendanceSettings.objects.create(tenant=self.tenant)

        self.assertEqual(str(settings_row.tzinfo), "Africa/Accra")

    def test_unknown_timezone_falls_back(self):
        TenantSettings.objects.create(
            tenant=self.tenant, timezone="Not/AZone")
        settings_row = AttendanceSettings.objects.create(tenant=self.tenant)

        self.assertEqual(str(settings_row.tzinfo), "Africa/Lagos")

    def test_missing_tenant_settings_falls_back(self):
        settings_row = AttendanceSettings.objects.create(tenant=self.tenant)

        self.assertEqual(str(settings_row.tzinfo), "Africa/Lagos")


class TagEnrollmentAPITest(APITestCase):
    """
    The enrollment endpoints the scanner app drives.

    Enrollment is gated on students-write, which the teacher bypass in
    ModulePermissionBase does not grant — binding a chip to a child is an
    identity operation. Resolving a chip is gated on attendance access, which
    teachers do have, so a teacher-operated gate works.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Tag School",
            slug="tag-school",
            status="active",
            is_active=True,
            owner_email="tags@example.com",
        )
        self.section = Section.objects.create(name="A", tenant=self.tenant)
        self.other_section = Section.objects.create(name="B", tenant=self.tenant)

        self.admin = self._user("tagadmin", "Tag", "Admin", role="admin")
        self._grant_students_write(self.admin)
        self.teacher = self._user("tagteacher", "Tag", "Teacher", role="teacher")

        self.vincent = self._student("tag_vincent", "Vincent", "Eze")
        self.ivan = self._student("tag_ivan", "Ivan", "Bello")
        self.zainab = self._student(
            "tag_zainab", "Zainab", "Musa", section=self.other_section)

    # ── Fixtures ──────────────────────────────────────────────────────────────

    def _user(self, username, first, last, role):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            first_name=first,
            last_name=last,
            role=role,
            password="testpass123",
            is_active=True,
            tenant=self.tenant,
        )

    def _grant_students_write(self, user):
        perm, _ = SchoolPermission.objects.get_or_create(
            module="students", permission_type="write", section="all",
            defaults={"granted": True},
        )
        attendance_perm, _ = SchoolPermission.objects.get_or_create(
            module="attendance", permission_type="read", section="all",
            defaults={"granted": True},
        )
        role, _ = Role.objects.get_or_create(name="Tag Test Admin")
        role.permissions.add(perm, attendance_perm)
        UserRole.objects.create(user=user, role=role, is_active=True)

    def _student(self, username, first, last, section=None):
        user = self._user(username, first, last, role="student")
        return Student.objects.create(
            user=user,
            gender="M",
            date_of_birth=date(2014, 5, 1),
            section=section or self.section,
            tenant=self.tenant,
        )

    def _as(self, user):
        self.client.force_authenticate(user=user)

    def _headers(self):
        return {"HTTP_X_TENANT_SLUG": self.tenant.slug}

    def _enroll(self, student, uid, **extra):
        payload = {"student": student.id, "uid": uid}
        payload.update(extra)
        return self.client.post(
            reverse("studenttag-list"), payload, format="json", **self._headers())

    # ── Enrollment ────────────────────────────────────────────────────────────

    def test_enroll_normalizes_uid_and_records_who_did_it(self):
        self._as(self.admin)
        response = self._enroll(self.vincent, "04:a2:24:1b", label="blue bag")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["uid"], "04A2241B")
        self.assertEqual(response.data["label"], "blue bag")
        self.assertEqual(response.data["status"], TagStatus.ACTIVE)
        self.assertEqual(response.data["issued_by"], self.admin.id)
        self.assertEqual(
            response.data["student_detail"]["name"], "Vincent Eze")

    def test_enrolling_a_chip_twice_reports_who_holds_it(self):
        """The scanner needs to offer 'reassign?', so the clash is explicit."""
        self._as(self.admin)
        self._enroll(self.vincent, "04A2241B")

        response = self._enroll(self.ivan, "04-a2-24-1b")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "uid_already_assigned")
        self.assertEqual(
            response.data["assigned_to"]["id"], self.vincent.id)

    def test_enrolling_for_a_student_in_another_school_is_refused(self):
        other_tenant = Tenant.objects.create(
            name="Other Tag School",
            slug="other-tag-school",
            status="active",
            is_active=True,
            owner_email="othertags@example.com",
        )
        foreign_user = User.objects.create_user(
            username="foreign_tag",
            email="foreign_tag@example.com",
            first_name="Foreign",
            last_name="Child",
            role="student",
            password="testpass123",
            is_active=True,
            tenant=other_tenant,
        )
        foreign_student = Student.objects.create(
            user=foreign_user,
            gender="F",
            date_of_birth=date(2013, 1, 1),
            tenant=other_tenant,
        )

        self._as(self.admin)
        response = self._enroll(foreign_student, "04A2241B")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "student_not_found")

    def test_rubbish_uid_is_rejected(self):
        self._as(self.admin)
        for bad in ("", "  ", "ZZZZZZZZ", "04A"):
            response = self._enroll(self.vincent, bad)
            self.assertEqual(
                response.status_code, status.HTTP_400_BAD_REQUEST, bad)

    def test_a_teacher_cannot_enroll(self):
        """Binding identity is admin work, not gate-attendant work."""
        self._as(self.teacher)
        response = self._enroll(self.vincent, "04A2241B")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_tags_cannot_be_deleted(self):
        self._as(self.admin)
        tag_id = self._enroll(self.vincent, "04A2241B").data["id"]

        response = self.client.delete(
            reverse("studenttag-detail", args=[tag_id]), **self._headers())

        self.assertEqual(
            response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(response.data["code"], "use_revoke")
        self.assertTrue(StudentTag.objects.filter(id=tag_id).exists())

    # ── Resolve ───────────────────────────────────────────────────────────────

    def test_resolve_returns_the_student_for_an_active_chip(self):
        self._as(self.admin)
        self._enroll(self.vincent, "04A2241B")

        self._as(self.teacher)
        response = self.client.get(
            reverse("studenttag-resolve"), {"uid": "04:a2:24:1b"},
            **self._headers())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["student"]["name"], "Vincent Eze")
        self.assertEqual(response.data["student"]["id"], self.vincent.id)

    def test_resolve_distinguishes_unknown_from_retired(self):
        self._as(self.admin)
        tag_id = self._enroll(self.vincent, "04A2241B").data["id"]

        unknown = self.client.get(
            reverse("studenttag-resolve"), {"uid": "DEADBEEF"},
            **self._headers())
        self.assertEqual(unknown.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(unknown.data["code"], "uid_not_enrolled")

        self.client.post(
            reverse("studenttag-revoke", args=[tag_id]),
            {"status": TagStatus.LOST, "reason": "bag lost"},
            format="json", **self._headers())

        retired = self.client.get(
            reverse("studenttag-resolve"), {"uid": "04A2241B"},
            **self._headers())
        self.assertEqual(retired.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(retired.data["code"], "uid_not_active")

    def test_resolve_requires_a_uid(self):
        self._as(self.admin)
        response = self.client.get(
            reverse("studenttag-resolve"), **self._headers())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "uid_required")

    def test_resolve_cannot_see_another_schools_chip(self):
        other_tenant = Tenant.objects.create(
            name="Third School",
            slug="third-school",
            status="active",
            is_active=True,
            owner_email="third@example.com",
        )
        foreign_user = User.objects.create_user(
            username="third_child", email="third_child@example.com",
            first_name="Third", last_name="Child", role="student",
            password="testpass123", tenant=other_tenant,
        )
        foreign_student = Student.objects.create(
            user=foreign_user, gender="M",
            date_of_birth=date(2013, 2, 2), tenant=other_tenant,
        )
        StudentTag.objects.create(
            tenant=other_tenant, student=foreign_student, uid="CAFEBABE")

        self._as(self.admin)
        response = self.client.get(
            reverse("studenttag-resolve"), {"uid": "CAFEBABE"},
            **self._headers())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "uid_not_enrolled")

    # ── Revoke and re-issue ───────────────────────────────────────────────────

    def test_revoke_then_reuse_the_same_uid(self):
        self._as(self.admin)
        tag_id = self._enroll(self.vincent, "04A2241B").data["id"]

        revoked = self.client.post(
            reverse("studenttag-revoke", args=[tag_id]),
            {"reason": "chip damaged"}, format="json", **self._headers())
        self.assertEqual(revoked.status_code, status.HTTP_200_OK)
        self.assertEqual(revoked.data["status"], TagStatus.REVOKED)
        self.assertEqual(revoked.data["revoked_by"], self.admin.id)

        reissued = self._enroll(self.ivan, "04A2241B")
        self.assertEqual(reissued.status_code, status.HTTP_201_CREATED)

    def test_revoking_twice_is_refused(self):
        self._as(self.admin)
        tag_id = self._enroll(self.vincent, "04A2241B").data["id"]
        url = reverse("studenttag-revoke", args=[tag_id])
        self.client.post(url, {}, format="json", **self._headers())

        response = self.client.post(url, {}, format="json", **self._headers())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "tag_not_active")

    # ── Reassign ──────────────────────────────────────────────────────────────

    def test_reassign_moves_a_chip_and_retires_the_old_binding(self):
        self._as(self.admin)
        old_id = self._enroll(self.vincent, "04A2241B").data["id"]

        response = self.client.post(
            reverse("studenttag-reassign"),
            {"uid": "04A2241B", "student": self.ivan.id,
             "reason": "chip was on the wrong bag"},
            format="json", **self._headers())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["student"], self.ivan.id)

        old = StudentTag.objects.get(id=old_id)
        self.assertEqual(old.status, TagStatus.REVOKED)
        self.assertEqual(old.revoke_reason, "chip was on the wrong bag")
        self.assertEqual(
            StudentTag.objects.filter(
                uid="04A2241B", status=TagStatus.ACTIVE).count(),
            1,
        )

    def test_reassign_to_the_current_holder_is_a_no_op_error(self):
        self._as(self.admin)
        self._enroll(self.vincent, "04A2241B")

        response = self.client.post(
            reverse("studenttag-reassign"),
            {"uid": "04A2241B", "student": self.vincent.id},
            format="json", **self._headers())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "already_assigned_to_student")

    def test_reassign_an_unenrolled_uid_just_enrolls_it(self):
        self._as(self.admin)
        response = self.client.post(
            reverse("studenttag-reassign"),
            {"uid": "FEEDFACE", "student": self.vincent.id},
            format="json", **self._headers())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["uid"], "FEEDFACE")

    # ── Roster ────────────────────────────────────────────────────────────────

    def test_roster_counts_cover_the_whole_section(self):
        self._as(self.admin)
        self._enroll(self.vincent, "04A2241B")

        response = self.client.get(
            reverse("studenttag-roster"), {"section": self.section.id},
            **self._headers())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["counts"],
                         {"total": 2, "enrolled": 1, "unenrolled": 1})
        self.assertEqual(response.data["section"]["name"], "A")

    def test_roster_can_list_only_the_students_still_outstanding(self):
        self._as(self.admin)
        self._enroll(self.vincent, "04A2241B")

        response = self.client.get(
            reverse("studenttag-roster"),
            {"section": self.section.id, "enrolled": "false"},
            **self._headers())

        returned = {row["id"] for row in response.data["results"]}
        self.assertEqual(returned, {self.ivan.id})
        # Counts still describe the section, so progress stays visible.
        self.assertEqual(response.data["counts"]["total"], 2)

    def test_roster_row_carries_the_students_tags(self):
        self._as(self.admin)
        self._enroll(self.vincent, "04A2241B", label="blue bag")

        response = self.client.get(
            reverse("studenttag-roster"),
            {"section": self.section.id, "enrolled": "true"},
            **self._headers())

        row = response.data["results"][0]
        self.assertTrue(row["is_enrolled"])
        self.assertEqual(row["tags"][0]["uid"], "04A2241B")
        self.assertEqual(row["tags"][0]["label"], "blue bag")

    def test_roster_rejects_a_section_from_another_school(self):
        other_tenant = Tenant.objects.create(
            name="Fourth School",
            slug="fourth-school",
            status="active",
            is_active=True,
            owner_email="fourth@example.com",
        )
        foreign_section = Section.objects.create(
            name="Z", tenant=other_tenant)

        self._as(self.admin)
        response = self.client.get(
            reverse("studenttag-roster"), {"section": foreign_section.id},
            **self._headers())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "section_not_found")

    def test_roster_is_not_narrowed_by_the_callers_own_section(self):
        """A gate is school-wide: every child must be listable."""
        self._as(self.admin)
        response = self.client.get(
            reverse("studenttag-roster"), **self._headers())

        returned = {row["id"] for row in response.data["results"]}
        self.assertEqual(
            returned, {self.vincent.id, self.ivan.id, self.zainab.id})
