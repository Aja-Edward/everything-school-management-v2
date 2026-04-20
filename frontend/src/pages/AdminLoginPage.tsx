// import React, { useState } from 'react';
// import UnifiedLoginForm from '@/components/login/UnifiedLoginForm';
// import { useNavigate } from 'react-router-dom';
// import { useAuth } from '@/hooks/useAuth';
// import { toast } from 'react-toastify';
// import { useTranslation } from 'react-i18next';
// import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// import type { LoginCredentials } from '@/types/types';
// import { UserRole } from '@/types/types';



// const AdminLoginPage: React.FC = () => {
//   const navigate = useNavigate();
// const { login, googleLogin } = useAuth();
//   const { t } = useTranslation();
//   const [isLoading, setIsLoading] = useState(false);
//   const [errors, setErrors] = useState<Record<string, string>>({});

//   useDocumentTitle(t('login.title', 'Admin Login'));

//   const navigateByRole = (role: UserRole) => {
//     switch (role) {
//       case UserRole.SUPERADMIN:
//         navigate('/super-admin/dashboard');
//         break;
//       case UserRole.ADMIN:
//       case UserRole.SECONDARY_ADMIN:
//       case UserRole.SENIOR_SECONDARY_ADMIN:
//       case UserRole.JUNIOR_SECONDARY_ADMIN:
//       case UserRole.PRIMARY_ADMIN:
//       case UserRole.NURSERY_ADMIN:
//         navigate('/admin/dashboard');
//         break;
//       case UserRole.TEACHER:
//         navigate('/teacher/dashboard');
//         break;
//       case UserRole.STUDENT:
//         navigate('/student/dashboard');
//         break;
//       case UserRole.PARENT:
//         navigate('/parent/dashboard');
//         break;
//       default:
//         navigate('/admin/dashboard');
//     }
//   };

//   const handleLogin = async (credentials: LoginCredentials) => {
//     try {
//       setIsLoading(true);
//       setErrors({});
//       const loggedInUser = await login(credentials);

//       if (!loggedInUser) {
//         throw new Error('Login failed: No user data returned');
//       }

//       toast.success(t('login.success', 'Login successful!'));
//       navigateByRole(loggedInUser.role as UserRole);
//     } catch (error: any) {
//       console.error('Login error:', error);
//       if (error.response?.data) {
//         const errorData = error.response.data;
//         const newErrors: Record<string, string> = {};

//         if (errorData.non_field_errors) {
//           newErrors.general = errorData.non_field_errors[0];
//         } else if (errorData.username) {
//           newErrors.username = errorData.username[0];
//         } else if (errorData.password) {
//           newErrors.password = errorData.password[0];
//         } else if (errorData.detail) {
//           newErrors.general = errorData.detail;
//         } else if (errorData.error) {
//           newErrors.general = errorData.error;
//         } else {
//           newErrors.general = 'Login failed. Please check your credentials.';
//         }

//         setErrors(newErrors);
//       } else if (error.message) {
//         setErrors({ general: error.message });
//       } else {
//         setErrors({ general: 'Login failed. Please try again.' });
//       }

