import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  BookOpen,
  Users,
  Shield,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Check
} from 'lucide-react';
import type { LoginCredentials, UserRole } from '@/types/types';

type PortalType = 'student' | 'teacher' | 'parent' | 'admin';

const portals: {
  type: PortalType;
  title: string;
  description: string;
  icon: React.ReactNode;
  dashboardPath: string;
}[] = [
  {
    type: 'student',
    title: 'Student',
    description: 'Courses & grades',
    icon: <GraduationCap className="w-5 h-5" />,
    dashboardPath: '/student/dashboard',
  },
  {
    type: 'teacher',
    title: 'Teacher',
    description: 'Classes & progress',
    icon: <BookOpen className="w-5 h-5" />,
    dashboardPath: '/teacher/dashboard',
  },
  {
    type: 'parent',
    title: 'Parent',
    description: "Child's education",
    icon: <Users className="w-5 h-5" />,
    dashboardPath: '/parent/dashboard',
  },
  {
    type: 'admin',
    title: 'Admin',
    description: 'Management',
    icon: <Shield className="w-5 h-5" />,
    dashboardPath: '/admin/dashboard',
  },
];

const SubdomainLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { tenant, settings, isLoading: tenantLoading, error: tenantError } = useTenant();
  const { login } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<PortalType>('student');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<LoginCredentials>({
    email: '',
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
    setForm(prev => ({ ...prev, role: selectedPortal as UserRole }));
  }, [selectedPortal]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) {
      setError('Please enter your email and password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login({ ...form, role: selectedPortal as UserRole });
      setSuccess(true);
      const portal = portals.find(p => p.type === selectedPortal);
      setTimeout(() => {
        navigate(portal?.dashboardPath || '/dashboard', { replace: true });
      }, 500);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Invalid credentials');
      setIsLoading(false);
    }
  }, [form, selectedPortal, login, navigate]);

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
            href="https://www.nuventacloud.com"
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
    <div className="min-h-screen bg-white flex">
      {/* Left Panel - Branding */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden"
        style={{ backgroundColor: primaryColor }}
      >

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          {/* Logo & School Name */}
          <div className={`flex items-center gap-3 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={schoolName}
                className="w-11 h-11 rounded-xl object-cover bg-white/20"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-900 font-semibold bg-white">
                {schoolName.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-base font-semibold text-white">{schoolName}</h1>
              <p className="text-xs text-white/70">School Portal</p>
            </div>
          </div>

          {/* Main message */}
          <div className={`max-w-md transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
              Welcome to your learning portal
            </h2>
            <p className="text-base text-white/80 leading-relaxed">
              Access courses, track progress, manage grades, and stay connected with the school community.
            </p>

            {/* Features */}
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { label: 'Secure Access', desc: 'Protected login' },
                { label: 'Real-time Updates', desc: 'Live information' },
                { label: 'Easy Navigation', desc: 'Simple interface' },
                { label: '24/7 Available', desc: 'Always accessible' },
              ].map((feature, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/60 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">{feature.label}</p>
                    <p className="text-xs text-white/60">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between text-xs text-white/50 transition-all duration-700 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            <span>&copy; {new Date().getFullYear()} {schoolName}</span>
            <a href="https://www.nuventacloud.com" className="hover:text-white/80 transition-colors">
              Powered by SchoolPlatform
            </a>
          </div>
        </div>
      </div>

      {/* Right Panel - Login */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex flex-col bg-gray-50">
        {/* Mobile header */}
        <div
          className={`lg:hidden px-6 py-5 flex items-center gap-3 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundColor: primaryColor }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName} className="w-9 h-9 rounded-lg object-cover bg-white/20" />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-900 text-sm font-semibold bg-white">
              {schoolName.charAt(0)}
            </div>
          )}
          <span className="text-sm font-semibold text-white">{schoolName}</span>
        </div>

        {/* Login form container */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:px-10 xl:px-16">
          <div className="w-full max-w-sm">
            {/* Header */}
            <div className={`mb-8 transition-all duration-500 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Sign in</h2>
              <p className="text-sm text-gray-500">Select your portal and enter credentials</p>
            </div>

            {/* Portal selector */}
            <div className={`mb-6 transition-all duration-500 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="grid grid-cols-4 gap-2">
                {portals.map((portal) => {
                  const isSelected = selectedPortal === portal.type;
                  return (
                    <button
                      key={portal.type}
                      onClick={() => setSelectedPortal(portal.type)}
                      className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all duration-200 ${
                        isSelected
                          ? 'bg-white border-gray-900 text-gray-900 shadow-sm'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                      }`}
                    >
                      {portal.icon}
                      <span className="text-xs font-medium">{portal.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className={`space-y-4 transition-all duration-500 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {/* Error */}
              {error && (
                <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <p className="text-sm text-green-600">Success! Redirecting...</p>
                </div>
              )}

              {/* Email or Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email or Username
                </label>
                <input
                  type="text"
                  value={form.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="you@example.com or ADM/SCH/JAN/26/0001"
                  className="w-full h-10 px-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
                  disabled={isLoading || success}
                  autoComplete="username"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Enter password"
                    className="w-full h-10 px-3 pr-10 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-shadow"
                    disabled={isLoading || success}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
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
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    disabled={isLoading || success}
                  />
                  <span className="text-sm text-gray-600">Remember me</span>
                </label>
                <button type="button" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || success}
                className="w-full h-10 text-sm font-medium text-white rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : success ? (
                  <>
                    <Check className="w-4 h-4" />
                    Signed in
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Help */}
            <p className={`mt-8 text-center text-xs text-gray-500 transition-all duration-500 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
              Need help? Contact your school administrator.
            </p>
          </div>
        </div>

        {/* Mobile footer */}
        <div className={`lg:hidden px-6 py-4 text-center text-xs text-gray-400 transition-all duration-500 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          &copy; {new Date().getFullYear()} {schoolName} &middot; Powered by SchoolPlatform
        </div>
        <Link to="/supabase-login" className="text-sm text-blue-600 hover:text-blue-800 transition-colors">
          Go to Admin Login
        </Link>
      </div>
    </div>
  );
};

export default SubdomainLandingPage;
