"""
List active users whose school can't be determined.

Authentication treats a user as belonging to a school when their own tenant,
or the tenant on their teacher/student/parent profile, is that school
(tenants.membership). Anyone with neither is signed in as an anonymous
visitor whenever a request names a school, so run this before deploying that
check, and fix whoever it lists by setting their tenant.

Read-only.

    python manage.py report_users_without_school
"""

from collections import Counter

from django.core.management.base import BaseCommand

from tenants.membership import user_school_id
from users.models import CustomUser


class Command(BaseCommand):
    help = "List active users who belong to no school (and are not platform staff)."

    def handle(self, *args, **options):
        stranded = [
            user
            for user in CustomUser.objects.filter(is_active=True, tenant__isnull=True).order_by("role", "username")
            if not user.is_platform_user and user_school_id(user) is None
        ]

        if not stranded:
            self.stdout.write(self.style.SUCCESS("Every active user belongs to a school."))
            return

        for user in stranded:
            self.stdout.write(
                f"  {user.role or '(no role)':<24} {user.username:<32} {user.email or ''}"
                f"  last login: {user.last_login or 'never'}"
            )
        by_role = ", ".join(f"{role or '(no role)'}: {n}" for role, n in sorted(Counter(u.role for u in stranded).items()))
        self.stdout.write(self.style.WARNING(f"\n{len(stranded)} active users belong to no school ({by_role})."))
