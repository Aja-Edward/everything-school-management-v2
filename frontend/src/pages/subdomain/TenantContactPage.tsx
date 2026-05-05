import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import LandingPageService, { TenantLandingPage, LandingSection } from '@/services/LandingPageService';
import TenantNavbar from '@/components/tenant/TenantNavbar';
import TenantFooter from '@/components/tenant/TenantFooter';
import RibbonBanner from '@/components/tenant/RibbonBanner';
import api from '@/services/api';
import { ArrowLeft, MapPin, Phone, Mail, Clock } from 'lucide-react';

const TenantContactPage: React.FC = () => {
  const { tenant, settings } = useTenant();
  const [landing, setLanding] = useState<TenantLandingPage | null>(null);
  const [section, setSection] = useState<LandingSection | null>(null);
  const [ribbonText, setRibbonText] = useState<string | null>(null);
  const [ribbonSpeed, setRibbonSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');

  const primaryColor = settings?.primary_color || '#1e40af';

  useEffect(() => {
    LandingPageService.getPublic().then(d => {
      setLanding(d);
      setSection(d.sections.find(s => s.section_type === 'contact' && s.is_enabled) ?? null);
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

  const phones = section?.contact_phone
    ? section.contact_phone.split('\n').map(p => p.trim()).filter(Boolean)
    : [];

  const contactItems = section ? [
    section.contact_address && { icon: <MapPin className="w-5 h-5" />, label: 'Address', value: section.contact_address, href: undefined },
    ...phones.map((ph, i) => ({
      icon: <Phone className="w-5 h-5" />,
      label: phones.length > 1 ? `Phone ${i + 1}` : 'Phone',
      value: ph,
      href: `tel:${ph}`,
    })),
    section.contact_email && { icon: <Mail className="w-5 h-5" />, label: 'Email', value: section.contact_email, href: `mailto:${section.contact_email}` },
    section.contact_hours && { icon: <Clock className="w-5 h-5" />, label: 'Office Hours', value: section.contact_hours, href: undefined },
  ].filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-white">
      {ribbonText && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <RibbonBanner text={ribbonText} speed={ribbonSpeed} primaryColor={primaryColor} />
        </div>
      )}
      <div>
        <TenantNavbar schoolName={tenant?.name ?? ''} logo={settings?.logo} primaryColor={primaryColor}
          navLinks={landing?.nav_links ?? []} portalLabel="Portal Login" ribbonVisible={!!ribbonText} />
      </div>

      {/* Page header / banner */}
      {section?.banner_image ? (
        <div className="relative pt-20">
          <img
            src={section.banner_image}
            alt={section.title ?? 'Contact Us'}
            className="w-full h-64 sm:h-80 object-cover"
          />
          <div className="absolute inset-0 bg-black/45 flex flex-col justify-end pb-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto w-full">
              <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-4 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Link>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">
                {section.title ?? 'Contact Us'}
              </h1>
              {section.subtitle && <p className="text-lg text-white/80 max-w-2xl">{section.subtitle}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="pt-28 pb-16 px-4 sm:px-6 lg:px-8"
          style={{ background: `linear-gradient(135deg, ${primaryColor}12 0%, #f8fafc 100%)` }}>
          <div className="max-w-7xl mx-auto">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-3">
              {section?.title ?? 'Contact Us'}
            </h1>
            {section?.subtitle && <p className="text-xl text-gray-600 max-w-2xl">{section.subtitle}</p>}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">
          {/* Contact info */}
          <div className="space-y-6">
            {section?.content && (
              <p className="text-gray-600 text-lg leading-relaxed whitespace-pre-line mb-8">{section.content}</p>
            )}

            {contactItems.map((item: any, i) => (
              <div key={i} className="flex gap-4 p-5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="font-semibold text-gray-800 hover:underline"
                      style={{ color: primaryColor }}>
                      {item.value}
                    </a>
                  ) : (
                    <p className="font-semibold text-gray-800 whitespace-pre-line">{item.value}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Map */}
            {section?.contact_map_embed && (
              <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm h-64">
                <iframe
                  src={section.contact_map_embed}
                  width="100%" height="100%" loading="lazy"
                  className="border-0"
                  title="School Location"
                />
              </div>
            )}
          </div>

          {/* Quick message card (static — just links to portal) */}
          <div>
            <div className="rounded-2xl border border-gray-100 shadow-md p-8 bg-white sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Have a question?</h2>
              <p className="text-gray-500 text-sm mb-6">
                Use your school portal to send a message directly to the administration.
                Staff, parents, students, and teachers can all communicate within the platform.
              </p>
              <Link to="/login"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 mb-3"
                style={{ backgroundColor: primaryColor }}>
                Open Portal
              </Link>
              {section?.contact_email && (
                <a href={`mailto:${section.contact_email}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all text-sm">
                  <Mail className="w-4 h-4" /> Email Us Directly
                </a>
              )}
            </div>
          </div>
        </div>
      </main>

      {landing && (
        <TenantFooter landing={landing} schoolName={tenant?.name ?? ''} logo={settings?.logo}
          primaryColor={primaryColor} contactSection={section ?? undefined} />
      )}
    </div>
  );
};

export default TenantContactPage;
