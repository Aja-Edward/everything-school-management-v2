/**
 * ============================================================================
 * PaymentService.ts
 * Paystack integration for platform billing (Nuventa invoicing schools).
 *
 * Uses Paystack's redirect flow rather than the inline popup. The backend
 * creates the transaction with the platform's secret key and hands back a
 * hosted `authorization_url`, so no publishable key ever has to reach the
 * browser — one less build-time value to leave unset. Paystack then returns
 * the payer to `callback_url`, where PaymentCallback verifies the reference.
 *
 * Distinct from the fee module, where each school configures its own gateway
 * credentials to collect from students. This one is the platform's own account.
 * ============================================================================
 */

import api from './api';
import type { Invoice, PaystackInit, PaymentVerification } from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

export interface StartCheckoutOptions {
  invoice: Invoice;
  /**
   * Where Paystack should return the payer. Defaults to the in-app callback
   * route, carrying the invoice id so the page can link back to it.
   */
  callbackUrl?: string;
}

// ============================================================================
// PAYMENT INITIALIZATION
// ============================================================================

/**
 * Ask the backend to create a Paystack transaction for an invoice.
 *
 * Returns the hosted checkout URL along with the reference we later verify.
 */
export const initializePayment = async (
  invoiceId: string,
  callbackUrl?: string,
): Promise<PaystackInit> => {
  return await api.post('/api/tenants/payments/initialize-paystack/', {
    invoice_id: invoiceId,
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  });
};

/**
 * Confirm a transaction after Paystack redirects back.
 *
 * The backend re-checks the reference against Paystack, marks the payment
 * confirmed and records it against the invoice, so this is what actually
 * settles the balance — not the redirect itself.
 */
export const verifyPayment = async (reference: string): Promise<PaymentVerification> => {
  return await api.post('/api/tenants/payments/verify-paystack/', { reference });
};

/** Default return path for the hosted checkout. */
export const paymentCallbackUrl = (invoiceId: string): string =>
  `${window.location.origin}/admin/billing/payment-callback?invoice=${encodeURIComponent(invoiceId)}`;

// ============================================================================
// CHECKOUT
// ============================================================================

/**
 * Start a hosted Paystack checkout for an invoice.
 *
 * Navigates away from the app on success, so nothing after the assignment
 * runs. Throws if the backend could not create the transaction — most often
 * because PAYSTACK_SECRET_KEY is unset on the server.
 */
export const startPaystackCheckout = async (
  options: StartCheckoutOptions,
): Promise<never | void> => {
  const { invoice, callbackUrl } = options;
  const invoiceId = String(invoice.id);

  const init = await initializePayment(
    invoiceId,
    callbackUrl ?? paymentCallbackUrl(invoiceId),
  );

  if (!init?.authorization_url) {
    throw new Error('Payment gateway did not return a checkout URL');
  }

  window.location.href = init.authorization_url;
};

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format amount for display (convert kobo to naira)
 */
export const formatAmount = (amountInKobo: number): string => {
  const amountInNaira = amountInKobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amountInNaira);
};

/**
 * Convert naira to kobo
 */
export const nairaToKobo = (naira: number): number => {
  return Math.round(naira * 100);
};

/**
 * Convert kobo to naira
 */
export const koboToNaira = (kobo: number): number => {
  return kobo / 100;
};

/**
 * Validate Paystack reference format
 */
export const isValidPaystackReference = (reference: string): boolean => {
  // Paystack references are typically alphanumeric
  return /^[a-zA-Z0-9_-]+$/.test(reference);
};

/**
 * Get payment status color
 */
export const getPaymentStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    success: 'green',
    failed: 'red',
    abandoned: 'gray',
    pending: 'yellow',
  };
  return statusColors[status.toLowerCase()] || 'gray';
};

/**
 * Get payment status badge variant
 */
export const getPaymentStatusVariant = (
  status: string
): 'default' | 'success' | 'destructive' | 'secondary' | 'outline' => {
  const statusVariants: Record<string, 'default' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
    success: 'success',
    failed: 'destructive',
    abandoned: 'secondary',
    pending: 'outline',
  };
  return statusVariants[status.toLowerCase()] || 'default';
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializePayment,
  verifyPayment,
  startPaystackCheckout,
  paymentCallbackUrl,
  formatAmount,
  nairaToKobo,
  koboToNaira,
  isValidPaystackReference,
  getPaymentStatusColor,
  getPaymentStatusVariant,
};
