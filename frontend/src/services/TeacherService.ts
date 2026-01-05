import api from '@/services/api';

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

class TeacherService {
  // Get all teachers
  async getTeachers(params?: { 
    search?: string; 
    level?: string; 
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Teacher[]; count: number }> {
    try {
      const response = await api.get('/api/teachers/teachers/', { 
        params: { 
          ...params,
          _t: Date.now() // Cache busting
        } 
      });
      console.log('Raw API response:', response);
      
      // Handle both response formats: { results: [...] } and direct array
      if (response && response.results && Array.isArray(response.results)) {
        return { results: response.results, count: response.results.length };
      } else if (Array.isArray(response)) {
        return { results: response, count: response.length };
      } else {
        console.warn('Unexpected response format:', response);
        return { results: [], count: 0 };
      }
    } catch (error) {
      console.error('Error in getTeachers:', error);
      return { results: [], count: 0 };
    }
  }

  // Get single teacher
  async getTeacher(id: number): Promise<Teacher> {
    console.log('🔍 TeacherService.getTeacher - Fetching teacher with ID:', id);
    const response = await api.get(`/api/teachers/teachers/${id}/`);
    console.log('🔍 TeacherService.getTeacher - API response:', response);
    return response;
  }

  // Get teacher by user ID
  async getTeacherByUserId(userId: number) {
  try {
    console.log('🔍 TeacherService.getTeacherByUserId - userId:', userId);
    const response = await api.get(`/api/teachers/teachers/by-user/${userId}/`);
    return response;
  } catch (error: any) {
    console.error('Teacher not found by user ID:', userId, error);
    throw error;
  }
}

  // Create teacher
  async createTeacher(data: CreateTeacherData): Promise<Teacher> {
    const response = await api.post('/api/teachers/teachers/', data);
    return response;
  }

  // Update teacher
  async updateTeacher(id: number, data: UpdateTeacherData): Promise<Teacher> {
    // Transform the data to match backend expectations
    const updateData: any = { ...data };
    
    // If user data is provided, keep it as a nested object for the backend
    // The backend should handle updating the nested user object
    if (data.user) {
      updateData.user = data.user;
    }
    
    // Convert subjects from string array to number array if needed
    if (data.subjects && Array.isArray(data.subjects)) {
      updateData.subjects = data.subjects;
    }
    
    // Ensure bio and date_of_birth are included if they exist
    if (data.bio !== undefined) {
      updateData.bio = data.bio;
    }
    if (data.date_of_birth !== undefined) {
      updateData.date_of_birth = data.date_of_birth;
    }
    
    console.log('🔍 TeacherService.updateTeacher - Sending data:', updateData);
    const response = await api.patch(`/api/teachers/teachers/${id}/`, updateData);
    console.log('🔍 TeacherService.updateTeacher - Response:', response);
    return response;
  }

  // Delete teacher
  async deleteTeacher(id: number): Promise<{ message: string; status: string }> {
    const response = await api.delete(`/api/teachers/teachers/${id}/`);
    return response;
  }

  // Activate teacher
  async activateTeacher(id: number): Promise<{ status: string }> {
    const response = await api.post(`/api/teachers/teachers/${id}/activate/`, {});
    return response;
  }

  // Deactivate teacher
  async deactivateTeacher(id: number): Promise<{ status: string }> {
    const response = await api.post(`/api/teachers/teachers/${id}/deactivate/`, {});
    return response;
  }

  // Get teacher statistics
  async getTeacherStatistics(): Promise<{
    total: number;
    active: number;
    inactive: number;
    by_level: {
      nursery: number;
      primary: number;
      secondary: number;
    };
  }> {
    const response = await api.get('/api/teachers/teachers/', { 
      params: { 
        _t: Date.now(),
        statistics: true 
      } 
    });
    
    // Calculate statistics from the response
    const teachers = response.results || response;
    const total = teachers.length;
    const active = teachers.filter((t: Teacher) => t.is_active).length;
    const inactive = total - active;
    
    const by_level = {
      nursery: teachers.filter((t: Teacher) => t.level === 'nursery' && t.is_active).length,
      primary: teachers.filter((t: Teacher) => t.level === 'primary' && t.is_active).length,
      secondary: teachers.filter((t: Teacher) => t.level === 'secondary' && t.is_active).length,
    };

    return { total, active, inactive, by_level };
  }

  // Assignment Request Management
  async getAssignmentRequests(params?: {
    teacher_id?: number;
    status?: string;
    request_type?: string;
  }): Promise<AssignmentRequest[]> {
    const response = await api.get('/api/teachers/assignment-requests/', { params });
    return response;
  }

  async createAssignmentRequest(data: CreateAssignmentRequestData): Promise<AssignmentRequest> {
    const response = await api.post('/api/teachers/assignment-requests/', data);
    return response;
  }

  async updateAssignmentRequest(id: number, data: Partial<AssignmentRequest>): Promise<AssignmentRequest> {
    const response = await api.patch(`/api/teachers/assignment-requests/${id}/`, data);
    return response;
  }

  async deleteAssignmentRequest(id: number): Promise<void> {
    await api.delete(`/api/teachers/assignment-requests/${id}/`);
  }

  async approveAssignmentRequest(id: number): Promise<{ status: string }> {
    const response = await api.post(`/api/teachers/assignment-requests/${id}/approve/`, {});
    return response;
  }

  async rejectAssignmentRequest(id: number, admin_notes?: string): Promise<{ status: string }> {
    const response = await api.post(`/api/teachers/assignment-requests/${id}/reject/`, { admin_notes });
    return response;
  }

  async cancelAssignmentRequest(id: number): Promise<{ status: string }> {
    const response = await api.post(`/api/teachers/assignment-requests/${id}/cancel/`, {});
    return response;
  }

  // Teacher Schedule Management
  async getTeacherSchedules(params?: {
    teacher_id?: number;
    academic_session?: string;
    term?: string;
    day_of_week?: string;
  }): Promise<TeacherSchedule[]> {
    const response = await api.get('/api/teachers/teacher-schedules/', { params });
    return response;
  }

  async getWeeklySchedule(teacher_id: number): Promise<{
    weekly_schedule: any;
    schedules: TeacherSchedule[];
  }> {
    const response = await api.get('/api/teachers/teacher-schedules/weekly_schedule/', {
      params: { teacher_id }
    });
    return response;
  }

  async createTeacherSchedule(data: CreateScheduleData): Promise<TeacherSchedule> {
    const response = await api.post('/api/teachers/teacher-schedules/', data);
    return response;
  }

  async updateTeacherSchedule(id: number, data: Partial<TeacherSchedule>): Promise<TeacherSchedule> {
    const response = await api.patch(`/api/teachers/teacher-schedules/${id}/`, data);
    return response;
  }

  async deleteTeacherSchedule(id: number): Promise<void> {
    await api.delete(`/api/teachers/teacher-schedules/${id}/`);
  }

  async bulkCreateSchedules(teacher_id: number, schedules: CreateScheduleData[]): Promise<{
    message: string;
    schedules: TeacherSchedule[];
  }> {
    const response = await api.post('/api/teachers/teacher-schedules/bulk_create/', {
      teacher_id,
      schedules
    });
    return response;
  }

  // Assignment Management Utilities
  async getAvailableSubjects(): Promise<Array<{ id: number; name: string; code: string }>> {
    const response = await api.get('/api/teachers/assignment-management/available_subjects/');
    return response.subjects;
  }

  async getAvailableGradeLevels(): Promise<Array<{ id: number; name: string; education_level: string }>> {
    const response = await api.get('/api/teachers/assignment-management/available_grade_levels/');
    return response.grade_levels;
  }

  async getAvailableSections(): Promise<Array<{ id: number; name: string; grade_level: string }>> {
    const response = await api.get('/api/teachers/assignment-management/available_sections/');
    return response.sections;
  }

  async getTeacherAssignmentsSummary(teacher_id: number): Promise<{
    total_subjects: number;
    total_classes: number;
    total_students: number;
    pending_requests: number;
    teaching_hours: number;
  }> {
    const response = await api.get('/api/teachers/assignment-management/teacher_assignments_summary/', {
      params: { teacher_id }
    });
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

  async getTeacherAssignments(teacherId?: number, classroomId?: number) {
    const params: any = {};
    if (teacherId) params.teacher = teacherId;
    if (classroomId) params.classroom = classroomId;
    
    const response = await api.get('/api/classrooms/teacher-assignments/', { params });
    return response;
  }

  // Get available classrooms for assignment
  async getAvailableClassrooms(teacherId?: number, subjectId?: number) {
    const params: any = {};
    if (teacherId) params.teacher_id = teacherId;
    if (subjectId) params.subject_id = subjectId;
    
    const response = await api.get('/api/classrooms/classrooms/available-for-assignment/', { params });
    return response;
  }

  // Get teacher workload analysis
  async getTeacherWorkload(teacherId: number) {
    const response = await api.get(`/api/teachers/teachers/${teacherId}/workload/`);
    return response;
  }
}

export default new TeacherService();