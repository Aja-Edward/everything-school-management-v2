import React, { useState, useEffect } from 'react';
import { Save, Loader2, Building2, Globe, Calendar, Check, X } from 'lucide-react';
import SettingsService from '@/services/SettingsService';
import { API_BASE_URL } from '@/services/api';

interface GeneralTabProps {
  settings?: any;
  onSettingsUpdate?: (settings: any) => void;
}

const GeneralTab: React.FC<GeneralTabProps> = ({ settings: initialSettings, onSettingsUpdate }) => {
  const [formData, setFormData] = useState({
    school_name: '',
    site_name: '',
    school_code: '',
    address: '',
    phone: '',
    email: '',
    motto: '',
    timezone: 'UTC-5',
    dateFormat: 'dd/mm/yyyy',
    language: 'English',
    academicYear: '',
    logo: '',
    favicon: ''
  });

  const formatAcademicYear = (year: string) => {
  if (!year) return '';
  // If already formatted with slash, return as is
  if (year.includes('/')) return year;
  // If it's 8 digits like "20252026", format it
  if (year.length === 8 && /^\d+$/.test(year)) {
    return `${year.slice(0, 4)}/${year.slice(4)}`;
  }
  return year;
};

  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [faviconPreview, setFaviconPreview] = useState<string>('');

  useEffect(() => {
    if (initialSettings) {
      console.log('GeneralTab: Initializing with settings:', initialSettings);
      
      // Helper function to construct full URL from filename or path
      const constructFullUrl = (urlOrFilename: string) => {
        if (!urlOrFilename) return '';
        if (urlOrFilename.startsWith('http')) return urlOrFilename;
        // If it's just a filename or relative path, construct full URL
        const cleanPath = urlOrFilename.startsWith('/') ? urlOrFilename : `/${urlOrFilename}`;
        return `${API_BASE_URL}${cleanPath}`;
      };
      
      const logoUrl = constructFullUrl(initialSettings.logo);
      const faviconUrl = constructFullUrl(initialSettings.favicon);
      
      console.log('GeneralTab: Constructed logo URL:', logoUrl);
      console.log('GeneralTab: Constructed favicon URL:', faviconUrl);
      
      setFormData({
        school_name: initialSettings.school_name || '',
        site_name: initialSettings.site_name || '',
        school_code: initialSettings.school_code || '',
        address: initialSettings.address || '',
        phone: initialSettings.phone || '',
        email: initialSettings.email || '',
        motto: initialSettings.motto || '',
        timezone: initialSettings.timezone || 'UTC-5',
        dateFormat: initialSettings.dateFormat || 'dd/mm/yyyy',
        language: initialSettings.language || 'English',
        academicYear: formatAcademicYear(initialSettings.academicYear || ''),
        logo: logoUrl,
        favicon: faviconUrl
      });
      
      if (logoUrl) {
        setLogoPreview(logoUrl);
      }
      if (faviconUrl) {
        setFaviconPreview(faviconUrl);
      }
    }
  }, [initialSettings]);

  const handleInputChange = (field: string, value: string) => {
    console.log(`GeneralTab: Field "${field}" changed to:`, value);
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear any previous errors when user makes changes
    setError(null);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear previous upload errors
    setUploadError(null);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (JPG, PNG, etc.)');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('Logo file size must be less than 2MB');
      return;
    }

    try {
      setIsUploadingLogo(true);
      console.log('GeneralTab: Uploading logo...', file.name);
      
      const result = await SettingsService.uploadLogo(file);
      const fullLogoUrl = result.logoUrl
        ? result.logoUrl.startsWith('http')
          ? result.logoUrl
          : `${API_BASE_URL}${result.logoUrl.startsWith('/') ? result.logoUrl : '/' + result.logoUrl}`
        : '';
      console.log('GeneralTab: Logo upload result:', result);
      console.log('GeneralTab: Full logo URL:', fullLogoUrl);
      
      setFormData(prev => ({
        ...prev,
        logo: fullLogoUrl
      }));
      setLogoPreview(fullLogoUrl);
      setSuccess('Logo uploaded successfully! Remember to click "Save Changes" to apply.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      console.error('GeneralTab: Logo upload error:', err);
      setUploadError(err.message || 'Failed to upload logo. Please try again.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (ICO, PNG, etc.)');
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      setUploadError('Favicon file size must be less than 1MB');
      return;
    }

    try {
      setIsUploadingFavicon(true);
      console.log('GeneralTab: Uploading favicon...', file.name);
      
      const result = await SettingsService.uploadFavicon(file);
    
      const fullFaviconUrl = result.faviconUrl
        ? result.faviconUrl.startsWith('http')
          ? result.faviconUrl
          : `${API_BASE_URL}${result.faviconUrl.startsWith('/') ? result.faviconUrl : '/' + result.faviconUrl}`
        : '';
      
      console.log('GeneralTab: Favicon upload result:', result);
      console.log('GeneralTab: Full favicon URL:', fullFaviconUrl);
      
      setFormData(prev => ({
        ...prev,
        favicon: fullFaviconUrl
      }));
      setFaviconPreview(fullFaviconUrl);
      setSuccess('Favicon uploaded successfully! Remember to click "Save Changes" to apply.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      console.error('GeneralTab: Favicon upload error:', err);
      setUploadError(err.message || 'Failed to upload favicon. Please try again.');
    } finally {
      setIsUploadingFavicon(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setUploadError(null);

    // Validate required fields
    if (!formData.school_name?.trim()) {
      setError('School name is required');
      setIsLoading(false);
      return;
    }
    if (!formData.school_code?.trim()) {
      setError('School code is required');
      setIsLoading(false);
      return;
    }

    if (!formData.email?.trim()) {
      setError('Email is required');
      setIsLoading(false);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    try {
      console.log('GeneralTab: Attempting to save settings...');
      console.log('GeneralTab: Form data being sent:', formData);
      
      // Call parent's update handler which uses SettingsContext
      if (onSettingsUpdate) {
        await onSettingsUpdate(formData);
        console.log('GeneralTab: Settings saved successfully!');
        setSuccess('Settings saved successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        console.error('GeneralTab: No onSettingsUpdate handler provided');
        setError('Cannot save settings - no update handler provided');
      }
    } catch (err: any) {
      console.error('GeneralTab: Save error:', err);
      console.error('GeneralTab: Error stack:', err.stack);
      
      // Extract meaningful error message
      let errorMessage = 'Failed to save settings';
      if (err.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsLoading(false);
    }
  };

  const timezones = [
    'UTC-12', 'UTC-11', 'UTC-10', 'UTC-9', 'UTC-8', 'UTC-7', 'UTC-6',
    'UTC-5', 'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1', 'UTC',
    'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+6',
    'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12'
  ];

  const dateFormats = ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd-mm-yyyy'];
  const languages = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Arabic'];

  return (
    <div className="p-8 space-y-8">
      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}
      
      {/* General Save Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 text-sm font-medium mb-1">Save Error</p>
            <p className="text-red-700 text-sm whitespace-pre-wrap">{error}</p>
          </div>
        </div>
      )}
      
      {/* Upload Error (separate from save errors) */}
      {uploadError && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
          <X className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-orange-800 text-sm font-medium mb-1">Upload Error</p>
            <p className="text-orange-700 text-sm">{uploadError}</p>
          </div>
        </div>
      )}

      {/* School Information Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          School Information
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              School Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.school_name}
              onChange={(e) => handleInputChange('school_name', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              placeholder="Enter school name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Site Name
            </label>
            <input
              type="text"
              value={formData.site_name}
              onChange={(e) => handleInputChange('site_name', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              placeholder="Enter site name"
            />
          </div>
          <div>
  <label className="block text-sm font-medium text-slate-700 mb-2">
    School Code <span className="text-red-500">*</span>
  </label>
  <input
    type="text"
    value={formData.school_code}
    onChange={(e) => handleInputChange('school_code', e.target.value.toUpperCase())}
    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
    placeholder="e.g., AQIS, SCH, HIS"
    maxLength={10}
  />
  <p className="text-xs text-slate-500 mt-1">Short code for username generation (max 10 characters)</p>
</div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Address
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              placeholder="Enter school address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              placeholder="+1234567890"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              placeholder="school@example.com"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              School Motto
            </label>
            <input
              type="text"
              value={formData.motto}
              onChange={(e) => handleInputChange('motto', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              placeholder="School motto"
            />
          </div>
        </div>
      </div>

      {/* Localization Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
            <Globe className="w-4 h-4 text-white" />
          </div>
          Localization
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Timezone
            </label>
            <select
              value={formData.timezone}
              onChange={(e) => handleInputChange('timezone', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
            >
              {timezones.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Date Format
            </label>
            <select
              value={formData.dateFormat}
              onChange={(e) => handleInputChange('dateFormat', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
            >
              {dateFormats.map(format => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Language
            </label>
            <select
              value={formData.language}
              onChange={(e) => handleInputChange('language', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
            >
              {languages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Academic Year Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
            <Calendar className="w-4 h-4 text-white" />
          </div>
          Academic Year
        </h3>
        
        <div>
          <input
            type="text"
            value={formData.academicYear}
            onChange={(e) => handleInputChange('academicYear', e.target.value)}
            placeholder="e.g., 2025/2026"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
          />
        </div>
      </div>

      {/* Branding Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-xl font-semibold text-slate-900 mb-6">Branding</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              School Logo
            </label>
            {logoPreview && (
              <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <img src={logoPreview} alt="Logo" className="h-20 object-contain" />
              </div>
            )}
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={isUploadingLogo}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isUploadingLogo && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-xl">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">Max file size: 2MB. Supported: JPG, PNG, SVG</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Favicon
            </label>
            {faviconPreview && (
              <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <img src={faviconPreview} alt="Favicon" className="h-8 object-contain" />
              </div>
            )}
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleFaviconUpload}
                disabled={isUploadingFavicon}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isUploadingFavicon && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-xl">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">Max file size: 1MB. Supported: ICO, PNG</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-6 border-t border-slate-200">
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default GeneralTab;