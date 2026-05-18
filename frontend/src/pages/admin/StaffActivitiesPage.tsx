import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList, CheckCircle, XCircle, Clock, Eye, Trash2,
  Search, RefreshCw, ChevronDown, BarChart2, Settings,
  Plus, X, Save, AlertCircle, Car, Wrench, Megaphone,
  Shield, Baby, Layers, Filter,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StaffActivitiesService, {
  StaffActivityLog, StaffActivityCategory, ActivityStatus, ActivitySummary,
} from '@/services/StaffActivitiesService';

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ActivityStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200',         icon: XCircle },
};

function StatusBadge({ status }: { status: ActivityStatus }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

const ICON_MAP: Record<string, React.ElementType> = {
  '🚌': Car, '🔧': Wrench, '📣': Megaphone,
  '🧹': Layers, '👶': Baby, '🔒': Shield,
  '📋': ClipboardList,
};

function CategoryIcon({ icon, className = '' }: { icon: string; className?: string }) {
  return <span className={`text-xl ${className}`}>{icon || '📋'}</span>;
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function LogDetailModal({ log, onClose, onReview }: {
  log: StaffActivityLog;
  onClose: () => void;
  onReview: (action: 'approve' | 'reject', note: string) => void;
}) {
  const [note, setNote] = useState(log.admin_note || '');
  const [loading, setLoading] = useState(false);

  const handleReview = async (action: 'approve' | 'reject') => {
    setLoading(true);
    try { await onReview(action, note); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-slate-900">{log.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              <CategoryIcon icon={log.category_icon} /> {log.category_name} · {formatDate(log.activity_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={log.status} />
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Staff info */}
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Staff</span><p className="font-medium">{log.staff_name}</p></div>
            <div><span className="text-slate-500">Employee ID</span><p className="font-medium">{log.staff_employee_id}</p></div>
            <div><span className="text-slate-500">Type</span><p className="font-medium capitalize">{log.staff_type}</p></div>
            <div><span className="text-slate-500">Date</span><p className="font-medium">{formatDate(log.activity_date)}</p></div>
            {log.start_time && <div><span className="text-slate-500">Start</span><p className="font-medium">{log.start_time}</p></div>}
            {log.end_time && <div><span className="text-slate-500">End</span><p className="font-medium">{log.end_time}</p></div>}
            {log.duration_minutes != null && (
              <div><span className="text-slate-500">Duration</span><p className="font-medium">{log.duration_minutes} min</p></div>
            )}
          </div>

          {/* Description */}
          {log.description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Description</h3>
              <p className="text-sm text-slate-700 whitespace-pre-line">{log.description}</p>
            </div>
          )}

          {/* Dynamic details */}
          {Object.keys(log.details || {}).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Activity Details</h3>
              <div className="bg-slate-50 rounded-xl overflow-hidden">
                {(log.category_fields_config || []).map(f => {
                  const val = log.details?.[f.key];
                  if (!val && val !== 0) return null;
                  return (
                    <div key={f.key} className="flex items-start gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
                      <span className="text-slate-500 text-sm w-40 flex-shrink-0">{f.label}</span>
                      <span className="text-slate-900 text-sm font-medium">{String(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review section */}
          {log.status === 'pending' && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Review this log</h3>
              <textarea
                placeholder="Optional note for the staff member…"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-violet-400 outline-none"
                rows={2}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => handleReview('approve')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={() => handleReview('reject')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          )}

          {/* Previous review note */}
          {log.status !== 'pending' && log.admin_note && (
            <div className={`rounded-xl p-4 text-sm ${log.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              <p className="font-semibold mb-1">Admin Note</p>
              <p>{log.admin_note}</p>
              {log.reviewed_by_name && <p className="text-xs mt-1 opacity-70">— {log.reviewed_by_name}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Category Manager ─────────────────────────────────────────────────────────

function CategoryManager({ onClose }: { onClose: () => void }) {
  const [categories, setCategories] = useState<StaffActivityCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await StaffActivitiesService.getCategories();
      setCategories(Array.isArray(data) ? data : (data as any).results || []);
    } catch { toast.error('Failed to load categories'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await StaffActivitiesService.seedDefaultCategories();
      toast.success(res.message);
      load();
    } catch (e: any) { toast.error(e?.message || 'Seed failed'); }
    finally { setSeeding(false); }
  };

  const toggleActive = async (cat: StaffActivityCategory) => {
    try {
      await StaffActivitiesService.updateCategory(cat.id, { is_active: !cat.is_active });
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !c.is_active } : c));
    } catch { toast.error('Update failed'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-bold text-slate-900">Activity Categories</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleSeedDefaults} disabled={seeding}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" /> {seeding ? 'Seeding…' : 'Seed Defaults'}
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id} className={`flex items-center gap-3 p-3 rounded-xl border ${cat.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <span className="text-2xl">{cat.icon || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">{cat.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{cat.applicable_to_display}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{cat.log_count} logs</span>
                      {cat.is_system_default && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Default</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleActive(cat)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                      cat.is_active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {cat.is_active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <ClipboardList className="w-10 h-10 mx-auto mb-3" />
                  <p>No categories yet. Click "Seed Defaults" to add the built-in ones.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const StaffActivitiesPage: React.FC = () => {
  const [logs, setLogs] = useState<StaffActivityLog[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | 'all'>('all');
  const [filterDate, setFilterDate] = useState('');

  const [detailLog, setDetailLog] = useState<StaffActivityLog | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [logsData, summaryData] = await Promise.all([
        StaffActivitiesService.getLogs(),
        StaffActivitiesService.getSummary(),
      ]);
      setLogs(Array.isArray(logsData) ? logsData : (logsData as any).results || []);
      setSummary(summaryData);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load activity logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReview = async (logId: number, action: 'approve' | 'reject', note: string) => {
    try {
      const updated = await StaffActivitiesService.reviewLog(logId, action, note);
      setLogs(prev => prev.map(l => l.id === logId ? updated : l));
      if (detailLog?.id === logId) setDetailLog(updated);
      toast.success(`Log ${action === 'approve' ? 'approved' : 'rejected'}`);
    } catch (e: any) { toast.error(e?.message || 'Review failed'); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(l => {
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      if (filterDate && l.activity_date !== filterDate) return false;
      if (q && !l.staff_name.toLowerCase().includes(q) &&
          !l.title.toLowerCase().includes(q) &&
          !l.category_name.toLowerCase().includes(q) &&
          !l.staff_employee_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, filterStatus, filterDate, search]);

  const counts = useMemo(() => ({
    pending: logs.filter(l => l.status === 'pending').length,
    approved: logs.filter(l => l.status === 'approved').length,
    rejected: logs.filter(l => l.status === 'rejected').length,
  }), [logs]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600">Loading staff activities…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff Activity Logs</h1>
            <p className="text-slate-500 text-sm mt-1">Track and review daily activities reported by non-teaching staff</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCategories(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-white">
              <Settings className="w-4 h-4" /> Categories
            </button>
            <button onClick={() => loadData(true)} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-white disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Logs', value: summary?.total ?? logs.length, color: 'bg-slate-600', icon: ClipboardList },
            { label: 'Pending Review', value: counts.pending, color: 'bg-amber-500', icon: Clock },
            { label: 'Approved', value: counts.approved, color: 'bg-emerald-500', icon: CheckCircle },
            { label: 'Rejected', value: counts.rejected, color: 'bg-red-500', icon: XCircle },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Top categories */}
        {summary && summary.by_category.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Activity Breakdown by Category
            </h2>
            <div className="flex flex-wrap gap-2">
              {summary.by_category.map(cat => (
                <div key={cat.category__name} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
                  <span>{cat.category__icon}</span>
                  <span className="text-sm text-slate-700">{cat.category__name}</span>
                  <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search staff, title, category…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
          {(search || filterStatus !== 'all' || filterDate) && (
            <button onClick={() => { setSearch(''); setFilterStatus('all'); setFilterDate(''); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-slate-50">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Activity Logs <span className="text-slate-400 font-normal">({filtered.length})</span>
            </h2>
          </div>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No activity logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Staff', 'Category', 'Title', 'Date', 'Time', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{log.staff_name}</p>
                        <p className="text-xs text-slate-400">{log.staff_employee_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span>{log.category_icon}</span> {log.category_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="truncate text-slate-700">{log.title}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(log.activity_date)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {log.start_time ? `${log.start_time}${log.end_time ? ` – ${log.end_time}` : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailLog(log)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="View details">
                            <Eye className="w-4 h-4" />
                          </button>
                          {log.status === 'pending' && (
                            <>
                              <button onClick={() => handleReview(log.id, 'approve', '')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" title="Quick approve">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleReview(log.id, 'reject', '')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Quick reject">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailLog && (
        <LogDetailModal
          log={detailLog}
          onClose={() => setDetailLog(null)}
          onReview={async (action, note) => {
            await handleReview(detailLog.id, action, note);
            setDetailLog(null);
          }}
        />
      )}

      {showCategories && <CategoryManager onClose={() => setShowCategories(false)} />}
    </div>
  );
};

export default StaffActivitiesPage;
