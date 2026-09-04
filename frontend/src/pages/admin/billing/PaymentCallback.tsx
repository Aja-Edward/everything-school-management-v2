/**
 * ============================================================================
 * PaymentCallback.tsx
 * Landing page for Paystack's redirect back from hosted checkout.
 *
 * The redirect itself proves nothing — a payer can reach this URL by going
 * back, refreshing, or editing the address bar. The invoice is only settled
 * once the backend re-checks the reference against Paystack, so this page
 * treats verification as the source of truth and shows nothing optimistic
 * before it returns.
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyPayment } from '@/services/PaymentService';

type Status = 'verifying' | 'success' | 'failed' | 'missing-reference';

const PaymentCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState<string>('');

  // Paystack sends both; trxref is the legacy name and they carry the
  // same value, so either is fine as long as we accept both.
  const reference = searchParams.get('reference') ?? searchParams.get('trxref');
  const invoiceId = searchParams.get('invoice');

  // StrictMode double-invokes effects, and verification is a POST that
  // transitions payment state — run it once per reference.
  const verifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setStatus('missing-reference');
      return;
    }
    if (verifiedRef.current === reference) return;
    verifiedRef.current = reference;

    (async () => {
      try {
        const result = await verifyPayment(reference);
        // The endpoint returns 4xx/5xx when a payment did not succeed, so
        // reaching here means it did. `message` covers both a fresh
        // confirmation and an already-verified reference.
        setStatus('success');
        setMessage(result?.message || 'Payment confirmed.');
      } catch (error: any) {
        setStatus('failed');
        setMessage(
          error?.response?.data?.error ||
            error?.message ||
            'We could not confirm this payment.',
        );
      }
    })();
  }, [reference]);

  const backToInvoice = () =>
    navigate(invoiceId ? `/admin/billing/invoices/${invoiceId}` : '/admin/billing');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-10 h-10 mx-auto mb-4 text-blue-600 animate-spin" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Confirming your payment
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Checking the transaction with Paystack. This only takes a moment —
              please don't close this page.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto mb-4 text-green-600" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Payment confirmed
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
            <Button onClick={backToInvoice} className="w-full">
              {invoiceId ? 'Back to invoice' : 'Back to billing'}
            </Button>
          </>
        )}

        {status === 'failed' && (
          <>
            <XCircle className="w-10 h-10 mx-auto mb-4 text-red-600" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Payment not confirmed
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{message}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
              If you were charged, don't pay again — the reference below is
              enough for us to trace it.
              {reference && (
                <>
                  {' '}
                  <span className="font-mono text-gray-600 dark:text-gray-300">
                    {reference}
                  </span>
                </>
              )}
            </p>
            <Button onClick={backToInvoice} variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {invoiceId ? 'Back to invoice' : 'Back to billing'}
            </Button>
          </>
        )}

        {status === 'missing-reference' && (
          <>
            <XCircle className="w-10 h-10 mx-auto mb-4 text-gray-400" />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Nothing to confirm
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This page is where Paystack returns you after a payment, but no
              transaction reference came with the request.
            </p>
            <Button onClick={backToInvoice} variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to billing
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentCallback;
