import React from 'react';

interface LoadingScreenProps {
  message?: string;
  variant?: 'teacher' | 'student' | 'parent' | 'admin' | 'default';
}

const LABELS: Record<string, string> = {
  teacher: 'Loading Teacher Dashboard…',
  student: 'Loading Student Dashboard…',
  parent:  'Loading Parent Dashboard…',
  admin:   'Loading Admin Dashboard…',
  default: 'Loading…',
};

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message,
  variant = 'default',
}) => {
  const label = message ?? LABELS[variant];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.25rem',
      background: 'var(--color-background-tertiary, #f5f5f5)',
    }}>
      <svg
        width="56" height="56" viewBox="0 0 56 56" fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ animation: 'spin 1s linear infinite' }}
      >
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <defs>
          <linearGradient id="macloader-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#FF3B30" stopOpacity="1"/>
            <stop offset="20%"  stopColor="#FF9500" stopOpacity="1"/>
            <stop offset="40%"  stopColor="#FFCC00" stopOpacity="1"/>
            <stop offset="60%"  stopColor="#34C759" stopOpacity="1"/>
            <stop offset="80%"  stopColor="#007AFF" stopOpacity="1"/>
            <stop offset="100%" stopColor="#AF52DE" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <circle cx="28" cy="28" r="22" stroke="#e0e0e0" strokeWidth="4" fill="none"/>
        <circle cx="28" cy="28" r="22"
          stroke="url(#macloader-grad)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="100 40"
        />
      </svg>

      <p style={{ fontSize: '14px', color: '#888', margin: 0, letterSpacing: '0.01em' }}>
        {label}
      </p>
    </div>
  );
};

export default LoadingScreen;