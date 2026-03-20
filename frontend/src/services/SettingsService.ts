import api, { API_BASE_URL } from './api';

export interface SchoolSettings {
  site_name: string;
  school_name: string;
  
  school_code: string;
  address: string;
  phone: string;
  email: string;
  logo: string;
  favicon: string;
  academicYear: string;
  currentTerm?: string;
  motto: string;
  timezone: string;
  dateFormat: string;
  language: string;
  theme: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: string;
  student_portal_enabled: boolean;
  teacher_portal_enabled: boolean;
  parent_portal_enabled: boolean;
  notifications: any;
  paymentGateways: any;
  userRolePaymentAccess: any;
  feeStructure: any;
  discountRules: any;
  classLevels: Array<{ id: number; name: string }>;
  subjects: Array<{ id: number; name: string }>;
  sessions: Array<{ id: number; name: string; terms: string[] }>;
  grading: any;
  markingScheme: any;
  allowSelfRegistration: boolean;
  emailVerificationRequired: boolean;
  registrationApprovalRequired: boolean;
  defaultUserRole: string;
  passwordMinLength: number;
  passwordResetInterval: number;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  passwordRequireUppercase: boolean;
  allowProfileImageUpload: boolean;
  profileImageMaxSize: number;
  security?: {
    twoFactorAuth: boolean;
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSpecialChars: boolean;
      passwordExpiry: number;
    };
    sessionTimeout: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    ipWhitelist: string[];
    auditLogging: boolean;
    dataEncryption: boolean;
  };
  messageTemplates: any;
  chatSystem: any;
}
class SettingsService {

  async getSettings(): Promise<SchoolSettings> {
  try {
    // 🔍 DETECT: Platform or Tenant?
    const hostname = window.location.hostname;
    const isPlatform = hostname === 'localhost' || hostname === '127.0.0.1';
    const endpoint = isPlatform ? 'platform/info/' : 'tenants/settings/';
    console.log(`🔍 Detected ${isPlatform ? 'PLATFORM' : 'TENANT'} - using endpoint: ${endpoint}`);

    // 🛡️ Cache-busting to prevent stale responses
    const cacheBuster = `${Date.now()}_${Math.random()}`;
    const response = await api.get(`${endpoint}?_=${cacheBuster}`);

    // 🛡️ Guard against HTML error pages returned as 200
    if (typeof response === 'string' && response.includes('<!DOCTYPE html>')) {
      console.error('❌ Received HTML instead of JSON — likely a 404 or auth error');
      return this.getDefaultSettings();
    }

    console.log('📥 Raw backend response:', response);

    // Transform response based on environment
    return this.transformBackendToFrontend(response);
  } catch (error) {
    console.error('❌ Error fetching settings:', error);
    // Graceful fallback so the app keeps running
    return this.getDefaultSettings();
  }
}

