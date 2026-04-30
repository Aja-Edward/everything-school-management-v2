// ============================================================================
// EDUCATION LEVEL TYPE
// GradeLevel.education_level CharField choices (Django):
//   NURSERY | PRIMARY | JUNIOR_SECONDARY | SENIOR_SECONDARY
// This is NOT a FK — it's a CharField on GradeLevel.
// Exposed on Classroom as a serializer-computed read-only field:
//   classroom.education_level = classroom.section.grade_level.education_level
// ============================================================================
export type EducationLevelType =
  | 'NURSERY'
  | 'PRIMARY'
  | 'JUNIOR_SECONDARY'
  | 'SENIOR_SECONDARY';

// ============================================================================
// TEACHER
// ============================================================================
export interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string;
  phone_number?: string;
  employee_id: string;
  level?: EducationLevelType;
  is_active: boolean;
  assigned_subjects: Array<{ id: number; name: string; code?: string }>;
}

// ============================================================================
// CO-TEACHER
// ============================================================================
export interface CoTeacher {
  id: number;
  teacher_id: number;
  teacher_name: string;
  teacher_phone?: string;
  teacher_employee_id?: string;
  assigned_date: string;
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
  education_levels?: EducationLevelType[];
}

// ============================================================================
// CLASSROOM TEACHER ASSIGNMENT
// ClassroomTeacherAssignment model — FK-based.
// Serializer exposes teacher_* and subject_* as flat computed fields.
// ============================================================================
export interface ClassroomTeacherAssignment {
  id: number;
  teacher: number;
  subject: number;
  classroom: number;
  classroom_name?: string;
  teacher_name?: string;
  teacher_email?: string;
  teacher_phone?: string;
  teacher_employee_id?: string;
  teacher_first_name?: string;
  teacher_last_name?: string;
  subject_name?: string;
  subject_code?: string;
  is_primary_teacher: boolean;
  periods_per_week: number;
  assigned_date: string;
  is_active: boolean;
}

// ============================================================================
// STREAM
// stream_type_new is the FK → StreamType (preferred over legacy stream_type CharField)
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
  stream_type?: string;
  stream_type_new?: number | StreamType;
  stream_type_name?: string;
  grade_level?: number;
  grade_level_name?: string;
  academic_session?: number;
  academic_session_name?: string;
  stream_coordinator?: number | null;
  stream_coordinator_name?: string;
  max_capacity?: number;
  current_enrollment?: number;
  available_spots?: number;
  enrollment_percentage?: number;
  is_active: boolean;
}

// ============================================================================
// CLASSROOM
// All relational fields are FKs (sent as numeric IDs to the API).
// *_name fields are serializer-computed — read-only, never sent to API.
// education_level is computed: classroom.section → grade_level → education_level
// ============================================================================
export interface Classroom {
  id: number;
  name: string;
  section: number;
  academic_session: number;
  term: number;
  class_teacher: number | null;
  stream?: number | null;
  section_name: string;
  grade_level_name: string;
  education_level: EducationLevelType;
  academic_session_name: string;
  term_name: string;
  class_teacher_name: string;
  class_teacher_phone?: string;
  class_teacher_employee_id?: string;
  co_teachers?: CoTeacher[];
  stream_name?: string;
  enrollment_count?: number;
  student_count?: number;
  room_number?: string;
  max_capacity: number;
  current_enrollment?: number;
  available_spots?: number;
  enrollment_percentage: number;
  is_full?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  teacher_assignments?: ClassroomTeacherAssignment[];
  [key: string]: any;
}

export interface BulkCapacityResult {
  succeeded: number;
  failed: Array<{ name: string; error: string }>;
}

// ============================================================================
// GRADE LEVEL & SECTION
// ============================================================================
export interface GradeLevel {
  id: number;
  name: string;
  education_level: EducationLevelType;
  order: number;
  is_active: boolean;
  description?: string;
}

export interface Section {
  id: number;
  name: string;
  grade_level: number;
  grade_level_name?: string;
  education_level?: EducationLevelType;
  is_active: boolean;
  description?: string;
}

// ============================================================================
// ACADEMIC SESSION & TERM
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
  name_display?: string;
  academic_session: number;
  academic_session_name?: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
}

// ============================================================================
// CLASSROOM STATS
// by_education_level keys match Django view output exactly — no 'secondary' key.
// ============================================================================
export interface ClassroomStats {
  total_classrooms: number;
  active_classrooms: number;
  total_enrollment: number;
  average_enrollment: number;
  by_education_level: {
    nursery: number;
    primary: number;
    junior_secondary: number;
    senior_secondary: number;
  };
  by_stream_type?: Array<{
    stream_type_id: number;
    stream_type_name: string;
    stream_type_code: string;
    classroom_count: number;
  }>;
}

// ============================================================================
// FORM DATA TYPES
// Only FK ids are sent — never *_name display fields (those are read-only).
// grade_level_id is UI-only and must NOT be sent.
// ============================================================================
export interface CreateClassroomData {
  name: string;
  section: number;
  academic_session: number;
  term: number;
  class_teacher?: number;
  stream?: number;
  room_number?: string;
  max_capacity: number;
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


export interface TransferTeacherData {
  teacher_id: number;
  target_classroom_id: number;
  subject_ids: number[];
}

export interface TransferTeacherResponse {
  message: string;
  from_classroom: string;
  to_classroom: string;
  transferred: Array<{ subject_id: number; subject_name: string; assignment_id: number }>;
  skipped: Array<{ subject_id: number; subject_name: string; reason: string }>;
  transferred_count: number;
  skipped_count: number;
}

export interface AddCoTeacherData {
  teacher_id: number;
}

export interface RemoveCoTeacherData {
  teacher_id: number;
}