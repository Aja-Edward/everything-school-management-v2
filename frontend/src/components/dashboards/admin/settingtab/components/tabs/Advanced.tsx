import React, { useState, useEffect, useRef } from 'react';
import {
  Megaphone, Users, Shield, Plus, Edit3, Trash2, Eye, EyeOff,
  Settings, Save, X, Upload, Star, Sparkles, ChevronRight,
  Globe, Loader2, CheckCircle, AlertCircle, Info, Calendar,
  Target, Clock, Image as ImageIcon, Ribbon, Radio, LayoutTemplate,
  Zap, Bell, Type, AlignLeft, Tag,
} from 'lucide-react';
import api, { API_BASE_URL } from '@/services/api';

const csrfToken = () =>
  document.cookie.split('; ').find(r => r.startsWith('csrftoken='))?.split('=')[1] ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

type DisplayType = 'banner' | 'carousel' | 'ribbon';
type EventType   = 'announcement' | 'enrollment' | 'event' | 'achievement' | 'custom';
type RibbonSpeed = 'slow' | 'medium' | 'fast';
type Priority    = 'low' | 'medium' | 'high';

interface EventItem {
  id: number;
  title: string;
  subtitle?: string;
  description?: string;
  display_type: DisplayType;
  event_type: EventType;
  background_theme: string;
  is_active: boolean;
  is_published: boolean;
  ribbon_text?: string;
  ribbon_speed?: RibbonSpeed;
  start_date?: string;
  end_date?: string;
  cta_text?: string;
  cta_url?: string;
  images?: { id: number; image: string; title?: string }[];
  created_at: string;
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  target_audience: string;
  is_active: boolean;
  is_pinned: boolean;
  created_at: string;
  end_date?: string;
  priority: Priority;
  announcement_type?: string;
}

// ─── Reusable UI primitives ───────────────────────────────────────────────────

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const Inp: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (p) => (
  <input {...p} className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${p.className ?? ''}`} />
);

const Sel: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (p) => (
  <select {...p} className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800
    focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${p.className ?? ''}`} />
);

const Txt: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (p) => (
  <textarea {...p} className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800
    placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none ${p.className ?? ''}`} />
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }> = ({ checked, onChange, label, desc }) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {desc && <p className="text-xs text-gray-400">{desc}</p>}
    </div>
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors focus:outline-none ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}>
      <span className={`absolute top-1 left-1 h-4 w-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  </div>
);

