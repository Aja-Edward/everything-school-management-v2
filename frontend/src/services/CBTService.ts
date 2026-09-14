import api from './api';

export type CBTPaperStatus = 'draft' | 'published' | 'closed';
export type CBTResultRelease = 'on_submit' | 'after_close' | 'manual';

export interface CBTSection {
  key: string;
  title: string;
  instructions: string;
}

export interface CBTPaper {
  id: number;
  exam: number;
  exam_title: string;
  exam_status: string;
  status: CBTPaperStatus;
  opens_at: string | null;
  closes_at: string | null;
  duration_minutes: number | null;
  include_objective: boolean;
  include_theory: boolean;
  objective_questions_per_attempt: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  allow_backtracking: boolean;
  max_attempts: number;
  access_code: string;
  result_release: CBTResultRelease;
  results_released_at: string | null;
  instructions: string;
  sections: CBTSection[];
  published_at: string | null;
  objective_count: number;
  text_count: number;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export type CBTPaperSettings = Partial<Pick<CBTPaper,
  | 'opens_at' | 'closes_at' | 'duration_minutes'
  | 'include_objective' | 'include_theory' | 'objective_questions_per_attempt'
  | 'shuffle_questions' | 'shuffle_options' | 'allow_backtracking' | 'max_attempts'
  | 'access_code' | 'result_release'>>;

export interface CBTCheck {
  ready: boolean;
  problems: string[];
  sections: CBTSection[];
  objective_count: number;
  text_count: number;
}

export interface CBTStudentPart {
  id?: string | number;
  question?: string;
  marks?: number;
  table?: unknown;
  parts?: CBTStudentPart[];
}

export interface CBTStudentQuestion {
  id: number;
  number: number;
  section: string;
  kind: 'objective' | 'text';
  content: string;
  image_url: string;
  marks: string;
  options?: { key: string; text: string }[];
  parts?: CBTStudentPart[];
  table?: unknown;
}

export interface CBTStudentPaper {
  exam_title: string;
  subject: string;
  instructions: string;
  sections: CBTSection[];
  duration_minutes: number | null;
  allow_backtracking: boolean;
  total_marks: string;
  questions: CBTStudentQuestion[];
  is_draft: boolean;
  problems: string[];
}

export type CBTBankQuestionType = 'objective' | 'theory';

/** How many bank questions of one topic and difficulty could be drawn into the exam. */
export interface CBTBankAvailability {
  topic: string;
  difficulty: string;
  difficulty_name: string;
  count: number;
}

export interface CBTBankSummary {
  subject: string;
  grade_level: string;
  question_type: CBTBankQuestionType;
  any_grade_level: boolean;
  available: CBTBankAvailability[];
  /** Why this user can't add questions to the exam right now, if they can't. */
  edit_refusal: string | null;
}

export interface CBTBankDraw {
  question_type: CBTBankQuestionType;
  count: number;
  topics: string[];
  difficulties: string[];
  any_grade_level: boolean;
}

/** The sentences the API returns when it refuses a paper, or the error's own message. */
export const cbtProblems = (error: any): string[] => {
  const data = error?.response?.data;
  if (Array.isArray(data?.problems) && data.problems.length) return data.problems;
  if (data && typeof data === 'object') {
    const messages = Object.values(data).flat().filter((m): m is string => typeof m === 'string');
    if (messages.length) return messages;
  }
  return [error?.message || 'Something went wrong. Please try again.'];
};

const PAPERS = '/api/cbt/papers/';

export const CBTService = {
  async getPaperForExam(examId: number): Promise<CBTPaper | null> {
    const papers: CBTPaper[] = await api.get(PAPERS, { exam: examId });
    return papers?.[0] ?? null;
  },

  /** Papers for a page of exams, keyed by exam id. */
  async getPapersForExams(examIds: number[]): Promise<Record<number, CBTPaper>> {
    if (!examIds.length) return {};
    const papers: CBTPaper[] = await api.get(PAPERS, { exam__in: examIds.join(',') });
    return Object.fromEntries((papers || []).map((paper) => [paper.exam, paper]));
  },

  createPaper(examId: number, settings: CBTPaperSettings = {}): Promise<CBTPaper> {
    return api.post(PAPERS, { exam: examId, ...settings });
  },

  updatePaper(paperId: number, settings: CBTPaperSettings): Promise<CBTPaper> {
    return api.patch(`${PAPERS}${paperId}/`, settings);
  },

  deletePaper(paperId: number): Promise<void> {
    return api.delete(`${PAPERS}${paperId}/`);
  },

  checkPaper(paperId: number): Promise<CBTCheck> {
    return api.post(`${PAPERS}${paperId}/check/`);
  },

  previewPaper(paperId: number): Promise<CBTStudentPaper> {
    return api.get(`${PAPERS}${paperId}/preview/`);
  },

  publishPaper(paperId: number): Promise<CBTPaper> {
    return api.post(`${PAPERS}${paperId}/publish/`);
  },

  unpublishPaper(paperId: number): Promise<CBTPaper> {
    return api.post(`${PAPERS}${paperId}/unpublish/`);
  },

  getBankSummary(paperId: number, questionType: CBTBankQuestionType, anyGradeLevel: boolean): Promise<CBTBankSummary> {
    return api.get(`${PAPERS}${paperId}/bank/`, {
      question_type: questionType,
      any_grade_level: anyGradeLevel ? 'true' : undefined,
    });
  },

  /** Adds random bank questions to the exam behind the paper. */
  drawFromBank(paperId: number, draw: CBTBankDraw): Promise<{ added: number; question_ids: number[] }> {
    return api.post(`${PAPERS}${paperId}/draw/`, draw);
  },
};

export default CBTService;