  async updateSettings(settings: Partial<SchoolSettings>): Promise<SchoolSettings> {
    try {
      console.log('📤 Frontend settings to update:', settings);
      
      const backendSettings: any = {};
      
      // School Information - map to correct backend fields
      if (settings.motto !== undefined) backendSettings.school_motto = settings.motto;
      if (settings.school_code !== undefined) backendSettings.school_code = settings.school_code;
      if (settings.address !== undefined) backendSettings.address = settings.address;
      if (settings.phone !== undefined) backendSettings.phone = settings.phone;
      if (settings.email !== undefined) backendSettings.email = settings.email;
      
      // Branding
      if (settings.logo !== undefined) backendSettings.logo = settings.logo;
      if (settings.favicon !== undefined) backendSettings.favicon = settings.favicon;
      if (settings.primaryColor !== undefined) backendSettings.primary_color = settings.primaryColor;
      if (settings.secondaryColor !== undefined) backendSettings.secondary_color = settings.secondaryColor;
      if (settings.theme !== undefined) backendSettings.theme = settings.theme;
      if (settings.fontFamily !== undefined) backendSettings.typography = settings.fontFamily;
      
      // Localization
      if (settings.timezone !== undefined) backendSettings.timezone = settings.timezone;
      if (settings.dateFormat !== undefined) backendSettings.date_format = settings.dateFormat;
      if (settings.language !== undefined) backendSettings.language = settings.language;
      
      // Portal Access
      if (settings.student_portal_enabled !== undefined) backendSettings.student_portal_enabled = settings.student_portal_enabled;
      if (settings.teacher_portal_enabled !== undefined) backendSettings.teacher_portal_enabled = settings.teacher_portal_enabled;
      if (settings.parent_portal_enabled !== undefined) backendSettings.parent_portal_enabled = settings.parent_portal_enabled;
      
      // Registration Settings
      if (settings.allowSelfRegistration !== undefined) backendSettings.allow_student_registration = settings.allowSelfRegistration;
      if (settings.emailVerificationRequired !== undefined) backendSettings.require_email_verification = settings.emailVerificationRequired;
      if (settings.registrationApprovalRequired !== undefined) backendSettings.registration_approval_required = settings.registrationApprovalRequired;
      if (settings.defaultUserRole !== undefined) backendSettings.default_user_role = settings.defaultUserRole;
      
      // Password Policy
      if (settings.passwordMinLength !== undefined) backendSettings.password_min_length = settings.passwordMinLength;
      if (settings.passwordResetInterval !== undefined) backendSettings.password_reset_interval_days = settings.passwordResetInterval;
      if (settings.passwordRequireNumbers !== undefined) backendSettings.password_require_numbers = settings.passwordRequireNumbers;
      if (settings.passwordRequireSymbols !== undefined) backendSettings.password_require_symbols = settings.passwordRequireSymbols;
      if (settings.passwordRequireUppercase !== undefined) backendSettings.password_require_uppercase = settings.passwordRequireUppercase;
      
      // Profile Settings
      if (settings.allowProfileImageUpload !== undefined) backendSettings.allow_profile_image_upload = settings.allowProfileImageUpload;
      if (settings.profileImageMaxSize !== undefined) backendSettings.profile_image_max_size_mb = settings.profileImageMaxSize;
      
      // Security Settings - map from nested to flat
      if (settings.security !== undefined) {
        const security = settings.security;
        
        if (security.passwordPolicy !== undefined) {
          if (security.passwordPolicy.minLength !== undefined) {
            backendSettings.password_min_length = security.passwordPolicy.minLength;
          }
          if (security.passwordPolicy.requireUppercase !== undefined) {
            backendSettings.password_require_uppercase = security.passwordPolicy.requireUppercase;
          }
          if (security.passwordPolicy.requireNumbers !== undefined) {
            backendSettings.password_require_numbers = security.passwordPolicy.requireNumbers;
          }
          if (security.passwordPolicy.requireSpecialChars !== undefined) {
            backendSettings.password_require_symbols = security.passwordPolicy.requireSpecialChars;
          }
          if (security.passwordPolicy.passwordExpiry !== undefined) {
            backendSettings.password_expiration_days = security.passwordPolicy.passwordExpiry;
          }
        }
        
        if (security.sessionTimeout !== undefined) {
          backendSettings.session_timeout_minutes = security.sessionTimeout;
        }
        if (security.maxLoginAttempts !== undefined) {
          backendSettings.max_login_attempts = security.maxLoginAttempts;
        }
        if (security.lockoutDuration !== undefined) {
          backendSettings.account_lock_duration_minutes = security.lockoutDuration;
        }
      }
      
      // JSON Fields - these go directly
      if (settings.notifications !== undefined) backendSettings.notifications = settings.notifications;
      if (settings.paymentGateways !== undefined) backendSettings.payment_gateways = settings.paymentGateways;
      if (settings.userRolePaymentAccess !== undefined) backendSettings.user_role_payment_access = settings.userRolePaymentAccess;
      if (settings.feeStructure !== undefined) backendSettings.fee_structure = settings.feeStructure;
      if (settings.discountRules !== undefined) backendSettings.discount_rules = settings.discountRules;
      if (settings.classLevels !== undefined) backendSettings.class_levels = settings.classLevels;
      if (settings.subjects !== undefined) backendSettings.subjects = settings.subjects;
      if (settings.sessions !== undefined) backendSettings.sessions = settings.sessions;
      if (settings.grading !== undefined) backendSettings.grading = settings.grading;
      if (settings.markingScheme !== undefined) backendSettings.marking_scheme = settings.markingScheme;
      if (settings.messageTemplates !== undefined) backendSettings.message_templates = settings.messageTemplates;
      if (settings.chatSystem !== undefined) backendSettings.chat_system = settings.chatSystem;
      
      console.log('📤 Transformed for backend:', backendSettings);
      
      const response = await api.patch('tenants/settings/', backendSettings);
      console.log('✅ Backend response:', response);
      
      const transformedResponse = this.transformBackendToFrontend(response);
      console.log('✅ Transformed response:', transformedResponse);
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settings-updated', { detail: transformedResponse }));
      }
      
      return transformedResponse;
    } catch (error: any) {
      console.error('Error updating settings:', error);
      console.error('Error response:', error.response?.data);
      
      const errorData = error.response?.data;
      let errorMessage = 'Failed to update school settings';
      
      if (typeof errorData === 'object' && errorData !== null) {
        const errors: string[] = [];
        for (const [field, messages] of Object.entries(errorData)) {
          if (Array.isArray(messages)) {
            errors.push(`${field}: ${messages.join(', ')}`);
          } else if (typeof messages === 'string') {
            errors.push(`${field}: ${messages}`);
          } else if (typeof messages === 'object') {
            errors.push(`${field}: ${JSON.stringify(messages)}`);
          }
        }
        if (errors.length > 0) {
          errorMessage = `Validation errors:\n${errors.join('\n')}`;
        }
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  private transformBackendToFrontend(response: any): SchoolSettings {
    console.log('🔄 Transforming backend response to frontend');
    
    const defaultSettings = this.getDefaultSettings();
    
    return {
      // These come from tenant relationship - read-only from frontend perspective
      site_name: response.school_name ?? response.school_name ?? 'School Site',
      school_name: response.school_name ?? 'School Name',
      // Actual editable fields
      school_code: response.school_code ?? '',
      motto: response.school_motto ?? 'Knowledge at its springs',
      address: response.address ?? '',
      phone: response.phone ?? '',
      email: response.email ?? '',
      
      // Branding
      logo: response.logo_url ?? response.logo ?? '',
      favicon: response.favicon_url ?? response.favicon ?? '',
      primaryColor: response.primary_color ?? '#4F46E5',
      secondaryColor: response.secondary_color ?? '#10B981',
      theme: response.theme ?? 'default',
      fontFamily: response.typography ?? 'Inter',
      fontSize: 'medium',
      
      // Academic
      academicYear: response.academic_year ?? '',
      currentTerm: response.current_term ?? '',
      
      // Localization
      timezone: response.timezone ?? 'UTC+1',
      dateFormat: response.date_format ?? 'DD/MM/YYYY',
      language: response.language ?? 'en',
      
      // Portal Access
      student_portal_enabled: response.student_portal_enabled ?? true,
      teacher_portal_enabled: response.teacher_portal_enabled ?? true, 
      parent_portal_enabled: response.parent_portal_enabled ?? true,
      
      // Registration
      allowSelfRegistration: response.allow_student_registration ?? true,
      emailVerificationRequired: response.require_email_verification ?? true,
      registrationApprovalRequired: response.registration_approval_required ?? false,
      defaultUserRole: response.default_user_role ?? 'student',
      
      // Password Policy
      passwordMinLength: response.password_min_length ?? 8,
      passwordResetInterval: response.password_reset_interval_days ?? 90,
      passwordRequireNumbers: response.password_require_numbers ?? true,
      passwordRequireSymbols: response.password_require_symbols ?? false,
      passwordRequireUppercase: response.password_require_uppercase ?? false,
      
      // Profile
      allowProfileImageUpload: response.allow_profile_image_upload ?? true,
      profileImageMaxSize: response.profile_image_max_size_mb ?? 2,
      
      // JSON Fields
      notifications: response.notifications ?? defaultSettings.notifications,
      paymentGateways: response.payment_gateways ?? defaultSettings.paymentGateways,
      userRolePaymentAccess: response.user_role_payment_access ?? defaultSettings.userRolePaymentAccess,
      feeStructure: response.fee_structure ?? defaultSettings.feeStructure,
      discountRules: response.discount_rules ?? defaultSettings.discountRules,
      classLevels: response.class_levels ?? [],
      subjects: response.subjects ?? [],
      sessions: response.sessions ?? [],
      grading: response.grading ?? { grades: [], passMark: 40 },
      markingScheme: response.marking_scheme ?? {
        continuousAssessment: 30,
        examination: 70,
        components: []
      },
      messageTemplates: response.message_templates ?? defaultSettings.messageTemplates,
      chatSystem: response.chat_system ?? defaultSettings.chatSystem,
      
      // Security - map from flat backend fields to nested frontend structure
      security: {
        twoFactorAuth: true, // Not in backend yet
        passwordPolicy: {
          minLength: response.password_min_length ?? 8,
          requireUppercase: response.password_require_uppercase ?? false,
          requireLowercase: true, // Not in backend
          requireNumbers: response.password_require_numbers ?? false,
          requireSpecialChars: response.password_require_symbols ?? false,
          passwordExpiry: response.password_expiration_days ?? 90
        },
        sessionTimeout: response.session_timeout_minutes ?? 30,
        maxLoginAttempts: response.max_login_attempts ?? 5,
        lockoutDuration: response.account_lock_duration_minutes ?? 15,
        ipWhitelist: [],
        auditLogging: true,
        dataEncryption: true
      },
    };
  }

  // SettingsService.ts

async uploadLogo(file: File): Promise<{ logoUrl: string }> {
  const formData = new FormData();
  formData.append('logo', file);
  
  const getCsrfToken = () => {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrftoken') return decodeURIComponent(value);
    }
    return null;
  };
  
  // Get tenant info from localStorage or sessionStorage
  const getTenantInfo = () => {
    const tenantId = localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId');
    const tenantSlug = localStorage.getItem('tenantSlug') || sessionStorage.getItem('tenantSlug');
    return { tenantId, tenantSlug };
  };
  
  const { tenantId, tenantSlug } = getTenantInfo();
  
  const headers: any = {};
  const authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
  const csrfToken = getCsrfToken();
  
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (csrfToken) headers['X-CSRFToken'] = csrfToken;
  
  // Add tenant headers
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;
  
  const response = await fetch(
    `${API_BASE_URL}/tenants/settings/upload-logo/`,
    {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    }
  );
  
  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    const errorData = contentType?.includes('application/json') 
      ? await response.json()
      : { error: await response.text() };
    throw new Error(`Failed to upload logo: ${response.status} - ${JSON.stringify(errorData)}`);
  }
  
  return await response.json();
}

async uploadFavicon(file: File): Promise<{ faviconUrl: string }> {
  const formData = new FormData();
  formData.append('favicon', file);
  
  const getCsrfToken = () => {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrftoken') return decodeURIComponent(value);
    }
    return null;
  };
  
