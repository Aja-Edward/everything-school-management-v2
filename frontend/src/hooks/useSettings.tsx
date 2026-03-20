import { useState, useEffect, useCallback } from 'react';

import { communicationSettingsService } from '../services/SettingsService';
import SettingsService, { SchoolSettings } from '@/services/SettingsService';

interface UseSettingsReturn {
  settings: SchoolSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<SchoolSettings>) => Promise<void>;
  testPaymentGateway: (gateway: string, credentials: any) => Promise<{ success: boolean; message: string }>;
  testEmailConnection: (emailConfig: any) => Promise<{ success: boolean; message: string }>;
  testSMSConnection: (smsConfig: any) => Promise<{ success: boolean; message: string }>;
  uploadLogo: (file: File) => Promise<string>;
  uploadFavicon: (file: File) => Promise<string>;
  clearError: () => void;
}

export const useSettings = (): UseSettingsReturn => {
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Fetching school settings...');
      const fetchedSettings = await SettingsService.getSettings();
      console.log('Fetched settings:', fetchedSettings);
      setSettings(fetchedSettings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch settings';
      setError(errorMessage);
      console.error('Error fetching settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  

  const updateSettings = useCallback(async (newSettings: Partial<SchoolSettings>) => {
    setIsSaving(true);
    setError(null);
    
    try {
      const updatedSettings = await SettingsService.updateSettings(newSettings);
      setSettings(updatedSettings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update settings';
      setError(errorMessage);
      console.error('Error updating settings:', err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const testPaymentGateway = useCallback(async (gateway: string, credentials: any) => {
    setError(null);
    
    try {
      const result = await communicationSettingsService.testPaymentGateway(  gateway as 'paystack' | 'stripe' | 'flutterwave',
      credentials);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to test ${gateway} connection`;
      setError(errorMessage);
      console.error(`Error testing ${gateway} connection:`, err);
      throw err;
    }
  }, []);

  const testEmailConnection = useCallback(async (emailConfig: any) => {
    setError(null);
    
    try {
      const result = await communicationSettingsService.testEmailConnection( emailConfig.provider,
      emailConfig);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to test email connection';
      setError(errorMessage);
      console.error('Error testing email connection:', err);
      throw err;
    }
  }, []);

  const testSMSConnection = useCallback(async (smsConfig: any) => {
    setError(null);
    
    try {
      const result = await communicationSettingsService.testSMSConnection(smsConfig);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to test SMS connection';
      setError(errorMessage);
      console.error('Error testing SMS connection:', err);
      throw err;
    }
  }, []);

  const uploadLogo = useCallback(async (file: File) => {
    setError(null);
    
    try {
      const result = await SettingsService.uploadLogo(file);
      // Update settings with new logo URL
      if (settings) {
        setSettings({ ...settings, logo: result.logoUrl });
      }
      return result.logoUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload logo';
      setError(errorMessage);
      console.error('Error uploading logo:', err);
      throw err;
    }
  }, [settings]);

  const uploadFavicon = useCallback(async (file: File) => {
    setError(null);
    
    try {
      const result = await SettingsService.uploadFavicon(file);
      // Update settings with new favicon URL
      if (settings) {
        setSettings({ ...settings, favicon: result.faviconUrl });
      }
      return result.faviconUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload favicon';
      setError(errorMessage);
      console.error('Error uploading favicon:', err);
      throw err;
    }
  }, [settings]);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    fetchSettings,
    updateSettings,
    testPaymentGateway,
    testEmailConnection,
    testSMSConnection,
    uploadLogo,
    uploadFavicon,
    clearError,
  };
}; 