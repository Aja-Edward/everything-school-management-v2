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

  const footerLinks = {
    school: [
      { name: 'About Us', href: '/about' },
      { name: 'Admissions', href: '/how-to-apply' },
      { name: 'Activities', href: '/school_activities' },
      { name: 'Contact', href: '/about' },
    ],
    portal: [
      { name: 'Student Login', href: '/student-login' },
      { name: 'Teacher Login', href: '/teacher-login' },
      { name: 'Parent Login', href: '/parent-login' },
      { name: 'Admin Login', href: '/admin-login' },
    ],
    resources: [
      { name: 'Register School', href: '/onboarding/register' },
      { name: 'Help Center', href: '#' },
      { name: 'Privacy Policy', href: '#' },
      { name: 'Terms of Service', href: '#' },
    ],
  };

  if (isDashboard) {
    return (
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              {settings?.logo ? (
                <img
                  src={getAbsoluteUrl(settings.logo)}
                  alt=""
                  className="w-6 h-6 rounded object-contain"
                />
              ) : (
                <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  S
                </div>
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {settings?.school_name || 'School'}
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
              {settings?.logo ? (
                <img
                  src={getAbsoluteUrl(settings.logo)}
                  alt=""
                  className="w-8 h-8 rounded object-contain"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                N
                </div>
              )}
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {settings?.school_name || 'Nuventa Cloud'}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
              {settings?.motto || 'Empowering the next generation with quality education and innovative learning experiences.'}
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
            <div className="flex items-center gap-4">
              <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                Terms
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
