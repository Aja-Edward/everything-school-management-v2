import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Twitter, Instagram, Youtube, GraduationCap, MapPin, Phone, Mail } from 'lucide-react';
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
                <img src={logo} alt={schoolName} className="h-12 w-12 rounded-full object-contain" />
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
                  <Facebook className="w-4 h-4 text-white" />
                </a>
              )}
              {landing.twitter_url && (
                <a href={landing.twitter_url} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-gray-800 hover:bg-sky-500 transition-colors">
                  <Twitter className="w-4 h-4 text-white" />
                </a>
              )}
              {landing.instagram_url && (
                <a href={landing.instagram_url} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-gray-800 hover:bg-pink-600 transition-colors">
                  <Instagram className="w-4 h-4 text-white" />
                </a>
              )}
              {landing.youtube_url && (
                <a href={landing.youtube_url} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-gray-800 hover:bg-red-600 transition-colors">
                  <Youtube className="w-4 h-4 text-white" />
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
              <li>
                <Link to="/login" className="hover:text-white transition-colors">Portal Login</Link>
              </li>
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
                {contactSection.contact_phone && (
                  <li className="flex gap-2 items-center">
                    <Phone className="w-4 h-4 shrink-0 text-gray-400" />
                    <a href={`tel:${contactSection.contact_phone}`} className="hover:text-white transition-colors">
                      {contactSection.contact_phone}
                    </a>
                  </li>
                )}
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
