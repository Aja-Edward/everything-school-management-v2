import api from '@/services/api';

export interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string;
  phone_number?: string;
  employee_id: string;
  level: 'nursery' | 'primary' | 'junior_secondary' | 'senior_secondary' | 'secondary';
  is_active: boolean;
  assigned_subjects: Array<{
    id: number;
    name: string;
  }>;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_core: boolean;
  is_active: boolean;
}

// Updated to use the new ClassroomTeacherAssignment model
export interface ClassroomTeacherAssignment {
  id: number;
  teacher: number; // teacher ID
  subject: number; // subject ID
  classroom: number; // classroom ID
  classroom_name?: string;
  // Teacher details as separate fields
  teacher_name?: string;
  teacher_email?: string;
  teacher_phone?: string;
  teacher_employee_id?: string;
  teacher_first_name?: string;
  teacher_last_name?: string;
  // Subject details as separate fields
  subject_name?: string;
  subject_code?: string;
  is_primary_teacher: boolean;
  periods_per_week: number;
  assigned_date: string;
  is_active: boolean;
}

// Legacy interface for backward compatibility (deprecated)
export interface TeacherAssignment {
  id: number;
  teacher: Teacher;
  subject: Subject;
  assigned_date: string;
  is_active: boolean;
}

export interface Classroom {
  id: number;
  name: string;
  section: number;
  section_name: string;
  grade_level_name: string;
  education_level: string;
  academic_session: number;
  academic_session_name: string;
  term: number;
  term_name: string;
  class_teacher: number | null;
  class_teacher_name: string;
  class_teacher_phone?: string;
  class_teacher_employee_id?: string;
  room_number: string;
  max_capacity: number;
  current_enrollment: number;
  available_spots: number;
  enrollment_percentage: number;
  stream?: string;
  stream_name?: string;
  is_full: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Updated to use new assignment model
  teacher_assignments?: ClassroomTeacherAssignment[];
  // Legacy field for backward compatibility
  old_teacher_assignments?: TeacherAssignment[];
}

export interface AcademicSession {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  description?: string;
}

export interface Term {
  id: number;
  name: string;
  academic_session: number;
  academic_session_name?: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
}

export interface ClassroomStats {
  total_classrooms: number;
  active_classrooms: number;
  total_enrollment: number;
  average_enrollment: number;
  by_education_level: {
    nursery: number;
    primary: number;
    secondary: number;
  };
}

export interface CreateClassroomData {
  name: string;
  section: number;
  academic_session: number;
  term: number;
  class_teacher?: number;
  room_number?: string;
  max_capacity: number;
}


export interface UpdateClassroomData extends Partial<CreateClassroomData> {
  is_active?: boolean;
}

export interface AssignTeacherData {
  teacher_id: number;
  subject_id: number;
  is_primary_teacher?: boolean;
  periods_per_week?: number;
}

export interface RemoveTeacherAssignmentData {
  teacher_id: number;
  subject_id: number;
}

// New interface for enhanced teacher assignment
export interface CreateTeacherAssignmentData {
  classroom_id: number;
  teacher_id: number;
  subject_id: number;
  is_primary_teacher?: boolean;
  periods_per_week?: number;
}

export interface UpdateTeacherAssignmentData {
  is_primary_teacher?: boolean;
  periods_per_week?: number;
  is_active?: boolean;
}

