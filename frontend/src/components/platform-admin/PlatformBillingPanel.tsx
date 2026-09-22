/**
 * Platform Billing Panel
 *
 * What every school owes the platform: totals across all schools, each
 * school's invoices, and the things only a platform admin does to them -
 * apply a discount, record money received outside the app, cancel an invoice
 * raised in error, or raise a school's invoice for them. Bank transfers a
 * school reports are confirmed on the Pending Payments page, linked from here.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Loader2, AlertCircle, Search, ChevronRight } from 'lucide-react';
import api from '@/services/api';
import {
  applyInvoiceDiscount,
  cancelInvoice,
  formatCurrency,
  generateInvoice,
  getInvoiceQuote,
  getInvoices,
  getPlatformBillingSummary,
  getPaymentMethodName,
  invoicePeriodLabel,
  isInvoiceOverdue,
  recordInvoicePayment,
} from '@/services/BillingService';
import type { BillingPeriod, Invoice, InvoiceQuote, PlatformBillingSummary } from '@/types/types';

interface School {
  id: string;
  name: string;
}

type StatusFilter = '' | 'pending' | 'partially_paid' | 'paid' | 'cancelled';
type InvoiceAction = 'payment' | 'discount' | 'cancel';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAGE_SIZE = 20;

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5";

/** The backend's own explanation, e.g. why a discount was refused. */
const errorMessage = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.detail || err?.message || fallback;

const formatDate = (value: string | null): string =>
  value ? new Date(value).toLocaleDateString() : '—';

const statusBadge = (invoice: Invoice) => {
  if (invoice.status === 'paid')
    return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-900 text-white">Paid</span>;
  if (invoice.status === 'cancelled')
    return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">Cancelled</span>;
  if (isInvoiceOverdue(invoice))
    return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full border border-gray-900 text-gray-900">Overdue</span>;
  if (invoice.status === 'partially_paid')
    return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-800">Part paid</span>;
  return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full border border-gray-300 text-gray-600">Unpaid</span>;
};

// ============================================================================
// SUMMARY
// ============================================================================

const SummaryCards: React.FC<{ summary: PlatformBillingSummary | null; onOpenTransfers: () => void }> = ({
  summary,
  onOpenTransfers,
}) => {
  const cards = [
    {
      label: 'Collected',
      value: summary ? formatCurrency(summary.total_collected) : '…',
      note: summary
        ? `Paystack ${formatCurrency(summary.collected_by_paystack)} · Transfer ${formatCurrency(summary.collected_by_transfer)}`
        : '',
    },
    {
      label: 'Outstanding',
      value: summary ? formatCurrency(summary.total_outstanding) : '…',
      note: summary ? `${summary.schools_owing} school${summary.schools_owing !== 1 ? 's' : ''} owing` : '',
    },
    {
      label: 'Overdue',
      value: summary ? formatCurrency(summary.overdue_total) : '…',
      note: summary ? `${summary.overdue_count} invoice${summary.overdue_count !== 1 ? 's' : ''} past due` : '',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, value, note }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{note}</p>
        </div>
      ))}
      <button
        onClick={onOpenTransfers}
        className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition-colors"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Transfers to Confirm</p>
        <p className="text-xl font-bold text-gray-900 mt-1">{summary ? summary.transfers_awaiting_confirmation : '…'}</p>
        <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-0.5">
          Open Pending Payments <ChevronRight className="w-3 h-3" />
        </p>
      </button>
    </div>
  );
};

// ============================================================================
// MANAGE INVOICE MODAL
// ============================================================================

