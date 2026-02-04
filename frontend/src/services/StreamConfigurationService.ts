import api from './api';

export interface Subject {
  id: number;
  name: string;
  code: string;
  is_compulsory: boolean;
  credit_weight: number;
}

export interface StreamConfiguration {
  id: number;
  stream_id: number;
  stream_name: string;
  stream_type: string;
  subject_role: 'cross_cutting' | 'core' | 'elective';
  subject_role_display: string;
  min_subjects_required: number;
  max_subjects_allowed: number;
  is_compulsory: boolean;
  subjects: Subject[];
  school_id: number;
  tenant_name: string;
  stream: number;
  created_at: string;
  updated_at: string;
  display_order: number;
  is_active: boolean;
}

export interface Stream {
  id: number;
  name: string;
  stream_type: 'SCIENCE' | 'ARTS' | 'COMMERCIAL' | 'TECHNICAL';
}

export interface SchoolStreamConfiguration {
  id: number;
  school: number;
  stream: number;
  subject_role: string;
  min_subjects_required: number;
  max_subjects_allowed: number;
  is_compulsory: boolean;
  display_order: number;
  is_active: boolean;
}

export interface SchoolStreamSubjectAssignment {
  id: number;
  stream_config: number;
  subject: number;
  is_compulsory: boolean;
  credit_weight: number;
  can_be_elective_elsewhere: boolean;
  is_active: boolean;
}

class StreamConfigurationService {
  // Get all streams
  async getStreams(): Promise<Stream[]> {
    try {
      const response = await api.get('/api/classrooms/streams/');  // Fixed: Use correct classroom streams endpoint
      console.log('🔍 Streams API response:', response);
      console.log('🔍 Streams response.data:', response.data);
      // The API returns data directly, not nested under response.data
      return response || [];
    } catch (error) {
      console.error('Error fetching streams:', error);
      return [];
    }
  }

  // Get stream configurations for current tenant
  async getStreamConfigurations(): Promise<StreamConfiguration[]> {
    try {
      const response = await api.get('/api/subjects/stream-configurations/');
      console.log('🔍 Configurations API response:', response);
      console.log('🔍 Configurations response.data:', response.data);
      console.log('🔍 Configurations response.data type:', typeof response.data);
      console.log('🔍 Configurations response.data is array:', Array.isArray(response.data));
      console.log('🔍 Configurations response.data length:', response.data ? response.data.length : 'undefined');
      console.log('🔍 Configurations response.data[0]:', response.data ? response.data[0] : 'undefined');
      // The API returns data directly, not nested under response.data
      return response || [];
    } catch (error) {
      console.error('Error fetching stream configurations:', error);
      // Return empty array instead of throwing to prevent filter errors
      return [];
    }
  }

  // Get available subjects
  async getAvailableSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/?education_levels=SENIOR_SECONDARY&is_active=true');
      console.log('🔍 Subjects API response:', response);
      console.log('🔍 Subjects response.data:', response.data);
      // The API returns data directly, not nested under response.data
      return response || [];
    } catch (error) {
      console.error('Error fetching subjects:', error);
      // Return empty array instead of throwing to prevent filter errors
      return [];
    }
  }

  // Create or update stream configuration
  async saveStreamConfiguration(config: Partial<SchoolStreamConfiguration>): Promise<SchoolStreamConfiguration> {
    try {
      if (config.id) {
        // Update existing
        const response = await api.put(`/api/subjects/stream-configurations/${config.id}/`, config);
        return response.data;
      } else {
        // Create new
        const response = await api.post('/api/subjects/stream-configurations/', config);
        return response.data;
      }
    } catch (error) {
      console.error('Error saving stream configuration:', error);
      throw error;
    }
  }

  // Save subject assignment
  async saveSubjectAssignment(assignment: Partial<SchoolStreamSubjectAssignment>): Promise<SchoolStreamSubjectAssignment> {
    try {
      if (assignment.id) {
        // Update existing
        const response = await api.put(`/api/subjects/stream-subject-assignments/${assignment.id}/`, assignment);
        return response.data;
      } else {
        // Create new
        const response = await api.post('/api/subjects/stream-subject-assignments/', assignment);
        return response.data;
      }
    } catch (error) {
      console.error('Error saving subject assignment:', error);
      throw error;
    }
  }

  // Bulk assign subjects to a stream configuration
  async bulkAssignSubjects(streamConfigId: number, subjectIds: number[]): Promise<any> {
    try {
      const response = await api.post(`/api/subjects/stream-subject-assignments/bulk_assign/`, {
        stream_config: streamConfigId,
        subjects: subjectIds
      });
      return response.data;
    } catch (error) {
      console.error('Error bulk assigning subjects:', error);
      throw error;
    }
  }

  // Delete subject assignment
  async deleteSubjectAssignment(assignmentId: number): Promise<void> {
    try {
      await api.delete(`/api/subjects/stream-subject-assignments/${assignmentId}/`);
    } catch (error) {
      console.error('Error deleting subject assignment:', error);
      throw error;
    }
  }

  // Get stream configuration summary for current tenant
  async getStreamConfigurationSummary(): Promise<any> {
    try {
      const response = await api.get('/api/subjects/stream-configurations/summary/');
      return response.data;
    } catch (error) {
      console.error('Error fetching stream configuration summary:', error);
      throw error;
    }
  }

  // Setup default configurations for current tenant
  async setupDefaultConfigurations(): Promise<any> {
    try {
      const response = await api.post('/api/subjects/stream-configurations/setup_defaults/', {});
      return response.data;
    } catch (error) {
      console.error('Error setting up default configurations:', error);
      throw error;
    }
  }
}

export default new StreamConfigurationService();
