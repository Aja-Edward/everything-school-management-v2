import axios from 'axios';

// Types
export interface Stream {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  description?: string;
  education_level: string;
  is_active: boolean;
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
  stream_id: number;
  stream?: Stream;
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
  private baseURL = '/api';

  // ============================================================================
  // STREAM MANAGEMENT
  // ============================================================================

  /**
   * Get all streams
   */
  async getStreams(): Promise<Stream[]> {
    try {
      const response = await axios.get(`${this.baseURL}/classrooms/streams/`);
      return response.data;
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
      const response = await axios.get(`${this.baseURL}/classrooms/streams/${streamId}/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching stream:', error);
      throw error;
    }
  }

  /**
   * Create a new stream
   */
  async createStream(data: Partial<Stream>): Promise<Stream> {
    try {
      const response = await axios.post(`${this.baseURL}/classrooms/streams/`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating stream:', error);
      if (error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Update an existing stream
   */
  async updateStream(streamId: number, data: Partial<Stream>): Promise<Stream> {
    try {
      const response = await axios.put(`${this.baseURL}/classrooms/streams/${streamId}/`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating stream:', error);
      if (error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Delete a stream
   */
  async deleteStream(streamId: number): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/classrooms/streams/${streamId}/`);
    } catch (error: any) {
      console.error('Error deleting stream:', error);
      if (error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
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
      const response = await axios.get(`${this.baseURL}/subjects/stream-configurations/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching configurations:', error);
      throw error;
    }
  }

  /**
   * Get configurations for a specific stream
   */
  async getStreamConfigurationsByStream(streamId: number): Promise<StreamConfiguration[]> {
    try {
      const response = await axios.get(
        `${this.baseURL}/subjects/stream-configurations/?stream=${streamId}`
      );
      return response.data;
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
    school_id?: number;
    stream_id: number;
    subject_role: 'cross_cutting' | 'core' | 'elective';
    min_subjects_required: number;
    max_subjects_allowed: number;
    is_compulsory: boolean;
    display_order: number;
    is_active: boolean;
  }): Promise<StreamConfiguration> {
    try {
      // Transform to backend format
      const payload = {
        school: config.school_id,
        stream: config.stream_id,
        subject_role: config.subject_role,
        min_subjects_required: config.min_subjects_required,
        max_subjects_allowed: config.max_subjects_allowed,
        is_compulsory: config.is_compulsory,
        display_order: config.display_order,
        is_active: config.is_active
      };

      if (config.id) {
        const response = await axios.put(
          `${this.baseURL}/subjects/stream-configurations/${config.id}/`,
          payload
        );
        return response.data;
      } else {
        const response = await axios.post(
          `${this.baseURL}/subjects/stream-configurations/`,
          payload
        );
        return response.data;
      }
    } catch (error: any) {
      console.error('Error saving stream configuration:', error);
      if (error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Setup default configurations for all streams
   */
  async setupDefaultConfigurations(): Promise<void> {
    try {
      await axios.post(`${this.baseURL}/subjects/stream-configurations/setup_defaults/`);
    } catch (error: any) {
      console.error('Error setting up default configurations:', error);
      if (error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  // ============================================================================
  // SUBJECT MANAGEMENT
  // ============================================================================

  /**
   * Get available subjects for assignment
   */
  async getAvailableSubjects(educationLevel: string = 'SENIOR_SECONDARY'): Promise<Subject[]> {
    try {
      const response = await axios.get(`${this.baseURL}/subjects/`, {
        params: {
          education_levels: educationLevel,
          is_active: true
        }
      });
      return response.data;
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
      await axios.post(
        `${this.baseURL}/subjects/stream-configurations/${configId}/bulk_assign_subjects/`,
        { subject_ids: subjectIds }
      );
    } catch (error: any) {
      console.error('Error bulk assigning subjects:', error);
      if (error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Remove a subject from a configuration
   */
  async removeSubjectFromConfiguration(configId: number, subjectId: number): Promise<void> {
    try {
      await axios.post(
        `${this.baseURL}/subjects/stream-configurations/${configId}/remove_subject/`,
        { subject_id: subjectId }
      );
    } catch (error: any) {
      console.error('Error removing subject:', error);
      if (error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
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
      const params = streamId ? { stream: streamId } : {};
      const response = await axios.get(`${this.baseURL}/subjects/subject-combinations/`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching subject combinations:', error);
      throw error;
    }
  }

  /**
   * Save a subject combination
   */
  async saveSubjectCombination(combination: Partial<SubjectCombination>): Promise<SubjectCombination> {
    try {
      if (combination.id) {
        const response = await axios.put(
          `${this.baseURL}/subjects/subject-combinations/${combination.id}/`,
          combination
        );
        return response.data;
      } else {
        const response = await axios.post(
          `${this.baseURL}/subjects/subject-combinations/`,
          combination
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
      await axios.delete(`${this.baseURL}/subjects/subject-combinations/${combinationId}/`);
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

      return streams.map(stream => ({
        stream,
        configurations: configurations.filter(c => c.stream_id === stream.id),
        available_subjects: subjects
      }));
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

    // Get configurations for the stream
    const crossCuttingConfig = configurations.find(c => c.subject_role === 'cross_cutting');
    const coreConfig = configurations.find(c => c.subject_role === 'core');
    const electiveConfig = configurations.find(c => c.subject_role === 'elective');

    // Validate core subjects
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

    // Validate elective subjects
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

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default new StreamConfigurationService();