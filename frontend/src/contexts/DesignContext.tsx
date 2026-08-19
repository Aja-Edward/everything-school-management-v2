import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '@/services/api';

// ============================================================================
// UTILS
// ============================================================================

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

/**
 * Build a Tailwind-style 50..950 scale from the school's single brand colour.
 *
 * The Design Settings screen lets a school pick primary_color, but
 * tailwind.config.js defined `primary` as a fixed indigo palette, so nothing
 * ever consumed the choice. These variables are what that palette now reads.
 *
 * Values are emitted as space-separated RGB channels ("79 70 229") rather than
 * hex, so Tailwind can compose them with opacity modifiers such as
 * bg-primary-600/50 via rgb(var(--x) / <alpha-value>).
 */
const PRIMARY_STOPS: Array<[number, number]> = [
  // [shade, mix] — negative mixes toward white, positive toward black
  [50, -0.95], [100, -0.9], [200, -0.75], [300, -0.6], [400, -0.3],
  [500, 0], [600, 0.12], [700, 0.26], [800, 0.4], [900, 0.53], [950, 0.7],
];

const primaryScale = (hex: string): Array<[number, string]> => {
  const rgb = hexToRgb(hex);
  if (!rgb) return [];
  return PRIMARY_STOPS.map(([shade, mix]) => {
    const target = mix < 0 ? 255 : 0;
    const amount = Math.abs(mix);
    const ch = (v: number) => Math.round(v + (target - v) * amount);
    return [shade, `${ch(rgb.r)} ${ch(rgb.g)} ${ch(rgb.b)}`] as [number, string];
  });
};

const DEFAULT_SETTINGS: DesignSettings = {
  primary_color: '#3B82F6',
  theme: 'default',
  animations_enabled: true,
  compact_mode: false,
  typography: 'Inter',
  border_radius: 'rounded-lg',
  shadow_style: 'shadow-md',
};

// ============================================================================
// TYPES
// ============================================================================

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
  applyDesignSettings: (settings: DesignSettings) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const DesignContext = createContext<DesignContextType | undefined>(undefined);

export const useDesign = () => {
  const context = useContext(DesignContext);
  if (!context) throw new Error('useDesign must be used within a DesignProvider');
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

export const DesignProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<DesignSettings | null>(null);

  // ✅ Takes settings as a parameter — no stale closure risk
  const applyDesignSettings = useCallback((s: DesignSettings) => {
    const root = document.documentElement;
    const body = document.body;

    // Primary color
    root.style.setProperty('--primary-color', s.primary_color);
    const rgb = hexToRgb(s.primary_color);
    if (rgb) {
      root.style.setProperty(
        '--primary-gradient',
        `linear-gradient(135deg, ${s.primary_color} 0%, ${s.primary_color}80 100%)`
      );
      root.style.setProperty('--primary-shadow', `0 10px 15px -3px ${s.primary_color}25`);
    }

    // Drive the Tailwind `primary` palette from the school's colour.
    primaryScale(s.primary_color).forEach(([shade, channels]) => {
      root.style.setProperty(`--color-primary-${shade}`, channels);
    });

    // Theme
    const themeClass = s.theme === 'default' ? 'theme-default' : `theme-${s.theme}`;
    body.className = body.className.replace(/theme-\w+/g, '').trim();
    body.classList.add(themeClass);
    root.className = root.className.replace(/theme-\w+/g, '').trim();
    root.classList.add(themeClass);

    // Typography
    root.style.setProperty(
      '--font-family',
      `'${s.typography}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
    );
    const fontClass = `font-${s.typography.toLowerCase().replace(/\s+/g, '-')}`;
    body.className = body.className.replace(/font-[\w-]+/g, '').trim();
    body.classList.add(fontClass);

    // Animations
    body.classList.toggle('animations-enabled', s.animations_enabled);
    body.classList.toggle('animations-disabled', !s.animations_enabled);

    // Compact mode
    body.classList.toggle('compact-mode', s.compact_mode);

    // Border radius & shadow
    root.style.setProperty('--border-radius', s.border_radius);
    root.style.setProperty('--shadow-style', s.shadow_style);
  }, []);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // ✅ Routes through api.ts — credentials + CSRF handled automatically
        const data = await api.get('/school-settings/school-settings/');
        const resolved: DesignSettings = {
          primary_color: data.primary_color || DEFAULT_SETTINGS.primary_color,
          theme: data.theme || DEFAULT_SETTINGS.theme,
          animations_enabled: data.animations_enabled ?? DEFAULT_SETTINGS.animations_enabled,
          compact_mode: data.compact_mode ?? DEFAULT_SETTINGS.compact_mode,
          typography: data.typography || DEFAULT_SETTINGS.typography,
          border_radius: data.border_radius || DEFAULT_SETTINGS.border_radius,
          shadow_style: data.shadow_style || DEFAULT_SETTINGS.shadow_style,
        };
        setSettings(resolved);
      } catch {
        // API unavailable — fall back to defaults silently
        setSettings(DEFAULT_SETTINGS);
      }
    };

    fetchSettings();
  }, []);

  // Apply whenever settings change
  useEffect(() => {
    if (settings) applyDesignSettings(settings);
  }, [settings, applyDesignSettings]);

  const updateSettings = useCallback((newSettings: DesignSettings) => {
    setSettings(newSettings);
  }, []);

  return (
    <DesignContext.Provider value={{ settings, updateSettings, applyDesignSettings }}>
      {children}
    </DesignContext.Provider>
  );
};