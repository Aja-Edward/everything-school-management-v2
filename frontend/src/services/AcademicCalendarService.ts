import api from '@/services/api';

export interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Term {
  id: string;
  name: string;
  academic_session: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  next_term_begins?: string;
  holidays_start?: string;
  holidays_end?: string;
  created_at: string;
}

interface CalendarSummary {
  currentSession: AcademicSession | null;
  currentTerm: Term | null;
  totalSessions: number;
  totalTerms: number;
  activeSessions: number;
  activeTerms: number;
}

const TERM_DISPLAY_NAMES: Record<string, string> = {
  FIRST: 'First Term',
  SECOND: 'Second Term',
  THIRD: 'Third Term',
};

class AcademicCalendarService {
  private readonly base = '/fee';

  async getAcademicSessions(): Promise<AcademicSession[]> {
    try {
      const data = await api.get(`${this.base}/academic-sessions/`);
      return Array.isArray(data) ? data : (data.results ?? []);
    } catch (err) {
      console.error('Error fetching academic sessions:', err);
      return [];
    }
  }

  async getCurrentSession(): Promise<AcademicSession | null> {
    try {
      return await api.get(`${this.base}/academic-sessions/active/`);
    } catch (err) {
      console.error('Error fetching current session:', err);
      return null;
    }
  }

  async getTerms(): Promise<Term[]> {
    try {
      const data = await api.get(`${this.base}/terms/`);
      return Array.isArray(data) ? data : (data.results ?? []);
    } catch (err) {
      console.error('Error fetching terms:', err);
      return [];
    }
  }

  async getCurrentTerm(): Promise<Term | null> {
    try {
      const terms = await this.getTerms();
      return terms.find((t) => t.is_current) ?? null;
    } catch (err) {
      console.error('Error fetching current term:', err);
      return null;
    }
  }

  async getTermsBySession(sessionId: string): Promise<Term[]> {
    try {
      const terms = await this.getTerms();
      return terms.filter((t) => t.academic_session === sessionId);
    } catch (err) {
      console.error('Error fetching terms by session:', err);
      return [];
    }
  }

  async isDateInCurrentTerm(date: Date): Promise<boolean> {
    try {
      const term = await this.getCurrentTerm();
      if (!term) return false;
      const start = new Date(term.start_date);
      const end = new Date(term.end_date);
      return date >= start && date <= end;
    } catch (err) {
      console.error('Error checking date in current term:', err);
      return false;
    }
  }

  async getCalendarSummary(): Promise<CalendarSummary | null> {
    try {
      const [currentSession, currentTerm, allSessions, allTerms] = await Promise.all([
        this.getCurrentSession(),
        this.getCurrentTerm(),
        this.getAcademicSessions(),
        this.getTerms(),
      ]);

      return {
        currentSession,
        currentTerm,
        totalSessions: allSessions.length,
        totalTerms: allTerms.length,
        activeSessions: allSessions.filter((s) => s.is_active).length,
        activeTerms: allTerms.filter((t) => t.is_active).length,
      };
    } catch (err) {
      console.error('Error fetching calendar summary:', err);
      return null;
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  getTermDisplayName(termName: string): string {
    return TERM_DISPLAY_NAMES[termName] ?? termName;
  }
}

export default new AcademicCalendarService();