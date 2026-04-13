/**
 * Comprehensive Authentication Hook
 *
 * Merges all AuthService functionality into a single React context/hook.
 *
 * Production (HTTPS): Uses httpOnly cookies for XSS protection
 * Development (HTTP): Falls back to localStorage tokens for cross-origin support
 *
 * Covers:
 *  - Email/password login & registration
 *  - Google Identity Services (One Tap + popup fallback)
 *  - Token/cookie management
 *  - Profile, verification status, contact info
 *  - Password reset / change / confirm
 *  - Email verification
 *  - Account deletion
 *  - Logout
 */

import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from 'react';
import type {
  LoginCredentials,
  UserProfile,
  FullUserData,
  GoogleUserInfo,
  GoogleRegistrationData,
  UserVerificationStatus,
  UserContactInfo,
} from '@/types/types';
import { UserRole } from '@/types/types';
import api, { clearTokens } from '@/services/api';

/**
 * Auth-specific response shape used by login, register, password reset, etc.
 *
 * Intentionally separate from the paginated ApiResponse<T> in types.ts
 * ({ results, count, next, previous }) which is for list endpoints only.
 */
export interface AuthResponse {
  success: boolean;
  message: string;
  data?: any;
  errors?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const clearAuthData = () => {
  localStorage.removeItem('userData');
  localStorage.removeItem('userProfile');
  localStorage.removeItem('tenantSlug');
  clearTokens();
  sessionStorage.clear();
};

const mapServerRoleToEnum = (rawRole: any): UserRole => {
  if (!rawRole) throw new Error('No role provided by server');

  const roleMapping: Record<string, UserRole> = {
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

  const role = roleMapping[rawRole.toString().toUpperCase()];
  if (!role) throw new Error(`Invalid role: ${rawRole}`);
  return role;
};

/**
 * Extra runtime fields the server always returns but that aren't declared
 * on the shared FullUserData union (which is driven by the type definitions
 * in types.ts).  We tack them on as an intersection so they're accessible
 * throughout the hook without polluting the shared types file.
 */
export type HydratedUserData = FullUserData & {
  tenant_id: string | null;
  tenant_slug: string | null;
};

const buildUserData = (rawUserData: any, role: UserRole): HydratedUserData => {
  // Fields common to every role variant
  const base = {
    id: rawUserData.id,
    email: rawUserData.email,
    first_name: rawUserData.first_name || '',
    last_name: rawUserData.last_name || '',
    is_superuser: rawUserData.is_superuser || false,
    is_staff: rawUserData.is_staff || false,
    is_active: rawUserData.is_active !== undefined ? rawUserData.is_active : true,
    // Runtime extras (not on the shared type, added via HydratedUserData)
    tenant_id: (rawUserData.tenant_id ?? rawUserData.tenant?.id ?? null) as string | null,
    tenant_slug: (rawUserData.tenant_slug ?? rawUserData.tenant?.slug ?? null) as string | null,
  };

  switch (role) {
    case UserRole.STUDENT:
      return { ...base, role: UserRole.STUDENT, student_data: rawUserData.student_data || {} } as HydratedUserData;
    case UserRole.TEACHER:
      return { ...base, role: UserRole.TEACHER, teacher_data: rawUserData.teacher_data || {} } as HydratedUserData;
    case UserRole.PARENT:
      return { ...base, role: UserRole.PARENT, parent_data: rawUserData.parent_data || {} } as HydratedUserData;
    case UserRole.ADMIN:
    case UserRole.SUPERADMIN:
    case UserRole.NURSERY_ADMIN:
    case UserRole.PRIMARY_ADMIN:
    case UserRole.JUNIOR_SECONDARY_ADMIN:
    case UserRole.SENIOR_SECONDARY_ADMIN:
    case UserRole.SECONDARY_ADMIN:
      return { ...base, role, admin_data: rawUserData.admin_data || {} } as HydratedUserData;
    default:
      throw new Error(`Unsupported role: ${role}`);
  }
};

/** Persist user + tenant slug after a successful auth response */
const persistAuthSuccess = (data: any): HydratedUserData | null => {
  const rawUser = data.user || data.data?.user;
  if (!rawUser) return null;

  try {
    const role = mapServerRoleToEnum(rawUser.role);
    const userData = buildUserData(rawUser, role);
    localStorage.setItem('userData', JSON.stringify(userData));

    const tenantSlug = rawUser.tenant?.slug || rawUser.tenant_slug;
    if (tenantSlug) localStorage.setItem('tenantSlug', tenantSlug);

    return userData;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Google Identity Services helpers
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

let googleInitialized = false;

const getCSRFToken = (): string =>
  document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='))
    ?.split('=')[1] || '';

const decodeGoogleJWT = (token: string): GoogleUserInfo | undefined => {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    );
  } catch {
    return undefined;
  }
};

const initGoogleIdentity = (): Promise<void> => {
  if (googleInitialized) return Promise.resolve();
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error('Google Client ID not configured'));

  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) {
      setupGoogleIdentity();
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setTimeout(() => { setupGoogleIdentity(); resolve(); }, 100);
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
};

const setupGoogleIdentity = () => {
  const google = (window as any).google;
  if (!google?.accounts?.id) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    auto_select: false,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: false,
    callback: () => {}, // overridden per-call
  });
  googleInitialized = true;
};

