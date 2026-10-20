"""
Send the parents' daily email of newly set assignments now.

Celery beat runs this at 4pm when a worker is running. Without one, run it
from a Render Cron Job instead:

    python manage.py send_assignment_digests

It sends to real parents. On a local copy of the production database, use
--dry-run, which counts who would be emailed and changes nothing.
"""
from django.core.management.base import BaseCommand

from assignment.digest import send_new_assignment_digests


class Command(BaseCommand):
    help = "Email each parent one digest of the assignments set since the last one."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Count the assignments and parents without sending or marking anything.",
        )

    def handle(self, *args, dry_run=False, **options):
        summary = send_new_assignment_digests(dry_run=dry_run)
        prefix = "Dry run: would email" if dry_run else "Emailed"
        self.stdout.write(
            f"{prefix} {summary['parents'] - summary['no_email']} parent(s) about "
            f"{summary['assignments']} assignment(s). "
            f"{summary['no_email']} had no email address"
            + ("." if dry_run else f"; {summary['sent']} sent, {summary['failed']} failed.")
        )
