import React, { useState, useEffect } from 'react';
import {
  Check,
  X,
  Loader2,
  RefreshCw,
  Shield,
  BookOpen,
  Clock,
  MessageSquare,
  Wallet,
  Calendar,
  Sparkles,
  Info
} from 'lucide-react';
import { tenantService, AvailableService } from '@/services/TenantService';
import { toast } from 'react-toastify';

interface ServicesTabProps {
  settings?: any;
  onSettingsUpdate?: (settings: any) => void;
}

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
      toast.info(`${service.name} is a core service and cannot be disabled`);
      return;
    }

    setTogglingService(service.service);

    try {
      const result = await tenantService.toggleService(service.service, !service.is_enabled);

      setServices(prev =>
        prev.map(s =>
          s.service === service.service
            ? { ...s, is_enabled: result.is_enabled }
            : s
        )
      );

      toast.success(result.message);
    } catch (err: any) {
      console.error('Error toggling service:', err);
      toast.error(err.response?.data?.error || 'Failed to update service');
    } finally {
      setTogglingService(null);
    }
  };

  const enabledCount = services.filter(s => s.is_enabled).length;
  const totalCost = services
    .filter(s => s.is_enabled)
    .reduce((sum, s) => sum + Number(s.price_per_student), 0);

  // Group services by category
  const groupedServices = services.reduce<Record<string, AvailableService[]>>((acc, service) => {
    const category = service.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(service);
    return acc;
  }, {});

  // Category configuration with icons and order
  const categoryConfig: { [key: string]: { name: string; icon: React.ReactNode; order: number; color: string } } = {
    core: { name: 'Core Services', icon: <Shield className="w-4 h-4" />, order: 1, color: 'from-blue-500 to-indigo-600' },
    assessment: { name: 'Assessment & Grades', icon: <BookOpen className="w-4 h-4" />, order: 2, color: 'from-purple-500 to-pink-600' },
    attendance: { name: 'Attendance & Tracking', icon: <Clock className="w-4 h-4" />, order: 3, color: 'from-green-500 to-teal-600' },
    communication: { name: 'Communication', icon: <MessageSquare className="w-4 h-4" />, order: 4, color: 'from-orange-500 to-red-600' },
    finance: { name: 'Finance & Billing', icon: <Wallet className="w-4 h-4" />, order: 5, color: 'from-emerald-500 to-cyan-600' },
    scheduling: { name: 'Scheduling', icon: <Calendar className="w-4 h-4" />, order: 6, color: 'from-violet-500 to-purple-600' },
    other: { name: 'Additional Services', icon: <Sparkles className="w-4 h-4" />, order: 7, color: 'from-gray-500 to-slate-600' },
  };

  // Sort categories by order
  const sortedCategories = Object.entries(groupedServices).sort(([a], [b]) => {
    const orderA = categoryConfig[a]?.order || 99;
    const orderB = categoryConfig[b]?.order || 99;
    return orderA - orderB;
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading services...</p>
        </div>
      </div>
    );
  }

  if (error && services.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Failed to Load Services
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {error}
          </p>
          <button
            onClick={fetchServices}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header with Summary */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">Service Management</h3>
            <p className="text-blue-100 text-sm">
              Enable or disable services for your school. Core services cannot be disabled.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">₦{totalCost.toLocaleString()}</p>
            <p className="text-blue-100 text-sm">/student per term</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
          <span className="text-sm text-blue-100">
            {enabledCount} of {services.length} services enabled
          </span>
          <button
            onClick={fetchServices}
            className="text-sm text-white/80 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Info Note */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> Services marked as "Core" are essential for basic school operations and cannot be disabled.
            Optional services can be toggled on or off based on your school's needs.
          </p>
        </div>
      </div>

      {/* Services by Category */}
      {sortedCategories.map(([category, categoryServices]) => (
        <div key={category} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-10 h-10 bg-gradient-to-br ${categoryConfig[category]?.color || 'from-gray-500 to-slate-600'} rounded-xl flex items-center justify-center text-white`}>
              {categoryConfig[category]?.icon}
            </div>
            <div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                {categoryConfig[category]?.name || category}
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {categoryServices.filter(s => s.is_enabled).length} of {categoryServices.length} enabled
              </p>
            </div>
            {category === 'core' && (
              <span className="ml-auto text-xs font-medium px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                Always Included
              </span>
            )}
          </div>

          <div className="space-y-3">
            {categoryServices.map(service => {
              const isToggling = togglingService === service.service;

              return (
                <div
                  key={service.service}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                    service.is_enabled
                      ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <h5 className="text-sm font-medium text-slate-900 dark:text-white">
                        {service.name}
                      </h5>
                      {service.is_default && (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-800 dark:bg-slate-600 text-white rounded-full">
                          Core
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                      {service.description}
                    </p>
                    <p className={`text-xs font-medium mt-1.5 ${
                      service.is_enabled
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-500'
                    }`}>
                      {Number(service.price_per_student) === 0
                        ? 'Free'
                        : `₦${Number(service.price_per_student).toLocaleString()}/student/term`}
                    </p>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => handleToggleService(service)}
                    disabled={service.is_default || isToggling}
                    className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors ${
                      service.is_enabled
                        ? 'bg-blue-600'
                        : 'bg-slate-300 dark:bg-slate-600'
                    } ${service.is_default ? 'cursor-not-allowed opacity-60' : 'hover:opacity-90'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform flex items-center justify-center ${
                        service.is_enabled ? 'translate-x-5' : ''
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />
                      ) : service.is_enabled ? (
                        <Check className="w-3 h-3 text-blue-600" />
                      ) : (
                        <X className="w-3 h-3 text-slate-400" />
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bottom Summary */}
      <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Total per-student cost
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Billed based on enrolled students each term
          </p>
        </div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">
          ₦{totalCost.toLocaleString()}
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/term</span>
        </p>
      </div>
    </div>
  );
};

export default ServicesTab;
