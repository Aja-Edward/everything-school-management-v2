import api from '@/services/api';

// ============================================================================
// EDUCATION LEVEL TYPE
// GradeLevel.education_level CharField choices (Django):
//   NURSERY | PRIMARY | JUNIOR_SECONDARY | SENIOR_SECONDARY
// This is NOT a FK — it's a CharField on GradeLevel.
// But it's exposed on Classroom as a serializer-computed read-only field:
//   classroom.education_level = classroom.section.grade_level.education_level
// Old code used lowercase 'nursery'/'primary'/'secondary' — wrong.
// ============================================================================
export type EducationLevelType =
  | 'NURSERY'
  | 'PRIMARY'
  | 'JUNIOR_SECONDARY'
  | 'SENIOR_SECONDARY';

// ============================================================================
// TEACHER
// Teacher.level was 'nursery'|'primary'|'secondary' — now aligned to
// the same EducationLevelType uppercase values used everywhere else.
// 'secondary' (combined) is removed — API distinguishes JUNIOR/SENIOR.
// ============================================================================
export interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string;
  phone_number?: string;
  employee_id: string;
  // FIXED: was 'nursery'|'primary'|'junior_secondary'|'senior_secondary'|'secondary'
  // Now aligned to EducationLevelType — uppercase, no combined 'secondary'
  level?: EducationLevelType;
  is_active: boolean;
  assigned_subjects: Array<{
    id: number;
    name: string;
    code?: string;
  }>;
}

export interface TransferStudentData {
  student_id: number;
  target_classroom_id: number;
}

export interface TransferStudentResponse {
  message: string;
  from_classroom: string;
  to_classroom: string;
  enrollment: any;
}

// ============================================================================
// SUBJECT
// ============================================================================
export interface Subject {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_core: boolean;
  is_active: boolean;
  // education_levels is an array (ArrayField on Django Subject model)
  education_levels?: EducationLevelType[];
}

// ============================================================================
// CLASSROOM TEACHER ASSIGNMENT
// ClassroomTeacherAssignment model — FK-based:
//   teacher FK → Teacher
//   subject FK → Subject
//   classroom FK → Classroom
// Serializer exposes teacher_* and subject_* as flat fields.
// ============================================================================
export interface ClassroomTeacherAssignment {
  id: number;
  teacher: number;           // FK → Teacher.id
  subject: number;           // FK → Subject.id
  classroom: number;         // FK → Classroom.id
  classroom_name?: string;   // serializer-computed
  // Serializer-computed flat fields from teacher FK:
  teacher_name?: string;
  teacher_email?: string;
  teacher_phone?: string;
  teacher_employee_id?: string;
  teacher_first_name?: string;
  teacher_last_name?: string;
  // Serializer-computed flat fields from subject FK:
  subject_name?: string;
  subject_code?: string;
  is_primary_teacher: boolean;
  periods_per_week: number;
  assigned_date: string;
  is_active: boolean;
}

// ============================================================================
// STREAM
// Stream model has been migrated:
//   stream_type CharField → stream_type_new FK → StreamType model
// The stream field on Classroom is a FK → Stream (was not present before).
// ============================================================================
export interface StreamType {
  id: number;
  name: string;
  code: string;
  description?: string;
  requires_entrance_exam?: boolean;
  min_grade_requirement?: number | null;
  is_active: boolean;
}

export interface Stream {
  id: number;
  name: string;
  code?: string;
  description?: string;
  // stream_type is the old CharField (deprecated but still on model)
  stream_type?: string;
  // stream_type_new is the new FK → StreamType
  stream_type_new?: number | StreamType;   // FK id or nested object
  stream_type_name?: string;              // serializer-computed
  grade_level?: number;                   // FK → GradeLevel.id
  grade_level_name?: string;             // serializer-computed
  academic_session?: number;             // FK → AcademicSession.id
  academic_session_name?: string;        // serializer-computed
  stream_coordinator?: number | null;    // FK → Teacher.id
  stream_coordinator_name?: string;      // serializer-computed
  max_capacity?: number;
  current_enrollment?: number;
  available_spots?: number;
  enrollment_percentage?: number;
  is_active: boolean;
}

// ============================================================================
// CLASSROOM
// All relational fields are FKs:
//   section FK → Section
//   academic_session FK → AcademicSession
//   term FK → Term
//   class_teacher FK → Teacher (nullable)
//   stream FK → Stream (nullable)
//
// The serializer exposes *_name computed fields for display.
// education_level is NOT a direct field — it is computed:
//   classroom.section → grade_level → education_level
// ============================================================================
export interface Classroom {
  id: number;
  name: string;

