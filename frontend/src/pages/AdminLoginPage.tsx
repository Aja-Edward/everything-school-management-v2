import React, { useState } from 'react';
import UnifiedLoginForm from '@/components/login/UnifiedLoginForm';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import type { LoginCredentials } from '@/types/types';
import { UserRole } from '@/types/types';



const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
const { login, googleLogin } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useDocumentTitle(t('login.title', 'Admin Login'));

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

  const handleLogin = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setErrors({});
      const loggedInUser = await login(credentials);

      if (!loggedInUser) {
        throw new Error('Login failed: No user data returned');
      }

      toast.success(t('login.success', 'Login successful!'));
      navigateByRole(loggedInUser.role as UserRole);
    } catch (error: any) {
      console.error('Login error:', error);
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

      toast.error(error.message || t('login.error', 'Login failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToHome = () => {
    navigate('/');
  };

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
        const errorMessage = error instanceof Error ? error.message : 'Google login failed';
        setErrors({ google: errorMessage });
        toast.error('Google login failed. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else if (provider === 'facebook') {
      toast.info('Facebook login not implemented yet.');
    }
  };

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
