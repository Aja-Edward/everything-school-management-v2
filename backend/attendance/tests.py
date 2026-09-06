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
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

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

from .gate import record_and_notify
from .notifications import deliver
from .tasks import flush_pending_scan_notifications
from .models import (
    AlertPolicy,
    Attendance,
    AttendanceSession,
    AttendanceSettings,
    GateScan,
    NotificationChannel,
    NotificationStatus,
    ParentAlertPreference,
    ScanDirection,
    ScanNotification,
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


class GateScanAPITest(APITestCase):
    """
    The scan endpoint. The scanner sends a UID, a direction and a time;
    everything else is derived here.

    School day for these tests: opens 06:30, late from 08:00, afternoon from
    12:00, dismissal from 14:00, duplicate window 90s — the defaults.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Scan School",
            slug="scan-school",
            status="active",
            is_active=True,
            owner_email="scan@example.com",
        )
        TenantSettings.objects.create(
            tenant=self.tenant, timezone="Africa/Lagos")
        self.settings_row = AttendanceSettings.objects.create(
            tenant=self.tenant)
        self.tz = ZoneInfo("Africa/Lagos")

        self.section = Section.objects.create(name="A", tenant=self.tenant)
        self.gatekeeper = self._user(
            "scan_gate", "Gate", "Keeper", role="teacher")

        self.vincent = self._student("scan_vincent", "Vincent", "Eze")
        self.tag = StudentTag.objects.create(
            tenant=self.tenant, student=self.vincent, uid="04A2241B")

        self.client.force_authenticate(user=self.gatekeeper)

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

    def _student(self, username, first, last, section=True):
        user = self._user(username, first, last, role="student")
        return Student.objects.create(
            user=user,
            gender="M",
            date_of_birth=date(2014, 5, 1),
            section=self.section if section else None,
            tenant=self.tenant,
        )

    def _at(self, hour, minute, day=None):
        """A local school-time moment, as the device would report it."""
        when = day or date.today()
        return datetime(
            when.year, when.month, when.day, hour, minute, tzinfo=self.tz)

    def _headers(self):
        return {"HTTP_X_TENANT_SLUG": self.tenant.slug}

    def _scan(self, direction="in", uid="04A2241B", at=None, **extra):
        payload = {"uid": uid, "direction": direction}
        if at is not None:
            payload["scanned_at"] = at.isoformat()
        payload.update(extra)
        return self.client.post(
            reverse("gatescan-list"), payload, format="json", **self._headers())

    # ── Arrival ───────────────────────────────────────────────────────────────

    def test_entry_before_the_cutoff_is_present(self):
        response = self._scan("in", at=self._at(7, 45))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["student"]["name"], "Vincent Eze")
        self.assertEqual(response.data["session"], AttendanceSession.MORNING)
        self.assertEqual(response.data["status"], "P")
        self.assertEqual(response.data["attendance"]["time_in"], "07:45:00")
        self.assertEqual(response.data["warnings"], [])

    def test_entry_after_the_cutoff_is_late(self):
        response = self._scan("in", at=self._at(8, 15))

        self.assertEqual(response.data["status"], "L")
        self.assertEqual(response.data["attendance"]["status"], "L")
        self.assertIn("late_arrival", response.data["warnings"])

    def test_entry_exactly_on_the_cutoff_is_late(self):
        """The boundary belongs to Late — 08:00 is not before 08:00."""
        response = self._scan("in", at=self._at(8, 0))
        self.assertEqual(response.data["status"], "L")

    def test_entry_before_opening_is_recorded_and_flagged(self):
        """A policy oddity must never cost us the record of a child arriving."""
        response = self._scan("in", at=self._at(5, 30))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("before_opening", response.data["warnings"])
        self.assertIsNotNone(response.data["attendance"])

    def test_afternoon_entry_lands_on_the_afternoon_row(self):
        response = self._scan("in", at=self._at(12, 30))

        self.assertEqual(response.data["session"], AttendanceSession.AFTERNOON)
        self.assertEqual(response.data["status"], "P")

    def test_a_second_entry_does_not_overwrite_the_first_arrival_time(self):
        first = self._scan("in", at=self._at(7, 45))
        # Well outside the duplicate window, so this is a real second scan.
        second = self._scan("in", at=self._at(9, 30))

        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertFalse(second.data["duplicate"])
        self.assertEqual(second.data["attendance"]["time_in"], "07:45:00")
        self.assertEqual(second.data["attendance"]["status"], "P")
        self.assertEqual(
            first.data["attendance"]["id"], second.data["attendance"]["id"])

    # ── Departure ─────────────────────────────────────────────────────────────

    def test_exit_at_dismissal_records_time_out(self):
        self._scan("in", at=self._at(7, 45))
        response = self._scan("out", at=self._at(14, 30))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["attendance"]["time_out"], "14:30:00")
        self.assertNotIn("early_departure", response.data["warnings"])

    def test_exit_before_dismissal_is_flagged_as_early(self):
        self._scan("in", at=self._at(7, 45))
        response = self._scan("out", at=self._at(11, 15))

        self.assertIn("early_departure", response.data["warnings"])

    def test_exit_without_an_entry_is_recorded_and_flagged(self):
        """
        Refusing this would leave no trace of a child leaving the premises,
        which is the worst outcome available. Record it, flag it loudly.
        """
        response = self._scan("out", at=self._at(11, 15))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("exit_without_entry", response.data["warnings"])

    def test_exit_earlier_than_the_entry_does_not_corrupt_the_row(self):
        self._scan("in", at=self._at(13, 0))
        response = self._scan("out", at=self._at(12, 10))

        self.assertIn("exit_before_entry", response.data["warnings"])
        self.assertIsNone(response.data["attendance"]["time_out"])

    # ── Duplicates ────────────────────────────────────────────────────────────

    def test_a_re_tap_inside_the_window_changes_nothing(self):
        """The attendant taps twice, unsure it registered. One arrival."""
        first = self._scan("in", at=self._at(7, 45))
        second = self._scan(
            "in", at=self._at(7, 45) + timedelta(seconds=30))

        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["duplicate"])
        self.assertEqual(
            first.data["attendance"]["id"], second.data["attendance"]["id"])
        self.assertEqual(
            GateScan.objects.filter(is_duplicate=False).count(), 1)

    def test_a_duplicate_is_still_recorded_for_audit(self):
        self._scan("in", at=self._at(7, 45))
        self._scan("in", at=self._at(7, 45) + timedelta(seconds=30))

        self.assertEqual(GateScan.objects.count(), 2)
        self.assertEqual(GateScan.objects.filter(is_duplicate=True).count(), 1)

    def test_taps_in_opposite_directions_are_never_duplicates(self):
        self._scan("in", at=self._at(13, 0))
        response = self._scan(
            "out", at=self._at(13, 0) + timedelta(seconds=20))

        self.assertFalse(response.data["duplicate"])

    def test_a_run_of_taps_collapses_onto_the_first(self):
        base = self._at(7, 45)
        self._scan("in", at=base)
        self._scan("in", at=base + timedelta(seconds=40))
        self._scan("in", at=base + timedelta(seconds=80))

        self.assertEqual(
            GateScan.objects.filter(is_duplicate=False).count(), 1)
        self.assertEqual(GateScan.objects.filter(is_duplicate=True).count(), 2)

    # ── Idempotency ───────────────────────────────────────────────────────────

    def test_replaying_a_client_scan_id_returns_the_stored_scan(self):
        first = self._scan(
            "in", at=self._at(7, 45), client_scan_id="queued-1")
        second = self._scan(
            "in", at=self._at(7, 45), client_scan_id="queued-1")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["replayed"])
        self.assertEqual(second.data["scan"]["id"], first.data["scan"]["id"])
        self.assertEqual(GateScan.objects.count(), 1)

    # ── Failures ──────────────────────────────────────────────────────────────

    def test_an_unenrolled_chip_is_refused(self):
        response = self._scan("in", uid="DEADBEEF", at=self._at(7, 45))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "uid_not_enrolled")
        self.assertEqual(GateScan.objects.count(), 0)

    def test_a_retired_chip_is_refused_distinctly(self):
        self.tag.status = TagStatus.LOST
        self.tag.revoked_at = timezone.now()
        self.tag.save()

        response = self._scan("in", at=self._at(7, 45))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "uid_not_active")

    def test_a_student_with_no_section_gets_a_clear_error(self):
        """Attendance.section is required while Student.section is not."""
        loose = self._student("scan_loose", "Loose", "Child", section=False)
        StudentTag.objects.create(
            tenant=self.tenant, student=loose, uid="FEEDFACE")

        response = self._scan("in", uid="FEEDFACE", at=self._at(7, 45))

        self.assertEqual(
            response.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertEqual(response.data["code"], "student_has_no_section")

    def test_a_chip_from_another_school_is_invisible(self):
        other = Tenant.objects.create(
            name="Rival School", slug="rival-school", status="active",
            is_active=True, owner_email="rival@example.com",
        )
        rival_user = User.objects.create_user(
            username="rival_child", email="rival_child@example.com",
            first_name="Rival", last_name="Child", role="student",
            password="testpass123", is_active=True, tenant=other,
        )
        rival_student = Student.objects.create(
            user=rival_user, gender="F",
            date_of_birth=date(2013, 4, 4), tenant=other)
        StudentTag.objects.create(
            tenant=other, student=rival_student, uid="CAFED00D")

        response = self._scan("in", uid="CAFED00D", at=self._at(7, 45))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "uid_not_enrolled")

    def test_a_bad_direction_is_rejected(self):
        response = self._scan("sideways", at=self._at(7, 45))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_scan_log_cannot_be_edited_over_http(self):
        self._scan("in", at=self._at(7, 45))
        scan_id = GateScan.objects.first().id

        patched = self.client.patch(
            reverse("gatescan-detail", args=[scan_id]),
            {"direction": "out"}, format="json", **self._headers())
        deleted = self.client.delete(
            reverse("gatescan-detail", args=[scan_id]), **self._headers())

        # Refused for two different reasons, both correct: there is no update
        # handler at all, and the teacher bypass grants attendance read and
        # write but never delete.
        self.assertEqual(
            patched.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(deleted.status_code, status.HTTP_403_FORBIDDEN)

        scan = GateScan.objects.get(id=scan_id)
        self.assertEqual(scan.direction, ScanDirection.IN)


class GateScanBatchAPITest(APITestCase):
    """Flushing a queue from a gate that lost connectivity."""

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Batch School",
            slug="batch-school",
            status="active",
            is_active=True,
            owner_email="batch@example.com",
        )
        TenantSettings.objects.create(
            tenant=self.tenant, timezone="Africa/Lagos")
        AttendanceSettings.objects.create(tenant=self.tenant)
        self.tz = ZoneInfo("Africa/Lagos")

        self.section = Section.objects.create(name="A", tenant=self.tenant)
        self.gatekeeper = User.objects.create_user(
            username="batch_gate", email="batch_gate@example.com",
            first_name="Batch", last_name="Gate", role="teacher",
            password="testpass123", is_active=True, tenant=self.tenant,
        )

        self.students = []
        for index in range(3):
            user = User.objects.create_user(
                username=f"batch_child{index}",
                email=f"batch_child{index}@example.com",
                first_name=f"Child{index}", last_name="Batch",
                role="student", password="testpass123",
                is_active=True, tenant=self.tenant,
            )
            student = Student.objects.create(
                user=user, gender="M", date_of_birth=date(2014, 1, 1),
                section=self.section, tenant=self.tenant,
            )
            StudentTag.objects.create(
                tenant=self.tenant, student=student, uid=f"AAAA000{index}")
            self.students.append(student)

        self.client.force_authenticate(user=self.gatekeeper)

    def _at(self, hour, minute):
        today = date.today()
        return datetime(
            today.year, today.month, today.day, hour, minute, tzinfo=self.tz)

    def _flush(self, scans):
        return self.client.post(
            reverse("gatescan-batch"), {"scans": scans}, format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug)

    def test_a_queue_preserves_the_times_the_gate_actually_recorded(self):
        response = self._flush([
            {"uid": "AAAA0000", "direction": "in",
             "scanned_at": self._at(7, 40).isoformat(),
             "client_scan_id": "q-0"},
            {"uid": "AAAA0001", "direction": "in",
             "scanned_at": self._at(8, 20).isoformat(),
             "client_scan_id": "q-1"},
        ])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["recorded"], 2)
        by_index = {row["index"]: row for row in response.data["results"]}
        self.assertEqual(by_index[0]["attendance"]["time_in"], "07:40:00")
        self.assertEqual(by_index[0]["status"], "P")
        # The second child was late when the gate read them, not when we heard.
        self.assertEqual(by_index[1]["status"], "L")

    def test_one_bad_chip_does_not_cost_the_others_their_attendance(self):
        response = self._flush([
            {"uid": "AAAA0000", "direction": "in",
             "scanned_at": self._at(7, 40).isoformat()},
            {"uid": "DEADBEEF", "direction": "in",
             "scanned_at": self._at(7, 41).isoformat()},
            {"uid": "AAAA0002", "direction": "in",
             "scanned_at": self._at(7, 42).isoformat()},
        ])

        self.assertEqual(response.data["summary"]["recorded"], 2)
        self.assertEqual(response.data["summary"]["failed"], 1)

        by_index = {row["index"]: row for row in response.data["results"]}
        self.assertTrue(by_index[0]["ok"])
        self.assertFalse(by_index[1]["ok"])
        self.assertEqual(by_index[1]["code"], "uid_not_enrolled")
        self.assertTrue(by_index[2]["ok"])
        self.assertEqual(Attendance.objects.count(), 2)

    def test_reflushing_the_same_queue_records_nothing_new(self):
        payload = [
            {"uid": "AAAA0000", "direction": "in",
             "scanned_at": self._at(7, 40).isoformat(),
             "client_scan_id": "q-0"},
            {"uid": "AAAA0001", "direction": "in",
             "scanned_at": self._at(7, 41).isoformat(),
             "client_scan_id": "q-1"},
        ]
        self._flush(payload)
        again = self._flush(payload)

        self.assertEqual(again.data["summary"]["replayed"], 2)
        self.assertEqual(again.data["summary"]["recorded"], 0)
        self.assertEqual(GateScan.objects.count(), 2)

    def test_an_empty_batch_is_rejected(self):
        response = self._flush([])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_oversized_batch_is_rejected(self):
        response = self._flush([
            {"uid": "AAAA0000", "direction": "in"} for _ in range(501)
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class NotificationFixtureMixin:
    """A school, a child, two parents, and a chip on the bag."""

    def build(self, alert_policy=AlertPolicy.ALL_SCANS):
        self.tenant = Tenant.objects.create(
            name="Notify School",
            slug="notify-school",
            status="active",
            is_active=True,
            owner_email="notify@example.com",
        )
        TenantSettings.objects.create(
            tenant=self.tenant, timezone="Africa/Lagos")
        self.settings_row = AttendanceSettings.objects.create(
            tenant=self.tenant, alert_policy=alert_policy)
        self.tz = ZoneInfo("Africa/Lagos")

        self.section = Section.objects.create(name="A", tenant=self.tenant)
        self.gatekeeper = self._user("nf_gate", "Gate", "Keeper", "teacher")
        self.vincent = self._student("nf_vincent", "Vincent", "Eze")
        self.tag = StudentTag.objects.create(
            tenant=self.tenant, student=self.vincent, uid="04A2241B")

        self.mother = self._parent("nf_mother", "Ada", "Eze", phone="+2348010000001")
        self._link(self.mother, self.vincent, "mother")

    def _user(self, username, first, last, role, **extra):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            first_name=first,
            last_name=last,
            role=role,
            password="testpass123",
            is_active=True,
            tenant=self.tenant,
            **extra,
        )

    def _student(self, username, first, last):
        user = self._user(username, first, last, "student")
        return Student.objects.create(
            user=user, gender="M", date_of_birth=date(2014, 5, 1),
            section=self.section, tenant=self.tenant,
        )

    def _parent(self, username, first, last, phone=""):
        user = self._user(username, first, last, "parent")
        return ParentProfile.objects.create(
            user=user, phone=phone, tenant=self.tenant)

    def _link(self, parent, student, relationship):
        return ParentStudentRelationship.objects.create(
            parent=parent, student=student,
            relationship=relationship, tenant=self.tenant,
        )

    def _at(self, hour, minute):
        today = date.today()
        return datetime(
            today.year, today.month, today.day, hour, minute, tzinfo=self.tz)

    def _scan(self, direction="in", at=None, uid="04A2241B", **extra):
        return record_and_notify(
            tenant=self.tenant,
            uid=uid,
            direction=direction,
            scanned_at=at or self._at(7, 45),
            scanned_by=self.gatekeeper,
            settings=self.settings_row,
            **extra,
        )


class ScanNotificationQueueingTest(NotificationFixtureMixin, TestCase):
    """What gets queued, for whom, on which channel."""

    def setUp(self):
        self.build()

    def test_an_arrival_queues_in_app_and_email_but_not_sms(self):
        """SMS is opt-in: nobody turns on a five-figure bill by accident."""
        self._scan("in")

        rows = ScanNotification.objects.filter(student=self.vincent)
        channels_used = set(rows.values_list("channel", flat=True))
        self.assertEqual(
            channels_used,
            {NotificationChannel.IN_APP, NotificationChannel.EMAIL},
        )

    def test_in_app_is_delivered_the_moment_it_is_stored(self):
        self._scan("in")

        in_app = ScanNotification.objects.get(
            student=self.vincent, channel=NotificationChannel.IN_APP)
        self.assertEqual(in_app.status, NotificationStatus.SENT)
        self.assertEqual(in_app.provider, "in_app")

    def test_sms_is_queued_once_the_parent_opts_in(self):
        ParentAlertPreference.objects.create(
            parent=self.mother, sms_enabled=True)

        self._scan("in")

        sms = ScanNotification.objects.get(
            student=self.vincent, channel=NotificationChannel.SMS)
        self.assertEqual(sms.destination, "+2348010000001")
        self.assertEqual(sms.status, NotificationStatus.QUEUED)

    def test_a_muted_parent_hears_nothing(self):
        ParentAlertPreference.objects.create(parent=self.mother, muted=True)

        self._scan("in")

        self.assertEqual(ScanNotification.objects.count(), 0)

    def test_every_linked_parent_is_notified(self):
        father = self._parent("nf_father", "Emeka", "Eze")
        self._link(father, self.vincent, "father")

        self._scan("in")

        recipients = set(
            ScanNotification.objects
            .filter(channel=NotificationChannel.EMAIL)
            .values_list("recipient_id", flat=True)
        )
        self.assertEqual(
            recipients, {self.mother.user_id, father.user_id})

    def test_a_parent_at_another_school_is_not_notified(self):
        """The relationship is filtered by tenant, not just the parent."""
        other = Tenant.objects.create(
            name="Elsewhere", slug="elsewhere", status="active",
            is_active=True, owner_email="elsewhere@example.com",
        )
        stranger_user = User.objects.create_user(
            username="nf_stranger", email="nf_stranger@example.com",
            first_name="Stray", last_name="Parent", role="parent",
            password="testpass123", is_active=True, tenant=other,
        )
        stranger = ParentProfile.objects.create(
            user=stranger_user, tenant=other)
        ParentStudentRelationship.objects.create(
            parent=stranger, student=self.vincent,
            relationship="guardian", tenant=other,
        )

        self._scan("in")

        recipients = set(
            ScanNotification.objects.values_list("recipient_id", flat=True))
        self.assertNotIn(stranger.user_id, recipients)

    def test_a_missing_phone_number_is_recorded_not_silently_dropped(self):
        """'We had no number for her' has to be answerable later."""
        silent = self._parent("nf_nophone", "No", "Phone", phone="")
        self._link(silent, self.vincent, "guardian")
        ParentAlertPreference.objects.create(parent=silent, sms_enabled=True)

        self._scan("in")

        row = ScanNotification.objects.get(
            recipient=silent.user, channel=NotificationChannel.SMS)
        self.assertEqual(row.status, NotificationStatus.SKIPPED)
        self.assertIn("No destination", row.error)

    def test_a_duplicate_tap_sends_no_second_message(self):
        self._scan("in", at=self._at(7, 45))
        before = ScanNotification.objects.count()

        self._scan("in", at=self._at(7, 45) + timedelta(seconds=30))

        self.assertEqual(ScanNotification.objects.count(), before)

    def test_a_replayed_offline_scan_sends_no_second_message(self):
        self._scan("in", at=self._at(7, 45), client_scan_id="q-1")
        before = ScanNotification.objects.count()

        self._scan("in", at=self._at(7, 45), client_scan_id="q-1")

        self.assertEqual(ScanNotification.objects.count(), before)

    def test_the_message_says_what_happened(self):
        self._scan("in", at=self._at(7, 45))

        row = ScanNotification.objects.filter(
            channel=NotificationChannel.EMAIL).first()
        self.assertIn("Vincent Eze", row.body)
        self.assertIn("arrived", row.body)
        self.assertIn("07:45", row.body)
        self.assertIn("Notify School", row.body)

    def test_a_late_arrival_says_so(self):
        self._scan("in", at=self._at(8, 30))

        row = ScanNotification.objects.filter(
            channel=NotificationChannel.EMAIL).first()
        self.assertIn("after the start of the school day", row.body)

    def test_an_exit_message_says_left(self):
        self._scan("in", at=self._at(7, 45))
        self._scan("out", at=self._at(14, 30))

        row = (
            ScanNotification.objects
            .filter(channel=NotificationChannel.EMAIL)
            .order_by("-queued_at")
            .first()
        )
        self.assertIn("left school", row.body)
        self.assertIn("14:30", row.body)

    def test_a_broken_alerting_layer_never_costs_us_the_scan(self):
        with patch(
            "attendance.notifications.recipients_for",
            side_effect=RuntimeError("provider config exploded"),
        ):
            outcome = self._scan("in")

        self.assertIsNotNone(outcome.scan.id)
        self.assertIsNotNone(outcome.attendance)
        self.assertEqual(outcome.notifications, [])


class AnomalyOnlyPolicyTest(NotificationFixtureMixin, TestCase):
    """
    The cost control: routine crossings go unmessaged, exceptions do not.
    Roughly a 90% cut in volume, which matters more than the per-message rate.
    """

    def setUp(self):
        self.build(alert_policy=AlertPolicy.ANOMALIES_ONLY)

    def test_a_normal_arrival_sends_nothing(self):
        self._scan("in", at=self._at(7, 45))
        self.assertEqual(ScanNotification.objects.count(), 0)

    def test_a_normal_dismissal_sends_nothing(self):
        self._scan("in", at=self._at(7, 45))
        self._scan("out", at=self._at(14, 30))
        self.assertEqual(ScanNotification.objects.count(), 0)

    def test_an_early_departure_does_notify(self):
        self._scan("in", at=self._at(7, 45))
        self._scan("out", at=self._at(11, 15))

        self.assertTrue(ScanNotification.objects.exists())
        row = ScanNotification.objects.filter(
            channel=NotificationChannel.EMAIL).first()
        self.assertIn("before normal dismissal", row.body)

    def test_an_exit_with_no_arrival_does_notify(self):
        self._scan("out", at=self._at(11, 15))
        self.assertTrue(ScanNotification.objects.exists())

    def test_a_late_arrival_alone_is_not_an_anomaly(self):
        """Lateness is already on the register; it is not a safeguarding event."""
        self._scan("in", at=self._at(8, 30))
        self.assertEqual(ScanNotification.objects.count(), 0)


class NotificationDeliveryTest(NotificationFixtureMixin, TestCase):
    """Handing a queued row to a provider, and recording what came back."""

    def setUp(self):
        self.build()
        ParentAlertPreference.objects.create(
            parent=self.mother, sms_enabled=True, email_enabled=False)
        self._scan("in")
        self.row = ScanNotification.objects.get(
            channel=NotificationChannel.SMS)

    def test_a_successful_send_is_recorded_with_its_provider_id(self):
        with patch(
            "utils.sms.send_sms_via_twilio",
            return_value=(True, "SMS sent successfully", "SM123"),
        ):
            deliver(self.row)

        self.row.refresh_from_db()
        self.assertEqual(self.row.status, NotificationStatus.SENT)
        self.assertEqual(self.row.provider_message_id, "SM123")
        self.assertEqual(self.row.attempts, 1)
        self.assertIsNotNone(self.row.sent_at)

    def test_a_provider_failure_is_recorded_not_raised(self):
        with patch(
            "utils.sms.send_sms_via_twilio",
            return_value=(False, "Twilio is not configured for this school", None),
        ):
            deliver(self.row)

        self.row.refresh_from_db()
        self.assertEqual(self.row.status, NotificationStatus.FAILED)
        self.assertIn("not configured", self.row.error)

    def test_a_provider_exception_is_contained(self):
        with patch(
            "utils.sms.send_sms_via_twilio",
            side_effect=RuntimeError("connection reset"),
        ):
            deliver(self.row)

        self.row.refresh_from_db()
        self.assertEqual(self.row.status, NotificationStatus.FAILED)
        self.assertIn("connection reset", self.row.error)

    def test_delivering_an_already_sent_row_does_not_send_again(self):
        self.row.mark_sent(provider="twilio", message_id="SM1")

        with patch("utils.sms.send_sms_via_twilio") as sender:
            deliver(self.row)

        sender.assert_not_called()

    def test_the_flush_task_picks_up_what_is_still_queued(self):
        with patch(
            "utils.sms.send_sms_via_twilio",
            return_value=(True, "ok", "SM9"),
        ):
            summary = flush_pending_scan_notifications()

        self.row.refresh_from_db()
        self.assertEqual(self.row.status, NotificationStatus.SENT)
        self.assertEqual(summary["sent"], 1)

    def test_the_flush_task_gives_up_after_the_attempt_ceiling(self):
        self.row.attempts = 3
        self.row.status = NotificationStatus.FAILED
        self.row.save()

        with patch("utils.sms.send_sms_via_twilio") as sender:
            flush_pending_scan_notifications()

        sender.assert_not_called()


class ParentNotificationFeedTest(NotificationFixtureMixin, APITestCase):
    """The in-app channel a parent actually reads."""

    def setUp(self):
        self.build()
        self._scan("in")
        self.headers = {"HTTP_X_TENANT_SLUG": self.tenant.slug}

    def test_a_parent_sees_only_their_own_alerts(self):
        stranger = self._parent("nf_other", "Other", "Parent")
        other_child = self._student("nf_other_child", "Other", "Child")
        self._link(stranger, other_child, "mother")
        StudentTag.objects.create(
            tenant=self.tenant, student=other_child, uid="BBBB0001")
        self._scan("in", uid="BBBB0001", at=self._at(7, 50))

        self.client.force_authenticate(user=self.mother.user)
        response = self.client.get(
            reverse("scannotification-list"), **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        recipients = {row["recipient"] for row in response.data["results"]}
        self.assertEqual(recipients, {self.mother.user_id})

    def test_staff_see_the_schools_delivery_log(self):
        self.client.force_authenticate(user=self.gatekeeper)
        response = self.client.get(
            reverse("scannotification-list"), **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data["results"]), 1)

    def test_a_parent_can_mark_an_alert_read(self):
        row = ScanNotification.objects.get(
            recipient=self.mother.user, channel=NotificationChannel.IN_APP)

        self.client.force_authenticate(user=self.mother.user)
        response = self.client.post(
            reverse("scannotification-read", args=[row.id]),
            {}, format="json", **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row.refresh_from_db()
        self.assertIsNotNone(row.read_at)

    def test_unread_count_reflects_what_is_unread(self):
        self.client.force_authenticate(user=self.mother.user)
        before = self.client.get(
            reverse("scannotification-unread-count"), **self.headers)
        self.assertEqual(before.data["unread"], 1)

        row = ScanNotification.objects.get(
            recipient=self.mother.user, channel=NotificationChannel.IN_APP)
        self.client.post(
            reverse("scannotification-read", args=[row.id]),
            {}, format="json", **self.headers)

        after = self.client.get(
            reverse("scannotification-unread-count"), **self.headers)
        self.assertEqual(after.data["unread"], 0)
