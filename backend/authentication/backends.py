# authentication/backends.py
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()


class EmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None or password is None:
            return None

        try:
            # Try to find user by username first, then email
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                # If not found by username, try email
                # FIX: Filter by school too if multiple users share email
                user = User.objects.filter(email=username).first()  # Get first match

            if (
                user
                and user.check_password(password)
                and self.user_can_authenticate(user)
            ):
                return user
        except User.MultipleObjectsReturned:
            # If multiple users with same email, try to find by username=email
            return None
        except User.DoesNotExist:
            return None

        return None
