import base64
import shutil
import tempfile

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from datetime import date, timedelta
from .models import UserProfile
from .serializers import UserProfileSerializer, UserProfileSummarySerializer

User = get_user_model()


def use_temporary_media(test):
    """
    Send uploads to a scratch directory for the duration of one test.

    The picture upload test posts a real image now, which the endpoint saves
    under MEDIA_ROOT -- backend/media/profile_pics/ in the working tree. The
    suite was quietly dropping files into the repository on every run.
    """
    media_root = tempfile.mkdtemp(prefix="userprofile-media-")
    test.addCleanup(shutil.rmtree, media_root, ignore_errors=True)
    overridden = override_settings(MEDIA_ROOT=media_root)
    overridden.enable()
    test.addCleanup(overridden.disable)


def one_pixel_png():
    """A real 1x1 PNG, so an ImageField can actually open it."""
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
        "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )


def profile_for(user, **fields):
    """
    The profile this user already has, with `fields` applied.

    userprofile.signals.handle_user_profile creates a UserProfile on post_save
    for every user whose role is teacher, admin or student. Each setUp below
    then created its own, and UserProfile.save() runs full_clean(), so setUp
    died on "User Profile with this User already exists." before a single test
    body ran -- all 23 of them, every run.
    """
    profile, _ = UserProfile.objects.get_or_create(user=user)
    # Hold on to the caller's own User instance. Fetching the profile leaves
    # the FK unloaded, so profile.user would lazily load a second copy and a
    # test that flips a flag on its own instance would read the stale one.
    profile.user = user
    for name, value in fields.items():
        setattr(profile, name, value)
    if fields:
        profile.save()
    return profile


class UserProfileModelTest(TestCase):
    """Test UserProfile model functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            username="testuser",
            first_name="John",
            middle_name="Doe",
            last_name="Smith",
            role="student",
            password="testpass123",
        )
        self.profile = profile_for(
            self.user,
            phone_number="+2348123456789",
            address="123 Test Street",
            bio="Test bio",
            date_of_birth=date(1990, 1, 1),
            gender="male",
        )

    def test_profile_creation(self):
        """Test profile is created correctly"""
        self.assertEqual(self.profile.user, self.user)
        self.assertEqual(str(self.profile), f"{self.user.full_name}'s profile")

    def test_display_name_property(self):
        """Test display_name property"""
        self.assertEqual(self.profile.display_name, "John Doe Smith")

    def test_short_name_property(self):
        """Test short_name property"""
        self.assertEqual(self.profile.short_name, "John Smith")

    def test_user_role_property(self):
        """Test user_role property"""
        self.assertEqual(self.profile.user_role, "Student")

    def test_primary_phone_property(self):
        """Test primary_phone property"""
        self.assertEqual(self.profile.primary_phone, "+2348123456789")

    def test_is_verified_property(self):
        """Test is_verified property"""
        self.assertFalse(self.profile.is_verified)
        self.user.email_verified = True
        self.user.save()
        self.assertTrue(self.profile.is_verified)

    def test_get_full_profile_data(self):
        """Test get_full_profile_data method"""
        data = self.profile.get_full_profile_data()
        self.assertIn("user_id", data)
        self.assertIn("email", data)
        self.assertIn("full_name", data)
        self.assertIn("social_media", data)
        self.assertIn("preferences", data)
        self.assertEqual(data["email"], self.user.email)
        self.assertEqual(data["full_name"], self.user.full_name)


class UserProfileSerializerTest(TestCase):
    """Test UserProfile serializers"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            username="testuser",
            first_name="John",
            last_name="Smith",
            role="student",
            password="testpass123",
        )
        self.profile = profile_for(self.user)

    def test_profile_serializer(self):
        """Test UserProfileSerializer"""
        serializer = UserProfileSerializer(self.profile)
        data = serializer.data

        self.assertIn("user", data)
        self.assertIn("display_name", data)
        self.assertIn("user_role", data)
        self.assertEqual(data["display_name"], self.user.full_name)

    def test_profile_summary_serializer(self):
        """Test UserProfileSummarySerializer"""
        serializer = UserProfileSummarySerializer(self.profile)
        data = serializer.data

        self.assertIn("display_name", data)
        self.assertIn("email", data)
        self.assertIn("user_role", data)
        self.assertEqual(data["email"], self.user.email)

    def test_phone_number_validation(self):
        """Test phone number validation in serializer"""
        from .serializers import UserProfileUpdateSerializer

        # Test valid phone number
        serializer = UserProfileUpdateSerializer(
            self.profile, data={"phone_number": "+2348123456789"}, partial=True
        )
        self.assertTrue(serializer.is_valid())

        # Test auto-formatting
        serializer = UserProfileUpdateSerializer(
            self.profile, data={"phone_number": "08123456789"}, partial=True
        )
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["phone_number"], "+2348123456789")

    def test_date_of_birth_validation(self):
        """Test date of birth validation"""
        from .serializers import UserProfileUpdateSerializer

        # Test future date (should fail)
        future_date = date.today() + timedelta(days=1)
        serializer = UserProfileUpdateSerializer(
            self.profile, data={"date_of_birth": future_date}, partial=True
        )
        self.assertFalse(serializer.is_valid())

        # Test valid date
        past_date = date(1990, 1, 1)
        serializer = UserProfileUpdateSerializer(
            self.profile, data={"date_of_birth": past_date}, partial=True
        )
        self.assertTrue(serializer.is_valid())


class UserProfileAPITest(APITestCase):
    """Test UserProfile API endpoints"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            username="testuser",
            first_name="John",
            last_name="Smith",
            role="student",
            password="testpass123",
            email_verified=True,
            is_active=True,
        )
        self.profile = profile_for(
            self.user, phone_number="+2348123456789", bio="Test bio"
        )
        self.client.force_authenticate(user=self.user)
        use_temporary_media(self)

    def test_get_profile_me(self):
        """Test GET /profiles/me/ endpoint"""
        url = reverse("userprofile:userprofile-me")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("display_name", response.data)
        self.assertEqual(response.data["display_name"], self.user.full_name)

    def test_get_profile_summary(self):
        """Test GET /profiles/summary/ endpoint"""
        url = reverse("userprofile:userprofile-summary")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("display_name", response.data)
        self.assertIn("email", response.data)
        self.assertIn("user_role", response.data)

    def test_get_full_profile(self):
        """Test GET /profiles/full_profile/ endpoint"""
        url = reverse("userprofile:userprofile-full-profile")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("user_id", response.data)
        self.assertIn("social_media", response.data)
        self.assertIn("preferences", response.data)

    def test_update_preferences(self):
        """Test PATCH /profiles/update_preferences/ endpoint"""
        url = reverse("userprofile:userprofile-update-preferences")
        data = {
            "bio": "Updated bio",
            "is_profile_public": False,
            "receive_notifications": False,
        }
        response = self.client.patch(url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.bio, "Updated bio")
        self.assertFalse(self.profile.is_profile_public)
        self.assertFalse(self.profile.receive_notifications)

    def test_get_verification_status(self):
        """Test GET /profiles/verification_status/ endpoint"""
        url = reverse("userprofile:userprofile-verification-status")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("email_verified", response.data)
        self.assertIn("is_active", response.data)
        self.assertIn("can_login", response.data)

    def test_get_contact_info(self):
        """
        GET /profiles/contact_info/.

        This asserted phone_number and social_media, which is the shape of the
        neighbouring contact_details endpoint. contact_info serialises through
        UserProfileContactSerializer and returns primary_phone with the social
        links flat, so the assertions described a different endpoint from the
        one the test called. Both are covered now rather than one being bent
        into the shape of the other.
        """
        url = reverse("userprofile:userprofile-contact-info")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("email", response.data)
        self.assertIn("primary_phone", response.data)
        self.assertEqual(response.data["primary_phone"], "+2348123456789")
        self.assertIn("linkedin_url", response.data)

    def test_get_contact_details(self):
        """GET /profiles/contact_details/ -- the grouped shape."""
        url = reverse("userprofile:userprofile-contact-details")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("email", response.data)
        self.assertIn("phone_number", response.data)
        self.assertIn("social_media", response.data)

    def test_upload_profile_picture(self):
        """Test POST /profiles/upload_profile_picture/ endpoint"""
        url = reverse("userprofile:userprofile-upload-profile-picture")

        image = SimpleUploadedFile(
            "test_image.png", one_pixel_png(), content_type="image/png"
        )

        data = {"profile_picture": image}
        response = self.client.post(url, data, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("message", response.data)
        self.assertIn("profile_picture_url", response.data)

    def test_unauthorized_access(self):
        """Test unauthorized access to protected endpoints"""
        self.client.force_authenticate(user=None)

        url = reverse("userprofile:userprofile-me")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_creation_on_missing(self):
        """Test that profile is created if it doesn't exist"""
        # Delete the profile
        self.profile.delete()

        url = reverse("userprofile:userprofile-me")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check that profile was recreated
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())


class UserProfilePermissionTest(APITestCase):
    """Test UserProfile permissions"""

    def setUp(self):
        self.user1 = User.objects.create_user(
            email="user1@example.com",
            username="user1",
            first_name="User",
            last_name="One",
            role="student",
            password="testpass123",
            email_verified=True,
            is_active=True,
        )
        self.user2 = User.objects.create_user(
            email="user2@example.com",
            username="user2",
            first_name="User",
            last_name="Two",
            role="student",
            password="testpass123",
            email_verified=True,
            is_active=True,
        )
        self.profile1 = profile_for(self.user1)
        self.profile2 = profile_for(self.user2)

        self.client.force_authenticate(user=self.user1)
        use_temporary_media(self)

    def test_user_can_only_access_own_profile(self):
        """Test that users can only access their own profile"""
        # User1 accessing own profile - should work
        url = reverse("userprofile:userprofile-me")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # User1 should only see their own profile in list
        url = reverse("userprofile:userprofile-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["user"]["email"], self.user1.email)

    def test_inactive_user_cannot_access_profile(self):
        """Test that inactive users cannot access profiles"""
        self.user1.is_active = False
        self.user1.save()

        url = reverse("userprofile:userprofile-me")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unverified_user_cannot_upload_picture(self):
        """Test that unverified users cannot upload profile pictures"""
        self.user1.email_verified = False
        self.user1.save()

        url = reverse("userprofile:userprofile-upload-profile-picture")
        image = SimpleUploadedFile(
            "test_image.png", one_pixel_png(), content_type="image/png"
        )

        data = {"profile_picture": image}
        response = self.client.post(url, data, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
