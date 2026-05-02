import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import api from '@/services/api';

// Routes that are publicly accessible — session expiry on these pages
// silently clears auth state without showing the "session expired" modal.
const PUBLIC_PATHS = [
  '/',
  '/about',
  '/how-to-apply',
  '/school_activities',
  '/admissions',
  '/contact',
  '/login',
  '/supabase-login',
  '/verify-email',
  '/setup',
  '/onboarding',
];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));

export const useAuthLost = () => {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [isAuthLost, setIsAuthLost] = useState(false);
  const [authLostMessage, setAuthLostMessage] = useState('');

  const showAuthLost = useCallback((message?: string) => {
    setAuthLostMessage(
      message || 'Your session has expired. Please log in again to continue.'
    );
    setIsAuthLost(true);
  }, []);

  const hideAuthLost = useCallback(() => {
    setIsAuthLost(false);
    setAuthLostMessage('');
  }, []);

  const handleAuthLost = useCallback(
    (message?: string) => {
      // On public pages (landing, login, admissions, etc.) silently log out —
      // no modal needed since the user wasn't actively working in the app.
      if (isPublicPath(location.pathname)) {
        logout();
        return;
      }
      showAuthLost(message);
      logout();
    },
    [showAuthLost, logout, location.pathname]
  );

  // Listen for the auth:expired event dispatched by api.ts.
  // Guard with isAuthenticated so unauthenticated visitors on public pages
  // never see the session-expired modal.
  useEffect(() => {
    const onAuthExpired = () => {
      if (!isAuthenticated) return;
      handleAuthLost('Your session has expired. Please log in again.');
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, [handleAuthLost, isAuthenticated]);

  // Periodically verify the session is still valid via the server.
  // Only runs when the user is authenticated (already guarded by the check below).
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkSession = async () => {
      try {
        const result = await api.checkAuthStatus();
        if (!result.authenticated) {
          handleAuthLost('Your session has expired. Please log in again.');
        }
      } catch {
        // Network error — don't log out, could be temporary connectivity issue
      }
    };

    // Check immediately, then every 4 minutes
    checkSession();
    const interval = setInterval(checkSession, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, handleAuthLost]);

  return {
    isAuthLost,
    authLostMessage,
    showAuthLost,
    hideAuthLost,
    handleAuthLost,
  };
};
