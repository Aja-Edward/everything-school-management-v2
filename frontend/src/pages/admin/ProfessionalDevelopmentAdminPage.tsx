import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BookOpen, CheckCircle, XCircle, Clock, Eye, Download,
  Search, RefreshCw, X, Users, Award, FileText, AlertCircle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import PerformanceService, {
  ProfessionalDevelopment, PDApprovalStatus,
} from '@/services/PerformanceService';
import api from '@/services/api';

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<PDApprovalStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200',         icon: XCircle },
};

const TYPE_COLORS: Record<string, string> = {
  training:      'bg-blue-100 text-blue-700',
  workshop:      'bg-violet-100 text-violet-700',
  certification: 'bg-emerald-100 text-emerald-700',
  seminar:       'bg-amber-100 text-amber-700',
  conference:    'bg-orange-100 text-orange-700',
  course:        'bg-cyan-100 text-cyan-700',
  degree:        'bg-pink-100 text-pink-700',
  other:         'bg-slate-100 text-slate-600',
};

function StatusBadge({ status }: { status: PDApprovalStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

function ReviewModal({ record, onClose, onReviewed }: {
  record: ProfessionalDevelopment;
  onClose: () => void;
  onReviewed: (r: ProfessionalDevelopment) => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReview = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !reason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setSaving(true);
    try {
      const updated = await PerformanceService.reviewPDRecord(record.id, action, reason);
      toast.success(action === 'approve' ? 'Record approved ✓' : 'Record rejected');
      onReviewed(updated);
      onClose();
    } catch (e: any) { toast.error(e?.message || 'Action failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-900">{record.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {record.teacher_name} · {record.teacher_employee_id} · {record.dev_type_display}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={record.approval_status} />
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Record details */}
          <div className="bg-slate-50 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {[
              ['Provider', record.provider || '—'],
              ['Date Completed', fmtDate(record.date_completed)],
              ['Expiry Date', record.date_expires ? fmtDate(record.date_expires) : '—'],
              ['Duration', record.duration_hours ? `${record.duration_hours} hrs` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-500 font-medium">{k}</span>
                <span className="text-slate-900">{v}</span>
              </div>
            ))}
          </div>

          {record.description && (
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-line">{record.description}</div>
          )}

          {record.certificate_url && (
            <a href={record.certificate_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
              <FileText className="w-4 h-4" /> View attached certificate
            </a>
          )}

          {/* Review actions */}
          {record.approval_status === 'pending' && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Review this record</p>
              <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Rejection reason (required if rejecting)…"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-violet-400 outline-none" />
              <div className="flex gap-3">
                <button onClick={() => handleReview('approve')} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  <CheckCircle className="w-4 h-4" /> Approve
                </button>
                <button onClick={() => handleReview('reject')} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          )}

          {record.approval_status !== 'pending' && (
            <div className={`rounded-xl p-4 text-sm ${record.approval_status === 'approved' ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className={`font-semibold mb-1 ${record.approval_status === 'approved' ? 'text-emerald-700' : 'text-red-700'}`}>
                {record.approval_status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                {record.reviewed_at && ` · ${fmtDate(record.reviewed_at)}`}
              </p>
              {record.reviewed_by_name && <p className="text-slate-500 text-xs">By: {record.reviewed_by_name}</p>}
              {record.rejection_reason && <p className="mt-1 text-red-800 italic">Reason: {record.rejection_reason}</p>}
            </div>
          )}

          {/* Revoke approval */}
          {record.approval_status === 'approved' && (
            <button onClick={async () => {
              try {
                const updated = await PerformanceService.revokeApproval(record.id);
                toast.success('Approval revoked — record returned to Pending');
                onReviewed(updated); onClose();
              } catch { toast.error('Failed'); }
            }} className="text-xs text-slate-500 hover:text-red-600 underline">
              Revoke approval (returns to Pending)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ProfessionalDevelopmentAdminPage: React.FC = () => {
  const [records, setRecords] = useState<ProfessionalDevelopment[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PDApprovalStatus | 'all'>('pending');
  const [filterTeacher, setFilterTeacher] = useState('');
  const [search, setSearch] = useState('');
  const [viewRecord, setViewRecord] = useState<ProfessionalDevelopment | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rData, tData] = await Promise.all([
        PerformanceService.getPDRecords(),
        api.get('/api/teachers/teachers/', { page_size: 500 }),
      ]);
      setRecords(Array.isArray(rData) ? rData : (rData as any).results ?? []);
      const raw = Array.isArray(tData) ? tData : (tData as any).results ?? [];
      setTeachers(raw.map((t: any) => ({
        id: t.id,
        employee_id: t.employee_id,
        full_name: t.full_name || `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim(),
      })));
    } catch { toast.error('Failed to load records'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (teacher: any) => {
    setDownloading(teacher.id);
    try {
      await PerformanceService.downloadPDReport(teacher.id, teacher.full_name);
      toast.success('PDF downloaded');
    } catch { toast.error('PDF generation failed'); }
    finally { setDownloading(null); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(r => {
      if (filterStatus !== 'all' && r.approval_status !== filterStatus) return false;
      if (filterTeacher && String(r.teacher) !== filterTeacher) return false;
      if (q && !r.teacher_name?.toLowerCase().includes(q) && !r.title?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, filterStatus, filterTeacher, search]);

  const counts = useMemo(() => ({
    pending:  records.filter(r => r.approval_status === 'pending').length,
    approved: records.filter(r => r.approval_status === 'approved').length,
    rejected: records.filter(r => r.approval_status === 'rejected').length,
  }), [records]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-violet-600" /> Professional Development Review
            </h1>
            <p className="text-slate-500 text-sm mt-1">Approve or reject staff professional development records, and download PDF certificates</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-white">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pending Review', value: counts.pending,  color: 'bg-amber-500',   icon: Clock },
            { label: 'Approved',       value: counts.approved, color: 'bg-emerald-500',  icon: CheckCircle },
            { label: 'Rejected',       value: counts.rejected, color: 'bg-red-500',      icon: XCircle },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Download by teacher */}
        {teachers.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Download className="w-4 h-4 text-violet-600" /> Download Teacher PD Report (PDF)
            </h2>
            <div className="flex flex-wrap gap-2">
              {teachers.map(t => (
                <button key={t.id}
                  onClick={() => handleDownload(t)}
                  disabled={downloading === t.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  <FileText className="w-3.5 h-3.5" />
                  {downloading === t.id ? 'Generating…' : t.full_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search staff name or record title…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${filterStatus === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {s === 'all' ? 'All' : s}
                {s !== 'all' && counts[s] > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${s === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{counts[s]}</span>
                )}
              </button>
            ))}
          </div>
          <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none">
            <option value="">All Staff</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>

        {/* Pending notice */}
        {counts.pending > 0 && filterStatus !== 'approved' && filterStatus !== 'rejected' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <strong>{counts.pending}</strong> record{counts.pending !== 1 ? 's' : ''} pending your review.
              Approved records count toward the teacher's CPD hours and appear on their profile.
            </p>
          </div>
        )}

        {/* Records table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Records <span className="text-slate-400 font-normal">({filtered.length})</span></h2>
          </div>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No records found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Staff', 'Type', 'Title', 'Provider', 'Completed', 'Hours', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 text-xs">{r.teacher_name}</p>
                        <p className="text-[10px] text-slate-400">{r.teacher_employee_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[r.dev_type] ?? TYPE_COLORS.other}`}>{r.dev_type_display}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="text-slate-800 text-xs truncate">{r.title}</p>
                        {r.certificate_url && (
                          <a href={r.certificate_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">Certificate</a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[100px] truncate">{r.provider || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtDate(r.date_completed)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{r.duration_hours ?? '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.approval_status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViewRecord(r)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Review">
                            <Eye className="w-4 h-4" />
                          </button>
                          {r.approval_status === 'pending' && (
                            <>
                              <button onClick={async () => {
                                try {
                                  const updated = await PerformanceService.reviewPDRecord(r.id, 'approve');
                                  setRecords(prev => prev.map(x => x.id === updated.id ? updated : x));
                                  toast.success('Approved');
                                } catch { toast.error('Failed'); }
                              }} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" title="Quick approve">
                                <CheckCircle className="w-4 h-4" />
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

      {viewRecord && (
        <ReviewModal
          record={viewRecord}
          onClose={() => setViewRecord(null)}
          onReviewed={updated => setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))}
        />
      )}
    </div>
  );
};

export default ProfessionalDevelopmentAdminPage;