  // --- FK fields (sent to API as numeric IDs) ---
  section: number;                // FK → Section.id
  academic_session: number;       // FK → AcademicSession.id
  term: number;                   // FK → Term.id
  class_teacher: number | null;   // FK → Teacher.id (nullable)
  stream?: number | null;         // FK → Stream.id (nullable, newly added)

  // --- Serializer-computed display fields (read-only) ---
  section_name: string;           // from section.name
  grade_level_name: string;       // from section.grade_level.name
  // education_level = section.grade_level.education_level (CharField choices)
  // Values: NURSERY | PRIMARY | JUNIOR_SECONDARY | SENIOR_SECONDARY
  // FIXED: old interfaces typed this as plain string or used lowercase values
  education_level: EducationLevelType;
  academic_session_name: string;  // from academic_session.name
  term_name: string;              // from term.name or term.name_display
  class_teacher_name: string;     // from class_teacher.user.get_full_name()
  class_teacher_phone?: string;
  class_teacher_employee_id?: string;
  stream_name?: string;           // from stream.name (FK, nullable)

  // --- Enrollment fields ---
  room_number: string;
  max_capacity: number;
  current_enrollment: number;
  available_spots: number;
  enrollment_percentage: number;
  is_full: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Teacher assignments (ClassroomTeacherAssignment FK-based model)
  teacher_assignments?: ClassroomTeacherAssignment[];
}

// ============================================================================
// GRADE LEVEL
// GradeLevel.education_level is a CharField (not a FK).
// ============================================================================
export interface GradeLevel {
  id: number;
  name: string;
  education_level: EducationLevelType; // CharField choices — UPPERCASE
  order: number;
  is_active: boolean;
  description?: string;
}

// ============================================================================
// SECTION
// Section.grade_level is a FK → GradeLevel
// ============================================================================
export interface Section {
  id: number;
  name: string;
  grade_level: number;          // FK → GradeLevel.id
  grade_level_name?: string;    // serializer-computed
  // education_level may be annotated on section by some serializers
  education_level?: EducationLevelType;
  is_active: boolean;
  description?: string;
}

// ============================================================================
// ACADEMIC SESSION & TERM
// Term.academic_session is a FK → AcademicSession
// ============================================================================
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
  name_display?: string;        // serializer-computed display name
  academic_session: number;     // FK → AcademicSession.id
  academic_session_name?: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
}

// ============================================================================
// CLASSROOM STATS
// Returned by ClassroomViewSet.statistics() action.
// by_education_level keys are snake_case lowercase matching Django variable names:
//   nursery_count → nursery
//   primary_count → primary
//   junior_secondary_count → junior_secondary
//   senior_secondary_count → senior_secondary
//
// FIXED: old interface had { nursery, primary, secondary } — 'secondary' does not
// exist as a key. The views.py returns junior_secondary and senior_secondary separately.
// ============================================================================
export interface ClassroomStats {
  total_classrooms: number;
  active_classrooms: number;
  total_enrollment: number;
  average_enrollment: number;
  by_education_level: {
    nursery: number;
    primary: number;
    junior_secondary: number;   // FIXED: was missing (merged into 'secondary')
    senior_secondary: number;   // FIXED: was missing (merged into 'secondary')
    // 'secondary' key does NOT exist in the API response
  };
  // views.py also returns by_stream_type — optional here
  by_stream_type?: Array<{
    stream_type_id: number;
    stream_type_name: string;
    stream_type_code: string;
    classroom_count: number;
  }>;
}

// ============================================================================
// FORM DATA TYPES
// These are the payloads sent TO the API.
// Only FK ids are sent — never *_name display fields (those are read-only).
// grade_level_id is a UI-only helper for filtering sections and must NOT be sent.
// ============================================================================
export interface CreateClassroomData {
  name: string;
  section: number;              // FK → Section.id (required)
  academic_session: number;     // FK → AcademicSession.id (required)
  term: number;                 // FK → Term.id (required)
  class_teacher?: number;       // FK → Teacher.id (optional)
  stream?: number;              // FK → Stream.id (optional)
  room_number?: string;
  max_capacity: number;
  // NOTE: grade_level_id is intentionally excluded — UI-only, not an API field
}

export interface UpdateClassroomData extends Partial<CreateClassroomData> {
  is_active?: boolean;
}

// ============================================================================
// TEACHER ASSIGNMENT DATA
// ============================================================================
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

