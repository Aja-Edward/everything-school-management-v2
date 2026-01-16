

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
   'https://school-project-with-edward.onrender.com/api'
 

console.log('🔧 API_BASE_URL:', API_BASE_URL);
console.log('🔧 VITE_API_URL env var:', import.meta.env.VITE_API_URL);


// Debug wrapper for GET requests
const debugGet = async (endpoint: string, params?: any) => {
  console.log('🔍 [API DEBUG] GET Request:', {
    endpoint,
    params,
    queryString: new URLSearchParams(params).toString()
  });
  
  const response = await api.get(endpoint, { params });
  
  console.log('📥 [API DEBUG] GET Response:', {
    endpoint,
    status: response.status,
    dataLength: Array.isArray(response) ? response.length : 'N/A',
    firstItem: Array.isArray(response) && response.length > 0 ? response[0] : null
  });
  
  return response;
};
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  const sessionToken = sessionStorage.getItem('authToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  const activeToken = token || sessionToken;


// };
if (activeToken) {
    
    const isJWT = activeToken.split('.').length === 3;
    
    if (isJWT) {
      headers['Authorization'] = `Bearer ${activeToken}`;
      console.log('🔑 JWT token included in request');
    } else {
      headers['Authorization'] = `Token ${activeToken}`;
      console.log('🔑 DRF Token included in request');
    }
  } else {
    console.warn('⚠️ No auth token found in localStorage or sessionStorage');
  }
  
  return headers;
};

const handleResponseError = async (response: Response, endpoint: string, method: string) => {
  console.error(`❌ ${method} request failed: ${response.status} - ${response.statusText}`);
  
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
  
  // Enhanced logging for 400 errors
  console.error(`❌ Error response for ${endpoint}:`, errorData);
  if (response.status === 400) {
    console.error('❌ 400 Bad Request Details:', JSON.stringify(errorData, null, 2));
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
    data: errorData
  };
  throw error;
};

const buildUrl = (endpoint: string, params?: Record<string, any>): string => {
  // Use API_BASE_URL which already includes /api
  const baseUrl = API_BASE_URL;
  
  // Remove leading slash from endpoint if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  
  // Ensure baseUrl doesn't end with slash
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  // Build URL - baseUrl already has /api, just add the endpoint
  let url = `${cleanBase}/${cleanEndpoint}`;
  
  // Add query parameters
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v.toString()));
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
  
  console.log('🔗 Built URL:', url);
  return url;
};

const api = {
  async get(endpoint: string, params?: Record<string, any>) {
    const url = buildUrl(endpoint, params);
    console.log(`🌐 GET request to: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      console.log(`📊 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        await handleResponseError(response, endpoint, 'GET');
      }
      
      const data = await response.json();
      console.log(`goodGET request successful for ${endpoint}:`, data);
      return data;
    } catch (error) {
      console.error(`💥 Exception in GET request to ${endpoint}:`, error);
      throw error;
    }
  },

  async post(endpoint: string, data: any) {
    const url = buildUrl(endpoint);
    console.log(`🌐 POST request to: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        await handleResponseError(response, endpoint, 'POST');
      }
      
      console.log(`goodPOST request successful: ${response.status}`);
      return response.json();
    } catch (error) {
      console.error(`💥 Exception in POST request to ${endpoint}:`, error);
      throw error;
    }
  },

  async put(endpoint: string, data: any) {
    const url = buildUrl(endpoint);
    console.log(`🌐 PUT request to: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        await handleResponseError(response, endpoint, 'PUT');
      }
      
      console.log(`goodPUT request successful: ${response.status}`);
      return response.json();
    } catch (error) {
      console.error(`💥 Exception in PUT request to ${endpoint}:`, error);
      throw error;
    }
  },

  async patch(endpoint: string, data: any) {
    const url = buildUrl(endpoint);
    console.log(`🌐 PATCH request to: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        await handleResponseError(response, endpoint, 'PATCH');
      }
      
      console.log(`goodPATCH request successful: ${response.status}`);
      return response.json();
    } catch (error) {
      console.error(`💥 Exception in PATCH request to ${endpoint}:`, error);
      throw error;
    }
  },

  async delete(endpoint: string) {
    const url = buildUrl(endpoint);
    console.log(`🌐 DELETE request to: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      if (!response.ok) {
        await handleResponseError(response, endpoint, 'DELETE');
      }
      
      console.log(`goodDELETE request successful: ${response.status}`);
      if (response.status === 204) {
        return null;
      }

      try {
        const text = await response.text();
        if (!text.trim()) {
          return null;
        }
        return JSON.parse(text);
      } catch (jsonError) {
        if ((jsonError as Error).message.includes('Unexpected end of JSON input')) {
          console.log('🔄 Empty response body, treating as successful delete');
          return null;
        }
        throw jsonError;
      }
    } catch (error: any) {
      console.error(`💥 Exception in DELETE request to ${endpoint}:`, error);
      throw error;
    }
  },

  async getList(endpoint: string, filters?: Record<string, any>, pagination?: { page?: number; page_size?: number }) {
    const params = { ...filters, ...pagination };
    return this.get(endpoint, params);
  },

  async getById(endpoint: string, id: string | number, params?: Record<string, any>) {
    const finalEndpoint = endpoint.endsWith('/') ? `${endpoint}${id}/` : `${endpoint}/${id}/`;
    return this.get(finalEndpoint, params);
  },

  async create(endpoint: string, data: any) {
    return this.post(endpoint, data);
  },

  async update(endpoint: string, id: string | number, data: any, partial: boolean = false) {
    const finalEndpoint = endpoint.endsWith('/') ? `${endpoint}${id}/` : `${endpoint}/${id}/`;
    return partial ? this.patch(finalEndpoint, data) : this.put(finalEndpoint, data);
  },

  async remove(endpoint: string, id: string | number) {
    const finalEndpoint = endpoint.endsWith('/') ? `${endpoint}${id}/` : `${endpoint}/${id}/`;
    return this.delete(finalEndpoint);
  },

  async bulkOperation(endpoint: string, operation: 'create' | 'update' | 'delete', data: any[]) {
    const bulkEndpoint = endpoint.endsWith('/') ? `${endpoint}bulk_${operation}/` : `${endpoint}/bulk_${operation}/`;
    return this.post(bulkEndpoint, { items: data });
  }
};



export default api;
export { api };

