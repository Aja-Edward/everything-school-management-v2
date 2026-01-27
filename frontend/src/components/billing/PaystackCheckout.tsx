/**
 * ============================================================================
 * PaystackCheckout.tsx
 * Component for Paystack payment checkout
 * ============================================================================
 */

import React, { useState } from 'react';
import { CreditCard, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { openPaystackPopup } from '@/services/PaymentService';
import { formatCurrency } from '@/services/BillingService';
import type { Invoice } from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

interface PaystackCheckoutProps {
  invoice: Invoice;
  tenantEmail: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * PaystackCheckout component for processing card payments
 */
export const PaystackCheckout: React.FC<PaystackCheckoutProps> = ({
  invoice,
  tenantEmail,
  onSuccess,
  onError,
  className = '',
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handlePayment = async () => {
    setIsProcessing(true);
    setPaymentStatus('processing');
    setErrorMessage('');

    try {
      await openPaystackPopup({
        invoice,
        tenantEmail,
        onSuccess: () => {
          setPaymentStatus('success');
          setIsProcessing(false);
          onSuccess?.();
        },
        onCancel: () => {
          setPaymentStatus('idle');
          setIsProcessing(false);
        },
        onError: (error) => {
          setPaymentStatus('error');
          setErrorMessage(error.message || 'Payment failed');
          setIsProcessing(false);
          onError?.(error);
        },
      });
    } catch (error) {
      const err = error as Error;
      setPaymentStatus('error');
      setErrorMessage(err.message || 'Failed to initialize payment');
      setIsProcessing(false);
      onError?.(err);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Pay with Card
        </CardTitle>
        <CardDescription>
          Secure payment powered by Paystack
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Amount Display */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Amount to Pay</span>
            <span className="text-2xl font-bold text-gray-900">
              {formatCurrency(invoice.total)}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Invoice: {invoice.invoice_number}
          </div>
        </div>

        {/* Payment Status Messages */}
        {paymentStatus === 'success' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-900">Payment Successful!</p>
              <p className="text-sm text-green-700 mt-1">
                Your payment has been processed and features will be activated shortly.
              </p>
            </div>
          </div>
        )}

        {paymentStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Payment Failed</p>
              <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Payment Button */}
        <Button
          onClick={handlePayment}
          disabled={isProcessing || paymentStatus === 'success'}
          className="w-full"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : paymentStatus === 'success' ? (
            <>
              <CheckCircle className="mr-2 h-5 w-5" />
              Payment Complete
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-5 w-5" />
              Pay {formatCurrency(invoice.total)}
            </>
          )}
        </Button>

        {/* Security Notice */}
        <div className="text-xs text-gray-500 text-center space-y-1">
          <p>🔒 Secure payment processed by Paystack</p>
          <p>Your card details are never stored on our servers</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaystackCheckout;
