import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { tenantService, PublicTenant, PublicTenantSettings } from '@/services/TenantService';




interface TenantContextType {
  // Whether we're on a subdomain (school portal) or main domain
  isSubdomain: boolean;
  // The subdomain slug (e.g., "bayschool" from "bayschool.nuventacloud.com")
  slug: string | null;
  // The tenant data (loaded from API for subdomains)
  tenant: PublicTenant | null;
  // Tenant settings (branding, etc.)
  settings: PublicTenantSettings | null;
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
const MAIN_DOMAINS = ['localhost', 'nuventacloud.com', '127.0.0.1'];

// Hosting platform domains — treat as main domain, never as tenant subdomains
const HOSTING_PLATFORM_DOMAINS = ['vercel.app', 'onrender.com', 'netlify.app', 'herokuapp.com', 'railway.app'];

interface HostnameResult {
  slug: string | null;       // platform subdomain slug, e.g. "kebi-international-academy"
  customDomain: string | null; // full custom domain, e.g. "kebiinternationalacademy.com"
}

/**
 * Inspects the current hostname and returns either a platform subdomain slug
 * OR a custom domain that needs to be resolved via the by-domain API.
 */
function detectHostname(): HostnameResult {
  const hostname = window.location.hostname;
  const isDevelopment = import.meta.env.DEV;

  // Development: plain localhost — use ?tenant= or devTenantSlug
  if (isDevelopment && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    const urlParams = new URLSearchParams(window.location.search);
    const devTenant = urlParams.get('tenant') || localStorage.getItem('devTenantSlug');
    return { slug: devTenant || null, customDomain: null };
  }

  // Development: .localhost subdomains
  if (isDevelopment && hostname.endsWith('.localhost')) {
    const subdomain = hostname.replace('.localhost', '');
    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) return { slug: null, customDomain: null };
    return { slug: subdomain || null, customDomain: null };
  }

  // Hosting platform domains → main domain, never a tenant
  if (HOSTING_PLATFORM_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
    return { slug: null, customDomain: null };
  }

  // Known main domains (and their www variants) → not a tenant
  if (MAIN_DOMAINS.some(d => hostname === d || hostname === `www.${d}`)) {
    return { slug: null, customDomain: null };
  }

  const parts = hostname.split('.');

  // Platform subdomain: e.g. kebi-international-academy.nuventacloud.com
  if (MAIN_DOMAINS.some(d => hostname.endsWith(`.${d}`))) {
    const subdomain = parts[0];
    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) return { slug: null, customDomain: null };
    return { slug: subdomain, customDomain: null };
  }

  // Apex custom domain: kebiinternationalacademy.com
  if (parts.length === 2) {
    return { slug: null, customDomain: hostname };
  }

  // www variant of a custom domain: www.kebiinternationalacademy.com
  // Use the apex for the DB lookup since that's what's stored
  if (parts.length === 3 && parts[0].toLowerCase() === 'www') {
    return { slug: null, customDomain: `${parts[1]}.${parts[2]}` };
  }

  return { slug: null, customDomain: null };
}

interface TenantProviderProps {
  children: ReactNode;
}

// ─── Tenant cache (stale-while-revalidate) ────────────────────────────────────

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface TenantCache {
  tenant: PublicTenant;
  settings: PublicTenantSettings | null;
  ts: number;
}

function readCache(key: string): TenantCache | null {
  try {
    const raw = localStorage.getItem(`tc_${key}`);
    if (!raw) return null;
    const cached: TenantCache = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL) {
      localStorage.removeItem(`tc_${key}`);
      return null;
    }
    return cached;
  } catch { return null; }
}

function writeCache(key: string, tenant: PublicTenant, settings: PublicTenantSettings | null) {
  try {
    localStorage.setItem(`tc_${key}`, JSON.stringify({ tenant, settings, ts: Date.now() }));
  } catch {}
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TenantProvider({ children }: TenantProviderProps) {
  const [slug, setSlug] = useState<string | null>(null);
  const [tenant, setTenant] = useState<PublicTenant | null>(null);
  const [settings, setSettings] = useState<PublicTenantSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSubdomain = slug !== null;

  const applyTenantData = (t: PublicTenant, s: PublicTenantSettings | null, tenantSlug: string) => {
    setTenant(t);
    setSettings(s);
    setSlug(tenantSlug);
    localStorage.setItem('tenantSlug', tenantSlug);
    writeCache(tenantSlug, t, s);
  };

  const fetchTenantData = async (tenantSlug: string) => {
    const cached = readCache(tenantSlug);
    if (cached) {
      // Show cached data immediately — zero wait
      applyTenantData(cached.tenant, cached.settings, tenantSlug);
      setIsLoading(false);
      // Refresh silently in background
      tenantService.getTenantBySlug(tenantSlug)
        .then(d => applyTenantData(d.tenant, d.settings || null, tenantSlug))
        .catch(() => {});
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const d = await tenantService.getTenantBySlug(tenantSlug);
      applyTenantData(d.tenant, d.settings || null, tenantSlug);
    } catch (err: any) {
      console.error('Failed to load tenant:', err);
      setError(err.response?.data?.message || 'Failed to load school information');
      setTenant(null);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTenantByCustomDomain = async (domain: string) => {
    const cached = readCache(domain);
    if (cached) {
      applyTenantData(cached.tenant, cached.settings, cached.tenant.slug);
      setIsLoading(false);
      tenantService.getTenantByCustomDomain(domain)
        .then(d => applyTenantData(d.tenant, d.settings || null, d.tenant.slug))
        .catch(() => {});
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const d = await tenantService.getTenantByCustomDomain(domain);
      applyTenantData(d.tenant, d.settings || null, d.tenant.slug);
      writeCache(domain, d.tenant, d.settings || null); // also cache by domain key
    } catch (err: any) {
      console.error('Failed to load tenant for custom domain:', err);
      setError('School not found for this domain');
      setTenant(null);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshTenant = async () => {
    if (slug) await fetchTenantData(slug);
  };

  useEffect(() => {
    const { slug: detectedSlug, customDomain } = detectHostname();

    if (detectedSlug) {
      setSlug(detectedSlug);
      fetchTenantData(detectedSlug);
    } else if (customDomain) {
      // Custom domain — resolve tenant via dedicated endpoint
      fetchTenantByCustomDomain(customDomain);
    } else {
      // Main platform domain — no tenant
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