const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onClose: () => void }> = ({ msg, type, onClose }) => (
  <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
    ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
    {type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
    {msg}
    <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
  </div>
);

// ─── Portal Settings ──────────────────────────────────────────────────────────

const PortalSettings: React.FC = () => {
  const [ps, setPs] = useState({ student_portal_enabled: true, teacher_portal_enabled: true, parent_portal_enabled: true });
  const [orig, setOrig] = useState(ps);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    api.get('/school-settings/school-settings/').then((d: any) => {
      const s = { student_portal_enabled: d.student_portal_enabled ?? true, teacher_portal_enabled: d.teacher_portal_enabled ?? true, parent_portal_enabled: d.parent_portal_enabled ?? true };
      setPs(s); setOrig(s);
    }).catch(() => {});
  }, []);

  const changed = JSON.stringify(ps) !== JSON.stringify(orig);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/school-settings/school-settings/', ps);
      setOrig(ps);
      setToast({ msg: 'Portal settings saved.', type: 'success' });
    } catch { setToast({ msg: 'Failed to save.', type: 'error' }); }
    finally { setSaving(false); }
  };

  const portals = [
    { key: 'student_portal_enabled' as const, label: 'Student Portal', desc: 'Students can view grades, attendance & pay fees', color: 'blue' },
    { key: 'teacher_portal_enabled' as const, label: 'Teacher Portal', desc: 'Teachers can manage classes & enter grades', color: 'purple' },
    { key: 'parent_portal_enabled' as const, label: 'Parent Portal', desc: 'Parents can monitor child progress & pay fees', color: 'green' },
  ];

  return (
    <div className="space-y-5">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {portals.map(p => (
          <div key={p.key} className="p-5 rounded-xl border border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm text-gray-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-500" />{p.label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ps[p.key] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {ps[p.key] ? 'Active' : 'Off'}
              </span>
            </div>
            <Toggle checked={ps[p.key]} onChange={v => setPs(s => ({ ...s, [p.key]: v }))} label={`Enable ${p.label}`} desc={p.desc} />
          </div>
        ))}
      </div>

      {changed && (
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => setPs(orig)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            Discard
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Portal Settings
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Event Form ───────────────────────────────────────────────────────────────

const EMPTY_EVENT = {
  title: '', subtitle: '', description: '', display_type: 'banner' as DisplayType,
  event_type: 'announcement' as EventType, background_theme: 'default',
  ribbon_text: '', ribbon_speed: 'medium' as RibbonSpeed,
  start_date: '', end_date: '', cta_text: '', cta_url: '',
  is_active: true, is_published: true,
};

const EventForm: React.FC<{
  initial?: Partial<typeof EMPTY_EVENT & { id?: number }>;
  onSave: (evt: EventItem) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState({ ...EMPTY_EVENT, ...initial });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!initial?.id;

  const upd = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required.'); return; }
    if (form.display_type === 'ribbon' && !form.ribbon_text.trim()) { setErr('Ribbon text is required.'); return; }
    setSaving(true); setErr(null);

    try {
      let result: EventItem;
      if (isEdit) {
        // PATCH text fields
        result = await api.patch(`/events/events/${initial!.id}/`, {
          title: form.title, subtitle: form.subtitle, description: form.description,
          display_type: form.display_type, event_type: form.event_type,
          background_theme: form.background_theme, ribbon_text: form.ribbon_text,
          ribbon_speed: form.ribbon_speed, start_date: form.start_date || null,
          end_date: form.end_date || null, cta_text: form.cta_text, cta_url: form.cta_url,
          is_active: form.is_active, is_published: form.is_published,
        });
        // Upload image separately if provided
        if (imageFile) {
          const fd = new FormData();
          fd.append('event', String(initial!.id));
          fd.append('image', imageFile);
          await fetch(`${API_BASE_URL}/events/event-images/`, {
            method: 'POST', body: fd, credentials: 'include',
            headers: { 'X-CSRFToken': csrfToken() },
          });
        }
      } else {
        // POST via FormData to support image upload
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (v !== '' && v != null) fd.append(k, String(v));
        });
        if (imageFile) fd.append('images', imageFile);
        const res = await fetch(`${API_BASE_URL}/events/events/`, {
          method: 'POST', body: fd, credentials: 'include',
          headers: { 'X-CSRFToken': csrfToken() },
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(JSON.stringify(d)); }
        result = await res.json();
      }
      onSave(result);
    } catch (ex: any) {
      setErr(ex?.message ?? 'Save failed.');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">{isEdit ? 'Edit Event' : 'Create New Event'}</h3>
        <button type="button" onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
          <X className="w-5 h-5" />
        </button>
      </div>

      {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{err}</div>}

      {/* Display type — most important, shown first */}
      <Field label="Display Type" required>
        <div className="grid grid-cols-3 gap-3">
          {([
            { v: 'banner', icon: <LayoutTemplate className="w-5 h-5" />, label: 'Banner', desc: 'Full hero replacement' },
            { v: 'carousel', icon: <ImageIcon className="w-5 h-5" />, label: 'Carousel', desc: 'Slideshow on hero' },
            { v: 'ribbon', icon: <Radio className="w-5 h-5" />, label: 'Ribbon', desc: 'Scrolling top bar' },
          ] as const).map(({ v, icon, label, desc }) => (
            <button key={v} type="button" onClick={() => upd({ display_type: v })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${form.display_type === v ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={`mb-1 ${form.display_type === v ? 'text-blue-600' : 'text-gray-400'}`}>{icon}</div>
              <div className="text-sm font-semibold text-gray-800">{label}</div>
              <div className="text-xs text-gray-500">{desc}</div>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Title" required>
          <Inp value={form.title} onChange={e => upd({ title: e.target.value })} placeholder="e.g. Open Day 2025" />
        </Field>
        <Field label="Event Type">
          <Sel value={form.event_type} onChange={e => upd({ event_type: e.target.value as EventType })}>
            <option value="announcement">Announcement</option>
            <option value="enrollment">Enrollment / Admissions</option>
            <option value="event">Event</option>
            <option value="achievement">Achievement</option>
            <option value="custom">Custom</option>
          </Sel>
        </Field>
      </div>

      {/* Subtitle + Description — not needed for ribbon */}
      {form.display_type !== 'ribbon' && (
        <>
          <Field label="Subtitle">
            <Inp value={form.subtitle} onChange={e => upd({ subtitle: e.target.value })} placeholder="Optional subtitle shown below title" />
          </Field>
          <Field label="Description">
            <Txt rows={3} value={form.description} onChange={e => upd({ description: e.target.value })} placeholder="More details about this event…" />
          </Field>
        </>
      )}

      {/* Ribbon-specific fields */}
      {form.display_type === 'ribbon' && (
        <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Ribbon Settings</p>
          <Field label="Ribbon Message" required>
            <Inp value={form.ribbon_text} onChange={e => upd({ ribbon_text: e.target.value })}
              placeholder="e.g. 🎓 Admissions now open for 2025/2026 session — Apply today!" />
          </Field>
          <Field label="Scroll Speed">
            <div className="flex gap-3">
              {(['slow', 'medium', 'fast'] as RibbonSpeed[]).map(s => (
                <button key={s} type="button" onClick={() => upd({ ribbon_speed: s })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all capitalize
                    ${form.ribbon_speed === s ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}

      {/* Banner-specific CTA fields */}
      {form.display_type === 'banner' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="CTA Button Text">
            <Inp value={form.cta_text} onChange={e => upd({ cta_text: e.target.value })} placeholder="e.g. Apply Now" />
          </Field>
          <Field label="CTA Button URL">
            <Inp value={form.cta_url} onChange={e => upd({ cta_url: e.target.value })} placeholder="/admissions" />
          </Field>
        </div>
      )}

      {/* Image upload (banner + carousel) */}
      {form.display_type !== 'ribbon' && (
        <Field label="Event Image">
          <div className="flex gap-3 items-start">
            {imagePreview && (
              <div className="relative shrink-0">
                <img src={imagePreview} alt="preview" className="w-28 h-20 object-cover rounded-lg border border-gray-200" />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-0.5 rounded-full hover:bg-red-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
              <Upload className="w-4 h-4" />{imagePreview ? 'Change Image' : 'Upload Image'}
            </button>
          </div>
        </Field>
      )}

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Start Date">
          <Inp type="datetime-local" value={form.start_date} onChange={e => upd({ start_date: e.target.value })} />
        </Field>
        <Field label="End Date">
          <Inp type="datetime-local" value={form.end_date} onChange={e => upd({ end_date: e.target.value })} />
        </Field>
      </div>

      {/* Active / Published */}
      <div className="flex gap-6 p-4 bg-gray-50 rounded-xl">
        <Toggle checked={form.is_active} onChange={v => upd({ is_active: v })} label="Active" desc="Include in public display" />
        <Toggle checked={form.is_published} onChange={v => upd({ is_published: v })} label="Published" desc="Visible to website visitors" />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">Cancel</button>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? 'Update Event' : 'Create Event'}
        </button>
      </div>
    </form>
  );
};

// ─── Event Management ─────────────────────────────────────────────────────────

const displayTypeColor: Record<DisplayType, string> = {
  banner:   'bg-blue-100 text-blue-700',
  carousel: 'bg-purple-100 text-purple-700',
  ribbon:   'bg-amber-100 text-amber-700',
};

const displayTypeIcon: Record<DisplayType, React.ReactNode> = {
  banner:   <LayoutTemplate className="w-3.5 h-3.5" />,
  carousel: <ImageIcon className="w-3.5 h-3.5" />,
  ribbon:   <Radio className="w-3.5 h-3.5" />,
};

const EventManagement: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<EventItem | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [filterType, setFilterType] = useState<DisplayType | 'all'>('all');

  const load = () => {
    setLoading(true);
    api.get('/events/events/').then((d: any) => {
      const list: EventItem[] = Array.isArray(d) ? d : (d?.results ?? []);
      setEvents(list);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (evt: EventItem) => {
    try {
      const updated = await api.patch(`/events/events/${evt.id}/`, { is_active: !evt.is_active });
      setEvents(prev => prev.map(e => e.id === evt.id ? { ...e, ...(updated as Partial<EventItem>) } : e));
      setToast({ msg: `Event ${!evt.is_active ? 'activated' : 'deactivated'}.`, type: 'success' });
    } catch { setToast({ msg: 'Failed to update.', type: 'error' }); }
  };

  const deleteEvent = async (id: number) => {
    if (!confirm('Delete this event?')) return;
    try {
      await api.delete(`/events/events/${id}/`);
      setEvents(prev => prev.filter(e => e.id !== id));
      setToast({ msg: 'Event deleted.', type: 'success' });
    } catch { setToast({ msg: 'Failed to delete.', type: 'error' }); }
  };

  const onSave = (evt: EventItem) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === evt.id);
      return idx >= 0 ? prev.map(e => e.id === evt.id ? evt : e) : [evt, ...prev];
    });
    setShowForm(false);
    setEditTarget(null);
    setToast({ msg: `Event ${editTarget ? 'updated' : 'created'} successfully.`, type: 'success' });
  };

  const filtered = filterType === 'all' ? events : events.filter(e => e.display_type === filterType);

  return (
    <div className="space-y-4">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['all', 'banner', 'carousel', 'ribbon'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all
                ${filterType === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> New Event
        </button>
      </div>

      {/* Quick-help banner */}
      {!showForm && events.length === 0 && !loading && (
        <div className="p-5 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 space-y-2">
          <p className="font-semibold">How events work on your landing page:</p>
          <ul className="space-y-1 text-blue-700">
            <li className="flex gap-2"><Radio className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" /><span><strong>Ribbon</strong> — a scrolling marquee bar at the very top of the page. Great for urgent notices.</span></li>
            <li className="flex gap-2"><LayoutTemplate className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" /><span><strong>Banner</strong> — replaces the hero section image and text with your event content.</span></li>
            <li className="flex gap-2"><ImageIcon className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" /><span><strong>Carousel</strong> — adds your images to the hero slideshow. Multiple carousel events = multiple slides.</span></li>
          </ul>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <EventForm
          initial={editTarget ? {
            id: editTarget.id, title: editTarget.title, subtitle: editTarget.subtitle,
            description: editTarget.description, display_type: editTarget.display_type,
            event_type: editTarget.event_type, ribbon_text: editTarget.ribbon_text ?? '',
            ribbon_speed: editTarget.ribbon_speed ?? 'medium',
            start_date: editTarget.start_date?.slice(0, 16) ?? '',
            end_date: editTarget.end_date?.slice(0, 16) ?? '',
            cta_text: editTarget.cta_text ?? '', cta_url: editTarget.cta_url ?? '',
            is_active: editTarget.is_active, is_published: editTarget.is_published,
          } : undefined}
          onSave={onSave}
          onCancel={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-14 text-center border-2 border-dashed border-gray-200 rounded-2xl">
          <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {filterType === 'all' ? 'No events yet. Create your first event above.' : `No ${filterType} events.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(evt => (
            <div key={evt.id} className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow">
              {/* Thumbnail */}
              <div className="w-16 h-14 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                {evt.images?.[0]?.image
                  ? <img src={evt.images[0].image} alt="" className="w-full h-full object-cover" />
                  : displayTypeIcon[evt.display_type]
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-gray-900 text-sm">{evt.title}</span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${displayTypeColor[evt.display_type]}`}>
                    {displayTypeIcon[evt.display_type]} {evt.display_type}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${evt.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {evt.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {evt.display_type === 'ribbon' && evt.ribbon_text && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-0.5 inline-block mt-0.5 truncate max-w-xs">
                    "{evt.ribbon_text}"
                  </p>
                )}
                {evt.description && (
                  <p className="text-xs text-gray-500 mt-1 truncate max-w-sm">{evt.description}</p>
                )}
                {(evt.start_date || evt.end_date) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {evt.start_date && `From ${new Date(evt.start_date).toLocaleDateString()}`}
                    {evt.end_date && ` → ${new Date(evt.end_date).toLocaleDateString()}`}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggleActive(evt)} title={evt.is_active ? 'Deactivate' : 'Activate'}
                  className={`p-2 rounded-lg transition-colors ${evt.is_active ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                  {evt.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => { setEditTarget(evt); setShowForm(true); }}
                  className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteEvent(evt.id)}
                  className="p-2 bg-red-100 text-red-500 rounded-lg hover:bg-red-200 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Announcements ────────────────────────────────────────────────────────────

const EMPTY_ANN = {
  title: '', content: '', target_audience: 'all',
  priority: 'medium' as Priority, end_date: '', is_active: true, is_pinned: false,
};

const AnnouncementsManager: React.FC = () => {
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_ANN });
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/school-settings/announcements/').then((d: any) => {
      setList(Array.isArray(d) ? d : (d?.results ?? []));
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const upd = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const openNew = () => { setForm({ ...EMPTY_ANN }); setEditId(null); setShowForm(true); };
  const openEdit = (a: Announcement) => {
    setForm({ title: a.title, content: a.content, target_audience: a.target_audience,
      priority: a.priority, end_date: a.end_date?.slice(0, 16) ?? '', is_active: a.is_active, is_pinned: a.is_pinned });
    setEditId(a.id); setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) { setToast({ msg: 'Title and content are required.', type: 'error' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, end_date: form.end_date || null };
      let result: Announcement;
      if (editId) {
        result = await api.patch(`/school-settings/announcements/${editId}/`, payload);
        setList(prev => prev.map(a => a.id === editId ? result : a));
      } else {
        result = await api.post('/school-settings/announcements/', payload);
        setList(prev => [result, ...prev]);
      }
      setShowForm(false); setEditId(null);
      setToast({ msg: `Announcement ${editId ? 'updated' : 'created'}.`, type: 'success' });
    } catch { setToast({ msg: 'Save failed.', type: 'error' }); }
    finally { setSaving(false); }
  };

  const toggle = async (a: Announcement) => {
    try {
      const updated = await api.patch(`/school-settings/announcements/${a.id}/`, { is_active: !a.is_active });
      setList(prev => prev.map(x => x.id === a.id ? { ...x, ...(updated as Partial<Announcement>) } : x));
    } catch { setToast({ msg: 'Failed to update.', type: 'error' }); }
  };

  const del = async (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/school-settings/announcements/${id}/`);
      setList(prev => prev.filter(a => a.id !== id));
      setToast({ msg: 'Announcement deleted.', type: 'success' });
    } catch { setToast({ msg: 'Failed to delete.', type: 'error' }); }
  };

  const priorityColor: Record<Priority, string> = { low: 'bg-blue-100 text-blue-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' };

  return (
    <div className="space-y-4">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Announcements appear inside the portal for targeted users.</p>
        <button onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <form onSubmit={save} className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-900 text-sm">{editId ? 'Edit Announcement' : 'New Announcement'}</h3>
            <button type="button" onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title" required>
              <Inp value={form.title} onChange={e => upd({ title: e.target.value })} placeholder="Announcement title" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <Sel value={form.priority} onChange={e => upd({ priority: e.target.value as Priority })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Sel>
              </Field>
              <Field label="Target">
                <Sel value={form.target_audience} onChange={e => upd({ target_audience: e.target.value })}>
                  <option value="all">Everyone</option>
                  <option value="students">Students</option>
                  <option value="teachers">Teachers</option>
                  <option value="parents">Parents</option>
                  <option value="admins">Admins</option>
                </Sel>
              </Field>
            </div>
          </div>
          <Field label="Content" required>
            <Txt rows={3} value={form.content} onChange={e => upd({ content: e.target.value })} placeholder="Announcement message…" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Expires On (optional)">
              <Inp type="datetime-local" value={form.end_date} onChange={e => upd({ end_date: e.target.value })} />
            </Field>
            <div className="flex gap-4 items-end pb-1">
              <Toggle checked={form.is_active} onChange={v => upd({ is_active: v })} label="Active" />
              <Toggle checked={form.is_pinned} onChange={v => upd({ is_pinned: v })} label="Pinned" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">Cancel</button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : list.length === 0 ? (
        <div className="py-14 text-center border-2 border-dashed border-gray-200 rounded-2xl">
          <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(a => (
            <div key={a.id} className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm text-gray-900">{a.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[a.priority]}`}>{a.priority}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {a.is_active ? 'Active' : 'Off'}
                  </span>
                  {a.is_pinned && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Pinned</span>}
                </div>
                <p className="text-xs text-gray-500 truncate max-w-sm">{a.content}</p>
                <p className="text-xs text-gray-400 mt-1">Target: <span className="font-medium capitalize">{a.target_audience}</span></p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggle(a)} className={`p-2 rounded-lg transition-colors ${a.is_active ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                  {a.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => openEdit(a)} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => del(a.id)} className="p-2 bg-red-100 text-red-500 rounded-lg hover:bg-red-200">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Section Wrapper ──────────────────────────────────────────────────────────

const Section: React.FC<{ icon: React.ReactNode; color: string; title: string; subtitle: string; children: React.ReactNode }> = ({ icon, color, title, subtitle, children }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
    <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <h3 className="font-bold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

const Advanced: React.FC = () => (
  <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
    {/* Header */}
    <div className="flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
        <Zap className="w-5 h-5 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Advanced Settings</h1>
        <p className="text-sm text-gray-500">Portal access, events, and announcements</p>
      </div>
    </div>

    {/* Portal Settings */}
    <Section icon={<Users className="w-4 h-4 text-white" />} color="bg-gradient-to-br from-emerald-500 to-green-600"
      title="Portal Access Control" subtitle="Enable or disable student, teacher, and parent portals">
      <PortalSettings />
    </Section>

    {/* Events */}
    <Section icon={<Star className="w-4 h-4 text-white" />} color="bg-gradient-to-br from-blue-500 to-indigo-600"
      title="Event Management" subtitle="Create banners, carousel slides, and scrolling ribbon messages for your landing page">
      <EventManagement />
    </Section>

    {/* Announcements */}
    <Section icon={<Bell className="w-4 h-4 text-white" />} color="bg-gradient-to-br from-amber-500 to-orange-600"
      title="Announcements" subtitle="Send notices to students, teachers, and parents inside the portal">
      <AnnouncementsManager />
    </Section>
  </div>
);

export default Advanced;
