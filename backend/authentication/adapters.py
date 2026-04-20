# authentication/adapters.py
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib.auth import get_user_model
from django.http import HttpRequest

User = get_user_model()

ALLOWED_SOCIAL_ROLES = {"student", "teacher", "parent"}

class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):

    def pre_social_login(self, request, sociallogin):
        extra_data = getattr(request, "social_extra_data", {})
        picture_url = sociallogin.account.extra_data.get("picture")
        user = sociallogin.user
        if picture_url and hasattr(user, "profile_picture"):
            user.profile_picture = picture_url
        if not user.pk:
            user._social_extra_data = extra_data

    def save_user(self, request, sociallogin, form=None):
        """
        Save user with additional data from social login
        """
        user = super().save_user(request, sociallogin, form)

        # Get extra data if available
        extra_data = getattr(request, "social_extra_data", {})

        # Validate role before writing
        role = extra_data.get("role")
        if role and role in ALLOWED_SOCIAL_ROLES:
            user.role = role

        if "phone" in extra_data:
            user.phone = extra_data["phone"]

        # Assign tenant from request (subdomain or session)
        from authentication.backends import get_tenant_from_request
        from tenants.models import Tenant  # adjust import to your app

        tenant_slug = get_tenant_from_request(request)
        if tenant_slug:
            try:
                user.tenant = Tenant.objects.get(slug=tenant_slug)
            except Tenant.DoesNotExist:
                pass  # Log a warning here

        user.save()
        return user

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        user.first_name = (
            data.get("given_name") or data.get("name", "").split(" ", 1)[0]
        )
        user.last_name = data.get("family_name") or (
            data.get("name", "").split(" ", 1)[1] if " " in data.get("name", "") else ""
        )
        return user
