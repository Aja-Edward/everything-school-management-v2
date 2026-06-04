import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useAuthLost } from '@/hooks/useAuthLost';
import AuthLostModal from './AuthLostModal';
import { useSettings } from '@/contexts/SettingsContext'; 
import { getAbsoluteUrl } from '@/utils/urlUtils';

interface AuthLostContextType {
  showAuthLost: (message?: string) => void;
  hideAuthLost: () => void;
  handleAuthLost: (message?: string) => void;
}

const AuthLostContext = createContext<AuthLostContextType | undefined>(undefined);

export const useAuthLostContext = () => {
  const context = useContext(AuthLostContext);
  if (!context) {
    throw new Error('useAuthLostContext must be used within an AuthLostProvider');
  }
  return context;
};

interface AuthLostProviderProps {
  children: ReactNode;
}

export const AuthLostProvider: React.FC<AuthLostProviderProps> = ({ children }) => {

  const { isAuthLost, authLostMessage, showAuthLost, hideAuthLost, handleAuthLost } = useAuthLost();

  const { settings } = useSettings();

  useEffect(() => {
    const onSessionTimeout = (e: CustomEvent) => {
      handleAuthLost(e.detail?.message);
    };
    window.addEventListener('session:timeout' as any, onSessionTimeout);
    return () => window.removeEventListener('session:timeout' as any, onSessionTimeout);
  }, [handleAuthLost]);

  const rawLogo = settings?.logo || '';
  const logoUrl = rawLogo ? getAbsoluteUrl(rawLogo) || undefined : undefined;
  const schoolName = settings?.school_name || undefined;

   console.log('AuthLostProvider logoUrl:', logoUrl, '| schoolName:', schoolName);

  const contextValue: AuthLostContextType = {
    showAuthLost,
    hideAuthLost,
    handleAuthLost,
  };

  return (
    <AuthLostContext.Provider value={contextValue}>
      {children}
      <AuthLostModal 
        isOpen={isAuthLost} 
        onClose={hideAuthLost}
        message={authLostMessage}
        logoUrl={logoUrl}
        schoolName={schoolName}
       primaryColor={settings?.primaryColor}
      />
    </AuthLostContext.Provider>
  );
};














