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

/**
 * Matches EducationLevel.level_type choices from Django model
 */
export type EducationLevelType =
  | 'NURSERY'
  | 'PRIMARY'
  | 'JUNIOR_SECONDARY'
  | 'SENIOR_SECONDARY';

/**
 * Gender choices from Django model: ('M', 'Male') | ('F', 'Female')
 * The model uses single-char values only.
 */
export type GenderType = 'M' | 'F';

// ---- Nested serializer shapes ----

export interface UserDetails {
  id: number;
  username: string;
  email: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  date_joined: string;
}

/**
 * Minimal representation of a related EducationLevel object
 * (as returned by a nested serializer).
 */
export interface EducationLevelDetail {
  id: number;
  name: string;
  code: string;
  level_type: EducationLevelType;
  order: number;
  is_active: boolean;
}

/**
 * Minimal representation of a related Class object
 * (as returned by a nested serializer).
 */
export interface ClassDetail {
  id: number;
  name: string;
  code: string;
  grade_number: number;
  order: number;
  education_level: EducationLevelDetail;
  default_capacity: number | null;
  is_active: boolean;
  description: string | null;
}

/**
 * Minimal representation of a related Section object
 * (as returned by a nested serializer).
 */
export interface SectionDetail {
  id: number;
  name: string;
  full_name: string;
  room_number: string | null;
  capacity: number | null;
  is_active: boolean;
}

/**
 * Minimal representation of a Stream (used for senior secondary students).
 */
export interface StreamDetail {
  id: number;
  name: string;
}

/**
 * Parent information attached to a student.
 */
export interface ParentInfo {
  id: number;
  full_name: string;
  email: string;
  phone: string;
}

// ---- Core Student interface ----

/**
 * Full Student object as returned by the API.
 * Field names and types mirror the Django Student model exactly.
 */
export interface Student {
  id: number;

  user: UserDetails; // ✅ FIXED

  full_name: string;
  name?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username?: string;
  email?: string;
  blood_group?: string;
  phone_number?: string;
  place_of_birth?: string;
  address?: string;
  payment_method?: string;
  medical_conditions?: string;
  special_requirements?: string;
  gender: GenderType;
  gender_display?: string;

  date_of_birth?: string;

  student_class: number | string | null;
  student_class_display?: string;
  student_class_detail?: any;  // ✅ Added: Contains id, name, etc.
  section_display?: string;
  class?: string;

  section?: number | string | null;
  section_id?: number;
  section_detail?: any;  // ✅ Added: Contains id, name, etc.

  stream: number | string | null;
  stream_name?: string | null;
  stream_type?: string | null;
  stream_detail?: any;  // ✅ Added: Contains id, name, etc.

  admission_date: string;
  registration_number?: string | null;

  profile_picture: string | null;
  parents?: ParentInfo[];
  parent_contact?: string | null;
  emergency_contact?: string | null;
  parent_email?: string | null;
  parent_count?: number;

  is_active: boolean;

  education_level: EducationLevelType | null;
  education_level_display?: string;

  classroom: string;
  age?: number;

  // optional flags
  is_nursery_student?: boolean;
  is_primary_student?: boolean;
  is_secondary_student?: boolean;
  is_junior_secondary_student?: boolean;
  is_senior_secondary_student?: boolean;

  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// STUDENT FORM / MUTATION TYPES
// ============================================================================

export interface CreateStudentData {
  // User fields
  first_name: string;
  last_name: string;
  middle_name?: string;
  email: string;

  // Student fields
  date_of_birth: string; // YYYY-MM-DD
  gender: GenderType;

  /** FK ID to Class */
  student_class: number | string;
  /** FK ID to Section — optional */
  section?: number | null;
  /** FK ID to Stream — optional, for senior secondary */
  stream?: number | string | null;

  admission_date?: string; // YYYY-MM-DD
  registration_number?: string;

  parent_contact?: string;
  parent_email?: string;
  emergency_contact?: string;

