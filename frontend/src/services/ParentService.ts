import api from './api';

export interface Parent {
  id: number;
  user: string | {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    username: string;
    is_active: boolean;
    date_joined: string;
  };
  students: Child[];
  is_active: boolean;
  parent_username?: string;
  parent_password?: string;
  user_first_name?: string;
  user_last_name?: string;
  parent_contact?: string;
  parent_address?: string;
}

export interface Child {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  education_level: string;
  education_level_display?: string;
  student_class_display?: string;
  stream_name?: string;
  stream_type?: string;
}

export interface CreateParentData {
  user_email: string;
  user_first_name: string;
  user_last_name: string;
  phone?: string;
  address?: string;
  student_ids?: number[];
}

export interface UpdateParentData {
  user_first_name?: string;
  user_last_name?: string;
  phone?: string;
  address?: string;
  student_ids?: number[];
}

class ParentService {
  // Get all parents
  async getParents(): Promise<Parent[]> {
    try {
      const response = await api.get('/api/parents/');
      return Array.isArray(response.results) ? response.results : response;
    } catch (error) {
      console.error('Error fetching parents:', error);
      return [];
    }
  }

  // Get a single parent by ID
  async getParent(id: number): Promise<Parent | null> {
    try {
      const response = await api.get(`/api/parents/${id}/`);
      return response;
    } catch (error) {
      console.error('Error fetching parent:', error);
      return null;
    }
  }

  // Create a new parent
  async createParent(data: CreateParentData): Promise<Parent> {
    try {
      const response = await api.post('/api/parents/', data);
      return response;
    } catch (error) {
      console.error('Error creating parent:', error);
      throw error;
    }
  }

  // Update a parent
  async updateParent(id: number, data: UpdateParentData): Promise<Parent> {
    try {
      const response = await api.put(`/api/parents/${id}/`, data);
      return response;
    } catch (error) {
      console.error('Error updating parent:', error);
      throw error;
    }
  }

  // Delete a parent
  async deleteParent(id: number): Promise<void> {
    try {
      await api.delete(`/api/parents/${id}/`);
    } catch (error) {
      console.error('Error deleting parent:', error);
      throw error;
    }
  }

  // Activate a parent
  async activateParent(id: number): Promise<void> {
    try {
      await api.post(`/api/parents/${id}/activate/`);
    } catch (error) {
      console.error('Error activating parent:', error);
      throw error;
    }
  }

  // Deactivate a parent
  async deactivateParent(id: number): Promise<void> {
    try {
      await api.post(`/api/parents/${id}/deactivate/`);
    } catch (error) {
      console.error('Error deactivating parent:', error);
      throw error;
    }
  }

  // Search parents
  async searchParents(query: string): Promise<Parent[]> {
    try {
      const response = await api.get(`/api/parents/search/?q=${encodeURIComponent(query)}`);
      return Array.isArray(response.results) ? response.results : response;
    } catch (error) {
      console.error('Error searching parents:', error);
      return [];
    }
  }

  // Add existing student to parent
  async addStudentToParent(parentId: number, studentId: number): Promise<void> {
    try {
      await api.post(`/api/parents/${parentId}/add-existing-student/`, {
        student_id: studentId
      });
    } catch (error) {
      console.error('Error adding student to parent:', error);
      throw error;
    }
  }

  // Get parent statistics
  async getParentStatistics(): Promise<any> {
    try {
      const response = await api.get('/api/parents/statistics/');
      return response;
    } catch (error) {
      console.error('Error fetching parent statistics:', error);
      return {};
    }
  }

  // ============================================================================
  // MISSING METHODS - Added from backend endpoints
  // ============================================================================

  /**
   * Get parent dashboard data
   * Shows attendance, results, and alerts for all children
   */
  async getParentDashboard(parentId?: number): Promise<{
    dashboard: Array<{
      student_id: number;
      student: string;
      attendance_percentage: number;
      average_score: number;
      recent_attendance: Array<{ date: string; status: string }>;
      recent_results: Array<{ subject: string; score: number; exam_date: string }>;
      alert: string | null;
    }>;
  }> {
    try {
      const params = parentId ? { parent_id: parentId } : undefined;
      const response = await api.get('/api/parents/dashboard/', params);
      return response;
    } catch (error) {
      console.error('Error fetching parent dashboard:', error);
      throw error;
    }
  }

  /**
   * Add a new student to a parent
   * Creates a new student and links them to the parent
   */
  async addStudent(
    parentId: number,
    data: {
      first_name: string;
      last_name: string;
      email: string;
      username?: string;
      date_of_birth: string;
      gender: 'M' | 'F' | 'O';
      education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
      student_class: number;
      registration_number?: string;
      address?: string;
      phone?: string;
    }
  ): Promise<{
    status: string;
    student: { id: number; name: string; email: string };
    student_password: string | null;
  }> {
    try {
      const response = await api.post(`/api/parents/${parentId}/add-student/`, data);
      return response;
    } catch (error) {
      console.error(`Error adding student to parent ${parentId}:`, error);
      throw error;
    }
  }

  /**
   * Get current user's parent profile
   * Use this when a parent user is logged in
   */
  async getCurrentParentProfile(): Promise<Parent | null> {
    try {
      // Get list of parents (backend should return only current user's profile for parents)
      const parents = await this.getParents();
      return parents.length > 0 ? parents[0] : null;
    } catch (error) {
      console.error('Error fetching current parent profile:', error);
      return null;
    }
  }

  /**
   * Get dashboard data for current logged-in parent
   */
  async getCurrentParentDashboard(): Promise<{
    dashboard: Array<{
      student_id: number;
      student: string;
      attendance_percentage: number;
      average_score: number;
      recent_attendance: Array<{ date: string; status: string }>;
      recent_results: Array<{ subject: string; score: number; exam_date: string }>;
      alert: string | null;
    }>;
  }> {
    return this.getParentDashboard(); // No parent ID means current user
  }

  /**
   * Get parent's children details
   * Fetches full student information for all children of a parent
   */
  async getParentChildren(parentId: number): Promise<Child[]> {
    try {
      const parent = await this.getParent(parentId);
      return parent?.students || [];
    } catch (error) {
      console.error(`Error fetching children for parent ${parentId}:`, error);
      return [];
    }
  }

  /**
   * Get summary statistics for a specific parent
   */
  async getParentSummary(parentId: number): Promise<{
    total_children: number;
    average_attendance: number;
    average_performance: number;
    children_with_alerts: number;
  }> {
    try {
      const dashboard = await this.getParentDashboard(parentId);
      const children = dashboard.dashboard;

      const totalChildren = children.length;
      const averageAttendance =
        totalChildren > 0
          ? children.reduce((sum, c) => sum + c.attendance_percentage, 0) / totalChildren
          : 0;
      const averagePerformance =
        totalChildren > 0
          ? children.reduce((sum, c) => sum + c.average_score, 0) / totalChildren
          : 0;
      const childrenWithAlerts = children.filter(c => c.alert).length;

      return {
        total_children: totalChildren,
        average_attendance: Math.round(averageAttendance * 100) / 100,
        average_performance: Math.round(averagePerformance * 100) / 100,
        children_with_alerts: childrenWithAlerts,
      };
    } catch (error) {
      console.error(`Error getting summary for parent ${parentId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk activate parents
   */
  async bulkActivateParents(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.activateParent(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk activating parents:', error);
      throw error;
    }
  }

  /**
   * Bulk deactivate parents
   */
  async bulkDeactivateParents(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.deactivateParent(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk deactivating parents:', error);
      throw error;
    }
  }
}

export default new ParentService();



