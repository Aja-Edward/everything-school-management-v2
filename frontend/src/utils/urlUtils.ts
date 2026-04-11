/**
 * Utility functions for handling URLs in the application
 */

/**
 * Gets the base URL for API/backend calls
 */
export const getApiBaseUrl = (): string => {
  return import.meta.env.VITE_API_URL || 'localhost:8000/api';
};

/**
 * Converts a relative URL to an absolute URL with the correct backend base
 * @param relativeUrl - The relative URL (e.g., "/media/school_logos/logo.png")
 * @returns The absolute URL pointing to the backend server
 */
export const getAbsoluteUrl = (relativeUrl: string | null | undefined): string => {
  if (!relativeUrl) return '';

  // 🔥 FIX: Extract real Cloudinary URL if embedded
  if (relativeUrl.includes('https://')) {
    return relativeUrl.substring(relativeUrl.indexOf('https://'));
  }

  // If it's already a proper absolute URL
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }

  const apiBase = getApiBaseUrl();
  const backendBase = apiBase.replace('/api', '');

  if (relativeUrl.startsWith('/')) {
    return `${backendBase}${relativeUrl}`;
  }

  return `${backendBase}/${relativeUrl}`;
};

/**
 * Gets the base URL for media files (served from backend)
 * @returns The base URL for media files
 */
export const getMediaBaseUrl = (): string => {
  const apiBase = getApiBaseUrl();
  return apiBase.replace('/api', ''); // Remove /api to get backend root
};