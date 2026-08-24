from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from .models import UserProfile
from .serializers import (
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    UserProfileSummarySerializer,
    UserProfileContactSerializer,
    UserProfilePictureSerializer,
    UserVerificationStatusSerializer,
    UserFullProfileDataSerializer,
    UserPreferencesSerializer,
)
from .permissions import (
    IsOwnerOfProfile,
    IsVerifiedUser,
    CanUpdateProfile,
    SecureProfilePermission,
)

User = get_user_model()


class UserProfileViewSet(viewsets.ModelViewSet):
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated, IsOwnerOfProfile]

    def get_queryset(self):
        return UserProfile.objects.filter(user=self.request.user)

    def get_user_profile(self):
        """Helper method to get or create user profile"""
        profile, created = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "You cannot delete your profile."},
            status=status.HTTP_403_FORBIDDEN,
        )

    @action(detail=False, methods=["get"])
    def me(self, request):
        """Get the current user's profile with complete information"""
        profile = self.get_user_profile()
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def full_profile(self, request):
        """Get complete profile data including all user information"""
        profile = self.get_user_profile()
        full_data = profile.get_full_profile_data()
        serializer = UserFullProfileDataSerializer(full_data)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Get a summary of user profile information"""
        profile = self.get_user_profile()
        serializer = UserProfileSummarySerializer(profile)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["patch"],
        permission_classes=[IsAuthenticated, CanUpdateProfile],
    )
    def update_preferences(self, request):
        """Update user preferences only"""
        profile = self.get_user_profile()
        serializer = UserProfileUpdateSerializer(
            profile, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsVerifiedUser],
    )
    def upload_profile_picture(self, request):
        """Handle profile picture upload"""
        profile = self.get_user_profile()
        serializer = UserProfilePictureSerializer(
            profile, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(
                {
                    "message": "Profile picture updated successfully",
                    "profile_picture_url": profile.profile_image_url,
                }
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[IsAuthenticated],
    )
    def all_users(self, request):
        """Get all users for admin purposes (teachers, staff, admins only)"""
        # Check if user is admin or has admin privileges
        if not (request.user.role == 'admin' or request.user.is_staff or request.user.is_superuser):
            return Response(
                {"detail": "You don't have permission to view all users."},
                status=status.HTTP_403_FORBIDDEN
            )

        # SECURITY: this used to be User.objects.filter(...) with no tenant
        # scoping at all, gated only by is_staff - which every schools own
        # admin has - so any school admin got back every other schools
        # teacher/admin directory (names + emails). A genuine platform-level
        # account (is_platform_staff) still sees the full directory; anyone
        # else is scoped to their own resolved tenant only.
        tenant = getattr(request, "tenant", None)
        base_qs = User.objects.all() if getattr(request.user, "is_platform_staff", False) else (
            User.objects.filter(tenant=tenant) if tenant else User.objects.none()
        )

        # Get users with roles: admin, teacher, staff (excluding students and parents)
        users = base_qs.filter(
            role__in=['admin', 'teacher'],
            is_active=True
        ).exclude(
            role__in=['student', 'parent']
        )
        
        user_data = []
        for user in users:
            user_data.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'full_name': user.full_name,
                'role': user.role.title(),  # Capitalize role name
                'is_active': user.is_active
            })
        
        return Response(user_data)

    @action(detail=False, methods=["get"])
    def verification_status(self, request):
        """Get user verification status"""
        profile = self.get_user_profile()
        serializer = UserVerificationStatusSerializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def user_status(self, request):
        """Get user's account status information"""
        profile = self.get_user_profile()
        return Response(
            {
                "email_verified": profile.user.email_verified,
                "is_active": profile.user.is_active,
                "verification_code_valid": (
                    profile.user.is_verification_code_valid()
                    if hasattr(profile.user, "is_verification_code_valid")
                    else False
                ),
                "can_login": profile.user.is_active and profile.user.email_verified,
            }
        )

    @action(detail=False, methods=["get"])
    def contact_info(self, request):
        """Get user's contact information"""
        profile = self.get_user_profile()
        serializer = UserProfileContactSerializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def contact_details(self, request):
        """Get user's detailed contact information"""
        profile = self.get_user_profile()
        return Response(
            {
                "email": profile.user.email,
                "phone_number": profile.primary_phone,
                "address": profile.address,
                "social_media": {
                    "linkedin": profile.linkedin_url,
                    "twitter": profile.twitter_url,
                    "facebook": profile.facebook_url,
                },
            }
        )

    def update(self, request, *args, **kwargs):
        """Override update to handle profile creation if needed"""
        profile = self.get_user_profile()
        serializer = self.get_serializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """Override partial_update to handle profile creation if needed"""
        return self.update(request, *args, **kwargs)

    # Additional helper methods for better organization
    @action(detail=False, methods=["patch"])
    def update_social_media(self, request):
        """Update social media links only"""
        profile = self.get_user_profile()
        allowed_fields = ["linkedin_url", "twitter_url", "facebook_url"]

        # Filter request data to only include social media fields
        filtered_data = {k: v for k, v in request.data.items() if k in allowed_fields}

        serializer = self.get_serializer(profile, data=filtered_data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {
                    "message": "Social media links updated successfully",
                    "social_media": {
                        "linkedin": profile.linkedin_url,
                        "twitter": profile.twitter_url,
                        "facebook": profile.facebook_url,
                    },
                }
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["patch"])
    def update_privacy_settings(self, request):
        """Update privacy settings only"""
        profile = self.get_user_profile()
        allowed_fields = ["is_profile_public", "receive_notifications"]

        filtered_data = {k: v for k, v in request.data.items() if k in allowed_fields}

        serializer = self.get_serializer(profile, data=filtered_data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {
                    "message": "Privacy settings updated successfully",
                    "settings": {
                        "is_profile_public": profile.is_profile_public,
                        "receive_notifications": profile.receive_notifications,
                    },
                }
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
