import axios from 'axios';
import {getHeaders, handleResponseError, API_BASE_URL } from '@/services/api'

// Types
export interface Stream {
  id: number;
  name: string;
  code: string;
  description?: string;
  stream_type?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  description?: string;
  education_level?: string;
  is_active?: boolean;
  credit_weight?: number;
  is_compulsory?: boolean;
}

export interface StreamConfiguration {
  id: number;
  school_id: number;
  stream_id: number;
  stream?: Stream;
  subject_role: 'cross_cutting' | 'core' | 'elective';
  subjects: Subject[];
  min_subjects_required: number;
  max_subjects_allowed: number;
  is_compulsory: boolean;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SubjectCombination {
  id: number;
  stream: number | Stream;  // API may return the stream ID or expanded stream object
  name: string;
  code: string;
  description?: string;
  core_subjects: number[];
  elective_subjects: number[];
  cross_cutting_subjects: number[];
  is_active: boolean;
  display_order: number;
}

export interface SchoolStreamConfiguration {
  stream: Stream;
  configurations: StreamConfiguration[];
  available_subjects: Subject[];
}

class StreamConfigurationService {
  // ============================================================================
  // STREAM MANAGEMENT
  // ============================================================================

  
  async getStreams(): Promise<Stream[]> {
  try {
    const headers = await getHeaders('GET');

    const response = await fetch(`${API_BASE_URL}/classrooms/streams/`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      await handleResponseError(response, '/classrooms/streams/', 'GET');
    }

    const data = await response.json();

    // Handle paginated response (important!)
    return data.results || data;
  } catch (error) {
    console.error('Error fetching streams:', error);
    throw error;
  }
}

  /**
   * Get a single stream by ID
   */
  

async getStream(streamId: number): Promise<Stream> {
  try {
    const headers = await getHeaders('GET');

    const response = await fetch(
      `${API_BASE_URL}/classrooms/streams/${streamId}/`,
      {
        method: 'GET',
        headers,
        credentials: 'include',
      }
    );

    if (!response.ok) {
      await handleResponseError(
        response,
        `/classrooms/streams/${streamId}/`,
        'GET'
      );
    }

    const data = await response.json();

    // ✅ Single object — no pagination
    return data;
  } catch (error) {
    console.error('Error fetching stream:', error);
    throw error;
  }
}

    async createStream(data: Partial<Stream>): Promise<Stream> {
    const headers = await getHeaders('POST');

    const response = await fetch(`${API_BASE_URL}/classrooms/streams/`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      await handleResponseError(response, '/classrooms/streams/', 'POST');
    }

    return response.json();
  }
  /**
   * Update an existing stream
   */
  async updateStream(streamId: number, data: Partial<Stream>): Promise<Stream> {
  try {
    const headers = await getHeaders('PUT');

    const response = await fetch(
      `${API_BASE_URL}/classrooms/streams/${streamId}/`,
      {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      await handleResponseError(
        response,
        `/classrooms/streams/${streamId}/`,
        'PUT'
      );
    }

    // ✅ Always parse safely
    const responseData = await response.json();
    return responseData;

  } catch (error) {
    console.error('Error updating stream:', error);
    throw error;
  }
}

  /**
   * Delete a stream
   */
  async deleteStream(streamId: number): Promise<void> {
  try {
    const headers = await getHeaders('DELETE');

    const response = await fetch(
      `${API_BASE_URL}/classrooms/streams/${streamId}/`,
      {
        method: 'DELETE',
        headers,
        credentials: 'include',
      }
    );

    if (!response.ok) {
      await handleResponseError(
        response,
        `/classrooms/streams/${streamId}/`,
        'DELETE'
      );
    }

    // DELETE usually returns 204 No Content → no JSON parsing
    return;

  } catch (error) {
    console.error('Error deleting stream:', error);
    throw error;
  }
}

  // ============================================================================
  // STREAM CONFIGURATION MANAGEMENT
  // ============================================================================

  /**
   * Get all stream configurations
   */
  async getStreamConfigurations(): Promise<StreamConfiguration[]> {
    try {
      const headers = await getHeaders('GET');
      const response = await fetch(`${API_BASE_URL}/subjects/stream-configurations/`,
        {
          method: 'GET',
          headers,
          credentials: 'include',
        }
      );

      if (!response.ok) {
        await handleResponseError(
          response,
          `/subjects/stream-configurations/`,
          'GET'
        );
      }

      const data = await response.json();

      // Handle paginated response consistently
      return data.results ?? data;
    } catch (error) {
      console.error('Error fetching stream configurations:', error);
      throw error;
    }
  }

  /**
   * Get configurations for a specific stream
   */
  async getStreamConfigurationsByStream(streamId: number): Promise<StreamConfiguration[]> {
  try {
    const headers = await getHeaders('GET');

    const response = await fetch(
      `${API_BASE_URL}/subjects/stream-configurations/?stream=${streamId}`,
      {
        method: 'GET',
        headers,
        credentials: 'include',
      }
    );

    if (!response.ok) {
      await handleResponseError(
        response,
        `/subjects/stream-configurations/?stream=${streamId}`,
        'GET'
      );
    }

    const data = await response.json();

    // ✅ Handle pagination safely
    return data.results ?? data;

  } catch (error) {
    console.error('Error fetching stream configurations:', error);
    throw error;
  }
}

  /**
   * Save or update a stream configuration
   */
  async saveStreamConfiguration(config: {
  id?: number;
  stream_id: number;
  subject_role: 'cross_cutting' | 'core' | 'elective';
  min_subjects_required: number;
  max_subjects_allowed: number;
  is_compulsory: boolean;
  display_order: number;
  is_active: boolean;
}): Promise<StreamConfiguration> {
  try {
    const headers = await getHeaders(config.id ? 'PUT' : 'POST');

    const payload = {
      stream: config.stream_id,
      subject_role: config.subject_role,
      min_subjects_required: config.min_subjects_required,
      max_subjects_allowed: config.max_subjects_allowed,
      is_compulsory: config.is_compulsory,
      display_order: config.display_order,
      is_active: config.is_active
    };

    const url = config.id
      ? `${API_BASE_URL}/subjects/stream-configurations/${config.id}/`
      : `${API_BASE_URL}/subjects/stream-configurations/`;

    const method = config.id ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleResponseError(response, url, method);
    }

    // ✅ Always parse JSON for both POST and PUT
    return await response.json();

  } catch (error) {
    console.error('Error saving stream configuration:', error);
    throw error;
  }
}

