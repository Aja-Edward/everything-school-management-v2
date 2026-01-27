import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tenantService, AvailableService, Tenant } from '@/services/TenantService';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Shield,
  BookOpen,
  Clock,
  MessageSquare,
  Wallet,
  Calendar,
  RefreshCw,
  Sparkles
} from 'lucide-react';

interface LocationState {
  tenant: Tenant;
  subdomain: string;
  adminCredentials: {
    username: string;
    email: string;
  };
}

const ServiceSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | undefined;

  const [services, setServices] = useState<AvailableService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingService, setTogglingService] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tenantInfo, setTenantInfo] = useState<{ tenant: Tenant | null; adminCredentials: { username: string; email: string } | null }>({
    tenant: null,
    adminCredentials: null,
  });

  // Prevent multiple fetches
  const hasFetched = useRef(false);

  useEffect(() => {
    // Try to get tenant info from location state first, then localStorage
    if (locationState?.tenant) {
      setTenantInfo({
        tenant: locationState.tenant,
        adminCredentials: locationState.adminCredentials,
      });
    } else {
      // Try to load from localStorage (for subdomain access)
      const tenantSlug = localStorage.getItem('tenantSlug');
      // Check both 'userData' (new format from SetupPage) and 'user' (legacy)
      const userDataStr = localStorage.getItem('userData') || localStorage.getItem('user');

      if (!tenantSlug || !userDataStr) {
        toast.error('Please complete registration first', { toastId: 'no-tenant' });
        // Check if we're on a subdomain - if so, redirect to login
        const hostname = window.location.hostname;
        // In development, check for .localhost subdomains (e.g., bay-area-school.localhost)
        const isDevelopment = import.meta.env.DEV;
        const isSubdomain = isDevelopment
          ? hostname.endsWith('.localhost')
          : (hostname.includes('.') && !hostname.startsWith('www.') && hostname !== 'localhost');

        if (isSubdomain) {
          navigate('/login');
        } else {
          navigate('/onboarding/register');
        }
        return;
      }

      try {
        const userData = JSON.parse(userDataStr);
        // Create a minimal tenant object from localStorage
        setTenantInfo({
          tenant: {
            id: localStorage.getItem('tenantId') || '',
            name: tenantSlug, // We'll update this when we fetch tenant data
            slug: tenantSlug,
            custom_domain: null,
            custom_domain_verified: false,
            status: 'active',
            is_active: true,
            owner_email: userData.email,
            owner_name: `${userData.first_name} ${userData.last_name}`,
            owner_phone: '',
            subdomain_url: `https://${tenantSlug}.schoolplatform.com`,
            created_at: '',
            activated_at: null,
          },
          adminCredentials: {
            username: userData.email,
            email: userData.email,
          },
        });
      } catch {
        toast.error('Session expired. Please log in again.', { toastId: 'session-expired' });
        navigate('/login');
        return;
      }
    }

    // Only fetch once
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchServices();
    }
  }, []);

  const fetchServices = async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const availableServices = await tenantService.getAvailableServices();
      setServices(availableServices);
    } catch (error) {
      console.error('Error fetching services:', error);
      setFetchError('Failed to load services. Please try again.');
      // Use toastId to prevent duplicate toasts
      toast.error('Failed to load services. Please try again.', { toastId: 'fetch-services-error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleService = async (service: AvailableService) => {
    if (service.is_default) {
      toast.info(`${service.name} is a core service and cannot be disabled`);
      return;
    }

    setTogglingService(service.service);

    try {
      const result = await tenantService.toggleService(service.service, !service.is_enabled);

      setServices(prev =>
        prev.map(s =>
          s.service === service.service
            ? { ...s, is_enabled: result.is_enabled }
            : s
        )
      );

      toast.success(result.message);
    } catch (error: any) {
      console.error('Error toggling service:', error);
      toast.error(error.response?.data?.error || 'Failed to update service');
    } finally {
      setTogglingService(null);
    }
  };

  const handleContinue = async () => {
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    navigate('/onboarding/complete', {
      state: {
        tenant: tenantInfo.tenant,
        adminCredentials: tenantInfo.adminCredentials,
        enabledServices: services.filter(s => s.is_enabled).map(s => s.name),
      }
    });
  };

  const enabledCount = services.filter(s => s.is_enabled).length;
  const totalCost = services
    .filter(s => s.is_enabled)
    .reduce((sum, s) => sum + Number(s.price_per_student), 0);

  // Group services by category
  const groupedServices = services.reduce<Record<string, AvailableService[]>>((acc, service) => {
    const category = service.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(service);
    return acc;
  }, {});

  // Category configuration with icons and order
  const categoryConfig: { [key: string]: { name: string; icon: React.ReactNode; order: number } } = {
    core: { name: 'Core Services', icon: <Shield className="w-4 h-4" />, order: 1 },
    assessment: { name: 'Assessment & Grades', icon: <BookOpen className="w-4 h-4" />, order: 2 },
    attendance: { name: 'Attendance & Tracking', icon: <Clock className="w-4 h-4" />, order: 3 },
    communication: { name: 'Communication', icon: <MessageSquare className="w-4 h-4" />, order: 4 },
    finance: { name: 'Finance & Billing', icon: <Wallet className="w-4 h-4" />, order: 5 },
    scheduling: { name: 'Scheduling', icon: <Calendar className="w-4 h-4" />, order: 6 },
    other: { name: 'Additional Services', icon: <Sparkles className="w-4 h-4" />, order: 7 },
  };

  // Sort categories by order
  const sortedCategories = Object.entries(groupedServices).sort(([a], [b]) => {
    const orderA = categoryConfig[a]?.order || 99;
    const orderB = categoryConfig[b]?.order || 99;
    return orderA - orderB;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading available services...</p>
        </div>
      </div>
    );
  }

  if (fetchError && services.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Failed to Load Services
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {fetchError}
          </p>
          <button
            onClick={() => {
              hasFetched.current = false;
              fetchServices();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Setting up</p>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">
                {tenantInfo.tenant?.name || 'Your School'}
              </h1>
            </div>

            {/* Progress Steps */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs text-gray-500">Register</span>
              </div>
              <div className="w-6 h-px bg-green-500" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium">
                  2
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Services</span>
              </div>
              <div className="w-6 h-px bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 flex items-center justify-center text-xs font-medium">
                  3
                </div>
                <span className="text-xs text-gray-500">Complete</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
            Step 2 of 3
          </p>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Choose your services
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            Select the features your school needs. Core services are included by default.
            You can change these anytime from your dashboard.
          </p>
        </div>

        {/* Pricing Summary */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Per-Student Cost</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                ₦{totalCost.toLocaleString()}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  /student per term
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {enabledCount} service{enabledCount !== 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-gray-500">Billed based on enrolled students</p>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div className="space-y-8">
          {sortedCategories.map(([category, categoryServices]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400">
                  {categoryConfig[category]?.icon}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {categoryConfig[category]?.name || category}
                </h3>
                {category === 'core' && (
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full uppercase tracking-wide">
                    Included
                  </span>
                )}
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryServices.map(service => {
                  const isToggling = togglingService === service.service;

                  return (
                    <div
                      key={service.service}
                      className={`relative bg-white dark:bg-gray-900 rounded-xl border-2 p-4 transition-all ${
                        service.is_enabled
                          ? 'border-blue-500 dark:border-blue-600'
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                      }`}
                    >
                      {/* Lock badge for core services */}
                      {service.is_default && (
                        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gray-900 dark:bg-gray-700 text-white text-[10px] font-medium rounded-full">
                          Core
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                            {service.name}
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {service.description}
                          </p>
                        </div>

                        {/* Toggle */}
                        <button
                          onClick={() => handleToggleService(service)}
                          disabled={service.is_default || isToggling}
                          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
                            service.is_enabled
                              ? 'bg-blue-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          } ${service.is_default ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform flex items-center justify-center ${
                              service.is_enabled ? 'translate-x-5' : ''
                            }`}
                          >
                            {isToggling ? (
                              <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                            ) : service.is_enabled ? (
                              <Check className="w-3 h-3 text-blue-600" />
                            ) : (
                              <X className="w-3 h-3 text-gray-400" />
                            )}
                          </span>
                        </button>
                      </div>

                      {/* Price */}
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {service.is_default ? 'Included' : 'Add-on'}
                        </span>
                        <span className={`text-xs font-medium ${
                          service.is_enabled
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-500'
                        }`}>
                          {Number(service.price_per_student) === 0
                            ? 'Free'
                            : `₦${Number(service.price_per_student).toLocaleString()}/student`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-10 hidden sm:flex flex-col sm:flex-row gap-4 justify-between">
          <button
            onClick={() => navigate('/onboarding/register')}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleContinue}
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={handleContinue}
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Complete Setup
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer Note */}
        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400 pb-24 sm:pb-0">
          You can add or remove services at any time from your school settings.
        </p>
      </div>

      {/* Sticky Mobile Footer */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-3 z-20">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-gray-500">Per-student cost</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              ₦{totalCost.toLocaleString()}/term
            </p>
          </div>
          <span className="text-xs text-gray-500">{enabledCount} services</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleContinue}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Complete Setup
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceSelectionPage;
