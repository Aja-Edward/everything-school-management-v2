import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useGlobalTheme } from '@/contexts/GlobalThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';

// The main marketing site's nav. Prospective schools get the product links and
// "Book a demo"; people already using Nuventa get "School login", which finds
// their school's own portal. Platform staff sign in from the footer.
const Nav: React.FC = () => {
  const { isDarkMode, toggleTheme } = useGlobalTheme();
  const { settings } = useSettings();
  const { pathname, hash } = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // App.css gives html and body height: 100% with overflow-x: hidden, which
  // makes body the element that scrolls, not the window. So window.scrollY
  // stays 0; listen in the capture phase, which sees body's scroll events, and
  // read whichever one actually moved.
  useEffect(() => {
    const handleScroll = () =>
      setScrolled(Math.max(window.scrollY, document.body.scrollTop, document.documentElement.scrollTop) > 10);
    handleScroll();
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  useEffect(() => setIsMobileMenuOpen(false), [pathname, hash]);

  // Section links point at the homepage's anchors (pages/Landing.tsx scrolls
  // to them), so they work from every marketing page.
  const navLinks = [
    { label: 'Features', href: '/#features' },
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];

  const isActive = (href: string) => {
    const [path, anchor] = href.split('#');
    return anchor ? pathname === path && hash === `#${anchor}` : pathname === href;
  };

  // Solid once scrolled, or whenever the mobile menu is open over the hero.
  const solid = scrolled || isMobileMenuOpen;

  return (
    <nav
      aria-label="Main"
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-200 ${
        solid ? 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img
              src={settings?.logo ? getAbsoluteUrl(settings.logo) : '/images/nuventa-logo.png'}
              alt=""
              className="w-8 h-8 rounded object-contain"
            />
            <span className={`text-sm font-semibold truncate max-w-[140px] ${solid ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
              {settings?.school_name || 'Nuventa Cloud'}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  solid
                    ? isActive(link.href)
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    : isActive(link.href)
                      ? 'text-white'
                      : 'text-gray-200 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={toggleTheme}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`w-9 h-9 rounded-md flex items-center justify-center text-sm transition-colors ${
                solid
                  ? 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'text-gray-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span aria-hidden="true">{isDarkMode ? '☀' : '☾'}</span>
            </button>

            <Link
              to="/school-login"
              className={`hidden md:block px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                solid
                  ? 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  : 'text-gray-200 hover:text-white hover:bg-white/10'
              }`}
            >
              School login
            </Link>

            <Link
              to="/onboarding/register"
              className={`hidden xl:block px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                solid
                  ? 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                  : 'border-white/30 text-white hover:bg-white/10'
              }`}
            >
              Register school
            </Link>

            <Link
              to="/book-demo"
              className="hidden sm:block px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Book a demo
            </Link>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              className={`lg:hidden w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
                solid
                  ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  : 'text-gray-200 hover:bg-white/10'
              }`}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div id="mobile-menu" className="lg:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`block px-3 py-2.5 text-sm font-medium rounded-md ${
                  isActive(link.href)
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-3 grid gap-2">
              <Link
                to="/book-demo"
                className="block text-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
              >
                Book a free demo
              </Link>
              <Link
                to="/onboarding/register"
                className="block text-center px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium rounded-lg"
              >
                Register your school
              </Link>
              <Link
                to="/school-login"
                className="block text-center px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium rounded-lg"
              >
                Already a school on Nuventa? Log in
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Nav;