// ============================================================================
// SERVICE CLASS
// ============================================================================
class ClassroomService {

  async getClassrooms(params?: {
    search?: string;
    // FIXED: education_level filter uses EducationLevelType values, not lowercase strings
    // Pass to filterset via section__grade_level__education_level or use computed field
    section?: number;
    stream?: number;            // NEW: stream FK filter (added in views.py)
    academic_session?: number;
    term?: number;
    is_active?: boolean;
    ordering?: string;
    page?: number;
    page_size?: number;
  }) {
    try {
      const response = await api.get('/api/classrooms/classrooms/', params);
      if (Array.isArray(response)) return response;
      if (response?.results) return response;
      if (response?.data) return response.data;
      return response;
    } catch (error: any) {
      console.error('Error fetching classrooms:', error);
      throw error;
    }
  }

  async getClassroom(id: number) {
    return await api.get(`/api/classrooms/classrooms/${id}/`);
  }

  async createClassroom(data: CreateClassroomData) {
    // grade_level_id must never be in this payload — it's UI-only
    const { ...payload } = data;
    return await api.post('/api/classrooms/classrooms/', payload);
  }

  async updateClassroom(id: number, data: UpdateClassroomData) {
    return await api.patch(`/api/classrooms/classrooms/${id}/`, data);
  }

  async deleteClassroom(id: number): Promise<{ message: string; status: string }> {
    return await api.delete(`/api/classrooms/classrooms/${id}/`);
  }

  async getClassroomStats(): Promise<ClassroomStats> {
    return await api.get('/api/classrooms/classrooms/statistics/');
  }

  async getClassroomStudents(classroomId: number) {
    return await api.get(`/api/classrooms/classrooms/${classroomId}/students/`);
  }

  async getClassroomTeachers(classroomId: number) {
    return await api.get(`/api/classrooms/classrooms/${classroomId}/teachers/`);
  }

  async assignTeacherToClassroom(classroomId: number, data: AssignTeacherData) {
    return await api.post(`/api/classrooms/classrooms/${classroomId}/assign_teacher/`, data);
  }

  async removeTeacherFromClassroom(classroomId: number, data: RemoveTeacherAssignmentData) {
    return await api.post(`/api/classrooms/classrooms/${classroomId}/remove_teacher/`, data);
  }

  // ClassroomTeacherAssignment CRUD
  async createTeacherAssignment(data: CreateTeacherAssignmentData) {
    return await api.post('/api/classrooms/teacher-assignments/', data);
  }

  async updateTeacherAssignment(assignmentId: number, data: UpdateTeacherAssignmentData) {
    return await api.patch(`/api/classrooms/teacher-assignments/${assignmentId}/`, data);
  }

  async deleteTeacherAssignment(assignmentId: number) {
    return await api.delete(`/api/classrooms/teacher-assignments/${assignmentId}/`);
  }

  async getTeacherAssignments(classroomId?: number, teacherId?: number) {
    const params: Record<string, number> = {};
    if (classroomId) params.classroom = classroomId;
    if (teacherId) params.teacher = teacherId;
    return await api.get('/api/classrooms/teacher-assignments/', params);
  }

  async getAllTeachers() {
    return await api.get('/api/teachers/teachers/');
  }

  async getAllSubjects() {
    return await api.get('/api/subjects/');
  }

  // GradeLevel — education_level is a CharField with UPPERCASE values
  async getGradeLevels(): Promise<GradeLevel[] | { results: GradeLevel[] }> {
    return await api.get('/api/classrooms/grades/');
  }

  // Sections for a grade level — section.grade_level is a FK → GradeLevel
  async getSections(gradeLevelId: number): Promise<Section[] | { results: Section[] }> {
    return await api.get(`/api/classrooms/grades/${gradeLevelId}/sections/`);
  }

  async getAcademicYears(): Promise<AcademicSession[] | { results: AcademicSession[] }> {
    return await api.get('/api/classrooms/academic-sessions/');
  }

  async getCurrentAcademicSession(): Promise<AcademicSession> {
    return await api.get('/api/classrooms/academic-sessions/current/');
  }

  async setCurrentAcademicSession(sessionId: number) {
    return await api.post(`/api/classrooms/academic-sessions/${sessionId}/set-current/`, {});
  }

  async getAcademicSessionStats(sessionId: number) {
    return await api.get(`/api/classrooms/academic-sessions/${sessionId}/statistics/`);
  }

