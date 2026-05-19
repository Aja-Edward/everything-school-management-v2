import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Star, CheckCircle, Clock, FileText, Plus, X, Eye,
  Search, RefreshCw, ChevronRight, Award, Send, Users,
  TrendingUp, AlertCircle, Trash2, Edit,
} from 'lucide-react';
import { toast } from 'react-toastify';
import PerformanceService, {
  PerformanceAppraisal, AppraisalCriteria, AppraisalStatus,
  AppraiserRole, AppraisalPeriod, CreateAppraisalPayload,
} from '@/services/PerformanceService';
import api from '@/services/api';

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AppraisalStatus, { label: string; color: string; dot: string }> = {
  draft:        { label: 'Draft',        color: 'bg-slate-100 text-slate-600 border-slate-200',   dot: 'bg-slate-400' },
  submitted:    { label: 'Submitted',    color: 'bg-amber-100 text-amber-700 border-amber-200',   dot: 'bg-amber-500' },
  acknowledged: { label: 'Acknowledged', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

const PERIOD_LABELS: Record<string, string> = {
  first_term: '1st Term', second_term: '2nd Term', third_term: '3rd Term',
  annual: 'Annual Review', probation: 'Probationary',
};

const GRADE_COLORS: Record<string, string> = {
  Excellent: 'text-emerald-700 bg-emerald-50',
  'Very Good': 'text-blue-700 bg-blue-50',
  Good: 'text-violet-700 bg-violet-50',
  Average: 'text-amber-700 bg-amber-50',
  'Below Average': 'text-orange-700 bg-orange-50',
  Poor: 'text-red-700 bg-red-50',
};

function StatusBadge({ status }: { status: AppraisalStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
    </span>
  );
}

function StarRating({ value, max, onChange }: { value: number; max: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => {
        const active = (hover || value) > i;
        return (
          <button
            key={i} type="button"
            onClick={() => onChange?.(i + 1)}
            onMouseEnter={() => onChange && setHover(i + 1)}
            onMouseLeave={() => onChange && setHover(0)}
            className={`w-6 h-6 transition-colors ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <Star className={`w-5 h-5 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
          </button>
        );
      })}
      <span className="ml-1 text-xs text-slate-500">{value}/{max}</span>
    </div>
  );
}

// ─── Appraisal Form ───────────────────────────────────────────────────────────

function AppraisalForm({
  teachers, criteria, editAppraisal, onSaved, onCancel,
}: {
  teachers: any[];
  criteria: AppraisalCriteria[];
  editAppraisal: PerformanceAppraisal | null;
  onSaved: (a: PerformanceAppraisal) => void;
  onCancel: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState<CreateAppraisalPayload>({
    teacher: editAppraisal?.teacher ?? 0,
    appraiser_role: editAppraisal?.appraiser_role ?? 'head_teacher',
    period: editAppraisal?.period ?? 'first_term',
    academic_year: editAppraisal?.academic_year ?? `${currentYear}/${currentYear + 1}`,
    overall_comment: editAppraisal?.overall_comment ?? '',
    recommendation: editAppraisal?.recommendation ?? '',
    scores: [],
  });
  const [scores, setScores] = useState<Record<number, { score: number; comment: string }>>(
    () => Object.fromEntries(
      (editAppraisal?.scores ?? []).map(s => [s.criteria, { score: s.score, comment: s.comment }])
    )
  );
  const [saving, setSaving] = useState(false);

  const selectedTeacher = teachers.find(t => t.id === form.teacher);
  const staffType = selectedTeacher?.staff_type ?? 'teaching';

  const applicableCriteria = useMemo(() =>
    criteria.filter(c => c.is_active && (c.applicable_to === 'all' || c.applicable_to === staffType)),
    [criteria, staffType]
  );

  const setScore = (criteriaId: number, score: number) =>
    setScores(prev => ({ ...prev, [criteriaId]: { ...prev[criteriaId], score, comment: prev[criteriaId]?.comment ?? '' } }));

  const setComment = (criteriaId: number, comment: string) =>
    setScores(prev => ({ ...prev, [criteriaId]: { ...prev[criteriaId], comment, score: prev[criteriaId]?.score ?? 0 } }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.teacher) { toast.error('Select a teacher'); return; }
    const scoresPayload = applicableCriteria
      .filter(c => scores[c.id]?.score > 0)
      .map(c => ({ criteria: c.id, score: scores[c.id].score, comment: scores[c.id]?.comment ?? '' }));
    setSaving(true);
    try {
      const payload = { ...form, scores: scoresPayload };
      const result = editAppraisal
        ? await PerformanceService.updateAppraisal(editAppraisal.id, payload)
        : await PerformanceService.createAppraisal(payload);
      toast.success(editAppraisal ? 'Appraisal updated' : 'Appraisal created');
      onSaved(result);
    } catch (e: any) {
      const msg = e?.response?.data ? Object.values(e.response.data).flat().join(' ') : (e?.message || 'Failed');
      toast.error(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-bold text-slate-900">{editAppraisal ? 'Edit Appraisal' : 'New Performance Appraisal'}</h2>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Staff Member *</label>
              <select value={form.teacher} onChange={e => setForm(f => ({ ...f, teacher: Number(e.target.value), scores: [] }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none" required>
                <option value={0}>— Select staff —</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.full_name || t.user_name} — {t.employee_id} ({t.staff_type === 'non-teaching' ? 'Non-Teaching' : 'Teaching'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Appraiser Role *</label>
              <select value={form.appraiser_role} onChange={e => setForm(f => ({ ...f, appraiser_role: e.target.value as AppraiserRole }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none">
                <option value="proprietress">Proprietress</option>
                <option value="head_teacher">Head Teacher</option>
                <option value="form_teacher">Form Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Period *</label>
              <select value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value as AppraisalPeriod }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none">
                {Object.entries(PERIOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Academic Year</label>
              <input type="text" value={form.academic_year}
                onChange={e => setForm(f => ({ ...f, academic_year: e.target.value }))}
                placeholder="2025/2026"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
            </div>
          </div>

          {/* Criteria scoring */}
          {form.teacher > 0 && applicableCriteria.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Score Each Criterion (1–{applicableCriteria[0]?.max_score})
              </h3>
              <div className="space-y-3 bg-slate-50 rounded-xl p-4">
                {applicableCriteria.map(c => (
                  <div key={c.id} className="bg-white rounded-lg p-3 border border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{c.name}</p>
                        {c.description && <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>}
                      </div>
                      <StarRating value={scores[c.id]?.score ?? 0} max={c.max_score} onChange={v => setScore(c.id, v)} />
                    </div>
                    <input type="text"
                      value={scores[c.id]?.comment ?? ''}
                      onChange={e => setComment(c.id, e.target.value)}
                      placeholder="Optional comment…"
                      className="mt-2 w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-600 focus:ring-1 focus:ring-violet-300 outline-none bg-slate-50" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Overall Comment</label>
            <textarea rows={3} value={form.overall_comment}
              onChange={e => setForm(f => ({ ...f, overall_comment: e.target.value }))}
              placeholder="General narrative about the staff member's performance…"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Recommendations</label>
            <textarea rows={2} value={form.recommendation}
              onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))}
              placeholder="Areas for improvement, training needs, or recognition…"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none resize-none" />
          </div>

          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={onCancel}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-slate-700 text-sm font-medium hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
              {saving ? 'Saving…' : editAppraisal ? 'Update' : 'Save as Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function AppraisalDetail({ appraisal, onClose, onSubmit, onDelete, onRefresh }: {
  appraisal: PerformanceAppraisal;
  onClose: () => void;
  onSubmit: (a: PerformanceAppraisal) => void;
  onDelete: (id: number) => void;
  onRefresh: (a: PerformanceAppraisal) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const updated = await PerformanceService.submitAppraisal(appraisal.id);
      toast.success('Appraisal submitted — teacher can now view and acknowledge it');
      onSubmit(updated);
    } catch (e: any) { toast.error(e?.message || 'Failed to submit'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-900">{appraisal.teacher_name}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {PERIOD_LABELS[appraisal.period]} {appraisal.academic_year} · {appraisal.appraiser_role_display}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={appraisal.status} />
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Overall score */}
          {appraisal.overall_score != null && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 bg-gradient-to-br from-violet-50 to-violet-100 rounded-xl p-4">
                <p className="text-xs text-violet-600 font-semibold uppercase tracking-wider">Overall Score</p>
                <p className="text-3xl font-bold text-violet-900 mt-1">{appraisal.overall_score}%</p>
              </div>
              <div className={`rounded-xl p-4 flex items-center justify-center ${GRADE_COLORS[appraisal.overall_grade] || 'bg-slate-50 text-slate-600'}`}>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Grade</p>
                  <p className="text-lg font-bold mt-1">{appraisal.overall_grade}</p>
                </div>
              </div>
            </div>
          )}

          {/* Criterion scores */}
          {appraisal.scores.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Criterion Scores</h3>
              <div className="space-y-2">
                {appraisal.scores.map(s => (
                  <div key={s.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-2.5">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{s.criteria_name}</p>
                      {s.comment && <p className="text-xs text-slate-500 mt-0.5 italic">"{s.comment}"</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StarRating value={s.score} max={s.max_score} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        s.score_percentage >= 80 ? 'bg-emerald-100 text-emerald-700' :
                        s.score_percentage >= 60 ? 'bg-blue-100 text-blue-700' :
                        s.score_percentage >= 40 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{s.score_percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          {appraisal.overall_comment && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 mb-1">Overall Comment</p>
              <p className="text-sm text-blue-900">{appraisal.overall_comment}</p>
            </div>
          )}
          {appraisal.recommendation && (
            <div className="bg-violet-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-violet-700 mb-1">Recommendations</p>
              <p className="text-sm text-violet-900">{appraisal.recommendation}</p>
            </div>
          )}
          {appraisal.teacher_response && (
            <div className="bg-emerald-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-emerald-700 mb-1">Teacher's Response</p>
              <p className="text-sm text-emerald-900">{appraisal.teacher_response}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t">
            {appraisal.status === 'draft' && (
              <>
                <button onClick={() => { onDelete(appraisal.id); onClose(); }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button onClick={handleSubmit} disabled={submitting || !appraisal.scores.length}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                  <Send className="w-4 h-4" /> {submitting ? 'Submitting…' : 'Submit to Teacher'}
                </button>
              </>
            )}
            {appraisal.status !== 'draft' && (
              <p className="flex-1 text-center text-sm text-slate-400 py-2">
                {appraisal.status === 'submitted' ? '⏳ Awaiting teacher acknowledgment' : '✅ Teacher has acknowledged'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PerformanceAppraisalPage: React.FC = () => {
  const [appraisals, setAppraisals] = useState<PerformanceAppraisal[]>([]);
  const [criteria, setCriteria] = useState<AppraisalCriteria[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editAppraisal, setEditAppraisal] = useState<PerformanceAppraisal | null>(null);
  const [viewAppraisal, setViewAppraisal] = useState<PerformanceAppraisal | null>(null);
  const [filterStatus, setFilterStatus] = useState<AppraisalStatus | 'all'>('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apData, crData, tcData] = await Promise.all([
        PerformanceService.getAppraisals(),
        PerformanceService.getCriteria(),
        api.get('/api/teachers/teachers/', { page_size: 500 }),
      ]);
      setAppraisals(Array.isArray(apData) ? apData : (apData as any).results ?? []);
      setCriteria(Array.isArray(crData) ? crData : (crData as any).results ?? []);
      const raw = Array.isArray(tcData) ? tcData : (tcData as any).results ?? [];
      setTeachers(raw.map((t: any) => ({
        id: t.id, employee_id: t.employee_id,
        full_name: t.full_name || `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim(),
        user_name: t.username, staff_type: t.staff_type,
      })));
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (a: PerformanceAppraisal) => {
    setAppraisals(prev => {
      const idx = prev.findIndex(x => x.id === a.id);
      return idx >= 0 ? prev.map(x => x.id === a.id ? a : x) : [a, ...prev];
    });
    setShowForm(false); setEditAppraisal(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this draft appraisal?')) return;
    try {
      await PerformanceService.deleteAppraisal(id);
      setAppraisals(prev => prev.filter(a => a.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return appraisals.filter(a => {
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterPeriod !== 'all' && a.period !== filterPeriod) return false;
      if (q && !a.teacher_name?.toLowerCase().includes(q) && !a.teacher_employee_id?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [appraisals, filterStatus, filterPeriod, search]);

  const counts = useMemo(() => ({
    total: appraisals.length,
    draft: appraisals.filter(a => a.status === 'draft').length,
    submitted: appraisals.filter(a => a.status === 'submitted').length,
    acknowledged: appraisals.filter(a => a.status === 'acknowledged').length,
  }), [appraisals]);

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
              <Award className="w-6 h-6 text-violet-600" /> Performance Appraisals
            </h1>
            <p className="text-slate-500 text-sm mt-1">Create and manage staff performance appraisals</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-white">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => { setEditAppraisal(null); setShowForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
              <Plus className="w-4 h-4" /> New Appraisal
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: counts.total, color: 'bg-slate-600', icon: FileText },
            { label: 'Draft', value: counts.draft, color: 'bg-slate-400', icon: Edit },
            { label: 'Awaiting Ack.', value: counts.submitted, color: 'bg-amber-500', icon: Clock },
            { label: 'Acknowledged', value: counts.acknowledged, color: 'bg-emerald-500', icon: CheckCircle },
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

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search staff name or ID…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none">
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
          <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none">
            <option value="all">All Periods</option>
            {Object.entries(PERIOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Appraisals <span className="text-slate-400 font-normal">({filtered.length})</span></h2>
          </div>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No appraisals found. Create one to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Staff Member', 'Period', 'Appraiser Role', 'Score', 'Grade', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{a.teacher_name}</p>
                        <p className="text-xs text-slate-400">{a.teacher_employee_id}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{PERIOD_LABELS[a.period]} {a.academic_year && <span className="text-xs text-slate-400">· {a.academic_year}</span>}</td>
                      <td className="px-4 py-3 capitalize text-slate-600">{a.appraiser_role_display}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{a.overall_score != null ? `${a.overall_score}%` : '—'}</td>
                      <td className="px-4 py-3">
                        {a.overall_grade !== '—' ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${GRADE_COLORS[a.overall_grade] || 'bg-slate-100 text-slate-600'}`}>
                            {a.overall_grade}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViewAppraisal(a)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          {a.status === 'draft' && (
                            <button onClick={() => { setEditAppraisal(a); setShowForm(true); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                              <Edit className="w-4 h-4" />
                            </button>
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

      {showForm && (
        <AppraisalForm
          teachers={teachers} criteria={criteria}
          editAppraisal={editAppraisal}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditAppraisal(null); }}
        />
      )}
      {viewAppraisal && (
        <AppraisalDetail
          appraisal={viewAppraisal}
          onClose={() => setViewAppraisal(null)}
          onSubmit={a => { setAppraisals(prev => prev.map(x => x.id === a.id ? a : x)); setViewAppraisal(a); }}
          onDelete={id => { handleDelete(id); setViewAppraisal(null); }}
          onRefresh={a => setViewAppraisal(a)}
        />
      )}
    </div>
  );
};

export default PerformanceAppraisalPage;