  /**
   * Setup default configurations for all streams
   */
  async setupDefaultConfigurations(): Promise<void> {
  try {
    const headers = await getHeaders('POST');

    const response = await fetch(
      `${API_BASE_URL}/subjects/stream-configurations/setup_defaults/`,
      {
        method: 'POST',
        headers,
        credentials: 'include',
      }
    );

    if (!response.ok) {
      await handleResponseError(
        response,
        `/subjects/stream-configurations/setup_defaults/`,
        'POST'
      );
    }

  } catch (error) {
    console.error('Error setting up default configurations:', error);
    throw error;
  }
}

  // ============================================================================
  // SUBJECT MANAGEMENT
  // ============================================================================

  /**
   * Get available subjects for assignment
   */
 async getAvailableSubjects(
  educationLevel: string = 'SENIOR_SECONDARY'
): Promise<Subject[]> {
  try {
    const headers = await getHeaders('GET');

    // Request with large page size to get all results in one request
    const url = `${API_BASE_URL}/subjects/?education_levels=${educationLevel}&is_active=true&page_size=999`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      await handleResponseError(response, '/subjects/', 'GET');
    }

    const data = await response.json();

    // ✅ Handle pagination
    return data.results ?? data;

  } catch (error) {
    console.error('Error fetching available subjects:', error);
    throw error;
  }
}

  /**
   * Bulk assign subjects to a configuration
   */
  async bulkAssignSubjects(configId: number, subjectIds: number[]): Promise<void> {
  try {
    const headers = await getHeaders('POST');

    const url = `${API_BASE_URL}/subjects/stream-configurations/${configId}/bulk_assign_subjects/`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ subject_ids: subjectIds }),
    });

    if (!response.ok) {
      await handleResponseError(response, url, 'POST');
    }

  } catch (error) {
    console.error('Error bulk assigning subjects:', error);
    throw error;
  }
}



  /**
   * Remove a subject from a configuration
   */
  async removeSubjectFromConfiguration(configId: number, subjectId: number): Promise<void> {
    try {
      const headers = await getHeaders('POST');
      const url = `${API_BASE_URL}/subjects/stream-configurations/${configId}/remove_subject/`;

       const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ subject_id: subjectId }),
      });
      if (!response.ok) {
        await handleResponseError(response, url, 'POST');
      }
    } catch (error) {
    console.error('Error bulk assigning subjects:', error);
    throw error;
  }
}



  // ============================================================================
  // SUBJECT COMBINATIONS
  // ============================================================================

  /**
   * Get subject combinations
   */