  // Term.academic_session is a FK — getTerms can filter by it
  async getTerms(academicSessionId?: number): Promise<Term[] | { results: Term[] }> {
    if (academicSessionId) {
      return await api.get(`/api/classrooms/academic-sessions/${academicSessionId}/terms/`);
    }
    return await api.get('/api/classrooms/terms/');
  }

  async getTermsBySession(sessionId: number) {
    return await api.get('/api/classrooms/terms/by-session/', { params: { session_id: sessionId } });
  }

  async getCurrentTerm(): Promise<Term> {
    return await api.get('/api/classrooms/terms/current/');
  }

  async setCurrentTerm(termId: number) {
    return await api.post(`/api/classrooms/terms/${termId}/set-current/`, {});
  }

  async getTermSubjects(termId: number) {
    return await api.get(`/api/classrooms/terms/${termId}/subjects/`);
  }

  async getStudentDetails(studentId: number) {
    return await api.get(`/api/students/students/${studentId}/`);
  }

  // ============================================================================
  // STREAM MANAGEMENT
  // Stream model: stream_type CharField → stream_type_new FK → StreamType
  // When filtering streams, prefer stream_type_new or stream_type_id params.
  // ============================================================================

  async getStreams(params?: {
    stream_type_new?: number;   // NEW: FK-based filter (preferred)
    grade_level?: number;       // FK filter
    academic_session?: number;  // FK filter
    is_active?: boolean;
  }) {
    return await api.get('/api/classrooms/streams/', params);
  }

  async getStream(id: number) {
    return await api.get(`/api/classrooms/streams/${id}/`);
  }

  async createStream(data: {
    name: string;
    code?: string;
    grade_level?: number;       // FK → GradeLevel.id
    academic_session?: number;  // FK → AcademicSession.id
    stream_type_new?: number;   // FK → StreamType.id (preferred over stream_type)
    description?: string;
    max_capacity?: number;
  }) {
    return await api.post('/api/classrooms/streams/', data);
  }

  async updateStream(id: number, data: Partial<{
    name: string;
    stream_type_new?: number;   // FK → StreamType.id
    description?: string;
    is_active: boolean;
  }>) {
    return await api.patch(`/api/classrooms/streams/${id}/`, data);
  }

  async deleteStream(id: number) {
    return await api.delete(`/api/classrooms/streams/${id}/`);
  }

  // by_type action: use stream_type_id (FK) not stream_type (old CharField)
  async getStreamsByType(params?: {
    stream_type_id?: number;    // NEW: FK-based (preferred)
    stream_type?: string;       // OLD: CharField code (deprecated)
  }) {
    return await api.get('/api/classrooms/streams/by-type/', params);
  }

  async getStreamsByGradeLevel(gradeLevelId: number) {
    return await api.get('/api/classrooms/streams/by-grade-level/', {
      params: { grade_level_id: gradeLevelId },
    });
  }

  async getStreamsByAcademicSession(sessionId: number) {
    return await api.get('/api/classrooms/streams/by-academic-session/', {
      params: { session_id: sessionId },
    });
  }

  // StreamType CRUD (new model that replaces stream_type CharField)
  async getStreamTypes(params?: { is_active?: boolean }) {
    return await api.get('/api/classrooms/stream-types/', params);
  }

  async getStreamType(id: number) {
    return await api.get(`/api/classrooms/stream-types/${id}/`);
  }

  async createStreamType(data: {
    name: string;
    code: string;
    description?: string;
    requires_entrance_exam?: boolean;
    min_grade_requirement?: number;
  }) {
    return await api.post('/api/classrooms/stream-types/', data);
  }

  async updateStreamType(id: number, data: Partial<{
    name: string;
    description?: string;
    is_active: boolean;
  }>) {
    return await api.patch(`/api/classrooms/stream-types/${id}/`, data);
  }

  // ============================================================================
  // SECTION MANAGEMENT
  // Section.grade_level is a FK → GradeLevel
  // ============================================================================

  async createSection(data: {
    name: string;
    grade_level: number;   // FK → GradeLevel.id
    description?: string;
  }) {
    return await api.post('/api/classrooms/sections/', data);
  }

  async updateSection(id: number, data: Partial<{
    name: string;
    description?: string;
    is_active: boolean;
  }>) {
    return await api.patch(`/api/classrooms/sections/${id}/`, data);
  }

  async deleteSection(id: number) {
    return await api.delete(`/api/classrooms/sections/${id}/`);
  }

  async getSectionClassrooms(sectionId: number) {
    return await api.get(`/api/classrooms/sections/${sectionId}/classrooms/`);
  }

