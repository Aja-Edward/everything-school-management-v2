// ============================================================================
// REPLACE YOUR EXISTING SettingsContext.tsx WITH THIS FILE
// ============================================================================
// Changes vs your original:
//   • Adds Classroom[], classroomsLoading, classroomsError to context state
//   • Adds fetchClassrooms, setClassroomCapacity, bulkSetClassroomCapacity actions
//   • Everything else (settings, updateSettings, refreshSettings) is unchanged
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import SettingsService, { SchoolSettings, Classroom } from '@/services/SettingsService';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/contexts/TenantContext';


// ── Context shape ─────────────────────────────────────────────────────────────

interface SettingsContextType {
  // ── existing settings ──────────────────────────────────────────────────────
  settings: SchoolSettings | null;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  refreshSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<SchoolSettings>) => Promise<void>;

  // ── classroom capacity ─────────────────────────────────────────────────────
  classrooms: Classroom[];
  classroomsLoading: boolean;
  classroomsError: string | null;
  fetchClassrooms: () => Promise<void>;
  setClassroomCapacity: (classroomId: number, maxCapacity: number) => Promise<void>;
  bulkSetClassroomCapacity: (maxCapacity: number) => Promise<{
    succeeded: number;
    failed: Array<{ name: string; error: string }>;
  }>;
}

// ── Context + hook ────────────────────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
};

// ── Provider ──────────────────────────────────────────────────────────────────

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  
 
  // ── School settings state ─────────────────────────────────────────────────
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Classroom state ───────────────────────────────────────────────────────
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(false);
  const [classroomsError, setClassroomsError] = useState<string | null>(null);

  // ── Fetch school settings ─────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await SettingsService.getSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Update school settings ────────────────────────────────────────────────
  const updateSettings = useCallback(async (newSettings: Partial<SchoolSettings>) => {
    if (!settings) return;
    try {
      setError(null);
      const updated = await SettingsService.updateSettings({ ...settings, ...newSettings });
      setSettings(updated);
      window.dispatchEvent(new CustomEvent('settings-updated', { detail: updated }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update settings';
      setError(msg);
      throw err;
    }
  }, [settings]);

  const refreshSettings = useCallback(() => fetchSettings(), [fetchSettings]);

  // ── Fetch classrooms ──────────────────────────────────────────────────────
  const fetchClassrooms = useCallback(async () => {
    setClassroomsLoading(true);
    setClassroomsError(null);
    try {
      const data = await SettingsService.getClassrooms();
      setClassrooms(data);
    } catch (err: any) {
      setClassroomsError(err.message || 'Failed to load classrooms');
    } finally {
      setClassroomsLoading(false);
    }
  }, []);

  // ── Update a single classroom's capacity ──────────────────────────────────
  const setClassroomCapacity = useCallback(async (classroomId: number, maxCapacity: number) => {
    const updated = await SettingsService.setClassroomCapacity(classroomId, maxCapacity);
    // Optimistically update local list so UI reflects immediately
    setClassrooms(prev =>
      prev.map(c => (c.id === classroomId ? { ...c, max_capacity: updated.max_capacity } : c))
    );
  }, []);

  // ── Bulk-update all classrooms ────────────────────────────────────────────
  const bulkSetClassroomCapacity = useCallback(async (maxCapacity: number) => {
    const result = await SettingsService.bulkSetClassroomCapacity(classrooms, maxCapacity);
    // Re-fetch to sync authoritative state from server
    await fetchClassrooms();
    return result;
  }, [classrooms, fetchClassrooms]);
 

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  const { user, isLoading: authLoading } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();

  useEffect(() => {
    // Wait for tenant to resolve (critical on custom domains where a
    // by-domain lookup must complete before tenantSlug is in localStorage)
    if (tenantLoading) return;

    if (user && tenant) {
      // Only fetch tenant settings when there is an active tenant context.
      // On the main platform (nuventacloud.com) tenant is null — calling
      // /api/tenants/settings/current/ would return 400 "No tenant context".
      fetchSettings();
      fetchClassrooms();
    } else {
      // No tenant context (main platform page or unauthenticated) —
      // leave settings as null so components fall back to platform defaults.
      setLoading(false);
      setClassroomsLoading(false);
    }

    const handleExternalUpdate = (e: CustomEvent) => setSettings(e.detail);
    window.addEventListener('settings-updated' as any, handleExternalUpdate);
    return () => window.removeEventListener('settings-updated' as any, handleExternalUpdate);
  }, [authLoading, user, tenant, fetchSettings, fetchClassrooms, tenantLoading]);

  // ── Context value ─────────────────────────────────────────────────────────
  const value: SettingsContextType = {
    // school settings
    settings,
    loading,
    error,
    setError,
    refreshSettings,
    updateSettings,
    // classrooms
    classrooms,
    classroomsLoading,
    classroomsError,
    fetchClassrooms,
    setClassroomCapacity,
    bulkSetClassroomCapacity,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsContext;