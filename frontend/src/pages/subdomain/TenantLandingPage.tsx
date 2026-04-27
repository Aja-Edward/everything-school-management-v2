import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import LandingPageService, { TenantLandingPage as LandingData } from '@/services/LandingPageService';
import RibbonBanner from '@/components/tenant/RibbonBanner';
import TenantNavbar from '@/components/tenant/TenantNavbar';
import HeroSection from '@/components/tenant/HeroSection';
import TenantFooter from '@/components/tenant/TenantFooter';
import api from '@/services/api';
import {
  BookOpen, Users, Award, MapPin, Phone, Mail, Calendar,
  ChevronRight, GraduationCap, Star, ArrowRight,
} from 'lucide-react';

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500">Loading school portal…</p>
    </div>
  </div>
);

interface CarouselImage { id: number; image: string; title?: string; description?: string; }
interface EventItem {
  id: number; title: string; subtitle?: string; description?: string;
  display_type: 'banner' | 'carousel' | 'ribbon';
  event_type: string; background_theme: string;
  ribbon_text?: string; ribbon_speed?: 'slow' | 'medium' | 'fast';
  is_active: boolean; is_published: boolean;
  image?: string; cta_text?: string; cta_url?: string;
}

const TenantLandingPage: React.FC = () => {
  const { tenant, settings, isLoading: tenantLoading } = useTenant();

  const [landing, setLanding] = useState<LandingData | null>(null);
  const [carouselImages, setCarouselImages] = useState<CarouselImage[]>([]);
  const [activeEvents, setActiveEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const primaryColor = settings?.primary_color || '#1e40af';

  useEffect(() => {
    if (tenantLoading) return;
    Promise.all([
      LandingPageService.getPublic().catch(() => null),
      api.get('/events/events/?is_active=true&is_published=true').catch(() => ({ results: [] })),
    ]).then(([landingData, eventsData]) => {
      if (!landingData) { setError('not_published'); setLoading(false); return; }
      setLanding(landingData);

      const evts: EventItem[] = eventsData?.results ?? eventsData ?? [];
      setActiveEvents(evts.filter((e: EventItem) => e.is_active && e.is_published));
      setLoading(false);
    }).catch(() => { setError('error'); setLoading(false); });
  }, [tenantLoading, tenant]);

  // Fetch carousel images separately
  useEffect(() => {
    api.get('/school-settings/school-settings/').then((d: any) => {
      if (d?.carousel_images) setCarouselImages(d.carousel_images);
    }).catch(() => {});
  }, []);

  /* ── Derived event slots ── */
  const ribbonEvent = activeEvents.find(e => e.display_type === 'ribbon');
  const bannerEvent = activeEvents.find(e => e.display_type === 'banner');
  const carouselEvents = activeEvents.filter(e => e.display_type === 'carousel');

  // Event ribbon takes priority over landing-page ribbon config
  const activeRibbonText = ribbonEvent
    ? (ribbonEvent.ribbon_text || ribbonEvent.title)
    : (landing?.ribbon_enabled && landing.ribbon_text ? landing.ribbon_text : null);
  const activeRibbonSpeed = ribbonEvent?.ribbon_speed ?? landing?.ribbon_speed ?? 'medium';

  // Carousel images: prefer events if landing hero_type is carousel and there are carousel events
  const effectiveCarousel: CarouselImage[] = carouselEvents.length > 0
    ? carouselEvents.map(e => ({ id: e.id, image: e.image || '', title: e.title, description: e.subtitle }))
    : carouselImages;

  if (tenantLoading || loading) return <PageLoader />;

  /* Unpublished state: show a soft placeholder */
  if (error === 'not_published' || !landing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: primaryColor }}>
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{tenant?.name ?? 'School Portal'}</h1>
          <p className="text-gray-500 mb-8">Our public website is being set up. Please use the portal to access your account.</p>
          <Link to="/login"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: primaryColor }}>
            Go to Portal <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const enabledSections = landing.sections
    .filter(s => s.is_enabled)
    .sort((a, b) => a.display_order - b.display_order);

  const aboutSection = enabledSections.find(s => s.section_type === 'about');
  const admissionsSection = enabledSections.find(s => s.section_type === 'admissions');
  const contactSection = enabledSections.find(s => s.section_type === 'contact');
  const customSections = enabledSections.filter(s => s.section_type === 'custom');

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Ribbon (event or landing-page config) ── */}
      {activeRibbonText && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <RibbonBanner
            text={activeRibbonText}
            speed={activeRibbonSpeed}
            primaryColor={primaryColor}
          />
        </div>
      )}

      {/* ── Navbar ── */}
      <div className={activeRibbonText ? 'pt-8' : ''}>
        <TenantNavbar
          schoolName={tenant?.name ?? ''}
          logo={settings?.logo}
          primaryColor={primaryColor}
          navLinks={landing.nav_links}
          portalLabel="Portal Login"
        />
      </div>

      {/* ── Hero ── */}
      <HeroSection
        landing={landing}
        primaryColor={primaryColor}
        schoolName={tenant?.name}
        schoolMotto={settings?.school_motto}
        schoolLogo={settings?.logo}
        carouselImages={effectiveCarousel}
        activeBannerEvent={bannerEvent
          ? { title: bannerEvent.title, subtitle: bannerEvent.subtitle, image: bannerEvent.image, cta_text: bannerEvent.cta_text, cta_url: bannerEvent.cta_url }
          : null}
      />

      {/* ── Stats Strip ── */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: <GraduationCap className="w-6 h-6" />, label: 'Students', value: '1,000+' },
              { icon: <Users className="w-6 h-6" />, label: 'Teachers', value: '80+' },
              { icon: <BookOpen className="w-6 h-6" />, label: 'Programmes', value: '20+' },
              { icon: <Award className="w-6 h-6" />, label: 'Years of Excellence', value: '15+' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2"
                  style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                  {s.icon}
                </div>
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── About Section ── */}
      {aboutSection && (
        <section id="about" className="py-20 bg-gradient-to-b from-white to-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
              {/* Image */}
              <div className="order-2 lg:order-1">
                {aboutSection.image ? (
                  <div className="relative">
                    <img src={aboutSection.image} alt={aboutSection.title}
                      className="w-full rounded-2xl shadow-2xl object-cover h-[420px]" />
                    <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-2xl opacity-20"
                      style={{ backgroundColor: primaryColor }} />
                  </div>
                ) : (
                  <div className="w-full h-[420px] rounded-2xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}22, ${primaryColor}44)` }}>
                    <GraduationCap className="w-24 h-24 opacity-30" style={{ color: primaryColor }} />
                  </div>
                )}
              </div>
              {/* Text */}
              <div className="order-1 lg:order-2">
                <span className="inline-block text-xs font-semibold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                  About Us
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                  {aboutSection.title}
                </h2>
                {aboutSection.subtitle && (
                  <p className="text-lg text-gray-600 mb-5 font-medium">{aboutSection.subtitle}</p>
                )}
                {aboutSection.content && (
                  <p className="text-gray-600 leading-relaxed mb-7 whitespace-pre-line">{aboutSection.content}</p>
                )}
                <Link to="/about"
                  className="inline-flex items-center gap-2 font-semibold text-sm transition-colors hover:gap-3"
                  style={{ color: primaryColor }}>
                  Learn More <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Admissions Section ── */}
      {admissionsSection && (
        <section id="admissions" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
                style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                Admissions
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">{admissionsSection.title}</h2>
              {admissionsSection.subtitle && (
                <p className="text-lg text-gray-500 max-w-2xl mx-auto">{admissionsSection.subtitle}</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main content */}
              <div className="lg:col-span-2 space-y-6">
                {admissionsSection.content && (
                  <div className="prose prose-gray max-w-none">
                    <p className="text-gray-600 leading-relaxed whitespace-pre-line">{admissionsSection.content}</p>
                  </div>
                )}
                {admissionsSection.image && (
                  <img src={admissionsSection.image} alt="Admissions"
                    className="w-full rounded-2xl shadow-lg object-cover h-64" />
                )}
              </div>

              {/* Info card */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                  <h3 className="font-bold text-gray-900 text-lg">Admissions Info</h3>
                  {admissionsSection.admissions_deadline && (
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                      <div>
                        <div className="text-gray-400 text-xs">Application Deadline</div>
                        <div className="font-semibold text-gray-800">{admissionsSection.admissions_deadline}</div>
                      </div>
                    </div>
                  )}
                  {admissionsSection.admissions_fee && (
                    <div className="flex items-center gap-3 text-sm">
                      <Star className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                      <div>
                        <div className="text-gray-400 text-xs">Application Fee</div>
                        <div className="font-semibold text-gray-800">{admissionsSection.admissions_fee}</div>
                      </div>
                    </div>
                  )}
                  {admissionsSection.admissions_contact_name && (
                    <div className="pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">Admissions Contact</div>
                      <div className="font-semibold text-gray-800">{admissionsSection.admissions_contact_name}</div>
                      {admissionsSection.admissions_contact_email && (
                        <a href={`mailto:${admissionsSection.admissions_contact_email}`}
                          className="text-xs mt-0.5 block hover:underline" style={{ color: primaryColor }}>
                          {admissionsSection.admissions_contact_email}
                        </a>
                      )}
                      {admissionsSection.admissions_contact_phone && (
                        <a href={`tel:${admissionsSection.admissions_contact_phone}`}
                          className="text-xs block hover:underline" style={{ color: primaryColor }}>
                          {admissionsSection.admissions_contact_phone}
                        </a>
                      )}
                    </div>
                  )}
                  <Link to="/admissions"
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: primaryColor }}>
                    Apply Now <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Custom Sections ── */}
      {customSections.map((section, idx) => (
        <section key={section.id} id={`section-${section.id}`}
          className={`py-20 ${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className={idx % 2 === 0 ? '' : 'order-last'}>
                <span className="inline-block text-xs font-semibold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                  {section.subtitle || 'Info'}
                </span>
                <h2 className="text-3xl font-extrabold text-gray-900 mb-4">{section.title}</h2>
                {section.content && (
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line">{section.content}</p>
                )}
              </div>
              {section.image && (
                <div className={idx % 2 === 0 ? 'order-last' : ''}>
                  <img src={section.image} alt={section.title}
                    className="w-full rounded-2xl shadow-xl object-cover h-80" />
                </div>
              )}
            </div>
          </div>
        </section>
      ))}

      {/* ── Contact Section ── */}
      {contactSection && (
        <section id="contact" className="py-20 bg-gray-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <span className="inline-block text-xs font-semibold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
                style={{ backgroundColor: `${primaryColor}33`, color: `${primaryColor}ee` }}>
                Contact Us
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">{contactSection.title}</h2>
              {contactSection.subtitle && (
                <p className="text-gray-400 max-w-xl mx-auto">{contactSection.subtitle}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {contactSection.contact_address && (
                <div className="text-center p-6 bg-gray-800 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: `${primaryColor}33` }}>
                    <MapPin className="w-5 h-5" style={{ color: primaryColor }} />
                  </div>
                  <h3 className="font-semibold mb-1">Address</h3>
                  <p className="text-gray-400 text-sm">{contactSection.contact_address}</p>
                </div>
              )}
              {(contactSection.contact_phone) && (
                <div className="text-center p-6 bg-gray-800 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: `${primaryColor}33` }}>
                    <Phone className="w-5 h-5" style={{ color: primaryColor }} />
                  </div>
                  <h3 className="font-semibold mb-1">Phone</h3>
                  <a href={`tel:${contactSection.contact_phone}`}
                    className="text-gray-400 text-sm hover:text-white transition-colors">
                    {contactSection.contact_phone}
                  </a>
                  {contactSection.contact_hours && (
                    <p className="text-xs text-gray-500 mt-1">{contactSection.contact_hours}</p>
                  )}
                </div>
              )}
              {contactSection.contact_email && (
                <div className="text-center p-6 bg-gray-800 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: `${primaryColor}33` }}>
                    <Mail className="w-5 h-5" style={{ color: primaryColor }} />
                  </div>
                  <h3 className="font-semibold mb-1">Email</h3>
                  <a href={`mailto:${contactSection.contact_email}`}
                    className="text-gray-400 text-sm hover:text-white transition-colors">
                    {contactSection.contact_email}
                  </a>
                </div>
              )}
            </div>

            <div className="text-center mt-10">
              <Link to="/contact"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl font-semibold text-white border border-white/20 hover:bg-white/10 transition-all"
              >
                Full Contact Page <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <TenantFooter
        landing={landing}
        schoolName={tenant?.name ?? ''}
        logo={settings?.logo}
        primaryColor={primaryColor}
        contactSection={contactSection}
      />
    </div>
  );
};

export default TenantLandingPage;
