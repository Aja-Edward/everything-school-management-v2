import React, { useState } from 'react';
import UnifiedLoginForm from '@/components/login/UnifiedLoginForm';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { AuthService } from '@/services/AuthService';
import type { LoginCredentials } from '@/types/types';

const authService = new AuthService();

const ParentLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useDocumentTitle(t('login.title', 'Parent Login'));

  const handleLogin = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setErrors({});
      await login(credentials);
      toast.success(t('login.success', 'Login successful!'));
      navigate('/parent/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.non_field_errors) {
          setErrors({ general: errorData.non_field_errors[0] });
        } else if (errorData.username) {
          setErrors({ username: errorData.username[0] });
        } else if (errorData.password) {
          setErrors({ password: errorData.password[0] });
        } else if (errorData.detail) {
          setErrors({ general: errorData.detail });
        } else {
          setErrors({ general: 'Login failed. Please check your credentials.' });
        }
      } else {
        setErrors({ general: 'Login failed. Please try again.' });
      }
      toast.error(t('login.error', 'Login failed. Please try again.'));
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
        const result = await authService.googleSignIn();
        if (result.success) {
          toast.success(t('login.success', 'Google login successful!'));
          navigate('/parent/dashboard');
        } else {
          setErrors(result.errors || { google: result.message });
          toast.error(result.message || 'Google login failed. Please try again.');
        }
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
      userType="parent"
      onLogin={handleLogin}
      onBackToHome={handleBackToHome}
      onSocialLogin={handleSocialLogin}
      isLoading={isLoading}
      onCreateAccount={() => navigate('/signup')}
      errors={errors}
    />
  );
};

export default ParentLoginPage;
