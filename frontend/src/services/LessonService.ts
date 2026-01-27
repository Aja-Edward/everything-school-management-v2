import { api } from './api';

export interface Lesson {
  id: number;
  title: string;
  description: string;
  lesson_type: string;
  lesson_type_display: string;
  difficulty_level: string;
  difficulty_level_display: string;
  teacher: {
    id: number;
    user: {
      first_name: string;
      last_name: string;
      full_name: string;
    };
  };
  classroom: {
    id: number;
    name: string;
    section: {
      name: string;
      grade_level: {
        name: string;
        education_level: string;
      };
    };
    stream_name?: string;
    stream_type?: string;
  };
  subject: {
    id: number;
    name: string;
    code: string;
  };
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  duration_formatted: string;
  status: string;
  status_display: string;
  actual_start_time?: string;
  actual_end_time?: string;
  completion_percentage: number;
  learning_objectives: string[];
  key_concepts: string[];
  materials_needed: string[];
  assessment_criteria: string[];
  teacher_notes: string;
  lesson_notes: string;
  student_feedback: string;
  admin_notes: string;
  attendance_count: number;
  participation_score: number;
  resources: any[];
  attachments: any[];
  is_recurring: boolean;
  recurring_pattern: string;
  is_active: boolean;
  requires_special_equipment: boolean;
  is_online_lesson: boolean;
  requires_substitution: boolean;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
  is_today: boolean;
  is_upcoming: boolean;
  can_start: boolean;
  can_complete: boolean;
  can_cancel: boolean;
  time_slot: string;
  teacher_name: string;
  classroom_name: string;
  subject_name: string;
  classroom_stream_name?: string;
  classroom_stream_type?: string;
}

export interface LessonCreateData {
  title: string;
  description?: string;
  lesson_type: string;
  difficulty_level: string;
  teacher: number;
  classroom: number;
  subject: number;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  learning_objectives?: string[];
  key_concepts?: string[];
  materials_needed?: string[];
  assessment_criteria?: string[];
  teacher_notes?: string;
  is_recurring?: boolean;
  recurring_pattern?: string;
  requires_special_equipment?: boolean;
  is_online_lesson?: boolean;
}

export interface LessonUpdateData {
  title?: string;
  description?: string;
  lesson_type?: string;
  difficulty_level?: string;
  status?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  completion_percentage?: number;
  learning_objectives?: string[];
  key_concepts?: string[];
  materials_needed?: string[];
  assessment_criteria?: string[];
  teacher_notes?: string;
  lesson_notes?: string;
  student_feedback?: string;
  admin_notes?: string;
  attendance_count?: number;
  participation_score?: number;
  resources?: any[];
  attachments?: any[];
}

export interface LessonFilters {
  search?: string;
  status_filter?: string;
  date_filter?: string;
  teacher_id?: number;
  classroom_id?: number;
  subject_id?: number;
  stream_filter?: string;
  lesson_type?: string;
  difficulty_level?: string;
  is_recurring?: boolean;
  requires_special_equipment?: boolean;
  is_online_lesson?: boolean;
  date_from?: string;
  date_to?: string;
  ordering?: string;
  page_size?: number;
}

export interface LessonStatistics {
  total_lessons: number;
  completed_lessons: number;
  scheduled_lessons: number;
  in_progress_lessons: number;
  cancelled_lessons: number;
  avg_completion_percentage: number;
  upcoming_lessons: number;
  overdue_lessons: number;
  lessons_by_type: Array<{ lesson_type: string; count: number }>;
  lessons_by_status: Array<{ status: string; count: number }>;
}

export interface SchedulingConflict {
  id: number;
  title: string;
  start_time: string;
  end_time: string;
  teacher: string;
  subject: string;
}

// Helper type for API errors
interface ApiError {
  response?: {
    data?: any;
  };
  message?: string;
}

// Type guard to check if error is an ApiError
function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'response' in error;
}

