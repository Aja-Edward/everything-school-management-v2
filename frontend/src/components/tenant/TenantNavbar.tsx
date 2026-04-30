import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, GraduationCap } from 'lucide-react';
import type { NavigationLink } from '@/services/LandingPageService';

interface TenantNavbarProps {
  schoolName: string;
  logo?: string;
  primaryColor?: string;
  navLinks: NavigationLink[];
  portalLabel?: string;
  ribbonVisible?: boolean;
}

const TenantNavbar: React.FC<TenantNavbarProps> = ({
  schoolName,
  logo,
  primaryColor = '#1e40af',
  navLinks,
  portalLabel = 'Portal',
  ribbonVisible = false,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => setOpen(false), [location]);

  const enabledLinks = navLinks.filter((l) => l.is_enabled);

  const navBg = scrolled
    ? 'bg-white/95 backdrop-blur-md shadow-lg'
    : 'bg-transparent';

  const textColor = scrolled ? 'text-gray-800' : 'text-white';
  const hoverColor = scrolled ? 'hover:text-blue-600' : 'hover:text-white/80';

  return (
    <nav
      className={`fixed left-0 right-0 z-40 transition-all duration-300 ${navBg} ${ribbonVisible ? 'top-8' : 'top-0'}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo + Name */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            {logo ? (
              <img
                src={logo}
                alt={schoolName}
                className="h-10 w-10 object-contain rounded-full"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
              >
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
            )}
            <span
              className={`font-bold text-lg md:text-xl truncate max-w-[180px] ${textColor}`}
            >
              {schoolName}
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {enabledLinks.map((link) =>
              link.link_type === 'external' ? (
                <a
                  key={link.id}
                  href={link.url}
                  target={link.open_in_new_tab ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${textColor} ${hoverColor}`}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.id}
                  to={link.url}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${textColor} ${hoverColor}`}
                >
                  {link.label}
                </Link>
              )
            )}
            <Link
              to="/login"
              className="ml-2 px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all duration-200 hover:opacity-90 hover:shadow-lg active:scale-95"
              style={{ backgroundColor: primaryColor }}
            >
              {portalLabel}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className={`md:hidden p-2 rounded-lg transition-colors ${textColor}`}
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {enabledLinks.map((link) =>
              link.link_type === 'external' ? (
                <a
                  key={link.id}
                  href={link.url}
                  target={link.open_in_new_tab ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.id}
                  to={link.url}
                  className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
                >
                  {link.label}
                </Link>
              )
            )}
            <Link
              to="/login"
              className="block mt-2 px-3 py-2 text-sm font-semibold text-white text-center rounded-xl"
              style={{ backgroundColor: primaryColor }}
            >
              {portalLabel}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default TenantNavbar;
