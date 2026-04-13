/**
 * Design Settings Service
 * Manages tenant-specific design and branding settings
 * Every tenant can customize: colors, theme, typography, and UI preferences
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface DesignSettings {
  // Branding & Colors
  primary_color: string;
  secondary_color: string;
  
  // Theme & Typography
  theme: 'default' | 'modern' | 'classic' | 'vibrant' | 'minimal' | 'corporate' | 'premium' | 'dark' | 'obsidian' | 'aurora' | 'midnight' | 'crimson' | 'forest' | 'golden';
  typography: 'Inter' | 'Roboto' | 'Open Sans' | 'Poppins' | 'Montserrat';
  
  // Design Customization
  border_radius: 'rounded-none' | 'rounded' | 'rounded-lg' | 'rounded-xl' | 'rounded-2xl';
  shadow_style: 'shadow-none' | 'shadow-sm' | 'shadow-md' | 'shadow-lg' | 'shadow-xl';
  
  // Display Preferences
  animations_enabled: boolean;
  compact_mode: boolean;
  dark_mode: boolean;
  high_contrast: boolean;
}

class DesignSettingsService {
  private cacheKey = 'designSettings';
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private lastFetchTime = 0;

  
  /**
   * Get CSRF token from cookies
   */
  private getCsrfToken(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrftoken') return decodeURIComponent(value);
    }
    return null;
  }

  /**
   * Fetch design settings for current tenant
   */
  async getDesignSettings(): Promise<DesignSettings> {
    const cached = this.getCachedSettings();
    if (cached) {
      console.log('📦 Using cached design settings');
      return cached;
    }

    try {
      const tenantSlug = this.getTenantSlug();
      const headers: any = { 'Content-Type': 'application/json' };
      
      
      if (tenantSlug) {
        headers['X-Tenant-Slug'] = tenantSlug;
      }

      const response = await fetch(`${API_BASE_URL}/tenants/settings/current/`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Design settings loaded:', data);

      // Cache the settings
      this.setCachedSettings(data);

      return {
        primary_color: data.primary_color || '#4F46E5',
        secondary_color: data.secondary_color || '#10B981',
        theme: data.theme || 'default',
        typography: data.typography || 'Inter',
        border_radius: data.border_radius || 'rounded-lg',
        shadow_style: data.shadow_style || 'shadow-md',
        animations_enabled: data.animations_enabled ?? true,
        compact_mode: data.compact_mode ?? false,
        dark_mode: data.dark_mode ?? false,
        high_contrast: data.high_contrast ?? false,
      };
    } catch (error) {
      console.error('❌ Error fetching design settings:', error);
      // Return defaults on error
      return this.getDefaultSettings();
    }
  }

  /**
   * Get tenant slug from localStorage
   */
  private getTenantSlug(): string | null {
    return localStorage.getItem('tenantSlug');
  }

  /**
   * Update design settings for current tenant
   */
  async updateDesignSettings(newSettings: Partial<DesignSettings>): Promise<DesignSettings> {
    try {
      const csrfToken = this.getCsrfToken();
      const tenantSlug = this.getTenantSlug();

      const headers: any = { 'Content-Type': 'application/json' };
    
      if (csrfToken) {
        headers['X-CSRFToken'] = csrfToken;
      }
      if (tenantSlug) {
        headers['X-Tenant-Slug'] = tenantSlug;
      }

      console.log('💾 Updating design settings:', newSettings);
      const response = await fetch(`${API_BASE_URL}/tenants/settings/current/`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify(newSettings),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Backend validation error:', errorData);
        throw new Error(errorData.detail || errorData.message || JSON.stringify(errorData) || `HTTP ${response.status}`);
      }

      const updatedData = await response.json();
      console.log('✅ Design settings updated:', updatedData);

      // Invalidate cache
      this.clearCache();

      return {
        primary_color: updatedData.primary_color || '#4F46E5',
        secondary_color: updatedData.secondary_color || '#10B981',
        theme: updatedData.theme || 'default',
        typography: updatedData.typography || 'Inter',
        border_radius: updatedData.border_radius || 'rounded-lg',
        shadow_style: updatedData.shadow_style || 'shadow-md',
        animations_enabled: updatedData.animations_enabled ?? true,
        compact_mode: updatedData.compact_mode ?? false,
        dark_mode: updatedData.dark_mode ?? false,
        high_contrast: updatedData.high_contrast ?? false,
      };
    } catch (error) {
      console.error('❌ Error updating design settings:', error);
      throw error;
    }
  }

  /**
   * Apply design settings to the current page/app
   */
  applyDesignSettings(settings: DesignSettings): void {
    const root = document.documentElement;
    const body = document.body;

    console.log('🎨 Applying design settings to DOM');

    // Apply colors
    root.style.setProperty('--primary-color', settings.primary_color);
    root.style.setProperty('--secondary-color', settings.secondary_color);
    root.style.setProperty(
      '--primary-gradient',
      `linear-gradient(135deg, ${settings.primary_color} 0%, ${settings.primary_color}80 100%)`
    );
    root.style.setProperty(
      '--primary-shadow',
      `0 10px 15px -3px ${settings.primary_color}25`
    );

    // Apply theme
    body.className = body.className.replace(/theme-\w+/g, '');
    body.classList.add(`theme-${settings.theme}`);

    // Apply typography
    const fontFamilyValue = `'${settings.typography}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    root.style.setProperty('--font-family', fontFamilyValue);
    body.className = body.className.replace(/font-\w+/g, '');
    body.classList.add(`font-${settings.typography.toLowerCase().replace(/\s+/g, '-')}`);

    // Apply border radius
    root.style.setProperty('--border-radius', settings.border_radius);

    // Apply shadow style
    root.style.setProperty('--shadow-style', settings.shadow_style);

    // Apply display preferences
    if (settings.animations_enabled) {
      body.classList.remove('animations-disabled');
      body.classList.add('animations-enabled');
    } else {
      body.classList.remove('animations-enabled');
      body.classList.add('animations-disabled');
    }

    if (settings.compact_mode) {
      body.classList.add('compact-mode');
    } else {
      body.classList.remove('compact-mode');
    }

    if (settings.dark_mode) {
      body.classList.add('dark');
      root.classList.add('dark');
    } else {
      body.classList.remove('dark');
      root.classList.remove('dark');
    }

    if (settings.high_contrast) {
      body.classList.add('high-contrast');
    } else {
      body.classList.remove('high-contrast');
    }

    // Dispatch event so components can react to design changes
    window.dispatchEvent(
      new CustomEvent('designSettingsApplied', { detail: settings })
    );

    console.log('✨ Design settings applied successfully');
  }

  /**
   * Get default design settings
   */
  private getDefaultSettings(): DesignSettings {
    return {
      primary_color: '#4F46E5',
      secondary_color: '#10B981',
      theme: 'default',
      typography: 'Inter',
      border_radius: 'rounded-lg',
      shadow_style: 'shadow-md',
      animations_enabled: true,
      compact_mode: false,
      dark_mode: false,
      high_contrast: false,
    };
  }

  /**
   * Cache design settings in localStorage
   */
  private setCachedSettings(settings: any): void {
    try {
      localStorage.setItem(
        this.cacheKey,
        JSON.stringify({
          data: settings,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.warn('Failed to cache design settings:', error);
    }
  }

  /**
   * Get cached design settings
   */
  private getCachedSettings(): DesignSettings | null {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const isExpired = Date.now() - timestamp > this.cacheTimeout;

      if (isExpired) {
        localStorage.removeItem(this.cacheKey);
        return null;
      }

      return {
        primary_color: data.primary_color || '#4F46E5',
        secondary_color: data.secondary_color || '#10B981',
        theme: data.theme || 'default',
        typography: data.typography || 'Inter',
        border_radius: data.border_radius || 'rounded-lg',
        shadow_style: data.shadow_style || 'shadow-md',
        animations_enabled: data.animations_enabled ?? true,
        compact_mode: data.compact_mode ?? false,
        dark_mode: data.dark_mode ?? false,
        high_contrast: data.high_contrast ?? false,
      };
    } catch (error) {
      console.warn('Failed to retrieve cached design settings:', error);
      return null;
    }
  }

  /**
   * Clear cached design settings
   */
  clearCache(): void {
    try {
      localStorage.removeItem(this.cacheKey);
      console.log('🗑️ Design settings cache cleared');
    } catch (error) {
      console.warn('Failed to clear design settings cache:', error);
    }
  }
}

export default new DesignSettingsService();
