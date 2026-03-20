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

  /** FK to CustomUser — the user's primary key */
  user: number;

  /** Expanded user details (from nested serializer) */
  user_details?: UserDetails;

  // ---- Computed / annotated fields from serializer ----
  /** Derived from user.full_name */
  full_name: string;
  /** Derived from user.username (used as registration number display) */
  username?: string;

  // ---- Model fields ----

  /** Single-char gender: 'M' | 'F' */
  gender: GenderType;
  /** Human-readable gender label */
  gender_display?: string;

  date_of_birth: string; // ISO date string: YYYY-MM-DD

  /**
   * FK to Class — may be returned as a string name, numeric ID,
   * or nested object depending on serializer depth.
   * Use student_class_detail for the full object.
   */
  student_class: number | string | null;
  /** Human-readable class name */
  student_class_display?: string;
  /** Full nested Class object (if serializer uses depth > 0) */
  student_class_detail?: ClassDetail | null;

  /**
   * FK to Section — nullable.
   * Use section_detail for the full object.
   */
  section: number | string | null;
  /** Human-readable section name */
  section_display?: string;
  /** Full nested Section object */
  section_detail?: SectionDetail | null;

  /** FK to Stream — nullable, only for senior secondary students */
  stream: number | string | null;
  stream_detail?: StreamDetail | null;

  /** auto_now_add field */
  admission_date: string; // ISO date string: YYYY-MM-DD

  /** Unique registration number (may be null until assigned) */
  registration_number: string | null;

  /** Cloudinary URL */
  profile_picture: string | null;

  parent_contact: string | null;
  emergency_contact: string | null;
  medical_conditions: string | null;
  special_requirements: string | null;
  blood_group: string | null;
  place_of_birth: string | null;
  address: string | null;
  phone_number: string | null;
  payment_method: string | null;

  is_active: boolean;

  // ---- Computed @property fields (serializer must expose these) ----

  /**
   * @property — derived from student_class.education_level.level_type
   * Returns null if student_class is not assigned.
   */
  education_level: EducationLevelType | null;
  /** Human-readable education level name */
  education_level_display?: string;

  /**
   * @property — returns section.full_name if section exists,
   * else student_class.name, else "Not Assigned"
   */
  classroom: string;

  /** @property — calculated from date_of_birth */
  age?: number;

  // ---- Convenience boolean @property fields ----
  is_nursery_student?: boolean;
  is_primary_student?: boolean;
  is_secondary_student?: boolean;
  is_junior_secondary_student?: boolean;
  is_senior_secondary_student?: boolean;

  // ---- Related objects ----
  parents?: ParentInfo[];

  // ---- Timestamps (if returned by serializer) ----
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
  student_class: number;
  /** FK ID to Section — optional */
  section?: number | null;
  /** FK ID to Stream — optional, for senior secondary */
  stream?: number | null;

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
      return response.results || response;
    } catch (error) {
      console.error('Error fetching students:', error);
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
    return api.get('/api/students/students/dashboard/');
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

  async getAllResultTokens(schoolTermId: number): Promise<TokensListResponse> {
    return api.get('/api/students/get-all-result-tokens/', {
      params: { school_term_id: schoolTermId },
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