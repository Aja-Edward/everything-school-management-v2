import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/services/api';

// Utility function to convert hex to RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

interface DesignSettings {
  primary_color: string;
  theme: string;
  animations_enabled: boolean;
  compact_mode: boolean;
  typography: string;
  border_radius: string;
  shadow_style: string;
}

interface DesignContextType {
  settings: DesignSettings | null;
  updateSettings: (settings: DesignSettings) => void;
  applyDesignSettings: () => void;
}

const DesignContext = createContext<DesignContextType | undefined>(undefined);

export const useDesign = () => {
  const context = useContext(DesignContext);
  if (context === undefined) {
    throw new Error('useDesign must be used within a DesignProvider');
  }
  return context;
};

interface DesignProviderProps {
  children: React.ReactNode;
}

export const DesignProvider: React.FC<DesignProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<DesignSettings | null>(null);

  // Apply design settings to the document
  const applyDesignSettings = () => {
    if (!settings) return;

    const root = document.documentElement;
    const body = document.body;

    // Apply primary color
    root.style.setProperty('--primary-color', settings.primary_color);
    
    // Update derived CSS variables
    const primaryColor = settings.primary_color;
    const primaryColorRgb = hexToRgb(primaryColor);
    if (primaryColorRgb) {
      root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}80 100%)`);
      root.style.setProperty('--primary-shadow', `0 10px 15px -3px ${primaryColor}25`);
    }
    
    // Apply theme
    body.className = body.className.replace(/theme-\w+/g, '');
    const themeClass = settings.theme === 'default' ? 'theme-default' : `theme-${settings.theme}`;
    body.classList.add(themeClass);
    
    // Also apply theme class to document root for global access
    document.documentElement.className = document.documentElement.className.replace(/theme-\w+/g, '');
    document.documentElement.classList.add(themeClass);
    
    // Apply typography globally by updating CSS variable
    const fontFamily = `'${settings.typography}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    root.style.setProperty('--font-family', fontFamily);
    
    // Also apply font class to body for consistency
    const fontClass = `font-${settings.typography.toLowerCase().replace(/\s+/g, '-')}`;
    body.className = body.className.replace(/font-\w+/g, '');
    body.classList.add(fontClass);
    
    // Apply animations
    if (settings.animations_enabled) {
      body.classList.add('animations-enabled');
      body.classList.remove('animations-disabled');
    } else {
      body.classList.add('animations-disabled');
      body.classList.remove('animations-enabled');
    }
    
    // Apply compact mode
    if (settings.compact_mode) {
      body.classList.add('compact-mode');
    } else {
      body.classList.remove('compact-mode');
    }
    
    // Apply border radius
    root.style.setProperty('--border-radius', settings.border_radius);
    
    // Apply shadow style
    root.style.setProperty('--shadow-style', settings.shadow_style);
  };

  // Fetch settings from API
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/school-settings/school-settings/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setSettings({
            primary_color: data.primary_color || '#3B82F6',
            theme: data.theme || 'default',
            animations_enabled: data.animations_enabled ?? true,
            compact_mode: data.compact_mode ?? false,
            typography: data.typography || 'Inter',
            border_radius: data.border_radius || 'rounded-lg',
            shadow_style: data.shadow_style || 'shadow-md'
          });
        }
      } catch (err) {
        console.error('Failed to fetch design settings:', err);
        // Set default settings if API fails
        setSettings({
          primary_color: '#3B82F6',
          theme: 'default',
          animations_enabled: true,
          compact_mode: false,
          typography: 'Inter',
          border_radius: 'rounded-lg',
          shadow_style: 'shadow-md'
        });
      }
    };

    fetchSettings();
  }, []);

  // Apply settings when they change
  useEffect(() => {
    if (settings) {
      applyDesignSettings();
    }
  }, [settings]);

  const updateSettings = (newSettings: DesignSettings) => {
    setSettings(newSettings);
  };

  return (
    <DesignContext.Provider value={{ settings, updateSettings, applyDesignSettings }}>
      {children}
    </DesignContext.Provider>
  );
}; 