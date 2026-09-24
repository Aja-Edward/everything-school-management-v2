/**
 * The student side of CBT: /api/cbt/my/exams/ and /api/cbt/attempts/.
 *
 * Every attempt request carries the device's session token in X-CBT-Session,
 * which the shared `api` client can't add. So these calls use fetch directly,
 * with the same headers, cookie credentials and one retry after a token
 * refresh. Tokens are kept in localStorage, so a reloaded page carries on as
 * the same device.
 */

import type { SoundClip } from './SoundClipService';
import { API_BASE_URL, buildHeaders, handleResponseError } from './api';

export type CBTExamState = 'upcoming' | 'open' | 'in_progress' | 'done' | 'missed';
export type CBTAttemptStatus = 'in_progress' | 'submitted' | 'timed_out' | 'voided';

export interface CBTAttemptState {
  id: number;
  paper: number;
  exam_title: string;
  number: number;
  status: CBTAttemptStatus;
  started_at: string;
  deadline: string;
  submitted_at: string | null;
  server_time: string;
  seconds_left: number;
  allow_backtracking: boolean;
  furthest_position: number;
  question_count: number;
  /** Times each sound clip has been started: {"question:<id>" | "section:<key>": plays}. */
  audio_plays: Record<string, number>;
  /** Present once the paper is fully marked and the school's release setting allows it. */
  score?: { total: string; max: string; percentage: number } | null;
  /** Why there is no score yet, for `scorePendingMessage`. Empty when there is nothing to wait for. */
  score_pending?: CBTScorePending;
  session_token?: string;
}

export type CBTScorePending = '' | 'after_close' | 'release' | 'marking';

const SCORE_PENDING: Record<string, string> = {
  after_close: 'Your score will show when the exam closes.',
  release: 'Your score will show when your teacher releases it.',
  marking: 'Your score will show once your answers have been marked.',
};

/** What to tell a student who has finished but has no score yet. */
export const scorePendingMessage = (pending?: CBTScorePending): string =>
  SCORE_PENDING[pending ?? ''] ?? 'Your score will show when it is released.';

export interface CBTMyExam {
  paper: number;
  exam_title: string;
  subject: string;
  opens_at: string;
  closes_at: string;
  duration_minutes: number;
  requires_access_code: boolean;
  state: CBTExamState;
  attempts_left: number;
  attempt: CBTAttemptState | null;
}

export interface CBTPart {
  id?: string | number;
  question?: string;
  marks?: number;
  table?: unknown;
  parts?: CBTPart[];
}

/**
 * How a question is answered:
 * - objective: choose one option;
 * - true_false: choose True or False, the question's two options;
 * - multiple: tick every option that applies. The answer's selected_option is every key ticked, in order: "AC";
 * - numeric: type a number, into text_answer, with `unit` shown beside the box;
 * - text: type an answer, marked by a teacher.
 */
export type CBTQuestionKind = 'objective' | 'true_false' | 'multiple' | 'numeric' | 'text';

export const CHOICE_KINDS: CBTQuestionKind[] = ['objective', 'true_false', 'multiple'];

export interface CBTQuestion {
  id: number;
  number: number;
  section: string;
  kind: CBTQuestionKind;
  content: string;
  image_url: string;
  marks: string;
  options?: { key: string; text: string }[];
  unit?: string;
  audio?: SoundClip;
  parts?: CBTPart[];
  table?: unknown;
}

export interface CBTPaperForStudent {
  exam_title: string;
  subject: string;
  instructions: string;
  sections: { key: string; title: string; instructions: string; audio?: SoundClip }[];
  duration_minutes: number;
  allow_backtracking: boolean;
  total_marks: string;
  questions: CBTQuestion[];
}

export interface CBTAnswer {
  question_id: number;
  selected_option: string;
  text_answer: string;
  flagged: boolean;
}

export interface CBTAttemptDetail {
  attempt: CBTAttemptState;
  paper?: CBTPaperForStudent;
  answers?: CBTAnswer[];
}

