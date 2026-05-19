import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ThumbsUp, AlertTriangle, Plus, X, Eye, Search,
  RefreshCw, CheckCircle, Clock, MessageSquare, Star, Shield, Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import PerformanceService, { StaffNote, NoteType, NoteCategory, CreateNotePayload } from '@/services/PerformanceService';
import api from '@/services/api';

// ─── constants ────────────────────────────────────────────────────────────────

const NOTE_TYPE_CFG: Record<NoteType, { label: string; color: string; positive: boolean; icon: React.ElementType }> = {
  commendation:    { label: 'Commendation',           positive: true,  color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Star },
  appreciation:    { label: 'Letter of Appreciation', positive: true,  color: 'bg-blue-100 text-blue-700 border-blue-200',          icon: ThumbsUp },
  query:           { label: 'Query',                  positive: false, color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: MessageSquare },
  warning:         { label: 'Written Warning',        positive: false, color: 'bg-orange-100 text-orange-700 border-orange-200',    icon: AlertTriangle },
  caution:         { label: 'Caution',                positive: false, color: 'bg-red-100 text-red-700 border-red-200',            icon: Shield },
  improvement_plan:{ label: 'Improvement Plan',       positive: false, color: 'bg-purple-100 text-purple-700 border-purple-200',   icon: CheckCircle },
};

const CATEGORIES: Array<{ value: NoteCategory; label: string }> = [
  { value: 'punctuality',     label: 'Punctuality & Attendance' },
  { value: 'performance',     label: 'Teaching Performance' },
  { value: 'conduct',         label: 'Professional Conduct' },
  { value: 'innovation',      label: 'Innovation & Initiative' },
  { value: 'teamwork',        label: 'Teamwork & Collaboration' },
  { value: 'student_relations', label: 'Student Relations' },
  { value: 'administrative',  label: 'Administrative Duties' },
  { value: 'other',           label: 'Other' },
];

function NoteBadge({ noteType }: { noteType: NoteType }) {
  const cfg = NOTE_TYPE_CFG[noteType] ?? NOTE_TYPE_CFG.query;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

// ─── Note Form ────────────────────────────────────────────────────────────────

function NoteForm({ teachers, onSaved, onCancel }: {
  teachers: any[];
  onSaved: (n: StaffNote) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CreateNotePayload>({
    teacher: 0,
    note_type: 'commendation',
    category: 'performance',
    title: '',
    content: '',
  });
  const [saving, setSaving] = useState(false);
  const cfg = NOTE_TYPE_CFG[form.note_type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.teacher) { toast.error('Select a staff member'); return; }
    if (!form.title.trim()) { toast.error('Enter a title'); return; }
    if (!form.content.trim()) { toast.error('Enter the note content'); return; }
    setSaving(true);
    try {
      const saved = await PerformanceService.createNote(form);
      toast.success(`${cfg.label} issued successfully`);
      onSaved(saved);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to issue note');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-bold text-slate-900">Issue Staff Note</h2>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Staff Member *</label>
            <select value={form.teacher} onChange={e => setForm(f => ({ ...f, teacher: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none" required>
              <option value={0}>— Select staff member —</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.full_name} — {t.employee_id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Note Type *</label>
              <select value={form.note_type} onChange={e => setForm(f => ({ ...f, note_type: e.target.value as NoteType }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none">
                <optgroup label="✅ Positive">
                  <option value="commendation">Commendation</option>
                  <option value="appreciation">Letter of Appreciation</option>
                </optgroup>
                <optgroup label="⚠️ Disciplinary">
                  <option value="query">Query</option>
                  <option value="warning">Written Warning</option>
                  <option value="caution">Caution</option>
                  <option value="improvement_plan">Improvement Plan</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as NoteCategory }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Preview badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Preview:</span>
            <NoteBadge noteType={form.note_type} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title / Subject *</label>
            <input type="text" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={cfg.positive ? 'e.g. Outstanding dedication during school event' : 'e.g. Repeated lateness to class'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none"
              required />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {cfg.positive ? 'Commendation Details *' : 'Details & Expected Action *'}
            </label>
            <textarea rows={5} value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={cfg.positive
                ? 'Describe the achievement, contribution, or behaviour being commended…'
                : 'Describe the issue clearly, cite dates/incidents, and state what is expected going forward…'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none resize-none"
              required />
          </div>

          {!cfg.positive && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
              <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
              The staff member will be notified and must acknowledge receipt of this note.
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={onCancel}
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-slate-700 text-sm font-medium hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50 ${
                cfg.positive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'
              }`}>
              {saving ? 'Issuing…' : `Issue ${cfg.label}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function NoteDetail({ note, onClose, onDelete }: {
  note: StaffNote;
  onClose: () => void;
  onDelete: (id: number) => void;
}) {
  const cfg = NOTE_TYPE_CFG[note.note_type] ?? NOTE_TYPE_CFG.query;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="font-bold text-slate-900">{note.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{note.teacher_name} · {note.teacher_employee_id}</p>
          </div>
          <div className="flex items-center gap-2">
            <NoteBadge noteType={note.note_type} />
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className={`rounded-xl p-4 ${cfg.positive ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-60">{note.category_display}</p>
            <p className={`text-sm whitespace-pre-line ${cfg.positive ? 'text-emerald-900' : 'text-amber-900'}`}>{note.content}</p>
          </div>
          <div className="text-xs text-slate-400 flex flex-wrap gap-4">
            <span>Issued by: <strong className="text-slate-600">{note.issued_by_name}</strong></span>
            <span>Date: <strong className="text-slate-600">{new Date(note.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
          </div>
          {note.is_acknowledged ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-emerald-700 mb-1">✓ Acknowledged</p>
              <p className="text-xs text-emerald-600">{new Date(note.acknowledged_at!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              {note.teacher_comment && <p className="text-sm text-emerald-900 mt-2 italic">"{note.teacher_comment}"</p>}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500">
              <Clock className="inline w-3.5 h-3.5 mr-1" /> Awaiting acknowledgment from {note.teacher_name}
            </div>
          )}
          {!note.is_acknowledged && (
            <button onClick={() => { onDelete(note.id); onClose(); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> Delete Note
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const StaffNotesPage: React.FC = () => {
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewNote, setViewNote] = useState<StaffNote | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'positive' | 'disciplinary'>('all');
  const [filterAck, setFilterAck] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nData, tData] = await Promise.all([
        PerformanceService.getNotes(),
        api.get('/api/teachers/teachers/', { page_size: 500 }),
      ]);
      setNotes(Array.isArray(nData) ? nData : (nData as any).results ?? []);
      const raw = Array.isArray(tData) ? tData : (tData as any).results ?? [];
      setTeachers(raw.map((t: any) => ({
        id: t.id, employee_id: t.employee_id,
        full_name: t.full_name || `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim(),
      })));
    } catch { toast.error('Failed to load notes'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this staff note?')) return;
    try {
      await PerformanceService.deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      toast.success('Note deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return notes.filter(n => {
      if (filterType === 'positive' && !n.is_positive) return false;
      if (filterType === 'disciplinary' && n.is_positive) return false;
      if (filterAck === 'pending' && n.is_acknowledged) return false;
      if (filterAck === 'acknowledged' && !n.is_acknowledged) return false;
      if (q && !n.teacher_name?.toLowerCase().includes(q) && !n.title?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notes, filterType, filterAck, search]);

  const positive = notes.filter(n => n.is_positive).length;
  const disciplinary = notes.filter(n => !n.is_positive).length;
  const unacknowledged = notes.filter(n => !n.is_acknowledged).length;

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
              <MessageSquare className="w-6 h-6 text-violet-600" /> Staff Notes
            </h1>
            <p className="text-slate-500 text-sm mt-1">Issue commendations, appreciations, queries, and warnings to staff</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-white">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
              <Plus className="w-4 h-4" /> Issue Note
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Notes', value: notes.length, color: 'bg-slate-600', icon: MessageSquare },
            { label: 'Commendations', value: positive, color: 'bg-emerald-500', icon: ThumbsUp },
            { label: 'Disciplinary', value: disciplinary, color: 'bg-orange-500', icon: AlertTriangle },
            { label: 'Unacknowledged', value: unacknowledged, color: 'bg-amber-500', icon: Clock },
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
            <input type="text" placeholder="Search staff or title…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {([['all', 'All'], ['positive', '✅ Positive'], ['disciplinary', '⚠️ Disciplinary']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilterType(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <select value={filterAck} onChange={e => setFilterAck(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none">
            <option value="all">All</option>
            <option value="pending">Unacknowledged</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Notes <span className="text-slate-400 font-normal">({filtered.length})</span></h2>
          </div>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No notes found.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(note => {
                const cfg = NOTE_TYPE_CFG[note.note_type] ?? NOTE_TYPE_CFG.query;
                return (
                  <div key={note.id} className={`flex items-start gap-4 px-6 py-4 hover:bg-slate-50 border-l-4 ${
                    note.is_positive ? 'border-l-emerald-400' : 'border-l-orange-400'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <NoteBadge noteType={note.note_type} />
                        <span className="text-xs text-slate-400">{note.category_display}</span>
                      </div>
                      <p className="font-medium text-slate-900 mt-1 text-sm">{note.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        To: <strong>{note.teacher_name}</strong> · {note.teacher_employee_id} · by {note.issued_by_name}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(note.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {note.is_acknowledged
                        ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Ack'd</span>
                        : <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Pending</span>
                      }
                      <button onClick={() => setViewNote(note)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="View">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <NoteForm
          teachers={teachers}
          onSaved={n => { setNotes(prev => [n, ...prev]); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {viewNote && (
        <NoteDetail
          note={viewNote}
          onClose={() => setViewNote(null)}
          onDelete={id => { handleDelete(id); setViewNote(null); }}
        />
      )}
    </div>
  );
};

export default StaffNotesPage;
