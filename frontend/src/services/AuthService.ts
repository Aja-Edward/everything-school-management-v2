
// Types and Interfaces
export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignupCredentials {
  firstName: string;
  lastName: string;
  email: string;
  password?: string; // Optional since passwords are auto-generated
  confirmPassword?: string; // Optional since passwords are auto-generated
  role: 'student' | 'teacher' | 'parent' | 'admin';
  phone?: string;
  agreeToTerms: boolean;
  subscribeNewsletter: boolean;
}

export interface GoogleRegistrationData {
  firstName: string;
  lastName: string;
  email: string;
  role: 'student' | 'teacher' | 'parent' | 'admin';
  phone?: string;
  agreeToTerms: boolean;
  subscribeNewsletter: boolean;
  googleCredential: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  phone?: string;
  isEmailVerified: boolean;
  profilePicture?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  errors?: Record<string, string>;
}

export interface AuthState {
  isLoading: boolean;
  user: User | null;
  token: string | null;
  errors: Record<string, string>;
  successMessage: string;
}

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  verified_email: boolean;
}

// Google Types
interface GoogleUserInfo {
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email_verified: boolean;
  sub: string;
}

export class AuthService {
  private baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  private googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  private isGoogleInitialized = false;

  constructor() {
    console.log('Environment variables check:');
    console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
    console.log('VITE_GOOGLE_CLIENT_ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID);
    console.log('Base URL:', this.baseUrl);
    console.log('Google Client ID:', this.googleClientId ? '✅ Set' : '❌ Missing');
    
    if (!this.googleClientId) {
      console.error('❌ Google Client ID is not set! Check your .env file');
      return;
    }
    
      
    
    this.initializeGoogle();
  }

  // Initialize Google Identity Services
  private async initializeGoogle(): Promise<void> {
    if (this.isGoogleInitialized) return;

    return new Promise((resolve, reject) => {
      if ((window as any).google?.accounts?.id) {
        this.setupGoogleIdentity();
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        console.log('Google Identity Services script loaded');
        setTimeout(() => {
          this.setupGoogleIdentity();
          resolve();
        }, 100);
      };
      
      script.onerror = () => {
        console.error('Failed to load Google Identity Services script');
        reject(new Error('Failed to load Google Identity Services'));
      };
      
      document.head.appendChild(script);
    });
  }

  private setupGoogleIdentity(): void {
    try {
      const google = (window as any).google;
      if (!google?.accounts?.id) {
        throw new Error('Google Identity Services not available');
      }
      
      google.accounts.id.initialize({
        client_id: this.googleClientId,
        callback: (response: any) => {
          console.log('Google credential response:', response);
          this.handleGoogleCredentialResponse(response);
        },
        auto_select: false,
        cancel_on_tap_outside: false,
        // Add these configuration options
        use_fedcm_for_prompt: false,
      });
      
      this.isGoogleInitialized = true;
      console.log('Google Identity Services initialized successfully');
    } catch (error) {
      console.error('Google Identity Services initialization failed:', error);
    }
  }

  // Regular Registration - FIXED TYPO
  async register(credentials: SignupCredentials): Promise<ApiResponse> {
    try {
      const payload: any = {
        first_name: credentials.firstName,
        last_name: credentials.lastName,
        email: credentials.email,
        role: credentials.role,
        agree_to_terms: credentials.agreeToTerms,
        subscribe_newsletter: credentials.subscribeNewsletter,
      };

      // Only include phone_number if not empty
      if (credentials.phone && credentials.phone.trim() !== "") {
        payload.phone_number = credentials.phone;
      }

      // Only include password fields if provided (for backward compatibility)
      if (credentials.password) {
        payload.password = credentials.password;
      }
      if (credentials.confirmPassword) {
        payload.password_confirm = credentials.confirmPassword;
      }

      const response = await fetch(`${this.baseUrl}/auth/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      // If backend returns generated credentials, include them in the response
      let credentialsInfo = '';
      if (data.username && data.password) {
        credentialsInfo = `Username: ${data.username}\nPassword: ${data.password}`;
      } else if (data.generated_username && data.generated_password) {
        credentialsInfo = `Username: ${data.generated_username}\nPassword: ${data.generated_password}`;
      }

      return {
        success: true,
        message: (data.message || 'Account created successfully! Please check your email for verification.') + (credentialsInfo ? `\n${credentialsInfo}` : ''),
        data: data,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Network error. Please check your connection and try again.',
        errors: { network: 'Connection failed' },
      };
    }
  }

  // IMPROVED: Google Sign-in for registration flow
  async googleSignInForRegistration(): Promise<{ success: boolean; credential?: string; userInfo?: GoogleUserInfo; error?: string }> {
    try {
      if (!this.googleClientId) {
        return {
          success: false,
          error: 'Google Client ID is not configured'
        };
      }

      if (!this.isGoogleInitialized) {
        await this.initializeGoogle();
      }

      const google = (window as any).google;
      
      if (!google?.accounts?.id) {
        return {
          success: false,
          error: 'Google Identity Services not available'
        };
      }

      return new Promise((resolve) => {
        // Create a temporary callback for this specific request
        const tempCallback = async (response: any) => {
          if (response.credential) {
            try {
              const userInfo = this.decodeGoogleJWT(response.credential);
              resolve({
                success: true,
                credential: response.credential,
                userInfo: userInfo
              });
            } catch (error) {
              resolve({
                success: false,
                error: 'Failed to decode Google credential'
              });
            }
          } else {
            resolve({
              success: false,
              error: 'No credential received from Google'
            });
          }
        };

        // Temporarily override the callback
        const originalCallback = google.accounts.id.callback;
        google.accounts.id.callback = tempCallback;

        // Try to show the One Tap prompt first
        google.accounts.id.prompt((notification: any) => {
          console.log('Google ID prompt notification:', notification);
          
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // If One Tap doesn't work, fall back to popup
            this.showGoogleSignInPopup(resolve);
          }
        });

        // Restore original callback after a timeout
        setTimeout(() => {
          google.accounts.id.callback = originalCallback;
        }, 30000); // 30 seconds timeout
      });
    } catch (error) {
      console.error('Google sign-in for registration error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // NEW: Helper method to show Google Sign-in popup
  private showGoogleSignInPopup(resolve: (value: any) => void): void {
    const google = (window as any).google;
    
    // Create a hidden button to trigger the popup
    const tempButton = document.createElement('div');
    tempButton.style.position = 'fixed';
    tempButton.style.top = '-1000px';
    tempButton.style.left = '-1000px';
    tempButton.style.visibility = 'hidden';
    document.body.appendChild(tempButton);
    
    google.accounts.id.renderButton(tempButton, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      width: 200
    });
    
    setTimeout(() => {
      const button = tempButton.querySelector('div[role="button"]') as HTMLElement;
      if (button) {
        button.click();
      }
      
      // Clean up after 5 seconds
      setTimeout(() => {
        if (document.body.contains(tempButton)) {
          document.body.removeChild(tempButton);
        }
      }, 5000);
    }, 100);
  }

  // IMPROVED: Google Sign-in for login with better error handling
  async googleSignIn(): Promise<ApiResponse> {
    try {
      if (!this.googleClientId) {
        return {
          success: false,
          message: 'Google Client ID is not configured',
          errors: { config: 'Missing Google Client ID' }
        };
      }

      if (!this.isGoogleInitialized) {
        await this.initializeGoogle();
      }

      const google = (window as any).google;
      
      if (!google?.accounts?.id) {
        return {
          success: false,
          message: 'Google Identity Services not available',
          errors: { google: 'Google services not loaded' }
        };
      }

      return new Promise((resolve) => {
        const tempCallback = async (response: any) => {
          if (response.credential) {
            try {
              const authResult = await this.sendGoogleTokenToBackend(response.credential);
              resolve(authResult);
            } catch (error) {
              resolve({
                success: false,
                message: 'Failed to authenticate with backend',
                errors: { backend: (error instanceof Error ? error.message : String(error)) }
              });
            }
          } else {
            resolve({
              success: false,
              message: 'No credential received from Google',
              errors: { google: 'No credential received' }
            });
          }
        };

        const originalCallback = google.accounts.id.callback;
        google.accounts.id.callback = tempCallback;

        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            this.showGoogleSignInPopup(resolve);
          }
        });

        setTimeout(() => {
          google.accounts.id.callback = originalCallback;
        }, 30000);
      });
    } catch (error) {
      return {
        success: false,
        message: 'Google sign-in initialization failed',
        errors: { google: (error instanceof Error ? error.message : String(error)) }
      };
    }
  }

  // Helper method to decode Google JWT token
  private decodeGoogleJWT(token: string): GoogleUserInfo | undefined {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Failed to decode JWT:', error);
      return undefined;
    }
  }

  private async handleGoogleCredentialResponse(response: any): Promise<void> {
    try {
      console.log('Handling Google credential response:', response);
      
      if (response.credential) {
        const authResult = await this.sendGoogleTokenToBackend(response.credential);
        
        if (authResult.success) {
          console.log('Google authentication successful');
        } else {
          console.error('Google authentication failed:', authResult.message);
        }
      }
    } catch (error) {
      console.error('Error handling Google credential response:', error);
    }
  }

  // Google Registration with additional user data
  async googleRegister(registrationData: GoogleRegistrationData): Promise<ApiResponse> {
    console.log("Google Credential:", registrationData.googleCredential);

    try {
      console.log('Sending Google registration data to backend...');
      
      const response = await fetch(`${this.baseUrl}/auth/google/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCSRFToken(),
        },
        body: JSON.stringify({
          id_token: registrationData.googleCredential,
          first_name: registrationData.firstName,
          last_name: registrationData.lastName,
          role: registrationData.role,
          phone: registrationData.phone,
          agree_to_terms: registrationData.agreeToTerms,
          subscribe_newsletter: registrationData.subscribeNewsletter
        })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Google registration successful:', data);
        this.handleAuthSuccess(data);
        return {
          success: true,
          message: data.message || 'Registration successful',
          data: data,
        };
      } else {
        console.error('Google registration failed:', data);
        return {
          success: false,
          message: data.message || data.non_field_errors?.[0] || 'Registration failed',
          errors: data.errors || data,
        };
      }
    } catch (error) {
      console.error('Google registration error:', error);
      return {
        success: false,
        message: 'Registration error',
        errors: { backend: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  // Regular Login - uses cookie-based authentication
  async login(credentials: LoginCredentials): Promise<ApiResponse> {
    try {
      console.log('Sending login request with:', credentials.username);
      const response = await fetch(`${this.baseUrl}/auth/login/`, {
        

        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCSRFToken(),
        },
        credentials: 'include', // Include cookies in request
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
        }),
      });

      const data = await response.json();
      console.log('This is the Login response:', data);

      if (!response.ok) {
        return {
          success: false,
          message: data.message || data.non_field_errors?.[0] || 'Login failed',
          errors: data.errors || data,
        };
      }
          console.log('Login request payload:', {
          username: credentials.username,
          password: credentials.password
        }),
        console.log('Login successful, response data:', data);
      // Tokens are set in httpOnly cookies by the backend
      this.handleAuthSuccess(data);

      return {
        success: true,
        message: data.message || 'Login successful',
        data: data,
      };
    } catch (error) {
      console.error('Login failed:', error);

      return {
        success: false,
        message: 'Network error. Please check your connection and try again.',
        errors: { network: 'Connection failed' },
      };
    }
  }

  // Send Google token to backend
  private async sendGoogleTokenToBackend(credential: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/google/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCSRFToken(),
        },
        body: JSON.stringify({ 
          id_token: credential
        })
      });

      const data = await response.json();

      if (response.ok) {
        this.handleAuthSuccess(data);
        return {
          success: true,
          message: data.message || 'Authentication successful',
          data: data,
        };
      } else {
        return {
          success: false,
          message: data.message || data.non_field_errors?.[0] || 'Backend authentication failed',
          errors: data.errors || data,
        };
      }
    } catch (error) {
      this.handleAuthError();
      return {
        success: false,
        message: 'Backend authentication error',
        errors: { backend: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  // Authentication success handler
  // Note: With httpOnly cookies, tokens are set by the backend via cookies
  // We only store user data in localStorage (non-sensitive)
  private handleAuthSuccess(data: any): void {
  console.log('Authentication successful - tokens stored in httpOnly cookies');
  const userData = data.user || data.data?.user;
  if (userData) {
    try {
      localStorage.setItem('userData', JSON.stringify(userData));
      
      // ⭐ CRITICAL FIX: Store tenant slug for API requests
      if (userData.tenant?.slug) {
        localStorage.setItem('tenantSlug', userData.tenant.slug);
        console.log('✅ Tenant slug stored from auth:', userData.tenant.slug);
      } else if (userData.tenant_slug) {
        localStorage.setItem('tenantSlug', userData.tenant_slug);
        console.log('✅ Tenant slug stored from auth:', userData.tenant_slug);
      } else {
        console.warn('⚠️ No tenant slug found in user data:', userData);
      }
    } catch (error) {
      console.warn('Failed to store user data:', error);
    }
  }
}

  // Authentication error handler
  private handleAuthError(): void {
  try {
    localStorage.removeItem('userData');
    localStorage.removeItem('user_data');
    localStorage.removeItem('tenantSlug'); // ⭐ ALSO CLEAR TENANT SLUG
    console.log('🧹 Cleared user data and tenant slug');
  } catch (e) {
    console.warn('Failed to remove user data:', e);
  }
}

  // Utility to get CSRF token from cookies
  private getCSRFToken(): string {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrftoken='))
      ?.split('=')[1];
    return cookieValue || '';
  }

  // Token Management
  private getStoredToken(): string | null {
    try {
      return localStorage.getItem('authToken');
    } catch (error) {
      return null;
    }
  }

  private storeToken(token: string): void {
    try {
     localStorage.setItem('authToken', token);
    } catch (error) {
      console.warn('Failed to store token:', error);
    }
  }

  private removeToken(): void {
    try {
      localStorage.removeItem('authToken');
    } catch (error) {
      console.warn('Failed to remove token:', error);
    }
  }

  // Check if user is authenticated
  // Note: This checks localStorage userData, but actual auth is in cookies
  // For proper auth check, use api.checkAuthStatus()
  isAuthenticated(): boolean {
    const userData = localStorage.getItem('userData');
    return !!userData;
  }

  // Logout - backend clears httpOnly cookies
  async logout(): Promise<ApiResponse> {
    try {
      await fetch(`${this.baseUrl}/auth/logout/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCSRFToken(),
        },
        credentials: 'include', // Include cookies so backend can clear them
      });

      // Clear local user data (cookies are cleared by backend)
      this.handleAuthError();

      return {
        success: true,
        message: 'Logged out successfully',
      };
    } catch (error) {
      // Still clear local data even if server request fails
      this.handleAuthError();
      return {
        success: true,
        message: 'Logged out successfully',
      };
    }
  }

  // Get current user data - uses cookie-based authentication
  async getCurrentUser(): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/status/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          this.handleAuthError();
        }
        return {
          success: false,
          message: data.message || 'Failed to get user data',
          errors: data.errors || { auth: 'Authentication failed' },
        };
      }

      return {
        success: true,
        message: 'User data retrieved successfully',
        data: data.user,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Network error while fetching user data',
        errors: { network: 'Connection failed' },
      };
    }
  }

  // Get stored user data (from localStorage)
  getStoredUser(): User | null {
    try {
      const userData = localStorage.getItem('user_data');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.warn('Failed to get stored user data:', error);
      return null;
    }
  }

  // Utility Methods
  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/check-email/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      return data.exists || false;
    } catch (error) {
      console.error('Error checking email existence:', error);
      return false;
    }
  }

  async sendVerificationEmail(email: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/send-verification/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Verification email sent' : 'Failed to send email'),
        data: data.data,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to send verification email',
        errors: { network: 'Connection failed' },
      };
    }
  }

  async resendVerification(email: string): Promise<ApiResponse> {
    return this.sendVerificationEmail(email);
  }

  async verifyEmail(token: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/verify-email/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Email verified successfully' : 'Email verification failed'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to verify email',
        errors: { network: 'Connection failed' },
      };
    }
  }

  async resetPassword(email: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/reset-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Password reset email sent' : 'Failed to send reset email'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to send password reset email',
        errors: { network: 'Connection failed' },
      };
    }
  }

  async confirmPasswordReset(token: string, newPassword: string, confirmPassword: string): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/confirm-reset-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          token, 
          new_password: newPassword, 
          confirm_password: confirmPassword 
        }),
      });

      const data = await response.json();

      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Password reset successful' : 'Password reset failed'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to reset password',
        errors: { network: 'Connection failed' },
      };
    }
  }

  // Update user profile
  async updateProfile(profileData: Partial<User>): Promise<ApiResponse> {
    try {
      const token = this.getStoredToken();
      
      if (!token) {
        return {
          success: false,
          message: 'No authentication token found',
          errors: { auth: 'Not authenticated' },
        };
      }

      const response = await fetch(`${this.baseUrl}/auth/profile/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(profileData),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.data?.user) {
          try {
            localStorage.setItem('user_data', JSON.stringify(data.data.user));
          } catch (error) {
            console.warn('Failed to update stored user data:', error);
          }
        }
      }

      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Profile updated successfully' : 'Failed to update profile'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update profile',
        errors: { network: 'Connection failed' },
      };
    }
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<ApiResponse> {
    try {
      const token = this.getStoredToken();
      
      if (!token) {
        return {
          success: false,
          message: 'No authentication token found',
          errors: { auth: 'Not authenticated' },
        };
      }

      const response = await fetch(`${this.baseUrl}/auth/change-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        }),
      });

      const data = await response.json();

      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Password changed successfully' : 'Failed to change password'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to change password',
        errors: { network: 'Connection failed' },
      };
    }
  }

  // Delete account
  async deleteAccount(password: string): Promise<ApiResponse> {
    try {
      const token = this.getStoredToken();
      
      if (!token) {
        return {
          success: false,
          message: 'No authentication token found',
          errors: { auth: 'Not authenticated' },
        };
      }

      const response = await fetch(`${this.baseUrl}/auth/delete-account/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        this.removeToken();
        try {
          localStorage.removeItem('user_data');
        } catch (error) {
          console.warn('Failed to remove user data:', error);
        }
      }

      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Account deleted successfully' : 'Failed to delete account'),
        data: data.data,
        errors: data.errors || {},
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete account',
        errors: { network: 'Connection failed' },
      };
    }
  }

  // Refresh token - uses httpOnly cookies
  async refreshToken(): Promise<ApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': this.getCSRFToken(),
        },
        credentials: 'include', // Include cookies for refresh token
      });

      const data = await response.json();

      // New tokens are set in httpOnly cookies by the backend
      return {
        success: response.ok,
        message: data.message || (response.ok ? 'Token refreshed successfully' : 'Failed to refresh token'),
        data: data,
        errors: data.errors || {},
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to refresh token',
        errors: { network: 'Connection failed' },
      };
    }
  }
}