  address?: string;
  place_of_birth?: string;
  blood_group?: string;
  phone_number?: string;
  payment_method?: string;
  medical_conditions?: string;
  special_requirements?: string;
  profile_picture?: string;
}

export interface UpdateStudentData extends Partial<CreateStudentData> {}

// ============================================================================
// LIST / FILTER TYPES
// ============================================================================

export interface StudentListItem {
  id: number;
  full_name: string;
  username?: string;
  registration_number: string | null;
  education_level: EducationLevelType | null;
  education_level_display?: string;
  student_class: number | string | null;
  student_class_display?: string;
  classroom: string;
  section: number | string | null;
  section_display?: string;
  gender: GenderType;
  is_active: boolean;
  profile_picture: string | null;
}

export interface StudentFilters {
  user?: number;
  education_level?: EducationLevelType;
  /** Filter by Class FK id */
  student_class?: number | string;
  /** Filter by Section FK id */
  section?: number | string;
  gender?: GenderType;
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
    performance: { average_score: number; label: string };
    attendance: { rate: number; present: number; total: number; label: string };
    subjects: { count: number; label: string };
    schedule: { classes_today: number; label: string };
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
    registration_number: string | null;
    classroom?: string;
  };
  contact_info: {
    parent_contact?: string | null;
    emergency_contact?: string | null;
  };
  medical_info: {
    medical_conditions?: string | null;
    special_requirements?: string | null;
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
  errors?: Array<{ student_id: number; username: string; error: string }>;
  error_count?: number;
}

export interface TokensListResponse {
  tokens: ResultToken[];
  total: number;
  statistics: { total: number; active: number; expired: number; used: number };
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
  // --------------------------------------------------------------------------
  // BASIC CRUD
  // --------------------------------------------------------------------------

  async getStudents(params?: StudentFilters): Promise<Student[]> {
    try {
      const response = await api.get('/api/students/students/', params);
      console.log('Fetched students:', response || response.results);
      return response.results || response;
      
    } catch (error) {
      console.error('Error fetching students:', error);
      throw error;
    }
    
  }

  async toggleStudentStatus(id: number): Promise<Student> {
  try {
    return await api.patch(`/api/students/students/${id}/toggle-active/`, {});
  } catch (error) {
    console.error(`Error toggling student ${id} status:`, error);
    throw error;
  }
}

  async getStudent(id: number): Promise<Student> {
    try {
      
      return await api.get(`/api/students/students/${id}/`);
    } catch (error) {
      console.error(`Error fetching student ${id}:`, error);
      throw error;
    }
  }

  async createStudent(data: CreateStudentData): Promise<{
    student: Student;
    student_username?: string;
    student_password?: string;
    parent_password?: string;
  }> {
    try {
      return await api.post('/api/students/students/', data);
    } catch (error) {
      console.error('Error creating student:', error);
      throw error;
    }
  }

  async updateStudent(id: number, data: UpdateStudentData): Promise<Student> {
    try {
      return await api.patch(`/api/students/students/${id}/`, data);
    } catch (error) {
      console.error(`Error updating student ${id}:`, error);
      throw error;
    }
  }