  // ============================================================================
  // GRADE LEVEL MANAGEMENT
  // GradeLevel.education_level is a CharField — pass UPPERCASE values
  // ============================================================================

  async createGradeLevel(data: {
    name: string;
    education_level: EducationLevelType; // UPPERCASE enum values
    order: number;
    description?: string;
  }) {
    return await api.post('/api/classrooms/grades/', data);
  }

  async updateGradeLevel(id: number, data: Partial<{
    name: string;
    order: number;
    description?: string;
    is_active: boolean;
  }>) {
    return await api.patch(`/api/classrooms/grades/${id}/`, data);
  }

  async deleteGradeLevel(id: number) {
    return await api.delete(`/api/classrooms/grades/${id}/`);
  }

  async getGradeClassrooms(gradeId: number) {
    return await api.get(`/api/classrooms/grades/${gradeId}/classrooms/`);
  }

  async getGradeStudents(gradeId: number) {
    return await api.get(`/api/classrooms/grades/${gradeId}/students/`);
  }

  // These actions filter by education_level CharField — use UPPERCASE
  async getNurseryGrades() {
    return await api.get('/api/classrooms/grades/nursery_grades/');
  }

  async getPrimaryGrades() {
    return await api.get('/api/classrooms/grades/primary_grades/');
  }

  async getJuniorSecondaryGrades() {
    return await api.get('/api/classrooms/grades/junior_secondary_grades/');
  }

  async getSeniorSecondaryGrades() {
    return await api.get('/api/classrooms/grades/senior_secondary_grades/');
  }

  // ============================================================================
  // STUDENT ENROLLMENT
  // StudentEnrollment: student FK, classroom FK
  // ============================================================================

  async getStudentEnrollments(params?: {
    student?: number;
    classroom?: number;
    academic_session?: number;
    is_active?: boolean;
  }) {
    return await api.get('/api/classrooms/student-enrollments/', params);
  }

  async createStudentEnrollment(data: {
    student: number;     // FK → Student.id
    classroom: number;   // FK → Classroom.id
    enrollment_date?: string;
  }) {
    return await api.post('/api/classrooms/student-enrollments/', data);
  }

  async updateStudentEnrollment(id: number, data: Partial<{
    enrollment_date?: string;
    withdrawal_date?: string;
    is_active: boolean;
  }>) {
    return await api.patch(`/api/classrooms/student-enrollments/${id}/`, data);
  }

  async deleteStudentEnrollment(id: number) {
    return await api.delete(`/api/classrooms/student-enrollments/${id}/`);
  }

  async getEnrollmentStatistics() {
    return await api.get('/api/classrooms/student-enrollments/statistics/');
  }

  // ============================================================================
  // CLASS SCHEDULE
  // ClassSchedule: classroom FK, teacher FK, subject FK
  // ============================================================================

  async getClassSchedules(params?: {
    classroom?: number;
    teacher?: number;
    subject?: number;
    day_of_week?: string;
  }) {
    return await api.get('/api/classrooms/schedules/', params);
  }

  async createClassSchedule(data: {
    classroom: number;    // FK → Classroom.id
    subject: number;      // FK → Subject.id
    teacher: number;      // FK → Teacher.id
    day_of_week: string;
    start_time: string;
    end_time: string;
    period_number?: number;
  }) {
    return await api.post('/api/classrooms/schedules/', data);
  }

  async updateClassSchedule(id: number, data: Partial<{
    day_of_week: string;
    start_time: string;
    end_time: string;
    period_number?: number;
    is_active: boolean;
  }>) {
    return await api.patch(`/api/classrooms/schedules/${id}/`, data);
  }

  async deleteClassSchedule(id: number) {
    return await api.delete(`/api/classrooms/schedules/${id}/`);
  }

  async getScheduleConflicts(params?: { classroom?: number; teacher?: number }) {
    return await api.get('/api/classrooms/schedules/conflicts/', params);
  }

  async getDailySchedule(day: string, params?: { classroom?: number; teacher?: number }) {
    return await api.get('/api/classrooms/schedules/daily_schedule/', { ...params, day });
  }

  async getWeeklySchedule(params?: { classroom?: number; teacher?: number }) {
    return await api.get('/api/classrooms/schedules/weekly_schedule/', params);
  }

  // ============================================================================
  // CLASSROOM ADDITIONAL OPERATIONS
  // ============================================================================

  async getClassroomSchedule(classroomId: number) {
    return await api.get(`/api/classrooms/classrooms/${classroomId}/schedule/`);
  }

