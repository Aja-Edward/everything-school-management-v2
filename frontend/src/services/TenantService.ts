/**
 * Tenant Service
 *
 * Manages multi-tenant operations including:
 * - School registration and onboarding
 * - Tenant management and settings
 * - Service subscription management
 * - Custom domain configuration
 * - Billing, invoicing, and payments (Paystack integration)
 * - Team invitations
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS - TENANT
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  subdomain_url: string;
  custom_domain?: string;
  custom_domain_verified: boolean;
  domain_verification_token?: string;
  owner_email: string;
  status: 'pending' | 'active' | 'suspended' | 'cancelled';
  status_display?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  activated_at?: string;
}

export type PublicTenant = Pick<          // <-- was missing the `<`
  Tenant,
  'id' | 'name' | 'slug' | 'status' | 'is_active' | 'subdomain_url'
>;

export interface TenantSettings {
  id: number;
  tenant: string;
  school_code?: string;
  school_motto?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  favicon?: string;
  primary_color: string;
  secondary_color: string;
  theme: string;
  typography: string;
  current_session?: number;
  current_term?: number;
  timezone: string;
  date_format: string;
  language: string;
  currency: string;
  allow_student_registration: boolean;
  allow_parent_registration: boolean;
  registration_approval_required: boolean;
  default_user_role: string;
  require_email_verification: boolean;
  session_timeout_minutes: number;
  max_login_attempts: number;
  account_lock_duration_minutes: number;
  password_min_length: number;
  password_reset_interval_days: number;
  password_require_numbers: boolean;
  password_require_symbols: boolean;
  password_require_uppercase: boolean;
  password_expiration_days: number;
  allow_profile_image_upload: boolean;
  profile_image_max_size_mb: number;
  notifications_enabled: boolean;
  student_portal_enabled: boolean;
  teacher_portal_enabled: boolean;
  parent_portal_enabled: boolean;
  show_position_on_result: boolean;
  show_class_average_on_result: boolean;
  require_token_for_result: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicTenantSettings {
  logo?: string;
  favicon?: string;
  primary_color?: string;
  secondary_color?: string;
  school_motto?: string;
  student_portal_enabled: boolean;
  teacher_portal_enabled: boolean;
  parent_portal_enabled: boolean;
}

export interface SchoolRegistrationData {
  school_name: string;
  slug: string;
  // admin_email?: string;
  // owner_email: string;
  // admin_first_name?: string;
  // admin_last_name?: string;
  // password?: string;
  // confirm_password?: string;
  // billing_period?: string;
  admin_phone?: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_phone?: string;
  owner_password: string;
}


export interface SchoolRegistrationResponse {
  message: string;
  tenant: Tenant;
  subdomain: string;
  setup_url: string;
  setup_token: string;
  admin_credentials: {
    username: string;
    email: string;
  };
  user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  };
}

// ============================================================================
// TYPE DEFINITIONS - SERVICES
// ============================================================================

export interface TenantServiceType {
  service: string;
  name: string;
  description?: string;
  price_per_student: number;
  is_default: boolean;
  is_enabled: boolean;
  category: 'core' | 'attendance' | 'assessment' | 'communication' | 'finance' | 'scheduling' | 'other';
}

export interface ServicePricing {
  id: number;
  service: string;
  service_display?: string;
  description?: string;
  price_per_student: number;
  billing_cycle: 'monthly' | 'quarterly' | 'annually';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// TYPE DEFINITIONS - DOMAIN
// ============================================================================

export interface DomainSettings {
  subdomain: string;
  subdomain_url: string;
  custom_domain?: string;
  custom_domain_verified: boolean;
  verification_token?: string;
}

export interface DomainVerificationInstructions {
  domain: string;
  verification_token: string;
  instructions: {
    step1: string;
    step2: string;
    step3: string;
  };
  message: string;
}

// ============================================================================
// TYPE DEFINITIONS - BILLING & PAYMENTS
// ============================================================================

export interface TenantInvoice {
  id: string;
  tenant: string;
  invoice_number: string;
  billing_period: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: 'draft' | 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';
  status_display?: string;
  line_items?: TenantInvoiceLineItem[];
  created_at: string;
  updated_at: string;
}

export interface TenantInvoiceLineItem {
  id: number;
  invoice: string;
  service: string;
  service_display?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InvoiceSummary {
  total_invoices: number;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  pending_count: number;
  overdue_count: number;
}

export interface TenantPayment {
  id: string;
  invoice: string;
  amount: number;
  payment_method: 'paystack' | 'manual' | 'bank_transfer';
  payment_method_display?: string;
  status: 'pending' | 'confirmed' | 'failed';
  status_display?: string;
  reference: string;
  paystack_reference?: string;
  paystack_transaction_id?: string;
  bank_name?: string;
  account_name?: string;
  payment_proof?: string;
  confirmation_notes?: string;
  confirmed_by?: number;
  confirmed_at?: string;
  created_at: string;
}

export interface PaystackInitializeResponse {
  message: string;
  authorization_url: string;
  access_code: string;
  reference: string;
}

// ============================================================================
// TYPE DEFINITIONS - INVITATIONS
// ============================================================================

export interface TenantInvitation {
  id: string;
  tenant: string;
  email: string;
  role: 'admin' | 'teacher' | 'staff';
  role_display?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  status_display?: string;
  token: string;
  invited_by?: number;
  invited_by_name?: string;
  expires_at: string;
  accepted_at?: string;
  is_valid: boolean;
  is_expired: boolean;
  created_at: string;
}

// ============================================================================
// TENANT SERVICE
// ============================================================================

class TenantService {
  // ============================================================================
  // SCHOOL REGISTRATION & ONBOARDING
  // ============================================================================

  /**
   * Register a new school on the platform
   */
  async registerSchool(data: SchoolRegistrationData): Promise<SchoolRegistrationResponse> {
    try {
      const response = await api.post('/api/tenants/register/', data);
      return response;
    } catch (error) {
      console.error('Error registering school:', error);
      throw error;
    }
  }

  /**
   * Check if a slug is available
   */
  async checkSlugAvailability(slug: string): Promise<{ slug: string; available: boolean }> {
    try {
      const response = await api.post('/api/tenants/check-slug/', { slug });
      return response;
    } catch (error) {
      console.error('Error checking slug availability:', error);
      throw error;
    }
  }

  /**
   * Check if a custom domain is available
   */
  async checkDomainAvailability(domain: string): Promise<{ domain: string; available: boolean }> {
    try {
      const response = await api.post('/api/tenants/check-domain/', { domain });
      return response;
    } catch (error) {
      console.error('Error checking domain availability:', error);
      throw error;
    }
  }

  /**
   * Get public tenant information by slug (no auth required)
   */
  async getPublicTenant(slug: string): Promise<{
    tenant: PublicTenant
    settings?: PublicTenantSettings;
  }> {
    try {
      const response = await api.get(`/api/tenants/public/${slug}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching public tenant ${slug}:`, error);
      throw error;
    }
  }

  /**
   * Get tenant by slug (alias for getPublicTenant for backward compatibility)
   * This method is used by TenantContext and doesn't require authentication
   */
  async getTenantBySlug(slug: string): Promise<{
    tenant: PublicTenant;
    settings?: PublicTenantSettings;
  }> {
    return this.getPublicTenant(slug);
  }

  /**
      school_motto?: string;
      student_portal_enabled: boolean;
      teacher_portal_enabled: boolean;
      parent_portal_enabled: boolean;
    };
  }> {
    return this.getPublicTenant(slug);
  }

  /**
   * Exchange setup token for JWT authentication
   */
  async exchangeSetupToken(token: string): Promise<{
    message: string;
    user: {
      id: number;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
      is_superuser: boolean;
      is_staff: boolean;
      is_active: boolean;
    };
    tenant: Tenant;
    tokens?: {
      access: string;
      refresh: string;
    };
  }> {
    try {
      const response = await api.post('/api/tenants/setup/exchange/', { token });
      return response;
    } catch (error) {
      console.error('Error exchanging setup token:', error);
      throw error;
    }
  }

  // ============================================================================
  // TENANT MANAGEMENT (CRUD)
  // ============================================================================

  /**
   * Get all tenants (Platform admin only)
   */
  async getTenants(params?: {
    status?: string;
    is_active?: boolean;
    search?: string;
    ordering?: string;
  }): Promise<Tenant[]> {
    try {
      const response = await api.get('/api/tenants/tenants/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching tenants:', error);
      throw error;
    }
  }

  /**
   * Get a single tenant by ID
   */
  async getTenant(id: string): Promise<Tenant> {
    try {
      const response = await api.get(`/api/tenants/tenants/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching tenant ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get current tenant from request context
   */
  async getCurrentTenant(): Promise<{
    tenant: Tenant;
    settings?: TenantSettings;
  }> {
    try {
      const response = await api.get('/api/tenants/current/');
      return response;
    } catch (error) {
      console.error('Error fetching current tenant:', error);
      throw error;
    }
  }

  /**
   * Activate a tenant (Platform admin only)
   */
  async activateTenant(id: string): Promise<{
    message: string;
    tenant: Tenant;
  }> {
    try {
      const response = await api.post(`/api/tenants/tenants/${id}/activate/`, {});
      return response;
    } catch (error) {
      console.error(`Error activating tenant ${id}:`, error);
      throw error;
    }
  }

  /**
   * Suspend a tenant (Platform admin only)
   */
  async suspendTenant(id: string, reason?: string): Promise<{
    message: string;
    reason?: string;
    tenant: Tenant;
  }> {
    try {
      const response = await api.post(`/api/tenants/tenants/${id}/suspend/`, { reason });
      return response;
    } catch (error) {
      console.error(`Error suspending tenant ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics for a tenant
   */
  async getTenantDashboardStats(id: string): Promise<{
    student_count: number;
    enabled_services: number;
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
    status: string;
  }> {
    try {
      const response = await api.get(`/api/tenants/tenants/${id}/dashboard_stats/`);
      return response;
    } catch (error) {
      console.error(`Error fetching dashboard stats for tenant ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // TENANT SETTINGS
  // ============================================================================

  /**
   * Get current tenant settings
   */
  async getTenantSettings(): Promise<TenantSettings> {
    try {
      const response = await api.get('/api/tenants/settings/current/');
      return response;
    } catch (error) {
      console.error('Error fetching tenant settings:', error);
      throw error;
    }
  }

  /**
   * Update current tenant settings
   */
  async updateTenantSettings(data: Partial<TenantSettings>): Promise<TenantSettings> {
    try {
      const response = await api.patch('/api/tenants/settings/current/', data);
      return response;
    } catch (error) {
      console.error('Error updating tenant settings:', error);
      throw error;
    }
  }

  // ============================================================================
  // SERVICE MANAGEMENT
  // ============================================================================

  /**
   * Get available services and their status for current tenant
   */
  async getServices(): Promise<TenantServiceType[]> {
    try {
      const response = await api.get('/api/tenants/services/');
      return response;
    } catch (error) {
      console.error('Error fetching services:', error);
      throw error;
    }
  }

  /**
   * Toggle a service on/off
   */
  async toggleService(service: string, enable: boolean): Promise<{
    success: boolean;
    service: string;
    is_enabled: boolean;
    message: string;
  }> {
    try {
      const response = await api.post('/api/tenants/services/toggle/', {
        service,
        enable,
      });
      return response;
    } catch (error) {
      console.error(`Error toggling service ${service}:`, error);
      throw error;
    }
  }

  /**
   * Get service pricing information
   */
  async getServicePricing(): Promise<ServicePricing[]> {
    try {
      const response = await api.get('/api/tenants/pricing/');
      return response;
    } catch (error) {
      console.error('Error fetching service pricing:', error);
      throw error;
    }
  }

  /**
   * Get available services (alias for getServices() - for backward compatibility)
   */
  async getAvailableServices(): Promise<TenantServiceType[]> {
    return this.getServices();
  }

  // ============================================================================
  // DOMAIN MANAGEMENT
  // ============================================================================

  /**
   * Get current domain settings
   */
  async getDomainSettings(): Promise<DomainSettings> {
    try {
      const response = await api.get('/api/tenants/domain/');
      return response;
    } catch (error) {
      console.error('Error fetching domain settings:', error);
      throw error;
    }
  }

  /**
   * Set custom domain (requires DNS verification)
   */
  async setCustomDomain(domain: string): Promise<DomainVerificationInstructions> {
    try {
      const response = await api.post('/api/tenants/domain/set/', {
        domain,
      });
      return response;
    } catch (error) {
      console.error('Error setting custom domain:', error);
      throw error;
    }
  }

  /**
   * Verify custom domain via DNS TXT record
   */
  async verifyDomain(): Promise<{
    verified: boolean;
    message?: string;
    domain?: string;
    error?: string;
  }> {
    try {
      const response = await api.post('/api/tenants/domain/verify/', {});
      return response;
    } catch (error) {
      console.error('Error verifying domain:', error);
      throw error;
    }
  }

  /**
   * Remove custom domain
   */
  async removeCustomDomain(): Promise<{
    message: string;
    subdomain_url: string;
  }> {
    try {
      const response = await api.post('/api/tenants/domain/remove/', {});
      return response;
    } catch (error) {
      console.error('Error removing custom domain:', error);
      throw error;
    }
  }

  // ============================================================================
  // INVOICE MANAGEMENT
  // ============================================================================

  /**
   * Get all invoices for current tenant
   */
  async getInvoices(params?: {
    status?: string;
    billing_period?: string;
    ordering?: string;
  }): Promise<TenantInvoice[]> {
    try {
      const response = await api.get('/api/tenants/invoices/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw error;
    }
  }

  /**
   * Get a single invoice by ID
   */
  async getInvoice(id: string): Promise<TenantInvoice> {
    try {
      const response = await api.get(`/api/tenants/invoices/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching invoice ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get current active invoice
   */
  async getCurrentInvoice(): Promise<TenantInvoice> {
    try {
      const response = await api.get('/api/tenants/invoices/current/');
      return response;
    } catch (error) {
      console.error('Error fetching current invoice:', error);
      throw error;
    }
  }

  /**
   * Recalculate invoice totals
   */
  async recalculateInvoice(id: string): Promise<{
    message: string;
    invoice: TenantInvoice;
  }> {
    try {
      const response = await api.post(`/api/tenants/invoices/${id}/recalculate/`, {});
      return response;
    } catch (error) {
      console.error(`Error recalculating invoice ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get invoice summary
   */
  async getInvoiceSummary(): Promise<InvoiceSummary> {
    try {
      const response = await api.get('/api/tenants/invoices/summary/');
      return response;
    } catch (error) {
      console.error('Error fetching invoice summary:', error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT MANAGEMENT
  // ============================================================================

  /**
   * Get all payments for current tenant
   */
  async getPayments(params?: {
    status?: string;
    payment_method?: string;
    ordering?: string;
  }): Promise<TenantPayment[]> {
    try {
      const response = await api.get('/api/tenants/payments/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payments:', error);
      throw error;
    }
  }

  /**
   * Record a manual payment (bank transfer)
   */
  async recordManualPayment(data: {
    invoice_id: string;
    amount: number;
    bank_name?: string;
    account_name?: string;
    payment_proof?: string;
    notes?: string;
  }): Promise<{
    message: string;
    payment: TenantPayment;
  }> {
    try {
      const response = await api.post('/api/tenants/payments/record_manual/', data);
      return response;
    } catch (error) {
      console.error('Error recording manual payment:', error);
      throw error;
    }
  }

  /**
   * Initialize Paystack payment
   */
  async initializePaystackPayment(
    invoiceId: string,
    callbackUrl?: string
  ): Promise<PaystackInitializeResponse> {
    try {
      const response = await api.post('/api/tenants/payments/initialize_paystack/', {
        invoice_id: invoiceId,
        callback_url: callbackUrl,
      });
      return response;
    } catch (error) {
      console.error('Error initializing Paystack payment:', error);
      throw error;
    }
  }

  /**
   * Verify Paystack payment
   */
  async verifyPaystackPayment(reference: string): Promise<{
    message: string;
    payment: TenantPayment;
  }> {
    try {
      const response = await api.post('/api/tenants/payments/verify_paystack/', {
        reference,
      });
      return response;
    } catch (error) {
      console.error('Error verifying Paystack payment:', error);
      throw error;
    }
  }

  /**
   * Confirm a manual payment (Admin only)
   */
  async confirmPayment(id: string, notes?: string): Promise<{
    message: string;
    payment: TenantPayment;
  }> {
    try {
      const response = await api.post(`/api/tenants/payments/${id}/confirm/`, {
        notes,
      });
      return response;
    } catch (error) {
      console.error(`Error confirming payment ${id}:`, error);
      throw error;
    }
  }

  /**
   * Reject a manual payment (Admin only)
   */
  async rejectPayment(id: string, reason?: string): Promise<{
    message: string;
    payment: TenantPayment;
  }> {
    try {
      const response = await api.post(`/api/tenants/payments/${id}/reject/`, {
        reason,
      });
      return response;
    } catch (error) {
      console.error(`Error rejecting payment ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // INVITATION MANAGEMENT
  // ============================================================================

  /**
   * Get all invitations for current tenant
   */
  async getInvitations(params?: {
    status?: string;
    role?: string;
    ordering?: string;
  }): Promise<TenantInvitation[]> {
    try {
      const response = await api.get('/api/tenants/invitations/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching invitations:', error);
      throw error;
    }
  }

  /**
   * Create a new invitation
   */
  async createInvitation(data: {
    email: string;
    role: 'admin' | 'teacher' | 'staff';
  }): Promise<TenantInvitation> {
    try {
      const response = await api.post('/api/tenants/invitations/', data);
      return response;
    } catch (error) {
      console.error('Error creating invitation:', error);
      throw error;
    }
  }

  /**
   * Accept an invitation (no auth required)
   */
  async acceptInvitation(token: string): Promise<{
    invitation: TenantInvitation;
    message: string;
  }> {
    try {
      const response = await api.post('/api/tenants/invitations/accept/', {
        token,
      });
      return response;
    } catch (error) {
      console.error('Error accepting invitation:', error);
      throw error;
    }
  }

  /**
   * Resend an invitation
   */
  async resendInvitation(id: string): Promise<{
    message: string;
    invitation: TenantInvitation;
    email_status?: string;
  }> {
    try {
      const response = await api.post(`/api/tenants/invitations/${id}/resend/`, {});
      return response;
    } catch (error) {
      console.error(`Error resending invitation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Revoke an invitation
   */
  async revokeInvitation(id: string): Promise<{
    message: string;
    invitation: TenantInvitation;
  }> {
    try {
      const response = await api.post(`/api/tenants/invitations/${id}/revoke/`, {});
      return response;
    } catch (error) {
      console.error(`Error revoking invitation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete an invitation
   */
  async deleteInvitation(id: string): Promise<void> {
    try {
      await api.delete(`/api/tenants/invitations/${id}/`);
    } catch (error) {
      console.error(`Error deleting invitation ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if tenant is active
   */
  async isTenantActive(): Promise<boolean> {
    try {
      const { tenant } = await this.getCurrentTenant();
      return tenant.is_active && tenant.status === 'active';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get enabled services for current tenant
   */
  async getEnabledServices(): Promise<TenantServiceType[]> {
    try {
      const services = await this.getServices();
      return services.filter((s) => s.is_enabled);
    } catch (error) {
      console.error('Error fetching enabled services:', error);
      return [];
    }
  }

  /**
   * Check if a specific service is enabled
   */
  async isServiceEnabled(serviceCode: string): Promise<boolean> {
    try {
      const services = await this.getServices();
      const service = services.find((s) => s.service === serviceCode);
      return service?.is_enabled || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get pending invitations
   */
  async getPendingInvitations(): Promise<TenantInvitation[]> {
    return this.getInvitations({ status: 'pending' });
  }

  /**
   * Get overdue invoices
   */
  async getOverdueInvoices(): Promise<TenantInvoice[]> {
    return this.getInvoices({ status: 'overdue' });
  }

  /**
   * Get pending payments
   */
  async getPendingPayments(): Promise<TenantPayment[]> {
    return this.getPayments({ status: 'pending' });
  }
}

export const tenantService = new TenantService();
export default tenantService;
