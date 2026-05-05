import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, MapPin, Phone, Mail } from 'lucide-react';

// Inline brand SVGs — lucide removed brand icons in newer versions
const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M24 12.073C24 5.445 18.627 0 12 0S0 5.445 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.884v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.735-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
  </svg>
);

const YoutubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);
import type { TenantLandingPage, LandingSection } from '@/services/LandingPageService';

interface TenantFooterProps {
  landing: TenantLandingPage;
  schoolName: string;
  logo?: string;
  primaryColor?: string;
  contactSection?: LandingSection;
}

const TenantFooter: React.FC<TenantFooterProps> = ({
  landing,
  schoolName,
  logo,
  primaryColor = '#1e40af',
  contactSection,
}) => {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              {logo ? (
                <img src={logo} alt={schoolName} className="h-12 w-12 rounded-full object-contain" loading="lazy" decoding="async" />
              ) : (
                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
              )}
              <span className="text-white font-bold text-xl">{schoolName}</span>
            </div>
            {landing.footer_text && (
              <p className="text-sm text-gray-400 leading-relaxed max-w-sm">{landing.footer_text}</p>
            )}
            <div className="flex gap-3 mt-5">
              {landing.facebook_url && (
                <a href={landing.facebook_url} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-gray-800 hover:bg-blue-600 transition-colors">
                  <FacebookIcon className="w-4 h-4 text-white" />
                </a>
              )}
              {landing.twitter_url && (
                <a href={landing.twitter_url} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-gray-800 hover:bg-sky-500 transition-colors">
                  <XIcon className="w-4 h-4 text-white" />
                </a>
              )}
              {landing.instagram_url && (
                <a href={landing.instagram_url} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-gray-800 hover:bg-pink-600 transition-colors">
                  <InstagramIcon className="w-4 h-4 text-white" />
                </a>
              )}
              {landing.youtube_url && (
                <a href={landing.youtube_url} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-gray-800 hover:bg-red-600 transition-colors">
                  <YoutubeIcon className="w-4 h-4 text-white" />
                </a>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              {landing.nav_links.filter(l => l.is_enabled).map(link => (
                <li key={link.id}>
                  {link.link_type === 'external' ? (
                    <a href={link.url} target="_blank" rel="noopener noreferrer"
                      className="hover:text-white transition-colors">{link.label}</a>
                  ) : (
                    <Link to={link.url} className="hover:text-white transition-colors">{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          {contactSection && (
            <div>
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Contact</h3>
              <ul className="space-y-3 text-sm">
                {contactSection.contact_address && (
                  <li className="flex gap-2 items-start">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                    <span>{contactSection.contact_address}</span>
                  </li>
                )}
                {contactSection.contact_phone &&
                  contactSection.contact_phone.split('\n').map(p => p.trim()).filter(Boolean).map((ph, i) => (
                    <li key={i} className="flex gap-2 items-center">
                      <Phone className="w-4 h-4 shrink-0 text-gray-400" />
                      <a href={`tel:${ph}`} className="hover:text-white transition-colors">{ph}</a>
                    </li>
                  ))
                }
                {contactSection.contact_email && (
                  <li className="flex gap-2 items-center">
                    <Mail className="w-4 h-4 shrink-0 text-gray-400" />
                    <a href={`mailto:${contactSection.contact_email}`} className="hover:text-white transition-colors">
                      {contactSection.contact_email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <span>© {year} {schoolName}. All rights reserved.</span>
          <span>Powered by <span className="text-gray-400 font-medium">NuventaCloud</span></span>
        </div>
      </div>
    </footer>
  );
};

export default TenantFooter;
