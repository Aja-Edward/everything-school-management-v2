/**
 * ============================================================================
 * GenerateInvoice.tsx
 * Page for raising the school's invoice for the current term or session
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Users, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { generateInvoice, getInvoiceQuote, formatCurrency, invoicePeriodLabel } from '@/services/BillingService';
import type { BillingPeriod, InvoiceQuote } from '@/types/types';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// HELPERS
// ============================================================================

/** The backend's own explanation, e.g. that no current term is set. */
const errorMessage = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || fallback;
};

const PERIOD_OPTIONS: { value: BillingPeriod; title: string; description: string }[] = [
  { value: 'term', title: 'This term', description: 'Pay for the current term only' },
  { value: 'session', title: 'Whole session', description: 'Pay for all three terms at once' },
];

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * GenerateInvoice page: pick term or session, review the amount, raise it.
 */
export const GenerateInvoice: React.FC = () => {
  const navigate = useNavigate();

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('term');
  const [quote, setQuote] = useState<InvoiceQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quoteError, setQuoteError] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadQuote = async () => {
      setLoadingQuote(true);
      setQuoteError('');
      try {
        const result = await getInvoiceQuote(billingPeriod);
        if (!cancelled) setQuote(result);
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(errorMessage(err, 'Failed to work out the invoice amount'));
        }
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    };

    loadQuote();
    return () => {
      cancelled = true;
    };
  }, [billingPeriod]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationError('');
    try {
      const invoice = await generateInvoice(billingPeriod);
      navigate(`/admin/billing/invoices/${invoice.id}`);
    } catch (err) {
      setGenerationError(errorMessage(err, 'Failed to generate invoice'));
      setIsGenerating(false);
    }
  };

  const canGenerate = !!quote && quote.student_count > 0 && !isGenerating;

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/billing')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Billing
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Generate Invoice</h1>
        <p className="text-gray-600 mt-1">
          You are billed per active student. The Basic package covers every service except
          add-ons such as CBT and Gate Tracker, which are charged on top when switched on.
        </p>
      </div>

      {/* Billing period */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            How would you like to pay?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setBillingPeriod(option.value)}
                disabled={isGenerating}
                className={`text-left p-4 rounded-lg border-2 transition-colors ${
                  billingPeriod === option.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">{option.title}</div>
                <div className="text-sm text-gray-600 mt-1">{option.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quote */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Amount</CardTitle>
          {quote && (
            <CardDescription>
              For {invoicePeriodLabel(quote)} ·{' '}
              <Users className="inline h-3 w-3 mr-1" />
              {quote.student_count} active student{quote.student_count !== 1 ? 's' : ''}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingQuote ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working out the amount...
            </div>
          ) : quoteError ? (
            <div className="flex items-start gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{quoteError}</span>
            </div>
          ) : quote ? (
            <>
              <div className="space-y-2">
                {quote.lines.map((line) => (
                  <div
                    key={line.description}
                    className="flex justify-between gap-4 p-3 bg-gray-50 rounded-lg text-sm"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{line.description}</div>
                      <div className="text-gray-500">
                        {line.quantity} × {formatCurrency(line.unit_price)}
                        {billingPeriod === 'session' ? ' per session' : ' per term'}
                      </div>
                    </div>
                    <div className="font-semibold text-gray-900">{formatCurrency(line.amount)}</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-gray-900">{formatCurrency(quote.total)}</span>
              </div>

              {quote.student_count === 0 && (
                <p className="text-sm text-orange-700">
                  There are no active students to bill for yet.
                </p>
              )}
            </>
          ) : null}

          {generationError && (
            <div className="flex items-start gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{generationError}</span>
            </div>
          )}

          <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full" size="lg">
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Invoice'
            )}
          </Button>
          <p className="text-xs text-gray-500 text-center">
            If an unpaid invoice for this period already exists, it is updated to these figures instead.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default GenerateInvoice;
