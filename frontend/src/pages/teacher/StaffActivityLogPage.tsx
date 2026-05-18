import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, CheckCircle, XCircle, Clock, ClipboardList,
  Calendar, ChevronDown, Save, Trash2, Eye, RefreshCw, AlertCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StaffActivitiesService, {
  StaffActivityCategory, StaffActivityLog,
  CreateActivityLogPayload, ActivityStatus, FieldDefinition,
} from '@/services/StaffActivitiesService';

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ActivityStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending Review', color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  approved: { label: 'Approved',       color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  rejected: { label: 'Rejected',       color: 'bg-red-100 text-red-700 border-red-200',         icon: XCircle },
};

function StatusBadge({ status }: { status: ActivityStatus }) {
  const cfg = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Dynamic form field ───────────────────────────────────────────────────────

function DynamicField({ def, value, onChange }: {
  def: FieldDefinition;
  value: string | number | undefined;
  onChange: (key: string, val: string | number) => void;
}) {
  const base = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none";

  if (def.type === 'textarea') return (
    <textarea rows={3}
      value={String(value ?? '')}
      onChange={e => onChange(def.key, e.target.value)}
      placeholder={def.label}
      className={`${base} resize-none`}
    />
  );

  if (def.type === 'select' && def.options) return (
    <select value={String(value ?? '')} onChange={e => onChange(def.key, e.target.value)} className={base}>
      <option value="">— Select {def.label} —</option>
      {def.options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <input
      type={def.type === 'number' ? 'number' : def.type === 'time' ? 'time' : 'text'}
      value={String(value ?? '')}
      onChange={e => onChange(def.key, def.type === 'number' ? Number(e.target.value) : e.target.value)}
      placeholder={def.label}
      className={base}
    />
  );
}

// ─── Log Form ─────────────────────────────────────────────────────────────────

function LogForm({ categories, editLog, onSaved, onCancel }: {
  categories: StaffActivityCategory[];
  editLog: StaffActivityLog | null;
  onSaved: (log: StaffActivityLog) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState<CreateActivityLogPayload>({
    category: editLog?.category ?? (categories[0]?.id ?? 0),
    activity_date: editLog?.activity_date ?? today,
    start_time: editLog?.start_time ?? '',
    end_time: editLog?.end_time ?? '',
    title: editLog?.title ?? '',
    description: editLog?.description ?? '',
    details: editLog?.details ?? {},
  });
  const [saving, setSaving] = useState(false);

  const selectedCat = categories.find(c => c.id === form.category);

  const setDetail = (key: string, val: string | number) =>
    setForm(f => ({ ...f, details: { ...f.details, [key]: val } }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category) { toast.error('Please select an activity type'); return; }
    if (!form.title.trim()) { toast.error('Please enter a title for this activity'); return; }
    setSaving(true);
    try {
      let saved: StaffActivityLog;
      if (editLog) {
        saved = await StaffActivitiesService.updateLog(editLog.id, form);
        toast.success('Activity log updated');
      } else {
        saved = await StaffActivitiesService.createLog(form);
        toast.success('Activity log submitted for review');
      }
      onSaved(saved);
    } catch (e: any) {
      const msg = e?.response?.data
        ? Object.values(e.response.data).flat().join(' ')
        : (e?.message || 'Failed to save');
      toast.error(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-bold text-slate-900">{editLog ? 'Edit Activity Log' : 'Record New Activity'}</h2>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Activity Type *</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: Number(e.target.value), details: {} }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none"
              required
            >
              <option value={0}>— Select activity type —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            {selectedCat?.description && (
              <p className="mt-1 text-xs text-slate-500">{selectedCat.description}</p>
            )}
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input type="date" value={form.activity_date}
                onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start</label>
              <input type="time" value={form.start_time ?? ''}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End</label>
              <input type="time" value={form.end_time ?? ''}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Activity Title *</label>
            <input type="text" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Morning school run — Jikwoyi route"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none"
              required />
          </div>

          {/* Dynamic fields for selected category */}
          {selectedCat?.fields_config?.map(def => (
            <div key={def.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {def.label} {def.required && <span className="text-red-500">*</span>}
              </label>
              <DynamicField
                def={def}
                value={form.details?.[def.key]}
                onChange={setDetail}
              />
            </div>
          ))}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Additional Notes</label>
            <textarea rows={2} value={form.description ?? ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Any extra notes or observations…"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none resize-none" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={onCancel}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-slate-700 text-sm font-medium hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : editLog ? 'Update Log' : 'Submit Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function LogDetail({ log, onClose }: { log: StaffActivityLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-900">{log.title}</h2>
            <p className="text-sm text-slate-500">{log.category_icon} {log.category_name} · {formatDate(log.activity_date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={log.status} />
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {log.start_time && (
            <p className="text-sm text-slate-600">
              <span className="font-medium">Time:</span> {log.start_time}{log.end_time ? ` – ${log.end_time}` : ''}
              {log.duration_minutes ? ` (${log.duration_minutes} min)` : ''}
            </p>
          )}
          {Object.keys(log.details || {}).length > 0 && (
            <div className="bg-slate-50 rounded-xl overflow-hidden">
              {(log.category_fields_config || []).map(f => {
                const val = log.details?.[f.key];
                if (!val && val !== 0) return null;
                return (
                  <div key={f.key} className="flex gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 text-sm">
                    <span className="text-slate-500 w-36 flex-shrink-0">{f.label}</span>
                    <span className="font-medium text-slate-900">{String(val)}</span>
                  </div>
                );
              })}
            </div>
          )}
          {log.description && <p className="text-sm text-slate-700 whitespace-pre-line">{log.description}</p>}
          {log.admin_note && (
            <div className={`rounded-xl p-4 text-sm ${log.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              <p className="font-semibold mb-1">Admin Feedback</p>
              <p>{log.admin_note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const StaffActivityLogPage: React.FC = () => {
  const [logs, setLogs] = useState<StaffActivityLog[]>([]);
  const [categories, setCategories] = useState<StaffActivityCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editLog, setEditLog] = useState<StaffActivityLog | null>(null);
  const [viewLog, setViewLog] = useState<StaffActivityLog | null>(null);
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | 'all'>('all');
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsData, catsData] = await Promise.all([
        StaffActivitiesService.getLogs(),
        StaffActivitiesService.getCategories({ is_active: true }),
      ]);
      setLogs(Array.isArray(logsData) ? logsData : (logsData as any).results || []);
      setCategories(Array.isArray(catsData) ? catsData : (catsData as any).results || []);
    } catch { toast.error('Failed to load activity logs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaved = (log: StaffActivityLog) => {
    setLogs(prev => {
      const idx = prev.findIndex(l => l.id === log.id);
      return idx >= 0 ? prev.map(l => l.id === log.id ? log : l) : [log, ...prev];
    });
    setShowForm(false);
    setEditLog(null);
  };

  const handleDelete = async (log: StaffActivityLog) => {
    if (!confirm(`Delete this activity log: "${log.title}"?`)) return;
    setDeleting(log.id);
    try {
      await StaffActivitiesService.deleteLog(log.id);
      setLogs(prev => prev.filter(l => l.id !== log.id));
      toast.success('Log deleted');
    } catch { toast.error('Failed to delete log'); }
    finally { setDeleting(null); }
  };

  const filtered = useMemo(() =>
    filterStatus === 'all' ? logs : logs.filter(l => l.status === filterStatus),
    [logs, filterStatus]
  );

  const counts = useMemo(() => ({
    pending: logs.filter(l => l.status === 'pending').length,
    approved: logs.filter(l => l.status === 'approved').length,
    rejected: logs.filter(l => l.status === 'rejected').length,
  }), [logs]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-violet-600" /> My Activity Log
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Record and track your daily activities</p>
        </div>
        <button
          onClick={() => { setEditLog(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700"
        >
          <Plus className="w-4 h-4" /> Log Activity
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending', count: counts.pending, status: 'pending' as ActivityStatus, color: 'border-amber-200 bg-amber-50', text: 'text-amber-700' },
          { label: 'Approved', count: counts.approved, status: 'approved' as ActivityStatus, color: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
          { label: 'Rejected', count: counts.rejected, status: 'rejected' as ActivityStatus, color: 'border-red-200 bg-red-50', text: 'text-red-700' },
        ].map(({ label, count, status, color, text }) => (
          <button
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
            className={`p-3 rounded-xl border text-center transition-all ${color} ${filterStatus === status ? 'ring-2 ring-offset-1 ring-violet-400' : ''}`}
          >
            <p className={`text-2xl font-bold ${text}`}>{count}</p>
            <p className={`text-xs font-medium ${text}`}>{label}</p>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No activity logs yet</p>
          <p className="text-slate-400 text-sm mt-1">Tap "Log Activity" above to record your first entry.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(log => (
            <div key={log.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4">
              <div className="text-2xl flex-shrink-0 mt-0.5">{log.category_icon || '📋'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900 text-sm">{log.title}</p>
                  <StatusBadge status={log.status} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {log.category_name} · {formatDate(log.activity_date)}
                  {log.start_time && ` · ${log.start_time}${log.end_time ? ` – ${log.end_time}` : ''}`}
                </p>
                {log.status === 'rejected' && log.admin_note && (
                  <p className="mt-1.5 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                    <AlertCircle className="inline w-3 h-3 mr-1" />
                    {log.admin_note}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setViewLog(log)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="View">
                  <Eye className="w-4 h-4" />
                </button>
                {log.status === 'pending' && (
                  <>
                    <button onClick={() => { setEditLog(log); setShowForm(true); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                      <Calendar className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(log)}
                      disabled={deleting === log.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <LogForm
          categories={categories}
          editLog={editLog}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditLog(null); }}
        />
      )}
      {viewLog && <LogDetail log={viewLog} onClose={() => setViewLog(null)} />}
    </div>
  );
};

export default StaffActivityLogPage;