//       toast.error(error.message || t('login.error', 'Login failed. Please try again.'));
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleBackToHome = () => {
//     navigate('/');
//   };

//   const handleSocialLogin = async (provider: 'google' | 'facebook') => {
//     if (provider === 'google') {
//       setIsLoading(true);
//       setErrors({});
//       try {
//        const loggedInUser = await googleLogin();

//          if (!loggedInUser) {
//            throw new Error('Google login failed: No user data returned');
//          }
       
//           toast.success(t('login.success', 'Google login successful!'));
//           navigateByRole(loggedInUser.role as UserRole);
//       } catch (error) {
//         const errorMessage = error instanceof Error ? error.message : 'Google login failed';
//         setErrors({ google: errorMessage });
//         toast.error('Google login failed. Please try again.');
//       } finally {
//         setIsLoading(false);
//       }
//     } else if (provider === 'facebook') {
//       toast.info('Facebook login not implemented yet.');
//     }
//   };

//   return (
//     <UnifiedLoginForm
//       userType="admin"
//       onLogin={handleLogin}
//       onBackToHome={handleBackToHome}
//       onSocialLogin={handleSocialLogin}
//       isLoading={isLoading}
//       onCreateAccount={() => navigate('/signup')}
//       errors={errors}
//     />
//   );
// };

// export default AdminLoginPage;

/**
 * AdminLoginPage
 *
 * Auth strategy (Admins & Teachers only):
 *   1. Try Supabase signInWithPassword → get JWT
 *   2. Forward JWT to Django via Authorization: Bearer header
 *   3. Django verifies JWT with JWKS, returns full user + role data
 *   4. If Supabase is unreachable or the user has no Supabase account,
 *      fall back transparently to the existing Django session login.
 *
 * Students & Parents continue to use the standard Django session flow
 * (StudentLoginPage / ParentLoginPage are unchanged).
 */

import React, { useState } from 'react';
import UnifiedLoginForm from '@/components/login/UnifiedLoginForm';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { supabase } from '@/services/supabaseClient'; // adjust path to match your project

import type { LoginCredentials } from '@/types/types';
import { UserRole } from '@/types/types';
import type { HydratedUserData } from '@/hooks/useAuth';
import  {API_BASE_URL} from "@/services/api";



/**
 * Roles that should go through the Supabase-first flow.
 * Students and Parents are intentionally excluded.
 */
const SUPABASE_ELIGIBLE_ROLES = new Set([
  'admin',
  'teacher',
  'superadmin',
]);

// ---------------------------------------------------------------------------
// Helper: call Django with a Supabase Bearer token
// ---------------------------------------------------------------------------

/**
 * Sends the Supabase JWT to Django.
 * Django's SupabaseJWTAuthentication middleware verifies the token via JWKS,
 * looks up the matching Django user by supabase_id, and returns the full
 * user profile (role, tenant, etc.).
 *
 * Endpoint convention: POST /api/auth/supabase-login/
 * Adjust the path if your Django URL differs.
 */
async function authenticateWithDjango(
  supabaseToken: string
): Promise<HydratedUserData> {
  const response = await fetch(`${API_BASE_URL}/auth/supabase-login/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseToken}`,
    },
    credentials: 'include', // keep Django session cookie in sync
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail ||
        errorData.message ||
        `Django auth failed (${response.status})`
    );
  }

  const data = await response.json();

  // Django should return { user: { id, email, role, tenant_id, ... } }
  // This mirrors what your existing login endpoint returns, so useAuth's
  // buildUserData / persistAuthSuccess helpers can process it.
  if (!data.user) {
    throw new Error('Django returned no user data');
  }

  return data.user as HydratedUserData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, googleLogin, updateUser } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useDocumentTitle(t('login.title', 'Admin Login'));

  // ------------------------------------------------------------------
  // Navigation by role (unchanged from original)
  // ------------------------------------------------------------------

  const navigateByRole = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPERADMIN:
        navigate('/super-admin/dashboard');
        break;
      case UserRole.ADMIN:
      case UserRole.SECONDARY_ADMIN:
      case UserRole.SENIOR_SECONDARY_ADMIN:
      case UserRole.JUNIOR_SECONDARY_ADMIN:
      case UserRole.PRIMARY_ADMIN:
      case UserRole.NURSERY_ADMIN:
        navigate('/admin/dashboard');
        break;
      case UserRole.TEACHER:
        navigate('/teacher/dashboard');
        break;
      case UserRole.STUDENT:
        navigate('/student/dashboard');
        break;
      case UserRole.PARENT:
        navigate('/parent/dashboard');
        break;
      default:
        navigate('/admin/dashboard');
    }
  };

  // ------------------------------------------------------------------
  // Core login handler — Supabase first, Django session fallback
  // ------------------------------------------------------------------

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setErrors({});

    // ── Step 1: Attempt Supabase authentication ────────────────────────
    let supabaseSucceeded = false;

    try {
      const { data: supabaseData, error: supabaseError } =
        await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

      if (!supabaseError && supabaseData?.session?.access_token) {
        // ── Step 2: Forward JWT to Django ────────────────────────────
        try {
          const djangoUser = await authenticateWithDjango(
            supabaseData.session.access_token
          );

          // Sync Django user data into React context
          updateUser(djangoUser);
          localStorage.setItem('userData', JSON.stringify(djangoUser));

          supabaseSucceeded = true;
          toast.success(t('login.success', 'Login successful!'));
          navigateByRole(djangoUser.role as UserRole);
          return; // ✅ happy path — done
        } catch (djangoError: any) {
          /**
           * Supabase auth worked but Django rejected the token.
           * This could mean:
           *   - The user has a Supabase account but no matching Django user yet
           *   - The supabase_id column hasn't been populated for this user
           * Log it and fall through to Django session fallback.
           */
          console.warn(
            '[AdminLogin] Supabase JWT accepted by Supabase but rejected by Django:',
            djangoError.message
          );
        }
      }
      // Supabase returned an error (wrong password, user not in Supabase, etc.)
      // Fall through silently to Django session login.
    } catch (supabaseNetworkError) {
      // Supabase is unreachable (offline, misconfigured) — fall through.
      console.warn('[AdminLogin] Supabase unreachable, falling back to Django:', supabaseNetworkError);
    }

    // ── Step 3: Fallback — standard Django session login ──────────────
    if (!supabaseSucceeded) {
      try {
        const loggedInUser = await login(credentials);

        if (!loggedInUser) {
          throw new Error('Login failed: No user data returned');
        }

        toast.success(t('login.success', 'Login successful!'));
        navigateByRole(loggedInUser.role as UserRole);
      } catch (error: any) {
        console.error('[AdminLogin] Django fallback login error:', error);

        // Map Django error shapes to field-level errors for the form
        if (error.response?.data) {
          const errorData = error.response.data;
          const newErrors: Record<string, string> = {};

          if (errorData.non_field_errors) {
            newErrors.general = errorData.non_field_errors[0];
          } else if (errorData.username) {
            newErrors.username = errorData.username[0];
          } else if (errorData.password) {
            newErrors.password = errorData.password[0];
          } else if (errorData.detail) {
            newErrors.general = errorData.detail;
          } else if (errorData.error) {
            newErrors.general = errorData.error;
          } else {
            newErrors.general = 'Login failed. Please check your credentials.';
          }

          setErrors(newErrors);
        } else if (error.message) {
          setErrors({ general: error.message });
        } else {
          setErrors({ general: 'Login failed. Please try again.' });
        }

        toast.error(
          error.message || t('login.error', 'Login failed. Please try again.')
        );
      }
    }

    setIsLoading(false);
  };

  // ------------------------------------------------------------------
  // Social login (Google) — unchanged, still uses useAuth.googleLogin
  // ------------------------------------------------------------------

  const handleSocialLogin = async (provider: 'google' | 'facebook') => {
    if (provider === 'google') {
      setIsLoading(true);
      setErrors({});
      try {
        const loggedInUser = await googleLogin();

        if (!loggedInUser) {
          throw new Error('Google login failed: No user data returned');
        }

        toast.success(t('login.success', 'Google login successful!'));
        navigateByRole(loggedInUser.role as UserRole);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Google login failed';
        setErrors({ google: errorMessage });
        toast.error('Google login failed. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else if (provider === 'facebook') {
      toast.info('Facebook login not implemented yet.');
    }
  };

  const handleBackToHome = () => navigate('/');

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <UnifiedLoginForm
      userType="admin"
      onLogin={handleLogin}
      onBackToHome={handleBackToHome}
      onSocialLogin={handleSocialLogin}
      isLoading={isLoading}
      onCreateAccount={() => navigate('/signup')}
      errors={errors}
    />
  );
};

export default AdminLoginPage;
