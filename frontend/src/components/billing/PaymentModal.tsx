/**
 * ============================================================================
 * PaymentModal.tsx
 * Modal for selecting and processing payment methods
 * ============================================================================
 */

import React, { useState } from 'react';
import { X, CreditCard, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PaystackCheckout } from './PaystackCheckout';
import { BankTransferInfo } from './BankTransferInfo';
import type { Invoice, PaymentMethod } from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  tenantEmail: string;
  onPaymentSuccess?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * PaymentModal component for payment method selection and processing
 */
export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  tenantEmail,
  onPaymentSuccess,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  if (!isOpen) return null;

  const handlePaymentSuccess = () => {
    onPaymentSuccess?.();
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Payment Options</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Payment Method Selection */}
          {!selectedMethod ? (
            <>
              <div className="text-center mb-6">
                <p className="text-gray-600">
                  Choose your preferred payment method
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Paystack Option */}
                <Card
                  className="p-6 cursor-pointer hover:shadow-lg transition-all hover:border-blue-500 group"
                  onClick={() => setSelectedMethod('paystack')}
                >
                  <div className="text-center space-y-4">
                    <div className="bg-blue-100 group-hover:bg-blue-200 transition-colors p-4 rounded-full inline-flex">
                      <CreditCard className="h-8 w-8 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">
                        Card Payment
                      </h3>
                      <p className="text-sm text-gray-600 mt-2">
                        Pay instantly with debit/credit card via Paystack
                      </p>
                    </div>
                    <div className="pt-4 border-t">
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>✓ Instant activation</p>
                        <p>✓ Secure payment</p>
                        <p>✓ Multiple cards accepted</p>
                      </div>
                    </div>
                    <Button className="w-full" variant="default">
                      Pay with Card
                    </Button>
                  </div>
                </Card>

                {/* Bank Transfer Option */}
                <Card
                  className="p-6 cursor-pointer hover:shadow-lg transition-all hover:border-purple-500 group"
                  onClick={() => setSelectedMethod('bank_transfer')}
                >
                  <div className="text-center space-y-4">
                    <div className="bg-purple-100 group-hover:bg-purple-200 transition-colors p-4 rounded-full inline-flex">
                      <Building2 className="h-8 w-8 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">
                        Bank Transfer
                      </h3>
                      <p className="text-sm text-gray-600 mt-2">
                        Transfer directly to our bank account
                      </p>
                    </div>
                    <div className="pt-4 border-t">
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>✓ No transaction fees</p>
                        <p>✓ Activation within 24hrs</p>
                        <p>✓ Payment proof required</p>
                      </div>
                    </div>
                    <Button className="w-full" variant="outline">
                      Pay via Transfer
                    </Button>
                  </div>
                </Card>
              </div>
            </>
          ) : (
            <>
              {/* Back Button */}
              <div className="mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMethod(null)}
                >
                  ← Choose Different Method
                </Button>
              </div>

              {/* Payment Method Components */}
              {selectedMethod === 'paystack' && (
                <PaystackCheckout
                  invoice={invoice}
                  tenantEmail={tenantEmail}
                  onSuccess={handlePaymentSuccess}
                  onError={(error) => {
                    console.error('Payment error:', error);
                  }}
                />
              )}

              {selectedMethod === 'bank_transfer' && (
                <BankTransferInfo
                  invoice={invoice}
                  onNotificationSent={handlePaymentSuccess}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
