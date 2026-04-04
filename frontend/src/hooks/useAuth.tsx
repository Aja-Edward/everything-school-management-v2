/**
 * Authentication Hook with Hybrid Cookie/Token Support
 *
 * Production (HTTPS): Uses httpOnly cookies for XSS protection
 * Development (HTTP): Falls back to localStorage tokens for cross-origin support
 *
 * User data is stored in localStorage for initial render optimization.
 */

import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from 'react';
import type { LoginCredentials, UserProfile, FullUserData } from '@/types/types';
import {
  UserRole,
  UserVerificationStatus,
  UserContactInfo,
} from '@/types/types';
import api, { storeTokens, clearTokens } from '@/services/api';

// Helper function to clear all auth data
const clearAuthData = () => {
  localStorage.removeItem('userData');
  localStorage.removeItem('userProfile');
  clearTokens(); // Clear tokens (for development fallback)
  sessionStorage.clear();
  console.log('Auth data cleared');
};

// Helper function to map server role to enum
const mapServerRoleToEnum = (rawRole: any): UserRole => {
  if (!rawRole) {
    console.error('mapServerRoleToEnum: No role provided by server');
    throw new Error('No role provided by server');
  }

  const roleString = rawRole.toString().toUpperCase();

  const roleMapping: { [key: string]: UserRole } = {
    ADMIN: UserRole.ADMIN,
    TEACHER: UserRole.TEACHER,
    STUDENT: UserRole.STUDENT,
    PARENT: UserRole.PARENT,
    SUPERADMIN: UserRole.SUPERADMIN,
    NURSERY_ADMIN: UserRole.NURSERY_ADMIN,
    PRIMARY_ADMIN: UserRole.PRIMARY_ADMIN,
    JUNIOR_SECONDARY_ADMIN: UserRole.JUNIOR_SECONDARY_ADMIN,
    SENIOR_SECONDARY_ADMIN: UserRole.SENIOR_SECONDARY_ADMIN,
    SECONDARY_ADMIN: UserRole.SECONDARY_ADMIN,
  };

  const finalRole = roleMapping[roleString];

  if (!finalRole) {
    console.error('mapServerRoleToEnum: Invalid role received:', rawRole);
    throw new Error(
      `Invalid role received: ${rawRole}. Expected one of: ${Object.values(UserRole).join(', ')}`
    );
  }

  return finalRole;
};