  // Get tenant info from localStorage or sessionStorage
  const getTenantInfo = () => {
    const tenantId = localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId');
    const tenantSlug = localStorage.getItem('tenantSlug') || sessionStorage.getItem('tenantSlug');
    return { tenantId, tenantSlug };
  };
  
  const { tenantId, tenantSlug } = getTenantInfo();
  
  const headers: any = {};
  const authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
  const csrfToken = getCsrfToken();
  
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (csrfToken) headers['X-CSRFToken'] = csrfToken;
  
  // Add tenant headers
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;
  
  const response = await fetch(
    `${API_BASE_URL}/tenants/settings/upload-favicon/`,
    {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    }
  );
  
  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    const errorData = contentType?.includes('application/json')
      ? await response.json()
      : { error: await response.text() };
    throw new Error(`Failed to upload favicon: ${response.status} - ${JSON.stringify(errorData)}`);
  }
  
  return await response.json();
}
  
  private getDefaultSettings(): SchoolSettings {
    return {
      site_name: 'School Site',
      school_name: 'School Name',
      school_code: '',
      address: '',
      phone: '',
      email: '',
      logo: '',
      favicon: '',
      academicYear: '',
      motto: 'Knowledge at its springss',
      timezone: 'UTC+1',
      dateFormat: 'dd/mm/yyyy',
      language: 'English',
      theme: 'light',
      primaryColor: '#3B82F6',
      secondaryColor: '#10B981',
      fontFamily: 'Inter',
      fontSize: 'medium',
      student_portal_enabled: true,
      teacher_portal_enabled: true, 
      parent_portal_enabled: true, 
      notifications: {
        email: {
          enabled: true,
          welcomeEmail: true,
          resultReleased: true,
          absentNotice: true,
          feeReminder: true,
          examSchedule: true,
          eventAnnouncement: true,
          disciplinaryAction: false,
          provider: 'smtp',
          smtp: {
            host: 'smtp.gmail.com',
            port: 587,
            username: '',
            password: '',
            encryption: 'TLS',
            fromName: 'School',
            fromEmail: 'admin@school.edu'
          },
          brevo: {
            apiKey: '',
            fromName: 'School',
            fromEmail: 'admin@school.edu',
            templateId: '',
            senderId: 1
          }
        },
        sms: {
          enabled: false,
          welcomeSMS: false,
          resultReleased: true,
          absentNotice: true,
          feeReminder: true,
          examSchedule: false,
          eventAnnouncement: false,
          disciplinaryAction: false,
          provider: 'twilio',
          apiKey: '',
          apiSecret: '',
          senderID: 'SCHOOL'
        },
        inApp: {
          enabled: true,
          welcomeMessage: true,
          resultReleased: true,
          absentNotice: true,
          feeReminder: true,
          examSchedule: true,
          eventAnnouncement: true,
          disciplinaryAction: true,
          soundEnabled: true,
          desktopNotifications: true
        }
      },
      paymentGateways: {
        paystack: { enabled: false, publicKey: '', secretKey: '', testMode: false },
        stripe: { enabled: false, publishableKey: '', secretKey: '', testMode: false },
        flutterwave: { enabled: false, publicKey: '', secretKey: '', testMode: true },
        bankTransfer: { enabled: false, bankName: '', accountNumber: '', accountName: '' }
      },
      userRolePaymentAccess: {
        teachers: { paystack: false, stripe: false, flutterwave: false, bankTransfer: false },
        students: { paystack: false, stripe: false, flutterwave: false, bankTransfer: false },
        parents: { paystack: false, stripe: false, flutterwave: false, bankTransfer: false }
      },
      feeStructure: {
        categories: [],
        paymentPlans: { fullPayment: false, twoInstallments: false, threeInstallments: false }
      },
      discountRules: {
        siblingDiscount: { enabled: false, secondChild: 0, thirdChild: 0 }
      },
      classLevels: [],
      subjects: [],
      sessions: [],
      grading: { grades: [], passMark: 40 },
      markingScheme: { continuousAssessment: 30, examination: 70, components: [] },
      allowSelfRegistration: true,
      emailVerificationRequired: true,
      registrationApprovalRequired: false,
      defaultUserRole: 'student',
      passwordMinLength: 8,
      passwordResetInterval: 90,
      passwordRequireNumbers: true,
      passwordRequireSymbols: false,
      passwordRequireUppercase: false,
      allowProfileImageUpload: true,
      profileImageMaxSize: 2,
      messageTemplates: {
        welcomeEmail: { subject: 'Welcome', content: 'Welcome!', active: true },
        resultReleased: { subject: 'Results Available', content: 'Results available.', active: true },
        absentNotice: { subject: 'Absence Notice', content: 'Absent today.', active: true },
        feeReminder: { subject: 'Fee Reminder', content: 'Pay fees.', active: true }
      },
      chatSystem: {
        enabled: true,
        adminToTeacher: { enabled: true, allowFileSharing: true, maxFileSize: 10, allowedFileTypes: ['pdf'], moderationEnabled: false },
        teacherToParent: { enabled: true, allowFileSharing: true, maxFileSize: 5, allowedFileTypes: ['pdf'], moderationEnabled: true, requireApproval: false },
        teacherToStudent: { enabled: false, allowFileSharing: false, maxFileSize: 2, allowedFileTypes: ['pdf'], moderationEnabled: true, requireApproval: true },
        parentToParent: { enabled: false, allowFileSharing: false, moderationEnabled: true, requireApproval: true },
        moderation: {
          enabled: true,
          profanityFilter: true,
          keywordBlacklist: [],
          autoModeration: true,
          flaggedContentAction: 'hide',
          moderators: [],
          businessHoursOnly: false,
          businessHours: { start: '08:00', end: '16:00' }
        }
      },
      security: {
        twoFactorAuth: false,
        passwordPolicy: {
          minLength: 8,
          requireUppercase: false,
          requireLowercase: true,
          requireNumbers: false,
          requireSpecialChars: false,
          passwordExpiry: 90
        },
        sessionTimeout: 30,
        maxLoginAttempts: 5,
        lockoutDuration: 15,
        ipWhitelist: [],
        auditLogging: true,
        dataEncryption: true
      }
    };
  }
}