export class LessonService {
  private static baseUrl = '/api/lessons';

  /**
   * Get all lessons with optional filtering
   */
  static async getLessons(filters: LessonFilters = {}): Promise<Lesson[]> {
    try {
      const params = new URLSearchParams();
      
      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      const response = await api.get(`${this.baseUrl}/lessons/?${params.toString()}`);
      return response;
    } catch (error: unknown) {
      console.error('Error fetching lessons:', error);
      throw new Error('Failed to fetch lessons');
    }
  }

  /**
   * Get a single lesson by ID
   */
  static async getLesson(id: number): Promise<Lesson> {
    try {
      const response = await api.get(`${this.baseUrl}/lessons/${id}/`);
      return response;
    } catch (error: unknown) {
      console.error('Error fetching lesson:', error);
      throw new Error('Failed to fetch lesson');
    }
  }

  /**
   * Create a new lesson
   */
  static async createLesson(data: LessonCreateData): Promise<Lesson> {
    try {
      const response = await api.post(`${this.baseUrl}/lessons/`, data);
      return response;
    } catch (error: unknown) {
      console.error('Error creating lesson:', error);
      if (isApiError(error) && error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw new Error('Failed to create lesson');
    }
  }

  /**
   * Update an existing lesson
   */
  static async updateLesson(id: number, data: LessonUpdateData): Promise<Lesson> {
    try {
      const response = await api.patch(`${this.baseUrl}/lessons/${id}/`, data);
      return response;
    } catch (error: unknown) {
      console.error('Error updating lesson:', error);
      if (isApiError(error) && error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw new Error('Failed to update lesson');
    }
  }

  /**
   * Delete a lesson
   */
  static async deleteLesson(id: number): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/lessons/${id}/`);
    } catch (error: unknown) {
      console.error('Error deleting lesson:', error);
      throw new Error('Failed to delete lesson');
    }
  }

  /**
   * Start a lesson
   */
  static async startLesson(id: number): Promise<void> {
    try {
      await api.post(`${this.baseUrl}/lessons/${id}/start_lesson/`, {});
    } catch (error: unknown) {
      console.error('Error starting lesson:', error);
      throw new Error('Failed to start lesson');
    }
  }

  /**
   * Complete a lesson
   */
  static async completeLesson(id: number): Promise<void> {
    try {
      await api.post(`${this.baseUrl}/lessons/${id}/complete_lesson/`, {});
    } catch (error: unknown) {
      console.error('Error completing lesson:', error);
      throw new Error('Failed to complete lesson');
    }
  }

  /**
   * Cancel a lesson
   */
  static async cancelLesson(id: number): Promise<void> {
    try {
      await api.post(`${this.baseUrl}/lessons/${id}/cancel_lesson/`, {});
    } catch (error: unknown) {
      console.error('Error cancelling lesson:', error);
      throw new Error('Failed to cancel lesson');
    }
  }

  /**
   * Update lesson status
   */
  static async updateLessonStatus(id: number, status: string, data?: any): Promise<Lesson> {
    try {
      const response = await api.post(`${this.baseUrl}/lessons/${id}/update_status/`, {
        status,
        ...data
      });
      return response;
    } catch (error: unknown) {
      console.error('Error updating lesson status:', error);
      throw new Error('Failed to update lesson status');
    }
  }

  /**
   * Get lesson progress
   */
  static async getLessonProgress(id: number): Promise<{ progress: number; lesson: Lesson }> {
    try {
      const response = await api.get(`${this.baseUrl}/lessons/${id}/get_progress/`);
      return response;
    } catch (error: unknown) {
      console.error('Error getting lesson progress:', error);
      throw new Error('Failed to get lesson progress');
    }
  }

  /**
   * Update lesson progress
   */
  static async updateLessonProgress(id: number): Promise<{ progress: number; lesson: Lesson }> {
    try {
      const response = await api.post(`${this.baseUrl}/lessons/${id}/update_progress/`, {});
      return response;
    } catch (error: unknown) {
      console.error('Error updating lesson progress:', error);
      throw new Error('Failed to update lesson progress');
    }
  }

  /**
   * Download lesson report
   */
  static async downloadLessonReport(lessonId: number): Promise<void> {
    try {
      const response = await api.get(`${this.baseUrl}/lessons/${lessonId}/download_report/`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lesson_report_${lessonId}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error('Error downloading lesson report:', error);
      throw new Error('Failed to download lesson report');
    }
  }

  /**
   * Get lesson statistics
   */
  static async getStatistics(): Promise<LessonStatistics> {
    try {
      const response = await api.get(`${this.baseUrl}/lessons/statistics/`);
      return response;
    } catch (error: unknown) {
      console.error('Error fetching lesson statistics:', error);
      throw new Error('Failed to fetch lesson statistics');
    }
  }

  /**
   * Get lessons for calendar view
   */
  static async getCalendarLessons(startDate: string, endDate: string): Promise<Lesson[]> {
    try {
      const response = await api.get(`${this.baseUrl}/lessons/calendar/?start_date=${startDate}&end_date=${endDate}`);
      return response;
    } catch (error: unknown) {
      console.error('Error fetching calendar lessons:', error);
      throw new Error('Failed to fetch calendar lessons');
    }
  }

  /**
   * Check for scheduling conflicts
   */
  static async checkConflicts(
    classroomId: number,
    date: string,
    startTime: string,
    endTime: string,
    lessonId?: number
  ): Promise<SchedulingConflict[]> {
    try {
      const params = new URLSearchParams({
        classroom_id: classroomId.toString(),
        date,
        start_time: startTime,
        end_time: endTime
      });

      if (lessonId) {
        params.append('lesson_id', lessonId.toString());
      }

      const response = await api.get(`${this.baseUrl}/lessons/conflicts/?${params.toString()}`);
      return response.conflicts;
    } catch (error: unknown) {
      console.error('Error checking conflicts:', error);
      throw new Error('Failed to check scheduling conflicts');
    }
  }

  /**
   * Bulk create lessons
   */
  static async bulkCreateLessons(lessons: LessonCreateData[]): Promise<{ lessons: Lesson[] }> {
    try {
      const response = await api.post(`${this.baseUrl}/lessons/bulk_create/`, {
        lessons
      });
      return response;
    } catch (error: unknown) {
      console.error('Error bulk creating lessons:', error);
      if (isApiError(error) && error.response?.data) {
        throw new Error(JSON.stringify(error.response.data));
      }
      throw new Error('Failed to bulk create lessons');
    }
  }

  /**
   * Get lesson types
   */
  static getLessonTypes() {
    return [
      { value: 'lecture', label: 'Lecture' },
      { value: 'practical', label: 'Practical' },
      { value: 'discussion', label: 'Discussion' },
      { value: 'assessment', label: 'Assessment' },
      { value: 'revision', label: 'Revision' },
      { value: 'field_trip', label: 'Field Trip' },
      { value: 'project', label: 'Project Work' },
      { value: 'exam', label: 'Examination' },
      { value: 'quiz', label: 'Quiz' },
      { value: 'group_work', label: 'Group Work' },
    ];
  }

  /**
   * Get difficulty levels
   */
  static getDifficultyLevels() {
    return [
      { value: 'beginner', label: 'Beginner' },
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'advanced', label: 'Advanced' },
    ];
  }

  /**
   * Get lesson statuses
   */
  static getLessonStatuses() {
    return [
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'postponed', label: 'Postponed' },
    ];
  }

  /**
   * Get recurring patterns
   */
  static getRecurringPatterns() {
    return [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'biweekly', label: 'Bi-weekly' },
      { value: 'monthly', label: 'Monthly' },
    ];
  }

  /**
   * Calculate duration from start and end times
   */
  static calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    const diffMs = end.getTime() - start.getTime();
    return Math.round(diffMs / (1000 * 60)); // Convert to minutes
  }

  /**
   * Format duration for display
   */
  static formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  /**
   * Get status color
   */
  static getStatusColor(status: string): string {
    const colors = {
      scheduled: 'blue',
      in_progress: 'orange',
      completed: 'green',
      cancelled: 'red',
      postponed: 'purple',
    };
    return colors[status as keyof typeof colors] || 'gray';
  }

  /**
   * Get lesson type icon
   */
  static getLessonTypeIcon(lessonType: string): string {
    const icons = {
      lecture: '📚',
      practical: '🔬',
      discussion: '💬',
      assessment: '📝',
      revision: '🔄',
      field_trip: '🚌',
      project: '📋',
      exam: '📊',
      quiz: '❓',
      group_work: '👥',
    };
    return icons[lessonType as keyof typeof icons] || '📖';
  }
}

// --- Lesson Attendance Service ---
export interface LessonAttendanceRecordBackend {
  id: number;
  lesson: number;
  student: number;
  status: 'present' | 'absent' | 'late' | 'excused' | 'sick';
  arrival_time: string | null;
  notes: string;
}

export async function getLessonAttendance(params?: Record<string, any>) {
  return api.get('/lessons/attendances/', params);
}

export async function addLessonAttendance(data: Partial<LessonAttendanceRecordBackend>) {
  return api.post('/lessons/attendances/', data);
}

export async function updateLessonAttendance(id: number, data: Partial<LessonAttendanceRecordBackend>) {
  return api.patch(`/lessons/attendances/${id}/`, data);
}

export async function deleteLessonAttendance(id: number) {
  return api.delete(`/lessons/attendances/${id}/`);
}

export async function getLessonEnrolledStudents(lessonId: number) {
  return api.get(`/lessons/${lessonId}/enrolled_students/`);
}

// ============================================================================
// LESSON RESOURCES SERVICE
// ============================================================================

export interface LessonResource {
  id: number;
  lesson: number;
  lesson_details?: any;
  title: string;
  description?: string;
  resource_type: 'document' | 'video' | 'link' | 'image' | 'audio' | 'other';
  resource_type_display?: string;
  file_url?: string;
  external_url?: string;
  is_required: boolean;
  uploaded_at: string;
  file_size?: number;
  file_format?: string;
}

export interface CreateLessonResourceData {
  lesson: number;
  title: string;
  description?: string;
  resource_type: string;
  file?: File;
  external_url?: string;
  is_required?: boolean;
}

export interface UpdateLessonResourceData extends Partial<CreateLessonResourceData> {}

export class LessonResourceService {
  private static baseUrl = '/api/lessons/resources';

  /**
   * Get all lesson resources
   */
  static async getLessonResources(params?: {
    lesson_id?: number;
    resource_type?: string;
    is_required?: boolean;
  }): Promise<LessonResource[]> {
    try {
      const response = await api.get(this.baseUrl, params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching lesson resources:', error);
      throw error;
    }
  }

  /**
   * Get a single lesson resource
   */
  static async getLessonResource(id: number): Promise<LessonResource> {
    try {
      const response = await api.get(`${this.baseUrl}/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching lesson resource ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a lesson resource
   */
  static async createLessonResource(data: CreateLessonResourceData): Promise<LessonResource> {
    try {
      // If file upload, use FormData
      if (data.file) {
        const formData = new FormData();
        formData.append('lesson', data.lesson.toString());
        formData.append('title', data.title);
        if (data.description) formData.append('description', data.description);
        formData.append('resource_type', data.resource_type);
        formData.append('file', data.file);
        if (data.is_required !== undefined) formData.append('is_required', data.is_required.toString());

        const response = await fetch(this.baseUrl + '/', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
      } else {
        // Regular JSON request
        const response = await api.post(this.baseUrl, data);
        return response;
      }
    } catch (error) {
      console.error('Error creating lesson resource:', error);
      throw error;
    }
  }

  /**
   * Update a lesson resource
   */
  static async updateLessonResource(id: number, data: UpdateLessonResourceData): Promise<LessonResource> {
    try {
      const response = await api.patch(`${this.baseUrl}/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating lesson resource ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a lesson resource
   */
  static async deleteLessonResource(id: number): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/${id}/`);
    } catch (error) {
      console.error(`Error deleting lesson resource ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get resources for a specific lesson
   */
  static async getResourcesForLesson(lessonId: number): Promise<LessonResource[]> {
    return this.getLessonResources({ lesson_id: lessonId });
  }

  /**
   * Get required resources for a lesson
   */
  static async getRequiredResources(lessonId: number): Promise<LessonResource[]> {
    return this.getLessonResources({ lesson_id: lessonId, is_required: true });
  }
}

// ============================================================================
// LESSON ASSESSMENTS SERVICE
// ============================================================================

export interface LessonAssessment {
  id: number;
  lesson: number;
  lesson_details?: any;
  title: string;
  description?: string;
  assessment_type: 'quiz' | 'assignment' | 'project' | 'presentation' | 'test' | 'exam' | 'other';
  assessment_type_display?: string;
  total_points: number;
  weight_percentage: number;
  due_date?: string;
  instructions?: string;
  rubric_url?: string;
  is_graded: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateLessonAssessmentData {
  lesson: number;
  title: string;
  description?: string;
  assessment_type: string;
  total_points: number;
  weight_percentage: number;
  due_date?: string;
  instructions?: string;
  rubric_url?: string;
}

export interface UpdateLessonAssessmentData extends Partial<CreateLessonAssessmentData> {
  is_graded?: boolean;
}

export class LessonAssessmentService {
  private static baseUrl = '/api/lessons/assessments';

  /**
   * Get all lesson assessments
   */
  static async getLessonAssessments(params?: {
    lesson_id?: number;
    assessment_type?: string;
    due_date?: string;
  }): Promise<LessonAssessment[]> {
    try {
      const response = await api.get(this.baseUrl, params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching lesson assessments:', error);
      throw error;
    }
  }

  /**
   * Get a single lesson assessment
   */
  static async getLessonAssessment(id: number): Promise<LessonAssessment> {
    try {
      const response = await api.get(`${this.baseUrl}/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching lesson assessment ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a lesson assessment
   */
  static async createLessonAssessment(data: CreateLessonAssessmentData): Promise<LessonAssessment> {
    try {
      const response = await api.post(this.baseUrl, data);
      return response;
    } catch (error) {
      console.error('Error creating lesson assessment:', error);
      throw error;
    }
  }

  /**
   * Update a lesson assessment
   */
  static async updateLessonAssessment(id: number, data: UpdateLessonAssessmentData): Promise<LessonAssessment> {
    try {
      const response = await api.patch(`${this.baseUrl}/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating lesson assessment ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a lesson assessment
   */
  static async deleteLessonAssessment(id: number): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/${id}/`);
    } catch (error) {
      console.error(`Error deleting lesson assessment ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get assessments for a specific lesson
   */
  static async getAssessmentsForLesson(lessonId: number): Promise<LessonAssessment[]> {
    return this.getLessonAssessments({ lesson_id: lessonId });
  }

  /**
   * Get upcoming assessments
   */
  static async getUpcomingAssessments(): Promise<LessonAssessment[]> {
    const today = new Date().toISOString().split('T')[0];
    const assessments = await this.getLessonAssessments({ due_date: today });
    return assessments.filter(a => a.due_date && a.due_date >= today);
  }

  /**
   * Mark assessment as graded
   */
  static async markAsGraded(id: number): Promise<LessonAssessment> {
    return this.updateLessonAssessment(id, { is_graded: true });
  }
}

export const lessonResourceService = LessonResourceService;
export const lessonAssessmentService = LessonAssessmentService;