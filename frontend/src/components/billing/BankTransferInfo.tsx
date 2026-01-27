/**
 * ============================================================================
 * BankTransferInfo.tsx
 * Component for displaying bank transfer details
 * ============================================================================
 */

import React, { useState } from 'react';
import { Building2, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/services/BillingService';
import { notifyBankTransfer } from '@/services/BillingService';
import type { Invoice } from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

interface BankTransferInfoProps {
  invoice: Invoice;
  onNotificationSent?: () => void;
  className?: string;
}

// Bank account details (should be fetched from settings in production)
const BANK_DETAILS = {
  bankName: 'Guaranty Trust Bank (GTB)',
  accountName: 'SchoolPlatform Ltd',
  accountNumber: '0123456789',
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * BankTransferInfo component for displaying bank transfer payment details
 */
export const BankTransferInfo: React.FC<BankTransferInfoProps> = ({
  invoice,
  onNotificationSent,
  className = '',
}) => {
  const [copiedField, setCopiedField] = useState<string>('');
  const [isNotifying, setIsNotifying] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const [error, setError] = useState<string>('');

  // Generate payment reference from invoice number
  const paymentReference = `PAY-${invoice.invoice_number}`;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleNotifyTransfer = async () => {
    setIsNotifying(true);
    setError('');

    try {
      await notifyBankTransfer({
        invoice_id: invoice.id as string,
        payment_reference: paymentReference,
        amount: invoice.total,
        transfer_date: new Date().toISOString(),
      });

      setNotificationSent(true);
      onNotificationSent?.();
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to send notification');
    } finally {
      setIsNotifying(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Pay via Bank Transfer
        </CardTitle>
        <CardDescription>
          Transfer {formatCurrency(invoice.total)} to the account below
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Amount to Transfer */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-700 mb-1">Amount to Transfer</div>
          <div className="text-3xl font-bold text-blue-900">
            {formatCurrency(invoice.total)}
          </div>
        </div>

        {/* Bank Details */}
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Bank Account Details</h3>

          {/* Bank Name */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Bank Name</div>
              <div className="font-medium text-gray-900">{BANK_DETAILS.bankName}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(BANK_DETAILS.bankName, 'bank')}
            >
              {copiedField === 'bank' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Account Name */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Account Name</div>
              <div className="font-medium text-gray-900">{BANK_DETAILS.accountName}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(BANK_DETAILS.accountName, 'name')}
            >
              {copiedField === 'name' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Account Number */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Account Number</div>
              <div className="font-medium text-gray-900 text-lg">{BANK_DETAILS.accountNumber}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(BANK_DETAILS.accountNumber, 'account')}
            >
              {copiedField === 'account' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Payment Reference */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>IMPORTANT:</strong> Use this reference in your transfer narration
            </div>
          </div>
          <div className="flex items-center justify-between bg-white p-3 rounded">
            <div>
              <div className="text-xs text-gray-500 mb-1">Payment Reference</div>
              <div className="font-mono font-bold text-lg text-gray-900">
                {paymentReference}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(paymentReference, 'reference')}
            >
              {copiedField === 'reference' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Notification Status */}
        {notificationSent ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Notification Sent Successfully</span>
            </div>
            <p className="text-sm text-green-700 mt-2">
              We'll verify your payment and activate features within 24 hours.
            </p>
          </div>
        ) : (
          <>
            {/* Notify Button */}
            <Button
              onClick={handleNotifyTransfer}
              disabled={isNotifying}
              className="w-full"
              size="lg"
            >
              {isNotifying ? 'Sending...' : "I've Made the Transfer"}
            </Button>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                {error}
              </div>
            )}
          </>
        )}

        {/* Instructions */}
        <div className="text-xs text-gray-500 space-y-2 pt-2 border-t">
          <p className="font-semibold text-gray-700">Instructions:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Transfer the exact amount to the account above</li>
            <li>Use the payment reference in your transfer narration</li>
            <li>Click "I've Made the Transfer" button after transferring</li>
            <li>We'll verify and activate your features within 24 hours</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default BankTransferInfo;