class ClassroomService {
  // Get all classrooms with optional filters
async getClassrooms(params?: {
  search?: string;
  education_level?: string;
  is_active?: boolean;
  academic_session?: number;
  ordering?: string;
  page?: number;
  page_size?: number;
}) {
  try {
    console.log('📡 Fetching classrooms with params:', params);
    
    const response = await api.get('/api/classrooms/classrooms/', params);
    
    
    // 🔍 DEBUG: Log the raw response
      console.log('📡 Raw API Response:', {
        type: typeof response,
        isArray: Array.isArray(response),
        keys: Object.keys(response || {}),
        data: response
      });
    
    // Check different response structures
    if (Array.isArray(response)) {
        console.log('✅ Response is array, length:', response.length);
        return response;
      } else if (response?.data) {
        console.log('✅ Response has .data property');
        if (Array.isArray(response.data)) {
          console.log('✅ Response.data is array, length:', response.data.length);
          return response.data;
        } else if (response.data?.results) {
          console.log('✅ Response.data.results exists, length:', response.data.results.length);
          return response.data;
        }
        return response.data;
      } else if (response?.results) {
        console.log('✅ Response has .results property, length:', response.results.length);
        return response;
      }
      
      console.warn('⚠️ Unexpected response structure:', response);
      return response;
    
   } catch (error: any) {
      console.error('❌ Error fetching classrooms:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url
      });
      throw error;
    }
  }

  // Get a single classroom by ID
  async getClassroom(id: number) {
    const response = await api.get(`/api/classrooms/classrooms/${id}/`);
    return response;
  }
  // Create a new classroom
  async createClassroom(data: CreateClassroomData) {
  try {
    console.log("📤 Creating classroom with data:", JSON.stringify(data, null, 2));
    const response = await api.post('/api/classrooms/classrooms/', data);
    console.log("✅ Classroom created successfully:", response);
    return response;
  } catch (error: any) {
    console.error("❌ Failed to create classroom:", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
}

  // Update a classroom
  async updateClassroom(id: number, data: UpdateClassroomData) {
    console.log("📤 Creating classroom with data:", data);
    const response = await api.patch(`/api/classrooms/classrooms/${id}/`, data);
    return response;
  }

  // Delete a classroom
  async deleteClassroom(id: number): Promise<{ message: string; status: string }> {
    const response = await api.delete(`/api/classrooms/classrooms/${id}/`);
    return response;
  }

  // Get classroom statistics
  async getClassroomStats() {
    const response = await api.get('/api/classrooms/classrooms/statistics/');
    return response;
  }

  // Get students in a classroom
  async getClassroomStudents(classroomId: number) {
    const response = await api.get(`/api/classrooms/classrooms/${classroomId}/students/`);
    return response;
  }

  // Get teachers in a classroom
  async getClassroomTeachers(classroomId: number) {
    const response = await api.get(`/api/classrooms/classrooms/${classroomId}/teachers/`);
    return response;
  }

  // Assign teacher to classroom (using new ClassroomTeacherAssignment model)
  async assignTeacherToClassroom(classroomId: number, data: AssignTeacherData) {
    const response = await api.post(`/api/classrooms/classrooms/${classroomId}/assign_teacher/`, data);
    return response;
  }

  // Remove teacher assignment from classroom
  async removeTeacherFromClassroom(classroomId: number, data: RemoveTeacherAssignmentData) {
    const response = await api.post(`/api/classrooms/classrooms/${classroomId}/remove_teacher/`, data);
    return response;
  }

  // New methods for enhanced teacher assignment management
  async createTeacherAssignment(data: CreateTeacherAssignmentData) {
    const response = await api.post('/api/classrooms/teacher-assignments/', data);
    return response;
  }

  async updateTeacherAssignment(assignmentId: number, data: UpdateTeacherAssignmentData) {
    const response = await api.patch(`/api/classrooms/teacher-assignments/${assignmentId}/`, data);
    return response;
  }

  async deleteTeacherAssignment(assignmentId: number) {
    const response = await api.delete(`/api/classrooms/teacher-assignments/${assignmentId}/`);
    return response;
  }

  async getTeacherAssignments(classroomId?: number, teacherId?: number) {
    const params: any = {};
    if (classroomId) params.classroom = classroomId;
    if (teacherId) params.teacher = teacherId;
    
    const response = await api.get('/api/classrooms/teacher-assignments/', params);
    return response;
  }

  // Get available teachers for assignment
  async getAvailableTeachers(classroomId: number, subjectId?: number) {
    const params = subjectId ? { subject_id: subjectId } : {};
    const response = await api.get(`/api/classrooms/classrooms/${classroomId}/available-teachers/`, params);
    return response;
  }

  // Get available subjects for classroom
  async getAvailableSubjects(classroomId: number) {
    const response = await api.get(`/api/classrooms/classrooms/${classroomId}/available-subjects/`);
    return response;
  }

  // Get all teachers (for assignment dropdowns)
  async getAllTeachers() {
    const response = await api.get('/api/teachers/teachers/');
    return response;
  }

  // Get all subjects (for assignment dropdowns)
  async getAllSubjects() {
    try {
      console.log('🔍 [ClassroomService] Fetching all subjects...');
      const response = await api.get('/api/subjects/');
      console.log('🔍 [ClassroomService] Subjects response:', response);
      return response;
    } catch (error) {
      console.error('🔍 [ClassroomService] Error fetching subjects:', error);
      // Return fallback subjects structure
      return {
        results: [
          { id: 1, name: 'English Studies', code: 'ENG', education_levels: ['PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'], is_active: true },
          { id: 2, name: 'Mathematics', code: 'MATH', education_levels: ['PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'], is_active: true },
          { id: 3, name: 'Basic Science', code: 'SCI', education_levels: ['PRIMARY', 'JUNIOR_SECONDARY'], is_active: true },
          { id: 4, name: 'Social Studies', code: 'SOC', education_levels: ['PRIMARY', 'JUNIOR_SECONDARY'], is_active: true },
          { id: 5, name: 'Physics', code: 'PHY', education_levels: ['SENIOR_SECONDARY'], is_active: true },
          { id: 6, name: 'Chemistry', code: 'CHEM', education_levels: ['SENIOR_SECONDARY'], is_active: true },
          { id: 7, name: 'Biology', code: 'BIO', education_levels: ['SENIOR_SECONDARY'], is_active: true },
        ]
      };
    }
  }

  // Get grade levels
  async getGradeLevels() {
    const response = await api.get('/api/classrooms/grades/');
    return response;
  }

  // Get sections for a grade level
  async getSections(gradeLevelId: number) {
    const response = await api.get(`/api/classrooms/grades/${gradeLevelId}/sections/`);
    return response;
  }

  // ✅ UPDATED: Get academic sessions (previously academic years)
  async getAcademicYears() {
    const response = await api.get('/api/classrooms/academic-sessions/');
    return response;
  }

  // ✅ NEW: Get current academic session
  async getCurrentAcademicSession() {
    const response = await api.get('/api/classrooms/academic-sessions/current/');
    return response;
  }

  // ✅ NEW: Set current academic session
  async setCurrentAcademicSession(sessionId: number) {
    const response = await api.post(`/api/classrooms/academic-sessions/${sessionId}/set-current/`, {});
    return response;
  }

  // ✅ NEW: Get academic session statistics
  async getAcademicSessionStats(sessionId: number) {
    const response = await api.get(`/api/classrooms/academic-sessions/${sessionId}/statistics/`);
    return response;
  }

  // ✅ UPDATED: Get terms for an academic session (with enhanced filtering)
  async getTerms(academicSessionId?: number) {
    if (academicSessionId) {
      // Use the specific endpoint that returns terms for a session
      const response = await api.get(`/api/classrooms/academic-sessions/${academicSessionId}/terms/`);
      return response;
    } else {
      // Get all terms with optional filtering
      const response = await api.get('/api/classrooms/terms/');
      return response;
    }
  }

  // ✅ NEW: Get terms by session using query parameter
  async getTermsBySession(sessionId: number) {
    const response = await api.get('/api/classrooms/terms/by-session/', {
      params: { session_id: sessionId }
    });
    return response;
  }

  // ✅ NEW: Get current term
  async getCurrentTerm() {
    const response = await api.get('/api/classrooms/terms/current/');
    return response;
  }

  // ✅ NEW: Set current term
  async setCurrentTerm(termId: number) {
    const response = await api.post(`/api/classrooms/terms/${termId}/set-current/`, {});
    return response;
  }

  // ✅ NEW: Get subjects for a specific term
  async getTermSubjects(termId: number) {
    const response = await api.get(`/api/classrooms/terms/${termId}/subjects/`);
    return response;
  }

  
  // Get detailed student information
  async getStudentDetails(studentId: number) {
    const response = await api.get(`/api/students/students/${studentId}/`);
    return response;
  }

  // ============================================================================
  // STREAM MANAGEMENT
  // ============================================================================

  async getStreams(params?: { section?: number; type?: string }) {
    const response = await api.get('/api/classrooms/streams/', params);
    return response;
  }

  async getStream(id: number) {
    const response = await api.get(`/api/classrooms/streams/${id}/`);
    return response;
  }

  async createStream(data: { name: string; section: number; type: string; description?: string }) {
    const response = await api.post('/api/classrooms/streams/', data);
    return response;
  }

  async updateStream(id: number, data: Partial<{ name: string; type: string; description?: string; is_active: boolean }>) {
    const response = await api.patch(`/api/classrooms/streams/${id}/`, data);
    return response;
  }

  async deleteStream(id: number) {
    const response = await api.delete(`/api/classrooms/streams/${id}/`);
    return response;
  }

  async getStreamsByType(params?: { type?: string }) {
    const response = await api.get('/api/classrooms/streams/by-type/', params);
    return response;
  }

  // ============================================================================
  // ENHANCED SECTION MANAGEMENT
  // ============================================================================

  async createSection(data: { name: string; grade_level: number; description?: string }) {
    const response = await api.post('/api/classrooms/sections/', data);
    return response;
  }

  async updateSection(id: number, data: Partial<{ name: string; description?: string; is_active: boolean }>) {
    const response = await api.patch(`/api/classrooms/sections/${id}/`, data);
    return response;
  }

  async deleteSection(id: number) {
    const response = await api.delete(`/api/classrooms/sections/${id}/`);
    return response;
  }

  async getSectionClassrooms(sectionId: number) {
    const response = await api.get(`/api/classrooms/sections/${sectionId}/classrooms/`);
    return response;
  }

  // ============================================================================
  // ENHANCED GRADE LEVEL MANAGEMENT
  // ============================================================================

  async createGradeLevel(data: {
    name: string;
    education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
    order: number;
    description?: string;
  }) {
    const response = await api.post('/api/classrooms/grades/', data);
    return response;
  }

  async updateGradeLevel(id: number, data: Partial<{
    name: string;
    order: number;
    description?: string;
    is_active: boolean;
  }>) {
    const response = await api.patch(`/api/classrooms/grades/${id}/`, data);
    return response;
  }

  async deleteGradeLevel(id: number) {
    const response = await api.delete(`/api/classrooms/grades/${id}/`);
    return response;
  }

  async getGradeClassrooms(gradeId: number) {
    const response = await api.get(`/api/classrooms/grades/${gradeId}/classrooms/`);
    return response;
  }

  async getGradeStudents(gradeId: number) {
    const response = await api.get(`/api/classrooms/grades/${gradeId}/students/`);
    return response;
  }

  async getNurseryGrades() {
    const response = await api.get('/api/classrooms/grades/nursery/');
    return response;
  }

  async getPrimaryGrades() {
    const response = await api.get('/api/classrooms/grades/primary/');
    return response;
  }

  async getJuniorSecondaryGrades() {
    const response = await api.get('/api/classrooms/grades/junior-secondary/');
    return response;
  }

  async getSeniorSecondaryGrades() {
    const response = await api.get('/api/classrooms/grades/senior-secondary/');
    return response;
  }

  // ============================================================================
  // STUDENT ENROLLMENT MANAGEMENT
  // ============================================================================

  async getStudentEnrollments(params?: {
    student?: number;
    classroom?: number;
    academic_session?: number;
    is_active?: boolean;
  }) {
    const response = await api.get('/api/classrooms/student-enrollments/', params);
    return response;
  }

  async getStudentEnrollment(id: number) {
    const response = await api.get(`/api/classrooms/student-enrollments/${id}/`);
    return response;
  }

  async createStudentEnrollment(data: {
    student: number;
    classroom: number;
    enrollment_date?: string;
  }) {
    const response = await api.post('/api/classrooms/student-enrollments/', data);
    return response;
  }

  async updateStudentEnrollment(id: number, data: Partial<{
    enrollment_date?: string;
    withdrawal_date?: string;
    is_active: boolean;
  }>) {
    const response = await api.patch(`/api/classrooms/student-enrollments/${id}/`, data);
    return response;
  }

  async deleteStudentEnrollment(id: number) {
    const response = await api.delete(`/api/classrooms/student-enrollments/${id}/`);
    return response;
  }

  async getEnrollmentsByAcademicYear(academicYearId: number) {
    const response = await api.get(`/api/classrooms/student-enrollments/by-academic-year/${academicYearId}/`);
    return response;
  }

  async getEnrollmentsByGrade(gradeId: number) {
    const response = await api.get(`/api/classrooms/student-enrollments/by-grade/${gradeId}/`);
    return response;
  }

  async getEnrollmentStatistics() {
    const response = await api.get('/api/classrooms/student-enrollments/statistics/');
    return response;
  }

  // ============================================================================
  // CLASS SCHEDULE MANAGEMENT
  // ============================================================================

  async getClassSchedules(params?: {
    classroom?: number;
    teacher?: number;
    subject?: number;
    day_of_week?: string;
  }) {
    const response = await api.get('/api/classrooms/schedules/', params);
    return response;
  }

  async getClassSchedule(id: number) {
    const response = await api.get(`/api/classrooms/schedules/${id}/`);
    return response;
  }

  async createClassSchedule(data: {
    classroom: number;
    subject: number;
    teacher: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    period_number?: number;
  }) {
    const response = await api.post('/api/classrooms/schedules/', data);
    return response;
  }

  async updateClassSchedule(id: number, data: Partial<{
    day_of_week: string;
    start_time: string;
    end_time: string;
    period_number?: number;
    is_active: boolean;
  }>) {
    const response = await api.patch(`/api/classrooms/schedules/${id}/`, data);
    return response;
  }

  async deleteClassSchedule(id: number) {
    const response = await api.delete(`/api/classrooms/schedules/${id}/`);
    return response;
  }

  async getSchedulesByClassroom(classroomId: number) {
    const response = await api.get(`/api/classrooms/schedules/by-classroom/${classroomId}/`);
    return response;
  }

  async getSchedulesByTeacher(teacherId: number) {
    const response = await api.get(`/api/classrooms/schedules/by-teacher/${teacherId}/`);
    return response;
  }

  async getSchedulesBySubject(subjectId: number) {
    const response = await api.get(`/api/classrooms/schedules/by-subject/${subjectId}/`);
    return response;
  }

  async getScheduleConflicts(params?: { classroom?: number; teacher?: number; date?: string }) {
    const response = await api.get('/api/classrooms/schedules/conflicts/', params);
    return response;
  }

  async getDailySchedule(date: string, params?: { classroom?: number; teacher?: number }) {
    const response = await api.get(`/api/classrooms/schedules/daily/${date}/`, params);
    return response;
  }

  async getWeeklySchedule(params?: { classroom?: number; teacher?: number; week_start?: string }) {
    const response = await api.get('/api/classrooms/schedules/weekly/', params);
    return response;
  }

  // ============================================================================
  // CLASSROOM ADDITIONAL OPERATIONS
  // ============================================================================

  async getClassroomSchedule(classroomId: number) {
    const response = await api.get(`/api/classrooms/classrooms/${classroomId}/schedule/`);
    return response;
  }

  async getClassroomSubjects(classroomId: number) {
    const response = await api.get(`/api/classrooms/classrooms/${classroomId}/subjects/`);
    return response;
  }

  async enrollStudent(classroomId: number, data: { student_id: number }) {
    const response = await api.post(`/api/classrooms/classrooms/${classroomId}/enroll_student/`, data);
    return response;
  }

  async unenrollStudent(classroomId: number, data: { student_id: number }) {
    const response = await api.post(`/api/classrooms/classrooms/${classroomId}/unenroll_student/`, data);
    return response;
  }

  // ============================================================================
  // ENHANCED SUBJECT OPERATIONS
  // ============================================================================

  async getSubjectsByCategory(params?: { category?: string }) {
    const response = await api.get('/api/classrooms/subjects/by-category/', params);
    return response;
  }

  async getSubjectsByEducationLevel(params?: { education_level?: string }) {
    const response = await api.get('/api/classrooms/subjects/by-education-level/', params);
    return response;
  }

  async getSubjectsForGrade(params?: { grade_id?: number }) {
    const response = await api.get('/api/classrooms/subjects/for-grade/', params);
    return response;
  }

  async getNurserySubjects() {
    const response = await api.get('/api/classrooms/subjects/nursery/');
    return response;
  }

  async getSeniorSecondarySubjects() {
    const response = await api.get('/api/classrooms/subjects/senior-secondary/');
    return response;
  }

  async getCrossCuttingSubjects() {
    const response = await api.get('/api/classrooms/subjects/cross-cutting/');
    return response;
  }

  async getSubjectPrerequisites(subjectId: number) {
    const response = await api.get(`/api/classrooms/subjects/${subjectId}/prerequisites/`);
    return response;
  }

  async getSubjectEducationLevels(subjectId: number) {
    const response = await api.get(`/api/classrooms/subjects/${subjectId}/education-levels/`);
    return response;
  }

  async checkSubjectAvailability(subjectId: number, params?: { classroom_id?: number }) {
    const response = await api.get(`/api/classrooms/subjects/${subjectId}/check-availability/`, params);
    return response;
  }

  async getSubjectStatistics() {
    const response = await api.get('/api/classrooms/subjects/statistics/');
    return response;
  }

  // ============================================================================
  // ENHANCED STUDENT OPERATIONS
  // ============================================================================

  async getStudentCurrentClass(studentId: number) {
    const response = await api.get(`/api/classrooms/students/${studentId}/current-class/`);
    return response;
  }

  async getStudentEnrollmentHistory(studentId: number) {
    const response = await api.get(`/api/classrooms/students/${studentId}/enrollment-history/`);
    return response;
  }

  async getStudentSchedule(studentId: number) {
    const response = await api.get(`/api/classrooms/students/${studentId}/schedule/`);
    return response;
  }

  async getStudentSubjects(studentId: number) {
    const response = await api.get(`/api/classrooms/students/${studentId}/subjects/`);
    return response;
  }

  // ============================================================================
  // ENHANCED TEACHER OPERATIONS
  // ============================================================================

  async getTeacherClasses(teacherId: number) {
    const response = await api.get(`/api/classrooms/teachers/${teacherId}/classes/`);
    return response;
  }

  async getTeacherSchedule(teacherId: number) {
    const response = await api.get(`/api/classrooms/teachers/${teacherId}/schedule/`);
    return response;
  }

  async getTeacherSubjects(teacherId: number) {
    const response = await api.get(`/api/classrooms/teachers/${teacherId}/subjects/`);
    return response;
  }

  async getTeacherWorkload(teacherId: number) {
    const response = await api.get(`/api/classrooms/teachers/${teacherId}/workload/`);
    return response;
  }

  // ============================================================================
  // ENHANCED TEACHER ASSIGNMENT OPERATIONS
  // ============================================================================

  async getAssignmentsByAcademicYear(academicYearId: number) {
    const response = await api.get(`/api/classrooms/teacher-assignments/by-academic-year/${academicYearId}/`);
    return response;
  }

  async getAssignmentsBySubject(subjectId: number) {
    const response = await api.get(`/api/classrooms/teacher-assignments/by-subject/${subjectId}/`);
    return response;
  }

  async getTeacherWorkloadAnalysis() {
    const response = await api.get('/api/classrooms/teacher-assignments/workload-analysis/');
    return response;
  }

  // ============================================================================
  // SUBJECT ANALYTICS & MANAGEMENT
  // ============================================================================

  async getSubjectAnalytics(params?: { subject_id?: number; academic_session?: number }) {
    const response = await api.get('/api/classrooms/analytics/subjects/', params);
    return response;
  }

  async getSubjectManagement(params?: { is_active?: boolean }) {
    const response = await api.get('/api/classrooms/management/subjects/', params);
    return response;
  }

  // ============================================================================
  // UTILITY OPERATIONS
  // ============================================================================

  async clearCaches() {
    const response = await api.get('/api/classrooms/clear-caches/');
    return response;
  }

  async healthCheck() {
    const response = await api.get('/api/classrooms/health/');
    return response;
  }

  async getSystemInfo() {
    const response = await api.get('/api/classrooms/system-info/');
    return response;
  }
}

export const classroomService = new ClassroomService();
export default classroomService;