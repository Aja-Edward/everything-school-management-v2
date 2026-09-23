import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, CreditCard, Eye, EyeOff, Loader2, PlugZap } from 'lucide-react';
import { toast } from 'react-toastify';
import { PaymentGateway, PaymentGatewayService } from '@/services/FeeManagementService';

const field = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500';

const rows = (data: any): PaymentGateway[] => (Array.isArray(data) ? data : data?.results ?? []);

// A school's own Paystack account, so fees paid online land with the school
// rather than with us. The secret key is never sent back by the API, so the
// box stays empty and an empty box means "keep the key you have".
const PaystackPanel: React.FC = () => {
  const [config, setConfig] = useState<PaymentGateway | null | undefined>(undefined);
  const [showSecret, setShowSecret] = useState(false);
  // Only so the boxes hint at the right pair of keys; the saved value wins on load.
  const [testMode, setTestMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    try {
      const data = await PaymentGatewayService.list({ gateway: 'PAYSTACK' });
      const paystack = rows(data).find(g => g.gateway === 'PAYSTACK') ?? null;
      // The list leaves the keys out; the detail carries the public one.
      const full = paystack ? await PaymentGatewayService.get(paystack.id) : null;
      if (full) setTestMode(full.is_test_mode);
      setConfig(full);
    } catch (err) {
      console.error('Error loading Paystack settings:', err);
      setConfig(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const secret = String(form.get('secret_key') || '').trim();
    const body: Partial<PaymentGateway> = {
      gateway: 'PAYSTACK',
      public_key: String(form.get('public_key') || '').trim(),
      is_test_mode: testMode,
      is_active: true,
      ...(secret ? { secret_key: secret } : {}),
    };
    if (!config && !secret) {
      toast.error('The secret key is needed to start collecting.');
      return;
    }
    try {
      setSaving(true);
      setTestResult(null);
      if (config) await PaymentGatewayService.update(config.id, body);
      else await PaymentGatewayService.create(body);
      toast.success('Paystack details saved.');
      setShowSecret(false);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || 'Could not save the details.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!config) return;
    try {
      setTesting(true);
      const result: any = await PaymentGatewayService.testConnection(config.id);
      setTestResult({ ok: !!result?.success, message: result?.message || 'Paystack answered.' });
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err?.response?.data?.message || err?.message || 'Paystack did not answer.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center flex-shrink-0">
          <CreditCard className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Collecting fees online</h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Your own Paystack account, so fees parents pay online reach the school directly.
            Find both keys in your Paystack dashboard under Settings → API Keys &amp; Webhooks.
          </p>
        </div>
      </div>

      {config === undefined ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-primary-600 animate-spin" /></div>
      ) : (
        <form onSubmit={save} className="space-y-4">
          {config && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-primary-600" />
              <span>
                Set up in <strong>{config.is_test_mode ? 'test' : 'live'}</strong> mode
                {config.secret_key_saved ? `, secret key ending ${config.secret_key_hint}` : ', but no secret key saved'}.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-700 dark:text-slate-200">Public key</span>
              <input name="public_key" defaultValue={config?.public_key ?? ''} required
                     placeholder={testMode ? 'pk_test_…' : 'pk_live_…'} className={`mt-1 ${field}`} />
            </label>
            <label className="block">
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Secret key {config?.secret_key_saved && (
                  <span className="text-slate-400">— leave empty to keep the saved one</span>
                )}
              </span>
              <div className="relative mt-1">
                <input name="secret_key" type={showSecret ? 'text' : 'password'} autoComplete="off"
                       placeholder={config?.secret_key_saved ? '••••••••' : testMode ? 'sk_test_…' : 'sk_live_…'}
                       className={`${field} pr-10`} />
                <button type="button" onClick={() => setShowSecret(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_test_mode" checked={testMode}
                   onChange={event => setTestMode(event.target.checked)}
                   className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              Test mode — use your test keys; no real money moves
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="submit" disabled={saving}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
            <button type="button" onClick={test} disabled={!config || testing}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
              Test connection
            </button>
          </div>

          {testResult && (
            <p className={`text-sm ${testResult.ok
              ? 'text-primary-700 dark:text-primary-300'
              : 'text-red-600 dark:text-red-400'}`}>
              {testResult.message}
            </p>
          )}

          {config?.paystack_webhook_url && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <p className="text-sm text-slate-700 dark:text-slate-200">
                <strong>Webhook URL.</strong> Paste this into Paystack under Settings → API Keys &amp; Webhooks,
                so a parent who closes the page before returning is still credited.
              </p>
              <div className="flex gap-2">
                <input readOnly value={config.paystack_webhook_url} onFocus={e => e.currentTarget.select()}
                       className={`${field} font-mono text-xs`} />
                <button type="button"
                        onClick={() => navigator.clipboard.writeText(config.paystack_webhook_url!)
                          .then(() => toast.success('Webhook URL copied.'))}
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Copy className="w-4 h-4" /> Copy
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Paystack's own charges come out of what it pays you. Your keys are stored for this
            school only and the secret key is never shown again after saving.
          </p>
        </form>
      )}
    </div>
  );
};

export default PaystackPanel;