  async deleteStudent(id: number): Promise<void> {
    try {
      await api.delete(`/api/students/students/${id}/`);
    } catch (error) {
      console.error(`Error deleting student ${id}:`, error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // SCHEDULE
  // --------------------------------------------------------------------------

  async getMySchedule(): Promise<StudentSchedule> {
    return api.get('/api/students/students/my-schedule/');
  }

  async getMyWeeklySchedule(): Promise<WeeklySchedule> {
    return api.get('/api/students/students/my-weekly-schedule/');
  }

  async getMyCurrentPeriod(): Promise<CurrentPeriod> {
    return api.get('/api/students/students/my-current-period/');
  }

  async getStudentSchedule(studentId?: number): Promise<StudentSchedule> {
    if (!studentId) return this.getMySchedule();

    return api.get(`/api/students/students/${studentId}/schedule/`);
  }

  async getStudentWeeklySchedule(studentId: number): Promise<WeeklySchedule> {
    return api.get(`/api/students/students/${studentId}/weekly_schedule/`);
  }

  async getStudentDailySchedule(studentId: number, date?: string): Promise<DailySchedule> {
    const params = date ? { date } : undefined;
    return api.get(`/api/students/students/${studentId}/daily_schedule/`, params);
  }

  /** @deprecated use getMyWeeklySchedule */
  async getWeeklySchedule(): Promise<WeeklySchedule> {
    return this.getMyWeeklySchedule();
  }

  /** @deprecated use getMySchedule */
  async getSchedule(): Promise<StudentSchedule> {
    return this.getMySchedule();
  }

  async getCurrentPeriod(): Promise<CurrentPeriod> {
    return this.getMyCurrentPeriod();
  }

  // --------------------------------------------------------------------------
  // DASHBOARD & PROFILE
  // --------------------------------------------------------------------------

  async getDashboard(): Promise<StudentDashboard> {
  const response = await api.get('/api/students/students/dashboard/');
  return response.data;
}
  /** @deprecated use getDashboard */
  async getDashboardData(): Promise<StudentDashboard> {
    return this.getDashboard();
  }

  async getProfile(): Promise<StudentProfile> {
    return api.get('/api/students/students/profile/');
  }

  // --------------------------------------------------------------------------
  // RESULT TOKENS
  // --------------------------------------------------------------------------

  async generateResultTokens(
    schoolTermId: number,
    daysUntilExpiry?: number,
  ): Promise<GenerateTokensResponse> {
    return api.post('/api/students/generate-result-tokens/', {
      school_term_id: schoolTermId,
      days_until_expiry: daysUntilExpiry,
    });
  }

  async getMyResultToken(): Promise<{
    has_token: boolean;
    token_data?: ResultToken;
    error?: string;
    current_term?: string;
    message?: string;
  }> {
    return api.get('/api/students/get-student-result-token/');
  }

  async verifyResultToken(token: string): Promise<TokenVerificationResponse> {
    return api.post('/api/students/verify-result-token/', { token });
  }

  async getAllResultTokens(schoolTermId: number) {
  return api.get('/api/students/get-all-result-tokens/', {
    school_term_id: schoolTermId,  // ✅ flat object, buildUrl handles it
  });
}

  async deleteExpiredTokens(): Promise<{
    success: boolean;
    message: string;
    deleted_count: number;
    breakdown: Array<{ school_term__name: string; count: number }>;
  }> {
    return api.delete('/api/students/delete-expired-tokens/');
  }

  async deleteAllTokensForTerm(schoolTermId: number): Promise<{
    success: boolean;
    message: string;
    deleted_count: number;
    school_term: string;
  }> {
    return api.delete('/api/students/delete-all-tokens-for-term/', {
      data: { school_term_id: schoolTermId },
    });
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  async hasValidResultToken(): Promise<boolean> {
    try {
      const response = await this.getMyResultToken();
      return response.has_token;
    } catch {
      return false;
    }
  }

  async getStudentByUserId(userId: number): Promise<Student> {
    const response = await this.getStudents({ user: userId });
    console.log(`Searching for student with user ID ${userId}:`, response);
    if (Array.isArray(response) && response.length > 0) return response[0];
    throw new Error('Student not found');
  }

  async getStudentsByEducationLevel(educationLevel: EducationLevelType): Promise<Student[]> {
    return this.getStudents({ education_level: educationLevel });
  }

  async getStudentsByClass(studentClass: number | string): Promise<Student[]> {
    return this.getStudents({ student_class: studentClass });
  }

  async getActiveStudents(): Promise<Student[]> {
    return this.getStudents({ is_active: true });
  }

  async searchStudents(query: string): Promise<Student[]> {
    return this.getStudents({ search: query });
  }
}

export { StudentService };
export const studentService = new StudentService();
export default studentService;