export default new SettingsService();

// ============================================================================
// COMMUNICATION SETTINGS SERVICE
// ============================================================================

export interface CommunicationSettings {
  id: number;
  brevo_api_key?: string;
  brevo_sender_email?: string;
  brevo_sender_name?: string;
  brevo_configured: boolean;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_phone_number?: string;
  twilio_configured: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunicationTestResult {
  success: boolean;
  message: string;
}

class CommunicationSettingsService {
  async getSettings(): Promise<CommunicationSettings> {
    try {
      // Note: This might need to be updated based on your TenantSettings model
      // If communication settings are part of TenantSettings, you may need to adjust
      const response = await api.get('school-settings/communication-settings/');
      return response;
    } catch (error) {
      console.error('Error fetching communication settings:', error);
      throw error;
    }
  }

  async updateSettings(settings: Partial<CommunicationSettings>): Promise<CommunicationSettings> {
    try {
      const response = await api.put('school-settings/communication-settings/', settings);
      return response;
    } catch (error) {
      console.error('Error updating communication settings:', error);
      throw error;
    }
  }

  async testBrevoConnection(apiKey: string, senderEmail: string): Promise<CommunicationTestResult> {
    try {
      const response = await api.post('school-settings/test-brevo-connection/', {
        apiKey,
        senderEmail,
      });
      return response;
    } catch (error) {
      console.error('Error testing Brevo connection:', error);
      throw error;
    }
  }

