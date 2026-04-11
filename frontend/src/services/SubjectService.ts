import api from '@/services/api';

// ========================================
// NEW FK-RELATED INTERFACES
// ========================================

export interface SubjectCategory {
  id: number;
  name: string;
  code: string;
  description?: string;
  color_code?: string;
  display_order: number;
  is_active: boolean;
  subject_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SubjectType {
  id: number;
  name: string;
  code: string;
  description?: string;
  applicable_levels?: number[];
  applicable_levels_display?: string[];
  is_cross_cutting: boolean;
  display_order: number;
  is_active: boolean;
  subject_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GradeLevel {
  id: number;
  name: string;
  code: string;
  education_level: string;
  education_level_display?: string;
  level_order?: number;
  grade_number?: number;
  is_active?: boolean;
}

// ========================================
// UPDATED SUBJECT INTERFACE
// ========================================

export interface Subject {
  id: number;
  name: string;
  short_name?: string;
  display_name: string;
  code: string;
  description?: string;
  
  // OLD FIELDS (Deprecated - maintained for backward compatibility during transition)
  category?: string | number;
  category_display?: string;
  category_display_with_icon?: string;
  education_levels?: string[];
  education_levels_display?: string;
  nursery_levels?: string[];
  nursery_levels_display?: string;
  ss_subject_type?: string | number;
  ss_subject_type_display?: string;
  
  // NEW FK FIELDS (Use these going forward)
  category_new?: SubjectCategory;
  category_new_id?: number;
  subject_type_new?: SubjectType;
  subject_type_new_id?: number;
  grade_levels?: GradeLevel[];
  grade_level_ids?: number[];
  
  // Legacy fields
  full_level_display?: string;
  education_level_details?: any;
  is_cross_cutting: boolean;
  default_stream_role?: string;
  grade_levels_info?: any;
  
  // Subject configuration
  is_compulsory?: boolean;
  is_core?: boolean;
  is_elective?: boolean;
  elective_group?: string;
  min_electives_required?: number;
  max_electives_allowed?: number;
  
  // Relationships
  parent_subject?: number;
  parent_subject_details?: Subject;
  compatible_streams?: string[];
  prerequisites?: number[];
  prerequisite_subjects?: Subject[];
  dependent_subjects?: Subject[];
  component_subjects?: Subject[];
  
  // Assessment configuration
  credit_hours?: number;
  passing_marks?: number;
  max_marks?: number;
  has_continuous_assessment?: boolean;
  has_final_exam?: boolean;
  pass_mark?: number;
  has_practical?: boolean;
  practical_hours?: number;
  
  // Teaching requirements
  is_activity_based?: boolean;
  total_weekly_hours?: number;
  requires_lab?: boolean;
  requires_special_equipment?: boolean;
  equipment_notes?: string;
  requires_specialist_teacher?: boolean;
  
  // Status fields
  is_active: boolean;
  is_discontinued?: boolean;
  introduced_year?: number;
  curriculum_version?: string;
  subject_order: number;
  
  // Content
  learning_outcomes?: string;
  subject_summary?: any;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// ========================================
// CREATE/UPDATE INTERFACES
// ========================================

export interface CreateSubjectData {
  name: string;
  short_name?: string;
  code: string;
  description?: string;
  
  // NEW FK FIELDS (Preferred)
  category_new_id?: number;
  subject_type_new_id?: number;
  grade_level_ids?: number[];
  
  // OLD FIELDS (Deprecated - kept for backward compatibility)
  category?: string | number;
  education_levels?: string[];
  nursery_levels?: string[];
  ss_subject_type?: string | number;
  
  // Configuration
  is_compulsory?: boolean;
  is_core?: boolean;
  is_cross_cutting?: boolean;
  is_elective?: boolean;
  elective_group?: string;
  min_electives_required?: number;
  max_electives_allowed?: number;
  default_stream_role?: string;
  
  // Relationships
  parent_subject?: number;
  compatible_stream_ids?: string[];
  prerequisite_ids?: number[];
  
  // Assessment
  credit_hours?: number;
  passing_marks?: number;
  max_marks?: number;
  has_continuous_assessment?: boolean;
  has_final_exam?: boolean;
  pass_mark?: number;
  has_practical?: boolean;
  practical_hours?: number;
  
  // Teaching
  is_activity_based?: boolean;
  total_weekly_hours?: number;
  requires_lab?: boolean;
  requires_special_equipment?: boolean;
  equipment_notes?: string;
  requires_specialist_teacher?: boolean;
  
  // Metadata
  introduced_year?: number;
  curriculum_version?: string;
  subject_order?: number;
  learning_outcomes?: string;
}

export interface UpdateSubjectData extends Partial<CreateSubjectData> {
  is_active?: boolean;
  is_discontinued?: boolean;
}

// ========================================
// FILTER INTERFACES
// ========================================

export interface SubjectFilters {
  search?: string;
  
  // NEW FK FILTERS (Preferred)
  category_new_id?: number;
  subject_type_new_id?: number;
  grade_level_id?: number;
  education_level?: string; // Still useful for filtering across grade levels
  
  // OLD FILTERS (Deprecated but maintained)
  category?: string;
  nursery_level?: string;
 ss_subject_type?: string | number;
  
  // Boolean filters
  is_compulsory?: boolean;
  is_cross_cutting?: boolean;
  is_activity_based?: boolean;
  is_active?: boolean;
  has_practical?: boolean;
  requires_specialist_teacher?: boolean;
  is_core?: boolean;
  is_elective?: boolean;
  
  // Relationships
  parent_subject?: number;
  has_prerequisites?: boolean;
  
  // Pagination and ordering
  ordering?: string;
  page?: number;
  page_size?: number;
}

// ========================================
// STATISTICS INTERFACE
// ========================================

export interface SubjectStatistics {
  total_subjects: number;
  active_subjects: number;
  inactive_subjects: number;
  discontinued_subjects: number;
  
  // By new FK fields
  by_category_new?: Record<string, { count: number; name: string }>;
  by_subject_type?: Record<string, { count: number; name: string }>;
  by_grade_level?: Record<string, { count: number; name: string }>;
  
  // By old fields (backward compatibility)
  by_category?: Record<string, number>;
  by_education_level?: Record<string, number>;
  by_ss_subject_type?: Record<string, number>;
  
  // Subject characteristics
  cross_cutting_subjects: number;
  activity_based_subjects: number;
  subjects_with_practical: number;
  subjects_requiring_specialist: number;
  core_subjects: number;
  elective_subjects: number;
  
  // Assessment
  subjects_with_continuous_assessment?: number;
  subjects_with_final_exam?: number;
}

// ========================================
// API RESPONSE INTERFACES
// ========================================

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

// ========================================
// SUBJECT SERVICE CLASS
// ========================================

class SubjectService {
  
  // ========================================
  // CORE CRUD OPERATIONS
  // ========================================
  
  async getSubjects(params?: SubjectFilters): Promise<Subject[]> {
  try {
    console.log('🔍 [SubjectService] Fetching subjects with params:', params);
    
    let allSubjects: Subject[] = [];
    let currentParams: Record<string, any> = { ...params, page_size: 100 };
    let nextUrl: string | null = '/api/subjects/';

    while (nextUrl) {
      const response = await api.get(nextUrl, currentParams);
      console.log('🔍 [SubjectService] Raw API response:', response);

      if (response && typeof response === 'object' && 'results' in response) {
        console.log('🔍 [SubjectService] Found results array with', response.results.length, 'subjects');
        allSubjects = [...allSubjects, ...response.results];
        // If there's a next page, extract just the path to avoid double base URL
        if (response.next) {
          const url = new URL(response.next);
          nextUrl = url.pathname + url.search;
          currentParams = {}; // params are already in the next URL
        } else {
          nextUrl = null;
        }
      } else if (Array.isArray(response)) {
        console.log('🔍 [SubjectService] Response is direct array with', response.length, 'subjects');
        allSubjects = [...allSubjects, ...response];
        nextUrl = null;
      } else {
        console.warn('🔍 [SubjectService] Unexpected response format:', response);
        nextUrl = null;
      }
    }

    console.log('🔍 [SubjectService] Total subjects fetched:', allSubjects.length);
    return allSubjects;
  } catch (error) {
    console.error('🔍 [SubjectService] Error fetching subjects:', error);
    console.warn('🔍 [SubjectService] Returning fallback subjects due to API error');
    return this.getFallbackSubjects();
  }
}

  async getSubject(id: number): Promise<Subject> {
    try {
      const response = await api.get(`/api/subjects/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching subject ${id}:`, error);
      throw error;
    }
  }

  async createSubject(data: CreateSubjectData): Promise<Subject> {
    try {
      console.log('📡 [SubjectService] createSubject called with:', JSON.stringify(data, null, 2));
      const response = await api.post('/api/subjects/', data);
       console.log('📡 [SubjectService] createSubject raw response:', JSON.stringify(response, null, 2));
      return response.data;
    } catch (error) {
      console.error('Error creating subject:', error);
      throw error;
    }
  }

  async updateSubject(id: number, data: UpdateSubjectData): Promise<Subject> {
    try {
      const response = await api.patch(`/api/subjects/${id}/`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating subject ${id}:`, error);
      throw error;
    }
  }

  async deleteSubject(id: number): Promise<{ success: boolean; message?: string; action?: string }> {
    try {
      const response = await api.delete(`/api/subjects/${id}/`);
      
      if (response) {
        return {
          success: true,
          message: response.message || 'Subject deleted successfully',
          action: response.action
        };
      } else {
        return {
          success: true,
          message: 'Subject deleted successfully'
        };
      }
    } catch (error: any) {
      console.error(`Error deleting subject ${id}:`, error);
      
      if (error.response) {
        const errorMessage = error.response.data?.error || 
                            error.response.data?.message || 
                            `HTTP error! status: ${error.response.status}`;
        throw new Error(errorMessage);
      } else if (error.message === 'Unexpected end of JSON input') {
        return {
          success: true,
          message: 'Subject deleted successfully'
        };
      } else {
        throw error;
      }
    }
  }

  // ========================================
  // CATEGORY & TYPE MANAGEMENT (NEW)
  // ========================================
  
  async getCategories(): Promise<SubjectCategory[]> {
    try {
      const response = await api.get('/api/subjects/categories/');  // FIXED
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching subject categories:', error);
      throw error;
    }
  }

  async getCategory(id: number): Promise<SubjectCategory> {
    try {
      const response = await api.get(`/api/subjects/categories/${id}/`);  // FIXED
      return response.data || response;
    } catch (error) {
      console.error(`Error fetching category ${id}:`, error);
      throw error;
    }
  }

  async createCategory(data: Partial<SubjectCategory>): Promise<SubjectCategory> {
    try {
      const response = await api.post('/api/subjects/categories/', data);  // FIXED
      return response.data || response;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  async updateCategory(id: number, data: Partial<SubjectCategory>): Promise<SubjectCategory> {
    try {
      const response = await api.patch(`/api/subjects/categories/${id}/`, data);  // FIXED
      return response.data || response;
    } catch (error) {
      console.error(`Error updating category ${id}:`, error);
      throw error;
    }
  }

  async deleteCategory(id: number): Promise<void> {
    try {
      await api.delete(`/api/subjects/categories/${id}/`);  // FIXED
    } catch (error) {
      console.error(`Error deleting category ${id}:`, error);
      throw error;
    }
  }

  async getSubjectTypes(): Promise<SubjectType[]> {
    try {
      const response = await api.get('/api/subjects/types/');  // FIXED
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching subject types:', error);
      throw error;
    }
  }

  async getSubjectType(id: number): Promise<SubjectType> {
    try {
      const response = await api.get(`/api/subjects/types/${id}/`);  // FIXED
      return response.data || response;
    } catch (error) {
      console.error(`Error fetching subject type ${id}:`, error);
      throw error;
    }
  }

  async createSubjectType(data: Partial<SubjectType>): Promise<SubjectType> {
    try {
      const response = await api.post('/api/subjects/types/', data);  // FIXED
      return response.data || response;
    } catch (error) {
      console.error('Error creating subject type:', error);
      throw error;
    }
  }

  async updateSubjectType(id: number, data: Partial<SubjectType>): Promise<SubjectType> {
    try {
      const response = await api.patch(`/api/subjects/types/${id}/`, data);  // FIXED
      return response.data || response;
    } catch (error) {
      console.error(`Error updating subject type ${id}:`, error);
      throw error;
    }
  }

  async deleteSubjectType(id: number): Promise<void> {
    try {
      await api.delete(`/api/subjects/types/${id}/`);  // FIXED
    } catch (error) {
      console.error(`Error deleting subject type ${id}:`, error);
      throw error;
    }
  }

  // ========================================
  // STATISTICS & REPORTING
  // ========================================
  
  async getSubjectStatistics(): Promise<SubjectStatistics> {
    try {
      const response = await api.get('/api/subjects/statistics/');
      return response.data || response;
    } catch (error) {
      console.error('Error fetching subject statistics:', error);
      throw error;
    }
  }

  // ========================================
  // FILTERED QUERIES (Updated for new FK fields)
  // ========================================
  
  async getSubjectsByEducationLevel(educationLevel: string): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        education_level: educationLevel,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error(`Error fetching subjects by education level ${educationLevel}:`, error);
      throw error;
    }
  }

  async getSubjectsByGradeLevel(gradeLevelId: number): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        grade_level_id: gradeLevelId,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error(`Error fetching subjects by grade level ${gradeLevelId}:`, error);
      throw error;
    }
  }

  async getSubjectsByCategory(categoryId: number): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        category_new_id: categoryId,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error(`Error fetching subjects by category ${categoryId}:`, error);
      throw error;
    }
  }

  async getSubjectsByType(typeId: number): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        subject_type_new_id: typeId,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error(`Error fetching subjects by type ${typeId}:`, error);
      throw error;
    }
  }

  async getActiveSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching active subjects:', error);
      throw error;
    }
  }

  async getCrossCuttingSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        is_cross_cutting: true,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching cross-cutting subjects:', error);
      throw error;
    }
  }

  async getActivityBasedSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        is_activity_based: true,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching activity-based subjects:', error);
      throw error;
    }
  }

  async getSubjectsWithPractical(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        has_practical: true,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching subjects with practical:', error);
      throw error;
    }
  }

  async getSubjectsRequiringSpecialist(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        requires_specialist_teacher: true,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching subjects requiring specialist:', error);
      throw error;
    }
  }

  async getCoreSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        is_core: true,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching core subjects:', error);
      throw error;
    }
  }

  async getElectiveSubjects(): Promise<Subject[]> {
    try {
      const response = await api.get('/api/subjects/', {
        is_elective: true,
        is_active: true
      });
      return response.results || response.data || response;
    } catch (error) {
      console.error('Error fetching elective subjects:', error);
      throw error;
    }
  }

  // ========================================
  // BULK OPERATIONS
  // ========================================
  
  async bulkCreateSubjects(subjects: CreateSubjectData[]): Promise<{ created: Subject[]; errors?: any[] }> {
    try {
      const response = await api.post('/api/subjects/bulk_create/', { subjects });
      return response.data || response;
    } catch (error) {
      console.error('Error bulk creating subjects:', error);
      throw error;
    }
  }

  async bulkUpdateSubjects(subjects: { id: number; data: UpdateSubjectData }[]): Promise<{ updated: Subject[]; errors?: any[] }> {
    try {
      const response = await api.patch('/api/subjects/bulk_update/', { subjects });
      return response.data || response;
    } catch (error) {
      console.error('Error bulk updating subjects:', error);
      throw error;
    }
  }

  async bulkDeleteSubjects(subjectIds: number[]): Promise<{ deleted: number[]; errors?: any[] }> {
    try {
      const response = await api.post('/api/subjects/bulk_delete/', { subject_ids: subjectIds });
      return response.data || response;
    } catch (error) {
      console.error('Error bulk deleting subjects:', error);
      throw error;
    }
  }

  async bulkActivateSubjects(subjectIds: number[], activate: boolean): Promise<{ updated: number[]; errors?: any[] }> {
    try {
      const response = await api.post('/api/subjects/bulk_activate/', {
        subject_ids: subjectIds,
        activate
      });
      return response.data || response;
    } catch (error) {
      console.error('Error bulk activating subjects:', error);
      throw error;
    }
  }

  // ========================================
  // IMPORT/EXPORT
  // ========================================
  
  async exportSubjects(format: 'csv' | 'xlsx' = 'csv'): Promise<Blob> {
    try {
      const response = await api.get(`/api/subjects/export/?format=${format}`, {
        responseType: 'blob'
      });
      return response.data || response;
    } catch (error) {
      console.error('Error exporting subjects:', error);
      throw error;
    }
  }

  async importSubjects(file: File): Promise<{ imported: number; errors?: any[] }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/api/subjects/import/', formData);
      return response.data || response;
    } catch (error) {
      console.error('Error importing subjects:', error);
      throw error;
    }
  }

  // ========================================
  // UTILITY METHODS (Deprecated - use new FK endpoints)
  // ========================================
  
  async getSubjectCategoriesLegacy(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/categories/');
      return response.data || response;
    } catch (error) {
      console.error('Error fetching subject categories (legacy):', error);
      throw error;
    }
  }

  async getEducationLevels(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/education_levels/');
      return response.data || response;
    } catch (error) {
      console.error('Error fetching education levels:', error);
      throw error;
    }
  }

  async getNurseryLevels(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/nursery_levels/');
      return response.data || response;
    } catch (error) {
      console.error('Error fetching nursery levels:', error);
      throw error;
    }
  }

  async getSSSubjectTypesLegacy(): Promise<string[]> {
    try {
      const response = await api.get('/api/subjects/ss_subject_types/');
      return response.data || response;
    } catch (error) {
      console.error('Error fetching SS subject types (legacy):', error);
      throw error;
    }
  }

  // ========================================
  // HEALTH CHECK
  // ========================================
  
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await api.get('/api/subjects/health/');
      return response.data || response;
    } catch (error) {
      console.error('Error checking health:', error);
      throw error;
    }
  }

  // ========================================
  // FALLBACK DATA
  // ========================================
  
  private getFallbackSubjects(): Subject[] {
    return [
      // Nursery subjects
      { 
        id: 1, 
        name: 'English (Alphabet)', 
        display_name: 'English (Alphabet)',
        code: 'ENG-NUR', 
        description: 'Basic English alphabet learning', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 2, 
        name: 'Mathematics (Numbers)', 
        display_name: 'Mathematics (Numbers)',
        code: 'MATH-NUR', 
        description: 'Basic number recognition', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 3, 
        name: 'Social Studies', 
        display_name: 'Social Studies',
        code: 'SOC-NUR', 
        description: 'Basic social concepts', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 4, 
        name: 'Basic Science', 
        display_name: 'Basic Science',
        code: 'SCI-NUR', 
        description: 'Basic science concepts', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 5, 
        name: 'Christian Religious Studies', 
        display_name: 'Christian Religious Studies',
        code: 'CRS-NUR', 
        description: 'Basic religious education', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      
      // Primary subjects
      { 
        id: 6, 
        name: 'English Studies', 
        display_name: 'English Studies',
        code: 'ENG-PRI', 
        description: 'English language studies', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 7, 
        name: 'Mathematics', 
        display_name: 'Mathematics',
        code: 'MATH-PRI', 
        description: 'Mathematics for primary', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 8, 
        name: 'Basic Science and Technology', 
        display_name: 'Basic Science and Technology',
        code: 'BST-PRI', 
        description: 'Science and technology', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 9, 
        name: 'National Values', 
        display_name: 'National Values',
        code: 'NV-PRI', 
        description: 'National values education', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 10, 
        name: 'Cultural and Creative Arts', 
        display_name: 'Cultural and Creative Arts',
        code: 'CCA-PRI', 
        description: 'Arts and culture', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      
      // Junior Secondary subjects
      { 
        id: 11, 
        name: 'English Studies', 
        display_name: 'English Studies',
        code: 'ENG-JSS', 
        description: 'English language', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 12, 
        name: 'Mathematics', 
        display_name: 'Mathematics',
        code: 'MATH-JSS', 
        description: 'Mathematics', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 13, 
        name: 'Basic Science and Technology', 
        display_name: 'Basic Science and Technology',
        code: 'BST-JSS', 
        description: 'Science and technology', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 14, 
        name: 'Social Studies', 
        display_name: 'Social Studies',
        code: 'SOC-JSS', 
        description: 'Social studies', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 15, 
        name: 'Civic Education', 
        display_name: 'Civic Education',
        code: 'CIV-JSS', 
        description: 'Civic education', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      
      // Senior Secondary subjects
      { 
        id: 16, 
        name: 'English Language', 
        display_name: 'English Language',
        code: 'ENG-SSS', 
        description: 'English language', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 17, 
        name: 'Mathematics', 
        display_name: 'Mathematics',
        code: 'MATH-SSS', 
        description: 'Mathematics', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 18, 
        name: 'Physics', 
        display_name: 'Physics',
        code: 'PHY-SSS', 
        description: 'Physics', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 19, 
        name: 'Chemistry', 
        display_name: 'Chemistry',
        code: 'CHEM-SSS', 
        description: 'Chemistry', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { 
        id: 20, 
        name: 'Biology', 
        display_name: 'Biology',
        code: 'BIO-SSS', 
        description: 'Biology', 
        is_active: true, 
        is_core: true,
        is_cross_cutting: false,
        subject_order: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
    ];
  }
}

export const subjectService = new SubjectService();
export default subjectService;