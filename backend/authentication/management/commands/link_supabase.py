from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from supabase import create_client
import os

User = get_user_model()


class Command(BaseCommand):   # ✅ THIS MUST EXIST
    help = "Link Django users to Supabase Auth"

    def handle(self, *args, **kwargs):
        client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SECRET_KEY"],
        )

        for user in User.objects.filter(supabase_id__isnull=True, is_active=True):

            if user.supabase_id:
                continue

            try:
                res = client.auth.admin.create_user({
                    "email": user.email,
                    "email_confirm": True,
                    "user_metadata": {"django_role": user.role},
                })

                created_user = getattr(res, "user", None)

                if created_user:
                    user.supabase_id = created_user.id
                    user.save(update_fields=["supabase_id"])
                    self.stdout.write(f"Linked {user.email} -> {created_user.id}")
                else:
                    self.stdout.write(f"Failed for {user.email}")

            except Exception as e:
                self.stdout.write(f"Error for {user.email}: {e}")