/**
 * ResultService.ts
 *
 * Matches the actual Django backend exactly:
 *
 * Models
 * ──────
 * • 3-stage workflow: DRAFT → APPROVED → PUBLISHED (no SUBMITTED)
 * • Score fields: total_score, ca_total, percentage, grade, grade_point,
 *   is_passed, class_average, highest_in_class, lowest_in_class,
 *   subject_position (all derived from ComponentScore aggregation)
 * • Nursery: mark_obtained + max_marks_obtainable (no component breakdown)
 * • NurseryTermReport: overall_percentage, total_marks_obtained,
 *   total_students_in_class (not average_score / total_students)
 * • Session reports for all 4 levels: term_totals (JSONField),
 *   overall_average, overall_grade, overall_position
 * • ExamSession.exam_type is a FK object (exam_type_name, exam_type_code,
 *   exam_type_category) — not a string
 *
 * Endpoints
 * ──────────
 * Term reports (per level):
 *   GET    /api/results/{level}/term-reports/
 *   POST   /api/results/{level}/term-reports/{id}/approve/
 *   POST   /api/results/{level}/term-reports/{id}/publish/
 *   POST   /api/results/{level}/term-reports/bulk-approve/
 *   POST   /api/results/{level}/term-reports/bulk-publish/
 *
 * Subject results (per level):
 *   GET    /api/results/{level}/results/
 *   POST   /api/results/{level}/results/{id}/approve/
 *   POST   /api/results/{level}/results/{id}/publish/
 *   POST   /api/results/{level}/results/bulk-approve/
 *   POST   /api/results/{level}/results/bulk-publish/
 *
 * Session reports (per level):
 *   GET    /api/results/{level}/session-reports/
 *   POST   /api/results/{level}/session-reports/{id}/compute/
 *   POST   /api/results/{level}/session-reports/{id}/publish/
 *
 * PDF:
 *   GET    /api/results/report-generation/download-term-report/
 *          ?report_id=<uuid>&education_level=<LEVEL>
 *   GET    /api/results/report-generation/download-session-report/
 *          ?report_id=<uuid>&education_level=<LEVEL>
 *
 * Analytics:
 *   GET    /api/results/analytics/result_summary/?exam_session_id=<uuid>
 *   GET    /api/results/analytics/subject_performance/?exam_session_id=<uuid>&education_level=<LEVEL>
 */

import api from './api';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export type ResultStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED';

export interface AssessmentComponentInfo {
  id: number;
  name: string;
  code: string;
  component_type: 'CA' | 'EXAM' | 'PRACTICAL' | 'PROJECT' | 'ORAL' | 'OTHER';
  max_score: string;
  contributes_to_ca: boolean;
  display_order: number;
  is_active: boolean;
  education_level: number;
  /** Nested EducationLevelMinimalSerializer — always present on read responses */
  education_level_detail?: {
    id: number;
    name: string;
    code: string;
    level_type: string; // e.g. 'SENIOR_SECONDARY'
  };
}

export interface BulkComponentScoreEntry {
  student: string;
  subject: number;
  exam_session: string;
  grading_system?: number;
  teacher_remark?: string;
  scores: Array<{ component_id: number; score: number }>;
}
export type EducationLevelType =
  | 'NURSERY'
  | 'PRIMARY'
  | 'JUNIOR_SECONDARY'
  | 'SENIOR_SECONDARY';

