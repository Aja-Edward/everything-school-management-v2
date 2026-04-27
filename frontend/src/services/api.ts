// api.ts
// ─── Config ──────────────────────────────────────────────────────────────────

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// ─── CSRF token ───────────────────────────────────────────────────────────────

let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

const getCookieToken = (): string | undefined =>
  document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='))
    ?.split('=')[1];

const getCSRFToken = async (): Promise<string> => {
  // Cookie is always the source of truth — prefer it over cached value
  const cookieToken = getCookieToken();
  if (cookieToken) {
    csrfToken = cookieToken;
    csrfTokenPromise = null;
    return cookieToken;
  }

  if (csrfToken) return csrfToken;

  // Deduplicate concurrent requests — only one fetch in flight at a time
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch(`${API_BASE_URL}/auth/csrf/`, {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return '';
        const data = await res.json();
        // Server may set the cookie as a side effect — prefer that
        csrfToken = getCookieToken() || data.csrfToken || '';
        return csrfToken ?? '';
      })
      .catch(() => '')
      .finally(() => {
        csrfTokenPromise = null;
      });
  }

  return csrfTokenPromise;
};

// ─── Token lifecycle ──────────────────────────────────────────────────────────

/**
 * Clear client-side auth state.
 * httpOnly auth cookies are cleared server-side on logout —
 * we only need to reset the CSRF cache here.
 */
export const clearTokens = (): void => {
  csrfToken = null;
  csrfTokenPromise = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

export const storeTokens = (tokens: { access?: string; refresh?: string }): void => {
  if (tokens.access) localStorage.setItem('access_token', tokens.access);
  if (tokens.refresh) localStorage.setItem('refresh_token', tokens.refresh);
};

const attemptTokenRefresh = async (): Promise<boolean> => {
  try {
    const tenantSlug = localStorage.getItem('tenantSlug');
    const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': await getCSRFToken(),
        ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
      },
    });

    if (response.ok) {
      console.log('✅ Token refreshed successfully');
      return true;
    }

    console.warn('⚠️ Token refresh failed:', response.status);
    return false;
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    return false;
  }
};

const handleAuthenticationFailure = (): void => {
  clearTokens();
  localStorage.removeItem('userData');
  localStorage.removeItem('userProfile');

  // Notify the app (useAuth can listen and clear React state)
  window.dispatchEvent(new CustomEvent('auth:expired'));

  const currentPath = window.location.pathname;
  if (currentPath.includes('/login')) {
    console.log('🔒 Already on login page, skipping redirect');
    return;
  }

  sessionStorage.setItem('returnUrl', currentPath);
  window.location.href = '/login';
};

// ─── Request helpers ──────────────────────────────────────────────────────────

// Endpoints that must never trigger a refresh→logout cycle on 401
const PUBLIC_ENDPOINTS = [
  '/auth/refresh/',
  '/auth/login/',
  '/auth/csrf/',
  '/auth/status/',
  '/tenants/public/',
  '/tenants/register/',
  '/tenants/check-slug/',
  '/tenants/check-domain/',
  '/students/verify-result-token/',
];

const isPublicEndpoint = (endpoint: string): boolean =>
  PUBLIC_ENDPOINTS.some((path) => endpoint.includes(path));