/** Shows Google One-Tap, falls back to a hidden rendered button popup */
const triggerGoogleFlow = (): Promise<string> =>
  new Promise(async (resolve, reject) => {
    try {
      await initGoogleIdentity();
    } catch (err) {
      return reject(err);
    }

    const google = (window as any).google;
    if (!google?.accounts?.id) return reject(new Error('Google services unavailable'));

    const timeout = setTimeout(() => reject(new Error('Google sign-in timed out')), 30_000);

    const onCredential = (credential: string) => {
      clearTimeout(timeout);
      resolve(credential);
    };

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      cancel_on_tap_outside: false,
      use_fedcm_for_prompt: false,
      callback: (response: any) => {
        if (response.credential) onCredential(response.credential);
        else { clearTimeout(timeout); reject(new Error('No credential from Google')); }
      },
    });

    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: render a hidden button and click it
        const tempDiv = document.createElement('div');
        Object.assign(tempDiv.style, { position: 'fixed', top: '-9999px', left: '-9999px', visibility: 'hidden' });
        document.body.appendChild(tempDiv);

        google.accounts.id.renderButton(tempDiv, { theme: 'outline', size: 'large', width: 200 });

        setTimeout(() => {
          const btn = tempDiv.querySelector('div[role="button"]') as HTMLElement | null;
          btn?.click();
          setTimeout(() => document.body.contains(tempDiv) && document.body.removeChild(tempDiv), 5_000);
        }, 100);
      }
    });
  });

// ---------------------------------------------------------------------------
// SignupCredentials type (was only in AuthService)
// ---------------------------------------------------------------------------

