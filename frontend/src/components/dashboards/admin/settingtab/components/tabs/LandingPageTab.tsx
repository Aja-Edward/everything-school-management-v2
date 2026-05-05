import React, { useEffect, useState, useRef } from 'react';
import LandingPageService, {
  TenantLandingPage, LandingSection, NavigationLink, SectionType, CarouselSlide,
} from '@/services/LandingPageService';
import { useTenant } from '@/contexts/TenantContext';
import {
  Globe, Eye, EyeOff, Plus, Trash2, GripVertical, Save, Upload,
  Image, ChevronDown, ChevronUp, CheckCircle,
  Layout, Navigation, Type, MapPin, Layers, AlertCircle, Megaphone, ImagePlus,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sectionLabel: Record<SectionType, string> = {
  about: 'About Us',
  admissions: 'Admissions',
  contact: 'Contact',
  school_activities: 'School Activities',
  custom: 'Custom Section',
};

const sectionIcon: Record<SectionType, React.ReactNode> = {
  about: <Layers className="w-4 h-4" />,
  admissions: <CheckCircle className="w-4 h-4" />,
  contact: <MapPin className="w-4 h-4" />,
  school_activities: <Globe className="w-4 h-4" />,
  custom: <Type className="w-4 h-4" />,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">{label}</label>
    {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
    {children}
  </div>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props}
    className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400
      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${props.className ?? ''}`} />
);

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea {...props}
    className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400
      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none ${props.className ?? ''}`} />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props}
    className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800
      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${props.className ?? ''}`} />
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2.5 cursor-pointer">
    <div className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      onClick={() => onChange(!checked)}>
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </div>
    <span className="text-sm text-gray-700 font-medium">{label}</span>
  </label>
);

// ─── Section Editor ───────────────────────────────────────────────────────────

const BANNER_SECTION_TYPES: SectionType[] = ['about', 'admissions', 'contact', 'school_activities'];

const SectionEditor: React.FC<{
  section: LandingSection;
  onChange: (updated: LandingSection) => void;
  onDelete: () => void;
  onUploadImage: (id: number, file: File) => Promise<void>;
  onUploadBannerImage: (id: number, file: File) => Promise<void>;
}> = ({ section, onChange, onDelete, onUploadImage, onUploadBannerImage }) => {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const upd = (patch: Partial<LandingSection>) => onChange({ ...section, ...patch });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !section.id) return;
    setUploading(true);
    try { await onUploadImage(section.id, file); } finally { setUploading(false); }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !section.id) return;
    setBannerUploading(true);
    try { await onUploadBannerImage(section.id, file); } finally { setBannerUploading(false); }
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-gray-500">{sectionIcon[section.section_type]}</span>
          <span className="text-sm font-semibold text-gray-700 truncate">
            {section.title || sectionLabel[section.section_type]}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${section.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {section.is_enabled ? 'Visible' : 'Hidden'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => upd({ is_enabled: !section.is_enabled })}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors" title="Toggle visibility">
            {section.is_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setOpen(!open)}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title">
              <Input value={section.title} onChange={e => upd({ title: e.target.value })} placeholder="Section title" />
            </Field>
            <Field label="Subtitle">
              <Input value={section.subtitle ?? ''} onChange={e => upd({ subtitle: e.target.value })} placeholder="Optional subtitle" />
            </Field>
          </div>

          <Field label="Content" hint="Plain text or markdown-style content">
            <Textarea rows={5} value={section.content ?? ''} onChange={e => upd({ content: e.target.value })} placeholder="Write your content here…" />
          </Field>

          {/* Banner image — only for pages that have a dedicated full page */}
          {BANNER_SECTION_TYPES.includes(section.section_type) && (
            <Field
              label="Page Banner Image"
              hint={`Full-width image shown at the top of the dedicated ${section.section_type} page. Recommended: 1440×400px.`}
            >
              <div className="space-y-3">
                {section.banner_image && (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img src={section.banner_image} alt="Banner" className="w-full h-28 object-cover" />
                    <button
                      onClick={() => upd({ banner_image: undefined })}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-lg hover:bg-red-600 transition-colors"
                      title="Remove banner">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                <button
                  onClick={() => bannerFileRef.current?.click()}
                  disabled={bannerUploading || !section.id}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50">
                  <Upload className="w-3.5 h-3.5" />
                  {bannerUploading ? 'Uploading…' : section.banner_image ? 'Replace Banner' : 'Upload Banner'}
                </button>
                {!section.id && (
                  <p className="text-xs text-amber-600">Save the section first before uploading a banner.</p>
                )}
              </div>
            </Field>
          )}

          {/* Section body image */}
          <Field label="Section Image" hint="Shown inside the section content on the main landing page.">
            <div className="flex gap-3 items-start">
              {section.image && (
                <img src={section.image} alt="" className="w-24 h-16 object-cover rounded-lg border border-gray-200 shrink-0" />
              )}
              <div className="flex-1">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading || !section.id}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading…' : section.image ? 'Replace Image' : 'Upload Image'}
                </button>
                {section.image && (
                  <button onClick={() => upd({ image: undefined })}
                    className="ml-2 text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                )}
                {!section.id && (
                  <p className="text-xs text-amber-600 mt-1">Save the section first before uploading an image.</p>
                )}
              </div>
            </div>
          </Field>

          {/* Contact-specific fields */}
          {section.section_type === 'contact' && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Address">
                  <Textarea rows={2} value={section.contact_address ?? ''} onChange={e => upd({ contact_address: e.target.value })} placeholder="School address" />
                </Field>
                <div className="space-y-4">
                  <Field label="Phone Numbers" hint="Add as many numbers as needed">
                    {(() => {
                      const phones = (section.contact_phone ?? '').split('\n').filter(p => p.trim() !== '');
                      const setPhones = (updated: string[]) => upd({ contact_phone: updated.join('\n') });
                      return (
                        <div className="space-y-2">
                          {phones.map((ph, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={ph}
                                onChange={e => {
                                  const next = [...phones];
                                  next[i] = e.target.value;
                                  setPhones(next);
                                }}
                                placeholder="+234 800 000 0000"
                              />
                              <button
                                type="button"
                                onClick={() => setPhones(phones.filter((_, idx) => idx !== i))}
                                className="shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Remove"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setPhones([...phones, ''])}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14"/></svg>
                            Add Phone Number
                          </button>
                        </div>
                      );
                    })()}
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={section.contact_email ?? ''} onChange={e => upd({ contact_email: e.target.value })} placeholder="school@example.com" />
                  </Field>
                </div>
                <Field label="Office Hours">
                  <Input value={section.contact_hours ?? ''} onChange={e => upd({ contact_hours: e.target.value })} placeholder="Mon–Fri 8am–5pm" />
                </Field>
                <Field label="Google Maps Embed URL">
                  <Input value={section.contact_map_embed ?? ''} onChange={e => upd({ contact_map_embed: e.target.value })} placeholder="https://maps.google.com/maps?..." />
                </Field>
              </div>
            </div>
          )}

          {/* Admissions-specific fields */}
          {section.section_type === 'admissions' && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Admissions Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Application Deadline">
                  <Input type="date" value={section.admissions_deadline ?? ''} onChange={e => upd({ admissions_deadline: e.target.value })} />
                </Field>
                <Field label="Application Fee">
                  <Input value={section.admissions_fee ?? ''} onChange={e => upd({ admissions_fee: e.target.value })} placeholder="e.g. ₦5,000" />
                </Field>
                <Field label="Contact Person Name">
                  <Input value={section.admissions_contact_name ?? ''} onChange={e => upd({ admissions_contact_name: e.target.value })} placeholder="Mrs. Johnson" />
                </Field>
                <Field label="Contact Email">
                  <Input type="email" value={section.admissions_contact_email ?? ''} onChange={e => upd({ admissions_contact_email: e.target.value })} placeholder="admissions@school.edu" />
                </Field>
                <Field label="Contact Phone">
                  <Input value={section.admissions_contact_phone ?? ''} onChange={e => upd({ admissions_contact_phone: e.target.value })} placeholder="+234 800 000 0000" />
                </Field>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── NavLink Editor ───────────────────────────────────────────────────────────

const NavLinkEditor: React.FC<{
  link: NavigationLink;
  onChange: (updated: NavigationLink) => void;
  onDelete: () => void;
}> = ({ link, onChange, onDelete }) => {
  const upd = (patch: Partial<NavigationLink>) => onChange({ ...link, ...patch });

  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
      <GripVertical className="w-4 h-4 text-gray-400 cursor-grab shrink-0" />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
        <Input value={link.label} onChange={e => upd({ label: e.target.value })} placeholder="Label" />
        <Input value={link.url} onChange={e => upd({ url: e.target.value })} placeholder="URL or /path" className="sm:col-span-2" />
        <Select value={link.link_type} onChange={e => upd({ link_type: e.target.value as any })}>
          <option value="internal">Internal</option>
          <option value="section">Section</option>
          <option value="external">External</option>
        </Select>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Toggle checked={link.is_enabled} onChange={v => upd({ is_enabled: v })} label="" />
        <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ─── Main Tab ─────────────────────────────────────────────────────────────────

type TabKey = 'general' | 'hero' | 'ribbon' | 'sections' | 'stats' | 'navigation' | 'footer';

const LandingPageTab: React.FC = () => {
  const { settings } = useTenant();
  const primaryColor = settings?.primary_color || '#1e40af';

  const [landing, setLanding] = useState<TenantLandingPage | null>(null);
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [navLinks, setNavLinks] = useState<NavigationLink[]>([]);
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heroFileRef = useRef<HTMLInputElement>(null);
  const carouselFileRef = useRef<HTMLInputElement>(null);
  const [heroUploading, setHeroUploading] = useState(false);
  const [carouselUploading, setCarouselUploading] = useState(false);

  useEffect(() => {
    LandingPageService.getAdmin()
      .then(d => {
        setLanding(d);
        setSections([...d.sections].sort((a, b) => a.display_order - b.display_order));
        setNavLinks([...d.nav_links].sort((a, b) => a.display_order - b.display_order));
        setCarouselSlides([...(d.carousel_images ?? [])].sort((a, b) => a.display_order - b.display_order));
      })
      .catch(() => setError('Could not load landing page settings.'));
  }, []);

  const save = async () => {
    if (!landing) return;
    setSaving(true);
    setError(null);
    try {
      // Save main settings
      await LandingPageService.update({
        is_published: landing.is_published,
        hero_type: landing.hero_type,
        hero_image: landing.hero_image,
        hero_title: landing.hero_title,
        hero_subtitle: landing.hero_subtitle,
        hero_cta_text: landing.hero_cta_text,
        hero_cta_url: landing.hero_cta_url,
        hero_secondary_cta_text: landing.hero_secondary_cta_text,
        hero_secondary_cta_url: landing.hero_secondary_cta_url,
        ribbon_enabled: landing.ribbon_enabled,
        ribbon_text: landing.ribbon_text,
        ribbon_speed: landing.ribbon_speed,
        // Stats
        stats_enabled: landing.stats_enabled,
        stat_1_label: landing.stat_1_label,
        stat_1_value: landing.stat_1_value,
        stat_2_label: landing.stat_2_label,
        stat_2_value: landing.stat_2_value,
        stat_3_label: landing.stat_3_label,
        stat_3_value: landing.stat_3_value,
        stat_4_label: landing.stat_4_label,
        stat_4_value: landing.stat_4_value,
        footer_text: landing.footer_text,
        facebook_url: landing.facebook_url,
        twitter_url: landing.twitter_url,
        instagram_url: landing.instagram_url,
        youtube_url: landing.youtube_url,
      });

      // Save / update sections — capture real IDs for newly-created sections
      const savedSections: LandingSection[] = [];
      for (const s of sections) {
        if (s.id) {
          const updated = await LandingPageService.updateSection(s.id, s);
          savedSections.push(updated ?? s);
        } else {
          const created = await LandingPageService.createSection(s);
          savedSections.push(created);
        }
      }
      setSections(savedSections);

      // Save / update nav links
      for (const l of navLinks) {
        if (l.id) {
          await LandingPageService.updateNavLink(l.id, l);
        } else {
          await LandingPageService.createNavLink(l);
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addSection = (type: SectionType) => {
    const next: LandingSection = {
      id: 0,
      section_type: type,
      title: sectionLabel[type],
      is_enabled: true,
      display_order: sections.length,
    };
    setSections(prev => [...prev, next]);
  };

  const updateSection = (index: number, updated: LandingSection) =>
    setSections(prev => prev.map((s, i) => (i === index ? updated : s)));

  const deleteSection = async (index: number) => {
    const s = sections[index];
    if (s.id) await LandingPageService.deleteSection(s.id).catch(() => {});
    setSections(prev => prev.filter((_, i) => i !== index));
  };

  const uploadSectionImage = async (id: number, file: File) => {
    const url = await LandingPageService.uploadSectionImage(id, file);
    setSections(prev => prev.map(s => (s.id === id ? { ...s, image: url } : s)));
  };

  const uploadSectionBannerImage = async (id: number, file: File) => {
    const url = await LandingPageService.uploadSectionBannerImage(id, file);
    setSections(prev => prev.map(s => (s.id === id ? { ...s, banner_image: url } : s)));
  };

  const addNavLink = () => {
    const next: NavigationLink = {
      id: 0, label: '', url: '/', link_type: 'internal',
      open_in_new_tab: false, is_enabled: true, display_order: navLinks.length,
    };
    setNavLinks(prev => [...prev, next]);
  };

  const updateNavLink = (index: number, updated: NavigationLink) =>
    setNavLinks(prev => prev.map((l, i) => (i === index ? updated : l)));

  const deleteNavLink = async (index: number) => {
    const l = navLinks[index];
    if (l.id) await LandingPageService.deleteNavLink(l.id).catch(() => {});
    setNavLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !landing) return;
    setHeroUploading(true);
    try {
      const url = await LandingPageService.uploadHeroImage(file);
      setLanding(l => l ? { ...l, hero_image: url } : l);
    } finally { setHeroUploading(false); }
  };

  const handleCarouselUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (carouselSlides.length >= 5) { setError('Maximum 5 carousel images allowed.'); return; }
    setCarouselUploading(true);
    try {
      const slide = await LandingPageService.uploadCarouselImage(file);
      setCarouselSlides(prev => [...prev, slide]);
    } catch { setError('Carousel upload failed.'); }
    finally { setCarouselUploading(false); e.target.value = ''; }
  };

  const deleteCarouselSlide = async (id: number) => {
    await LandingPageService.deleteCarouselImage(id).catch(() => {});
    setCarouselSlides(prev => prev.filter(s => s.id !== id));
  };

  const upd = (patch: Partial<TenantLandingPage>) =>
    setLanding(l => l ? { ...l, ...patch } : l);

  if (!landing && !error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !landing) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'general', label: 'General', icon: <Globe className="w-4 h-4" /> },
    { key: 'hero', label: 'Hero', icon: <Image className="w-4 h-4" /> },
    { key: 'ribbon', label: 'Ribbon', icon: <Megaphone className="w-4 h-4" /> },
    { key: 'sections', label: 'Sections', icon: <Layers className="w-4 h-4" /> },
    { key: 'stats', label: 'Stats', icon: <CheckCircle className="w-4 h-4" /> },
    { key: 'navigation', label: 'Navigation', icon: <Navigation className="w-4 h-4" /> },
    { key: 'footer', label: 'Footer', icon: <Layout className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Landing Page</h2>
          <p className="text-sm text-gray-500 mt-0.5">Design your school's public-facing website</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Publish toggle */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium cursor-pointer transition-colors
            ${landing?.is_published ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
            onClick={() => upd({ is_published: !landing?.is_published })}>
            {landing?.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {landing?.is_published ? 'Published' : 'Draft'}
          </div>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}>
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
              ${activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── GENERAL TAB ── */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <h3 className="font-semibold text-gray-900">Publication Status</h3>
            <div className={`p-4 rounded-xl border-2 ${landing?.is_published ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-2 h-2 rounded-full ${landing?.is_published ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <div>
                  <p className="font-semibold text-sm text-gray-800">
                    {landing?.is_published ? 'Your landing page is live' : 'Your landing page is in draft mode'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {landing?.is_published
                      ? 'Visitors can see your public school website.'
                      : 'Only you can preview it. Toggle to publish when ready.'}
                  </p>
                </div>
              </div>
            </div>
            <Toggle
              checked={landing?.is_published ?? false}
              onChange={v => upd({ is_published: v })}
              label={landing?.is_published ? 'Published — click to unpublish' : 'Draft — click to publish'}
            />
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
            <p className="font-medium mb-1">Preview your landing page</p>
            <p className="text-blue-600 text-xs">Open your school subdomain in a new tab to see the live preview. Admins can see unpublished pages.</p>
          </div>
        </div>
      )}

      {/* ── HERO TAB ── */}
      {activeTab === 'hero' && (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <h3 className="font-semibold text-gray-900">Hero Display Type</h3>
            <div className="grid grid-cols-2 gap-4">
              {(['static', 'carousel'] as const).map(type => (
                <button key={type} onClick={() => upd({ hero_type: type })}
                  className={`p-4 rounded-xl border-2 text-left transition-all
                    ${landing?.hero_type === type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-semibold text-sm text-gray-800 capitalize mb-1">{type === 'static' ? 'Static Image' : 'Carousel (Slideshow)'}</div>
                  <p className="text-xs text-gray-500">
                    {type === 'static' ? 'One background image or color gradient' : 'Cycle through event carousel images'}
                  </p>
                </button>
              ))}
            </div>

            {landing?.hero_type === 'static' && (
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <Field label="Hero Background Image">
                  <div className="space-y-3">
                    {landing.hero_image && (
                      <div className="relative">
                        <img src={landing.hero_image} alt="Hero" className="w-full h-40 object-cover rounded-xl" />
                        <button onClick={() => upd({ hero_image: undefined })}
                          className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-lg hover:bg-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <input ref={heroFileRef} type="file" accept="image/*" className="hidden" onChange={handleHeroUpload} />
                    <button onClick={() => heroFileRef.current?.click()} disabled={heroUploading}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                      <Upload className="w-4 h-4" />
                      {heroUploading ? 'Uploading…' : landing.hero_image ? 'Replace Image' : 'Upload Image'}
                    </button>
                  </div>
                </Field>
              </div>
            )}

            {landing?.hero_type === 'carousel' && (
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Carousel Images</p>
                    <p className="text-xs text-gray-400 mt-0.5">Upload up to 5 images. They cycle automatically every 5 seconds.</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${carouselSlides.length >= 5 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                    {carouselSlides.length} / 5
                  </span>
                </div>

                {/* Existing slides */}
                {carouselSlides.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {carouselSlides.map((slide, i) => (
                      <div key={slide.id} className="relative group rounded-xl overflow-hidden border border-gray-200">
                        <img src={slide.image} alt={slide.title || `Slide ${i + 1}`} className="w-full h-28 object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                        <button
                          onClick={() => deleteCarouselSlide(slide.id)}
                          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {slide.title && (
                          <p className="absolute bottom-0 left-0 right-0 text-white text-xs font-medium px-2 py-1 bg-black/50 truncate">
                            {slide.title}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                {carouselSlides.length < 5 && (
                  <>
                    <input
                      ref={carouselFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCarouselUpload}
                    />
                    <button
                      onClick={() => carouselFileRef.current?.click()}
                      disabled={carouselUploading}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm border-2 border-dashed border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 text-blue-600 transition-colors disabled:opacity-50 w-full justify-center"
                    >
                      <ImagePlus className="w-4 h-4" />
                      {carouselUploading ? 'Uploading…' : 'Add Carousel Image'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <h3 className="font-semibold text-gray-900">Hero Text</h3>
            <div className="grid grid-cols-1 gap-4">
              <Field label="Main Title" hint="Leave blank to use your school name">
                <Input value={landing?.hero_title ?? ''} onChange={e => upd({ hero_title: e.target.value })} placeholder="e.g. Excellence in Education" />
              </Field>
              <Field label="Subtitle / Tagline" hint="Shown below the title">
                <Textarea rows={3} value={landing?.hero_subtitle ?? ''} onChange={e => upd({ hero_subtitle: e.target.value })} placeholder="e.g. Nurturing minds, shaping futures since 2005" />
              </Field>
            </div>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <h3 className="font-semibold text-gray-900">Call-to-Action Buttons</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Primary Button Text">
                <Input value={landing?.hero_cta_text ?? ''} onChange={e => upd({ hero_cta_text: e.target.value })} placeholder="Enter Portal" />
              </Field>
              <Field label="Primary Button URL">
                <Input value={landing?.hero_cta_url ?? ''} onChange={e => upd({ hero_cta_url: e.target.value })} placeholder="/login" />
              </Field>
              <Field label="Secondary Button Text (optional)">
                <Input value={landing?.hero_secondary_cta_text ?? ''} onChange={e => upd({ hero_secondary_cta_text: e.target.value })} placeholder="Learn More" />
              </Field>
              <Field label="Secondary Button URL">
                <Input value={landing?.hero_secondary_cta_url ?? ''} onChange={e => upd({ hero_secondary_cta_url: e.target.value })} placeholder="/about" />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ── RIBBON TAB ── */}
      {activeTab === 'ribbon' && (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Scrolling Ribbon Banner</h3>
                <p className="text-xs text-gray-500 mt-0.5">A thin scrolling text strip shown above the navbar</p>
              </div>
              <Toggle
                checked={landing?.ribbon_enabled ?? false}
                onChange={v => upd({ ribbon_enabled: v })}
                label={landing?.ribbon_enabled ? 'Enabled' : 'Disabled'}
              />
            </div>

            {landing?.ribbon_enabled && (
              <div className="space-y-4 pt-2">
                <Field label="Ribbon Text" hint="The message that scrolls across the ribbon">
                  <Input
                    value={landing.ribbon_text ?? ''}
                    onChange={e => upd({ ribbon_text: e.target.value })}
                    placeholder="e.g. 🎓 Now accepting applications for 2025/2026 session!"
                  />
                </Field>

                <Field label="Scroll Speed">
                  <div className="grid grid-cols-3 gap-3">
                    {(['slow', 'medium', 'fast'] as const).map(speed => (
                      <button
                        key={speed}
                        onClick={() => upd({ ribbon_speed: speed })}
                        className={`p-3 rounded-xl border-2 text-sm font-medium capitalize transition-all ${
                          landing.ribbon_speed === speed
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {speed}
                      </button>
                    ))}
                  </div>
                </Field>

                {landing.ribbon_text && (
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-2 bg-gray-50 border-b border-gray-200">
                      Preview
                    </p>
                    <div className="overflow-hidden py-2" style={{ backgroundColor: primaryColor }}>
                      <style>{`
                        @keyframes ribbon-preview {
                          0% { transform: translateX(0); }
                          100% { transform: translateX(-50%); }
                        }
                        .ribbon-preview-track {
                          display: flex;
                          width: max-content;
                          animation: ribbon-preview ${{ slow: '40s', medium: '22s', fast: '12s' }[landing.ribbon_speed ?? 'medium']} linear infinite;
                          white-space: nowrap;
                        }
                      `}</style>
                      <div className="ribbon-preview-track">
                        <span className="text-white text-sm font-semibold tracking-wide px-4">
                          {Array(6).fill(landing.ribbon_text).join('   ✦   ')}
                          &nbsp;&nbsp;&nbsp;✦&nbsp;&nbsp;&nbsp;
                          {Array(6).fill(landing.ribbon_text).join('   ✦   ')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            <p className="font-medium mb-1">Event-based ribbons</p>
            <p className="text-xs text-amber-600">
              For time-limited announcements, go to <strong>Advanced → Event Management</strong> and create an event with display type "Ribbon". Event ribbons override this setting while active.
            </p>
          </div>
        </div>
      )}

      {/* ── SECTIONS TAB ── */}
      {activeTab === 'sections' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Add and configure content sections for your landing page.</p>
            <div className="flex gap-2 flex-wrap justify-end">
              {(['about', 'admissions', 'contact', 'school_activities', 'custom'] as SectionType[]).map(type => (
                <button key={type} onClick={() => addSection(type)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> {sectionLabel[type]}
                </button>
              ))}
            </div>
          </div>

          {sections.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl">
              <Layers className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">No sections yet. Add your first section above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((section, i) => (
                <SectionEditor
                  key={section.id || `new-${i}`}
                  section={section}
                  onChange={updated => updateSection(i, updated)}
                  onDelete={() => deleteSection(i)}
                  onUploadImage={uploadSectionImage}
                  onUploadBannerImage={uploadSectionBannerImage}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {activeTab === 'stats' && (
        <div className="space-y-5">
          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Stats Strip</h3>
              <Toggle
                checked={landing?.stats_enabled ?? true}
                onChange={v => upd({ stats_enabled: v })}
                label={landing?.stats_enabled ? 'Visible' : 'Hidden'}
              />
            </div>
            <p className="text-xs text-gray-400">
              The stats strip appears below the hero on your landing page. You can edit the label and value for each stat, or hide the strip entirely.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([1, 2, 3, 4] as const).map(n => (
                <div key={n} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stat {n}</p>
                  <Field label="Label">
                    <Input
                      value={(landing as any)?.[`stat_${n}_label`] ?? ''}
                      onChange={e => upd({ [`stat_${n}_label`]: e.target.value } as any)}
                      placeholder={['Students', 'Teachers', 'Programmes', 'Years of Excellence'][n - 1]}
                    />
                  </Field>
                  <Field label="Value">
                    <Input
                      value={(landing as any)?.[`stat_${n}_value`] ?? ''}
                      onChange={e => upd({ [`stat_${n}_value`]: e.target.value } as any)}
                      placeholder={['1,000+', '80+', '20+', '15+'][n - 1]}
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── NAVIGATION TAB ── */}
      {activeTab === 'navigation' && (
        <div className="space-y-4">
          {/* Quick presets */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Add</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'About', url: '/about', link_type: 'internal' as const },
                { label: 'Contact', url: '/contact', link_type: 'internal' as const },
                { label: 'Admissions', url: '/admissions', link_type: 'internal' as const },
                { label: 'School Activities', url: '/school_activities', link_type: 'internal' as const },
                { label: 'Portal Login', url: '/login', link_type: 'internal' as const },
              ].map(preset => (
                <button
                  key={preset.label}
                  onClick={() => setNavLinks(prev => [
                    ...prev,
                    { id: 0, label: preset.label, url: preset.url, link_type: preset.link_type, open_in_new_tab: false, is_enabled: true, display_order: prev.length },
                  ])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 text-gray-700 transition-colors"
                >
                  <Plus className="w-3 h-3" /> {preset.label}
                </button>
              ))}
              <button
                onClick={addNavLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-dashed border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Plus className="w-3 h-3" /> Custom Link
              </button>
            </div>
            <p className="text-xs text-gray-400">The "Portal Login" button is always shown in the navbar — adding it here creates an extra link.</p>
          </div>

          {navLinks.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl">
              <Navigation className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No links yet. Use the quick-add buttons above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-4 gap-2 px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <span>Label</span><span className="col-span-2">URL</span><span>Type</span>
              </div>
              {navLinks.map((link, i) => (
                <NavLinkEditor
                  key={link.id || `new-${i}`}
                  link={link}
                  onChange={updated => updateNavLink(i, updated)}
                  onDelete={() => deleteNavLink(i)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FOOTER TAB ── */}
      {activeTab === 'footer' && (
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <h3 className="font-semibold text-gray-900">Footer Text</h3>
            <Field label="Short description shown in footer" hint="Keep it brief — 1-2 sentences">
              <Textarea rows={3} value={landing?.footer_text ?? ''} onChange={e => upd({ footer_text: e.target.value })}
                placeholder="We are committed to providing quality education and holistic development." />
            </Field>
          </div>

          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <h3 className="font-semibold text-gray-900">Social Media Links</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Facebook URL">
                <Input value={landing?.facebook_url ?? ''} onChange={e => upd({ facebook_url: e.target.value })} placeholder="https://facebook.com/yourschool" />
              </Field>
              <Field label="Twitter / X URL">
                <Input value={landing?.twitter_url ?? ''} onChange={e => upd({ twitter_url: e.target.value })} placeholder="https://twitter.com/yourschool" />
              </Field>
              <Field label="Instagram URL">
                <Input value={landing?.instagram_url ?? ''} onChange={e => upd({ instagram_url: e.target.value })} placeholder="https://instagram.com/yourschool" />
              </Field>
              <Field label="YouTube URL">
                <Input value={landing?.youtube_url ?? ''} onChange={e => upd({ youtube_url: e.target.value })} placeholder="https://youtube.com/yourschool" />
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPageTab;
