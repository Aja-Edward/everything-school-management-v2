import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tenantService, SchoolRegistrationData } from '@/services/TenantService';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Check } from 'lucide-react';

interface FormData {
  school_name: string;
  admin_email: string;
  admin_first_name: string;
  admin_last_name: string;
  admin_phone: string;
  password: string;
  confirm_password: string;
  billing_period: 'term' | 'session';
}

interface FormErrors {
  [key: string]: string;
}

const SchoolRegistrationPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [suggestedSlug, setSuggestedSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    school_name: '',
    admin_email: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_phone: '',
    password: '',
    confirm_password: '',
    billing_period: 'term',
  });

  const [errors, setErrors] = useState<FormErrors>({});

  // Generate slug from school name
  useEffect(() => {
    if (formData.school_name) {
      const slug = formData.school_name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
      setSuggestedSlug(slug);
    } else {
      setSuggestedSlug('');
      setSlugAvailable(null);
    }
  }, [formData.school_name]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!suggestedSlug) return;

    const timeoutId = setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const result = await tenantService.checkSlugAvailability(suggestedSlug);
        setSlugAvailable(result.available);
      } catch {
        setSlugAvailable(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [suggestedSlug]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.school_name.trim()) {
      newErrors.school_name = 'School name is required';
    }

    if (!formData.admin_email.trim()) {
      newErrors.admin_email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) {
      newErrors.admin_email = 'Please enter a valid email address';
    }

    if (!formData.admin_first_name.trim()) {
      newErrors.admin_first_name = 'First name is required';
    }

    if (!formData.admin_last_name.trim()) {
      newErrors.admin_last_name = 'Last name is required';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirm_password) {
      newErrors.confirm_password = 'Please confirm your password';
    } else if (formData.password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }

    if (slugAvailable === false) {
      newErrors.school_name = 'This school name generates an unavailable subdomain';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsLoading(true);

    try {
      const registrationData: SchoolRegistrationData = {
        school_name: formData.school_name,
        admin_email: formData.admin_email,
        admin_first_name: formData.admin_first_name,
        admin_last_name: formData.admin_last_name,
        admin_phone: formData.admin_phone || undefined,
        password: formData.password,
        confirm_password: formData.confirm_password,
        billing_period: formData.billing_period,
      };

      const response = await tenantService.registerSchool(registrationData);

      toast.success('School registered! Redirecting to your subdomain...');

      // Redirect to the subdomain setup URL
      // This will trigger the SetupPage which exchanges the token for auth
      window.location.href = response.setup_url;

    } catch (error: any) {
      console.error('Registration error:', error);

      if (error.response?.data) {
        const errorData = error.response.data;
        const newErrors: FormErrors = {};

        Object.entries(errorData).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            newErrors[key] = value[0] as string;
          } else if (typeof value === 'string') {
            newErrors[key] = value;
          }
        });

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
        } else {
          toast.error('Registration failed. Please try again.');
        }
      } else {
        toast.error('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputClasses = (hasError: boolean) =>
    `w-full px-3.5 py-2.5 text-sm rounded-lg border bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
      hasError
        ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800'
        : 'border-gray-200 dark:border-gray-800 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500'
    }`;

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900">
        <img
          src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Home</span>
          </button>

          <div className="max-w-md">
            <h1 className="text-3xl font-semibold text-white mb-3">
              Register Your School
            </h1>
            <p className="text-base text-gray-300">
              Join thousands of schools managing their operations efficiently with our platform.
            </p>

            {/* Features */}
            <div className="mt-8 space-y-4">
              {[
                'Quick setup in minutes',
                'Custom subdomain for your school',
                'Secure and private data',
                'Choose only the features you need',
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-600/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-blue-400" />
                  </div>
                  <span className="text-sm text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-950">
        {/* Mobile back button */}
        <div className="lg:hidden p-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 pt-6 lg:pt-12">
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium">
                  1
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Register</span>
              </div>
              <div className="w-8 h-px bg-gray-200 dark:bg-gray-800" />
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-500 flex items-center justify-center text-xs font-medium">
                  2
                </div>
                <span className="text-xs text-gray-500">Services</span>
              </div>
              <div className="w-8 h-px bg-gray-200 dark:bg-gray-800" />
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-500 flex items-center justify-center text-xs font-medium">
                  3
                </div>
                <span className="text-xs text-gray-500">Complete</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="mb-6">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                Get Started
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Create your school account
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Fill in the details below to register
              </p>
            </div>

            {/* Error Message */}
            {errors.general && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{errors.general}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* School Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  School Name
                </label>
                <input
                  type="text"
                  name="school_name"
                  value={formData.school_name}
                  onChange={handleInputChange}
                  placeholder="e.g., Bay Area Academy"
                  className={inputClasses(!!errors.school_name)}
                  disabled={isLoading}
                />
                {errors.school_name && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors.school_name}</p>
                )}
                {suggestedSlug && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Your subdomain:</span>
                    <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-blue-600 dark:text-blue-400">
                      {suggestedSlug}.schoolplatform.com
                    </code>
                    {checkingSlug ? (
                      <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : slugAvailable === true ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : slugAvailable === false ? (
                      <span className="text-red-500">Not available</span>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Admin Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="admin_first_name"
                    value={formData.admin_first_name}
                    onChange={handleInputChange}
                    placeholder="John"
                    className={inputClasses(!!errors.admin_first_name)}
                    disabled={isLoading}
                  />
                  {errors.admin_first_name && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors.admin_first_name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="admin_last_name"
                    value={formData.admin_last_name}
                    onChange={handleInputChange}
                    placeholder="Doe"
                    className={inputClasses(!!errors.admin_last_name)}
                    disabled={isLoading}
                  />
                  {errors.admin_last_name && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors.admin_last_name}</p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  name="admin_email"
                  value={formData.admin_email}
                  onChange={handleInputChange}
                  placeholder="admin@school.com"
                  className={inputClasses(!!errors.admin_email)}
                  disabled={isLoading}
                />
                {errors.admin_email && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors.admin_email}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Phone Number <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="tel"
                  name="admin_phone"
                  value={formData.admin_phone}
                  onChange={handleInputChange}
                  placeholder="+234 800 000 0000"
                  className={inputClasses(false)}
                  disabled={isLoading}
                />
              </div>

              {/* Billing Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Billing Period
                </label>
                <select
                  name="billing_period"
                  value={formData.billing_period}
                  onChange={handleInputChange}
                  className={inputClasses(false)}
                  disabled={isLoading}
                >
                  <option value="term">Per Term</option>
                  <option value="session">Per Session (Academic Year)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">How often you'd like to be invoiced</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Minimum 8 characters"
                    className={`${inputClasses(!!errors.password)} pr-10`}
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

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleInputChange}
                    placeholder="Confirm your password"
                    className={`${inputClasses(!!errors.confirm_password)} pr-10`}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirm_password && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors.confirm_password}</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || slugAvailable === false}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mt-6"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Login Link */}
            <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{' '}
              <span className="text-gray-600 dark:text-gray-300">
                Go to your school's subdomain to sign in
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            By registering, you agree to our{' '}
            <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300">Terms</a>
            {' '}and{' '}
            <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SchoolRegistrationPage;
