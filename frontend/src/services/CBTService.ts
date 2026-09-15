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
  result_exam_session: number | null;
  result_component: number | null;
  results_pushed_at: string | null;
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
  | 'access_code' | 'result_release' | 'result_exam_session' | 'result_component'>>;

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

export interface CBTObjectiveMarking {
  id: number;
  order: number;
  number: number;
  content: string;
  options: { key: string; text: string }[];
  correct_option: string;
  award_all: boolean;
  marks: string;
  given_to: number;
  answered: number;
  correct: number;
  option_counts: Record<string, number>;
}

export interface CBTTextMarking {
  id: number;
  order: number;
  number: number;
  section: string;
  content: string;
  marks: string;
  given_to: number;
  answers: number;
  marked: number;
}

export interface CBTMarkingOverview {
  finished_attempts: number;
  in_progress: number;
  fully_marked: number;
  still_to_mark: number;
  objective: CBTObjectiveMarking[];
  text: CBTTextMarking[];
  results: {
    exam_session: number | null;
    exam_session_name: string;
    component: number | null;
    component_name: string;
    component_max: string;
    pushed_at: string | null;
    pushed_by: string;
  };
  release: { mode: CBTResultRelease; released_at: string | null };
}

export interface CBTAnswerToMark {
  attempt: number;
  student: string;
  text_answer: string;
  marks_awarded: string | null;
  marked_by: string;
  marked_at: string | null;
}

export interface CBTQuestionToMark {
  question: {
    id: number;
    number: number;
    section: string;
    content: string;
    parts: CBTStudentPart[];
    marks: string;
    marking_guide: string;
  };
  answers: CBTAnswerToMark[];
}

export interface CBTResultTargets {
  education_level: string;
  supported: boolean;
  exam_sessions: { id: number; name: string; academic_session: string; term: string }[];
  components: { id: number; name: string; code: string; max_score: string; component_type: string }[];
}

export interface CBTPushResults {
  pushed: number;
  skipped: { student: string; reason: string }[];
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

  marking(paperId: number): Promise<CBTMarkingOverview> {
    return api.get(`${PAPERS}${paperId}/marking/`);
  },

  questionToMark(paperId: number, questionId: number): Promise<CBTQuestionToMark> {
    return api.get(`${PAPERS}${paperId}/marking/questions/${questionId}/`);
  },

  /** `marks` null clears a mark. Returns the refreshed overview. */
  saveMarks(paperId: number, marks: { attempt: number; question: number; marks: number | null }[]): Promise<CBTMarkingOverview> {
    return api.post(`${PAPERS}${paperId}/marking/marks/`, { marks });
  },

  correctAnswerKey(paperId: number, questionId: number, change: { correct_option?: string; award_all?: boolean; reason: string }): Promise<{ remarked_attempts: number; marking: CBTMarkingOverview }> {
    return api.post(`${PAPERS}${paperId}/questions/${questionId}/answer-key/`, change);
  },

  resultTargets(paperId: number): Promise<CBTResultTargets> {
    return api.get(`${PAPERS}${paperId}/results/targets/`);
  },

  pushResults(paperId: number): Promise<CBTPushResults> {
    return api.post(`${PAPERS}${paperId}/results/push/`);
  },

  releaseResults(paperId: number): Promise<CBTPaper> {
    return api.post(`${PAPERS}${paperId}/results/release/`);
  },

  withholdResults(paperId: number): Promise<CBTPaper> {
    return api.post(`${PAPERS}${paperId}/results/withhold/`);
  },
};

export default CBTService;
