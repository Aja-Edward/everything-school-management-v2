import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import api from '@/services/api';

export const useAuthLost = () => {
  const { isAuthenticated, logout } = useAuth();
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
      showAuthLost(message);
      logout();
    },
    [showAuthLost, logout]
  );

  // Listen for the auth:expired event dispatched by api.ts
  useEffect(() => {
    const onAuthExpired = () => {
      handleAuthLost('Your session has expired. Please log in again.');
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, [handleAuthLost]);

  // Periodically verify the session is still valid via the server
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkSession = async () => {
      try {
        const result = await api.checkAuthStatus();
        if (!result.authenticated) {
          handleAuthLost('Your session has expired. Please log in again.');
        }
      } catch {
        // Network error — don't log out, could be temporary
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