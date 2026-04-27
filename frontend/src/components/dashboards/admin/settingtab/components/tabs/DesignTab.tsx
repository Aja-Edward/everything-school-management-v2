import React, { useState, useEffect, useRef } from 'react';
import { Palette, Save, Loader2, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { useDesign } from '@/contexts/DesignContext';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import DesignSettingsService, { DesignSettings } from '@/services/DesignSettingsService';

interface DesignTabProps {
  onSettingsUpdate?: (settings: any) => void;
}

const themes = [
  { id: 'default',   name: 'Default',         preview: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950' },
  { id: 'modern',    name: 'Modern',           preview: 'bg-gradient-to-br from-blue-500 to-purple-600' },
  { id: 'classic',   name: 'Classic',          preview: 'bg-gradient-to-br from-slate-600 to-slate-800' },
  { id: 'vibrant',   name: 'Vibrant',          preview: 'bg-gradient-to-br from-pink-500 to-orange-500' },
  { id: 'minimal',   name: 'Minimal',          preview: 'bg-gradient-to-br from-gray-100 to-gray-200' },
  { id: 'corporate', name: 'Corporate',        preview: 'bg-gradient-to-br from-indigo-600 to-blue-700' },
  { id: 'premium',   name: 'Premium',          preview: 'bg-gradient-to-br from-rose-950 via-slate-950 to-blue-950' },
  { id: 'dark',      name: 'Dark',             preview: 'bg-gradient-to-br from-gray-900 to-gray-800' },
  { id: 'obsidian',  name: 'Obsidian',         preview: 'bg-gradient-to-br from-gray-950 via-black to-slate-950' },
  { id: 'aurora',    name: 'Aurora',           preview: 'bg-gradient-to-br from-indigo-950 via-violet-950 to-pink-950' },
  { id: 'midnight',  name: 'Midnight',         preview: 'bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950' },
  { id: 'crimson',   name: 'Crimson',          preview: 'bg-gradient-to-br from-red-950 via-rose-950 to-pink-950' },
  { id: 'forest',    name: 'Forest',           preview: 'bg-gradient-to-br from-green-950 via-emerald-950 to-teal-950' },
  { id: 'golden',    name: 'Golden',           preview: 'bg-gradient-to-br from-yellow-950 via-amber-950 to-orange-950' },
];

const fonts = [
  { value: 'Inter',       label: 'Inter',         sample: 'Aa' },
  { value: 'Roboto',      label: 'Roboto',        sample: 'Aa' },
  { value: 'Open Sans',   label: 'Open Sans',     sample: 'Aa' },
  { value: 'Poppins',     label: 'Poppins',       sample: 'Aa' },
  { value: 'Montserrat',  label: 'Montserrat',    sample: 'Aa' },
];

const DEFAULTS: Pick<DesignSettings, 'primary_color' | 'theme' | 'typography'> = {
  primary_color: '#3B82F6',
  theme: 'default',
  typography: 'Inter',
};

const DesignTab: React.FC<DesignTabProps> = ({ onSettingsUpdate }) => {
  const { updateSettings: updateDesignCtx } = useDesign();

  const [s, setS] = useState(DEFAULTS);
  const [orig, setOrig] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
    DesignSettingsService.getDesignSettings().then(d => {
      const cur = { primary_color: d.primary_color, theme: d.theme, typography: d.typography };
      setS(cur); setOrig(cur);
      DesignSettingsService.applyDesignSettings(d);
      updateDesignCtx(d);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const changed = JSON.stringify(s) !== JSON.stringify(orig);

  const save = async () => {
    setSaving(true);
    try {
      const full = await DesignSettingsService.getDesignSettings();
      const payload = { ...full, ...s };
      const saved = await DesignSettingsService.updateDesignSettings(payload);
      DesignSettingsService.applyDesignSettings(saved);
      updateDesignCtx(saved);
      const next = { primary_color: saved.primary_color, theme: saved.theme, typography: saved.typography };
      setOrig(next); setS(next);
      setToast({ msg: 'Design saved!', ok: true });
      if (onSettingsUpdate) onSettingsUpdate(saved);
    } catch {
      setToast({ msg: 'Failed to save. Please try again.', ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const reset = () => { setS({ ...DEFAULTS }); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white
          ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl flex items-center justify-center">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Design</h2>
            <p className="text-xs text-gray-500">Theme, colour, and font — applied across the entire portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} title="Reset to defaults"
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
          {changed && (
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* ── Theme ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Theme</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {themes.map(t => (
            <button key={t.id} onClick={() => setS(p => ({ ...p, theme: t.id as DesignSettings['theme'] }))}
              className={`group relative rounded-2xl overflow-hidden border-2 transition-all focus:outline-none
                ${s.theme === t.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-gray-300'}`}>
              {/* Preview swatch */}
              <div className={`h-16 w-full ${t.preview}`} />
              {/* Label */}
              <div className={`py-2 px-2 text-center text-xs font-medium truncate
                ${s.theme === t.id ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700'}`}>
                {t.name}
              </div>
              {/* Selected indicator */}
              {s.theme === t.id && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── Primary Colour ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Primary Colour</h3>
        <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100 max-w-sm">
          {/* Native colour picker */}
          <label className="cursor-pointer">
            <div
              className="w-14 h-14 rounded-xl border-2 border-white shadow-md transition-transform hover:scale-105"
              style={{ backgroundColor: s.primary_color }}
            />
            <input type="color" value={s.primary_color}
              onChange={e => setS(p => ({ ...p, primary_color: e.target.value }))}
              className="sr-only" />
          </label>

          {/* Hex input */}
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1 font-medium">Hex value</p>
            <input type="text" value={s.primary_color}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setS(p => ({ ...p, primary_color: v }));
              }}
              className="w-full font-mono text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Live preview dot */}
          <div className="w-8 h-8 rounded-full shadow-inner"
            style={{ background: `radial-gradient(circle at 35% 35%, ${s.primary_color}cc, ${s.primary_color})` }} />
        </div>

        {/* Quick colour palette */}
        <div className="flex flex-wrap gap-2 mt-3">
          {['#3B82F6','#8B5CF6','#EF4444','#F97316','#10B981','#06B6D4','#EC4899','#6366F1','#84CC16','#F59E0B','#1E293B','#334155'].map(c => (
            <button key={c} onClick={() => setS(p => ({ ...p, primary_color: c }))}
              title={c}
              className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 focus:outline-none
                ${s.primary_color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </section>

      {/* ── Typography ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Typography</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {fonts.map(f => (
            <button key={f.value} onClick={() => setS(p => ({ ...p, typography: f.value as DesignSettings['typography'] }))}
              className={`p-4 rounded-xl border-2 text-left transition-all focus:outline-none
                ${s.typography === f.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
              <span className="block text-2xl font-bold text-gray-800 mb-1" style={{ fontFamily: f.value }}>
                Aa
              </span>
              <span className={`text-sm font-medium ${s.typography === f.value ? 'text-blue-700' : 'text-gray-600'}`}>
                {f.label}
              </span>
              <p className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: f.value }}>
                The quick brown fox
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Unsaved indicator */}
      {changed && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <p className="text-sm text-amber-600 font-medium">You have unsaved changes</p>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DesignTab;
