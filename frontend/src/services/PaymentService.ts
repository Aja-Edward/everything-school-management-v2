/**
 * ============================================================================
 * PaymentService.ts
 * Service for Paystack payment integration
 * ============================================================================
 */

import api from './api';
import type { Invoice, PaystackInit, PaymentVerification } from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

interface PaystackConfig {
  key: string;
  email: string;
  amount: number;  // In kobo (smallest currency unit)
  currency: string;
  ref: string;
  callback: (response: PaystackResponse) => void;
  onClose: () => void;
  metadata?: Record<string, any>;
  channels?: string[];
  label?: string;
}

interface PaystackResponse {
  reference: string;
  message: string;
  status: string;
  trans: string;
  transaction: string;
  trxref: string;
}

interface PaystackPopup {
  setup: (config: PaystackConfig) => PaystackHandler;
}

interface PaystackHandler {
  openIframe: () => void;
  newTransaction: () => void;
}

// Declare global Paystack object
declare global {
  interface Window {
    PaystackPop?: PaystackPopup;
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_SCRIPT_URL = 'https://js.paystack.co/v1/inline.js';

// ============================================================================
// PAYSTACK SCRIPT LOADING
// ============================================================================

let paystackScriptLoaded = false;
let paystackScriptLoading = false;
const paystackLoadPromises: ((value: boolean) => void)[] = [];

/**
 * Load Paystack inline script
 */
export const loadPaystackScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    // If already loaded, resolve immediately
    if (paystackScriptLoaded) {
      resolve(true);
      return;
    }

    // If currently loading, queue the promise
    if (paystackScriptLoading) {
      paystackLoadPromises.push(resolve);
      return;
    }

    // Start loading
    paystackScriptLoading = true;

    const script = document.createElement('script');
    script.src = PAYSTACK_SCRIPT_URL;
    script.async = true;

    script.onload = () => {
      paystackScriptLoaded = true;
      paystackScriptLoading = false;
      console.log('✅ Paystack script loaded successfully');

      // Resolve all queued promises
      resolve(true);
      paystackLoadPromises.forEach((r) => r(true));
      paystackLoadPromises.length = 0;
    };

    script.onerror = () => {
      paystackScriptLoading = false;
      console.error('❌ Failed to load Paystack script');

      // Reject all queued promises
      resolve(false);
      paystackLoadPromises.forEach((r) => r(false));
      paystackLoadPromises.length = 0;
    };

    document.head.appendChild(script);
  });
};

// ============================================================================
// PAYMENT INITIALIZATION
// ============================================================================

/**
 * Initialize Paystack payment for an invoice
 */
export const initializePayment = async (invoiceId: string): Promise<PaystackInit> => {
  const response = await api.post('/billing/initialize-payment/', {
    invoice_id: invoiceId,
  });
  return response;
};

/**
 * Verify payment after Paystack callback
 */
export const verifyPayment = async (reference: string): Promise<PaymentVerification> => {
  const response = await api.post('/billing/verify-payment/', {
    reference,
  });
  return response;
};

// ============================================================================
// PAYSTACK POPUP HANDLER
// ============================================================================

interface PaymentOptions {
  invoice: Invoice;
  tenantEmail: string;
  onSuccess: (response: PaystackResponse) => void;
  onCancel: () => void;
  onError?: (error: Error) => void;
}

/**
 * Open Paystack payment popup
 */
export const openPaystackPopup = async (options: PaymentOptions): Promise<void> => {
  const { invoice, tenantEmail, onSuccess, onCancel, onError } = options;

  try {
    // Ensure Paystack script is loaded
    const loaded = await loadPaystackScript();
    if (!loaded) {
      throw new Error('Failed to load Paystack payment library');
    }

    // Ensure PaystackPop is available
    if (!window.PaystackPop) {
      throw new Error('Paystack library not available');
    }

    // Initialize payment with backend
    const paymentInit = await initializePayment(invoice.id as string);

    // Calculate amount in kobo (Paystack requires amount in smallest currency unit)
    const amountInKobo = Math.round(invoice.total * 100);

    // Setup Paystack configuration
    const config: PaystackConfig = {
      key: PAYSTACK_PUBLIC_KEY,
      email: tenantEmail,
      amount: amountInKobo,
      currency: 'NGN',
      ref: paymentInit.reference,
      callback: async (response: PaystackResponse) => {
        console.log('✅ Payment successful:', response);

        try {
          // Verify payment on backend
          const verification = await verifyPayment(response.reference);

          if (verification.success) {
            onSuccess(response);
          } else {
            throw new Error(verification.message || 'Payment verification failed');
          }
        } catch (error) {
          console.error('❌ Payment verification error:', error);
          onError?.(error as Error);
        }
      },
      onClose: () => {
        console.log('ℹ️ Payment popup closed');
        onCancel();
      },
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        tenant_id: invoice.tenant_id,
        custom_fields: [
          {
            display_name: 'Invoice Number',
            variable_name: 'invoice_number',
            value: invoice.invoice_number,
          },
        ],
      },
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money'],
      label: `Payment for ${invoice.invoice_number}`,
    };

    // Open Paystack popup
    const handler = window.PaystackPop.setup(config);
    handler.openIframe();
  } catch (error) {
    console.error('❌ Error opening Paystack popup:', error);
    onError?.(error as Error);
  }
};

// ============================================================================
// PAYMENT UTILITIES
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
  loadPaystackScript,
  initializePayment,
  verifyPayment,
  openPaystackPopup,
  formatAmount,
  nairaToKobo,
  koboToNaira,
  isValidPaystackReference,
  getPaymentStatusColor,
  getPaymentStatusVariant,
};
