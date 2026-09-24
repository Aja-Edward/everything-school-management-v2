import api from './api';
import type { CBTQuestionKind } from './StudentCBTService';
import type { SoundClip } from './SoundClipService';

export type { CBTQuestionKind };

export type CBTPaperStatus = 'draft' | 'published' | 'closed';
export type CBTResultRelease = 'on_submit' | 'after_close' | 'manual';

export interface CBTSection {
  key: string;
  title: string;
  instructions: string;
  audio?: SoundClip;
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
  /** Packages made to sit this paper on an exam station. */
  offline_package_count: number;
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
  kind: CBTQuestionKind;
  content: string;
  image_url: string;
  marks: string;
  options?: { key: string; text: string }[];
  unit?: string;
  audio?: SoundClip;
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

export interface CBTCommonAnswer {
  answer: string;
  students: number;
  correct: boolean;
}

export interface CBTObjectiveMarking {
  id: number;
  order: number;
  number: number;
  kind: Exclude<CBTQuestionKind, 'text'>;
  content: string;
  options: { key: string; text: string }[];
  /** The right key, or every right key in order for choose all that apply: "AC". */
  correct_option: string;
  award_all: boolean;
  partial_credit: boolean;
  numeric_answer: string;
  tolerance: string;
  unit: string;
  /** The key as staff read it: "B", "A, C", "12.5 ± 0.1 cm". */
  key: string;
  marks: string;
  given_to: number;
  answered: number;
  /** Fully right. */
  correct: number;
  /** Each key ticked counts once. Empty for numeric questions. */
  option_counts: Record<string, number>;
  /** Numeric questions: the answers given most often. */
  common_answers?: CBTCommonAnswer[];
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

export interface CBTStudentScore {
  attempt: number;
  number: number;
  student: string;
  status: string;
  submitted_at: string | null;
  objective: string;
  text: string;
  /** null until every typed answer of theirs is marked. */
  total: string | null;
  max: string;
  percentage: number | null;
  to_mark: number;
  /** The attempt "Send scores" would use: the student's last finished one. */
  counts_for_results: boolean;
}

export interface CBTMarkingOverview {
  finished_attempts: number;
  in_progress: number;
  fully_marked: number;
  still_to_mark: number;
  students: CBTStudentScore[];
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
    audio?: SoundClip | null;
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

export type CBTAnalysisFlagCode =
  | 'very_hard' | 'very_easy' | 'negative_discrimination' | 'weak_discrimination'
  | 'distractor_draws_strong' | 'unused_option';

export interface CBTAnalysisItem {
  id: number;
  order: number;
  number: number;
  section: string;
  kind: CBTQuestionKind;
  content: string;
  marks: string;
  given_to: number;
  /** The average share of the marks awarded: for a question marked right or wrong, the share right. */
  facility: number | null;
  discrimination: number | null;
  point_biserial?: number | null;
  correct?: number;
  omitted?: number;
  blank?: number;
  unmarked?: number;
  options?: { key: string; text: string }[];
  correct_option?: string;
  award_all?: boolean;
  partial_credit?: boolean;
  key?: string;
  unit?: string;
  common_answers?: CBTCommonAnswer[];
  option_counts?: Record<string, number>;
  top_group_counts?: Record<string, number>;
  bottom_group_counts?: Record<string, number>;
  median_seconds: number | null;
  flags: { code: CBTAnalysisFlagCode; option?: string }[];
  bank: null | { id: number; difficulty: string; suggested_difficulty: string | null };
}

export interface CBTAnalysis {
  students: number;
  enough_students: boolean;
  min_students: number;
  summary: {
    fully_marked: number;
    mean: number | null;
    median: number | null;
    spread: number | null;
    highest: number | null;
    lowest: number | null;
    distribution: { from: number; to: number; students: number }[];
    kr20: number | null;
    kr20_note: string;
  };
  questions: CBTAnalysisItem[];
}

/** A paper as it was taken to a school's exam station. */
export interface CBTOfflinePackage {
  id: string;
  created_at: string;
  created_by: string;
  students: number;
  questions: number;
  /** Questions showing a picture or playing a sound from the internet, which a station may not reach. */
  questions_needing_internet: number;
  attempts_imported: number;
}

/** One student's sign-in slip for the exam station. The PIN is only ever shown when the package is made. */
export interface CBTPinSlip {
  number: number;
  name: string;
  registration_number: string;
  class: string;
  pin: string;
}

/** A station's results file, or a batch of its attempts. */
export interface CBTOfflineResults {
  format: 'cbt-offline-results';
  version: number;
  package_id: string;
  exported_at: string;
  exam_title: string;
  attempts: unknown[];
  still_in_progress: number;
  voided: number;
}

export interface CBTOfflineImport {
  imported: number;
  already_imported: number;
  refused: { student: string; reason: string }[];
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

  /**
   * Correct a published question's key and re-mark everyone. A choice question takes correct_option (for choose
   * all that apply, every right key: "A,C"); a numeric one takes numeric_answer and tolerance.
   */
  correctAnswerKey(paperId: number, questionId: number, change: {
    correct_option?: string; numeric_answer?: string; tolerance?: string; award_all?: boolean; reason: string;
  }): Promise<{ remarked_attempts: number; marking: CBTMarkingOverview }> {
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

  offlinePackages(paperId: number): Promise<{ packages: CBTOfflinePackage[] }> {
    return api.get(`${PAPERS}${paperId}/offline/packages/`);
  },

  /** A new package with new PINs. Earlier packages stay good for results already sat from them. */
  makeOfflinePackage(paperId: number): Promise<{ package: CBTOfflinePackage; slips: CBTPinSlip[] }> {
    return api.post(`${PAPERS}${paperId}/offline/packages/`);
  },

  /** The package file, for loading onto the exam station. */
  offlinePackageFile(paperId: number, packageId: string): Promise<Record<string, unknown>> {
    return api.get(`${PAPERS}${paperId}/offline/packages/${packageId}/`);
  },

  /** Attempts from the station's results file. At most 200 attempts at a time. */
  importOfflineResults(paperId: number, results: CBTOfflineResults): Promise<CBTOfflineImport> {
    return api.post(`${PAPERS}${paperId}/offline/results/`, results);
  },

  analysis(paperId: number): Promise<CBTAnalysis> {
    return api.get(`${PAPERS}${paperId}/analysis/`);
  },

  applyBankDifficulty(paperId: number, questionIds: number[]): Promise<{
    updated: { question: number; bank_question: number; difficulty: string }[];
    skipped: { question: number; reason: string }[];
  }> {
    return api.post(`${PAPERS}${paperId}/analysis/apply-difficulty/`, { questions: questionIds });
  },
};

export default CBTService;
