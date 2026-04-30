import api from '@/services/api';
import type {
  EducationLevelType, 
  TransferTeacherData, 
  TransferTeacherResponse,
  TransferStudentData,
  TransferStudentResponse,
  Classroom,
  BulkCapacityResult,
  GradeLevel,
  Section,
  AcademicSession,
  Term,
  CreateClassroomData,
  AssignTeacherData,
  RemoveTeacherAssignmentData,
  CreateTeacherAssignmentData,
  UpdateTeacherAssignmentData,
  ClassroomStats,
  AddCoTeacherData,
  RemoveCoTeacherData,
} from '@/types/classroomtypes'

export interface UpdateClassroomData extends Partial<CreateClassroomData> {
  is_active?: boolean;
}
// ============================================================================
// SERVICE CLASS
//
// RULE: Every HTTP call uses `api.*` (the shared axios wrapper).
// api already injects Authorization headers, resolves the base URL,
// and normalises error responses. Raw `fetch` is never used here.
// ============================================================================
class ClassroomService {

  // ── Pure helpers (no network) ─────────────────────────────────────────────

  getEnrollment(c: Classroom): number {
    return c.current_enrollment ?? c.enrollment_count ?? c.student_count ?? 0;
  }

  getIsFull(c: Classroom): boolean {
    return c.is_full ?? this.getEnrollment(c) >= c.max_capacity;
  }

  getAvailableSpots(c: Classroom): number {
    return c.available_spots ?? Math.max(0, c.max_capacity - this.getEnrollment(c));
  }

  // ============================================================================
  // CLASSROOM CRUD
  // ============================================================================

  async getClassrooms(): Promise<Classroom[]> {
    const res = await api.get('/api/classrooms/classrooms/');
    return Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : [];
  }

  async createClassroom(data: CreateClassroomData): Promise<Classroom> {
    return api.post('/api/classrooms/classrooms/', data);
  }

  async updateClassroom(id: number, data: UpdateClassroomData): Promise<Classroom> {
    return api.patch(`/api/classrooms/classrooms/${id}/`, data);
  }

  async deleteClassroom(id: number): Promise<{ message: string; status: string }> {
    return api.delete(`/api/classrooms/classrooms/${id}/`);
  }

  async getClassroomStats(): Promise<ClassroomStats> {
    return api.get('/api/classrooms/classrooms/statistics/');
  }

  // ── Capacity ──────────────────────────────────────────────────────────────

  /**
   * Update a single classroom's max_capacity via the dedicated set-capacity
   * action so the backend can run capacity-specific validation (e.g. cannot
   * shrink below current enrollment).
   */
  async setClassroomCapacity(classroomId: number, maxCapacity: number): Promise<Classroom> {
    return api.patch(`/api/classrooms/classrooms/${classroomId}/set-capacity/`, {
      max_capacity: maxCapacity,
    });
  }

  /**
   * Bulk-update every classroom in the provided list to the same max_capacity.
   * Fires all requests concurrently via Promise.allSettled so a single failure
   * does not abort the rest. Returns a summary of what succeeded and what failed.
   */
  async bulkSetClassroomCapacity(
    classrooms: Classroom[],
    maxCapacity: number
  ): Promise<BulkCapacityResult> {
    const settled = await Promise.allSettled(
      classrooms.map(c =>
        api.patch(`/api/classrooms/classrooms/${c.id}/set-capacity/`, {
          max_capacity: maxCapacity,
        })
      )
    );

    const failed = settled
      .map((r, i) =>
        r.status === 'rejected'
          ? {
              name: classrooms[i].name,
              error:
                (r as PromiseRejectedResult).reason?.response?.data?.error ||
                (r as PromiseRejectedResult).reason?.message ||
                'Unknown error',
            }
          : null
      )
      .filter((x): x is { name: string; error: string } => x !== null);

    return { succeeded: settled.length - failed.length, failed };
  }

  // ── Classroom detail ──────────────────────────────────────────────────────

  async getClassroomStudents(classroomId: number) {
    return api.get(`/api/classrooms/classrooms/${classroomId}/students/`);
  }

  async getClassroomTeachers(classroomId: number) {
    return api.get(`/api/classrooms/classrooms/${classroomId}/teachers/`);
  }

  async getClassroomSchedule(classroomId: number) {
    return api.get(`/api/classrooms/classrooms/${classroomId}/schedule/`);
  }

  async getClassroomSubjects(classroomId: number) {
    return api.get(`/api/classrooms/classrooms/${classroomId}/subjects/`);
  }

  async getClassroomsByStream(streamId: number) {
    return api.get('/api/classrooms/classrooms/by_stream/', { params: { stream_id: streamId } });
  }

  // ============================================================================
  // TEACHER ASSIGNMENTS
  // ============================================================================

