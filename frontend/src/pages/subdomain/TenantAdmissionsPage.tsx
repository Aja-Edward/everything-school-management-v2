// import React, { useEffect, useState } from 'react';
// import { Link } from 'react-router-dom';
// import { useTenant } from '@/contexts/TenantContext';
// import LandingPageService, { TenantLandingPage, LandingSection } from '@/services/LandingPageService';
// import TenantNavbar from '@/components/tenant/TenantNavbar';
// import TenantFooter from '@/components/tenant/TenantFooter';
// import RibbonBanner from '@/components/tenant/RibbonBanner';
// import api from '@/services/api';
// import { ArrowLeft, Calendar, DollarSign, User, Mail, Phone, ArrowRight } from 'lucide-react';

// const TenantAdmissionsPage: React.FC = () => {
//   const { tenant, settings } = useTenant();
//   const [landing, setLanding] = useState<TenantLandingPage | null>(null);
//   const [section, setSection] = useState<LandingSection | null>(null);
//   const [ribbonText, setRibbonText] = useState<string | null>(null);
//   const [ribbonSpeed, setRibbonSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');

//   const primaryColor = settings?.primary_color || '#1e40af';

//   useEffect(() => {
//     LandingPageService.getPublic().then(d => {
//       setLanding(d);
//       setSection(d.sections.find(s => s.section_type === 'admissions' && s.is_enabled) ?? null);
//       if (d.ribbon_enabled && d.ribbon_text) {
//         setRibbonText(d.ribbon_text);
//         setRibbonSpeed(d.ribbon_speed ?? 'medium');
//       }
//     }).catch(() => {});
//     api.get('/events/events/?is_active=true&is_published=true&display_type=ribbon')
//       .then((d: any) => {
//         const evt = (d?.results ?? d)?.[0];
//         if (evt) { setRibbonText(evt.ribbon_text || evt.title); setRibbonSpeed(evt.ribbon_speed ?? 'medium'); }
//       })
//       .catch(() => {});
//   }, []);

//   const steps = [
//     { n: '01', title: 'Fill Application', desc: 'Complete the online form with your details.' },
//     { n: '02', title: 'Submit Documents', desc: 'Upload required credentials and certificates.' },
//     { n: '03', title: 'Pay Application Fee', desc: 'Make payment to complete your submission.' },
//     { n: '04', title: 'Await Response', desc: 'Our admissions team will contact you within 5 working days.' },
//   ];

//   return (
//     <div className="min-h-screen bg-white">
//       {ribbonText && (
//         <div className="fixed top-0 left-0 right-0 z-50">
//           <RibbonBanner text={ribbonText} speed={ribbonSpeed} primaryColor={primaryColor} />
//         </div>
//       )}
//       <div>
//         <TenantNavbar schoolName={tenant?.name ?? ''} logo={settings?.logo} primaryColor={primaryColor}
//           navLinks={landing?.nav_links ?? []} portalLabel="Portal Login" ribbonVisible={!!ribbonText} />
//       </div>

//       {/* Page header / banner */}
//       {section?.banner_image ? (
//         <div className="relative pt-20">
//           <img
//             src={section.banner_image}
//             alt={section.title ?? 'Admissions'}
//             className="w-full h-64 sm:h-80 object-cover"
//           />
//           <div className="absolute inset-0 bg-black/45 flex flex-col justify-end pb-10 px-4 sm:px-6 lg:px-8">
//             <div className="max-w-7xl mx-auto w-full">
//               <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-4 transition-colors">
//                 <ArrowLeft className="w-4 h-4" /> Back to Home
//               </Link>
//               <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">
//                 {section.title ?? 'Admissions'}
//               </h1>
//               {section.subtitle && <p className="text-lg text-white/80 max-w-2xl">{section.subtitle}</p>}
//             </div>
//           </div>
//         </div>
//       ) : (
//         <div className="pt-28 pb-16 px-4 sm:px-6 lg:px-8"
//           style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}bb 100%)` }}>
//           <div className="max-w-7xl mx-auto">
//             <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-6 transition-colors">
//               <ArrowLeft className="w-4 h-4" /> Back to Home
//             </Link>
//             <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-3">
//               {section?.title ?? 'Admissions'}
//             </h1>
//             {section?.subtitle && <p className="text-xl text-white/80 max-w-2xl">{section.subtitle}</p>}
//           </div>
//         </div>
//       )}

//       <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
//         {/* Application steps */}
//         <section>
//           <h2 className="text-2xl font-bold text-gray-900 mb-8">How to Apply</h2>
//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
//             {steps.map(s => (
//               <div key={s.n} className="relative p-6 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
//                 <div className="text-4xl font-black mb-3 opacity-15" style={{ color: primaryColor }}>{s.n}</div>
//                 <h3 className="font-bold text-gray-900 mb-1">{s.title}</h3>
//                 <p className="text-sm text-gray-500">{s.desc}</p>
//               </div>
//             ))}
//           </div>
//         </section>

//         {/* Main content + info card */}
//         {section && (
//           <section className="grid grid-cols-1 lg:grid-cols-3 gap-12">
//             <div className="lg:col-span-2 space-y-6">
//               {section.image && (
//                 <img src={section.image} alt="Admissions" className="w-full rounded-2xl shadow-lg object-cover h-64" />
//               )}
//               {section.content && (
//                 <div className="prose prose-gray max-w-none">
//                   <p className="text-gray-700 leading-relaxed whitespace-pre-line">{section.content}</p>
//                 </div>
//               )}
//             </div>

//             <div>
//               <div className="rounded-2xl border border-gray-100 shadow-md p-6 space-y-5 sticky top-24">
//                 <h3 className="font-bold text-gray-900 text-lg">Key Information</h3>
//                 {section.admissions_deadline && (
//                   <div className="flex gap-3 items-start">
//                     <Calendar className="w-5 h-5 mt-0.5 shrink-0" style={{ color: primaryColor }} />
//                     <div>
//                       <p className="text-xs text-gray-400">Deadline</p>
//                       <p className="font-semibold text-gray-800 text-sm">{section.admissions_deadline}</p>
//                     </div>
//                   </div>
//                 )}
//                 {section.admissions_fee && (
//                   <div className="flex gap-3 items-start">
//                     <DollarSign className="w-5 h-5 mt-0.5 shrink-0" style={{ color: primaryColor }} />
//                     <div>
//                       <p className="text-xs text-gray-400">Application Fee</p>
//                       <p className="font-semibold text-gray-800 text-sm">{section.admissions_fee}</p>
//                     </div>
//                   </div>
//                 )}
//                 {(section.admissions_contact_name || section.admissions_contact_email || section.admissions_contact_phone) && (
//                   <div className="pt-4 border-t border-gray-100 space-y-2">
//                     <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Admissions Contact</p>
//                     {section.admissions_contact_name && (
//                       <div className="flex gap-2 items-center text-sm">
//                         <User className="w-4 h-4 text-gray-400" />
//                         <span className="font-medium text-gray-800">{section.admissions_contact_name}</span>
//                       </div>
//                     )}
//                     {section.admissions_contact_email && (
//                       <div className="flex gap-2 items-center text-sm">
//                         <Mail className="w-4 h-4 text-gray-400" />
//                         <a href={`mailto:${section.admissions_contact_email}`}
//                           className="hover:underline" style={{ color: primaryColor }}>
//                           {section.admissions_contact_email}
//                         </a>
//                       </div>
//                     )}
//                     {section.admissions_contact_phone && (
//                       <div className="flex gap-2 items-center text-sm">
//                         <Phone className="w-4 h-4 text-gray-400" />
//                         <a href={`tel:${section.admissions_contact_phone}`}
//                           className="hover:underline" style={{ color: primaryColor }}>
//                           {section.admissions_contact_phone}
//                         </a>
//                       </div>
//                     )}
//                   </div>
//                 )}
//                 <Link to="/login"
//                   className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
//                   style={{ backgroundColor: primaryColor }}>
//                   Apply via Portal <ArrowRight className="w-4 h-4" />
//                 </Link>
//               </div>
//             </div>
//           </section>
//         )}
//       </main>

