# students/management/commands/backfill_student_streams.py
"""
Set Student.stream from the spreadsheet the students were imported from.

Senior secondary students imported before their school's education levels were
recognised as SENIOR_SECONDARY were created with no stream: the importer only
reads the Stream column when it considers a class senior secondary, so the
values in the file were parsed and then discarded.

This re-reads the original upload and fills in what was dropped. It only ever
sets a stream that is currently empty — a stream assigned since the import is
left alone unless --overwrite is passed.

The file is read from the BulkUploadRecord's stored URL, so there is nothing to
copy onto the server; pass --upload-id. A local path or URL works too.
"""

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Backfill Student.stream from the original bulk upload spreadsheet."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Tenant slug.")
        parser.add_argument(
            "--upload-id",
            type=int,
            help=(
                "BulkUploadRecord id. Defaults to the school's most recent "
                "completed student upload."
            ),
        )
        parser.add_argument("--file", help="Local path or URL, instead of --upload-id.")
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Replace streams that are already set.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )

    def handle(self, *args, **options):
        import os

        from students.models import BulkUploadRecord, Student
        from students.tasks import _download_if_url, _parse_file, _resolve_stream
        from tenants.models import Tenant

        try:
            tenant = Tenant.objects.get(slug=options["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant matches '{options['tenant']}'.")

        source = options.get("file")
        if source:
            ext = os.path.splitext(source)[1].lower() or ".xlsx"
        else:
            record = self._resolve_upload(
                BulkUploadRecord, tenant, options.get("upload_id")
            )
            source = record.file_path
            ext = record.file_ext
            self.stdout.write(
                f"Reading upload {record.pk}: {record.original_filename} "
                f"({record.imported_rows} students imported)"
            )

        local_path = _download_if_url(source, ext)
        try:
            rows = _parse_file(local_path, ext)
        finally:
            if local_path != source:
                try:
                    os.unlink(local_path)
                except OSError:
                    pass

        dry_run = options.get("dry_run")
        overwrite = options.get("overwrite")

        updated = already = no_stream = unmatched = unresolved = 0
        unresolved_names = set()

        for row in rows:
            wanted = (row.get("stream") or "").strip()
            if not wanted:
                no_stream += 1
                continue

            student = self._find_student(Student, tenant, row)
            if not student:
                unmatched += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"  no match for {row.get('first_name', '')} "
                        f"{row.get('last_name', '')} "
                        f"(reg {row.get('registration_number') or '—'})"
                    )
                )
                continue

            if student.stream_id and not overwrite:
                already += 1
                continue

            stream = _resolve_stream(tenant.id, wanted)
            if not stream:
                unresolved += 1
                unresolved_names.add(wanted)
                continue

            self.stdout.write(
                f"  {student.user.get_full_name()} "
                f"({student.registration_number or 'no reg'}) -> {stream.name}"
            )
            if not dry_run:
                student.stream = stream
                student.save(update_fields=["stream"])
            updated += 1

        verb = "would set" if dry_run else "set"
        self.stdout.write(self.style.SUCCESS(f"\n{verb} {updated} streams"))
        self.stdout.write(f"{no_stream} rows had no stream value")
        if already:
            self.stdout.write(
                f"{already} students already had a stream (use --overwrite to replace)"
            )
        if unmatched:
            self.stdout.write(
                self.style.WARNING(f"{unmatched} rows matched no student")
            )
        if unresolved:
            self.stdout.write(
                self.style.WARNING(
                    f"{unresolved} rows named a stream this school does not have: "
                    f"{', '.join(sorted(unresolved_names))} — run seed_streams first"
                )
            )

    @staticmethod
    def _resolve_upload(BulkUploadRecord, tenant, upload_id):
        """The named upload, or the school's most recent completed one."""
        if upload_id:
            try:
                return BulkUploadRecord.objects.get(pk=upload_id, tenant=tenant)
            except BulkUploadRecord.DoesNotExist:
                raise CommandError(f"No upload {upload_id} for this school.")

        record = (
            BulkUploadRecord.objects.filter(tenant=tenant, status="completed")
            .order_by("-id")
            .first()
        )
        if not record:
            raise CommandError(
                "This school has no completed student upload — pass --file instead."
            )
        return record

    @staticmethod
    def _find_student(Student, tenant, row):
        """
        Match a spreadsheet row to a student.

        Registration number is the reliable key — it is what the importer wrote.
        Names are the fallback for the row that had no registration number.
        """
        reg = (row.get("registration_number") or "").strip()
        if reg:
            student = Student.objects.filter(
                tenant=tenant, registration_number=reg
            ).select_related("user").first()
            if student:
                return student

        first = (row.get("first_name") or "").strip()
        last = (row.get("last_name") or "").strip()
        if not (first and last):
            return None

        matches = Student.objects.filter(
            tenant=tenant,
            user__first_name__iexact=first,
            user__last_name__iexact=last,
        ).select_related("user")[:2]
        # Only trust a name match when it is unambiguous.
        return matches[0] if len(matches) == 1 else None
