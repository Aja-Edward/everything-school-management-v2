import React, { useState, useEffect, useRef } from 'react';
import { Palette, Save, Loader2, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { useDesign } from '@/contexts/DesignContext';
import ToggleSwitch from '../ToggleSwitch';
import DesignSettingsService, { DesignSettings } from '@/services/DesignSettingsService';

interface DesignTabProps {
  settings?: any;
  onSettingsUpdate?: (settings: any) => void;
}

const DesignTab: React.FC<DesignTabProps> = ({ settings: initialSettings, onSettingsUpdate }) => {
  const { settings: designSettings, updateSettings: updateDesignSettings } = useDesign();
  const [settings, setSettings] = useState<DesignSettings>({
    primary_color: '#3B82F6',
    secondary_color: '#10B981',
    theme: 'default',
    typography: 'Inter',
    border_radius: 'rounded-lg',
    shadow_style: 'shadow-md',
    animations_enabled: true,
    compact_mode: false,
    dark_mode: false,
    high_contrast: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const initialized = useRef(false);
  const [originalSettings, setOriginalSettings] = useState<DesignSettings | null>(null);

  const themes = [
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

  // Load design settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const loadedSettings = await DesignSettingsService.getDesignSettings();
        console.log('📥 Loaded settings:', loadedSettings);
        
        setSettings(loadedSettings);
        setOriginalSettings(loadedSettings);
        DesignSettingsService.applyDesignSettings(loadedSettings);
        updateDesignSettings(loadedSettings);
      } catch (err) {
        console.error('Failed to load design settings:', err);
        setError('Failed to load design settings');
      } finally {
        setIsLoading(false);
        initialized.current = true;
      }
    };

    if (!initialized.current) {
      loadSettings();
    }
  }, []);

  // Check for changes whenever settings change
  useEffect(() => {
    if (originalSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasChanges(changed);
    }
  }, [settings, originalSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('💾 Saving design settings:', settings);
      const savedSettings = await DesignSettingsService.updateDesignSettings(settings);
      
      // Apply the settings to the page
      DesignSettingsService.applyDesignSettings(savedSettings);
      updateDesignSettings(savedSettings);
      setOriginalSettings(savedSettings);
      
      setSuccess('✨ Design settings saved successfully!');
      setHasChanges(false);
      
      if (onSettingsUpdate) {
        onSettingsUpdate(savedSettings);
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving:', err);
      setError(err instanceof Error ? err.message : 'Failed to save design settings');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    const defaultSettings: DesignSettings = {
      primary_color: '#3B82F6',
      secondary_color: '#10B981',
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
    setHasChanges(true);
  };

  const updateSetting = (key: keyof DesignSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading design settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Success Message */}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <p className="text-green-800 dark:text-green-200 text-sm">{success}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-300">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Palette className="w-5 h-5 text-white" />
            </div>
            Design Customization
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={handleResetToDefault}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors duration-200"
              title="Reset to default settings"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Theme Selection */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Theme Selection</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {themes.map((theme) => {
              const isSelected = settings.theme === theme.id;
              return (
                <div
                  key={theme.id}
                  onClick={() => updateSetting('theme', theme.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300 dark:ring-blue-700'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className={`w-full h-20 rounded-lg mb-3 ${theme.preview}`} />
                  <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{theme.name}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Color & Typography Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color}
                onChange={(e) => updateSetting('primary_color', e.target.value)}
                className="w-16 h-12 rounded-lg border-2 border-slate-200 dark:border-slate-600 cursor-pointer hover:border-slate-300 transition-colors"
              />
              <input
                type="text"
                value={settings.primary_color}
                onChange={(e) => updateSetting('primary_color', e.target.value)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Typography</label>
            <select
              value={settings.typography}
              onChange={(e) => updateSetting('typography', e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {typographyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Border & Shadow Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Border Radius</label>
            <select
              value={settings.border_radius}
              onChange={(e) => updateSetting('border_radius', e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {borderRadiusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Shadow Style</label>
            <select
              value={settings.shadow_style}
              onChange={(e) => updateSetting('shadow_style', e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {shadowOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Display Preferences */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Display Preferences</h4>
          <div className="space-y-3">
            <ToggleSwitch
              id="animations"
              checked={settings.animations_enabled}
              onChange={(checked) => updateSetting('animations_enabled', checked)}
              label="Enable Animations"
              description="Smooth transitions and micro-interactions"
            />
            
            <ToggleSwitch
              id="compact-mode"
              checked={settings.compact_mode}
              onChange={(checked) => updateSetting('compact_mode', checked)}
              label="Compact Mode"
              description="Reduce spacing for more content density"
            />
            
            <ToggleSwitch
              id="dark-mode"
              checked={settings.dark_mode}
              onChange={(checked) => updateSetting('dark_mode', checked)}
              label="Dark Mode"
              description="Darker color scheme for reduced eye strain"
            />
            
            <ToggleSwitch
              id="high-contrast"
              checked={settings.high_contrast}
              onChange={(checked) => updateSetting('high_contrast', checked)}
              label="High Contrast"
              description="Enhanced contrast for better accessibility"
            />
          </div>
        </div>

        {/* Save Button */}
        {hasChanges && (
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center">
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                💡 You have unsaved changes
              </p>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save All Changes
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          <strong>📌 Note:</strong> Your design settings are saved per-tenant (school). Every school has their own unique design. When users log in with your school's slug, they'll see your custom colors, theme, and UI preferences.
        </p>
      </div>
    </div>
  );
};

export default DesignTab;