//       {landing && (
//         <TenantFooter landing={landing} schoolName={tenant?.name ?? ''} logo={settings?.logo} primaryColor={primaryColor}
//           contactSection={landing.sections.find(s => s.section_type === 'contact' && s.is_enabled)} />
//       )}
//     </div>
//   );
// };

// export default TenantAdmissionsPage;



import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import LandingPageService, { TenantLandingPage, LandingSection } from '@/services/LandingPageService';
import TenantNavbar from '@/components/tenant/TenantNavbar';
import TenantFooter from '@/components/tenant/TenantFooter';
import RibbonBanner from '@/components/tenant/RibbonBanner';
import api from '@/services/api';
import { ArrowLeft, Calendar, DollarSign, User, Mail, Phone, ArrowRight } from 'lucide-react';

const TenantAdmissionsPage: React.FC = () => {
  const { tenant, settings } = useTenant();
  const [landing, setLanding] = useState<TenantLandingPage | null>(null);
  const [section, setSection] = useState<LandingSection | null>(null);
  const [ribbonText, setRibbonText] = useState<string | null>(null);
  const [ribbonSpeed, setRibbonSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');

  const primaryColor = settings?.primary_color || '#1e40af';

  // Convert hex → "r g g" channels for CSS rgb() / rgba() with slash syntax
  const hexToChannels = (hex: string) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `${r} ${g} ${b}`;
  };

  useEffect(() => {
    LandingPageService.getPublic().then(d => {
      setLanding(d);
      setSection(d.sections.find(s => s.section_type === 'admissions' && s.is_enabled) ?? null);
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

  const steps = [
    { n: '01', title: 'Fill Application', desc: 'Complete the online form with your details.' },
    { n: '02', title: 'Submit Documents', desc: 'Upload required credentials and certificates.' },
    { n: '03', title: 'Pay Application Fee', desc: 'Make payment to complete your submission.' },
    { n: '04', title: 'Await Response', desc: 'Our admissions team will contact you within 5 working days.' },
  ];

  const channels = hexToChannels(primaryColor);

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        /* CSS custom property so every adm-* rule picks up the tenant color */
        .adm-scope { --p: ${channels}; }

        /* ─── Layout ─────────────────────────────────────────── */
        .adm-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2.5rem;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .adm-grid { grid-template-columns: 1fr 340px; gap: 4rem; }
        }

        /* ─── Left: image ────────────────────────────────────── */
        .adm-img-wrap {
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          aspect-ratio: 16 / 9;
          /* coloured glow that uses the tenant primary */
          box-shadow: 0 20px 60px -10px rgb(var(--p) / 0.25);
        }
        .adm-img-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.55s cubic-bezier(0.25,0.46,0.45,0.94);
        }
        .adm-img-wrap:hover img { transform: scale(1.04); }

        /* bottom scrim */
        .adm-img-scrim {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.52) 0%, transparent 55%);
          pointer-events: none;
        }

        /* live-applications pill sitting on the image */
        .adm-pill {
          position: absolute;
          bottom: 1.125rem;
          left: 1.125rem;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.4rem 0.9rem;
          border-radius: 100px;
          background: rgb(var(--p) / 0.88);
          backdrop-filter: blur(10px);
          color: #fff;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .adm-pill-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: rgba(255,255,255,0.85);
          animation: adm-blink 1.8s ease-in-out infinite;
        }
        @keyframes adm-blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

        /* ─── Left: prose ────────────────────────────────────── */
        .adm-prose { margin-top: 1.75rem; }

        .adm-prose-eyebrow {
          display: inline-block;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: rgb(var(--p));
          margin-bottom: 0.75rem;
        }

        .adm-prose-rule {
          width: 2.25rem;
          height: 3px;
          background: rgb(var(--p));
          border-radius: 2px;
          margin-bottom: 1rem;
        }

        .adm-prose-body {
          font-size: 0.9375rem;
          line-height: 1.82;
          color: #4b5563;
          white-space: pre-line;
        }

        /* ─── Right: info card ───────────────────────────────── */
        .adm-card {
          position: sticky;
          top: 6rem;
          border-radius: 22px;
          overflow: hidden;
          /* primary-tinted shadow */
          box-shadow:
            0 0 0 1px rgb(var(--p) / 0.14),
            0 24px 56px -8px rgb(var(--p) / 0.2);
        }

        /* thin coloured strip at the top */
        .adm-card-strip {
          height: 5px;
          background: linear-gradient(90deg, rgb(var(--p)), rgb(var(--p) / 0.4));
        }

        /* dark body */
        .adm-card-inner {
          background: #0d1117;
          padding: 1.625rem 1.75rem 1.75rem;
        }

        .adm-card-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.01em;
          margin-bottom: 1.375rem;
        }

        /* each data row */
        .adm-row {
          display: flex;
          align-items: flex-start;
          gap: 0.875rem;
          padding: 0.9rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.055);
        }
        .adm-row:last-of-type { border-bottom: none; }

        .adm-row-icon {
          flex-shrink: 0;
          width: 34px; height: 34px;
          border-radius: 9px;
          background: rgb(var(--p) / 0.15);
          display: flex; align-items: center; justify-content: center;
          color: rgb(var(--p));
        }

        .adm-row-label {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 0.2rem;
        }
        .adm-row-value {
          font-size: 0.8125rem;
          font-weight: 600;
          color: rgba(255,255,255,0.88);
        }
        .adm-row-link {
          font-size: 0.8125rem;
          font-weight: 500;
          color: rgb(var(--p));
          text-decoration: none;
          transition: opacity 0.18s;
        }
        .adm-row-link:hover { opacity: 0.72; text-decoration: underline; }

        /* hairline between fee rows and contact */
        .adm-card-sep {
          height: 1px;
          background: rgba(255,255,255,0.065);
          margin: 0.5rem 0 1.125rem;
        }
        .adm-contact-header {
          font-size: 0.625rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25);
          margin-bottom: 0.5rem;
        }

        /* CTA */
        .adm-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          margin-top: 1.5rem;
          padding: 0.875rem 1rem;
          border-radius: 13px;
          font-size: 0.875rem;
          font-weight: 700;
          color: #fff;
          text-decoration: none;
          letter-spacing: 0.01em;
          background: linear-gradient(135deg, rgb(var(--p)), rgb(var(--p) / 0.7));
          box-shadow: 0 8px 22px -4px rgb(var(--p) / 0.45);
          transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s;
        }
        .adm-cta:hover {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 14px 30px -4px rgb(var(--p) / 0.5);
        }
        .adm-cta:active { transform: none; }
      `}</style>

      {ribbonText && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <RibbonBanner text={ribbonText} speed={ribbonSpeed} primaryColor={primaryColor} />
        </div>
      )}
      <div>
        <TenantNavbar
          schoolName={tenant?.name ?? ''}
          logo={settings?.logo}
          primaryColor={primaryColor}
          navLinks={landing?.nav_links ?? []}
          portalLabel="Portal Login"
          ribbonVisible={!!ribbonText}
        />
      </div>

      {/* Page header / banner — unchanged */}
      {section?.banner_image ? (
        <div className="relative pt-20">
          <img src={section.banner_image} alt={section.title ?? 'Admissions'} className="w-full h-64 sm:h-80 object-cover" />
          <div className="absolute inset-0 bg-black/45 flex flex-col justify-end pb-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto w-full">
              <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-4 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Link>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-2">{section.title ?? 'Admissions'}</h1>
              {section.subtitle && <p className="text-lg text-white/80 max-w-2xl">{section.subtitle}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="pt-28 pb-16 px-4 sm:px-6 lg:px-8"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}bb 100%)` }}
        >
          <div className="max-w-7xl mx-auto">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-3">{section?.title ?? 'Admissions'}</h1>
            {section?.subtitle && <p className="text-xl text-white/80 max-w-2xl">{section.subtitle}</p>}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">

        {/* Application steps — untouched */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-8">How to Apply</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map(s => (
              <div key={s.n} className="relative p-6 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl font-black mb-3 opacity-15" style={{ color: primaryColor }}>{s.n}</div>
                <h3 className="font-bold text-gray-900 mb-1">{s.title}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── REDESIGNED: Main content + info card ── */}
        {section && (
          <section className="adm-scope adm-grid">

            {/* ── Left column ── */}
            <div>
              {section.image && (
                <div className="adm-img-wrap">
                  <img src={section.image} alt="Admissions" />
                  <div className="adm-img-scrim" />
                  <span className="adm-pill">
                    <span className="adm-pill-dot" />
                    Now Accepting Applications
                  </span>
                </div>
              )}

              {section.content && (
                <div className="adm-prose">
                  <span className="adm-prose-eyebrow">About Admissions</span>
                  <div className="adm-prose-rule" />
                  <p className="adm-prose-body">{section.content}</p>
                </div>
              )}
            </div>

            {/* ── Right column: info card ── */}
            <div>
              <div className="adm-card">
                <div className="adm-card-strip" />
                <div className="adm-card-inner">
                  <p className="adm-card-title">Key Information</p>

                  {section.admissions_deadline && (
                    <div className="adm-row">
                      <div className="adm-row-icon"><Calendar className="w-4 h-4" /></div>
                      <div>
                        <p className="adm-row-label">Application Deadline</p>
                        <p className="adm-row-value">{section.admissions_deadline}</p>
                      </div>
                    </div>
                  )}

                  {section.admissions_fee && (
                    <div className="adm-row">
                      <div className="adm-row-icon"><DollarSign className="w-4 h-4" /></div>
                      <div>
                        <p className="adm-row-label">Application Fee</p>
                        <p className="adm-row-value">{section.admissions_fee}</p>
                      </div>
                    </div>
                  )}

                  {(section.admissions_contact_name || section.admissions_contact_email || section.admissions_contact_phone) && (
                    <>
                      <div className="adm-card-sep" />
                      <p className="adm-contact-header">Admissions Contact</p>

                      {section.admissions_contact_name && (
                        <div className="adm-row">
                          <div className="adm-row-icon"><User className="w-4 h-4" /></div>
                          <div>
                            <p className="adm-row-label">Name</p>
                            <p className="adm-row-value">{section.admissions_contact_name}</p>
                          </div>
                        </div>
                      )}

                      {section.admissions_contact_email && (
                        <div className="adm-row">
                          <div className="adm-row-icon"><Mail className="w-4 h-4" /></div>
                          <div>
                            <p className="adm-row-label">Email</p>
                            <a href={`mailto:${section.admissions_contact_email}`} className="adm-row-link">
                              {section.admissions_contact_email}
                            </a>
                          </div>
                        </div>
                      )}

                      {section.admissions_contact_phone && (
                        <div className="adm-row">
                          <div className="adm-row-icon"><Phone className="w-4 h-4" /></div>
                          <div>
                            <p className="adm-row-label">Phone</p>
                            <a href={`tel:${section.admissions_contact_phone}`} className="adm-row-link">
                              {section.admissions_contact_phone}
                            </a>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <Link to="/login" className="adm-cta">
                    Apply via Portal <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>

          </section>
        )}
      </main>

      {landing && (
        <TenantFooter
          landing={landing}
          schoolName={tenant?.name ?? ''}
          logo={settings?.logo}
          primaryColor={primaryColor}
          contactSection={landing.sections.find(s => s.section_type === 'contact' && s.is_enabled)}
        />
      )}
    </div>
  );
};

export default TenantAdmissionsPage;