export type CBTClientEventKind =
  | 'focus_lost' | 'focus_returned' | 'fullscreen_exited'
  | 'copy_attempted' | 'paste_attempted' | 'connection_lost' | 'reconnected'
  | 'audio_played' | 'audio_failed';

export interface CBTClientEvent {
  kind: CBTClientEventKind;
  client_time: string;
  detail?: Record<string, unknown>;
}

/** An error from the CBT API, with the server's refusal code when there is one. */
export class CBTRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
  /** True when the request never got an answer, so it is worth trying again later. */
  get isNetwork() {
    return this.status === 0;
  }
}

const tokenKey = (attemptId: number) => `cbt:session:${attemptId}`;

export const sessionTokens = {
  get: (attemptId: number) => {
    try { return localStorage.getItem(tokenKey(attemptId)); } catch { return null; }
  },
  set: (attemptId: number, token: string) => {
    try { localStorage.setItem(tokenKey(attemptId), token); } catch { /* storage full or blocked */ }
  },
  clear: (attemptId: number) => {
    try { localStorage.removeItem(tokenKey(attemptId)); } catch { /* ignore */ }
  },
};

const request = async <T>(method: string, path: string, body?: unknown, token?: string | null, retried = false): Promise<T> => {
  const headers = await buildHeaders(method);
  if (token) headers['X-CBT-Session'] = token;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new CBTRequestError('No connection to the school server.', 0);
  }

  if (response.ok) {
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  // handleResponseError refreshes an expired login and asks for one retry.
  try {
    await handleResponseError(response.clone(), path, method);
  } catch (error: any) {
    if (error?.shouldRetry && !retried) return request<T>(method, path, body, token, true);
    const data = error?.response?.data;
    throw new CBTRequestError(
      (data && typeof data === 'object' && data.detail) || error?.message || `Request failed (${response.status})`,
      error?.response?.status ?? response.status,
      data && typeof data === 'object' ? data.code : undefined,
    );
  }
  throw new CBTRequestError(`Request failed (${response.status})`, response.status);
};

export const StudentCBTService = {
  myExams(): Promise<{ server_time: string; exams: CBTMyExam[] }> {
    return request('GET', '/cbt/my/exams/');
  },

  /** Start, resume, or move the attempt to this device. Stores any new session token. */
  async start(paperId: number, knownAttemptId: number | null, accessCode = ''): Promise<CBTAttemptState> {
    const token = knownAttemptId ? sessionTokens.get(knownAttemptId) : null;
    const state = await request<CBTAttemptState>('POST', `/cbt/my/exams/${paperId}/start/`, { access_code: accessCode }, token);
    if (state.session_token) sessionTokens.set(state.id, state.session_token);
    return state;
  },

  attempt(attemptId: number): Promise<CBTAttemptDetail> {
    return request('GET', `/cbt/attempts/${attemptId}/`, undefined, sessionTokens.get(attemptId));
  },

  saveAnswers(attemptId: number, answers: CBTAnswer[]): Promise<{ saved: number; attempt: CBTAttemptState }> {
    return request('POST', `/cbt/attempts/${attemptId}/answers/`, { answers }, sessionTokens.get(attemptId));
  },

  /** `timeSpent`: whole seconds each question was on screen since the last check-in, by question id. */
  heartbeat(
    attemptId: number, position: number, timeSpent: Record<string, number> = {}, audioPlays: Record<string, number> = {},
  ): Promise<CBTAttemptState> {
    return request('POST', `/cbt/attempts/${attemptId}/heartbeat/`,
      { position, time_spent: timeSpent, audio_plays: audioPlays }, sessionTokens.get(attemptId));
  },

  events(attemptId: number, events: CBTClientEvent[]): Promise<{ recorded: number }> {
    return request('POST', `/cbt/attempts/${attemptId}/events/`, { events }, sessionTokens.get(attemptId));
  },

  submit(attemptId: number): Promise<CBTAttemptState> {
    return request('POST', `/cbt/attempts/${attemptId}/submit/`, {}, sessionTokens.get(attemptId));
  },
};

export default StudentCBTService;
