import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { tenantService, Tenant, TenantSettings } from '@/services/TenantService';

interface TenantContextType {
  // Whether we're on a subdomain (school portal) or main domain
  isSubdomain: boolean;
  // The subdomain slug (e.g., "bayschool" from "bayschool.schoolplatform.com")
  slug: string | null;
  // The tenant data (loaded from API for subdomains)
  tenant: Tenant | null;
  // Tenant settings (branding, etc.)
  settings: TenantSettings | null;
  // Loading state
  isLoading: boolean;
  // Error state
  error: string | null;
  // Refresh tenant data
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

// List of reserved subdomains that should be treated as main domain
const RESERVED_SUBDOMAINS = ['www', 'api', 'admin', 'app', 'dashboard', 'mail', 'staging', 'dev'];

// Main domain patterns (customize based on your deployment)
const MAIN_DOMAINS = ['localhost', 'schoolplatform.com', '127.0.0.1'];

/**
 * Extracts the subdomain from the current hostname
 * Returns null if we're on the main domain
 */
function extractSubdomain(): string | null {
  const hostname = window.location.hostname;
  const isDevelopment = import.meta.env.DEV;

  // Handle development mode with plain localhost or 127.0.0.1
  // Allow tenant simulation via query param or localStorage
  if (isDevelopment && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    const urlParams = new URLSearchParams(window.location.search);
    const devTenant = urlParams.get('tenant') || localStorage.getItem('devTenantSlug');
    return devTenant || null;
  }

  // Handle development mode with .localhost subdomains (e.g., "bay-area-school.localhost")
  // This is a common pattern for local subdomain testing
  if (isDevelopment && hostname.endsWith('.localhost')) {
    const subdomain = hostname.replace('.localhost', '');
    // Check if it's a reserved subdomain
    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
      return null;
    }
    return subdomain || null;
  }

  // Split hostname into parts
  const parts = hostname.split('.');

  // If we have less than 3 parts (e.g., "schoolplatform.com"), it's the main domain
  if (parts.length < 3) {
    return null;
  }

  // The subdomain is the first part
  const subdomain = parts[0];

  // Check if it's a reserved subdomain
  if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return null;
  }

  return subdomain;
}

interface TenantProviderProps {
  children: ReactNode;
}

export function TenantProvider({ children }: TenantProviderProps) {
  const [slug, setSlug] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSubdomain = slug !== null;

  const fetchTenantData = async (tenantSlug: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch tenant info by slug
      const tenantData = await tenantService.getTenantBySlug(tenantSlug);
      setTenant(tenantData.tenant);
      setSettings(tenantData.settings || null);

      // Store tenant info for API requests
      localStorage.setItem('tenantSlug', tenantSlug);

    } catch (err: any) {
      console.error('Failed to load tenant:', err);
      setError(err.response?.data?.message || 'Failed to load school information');
      setTenant(null);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshTenant = async () => {
    if (slug) {
      await fetchTenantData(slug);
    }
  };

  useEffect(() => {
    const detectedSlug = extractSubdomain();
    setSlug(detectedSlug);

    if (detectedSlug) {
      fetchTenantData(detectedSlug);
    } else {
      // Main domain - no tenant to load
      setIsLoading(false);
    }
  }, []);

  return (
    <TenantContext.Provider
      value={{
        isSubdomain,
        slug,
        tenant,
        settings,
        isLoading,
        error,
        refreshTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

/**
 * Hook to check if we're on the main domain
 */
export function useIsMainDomain() {
  const { isSubdomain } = useTenant();
  return !isSubdomain;
}

/**
 * Hook to get the current tenant (throws if not on subdomain)
 */
export function useCurrentTenant() {
  const { tenant, isSubdomain, isLoading, error } = useTenant();

  if (!isSubdomain) {
    throw new Error('useCurrentTenant can only be used on a subdomain');
  }

  return { tenant, isLoading, error };
}

/**
 * Utility to build a URL for a specific tenant's subdomain
 */
export function buildTenantUrl(slug: string, path: string = '/'): string {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  const isDevelopment = import.meta.env.DEV;

  if (isDevelopment) {
    // In development, use .localhost subdomain pattern (e.g., bay-area-school.localhost:5173)
    // This allows proper subdomain testing with /etc/hosts configuration
    return `${protocol}//${slug}.localhost${port}${path}`;
  }

  // In production, build subdomain URL
  const baseDomain = hostname.split('.').slice(-2).join('.');
  return `${protocol}//${slug}.${baseDomain}${path}`;
}

export default TenantContext;
