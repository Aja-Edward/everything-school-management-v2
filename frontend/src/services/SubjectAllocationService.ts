/**
 * Subject Allocation Service
 *
 * Manages subject allocations to teachers for specific classes and academic sessions.
 * This allows schools to assign which teachers teach which subjects to which classes.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SubjectAllocation {
  id: number;
  subject: number;
  subject_name: string;
  teacher: number;
  teacher_name: string;
  academic_session: number;
  academic_session_name: string;
  education_level: string;
  student_class: number;
  periods_per_week: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateSubjectAllocationData {
  subject: number;
  teacher: number;
  academic_session: number;
  education_level: string;
  student_class: number;
  periods_per_week: number;
  is_active?: boolean;
}

export interface UpdateSubjectAllocationData extends Partial<CreateSubjectAllocationData> {}

export interface SubjectAllocationFilters {
  subject?: number;
  teacher?: number;
  academic_session?: number;
  education_level?: string;
  student_class?: number;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

// ============================================================================
// SUBJECT ALLOCATION SERVICE
// ============================================================================

class SubjectAllocationService {
  /**
   * Get all subject allocations
   */
  async getAllocations(params?: SubjectAllocationFilters): Promise<SubjectAllocation[]> {
    try {
      const response = await api.get('/api/academics/subject-allocations/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching subject allocations:', error);
      throw error;
    }
  }

  /**
   * Get a single subject allocation by ID
   */
  async getAllocation(id: number): Promise<SubjectAllocation> {
    try {
      const response = await api.get(`/api/academics/subject-allocations/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching subject allocation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new subject allocation
   */
  async createAllocation(data: CreateSubjectAllocationData): Promise<SubjectAllocation> {
    try {
      const response = await api.post('/api/academics/subject-allocations/', data);
      return response;
    } catch (error) {
      console.error('Error creating subject allocation:', error);
      throw error;
    }
  }

  /**
   * Update a subject allocation
   */
  async updateAllocation(id: number, data: UpdateSubjectAllocationData): Promise<SubjectAllocation> {
    try {
      const response = await api.patch(`/api/academics/subject-allocations/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating subject allocation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a subject allocation
   */
  async deleteAllocation(id: number): Promise<void> {
    try {
      await api.delete(`/api/academics/subject-allocations/${id}/`);
    } catch (error) {
      console.error(`Error deleting subject allocation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get allocations by teacher
   */
  async getAllocationsByTeacher(teacherId: number, academicSessionId?: number): Promise<SubjectAllocation[]> {
    return this.getAllocations({
      teacher: teacherId,
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  /**
   * Get allocations by class
   */
  async getAllocationsByClass(
    educationLevel: string,
    studentClass: number,
    academicSessionId?: number
  ): Promise<SubjectAllocation[]> {
    return this.getAllocations({
      education_level: educationLevel,
      student_class: studentClass,
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  /**
   * Get allocations by subject
   */
  async getAllocationsBySubject(subjectId: number, academicSessionId?: number): Promise<SubjectAllocation[]> {
    return this.getAllocations({
      subject: subjectId,
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  /**
   * Get allocations by academic session
   */
  async getAllocationsBySession(academicSessionId: number): Promise<SubjectAllocation[]> {
    return this.getAllocations({
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  /**
   * Bulk create subject allocations
   * Useful for assigning multiple subjects to a teacher at once
   */
  async bulkCreateAllocations(allocations: CreateSubjectAllocationData[]): Promise<SubjectAllocation[]> {
    try {
      const promises = allocations.map(allocation => this.createAllocation(allocation));
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk creating subject allocations:', error);
      throw error;
    }
  }

  /**
   * Bulk update allocations (e.g., deactivate all for a teacher)
   */
  async bulkUpdateAllocations(
    updates: { id: number; data: UpdateSubjectAllocationData }[]
  ): Promise<SubjectAllocation[]> {
    try {
      const promises = updates.map(({ id, data }) => this.updateAllocation(id, data));
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk updating subject allocations:', error);
      throw error;
    }
  }

  /**
   * Deactivate all allocations for a teacher
   */
  async deactivateTeacherAllocations(teacherId: number, academicSessionId?: number): Promise<void> {
    try {
      const allocations = await this.getAllocationsByTeacher(teacherId, academicSessionId);
      const updates = allocations.map(allocation => ({
        id: allocation.id,
        data: { is_active: false },
      }));
      await this.bulkUpdateAllocations(updates);
    } catch (error) {
      console.error(`Error deactivating allocations for teacher ${teacherId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a teacher is already allocated to a subject for a class
   */
  async checkAllocationExists(
    teacherId: number,
    subjectId: number,
    studentClass: number,
    educationLevel: string,
    academicSessionId: number
  ): Promise<boolean> {
    try {
      const allocations = await this.getAllocations({
        teacher: teacherId,
        subject: subjectId,
        student_class: studentClass,
        education_level: educationLevel,
        academic_session: academicSessionId,
        is_active: true,
      });
      return allocations.length > 0;
    } catch (error) {
      console.error('Error checking allocation existence:', error);
      return false;
    }
  }
}

export const subjectAllocationService = new SubjectAllocationService();
export default subjectAllocationService;
