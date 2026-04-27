import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tenantService } from '@/services/TenantService';
import { storeTokens } from '@/services/api';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

type SetupStatus = 'loading' | 'success' | 'error' | 'expired' | 'used';

const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<SetupStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [tenantName, setTenantName] = useState<string>('');
  const [adminCredentials, setAdminCredentials] = useState<{ username: string; email: string } | null>(null);

  // Prevent double execution
  const hasExchanged = useRef(false);

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setErrorMessage('No setup token provided');
      return;
    }

    if (hasExchanged.current) {
      return;
    }

    hasExchanged.current = true;
    exchangeToken(token);
  }, [searchParams]);

  const exchangeToken = async (token: string) => {
    try {
      const response = await tenantService.exchangeSetupToken(token);

      // Store tenant info
      localStorage.setItem('tenantSlug', response.tenant.slug);
      localStorage.setItem('tenantId', response.tenant.id);

      // Store user data for quick access (non-sensitive)
      localStorage.setItem('userData', JSON.stringify(response.user));

      // In development, tokens are also returned in body - store them for Authorization header fallback
      if (response.tokens) {
        storeTokens(response.tokens);
      }

      setTenantName(response.tenant.name);
      setAdminCredentials({
        username: response.user.email,
        email: response.user.email,
      });
      setStatus('success');

      toast.success('Welcome! Your school is ready.', { toastId: 'setup-success' });

      // Redirect to service selection after a short delay
      setTimeout(() => {
        navigate('/onboarding/services', {
          state: {
            tenant: response.tenant,
            subdomain: response.tenant.subdomain_url,
            adminCredentials: {
              username: response.user.email,
              email: response.user.email,
            },
          },
        });
      }, 2000);
    } catch (error: any) {
      console.error('Setup token exchange error:', error);

      const errorData = error.response?.data;
      const errorMsg = errorData?.error || 'Failed to complete setup';

      if (errorMsg.includes('already been used')) {
        setStatus('used');
        setErrorMessage('This setup link has already been used. Please log in instead.');
      } else if (errorMsg.includes('expired')) {
        setStatus('expired');
        setErrorMessage('This setup link has expired. Please register again.');
      } else {
        setStatus('error');
        setErrorMessage(errorMsg);
      }

      toast.error(errorMsg, { toastId: 'setup-error' });
    }
  };

  const handleGoToLogin = () => {
    navigate('/login');
  };

  const handleGoToRegister = () => {
    // Redirect to main domain for registration
    window.location.href = 'http://localhost:5173/onboarding/register';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
          {status === 'loading' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Setting up your school...
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please wait while we prepare your dashboard.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Welcome to {tenantName}!
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Your school is ready. Redirecting to complete setup...
              </p>
              {adminCredentials && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-left">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Your login credentials
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="text-gray-500">Email:</span> {adminCredentials.email}
                  </p>
                </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Setup Failed
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {errorMessage}
              </p>
              <button
                onClick={handleGoToRegister}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {status === 'used' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-yellow-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Link Already Used
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {errorMessage}
              </p>
              <button
                onClick={handleGoToLogin}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Go to Login
              </button>
            </div>
          )}

          {status === 'expired' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-yellow-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Link Expired
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {errorMessage}
              </p>
              <button
                onClick={handleGoToRegister}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Register Again
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Need help? Contact support@nuventacloud.com
        </p>
      </div>
    </div>
  );
};

export default SetupPage;
