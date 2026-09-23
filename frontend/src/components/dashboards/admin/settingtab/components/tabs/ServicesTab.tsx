import React, { useState, useEffect } from 'react';
import {
  Loader2,
  RefreshCw,
  Shield,
  BookOpen,
  Clock,
  MessageSquare,
  Wallet,
  Calendar,
  Sparkles,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { tenantService, AvailableService, applyToggle, missingRequirement } from '@/services/TenantService';
import { toast } from 'react-toastify';

interface ServicesTabProps {
  settings?: any;
  onSettingsUpdate?: (settings: any) => void;
}

// The page takes the school's own colour from the Tailwind `primary` palette,
// which DesignContext sets from the school's primary_color. Everything else
// stays neutral so that one colour carries the page.
const CATEGORIES: Record<string, { name: string; icon: React.ReactNode; order: number }> = {
  core: { name: 'Core', icon: <Shield className="w-4 h-4" />, order: 1 },
  assessment: { name: 'Assessment & grades', icon: <BookOpen className="w-4 h-4" />, order: 2 },
  attendance: { name: 'Attendance & tracking', icon: <Clock className="w-4 h-4" />, order: 3 },
  communication: { name: 'Communication', icon: <MessageSquare className="w-4 h-4" />, order: 4 },
  finance: { name: 'Finance', icon: <Wallet className="w-4 h-4" />, order: 5 },
  scheduling: { name: 'Scheduling', icon: <Calendar className="w-4 h-4" />, order: 6 },
  other: { name: 'More', icon: <Sparkles className="w-4 h-4" />, order: 7 },
};

const naira = (amount: number) => `₦${Number(amount).toLocaleString()}`;

/** A service's price: the main figure, and a smaller second line if it has one. */
const priceOf = (service: AvailableService): { main: string; sub?: string } => {
  if (!service.is_add_on) return { main: 'Included' };
  if (service.price_per_message != null) {
    return { main: `${naira(service.price_per_message)} per SMS`, sub: 'billed as you send' };
  }
  return {
    main: `${naira(service.price_per_student)} / student / term`,
    sub: `${naira(service.price_per_student_per_session)} for a session`,
  };
};

const ServicesTab: React.FC<ServicesTabProps> = () => {
  const [services, setServices] = useState<AvailableService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingService, setTogglingService] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const availableServices = await tenantService.getAvailableServices();
      setServices(availableServices);
    } catch (err) {
      console.error('Error fetching services:', err);
      setError('Failed to load services. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleService = async (service: AvailableService) => {
    if (service.is_default) {
      toast.info(`${service.name} is always on`);
      return;
    }

    const blocker = missingRequirement(service, services);
    if (!service.is_enabled && blocker) {
      toast.info(`Switch on ${blocker.name} first. ${service.name} works with it.`);
      return;
    }

    setTogglingService(service.service);

    try {
      const result = await tenantService.toggleService(service.service, !service.is_enabled);

      setServices(prev => applyToggle(prev, result));

      toast.success(result.message);
    } catch (err: any) {
      console.error('Error toggling service:', err);
      toast.error(err.response?.data?.error || 'Failed to update service');
    } finally {
      setTogglingService(null);
    }
  };

  // The 'basic' row carries the package price; it is shown as the plan, not
  // as a service to switch.
  const basic = services.find(s => s.service === 'basic');
  const listed = services.filter(s => s.service !== 'basic');
  const includedCount = listed.filter(s => !s.is_add_on).length;
  const addOnsOn = listed.filter(s => s.is_add_on && s.is_enabled);
  const perStudentPerTerm = Number(basic?.price_per_student ?? 0) + addOnsOn
    .filter(s => s.price_per_message == null)
    .reduce((sum, s) => sum + Number(s.price_per_student), 0);
  const perMessageOn = addOnsOn.filter(s => s.price_per_message != null);

  const grouped = listed.reduce<Record<string, AvailableService[]>>((acc, service) => {
    const category = service.category || 'other';
    (acc[category] ||= []).push(service);
    return acc;
  }, {});
  const sortedCategories = Object.entries(grouped).sort(
    ([a], [b]) => (CATEGORIES[a]?.order ?? 99) - (CATEGORIES[b]?.order ?? 99)
  );

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-7 h-7 text-primary-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading services…</p>
        </div>
      </div>
    );
  }

  if (error && services.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            Services didn't load
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{error}</p>
          <button
            onClick={fetchServices}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Services</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
            Everything in the Basic package is one price per student, whichever of it you use.
            Add-ons are billed on top, only while they are switched on.
          </p>
        </div>
        <button
          onClick={fetchServices}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Plan */}
      <div className="grid grid-cols-1 md:grid-cols-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-5 border-l-4 border-primary-600">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
            Basic package
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
            {naira(basic?.price_per_student ?? 0)}
            <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">per student / term</span>
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {naira(basic?.price_per_student_per_session ?? 0)} for a session · {includedCount} services included
          </p>
        </div>

        <div className="p-5 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Add-ons switched on
          </p>
          {addOnsOn.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">None</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {addOnsOn.map(s => (
                <li key={s.service} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                  <span className="flex-shrink-0 text-slate-500 dark:text-slate-400">
                    {s.price_per_message != null
                      ? `${naira(s.price_per_message)} / SMS`
                      : `${naira(s.price_per_student)} / student`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-5 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            You pay per student, per term
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{naira(perStudentPerTerm)}</p>
          {perMessageOn.map(s => (
            <p key={s.service} className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              + {naira(s.price_per_message ?? 0)} for each SMS sent
            </p>
          ))}
        </div>
      </div>

      {/* Services by category */}
      {sortedCategories.map(([category, categoryServices]) => {
        const config = CATEGORIES[category] ?? CATEGORIES.other;
        const onCount = categoryServices.filter(s => s.is_enabled).length;

        return (
          <section key={category} aria-labelledby={`services-${category}`}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center">
                {config.icon}
              </span>
              <h4 id={`services-${category}`} className="text-sm font-semibold text-slate-900 dark:text-white">
                {config.name}
              </h4>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {onCount} of {categoryServices.length} on
              </span>
            </div>

            <ul className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {categoryServices.map(service => {
                const isToggling = togglingService === service.service;
                const price = priceOf(service);
                const blocker = missingRequirement(service, services);

                return (
                  <li key={service.service} className="flex items-center gap-4 px-4 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{service.name}</p>
                        {service.is_default && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            <Lock className="w-3 h-3" />
                            Always on
                          </span>
                        )}
                        {service.is_add_on && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                            Add-on
                          </span>
                        )}
                      </div>
                      {service.description && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{service.description}</p>
                      )}
                      {blocker && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                          <Lock className="w-3 h-3" />
                          Switch on {blocker.name} first: alerts are sent when a card is scanned at the gate.
                        </p>
                      )}
                      {service.is_add_on && (
                        <p className="sm:hidden mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                          {price.main}{price.sub && <span className="font-normal text-slate-500 dark:text-slate-400"> · {price.sub}</span>}
                        </p>
                      )}
                    </div>

                    <div className="hidden sm:block w-44 flex-shrink-0 text-right">
                      <p className={`text-xs ${
                        service.is_add_on
                          ? 'font-medium text-slate-700 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}>
                        {price.main}
                      </p>
                      {price.sub && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{price.sub}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={service.is_enabled}
                      aria-label={`${service.name}: ${service.is_enabled ? 'on' : 'off'}`}
                      onClick={() => handleToggleService(service)}
                      disabled={service.is_default || isToggling}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                        service.is_enabled ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
                      } ${service.is_default || blocker ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform flex items-center justify-center ${
                          service.is_enabled ? 'translate-x-5' : ''
                        }`}
                      >
                        {isToggling && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {category === 'communication' && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Emails to parents are free. Each SMS costs {naira(
                  categoryServices.find(s => s.price_per_message != null)?.price_per_message ?? 0
                )} and is added to your next invoice.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default ServicesTab;