interface AuthContextType {
  user: FullUserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<FullUserData | undefined>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<FullUserData>) => void;
  fetchUserProfile: () => Promise<UserProfile | null>;
  updateUserProfile: (
    profileData: Partial<UserProfile>
  ) => Promise<UserProfile | null>;
  uploadProfilePicture: (file: File) => Promise<string | null>;
  fetchVerificationStatus: () => Promise<UserVerificationStatus | null>;
  fetchContactInfo: () => Promise<UserContactInfo | null>;
  refreshUserData: () => Promise<void>;
  checkAuthStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FullUserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize auth state from localStorage
  // In development, we trust localStorage tokens; in production, cookies handle auth
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First, try to restore user data from localStorage for fast initial render
        const storedUserData = localStorage.getItem('userData');
        const storedToken = localStorage.getItem('authToken');

        if (storedUserData) {
          try {
            const parsedUser: FullUserData = JSON.parse(storedUserData);
            setUser(parsedUser);
            console.log('User restored from localStorage');

            // If we have a token, we're authenticated (development mode)
            if (storedToken) {
              console.log('Auth token found in localStorage - user is authenticated');
              setIsLoading(false);
              return; // Trust localStorage in development
            }
          } catch {
            console.warn('Failed to parse stored user data');
          }
        }

        // Initialize CSRF token
        await api.initCSRF();

        // Try to verify with backend (works in production with cookies)
        console.log('Checking authentication status with backend...');
        const authStatus = await api.checkAuthStatus();

        if (authStatus.authenticated && authStatus.user) {
          console.log('Backend authentication valid');

          // Build user data from response
          const rawUserData = authStatus.user;
          const role = mapServerRoleToEnum(rawUserData.role);

          const baseUserData = {
            id: rawUserData.id,
            email: rawUserData.email,
            first_name: rawUserData.first_name || '',
            last_name: rawUserData.last_name || '',
            is_superuser: rawUserData.is_superuser || false,
            is_staff: rawUserData.is_staff || false,
            is_active:
              rawUserData.is_active !== undefined ? rawUserData.is_active : true,
            tenant_id: rawUserData.tenant_id || null,
            tenant_slug: rawUserData.tenant_slug || null,
          };

          let userData: FullUserData;

          switch (role) {
            case UserRole.STUDENT:
              userData = {
                ...baseUserData,
                role: UserRole.STUDENT,
                student_data: rawUserData.student_data || {},
              };
              break;
            case UserRole.TEACHER:
              userData = {
                ...baseUserData,
                role: UserRole.TEACHER,
                teacher_data: rawUserData.teacher_data || {},
              };
              break;
            case UserRole.PARENT:
              userData = {
                ...baseUserData,
                role: UserRole.PARENT,
                parent_data: rawUserData.parent_data || {},
              };
              break;
            case UserRole.ADMIN:
            case UserRole.SUPERADMIN:
            case UserRole.NURSERY_ADMIN:
            case UserRole.PRIMARY_ADMIN:
            case UserRole.JUNIOR_SECONDARY_ADMIN:
            case UserRole.SENIOR_SECONDARY_ADMIN:
            case UserRole.SECONDARY_ADMIN:
              userData = {
                ...baseUserData,
                role,
                admin_data: rawUserData.admin_data || {},
              };
              break;
            default:
              throw new Error(`Unsupported role: ${role}`);
          }

          setUser(userData);
          localStorage.setItem('userData', JSON.stringify(userData));

          // Optionally refresh additional profile data in background
          refreshUserData().catch(console.warn);
        } else if (!storedUserData) {
          // Only clear if we have NO stored data at all
          console.log('No authentication found');
          setUser(null);
        }
        // If storedUserData exists but backend check failed, keep the stored user
        // (this handles development cross-origin case)
      } catch (error) {
        console.warn('Auth check failed:', error);
        // Don't clear auth data on error - might be network issue
        // Only clear on explicit logout
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Listen for auth:expired events from API layer (token refresh failure)
  useEffect(() => {
    const handleAuthExpired = () => {
      console.log('🔒 Auth expired event received - clearing user state');
      clearAuthData();
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener('auth:expired', handleAuthExpired);

    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
    };
  }, []);

  /**
   * Check if user is authenticated (verifies with backend)
   */
  const checkAuthStatus = async (): Promise<boolean> => {
    try {
      const authStatus = await api.checkAuthStatus();
      return authStatus.authenticated;
    } catch {
      return false;
    }
  };

  /**
   * Login with credentials - backend sets httpOnly cookies
   */
  const login = async (
    credentials: LoginCredentials
  ): Promise<FullUserData | undefined> => {
    setIsLoading(true);

    try {
      console.log('Attempting login with:', { email: credentials.email });

      // Call login endpoint - backend will set cookies
      // Backend accepts both email and username in the 'email' field
      const response = await api.post('/api/auth/login/', {
        email: credentials.email,
        password: credentials.password,
      });

      console.log('Login response:', response);

      // In development, tokens are returned in body - store them for Authorization header fallback
      if (response.tokens) {
        storeTokens(response.tokens);
      }

      // Extract user data from response
      const rawUserData = response.user;

      if (!rawUserData) {
        console.error('No user data in login response:', response);
        throw new Error('No user data received from server');
      }

      const roleValue = rawUserData.role;
      if (!roleValue) {
        console.error('No role in user data:', rawUserData);
        throw new Error('No role provided by server');
      }

      const role = mapServerRoleToEnum(roleValue);
      console.log('Mapped role:', role);

      // Build userData object
      const baseUserData = {
        id: rawUserData.id,
        email: rawUserData.email,
        first_name: rawUserData.first_name || '',
        last_name: rawUserData.last_name || '',
        is_superuser: rawUserData.is_superuser || false,
        is_staff: rawUserData.is_staff || false,
        is_active:
          rawUserData.is_active !== undefined ? rawUserData.is_active : true,
        tenant_id: rawUserData.tenant_id || null,
        tenant_slug: rawUserData.tenant_slug || null,
      };

      let userData: FullUserData;

      switch (role) {
        case UserRole.STUDENT:
          userData = {
            ...baseUserData,
            role: UserRole.STUDENT,
            student_data: rawUserData.student_data || {},
          };
          break;

        case UserRole.TEACHER:
          userData = {
            ...baseUserData,
            role: UserRole.TEACHER,
            teacher_data: rawUserData.teacher_data || {},
          };
          break;

        case UserRole.ADMIN:
        case UserRole.SUPERADMIN:
        case UserRole.NURSERY_ADMIN:
        case UserRole.PRIMARY_ADMIN:
        case UserRole.JUNIOR_SECONDARY_ADMIN:
        case UserRole.SENIOR_SECONDARY_ADMIN:
        case UserRole.SECONDARY_ADMIN:
          userData = {
            ...baseUserData,
            role: role as
              | UserRole.ADMIN
              | UserRole.SUPERADMIN
              | UserRole.NURSERY_ADMIN
              | UserRole.PRIMARY_ADMIN
              | UserRole.JUNIOR_SECONDARY_ADMIN
              | UserRole.SENIOR_SECONDARY_ADMIN
              | UserRole.SECONDARY_ADMIN,
            admin_data: rawUserData.admin_data || {},
          };
          break;

        case UserRole.PARENT:
          userData = {
            ...baseUserData,
            role: UserRole.PARENT,
            parent_data: rawUserData.parent_data || {},
          };
          break;

        default:
          throw new Error(`Unsupported role: ${role}`);
      }

      console.log('User data object created:', userData);

      // Store user data in localStorage (not tokens - those are in httpOnly cookies)
      localStorage.setItem('userData', JSON.stringify(userData));
      setUser(userData);

      // Fetch additional profile data in background
      Promise.allSettled([
        api.get('/api/profiles/me/'),
        api.get('/api/profiles/verification-status/'),
        api.get('/api/profiles/contact-info/'),
      ])
        .then(([profileData, verificationStatus, contactInfo]) => {
          const updatedUser = { ...userData };
          let hasUpdates = false;

          if (profileData.status === 'fulfilled') {
            updatedUser.profile = profileData.value;
            hasUpdates = true;
          }
          if (verificationStatus.status === 'fulfilled') {
            updatedUser.verification_status = verificationStatus.value;
            hasUpdates = true;
          }
          if (contactInfo.status === 'fulfilled') {
            updatedUser.contact_info = contactInfo.value;
            hasUpdates = true;
          }

          if (hasUpdates) {
            setUser(updatedUser);
            localStorage.setItem('userData', JSON.stringify(updatedUser));
            console.log('Additional profile data loaded');
          }
        })
        .catch((error) => {
          console.warn('Could not fetch additional profile data:', error);
        });

      console.log('Login successful');
      return userData;
    } catch (error) {
      console.error('Login failed:', error);
      clearAuthData();
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Logout - backend clears cookies
   */
  const logout = async (): Promise<void> => {
    setIsLoading(true);

    try {
      // Call logout endpoint - backend will clear cookies
      await api.post('/api/auth/logout/', {});
      console.log('Server logout successful');
    } catch (error) {
      console.warn('Server logout failed, continuing with local logout:', error);
    } finally {
      // Always clear local user data
      clearAuthData();
      setUser(null);
      setIsLoading(false);
      console.log('Logout complete');
    }
  };

  const updateUser = (userUpdate: Partial<FullUserData>): void => {
    if (!user) return;

    const updatedRole = userUpdate.role || user.role;
    let updatedUser: FullUserData;

    switch (updatedRole) {
      case UserRole.STUDENT: {
        const current =
          user.role === UserRole.STUDENT ? user : { ...user, student_data: {} };
        updatedUser = {
          ...current,
          ...userUpdate,
          role: UserRole.STUDENT,
          student_data: {
            ...(current as any).student_data,
            ...(userUpdate as any).student_data,
          },
        };
        break;
      }

      case UserRole.TEACHER: {
        const current =
          user.role === UserRole.TEACHER ? user : { ...user, teacher_data: {} };
        updatedUser = {
          ...current,
          ...userUpdate,
          role: UserRole.TEACHER,
          teacher_data: {
            ...(current as any).teacher_data,
            ...(userUpdate as any).teacher_data,
          },
        };
        break;
      }

      case UserRole.PARENT: {
        const current =
          user.role === UserRole.PARENT ? user : { ...user, parent_data: {} };
        updatedUser = {
          ...current,
          ...userUpdate,
          role: UserRole.PARENT,
          parent_data: {
            ...(current as any).parent_data,
            ...(userUpdate as any).parent_data,
          },
        };
        break;
      }

      case UserRole.ADMIN:
      case UserRole.SUPERADMIN:
      case UserRole.NURSERY_ADMIN:
      case UserRole.PRIMARY_ADMIN:
      case UserRole.JUNIOR_SECONDARY_ADMIN:
      case UserRole.SENIOR_SECONDARY_ADMIN:
      case UserRole.SECONDARY_ADMIN: {
        updatedUser = {
          ...user,
          ...userUpdate,
          role: updatedRole as
            | UserRole.ADMIN
            | UserRole.SUPERADMIN
            | UserRole.NURSERY_ADMIN
            | UserRole.PRIMARY_ADMIN
            | UserRole.JUNIOR_SECONDARY_ADMIN
            | UserRole.SENIOR_SECONDARY_ADMIN
            | UserRole.SECONDARY_ADMIN,
        };
        break;
      }

      default:
        throw new Error(`Unsupported role: ${updatedRole}`);
    }

    setUser(updatedUser);
    localStorage.setItem('userData', JSON.stringify(updatedUser));
  };

  const fetchUserProfile = async (): Promise<UserProfile | null> => {
    try {
      const response = await api.get('/api/profiles/me/');
      const profile = response;

      if (user) {
        const updatedUser = { ...user, profile };
        setUser(updatedUser);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
      }

      return profile;
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      return null;
    }
  };

  const updateUserProfile = async (
    profileData: Partial<UserProfile>
  ): Promise<UserProfile | null> => {
    try {
      const response = await api.patch(
        '/api/profiles/update_preferences/',
        profileData
      );
      const updatedProfile = response;

      if (user) {
        const updatedUser = { ...user, profile: updatedProfile };
        setUser(updatedUser);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
      }

      return updatedProfile;
    } catch (error) {
      console.error('Failed to update user profile:', error);
      return null;
    }
  };

  const uploadProfilePicture = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('profile_image', file);

      const response = await api.post(
        '/profiles/profiles/upload_profile_picture/',
        formData
      );

      const profilePictureUrl = response.profile_picture_url;

      if (user && user.profile) {
        const updatedUser = {
          ...user,
          profile: {
            ...user.profile,
            profile_image_url: profilePictureUrl,
          },
        };
        setUser(updatedUser);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
      }

      return profilePictureUrl;
    } catch (error) {
      console.error('Failed to upload profile picture:', error);
      return null;
    }
  };

  const fetchVerificationStatus =
    async (): Promise<UserVerificationStatus | null> => {
      try {
        const response = await api.get(
          '/api/profiles/profiles/verification_status/'
        );
        const verificationStatus = response;

        if (user) {
          const updatedUser = {
            ...user,
            verification_status: verificationStatus,
          };
          setUser(updatedUser);
          localStorage.setItem('userData', JSON.stringify(updatedUser));
        }

        return verificationStatus;
      } catch (error) {
        console.error('Failed to fetch verification status:', error);
        return null;
      }
    };

  const fetchContactInfo = async (): Promise<UserContactInfo | null> => {
    try {
      const response = await api.get('/api/profiles/profiles/contact_info/');
      const contactInfo = response;

      if (user) {
        const updatedUser = { ...user, contact_info: contactInfo };
        setUser(updatedUser);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
      }

      return contactInfo;
    } catch (error) {
      console.error('Failed to fetch contact info:', error);
      return null;
    }
  };

  const refreshUserData = async (): Promise<void> => {
    if (!user) return;

    try {
      const [profileData, verificationStatus, contactInfo] =
        await Promise.allSettled([
          api.get('/api/profiles/me/'),
          api.get('/api/profiles/verification-status/'),
          api.get('/api/profiles/contact-info/'),
        ]);

      const updatedUser = { ...user };

      if (profileData.status === 'fulfilled') {
        updatedUser.profile = profileData.value.data;
      }
      if (verificationStatus.status === 'fulfilled') {
        updatedUser.verification_status = verificationStatus.value.data;
      }
      if (contactInfo.status === 'fulfilled') {
        updatedUser.contact_info = contactInfo.value.data;
      }

      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    logout,
    updateUser,
    fetchUserProfile,
    updateUserProfile,
    uploadProfilePicture,
    fetchVerificationStatus,
    fetchContactInfo,
    refreshUserData,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

export { api };
