import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';

const PLATFORM_NAME = 'Nuventa Cloud';

const PATH_LABELS: Record<string, string> = {
  '/':            '',
  '/about':       'About Us',
  '/admissions':  'Admissions',
  '/contact':     'Contact',
  '/login':       'Portal Login',
  '/school_activities': 'Activities',
  '/how-to-apply': 'How to Apply',
  '/verify-email': 'Verify Email',
  '/onboarding/register': 'Register Your School',
  '/onboarding/services':  'Select Services',
  '/onboarding/complete':  'Registration Complete',
  '/setup':       'Setup',
  '/student/dashboard':  'Student Dashboard',
  '/parent/dashboard':   'Parent Dashboard',
  '/teacher/dashboard':  'Teacher Dashboard',
  '/admin/dashboard':    'Admin Dashboard',
  '/admin/settings':     'Settings',
};

function getLabelForPath(pathname: string): string {
  // Exact match first
  if (pathname in PATH_LABELS) return PATH_LABELS[pathname];

  // Prefix match for nested routes
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const topTwo = `/${segments[0]}/${segments[1]}`;
    if (topTwo in PATH_LABELS) return PATH_LABELS[topTwo];
  }
  if (segments.length >= 1) {
    const top = `/${segments[0]}`;
    if (top in PATH_LABELS) return PATH_LABELS[top];
  }

  // Capitalise last path segment as fallback
  const last = segments[segments.length - 1];
  return last ? last.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
}

const TitleManager: React.FC = () => {
  const { pathname } = useLocation();
  const { tenant, isSubdomain } = useTenant();

  useEffect(() => {
    const base = isSubdomain && tenant?.name ? tenant.name : PLATFORM_NAME;
    const label = getLabelForPath(pathname);
    document.title = label ? `${label} | ${base}` : base;
  }, [pathname, tenant, isSubdomain]);

  return null;
};

export default TitleManager;
