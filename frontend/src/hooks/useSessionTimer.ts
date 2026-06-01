import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
const WARNING_BEFORE_MS = 2 * 60 * 1000; // warn 2 minutes before logout

interface UseSessionTimerOptions {
  timeoutMinutes: number;
  onLogout: () => void;
  onWarning?: (secondsRemaining: number) => void;
  enabled?: boolean;
}

export function useSessionTimer({
  timeoutMinutes,
  onLogout,
  onWarning,
  enabled = true,
}: UseSessionTimerOptions) {
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
  }, []);

  const resetTimer = useCallback(() => {
    if (!enabled || !timeoutMinutes) return;

    clearTimers();

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const warningAt = timeoutMs - WARNING_BEFORE_MS;

    // Only show warning if there's enough time before logout
    if (warningAt > 0 && onWarning) {
      warningTimer.current = setTimeout(() => {
        onWarning(WARNING_BEFORE_MS / 1000);
      }, warningAt);
    }

    logoutTimer.current = setTimeout(() => {
      onLogout();
    }, timeoutMs);
  }, [enabled, timeoutMinutes, onLogout, onWarning, clearTimers]);

  useEffect(() => {
    if (!enabled) return;

    resetTimer();

    ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, resetTimer)
      );
    };
  }, [enabled, resetTimer, clearTimers]);
}