# authentication/adapters.py
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth import get_user_model
from django.http import HttpRequest

User = get_user_model()


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        """
        Handle social login before creating/linking account
        """
        # Get extra data from request if available
        extra_data = getattr(request, "social_extra_data", {})

        # Get the Google profile picture from social login extra data
        social_extra_data = sociallogin.account.extra_data
        picture_url = social_extra_data.get("picture")

        # Define user from sociallogin
        user = sociallogin.user

        if picture_url and hasattr(user, "profile_picture"):
            # Store it temporarily in the user model (e.g., a 'profile_picture' field)
            user.profile_picture = picture_url

        # If user doesn't exist, we'll create them in save_user
        if not user.pk:
            # Store extra data for later use
            user._social_extra_data = extra_data

    def save_user(self, request, sociallogin, form=None):
        """
        Save user with additional data from social login
        """
        user = super().save_user(request, sociallogin, form)

        # Get extra data if available
        extra_data = getattr(request, "social_extra_data", {})

        # Update user with extra fields
        updated = False

        if "role" in extra_data:
            user.role = extra_data["role"]
            updated = True

        if "phone" in extra_data:
            user.phone = extra_data["phone"]
            updated = True

        if "agree_to_terms" in extra_data:
            user.agree_to_terms = extra_data["agree_to_terms"]
            updated = True

        if "subscribe_newsletter" in extra_data:
            user.subscribe_newsletter = extra_data["subscribe_newsletter"]
            updated = True

        if updated:
            user.save()

        return user

    def populate_user(self, request, sociallogin, data):
        """
        Populate user instance with data from social provider
        """
        user = super().populate_user(request, sociallogin, data)

        # Get name from social data
        if "name" in data:
            name_parts = data["name"].split(" ", 1)
            user.first_name = name_parts[0]
            if len(name_parts) > 1:
                user.last_name = name_parts[1]

        # Override with given_name and family_name if available
        if "given_name" in data:
            user.first_name = data["given_name"]
        if "family_name" in data:
            user.last_name = data["family_name"]

        return user
