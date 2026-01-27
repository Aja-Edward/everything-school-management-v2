/**
 * ============================================================================
 * InvoiceList.tsx
 * Component for displaying a list of invoices
 * ============================================================================
 */

import React, { useState } from 'react';
import { Eye, Download, Send, CreditCard, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatCurrency, getInvoiceStatusColor, isInvoiceOverdue } from '@/services/BillingService';
import { downloadInvoicePDF } from '@/services/BillingService';
import { PaymentModal } from './PaymentModal';
import type { Invoice } from '@/types/types';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceListProps {
  invoices: Invoice[];
  loading?: boolean;
  onInvoiceClick?: (invoice: Invoice) => void;
  onPaymentSuccess?: () => void;
  showActions?: boolean;
  tenantEmail?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: 'secondary',
    sent: 'outline',
    paid: 'default',
    partially_paid: 'outline',
    overdue: 'destructive',
    cancelled: 'secondary',
  };
  return variants[status] || 'default';
};

const getStatusIcon = (status: string) => {
  const icons: Record<string, React.ReactNode> = {
    draft: <Clock className="h-3 w-3" />,
    sent: <Send className="h-3 w-3" />,
    paid: <CheckCircle className="h-3 w-3" />,
    partially_paid: <AlertCircle className="h-3 w-3" />,
    overdue: <AlertCircle className="h-3 w-3" />,
    cancelled: <AlertCircle className="h-3 w-3" />,
  };
  return icons[status] || null;
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * InvoiceList component for displaying invoices in a table/grid
 */
export const InvoiceList: React.FC<InvoiceListProps> = ({
  invoices,
  loading = false,
  onInvoiceClick,
  onPaymentSuccess,
  showActions = true,
  tenantEmail = '',
}) => {
  const navigate = useNavigate();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPDF = async (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingId(invoice.id as string);

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
    } catch (error) {
      console.error('Failed to download PDF:', error);
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePayNow = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedInvoice(invoice);
    setIsPaymentModalOpen(true);
  };

  const handleViewInvoice = (invoice: Invoice) => {
    if (onInvoiceClick) {
      onInvoiceClick(invoice);
    } else {
      navigate(`/admin/billing/invoices/${invoice.id}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </Card>
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="text-gray-400 mb-4">
          <AlertCircle className="h-16 w-16 mx-auto" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Invoices Found</h3>
        <p className="text-gray-600">You haven't generated any invoices yet.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {invoices.map((invoice) => {
          const overdue = isInvoiceOverdue(invoice);

          return (
            <Card
              key={invoice.id}
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleViewInvoice(invoice)}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Left Section - Invoice Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-lg text-gray-900">
                      {invoice.invoice_number}
                    </h3>
                    <Badge variant={getStatusBadgeVariant(invoice.status)} className="flex items-center gap-1">
                      {getStatusIcon(invoice.status)}
                      {invoice.status.toUpperCase()}
                    </Badge>
                    {overdue && (
                      <Badge variant="destructive">OVERDUE</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
                    <div>
                      <span className="text-gray-500">Generated:</span>{' '}
                      {new Date(invoice.created_at!).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="text-gray-500">Due:</span>{' '}
                      {new Date(invoice.due_date).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="text-gray-500">Students:</span> {invoice.student_count}
                    </div>
                    <div>
                      <span className="text-gray-500">Items:</span> {invoice.items.length}
                    </div>
                  </div>
                </div>

                {/* Right Section - Amount & Actions */}
                <div className="flex flex-col md:items-end gap-4">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCurrency(invoice.total)}
                    </div>
                    {invoice.amount_paid > 0 && (
                      <div className="text-sm text-gray-600">
                        Paid: {formatCurrency(invoice.amount_paid)}
                      </div>
                    )}
                  </div>

                  {showActions && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleDownloadPDF(invoice, e)}
                        disabled={downloadingId === invoice.id}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>

                      {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          onClick={(e) => handlePayNow(invoice, e)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CreditCard className="h-4 w-4 mr-1" />
                          Pay Now
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewInvoice(invoice);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Payment Modal */}
      {selectedInvoice && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
          }}
          invoice={selectedInvoice}
          tenantEmail={tenantEmail}
          onPaymentSuccess={() => {
            onPaymentSuccess?.();
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
          }}
        />
      )}
    </>
  );
};

export default InvoiceList;
