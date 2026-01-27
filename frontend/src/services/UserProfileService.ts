/**
 * User Profile Service
 *
 * Manages user profile operations including:
 * - Profile CRUD operations
 * - Profile picture upload
 * - Social media links
 * - Privacy settings
 * - Contact information
 * - Verification status
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface UserProfile {
  id: number;
  user: number;
  user_email?: string;
  user_full_name?: string;
  user_role?: string;
  bio?: string;
  profile_image_url?: string;
  primary_phone?: string;
  address?: string;
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  is_profile_public: boolean;
  receive_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserProfileData {
  bio?: string;
  primary_phone?: string;
  address?: string;
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  is_profile_public?: boolean;
  receive_notifications?: boolean;
}

export interface UpdateUserProfileData extends Partial<CreateUserProfileData> {}

export interface UserProfileSummary {
  id: number;
  user_full_name: string;
  user_email: string;
  user_role: string;
  profile_image_url?: string;
  is_profile_public: boolean;
}

export interface UserProfileContact {
  email: string;
  phone_number?: string;
  address?: string;
}

export interface UserProfileContactDetails {
  email: string;
  phone_number?: string;
  address?: string;
  social_media: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
}

export interface UserVerificationStatus {
  email_verified: boolean;
  is_active: boolean;
  verification_code_valid: boolean;
}

export interface UserAccountStatus {
  email_verified: boolean;
  is_active: boolean;
  verification_code_valid: boolean;
  can_login: boolean;
}

export interface UserFullProfileData {
  user: {
    id: number;
    email: string;
    username: string;
    full_name: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
    email_verified: boolean;
    date_joined: string;
  };
  profile: UserProfile;
}

export interface SocialMediaLinks {
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
}

export interface PrivacySettings {
  is_profile_public: boolean;
  receive_notifications: boolean;
}

export interface UserListItem {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

// ============================================================================
// USER PROFILE SERVICE
// ============================================================================

class UserProfileService {
  // ============================================================================
  // BASIC PROFILE OPERATIONS
  // ============================================================================

  /**
   * Get all user profiles (filtered to current user)
   */
  async getUserProfiles(): Promise<UserProfile[]> {
    try {
      const response = await api.get('/api/userprofile/');
      return response.results || response;
    } catch (error) {
      console.error('Error fetching user profiles:', error);
      throw error;
    }
  }

  /**
   * Get a single user profile by ID
   */
  async getUserProfile(id: number): Promise<UserProfile> {
    try {
      const response = await api.get(`/api/userprofile/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching user profile ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a user profile
   */
  async createUserProfile(data: CreateUserProfileData): Promise<UserProfile> {
    try {
      const response = await api.post('/api/userprofile/', data);
      return response;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
  }

  /**
   * Update a user profile
   */
  async updateUserProfile(id: number, data: UpdateUserProfileData): Promise<UserProfile> {
    try {
      const response = await api.patch(`/api/userprofile/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating user profile ${id}:`, error);
      throw error;
    }
  }

  // Note: Delete is disabled in the backend (returns 403)
  // Keeping this for completeness but it will fail
  async deleteUserProfile(id: number): Promise<void> {
    try {
      await api.delete(`/api/userprofile/${id}/`);
    } catch (error) {
      console.error(`Error deleting user profile ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // CURRENT USER PROFILE OPERATIONS
  // ============================================================================

  /**
   * Get the current user's profile with complete information
   */
  async getMyProfile(): Promise<UserProfile> {
    try {
      const response = await api.get('/api/userprofile/me/');
      return response;
    } catch (error) {
      console.error('Error fetching my profile:', error);
      throw error;
    }
  }

  /**
   * Get complete profile data including all user information
   */
  async getFullProfile(): Promise<UserFullProfileData> {
    try {
      const response = await api.get('/api/userprofile/full_profile/');
      return response;
    } catch (error) {
      console.error('Error fetching full profile:', error);
      throw error;
    }
  }

  /**
   * Get a summary of user profile information
   */
  async getProfileSummary(): Promise<UserProfileSummary> {
    try {
      const response = await api.get('/api/userprofile/summary/');
      return response;
    } catch (error) {
      console.error('Error fetching profile summary:', error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(data: UpdateUserProfileData): Promise<UserProfile> {
    try {
      const response = await api.patch('/api/userprofile/update_preferences/', data);
      return response;
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  }

  // ============================================================================
  // PROFILE PICTURE OPERATIONS
  // ============================================================================

  /**
   * Upload profile picture
   */
  async uploadProfilePicture(file: File): Promise<{
    message: string;
    profile_picture_url: string;
  }> {
    try {
      const formData = new FormData();
      formData.append('profile_image', file);

      const response = await fetch('/api/userprofile/upload_profile_picture/', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(error.detail || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      throw error;
    }
  }

  // ============================================================================
  // USER LISTING (ADMIN)
  // ============================================================================

  /**
   * Get all users (admin, teachers, staff only - requires admin privileges)
   */
  async getAllUsers(): Promise<UserListItem[]> {
    try {
      const response = await api.get('/api/userprofile/all_users/');
      return response;
    } catch (error) {
      console.error('Error fetching all users:', error);
      throw error;
    }
  }

  // ============================================================================
  // VERIFICATION & STATUS OPERATIONS
  // ============================================================================

  /**
   * Get user verification status
   */
  async getVerificationStatus(): Promise<UserVerificationStatus> {
    try {
      const response = await api.get('/api/userprofile/verification_status/');
      return response;
    } catch (error) {
      console.error('Error fetching verification status:', error);
      throw error;
    }
  }

  /**
   * Get user's account status information
   */
  async getUserStatus(): Promise<UserAccountStatus> {
    try {
      const response = await api.get('/api/userprofile/user_status/');
      return response;
    } catch (error) {
      console.error('Error fetching user status:', error);
      throw error;
    }
  }

  // ============================================================================
  // CONTACT INFORMATION OPERATIONS
  // ============================================================================

  /**
   * Get user's contact information
   */
  async getContactInfo(): Promise<UserProfileContact> {
    try {
      const response = await api.get('/api/userprofile/contact_info/');
      return response;
    } catch (error) {
      console.error('Error fetching contact info:', error);
      throw error;
    }
  }

  /**
   * Get user's detailed contact information including social media
   */
  async getContactDetails(): Promise<UserProfileContactDetails> {
    try {
      const response = await api.get('/api/userprofile/contact_details/');
      return response;
    } catch (error) {
      console.error('Error fetching contact details:', error);
      throw error;
    }
  }

  // ============================================================================
  // SOCIAL MEDIA OPERATIONS
  // ============================================================================

  /**
   * Update social media links only
   */
  async updateSocialMedia(data: SocialMediaLinks): Promise<{
    message: string;
    social_media: {
      linkedin?: string;
      twitter?: string;
      facebook?: string;
    };
  }> {
    try {
      const response = await api.patch('/api/userprofile/update_social_media/', data);
      return response;
    } catch (error) {
      console.error('Error updating social media:', error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVACY SETTINGS OPERATIONS
  // ============================================================================

  /**
   * Update privacy settings only
   */
  async updatePrivacySettings(data: PrivacySettings): Promise<{
    message: string;
    settings: {
      is_profile_public: boolean;
      receive_notifications: boolean;
    };
  }> {
    try {
      const response = await api.patch('/api/userprofile/update_privacy_settings/', data);
      return response;
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if user profile exists, create if not
   */
  async ensureProfileExists(data?: CreateUserProfileData): Promise<UserProfile> {
    try {
      // Try to get existing profile
      return await this.getMyProfile();
    } catch (error: any) {
      // If profile doesn't exist (404), create it
      if (error.response?.status === 404) {
        return await this.createUserProfile(data || {});
      }
      throw error;
    }
  }

  /**
   * Update current user's profile (ensures profile exists first)
   */
  async updateMyProfile(data: UpdateUserProfileData): Promise<UserProfile> {
    try {
      const profile = await this.getMyProfile();
      return await this.updateUserProfile(profile.id, data);
    } catch (error) {
      console.error('Error updating my profile:', error);
      throw error;
    }
  }

  /**
   * Get or create current user's profile
   */
  async getOrCreateMyProfile(defaultData?: CreateUserProfileData): Promise<UserProfile> {
    return this.ensureProfileExists(defaultData);
  }

  /**
   * Check if user can login (active and email verified)
   */
  async canUserLogin(): Promise<boolean> {
    try {
      const status = await this.getUserStatus();
      return status.can_login;
    } catch (error) {
      console.error('Error checking if user can login:', error);
      return false;
    }
  }

  /**
   * Toggle profile visibility
   */
  async toggleProfileVisibility(isPublic: boolean): Promise<any> {
    return this.updatePrivacySettings({ is_profile_public: isPublic, receive_notifications: undefined as any });
  }

  /**
   * Toggle notifications
   */
  async toggleNotifications(enabled: boolean): Promise<any> {
    return this.updatePrivacySettings({ receive_notifications: enabled, is_profile_public: undefined as any });
  }
}

export const userProfileService = new UserProfileService();
export default userProfileService;
