import api from './api';

// Exam Types
export interface Exam {
  id: number;
  title: string;
  code: string;
  description?: string;
  subject: any;
  subject_name?: string;
  subject_code?: string;
  grade_level: any;
  grade_level_name?: string;
  section?: number | null;
  stream?: any;
  stream_name?: string;
  stream_type?: string;
  teacher?: any;
  teacher_name?: string;
  exam_schedule?: number;
  exam_type: string;
  exam_type_display: string;
  difficulty_level: string;
  difficulty_level_display: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_marks: number;
  pass_marks?: number;
  pass_percentage: number;
  venue?: string;
  max_students?: number;
  instructions?: string;
  materials_allowed?: string;
  materials_provided?: string;
  status: string;
  status_display: string;
  is_practical: boolean;
  requires_computer: boolean;
  is_online: boolean;
  
  // ADD THESE NEW PROPERTIES:
  is_pending_approval?: boolean;
  is_approved?: boolean;
  is_rejected?: boolean;
  approval_notes?: string;
  rejection_reason?: string;
  approved_at?: string | null;
  registered_students_count?: number;
  
  created_at: string;
  updated_at: string;
  
  // Question data
  objective_questions?: any[];
  theory_questions?: any[];
  practical_questions?: any[];
  custom_sections?: any[];
  objective_instructions?: string;
  theory_instructions?: string;
  practical_instructions?: string;
  // Per-exam print settings
  print_settings?: PrintSettings;
}

export interface PrintSettings {
  font_family: 'times_new_roman' | 'arial' | 'georgia' | 'calibri';
  font_size: number;          // 10–14
  line_height: number;        // 1.0 | 1.5 | 2.0
  option_layout: 'auto' | 'inline' | 'stacked';
  column_layout: 1 | 2;
  margin: 'normal' | 'narrow' | 'wide';
  show_marks: boolean;
  show_instructions: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  font_family: 'times_new_roman',
  font_size: 12,
  line_height: 1.5,
  option_layout: 'auto',
  column_layout: 1,
  margin: 'normal',
  show_marks: true,
  show_instructions: true,
};

export interface ExamCreateData {
  title: string;
  code?: string;
  description?: string;
  subject: number;
  grade_level: number;
  section?: number | null; // Made optional since we removed section selection
  stream?: number;
  teacher?: number;
  exam_schedule?: number;
  exam_type: string | number;       // accepts PK (number) or legacy string code
  difficulty_level: string | number; // accepts PK (number) or legacy string code
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes?: number;
  total_marks: number;
  pass_marks?: number;
  venue?: string;
  max_students?: number;
  instructions?: string;
  materials_allowed?: string;
  materials_provided?: string;
  status: string | number;   // accepts PK (number) or legacy string code
  is_practical: boolean;
  requires_computer: boolean;
  is_online: boolean;
  // Question data
  objective_questions?: any[];
  theory_questions?: any[];
  practical_questions?: any[];
  custom_sections?: any[];
  objective_instructions?: string;
  theory_instructions?: string;
  practical_instructions?: string;
  print_settings?: PrintSettings;
}

export interface ExamUpdateData {
  title?: string;
  code?: string;
  description?: string;
  subject?: number;
  grade_level?: number;
  section?: number | null;
  stream?: number;
  teacher?: number;
  exam_schedule?: number;
  exam_type?: string | number;
  difficulty_level?: string | number;
  exam_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  total_marks?: number;
  // Question data
  objective_questions?: any[];
  theory_questions?: any[];
  practical_questions?: any[];
  custom_sections?: any[];
  objective_instructions?: string;
  theory_instructions?: string;
  practical_instructions?: string;
  pass_marks?: number;
  venue?: string;
  max_students?: number;
  instructions?: string;
  materials_allowed?: string;
  materials_provided?: string;
  status?: string | number;
  is_practical?: boolean;
  requires_computer?: boolean;
  is_online?: boolean;
  print_settings?: PrintSettings;
}

