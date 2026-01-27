import React, { useState, useEffect, useRef } from 'react';
import { Palette, Save, Loader2, RotateCcw } from 'lucide-react';
import { useDesign } from '@/contexts/DesignContext';
import ToggleSwitch from '../ToggleSwitch';

// TypeScript interfaces
interface DesignSettings {
  primary_color: string;
  theme: string;
  animations_enabled: boolean;
  compact_mode: boolean;
  dark_mode?: boolean;
  high_contrast?: boolean;
  typography: string;
  border_radius: string;
  shadow_style: string;
}

interface Theme {
  id: string;
  name: string;
  preview: string;
}

interface DesignTabProps {
  settings?: any;
  onSettingsUpdate?: (settings: any) => void;
}




const DesignTab: React.FC<DesignTabProps> = ({ settings: initialSettings, onSettingsUpdate }) => {
  const { settings: designSettings, updateSettings: updateDesignSettings } = useDesign();
  const [settings, setSettings] = useState<DesignSettings>({
    primary_color: '#3B82F6',
    theme: 'default',
    animations_enabled: true,
    compact_mode: false,
    dark_mode: false,
    high_contrast: false,
    typography: 'Inter',
    border_radius: 'rounded-lg',
    shadow_style: 'shadow-md'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
const API_BASE_URL = import.meta.env.VITE_API_URL 
  // Initialize settings from props or design context (only once)
  useEffect(() => {
    const sourceSettings = initialSettings || designSettings;
    if (sourceSettings && !initialized.current) {
      initialized.current = true;
      setSettings({
        primary_color: sourceSettings.primary_color || '#3B82F6',
        theme: sourceSettings.theme || 'modern',
        animations_enabled: sourceSettings.animations_enabled ?? true,
        compact_mode: sourceSettings.compact_mode ?? false,
        dark_mode: sourceSettings.dark_mode ?? false,
        high_contrast: sourceSettings.high_contrast ?? false,
        typography: sourceSettings.typography || 'Inter',
        border_radius: sourceSettings.border_radius || 'rounded-lg',
        shadow_style: sourceSettings.shadow_style || 'shadow-md'
      });
    }
  }, [initialSettings, designSettings]);

  const themes: Theme[] = [
    { id: 'default', name: 'Default (Recommended)', preview: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950' },
    { id: 'modern', name: 'Modern', preview: 'bg-gradient-to-br from-blue-500 to-purple-600' },
    { id: 'classic', name: 'Classic', preview: 'bg-gradient-to-br from-slate-600 to-slate-800' },
    { id: 'vibrant', name: 'Vibrant', preview: 'bg-gradient-to-br from-pink-500 to-orange-500' },
    { id: 'minimal', name: 'Minimal', preview: 'bg-gradient-to-br from-gray-100 to-gray-200' },
    { id: 'corporate', name: 'Corporate', preview: 'bg-gradient-to-br from-indigo-600 to-blue-700' },
    { id: 'premium', name: 'Premium', preview: 'bg-gradient-to-br from-rose-950 via-slate-950 to-blue-950' },
    { id: 'dark', name: 'Dark Mode', preview: 'bg-gradient-to-br from-gray-900 to-gray-800' },
    { id: 'obsidian', name: 'Obsidian (Ultra Premium)', preview: 'bg-gradient-to-br from-gray-950 via-black to-slate-950' },
    { id: 'aurora', name: 'Aurora (Ultra Premium)', preview: 'bg-gradient-to-br from-indigo-950 via-violet-950 to-pink-950' },
    { id: 'midnight', name: 'Midnight (Ultra Premium)', preview: 'bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950' },
    { id: 'crimson', name: 'Crimson (Ultra Premium)', preview: 'bg-gradient-to-br from-red-950 via-rose-950 to-pink-950' },
    { id: 'forest', name: 'Forest (Ultra Premium)', preview: 'bg-gradient-to-br from-green-950 via-emerald-950 to-teal-950' },
    { id: 'golden', name: 'Golden (Ultra Premium)', preview: 'bg-gradient-to-br from-yellow-950 via-amber-950 to-orange-950' }
  ];

  const typographyOptions = [
    { value: 'Inter', label: 'Inter (Recommended)' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans' },
    { value: 'Poppins', label: 'Poppins' },
    { value: 'Montserrat', label: 'Montserrat' }
  ];

  const borderRadiusOptions = [
    { value: 'rounded-none', label: 'Sharp' },
    { value: 'rounded', label: 'Slightly Rounded' },
    { value: 'rounded-lg', label: 'Rounded' },
    { value: 'rounded-xl', label: 'More Rounded' },
    { value: 'rounded-2xl', label: 'Very Rounded' }
  ];

  const shadowOptions = [
    { value: 'shadow-none', label: 'No Shadow' },
    { value: 'shadow-sm', label: 'Subtle Shadow' },
    { value: 'shadow-md', label: 'Medium Shadow' },
    { value: 'shadow-lg', label: 'Large Shadow' },
    { value: 'shadow-xl', label: 'Extra Large Shadow' }
  ];

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/school-settings/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSuccess('Design settings saved successfully!');
        if (onSettingsUpdate) {
          onSettingsUpdate(updatedSettings);
        }
        // Update design context
        updateDesignSettings(settings);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(`Failed to save settings: ${errorData.error || 'Unknown error'}`);
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      setError('Failed to save settings. Please try again.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTypographyChange = (fontFamily: string) => {
    console.log('Typography changed to:', fontFamily);
    const newSettings = { ...settings, typography: fontFamily };
    setSettings(newSettings);
    
    // Apply typography change immediately and globally
    const root = document.documentElement;
    const body = document.body;
    
    // Update CSS variable for global typography
    const fontFamilyValue = `'${fontFamily}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    root.style.setProperty('--font-family', fontFamilyValue);
    
    // Also apply font class to body for consistency
    const fontClass = `font-${fontFamily.toLowerCase().replace(/\s+/g, '-')}`;
    body.className = body.className.replace(/font-\w+/g, '');
    body.classList.add(fontClass);
    
    // Don't update design context immediately to avoid conflicts
    // updateDesignSettings(newSettings);
  };

  const handlePrimaryColorChange = (color: string) => {
    console.log('Primary color changed to:', color);
    const newSettings = { ...settings, primary_color: color };
    setSettings(newSettings);
    
    // Apply primary color change immediately and globally
    const root = document.documentElement;
    root.style.setProperty('--primary-color', color);
    
    // Update derived CSS variables
    root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${color} 0%, ${color}80 100%)`);
    root.style.setProperty('--primary-shadow', `0 10px 15px -3px ${color}25`);
    
    // Force a re-render of elements that use the primary color
    const event = new CustomEvent('primaryColorChanged', { detail: { color } });
    document.dispatchEvent(event);
    
    // Don't update design context immediately to avoid conflicts
    // updateDesignSettings(newSettings);
  };

  const handleThemeChange = (theme: string) => {
    console.log('Theme changed to:', theme);
    const newSettings = { ...settings, theme };
    setSettings(newSettings);
    
    // Apply theme change immediately to document
    const body = document.body;
    body.className = body.className.replace(/theme-\w+/g, '');
    body.classList.add(`theme-${theme}`);
    
    // Don't update design context immediately to avoid conflicts
    // updateDesignSettings(newSettings);
  };

  const handleResetToDefault = () => {
    const defaultSettings: DesignSettings = {
      primary_color: '#3B82F6',
      theme: 'default',
      animations_enabled: true,
      compact_mode: false,
      dark_mode: false,
      high_contrast: false,
      typography: 'Inter',
      border_radius: 'rounded-lg',
      shadow_style: 'shadow-md'
    };
    
    setSettings(defaultSettings);
    
    // Apply default theme immediately
    const body = document.body;
    const root = document.documentElement;
    
    body.className = body.className.replace(/theme-\w+/g, '');
    root.className = root.className.replace(/theme-\w+/g, '');
    
    body.classList.add('theme-default');
    root.classList.add('theme-default');
    
    // Reset CSS variables
    root.style.setProperty('--primary-color', '#3B82F6');
    root.style.setProperty('--primary-gradient', 'linear-gradient(135deg, #3B82F6 0%, #3B82F680 100%)');
    root.style.setProperty('--primary-shadow', '0 10px 15px -3px #3B82F625');
    root.style.setProperty('--font-family', "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
    root.style.setProperty('--border-radius', 'rounded-lg');
    root.style.setProperty('--shadow-style', 'shadow-md');
    
    // Reset body classes
    body.classList.remove('animations-disabled', 'compact-mode');
    body.classList.add('animations-enabled');
  };

  return (
    <div className="space-y-8">
      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-800 dark:text-green-200 text-sm">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-300">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-3 transition-colors duration-300">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Palette className="w-4 h-4 text-white" />
            </div>
            Theme & Colors
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetToDefault}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors duration-200"
              title="Reset to default settings"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Default
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
        
        <div className="mb-8">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 transition-colors duration-300">Theme Selection</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {themes.map((theme) => {
              const isSelected = settings.theme === theme.id;
              return (
                <div
                  key={theme.id}
                  onClick={() => {
                    console.log('Theme clicked:', theme.id);
                    handleThemeChange(theme.id);
                  }}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className={`w-full h-20 rounded-lg mb-3 ${theme.preview}`} />
                  <p className="font-medium text-slate-900 dark:text-slate-100 transition-colors duration-300">{theme.name}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors duration-300">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color}
                onChange={(e) => handlePrimaryColorChange(e.target.value)}
                className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer transition-colors duration-300"
              />
              <input
                type="text"
                value={settings.primary_color}
                onChange={(e) => handlePrimaryColorChange(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/20 transition-all duration-200"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors duration-300">Typography</label>
            <select 
              value={settings.typography}
              onChange={(e) => {
                console.log('Typography select changed:', e.target.value);
                handleTypographyChange(e.target.value);
              }}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/20 transition-all duration-200"
            >
              {typographyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors duration-300">Border Radius</label>
            <select 
              value={settings.border_radius}
              onChange={(e) => setSettings({...settings, border_radius: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/20 transition-all duration-200"
            >
              {borderRadiusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors duration-300">Shadow Style</label>
            <select 
              value={settings.shadow_style}
              onChange={(e) => setSettings({...settings, shadow_style: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/20 transition-all duration-200"
            >
              {shadowOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6 transition-colors duration-300">
          <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-4 transition-colors duration-300">Display Preferences</h4>
          <div className="space-y-1">
            <ToggleSwitch
              id="animations"
              checked={settings.animations_enabled}
              onChange={(checked) => setSettings({...settings, animations_enabled: checked})}
              label="Enable animations"
              description="Smooth transitions and micro-interactions"
            />
            <ToggleSwitch
              id="compact-mode"
              checked={settings.compact_mode}
              onChange={(checked) => setSettings({...settings, compact_mode: checked})}
              label="Compact mode"
              description="Reduce spacing for more content density"
            />
            <ToggleSwitch
              id="dark-mode"
              checked={settings.dark_mode || false}
              onChange={(checked) => setSettings({...settings, dark_mode: checked})}
              label="Dark mode"
              description="Switch between light and dark themes"
            />
            <ToggleSwitch
              id="high-contrast"
              checked={settings.high_contrast || false}
              onChange={(checked) => setSettings({...settings, high_contrast: checked})}
              label="High contrast"
              description="Enhanced contrast for better accessibility"
            />
          </div>
        </div>
        
        {/* Bottom Save Button */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {isLoading ? 'Saving Changes...' : 'Save Design Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignTab;