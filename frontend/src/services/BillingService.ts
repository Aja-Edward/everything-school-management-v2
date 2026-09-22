/**
 * ============================================================================
 * BillingService.ts
 * Service for managing billing, invoices, and feature access
 * ============================================================================
 */

import api, { API_BASE_URL, getTenantSlug } from './api';
import type {
  Invoice,
  InvoiceQuote,
  BillingPeriod,
  FeatureAccess,
  FeatureActivationRequest,
  BillingSummary,
  PlatformBillingSummary,
  PendingPayment,
  PaymentConfirmationRequest,
  FeaturePricing,
  BankTransferNotification,
} from '@/types/types';

// ============================================================================
// INVOICE MANAGEMENT
// ============================================================================

// ============================================================================
// NOT WIRED — no backend counterpart
//
// The calls below still target a /billing/ namespace that does not exist:
// there is no billing app and no billing/ prefix in config/urls.py, and they
// return 404 in production. They are left pointing at the intended shape
// rather than silently repointed, because none has a drop-in equivalent.
// No page calls them.
//
// Closest existing endpoints, for whoever finishes these:
//   confirm-bank-transfer  -> POST /api/tenants/payments/{id}/confirm/  (platform admin)
//   invoices/{id}/pdf      -> no equivalent
//   invoices/{id}/send     -> no equivalent
//   feature-access         -> no equivalent
//   activate-features      -> closest is ServiceManagementViewSet.toggle
// ============================================================================

/**
 * What an invoice for the school's current term or session would come to.
 * A platform admin passes the school's tenant id; a school leaves it out.
 */
export const getInvoiceQuote = async (
  billingPeriod: BillingPeriod,
  tenantId?: string
): Promise<InvoiceQuote> => {
  return await api.get('/api/tenants/invoices/quote/', {
    billing_period: billingPeriod,
    tenant: tenantId,
  });
};

/**
 * Raise the invoice for the school's current term or session. If an unpaid
 * one already exists for that period it is brought up to date instead.
 * A platform admin passes the school's tenant id; a school leaves it out.
 */
export const generateInvoice = async (
  billingPeriod: BillingPeriod,
  tenantId?: string
): Promise<Invoice> => {
  return await api.post('/api/tenants/invoices/generate/', {
    billing_period: billingPeriod,
    ...(tenantId ? { tenant: tenantId } : {}),
  });
};

/**
 * Get list of invoices with optional filtering. A school sees its own; a
 * platform admin sees every school's and can narrow by `tenant` or `search`.
 */
