/**
 * API Service with Hybrid Authentication
 *
 * Production (HTTPS): Uses httpOnly cookies for XSS protection
 * Development (HTTP): Falls back to Authorization header with localStorage tokens
 *
 * This hybrid approach ensures security in production while maintaining
 * development workflow without HTTPS.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

console.log('🔧 API_BASE_URL:', API_BASE_URL);

// CSRF token cache
let csrfToken: string | null = null;

/**
 * Store tokens from response body (for development cross-origin support)
 */
export const storeTokens = (tokens: { access: string; refresh: string }) => {
  localStorage.setItem('authToken', tokens.access);
  localStorage.setItem('refreshToken', tokens.refresh);
  console.log('🔑 Tokens stored in localStorage (development mode)');
};

/**
 * Get stored access token (for development fallback)
 */
const getStoredToken = (): string | null => {
  return localStorage.getItem('authToken');
};

/**
 * Clear stored tokens
 */
export const clearTokens = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
};

/**
 * Get CSRF token from cookie or fetch from server
 */
const getCSRFToken = async (): Promise<string> => {
  // First try to get from cookie
  const cookieToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='))
    ?.split('=')[1];

  if (cookieToken) {
    csrfToken = cookieToken;
    return cookieToken;
  }

  // If not in cookie, fetch from server
  if (!csrfToken) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/csrf/`, {
        method: 'GET',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        csrfToken = data.csrfToken;

        // Also check cookie again after fetch
        const newCookieToken = document.cookie
          .split('; ')
          .find((row) => row.startsWith('csrftoken='))
          ?.split('=')[1];

        if (newCookieToken) {
          csrfToken = newCookieToken;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token:', error);
    }
  }

  return csrfToken || '';
};

/**
 * Get headers for API requests
 * Uses Authorization header as fallback when cookies don't work (development)
 */
const getHeaders = async (
  method: string,
  includeContentType: boolean = true
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {};

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  // Add tenant header for multi-tenant API calls
  const tenantSlug = localStorage.getItem('tenantSlug');
  if (tenantSlug) {
    headers['X-Tenant-Slug'] = tenantSlug;
  }

  // Add Authorization header as fallback (for development cross-origin)
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add CSRF token for non-GET requests
  if (method !== 'GET') {
    const csrf = await getCSRFToken();
    if (csrf) {
      headers['X-CSRFToken'] = csrf;
    }
  }

  return headers;
};

const handleResponseError = async (
  response: Response,
  endpoint: string,
  method: string
) => {
  console.error(
    `❌ ${method} request failed: ${response.status} - ${response.statusText}`
  );

  let errorData;
  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errorData = await response.json();
    } else {
      errorData = await response.text();
    }
  } catch {
    errorData = `HTTP error! status: ${response.status}`;
  }

  console.error(`❌ Error response for ${endpoint}:`, errorData);

  // List of public endpoints that don't require authentication
  // or should not trigger logout flow when they fail
  const publicEndpoints = [
    '/auth/refresh/',
    '/auth/login/',
    '/auth/csrf/',
    '/auth/status/',
    '/tenants/public/',
    '/tenants/register/',
    '/tenants/check-slug/',
    '/tenants/check-domain/',
  ];

  // Check if this is a public endpoint
  const isPublicEndpoint = publicEndpoints.some(publicPath =>
    endpoint.includes(publicPath)
  );

  // Handle 401 Unauthorized - try to refresh token (but not for public endpoints)
  if (response.status === 401 && !isPublicEndpoint) {
    console.log('🔄 Attempting token refresh...');
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      // Return a special error that indicates retry is possible
      const error = new Error('Token refreshed, please retry');
      (error as any).shouldRetry = true;
      throw error;
    } else {
      // Token refresh failed - trigger logout
      console.log('❌ Token refresh failed - triggering logout');
      handleAuthenticationFailure();
    }
  }

  const error = new Error(
    typeof errorData === 'object' && errorData.detail
      ? errorData.detail
      : typeof errorData === 'object'
        ? JSON.stringify(errorData)
        : `HTTP error! status: ${response.status}`
  );
  (error as any).response = {
    status: response.status,
    statusText: response.statusText,
    data: errorData,
  };
  throw error;
};

/**
 * Handle authentication failure - clear auth and redirect to login
 */
const handleAuthenticationFailure = () => {
  console.log('🔒 Handling authentication failure...');

  // Clear all auth data
  clearTokens();
  localStorage.removeItem('userData');
  localStorage.removeItem('userProfile');

  // Preserve tenant context
  const tenantSlug = localStorage.getItem('tenantSlug');

  // Dispatch custom event for auth failure (useAuth can listen to this)
  window.dispatchEvent(new CustomEvent('auth:expired'));

  // Redirect to login page while preserving tenant context
  const currentPath = window.location.pathname;
  const isAlreadyOnLogin = currentPath.includes('/login');

  if (!isAlreadyOnLogin) {
    // Store return URL
    sessionStorage.setItem('returnUrl', currentPath);

    // Redirect to tenant-specific login
    if (tenantSlug) {
      window.location.href = `/login`;
    } else {
      window.location.href = '/login';
    }
  }
};

/**
 * Attempt to refresh the access token using the refresh token cookie
 */
const attemptTokenRefresh = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': (await getCSRFToken()) || '',
      },
    });

    if (response.ok) {
      console.log('✅ Token refreshed successfully');
      return true;
    }
    console.log('❌ Token refresh failed');
    return false;
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    return false;
  }
};

const buildUrl = (endpoint: string, params?: Record<string, any>): string => {
  const baseUrl = API_BASE_URL;

  // Remove leading slash from endpoint if present
  let cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

  // Remove 'api/' prefix if present since API_BASE_URL already includes /api
  if (cleanEndpoint.startsWith('api/')) {
    cleanEndpoint = cleanEndpoint.slice(4);
  }

  // Ensure baseUrl doesn't end with slash
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  let url = `${cleanBase}/${cleanEndpoint}`;

  // Add query parameters
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(key, v.toString()));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
};

/**
 * Make a request with automatic retry on token refresh
 */
const makeRequest = async (
  method: string,
  endpoint: string,
  data?: any,
  params?: Record<string, any>,
  retryCount: number = 0
): Promise<any> => {
  const url = buildUrl(endpoint, params);
  const headers = await getHeaders(method);

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include', // Always include cookies
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      await handleResponseError(response, endpoint, method);
    }

    // Handle empty responses
    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    return JSON.parse(text);
  } catch (error: any) {
    // Retry once if token was refreshed
    if (error.shouldRetry && retryCount < 1) {
      console.log('🔄 Retrying request after token refresh...');
      return makeRequest(method, endpoint, data, params, retryCount + 1);
    }
    throw error;
  }
};

const api = {
  async get(endpoint: string, params?: Record<string, any>) {
    console.log(`🌐 GET: ${endpoint}`);
    return makeRequest('GET', endpoint, undefined, params);
  },

  async post(endpoint: string, data: any) {
    console.log(`🌐 POST: ${endpoint}`);
    return makeRequest('POST', endpoint, data);
  },

  async put(endpoint: string, data: any) {
    console.log(`🌐 PUT: ${endpoint}`);
    return makeRequest('PUT', endpoint, data);
  },

  async patch(endpoint: string, data: any) {
    console.log(`🌐 PATCH: ${endpoint}`);
    return makeRequest('PATCH', endpoint, data);
  },

  async delete(endpoint: string, data?: any) {
    console.log(`🌐 DELETE: ${endpoint}`);
    return makeRequest('DELETE', endpoint, data);
  },

  // Convenience methods
  async getList(
    endpoint: string,
    filters?: Record<string, any>,
    pagination?: { page?: number; page_size?: number }
  ) {
    const params = { ...filters, ...pagination };
    return this.get(endpoint, params);
  },

  async getById(
    endpoint: string,
    id: string | number,
    params?: Record<string, any>
  ) {
    const finalEndpoint = endpoint.endsWith('/')
      ? `${endpoint}${id}/`
      : `${endpoint}/${id}/`;
    return this.get(finalEndpoint, params);
  },

  async create(endpoint: string, data: any) {
    return this.post(endpoint, data);
  },

  async update(
    endpoint: string,
    id: string | number,
    data: any,
    partial: boolean = false
  ) {
    const finalEndpoint = endpoint.endsWith('/')
      ? `${endpoint}${id}/`
      : `${endpoint}/${id}/`;
    return partial ? this.patch(finalEndpoint, data) : this.put(finalEndpoint, data);
  },

  async remove(endpoint: string, id: string | number) {
    const finalEndpoint = endpoint.endsWith('/')
      ? `${endpoint}${id}/`
      : `${endpoint}/${id}/`;
    return this.delete(finalEndpoint);
  },

  async bulkOperation(
    endpoint: string,
    operation: 'create' | 'update' | 'delete',
    data: any[]
  ) {
    const bulkEndpoint = endpoint.endsWith('/')
      ? `${endpoint}bulk_${operation}/`
      : `${endpoint}/bulk_${operation}/`;
    return this.post(bulkEndpoint, { items: data });
  },

  /**
   * Check authentication status
   */
  async checkAuthStatus(): Promise<{ authenticated: boolean; user?: any }> {
    try {
      const response = await this.get('/auth/status/');
      return response;
    } catch {
      return { authenticated: false };
    }
  },

  /**
   * Refresh the access token
   */
  async refreshToken(): Promise<boolean> {
    return attemptTokenRefresh();
  },

  /**
   * Initialize CSRF token (call on app load)
   */
  async initCSRF(): Promise<void> {
    await getCSRFToken();
  },
};

export default api;
export { api };
