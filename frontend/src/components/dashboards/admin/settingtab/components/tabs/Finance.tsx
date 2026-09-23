import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Wallet } from 'lucide-react';
import FeeRemindersPanel from './FeeRemindersPanel';
import FeeItemsPanel from './FeeItemsPanel';
import PaystackPanel from './PaystackPanel';
import { tenantService, TenantServiceType } from '@/services/TenantService';
import { useBillingSummary } from '@/hooks/useBilling';

const naira = (amount: string | number) =>
  `₦${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const Card: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, action, children }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-700">
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center flex-shrink-0">
          {icon}
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
    {children}
  </div>
);

// Everything here is read from the API: what the school pays the platform
// (tenants/services and its invoices) and the fees it charges parents. It used
// to show invented figures - a "$5000 Monthly" tuition fee, discount rules,
// payment methods and tax settings that saved nowhere - which did not match
// the school's real pricing or its invoices.
const Finance: React.FC = () => {
  const navigate = useNavigate();
  const { summary, loading: summaryLoading } = useBillingSummary();
  const [services, setServices] = useState<TenantServiceType[] | null>(null);

  useEffect(() => {
    tenantService.getServices().then(setServices).catch(() => setServices([]));
  }, []);

  const basic = services?.find(s => s.service === 'basic');
  const addOns = (services ?? []).filter(s => s.is_add_on && s.is_enabled && s.service !== 'basic');
  const perMessage = addOns.filter(s => s.price_per_message != null);
  const perStudent = Number(basic?.price_per_student ?? 0)
    + addOns.filter(s => s.price_per_message == null)
      .reduce((sum, s) => sum + Number(s.price_per_student), 0);

  return (
    <div className="space-y-8">
      <FeeRemindersPanel />

      {/* What the school pays the platform */}
      <Card
        title="Your Nuventa bill"
        subtitle="What this school pays for the software, and what is outstanding."
        icon={<Wallet className="w-4 h-4" />}
        action={
          <button
            onClick={() => navigate('/admin/billing')}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Invoices
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
      >
        {services === null ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-primary-600 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-l-4 border-primary-600">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Per student, per term</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{naira(perStudent)}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Basic package {naira(basic?.price_per_student ?? 0)}
                  {addOns.filter(s => s.price_per_message == null).length > 0 && ' + add-ons'}
                </p>
              </div>
              <div className="p-4 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Outstanding</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                  {summaryLoading ? '—' : naira(summary?.total_outstanding ?? 0)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {summaryLoading ? 'loading…' : `${summary?.pending_count ?? 0} pending · ${summary?.overdue_count ?? 0} overdue`}
                </p>
              </div>
              <div className="p-4 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Paid so far</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                  {summaryLoading ? '—' : naira(summary?.total_paid ?? 0)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {summaryLoading ? '' : `across ${summary?.total_invoices ?? 0} invoices`}
                </p>
              </div>
            </div>

            <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              {addOns.length === 0 ? (
                <p>No add-ons are switched on. Everything you use is in the Basic package.</p>
              ) : (
                <ul className="space-y-1">
                  {addOns.map(s => (
                    <li key={s.service} className="flex items-baseline justify-between gap-3">
                      <span>{s.name}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {s.price_per_message != null
                          ? `${naira(s.price_per_message)} per message sent`
                          : `${naira(s.price_per_student)} per student / term`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Change what you use under Settings → Services.
                {perMessage.length > 0 && ' Messages are added to your next invoice as they are sent.'}
              </p>
            </div>
          </>
        )}
      </Card>

      <FeeItemsPanel />

      <PaystackPanel />
    </div>
  );
};

export default Finance;
