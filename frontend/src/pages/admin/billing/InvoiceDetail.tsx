/**
 * ============================================================================
 * InvoiceDetail.tsx
 * Detailed view of a single invoice
 * ============================================================================
 */

import React, { useState } from 'react';
import { ArrowLeft, CreditCard, CheckCircle, AlertCircle, Calendar, Users, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useInvoice } from '@/hooks/useBilling';
import { formatCurrency, invoicePeriodLabel, isInvoiceOverdue, getPaymentMethodName } from '@/services/BillingService';
import { PaymentModal } from '@/components/billing/PaymentModal';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleDateString() : 'Not set';

const statusLabel = (status: string): string => status.replace('_', ' ').toUpperCase();

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

  const handleBack = () => {
    navigate('/admin/billing');
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
  const balanceDue = Number(invoice.balance_due);
  const amountPaid = Number(invoice.amount_paid);
  const canPay = invoice.status !== 'paid' && invoice.status !== 'cancelled' && balanceDue > 0;

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Billing
        </Button>
      </div>

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
                  {statusLabel(invoice.status)}
                </Badge>
                {overdue && (
                  <Badge variant="destructive">OVERDUE</Badge>
                )}
              </div>
              <p className="text-gray-600">
                {invoicePeriodLabel(invoice)} · Issued {formatDate(invoice.issue_date)}
              </p>
            </div>

            {canPay && (
              <Button
                size="sm"
                onClick={() => setIsPaymentModalOpen(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <CreditCard className="h-4 w-4 mr-1" />
                Pay {formatCurrency(balanceDue)}
              </Button>
            )}
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
                  <div className="text-gray-500 mb-1">Billed For</div>
                  <div className="font-semibold">{invoicePeriodLabel(invoice)}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Billing</div>
                  <div className="font-semibold">
                    {invoice.billing_period === 'session' ? 'Whole session (3 terms)' : 'One term'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Issued</div>
                  <div className="font-semibold">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    {formatDate(invoice.issue_date)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Due Date</div>
                  <div className={`font-semibold ${overdue ? 'text-red-600' : ''}`}>
                    <Calendar className="inline h-4 w-4 mr-1" />
                    {formatDate(invoice.due_date)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Students Billed</div>
                  <div className="font-semibold">
                    <Users className="inline h-4 w-4 mr-1" />
                    {invoice.student_count} active students
                  </div>
                </div>
                {invoice.paid_at && (
                  <div>
                    <div className="text-gray-500 mb-1">Paid On</div>
                    <div className="font-semibold text-green-600">
                      <CheckCircle className="inline h-4 w-4 mr-1" />
                      {formatDate(invoice.paid_at)}
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
                  <div className="col-span-2 text-right">Students</div>
                  <div className="col-span-2 text-right">Per Student</div>
                  <div className="col-span-3 text-right">Amount</div>
                </div>

                {/* Items */}
                {invoice.line_items.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 p-4 md:p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="md:col-span-5">
                      <div className="font-medium text-gray-900">{item.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.item_type === 'base' ? 'Every service except add-ons' : 'Add-on'}
                      </div>
                    </div>
                    <div className="md:col-span-2 md:text-right">
                      <span className="text-gray-600 md:hidden font-medium">Students: </span>
                      <span className="text-gray-900">{item.quantity}</span>
                    </div>
                    <div className="md:col-span-2 md:text-right">
                      <span className="text-gray-600 md:hidden font-medium">Per student: </span>
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

          {/* Payments */}
          {invoice.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {invoice.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {getPaymentMethodName(payment.payment_method)}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {payment.reference} · {formatDate(payment.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">{formatCurrency(payment.amount)}</div>
                        <div className="text-xs capitalize text-gray-500">{payment.status}</div>
                      </div>
                    </div>
                  ))}
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
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Basic package:</span>
                <span className="font-medium">{formatCurrency(invoice.base_amount)}</span>
              </div>

              {Number(invoice.services_amount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Add-ons:</span>
                  <span className="font-medium">{formatCurrency(invoice.services_amount)}</span>
                </div>
              )}

              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between text-sm text-green-700">
                  <span>Discount{invoice.discount_reason ? ` (${invoice.discount_reason})` : ''}:</span>
                  <span className="font-medium">-{formatCurrency(invoice.discount_amount)}</span>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-semibold text-gray-900">Total:</span>
                <span className="text-2xl font-bold text-gray-900">
                  {formatCurrency(invoice.total_amount)}
                </span>
              </div>

              {/* Amount Paid */}
              {amountPaid > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Amount Paid:</span>
                  <span className="font-semibold">{formatCurrency(amountPaid)}</span>
                </div>
              )}

              {/* Balance */}
              {amountPaid > 0 && balanceDue > 0 && (
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="font-semibold text-orange-600">Balance Due:</span>
                  <span className="text-xl font-bold text-orange-600">
                    {formatCurrency(balanceDue)}
                  </span>
                </div>
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
    </div>
  );
};

export default InvoiceDetail;