  async assignTeacherToClassroom(classroomId: number, data: AssignTeacherData) {
    return api.post(`/api/classrooms/classrooms/${classroomId}/assign_teacher/`, data);
  }

  async removeTeacherFromClassroom(classroomId: number, data: RemoveTeacherAssignmentData) {
    return api.post(`/api/classrooms/classrooms/${classroomId}/remove_teacher/`, data);
  }

  async addCoTeacher(classroomId: number, data: AddCoTeacherData) {
    return api.post(`/api/classrooms/classrooms/${classroomId}/add_co_teacher/`, data);
  }

  async removeCoTeacher(classroomId: number, data: RemoveCoTeacherData) {
    return api.post(`/api/classrooms/classrooms/${classroomId}/remove_co_teacher/`, data);
  }

  async createTeacherAssignment(data: CreateTeacherAssignmentData) {
    return api.post('/api/classrooms/teacher-assignments/', data);
  }

  async updateTeacherAssignment(assignmentId: number, data: UpdateTeacherAssignmentData) {
    return api.patch(`/api/classrooms/teacher-assignments/${assignmentId}/`, data);
  }

  async deleteTeacherAssignment(assignmentId: number) {
    return api.delete(`/api/classrooms/teacher-assignments/${assignmentId}/`);
  }

  async getTeacherAssignments(classroomId?: number, teacherId?: number) {
    const params: Record<string, number> = {};
    if (classroomId) params.classroom = classroomId;
    if (teacherId) params.teacher = teacherId;
    return api.get('/api/classrooms/teacher-assignments/', params);
  }

  async getAssignmentsByAcademicYear(academicYearId: number) {
    return api.get('/api/classrooms/teacher-assignments/by_academic_year/', {
      params: { academic_session_id: academicYearId },
    });
  }

  async getAssignmentsBySubject(subjectId: number) {
    return api.get('/api/classrooms/teacher-assignments/by_subject/', {
      params: { subject_id: subjectId },
    });
  }

  async getTeacherWorkloadAnalysis() {
    return api.get('/api/classrooms/teacher-assignments/workload_analysis/');
  }

  // ============================================================================
  // STUDENT ENROLLMENT
  // ============================================================================

  async enrollStudent(classroomId: number, data: { student_id: number }) {
    return api.post(`/api/classrooms/classrooms/${classroomId}/enroll_student/`, data);
  }

  async unenrollStudent(classroomId: number, data: { student_id: number }) {
    return api.post(`/api/classrooms/classrooms/${classroomId}/unenroll_student/`, data);
  }

  async transferStudent(
    sourceClassroomId: number,
    data: TransferStudentData
  ): Promise<TransferStudentResponse> {
    return api.post(
      `/api/classrooms/classrooms/${sourceClassroomId}/transfer_student/`,
      data
    );
  }

  async getStudentEnrollments(params?: {
    student?: number;
    classroom?: number;
    academic_session?: number;
    is_active?: boolean;
  }) {
    return api.get('/api/classrooms/student-enrollments/', params);
  }

  async createStudentEnrollment(data: {
    student: number;
    classroom: number;
    enrollment_date?: string;
  }) {
    return api.post('/api/classrooms/student-enrollments/', data);
  }

  async updateStudentEnrollment(
    id: number,
    data: Partial<{ enrollment_date?: string; withdrawal_date?: string; is_active: boolean }>
  ) {
    return api.patch(`/api/classrooms/student-enrollments/${id}/`, data);
  }

  async deleteStudentEnrollment(id: number) {
    return api.delete(`/api/classrooms/student-enrollments/${id}/`);
  }

  async getEnrollmentStatistics() {
    return api.get('/api/classrooms/student-enrollments/statistics/');
  }

  // ============================================================================
  // PEOPLE
  // ============================================================================

  async getAllTeachers() {
    return api.get('/api/teachers/teachers/');
  }

  async getAllSubjects() {
    return api.get('/api/subjects/');
  }

  async getStudentDetails(studentId: number) {
    return api.get(`/api/students/students/${studentId}/`);
  }

  // ============================================================================
  // GRADE LEVEL MANAGEMENT
  // GradeLevel.education_level is a CharField — always pass UPPERCASE values
  // ============================================================================

  async getGradeLevels(): Promise<GradeLevel[] | { results: GradeLevel[] }> {
    return api.get('/api/classrooms/grades/');
  }

  async createGradeLevel(data: {
    name: string;
    education_level: EducationLevelType;
    order: number;
    description?: string;
  }) {
    return api.post('/api/classrooms/grades/', data);
  }

  async updateGradeLevel(
    id: number,
    data: Partial<{ name: string; order: number; description?: string; is_active: boolean }>
  ) {
    return api.patch(`/api/classrooms/grades/${id}/`, data);
  }

  async deleteGradeLevel(id: number) {
    return api.delete(`/api/classrooms/grades/${id}/`);
  }

