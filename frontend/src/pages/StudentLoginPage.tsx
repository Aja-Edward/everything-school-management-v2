import React, { useState } from 'react';
import UnifiedLoginForm from '@/components/login/UnifiedLoginForm';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
// import { AuthService } from '@/services/AuthService';
import type { LoginCredentials } from '@/types/types';



const StudentLoginPage: React.FC = () => {
  const navigate = useNavigate();
 const { login, googleLogin } = useAuth();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useDocumentTitle(t('login.title', 'Student Login'));

  const handleLogin = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setErrors({});
      await login(credentials);
      toast.success(t('login.success', 'Login successful!'));
      navigate('/student/dashboard');
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
        const loggedInUser = await googleLogin();

        if (!loggedInUser) {
           throw new Error('Google login failed: No user data returned');
         }
          toast.success(t('login.success', 'Google login successful!'));
          navigate('/student/dashboard');
        
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
      userType="student"
      onLogin={handleLogin}
      onBackToHome={handleBackToHome}
      onSocialLogin={handleSocialLogin}
      isLoading={isLoading}
      onCreateAccount={() => navigate('/signup')}
      errors={errors}
    />
  );
};

export default StudentLoginPage;