  async testTwilioConnection(accountSid: string, authToken: string, phoneNumber: string): Promise<CommunicationTestResult> {
    try {
      const response = await api.post('school-settings/test-twilio-connection/', {
        accountSid,
        authToken,
        phoneNumber,
      });
      return response;
    } catch (error) {
      console.error('Error testing Twilio connection:', error);
      throw error;
    }
  }

  async sendTestEmail(): Promise<CommunicationTestResult> {
    try {
      const response = await api.post('school-settings/send-test-email/', {});
      return response;
    } catch (error) {
      console.error('Error sending test email:', error);
      throw error;
    }
  }

  async sendTestSMS(testNumber: string): Promise<CommunicationTestResult & { message_sid?: string; status?: string }> {
    try {
      const response = await api.post('school-settings/send-test-sms/', {
        testNumber,
      });
      return response;
    } catch (error) {
      console.error('Error sending test SMS:', error);
      throw error;
    }
  }

  async testEmailConnection(provider: 'smtp' | 'brevo', config: any): Promise<CommunicationTestResult> {
    try {
      const response = await api.post('school-settings/test-email-connection/', {
        provider,
        ...config,
      });
      return response;
    } catch (error) {
      console.error('Error testing email connection:', error);
      throw error;
    }
  }

  async testSMSConnection(config: { provider: string; apiKey: string; apiSecret: string }): Promise<CommunicationTestResult> {
    try {
      const response = await api.post('school-settings/test-sms-connection/', config);
      return response;
    } catch (error) {
      console.error('Error testing SMS connection:', error);
      throw error;
    }
  }

