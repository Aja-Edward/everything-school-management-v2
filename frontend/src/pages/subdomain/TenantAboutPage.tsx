import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import LandingPageService, { TenantLandingPage, LandingSection } from '@/services/LandingPageService';
import TenantNavbar from '@/components/tenant/TenantNavbar';
import TenantFooter from '@/components/tenant/TenantFooter';
import RibbonBanner from '@/components/tenant/RibbonBanner';
import { GraduationCap, ArrowLeft, CheckCircle } from 'lucide-react';
import api from '@/services/api';

const TenantAboutPage: React.FC = () => {
  const { tenant, settings } = useTenant();
  const [landing, setLanding] = useState<TenantLandingPage | null>(null);
  const [section, setSection] = useState<LandingSection | null>(null);
  const [ribbonText, setRibbonText] = useState<string | null>(null);
  const [ribbonSpeed, setRibbonSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');

  const primaryColor = settings?.primary_color || '#1e40af';

  useEffect(() => {
    LandingPageService.getPublic().then(d => {
      setLanding(d);
      setSection(d.sections.find(s => s.section_type === 'about' && s.is_enabled) ?? null);
      if (d.ribbon_enabled && d.ribbon_text) {
        setRibbonText(d.ribbon_text);
        setRibbonSpeed(d.ribbon_speed ?? 'medium');
      }
    }).catch(() => {});
    api.get('/events/events/?is_active=true&is_published=true&display_type=ribbon')
      .then((d: any) => {
        const evt = (d?.results ?? d)?.[0];
        if (evt) { setRibbonText(evt.ribbon_text || evt.title); setRibbonSpeed(evt.ribbon_speed ?? 'medium'); }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {ribbonText && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <RibbonBanner text={ribbonText} speed={ribbonSpeed} primaryColor={primaryColor} />
        </div>
      )}
      <div>
        <TenantNavbar schoolName={tenant?.name ?? ''} logo={settings?.logo} primaryColor={primaryColor} navLinks={landing?.nav_links ?? []} portalLabel="Portal Login" ribbonVisible={!!ribbonText} />
      </div>

      {/* Page header / banner */}
      {section?.banner_image ? (
        <div className="relative pt-20">
          <img
            src={section.banner_image}
            alt={section.title}
            className="w-full h-64 sm:h-80 object-cover"
          />
          <div className="absolute inset-0 bg-black/45 flex flex-col justify-end pb-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto w-full">
              <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-4 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Link>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">
                { 'About Us Improved the'}
                Edward Aja is here
              </h1>
              {section.subtitle && (
                <p className="text-lg text-white/80 max-w-2xl">{section.subtitle}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="pt-28 pb-16 px-4 sm:px-6 lg:px-8"
          style={{ background: `linear-gradient(135deg, ${primaryColor}15 0%, #f8fafc 100%)` }}>
          <div className="max-w-7xl mx-auto">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3">
              {section?.title ?? 'About Us'}
            </h1>
            {section?.subtitle && (
              <p className="text-xl text-gray-600 max-w-2xl">{section.subtitle}</p>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {section ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-14">
            <div className="lg:col-span-3 space-y-8">
              {section.image && (
                <img src={section.image} alt={section.title}
                  className="w-full rounded-2xl shadow-xl object-cover h-80" />
              )}
              {section.content && (
                <div className="prose prose-lg prose-gray max-w-none">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line text-lg">{section.content}</p>
                </div>
              )}
            </div>

            {/* Side panel */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 rounded-2xl border border-gray-100 shadow-sm p-7 bg-white">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `${primaryColor}18` }}>
                  <GraduationCap className="w-7 h-7" style={{ color: primaryColor }} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-4">{tenant?.name}</h3>
                {settings?.school_motto && (
                  <p className="text-gray-500 text-sm italic mb-5">"{settings.school_motto}"</p>
                )}
                <ul className="space-y-3">
                  {['Excellence in Education', 'Holistic Development', 'Modern Curriculum', 'Experienced Faculty'].map(v => (
                    <li key={v} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                      {v}
                    </li>
                  ))}
                </ul>
                <Link to="/admissions"
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}>
                  Apply for Admission
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">About content coming soon.</div>
        )}
      </main>

      {landing && (
        <TenantFooter landing={landing} schoolName={tenant?.name ?? ''} logo={settings?.logo} primaryColor={primaryColor}
          contactSection={landing.sections.find(s => s.section_type === 'contact' && s.is_enabled)} />
      )}
    </div>
  );
};

export default TenantAboutPage;
