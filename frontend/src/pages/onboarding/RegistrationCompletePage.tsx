import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Tenant } from '@/services/TenantService';
import { Check, Copy, ArrowRight, ArrowLeft, Settings } from 'lucide-react';

interface LocationState {
  tenant: Tenant;
  adminCredentials: {
    username: string;
    email: string;
  };
  enabledServices: string[];
}

const RegistrationCompletePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | undefined;

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [tenantData, setTenantData] = useState<{
    tenant: Tenant | null;
    adminCredentials: { username: string; email: string } | null;
    enabledServices: string[];
    portalUrl: string;
  }>({
    tenant: null,
    adminCredentials: null,
    enabledServices: [],
    portalUrl: '',
  });

  useEffect(() => {
    // Try to get data from location state first, then localStorage
    if (locationState?.tenant) {
      // Get the current origin for the portal URL (we're already on the subdomain)
      const currentOrigin = window.location.origin;
      setTenantData({
        tenant: locationState.tenant,
        adminCredentials: locationState.adminCredentials,
        enabledServices: locationState.enabledServices || [],
        portalUrl: currentOrigin,
      });
    } else {
      // Try to load from localStorage
      const tenantSlug = localStorage.getItem('tenantSlug');
      const userDataStr = localStorage.getItem('user');

      if (!tenantSlug || !userDataStr) {
        toast.error('Registration information not found');
        navigate('/onboarding/register');
        return;
      }

      try {
        const userData = JSON.parse(userDataStr);
        const currentOrigin = window.location.origin;

        setTenantData({
          tenant: {
            id: localStorage.getItem('tenantId') || '',
            name: tenantSlug,
            slug: tenantSlug,
            custom_domain: null,
            custom_domain_verified: false,
            status: 'active',
            is_active: true,
            owner_email: userData.email,
            owner_name: `${userData.first_name} ${userData.last_name}`,
            owner_phone: '',
            subdomain_url: currentOrigin,
            created_at: '',
            activated_at: null,
          },
          adminCredentials: {
            username: userData.email,
            email: userData.email,
          },
          enabledServices: [],
          portalUrl: currentOrigin,
        });
      } catch {
        toast.error('Session expired. Please log in again.');
        navigate('/login');
        return;
      }
    }
  }, [locationState, navigate]);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleGoToDashboard = () => {
    // User is already authenticated, go directly to admin dashboard
    navigate('/admin/dashboard');
  };

  const handleOpenInNewTab = () => {
    // Open dashboard in new tab
    window.open(tenantData.portalUrl + '/admin/dashboard', '_blank');
  };

  const handleBackToServices = () => {
    navigate('/onboarding/services', {
      state: {
        tenant: tenantData.tenant,
        adminCredentials: tenantData.adminCredentials,
      },
    });
  };

  if (!tenantData.tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const nextSteps = [
    {
      title: 'Add Students & Staff',
      description: 'Import or manually add students, teachers, and parents.',
    },
    {
      title: 'Set Up Classes',
      description: 'Create grade levels, sections, and assign teachers.',
    },
    {
      title: 'Configure Settings',
      description: 'Customize your school profile and grading system.',
    },
    {
      title: 'Invite Admins',
      description: 'Add administrators for different sections.',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Setup complete</p>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">
                {tenantData.tenant.name}
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
                <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs text-gray-500">Services</span>
              </div>
              <div className="w-6 h-px bg-green-500" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-medium text-green-600 dark:text-green-400">Complete</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Registration Complete!
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {tenantData.tenant.name} has been successfully registered.
          </p>
        </div>

        {/* Access Details Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Your Access Details
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Save these details securely for future logins
            </p>
          </div>

          <div className="p-6 space-y-4">
            {/* School Portal URL */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                School Portal URL
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <code className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                    {tenantData.portalUrl}
                  </code>
                </div>
                <button
                  onClick={() => copyToClipboard(tenantData.portalUrl, 'subdomain')}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Copy URL"
                >
                  {copiedField === 'subdomain' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Admin Email */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                Admin Email
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <code className="text-sm text-gray-900 dark:text-white font-mono">
                    {tenantData.adminCredentials?.email}
                  </code>
                </div>
                <button
                  onClick={() => tenantData.adminCredentials && copyToClipboard(tenantData.adminCredentials.email, 'email')}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title="Copy email"
                >
                  {copiedField === 'email' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-900/30">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Important:</strong> You'll use your email and the password you created to log in.
            </p>
          </div>
        </div>

        {/* Enabled Services */}
        {tenantData.enabledServices && tenantData.enabledServices.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Enabled Services
              </h3>
              <button
                onClick={handleBackToServices}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <Settings className="w-3 h-3" />
                Modify
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tenantData.enabledServices.map((service, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs"
                >
                  <Check className="w-3 h-3" />
                  {service}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Next Steps */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            What's Next?
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {nextSteps.map((step, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
                  {index + 1}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    {step.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleGoToDashboard}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleBackToServices}
              className="py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Edit Services
            </button>
            <button
              onClick={handleOpenInNewTab}
              className="py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
            >
              Open in New Tab
            </button>
          </div>
        </div>

        {/* Support Link */}
        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Need help getting started?{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            View our setup guide
          </a>
          {' '}or{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            contact support
          </a>
        </p>
      </div>
    </div>
  );
};

export default RegistrationCompletePage;
