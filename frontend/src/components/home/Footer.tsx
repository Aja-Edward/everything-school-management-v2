import React from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { getAbsoluteUrl } from '../../utils/urlUtils';

interface FooterProps {
  isDashboard?: boolean;
}

const Footer: React.FC<FooterProps> = ({ isDashboard = false }) => {
  const currentYear = new Date().getFullYear();
  const { settings } = useSettings();

  // Only pages that exist. Every user of a school logs in on that school's
  // own address, so the portal links go to the finder that sends them there.
  const footerLinks = {
    product: [
      { name: 'Features', href: '/#features' },
      { name: 'How It Works', href: '/#how-it-works' },
      { name: 'Pricing', href: '/#pricing' },
      { name: 'FAQ', href: '/#faq' },
    ],
    company: [
      { name: 'About Us', href: '/about' },
      { name: 'Contact', href: '/contact' },
      { name: 'Book a Demo', href: '/book-demo' },
      { name: 'Register School', href: '/onboarding/register' },
    ],
    'log in': [
      { name: 'School login', href: '/school-login' },
      { name: 'Nuventa staff', href: '/platform-admin/login' },
    ],
  };

  if (isDashboard) {
    return (
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img
                src={settings?.logo ? getAbsoluteUrl(settings.logo) : '/images/nuventa-logo.png'}
                alt={settings?.school_name || 'Nuventa Cloud'}
                className="w-6 h-6 rounded object-contain"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {settings?.school_name || 'Nuventa Cloud'}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              © {currentYear} {settings?.school_name || 'School'}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-6">
        {/* Main Footer */}
        <div className="py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img
                src={settings?.logo ? getAbsoluteUrl(settings.logo) : '/images/nuventa-logo.png'}
                alt={settings?.school_name || 'Nuventa Cloud'}
                className="w-8 h-8 rounded object-contain"
              />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {settings?.school_name || 'Nuventa Cloud'}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
              {settings?.motto || 'Cloud school management for nursery, primary and secondary schools.'}
            </p>
            {settings?.email && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{settings.email}</p>
            )}
            {settings?.phone && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{settings.phone}</p>
            )}
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 capitalize">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link, index) => (
                  <li key={index}>
                    <Link
                      to={link.href}
                      className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="py-6 border-t border-gray-100 dark:border-gray-800">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              © {currentYear} {settings?.school_name || 'Nuventa Cloud'}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
