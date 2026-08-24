/**
 * Per-school "house style" for exam print settings.
 *
 * An admin adjusting margins, font, or spacing while formatting an exam can
 * choose to apply the change to just that one exam (the existing per-exam
 * `print_settings`, saved with the exam itself), or save it as the default
 * every future exam starts from instead of the platform's hardcoded
 * defaults.
 *
 * There's no backend model for the default yet - it's a per-browser
 * preference, the same way `tenantSlug` itself already is (see
 * services/api.ts's getTenantSlug) - so it won't follow the admin to a
 * different computer, only to future exams formatted from this one.
 */

import { PrintSettings } from '@/services/ExamService';
import { getTenantSlug } from '@/services/api';

const STORAGE_PREFIX = 'examPrintDefaults:';

function storageKey(): string | null {
  const tenant = getTenantSlug();
  return tenant ? `${STORAGE_PREFIX}${tenant}` : null;
}

/** The school's saved default print settings, if one has been set. */
export function loadDefaultPrintSettings(): Partial<PrintSettings> | null {
  const key = storageKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Save the given settings as this school's default for future exams. */
export function saveDefaultPrintSettings(settings: PrintSettings): boolean {
  const key = storageKey();
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** Clear the saved default so future exams fall back to the platform defaults. */
export function clearDefaultPrintSettings(): void {
  const key = storageKey();
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore - nothing useful to do if storage is unavailable
  }
}

/** True once this school has saved a default. */
export function hasDefaultPrintSettings(): boolean {
  return loadDefaultPrintSettings() !== null;
}
