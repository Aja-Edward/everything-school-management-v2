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
  generateInvoice,
  cancelInvoice,
  sendInvoice,
} from '@/services/BillingService';
import type {
  Invoice,
  BillingSummary,
  CreateInvoiceRequest,
  InvoiceGenerationResponse,
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
  createInvoice: (data: CreateInvoiceRequest) => Promise<InvoiceGenerationResponse>;
  cancelInvoiceById: (invoiceId: string, reason?: string) => Promise<void>;
  sendInvoiceById: (invoiceId: string, emailData?: any) => Promise<void>;
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
 *   createInvoice,
 * } = useBilling({ status: 'pending' });
 * ```
 */
export const useBilling = (filters?: {
  status?: string;
  academic_session_id?: string;
  term_id?: string;
  from_date?: string;
  to_date?: string;
}): UseBillingReturn => {
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
        ...filters,
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
  }, [filters]);

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

  const createInvoice = useCallback(async (data: CreateInvoiceRequest): Promise<InvoiceGenerationResponse> => {
    const result = await generateInvoice(data);
    await refetch();  // Refresh list after creating
    return result;
  }, [refetch]);

  const cancelInvoiceById = useCallback(async (invoiceId: string, reason?: string): Promise<void> => {
    await cancelInvoice(invoiceId, reason);
    await refetch();  // Refresh list after cancelling
  }, [refetch]);

  const sendInvoiceById = useCallback(async (invoiceId: string, emailData?: any): Promise<void> => {
    await sendInvoice(invoiceId, emailData);
    await refetch();  // Refresh list after sending
  }, [refetch]);

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
    createInvoice,
    cancelInvoiceById,
    sendInvoiceById,
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