/** URL path segment for each education level */
const LEVEL_PATH: Record<EducationLevelType, string> = {
  NURSERY: 'nursery',
  PRIMARY: 'primary',
  JUNIOR_SECONDARY: 'junior-secondary',
  SENIOR_SECONDARY: 'senior-secondary',
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ExamType {
  id: number;
  name: string;
  code: string;
  category: 'CA' | 'EXAM' | 'PRACTICAL' | 'PROJECT' | 'OTHER';
  category_display: string;
  is_active: boolean;
}

export interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface Term {
  id: string;
  name: string;
}

/** Serialized ExamSession — exam_type is now an object, not a string */
export interface ExamSession {
  id: string;
  name: string;
  exam_type: ExamType;
  exam_type_name: string;
  exam_type_code: string;
  exam_type_category: string;
  academic_session: AcademicSession;
  academic_session_name: string;
  term_name: string | null;
  start_date: string;
  end_date: string;
  result_release_date: string | null;
  is_published: boolean;
  is_active: boolean;
}

export interface StudentMinimal {
  id: string;
  admission_number: string;
  full_name: string;
  student_class: string | null;       // PK
  student_class_name: string | null;
  education_level: EducationLevelType;
  education_level_display: string;
  classroom_id: string | null;
  classroom_name: string | null;
}

export interface SubjectMinimal {
  id: number;
  name: string;
  code: string;
}

export interface GradingSystem {
  id: number;
  name: string;
  grading_type: string;
  min_score: string;
  max_score: string;
  pass_mark: string;
  is_active: boolean;
  grades: Array<{
    id: number;
    grade: string;
    min_score: string;
    max_score: string;
    grade_point: string | null;
    is_passing: boolean;
  }>;
}

export interface ComponentScore {
  id: number;
  component: number;
  component_name: string;
  component_code: string;
  component_type: string;
  max_score: string;
  contributes_to_ca: boolean;
  display_order: number;
  score: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBJECT RESULT TYPES
// Each education level returns the same BaseResult fields.
// Scores come from component_scores[] — no hardcoded test/CA fields.
// ─────────────────────────────────────────────────────────────────────────────

interface BaseSubjectResult {
  id: string;
  student: StudentMinimal;
  subject: SubjectMinimal;
  exam_session: ExamSession;
  grading_system: GradingSystem;
  component_scores: ComponentScore[];

  // Computed by BaseResult.calculate_scores() + determine_grade()
  total_score: string;
  ca_total: string;
  percentage: string;
  grade: string;
  grade_point: string | null;
  is_passed: boolean;
  class_average: string | null;
  highest_in_class: string | null;
  lowest_in_class: string | null;
  subject_position: number | null;
  position: string; // e.g. "1st", "2nd"

  status: ResultStatus;
  teacher_remark: string;
  entered_by_name: string | null;
  approved_by_name: string | null;
  status_display: string;
  created_at: string;
  updated_at: string;
}

export interface SeniorSecondaryResult extends BaseSubjectResult {
  stream: number | null;
  stream_name: string | null;
  stream_type: string | null;
}

export interface JuniorSecondaryResult extends BaseSubjectResult {}

export interface PrimaryResult extends BaseSubjectResult {}

/** Nursery result — mark_obtained is the primary score field */
export interface NurseryResult extends Omit<BaseSubjectResult, 'subject'> {
  subject: SubjectMinimal;
  mark_obtained: string;
  max_marks_obtainable: string;
  academic_comment: string;

  // Physical development fields (from term_report FK via source=)
  physical_development: string | null;
  health: string | null;
  cleanliness: string | null;
  general_conduct: string | null;
  height_beginning: string | null;
  height_end: string | null;
  weight_beginning: string | null;
  weight_end: string | null;
}

export type AnySubjectResult =
  | SeniorSecondaryResult
  | JuniorSecondaryResult
  | PrimaryResult
  | NurseryResult;

// ─────────────────────────────────────────────────────────────────────────────
// TERM REPORT TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface BaseTermReport {
  id: string;
  student: StudentMinimal;
  exam_session: ExamSession;

  // TermReportFields (absent on NurseryTermReport)
  total_score?: string;
  average_score?: string;
  overall_grade?: string;
  class_position: number | null;
  total_students?: number;

  times_opened?: number;
  times_present?: number;
  next_term_begins?: string | null;

  class_teacher_remark: string;
  head_teacher_remark: string;
  class_teacher_signature: string | null;
  class_teacher_signed_at: string | null;
  head_teacher_signature: string | null;
  head_teacher_signed_at: string | null;

  approved_by: string | null;
  approved_by_name: string | null;
  approved_date: string | null;
  status: ResultStatus;
  status_display: string;
  is_published: boolean;
  published_date: string | null;

  can_edit_teacher_remark: boolean | null;   // null on list views
  can_edit_head_teacher_remark: boolean | null;
  first_signatory_role: string | null;

  subject_results: AnySubjectResult[];
  created_at: string;
  updated_at: string;
}

export interface SeniorSecondaryTermReport extends BaseTermReport {
  stream: number | null;
  stream_name: string | null;
  stream_type: string | null;
  subject_results: SeniorSecondaryResult[];
  total_score: string;
  average_score: string;
  total_students: number;
}

export interface JuniorSecondaryTermReport extends BaseTermReport {
  subject_results: JuniorSecondaryResult[];
  total_score: string;
  average_score: string;
  total_students: number;
}

export interface PrimaryTermReport extends BaseTermReport {
  subject_results: PrimaryResult[];
  total_score: string;
  average_score: string;
  total_students: number;
}

/**
 * NurseryTermReport does NOT inherit TermReportFields.
 * Uses overall_percentage / total_marks_obtained / total_students_in_class.
 */
export interface NurseryTermReport extends Omit<
  BaseTermReport,
  'total_score' | 'average_score' | 'overall_grade' | 'total_students'
> {
  total_subjects: number;
  total_max_marks: string;
  total_marks_obtained: string;
  overall_percentage: string;
  total_students_in_class: number;

  times_school_opened: number;
  times_student_present: number;

  physical_development: string;
  health: string;
  cleanliness: string;
  general_conduct: string;
  physical_development_comment: string;
  height_beginning: string | null;
  height_end: string | null;
  weight_beginning: string | null;
  weight_end: string | null;

  subject_results: NurseryResult[];
}

export type AnyTermReport =
  | SeniorSecondaryTermReport
  | JuniorSecondaryTermReport
  | PrimaryTermReport
  | NurseryTermReport;

// ─────────────────────────────────────────────────────────────────────────────
// SESSION REPORT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TermTotal {
  term_name: string;
  term_order: number;
  total_score: number;
  average_score: number;
  class_position: number | null;
}

