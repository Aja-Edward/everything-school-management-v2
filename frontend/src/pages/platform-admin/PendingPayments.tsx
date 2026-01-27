/**
 * ============================================================================
 * PendingPayments.tsx
 * Platform admin page for verifying and activating bank transfer payments
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Eye, Loader2, AlertCircle, Building2, Calendar, FileText, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPendingPayments, activatePayment, rejectPayment, formatCurrency } from '@/services/BillingService';
import type { PendingPayment } from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

interface PaymentDetailModalProps {
  payment: PendingPayment | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (paymentId: string, notes: string) => void;
  onReject: (paymentId: string, notes: string) => void;
  isProcessing: boolean;
}

// ============================================================================
// PAYMENT DETAIL MODAL
// ============================================================================

const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  payment,
  isOpen,
  onClose,
  onApprove,
  onReject,
  isProcessing,
}) => {
  const [adminNotes, setAdminNotes] = useState('');

  if (!isOpen || !payment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <Card className="max-w-3xl w-full my-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payment Verification</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>Review and verify bank transfer payment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tenant Information */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              School Information
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">School Name</div>
                  <div className="font-medium">{payment.tenant_name}</div>
                </div>
                <div>
                  <div className="text-gray-500">Tenant ID</div>
                  <div className="font-mono text-xs">{payment.tenant_id}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Payment Details
            </h3>
            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Amount</span>
                <span className="text-2xl font-bold text-blue-900">
                  {formatCurrency(payment.amount)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-blue-200">
                <div>
                  <div className="text-gray-600">Payment Reference</div>
                  <div className="font-mono font-medium">{payment.payment_reference}</div>
                </div>
                <div>
                  <div className="text-gray-600">Transfer Date</div>
                  <div className="font-medium">
                    {new Date(payment.transfer_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Information */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Invoice Details
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-500">Invoice Number</div>
                  <div className="font-medium">{payment.invoice_number}</div>
                </div>
                <div>
                  <div className="text-gray-500">Student Count</div>
                  <div className="font-medium">
                    <Users className="inline h-3 w-3 mr-1" />
                    {payment.student_count} students
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Due Date</div>
                  <div className="font-medium">
                    <Calendar className="inline h-3 w-3 mr-1" />
                    {new Date(payment.due_date).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Submitted</div>
                  <div className="font-medium">
                    {new Date(payment.submitted_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Features to Activate */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Features to Activate</h3>
            <div className="flex flex-wrap gap-2">
              {payment.features.map((feature, index) => (
                <Badge key={index} variant="outline" className="text-sm">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>

          {/* Admin Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Admin Notes
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Add verification notes or comments..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => onReject(payment.id, adminNotes)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => onApprove(payment.id, adminNotes)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve & Activate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * PendingPayments page for platform admin payment verification
 */
export const PendingPayments: React.FC = () => {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Load pending payments
  const loadPayments = async (pageNum: number = 1) => {
    setLoading(true);
    setError('');

    try {
      const result = await getPendingPayments({
        page: pageNum,
        limit: 20,
      });

      if (pageNum === 1) {
        setPayments(result.results);
      } else {
        setPayments(prev => [...prev, ...result.results]);
      }

      setHasMore(result.count > pageNum * 20);
      setPage(pageNum);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load pending payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleViewPayment = (payment: PendingPayment) => {
    setSelectedPayment(payment);
    setIsModalOpen(true);
  };

  const handleApprove = async (paymentId: string, notes: string) => {
    setIsProcessing(true);
    setActionMessage(null);

    try {
      await activatePayment(paymentId, notes);
      setActionMessage({
        type: 'success',
        text: 'Payment approved and features activated successfully!',
      });
      setIsModalOpen(false);
      setSelectedPayment(null);

      // Remove approved payment from list
      setPayments(prev => prev.filter(p => p.id !== paymentId));

      // Auto-clear success message
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      const error = err as Error;
      setActionMessage({
        type: 'error',
        text: error.message || 'Failed to approve payment',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (paymentId: string, notes: string) => {
    if (!notes.trim()) {
      setActionMessage({
        type: 'error',
        text: 'Please provide a reason for rejection in the admin notes',
      });
      return;
    }

    setIsProcessing(true);
    setActionMessage(null);

    try {
      await rejectPayment(paymentId, notes);

      setActionMessage({
        type: 'success',
        text: 'Payment rejected successfully',
      });
      setIsModalOpen(false);
      setSelectedPayment(null);

      // Remove rejected payment from list
      setPayments(prev => prev.filter(p => p.id !== paymentId));

      // Auto-clear success message
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      const error = err as Error;
      setActionMessage({
        type: 'error',
        text: error.message || 'Failed to reject payment',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadMore = () => {
    loadPayments(page + 1);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Pending Payments</h1>
        <p className="text-gray-600 mt-1">
          Review and verify bank transfer payments from schools
        </p>
      </div>

      {/* Action Message */}
      {actionMessage && (
        <Card className={`border-2 ${
          actionMessage.type === 'success'
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        }`}>
          <CardContent className="pt-4 pb-4">
            <div className={`flex items-center gap-2 ${
              actionMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
            }`}>
              {actionMessage.type === 'success' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span className="font-semibold">{actionMessage.text}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments List */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Queue</CardTitle>
          <CardDescription>
            {loading && page === 1
              ? 'Loading...'
              : `${payments.length} payment${payments.length !== 1 ? 's' : ''} awaiting verification`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && page === 1 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 bg-gray-50 rounded-lg animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => loadPayments()}>
                Retry
              </Button>
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
              <p className="text-gray-600">No pending payments to verify at the moment.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      {/* Left Section */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-lg text-gray-900">
                              {payment.tenant_name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Invoice: {payment.invoice_number}
                            </p>
                          </div>
                          <Badge variant="secondary" className="ml-2">
                            {payment.student_count} students
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-gray-500">Amount</div>
                            <div className="font-semibold">{formatCurrency(payment.amount)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Reference</div>
                            <div className="font-mono text-xs">{payment.payment_reference}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Transfer Date</div>
                            <div>{new Date(payment.transfer_date).toLocaleDateString()}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Submitted</div>
                            <div>{new Date(payment.submitted_at).toLocaleDateString()}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {payment.features.map((feature, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Right Section - Actions */}
                      <div className="flex md:flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewPayment(payment)}
                          className="flex-1 md:flex-none"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment Detail Modal */}
      <PaymentDetailModal
        payment={selectedPayment}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPayment(null);
        }}
        onApprove={handleApprove}
        onReject={handleReject}
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default PendingPayments;
