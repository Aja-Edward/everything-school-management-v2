import { useState, useEffect, useRef } from 'react';
import {
  Shield, Users, School, Key, CreditCard,
  LogOut, RefreshCw, AlertCircle, CheckCircle,
  Clock, XCircle, ChevronRight, Building2,
  PowerOff, Power, Trash2, Loader2, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  owner_name: string;
  status: string;
  is_active: boolean;
  created_at: string;
  custom_domain?: string | null;
}

interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalStudents: number;
}

type ConfirmAction = 'suspend' | 'activate' | 'delete';

interface ConfirmState {
  action: ConfirmAction;
  tenant: Tenant;
  reason: string;
  confirmName: string; // for delete: must type tenant name
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusBadge = (tenant: Tenant) => {
  if (!tenant.is_active)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
        <XCircle className="w-3 h-3" />Inactive
      </span>
    );
  if (tenant.status === 'active')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-900 text-white rounded-full">
        <CheckCircle className="w-3 h-3" />Active
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-full">
      <Clock className="w-3 h-3" />{tenant.status}
    </span>
  );
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── Confirmation Modal ───────────────────────────────────────────────────────

interface ConfirmModalProps {
  state: ConfirmState;
  processing: boolean;
  onChange: (patch: Partial<ConfirmState>) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const ConfirmModal = ({ state, processing, onChange, onConfirm, onClose }: ConfirmModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const isDelete   = state.action === 'delete';
  const isSuspend  = state.action === 'suspend';
  const isActivate = state.action === 'activate';

  const deleteReady = !isDelete || state.confirmName === state.tenant.name;

  const title = isDelete
    ? 'Delete school'
    : isSuspend
    ? 'Deactivate school'
    : 'Activate school';

  const description = isDelete
    ? 'This will permanently remove the school and all its data. This action cannot be undone.'
    : isSuspend
    ? 'The school and its users will lose access to the platform immediately.'
    : 'The school will regain full access to the platform.';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            {isDelete ? (
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-white" />
              </div>
            ) : isSuspend ? (
              <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center shrink-0">
                <PowerOff className="w-4 h-4 text-gray-700" />
              </div>
            ) : (
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center shrink-0">
                <Power className="w-4 h-4 text-white" />
              </div>
            )}
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* School name tag */}
          <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-gray-600">
                {state.tenant.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{state.tenant.name}</p>
              <p className="text-xs text-gray-500 truncate">{state.tenant.owner_email}</p>
            </div>
          </div>

          <p className="text-sm text-gray-600">{description}</p>

          {/* Reason input for suspend */}
          {isSuspend && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Reason <span className="font-normal text-gray-400 normal-case">(optional)</span>
              </label>
              <textarea
                ref={inputRef as any}
                value={state.reason}
                onChange={(e) => onChange({ reason: e.target.value })}
                placeholder="e.g. Non-payment of subscription fees"
                rows={2}
                disabled={processing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none disabled:opacity-50"
              />
            </div>
          )}

          {/* Name confirmation for delete */}
          {isDelete && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Type <span className="font-mono text-gray-800">{state.tenant.name}</span> to confirm
              </label>
              <input
                ref={inputRef}
                type="text"
                value={state.confirmName}
                onChange={(e) => onChange({ confirmName: e.target.value })}
                placeholder={state.tenant.name}
                disabled={processing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black disabled:opacity-50"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-2.5 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={processing || !deleteReady}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isDelete
                ? 'bg-gray-900 hover:bg-black text-white'
                : isSuspend
                ? 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                : 'bg-black hover:bg-gray-800 text-white'
            }`}
          >
            {processing ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Working…</>
            ) : isDelete ? (
              <><Trash2 className="w-4 h-4" />Delete permanently</>
            ) : isSuspend ? (
              <><PowerOff className="w-4 h-4" />Deactivate</>
            ) : (
              <><Power className="w-4 h-4" />Activate</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [tenants, setTenants]       = useState<Tenant[]>([]);
  const [stats, setStats]           = useState<PlatformStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Per-row action state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm]             = useState<ConfirmState | null>(null);
  const [processing, setProcessing]       = useState(false);
  const [actionError, setActionError]     = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [tenantsRes, usersRes, studentsRes] = await Promise.allSettled([
        api.get('/api/tenants/list/'),
        api.get('/api/users/users/'),
        api.get('/api/students/students/'),
      ]);

      const rawTenants = tenantsRes.status === 'fulfilled' ? tenantsRes.value : null;
      const tenantList: Tenant[] = Array.isArray(rawTenants)
        ? rawTenants
        : (rawTenants as any)?.results ?? [];
      setTenants(tenantList);

      const cnt = (r: PromiseSettledResult<any>) => {
        if (r.status !== 'fulfilled' || !r.value) return 0;
        const v = r.value;
        return Array.isArray(v) ? v.length : v.count ?? v.results?.length ?? 0;
      };

      setStats({
        totalTenants:  tenantList.length,
        activeTenants: tenantList.filter(t => t.is_active && t.status === 'active').length,
        totalUsers:    cnt(usersRes),
        totalStudents: cnt(studentsRes),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ── Tenant actions ──────────────────────────────────────────────────────────

  const openConfirm = (action: ConfirmAction, tenant: Tenant) => {
    setActionError(null);
    setConfirm({ action, tenant, reason: '', confirmName: '' });
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    const { action, tenant, reason } = confirm;

    setProcessing(true);
    setActionError(null);

    try {
      if (action === 'activate') {
        await api.post(`/api/tenants/list/${tenant.id}/activate/`, {});
      } else if (action === 'suspend') {
        await api.post(`/api/tenants/list/${tenant.id}/suspend/`, { reason });
      } else if (action === 'delete') {
        await api.delete(`/api/tenants/list/${tenant.id}/`);
      }

      setConfirm(null);
      await loadData(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        'Action failed. Please try again.';
      setActionError(msg);
    } finally {
      setProcessing(false);
    }
  };

  // ── Logout ──────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); } catch {}
    navigate('/platform-admin/login', { replace: true });
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const statCards = [
    { label: 'Total Tenants',  value: stats?.totalTenants,  icon: Building2 },
    { label: 'Active Schools', value: stats?.activeTenants, icon: School    },
    { label: 'Total Users',    value: stats?.totalUsers,    icon: Users     },
    { label: 'Students',       value: stats?.totalStudents, icon: Users     },
  ];

  const quickActions = [
    {
      label: 'Token Generator',
      desc: 'Generate and manage result access tokens for all schools',
      icon: Key,
      href: '/admin/token-generator',
    },
    {
      label: 'Pending Payments',
      desc: 'Review and approve bank transfer payment verifications',
      icon: CreditCard,
      href: '/platform-admin/pending-payments',
    },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="bg-black sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-black" />
            </div>
            <span className="text-white font-bold text-sm tracking-wide hidden sm:block">
              Platform Admin
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <div className="hidden sm:flex items-center gap-2 text-white/70 text-xs">
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">
                  {(user?.first_name?.[0] || user?.username?.[0] || 'A').toUpperCase()}
                </span>
              </div>
              <span>{user?.first_name || user?.username || 'Admin'}</span>
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:block">{loggingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* ── Heading ───────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Platform Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Nuventa Cloud — School Management System</p>
        </div>

        {/* ── Global error ──────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
            <div>
              <p>{error}</p>
              <button onClick={() => loadData()} className="text-xs underline mt-1 text-gray-500 hover:text-gray-800">
                Retry
              </button>
            </div>
          </div>
        )}

        {/* ── Action error ──────────────────────────────────────────────────── */}
        {actionError && (
          <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
            <div className="flex-1">
              <p>{actionError}</p>
            </div>
            <button onClick={() => setActionError(null)} className="text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-gray-700" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                {loading
                  ? <span className="inline-block w-10 h-7 bg-gray-100 rounded animate-pulse" />
                  : (value ?? 0).toLocaleString()
                }
              </p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {quickActions.map(({ label, desc, icon: Icon, href }) => (
              <button
                key={label}
                onClick={() => navigate(href)}
                className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 text-left hover:border-gray-400 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700 shrink-0 mt-0.5 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Tenants ───────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Registered Schools ({loading ? '…' : tenants.length})
          </h2>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

            {/* Loading skeleton */}
            {loading ? (
              <div className="divide-y divide-gray-100">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-gray-100 rounded w-48 animate-pulse" />
                      <div className="h-3 bg-gray-100 rounded w-32 animate-pulse" />
                    </div>
                    <div className="h-5 bg-gray-100 rounded-full w-16 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : tenants.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No schools registered yet</p>
              </div>
            ) : (
              <>
                {/* ── Desktop table ── */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['School', 'Owner', 'Domain', 'Status', 'Registered', 'Actions'].map(h => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tenants.map((t) => {
                        const busy = !!actionLoading[t.id];
                        const isActive = t.is_active && t.status === 'active';
                        return (
                          <tr key={t.id} className="hover:bg-gray-50 transition-colors">

                            {/* School */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 bg-gray-100 rounded-md flex items-center justify-center shrink-0">
                                  <span className="text-[11px] font-bold text-gray-600">
                                    {t.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900 leading-tight">{t.name}</p>
                                  <p className="text-xs text-gray-400 font-mono">{t.slug}</p>
                                </div>
                              </div>
                            </td>

                            {/* Owner */}
                            <td className="px-5 py-3.5">
                              <p className="text-gray-700">{t.owner_name || '—'}</p>
                              <p className="text-xs text-gray-400">{t.owner_email}</p>
                            </td>

                            {/* Domain */}
                            <td className="px-5 py-3.5 text-gray-500 text-xs font-mono">
                              {t.custom_domain || `${t.slug}.nuventacloud.com`}
                            </td>

                            {/* Status */}
                            <td className="px-5 py-3.5">{statusBadge(t)}</td>

                            {/* Registered */}
                            <td className="px-5 py-3.5 text-gray-500 text-xs">{fmt(t.created_at)}</td>

                            {/* Actions */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                {/* Deactivate / Activate */}
                                {isActive ? (
                                  <button
                                    onClick={() => openConfirm('suspend', t)}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                                    title="Deactivate"
                                  >
                                    <PowerOff className="w-3.5 h-3.5" />
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => openConfirm('activate', t)}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-40"
                                    title="Activate"
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                    Activate
                                  </button>
                                )}

                                {/* Delete */}
                                <button
                                  onClick={() => openConfirm('delete', t)}
                                  disabled={busy}
                                  className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
                                  title="Delete school"
                                >
                                  {busy
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Trash2 className="w-3.5 h-3.5" />
                                  }
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Mobile cards ── */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {tenants.map((t) => {
                    const busy = !!actionLoading[t.id];
                    const isActive = t.is_active && t.status === 'active';
                    return (
                      <div key={t.id} className="px-4 py-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 bg-gray-100 rounded-md flex items-center justify-center shrink-0">
                              <span className="text-[11px] font-bold text-gray-600">
                                {t.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <p className="font-semibold text-gray-900 text-sm truncate">{t.name}</p>
                          </div>
                          {statusBadge(t)}
                        </div>
                        <p className="text-xs text-gray-500 pl-9">{t.owner_email}</p>
                        <p className="text-xs text-gray-400 pl-9 font-mono">{fmt(t.created_at)}</p>

                        {/* Mobile action buttons */}
                        <div className="flex items-center gap-2 pl-9">
                          {isActive ? (
                            <button
                              onClick={() => openConfirm('suspend', t)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                            >
                              <PowerOff className="w-3 h-3" />Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => openConfirm('activate', t)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-40"
                            >
                              <Power className="w-3 h-3" />Activate
                            </button>
                          )}
                          <button
                            onClick={() => openConfirm('delete', t)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <p className="text-xs text-gray-400 text-center pb-4">
          Nuventa Cloud Platform · v2.0 ·{' '}
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-gray-400" />
            All systems operational
          </span>
        </p>
      </main>

      {/* ── Confirmation modal ───────────────────────────────────────────────── */}
      {confirm && (
        <ConfirmModal
          state={confirm}
          processing={processing}
          onChange={(patch) => setConfirm((c) => c ? { ...c, ...patch } : c)}
          onConfirm={handleConfirm}
          onClose={() => { if (!processing) { setConfirm(null); setActionError(null); } }}
        />
      )}
    </div>
  );
};

export default SuperAdminDashboard;
