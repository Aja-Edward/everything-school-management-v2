from django.db import models
from django.conf import settings
from django.core.validators import RegexValidator
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
import re


class UserProfile(models.Model):
    """Extended user profile with additional information and preferences"""

    GENDER_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
        ("other", "Other"),
        ("prefer_not_to_say", "Prefer not to say"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )

    # Contact Information
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        validators=[
            RegexValidator(
                regex=r"^\+?234\d{10}$",
                message="Enter a valid Nigerian phone number (e.g., +234XXXXXXXXXX).",
            )
        ],
        help_text="Nigerian phone number format: +234XXXXXXXXXX",
    )
    address = models.TextField(
        blank=True, null=True, help_text="Full address including city and state"
    )

    # Profile Information
    profile_picture = models.ImageField(
        upload_to="profile_pics/%Y/%m/",
        blank=True,
        null=True,
        help_text="Profile picture (recommended size: 300x300px)",
    )
    bio = models.TextField(
        max_length=500,
        blank=True,
        null=True,
        help_text="Tell us about yourself (max 500 characters)",
    )
    date_of_birth = models.DateField(
        blank=True, null=True, help_text="Your date of birth (YYYY-MM-DD)"
    )
    gender = models.CharField(
        max_length=30,
        choices=GENDER_CHOICES,
        blank=True,
        null=True,
    )

    # Social Media Links
    linkedin_url = models.URLField(
        blank=True, null=True, help_text="Your LinkedIn profile URL"
    )
    twitter_url = models.URLField(
        blank=True, null=True, help_text="Your Twitter profile URL"
    )
    facebook_url = models.URLField(
        blank=True, null=True, help_text="Your Facebook profile URL"
    )

    # Privacy & Preferences
    is_profile_public = models.BooleanField(
        default=True, help_text="Make your profile visible to other users"
    )
    receive_notifications = models.BooleanField(
        default=True, help_text="Receive email notifications for important updates"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user.full_name}'s profile"

    def clean(self):
        """Validate the model fields"""
        super().clean()

        # Validate social media URLs
        if self.linkedin_url and not self._is_valid_linkedin_url(self.linkedin_url):
            raise ValidationError({"linkedin_url": "Please enter a valid LinkedIn URL"})

        if self.twitter_url and not self._is_valid_twitter_url(self.twitter_url):
            raise ValidationError({"twitter_url": "Please enter a valid Twitter URL"})

        if self.facebook_url and not self._is_valid_facebook_url(self.facebook_url):
            raise ValidationError({"facebook_url": "Please enter a valid Facebook URL"})

    def _is_valid_linkedin_url(self, url):
        """Validate LinkedIn URL format"""
        linkedin_pattern = r"^https?://(www\.)?linkedin\.com/in/[\w-]+/?$"
        return re.match(linkedin_pattern, url) is not None

    def _is_valid_twitter_url(self, url):
        """Validate Twitter URL format"""
        twitter_pattern = r"^https?://(www\.)?(twitter\.com|x\.com)/[\w-]+/?$"
        return re.match(twitter_pattern, url) is not None

    def _is_valid_facebook_url(self, url):
        """Validate Facebook URL format"""
        facebook_pattern = r"^https?://(www\.)?facebook\.com/[\w.-]+/?$"
        return re.match(facebook_pattern, url) is not None

    @property
    def display_name(self):
        """Return the user's full name for display"""
        return getattr(self.user, "full_name", self.user.username)

    @property
    def short_name(self):
        """Return the user's short name for display"""
        return getattr(
            self.user, "short_name", self.user.first_name or self.user.username
        )

    @property
    def user_role(self):
        """Return the user's role"""
        if hasattr(self.user, "get_role_display"):
            return self.user.get_role_display()
        return getattr(self.user, "role", "User")

    @property
    def is_verified(self):
        """Check if user's email is verified"""
        return getattr(self.user, "email_verified", False)

    @property
    def primary_phone(self):
        """Return phone number from profile or user model"""
        return (
            self.phone_number
            or getattr(self.user, "phone_number", None)
            or getattr(self.user, "phone", None)
        )

    @property
    def profile_image_url(self):
        """Return profile picture URL with fallback"""
        if self.profile_picture:
            return self.profile_picture.url
        elif hasattr(self.user, "profile_picture") and self.user.profile_picture:
            return (
                self.user.profile_picture.url
                if hasattr(self.user.profile_picture, "url")
                else self.user.profile_picture
            )
        return None

    @property
    def profile_completion_percentage(self):
        """Calculate profile completion percentage"""
        fields_to_check = [
            "bio",
            "date_of_birth",
            "gender",
            "phone_number",
            "address",
            "profile_picture",
        ]

        completed_fields = 0
        total_fields = len(fields_to_check)

        for field in fields_to_check:
            if getattr(self, field):
                completed_fields += 1

        # Add social media bonus (all three count as one)
        if any([self.linkedin_url, self.twitter_url, self.facebook_url]):
            completed_fields += 1
            total_fields += 1

        return round((completed_fields / total_fields) * 100, 2)

    def get_full_profile_data(self):
        """Return a dictionary with all profile information"""
        return {
            "user_id": self.user.id,
            "email": self.user.email,
            "username": getattr(self.user, "username", None),
            "full_name": self.display_name,
            "short_name": self.short_name,
            "first_name": getattr(self.user, "first_name", None),
            "middle_name": getattr(self.user, "middle_name", None),
            "last_name": getattr(self.user, "last_name", None),
            "role": self.user_role,
            "phone_number": self.primary_phone,
            "address": self.address,
            "bio": self.bio,
            "date_of_birth": self.date_of_birth,
            "gender": self.get_gender_display() if self.gender else None,
            "profile_picture": self.profile_image_url,
            "is_verified": self.is_verified,
            "is_active": self.user.is_active,
            "date_joined": self.user.date_joined,
            "last_login": getattr(self.user, "last_login", None),
            "profile_completion": self.profile_completion_percentage,
            "social_media": {
                "linkedin": self.linkedin_url,
                "twitter": self.twitter_url,
                "facebook": self.facebook_url,
            },
            "preferences": {
                "is_profile_public": self.is_profile_public,
                "receive_notifications": self.receive_notifications,
                "subscribe_newsletter": getattr(
                    self.user, "subscribe_newsletter", False
                ),
            },
            "timestamps": {
                "created_at": self.created_at,
                "updated_at": self.updated_at,
            },
        }

    def get_public_profile_data(self):
        """Return public profile data (filtered for privacy)"""
        if not self.is_profile_public:
            return {
                "display_name": self.display_name,
                "is_public": False,
                "message": "This profile is private",
            }

        return {
            "display_name": self.display_name,
            "bio": self.bio,
            "profile_picture": self.profile_image_url,
            "social_media": {
                "linkedin": self.linkedin_url,
                "twitter": self.twitter_url,
                "facebook": self.facebook_url,
            },
            "is_verified": self.is_verified,
            "member_since": self.user.date_joined,
            "is_public": True,
        }

    def save(self, *args, **kwargs):
        """Override save to handle validation and custom logic"""
        self.full_clean()  # Run model validation
        super().save(*args, **kwargs)

    @classmethod
    def create_or_update_profile(cls, user, **profile_data):
        """Create or update user profile with given data"""
        profile, created = cls.objects.get_or_create(user=user, defaults=profile_data)

        if not created:
            # Update existing profile
            for key, value in profile_data.items():
                setattr(profile, key, value)
            profile.save()

        return profile, created
