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
import ReactMarkdown from 'react-markdown';
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
        .adm-scope { --p: ${channels}; }

        /* Content prose — typography-first, no structural manipulation */
        .adm-prose-wrap {
          padding: 0.25rem 0 0;
        }

        .adm-prose-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.6563rem;
          font-weight: 700;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: rgb(var(--p));
          margin-bottom: 0.875rem;
        }
        .adm-prose-eyebrow::before {
          content: '';
          display: inline-block;
          width: 20px;
          height: 2px;
          border-radius: 2px;
          background: rgb(var(--p));
          flex-shrink: 0;
        }

        .adm-prose-text {
          font-size: 0.9375rem;
          line-height: 1.9;
          color: #4b5563;
          white-space: pre-line;
          border-left: 3px solid rgb(var(--p) / 0.2);
          padding-left: 1.125rem;
        }
      `}</style>

      {ribbonText && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <RibbonBanner text={ribbonText} speed={ribbonSpeed} primaryColor={primaryColor} />
        </div>
      )}
      <div>
        <TenantNavbar schoolName={tenant?.name ?? ''} logo={settings?.logo} primaryColor={primaryColor}
          navLinks={landing?.nav_links ?? []} portalLabel="Portal Login" ribbonVisible={!!ribbonText} />
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
        <div className="pt-28 pb-16 px-4 sm:px-6 lg:px-8"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}bb 100%)` }}>
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

        {/* Application steps — unchanged */}
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

        {/* Main content + info card */}
        {section && (
          <section className="adm-scope grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-6">

              {/* Image — taller with hover zoom */}
              {section.image && (
                <div className="w-full rounded-2xl shadow-lg overflow-hidden h-96" style={{ position: 'relative' }}>
                  <img
                    src={section.image}
                    alt="Admissions"
                    className="w-full h-full object-cover transition-transform duration-500 ease-out hover:scale-105"
                  />
                </div>
              )}

              {/* Content — rendered as markdown with tenant-branded headings */}
              {section.content && (
                <div className="adm-prose-wrap">
                  <span className="adm-prose-eyebrow">About Admissions</span>
                  <div className="adm-prose-text">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => (
                          <h1 className="adm-md-h1" style={{ color: primaryColor }}>{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="adm-md-h2" style={{ color: primaryColor }}>{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="adm-md-h3">{children}</h3>
                        ),
                        strong: ({ children }) => (
                          <strong className="adm-md-strong">{children}</strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="adm-md-ul">{children}</ul>
                        ),
                        li: ({ children }) => (
                          <li className="adm-md-li">
                            <span className="adm-md-li-dot" style={{ background: primaryColor }} />
                            {children}
                          </li>
                        ),
                        p: ({ children }) => (
                          <p className="adm-md-p">{children}</p>
                        ),
                      }}
                    >
                      {section.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

            </div>

            {/* Right column — original, completely untouched */}
            <div>
              <div className="rounded-2xl border border-gray-100 shadow-md p-6 space-y-5 sticky top-24">
                <h3 className="font-bold text-gray-900 text-lg">Key Information</h3>
                {section.admissions_deadline && (
                  <div className="flex gap-3 items-start">
                    <Calendar className="w-5 h-5 mt-0.5 shrink-0" style={{ color: primaryColor }} />
                    <div>
                      <p className="text-xs text-gray-400">Deadline</p>
                      <p className="font-semibold text-gray-800 text-sm">{section.admissions_deadline}</p>
                    </div>
                  </div>
                )}
                {section.admissions_fee && (
                  <div className="flex gap-3 items-start">
                    <DollarSign className="w-5 h-5 mt-0.5 shrink-0" style={{ color: primaryColor }} />
                    <div>
                      <p className="text-xs text-gray-400">Application Fee</p>
                      <p className="font-semibold text-gray-800 text-sm">{section.admissions_fee}</p>
                    </div>
                  </div>
                )}
                {(section.admissions_contact_name || section.admissions_contact_email || section.admissions_contact_phone) && (
                  <div className="pt-4 border-t border-gray-100 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Admissions Contact</p>
                    {section.admissions_contact_name && (
                      <div className="flex gap-2 items-center text-sm">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-800">{section.admissions_contact_name}</span>
                      </div>
                    )}
                    {section.admissions_contact_email && (
                      <div className="flex gap-2 items-center text-sm">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <a href={`mailto:${section.admissions_contact_email}`}
                          className="hover:underline" style={{ color: primaryColor }}>
                          {section.admissions_contact_email}
                        </a>
                      </div>
                    )}
                    {section.admissions_contact_phone && (
                      <div className="flex gap-2 items-center text-sm">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <a href={`tel:${section.admissions_contact_phone}`}
                          className="hover:underline" style={{ color: primaryColor }}>
                          {section.admissions_contact_phone}
                        </a>
                      </div>
                    )}
                  </div>
                )}
                <Link to="/login"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor }}>
                  Apply via Portal <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

          </section>
        )}
      </main>

      {landing && (
        <TenantFooter landing={landing} schoolName={tenant?.name ?? ''} logo={settings?.logo} primaryColor={primaryColor}
          contactSection={landing.sections.find(s => s.section_type === 'contact' && s.is_enabled)} />
      )}
    </div>
  );
};

export default TenantAdmissionsPage;