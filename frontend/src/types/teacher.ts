export interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  employee_id?: string;
  email: string;
  phone_number: string;
  address: string;
  staff_type: 'teaching' | 'non-teaching';
  level: 'nursery' | 'primary' | 'junior_secondary' | 'senior_secondary' | 'secondary' | null;
  hire_date: string;
  qualification: string;
  specialization: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  photo?: string;
  date_of_birth?: string;
  
  // User object containing additional user info including bio
  user?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    username: string;
    bio?: string;
    date_of_birth?: string;
    date_joined: string;
    is_active: boolean;
  };
  
  // Updated to use new assignment structure
  assigned_subjects: Array<{
    id: number;
    name: string;
    code: string;
  }>;
  
  // New classroom assignments using ClassroomTeacherAssignment
  classroom_assignments?: Array<{
    id: number;
    classroom_name: string;
    classroom_id: number;
    section_name: string;
    grade_level_name: string;
    education_level: string;
    academic_session: string;
    term: string;
    subject_name: string;
    subject_code: string;
    assigned_date: string;
    room_number: string;
    student_count: number;
    max_capacity: number;
    is_primary_teacher: boolean;
    periods_per_week: number;
    stream_name?: string;
    stream_type?: string;
  }>;
  
  // Legacy field for backward compatibility (deprecated)
  teacher_assignments?: Array<{
    id: number;
    grade_level_name: string;
    section_name: string;
    subject_name: string;
    education_level: string;
  }>;
  
  assignment_requests?: AssignmentRequest[];
  schedules?: TeacherSchedule[];
}

export interface AssignmentRequest {
  id: number;
  teacher: number;
  teacher_name: string;
  teacher_id: number;
  request_type: 'subject' | 'class' | 'schedule' | 'additional';
  title: string;
  description: string;
  requested_subjects: number[];
  requested_subjects_names: string[];
  requested_grade_levels: number[];
  requested_grade_levels_names: string[];
  requested_sections: number[];
  requested_sections_names: string[];
  preferred_schedule: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  admin_notes: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: number;
  reviewed_by_name?: string;
  days_since_submitted: number;
}

export interface TeacherSchedule {
  id: number;
  teacher: number;
  teacher_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject: number;
  subject_name: string;
  classroom: number;
  classroom_name: string;
  room_number: string;
  is_active: boolean;
  academic_session: string;
  term: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTeacherData {
  user: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    bio?: string;
  };
  employee_id: string;
  staff_type: 'teaching' | 'non-teaching';
  level?: 'nursery' | 'primary' | 'junior_secondary' | 'senior_secondary' | 'secondary';
  phone_number?: string;
  address?: string;
  date_of_birth?: string;
  hire_date: string;
  qualification?: string;
  specialization?: string;
  subjects?: number[];
  // Updated to use new assignment structure
  assignments?: Array<{
    classroom_id: number;
    subject_id: number;
    is_primary_teacher?: boolean;
    periods_per_week?: number;
  }>;
  photo?: string;
}

export interface UpdateTeacherData {
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    bio?: string;
  };
  employee_id?: string;
  staff_type?: 'teaching' | 'non-teaching';
  level?: 'nursery' | 'primary' | 'junior_secondary' | 'senior_secondary' | 'secondary';
  phone_number?: string;
  address?: string;
  date_of_birth?: string;
  bio?: string;
  hire_date?: string;
  qualification?: string;
  specialization?: string;
  subjects?: number[];
  // Updated to use new assignment structure
  assignments?: Array<{
    classroom_id: number;
    subject_id: number;
    is_primary_teacher?: boolean;
    periods_per_week?: number;
  }>;
  photo?: string;
  is_active?: boolean;
}

export interface CreateAssignmentRequestData {
  request_type: 'subject' | 'class' | 'schedule' | 'additional';
  title: string;
  description: string;
  requested_subjects?: number[];
  requested_grade_levels?: number[];
  requested_sections?: number[];
  preferred_schedule?: string;
  reason: string;
}

export interface CreateScheduleData {
  day_of_week: string;
  start_time: string;
  end_time: string;
  subject: number;
  classroom: number;
  room_number?: string;
  academic_session?: string;
  term?: string;
}

// New interface for enhanced teacher assignment management
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

export type LevelType = 'nursery' | 'primary' | 'junior_secondary' | 'senior_secondary' | 'secondary' | undefined;


export interface FormData {
  // Step 1 – Personal (required by Teacher model / user creation)
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phoneNumber: string;
  // Step 2 – Professional
 staffType: 'teaching' | 'non-teaching' | string;
  level: LevelType;
  employeeId: string;
  hireDate: string;
  qualification: string;
  subjects: string[];
  assignments: AssignmentRow[];
}



// Add this new interface specifically for the edit form
export interface EditTeacherFormData {
  first_name: string;
  last_name: string;
  email: string;
  employee_id: string;
  phone_number: string;
  address: string;
  qualification: string;
  specialization: string;
  staff_type: 'teaching' | 'non-teaching';
  level: LevelType;
  is_active: boolean;
  photo: string | undefined;
}
export interface Assignment {
  id: string;
  // Primary level: grade + section
  grade_level_id: string;
  section_id: string;
  sectionOptions: Section[];
  // Secondary level: classroom + subject
  classroom_id: string;
  subject_id: string;
  periods_per_week: number;
  is_primary_teacher: boolean;
}

export interface GradeLevel {
  id: number;
  name: string;
  education_level: string;
}

export interface Section {
  id: number;
  name: string;
}

export interface Subject {
  id: number;
  name: string;
  code?: string;
}

export interface SubjectOption {
  id: number;
  name: string;
  code: string;
}

export interface Classroom {
  id: number;
  name: string;
  section: number;
  section_name: string;
  grade_level_name: string;
}

export interface CreateTeacherPayload {
  // User fields
  user_first_name: string;
  user_last_name: string;
  user_email: string;
  user_middle_name?: string;

  // Teacher fields
  phone_number: string;
  employee_id: string;
  hire_date: string;
  staff_type: 'teaching' | 'non-teaching' | string;
  level?: string;
  qualification?: string;
  photo?: string;

  // Assignment fields
  subjects: number[];
  assignments: PrimaryAssignmentPayload[] | SecondaryAssignmentPayload[];
}

export interface PrimaryAssignmentPayload {
  grade_level_id: string | number;
  section_id: string | number;
  subject_ids: (string | number)[];
}

export interface SecondaryAssignmentPayload {
  classroom_id: number;
  subject_id: number;
  is_primary_teacher?: boolean;
  periods_per_week?: number;
}


export interface ClassroomOption {
  id: number;
  name: string;
  section?: number | null;
  section_name?: string;
  grade_level_name?: string;
}

export interface AssignmentRow {
  id: string; // local key only, never sent to backend
  // Primary / nursery
  grade_level_id: string;
  section_id: string;
  sectionOptions: Section[];
  // Secondary
 classroom_id: number | string;
  subject_id: number | string;
  is_primary_teacher: boolean;
  periods_per_week: number;
}