export interface SignupCredentials {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  confirmPassword?: string;
  role: 'student' | 'teacher' | 'parent' | 'admin';
  phone?: string;
  agreeToTerms: boolean;
  subscribeNewsletter: boolean;
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface AuthContextType {
  // State
  user: HydratedUserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Core auth
  login: (credentials: LoginCredentials) => Promise<HydratedUserData | undefined>;
  logout: () => Promise<void>;
  register: (credentials: SignupCredentials) => Promise<AuthResponse>;
  checkAuthStatus: () => Promise<boolean>;

  // Google auth
  googleLogin: () => Promise<HydratedUserData | undefined>;
  googleRegister: (data: GoogleRegistrationData) => Promise<AuthResponse>;
  /**
   * Triggers the Google OAuth flow and returns raw credential info.
   * Useful when you need to collect additional fields (role, phone, etc.)
   * before completing registration.
   */
  googleSignInForRegistration: () => Promise<{
    success: boolean;
    credential?: string;
    userInfo?: GoogleUserInfo;
    error?: string;
  }>;

  // Profile
  updateUser: (userData: Partial<HydratedUserData>) => void;
  fetchUserProfile: () => Promise<UserProfile | null>;
  updateUserProfile: (profileData: Partial<UserProfile>) => Promise<UserProfile | null>;
  uploadProfilePicture: (file: File) => Promise<string | null>;
  fetchVerificationStatus: () => Promise<UserVerificationStatus | null>;
  fetchContactInfo: () => Promise<UserContactInfo | null>;
  refreshUserData: () => Promise<void>;

  // Password & account
  resetPassword: (email: string) => Promise<AuthResponse>;
  confirmPasswordReset: (token: string, newPassword: string, confirmPassword: string) => Promise<AuthResponse>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<AuthResponse>;
  deleteAccount: (password: string) => Promise<AuthResponse>;

  // Email verification
  sendVerificationEmail: (email: string) => Promise<AuthResponse>;
  resendVerification: (email: string) => Promise<AuthResponse>;
  verifyEmail: (token: string) => Promise<AuthResponse>;

  // Utilities
  checkEmailExists: (email: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<HydratedUserData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ------------------------------------------------------------------
  // Boot: verify session storage from backend
  // ------------------------------------------------------------------
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedUserData = localStorage.getItem('userData');
  

        if (storedUserData) {
          try {
            setUser(JSON.parse(storedUserData) as HydratedUserData);
          } catch {
            console.warn('Failed to parse stored user data');
          }
        }

        await api.initCSRF();

        const authStatus = await api.checkAuthStatus();

        if (authStatus.authenticated && authStatus.user) {
          const role = mapServerRoleToEnum(authStatus.user.role);
          const userData = buildUserData(authStatus.user, role);
          setUser(userData);
          localStorage.setItem('userData', JSON.stringify(userData));
          refreshUserDataSilent(userData).catch(console.warn);
        } else if (!storedUserData) {
          setUser(null);
        }
      } catch (error) {
        console.warn('Auth check error:', error);
        // Don't clear on error — could be a transient network issue
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Listen for token-expiry events emitted by the API layer
  useEffect(() => {
    const handle = () => {
      clearAuthData();
      setUser(null);
      setIsLoading(false);
    };
    window.addEventListener('auth:expired', handle);
    return () => window.removeEventListener('auth:expired', handle);
  }, []);

  // ------------------------------------------------------------------
  // Internal silent refresh (no setIsLoading)
  // ------------------------------------------------------------------
  const refreshUserDataSilent = async (base: HydratedUserData): Promise<void> => {
    const [profileRes, verifyRes, contactRes] = await Promise.allSettled([
      api.get('/api/profiles/me/'),
      api.get('/api/profiles/verification-status/'),
      api.get('/api/profiles/contact-info/'),
    ]);

    const updated = { ...base };
    if (profileRes.status === 'fulfilled') updated.profile = profileRes.value;
    if (verifyRes.status === 'fulfilled') updated.verification_status = verifyRes.value;
    if (contactRes.status === 'fulfilled') updated.contact_info = contactRes.value;

    setUser(updated);
    localStorage.setItem('userData', JSON.stringify(updated));
  };

  // ------------------------------------------------------------------
  // Core auth
  // ------------------------------------------------------------------

  const checkAuthStatus = async (): Promise<boolean> => {
    try {
      const status = await api.checkAuthStatus();
      return status.authenticated;
    } catch {
      return false;
    }
  };

  const login = async (credentials: LoginCredentials): Promise<HydratedUserData | undefined> => {
    setIsLoading(true);
    try {
      const response = await api.post('/api/auth/login/', {
        email: credentials.email,
        password: credentials.password,
      });

      const rawUser = response.user;
      if (!rawUser) throw new Error('No user data received from server');

      const role = mapServerRoleToEnum(rawUser.role);
      const userData = buildUserData(rawUser, role);

      localStorage.setItem('userData', JSON.stringify(userData));
      if (userData.tenant_slug) localStorage.setItem('tenantSlug', userData.tenant_slug);
      setUser(userData);

      // Background fetch of extra profile data
      refreshUserDataSilent(userData).catch(console.warn);

      return userData;
    } catch (error) {
      clearAuthData();
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post('/api/auth/logout/', {});
    } catch (error) {
      console.warn('Server logout failed, continuing locally:', error);
    } finally {
      clearAuthData();
      setUser(null);
      setIsLoading(false);
    }
  };

  const register = async (credentials: SignupCredentials): Promise<AuthResponse> => {
    try {
      const payload: Record<string, any> = {
        first_name: credentials.firstName,
        last_name: credentials.lastName,
        email: credentials.email,
        role: credentials.role,
        agree_to_terms: credentials.agreeToTerms,
        subscribe_newsletter: credentials.subscribeNewsletter,
      };

      if (credentials.phone?.trim()) payload.phone_number = credentials.phone;
      if (credentials.password) payload.password = credentials.password;
      if (credentials.confirmPassword) payload.password_confirm = credentials.confirmPassword;

      const response = await fetch(`${BASE_URL}/auth/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.message || data.non_field_errors?.[0] || 'Registration failed',
          errors: data.errors || data,
        };
      }

      // Some backends return auto-generated credentials
      let credentialsInfo = '';
      const u = data.username || data.generated_username;
      const p = data.password || data.generated_password;
      if (u && p) credentialsInfo = `\nUsername: ${u}\nPassword: ${p}`;

      return {
        success: true,
        message: (data.message || 'Account created successfully! Please check your email for verification.') + credentialsInfo,
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Network error. Please check your connection and try again.',
        errors: { network: 'Connection failed' },
      };
    }
  };

  // ------------------------------------------------------------------
  // Google auth
  // ------------------------------------------------------------------

  /**
   * Full Google login: triggers OAuth flow, sends token to backend,
   * sets user state on success.
   */
  const googleLogin = async (): Promise<HydratedUserData | undefined> => {
    if (!GOOGLE_CLIENT_ID) throw new Error('Google Client ID is not configured');

    setIsLoading(true);
    try {
      const credential = await triggerGoogleFlow();

      const response = await fetch(`${BASE_URL}/auth/google/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken(),
        },
        credentials: 'include',
        body: JSON.stringify({ id_token: credential }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.non_field_errors?.[0] || 'Google login failed');
      }

      const userData = persistAuthSuccess(data);
      if (!userData) throw new Error('Could not parse user data from Google login response');

      setUser(userData);
      refreshUserDataSilent(userData).catch(console.warn);
      return userData;
    } catch (error) {
      clearAuthData();
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Step 1 of Google registration: get the OAuth credential + decoded user info
   * so the UI can pre-fill name/email and collect role, phone, etc.
   */
  const googleSignInForRegistration = async (): Promise<{
    success: boolean;
    credential?: string;
    userInfo?: GoogleUserInfo;
    error?: string;
  }> => {
    if (!GOOGLE_CLIENT_ID) return { success: false, error: 'Google Client ID is not configured' };

    try {
      const credential = await triggerGoogleFlow();
      const userInfo = decodeGoogleJWT(credential);
      return { success: true, credential, userInfo };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  /**
   * Step 2 of Google registration: send credential + extra fields to backend.
   */
  const googleRegister = async (registrationData: GoogleRegistrationData): Promise<AuthResponse> => {
    try {
      const response = await fetch(`${BASE_URL}/auth/google/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken(),
        },
        credentials: 'include',
        body: JSON.stringify({
          id_token: registrationData.googleCredential,
          first_name: registrationData.firstName,
          last_name: registrationData.lastName,
          role: registrationData.role,
          phone: registrationData.phone,
          agree_to_terms: registrationData.agreeToTerms,
          subscribe_newsletter: registrationData.subscribeNewsletter,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.message || data.non_field_errors?.[0] || 'Google registration failed',
          errors: data.errors || data,
        };
      }

      const userData = persistAuthSuccess(data);
      if (userData) {
        setUser(userData);
        refreshUserDataSilent(userData).catch(console.warn);
      }

      return {
        success: true,
        message: data.message || 'Registration successful',
        data,
      };
    } catch {
      return {
        success: false,
        message: 'Registration error. Please check your connection.',
        errors: { network: 'Connection failed' },
      };
    }
  };

  // ------------------------------------------------------------------
  // Profile
  // ------------------------------------------------------------------

  const updateUser = (userUpdate: Partial<HydratedUserData>): void => {
    if (!user) return;
    const updatedRole = userUpdate.role || user.role;

    let updatedUser: HydratedUserData;

    const mergeRoleData = (roleKey: string) => ({
      ...user,
      ...userUpdate,
      role: updatedRole,
      [roleKey]: { ...(user as any)[roleKey], ...(userUpdate as any)[roleKey] },
    });

    switch (updatedRole) {
      case UserRole.STUDENT:
        updatedUser = mergeRoleData('student_data') as HydratedUserData;
        break;
      case UserRole.TEACHER:
        updatedUser = mergeRoleData('teacher_data') as HydratedUserData;
        break;
      case UserRole.PARENT:
        updatedUser = mergeRoleData('parent_data') as HydratedUserData;
        break;
      default:
        updatedUser = { ...user, ...userUpdate, role: updatedRole } as HydratedUserData;
    }

    setUser(updatedUser);
    localStorage.setItem('userData', JSON.stringify(updatedUser));
  };

  const fetchUserProfile = async (): Promise<UserProfile | null> => {
    try {
      const profile: UserProfile = await api.get('/api/profiles/me/');
      if (user) {
        const updated = { ...user, profile };
        setUser(updated);
        localStorage.setItem('userData', JSON.stringify(updated));
      }
      return profile;
    } catch {
      return null;
    }
  };

  const updateUserProfile = async (profileData: Partial<UserProfile>): Promise<UserProfile | null> => {
    try {
      const updatedProfile: UserProfile = await api.patch('/api/profiles/update_preferences/', profileData);
      if (user) {
        const updated = { ...user, profile: updatedProfile };
        setUser(updated);
        localStorage.setItem('userData', JSON.stringify(updated));
      }
      return updatedProfile;
    } catch {
      return null;
    }
  };

  const uploadProfilePicture = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('profile_image', file);
      const response = await api.post('/profiles/profiles/upload_profile_picture/', formData);
      const url: string = response.profile_picture_url;

      if (user?.profile) {
        const updated = { ...user, profile: { ...user.profile, profile_image_url: url } };
        setUser(updated);
        localStorage.setItem('userData', JSON.stringify(updated));
      }
      return url;
    } catch {
      return null;
    }
  };

  const fetchVerificationStatus = async (): Promise<UserVerificationStatus | null> => {
    try {
      const status: UserVerificationStatus = await api.get('/api/profiles/profiles/verification_status/');
      if (user) {
        const updated = { ...user, verification_status: status };
        setUser(updated);
        localStorage.setItem('userData', JSON.stringify(updated));
      }
      return status;
    } catch {
      return null;
    }
  };

  const fetchContactInfo = async (): Promise<UserContactInfo | null> => {
    try {
      const info: UserContactInfo = await api.get('/api/profiles/profiles/contact_info/');
      if (user) {
        const updated = { ...user, contact_info: info };
        setUser(updated);
        localStorage.setItem('userData', JSON.stringify(updated));
      }
      return info;
    } catch {
      return null;
    }
  };

  const refreshUserData = async (): Promise<void> => {
    if (!user) return;
    await refreshUserDataSilent(user);
  };

  // ------------------------------------------------------------------
  // Password & account
  // ------------------------------------------------------------------

  const resetPassword = async (email: string): Promise<AuthResponse> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return {
        success: res.ok,
        message: data.message || (res.ok ? 'Password reset email sent' : 'Failed to send reset email'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch {
      return { success: false, message: 'Network error', errors: { network: 'Connection failed' } };
    }
  };

  const confirmPasswordReset = async (
    token: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<AuthResponse> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/confirm-reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword, confirm_password: confirmPassword }),
      });
      const data = await res.json();
      return {
        success: res.ok,
        message: data.message || (res.ok ? 'Password reset successful' : 'Password reset failed'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch {
      return { success: false, message: 'Network error', errors: { network: 'Connection failed' } };
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<AuthResponse> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken(),
        },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await res.json();
      return {
        success: res.ok,
        message: data.message || (res.ok ? 'Password changed successfully' : 'Failed to change password'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch {
      return { success: false, message: 'Network error', errors: { network: 'Connection failed' } };
    }
  };

  const deleteAccount = async (password: string): Promise<AuthResponse> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/delete-account/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCSRFToken(),
        },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.ok) {
        clearAuthData();
        setUser(null);
      }

      return {
        success: res.ok,
        message: data.message || (res.ok ? 'Account deleted successfully' : 'Failed to delete account'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch {
      return { success: false, message: 'Network error', errors: { network: 'Connection failed' } };
    }
  };

  // ------------------------------------------------------------------
  // Email verification
  // ------------------------------------------------------------------

  const sendVerificationEmail = async (email: string): Promise<AuthResponse> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/send-verification/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return {
        success: res.ok,
        message: data.message || (res.ok ? 'Verification email sent' : 'Failed to send email'),
        data: data.data,
      };
    } catch {
      return { success: false, message: 'Network error', errors: { network: 'Connection failed' } };
    }
  };

  const resendVerification = (email: string): Promise<AuthResponse> => sendVerificationEmail(email);

  const verifyEmail = async (token: string): Promise<AuthResponse> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/verify-email/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      return {
        success: res.ok,
        message: data.message || (res.ok ? 'Email verified successfully' : 'Email verification failed'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch {
      return { success: false, message: 'Network error', errors: { network: 'Connection failed' } };
    }
  };

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------

  const checkEmailExists = async (email: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE_URL}/auth/check-email/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return data.exists || false;
    } catch {
      return false;
    }
  };

  // ------------------------------------------------------------------
  // Context value
  // ------------------------------------------------------------------

  const value: AuthContextType = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,

    login,
    logout,
    register,
    checkAuthStatus,

    googleLogin,
    googleRegister,
    googleSignInForRegistration,

    updateUser,
    fetchUserProfile,
    updateUserProfile,
    uploadProfilePicture,
    fetchVerificationStatus,
    fetchContactInfo,
    refreshUserData,

    resetPassword,
    confirmPasswordReset,
    changePassword,
    deleteAccount,

    sendVerificationEmail,
    resendVerification,
    verifyEmail,

    checkEmailExists,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export { api };