  async getClassroomSubjects(classroomId: number) {
    return await api.get(`/api/classrooms/classrooms/${classroomId}/subjects/`);
  }

  async getClassroomsByStream(streamId: number) {
    return await api.get('/api/classrooms/classrooms/by_stream/', {
      params: { stream_id: streamId },
    });
  }

  async enrollStudent(classroomId: number, data: { student_id: number }) {
    return await api.post(`/api/classrooms/classrooms/${classroomId}/enroll_student/`, data);
  }

  async unenrollStudent(classroomId: number, data: { student_id: number }) {
    return await api.post(`/api/classrooms/classrooms/${classroomId}/unenroll_student/`, data);
  }

  // Transfer a student from one classroom to another
async transferStudent(
  sourceClassroomId: number,
  data: TransferStudentData
): Promise<TransferStudentResponse> {
  try {
    console.log(
      `📤 Transferring student ${data.student_id} from classroom ${sourceClassroomId} to ${data.target_classroom_id}`
    );
    const response = await api.post(
      `/api/classrooms/classrooms/${sourceClassroomId}/transfer_student/`,
      data
    );
    console.log("✅ Transfer successful:", response);
    return response;
  } catch (error: any) {
    console.error("❌ Transfer failed:", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
}

  // ============================================================================
  // TEACHER OPERATIONS
  // ============================================================================

  async getTeacherClasses(teacherId: number) {
    return await api.get(`/api/classrooms/teachers/${teacherId}/classes/`);
  }

  async getTeacherSchedule(teacherId: number) {
    return await api.get(`/api/classrooms/teachers/${teacherId}/schedule/`);
  }

  async getTeacherSubjects(teacherId: number) {
    return await api.get(`/api/classrooms/teachers/${teacherId}/subjects/`);
  }

  async getTeacherWorkload(teacherId: number) {
    return await api.get(`/api/classrooms/teachers/${teacherId}/workload/`);
  }

  // ============================================================================
  // TEACHER ASSIGNMENT OPERATIONS
  // ============================================================================

  async getAssignmentsByAcademicYear(academicYearId: number) {
    return await api.get('/api/classrooms/teacher-assignments/by_academic_year/', {
      params: { academic_session_id: academicYearId },
    });
  }

  async getAssignmentsBySubject(subjectId: number) {
    return await api.get('/api/classrooms/teacher-assignments/by_subject/', {
      params: { subject_id: subjectId },
    });
  }

  async getTeacherWorkloadAnalysis() {
    return await api.get('/api/classrooms/teacher-assignments/workload_analysis/');
  }

  // ============================================================================
  // SUBJECT OPERATIONS
  // Subject.category_new is now a FK → SubjectCategory (was CharField)
  // Use category_new in filter params, not category
  // ============================================================================

  async getSubjectsByCategory(params?: {
    category_new?: number;  // FK → SubjectCategory.id (preferred)
    category?: string;      // old CharField (deprecated)
  }) {
    return await api.get('/api/classrooms/subjects/by-category/', params);
  }

  async getSubjectsByEducationLevel(params?: {
    education_level?: EducationLevelType; // UPPERCASE values only
  }) {
    return await api.get('/api/classrooms/subjects/by-education-level/', params);
  }

  async getSubjectsForGrade(params?: { grade_id?: number }) {
    return await api.get('/api/classrooms/subjects/for-grade/', params);
  }

  async getSubjectStatistics() {
    return await api.get('/api/classrooms/subjects/statistics/');
  }

  // ============================================================================
  // STUDENT OPERATIONS
  // ============================================================================

  async getStudentCurrentClass(studentId: number) {
    return await api.get(`/api/classrooms/students/${studentId}/current-class/`);
  }

  async getStudentEnrollmentHistory(studentId: number) {
    return await api.get(`/api/classrooms/students/${studentId}/enrollment-history/`);
  }

  async getStudentSchedule(studentId: number) {
    return await api.get(`/api/classrooms/students/${studentId}/schedule/`);
  }

  async getStudentSubjects(studentId: number) {
    return await api.get(`/api/classrooms/students/${studentId}/subjects/`);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  async clearCaches() {
    return await api.post('/api/classrooms/clear-caches/', {});
  }

  async healthCheck() {
    return await api.get('/api/classrooms/health/');
  }

  async getSystemInfo() {
    return await api.get('/api/classrooms/system-info/');
  }
}

export const classroomService = new ClassroomService();
export default classroomService;