  async getGradeClassrooms(gradeId: number) {
    return api.get(`/api/classrooms/grades/${gradeId}/classrooms/`);
  }

  async getGradeStudents(gradeId: number) {
    return api.get(`/api/classrooms/grades/${gradeId}/students/`);
  }

  async getNurseryGrades() {
    return api.get('/api/classrooms/grades/nursery_grades/');
  }

  async getPrimaryGrades() {
    return api.get('/api/classrooms/grades/primary_grades/');
  }

  async getJuniorSecondaryGrades() {
    return api.get('/api/classrooms/grades/junior_secondary_grades/');
  }

  async getSeniorSecondaryGrades() {
    return api.get('/api/classrooms/grades/senior_secondary_grades/');
  }

  // ============================================================================
  // SECTION MANAGEMENT
  // Section.grade_level is a FK → GradeLevel
  // ============================================================================

  async getSections(gradeLevelId: number): Promise<Section[] | { results: Section[] }> {
    return api.get(`/api/classrooms/grades/${gradeLevelId}/sections/`);
  }

  async createSection(data: { name: string; grade_level: number; description?: string }) {
    return api.post('/api/classrooms/sections/', data);
  }

  async updateSection(
    id: number,
    data: Partial<{ name: string; description?: string; is_active: boolean }>
  ) {
    return api.patch(`/api/classrooms/sections/${id}/`, data);
  }

  async deleteSection(id: number) {
    return api.delete(`/api/classrooms/sections/${id}/`);
  }

  async getSectionClassrooms(sectionId: number) {
    return api.get(`/api/classrooms/sections/${sectionId}/classrooms/`);
  }

  // ============================================================================
  // ACADEMIC SESSION
  // ============================================================================

  async getAcademicYears(): Promise<AcademicSession[] | { results: AcademicSession[] }> {
    return api.get('/api/classrooms/academic-sessions/');
  }

  async getCurrentAcademicSession(): Promise<AcademicSession> {
    return api.get('/api/classrooms/academic-sessions/current/');
  }

  async setCurrentAcademicSession(sessionId: number) {
    return api.post(`/api/classrooms/academic-sessions/${sessionId}/set-current/`, {});
  }

  async getAcademicSessionStats(sessionId: number) {
    return api.get(`/api/classrooms/academic-sessions/${sessionId}/statistics/`);
  }

  // ============================================================================
  // TERM
  // Term.academic_session is a FK → AcademicSession
  // ============================================================================

  async getTerms(academicSessionId?: number): Promise<Term[] | { results: Term[] }> {
    if (academicSessionId) {
      return api.get(`/api/classrooms/academic-sessions/${academicSessionId}/terms/`);
    }
    return api.get('/api/classrooms/terms/');
  }

  async getTermsBySession(sessionId: number) {
    return api.get('/api/classrooms/terms/by-session/', { params: { session_id: sessionId } });
  }

  async getCurrentTerm(): Promise<Term> {
    return api.get('/api/classrooms/terms/current/');
  }

  async setCurrentTerm(termId: number) {
    return api.post(`/api/classrooms/terms/${termId}/set-current/`, {});
  }

  async getTermSubjects(termId: number) {
    return api.get(`/api/classrooms/terms/${termId}/subjects/`);
  }

  // ============================================================================
  // STREAM MANAGEMENT
  // stream_type_new is the FK → StreamType (preferred over legacy CharField stream_type)
  // ============================================================================

  async getStreams(params?: {
    stream_type_new?: number;
    grade_level?: number;
    academic_session?: number;
    is_active?: boolean;
  }) {
    return api.get('/api/classrooms/streams/', params);
  }

  async getStream(id: number) {
    return api.get(`/api/classrooms/streams/${id}/`);
  }

  async createStream(data: {
    name: string;
    code?: string;
    grade_level?: number;
    academic_session?: number;
    stream_type_new?: number;
    description?: string;
    max_capacity?: number;
  }) {
    return api.post('/api/classrooms/streams/', data);
  }

  async updateStream(
    id: number,
    data: Partial<{
      name: string;
      stream_type_new?: number;
      description?: string;
      is_active: boolean;
    }>
  ) {
    return api.patch(`/api/classrooms/streams/${id}/`, data);
  }

  async deleteStream(id: number) {
    return api.delete(`/api/classrooms/streams/${id}/`);
  }

  // by_type action: prefer stream_type_id (FK) over stream_type (old CharField)
  async getStreamsByType(params?: { stream_type_id?: number; stream_type?: string }) {
    return api.get('/api/classrooms/streams/by-type/', params);
  }

  async getStreamsByGradeLevel(gradeLevelId: number) {
    return api.get('/api/classrooms/streams/by-grade-level/', {
      params: { grade_level_id: gradeLevelId },
    });
  }