  async testPaymentGateway(gateway: 'paystack' | 'stripe' | 'flutterwave', credentials: any): Promise<CommunicationTestResult> {
    try {
      const response = await api.post(`school-settings/test-payment-gateway/${gateway}/`, credentials);
      return response;
    } catch (error) {
      console.error(`Error testing ${gateway} gateway:`, error);
      throw error;
    }
  }
}

export const communicationSettingsService = new CommunicationSettingsService();

// ============================================================================
// PERMISSIONS SERVICE
// ============================================================================

export interface Permission {
  id: number;
  module: string;
  module_display?: string;
  permission_type: 'read' | 'write' | 'delete' | 'admin';
  permission_type_display?: string;
  section: 'primary' | 'secondary' | 'nursery' | 'all';
  section_display?: string;
  granted: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePermissionData {
  module: string;
  permission_type: 'read' | 'write' | 'delete' | 'admin';
  section: 'primary' | 'secondary' | 'nursery' | 'all';
  granted: boolean;
  description?: string;
}

export interface PermissionFilters {
  module?: string;
  permission_type?: string;
  section?: string;
}

class PermissionService {
  async getPermissions(params?: PermissionFilters): Promise<Permission[]> {
    try {
      const response = await api.get('school-settings/permissions/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching permissions:', error);
      throw error;
    }
  }

  async getPermission(id: number): Promise<Permission> {
    try {
      const response = await api.get(`school-settings/permissions/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching permission ${id}:`, error);
      throw error;
    }
  }

  async createPermission(data: CreatePermissionData): Promise<Permission> {
    try {
      const response = await api.post('school-settings/permissions/', data);
      return response;
    } catch (error) {
      console.error('Error creating permission:', error);
      throw error;
    }
  }

  async updatePermission(id: number, data: Partial<CreatePermissionData>): Promise<Permission> {
    try {
      const response = await api.patch(`school-settings/permissions/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating permission ${id}:`, error);
      throw error;
    }
  }

  async deletePermission(id: number): Promise<void> {
    try {
      await api.delete(`school-settings/permissions/${id}/`);
    } catch (error) {
      console.error(`Error deleting permission ${id}:`, error);
      throw error;
    }
  }

