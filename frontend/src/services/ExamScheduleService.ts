import api from './api';

export interface ExamSchedule {
  id?: number;
  name: string;
  description: string;
  academic_session: number;
  term: number;
  start_date: string;
  end_date: string;
  registration_start?: string;
  registration_end?: string;
  results_publication_date?: string;
  is_active: boolean;
  allow_late_registration: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AcademicSession {
  id: number;
  name: string;
}

export interface Term {
  id: number;
  name: string;
}

class ExamScheduleService {
  // Get all exam schedules
  static async getExamSchedules(): Promise<ExamSchedule[]> {
    try {
      const response = await api.get('exams/schedules/');
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Error fetching exam schedules:', error);
      throw error;
    }
  }

  // Get a single exam schedule
  static async getExamSchedule(id: number): Promise<ExamSchedule> {
    try {
      const response = await api.get(`exams/schedules/${id}/`);
      return response;
    } catch (error) {
      console.error('Error fetching exam schedule:', error);
      throw error;
    }
  }

  // Create a new exam schedule
  static async createExamSchedule(schedule: Omit<ExamSchedule, 'id'>): Promise<ExamSchedule> {
    try {
      const response = await api.post('exams/schedules/', schedule);
      return response;
    } catch (error) {
      console.error('Error creating exam schedule:', error);
      throw error;
    }
  }

  // Update an exam schedule
  static async updateExamSchedule(id: number, schedule: Partial<ExamSchedule>): Promise<ExamSchedule> {
    try {
      const response = await api.put(`exams/schedules/${id}/`, schedule);
      return response;
    } catch (error) {
      console.error('Error updating exam schedule:', error);
      throw error;
    }
  }

  // Delete an exam schedule
  static async deleteExamSchedule(id: number): Promise<void> {
    try {
      await api.delete(`exams/schedules/${id}/`);
    } catch (error) {
      console.error('Error deleting exam schedule:', error);
      throw error;
    }
  }

  // Set an exam schedule as default
  static async setDefaultSchedule(id: number): Promise<void> {
    try {
      await api.post(`exams/schedules/${id}/set-default/`, {});
    } catch (error) {
      console.error('Error setting default schedule:', error);
      throw error;
    }
  }

  // Get academic sessions
  static async getAcademicSessions(): Promise<AcademicSession[]> {
    try {
      const response = await api.get('academics/sessions/');
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Error fetching academic sessions:', error);
      throw error;
    }
  }

  // Get terms
  static async getTerms(): Promise<Term[]> {
    try {
      const response = await api.get('academics/terms/');
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Error fetching terms:', error);
      throw error;
    }
  }
}

export default ExamScheduleService;