async getSubjectCombinations(streamId?: number): Promise<SubjectCombination[]> {
  try {
    const headers = await getHeaders('GET');
    const params = streamId ? { stream: streamId } : {};

    console.log('🔄 Fetching subject combinations with params:', params);

    const response = await axios.get(
      `${API_BASE_URL}/subjects/subject-combinations/`,
      { params, headers }
    );

    console.log('📤 Subject combinations response:', response.data);

    // Backend returns { stream_id, total_combinations, combinations }
    // Extract the combinations array
    if (response.data && typeof response.data === 'object') {
      const combinations = response.data.combinations || response.data;
      console.log('✅ Extracted combinations:', combinations?.length || 0, 'items');
      return Array.isArray(combinations) ? combinations : [];
    }

    return response.data;

  } catch (error: any) {
    console.error('Error fetching subject combinations:', error);

    // ✅ Log the actual backend error body
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Backend error:', error.response.data);
    }

    throw error;
  }
}


  /**
   * Save a subject combination
   */
  async saveSubjectCombination(
  combination: Partial<SubjectCombination>
): Promise<SubjectCombination> {
  try {
    const method = combination.id ? 'PUT' : 'POST';
    const headers = await getHeaders(method);

    if (combination.id) {
      const response = await axios.put(
        `${API_BASE_URL}/subjects/subject-combinations/${combination.id}/`,
        combination,
        { headers } // ✅ FIXED
      );
      return response.data;
    } else {
      const response = await axios.post(
        `${API_BASE_URL}/subjects/subject-combinations/`,
        combination,
        { headers } // ✅ FIXED
      );
      return response.data;
    }
  } catch (error: any) {
    console.error('Error saving subject combination:', error);

    if (error.response?.data) {
      throw new Error(JSON.stringify(error.response.data));
    }

    throw error;
  }
}

  /**
   * Delete a subject combination
   */
  async deleteSubjectCombination(combinationId: number): Promise<void> {
  try {
    const headers = await getHeaders('DELETE');

    await axios.delete(
      `${API_BASE_URL}/subjects/subject-combinations/${combinationId}/`,
      { headers } // ✅ correct
    );

  } catch (error: any) {
    console.error('Error deleting subject combination:', error);

    if (error.response?.data) {
      throw new Error(JSON.stringify(error.response.data));
    }

    throw error;
  }
}

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get complete school stream configuration
   */
 async getSchoolStreamConfiguration(): Promise<SchoolStreamConfiguration[]> {
  try {
    const [streams, configurations, subjects] = await Promise.all([
      this.getStreams(),
      this.getStreamConfigurations(),
      this.getAvailableSubjects()
    ]);

    if (!streams || !configurations || !subjects) {
      throw new Error('Missing required data for school stream configuration');
    }

    return streams.map((stream) => {
      const streamConfigs = configurations.filter(
        (c) => c.stream_id === stream.id
      );

      return {
        stream,
        configurations: streamConfigs,
        available_subjects: subjects,
      };
    });

  } catch (error) {
    console.error('Error fetching school stream configuration:', error);
    throw error;
  }
}

  /**
   * Validate subject combination
   */
 validateCombination(
  combination: Partial<SubjectCombination>,
  configurations: StreamConfiguration[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const crossCuttingConfig = configurations.find(c => c.subject_role === 'cross_cutting');
  const coreConfig = configurations.find(c => c.subject_role === 'core');
  const electiveConfig = configurations.find(c => c.subject_role === 'elective');

  // Core
  if (coreConfig && combination.core_subjects) {
    if (combination.core_subjects.length < coreConfig.min_subjects_required) {
      errors.push(
        `Minimum ${coreConfig.min_subjects_required} core subjects required, but only ${combination.core_subjects.length} selected`
      );
    }
    if (combination.core_subjects.length > coreConfig.max_subjects_allowed) {
      errors.push(
        `Maximum ${coreConfig.max_subjects_allowed} core subjects allowed, but ${combination.core_subjects.length} selected`
      );
    }
  }

  // Elective
  if (electiveConfig && combination.elective_subjects) {
    if (combination.elective_subjects.length < electiveConfig.min_subjects_required) {
      errors.push(
        `Minimum ${electiveConfig.min_subjects_required} elective subjects required, but only ${combination.elective_subjects.length} selected`
      );
    }
    if (combination.elective_subjects.length > electiveConfig.max_subjects_allowed) {
      errors.push(
        `Maximum ${electiveConfig.max_subjects_allowed} elective subjects allowed, but ${combination.elective_subjects.length} selected`
      );
    }
  }

  // ✅ Cross-cutting (FIX)
  if (crossCuttingConfig && combination.cross_cutting_subjects) {
    if (combination.cross_cutting_subjects.length < crossCuttingConfig.min_subjects_required) {
      errors.push(
        `Minimum ${crossCuttingConfig.min_subjects_required} cross-cutting subjects required, but only ${combination.cross_cutting_subjects.length} selected`
      );
    }
    if (combination.cross_cutting_subjects.length > crossCuttingConfig.max_subjects_allowed) {
      errors.push(
        `Maximum ${crossCuttingConfig.max_subjects_allowed} cross-cutting subjects allowed, but ${combination.cross_cutting_subjects.length} selected`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
}

export default new StreamConfigurationService();