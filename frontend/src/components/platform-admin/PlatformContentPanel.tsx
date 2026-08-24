/**
 * Platform Content Panel
 *
 * Lets a platform admin edit the main marketing site's About and Contact
 * page copy (nuventacloud.com, not any school's own subdomain). Backed by
 * the singleton PlatformContent model - GET is public so the marketing
 * site itself can read it, PATCH is platform-admin only.
 */

import React, { useEffect, useState } from 'react';
import { Save, Plus, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/services/api';

interface ValuePair { title: string; description: string; }
interface StatPair { value: string; label: string; }

interface PlatformContentData {
  about_hero_title: string;
  about_hero_subtitle: string;
  about_mission_title: string;
  about_mission_body: string;
  about_vision_title: string;
  about_vision_body: string;
  about_story_title: string;
  about_story_body: string;
  about_values: ValuePair[];
  about_stats: StatPair[];
  contact_intro: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  contact_office_hours: string;
  updated_at?: string;
  updated_by_name?: string | null;
}

const EMPTY: PlatformContentData = {
  about_hero_title: '', about_hero_subtitle: '',
  about_mission_title: '', about_mission_body: '',
  about_vision_title: '', about_vision_body: '',
  about_story_title: '', about_story_body: '',
  about_values: [], about_stats: [],
  contact_intro: '', contact_email: '', contact_phone: '',
  contact_address: '', contact_office_hours: '',
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

const PlatformContentPanel: React.FC = () => {
  const [data, setData] = useState<PlatformContentData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/tenants/platform-content/');
        setData({ ...EMPTY, ...res });
      } catch (err: any) {
        setError(err?.message || 'Failed to load site content.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof PlatformContentData>(key: K, value: PlatformContentData[K]) =>
    setData(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.patch('/api/tenants/platform-content/', data);
      setData({ ...EMPTY, ...res });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to save. Please check the fields and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const updateValue = (i: number, patch: Partial<ValuePair>) =>
    set('about_values', data.about_values.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  const addValue = () => set('about_values', [...data.about_values, { title: '', description: '' }]);
  const removeValue = (i: number) => set('about_values', data.about_values.filter((_, idx) => idx !== i));

  const updateStat = (i: number, patch: Partial<StatPair>) =>
    set('about_stats', data.about_stats.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const addStat = () => set('about_stats', [...data.about_stats, { value: '', label: '' }]);
  const removeStat = (i: number) => set('about_stats', data.about_stats.filter((_, idx) => idx !== i));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
          <p>{error}</p>
        </div>
      )}

      {/* About page */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">About Page</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Hero Title">
            <input className={inputCls} value={data.about_hero_title}
              onChange={e => set('about_hero_title', e.target.value)}
              placeholder="e.g. Built for the way schools actually run" />
          </Field>
          <Field label="Hero Subtitle" hint="Shown under the title on the hero banner.">
            <input className={inputCls} value={data.about_hero_subtitle}
              onChange={e => set('about_hero_subtitle', e.target.value)} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Mission Title">
            <input className={inputCls} value={data.about_mission_title} onChange={e => set('about_mission_title', e.target.value)} />
          </Field>
          <Field label="Vision Title">
            <input className={inputCls} value={data.about_vision_title} onChange={e => set('about_vision_title', e.target.value)} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Mission Body">
            <textarea rows={4} className={inputCls} value={data.about_mission_body} onChange={e => set('about_mission_body', e.target.value)} />
          </Field>
          <Field label="Vision Body">
            <textarea rows={4} className={inputCls} value={data.about_vision_body} onChange={e => set('about_vision_body', e.target.value)} />
          </Field>
        </div>

        <Field label="Story Title">
          <input className={inputCls} value={data.about_story_title} onChange={e => set('about_story_title', e.target.value)} />
        </Field>
        <Field label="Story Body">
          <textarea rows={4} className={inputCls} value={data.about_story_body} onChange={e => set('about_story_body', e.target.value)} />
        </Field>

        {/* Values */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Values</label>
            <button onClick={addValue} className="text-xs font-medium text-gray-700 hover:text-black flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add value
            </button>
          </div>
          <div className="space-y-2">
            {data.about_values.map((v, i) => (
              <div key={i} className="flex gap-2 items-start bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <div className="flex-1 grid sm:grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Title (e.g. Integrity)" value={v.title}
                    onChange={e => updateValue(i, { title: e.target.value })} />
                  <input className={inputCls} placeholder="Description" value={v.description}
                    onChange={e => updateValue(i, { description: e.target.value })} />
                </div>
                <button onClick={() => removeValue(i)} className="p-2 text-gray-400 hover:text-gray-800 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {data.about_values.length === 0 && <p className="text-xs text-gray-400">No values added yet.</p>}
          </div>
        </div>

        {/* Stats */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Stats</label>
            <button onClick={addStat} className="text-xs font-medium text-gray-700 hover:text-black flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add stat
            </button>
          </div>
          <div className="space-y-2">
            {data.about_stats.map((s, i) => (
              <div key={i} className="flex gap-2 items-start bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <div className="flex-1 grid sm:grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Value (e.g. 30+)" value={s.value}
                    onChange={e => updateStat(i, { value: e.target.value })} />
                  <input className={inputCls} placeholder="Label (e.g. Schools onboarded)" value={s.label}
                    onChange={e => updateStat(i, { label: e.target.value })} />
                </div>
                <button onClick={() => removeStat(i)} className="p-2 text-gray-400 hover:text-gray-800 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {data.about_stats.length === 0 && <p className="text-xs text-gray-400">No stats added yet.</p>}
          </div>
        </div>
      </section>

      {/* Contact page */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Contact Page</h3>
        <Field label="Intro" hint="A short line shown above the contact details.">
          <textarea rows={2} className={inputCls} value={data.contact_intro} onChange={e => set('contact_intro', e.target.value)} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Email">
            <input type="email" className={inputCls} value={data.contact_email}
              onChange={e => set('contact_email', e.target.value)} placeholder="hello@nuventacloud.com" />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={data.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Address">
            <textarea rows={2} className={inputCls} value={data.contact_address} onChange={e => set('contact_address', e.target.value)} />
          </Field>
          <Field label="Office Hours">
            <input className={inputCls} value={data.contact_office_hours}
              onChange={e => set('contact_office_hours', e.target.value)} placeholder="Mon–Fri, 9am–5pm WAT" />
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {data.updated_at
            ? `Last updated ${new Date(data.updated_at).toLocaleString()}${data.updated_by_name ? ` by ${data.updated_by_name}` : ''}`
            : 'Not edited yet.'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default PlatformContentPanel;