  async bulkCreatePermissions(permissions: CreatePermissionData[]): Promise<{ message: string; permissions: Permission[] }> {
    try {
      const response = await api.post('school-settings/permissions/bulk_create/', {
        permissions,
      });
      return response;
    } catch (error) {
      console.error('Error bulk creating permissions:', error);
      throw error;
    }
  }
}

export const permissionService = new PermissionService();

// ============================================================================
// ROLES SERVICE
// ============================================================================

export interface Role {
  id: number;
  name: string;
  description?: string;
  color: string;
  is_system: boolean;
  primary_section_access: boolean;
  secondary_section_access: boolean;
  nursery_section_access: boolean;
  permissions: Permission[];
  permission_ids?: number[];
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRoleData {
  name: string;
  description?: string;
  color?: string;
  primary_section_access?: boolean;
  secondary_section_access?: boolean;
  nursery_section_access?: boolean;
  permission_ids?: number[];
}

class RoleService {
  async getRoles(): Promise<Role[]> {
    try {
      const response = await api.get('school-settings/roles/');
      return response.results || response;
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  }

  async getRole(id: number): Promise<Role> {
    try {
      const response = await api.get(`school-settings/roles/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching role ${id}:`, error);
      throw error;
    }
  }

  async createRole(data: CreateRoleData): Promise<Role> {
    try {
      const response = await api.post('school-settings/roles/', data);
      return response;
    } catch (error) {
      console.error('Error creating role:', error);
      throw error;
    }
  }

  async updateRole(id: number, data: Partial<CreateRoleData>): Promise<Role> {
    try {
      const response = await api.patch(`school-settings/roles/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating role ${id}:`, error);
      throw error;
    }
  }

  async deleteRole(id: number): Promise<void> {
    try {
      await api.delete(`school-settings/roles/${id}/`);
    } catch (error) {
      console.error(`Error deleting role ${id}:`, error);
      throw error;
    }
  }

  async duplicateRole(id: number): Promise<{ message: string; role: Role }> {
    try {
      const response = await api.post(`school-settings/roles/${id}/duplicate/`, {});
      return response;
    } catch (error) {
      console.error(`Error duplicating role ${id}:`, error);
      throw error;
    }
  }

  async getRoleUsers(id: number): Promise<{
    role: string;
    user_count: number;
    users: Array<{
      id: number;
      username: string;
      email: string;
      full_name: string;
      is_active: boolean;
      assigned_at: string;
      expires_at?: string;
      assigned_by?: string;
      primary_section_access: boolean;
      secondary_section_access: boolean;
      nursery_section_access: boolean;
    }>;
  }> {
    try {
      const response = await api.get(`school-settings/roles/${id}/users/`);
      return response;
    } catch (error) {
      console.error(`Error fetching users for role ${id}:`, error);
      throw error;
    }
  }
}

export const roleService = new RoleService();

// ============================================================================
// USER ROLES SERVICE
// ============================================================================

export interface UserRole {
  id: number;
  user: number;
  user_details?: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: string;
  };
  role: number;
  role_details?: Role;
  assigned_by?: number;
  assigned_by_name?: string;
  assigned_at: string;
  expires_at?: string;
  is_active: boolean;
  primary_section_access: boolean;
  secondary_section_access: boolean;
  nursery_section_access: boolean;
  custom_permissions: Permission[];
  custom_permission_ids?: number[];
}

export interface CreateUserRoleData {
  user: number;
  role: number;
  expires_at?: string;
  is_active?: boolean;
  primary_section_access?: boolean;
  secondary_section_access?: boolean;
  nursery_section_access?: boolean;
  custom_permission_ids?: number[];
}

export interface UserRoleFilters {
  user?: number;
  role?: number;
  is_active?: boolean;
}

export interface UserPermissionsSummary {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  role_assignments: Array<{
    role_id: number;
    role_name: string;
    role_color: string;
    sections: {
      primary: boolean;
      secondary: boolean;
      nursery: boolean;
    };
    expires_at?: string;
    permissions: Record<string, boolean>;
  }>;
  effective_permissions: Record<string, {
    read: boolean;
    write: boolean;
    delete: boolean;
    admin: boolean;
    sections: {
      primary: boolean;
      secondary: boolean;
      nursery: boolean;
    };
  }>;
}

class UserRoleService {
  async getUserRoles(params?: UserRoleFilters): Promise<UserRole[]> {
    try {
      const response = await api.get('school-settings/user-roles/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching user roles:', error);
      throw error;
    }
  }

  async getUserRole(id: number): Promise<UserRole> {
    try {
      const response = await api.get(`school-settings/user-roles/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching user role ${id}:`, error);
      throw error;
    }
  }

  async createUserRole(data: CreateUserRoleData): Promise<UserRole> {
    try {
      const response = await api.post('school-settings/user-roles/', data);
      return response;
    } catch (error) {
      console.error('Error creating user role:', error);
      throw error;
    }
  }

