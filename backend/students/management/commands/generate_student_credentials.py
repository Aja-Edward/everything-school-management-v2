"""
Management command: generate_student_credentials

Regenerates login credentials (new random passwords) for every Student
belonging to a given tenant, and writes them to a CSV file.

Place this file at:
    <your_app>/management/commands/generate_student_credentials.py

Usage (tenant slug is preferred — unique and unambiguous; name also works):
    python manage.py generate_student_credentials --tenant "kebi-international-academy" --output credentials.csv
    python manage.py generate_student_credentials --tenant "Kebi International Academy" --output credentials.csv

NOTE ON WHY THIS IS A RESET, NOT A RECOVERY:
Django stores password hashes, never plaintext. If the CSV you downloaded
after bulk upload is gone, there is no way to recover the original
passwords — they genuinely don't exist anywhere anymore. This command
generates NEW passwords and sets them on the user accounts, so every
affected student will need to use the new password going forward.

SECURITY NOTES:
- The output CSV contains plaintext passwords. Treat it like a secret:
  don't email it unencrypted, don't commit it to git, delete it after
  distributing credentials, and ideally distribute passwords out-of-band
  (e.g. printed slips, one-to-one) rather than as a single shared file.
- Consider forcing a password change on first login if your CustomUser
  model / auth flow supports a "must_change_password" style flag.

IF YOU'RE ON SUPABASE:
If this command drops mid-run with
"OperationalError: consuming input failed: server closed the connection
unexpectedly", you are very likely pointed at the transaction pooler
(port 6543). That pooler is built for short, isolated queries — a script
that runs 100+ sequential saves over one connection is a bad fit for it
and can get dropped. Point DATABASE_URL at the session pooler or the
direct connection (port 5432) for commands like this one, then switch
back for normal app traffic if you prefer the transaction pooler there.

This version is also resumable: it commits and writes each student's row
individually (not in one giant transaction), retries once on a dropped
connection, and skips students who already got a row in the output file
on a previous run — so a network blip costs you one row, not the batch.
"""

import csv
import os
import secrets
import string
import time

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction, close_old_connections, OperationalError

from students.models import Student
from tenants.models import Tenant

User = get_user_model()  # resolves to users.CustomUser


def generate_password(length=10):
    """Generate a readable-ish random password (avoids ambiguous chars)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


class Command(BaseCommand):
    help = "Regenerate and export login credentials for all students in a tenant/school."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            required=True,
            help="Tenant name or slug to match (e.g. 'Kebi International Academy')",
        )
        parser.add_argument(
            "--output",
            default="student_credentials.csv",
            help="Path to write the CSV of new credentials",
        )
        parser.add_argument(
            "--active-only",
            action="store_true",
            default=True,
            help="Only regenerate credentials for active students (default: True)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview how many accounts would be affected without changing anything",
        )

    def handle(self, *args, **options):
        tenant_ref = options["tenant"]
        output_path = options["output"]
        active_only = options["active_only"]
        dry_run = options["dry_run"]

        # slug is unique and URL-safe, so try it first; fall back to name
        tenant = (
            Tenant.objects.filter(slug__iexact=tenant_ref).first()
            or Tenant.objects.filter(name__iexact=tenant_ref).first()
        )
        if not tenant:
            raise CommandError(f"No tenant found matching '{tenant_ref}'")

        students_qs = Student.objects.select_related(
            "user", "student_class", "section"
        ).filter(tenant=tenant, user__role="student")
        if active_only:
            students_qs = students_qs.filter(is_active=True)

        count = students_qs.count()
        if count == 0:
            self.stdout.write(self.style.WARNING(
                "No matching students found."))
            return

        self.stdout.write(
            f"Found {count} student(s) for tenant '{tenant.name}'.")

        if dry_run:
            self.stdout.write(self.style.NOTICE(
                "Dry run — no passwords were changed."))
            return

        fieldnames = [
            "full_name",
            "username",
            "email",
            "class",
            "section",
            "registration_number",
            "new_password",
        ]

        # Resume support: if the output file already exists (from a run that
        # got interrupted), skip usernames already recorded in it.
        already_done = set()
        file_exists = os.path.exists(output_path)
        if file_exists:
            with open(output_path, "r", newline="", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    already_done.add(row.get("username"))
            if already_done:
                self.stdout.write(
                    f"Resuming: {len(already_done)} student(s) already have a row "
                    f"in {output_path} and will be skipped."
                )

        succeeded = 0
        failed = []

        # Open in append mode so progress survives even if the process dies;
        # write the header only if we're starting a fresh file.
        with open(output_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()

            students = None
            for attempt in range(1, 4):
                try:
                    students = list(students_qs)
                    break
                except OperationalError as e:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Connection error loading student list "
                            f"(attempt {attempt}/3), retrying in 5s: {e}"
                        )
                    )
                    close_old_connections()
                    time.sleep(5)
            if students is None:
                raise CommandError(
                    "Could not load the student list after 3 attempts — "
                    "check your network/database connection and re-run "
                    "(already-processed students will be skipped)."
                )

            for student in students:
                user = student.user
                if user.username in already_done:
                    continue

                new_password = generate_password()
                row = None

                max_attempts = 5
                backoff = [3, 6, 12, 24, 45]
                for attempt in range(1, max_attempts + 1):
                    try:
                        with transaction.atomic():
                            user.set_password(new_password)
                            user.save(update_fields=["password"])
                        row = {
                            "full_name": user.full_name,
                            "username": user.username,
                            "email": user.email or "",
                            "class": student.get_class_display(),
                            "section": student.get_section_display(),
                            "registration_number": student.registration_number or "",
                            "new_password": new_password,
                        }
                        break
                    except OperationalError as e:
                        wait = backoff[attempt - 1]
                        self.stdout.write(
                            self.style.WARNING(
                                f"Connection error on {user.username} "
                                f"(attempt {attempt}/{max_attempts}), "
                                f"retrying in {wait}s: {e}"
                            )
                        )
                        close_old_connections()
                        time.sleep(wait)

                if row:
                    writer.writerow(row)
                    f.flush()  # make sure it actually hits disk, not just a buffer
                    succeeded += 1
                else:
                    failed.append(user.username)

        self.stdout.write(
            self.style.SUCCESS(
                f"Regenerated credentials for {succeeded} student(s). Saved to {output_path}"
            )
        )
        if failed:
            self.stdout.write(
                self.style.ERROR(
                    f"{len(failed)} student(s) failed after retry and were skipped: "
                    f"{', '.join(failed)}. Re-run the same command — it will resume "
                    f"and only process these."
                )
            )
        self.stdout.write(
            self.style.WARNING(
                "Remember: this file contains plaintext passwords. "
                "Distribute securely and delete it once done."
            )
        )
