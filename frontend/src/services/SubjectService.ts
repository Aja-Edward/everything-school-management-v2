import api from '@/services/api';

export interface Subject {
  id: number;
  name: string;
  short_name?: string;
  display_name: string;
  code: string;
  description?: string;
  category: string;
  category_display: string;
  category_display_with_icon: string;
  education_levels: string[];
  education_levels_display: string;
  nursery_levels?: string[];
  nursery_levels_display?: string;
  full_level_display: string;
  education_level_details: any;
  ss_subject_type?: string;
  ss_subject_type_display?: string;
  is_cross_cutting: boolean;
  grade_levels: string[];
  grade_levels_info: any;
  is_compulsory: boolean;
  is_core: boolean;
  is_elective?: boolean;
  elective_group?: string;
  min_electives_required?: number;
  max_electives_allowed?: number;
  compatible_streams: string[];
  prerequisites: string[];
  prerequisite_subjects: any[];
  dependent_subjects: any[];
  has_continuous_assessment: boolean;
  has_final_exam: boolean;
  pass_mark: number;
  has_practical: boolean;
  practical_hours: number;
  is_activity_based: boolean;
  total_weekly_hours: number;
  requires_lab: boolean;
  requires_special_equipment: boolean;
  equipment_notes?: string;
  requires_specialist_teacher: boolean;
  is_active: boolean;
  is_discontinued: boolean;
  introduced_year?: number;
  curriculum_version?: string;
  subject_order: number;
  learning_outcomes?: string;
  subject_summary: any;
  created_at: string;
  updated_at: string;
}

export interface CreateSubjectData {
  name: string;
  short_name?: string;
  code: string;
  description?: string;
  category: string;
  education_levels: string[];
  nursery_levels?: string[];
  ss_subject_type?: string;
  grade_level_ids?: number[];
  is_compulsory: boolean;
  is_core?: boolean;
  is_cross_cutting?: boolean;
  is_elective?: boolean;
  elective_group?: string;
  min_electives_required?: number;
  max_electives_allowed?: number;
  compatible_stream_ids?: string[]; // Changed from number[] to string[]
  has_continuous_assessment?: boolean;
  has_final_exam?: boolean;
  pass_mark?: number;
  has_practical?: boolean;
  practical_hours?: number;
  is_activity_based?: boolean;
  requires_lab?: boolean;
  requires_special_equipment?: boolean;
  equipment_notes?: string;
  requires_specialist_teacher?: boolean;
  introduced_year?: number;
  curriculum_version?: string;
  subject_order?: number;
  learning_outcomes?: string;
}

export interface UpdateSubjectData extends Partial<CreateSubjectData> {
  is_active?: boolean;
  is_discontinued?: boolean;
}

export interface SubjectFilters {
  search?: string;
  category?: string;
  education_level?: string;
  nursery_level?: string;
  ss_subject_type?: string;
  is_compulsory?: boolean;
  is_cross_cutting?: boolean;
  is_activity_based?: boolean;
  is_active?: boolean;
  has_practical?: boolean;
  requires_specialist_teacher?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface SubjectStatistics {
  total_subjects: number;
  active_subjects: number;
  by_category: Record<string, number>;
  by_education_level: Record<string, number>;
  by_ss_subject_type: Record<string, number>;
  cross_cutting_subjects: number;
  activity_based_subjects: number;
  subjects_with_practical: number;
  subjects_requiring_specialist: number;
}

// Updated API response interface to match actual API structure
export interface PaginatedApiResponse<T> {
  count: number;
  next?: string;
  previous?: string;
  results: T[];
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

class SubjectService {
 
async getSubjects(params?: SubjectFilters): Promise<Subject[]> {
  try {
    console.log('🔍 [SubjectService] Fetching subjects with params:', params);
    const response = await api.get('/api/subjects/', params);
    console.log('🔍 [SubjectService] Raw API response:', response);
    
    // api.get() returns parsed JSON directly, not wrapped in .data
    if (response && typeof response === 'object' && 'results' in response) {
      console.log('🔍 [SubjectService] Found results array with', response.results.length, 'subjects');
      return response.results;
    } else if (Array.isArray(response)) {
      console.log('🔍 [SubjectService] Response is direct array with', response.length, 'subjects');
      return response;
    } else {
      console.warn('🔍 [SubjectService] Unexpected response format:', response);
      return [];
    }
  } catch (error) {
    console.error('🔍 [SubjectService] Error fetching subjects:', error);
    // Return fallback subjects instead of throwing to prevent UI crashes
    console.warn('🔍 [SubjectService] Returning fallback subjects due to API error');
    return this.getFallbackSubjects();
  }
}

// Fallback subjects when API fails
private getFallbackSubjects(): Subject[] {
  return [
    // Nursery subjects
    { id: 1, name: 'English (Alphabet)', code: 'ENG-NUR', description: 'Basic English alphabet learning', category: 'core', education_levels: ['NURSERY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 2, name: 'Mathematics (Numbers)', code: 'MATH-NUR', description: 'Basic number recognition', category: 'core', education_levels: ['NURSERY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 3, name: 'Social Studies', code: 'SOC-NUR', description: 'Basic social concepts', category: 'core', education_levels: ['NURSERY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 4, name: 'Basic Science', code: 'SCI-NUR', description: 'Basic science concepts', category: 'core', education_levels: ['NURSERY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 5, name: 'Christian Religious Studies', code: 'CRS-NUR', description: 'Basic religious education', category: 'core', education_levels: ['NURSERY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    
    // Primary subjects
    { id: 6, name: 'English Studies', code: 'ENG-PRI', description: 'English language studies', category: 'core', education_levels: ['PRIMARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 7, name: 'Mathematics', code: 'MATH-PRI', description: 'Mathematics for primary', category: 'core', education_levels: ['PRIMARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 8, name: 'Basic Science and Technology', code: 'BST-PRI', description: 'Science and technology', category: 'core', education_levels: ['PRIMARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 9, name: 'National Values', code: 'NV-PRI', description: 'National values education', category: 'core', education_levels: ['PRIMARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 10, name: 'Cultural and Creative Arts', code: 'CCA-PRI', description: 'Arts and culture', category: 'core', education_levels: ['PRIMARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    
    // Junior Secondary subjects
    { id: 11, name: 'English Studies', code: 'ENG-JSS', description: 'English language', category: 'core', education_levels: ['JUNIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 12, name: 'Mathematics', code: 'MATH-JSS', description: 'Mathematics', category: 'core', education_levels: ['JUNIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 13, name: 'Basic Science and Technology', code: 'BST-JSS', description: 'Science and technology', category: 'core', education_levels: ['JUNIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 14, name: 'Social Studies', code: 'SOC-JSS', description: 'Social studies', category: 'core', education_levels: ['JUNIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 15, name: 'Civic Education', code: 'CIV-JSS', description: 'Civic education', category: 'core', education_levels: ['JUNIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    
    // Senior Secondary subjects
    { id: 16, name: 'English Language', code: 'ENG-SSS', description: 'English language', category: 'core', education_levels: ['SENIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 17, name: 'Mathematics', code: 'MATH-SSS', description: 'Mathematics', category: 'core', education_levels: ['SENIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 18, name: 'Physics', code: 'PHY-SSS', description: 'Physics', category: 'core', education_levels: ['SENIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 19, name: 'Chemistry', code: 'CHEM-SSS', description: 'Chemistry', category: 'core', education_levels: ['SENIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
    { id: 20, name: 'Biology', code: 'BIO-SSS', description: 'Biology', category: 'core', education_levels: ['SENIOR_SECONDARY'], is_active: true, is_core: true, created_at: new Date().toISOString() },
  ];
}

  // Get a single subject by ID
  async getSubject(id: number): Promise<Subject> {
    try {
      const response = await api.get(`/api/subjects/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching subject ${id}:`, error);
      throw error;
    }
  }

  // Create a new subject
  async createSubject(data: CreateSubjectData): Promise<Subject> {
    try {
      const response = await api.post('/api/subjects/', data);
      return response.data;
    } catch (error) {
      console.error('Error creating subject:', error);
      throw error;
    }
  }

  // Update a subject
  async updateSubject(id: number, data: UpdateSubjectData): Promise<Subject> {
    try {
      const response = await api.patch(`/api/subjects/${id}/`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating subject ${id}:`, error);
      throw error;
    }
  }

  // Delete a subject
  // async deleteSubject(id: number): Promise<{ success: boolean; message?: string }> {
  //   try {
  //     const response = await api.delete(`/api/subjects/${id}/`);
  //     return response.data;
  //   } catch (error) {
  //     console.error(`Error deleting subject ${id}:`, error);
  //     throw error;
  //   }
  // }

async deleteSubject(id: number): Promise<{ success: boolean; message?: string; action?: string }> {
  try {
    // Use the api service for consistency with other methods
    const response = await api.delete(`/api/subjects/${id}/`);
    
    // Handle different response scenarios
    if (response) {
      // If there's a response body (from your custom destroy method)
      return {
        success: true,
        message: response.message || 'Subject deleted successfully',
        action: response.action
      };
    } else {
      // Handle empty response (204 No Content)
      return {
        success: true,
        message: 'Subject deleted successfully'
      };
    }
  } catch (error: any) {
    console.error(`Error deleting subject ${id}:`, error);
    
    // Handle different error types
    if (error.response) {
      // Server responded with error status
      const errorMessage = error.response.data?.error || 
                          error.response.data?.message || 
                          `HTTP error! status: ${error.response.status}`;
      throw new Error(errorMessage);
    } else if (error.message === 'Unexpected end of JSON input') {
      // Handle the specific JSON parsing error
      return {
        success: true,
        message: 'Subject deleted successfully'
      };
    } else {
      // Network or other errors
      throw error;
    }
  }
}
  // Get subject statistics - returns the data directly
  async getSubjectStatistics(): Promise<SubjectStatistics> {
    try {
      const response = await api.get('/api/subjects/statistics/');
      return response.data;
    } catch (error) {
      console.error('Error fetching subject statistics:', error);
      throw error;
    }
  }

  // Get subjects by education level
  async getSubjectsByEducationLevel(educationLevel: string): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        params: { education_level: educationLevel, available_only: 'true' }
      });
      return response.data.results || response.data;
    } catch (error) {
      console.error(`Error fetching subjects by education level ${educationLevel}:`, error);
      throw error;
    }
  }

  // Get subjects by category
  async getSubjectsByCategory(category: string): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        params: { category, available_only: 'true' }
      });
      return response.data.results || response.data;
    } catch (error) {
      console.error(`Error fetching subjects by category ${category}:`, error);
      throw error;
    }
  }

  // Get active subjects
  async getActiveSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        params: { is_active: true, available_only: 'true' }
      });
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching active subjects:', error);
      throw error;
    }
  }

  // Get cross-cutting subjects (Senior Secondary)
  async getCrossCuttingSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        params: { is_cross_cutting: true, available_only: 'true' }
      });
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching cross-cutting subjects:', error);
      throw error;
    }
  }

  // Get activity-based subjects (Nursery)
  async getActivityBasedSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        params: { is_activity_based: true, available_only: 'true' }
      });
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching activity-based subjects:', error);
      throw error;
    }
  }

  // Get subjects with practical components
  async getSubjectsWithPractical(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        params: { has_practical: true, available_only: 'true' }
      });
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching subjects with practical:', error);
      throw error;
    }
  }

  // Get subjects requiring specialist teachers
  async getSubjectsRequiringSpecialist(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        params: { requires_specialist_teacher: true, available_only: 'true' }
      });
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching subjects requiring specialist:', error);
      throw error;
    }
  }

  // Bulk operations (Admin only)
  async bulkCreateSubjects(subjects: CreateSubjectData[]): Promise<{ created: Subject[]; errors?: any[] }> {
    try {
      const response = await api.post('/api/management/subjects/bulk_create/', { subjects });
      return response.data;
    } catch (error) {
      console.error('Error bulk creating subjects:', error);
      throw error;
    }
  }

  async bulkUpdateSubjects(subjects: { id: number; data: UpdateSubjectData }[]): Promise<{ updated: Subject[]; errors?: any[] }> {
    try {
      const response = await api.patch('/api/management/subjects/bulk_update/', { subjects });
      return response.data;
    } catch (error) {
      console.error('Error bulk updating subjects:', error);
      throw error;
    }
  }

  async bulkDeleteSubjects(subjectIds: number[]): Promise<{ deleted: number[]; errors?: any[] }> {
    try {
      const response = await api.post('/api/management/subjects/bulk_delete/', { subject_ids: subjectIds });
      return response.data;
    } catch (error) {
      console.error('Error bulk deleting subjects:', error);
      throw error;
    }
  }

  async bulkActivateSubjects(subjectIds: number[], activate: boolean): Promise<{ updated: number[]; errors?: any[] }> {
    try {
      const response = await api.post('/api/management/subjects/bulk_activate/', {
        subject_ids: subjectIds,
        activate
      });
      return response.data;
    } catch (error) {
      console.error('Error bulk activating subjects:', error);
      throw error;
    }
  }

  // Export and import (Admin only)
  async exportSubjects(format: 'csv' | 'xlsx' = 'csv'): Promise<Blob> {
    try {
      const response = await api.get(`/api/management/subjects/export/?format=${format}`, {
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      console.error('Error exporting subjects:', error);
      throw error;
    }
  }

  async importSubjects(file: File): Promise<{ imported: number; errors?: any[] }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/api/management/subjects/import/', formData);
      return response.data;
    } catch (error) {
      console.error('Error importing subjects:', error);
      throw error;
    }
  }

  // Utility methods
  async getSubjectCategories(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/categories/');
      return response.data;
    } catch (error) {
      console.error('Error fetching subject categories:', error);
      throw error;
    }
  }

  async getEducationLevels(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/education_levels/');
      return response.data;
    } catch (error) {
      console.error('Error fetching education levels:', error);
      throw error;
    }
  }

  async getNurseryLevels(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/nursery_levels/');
      return response.data;
    } catch (error) {
      console.error('Error fetching nursery levels:', error);
      throw error;
    }
  }

  async getSSSubjectTypes(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/ss_subject_types/');
      return response.data;
    } catch (error) {
      console.error('Error fetching SS subject types:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await api.get('/api/subjects/health/');
      return response.data;
    } catch (error) {
      console.error('Error checking health:', error);
      throw error;
    }
  }
}

export const subjectService = new SubjectService();
export default subjectService;