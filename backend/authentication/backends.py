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
