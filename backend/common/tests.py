from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from common.tasks import purge_expired_bulk_upload_passwords
from teacher.models import BulkUploadRecord as TeacherUpload
from students.models import BulkUploadRecord as StudentUpload
from parent.models import BulkUploadRecord as ParentUpload
from tenants.models import Tenant


class PurgeExpiredBulkUploadPasswordsTest(TestCase):
    """
    Credential sheets expire; the import history does not.

    The passwords are kept so an admin can download the sheet after an async
    import finishes. Keeping them for ever turns one database leak into a
    working password for every account ever imported, so they age out.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Purge School",
            slug="purge-school",
            status="active",
            is_active=True,
            owner_email="purge@example.com",
        )

    def _payload(self):
        return {
            "imported": [
                {"row": 1, "full_name": "Ada Obi", "username": "TCH/001",
                 "password": "hunter2", "email": "ada@example.com"},
                {"row": 2, "full_name": "Bola Eze", "username": "TCH/002",
                 "password": "swordfish", "email": "bola@example.com"},
            ],
            "errors": [{"row": 3, "errors": ["Missing email"]}],
            "summary": {"imported": 2, "failed": 1},
        }

    def _record(self, model, *, age_days):
        record = model.objects.create(
            tenant=self.tenant,
            original_filename="upload.xlsx",
            file_path="/tmp/upload.xlsx",
            file_ext=".xlsx",
            status="completed",
            imported_rows=2,
            failed_rows=1,
            result_data=self._payload(),
        )
        # created_at is auto_now_add, so age it with a direct update.
        model.objects.filter(pk=record.pk).update(
            created_at=timezone.now() - timedelta(days=age_days))
        record.refresh_from_db()
        return record

    # ── What it removes ───────────────────────────────────────────────────────

    @override_settings(BULK_UPLOAD_PASSWORD_RETENTION_DAYS=7)
    def test_passwords_older_than_the_window_are_removed(self):
        record = self._record(TeacherUpload, age_days=30)

        result = purge_expired_bulk_upload_passwords()

        record.refresh_from_db()
        rows = record.result_data["imported"]
        self.assertFalse(any("password" in row for row in rows))
        self.assertEqual(result["passwords"], 2)
        self.assertEqual(result["records"], 1)

    @override_settings(BULK_UPLOAD_PASSWORD_RETENTION_DAYS=7)
    def test_the_rest_of_the_record_survives(self):
        """Only the secret goes; what was imported and what failed stays."""
        record = self._record(TeacherUpload, age_days=30)

        purge_expired_bulk_upload_passwords()

        record.refresh_from_db()
        rows = record.result_data["imported"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["full_name"], "Ada Obi")
        self.assertEqual(rows[0]["username"], "TCH/001")
        self.assertEqual(record.result_data["errors"][0]["errors"], ["Missing email"])
        self.assertEqual(record.result_data["summary"]["imported"], 2)

    @override_settings(BULK_UPLOAD_PASSWORD_RETENTION_DAYS=7)
    def test_a_marker_is_left_so_the_ui_can_explain_itself(self):
        record = self._record(TeacherUpload, age_days=30)

        purge_expired_bulk_upload_passwords()

        record.refresh_from_db()
        self.assertIn("passwords_purged_at", record.result_data)

    # ── What it leaves alone ──────────────────────────────────────────────────

    @override_settings(BULK_UPLOAD_PASSWORD_RETENTION_DAYS=7)
    def test_a_recent_upload_keeps_its_credentials(self):
        """
        The reason the window is not zero: an admin who loses the download
        needs a way back that is not resetting every account.
        """
        record = self._record(TeacherUpload, age_days=1)

        result = purge_expired_bulk_upload_passwords()

        record.refresh_from_db()
        rows = record.result_data["imported"]
        self.assertTrue(all("password" in row for row in rows))
        self.assertEqual(result["records"], 0)

    @override_settings(BULK_UPLOAD_PASSWORD_RETENTION_DAYS=7)
    def test_running_twice_changes_nothing_the_second_time(self):
        self._record(TeacherUpload, age_days=30)

        first = purge_expired_bulk_upload_passwords()
        second = purge_expired_bulk_upload_passwords()

        self.assertEqual(first["records"], 1)
        self.assertEqual(second["records"], 0)

    # ── Every upload flow, not just teachers ──────────────────────────────────

    @override_settings(BULK_UPLOAD_PASSWORD_RETENTION_DAYS=7)
    def test_student_and_parent_uploads_are_covered_too(self):
        """
        All three flows write a password into result_data. A fix that only
        covered teachers would leave the same hole open for pupils and parents.
        """
        self._record(TeacherUpload, age_days=30)
        self._record(StudentUpload, age_days=30)
        self._record(ParentUpload, age_days=30)

        result = purge_expired_bulk_upload_passwords()

        self.assertEqual(result["records"], 3)
        self.assertEqual(result["passwords"], 6)
        for model in (TeacherUpload, StudentUpload, ParentUpload):
            rows = model.objects.get().result_data["imported"]
            self.assertFalse(any("password" in row for row in rows))

    @override_settings(BULK_UPLOAD_PASSWORD_RETENTION_DAYS=7)
    def test_a_record_with_no_imported_rows_is_ignored(self):
        record = TeacherUpload.objects.create(
            tenant=self.tenant,
            original_filename="failed.xlsx",
            file_path="/tmp/failed.xlsx",
            file_ext=".xlsx",
            status="failed",
            result_data={"errors": [], "summary": {}},
        )
        TeacherUpload.objects.filter(pk=record.pk).update(
            created_at=timezone.now() - timedelta(days=30))

        result = purge_expired_bulk_upload_passwords()

        self.assertEqual(result["records"], 0)