const buildUrl = (endpoint: string, params?: Record<string, any>): string => {
  let clean = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  if (clean.startsWith('api/')) clean = clean.slice(4);

  const base = API_BASE_URL.endsWith('/')
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL;

  let url = `${base}/${clean}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  return url;
};

export const buildHeaders = async (method: string): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const tenantSlug = localStorage.getItem('tenantSlug');
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  if (method !== 'GET') {
    const csrf = await getCSRFToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
  }

  return headers;
};

export const getHeaders = buildHeaders;

const parseResponse = async (response: Response): Promise<any> => {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
};

export const handleResponseError = async (
  response: Response,
  endpoint: string,
  method: string
): Promise<void> => {
  let errorData: any;
  try {
    const contentType = response.headers.get('content-type');
    errorData = contentType?.includes('application/json')
      ? await response.json()
      : await response.text();
  } catch {
    errorData = `HTTP ${response.status}`;
  }

  console.error(`❌ ${method} ${endpoint} → ${response.status}`, errorData);

  if (response.status === 401 && !isPublicEndpoint(endpoint)) {
    console.log('🔄 Attempting token refresh...');
    const refreshed = await attemptTokenRefresh();

    if (refreshed) {
      const retryError = new Error('Token refreshed, please retry');
      (retryError as any).shouldRetry = true;
      throw retryError;
    }

    handleAuthenticationFailure();
    return; // redirect is in flight — stop execution
  }

  const message =
    typeof errorData === 'object' && errorData?.detail
      ? errorData.detail
      : typeof errorData === 'object'
        ? JSON.stringify(errorData)
        : `HTTP error! status: ${response.status}`;

  const error = new Error(message);
  (error as any).response = {
    status: response.status,
    statusText: response.statusText,
    data: errorData,
  };
  throw error;
};

// ─── Core request ─────────────────────────────────────────────────────────────

const makeRequest = async (
  method: string,
  endpoint: string,
  data?: any,
  params?: Record<string, any>,
  retryCount = 0
): Promise<any> => {
  const url = buildUrl(endpoint, params);
  const headers = await buildHeaders(method);

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
    ...(data && method !== 'GET' ? { body: JSON.stringify(data) } : {}),
  };

  console.log(`🌐 ${method}: ${endpoint}`);

  const response = await fetch(url, options);

  if (!response.ok) {
    await handleResponseError(response, endpoint, method);
  }

  return parseResponse(response);
};

const makeRequestWithRetry = async (
  method: string,
  endpoint: string,
  data?: any,
  params?: Record<string, any>
): Promise<any> => {
  try {
    return await makeRequest(method, endpoint, data, params);
  } catch (error: any) {
    if (error?.shouldRetry) {
      console.log('🔄 Retrying after token refresh...');
      // Small delay to let the browser process Set-Cookie from the refresh response
      await new Promise((resolve) => setTimeout(resolve, 100));
      return makeRequest(method, endpoint, data, params);
    }
    throw error;
  }
};

// ─── Public API ───────────────────────────────────────────────────────────────

const api = {
  get: (endpoint: string, params?: Record<string, any>) =>
    makeRequestWithRetry('GET', endpoint, undefined, params),

  post: (endpoint: string, data: any) =>
    makeRequestWithRetry('POST', endpoint, data),

  put: (endpoint: string, data: any) =>
    makeRequestWithRetry('PUT', endpoint, data),

  patch: (endpoint: string, data: any) =>
    makeRequestWithRetry('PATCH', endpoint, data),

  delete: (endpoint: string, data?: any) =>
    makeRequestWithRetry('DELETE', endpoint, data),

  // ─── Convenience wrappers ───────────────────────────────────────────────

  getList(
    endpoint: string,
    filters?: Record<string, any>,
    pagination?: { page?: number; page_size?: number }
  ) {
    return this.get(endpoint, { ...filters, ...pagination });
  },

  getById(endpoint: string, id: string | number, params?: Record<string, any>) {
    const ep = endpoint.endsWith('/') ? `${endpoint}${id}/` : `${endpoint}/${id}/`;
    return this.get(ep, params);
  },

  create(endpoint: string, data: any) {
    return this.post(endpoint, data);
  },

  update(
    endpoint: string,
    id: string | number,
    data: any,
    partial = false
  ) {
    const ep = endpoint.endsWith('/') ? `${endpoint}${id}/` : `${endpoint}/${id}/`;
    return partial ? this.patch(ep, data) : this.put(ep, data);
  },

  remove(endpoint: string, id: string | number) {
    const ep = endpoint.endsWith('/') ? `${endpoint}${id}/` : `${endpoint}/${id}/`;
    return this.delete(ep);
  },

  bulkOperation(
    endpoint: string,
    operation: 'create' | 'update' | 'delete',
    data: any[]
  ) {
    const ep = endpoint.endsWith('/')
      ? `${endpoint}bulk_${operation}/`
      : `${endpoint}/bulk_${operation}/`;
    return this.post(ep, { items: data });
  },

  // ─── Auth helpers ───────────────────────────────────────────────────────

  async checkAuthStatus(): Promise<{ authenticated: boolean; user?: any }> {
    try {
      return await this.get('/auth/status/');
    } catch {
      return { authenticated: false };
    }
  },

  refreshToken(): Promise<boolean> {
    return attemptTokenRefresh();
  },

  initCSRF(): Promise<string> {
    return getCSRFToken();
  },
};

export default api;
export { api };