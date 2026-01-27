import React, { useState, useCallback, useEffect } from 'react';
import { Eye, EyeOff, ArrowLeft, ArrowRight, GraduationCap, BookOpen, Users, Shield, Loader2 } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/hooks/useAuth';
import type { LoginCredentials, UserRole } from '@/types/types';

type LoginUserType = 'student' | 'teacher' | 'parent' | 'admin';

interface LocationState {
  selectedType?: LoginUserType;
  from?: Location;
}

const portalConfig: Record<LoginUserType, {
  label: string;
  icon: React.ReactNode;
  dashboardPath: string;
}> = {
  student: {
    label: 'Student',
    icon: <GraduationCap className="w-4 h-4" />,
    dashboardPath: '/student/dashboard',
  },
  teacher: {
    label: 'Teacher',
    icon: <BookOpen className="w-4 h-4" />,
    dashboardPath: '/teacher/dashboard',
  },
  parent: {
    label: 'Parent',
    icon: <Users className="w-4 h-4" />,
    dashboardPath: '/parent/dashboard',
  },
  admin: {
    label: 'Admin',
    icon: <Shield className="w-4 h-4" />,
    dashboardPath: '/admin/dashboard',
  },
};

const SubdomainLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | undefined;
  const { tenant, settings, isLoading: tenantLoading, error: tenantError } = useTenant();
  const { login } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [selectedType, setSelectedType] = useState<LoginUserType>(locationState?.selectedType || 'student');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<LoginCredentials>({
    username: '',
    password: '',
    role: 'student' as UserRole,
    rememberMe: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setForm(prev => ({ ...prev, role: selectedType as UserRole }));
  }, [selectedType]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login({ ...form, role: selectedType as UserRole });
      setSuccess(true);
      setTimeout(() => {
        const from = locationState?.from?.pathname;
        navigate(from || portalConfig[selectedType].dashboardPath, { replace: true });
      }, 500);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Invalid credentials');
      setIsLoading(false);
    }
  }, [form, selectedType, login, navigate, locationState]);

  const handleInputChange = (field: keyof LoginCredentials, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-base font-semibold text-gray-900 mb-1">School not found</h1>
          <p className="text-sm text-gray-500 mb-5">
            This portal doesn't exist or has been deactivated.
          </p>
          <a
            href="http://localhost:5173"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Go to main site
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  const schoolName = tenant.name;
  const logoUrl = settings?.logo;
  const primaryColor = settings?.primary_color || '#2563eb';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className={`bg-white border-b border-gray-200 px-6 lg:px-8 py-4 transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="max-w-sm mx-auto">
            <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  <img src={logoUrl} alt={schoolName} className="w-6 h-6 rounded object-cover" />
                ) : (
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {schoolName.charAt(0)}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-900">{schoolName}</span>
              </div>
            </Link>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            {/* Title */}
            <div className={`text-center mb-6 transition-all duration-300 delay-75 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <h1 className="text-lg font-semibold text-gray-900">
                Sign in to your account
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Select your portal and enter your credentials
              </p>
            </div>

            {/* Portal Selector */}
            <div className={`mb-5 transition-all duration-300 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 rounded-lg">
                {(Object.keys(portalConfig) as LoginUserType[]).map((type) => {
                  const config = portalConfig[type];
                  const isSelected = selectedType === type;

                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {config.icon}
                      <span>{config.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form */}
            <div className={`bg-white border border-gray-200 rounded-xl p-5 transition-all duration-300 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              {/* Error */}
              {error && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600">Success! Redirecting...</p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => handleInputChange('username', e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                    disabled={isLoading || success}
                    autoComplete="username"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder="Enter your password"
                      className="w-full h-9 px-3 pr-9 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                      disabled={isLoading || success}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Options */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.rememberMe}
                      onChange={(e) => handleInputChange('rememberMe', e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={isLoading || success}
                    />
                    <span className="text-sm text-gray-600">Remember me</span>
                  </label>
                  <button type="button" className="text-sm text-blue-600 hover:text-blue-700 transition-colors">
                    Forgot password?
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading || success}
                  className="w-full h-9 text-sm font-medium text-white rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Help */}
            <p className={`mt-5 text-center text-xs text-gray-500 transition-all duration-300 delay-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
              Having trouble? Contact your school administrator.
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className={`px-6 lg:px-8 py-4 transition-opacity duration-300 delay-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="max-w-sm mx-auto flex items-center justify-between text-xs text-gray-400">
            <span>&copy; {new Date().getFullYear()} {schoolName}</span>
            <a href="http://localhost:5173" className="hover:text-gray-600 transition-colors">
              SchoolPlatform
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SubdomainLoginPage;