export const getInvoices = async (filters?: {
  status?: string;
  billing_period?: BillingPeriod;
  tenant?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<{ results: Invoice[]; count: number; next: string | null; previous: string | null }> => {
  return await api.getList('/api/tenants/invoices/', filters);
};

/**
 * Get a single invoice by ID
 */
export const getInvoice = async (invoiceId: string): Promise<Invoice> => {
  return await api.getById('/api/tenants/invoices', invoiceId);
};

/**
 * Download invoice PDF
 */
/**
 * Download invoice PDF
 * Uses raw fetch because we need a Blob response, not JSON.
 * api.ts handles JSON only, so we replicate its headers manually here.
 */
export const downloadInvoicePDF = async (invoiceId: string): Promise<Blob> => {
  const tenantSlug = getTenantSlug() || '';

  const response = await fetch(
    `${API_BASE_URL}/billing/invoices/${invoiceId}/pdf/`,
    {
      credentials: 'include',
      headers: {
        // ✅ No Authorization header — cookie handles auth
        ...(tenantSlug && { 'X-Tenant-Slug': tenantSlug }),
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  return response.blob();
};

/**
 * Send invoice via email
 */
export const sendInvoice = async (
  invoiceId: string,
  emailData?: { recipient_email?: string; message?: string }
): Promise<{ success: boolean; message: string }> => {
  return await api.post(`/billing/invoices/${invoiceId}/send/`, emailData || {});
};

/**
 * Cancel an invoice nothing has been paid towards (Platform admin only)
 */
export const cancelInvoice = async (
  invoiceId: string,
  reason?: string
): Promise<Invoice> => {
  return await api.post(`/api/tenants/invoices/${invoiceId}/cancel/`, { reason });
};

/**
 * Take an amount off an invoice, with the reason shown on it (Platform admin only)
 */
export const applyInvoiceDiscount = async (
  invoiceId: string,
  amount: string,
  reason: string
): Promise<Invoice> => {
  return await api.post(`/api/tenants/invoices/${invoiceId}/discount/`, { amount, reason });
};

/**
 * Record money received outside the app - cash, cheque, an unreported
 * transfer - as a confirmed payment (Platform admin only)
 */
export const recordInvoicePayment = async (
  invoiceId: string,
  amount: string,
  notes: string
): Promise<Invoice> => {
  return await api.post(`/api/tenants/invoices/${invoiceId}/record-payment/`, { amount, notes });
};

/**
 * Billed, collected and outstanding across every school (Platform admin only)
 */
export const getPlatformBillingSummary = async (): Promise<PlatformBillingSummary> => {
  return await api.get('/api/tenants/invoices/platform-summary/');
};

// ============================================================================
// PAYMENT PROCESSING
// ============================================================================

/**
 * Initialize Paystack payment
 */
export const initializePayment = async (invoiceId: string): Promise<{
  authorization_url: string;
  access_code: string;
  reference: string;
}> => {
  return await api.post('/api/tenants/payments/initialize_paystack/', { invoice_id: invoiceId });
};

/**
 * Verify Paystack payment
 */
export const verifyPayment = async (reference: string): Promise<{
  success: boolean;
  message: string;
  invoice?: Invoice;
  payment_data?: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paid_at: string;
  };
}> => {
  return await api.post('/api/tenants/payments/verify_paystack/', { reference });
};

/**
 * Report a bank transfer. It is recorded against the invoice as pending until
 * a platform admin confirms it from Pending Payments.
 */
export const notifyBankTransfer = async (
  data: BankTransferNotification
): Promise<{ message: string }> => {
  return await api.post('/api/tenants/payments/record_manual/', data);
};

/**
 * Confirm bank transfer (Platform admin only)
 */
export const confirmBankTransfer = async (
  data: PaymentConfirmationRequest
): Promise<{ success: boolean; message: string; invoice?: Invoice }> => {
  return await api.post('/billing/confirm-bank-transfer/', data);
};

// ============================================================================
// FEATURE ACCESS CONTROL
// ============================================================================

/**
 * Check if tenant has access to a feature
 */
export const checkFeatureAccess = async (
  featureId: string,
  academicSessionId: string,
  termId: string
): Promise<FeatureAccess> => {
  return await api.get('/billing/feature-access/', {
    feature_id: featureId,
    academic_session_id: academicSessionId,
    term_id: termId,
  });
};

/**
 * Activate features for a tenant
 */
export const activateFeatures = async (
  data: FeatureActivationRequest
): Promise<{ success: boolean; message: string; activated_features: string[] }> => {
  return await api.post('/billing/activate-features/', data);
};

/**
 * Get current pricing for features
 */
export const getPricing = async (): Promise<FeaturePricing[]> => {
  return await api.get('/api/tenants/pricing/');
};

/**
 * Get billing summary for dashboard
 */
export const getBillingSummary = async (
  academicSessionId?: string,
  termId?: string
): Promise<BillingSummary> => {
  return await api.get('/api/tenants/invoices/summary/', {
    academic_session_id: academicSessionId,
    term_id: termId,
  });
};

// ============================================================================
// PLATFORM ADMIN
// ============================================================================

/**
 * Get bank transfers from every school awaiting verification (Platform admin only)
 */
export const getPendingPayments = async (filters?: {
  page?: number;
  page_size?: number;
}): Promise<{ results: PendingPayment[]; count: number; next: string | null; previous: string | null }> => {
  return await api.getList('/api/tenants/payments/pending-verification/', filters);
};

/**
 * Confirm a verified bank transfer (Platform admin only). The invoice records
 * the payment, and a school still pending activation is activated once it is
 * paid in full.
 */
export const activatePayment = async (
  paymentId: string,
  adminNotes?: string
): Promise<{ message: string }> => {
  return await api.post(`/api/tenants/payments/${paymentId}/confirm/`, {
    notes: adminNotes,
  });
};

/**
 * Reject payment after verification (Platform admin only)
 */
export const rejectPayment = async (
  paymentId: string,
  reason: string
): Promise<{ success: boolean; message: string }> => {
  return await api.post(`/api/tenants/payments/${paymentId}/reject/`, {
    reason,
  });
};

/**
 * Get enrolled student count for a specific academic session and term
 */
export const getEnrolledStudentCount = async (
  academicSessionId?: string,
  termId?: string
): Promise<number> => {
  try {
    const filters: any = {
      status: 'active',
      page_size: 1, // We only need the count, not the actual data
    };

    if (academicSessionId) {
      filters.academic_session_id = academicSessionId;
    }
    if (termId) {
      filters.term_id = termId;
    }

    const response = await api.getList('/api/students/students/', filters);
    return response.count || 0;
  } catch (error) {
    console.error('Failed to get student count:', error);
    return 0;
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate invoice total from items
 */
export const calculateInvoiceTotal = (
  studentCount: number,
  pricePerStudent: number,
  tax: number = 0
): { subtotal: number; tax: number; total: number } => {
  const subtotal = studentCount * pricePerStudent;
  const taxAmount = (subtotal * tax) / 100;
  const total = subtotal + taxAmount;

  return {
    subtotal,
    tax: taxAmount,
    total,
  };
};

/**
 * Format currency for Nigerian Naira. Accepts the decimal strings the API
 * sends for money as well as numbers.
 */
export const formatCurrency = (amount: number | string): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(Number(amount));
};

/**
 * Get invoice status badge color
 */
export const getInvoiceStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    draft: 'gray',
    pending: 'blue',
    paid: 'green',
    partially_paid: 'yellow',
    overdue: 'red',
    cancelled: 'gray',
  };
  return statusColors[status] || 'gray';
};

/**
 * Check if invoice is overdue
 */
export const isInvoiceOverdue = (invoice: Invoice): boolean => {
  if (invoice.status === 'paid' || invoice.status === 'cancelled' || !invoice.due_date) {
    return false;
  }
  const dueDate = new Date(invoice.due_date);
  const today = new Date();
  return dueDate < today;
};

/**
 * The term or session an invoice is for, e.g. "Third Term, 2025/2026".
 */
export const invoicePeriodLabel = (
  invoice: Pick<Invoice, 'term_name' | 'academic_session_name'>
): string => {
  return invoice.term_name
    ? `${invoice.term_name}, ${invoice.academic_session_name}`
    : `${invoice.academic_session_name} session`;
};

/**
 * Get payment method display name
 */
export const getPaymentMethodName = (method: string): string => {
  const methodNames: Record<string, string> = {
    paystack: 'Paystack (Card Payment)',
    manual: 'Bank Transfer',
    bank_transfer: 'Bank Transfer',
  };
  return methodNames[method] || method;
};

export default {
  // Invoice Management
  getInvoiceQuote,
  generateInvoice,
  getInvoices,
  getInvoice,
  downloadInvoicePDF,
  sendInvoice,
  cancelInvoice,

  // Payment Processing
  initializePayment,
  verifyPayment,
  notifyBankTransfer,
  confirmBankTransfer,

  // Feature Access
  checkFeatureAccess,
  activateFeatures,
  getPricing,
  getBillingSummary,

  // Platform Admin
  getPlatformBillingSummary,
  applyInvoiceDiscount,
  recordInvoicePayment,
  getPendingPayments,
  activatePayment,
  rejectPayment,

  // Student Management
  getEnrolledStudentCount,

  // Utilities
  calculateInvoiceTotal,
  formatCurrency,
  getInvoiceStatusColor,
  isInvoiceOverdue,
  invoicePeriodLabel,
  getPaymentMethodName,
};
