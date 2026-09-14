import api from './api';

export type InvigilationState = 'not_started' | 'in_progress' | 'submitted' | 'timed_out' | 'voided';

export interface InvigilationPaperSummary {
  id: number;
  exam_title: string;
  subject: string;
  grade_level: string;
  status: 'published' | 'closed';
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  in_progress: number;
  finished: number;
}

export interface InvigilationRow {
  student: { id: number; name: string; registration_number: string; class: string; section: string };
  state: InvigilationState;
  offline: boolean;
  attempts_used: number;
  extra_time_minutes: number;
  warnings: Partial<Record<string, number>>;
  attempt: null | {
    id: number;
    number: number;
    status: InvigilationState;
    started_at: string;
    deadline: string;
    seconds_left: number;
    submitted_at: string | null;
    answered: number;
    question_count: number;
    last_seen_at: string | null;
    seconds_since_seen: number | null;
    ip_address: string | null;
    user_agent: string;
  };
}

export interface InvigilationEvent {
  id: number;
  attempt: number;
  student: string;
  kind: string;
  label: string;
  recorded_at: string;
  client_time: string | null;
  actor: string;
  detail: Record<string, any>;
  ip_address: string | null;
}

export interface InvigilationBoardData {
  server_time: string;
  paper: {
    id: number;
    exam_title: string;
    subject: string;
    grade_level: string;
    status: string;
    opens_at: string;
    closes_at: string;
    duration_minutes: number;
    access_code: string;
    max_attempts: number;
  };
  summary: { students: number; not_started: number; in_progress: number; finished: number; voided: number; offline: number };
  students: InvigilationRow[];
  recent_events: InvigilationEvent[];
}

export type InvigilationAction = 'extend' | 'submit' | 'reopen' | 'void';

const BASE = '/api/cbt/invigilate/';

export const InvigilationService = {
  papers(): Promise<{ server_time: string; papers: InvigilationPaperSummary[] }> {
    return api.get(BASE);
  },

  board(paperId: number): Promise<InvigilationBoardData> {
    return api.get(`${BASE}${paperId}/`);
  },

  events(paperId: number, attemptId: number): Promise<{ events: InvigilationEvent[] }> {
    return api.get(`${BASE}${paperId}/events/`, { attempt: attemptId });
  },

  /** Returns the refreshed board. */
  act(paperId: number, action: InvigilationAction, body: { attempt: number; minutes?: number; reason?: string }): Promise<InvigilationBoardData> {
    return api.post(`${BASE}${paperId}/${action}/`, body);
  },
};

export default InvigilationService;