  async getStreamsByAcademicSession(sessionId: number) {
    return api.get('/api/classrooms/streams/by-academic-session/', {
      params: { session_id: sessionId },
    });
  }

  // ── StreamType CRUD ───────────────────────────────────────────────────────

  async getStreamTypes(params?: { is_active?: boolean }) {
    return api.get('/api/classrooms/stream-types/', params);
  }

  async getStreamType(id: number) {
    return api.get(`/api/classrooms/stream-types/${id}/`);
  }

  async createStreamType(data: {
    name: string;
    code: string;
    description?: string;
    requires_entrance_exam?: boolean;
    min_grade_requirement?: number;
  }) {
    return api.post('/api/classrooms/stream-types/', data);
  }

  async updateStreamType(
    id: number,
    data: Partial<{ name: string; description?: string; is_active: boolean }>
  ) {
    return api.patch(`/api/classrooms/stream-types/${id}/`, data);
  }

  // ============================================================================
  // CLASS SCHEDULE
  // ============================================================================

  async getClassSchedules(params?: {
    classroom?: number;
    teacher?: number;
    subject?: number;
    day_of_week?: string;
  }) {
    return api.get('/api/classrooms/schedules/', params);
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
    return api.post('/api/classrooms/schedules/', data);
  }

  async updateClassSchedule(
    id: number,
    data: Partial<{
      day_of_week: string;
      start_time: string;
      end_time: string;
      period_number?: number;
      is_active: boolean;
    }>
  ) {
    return api.patch(`/api/classrooms/schedules/${id}/`, data);
  }

  async deleteClassSchedule(id: number) {
    return api.delete(`/api/classrooms/schedules/${id}/`);
  }

  async getScheduleConflicts(params?: { classroom?: number; teacher?: number }) {
    return api.get('/api/classrooms/schedules/conflicts/', params);
  }

  async getDailySchedule(day: string, params?: { classroom?: number; teacher?: number }) {
    return api.get('/api/classrooms/schedules/daily_schedule/', { ...params, day });
  }

  async getWeeklySchedule(params?: { classroom?: number; teacher?: number }) {
    return api.get('/api/classrooms/schedules/weekly_schedule/', params);
  }

  // ============================================================================
  // SUBJECT OPERATIONS
  // Subject.category_new is a FK → SubjectCategory (preferred over old CharField)
  // ============================================================================

  async getSubjectsByCategory(params?: { category_new?: number; category?: string }) {
    return api.get('/api/classrooms/subjects/by-category/', params);
  }

  async getSubjectsByEducationLevel(params?: { education_level?: EducationLevelType }) {
    return api.get('/api/classrooms/subjects/by-education-level/', params);
  }

  async getSubjectsForGrade(params?: { grade_id?: number }) {
    return api.get('/api/classrooms/subjects/for-grade/', params);
  }

  async getSubjectStatistics() {
    return api.get('/api/classrooms/subjects/statistics/');
  }

  // ============================================================================
  // STUDENT OPERATIONS
  // ============================================================================

  async getStudentCurrentClass(studentId: number) {
    return api.get(`/api/classrooms/students/${studentId}/current-class/`);
  }

  async getStudentEnrollmentHistory(studentId: number) {
    return api.get(`/api/classrooms/students/${studentId}/enrollment-history/`);
  }

  async getStudentSchedule(studentId: number) {
    return api.get(`/api/classrooms/students/${studentId}/schedule/`);
  }

  async getStudentSubjects(studentId: number) {
    return api.get(`/api/classrooms/students/${studentId}/subjects/`);
  }

  // ============================================================================
  // TEACHER OPERATIONS
  // ============================================================================

  async getTeacherClasses(teacherId: number) {
    return api.get(`/api/classrooms/teachers/${teacherId}/classes/`);
  }

  async getTeacherSchedule(teacherId: number) {
    return api.get(`/api/classrooms/teachers/${teacherId}/schedule/`);
  }

  async getTeacherSubjects(teacherId: number) {
    return api.get(`/api/classrooms/teachers/${teacherId}/subjects/`);
  }

  async getTeacherWorkload(teacherId: number) {
    return api.get(`/api/classrooms/teachers/${teacherId}/workload/`);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  async clearCaches() {
    return api.post('/api/classrooms/clear-caches/', {});
  }

  async healthCheck() {
    return api.get('/api/classrooms/health/');
  }

  async getSystemInfo() {
    return api.get('/api/classrooms/system-info/');
  }

  async transferTeacher(
  sourceClassroomId: number,
  data: TransferTeacherData
): Promise<TransferTeacherResponse> {
  return api.post(
    `/api/classrooms/classrooms/${sourceClassroomId}/transfer_teacher/`,
    data
  );
}
}

export const classroomService = new ClassroomService();
export default classroomService;