import React, { useState, useCallback, useMemo } from 'react';
import { Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { LoginCredentials, UserRole } from '@/types/types';

export type LoginUserType = 'student' | 'teacher' | 'parent' | 'admin';

interface LoginProps {
  userType: LoginUserType;
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  onBackToHome: () => void;
  onSocialLogin?: (provider: 'google' | 'facebook') => void;
  onForgotPassword?: () => void;
  onCreateAccount?: () => void;
  isLoading?: boolean;
  errors?: Record<string, string>;
}

const userTypeConfig = {
  student: {
    title: 'Student Portal',
    subtitle: 'Access your courses, grades, and learning materials',
    image: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=1200&q=80',
  },
  teacher: {
    title: 'Teacher Portal',
    subtitle: 'Manage your classes, students, and curriculum',
    image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200&q=80',
  },
  parent: {
    title: 'Parent Portal',
    subtitle: "Monitor your child's progress and stay connected",
    image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&q=80',
  },
  admin: {
    title: 'Admin Portal',
    subtitle: 'Manage your school operations efficiently',
    image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&q=80',
  },
};

const UnifiedLoginForm: React.FC<LoginProps> = ({
  userType,
  onLogin,
  onBackToHome,
  onSocialLogin,
  onForgotPassword,
  onCreateAccount,
  isLoading: externalLoading = false,
  errors: externalErrors = {},
}) => {
  const config = userTypeConfig[userType];
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<LoginCredentials>({
    email: '',
    password: '',
    role: userType as UserRole,
    rememberMe: false,
  });
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalErrors, setInternalErrors] = useState<Record<string, string>>({});
  const [loginSuccess, setLoginSuccess] = useState(false);

  const isLoading = externalLoading || internalLoading;
  const errors = useMemo(
    () => ({ ...internalErrors, ...externalErrors }),
    [internalErrors, externalErrors]
  );

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    }
    if (!form.password) {
      newErrors.password = 'Password is required';
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setInternalErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form.email, form.password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setInternalLoading(true);
    setInternalErrors({});

    try {
      setLoginSuccess(true);
      await onLogin(form);
    } catch (error) {
      console.error('Login error:', error);
      setInternalErrors({ general: 'Login failed. Please check your credentials.' });
      setLoginSuccess(false);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoginCredentials, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (internalErrors[field]) {
      setInternalErrors((prev) => ({ ...prev, [field]: '' }));
    }
    if (internalErrors.general && (field === 'email' || field === 'password')) {
      setInternalErrors((prev) => ({ ...prev, general: '' }));
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900">
        <img
          src={config.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />

        {/* Content on image */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo/Back */}
          <button
            onClick={onBackToHome}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Home</span>
          </button>

          {/* Bottom content */}
          <div className="max-w-md">
            <h1 className="text-3xl font-semibold text-white mb-3">
              {config.title}
            </h1>
            <p className="text-base text-gray-300">
              {config.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-950">
        {/* Mobile back button */}
        <div className="lg:hidden p-4">
          <button
            onClick={onBackToHome}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            {/* Header */}
            <div className="mb-8">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                {config.title}
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Enter your credentials to continue
              </p>
            </div>

            {/* Error Message */}
            {(errors.general || errors.google) && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {errors.general || errors.google}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Username or Email
                </label>
                <input
                  type="text"
                  value={form.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter your email"
                  className={`w-full px-3.5 py-2.5 text-sm rounded-lg border bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                    errors.email
                      ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800'
                      : 'border-gray-200 dark:border-gray-800 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500'
                  }`}
                  disabled={isLoading}
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors.email}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Enter your password"
                    className={`w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                      errors.password
                        ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800'
                        : 'border-gray-200 dark:border-gray-800 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500'
                    }`}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors.password}</p>
                )}
              </div>

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.rememberMe}
                    onChange={(e) => handleInputChange('rememberMe', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 bg-gray-50 dark:bg-gray-900"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Remember me</span>
                </label>
                {onForgotPassword && (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    disabled={isLoading}
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || loginSuccess}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : loginSuccess ? (
                  'Success!'
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Divider */}
              {onSocialLogin && (
                <>
                  <div className="relative flex items-center py-2">
                    <div className="flex-1 border-t border-gray-200 dark:border-gray-800" />
                    <span className="px-3 text-xs text-gray-400">or</span>
                    <div className="flex-1 border-t border-gray-200 dark:border-gray-800" />
                  </div>

                  {/* Social Login */}
                  <button
                    type="button"
                    onClick={() => onSocialLogin('google')}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Continue with Google
                    </span>
                  </button>
                </>
              )}
            </form>

            {/* Create Account */}
            <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Don't have an account?{' '}
              <button
                onClick={onCreateAccount || (() => navigate('/signup'))}
                className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                disabled={isLoading}
              >
                Create account
              </button>
            </p>

            {/* Other portals */}
            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center mb-3">
                Other portals
              </p>
              <div className="flex justify-center gap-4">
                {(['student', 'teacher', 'parent', 'admin'] as const)
                  .filter((type) => type !== userType)
                  .map((type) => (
                    <button
                      key={type}
                      onClick={() => navigate(`/${type}-login`)}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white capitalize transition-colors"
                    >
                      {type}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            By signing in, you agree to our{' '}
            <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300">Terms</a>
            {' '}and{' '}
            <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default UnifiedLoginForm;
