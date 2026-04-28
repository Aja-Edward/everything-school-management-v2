import React, { useState, useEffect } from 'react';
import {
  Globe,
  Link,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Trash2,
  Server,
  Shield,
} from 'lucide-react';
import TenantService, { DomainSettings } from '@/services/TenantService';

interface DomainTabProps {
  settings?: any;
  onSettingsUpdate?: (settings: any) => void;
}

interface DomainInstructions {
  step1: string;
  step2: string;
  step3: string;
}

const DomainTab: React.FC<DomainTabProps> = () => {
  const [domainSettings, setDomainSettings] = useState<DomainSettings | null>(null);
  const [customDomain, setCustomDomain] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [domainAvailable, setDomainAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verificationInstructions, setVerificationInstructions] = useState<DomainInstructions | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    loadDomainSettings();
  }, []);

  const loadDomainSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const settings = await TenantService.getDomainSettings();
      setDomainSettings(settings);
      if (settings.custom_domain) {
        setCustomDomain(settings.custom_domain);
      }
      if (settings.verification_token) {
        setVerificationToken(settings.verification_token);
      }
    } catch (err: any) {
      console.error('Error loading domain settings:', err);
      setError(err.message || 'Failed to load domain settings');
    } finally {
      setIsLoading(false);
    }
  };

  const checkDomainAvailability = async () => {
    if (!customDomain.trim()) return;

    try {
      setIsCheckingAvailability(true);
      setDomainAvailable(null);
      setError(null);
      const result = await TenantService.checkDomainAvailability(customDomain.trim());
      setDomainAvailable(result.available);
      if (!result.available) {
        setError('This domain is already in use by another school');
      }
    } catch (err: any) {
      console.error('Error checking domain availability:', err);
      setError(err.message || 'Failed to check domain availability');
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const handleSetCustomDomain = async () => {
    if (!customDomain.trim()) {
      setError('Please enter a domain');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const result = await TenantService.setCustomDomain(customDomain.trim());

      setVerificationToken(result.verification_token);
      setVerificationInstructions(result.instructions);
      setSuccess(result.message || 'Custom domain set. Please complete DNS verification.');

      // Reload domain settings
      await loadDomainSettings();
    } catch (err: any) {
      console.error('Error setting custom domain:', err);
      setError(err.message || 'Failed to set custom domain');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyDomain = async () => {
    try {
      setIsVerifying(true);
      setError(null);
      setSuccess(null);

      const result = await TenantService.verifyDomain();

      if (result.verified) {
        setSuccess('Domain verified successfully! Your custom domain is now active.');
        setVerificationInstructions(null);
        await loadDomainSettings();
      } else {
        setError(result.error || result.message || 'Domain verification failed. Please check your DNS settings.');
      }
    } catch (err: any) {
      console.error('Error verifying domain:', err);
      setError(err.message || 'Failed to verify domain');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRemoveCustomDomain = async () => {
    if (!confirm('Are you sure you want to remove your custom domain? Your portal will only be accessible via the subdomain.')) {
      return;
    }

    try {
      setIsRemoving(true);
      setError(null);
      setSuccess(null);

      const result = await TenantService.removeCustomDomain();

      setSuccess(result.message || 'Custom domain removed successfully.');
      setCustomDomain('');
      setVerificationInstructions(null);
      setVerificationToken(null);
      await loadDomainSettings();
    } catch (err: any) {
      console.error('Error removing custom domain:', err);
      setError(err.message || 'Failed to remove custom domain');
    } finally {
      setIsRemoving(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDomain = (domain: string) => {
    return domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto"></div>
        <p className="mt-3 text-sm text-gray-500">Loading domain settings...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Domain Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure your school portal's domain. Use your own custom domain or the default subdomain.
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Current Subdomain */}
      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
            <Link className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Default Subdomain</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">
              This is your default portal URL that's always available
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono text-gray-700 truncate">
                {domainSettings?.subdomain_url || `${domainSettings?.subdomain}.nuventacloud.com`}
              </code>
              <button
                onClick={() => copyToClipboard(domainSettings?.subdomain_url || '', 'subdomain')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Copy URL"
              >
                {copiedField === 'subdomain' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <a
                href={domainSettings?.subdomain_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Domain Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Globe className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Custom Domain</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Use your own domain to access your school portal
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Current Custom Domain Status */}
          {domainSettings?.custom_domain && (
            <div className={`flex items-start gap-4 p-4 rounded-lg ${
              domainSettings.custom_domain_verified
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200'
            }`}>
              {domainSettings.custom_domain_verified ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {domainSettings.custom_domain}
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    domainSettings.custom_domain_verified
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {domainSettings.custom_domain_verified ? 'Verified' : 'Pending Verification'}
                  </span>
                </div>
                {!domainSettings.custom_domain_verified && (
                  <p className="text-xs text-amber-700 mt-1">
                    Complete the DNS verification below to activate your custom domain
                  </p>
                )}
              </div>
              <button
                onClick={handleRemoveCustomDomain}
                disabled={isRemoving}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Remove custom domain"
              >
                {isRemoving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          )}

          {/* Domain Input */}
          {!domainSettings?.custom_domain && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Enter your domain
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => {
                      setCustomDomain(formatDomain(e.target.value));
                      setDomainAvailable(null);
                      setError(null);
                    }}
                    placeholder="yourdomain.com"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {domainAvailable !== null && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {domainAvailable ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={checkDomainAvailability}
                  disabled={!customDomain.trim() || isCheckingAvailability}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCheckingAvailability ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Check'
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Enter your domain without http:// or www. Example: schoolname.com
              </p>
            </div>
          )}

          {/* Set Domain Button */}
          {!domainSettings?.custom_domain && customDomain && domainAvailable && (
            <button
              onClick={handleSetCustomDomain}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Setting up domain...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Set Custom Domain
                </>
              )}
            </button>
          )}

          {/* DNS Verification Instructions */}
          {domainSettings?.custom_domain && !domainSettings.custom_domain_verified && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Server className="w-4 h-4" />
                DNS Configuration Required
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Add the following DNS records to your domain provider:
                </p>

                {/* CNAME Record */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">CNAME</span>
                    <span className="text-sm text-gray-700">For www subdomain</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2 rounded border border-gray-200">
                      <span className="text-gray-500">Host/Name:</span>
                      <code className="block font-mono text-gray-800 mt-0.5">www</code>
                    </div>
                    <div className="bg-white p-2 rounded border border-gray-200">
                      <span className="text-gray-500">Value/Points to:</span>
                      <code className="block font-mono text-gray-800 mt-0.5">proxy.nuventacloud.com</code>
                    </div>
                  </div>
                </div>

                {/* A Record */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">A</span>
                    <span className="text-sm text-gray-700">For root domain</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2 rounded border border-gray-200">
                      <span className="text-gray-500">Host/Name:</span>
                      <code className="block font-mono text-gray-800 mt-0.5">@</code>
                    </div>
                    <div className="bg-white p-2 rounded border border-gray-200">
                      <span className="text-gray-500">Value/Points to:</span>
                      <code className="block font-mono text-gray-800 mt-0.5">76.76.21.21</code>
                    </div>
                  </div>
                </div>

                {/* TXT Record for Verification */}
                {(verificationToken || domainSettings?.verification_token) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">TXT</span>
                      <span className="text-sm text-gray-700">For verification</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded border border-gray-200">
                        <span className="text-gray-500">Host/Name:</span>
                        <code className="block font-mono text-gray-800 mt-0.5">_nuventacloud-verify</code>
                      </div>
                      <div className="bg-white p-2 rounded border border-gray-200 relative">
                        <span className="text-gray-500">Value:</span>
                        <code className="block font-mono text-gray-800 mt-0.5 pr-6 truncate">
                          {verificationToken || domainSettings?.verification_token}
                        </code>
                        <button
                          onClick={() => copyToClipboard(verificationToken || domainSettings?.verification_token || '', 'token')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          {copiedField === 'token' ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    DNS changes can take up to 24-48 hours to propagate. After adding the records, click "Verify Domain" to check.
                  </p>
                </div>
              </div>

              {/* Verify Button */}
              <button
                onClick={handleVerifyDomain}
                disabled={isVerifying}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying DNS records...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Verify Domain
                  </>
                )}
              </button>
            </div>
          )}

          {/* Verified Domain Info */}
          {domainSettings?.custom_domain && domainSettings.custom_domain_verified && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-800">
                Your custom domain is active. Users can access your portal at{' '}
                <a
                  href={`https://${domainSettings.custom_domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  {domainSettings.custom_domain}
                </a>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">Need help with DNS configuration?</h4>
        <p className="text-sm text-blue-800 mb-3">
          DNS settings vary by domain provider. Here are guides for common providers:
        </p>
        <div className="flex flex-wrap gap-2">
          {['GoDaddy', 'Namecheap', 'Cloudflare', 'Google Domains'].map((provider) => (
            <span
              key={provider}
              className="px-3 py-1 bg-white text-blue-700 text-xs font-medium rounded-full border border-blue-200"
            >
              {provider}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DomainTab;