export interface ExamFilters {
  search?: string;
  exam_type?: string;
  status?: string;
  subject?: number;
  grade_level?: number;
  section?: number;
  stream?: number;
  teacher?: number;
  exam_schedule?: number;
  difficulty_level?: string;
  is_practical?: boolean;
  requires_computer?: boolean;
  is_online?: boolean;
  exam_date?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  total_marks_min?: number;
  total_marks_max?: number;
  duration_minutes_min?: number;
  duration_minutes_max?: number;
  venue?: string;
  term?: string;
  session_year?: string;
  ordering?: string;
}

export interface ExamSchedule {
  id: number;
  name: string;
  description?: string;
  term: string;
  session_year: string;
  start_date: string;
  end_date: string;
  registration_start?: string;
  registration_end?: string;
  results_publication_date?: string;
  is_active: boolean;
  allow_late_registration: boolean;
  is_registration_open: boolean;
  is_ongoing: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExamStatistics {
  id: number;
  exam: number;
  total_students: number;
  registered_students: number;
  completed_students: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  pass_rate: number;
  fail_rate: number;
  grade_distribution: Record<string, number>;
  calculated_at: string;
}

export interface ExamRegistration {
  id: number;
  exam: number;
  student: number;
  student_name: string;
  registration_date: string;
  status: string;
  special_needs?: string;
  accommodations?: string;
  notes?: string;
}

export class ExamService {
  private static baseUrl = '/api/exams';