export interface SessionReport {
  id: string;
  student: StudentMinimal;
  academic_session: AcademicSession;
  term_totals: TermTotal[];
  overall_total: string;
  overall_average: string;
  overall_grade: string;
  overall_position: number | null;
  overall_position_formatted: string;
  total_students: number;

  class_teacher_remark: string;
  head_teacher_remark: string;
  class_teacher_signature: string | null;
  class_teacher_signed_at: string | null;
  head_teacher_signature: string | null;
  head_teacher_signed_at: string | null;

  approved_by: string | null;
  approved_by_name: string | null;
  approved_date: string | null;
  status: ResultStatus;
  status_display: string;
  is_published: boolean;
  published_date: string | null;

  can_edit_teacher_remark: boolean | null;
  can_edit_head_teacher_remark: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface SeniorSecondarySessionReport extends SessionReport {
  stream: number | null;
  stream_name: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultSummary {
  total_results: number;
  published_results: number;
  approved_results: number;
  draft_results: number;
  overall_pass_rate: number;
}

export interface SubjectPerformance {
  subject_id: number;
  subject_name: string;
  subject_code: string;
  total_students: number;
  average_score: string;
  highest_score: string;
  lowest_score: string;
  pass_rate: string;
  students_passed: number;
  students_failed: number;
}

export interface ExamSessionStatistics {
  total_results: number;
  by_education_level: Record<
    EducationLevelType,
    {
      total: number;
      published: number;
      approved: number;
      draft: number;
      passed: number;
      failed: number;
    }
  >;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER / QUERY PARAMS
// ─────────────────────────────────────────────────────────────────────────────

export interface TermReportParams {
  student?: string;
  exam_session?: string;
  status?: ResultStatus;
  is_published?: boolean;
  stream?: string;
  page?: number;
  page_size?: number;
  search?: string;
}

export interface SubjectResultParams {
  student?: string;
  subject?: string;
  exam_session?: string;
  status?: ResultStatus;
  is_passed?: boolean;
  stream?: string;
  page?: number;
  page_size?: number;
  search?: string;
}

export interface SessionReportParams {
  student?: string;
  academic_session?: string;
  status?: ResultStatus;
  is_published?: boolean;
  stream?: string;
  page?: number;
  page_size?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getCsrfToken(): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

function buildHeaders(opts: { csrf?: boolean; json?: boolean } = {}): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.json) headers['Content-Type'] = 'application/json';
  const slug = localStorage.getItem('tenantSlug');
  if (slug) headers['X-Tenant-Slug'] = slug;
  if (opts.csrf) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
  }
  return headers;
}

async function throwFromResponse(res: Response): Promise<never> {
  const text = await res.text();
  let detail = `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text);
    detail = parsed.detail || parsed.message || parsed.error || detail;
  } catch {
    if (text) detail = text;
  }
  throw new Error(detail);
}

/**
 * Fetch all pages from a paginated endpoint, returning a flat array.
 * Respects page_size from params; defaults to 100.
 */
async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  let all: T[] = [];
  let page = 1;
  const pageSize = (params.page_size as number) || 100;

  while (true) {
    const res: PaginatedResponse<T> | T[] = await api.get(endpoint, {
      ...params,
      page,
      page_size: pageSize,
    });

    if (Array.isArray(res)) {
      all = res as T[];
      break;
    }

    const paged = res as PaginatedResponse<T>;
    all = [...all, ...paged.results];
    if (!paged.next) break;
    page++;
  }

  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CLASS
// ─────────────────────────────────────────────────────────────────────────────

class ResultService {
  private readonly base = '/api/results';

  // ── URL helpers ─────────────────────────────────────────────────────────────

  private levelBase(level: EducationLevelType): string {
    return `${this.base}/${LEVEL_PATH[level]}`;
  }

  private resultEndpoint(level: EducationLevelType, id?: string): string {
    const base = `${this.levelBase(level)}/results/`;
    return id ? `${base}${id}/` : base;
  }

  private termReportEndpoint(level: EducationLevelType, id?: string): string {
    const base = `${this.levelBase(level)}/term-reports/`;
    return id ? `${base}${id}/` : base;
  }

  private sessionReportEndpoint(level: EducationLevelType, id?: string): string {
    const base = `${this.levelBase(level)}/session-reports/`;
    return id ? `${base}${id}/` : base;
  }

  // ── ASSESSMENT COMPONENTS ────────────────────────────────────────────────────

  /** Fetch tenant-configured assessment components (CA, Test, Exam, etc.) */
  async getAssessmentComponents(
    params?: Record<string, unknown>
  ): Promise<AssessmentComponentInfo[]> {
    const res = await api.get(`${this.base}/assessment-components/`, params);
    if (Array.isArray(res)) return res;
    return (res as any)?.results ?? [];
  }

  /** Fetch assessment components by education level (string or ID). Handles tenant-specific configs. */
  async getAssessmentComponentsByEducationLevel(
    educationLevel: string | number
  ): Promise<AssessmentComponentInfo[]> {
    try {
      const res = await api.get(
        `${this.base}/assessment-components/by_education_level/`,
        { education_level: educationLevel }
      );
      if (Array.isArray(res)) return res;
      return (res as any)?.results ?? [];
    } catch (e) {
      console.warn('Failed to fetch assessment components by education level:', e);
      return [];
    }
  }

  /**
   * Record scores for ONE component across multiple students (partial save).
   * Creates a new result if it doesn't exist; otherwise updates existing.
   * Missing components in the payload are left unchanged.
   */
  async bulkRecordComponentScores(
    level: EducationLevelType,
    entries: BulkComponentScoreEntry[]
  ): Promise<unknown> {
    return api.post(`${this.resultEndpoint(level)}bulk-record-scores/`, { results: entries });
  }

  // ── EXAM SESSIONS ───────────────────────────────────────────────────────────

  async getExamSessions(params?: Record<string, unknown>): Promise<ExamSession[]> {
    const res = await api.get(`${this.base}/exam-sessions/`, params);
    if (Array.isArray(res)) return res;
    if (res?.results) return res.results;
    return [];
  }

  async getExamSessionStatistics(examSessionId: string): Promise<ExamSessionStatistics> {
    return api.get(`${this.base}/exam-sessions/${examSessionId}/statistics/`);
  }

  // ── TERM REPORTS ────────────────────────────────────────────────────────────

  /**
   * Fetch a single page of term reports (server-side pagination).
   * Use this in all UI components to avoid loading the full dataset.
   */
  async getTermReportsPaginated<T extends AnyTermReport>(
    level: EducationLevelType,
    params?: Record<string, unknown>
  ): Promise<PaginatedResponse<T>> {
    const res = await api.get(this.termReportEndpoint(level), params);
    if (Array.isArray(res)) {
      return { count: res.length, next: null, previous: null, results: res as T[] };
    }
    return res as PaginatedResponse<T>;
  }

  /**
   * Fetch all term reports for a given education level (all pages).
   * WARNING: Only use this for exports or batch operations — never for UI lists.
   */
  async getTermReports<T extends AnyTermReport>(
    level: EducationLevelType,
    params?: TermReportParams
  ): Promise<T[]> {
    return fetchAllPages<T>(this.termReportEndpoint(level), params as Record<string, unknown>);
  }

  async getTermReport<T extends AnyTermReport>(
    level: EducationLevelType,
    reportId: string
  ): Promise<T> {
    return api.get(this.termReportEndpoint(level, reportId));
  }

  /**
   * Fetch term reports across all 4 education levels in parallel.
   * Returns a discriminated union array with education_level injected.
   */
  async getAllTermReports(params?: TermReportParams): Promise<
    Array<AnyTermReport & { education_level: EducationLevelType }>
  > {
    const levels: EducationLevelType[] = [
      'NURSERY',
      'PRIMARY',
      'JUNIOR_SECONDARY',
      'SENIOR_SECONDARY',
    ];

    const results = await Promise.allSettled(
      levels.map((level) =>
        this.getTermReports(level, params).then((reports) =>
          reports.map((r) => ({ ...r, education_level: level }))
        )
      )
    );

    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  }

  // ── TERM REPORT STATUS ACTIONS ──────────────────────────────────────────────

  /** Approve a single term report (and cascade to its subject results). */
  async approveTermReport(level: EducationLevelType, reportId: string) {
    return api.post(`${this.termReportEndpoint(level, reportId)}approve/`, {});
  }

  /** Publish a single term report (and cascade to its subject results). */
  async publishTermReport(level: EducationLevelType, reportId: string) {
    return api.post(`${this.termReportEndpoint(level, reportId)}publish/`, {});
  }

  /** Bulk approve term reports (one SQL UPDATE). Admin only. */
  async bulkApproveTermReports(
    level: EducationLevelType,
    reportIds: string[]
  ): Promise<{ approved_reports: number; approved_subject_results: number }> {
    return api.post(`${this.termReportEndpoint(level)}bulk-approve/`, {
      result_ids: reportIds,
    });
  }

  /** Bulk publish term reports (one SQL UPDATE). Admin only. */
  async bulkPublishTermReports(
    level: EducationLevelType,
    reportIds: string[]
  ): Promise<{ published_reports: number; published_subject_results: number }> {
    return api.post(`${this.termReportEndpoint(level)}bulk-publish/`, {
      result_ids: reportIds,
    });
  }

  // ── SUBJECT RESULTS ─────────────────────────────────────────────────────────

  async getSubjectResults<T extends AnySubjectResult>(
    level: EducationLevelType,
    params?: SubjectResultParams
  ): Promise<T[]> {
    return fetchAllPages<T>(this.resultEndpoint(level), params as Record<string, unknown>);
  }

  async approveSubjectResult(level: EducationLevelType, resultId: string) {
    return api.post(`${this.resultEndpoint(level, resultId)}approve/`, {});
  }

  async publishSubjectResult(level: EducationLevelType, resultId: string) {
    return api.post(`${this.resultEndpoint(level, resultId)}publish/`, {});
  }

  async bulkApproveSubjectResults(
    level: EducationLevelType,
    resultIds: string[]
  ): Promise<{ approved_count: number }> {
    return api.post(`${this.resultEndpoint(level)}bulk-approve/`, {
      result_ids: resultIds,
    });
  }

  async bulkPublishSubjectResults(
    level: EducationLevelType,
    resultIds: string[]
  ): Promise<{ published_count: number }> {
    return api.post(`${this.resultEndpoint(level)}bulk-publish/`, {
      result_ids: resultIds,
    });
  }

  async createSubjectResult(level: EducationLevelType, data: Record<string, unknown>) {
    return api.post(this.resultEndpoint(level), data);
  }

  async updateSubjectResult(
    level: EducationLevelType,
    resultId: string,
    data: Record<string, unknown>
  ) {
    return api.patch(this.resultEndpoint(level, resultId), data);
  }

  async deleteSubjectResult(level: EducationLevelType, resultId: string) {
    return api.delete(this.resultEndpoint(level, resultId));
  }

  /**
   * Delete a subject result by ID.
   * educationLevel may be the API-path string (e.g. 'SENIOR_SECONDARY').
   */
  async deleteStudentResult(resultId: string, educationLevel: string): Promise<void> {
    const levelMap: Record<string, EducationLevelType> = {
      NURSERY: 'NURSERY', PRIMARY: 'PRIMARY',
      JUNIOR_SECONDARY: 'JUNIOR_SECONDARY', SENIOR_SECONDARY: 'SENIOR_SECONDARY',
    };
    const level = levelMap[educationLevel.toUpperCase()] ?? 'SENIOR_SECONDARY';
    return this.deleteSubjectResult(level, resultId);
  }

  /**
   * Find a result ID by student + subject + exam_session + education_level.
   * Returns null when no result is found.
   */
  async findResultIdByComposite(params: {
    student: string;
    subject: string;
    exam_session: string;
    education_level: string;
  }): Promise<string | null> {
    const levelMap: Record<string, EducationLevelType> = {
      NURSERY: 'NURSERY', PRIMARY: 'PRIMARY',
      JUNIOR_SECONDARY: 'JUNIOR_SECONDARY', SENIOR_SECONDARY: 'SENIOR_SECONDARY',
    };
    const level = levelMap[params.education_level.toUpperCase()] ?? 'SENIOR_SECONDARY';
    try {
      const results = await this.getSubjectResults(level, {
        student: params.student,
        subject: params.subject,
        exam_session: params.exam_session,
        page_size: 1,
      } as any);
      const first = (results as any[])[0];
      return first?.id ? String(first.id) : null;
    } catch {
      return null;
    }
  }

  /** Delete a term report and all its subject results (admin only). */
  async deleteTermReport(level: EducationLevelType, reportId: string): Promise<void> {
    return api.delete(this.termReportEndpoint(level, reportId));
  }

  // ── SESSION REPORTS ─────────────────────────────────────────────────────────

  async getSessionReports<T extends SessionReport>(
    level: EducationLevelType,
    params?: SessionReportParams
  ): Promise<T[]> {
    return fetchAllPages<T>(
      this.sessionReportEndpoint(level),
      params as Record<string, unknown>
    );
  }

  async getAllSessionReports(params?: SessionReportParams): Promise<
    Array<SessionReport & { education_level: EducationLevelType }>
  > {
    const levels: EducationLevelType[] = [
      'NURSERY',
      'PRIMARY',
      'JUNIOR_SECONDARY',
      'SENIOR_SECONDARY',
    ];

    const results = await Promise.allSettled(
      levels.map((level) =>
        this.getSessionReports(level, params).then((reports) =>
          reports.map((r) => ({ ...r, education_level: level }))
        )
      )
    );

    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  }

  /** Fetch a single page of session reports (server-side pagination). */
  async getSessionReportsPaginated<T extends SessionReport>(
    level: EducationLevelType,
    params?: Record<string, unknown>
  ): Promise<PaginatedResponse<T>> {
    const res = await api.get(this.sessionReportEndpoint(level), params);
    if (Array.isArray(res)) {
      return { count: res.length, next: null, previous: null, results: res as T[] };
    }
    return res as PaginatedResponse<T>;
  }

  /**
   * Recompute session totals from approved term reports (server-side).
   * Triggers BaseSessionReport.compute_from_term_reports().
   */
  async computeSessionReport(level: EducationLevelType, reportId: string) {
    return api.post(`${this.sessionReportEndpoint(level, reportId)}compute/`, {});
  }

  async publishSessionReport(level: EducationLevelType, reportId: string) {
    return api.post(`${this.sessionReportEndpoint(level, reportId)}publish/`, {});
  }

  /** Recalculate class positions for all classes in an exam session. */
  async recalculatePositions(
    level: EducationLevelType,
    examSessionId: string
  ): Promise<{ recalculated_groups: number; exam_session: string }> {
    return api.post(`${this.termReportEndpoint(level)}recalculate-positions/`, {
      exam_session: examSessionId,
    });
  }

  // ── PDF DOWNLOADS ───────────────────────────────────────────────────────────

  /**
   * Download a term report PDF.
   * @param reportId   - The term report UUID (NOT a subject result ID)
   * @param level      - Education level (used for routing on the backend)
   */
  async downloadTermReportPDF(
    reportId: string,
    level: EducationLevelType
  ): Promise<Blob> {
    const params = new URLSearchParams({ report_id: reportId, education_level: level });
    const res = await fetch(
      `${API_BASE_URL}/results/report-generation/download-term-report/?${params}`,
      { method: 'GET', credentials: 'include', headers: buildHeaders() }
    );

    if (!res.ok) {
      if (res.status === 404) throw new Error('Report not found.');
      if (res.status === 403) throw new Error('Access denied.');
      if (res.status === 401) throw new Error('Session expired. Please log in again.');
      await throwFromResponse(res);
    }

    const blob = await res.blob();
    if (blob.size === 0) throw new Error('Received empty PDF. The report may not be ready yet.');
    return blob;
  }

  /**
   * Download a session report PDF.
   * @param reportId   - The session report UUID
   * @param level      - Education level
   */
  async downloadSessionReportPDF(
    reportId: string,
    level: EducationLevelType
  ): Promise<Blob> {
    const params = new URLSearchParams({ report_id: reportId, education_level: level });
    const res = await fetch(
      `${API_BASE_URL}/results/report-generation/download-session-report/?${params}`,
      { method: 'GET', credentials: 'include', headers: buildHeaders() }
    );

    if (!res.ok) await throwFromResponse(res);
    const blob = await res.blob();
    if (blob.size === 0) throw new Error('Received empty PDF.');
    return blob;
  }

  /**
   * Bulk download term reports as a ZIP.
   * Admin only.
   */
  async bulkDownloadTermReports(
    reportIds: string[],
    level: EducationLevelType
  ): Promise<Blob> {
    const res = await fetch(
      `${API_BASE_URL}/results/report-generation/bulk-download/`,
      {
        method: 'POST',
        credentials: 'include',
        headers: buildHeaders({ csrf: true, json: true }),
        body: JSON.stringify({ report_ids: reportIds, education_level: level }),
      }
    );
    if (!res.ok) await throwFromResponse(res);
    const blob = await res.blob();
    if (blob.size === 0) throw new Error('Received empty ZIP.');
    return blob;
  }

  /** Trigger a browser file-save from a Blob. */
  triggerDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  // ── ANALYTICS ───────────────────────────────────────────────────────────────

  /**
   * Cross-level result summary for an exam session.
   * Returns counts by status (total, approved, published, draft, pass_rate).
   */
  async getResultSummary(examSessionId: string): Promise<ResultSummary> {
    return api.get(`${this.base}/analytics/result_summary/`, {
      exam_session_id: examSessionId,
    });
  }

  /**
   * Subject-level performance breakdown for an exam session + level.
   */
  async getSubjectPerformance(
    examSessionId: string,
    level: EducationLevelType
  ): Promise<SubjectPerformance[]> {
    return api.get(`${this.base}/analytics/subject_performance/`, {
      exam_session_id: examSessionId,
      education_level: level,
    });
  }

  /**
   * Per-exam-session statistics (from ExamSessionViewSet.statistics action).
   * Returns total_results + per-level breakdown (draft / approved / published / passed / failed).
   */
  async getExamSessionStats(examSessionId: string): Promise<ExamSessionStatistics> {
    return api.get(`${this.base}/exam-sessions/${examSessionId}/statistics/`);
  }

  /**
   * Class-level statistics for a specific level + exam session.
   * Returns class_average, highest_score, lowest_score, students_passed, students_failed.
   */
  async getClassStatistics(
    level: EducationLevelType,
    params: { exam_session?: string; student_class?: string; subject?: string }
  ) {
    return api.get(`${this.resultEndpoint(level)}class_statistics/`, params);
  }

  /**
   * Grade distribution for a level + exam session.
   * Returns [{grade: 'A', count: 12}, ...]
   */
  async getGradeDistribution(
    level: EducationLevelType,
    params: { exam_session?: string; student_class?: string }
  ) {
    return api.get(`${this.resultEndpoint(level)}grade_distribution/`, params);
  }

  // ── CROSS-LEVEL BULK OPERATIONS ─────────────────────────────────────────────

  /**
   * Cross-level bulk approve (routes to correct model via education_level param).
   */
  async crossLevelBulkApprove(
    level: EducationLevelType,
    resultIds: string[]
  ): Promise<{ approved_count: number }> {
    return api.post(`${this.base}/bulk-operations/bulk_approve/`, {
      result_ids: resultIds,
      education_level: level,
    });
  }

  /**
   * Cross-level bulk publish with optional notifications.
   */
  async crossLevelBulkPublish(
    level: EducationLevelType,
    resultIds: string[],
    sendNotifications = false
  ): Promise<{ message: string; notifications_sent: number }> {
    return api.post(`${this.base}/bulk-operations/bulk_publish_results/`, {
      result_ids: resultIds,
      education_level: level,
      send_notifications: sendNotifications,
    });
  }

  // ── PROFESSIONAL ASSIGNMENT (teacher remarks / signatures) ─────────────────

  async getTeacherStudents(params?: {
    exam_session?: string;
    education_level?: string;
  }) {
    return api.get(`${this.base}/professional-assignment/my-students/`, params);
  }

  async updateTeacherRemark(data: {
    term_report_id: string;
    education_level: EducationLevelType;
    class_teacher_remark: string;
  }) {
    return api.post(`${this.base}/professional-assignment/update-remark/`, data);
  }

  async updateHeadTeacherRemark(data: {
    term_report_id: string;
    education_level: EducationLevelType;
    head_teacher_remark: string;
  }) {
    return api.post(`${this.base}/head-teacher/update-head-remark/`, data);
  }

  async getPendingReviews(examSessionId?: string) {
    return api.get(`${this.base}/head-teacher/pending-reviews/`, {
      exam_session: examSessionId,
    });
  }

  // ── HELPER UTILITIES ────────────────────────────────────────────────────────

  /**
   * Get the normalised "average score" from any term report.
   * NurseryTermReport uses overall_percentage; others use average_score.
   */
  getAverageScore(report: AnyTermReport): number {
    if ('overall_percentage' in report) {
      return parseFloat(report.overall_percentage) || 0;
    }
    return parseFloat((report as SeniorSecondaryTermReport).average_score) || 0;
  }

  /**
   * Get total students from any term report.
   * NurseryTermReport uses total_students_in_class; others use total_students.
   */
  getTotalStudents(report: AnyTermReport): number {
    if ('total_students_in_class' in report) {
      return report.total_students_in_class;
    }
    return (report as SeniorSecondaryTermReport).total_students ?? 0;
  }

  /**
   * Get overall grade from any term report.
   * NurseryTermReport does not have overall_grade — compute from overall_percentage.
   */
  getOverallGrade(report: AnyTermReport): string {
    if ('overall_percentage' in report) {
      return this.gradeFromPercentage(parseFloat(report.overall_percentage));
    }
    return (report as SeniorSecondaryTermReport).overall_grade || 'N/A';
  }

  /** Simple grade computation (mirrors backend _default_grade). */
  gradeFromPercentage(pct: number): string {
    if (isNaN(pct)) return 'N/A';
    if (pct >= 70) return 'A';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    if (pct >= 45) return 'D';
    if (pct >= 39) return 'E';
    return 'F';
  }

  /** Extract the term name from a term report's exam_session. */
  getTermName(report: AnyTermReport): string {
    return report.exam_session?.term_name || 'N/A';
  }

  /** Extract the session name from a term report's exam_session. */
  getSessionName(report: AnyTermReport): string {
    return report.exam_session?.academic_session?.name || 'N/A';
  }
}

export default new ResultService();