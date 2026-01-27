/**
 * ============================================================================
 * BillingService.ts
 * Service for managing billing, invoices, and feature access
 * ============================================================================
 */

import api, { API_BASE_URL } from './api';
import type {
  Invoice,
  CreateInvoiceRequest,
  InvoiceGenerationResponse,
  FeatureAccess,
  FeatureActivationRequest,
  BillingSummary,
  PendingPayment,
  PaymentConfirmationRequest,
  FeaturePricing,
  BankTransferNotification,
} from '@/types/types';

// ============================================================================
// INVOICE MANAGEMENT
// ============================================================================

/**
 * Generate a new invoice for a school
 */
export const generateInvoice = async (
  data: CreateInvoiceRequest
): Promise<InvoiceGenerationResponse> => {
  return await api.post('/billing/invoices/generate/', data);
};

/**
 * Get list of invoices with optional filtering
 */
export const getInvoices = async (filters?: {
  status?: string;
  academic_session_id?: string;
  term_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}): Promise<{ results: Invoice[]; count: number; next: string | null; previous: string | null }> => {
  return await api.getList('/billing/invoices/', filters);
};

/**
 * Get a single invoice by ID
 */
export const getInvoice = async (invoiceId: string): Promise<Invoice> => {
  return await api.getById('/billing/invoices', invoiceId);
};

/**
 * Download invoice PDF
 */
export const downloadInvoicePDF = async (invoiceId: string): Promise<Blob> => {
  const response = await fetch(
    `${API_BASE_URL}/billing/invoices/${invoiceId}/pdf/`,
    {
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
        'X-Tenant-Slug': localStorage.getItem('tenantSlug') || '',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to download PDF');
  }

  return await response.blob();
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
 * Cancel an invoice
 */
export const cancelInvoice = async (
  invoiceId: string,
  reason?: string
): Promise<Invoice> => {
  return await api.put(`/billing/invoices/${invoiceId}/cancel/`, { reason });
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
  return await api.post('/billing/initialize-payment/', { invoice_id: invoiceId });
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
  return await api.post('/billing/verify-payment/', { reference });
};

/**
 * Notify about bank transfer
 */
export const notifyBankTransfer = async (
  data: BankTransferNotification
): Promise<{ success: boolean; message: string }> => {
  return await api.post('/billing/bank-transfer-notify/', data);
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
  return await api.get('/billing/pricing/');
};

/**
 * Get billing summary for dashboard
 */
export const getBillingSummary = async (
  academicSessionId?: string,
  termId?: string
): Promise<BillingSummary> => {
  return await api.get('/billing/summary/', {
    academic_session_id: academicSessionId,
    term_id: termId,
  });
};

// ============================================================================
// PLATFORM ADMIN
// ============================================================================

/**
 * Get pending payment verifications (Platform admin only)
 */
export const getPendingPayments = async (filters?: {
  page?: number;
  page_size?: number;
  from_date?: string;
  to_date?: string;
}): Promise<{ results: PendingPayment[]; count: number; next: string | null; previous: string | null }> => {
  return await api.getList('/platform-admin/pending-payments/', filters);
};

/**
 * Activate payment after verification (Platform admin only)
 */
export const activatePayment = async (
  paymentId: string,
  adminNotes?: string
): Promise<{ success: boolean; message: string }> => {
  return await api.post('/platform-admin/activate-payment/', {
    payment_id: paymentId,
    admin_notes: adminNotes,
  });
};

/**
 * Reject payment after verification (Platform admin only)
 */
export const rejectPayment = async (
  paymentId: string,
  reason: string
): Promise<{ success: boolean; message: string }> => {
  return await api.post(`/tenants/payments/${paymentId}/reject/`, {
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
 * Format currency for Nigerian Naira
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amount);
};

/**
 * Get invoice status badge color
 */
export const getInvoiceStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    draft: 'gray',
    sent: 'blue',
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
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return false;
  }
  const dueDate = new Date(invoice.due_date);
  const today = new Date();
  return dueDate < today;
};

/**
 * Get payment method display name
 */
export const getPaymentMethodName = (method: string): string => {
  const methodNames: Record<string, string> = {
    paystack: 'Paystack (Card Payment)',
    bank_transfer: 'Bank Transfer',
  };
  return methodNames[method] || method;
};

export default {
  // Invoice Management
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
  getPaymentMethodName,
};