const ManageInvoiceModal: React.FC<{
  invoice: Invoice;
  onClose: () => void;
  onChanged: (invoice: Invoice) => void;
}> = ({ invoice, onClose, onChanged }) => {
  const open = invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const [action, setAction] = useState<InvoiceAction>('payment');
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: InvoiceAction) => {
    setAction(next);
    setAmount(next === 'discount' ? String(Number(invoice.discount_amount) || '') : '');
    setText(next === 'discount' ? invoice.discount_reason : '');
    setError(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      let updated: Invoice;
      if (action === 'payment') {
        updated = await recordInvoicePayment(invoice.id, amount, text);
      } else if (action === 'discount') {
        updated = await applyInvoiceDiscount(invoice.id, amount || '0', text);
      } else {
        if (!window.confirm(`Cancel ${invoice.invoice_number} for ${invoice.school_name}?`)) {
          setSaving(false);
          return;
        }
        updated = await cancelInvoice(invoice.id, text);
      }
      onChanged(updated);
      setAmount('');
      setText('');
    } catch (err) {
      setError(errorMessage(err, 'That did not go through. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">{invoice.invoice_number}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {invoice.school_name} · {invoicePeriodLabel(invoice)} · {invoice.student_count} students
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Amounts */}
          <div className="space-y-1.5 text-sm">
            {invoice.line_items.map(item => (
              <div key={item.id} className="flex justify-between text-gray-700">
                <span>{item.description} <span className="text-gray-400">({item.quantity} × {formatCurrency(item.unit_price)})</span></span>
                <span>{formatCurrency(item.amount)}</span>
              </div>
            ))}
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Discount{invoice.discount_reason ? ` (${invoice.discount_reason})` : ''}</span>
                <span>−{formatCurrency(invoice.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-100 font-semibold text-gray-900">
              <span>Total</span><span>{formatCurrency(invoice.total_amount)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Paid</span><span>{formatCurrency(invoice.amount_paid)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900">
              <span>Balance</span><span>{formatCurrency(invoice.balance_due)}</span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-500 text-xs">Due {formatDate(invoice.due_date)}</span>
              {statusBadge(invoice)}
            </div>
          </div>

          {/* Payments */}
          {invoice.payments.length > 0 && (
            <div>
              <p className={labelCls}>Payments</p>
              <div className="space-y-1.5">
                {invoice.payments.map(p => (
                  <div key={p.id} className="flex justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-gray-700">
                      {getPaymentMethodName(p.payment_method)} · {formatDate(p.created_at)}
                      {p.confirmation_notes ? ` · ${p.confirmation_notes}` : ''}
                    </span>
                    <span className="text-gray-900 font-medium whitespace-nowrap pl-2">
                      {formatCurrency(p.amount)} <span className="text-gray-400 capitalize">{p.status}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {open ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['payment', 'Record payment'],
                  ['discount', 'Discount'],
                  ['cancel', 'Cancel invoice'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => choose(key)}
                    className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                      action === key ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {error && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700">{error}</div>
              )}

              {action !== 'cancel' && (
                <div>
                  <label className={labelCls}>{action === 'payment' ? 'Amount received (₦)' : 'Discount (₦)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={action === 'payment' ? String(Number(invoice.balance_due)) : '0'}
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>
                  {action === 'payment' ? 'Notes' : action === 'discount' ? 'Reason (shown on the invoice)' : 'Reason'}
                </label>
                <input
                  className={inputCls}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={action === 'payment' ? 'e.g. Cash paid at office' : action === 'discount' ? 'e.g. Pilot school' : 'e.g. Raised in error'}
                />
              </div>
              <p className="text-xs text-gray-400">
                {action === 'payment'
                  ? 'For money received outside the app. A school still awaiting activation is activated once the invoice is fully paid.'
                  : action === 'discount'
                  ? 'Replaces any earlier discount on this invoice.'
                  : 'Only possible while nothing has been paid or reported against it. The school can then raise a fresh invoice for the period.'}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">This invoice is {invoice.status}; there is nothing more to do on it.</p>
          )}
        </div>

        {open && (
          <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
            <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
              Close
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || (action === 'payment' && !amount)}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {action === 'payment' ? 'Record Payment' : action === 'discount' ? 'Apply Discount' : 'Cancel Invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// RAISE INVOICE MODAL
// ============================================================================

const RaiseInvoiceModal: React.FC<{
  schools: School[];
  onClose: () => void;
  onRaised: (invoice: Invoice) => void;
}> = ({ schools, onClose, onRaised }) => {
  const [tenantId, setTenantId] = useState('');
  const [period, setPeriod] = useState<BillingPeriod>('term');
  const [quote, setQuote] = useState<InvoiceQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setLoadingQuote(true);
    setError(null);
    getInvoiceQuote(period, tenantId)
      .then(result => { if (!cancelled) setQuote(result); })
      .catch(err => {
        if (!cancelled) {
          setQuote(null);
          setError(errorMessage(err, 'Could not work out the amount.'));
        }
      })
      .finally(() => { if (!cancelled) setLoadingQuote(false); });
    return () => { cancelled = true; };
  }, [tenantId, period]);

  const handleRaise = async () => {
    setSaving(true);
    setError(null);
    try {
      onRaised(await generateInvoice(period, tenantId));
    } catch (err) {
      setError(errorMessage(err, 'Could not raise the invoice.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Raise Invoice for a School</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className={labelCls}>School</label>
            <select className={inputCls} value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">Choose a school…</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Billing</label>
            <div className="grid grid-cols-2 gap-2">
              {([['term', 'Current term'], ['session', 'Whole session']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    period === value ? 'bg-black text-white border-black' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700">{error}</div>
          )}

          {loadingQuote ? (
            <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
          ) : quote && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
              <p className="text-xs text-gray-500">
                {invoicePeriodLabel(quote)} · {quote.student_count} active students
              </p>
              {quote.lines.map(line => (
                <div key={line.description} className="flex justify-between text-gray-700">
                  <span>{line.description} <span className="text-gray-400">({line.quantity} × {formatCurrency(line.unit_price)})</span></span>
                  <span>{formatCurrency(line.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-gray-900">
                <span>Total</span><span>{formatCurrency(quote.total)}</span>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400">
            If the school already has an unpaid invoice for this period, it is brought up to date instead of a second one being raised.
          </p>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleRaise}
            disabled={saving || !quote || quote.student_count === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Raise Invoice
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// PANEL
// ============================================================================

const PlatformBillingPanel: React.FC = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState<PlatformBillingSummary | null>(null);
  const [schools, setSchools] = useState<School[]>([]);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [managing, setManaging] = useState<Invoice | null>(null);
  const [raising, setRaising] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getPlatformBillingSummary());
    } catch (err) {
      setError(errorMessage(err, 'Failed to load billing totals.'));
    }
  }, []);

  const loadInvoices = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInvoices({
        status: statusFilter || undefined,
        tenant: schoolFilter || undefined,
        search: search || undefined,
        page: nextPage,
        page_size: PAGE_SIZE,
      });
      setInvoices(prev => (nextPage === 1 ? res.results : [...prev, ...res.results]));
      setCount(res.count);
      setPage(nextPage);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load invoices.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, schoolFilter, search]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadInvoices(1); }, [loadInvoices]);

  useEffect(() => {
    api.get('/api/tenants/list/')
      .then((res: any) => {
        const rows = Array.isArray(res) ? res : res?.results ?? [];
        setSchools(
          rows.map((t: any) => ({ id: String(t.id), name: t.name }))
            .sort((a: School, b: School) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        // The school filter is a convenience; the invoice list still works without it.
      });
  }, []);

  const handleChanged = (updated: Invoice) => {
    setManaging(updated);
    setInvoices(prev => prev.map(i => (i.id === updated.id ? updated : i)));
    loadSummary();
  };

  const handleRaised = (invoice: Invoice) => {
    setRaising(false);
    setManaging(invoice);
    loadInvoices(1);
    loadSummary();
  };

  return (
    <div className="space-y-4">
      <SummaryCards summary={summary} onOpenTransfers={() => navigate('/platform-admin/pending-payments')} />

      {error && (
        <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Invoices ({loading && page === 1 ? '…' : count})
        </h2>
        <button
          onClick={() => setRaising(true)}
          className="self-start lg:self-auto flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Raise Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="inline-flex flex-wrap bg-white border border-gray-200 rounded-lg p-1 gap-1">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={label}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                statusFilter === value ? 'bg-black text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-black"
          value={schoolFilter}
          onChange={e => setSchoolFilter(e.target.value)}
        >
          <option value="">All schools</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <form
          className="relative flex-1"
          onSubmit={e => { e.preventDefault(); setSearch(searchInput.trim()); }}
        >
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
            placeholder="Invoice number or school, then Enter"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && page === 1 ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">No invoices match.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Invoice', 'School', 'Students', 'Total', 'Paid', 'Balance', 'Status', 'Due', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map(invoice => (
                  <tr
                    key={invoice.id}
                    onClick={() => setManaging(invoice)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{invoice.invoice_number}</p>
                      <p className="text-xs text-gray-500 whitespace-nowrap">{invoicePeriodLabel(invoice)}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-700">{invoice.school_name}</td>
                    <td className="px-5 py-3.5 text-gray-700">{invoice.student_count}</td>
                    <td className="px-5 py-3.5 text-gray-900 whitespace-nowrap">{formatCurrency(invoice.total_amount)}</td>
                    <td className="px-5 py-3.5 text-gray-700 whitespace-nowrap">{formatCurrency(invoice.amount_paid)}</td>
                    <td className="px-5 py-3.5 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(invoice.balance_due)}</td>
                    <td className="px-5 py-3.5">{statusBadge(invoice)}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">{formatDate(invoice.due_date)}</td>
                    <td className="px-5 py-3.5 text-gray-400"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {invoices.length < count && !(loading && page === 1) && (
        <div className="text-center">
          <button
            onClick={() => loadInvoices(page + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Load more
          </button>
        </div>
      )}

      {managing && (
        <ManageInvoiceModal
          key={managing.id}
          invoice={managing}
          onClose={() => setManaging(null)}
          onChanged={handleChanged}
        />
      )}
      {raising && (
        <RaiseInvoiceModal schools={schools} onClose={() => setRaising(false)} onRaised={handleRaised} />
      )}
    </div>
  );
};

export default PlatformBillingPanel;