  /**
   * Get all exams with optional filtering
   */
  static async getExams(filters: ExamFilters = {}): Promise<Exam[]> {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
      
      const queryString = params.toString();
      const endpoint = `${this.baseUrl}/exams/${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(endpoint);
      return response.results || response || [];
    } catch (error) {
      console.error('❌ ExamService: Error fetching exams:', error);
      throw error;
    }
  }

  /**
   * Get a single exam by ID
   */
  static async getExam(id: number): Promise<Exam> {
    try {
      const response = await api.get(`${this.baseUrl}/exams/${id}/`);
      return response;
    } catch (error) {
      console.error('Error fetching exam:', error);
      throw error;
    }
  }

  /**
   * Create a new exam
   */
  static async createExam(data: ExamCreateData): Promise<Exam> {
    try {
      const response = await api.post(`${this.baseUrl}/exams/`, data);
      return response;
    } catch (error) {
      console.error('Error creating exam:', error);
      throw error;
    }
  }

  /**
   * Update an existing exam
   */
  static async updateExam(id: number, data: ExamUpdateData): Promise<Exam> {
    try {
      const response = await api.put(`${this.baseUrl}/exams/${id}/`, data);
      return response;
    } catch (error) {
      console.error('Error updating exam:', error);
      throw error;
    }
  }

  /**
   * Delete an exam
   */
  static async deleteExam(id: number): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/exams/${id}/`);
    } catch (error) {
      console.error('Error deleting exam:', error);
      throw error;
    }
  }

  /**
   * Get exam schedules
   */
  static async getExamSchedules(): Promise<ExamSchedule[]> {
    try {
      const response = await api.get(`${this.baseUrl}/schedules/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching exam schedules:', error);
      throw error;
    }
  }

  /**
   * Set a schedule as the default schedule
   */
  static async setDefaultSchedule(scheduleId: number): Promise<{ message: string; schedule: ExamSchedule }> {
    try {
      const response = await api.post(`${this.baseUrl}/schedules/${scheduleId}/set_default/`, {});
      return response;
    } catch (error) {
      console.error('Error setting default schedule:', error);
      throw error;
    }
  }

  /**
   * Toggle schedule active status
   */
  static async toggleScheduleActive(scheduleId: number): Promise<{ message: string; is_active: boolean }> {
    try {
      const response = await api.post(`${this.baseUrl}/schedules/${scheduleId}/toggle_active/`, {});
      return response;
    } catch (error) {
      console.error('Error toggling schedule active status:', error);
      throw error;
    }
  }

  /**
   * Get exam statistics
   */
  static async getExamStatistics(examId: number): Promise<ExamStatistics> {
    try {
      const response = await api.get(`${this.baseUrl}/exams/${examId}/statistics/`);
      return response;
    } catch (error) {
      console.error('Error fetching exam statistics:', error);
      throw error;
    }
  }

  /**
   * Get exam registrations
   */
  static async getExamRegistrations(examId: number): Promise<ExamRegistration[]> {
    try {
      const response = await api.get(`${this.baseUrl}/exams/${examId}/registrations/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching exam registrations:', error);
      throw error;
    }
  }

  /**
   * Bulk register students for an exam
   */
  static async bulkRegisterStudents(examId: number, studentIds: number[]): Promise<{
    message: string;
    created_registrations: number[];
    errors: string[];
  }> {
    try {
      const response = await api.post(`${this.baseUrl}/registrations/bulk_register/`, {
        exam_id: examId,
        student_ids: studentIds,
      });
      return response;
    } catch (error) {
      console.error('Error bulk registering students:', error);
      throw error;
    }
  }

  /**
   * Get registrations by student
   */
  static async getRegistrationsByStudent(studentId: number): Promise<ExamRegistration[]> {
    try {
      const response = await api.get(`${this.baseUrl}/registrations/by_student/`, {
        params: { student_id: studentId }
      });
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching registrations by student:', error);
      throw error;
    }
  }

  /**
   * Start an exam
   */
  static async startExam(examId: number): Promise<void> {
    try {
      await api.post(`${this.baseUrl}/exams/${examId}/start/`, {});
    } catch (error) {
      console.error('Error starting exam:', error);
      throw error;
    }
  }

  /**
   * End an exam
   */
  static async endExam(examId: number): Promise<void> {
    try {
      await api.post(`${this.baseUrl}/exams/${examId}/end/`, {});
    } catch (error) {
      console.error('Error ending exam:', error);
      throw error;
    }
  }

  /**
   * Cancel an exam
   */
  static async cancelExam(examId: number, reason?: string): Promise<void> {
    try {
      await api.post(`${this.baseUrl}/exams/${examId}/cancel/`, reason ? { reason } : {});
    } catch (error) {
      console.error('Error cancelling exam:', error);
      throw error;
    }
  }

  /**
   * Postpone an exam
   */
  static async postponeExam(examId: number, payload: { new_date: string; new_start_time?: string; new_end_time?: string; reason?: string }): Promise<void> {
    try {
      await api.post(`${this.baseUrl}/exams/${examId}/postpone/`, payload);
    } catch (error) {
      console.error('Error postponing exam:', error);
      throw error;
    }
  }

  /**
   * Get upcoming exams
   */
  static async getUpcomingExams(): Promise<Exam[]> {
    try {
      const response = await api.get(`${this.baseUrl}/upcoming/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching upcoming exams:', error);
      throw error;
    }
  }

  /**
   * Get completed exams
   */
  static async getCompletedExams(): Promise<Exam[]> {
    try {
      const response = await api.get(`${this.baseUrl}/completed/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching completed exams:', error);
      throw error;
    }
  }

  /**
   * Get ongoing exams
   */
  static async getOngoingExams(): Promise<Exam[]> {
    try {
      const response = await api.get(`${this.baseUrl}/ongoing/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching ongoing exams:', error);
      throw error;
    }
  }

  /**
   * Get exams by schedule
   */
  static async getExamsBySchedule(scheduleId: number): Promise<Exam[]> {
    try {
      const response = await api.get(`${this.baseUrl}/by-schedule/${scheduleId}/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching exams by schedule:', error);
      throw error;
    }
  }

  /**
   * Get exams by subject
   */
  static async getExamsBySubject(subjectId: number): Promise<Exam[]> {
    try {
      const response = await api.get(`${this.baseUrl}/by-subject/${subjectId}/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching exams by subject:', error);
      throw error;
    }
  }

  /**
   * Get exams by grade level
   */
  static async getExamsByGrade(gradeId: number): Promise<Exam[]> {
    try {
      const response = await api.get(`${this.baseUrl}/by-grade/${gradeId}/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching exams by grade:', error);
      throw error;
    }
  }

  /**
   * Get exams by teacher
   */
  static async getExamsByTeacher(teacherId: number): Promise<Exam[]> {
    try {
      const response = await api.get(`${this.baseUrl}/by-teacher/${teacherId}/`);
      return response.results || response || [];
    } catch (error) {
      console.error('Error fetching exams by teacher:', error);
      throw error;
    }
  }

  /**
   * Approve an exam
   */
  static async approveExam(examId: number, notes: string = ''): Promise<any> {
    try {
      const response = await api.post(`${this.baseUrl}/exams/${examId}/approve/`, { notes });
      return response;
    } catch (error) {
      console.error('Error approving exam:', error);
      throw error;
    }
  }

  /**
   * Reject an exam
   */
  static async rejectExam(examId: number, reason: string = ''): Promise<any> {
    try {
      const response = await api.post(`${this.baseUrl}/exams/${examId}/reject/`, { reason });
      return response;
    } catch (error) {
      console.error('Error rejecting exam:', error);
      throw error;
    }
  }

  /**
   * Submit exam for approval
   */
  static async submitForApproval(examId: number): Promise<any> {
    try {
      const response = await api.post(`${this.baseUrl}/exams/${examId}/submit_for_approval/`, {});
      return response;
    } catch (error) {
      console.error('Error submitting exam for approval:', error);
      throw error;
    }
  }

  /** Fetch ExamType records from the backend (returns tenant-specific PKs). */
  static async fetchExamTypes(): Promise<{ id: number; name: string; code: string }[]> {
    try {
      const res = await api.get(`${this.baseUrl}/exam-types/`);
      return Array.isArray(res) ? res : (res as any)?.results ?? [];
    } catch { return []; }
  }

  /** Fetch DifficultyLevel records from the backend. */
  static async fetchDifficultyLevels(): Promise<{ id: number; name: string; code: string }[]> {
    try {
      const res = await api.get(`${this.baseUrl}/difficulty-levels/`);
      return Array.isArray(res) ? res : (res as any)?.results ?? [];
    } catch { return []; }
  }

  /** Fetch ExamStatus records from the backend. */
  static async fetchExamStatuses(): Promise<{ id: number; name: string; code: string; is_initial: boolean }[]> {
    try {
      const res = await api.get(`${this.baseUrl}/exam-statuses/`);
      return Array.isArray(res) ? res : (res as any)?.results ?? [];
    } catch { return []; }
  }

  /**
   * Get exam types for dropdown (static fallback labels — use fetchExamTypes() for PKs)
   */
  static getExamTypes() {
    return [
      { value: 'quiz', label: 'Quiz' },
      { value: 'test', label: 'Class Test' },
      { value: 'mid_term', label: 'Mid-Term Examination' },
      { value: 'final_exam', label: 'Final Examination' },
      { value: 'practical', label: 'Practical Examination' },
      { value: 'oral_exam', label: 'Oral Examination' },
    ];
  }

  /**
   * Get exam statuses for dropdown
   */
  static getExamStatuses() {
    return [
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'postponed', label: 'Postponed' },
    ];
  }

  /**
   * Get difficulty levels for dropdown
   */
  static getDifficultyLevels() {
    return [
      { value: 'easy', label: 'Easy' },
      { value: 'medium', label: 'Medium' },
      { value: 'hard', label: 'Hard' },
      { value: 'mixed', label: 'Mixed' },
    ];
  }

  /**
   * Get status color for UI
   */
  static getStatusColor(status: string): string {
    const colors = {
      scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
      in_progress: 'bg-orange-100 text-orange-800 border-orange-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
      postponed: 'bg-purple-100 text-purple-800 border-purple-200',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200';
  }

  // ============================================================================
  // ADVANCED REPORTS & EXPORTS (MISSING INTEGRATIONS)
  // ============================================================================

  /**
   * Export exams to CSV
   * Returns a CSV file with all exams matching the filters
   */
  static async exportExamsCSV(filters: ExamFilters = {}): Promise<Blob> {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      const queryString = params.toString();
      const url = `${this.baseUrl}/exams/export_csv/${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting exams to CSV:', error);
      throw error;
    }
  }

  /**
   * Get grade sheet for an exam
   * Returns formatted grade sheet with all student marks
   */
  static async getGradeSheet(params?: {
    exam_id?: number;
    schedule_id?: number;
    grade_level?: number;
    subject?: number;
  }): Promise<any> {
    try {
      const response = await api.get(`${this.baseUrl}/exams/grade_sheet/`, params);
      return response;
    } catch (error) {
      console.error('Error fetching grade sheet:', error);
      throw error;
    }
  }

  /**
   * Export exam timetable/schedule to PDF or CSV
   */
  static async exportExamTimetable(scheduleId: number, format: 'pdf' | 'csv' = 'pdf'): Promise<Blob> {
    try {
      const url = `${this.baseUrl}/export/exam-timetable/${scheduleId}/?format=${format}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting exam timetable:', error);
      throw error;
    }
  }

  /**
   * Export exam registrations for a specific exam
   */
  static async exportRegistrations(examId: number, format: 'csv' | 'xlsx' = 'csv'): Promise<Blob> {
    try {
      const url = `${this.baseUrl}/export/registrations/${examId}/?format=${format}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting registrations:', error);
      throw error;
    }
  }

  /**
   * Export exam results
   */
  static async exportResults(examId: number, format: 'csv' | 'xlsx' | 'pdf' = 'csv'): Promise<Blob> {
    try {
      const url = `${this.baseUrl}/export/results/${examId}/?format=${format}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting results:', error);
      throw error;
    }
  }

  /**
   * Mark attendance for registered students during exam
   */
  static async markAttendance(data: {
    registration_ids: number[];
    status: 'present' | 'absent' | 'late' | 'excused';
    notes?: string;
  }): Promise<{ message: string; updated_count: number }> {
    try {
      const response = await api.post(`${this.baseUrl}/registrations/mark_attendance/`, data);
      return response;
    } catch (error) {
      console.error('Error marking attendance:', error);
      throw error;
    }
  }

  /**
   * Get attendance report for an exam
   */
  static async getAttendanceReport(examId: number): Promise<{
    exam: Exam;
    total_registered: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendance_percentage: number;
    registrations: ExamRegistration[];
  }> {
    try {
      const response = await api.get(`${this.baseUrl}/exams/${examId}/attendance_report/`);
      return response;
    } catch (error) {
      console.error('Error fetching attendance report:', error);
      throw error;
    }
  }

  /**
   * Get performance summary report
   * Includes statistics across multiple exams
   */
  static async getPerformanceSummary(params?: {
    schedule_id?: number;
    subject?: number;
    grade_level?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    total_exams: number;
    total_students: number;
    average_score: number;
    highest_score: number;
    lowest_score: number;
    pass_rate: number;
    grade_distribution: Record<string, number>;
    performance_by_subject: any[];
    performance_by_grade: any[];
  }> {
    try {
      const response = await api.get(`${this.baseUrl}/reports/performance-summary/`, params);
      return response;
    } catch (error) {
      console.error('Error fetching performance summary:', error);
      throw error;
    }
  }

  /**
   * Get grade distribution analysis
   */
  static async getGradeDistribution(examId?: number, scheduleId?: number): Promise<{
    exam_id?: number;
    schedule_id?: number;
    total_students: number;
    grade_distribution: Record<string, number>;
    grade_percentages: Record<string, number>;
    average_grade: string;
  }> {
    try {
      const params: any = {};
      if (examId) params.exam_id = examId;
      if (scheduleId) params.schedule_id = scheduleId;

      const response = await api.get(`${this.baseUrl}/reports/grade-distribution/`, params);
      return response;
    } catch (error) {
      console.error('Error fetching grade distribution:', error);
      throw error;
    }
  }
}

