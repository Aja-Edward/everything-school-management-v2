import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import api from '@/services/api';
import { formatCurrency } from '@/services/BillingService';

// What the platform agreed to charge one school. Every box left empty means
// the standard price, shown as the placeholder.

interface AddOnPrice {
  service: string;
  name: string;
  is_enabled: boolean;
  price_per_student: string | null;
  price_per_student_per_session: string | null;
  standard_price_per_student: string | null;
  standard_price_per_student_per_session: string | null;
}

interface PricingSummary {
  agreed: boolean;
  notes: string;
  updated_at: string | null;
  basic: {
    price_per_student: string | null;
    price_per_student_per_session: string | null;
    standard_price_per_student: string;
    standard_price_per_student_per_session: string;
  };
  sms: {
    price_per_message: string | null;
    standard_price_per_message: string;
    is_enabled: boolean;
  };
  add_ons: AddOnPrice[];
  invoices_repriced?: number;
}

interface Props {
  tenant: { id: string; name: string };
  onClose: () => void;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5";

const errorMessage = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.detail || err?.message || fallback;

const standard = (value: string | null) => (value ? `Standard ${formatCurrency(value)}` : 'No standard price');

const TenantPricingModal = ({ tenant, onClose }: Props) => {
  const url = `/api/tenants/list/${tenant.id}/pricing/`;
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [basicTerm, setBasicTerm] = useState('');
  const [basicSession, setBasicSession] = useState('');
  const [sms, setSms] = useState('');
  const [notes, setNotes] = useState('');
  const [addOns, setAddOns] = useState<Record<string, { term: string; session: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const fill = (data: PricingSummary) => {
    setPricing(data);
    setBasicTerm(data.basic.price_per_student ?? '');
    setBasicSession(data.basic.price_per_student_per_session ?? '');
    setSms(data.sms.price_per_message ?? '');
    setNotes(data.notes ?? '');
    setAddOns(Object.fromEntries(data.add_ons.map(a => [
      a.service, { term: a.price_per_student ?? '', session: a.price_per_student_per_session ?? '' },
    ])));
  };

  useEffect(() => {
    api.get(url)
      .then(fill)
      .catch(err => setError(errorMessage(err, 'Could not load the prices.')));
  }, [url]);

  const repricedNote = (data: PricingSummary) =>
    data.invoices_repriced
      ? ` ${data.invoices_repriced} unpaid invoice${data.invoices_repriced === 1 ? '' : 's'} repriced.`
      : '';

  const save = async () => {
    setError(null);
    setSaved(null);
    if (!basicTerm.trim()) {
      setError('Enter the Basic price per student per term.');
      return;
    }
    setSaving(true);
    try {
      const data: PricingSummary = await api.put(url, {
        basic: { price_per_student: basicTerm, price_per_student_per_session: basicSession },
        sms: { price_per_message: sms },
        notes,
        add_ons: Object.entries(addOns).map(([service, p]) => ({
          service, price_per_student: p.term, price_per_student_per_session: p.session,
        })),
      });
      fill(data);
      setSaved(`Prices saved.${repricedNote(data)}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the prices.'));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(`Put ${tenant.name} back on the standard prices?`)) return;
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      const data: PricingSummary = await api.delete(url);
      fill(data);
      setSaved(`Back on the standard prices.${repricedNote(data)}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not reset the prices.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">Pricing · {tenant.name}</h3>
            <p className="text-xs text-gray-500">
              {pricing?.agreed ? 'Agreed prices' : 'On the standard prices'} · per student unless noted
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!pricing ? (
          <div className="py-10 flex justify-center">
            {error
              ? <p className="text-sm text-gray-700 px-5">{error}</p>
              : <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5 overflow-y-auto">
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Basic package</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Per term (₦)</label>
                  <input className={inputCls} inputMode="decimal" value={basicTerm}
                         onChange={e => setBasicTerm(e.target.value)}
                         placeholder={pricing.basic.standard_price_per_student} />
                  <p className="text-xs text-gray-400 mt-1">{standard(pricing.basic.standard_price_per_student)}</p>
                </div>
                <div>
                  <label className={labelCls}>Per session (₦)</label>
                  <input className={inputCls} inputMode="decimal" value={basicSession}
                         onChange={e => setBasicSession(e.target.value)}
                         placeholder={basicTerm ? String(Number(basicTerm) * 3) : pricing.basic.standard_price_per_student_per_session} />
                  <p className="text-xs text-gray-400 mt-1">Empty means three terms</p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">Add-ons</h4>
              {pricing.add_ons.map(addOn => (
                <div key={addOn.service}>
                  <p className="text-sm text-gray-700 mb-1.5">
                    {addOn.name}
                    <span className="ml-2 text-xs text-gray-400">{addOn.is_enabled ? 'switched on' : 'off'}</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Per term (₦)</label>
                      <input className={inputCls} inputMode="decimal"
                             value={addOns[addOn.service]?.term ?? ''}
                             onChange={e => setAddOns(a => ({ ...a, [addOn.service]: { ...a[addOn.service], term: e.target.value } }))}
                             placeholder={addOn.standard_price_per_student ?? ''} />
                      <p className="text-xs text-gray-400 mt-1">{standard(addOn.standard_price_per_student)}</p>
                    </div>
                    <div>
                      <label className={labelCls}>Per session (₦)</label>
                      <input className={inputCls} inputMode="decimal"
                             value={addOns[addOn.service]?.session ?? ''}
                             onChange={e => setAddOns(a => ({ ...a, [addOn.service]: { ...a[addOn.service], session: e.target.value } }))}
                             placeholder={addOn.standard_price_per_student_per_session ?? ''} />
                      <p className="text-xs text-gray-400 mt-1">Empty means three terms</p>
                    </div>
                  </div>
                </div>
              ))}
              <div>
                <p className="text-sm text-gray-700 mb-1.5">
                  SMS messages
                  <span className="ml-2 text-xs text-gray-400">{pricing.sms.is_enabled ? 'switched on' : 'off'}</span>
                </p>
                <label className={labelCls}>Per text sent (₦)</label>
                <input className={`${inputCls} sm:w-1/2`} inputMode="decimal" value={sms}
                       onChange={e => setSms(e.target.value)}
                       placeholder={pricing.sms.standard_price_per_message} />
                <p className="text-xs text-gray-400 mt-1">{standard(pricing.sms.standard_price_per_message)}</p>
              </div>
            </section>

            <section>
              <label className={labelCls}>What was agreed</label>
              <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="e.g. ₦650 for the first year, agreed with the proprietor on 20 Sept" />
            </section>

            <p className="text-xs text-gray-400">
              Unpaid invoices are repriced when you save. Invoices already paid, or with a transfer
              awaiting confirmation, keep the price they were raised at.
            </p>

            {error && <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700">{error}</div>}
            {saved && <div className="bg-gray-900 text-white rounded-lg p-2.5 text-xs">{saved}</div>}
          </div>
        )}

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          {pricing?.agreed && (
            <button onClick={reset} disabled={saving}
                    className="py-2.5 px-3 text-sm font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50">
              Use standard
            </button>
          )}
          <button onClick={onClose} disabled={saving}
                  className="flex-1 py-2.5 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            Close
          </button>
          <button onClick={save} disabled={saving || !pricing}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save prices
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenantPricingModal;
