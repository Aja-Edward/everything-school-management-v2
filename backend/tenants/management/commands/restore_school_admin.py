"""Restore a school's own admin account after it was put on hold.

Putting a newly-registered school on hold (demoting its admin, deactivating
the tenant) is easy to do from the platform admin dashboard. Undoing it is
not: PlatformUserSerializer.validate_role only accepts 'platform_admin' or
'marketer', so the dashboard cannot hand 'superadmin' back, and a demotion
leaves debris behind that a role change alone does not clear.

This does the whole reversal in one place, matching what
SchoolRegistrationSerializer.create() sets up for a fresh school.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from tenants.models import Tenant
from users.models import CustomUser


class Command(BaseCommand):
    help = (
        "Restore a school's admin account to superadmin after a hold. "
        "Prints the plan and changes nothing unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "slug",
            help="Tenant slug, e.g. olatilewa-high-school",
        )
        parser.add_argument(
            "--user",
            dest="username",
            help=(
                "Restore only this username. Default: every account in the "
                "tenant that is not already a school-level admin."
            ),
        )
        parser.add_argument(
            "--activate",
            action="store_true",
            help=(
                "Also activate the tenant. Without this the school stays "
                "unreachable no matter what the account's role says, because "
                "TenantMiddleware refuses an inactive tenant on every branch."
            ),
        )
        parser.add_argument(
            "--keep-sessions",
            action="store_true",
            help=(
                "Do not bump token_version. By default it is bumped, which "
                "forces a fresh login so the JWT carries the restored role - "
                "the frontend renders its UI from that claim."
            ),
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually write the changes. Without it this is a dry run.",
        )

    def handle(self, *args, **options):
        slug = options["slug"]
        username = options["username"]
        activate = options["activate"]
        bump = not options["keep_sessions"]
        apply_changes = options["apply"]

        try:
            tenant = Tenant.objects.get(slug=slug)
        except Tenant.DoesNotExist:
            raise CommandError(f"No tenant with slug {slug!r}.")

        users = CustomUser.objects.filter(tenant=tenant)
        if username:
            users = users.filter(username=username)
            if not users.exists():
                raise CommandError(
                    f"No user {username!r} in tenant {slug!r}."
                )
        else:
            users = users.exclude(role="superadmin")

        self.stdout.write(f"\nTenant : {tenant.name} ({tenant.slug})")
        self.stdout.write(
            f"Status : {tenant.status}  is_active={tenant.is_active}"
        )
        self.stdout.write(f"Owner  : {tenant.owner_name} <{tenant.owner_email}>")

        if activate and not (tenant.is_active and tenant.status == "active"):
            self.stdout.write(
                self.style.WARNING("  will ACTIVATE this tenant")
            )
        elif not activate and not (tenant.is_active and tenant.status == "active"):
            self.stdout.write(
                self.style.WARNING(
                    "  tenant is NOT active - the account will still be "
                    "locked out until you pass --activate"
                )
            )

        users = list(users)
        if not users:
            self.stdout.write(
                "\nNo accounts to restore (all are already superadmin)."
            )
            return

        self.stdout.write(f"\n{len(users)} account(s) to restore:")
        for user in users:
            self.stdout.write(f"\n  {user.username} <{user.email}>")
            self.stdout.write(f"    role         {user.role} -> superadmin")
            if not user.is_staff:
                self.stdout.write("    is_staff     False -> True")
            if not user.is_active:
                self.stdout.write("    is_active    False -> True")
            if user.referral_code:
                # CustomUser.save() assigns one the first time a marketer is
                # saved without it, and never removes it again - so a demote
                # and re-promote leaves a stray code in a unique index,
                # making the account look like a marketer to anything that
                # checks referral_code.
                self.stdout.write(
                    f"    referral_code {user.referral_code} -> None "
                    "(left over from the marketer demotion)"
                )
            if bump:
                self.stdout.write(
                    f"    token_version {user.token_version} -> "
                    f"{user.token_version + 1} (forces re-login)"
                )

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    "\nDry run - nothing written. Re-run with --apply.\n"
                )
            )
            return

        with transaction.atomic():
            for user in users:
                user.role = "superadmin"
                user.is_staff = True
                user.is_active = True
                user.referral_code = None
                if bump:
                    user.token_version += 1
                user.save()
                self.stdout.write(
                    self.style.SUCCESS(f"  restored {user.username}")
                )

            if activate:
                tenant.activate()
                self.stdout.write(
                    self.style.SUCCESS(f"  activated {tenant.slug}")
                )

        self.stdout.write(self.style.SUCCESS("\nDone.\n"))
