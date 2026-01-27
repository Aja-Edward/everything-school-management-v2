/**
 * Academics Service
 *
 * Manages academic-related operations including curriculum, academic calendar,
 * terms, and academic sessions.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Curriculum {
  id: number;
  name: string;
  description: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  education_level_display: string;
  academic_session: number;
  academic_session_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCurriculumData {
  name: string;
  description: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  academic_session: number;
  is_active?: boolean;
}

export interface UpdateCurriculumData extends Partial<CreateCurriculumData> {}

export interface CurriculumFilters {
  education_level?: string;
  academic_session?: number;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface AcademicCalendarEvent {
  id: number;
  title: string;
  description: string;
  event_type: 'EXAM' | 'HOLIDAY' | 'MEETING' | 'SPORTS' | 'CULTURAL' | 'OTHER';
  event_type_display: string;
  academic_session: number;
  academic_session_name: string;
  term: number | null;
  term_name: string | null;
  start_date: string;
  end_date: string | null;
  location: string;
  is_public: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAcademicCalendarEventData {
  title: string;
  description: string;
  event_type: 'EXAM' | 'HOLIDAY' | 'MEETING' | 'SPORTS' | 'CULTURAL' | 'OTHER';
  academic_session: number;
  term?: number | null;
  start_date: string;
  end_date?: string | null;
  location?: string;
  is_public?: boolean;
  is_active?: boolean;
}

export interface UpdateAcademicCalendarEventData extends Partial<CreateAcademicCalendarEventData> {}

export interface AcademicCalendarFilters {
  event_type?: string;
  academic_session?: number;
  term?: number;
  is_public?: boolean;
  is_active?: boolean;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface Term {
  id: number;
  academic_session: number;
  academic_session_name: string;
  name: 'FIRST_TERM' | 'SECOND_TERM' | 'THIRD_TERM';
  name_display: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicSession {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ACADEMICS SERVICE
// ============================================================================

class AcademicsService {
  // ============================================================================
  // CURRICULUM MANAGEMENT
  // ============================================================================

  /**
   * Get all curricula
   */
  async getCurricula(params?: CurriculumFilters): Promise<Curriculum[]> {
    try {
      const response = await api.get('/api/academics/curricula/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching curricula:', error);
      throw error;
    }
  }

  /**
   * Get a single curriculum by ID
   */
  async getCurriculum(id: number): Promise<Curriculum> {
    try {
      const response = await api.get(`/api/academics/curricula/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching curriculum ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new curriculum
   */
  async createCurriculum(data: CreateCurriculumData): Promise<Curriculum> {
    try {
      const response = await api.post('/api/academics/curricula/', data);
      return response;
    } catch (error) {
      console.error('Error creating curriculum:', error);
      throw error;
    }
  }

  /**
   * Update a curriculum
   */
  async updateCurriculum(id: number, data: UpdateCurriculumData): Promise<Curriculum> {
    try {
      const response = await api.patch(`/api/academics/curricula/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating curriculum ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a curriculum
   */
  async deleteCurriculum(id: number): Promise<void> {
    try {
      await api.delete(`/api/academics/curricula/${id}/`);
    } catch (error) {
      console.error(`Error deleting curriculum ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get curricula by education level
   */
  async getCurriculaByEducationLevel(educationLevel: string, academicSessionId?: number): Promise<Curriculum[]> {
    return this.getCurricula({
      education_level: educationLevel,
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  /**
   * Get curricula by academic session
   */
  async getCurriculaBySession(academicSessionId: number): Promise<Curriculum[]> {
    return this.getCurricula({
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  // ============================================================================
  // ACADEMIC CALENDAR MANAGEMENT
  // ============================================================================

  /**
   * Get all academic calendar events
   */
  async getCalendarEvents(params?: AcademicCalendarFilters): Promise<AcademicCalendarEvent[]> {
    try {
      const response = await api.get('/api/academics/calendar/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Get a single calendar event by ID
   */
  async getCalendarEvent(id: number): Promise<AcademicCalendarEvent> {
    try {
      const response = await api.get(`/api/academics/calendar/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching calendar event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new calendar event
   */
  async createCalendarEvent(data: CreateAcademicCalendarEventData): Promise<AcademicCalendarEvent> {
    try {
      const response = await api.post('/api/academics/calendar/', data);
      return response;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  }

  /**
   * Update a calendar event
   */
  async updateCalendarEvent(id: number, data: UpdateAcademicCalendarEventData): Promise<AcademicCalendarEvent> {
    try {
      const response = await api.patch(`/api/academics/calendar/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating calendar event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(id: number): Promise<void> {
    try {
      await api.delete(`/api/academics/calendar/${id}/`);
    } catch (error) {
      console.error(`Error deleting calendar event ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get upcoming calendar events
   */
  async getUpcomingEvents(): Promise<AcademicCalendarEvent[]> {
    try {
      const response = await api.get('/api/academics/calendar/upcoming/');
      return response;
    } catch (error) {
      console.error('Error fetching upcoming events:', error);
      throw error;
    }
  }

  /**
   * Get events by academic session
   */
  async getEventsBySession(academicSessionId: number): Promise<AcademicCalendarEvent[]> {
    return this.getCalendarEvents({
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  /**
   * Get events by term
   */
  async getEventsByTerm(termId: number): Promise<AcademicCalendarEvent[]> {
    return this.getCalendarEvents({
      term: termId,
      is_active: true,
    });
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType: string, academicSessionId?: number): Promise<AcademicCalendarEvent[]> {
    return this.getCalendarEvents({
      event_type: eventType,
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  /**
   * Get public events
   */
  async getPublicEvents(academicSessionId?: number): Promise<AcademicCalendarEvent[]> {
    return this.getCalendarEvents({
      is_public: true,
      academic_session: academicSessionId,
      is_active: true,
    });
  }

  // ============================================================================
  // TERMS MANAGEMENT
  // ============================================================================

  /**
   * Get all terms
   */
  async getTerms(params?: { academic_session?: number; is_current?: boolean; is_active?: boolean }): Promise<Term[]> {
    try {
      const response = await api.get('/api/academics/terms/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching terms:', error);
      throw error;
    }
  }

  /**
   * Get a single term by ID
   */
  async getTerm(id: number): Promise<Term> {
    try {
      const response = await api.get(`/api/academics/terms/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching term ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get current term
   */
  async getCurrentTerm(): Promise<Term | null> {
    try {
      const response = await api.get('/api/academics/terms/current/');
      return response;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Error fetching current term:', error);
      throw error;
    }
  }

  /**
   * Set a term as current
   */
  async setCurrentTerm(id: number): Promise<{ message: string; term: Term }> {
    try {
      const response = await api.post(`/api/academics/terms/${id}/set_current/`, {});
      return response;
    } catch (error) {
      console.error(`Error setting term ${id} as current:`, error);
      throw error;
    }
  }

  /**
   * Get terms by academic session
   */
  async getTermsBySession(sessionId: number): Promise<Term[]> {
    try {
      const response = await api.get('/api/academics/terms/by_session/', { params: { session_id: sessionId } });
      return response;
    } catch (error) {
      console.error(`Error fetching terms for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get subjects for a term
   */
  async getTermSubjects(termId: number): Promise<{
    term: Term;
    subjects: any[];
    allocations: any[];
    total_subjects: number;
    total_allocations: number;
  }> {
    try {
      const response = await api.get(`/api/academics/terms/${termId}/subjects/`);
      return response;
    } catch (error) {
      console.error(`Error fetching subjects for term ${termId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // ACADEMIC SESSIONS MANAGEMENT
  // ============================================================================

  /**
   * Get all academic sessions
   */
  async getAcademicSessions(params?: { is_current?: boolean; is_active?: boolean }): Promise<AcademicSession[]> {
    try {
      const response = await api.get('/api/academics/sessions/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching academic sessions:', error);
      throw error;
    }
  }

  /**
   * Get a single academic session by ID
   */
  async getAcademicSession(id: number): Promise<AcademicSession> {
    try {
      const response = await api.get(`/api/academics/sessions/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching academic session ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get current academic session
   */
  async getCurrentAcademicSession(): Promise<AcademicSession | null> {
    try {
      const response = await api.get('/api/academics/sessions/current/');
      return response;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error('Error fetching current academic session:', error);
      throw error;
    }
  }

  /**
   * Set an academic session as current
   */
  async setCurrentSession(id: number): Promise<{ message: string; session: AcademicSession }> {
    try {
      const response = await api.post(`/api/academics/sessions/${id}/set_current/`, {});
      return response;
    } catch (error) {
      console.error(`Error setting session ${id} as current:`, error);
      throw error;
    }
  }

  /**
   * Get terms for an academic session
   */
  async getSessionTerms(sessionId: number): Promise<Term[]> {
    try {
      const response = await api.get(`/api/academics/sessions/${sessionId}/terms/`);
      return response;
    } catch (error) {
      console.error(`Error fetching terms for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics for an academic session
   */
  async getSessionStatistics(sessionId: number): Promise<{
    classrooms: number;
    terms: number;
    students: number;
    is_current: boolean;
    is_active: boolean;
  }> {
    try {
      const response = await api.get(`/api/academics/sessions/${sessionId}/statistics/`);
      return response;
    } catch (error) {
      console.error(`Error fetching statistics for session ${sessionId}:`, error);
      throw error;
    }
  }
}

export const academicsService = new AcademicsService();
export default academicsService;
