/**
 * ============================================================================
 * InvoiceDetail.tsx
 * Detailed view of a single invoice
 * ============================================================================
 */

import React, { useState } from 'react';
import { ArrowLeft, Download, Send, CreditCard, X, Loader2, CheckCircle, AlertCircle, Calendar, Users, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useInvoice } from '@/hooks/useBilling';
import { downloadInvoicePDF, sendInvoice, cancelInvoice, formatCurrency, getInvoiceStatusColor, isInvoiceOverdue } from '@/services/BillingService';
import { PaymentModal } from '@/components/billing/PaymentModal';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// TYPES
// ============================================================================

interface CancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}

// ============================================================================
// CANCEL MODAL COMPONENT
// ============================================================================

const CancelModal: React.FC<CancelModalProps> = ({ isOpen, onClose, onConfirm, isLoading }) => {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="max-w-md w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Cancel Invoice</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to cancel this invoice? This action cannot be undone.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Cancellation (Optional)
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Enter reason for cancellation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Keep Invoice
            </Button>
            <Button
              variant="danger"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Invoice'
              )}
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
 * InvoiceDetail page for viewing a single invoice
 */
export const InvoiceDetail: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { invoiceId } = useParams<{ invoiceId: string }>();

  const { invoice, loading, error, refetch } = useInvoice(invoiceId);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState<string>('');

  const handleBack = () => {
    navigate('/admin/billing');
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;

    setDownloadingPDF(true);
    setActionError('');

    try {
      const blob = await downloadInvoicePDF(invoice.id as string);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setActionSuccess('PDF downloaded successfully');
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (error) {
      const err = error as Error;
      setActionError(err.message || 'Failed to download PDF');
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleSendEmail = async () => {
    if (!invoice) return;

    setSendingEmail(true);
    setActionError('');

    try {
      await sendInvoice(invoice.id as string);
      setActionSuccess('Invoice sent successfully');
      setTimeout(() => setActionSuccess(''), 3000);
      refetch();
    } catch (error) {
      const err = error as Error;
      setActionError(err.message || 'Failed to send invoice');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCancelInvoice = async (reason: string) => {
    if (!invoice) return;

    setCancelling(true);
    setActionError('');

    try {
      await cancelInvoice(invoice.id as string, reason);
      setActionSuccess('Invoice cancelled successfully');
      setIsCancelModalOpen(false);
      refetch();
    } catch (error) {
      const err = error as Error;
      setActionError(err.message || 'Failed to cancel invoice');
    } finally {
      setCancelling(false);
    }
  };

  const handlePaymentSuccess = () => {
    refetch();
    setIsPaymentModalOpen(false);
  };

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Billing
          </Button>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !invoice) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Billing
          </Button>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load invoice details</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overdue = isInvoiceOverdue(invoice);
  const canPay = invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const canCancel = invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const canSend = invoice.status !== 'cancelled';

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Billing
        </Button>
      </div>

      {/* Action Messages */}
      {actionSuccess && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="h-5 w-5" />
              <span>{actionSuccess}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {actionError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <span>{actionError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-gray-900">{invoice.invoice_number}</h1>
                <Badge
                  variant={invoice.status === 'paid' ? 'default' : invoice.status === 'overdue' || invoice.status === 'cancelled' ? 'destructive' : 'secondary'}
                >
                  {invoice.status.toUpperCase()}
                </Badge>
                {overdue && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                  <Badge variant="destructive">OVERDUE</Badge>
                )}
              </div>
              <p className="text-gray-600">
                Generated on {new Date(invoice.created_at!).toLocaleDateString()}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                disabled={downloadingPDF}
              >
                {downloadingPDF ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Download PDF
              </Button>

              {canSend && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={sendingEmail}
                >
                  {sendingEmail ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  Send Email
                </Button>
              )}

              {canPay && (
                <Button
                  size="sm"
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CreditCard className="h-4 w-4 mr-1" />
                  Pay Now
                </Button>
              )}

              {canCancel && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsCancelModalOpen(true)}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-1">Invoice Number</div>
                  <div className="font-semibold">{invoice.invoice_number}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Status</div>
                  <div className="font-semibold capitalize">{invoice.status}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Created Date</div>
                  <div className="font-semibold">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    {new Date(invoice.created_at!).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Due Date</div>
                  <div className={`font-semibold ${overdue ? 'text-red-600' : ''}`}>
                    <Calendar className="inline h-4 w-4 mr-1" />
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Student Count</div>
                  <div className="font-semibold">
                    <Users className="inline h-4 w-4 mr-1" />
                    {invoice.student_count} students
                  </div>
                </div>
                {invoice.payment_method && (
                  <div>
                    <div className="text-gray-500 mb-1">Payment Method</div>
                    <div className="font-semibold capitalize">{invoice.payment_method.replace('_', ' ')}</div>
                  </div>
                )}
                {invoice.paid_at && (
                  <div className="col-span-2">
                    <div className="text-gray-500 mb-1">Paid On</div>
                    <div className="font-semibold text-green-600">
                      <CheckCircle className="inline h-4 w-4 mr-1" />
                      {new Date(invoice.paid_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>

              {invoice.notes && (
                <div className="pt-4 border-t">
                  <div className="text-gray-500 mb-2 flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    Notes
                  </div>
                  <div className="text-gray-700 bg-gray-50 p-3 rounded">{invoice.notes}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 text-sm font-semibold text-gray-700 pb-2 border-b">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-right">Quantity</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-3 text-right">Amount</div>
                </div>

                {/* Items */}
                {invoice.items.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 p-4 md:p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="md:col-span-5">
                      <div className="font-medium text-gray-900">{item.description}</div>
                      {item.feature_id && (
                        <div className="text-xs text-gray-500 mt-1">Feature ID: {item.feature_id}</div>
                      )}
                    </div>
                    <div className="md:col-span-2 md:text-right">
                      <span className="text-gray-600 md:hidden font-medium">Quantity: </span>
                      <span className="text-gray-900">{item.quantity}</span>
                    </div>
                    <div className="md:col-span-2 md:text-right">
                      <span className="text-gray-600 md:hidden font-medium">Unit Price: </span>
                      <span className="text-gray-900">{formatCurrency(item.unit_price)}</span>
                    </div>
                    <div className="md:col-span-3 md:text-right">
                      <span className="text-gray-600 md:hidden font-medium">Amount: </span>
                      <span className="font-semibold text-gray-900">{formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Student Snapshot */}
          {invoice.student_snapshot && invoice.student_snapshot.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Enrolled Students ({invoice.student_snapshot.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto">
                  <div className="space-y-2">
                    {invoice.student_snapshot.map((student, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{student.name}</div>
                          <div className="text-gray-500 text-xs">
                            {student.admission_number} • {student.class_name}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary - Right Column */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Subtotal */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
              </div>

              {/* Tax */}
              {invoice.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax:</span>
                  <span className="font-medium">{formatCurrency(invoice.tax)}</span>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-semibold text-gray-900">Total:</span>
                <span className="text-2xl font-bold text-gray-900">
                  {formatCurrency(invoice.total)}
                </span>
              </div>

              {/* Amount Paid */}
              {invoice.amount_paid > 0 && (
                <>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Amount Paid:</span>
                    <span className="font-semibold">{formatCurrency(invoice.amount_paid)}</span>
                  </div>

                  {/* Balance */}
                  {invoice.amount_paid < invoice.total && (
                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="font-semibold text-orange-600">Balance Due:</span>
                      <span className="text-xl font-bold text-orange-600">
                        {formatCurrency(invoice.total - invoice.amount_paid)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Payment Status Badge */}
              <div className={`p-4 rounded-lg text-center ${
                invoice.status === 'paid'
                  ? 'bg-green-50 border border-green-200'
                  : invoice.status === 'cancelled'
                  ? 'bg-gray-50 border border-gray-200'
                  : overdue
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-orange-50 border border-orange-200'
              }`}>
                <div className={`text-sm font-semibold ${
                  invoice.status === 'paid'
                    ? 'text-green-900'
                    : invoice.status === 'cancelled'
                    ? 'text-gray-900'
                    : overdue
                    ? 'text-red-900'
                    : 'text-orange-900'
                }`}>
                  {invoice.status === 'paid'
                    ? 'Paid in Full'
                    : invoice.status === 'cancelled'
                    ? 'Invoice Cancelled'
                    : overdue
                    ? 'Payment Overdue'
                    : 'Payment Pending'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      {canPay && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          invoice={invoice}
          tenantEmail={user?.email || ''}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Cancel Modal */}
      <CancelModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancelInvoice}
        isLoading={cancelling}
      />
    </div>
  );
};

export default InvoiceDetail;
