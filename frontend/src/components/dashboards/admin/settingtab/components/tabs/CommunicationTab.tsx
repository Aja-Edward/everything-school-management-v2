import React, { useState, useEffect } from 'react';
import { MessageSquare, Mail, Phone, Settings, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import api from '@/services/api';

// ==================== TYPE DEFINITIONS ====================
interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  inAppNotifications: boolean;
  digestFrequency: string;
}

interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  isConfigured: boolean;
  testMode: boolean;
}

interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}

// ==================== TOGGLE SWITCH ====================
const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ id, checked, onChange, label, description }) => (
  <div className="flex items-center justify-between py-3">
    <div className="flex-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 cursor-pointer">
        {label}
      </label>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
    <button
      id={id}
      type="button"
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'bg-gradient-to-r from-blue-500 to-purple-600' : 'bg-slate-200'
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

// ==================== MAIN COMPONENT ====================
const CommunicationTab: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    smsNotifications: false,
    inAppNotifications: true,
    digestFrequency: 'daily'
  });

  const [brevoConfig, setBrevoConfig] = useState<BrevoConfig>({
    apiKey: '',
    senderEmail: '',
    senderName: '',
    isConfigured: false,
    testMode: true
  });

  const [showBrevoKey, setShowBrevoKey] = useState(false);
  const [activeTab, setActiveTab] = useState('notifications');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCommunicationSettings();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  // ==================== LOAD ====================
  const loadCommunicationSettings = async () => {
    try {
      setLoading(true);
      // ✅ api.get sends HttpOnly cookie automatically via credentials: 'include'
      const data = await api.get('/school-settings/communication-settings/');

      setSettings({
        emailNotifications: data.email_notifications_enabled ?? true,
        smsNotifications:   data.sms_notifications_enabled   ?? false,
        inAppNotifications: data.in_app_notifications_enabled ?? true,
        digestFrequency:    data.digest_frequency             ?? 'daily'
      });

      setBrevoConfig({
        apiKey:       data.brevo_api_key      || '',
        senderEmail:  data.brevo_sender_email || '',
        senderName:   data.brevo_sender_name  || '',
        isConfigured: data.brevo_configured   || false,
        testMode:     data.brevo_test_mode    ?? true
      });
    } catch (error) {
      console.error('Failed to load communication settings:', error);
      showError('Failed to load communication settings');
    } finally {
      setLoading(false);
    }
  };

  // ==================== SAVE ====================
  const saveCommunicationSettings = async () => {
    try {
      setSaving(true);
      setErrorMessage(null);

      // ✅ api.put sends HttpOnly cookie automatically
      await api.put('/school-settings/communication-settings/', {
        email_notifications_enabled: settings.emailNotifications,
        sms_notifications_enabled:   settings.smsNotifications,
        in_app_notifications_enabled: settings.inAppNotifications,
        digest_frequency:            settings.digestFrequency,
        brevo_api_key:               brevoConfig.apiKey,
        brevo_sender_email:          brevoConfig.senderEmail,
        brevo_sender_name:           brevoConfig.senderName,
        brevo_test_mode:             brevoConfig.testMode,
      });

      showSuccess('Communication settings saved successfully!');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ==================== TEST BREVO ====================
  const testBrevoConnection = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const data = await api.post('/school-settings/notifications/brevo/test/', {
        apiKey:      brevoConfig.apiKey,
        senderEmail: brevoConfig.senderEmail
      });

      if (data.success) {
        setBrevoConfig(prev => ({ ...prev, isConfigured: true }));
        showSuccess('Brevo connection successful!');
      } else {
        showError(data.message || 'Brevo connection failed');
      }
    } catch (error) {
      showError('Brevo connection failed. Please check your API key.');
    } finally {
      setLoading(false);
    }
  };

  // ==================== SEND TEST EMAIL ====================
  const sendTestEmail = async () => {
    if (!brevoConfig.isConfigured) {
      showError('Please configure and test Brevo first');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const data = await api.post('/school-settings/notifications/brevo/send-test/', {});
      
      if (data.success) {
        showSuccess(data.message || 'Test email sent successfully!');
      } else {
        showError(data.message || 'Failed to send test email');
      }
    } catch (error) {
      showError('Failed to send test email');
    } finally {
      setLoading(false);
    }
  };

  // ==================== RENDER ====================
  return (
    <div className="space-y-8">
      {/* Success/Error Messages */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-green-800 text-sm">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-red-800 text-sm">{errorMessage}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            Communication Settings
          </h3>
          <button
            onClick={saveCommunicationSettings}
            disabled={saving || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-slate-100 rounded-lg p-1 mb-6">
          {(['notifications', 'email', 'sms'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'notifications' ? 'Notifications' : tab === 'email' ? 'Email Setup' : 'SMS'}
            </button>
          ))}
        </div>

        {/* ── Notifications Tab ── */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-50 rounded-xl p-6">
                <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-3 h-3 text-blue-600" />
                  </div>
                  Email Notifications
                  {brevoConfig.isConfigured && <CheckCircle className="w-4 h-4 text-green-500" />}
                </h4>
                <ToggleSwitch
                  id="email-notifications"
                  checked={settings.emailNotifications}
                  onChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
                  label="Enable email notifications"
                  description="Receive important updates via email using Brevo"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-6">
                <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Phone className="w-3 h-3 text-purple-600" />
                  </div>
                  SMS Notifications
                </h4>
                <ToggleSwitch
                  id="sms-notifications"
                  checked={settings.smsNotifications}
                  onChange={(checked) => setSettings({ ...settings, smsNotifications: checked })}
                  label="Enable SMS notifications"
                  description="Text parents urgent alerts. Needs the SMS add-on, ₦10 per SMS."
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-6">
              <h4 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-3 h-3 text-green-600" />
                </div>
                In-App Notifications
              </h4>
              <ToggleSwitch
                id="in-app-notifications"
                checked={settings.inAppNotifications}
                onChange={(checked) => setSettings({ ...settings, inAppNotifications: checked })}
                label="Enable in-app notifications"
                description="Show notifications within the application"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Digest Frequency</label>
              <select
                value={settings.digestFrequency}
                onChange={(e) => setSettings({ ...settings, digestFrequency: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
              >
                <option value="realtime">Real-time</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Email Setup Tab ── */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Email Delivery</h4>
                <p className="text-sm text-slate-600">Optional — use your own Brevo account instead of ours</p>
              </div>
              {brevoConfig.isConfigured && (
                <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                  <CheckCircle className="w-4 h-4" />Connected
                </div>
              )}
            </div>

            {/* Email works without any of this — the platform account is the
                default. Saying so prevents a school thinking their alerts are
                broken, and makes clear what changes if they do add a key. */}
            {brevoConfig.isConfigured ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-900">
                <p className="font-medium mb-1">Emails are sending through your school's own Brevo account.</p>
                <p className="text-green-800">
                  They come from {brevoConfig.senderEmail || 'your sender address'}, and your Brevo account is billed for them.
                  Clear the API key to go back to using ours.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
                <p className="font-medium mb-1">Emails are already working — no setup needed.</p>
                <p className="text-blue-800">
                  Your school's emails currently go out through our email service, showing your school's name as the sender.
                  Add your own Brevo account below only if you want them sent from your own address, or want to manage
                  delivery and billing yourself.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Brevo API Key <span className="font-normal text-slate-400">— optional</span>
                </label>
                <div className="relative">
                  <input
                    type={showBrevoKey ? 'text' : 'password'}
                    value={brevoConfig.apiKey}
                    onChange={(e) => setBrevoConfig({ ...brevoConfig, apiKey: e.target.value })}
                    placeholder="Leave empty to keep using our email service"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBrevoKey(!showBrevoKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showBrevoKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sender Email</label>
                  <input
                    type="email"
                    value={brevoConfig.senderEmail}
                    onChange={(e) => setBrevoConfig({ ...brevoConfig, senderEmail: e.target.value })}
                    placeholder="noreply@yourschool.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sender Name</label>
                  <input
                    type="text"
                    value={brevoConfig.senderName}
                    onChange={(e) => setBrevoConfig({ ...brevoConfig, senderName: e.target.value })}
                    placeholder="Your School Name"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="brevo-test-mode"
                  checked={brevoConfig.testMode}
                  onChange={(e) => setBrevoConfig({ ...brevoConfig, testMode: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="brevo-test-mode" className="text-sm text-slate-700">
                  Enable test mode (emails won't be sent to actual recipients)
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={testBrevoConnection}
                  disabled={loading || !brevoConfig.apiKey}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Test Connection
                </button>
                <button
                  onClick={sendTestEmail}
                  disabled={!brevoConfig.isConfigured || loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Send Test Email
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SMS Tab ── */}
        {/* Texts go out from the platform's Termii account and are billed to
            the school per message, so there is nothing to set up here: the
            school only decides whether to pay for them, on the Services tab. */}
        {activeTab === 'sms' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Phone className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">SMS Delivery</h4>
                <p className="text-sm text-slate-600">No setup needed — we send texts for you</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 space-y-2">
              <p>
                Texts to parents go out through our SMS service. Each SMS costs <strong>₦10</strong> and is added
                to your next invoice. Emails to parents stay free.
              </p>
              <p>
                To start texting, switch on <strong>SMS Notifications</strong> under <strong>Settings → Services</strong>.
                Until then, parents who chose SMS alerts still get them in the app and by email.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunicationTab;