/**
 * Demo Requests Panel
 *
 * Schools that asked for a demo on the marketing site (/book-demo, the
 * homepage and the contact page). The platform admin follows each one up and
 * records where it got to; what the school sent can't be edited, and nothing
 * is deleted, so the list doubles as the record of how leads convert.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertCircle, Phone, Mail, MessageCircle, RefreshCw, Search } from 'lucide-react';
import api from '@/services/api';

type Status = 'new' | 'contacted' | 'demo_booked' | 'won' | 'lost';

interface DemoRequest {
  id: number;
  school_name: string;
  contact_name: string;
  role: string;
  phone: string;
  email: string;
  location: string;
  student_count: string;
  preferred_contact: 'whatsapp' | 'phone' | 'email';
  message: string;
  source: string;
  status: Status;
  notes: string;
  created_at: string;
}

const STATUSES: { value: Status; label: string; cls: string }[] = [
  { value: 'new', label: 'New', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'contacted', label: 'Contacted', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'demo_booked', label: 'Demo booked', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'won', label: 'Subscribed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'lost', label: 'Not interested', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
];
const statusOf = (s: Status) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

/** wa.me wants the number with the country code and no leading 0. */
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('0') ? `234${d.slice(1)}` : d;
};

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black';

const Row: React.FC<{ demo: DemoRequest; onSaved: (d: DemoRequest) => void }> = ({ demo, onSaved }) => {
  const [status, setStatus] = useState<Status>(demo.status);
  const [notes, setNotes] = useState(demo.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = status !== demo.status || notes !== demo.notes;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      onSaved(await api.patch(`/api/tenants/demo-requests/${demo.id}/`, { status, notes }));
    } catch (err: any) {
      setError(err?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const st = statusOf(demo.status);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-gray-900">{demo.school_name}</h4>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {demo.contact_name}{demo.role && ` · ${demo.role}`}{demo.location && ` · ${demo.location}`}
            {demo.student_count && ` · ${demo.student_count} students`}
          </p>
        </div>
        <p className="text-xs text-gray-400 whitespace-nowrap">{new Date(demo.created_at).toLocaleString()}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <a href={`https://wa.me/${waNumber(demo.phone)}`} target="_blank" rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 hover:underline ${demo.preferred_contact === 'whatsapp' ? 'font-bold text-green-700' : 'text-gray-700'}`}>
          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
        </a>
        <a href={`tel:${demo.phone.replace(/\s+/g, '')}`}
          className={`inline-flex items-center gap-1 hover:underline ${demo.preferred_contact === 'phone' ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
          <Phone className="w-3.5 h-3.5" /> {demo.phone}
        </a>
        {demo.email && (
          <a href={`mailto:${demo.email}`}
            className={`inline-flex items-center gap-1 hover:underline ${demo.preferred_contact === 'email' ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
            <Mail className="w-3.5 h-3.5" /> {demo.email}
          </a>
        )}
        {demo.source && <span className="text-gray-400">from {demo.source}</span>}
      </div>

      {demo.message && <p className="mt-3 text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{demo.message}</p>}

      <div className="mt-3 grid sm:grid-cols-[180px_1fr_auto] gap-2 items-start">
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Follow-up status">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes, e.g. demo Thursday 10am, wants CBT" aria-label="Notes" />
        <button onClick={save} disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
};

const DemoRequestsPanel: React.FC = () => {
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | ''>('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page_size: '100' };
      if (filter) params.status = filter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/api/tenants/demo-requests/', params);
      setRows(Array.isArray(res) ? res : res?.results ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load demo requests.');
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const counts = STATUSES.map((s) => ({ ...s, n: rows.filter((r) => r.status === s.value).length }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Search school, name, phone…" value={search}
            onChange={(e) => setSearch(e.target.value)} aria-label="Search demo requests" />
        </div>
        <select className={`${inputCls} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as Status | '')} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:text-black" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {!filter && rows.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {counts.map((c) => (
            <span key={c.value} className={`px-2.5 py-1 rounded-full border font-semibold ${c.cls}`}>{c.label}: {c.n}</span>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-semibold text-gray-900">No demo requests{filter || search ? ' match' : ' yet'}</p>
          <p className="text-xs text-gray-500 mt-1">Requests from the Book a Demo form on nuventacloud.com appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Row key={d.id} demo={d} onSaved={(saved) => setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)))} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DemoRequestsPanel;
