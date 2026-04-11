import api from '@/services/api';
import { API_BASE_URL } from '@/services/api';
import type {
  Teacher,
  AssignmentRequest,
  UpdateTeacherData,
  TeacherSchedule,
  CreateAssignmentRequestData,
  CreateScheduleData,
  GradeLevel,
  CreateTeacherPayload,
  Section,
  SubjectOption,
  ClassroomOption,
} from '@/types/teacher';

// ─── Shared auth helper ───────────────────────────────────────────────────────

const getAuthHeaders = (): Record<string, string> => {
  const token =
    localStorage.getItem('access_token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('token') ||
    localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};




// ─── TeacherService ───────────────────────────────────────────────────────────

class TeacherService {
  // ── Teacher CRUD ────────────────────────────────────────────────────────────

  async getTeachers(params?: {
    search?: string;
    level?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Teacher[]; count: number }> {
    try {
      // ✅ Correct
      const response = await api.get('/api/teachers/teachers/', { ...params, _t: Date.now() });
      if (response?.results && Array.isArray(response.results)) {
        return { results: response.results, count: response.count ?? response.results.length };
      } else if (Array.isArray(response)) {
        return { results: response, count: response.length };
      }
      return { results: [], count: 0 };
    } catch (error) {
      console.error('Error in getTeachers:', error);
      return { results: [], count: 0 };
    }
  }

  async getTeacher(id: number): Promise<Teacher> {
    return api.get(`/api/teachers/teachers/${id}/`);
  }

  async getTeacherByUserId(userId: number): Promise<Teacher> {
    return api.get(`/api/teachers/teachers/by-user/${userId}/`);
  }

  async getMe(): Promise<Teacher> {
    return api.get('/api/teachers/teachers/me/');
  }

  async createTeacher(
    payload: CreateTeacherPayload,
  ): Promise<Teacher & { user_username?: string; user_password?: string }> {
    const token =
      localStorage.getItem('access_token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('token');

    if (!token) throw new Error('Not authenticated. Please log in again.');

    const res = await fetch(`${API_BASE_URL}/teachers/teachers/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg =
        err.detail ||
        err.message ||
        err.error ||
        Object.entries(err)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('; ') ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return res.json();
  }

  async updateTeacher(id: number, data: UpdateTeacherData): Promise<Teacher> {
    return api.patch(`/api/teachers/teachers/${id}/`, data);
  }

  async deleteTeacher(id: number): Promise<{ message: string; status: string }> {
    return api.delete(`/api/teachers/teachers/${id}/`);
  }

  async activateTeacher(id: number): Promise<{ status: string }> {
    return api.post(`/api/teachers/teachers/${id}/activate/`, {});
  }

  async deactivateTeacher(id: number): Promise<{ status: string }> {
    return api.post(`/api/teachers/teachers/${id}/deactivate/`, {});
  }

  async getTeacherStatistics(): Promise<{
    total: number;
    active: number;
    inactive: number;
    by_level: { nursery: number; primary: number; secondary: number };
  }> {
    const { results: teachers } = await this.getTeachers();
    const total = teachers.length;
    const active = teachers.filter((t) => t.is_active).length;
    const inactive = total - active;
    return {
      total,
      active,
      inactive,
      by_level: {
        nursery: teachers.filter((t) => t.level === 'nursery' && t.is_active).length,
        primary: teachers.filter((t) => t.level === 'primary' && t.is_active).length,
        secondary: teachers.filter(
          (t) =>
            (t.level === 'junior_secondary' || t.level === 'senior_secondary') && t.is_active,
        ).length,
      },
    };
  }

  async getTeacherWorkload(teacherId: number) {
    return api.get(`/api/teachers/teachers/${teacherId}/workload/`);
  }


  /** Form level value → GradeLevelViewSet named action path segment */
  private static readonly GRADE_ACTION: Record<string, string> = {
    nursery:          'nursery_grades',
    primary:          'primary_grades',
    junior_secondary: 'junior_secondary_grades',
    senior_secondary: 'senior_secondary_grades',
  };

  /** Form level value → education_level__level_type string (uppercase) */
  private static readonly LEVEL_TYPE: Record<string, string> = {
    nursery:          'NURSERY',
    primary:          'PRIMARY',
    junior_secondary: 'JUNIOR_SECONDARY',
    senior_secondary: 'SENIOR_SECONDARY',
  };

  /**
   * GET /classrooms/grades/{action}/
   * Uses named actions instead of broken string filter.
   */
  async getGradeLevelsByEducationLevel(level: string): Promise<GradeLevel[]> {
    const action = TeacherService.GRADE_ACTION[level];
    if (!action) throw new Error(`Unknown level: "${level}"`);
    const res = await fetch(
      `${API_BASE_URL}/classrooms/grades/${action}/`,
      { headers: getAuthHeaders() },
    );
    if (!res.ok) throw new Error(`Failed to fetch grade levels (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.results ?? [];
  }

  /**
   * GET /classrooms/grades/{id}/sections/
   */
  async getSectionsByGradeLevel(gradeLevelId: string | number): Promise<Section[]> {
    const res = await fetch(
      `${API_BASE_URL}/classrooms/grades/${gradeLevelId}/sections/`,
      { headers: getAuthHeaders() },
    );
    if (!res.ok) throw new Error(`Failed to fetch sections (${res.status})`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.results ?? [];
  }

  /**
   * GET /subjects/?education_level=<UPPERCASE_LEVEL_TYPE>
   */
  async getSubjectsByEducationLevel(level: string): Promise<SubjectOption[]> {
  const levelType = TeacherService.LEVEL_TYPE[level];
  if (!levelType) throw new Error(`Unknown level: "${level}"`);

  const res = await fetch(
    `${API_BASE_URL}/subjects/?education_levels=${levelType}`,  // ← was education_level
    { headers: getAuthHeaders() },
  );
  if (!res.ok) throw new Error(`Failed to fetch subjects (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.results ?? [];
}

  /**
   * GET /classrooms/classrooms/?education_level__level_type=<UPPERCASE_LEVEL_TYPE>
   */
  async getClassroomsByEducationLevel(level: string): Promise<ClassroomOption[]> {
    const levelType = TeacherService.LEVEL_TYPE[level];
    if (!levelType) throw new Error(`Unknown level: "${level}"`);
    const res = await fetch(
      `${API_BASE_URL}/classrooms/classrooms/?education_level__level_type=${levelType}`,
      { headers: getAuthHeaders() },
    );
    if (!res.ok) throw new Error(`Failed to fetch classrooms (${res.status})`);
    const data = await res.json();
    const arr: any[] = Array.isArray(data) ? data : data.results ?? [];
    return arr.map((c) => ({
      id: c.id,
      name: c.name || `${c.grade_level_name ?? ''} ${c.section_name ?? ''}`.trim(),
      section: c.section,
      section_name: c.section_name,
      grade_level_name: c.grade_level_name,
    }));
  }

  // ── Assignment Management ────────────────────────────────────────────────────

  async getAssignmentRequests(params?: {
    teacher_id?: number;
    status?: string;
    request_type?: string;
  }): Promise<AssignmentRequest[]> {
    return api.get('/api/teachers/assignment-requests/', params);
  }

  async createAssignmentRequest(data: CreateAssignmentRequestData): Promise<AssignmentRequest> {
    return api.post('/api/teachers/assignment-requests/', data);
  }

  async updateAssignmentRequest(
    id: number,
    data: Partial<AssignmentRequest>,
  ): Promise<AssignmentRequest> {
    return api.patch(`/api/teachers/assignment-requests/${id}/`, data);
  }

  async deleteAssignmentRequest(id: number): Promise<void> {
    await api.delete(`/api/teachers/assignment-requests/${id}/`);
  }

  async approveAssignmentRequest(id: number): Promise<{ status: string }> {
    return api.post(`/api/teachers/assignment-requests/${id}/approve/`, {});
  }

  async rejectAssignmentRequest(id: number, admin_notes?: string): Promise<{ status: string }> {
    return api.post(`/api/teachers/assignment-requests/${id}/reject/`, { admin_notes });
  }

  async cancelAssignmentRequest(id: number): Promise<{ status: string }> {
    return api.post(`/api/teachers/assignment-requests/${id}/cancel/`, {});
  }

  // ── Teacher Schedules ────────────────────────────────────────────────────────

  async getTeacherSchedules(params?: {
    teacher_id?: number;
    academic_session?: string;
    term?: string;
    day_of_week?: string;
  }): Promise<TeacherSchedule[]> {
    return api.get('/api/teachers/teacher-schedules/', params);
  }

  async getWeeklySchedule(
    teacher_id: number,
  ): Promise<{ weekly_schedule: any; schedules: TeacherSchedule[] }> {
    return api.get('/api/teachers/teacher-schedules/weekly_schedule/', {
      params: { teacher_id },
    });
  }

  async createTeacherSchedule(data: CreateScheduleData): Promise<TeacherSchedule> {
    return api.post('/api/teachers/teacher-schedules/', data);
  }

  async updateTeacherSchedule(
    id: number,
    data: Partial<TeacherSchedule>,
  ): Promise<TeacherSchedule> {
    return api.patch(`/api/teachers/teacher-schedules/${id}/`, data);
  }

  async deleteTeacherSchedule(id: number): Promise<void> {
    await api.delete(`/api/teachers/teacher-schedules/${id}/`);
  }

  async bulkCreateSchedules(
    teacher_id: number,
    schedules: CreateScheduleData[],
  ): Promise<{ message: string; schedules: TeacherSchedule[] }> {
    return api.post('/api/teachers/teacher-schedules/bulk_create/', { teacher_id, schedules });
  }

  // ── Assignment Management Utilities ─────────────────────────────────────────

  async getAvailableSubjects(): Promise<SubjectOption[]> {
    const response = await api.get('/api/teachers/assignment-management/available_subjects/');
    return response.subjects ?? response;
  }

  async getAvailableGradeLevels(): Promise<GradeLevel[]> {
    const response = await api.get('/api/teachers/assignment-management/available_grade_levels/');
    return response.grade_levels ?? response;
  }

  async getAvailableSections(): Promise<Array<{ id: number; name: string; grade_level: string }>> {
    const response = await api.get('/api/teachers/assignment-management/available_sections/');
    return response.sections ?? response;
  }

  async getTeacherAssignmentsSummary(teacher_id: number): Promise<{
    total_subjects: number;
    total_classes: number;
    total_students: number;
    pending_requests: number;
    teaching_hours: number;
  }> {
    return api.get('/api/teachers/assignment-management/teacher_assignments_summary/', {
      params: { teacher_id },
    });
  }
}

export default new TeacherService();