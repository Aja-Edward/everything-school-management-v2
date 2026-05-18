"""
Management command: create_platform_admin

Creates or updates the platform-level superuser account.

Usage:
    # Interactive (prompts for password):
    python manage.py create_platform_admin

    # Non-interactive (for CI / deployment scripts):
    python manage.py create_platform_admin \
        --username nuventa_admin \
        --email admin@nuventacloud.com \
        --password "@Nuventaadmin2"

    # Update existing account's password:
    python manage.py create_platform_admin \
        --username nuventa_admin \
        --password "NewSecurePassword!"

IMPORTANT:
    This account is the only one that can log in at /platform-admin/login.
    It must have is_superuser=True. Do NOT create more than one unless needed.
    Store the credentials in a password manager — not in version control.
"""

import getpass
import sys
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = "Create or update the platform-level superuser (platform admin) account."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default="nuventa_admin",
            help="Username for the platform admin (default: nuventa_admin)",
        )
        parser.add_argument(
            "--email",
            default="admin@nuventacloud.com",
            help="Email address (default: admin@nuventacloud.com)",
        )
        parser.add_argument(
            "--password",
            default=None,
            help="Password. If omitted you will be prompted interactively.",
        )
        parser.add_argument(
            "--no-input",
            action="store_true",
            dest="no_input",
            help="Fail instead of prompting (useful in CI pipelines).",
        )

    def handle(self, *args, **options):
        username = options["username"]
        email    = options["email"]
        password = options["password"]
        no_input = options["no_input"]

        # ── Resolve password ─────────────────────────────────────────────────
        if not password:
            if no_input:
                raise CommandError(
                    "Password is required when --no-input is set. "
                    "Pass it with --password or remove --no-input."
                )
            self.stdout.write(self.style.WARNING(
                f"\nCreating platform admin: {username} <{email}>"
            ))
            password = self._prompt_password()

        if len(password) < 8:
            raise CommandError("Password must be at least 8 characters.")

        # ── Create or update ─────────────────────────────────────────────────
        existing = User.objects.filter(username=username).first()

        if existing:
            existing.email        = email
            existing.is_superuser = True
            existing.is_staff     = True
            existing.is_active    = True
            if hasattr(existing, "role"):
                existing.role = "superadmin"
            existing.set_password(password)
            existing.save()

            self.stdout.write(self.style.SUCCESS(
                f"\nOK Updated existing account '{username}' — now has superuser privileges."
            ))
        else:
            kwargs = dict(
                username     = username,
                email        = email,
                is_superuser = True,
                is_staff     = True,
                is_active    = True,
            )
            if "role" in {f.name for f in User._meta.fields}:
                kwargs["role"] = "superadmin"

            u = User(**kwargs)
            u.set_password(password)
            u.save()

            self.stdout.write(self.style.SUCCESS(
                f"\nOK Created platform admin account '{username}'."
            ))

        self.stdout.write(
            self.style.HTTP_INFO(
                f"\n  Username : {username}"
                f"\n  Email    : {email}"
                f"\n  Login at : /platform-admin/login\n"
            )
        )

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _prompt_password(self) -> str:
        while True:
            try:
                pw1 = getpass.getpass("Password: ")
                pw2 = getpass.getpass("Confirm password: ")
            except KeyboardInterrupt:
                self.stdout.write("\nAborted.")
                sys.exit(1)

            if not pw1:
                self.stderr.write("Password cannot be empty. Try again.")
                continue
            if pw1 != pw2:
                self.stderr.write("Passwords do not match. Try again.")
                continue
            return pw1
