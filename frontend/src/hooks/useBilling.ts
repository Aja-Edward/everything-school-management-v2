/**
 * ============================================================================
 * useBilling.ts
 * Hook for managing billing state and operations
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getInvoices,
  getInvoice,
  getBillingSummary,
} from '@/services/BillingService';
import type {
  Invoice,
  BillingSummary,
  BillingPeriod,
} from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

interface UseBillingReturn {
  invoices: Invoice[];
  loading: boolean;
  error: Error | null;
  count: number;
  hasMore: boolean;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
}

interface UseBillingSummaryReturn {
  summary: BillingSummary | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseInvoiceReturn {
  invoice: Invoice | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// BILLING LIST HOOK
// ============================================================================

/**
 * Hook for managing invoice list with pagination and filtering
 *
 * @example
 * ```tsx
 * const {
 *   invoices,
 *   loading,
 *   error,
 *   loadMore,
 * } = useBilling({ status: 'pending' });
 * ```
 */
export const useBilling = (filters?: {
  status?: string;
  billing_period?: BillingPeriod;
}): UseBillingReturn => {
  // Callers pass a fresh object each render; depending on the values rather
  // than the object keeps the fetch from re-running on every render.
  const status = filters?.status;
  const billingPeriod = filters?.billing_period;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [count, setCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const PAGE_SIZE = 20;

  const fetchInvoices = useCallback(async (currentPage: number, append: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getInvoices({
        status,
        billing_period: billingPeriod,
        page: currentPage,
        page_size: PAGE_SIZE,
      });

      if (append) {
        setInvoices((prev) => [...prev, ...response.results]);
      } else {
        setInvoices(response.results);
      }

      setCount(response.count);
      setHasMore(!!response.next);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch invoices');
      setError(error);
      console.error('Failed to fetch invoices:', error);
    } finally {
      setLoading(false);
    }
  }, [status, billingPeriod]);

  const refetch = useCallback(async () => {
    setPage(1);
    await fetchInvoices(1, false);
  }, [fetchInvoices]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchInvoices(nextPage, true);
  }, [hasMore, loading, page, fetchInvoices]);

  useEffect(() => {
    fetchInvoices(1, false);
  }, [fetchInvoices]);

  return {
    invoices,
    loading,
    error,
    count,
    hasMore,
    refetch,
    loadMore,
  };
};

// ============================================================================
// BILLING SUMMARY HOOK
// ============================================================================

/**
 * Hook for fetching billing summary
 *
 * @example
 * ```tsx
 * const { summary, loading, error } = useBillingSummary({
 *   academicSessionId: currentSession.id,
 *   termId: currentTerm.id,
 * });
 * ```
 */
export const useBillingSummary = (options?: {
  academicSessionId?: string;
  termId?: string;
}): UseBillingSummaryReturn => {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getBillingSummary(
        options?.academicSessionId,
        options?.termId
      );
      setSummary(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch billing summary');
      setError(error);
      console.error('Failed to fetch billing summary:', error);
    } finally {
      setLoading(false);
    }
  }, [options?.academicSessionId, options?.termId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    error,
    refetch: fetchSummary,
  };
};

// ============================================================================
// SINGLE INVOICE HOOK
// ============================================================================

/**
 * Hook for fetching a single invoice
 *
 * @example
 * ```tsx
 * const { invoice, loading, error, refetch } = useInvoice(invoiceId);
 * ```
 */
export const useInvoice = (invoiceId: string | undefined): UseInvoiceReturn => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getInvoice(invoiceId);
      setInvoice(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch invoice');
      setError(error);
      console.error('Failed to fetch invoice:', error);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  return {
    invoice,
    loading,
    error,
    refetch: fetchInvoice,
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  useBilling,
  useBillingSummary,
  useInvoice,
};