  async updateUserRole(id: number, data: Partial<CreateUserRoleData>): Promise<UserRole> {
    try {
      const response = await api.patch(`school-settings/user-roles/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating user role ${id}:`, error);
      throw error;
    }
  }

  async deleteUserRole(id: number): Promise<void> {
    try {
      await api.delete(`school-settings/user-roles/${id}/`);
    } catch (error) {
      console.error(`Error deleting user role ${id}:`, error);
      throw error;
    }
  }

  async getUserPermissions(userId: number): Promise<UserPermissionsSummary> {
    try {
      const response = await api.get('school-settings/user-roles/user_permissions/', {
        params: { user_id: userId },
      });
      return response;
    } catch (error) {
      console.error(`Error fetching permissions for user ${userId}:`, error);
      throw error;
    }
  }

  async bulkAssignRoles(assignments: CreateUserRoleData[]): Promise<{ message: string; assignments: UserRole[] }> {
    try {
      const response = await api.post('school-settings/user-roles/bulk_assign/', {
        assignments,
      });
      return response;
    } catch (error) {
      console.error('Error bulk assigning roles:', error);
      throw error;
    }
  }

  async updateUserRoleByEmail(email: string, role: string): Promise<{
    message: string;
    role: string;
    is_staff: boolean;
    user_role_id: number;
    user_role_status: 'created' | 'updated';
  }> {
    try {
      const response = await api.post('school-settings/update-user-role/', {
        email,
        role,
      });
      return response;
    } catch (error) {
      console.error('Error updating user role by email:', error);
      throw error;
    }
  }
}

export const userRoleService = new UserRoleService();

// ============================================================================
// SCHOOL ANNOUNCEMENTS SERVICE
// ============================================================================

export interface SchoolAnnouncement {
  id: number;
  title: string;
  content: string;
  announcement_type: 'general' | 'academic' | 'event' | 'urgent' | 'maintenance';
  announcement_type_display?: string;
  target_audience: 'all' | 'students' | 'teachers' | 'parents' | 'staff';
  target_audience_display?: string;
  is_active: boolean;
  is_pinned: boolean;
  published_at?: string;
  expires_at?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementData {
  title: string;
  content: string;
  announcement_type: 'general' | 'academic' | 'event' | 'urgent' | 'maintenance';
  target_audience: 'all' | 'students' | 'teachers' | 'parents' | 'staff';
  is_active?: boolean;
  is_pinned?: boolean;
  published_at?: string;
  expires_at?: string;
}

class SchoolAnnouncementService {
  async getAnnouncements(): Promise<SchoolAnnouncement[]> {
    try {
      const response = await api.get('school-settings/announcements/');
      return response.results || response;
    } catch (error) {
      console.error('Error fetching announcements:', error);
      throw error;
    }
  }

  async getAnnouncement(id: number): Promise<SchoolAnnouncement> {
    try {
      const response = await api.get(`school-settings/announcements/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching announcement ${id}:`, error);
      throw error;
    }
  }

  async createAnnouncement(data: CreateAnnouncementData): Promise<SchoolAnnouncement> {
    try {
      const response = await api.post('school-settings/announcements/', data);
      return response;
    } catch (error) {
      console.error('Error creating announcement:', error);
      throw error;
    }
  }

  async updateAnnouncement(id: number, data: Partial<CreateAnnouncementData>): Promise<SchoolAnnouncement> {
    try {
      const response = await api.patch(`school-settings/announcements/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating announcement ${id}:`, error);
      throw error;
    }
  }

  async deleteAnnouncement(id: number): Promise<void> {
    try {
      await api.delete(`school-settings/announcements/${id}/`);
    } catch (error) {
      console.error(`Error deleting announcement ${id}:`, error);
      throw error;
    }
  }

  async toggleActive(id: number): Promise<SchoolAnnouncement> {
    try {
      const response = await api.post(`school-settings/announcements/${id}/toggle_active/`, {});
      return response;
    } catch (error) {
      console.error(`Error toggling active status for announcement ${id}:`, error);
      throw error;
    }
  }

  async togglePinned(id: number): Promise<SchoolAnnouncement> {
    try {
      const response = await api.post(`school-settings/announcements/${id}/toggle_pinned/`, {});
      return response;
    } catch (error) {
      console.error(`Error toggling pinned status for announcement ${id}:`, error);
      throw error;
    }
  }
}

export const schoolAnnouncementService = new SchoolAnnouncementService();