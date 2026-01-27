/**
 * Student Service
 *
 * Manages student operations including:
 * - Student CRUD operations
 * - Student schedules (daily, weekly, current period)
 * - Student dashboard and profile
 * - Result token management
 * - Attendance and academic data
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Student {
  id: number;
  user: number;
  user_details?: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    is_active: boolean;
    date_joined: string;
  };
  full_name: string;
  registration_number: string;
  date_of_birth?: string;
  gender: 'M' | 'F' | 'O';
  gender_display?: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  education_level_display?: string;
  student_class: string;
  student_class_display?: string;
  classroom?: string;
  admission_date?: string;
  parent_contact?: string;
  emergency_contact?: string;
  address?: string;
  medical_conditions?: string;
  special_requirements?: string;
  is_active: boolean;
  profile_picture_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStudentData {
  first_name: string;
  last_name: string;
  middle_name?: string;
  email: string;
  date_of_birth?: string;
  gender: 'M' | 'F' | 'O';
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  student_class: string;
  classroom?: string;
  admission_date?: string;
  parent_contact?: string;
  parent_email?: string;
  emergency_contact?: string;
  address?: string;
  medical_conditions?: string;
  special_requirements?: string;
}

export interface UpdateStudentData extends Partial<CreateStudentData> {}

export interface StudentListItem {
  id: number;
  full_name: string;
  registration_number: string;
  education_level: string;
  education_level_display: string;
  student_class: string;
  student_class_display: string;
  classroom?: string;
  is_active: boolean;
}

export interface StudentFilters {
  user?: number;
  education_level?: string;
  student_class?: string;
  gender?: string;
  is_active?: boolean;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

// ============================================================================
// SCHEDULE TYPES
// ============================================================================

export interface ScheduleEntry {
  id: number;
  subject_name: string;
  teacher_name: string;
  classroom_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  period_number?: number;
  is_active: boolean;
}

export interface ScheduleByDay {
  monday: ScheduleEntry[];
  tuesday: ScheduleEntry[];
  wednesday: ScheduleEntry[];
  thursday: ScheduleEntry[];
  friday: ScheduleEntry[];
  saturday: ScheduleEntry[];
  sunday: ScheduleEntry[];
}

export interface StudentSchedule {
  student_info: {
    id: number;
    name: string;
    class: string;
    classroom?: string;
    education_level?: string;
  };
  schedule: ScheduleEntry[];
  schedule_by_day: ScheduleByDay;
  total_periods: number;
  statistics?: {
    total_periods: number;
    subjects_count: number;
    teachers_count: number;
  };
}

export interface WeeklySchedule {
  student_id: number;
  student_name: string;
  classroom_name?: string;
  education_level: string;
  academic_year: string;
  term: string;
  monday: ScheduleEntry[];
  tuesday: ScheduleEntry[];
  wednesday: ScheduleEntry[];
  thursday: ScheduleEntry[];
  friday: ScheduleEntry[];
  saturday: ScheduleEntry[];
  sunday: ScheduleEntry[];
  total_periods_per_week: number;
  total_subjects: number;
  total_teachers: number;
  average_daily_periods: number;
}

export interface DailySchedule {
  student_id: number;
  student_name: string;
  classroom_name?: string;
  date: string;
  day_of_week: string;
  periods: ScheduleEntry[];
  total_periods: number;
  current_period?: ScheduleEntry;
  next_period?: ScheduleEntry;
}

export interface CurrentPeriod {
  student_name: string;
  current_time: string;
  current_day: string;
  current_period?: {
    subject: string;
    teacher: string;
    start_time: string;
    end_time: string;
    classroom: string;
    is_current: boolean;
  };
  next_period?: {
    subject: string;
    teacher: string;
    start_time: string;
    end_time: string;
    classroom: string;
    is_next: boolean;
  };
  message: string;
}

// ============================================================================
// DASHBOARD & PROFILE TYPES
// ============================================================================

export interface StudentDashboard {
  student_info: {
    name: string;
    class: string;
    education_level: string;
    registration_number: string;
    admission_date?: string;
  };
  statistics: {
    performance: {
      average_score: number;
      label: string;
    };
    attendance: {
      rate: number;
      present: number;
      total: number;
      label: string;
    };
    subjects: {
      count: number;
      label: string;
    };
    schedule: {
      classes_today: number;
      label: string;
    };
  };
  recent_activities: Array<{
    type: 'result' | 'attendance';
    title: string;
    description: string;
    date: string;
    time_ago: string;
  }>;
  announcements: Array<{
    id: number;
    title: string;
    content: string;
    type: string;
    is_pinned: boolean;
    created_at: string;
    time_ago: string;
  }>;
  upcoming_events: Array<{
    id: number;
    title: string;
    subtitle?: string;
    description?: string;
    type: string;
    start_date?: string;
    end_date?: string;
    days_until?: number;
  }>;
  academic_calendar: Array<{
    id: number;
    title: string;
    description?: string;
    type: string;
    start_date: string;
    end_date?: string;
    location?: string;
    days_until: number;
  }>;
  quick_stats: {
    total_results: number;
    this_term_results: number;
    attendance_this_month: number;
  };
}

export interface StudentProfile extends Student {
  user_info: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    is_active: boolean;
    date_joined: string;
  };
  academic_info: {
    class: string;
    education_level: string;
    admission_date?: string;
    registration_number: string;
    classroom?: string;
  };
  contact_info: {
    parent_contact?: string;
    emergency_contact?: string;
  };
  medical_info: {
    medical_conditions?: string;
    special_requirements?: string;
  };
}

// ============================================================================
// RESULT TOKEN TYPES
// ============================================================================

export interface ResultToken {
  id: number;
  student: number;
  student_name?: string;
  student_class?: string;
  username?: string;
  token: string;
  school_term: number;
  school_term_name?: string;
  expires_at: string;
  is_used: boolean;
  used_at?: string;
  is_valid?: boolean;
  status?: 'Active' | 'Expired' | 'Used';
  created_at: string;
}

export interface GenerateTokensResponse {
  success: boolean;
  message: string;
  school_term: string;
  academic_session: string;
  tokens_created: number;
  tokens_updated: number;
  total_students: number;
  expires_at: string;
  days_until_expiry: number;
  expiry_date: string;
  errors?: Array<{
    student_id: number;
    username: string;
    error: string;
  }>;
  error_count?: number;
}

export interface TokensListResponse {
  tokens: ResultToken[];
  total: number;
  statistics: {
    total: number;
    active: number;
    expired: number;
    used: number;
  };
  school_term: string;
  academic_session: string;
}

export interface TokenVerificationResponse {
  is_valid: boolean;
  message: string;
  school_term?: string;
  expires_at?: string;
  student_id?: number;
  student_name?: string;
  education_level?: string;
  current_class?: string;
  error?: string;
}

// ============================================================================
// STUDENT SERVICE
// ============================================================================

class StudentService {
  // ============================================================================
  // BASIC CRUD OPERATIONS
  // ============================================================================

  /**
   * Get all students (filtered by params)
   */
  async getStudents(params?: StudentFilters): Promise<Student[]> {
    try {
      const response = await api.get('/api/students/students/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching students:', error);
      throw error;
    }
  }

  /**
   * Get a single student by ID
   */
  async getStudent(id: number): Promise<Student> {
    try {
      const response = await api.get(`/api/students/students/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching student ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new student
   */
  async createStudent(data: CreateStudentData): Promise<{
    student: Student;
    student_username?: string;
    student_password?: string;
    parent_password?: string;
  }> {
    try {
      const response = await api.post('/api/students/students/', data);
      return response;
    } catch (error) {
      console.error('Error creating student:', error);
      throw error;
    }
  }

  /**
   * Update a student
   */
  async updateStudent(id: number, data: UpdateStudentData): Promise<Student> {
    try {
      const response = await api.patch(`/api/students/students/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating student ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a student
   */
  async deleteStudent(id: number): Promise<void> {
    try {
      await api.delete(`/api/students/students/${id}/`);
    } catch (error) {
      console.error(`Error deleting student ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // SCHEDULE OPERATIONS
  // ============================================================================

  /**
   * Get current user's schedule
   */
  async getMySchedule(): Promise<StudentSchedule> {
    try {
      const response = await api.get('/api/students/students/my-schedule/');
      return response;
    } catch (error) {
      console.error('Error fetching my schedule:', error);
      throw error;
    }
  }

  /**
   * Get current user's weekly schedule
   */
  async getMyWeeklySchedule(): Promise<WeeklySchedule> {
    try {
      const response = await api.get('/api/students/students/my-weekly-schedule/');
      return response;
    } catch (error) {
      console.error('Error fetching my weekly schedule:', error);
      throw error;
    }
  }

  /**
   * Get current user's current period
   */
  async getMyCurrentPeriod(): Promise<CurrentPeriod> {
    try {
      const response = await api.get('/api/students/students/my-current-period/');
      return response;
    } catch (error) {
      console.error('Error fetching my current period:', error);
      throw error;
    }
  }

  /**
   * Get schedule for a specific student (or current student if no ID provided)
   */
  async getStudentSchedule(studentId?: number, filters?: any): Promise<StudentSchedule> {
    try {
      // If no studentId provided, use the current student's schedule
      if (!studentId) {
        return this.getMySchedule();
      }
      const response = await api.get(`/api/students/students/${studentId}/schedule/`);
      return response;
    } catch (error) {
      console.error(`Error fetching schedule for student ${studentId}:`, error);
      throw error;
    }
  }

  /**
   * Get weekly schedule for a specific student
   */
  async getStudentWeeklySchedule(studentId: number): Promise<WeeklySchedule> {
    try {
      const response = await api.get(`/api/students/students/${studentId}/weekly_schedule/`);
      return response;
    } catch (error) {
      console.error(`Error fetching weekly schedule for student ${studentId}:`, error);
      throw error;
    }
  }

  /**
   * Get daily schedule for a specific student
   */
  async getStudentDailySchedule(studentId: number, date?: string): Promise<DailySchedule> {
    try {
      const params = date ? { date } : undefined;
      const response = await api.get(`/api/students/students/${studentId}/daily_schedule/`, params);
      return response;
    } catch (error) {
      console.error(`Error fetching daily schedule for student ${studentId}:`, error);
      throw error;
    }
  }

  /**
   * Get student schedule view (legacy endpoint)
   */
  async getStudentScheduleView(): Promise<StudentSchedule> {
    try {
      const response = await api.get('/api/students/student-schedule/');
      return response;
    } catch (error) {
      console.error('Error fetching student schedule view:', error);
      throw error;
    }
  }

  /**
   * Alias for getMyWeeklySchedule (for compatibility)
   */
  async getWeeklySchedule(): Promise<WeeklySchedule> {
    return this.getMyWeeklySchedule();
  }

  /**
   * Alias for getMySchedule (for compatibility)
   */
  async getSchedule(): Promise<StudentSchedule> {
    return this.getMySchedule();
  }

  /**
   * Get current period for logged-in student
   */
  async getCurrentPeriod(): Promise<CurrentPeriod> {
    return this.getMyCurrentPeriod();
  }

  // ============================================================================
  // DASHBOARD & PROFILE OPERATIONS
  // ============================================================================

  /**
   * Get comprehensive dashboard data for logged-in student
   */
  async getDashboard(): Promise<StudentDashboard> {
    try {
      const response = await api.get('/api/students/students/dashboard/');
      return response;
    } catch (error) {
      console.error('Error fetching student dashboard:', error);
      throw error;
    }
  }

  /**
   * Alias for getDashboard (for compatibility)
   */
  async getDashboardData(): Promise<StudentDashboard> {
    return this.getDashboard();
  }

  /**
   * Get detailed profile information for logged-in student
   */
  async getProfile(): Promise<StudentProfile> {
    try {
      const response = await api.get('/api/students/students/profile/');
      return response;
    } catch (error) {
      console.error('Error fetching student profile:', error);
      throw error;
    }
  }

  // ============================================================================
  // RESULT TOKEN OPERATIONS
  // ============================================================================

  /**
   * Generate result tokens for all active students (Admin only)
   */
  async generateResultTokens(schoolTermId: number, daysUntilExpiry?: number): Promise<GenerateTokensResponse> {
    try {
      const response = await api.post('/api/students/generate-result-tokens/', {
        school_term_id: schoolTermId,
        days_until_expiry: daysUntilExpiry,
      });
      return response;
    } catch (error) {
      console.error('Error generating result tokens:', error);
      throw error;
    }
  }

  /**
   * Get result token for current student
   */
  async getMyResultToken(): Promise<{
    has_token: boolean;
    token_data?: ResultToken;
    error?: string;
    current_term?: string;
    message?: string;
  }> {
    try {
      const response = await api.get('/api/students/get-student-result-token/');
      return response;
    } catch (error) {
      console.error('Error fetching my result token:', error);
      throw error;
    }
  }

  /**
   * Verify result token
   */
  async verifyResultToken(token: string): Promise<TokenVerificationResponse> {
    try {
      const response = await api.post('/api/students/verify-result-token/', {
        token,
      });
      return response;
    } catch (error) {
      console.error('Error verifying result token:', error);
      throw error;
    }
  }

  /**
   * Get all result tokens for a school term (Admin only)
   */
  async getAllResultTokens(schoolTermId: number): Promise<TokensListResponse> {
    try {
      const response = await api.get('/api/students/get-all-result-tokens/', {
        params: { school_term_id: schoolTermId },
      });
      return response;
    } catch (error) {
      console.error('Error fetching all result tokens:', error);
      throw error;
    }
  }

  /**
   * Delete expired tokens (Admin only)
   */
  async deleteExpiredTokens(): Promise<{
    success: boolean;
    message: string;
    deleted_count: number;
    breakdown: Array<{ school_term__name: string; count: number }>;
  }> {
    try {
      const response = await api.delete('/api/students/delete-expired-tokens/');
      return response;
    } catch (error) {
      console.error('Error deleting expired tokens:', error);
      throw error;
    }
  }

  /**
   * Delete all tokens for a specific term (Admin only)
   */
  async deleteAllTokensForTerm(schoolTermId: number): Promise<{
    success: boolean;
    message: string;
    deleted_count: number;
    school_term: string;
  }> {
    try {
      const response = await api.delete('/api/students/delete-all-tokens-for-term/', {
        data: { school_term_id: schoolTermId },
      });
      return response;
    } catch (error) {
      console.error('Error deleting tokens for term:', error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if student has valid result token
   */
  async hasValidResultToken(): Promise<boolean> {
    try {
      const response = await this.getMyResultToken();
      return response.has_token;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get student by user ID
   */
  async getStudentByUserId(userId: number): Promise<Student> {
    try {
      const response = await this.getStudents({ user: userId });
      if (Array.isArray(response) && response.length > 0) {
        return response[0];
      }
      throw new Error('Student not found');
    } catch (error) {
      console.error(`Error fetching student for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get students by education level
   */
  async getStudentsByEducationLevel(educationLevel: string): Promise<Student[]> {
    return this.getStudents({ education_level: educationLevel });
  }

  /**
   * Get students by class
   */
  async getStudentsByClass(studentClass: string): Promise<Student[]> {
    return this.getStudents({ student_class: studentClass });
  }

  /**
   * Get active students only
   */
  async getActiveStudents(): Promise<Student[]> {
    return this.getStudents({ is_active: true });
  }

  /**
   * Search students
   */
  async searchStudents(query: string): Promise<Student[]> {
    return this.getStudents({ search: query });
  }
}

// Export the class for those who need it
export { StudentService };

// Export the singleton instance
export const studentService = new StudentService();
export default studentService;
