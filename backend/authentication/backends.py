# # authentication/backends.py
# from django.contrib.auth.backends import ModelBackend
# from django.contrib.auth import get_user_model
# from django.db.models import Q

# User = get_user_model()


# class EmailBackend(ModelBackend):
#     def authenticate(self, request, username=None, password=None, **kwargs):
#         if username is None or password is None:
#             return None

#         try:
#             # Try to find user by username first, then email
#             try:
#                 user = User.objects.get(username=username)
#             except User.DoesNotExist:
#                 # If not found by username, try email
#                 # FIX: Filter by school too if multiple users share email
#                 user = User.objects.filter(email=username).first()  # Get first match

#             if (
#                 user
#                 and user.check_password(password)
#                 and self.user_can_authenticate(user)
#             ):
#                 return user
#         except User.MultipleObjectsReturned:
#             # If multiple users with same email, try to find by username=email
#             return None
#         except User.DoesNotExist:
#             return None

#         return None
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model


User = get_user_model()
def get_tenant_from_request(request):
    """Extract tenant slug from subdomain or session."""
    if request is None:
        return None
    # Try session first (set on login)
    if tenant_id := request.session.get("tenant_id"):
        return tenant_id
    # Fall back to subdomain
    host = request.get_host().split(":")[0]
    parts = host.split(".")
    if len(parts) >= 3:
        return parts[0]
    return None


class EmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None
        tenant_slug = get_tenant_from_request(request)
        # Build base queryset — scoped by tenant if available
        qs = User.objects.all()
        if tenant_slug:
            # Adjust field name to match your Tenant FK on User
            qs = qs.filter(tenant__slug=tenant_slug)
        # Single DB query: find by username OR email
        try:
            user = qs.get(username=username)
        except User.DoesNotExist:
            try:
                user = qs.get(email=username)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                # Run a dummy hash to prevent timing attacks
                User().set_password(password)
                return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
