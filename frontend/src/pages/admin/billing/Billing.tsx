/**
 * ============================================================================
 * Billing.tsx
 * Main billing dashboard page
 * ============================================================================
 */

import React, { useState } from 'react';
import { Plus, Filter, Download, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { useBilling, useBillingSummary } from '@/hooks/useBilling';
import { formatCurrency } from '@/services/BillingService';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Billing dashboard page
 */
export const Billing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Fetch billing data
  const {
    invoices,
    loading: invoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices,
    hasMore,
    loadMore,
  } = useBilling({ status: statusFilter || undefined });

  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
  } = useBillingSummary();

  const handleGenerateInvoice = () => {
    navigate('/admin/billing/generate-invoice');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-600 mt-1">
            Manage invoices and payments for your school
          </p>
        </div>
        <Button onClick={handleGenerateInvoice} size="lg">
          <Plus className="mr-2 h-5 w-5" />
          Generate Invoice
        </Button>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summaryError ? (
        <Card className="p-6">
          <div className="text-red-600 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load billing summary</span>
          </div>
        </Card>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Total Outstanding */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.total_outstanding)}</div>
              <p className="text-xs text-gray-600 mt-1">
                Unpaid invoices
              </p>
            </CardContent>
          </Card>

          {/* Total Paid */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.total_paid)}</div>
              <p className="text-xs text-gray-600 mt-1">
                All-time payments
              </p>
            </CardContent>
          </Card>

          {/* Current Term Total */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Term</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.current_term_total)}</div>
              <p className="text-xs text-gray-600 mt-1">
                This term's billing
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Active Features */}
      {summary && summary.active_features.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Features</CardTitle>
            <CardDescription>Features currently activated for your school</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {summary.active_features.map((feature, index) => (
                <div
                  key={index}
                  className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium"
                >
                  ✓ {feature}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Invoices</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusFilter('')}
                className={!statusFilter ? 'bg-gray-100' : ''}
              >
                All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusFilter('pending')}
                className={statusFilter === 'pending' ? 'bg-gray-100' : ''}
              >
                Pending
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusFilter('paid')}
                className={statusFilter === 'paid' ? 'bg-gray-100' : ''}
              >
                Paid
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesError ? (
            <div className="text-red-600 flex items-center gap-2 p-4">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load invoices</span>
            </div>
          ) : (
            <>
              <InvoiceList
                invoices={invoices}
                loading={invoicesLoading}
                onPaymentSuccess={refetchInvoices}
                tenantEmail={user?.email || ''}
              />

              {/* Load More */}
              {hasMore && !invoicesLoading && (
                <div className="mt-4 text-center">
                  <Button variant="outline" onClick={loadMore}>
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Billing;
