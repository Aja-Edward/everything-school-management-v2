import api from './api';

import type {
  AcademicSession,
  ExamSessionInfo,
  NurseryResultData,
  PrimaryResultData,
  JuniorSecondaryResultData,
  SeniorSecondaryResultData,
  SeniorSecondarySessionResultData,
  StandardResult,
  SeniorSecondaryStandardResult,
  SeniorSecondarySessionStandardResult,
  StudentTermResult,
  TeacherAssignment,
} from '../types/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResultStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ResultComment {
  id: string;
  comment_type: string;
  comment: string;
  commented_by: {
    id: string;
    username: string;
    full_name: string;
  };
  created_at: string;
}

export interface ExamSession {
  id: string;
  name: string;
  exam_type: string;
  term: string;
  academic_session?: AcademicSession;
  start_date: string;
  end_date: string;
  result_release_date?: string;
  is_published: boolean;
  is_active: boolean;
}

export interface FilterParams {
  student?: string;
  subject?: string;
  exam_session?: string;
  academic_session?: AcademicSession;
  term?: string;
  status?: ResultStatus;
  is_passed?: boolean;
  is_active?: boolean;
  stream?: string;
  search?: string;
  education_level?: string;
  result_type?: 'termly' | 'session';
  page?: number;
  page_size?: number;
  student_class?: string;
  [key: string]: any;
}

export interface ResultQueryParams extends FilterParams {
  page?: number;
  page_size?: number;
}

export interface TranscriptOptions {
  include_assessment_details?: boolean;
  include_comments?: boolean;
  include_subject_remarks?: boolean;
  format?: 'PDF' | 'HTML' | 'DOCX';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the CSRF token from the readable `csrftoken` cookie.
 * Required for all mutating requests (POST/PATCH/PUT/DELETE).
 */
function getCsrfToken(): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Headers for raw fetch requests.
 * Auth flows via httpOnly cookies — no Authorization header needed.
 */
function buildHeaders(options: { includeCsrf?: boolean; json?: boolean } = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.json) {
    headers['Content-Type'] = 'application/json';
  }

  const tenantSlug = localStorage.getItem('tenantSlug');
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  if (options.includeCsrf) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
  }

  return headers;
}

/** Parse an error response body and throw a descriptive Error. */
async function throwFromResponse(response: Response): Promise<never> {
  const text = await response.text();
  let detail = `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text);
    detail = parsed.detail || parsed.message || parsed.error || detail;
  } catch {
    if (text) detail = text;
  }
  throw new Error(detail);
}

/** Grade helper used when transforming aggregated term reports. */
function calculateGrade(averageScore: number): string {
  if (!averageScore || isNaN(averageScore)) return 'N/A';
  if (averageScore >= 70) return 'A';
  if (averageScore >= 60) return 'B';
  if (averageScore >= 50) return 'C';
  if (averageScore >= 45) return 'D';
  if (averageScore >= 39) return 'E';
  return 'F';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ResultService {
  private baseURL = '/api/results';
  private cache = new Map<string, { data: any; timestamp: number }>();
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // ── Cache management ───────────────────────────────────────────────────────

  async getCachedOrFetch(key: string, fetcher: () => Promise<any>) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private extractSessionInfo(report: any): AcademicSession | undefined {
    if (!report) return undefined;

    const examSession = report.exam_session;

    if (typeof examSession === 'string' || typeof examSession === 'number') {
      return {
        id: examSession.toString(),
        name: report.academic_session_name || report.session_name || 'Unknown',
        start_date: '',
        end_date: '',
        is_current: false,
        is_active: true,
        created_at: '',
        updated_at: '',
      } as AcademicSession;
    }

    if (examSession && typeof examSession === 'object') {
      if (examSession.academic_session && typeof examSession.academic_session === 'object') {
        return examSession.academic_session as AcademicSession;
      }
      if (examSession.academic_session_name) {
        return {
          id: examSession.academic_session?.toString() || '',
          name: examSession.academic_session_name,
          start_date: '',
          end_date: '',
          is_current: false,
          is_active: true,
          created_at: '',
          updated_at: '',
        } as AcademicSession;
      }
    }

    if (report.academic_session) {
      if (typeof report.academic_session === 'object') return report.academic_session;
      return {
        id: report.academic_session.toString(),
        name: report.academic_session_name || 'Unknown',
        start_date: '',
        end_date: '',
        is_current: false,
        is_active: true,
        created_at: '',
        updated_at: '',
      } as AcademicSession;
    }

    return undefined;
  }

  private isValidStatusTransition(currentStatus: ResultStatus, newStatus: ResultStatus): boolean {
    const validTransitions: Record<ResultStatus, ResultStatus[]> = {
      DRAFT: ['SUBMITTED', 'DRAFT'],
      SUBMITTED: ['APPROVED', 'DRAFT', 'SUBMITTED'],
      APPROVED: ['PUBLISHED', 'SUBMITTED', 'APPROVED'],
      PUBLISHED: ['PUBLISHED'],
    };
    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  /** Fetch all pages from a paginated endpoint, returning a flat array. */
  private async fetchAllPages<T>(endpoint: string, params: ResultQueryParams = {}): Promise<T[]> {
    let allResults: T[] = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await api.get(endpoint, {
          ...params,
          page: currentPage,
          page_size: params.page_size || 100,
        });

        if (response && typeof response === 'object') {
          if ('results' in response && Array.isArray(response.results)) {
            const paginatedResponse = response as PaginatedResponse<T>;
            allResults = [...allResults, ...paginatedResponse.results];
            hasMore = !!paginatedResponse.next;
            currentPage++;
          } else if (Array.isArray(response)) {
            allResults = response as T[];
            hasMore = false;
          } else {
            allResults = [response as T];
            hasMore = false;
          }
        } else if (Array.isArray(response)) {
          allResults = response as T[];
          hasMore = false;
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error(`Error fetching page ${currentPage} from ${endpoint}:`, error);
        hasMore = false;
      }
    }

    return allResults;
  }

  // ── Data transformation ────────────────────────────────────────────────────

  private transformNurseryResults(results: NurseryResultData[]): StandardResult[] {
    return results.map((result): StandardResult => ({
      id: result.id,
      student: result.student,
      subject: result.subject,
      academic_session: this.extractSessionInfo(result),
      education_level: 'NURSERY',
      grading_system: result.grading_system,
      total_score: result.mark_obtained,
      percentage: result.percentage,
      grade: result.grade,
      grade_point: result.grade_point,
      is_passed: result.is_passed,
      position: result.subject_position ?? undefined,
      exam_score: result.mark_obtained,
      teacher_remark: result.academic_comment || '',
      status: result.status,
      created_at: result.created_at,
      updated_at: result.updated_at,
      breakdown: {
        max_marks_obtainable: result.max_marks_obtainable,
        mark_obtained: result.mark_obtained,
        physical_development: result.physical_development,
        health: result.health,
        cleanliness: result.cleanliness,
        general_conduct: result.general_conduct,
      },
    }));
  }

  private transformPrimaryResults(results: PrimaryResultData[]): StandardResult[] {
    return results.map((result): StandardResult => ({
      id: result.id,
      student: result.student,
      subject: result.subject,
      academic_session: this.extractSessionInfo(result),
      education_level: 'PRIMARY',
      grading_system: result.grading_system,
      total_score: result.total_score,
      percentage: result.total_percentage,
      grade: result.grade,
      grade_point: result.grade_point,
      is_passed: result.is_passed,
      continuous_assessment_score: result.continuous_assessment_score,
      take_home_test_score: result.take_home_test_score,
      practical_score: result.practical_score,
      project_score: result.project_score,
      appearance_score: result.appearance_score,
      note_copying_score: result.note_copying_score,
      exam_score: result.exam_score,
      breakdown: {
        continuous_assessment_score: result.continuous_assessment_score,
        take_home_test_score: result.take_home_test_score,
        practical_score: result.practical_score,
        appearance_score: result.appearance_score,
        project_score: result.project_score,
        note_copying_score: result.note_copying_score,
        ca_total: result.ca_total,
        ca_percentage: result.ca_percentage,
        exam_percentage: result.exam_percentage,
      },
      class_average: result.class_average,
      highest_in_class: result.highest_in_class,
      lowest_in_class: result.lowest_in_class,
      position: result.subject_position,
      status: result.status,
      teacher_remark: result.teacher_remark || '',
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  }

  private transformJuniorSecondaryResults(results: JuniorSecondaryResultData[]): StandardResult[] {
    return results.map((result): StandardResult => ({
      id: result.id,
      student: result.student,
      subject: result.subject,
      academic_session: this.extractSessionInfo(result),
      education_level: 'JUNIOR_SECONDARY',
      grading_system: result.grading_system,
      total_score: result.total_score,
      percentage: result.total_percentage,
      grade: result.grade,
      grade_point: result.grade_point,
      is_passed: result.is_passed,
      continuous_assessment_score: result.continuous_assessment_score,
      take_home_test_score: result.take_home_test_score,
      practical_score: result.practical_score,
      project_score: result.project_score,
      appearance_score: result.appearance_score,
      note_copying_score: result.note_copying_score,
      exam_score: result.exam_score,
      breakdown: {
        continuous_assessment_score: result.continuous_assessment_score,
        take_home_test_score: result.take_home_test_score,
        practical_score: result.practical_score,
        appearance_score: result.appearance_score,
        project_score: result.project_score,
        note_copying_score: result.note_copying_score,
        ca_total: result.ca_total,
        ca_percentage: result.ca_percentage,
        exam_percentage: result.exam_percentage,
      },
      class_average: result.class_average,
      highest_in_class: result.highest_in_class,
      lowest_in_class: result.lowest_in_class,
      position: result.subject_position,
      status: result.status,
      teacher_remark: result.teacher_remark || '',
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  }

  private transformSeniorSecondaryResults(results: SeniorSecondaryResultData[]): StandardResult[] {
    return results.map((result): SeniorSecondaryStandardResult => ({
      id: result.id,
      student: result.student,
      subject: result.subject,
      academic_session: this.extractSessionInfo(result),
      education_level: 'SENIOR_SECONDARY' as const,
      stream: result.stream,
      grading_system: result.grading_system,
      total_score: result.total_score,
      percentage: result.percentage,
      grade: result.grade,
      grade_point: result.grade_point,
      is_passed: result.is_passed,
      first_test_score: result.first_test_score,
      second_test_score: result.second_test_score,
      third_test_score: result.third_test_score,
      exam_score: result.exam_score,
      breakdown: {
        first_test_score: result.first_test_score,
        second_test_score: result.second_test_score,
        third_test_score: result.third_test_score,
        exam_score: result.exam_score,
      },
      class_average: result.class_average,
      highest_in_class: result.highest_in_class,
      lowest_in_class: result.lowest_in_class,
      position: result.subject_position,
      status: result.status,
      teacher_remark: result.teacher_remark || '',
      created_at: result.created_at,
      updated_at: result.updated_at,
      exam_session: result.exam_session,
    }));
  }

  private transformSeniorSessionResults(
  results: SeniorSecondarySessionResultData[]
): SeniorSecondarySessionStandardResult[] {
  return results.map((result): SeniorSecondarySessionStandardResult => ({
    id: result.id,
    student: result.student,
    subject: result.subject,
    academic_session: this.extractSessionInfo(result),
    education_level: 'SENIOR_SECONDARY' as const,
    stream: result.stream,
    grading_system: result.grading_system || {
      id: 'default',
      name: 'Default Grading',
      grading_type: 'PERCENTAGE',
      min_score: 0,
      max_score: 100,
      pass_mark: 40,
    },
    total_score: result.obtained,
    percentage: (result.obtained / result.obtainable) * 100,
    grade: '',
    is_passed: result.obtained >= result.obtainable * 0.4,
    exam_score: result.obtained,
    breakdown: {
      first_term_score: result.first_term_score,
      second_term_score: result.second_term_score,
      third_term_score: result.third_term_score,
      average_for_year: result.average_for_year,
    },
    class_average: result.class_average,
    highest_in_class: result.highest_in_class,
    lowest_in_class: result.lowest_in_class,
    position: result.subject_position,
    status: result.status,
    teacher_remark: result.teacher_remark || '',
    created_at: result.created_at,
    updated_at: result.updated_at,
  }));
}

  // ── Core result fetchers ───────────────────────────────────────────────────

  async getNurseryResults(params?: ResultQueryParams): Promise<NurseryResultData[]> {
    try {
      return await this.fetchAllPages<NurseryResultData>(`${this.baseURL}/nursery/results/`, params);
    } catch (error) {
      console.error('Error fetching nursery results:', error);
      return [];
    }
  }

  async getPrimaryResults(params?: ResultQueryParams): Promise<PrimaryResultData[]> {
    try {
      return await this.fetchAllPages<PrimaryResultData>(`${this.baseURL}/primary/results/`, params);
    } catch (error) {
      console.error('Error fetching primary results:', error);
      return [];
    }
  }

  async getJuniorSecondaryResults(params?: ResultQueryParams): Promise<JuniorSecondaryResultData[]> {
    try {
      return await this.fetchAllPages<JuniorSecondaryResultData>(
        `${this.baseURL}/junior-secondary/results/`,
        params
      );
    } catch (error) {
      console.error('Error fetching junior secondary results:', error);
      return [];
    }
  }

  async getSeniorSecondaryResults(params?: ResultQueryParams): Promise<SeniorSecondaryResultData[]> {
    try {
      return await this.fetchAllPages<SeniorSecondaryResultData>(
        `${this.baseURL}/senior-secondary/results/`,
        params
      );
    } catch (error) {
      console.error('Error fetching senior secondary results:', error);
      return [];
    }
  }

  async getSeniorSecondarySessionResults(
    params?: ResultQueryParams
  ): Promise<SeniorSecondarySessionResultData[]> {
    try {
      return await this.fetchAllPages<SeniorSecondarySessionResultData>(
        `${this.baseURL}/senior-secondary/session-results/`,
        params
      );
    } catch (error) {
      console.error('Error fetching senior secondary session results:', error);
      return [];
    }
  }

  // ── Term report fetchers ───────────────────────────────────────────────────

  async getNurseryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(`${this.baseURL}/nursery/term-reports/`, params);
    } catch (error) {
      console.error('Error fetching nursery term reports:', error);
      return [];
    }
  }

  async getPrimaryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(`${this.baseURL}/primary/term-reports/`, params);
    } catch (error) {
      console.error('Error fetching primary term reports:', error);
      return [];
    }
  }

  async getJuniorSecondaryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(`${this.baseURL}/junior-secondary/term-reports/`, params);
    } catch (error) {
      console.error('Error fetching junior secondary term reports:', error);
      return [];
    }
  }

  async getSeniorSecondaryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(`${this.baseURL}/senior-secondary/term-reports/`, params);
    } catch (error) {
      console.error('Error fetching senior secondary term reports:', error);
      return [];
    }
  }

  async getSeniorSecondarySessionReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(`${this.baseURL}/senior-secondary/session-reports/`, params);
    } catch (error) {
      console.error('Error fetching senior secondary session reports:', error);
      return [];
    }
  }

  /** Fetch all term reports across every education level, normalized to a common shape. */
  async getTermResults(params: ResultQueryParams = {}): Promise<any[]> {
    try {
      const [nurseryReports, primaryReports, juniorReports, seniorReports] = await Promise.all([
        this.fetchAllPages(`${this.baseURL}/nursery/term-reports/`, params).catch(() => []),
        this.fetchAllPages(`${this.baseURL}/primary/term-reports/`, params).catch(() => []),
        this.fetchAllPages(`${this.baseURL}/junior-secondary/term-reports/`, params).catch(() => []),
        this.fetchAllPages(`${this.baseURL}/senior-secondary/term-reports/`, params).catch(() => []),
      ]);

      const transformSubjectResults = (subjectResults: any[], educationLevel: string) =>
        (subjectResults || []).map((sr: any) => {
          const base = {
            id: sr.id,
            subject: sr.subject || { name: 'Unknown', code: 'N/A' },
            percentage: parseFloat(sr.percentage || sr.total_percentage || '0'),
            grade: sr.grade || 'N/A',
            grade_point: parseFloat(sr.grade_point || '0'),
            is_passed: sr.is_passed ?? true,
            status: sr.status || 'DRAFT',
          };

          switch (educationLevel) {
            case 'NURSERY':
              return {
                ...base,
                total_ca_score: 0,
                ca_total: 0,
                exam_score: parseFloat(sr.mark_obtained || sr.exam_score || '0'),
                total_score: parseFloat(sr.mark_obtained || sr.total_score || '0'),
              };

            case 'PRIMARY':
            case 'JUNIOR_SECONDARY': {
              const caTotal = parseFloat(sr.ca_total || sr.total_ca_score || '0');
              return {
                ...base,
                continuous_assessment_score: parseFloat(sr.continuous_assessment_score || '0'),
                take_home_test_score: parseFloat(sr.take_home_test_score || '0'),
                practical_score: parseFloat(sr.practical_score || '0'),
                project_score: parseFloat(sr.project_score || '0'),
                appearance_score: parseFloat(sr.appearance_score || '0'),
                note_copying_score: parseFloat(sr.note_copying_score || '0'),
                ca_total: caTotal,
                total_ca_score: caTotal,
                exam_score: parseFloat(sr.exam_score || '0'),
                total_score: parseFloat(sr.total_score || '0'),
              };
            }

            case 'SENIOR_SECONDARY': {
              const t1 = parseFloat(sr.first_test_score || sr.test1_score || '0');
              const t2 = parseFloat(sr.second_test_score || sr.test2_score || '0');
              const t3 = parseFloat(sr.third_test_score || sr.test3_score || '0');
              const exam = parseFloat(sr.exam_score || '0');
              const caTotal = parseFloat(sr.ca_total || sr.total_ca_score || '0') || t1 + t2 + t3;
              const total = parseFloat(sr.total_score || '0') || caTotal + exam;
              return {
                ...base,
                first_test_score: t1,
                second_test_score: t2,
                third_test_score: t3,
                ca_total: caTotal,
                total_ca_score: caTotal,
                exam_score: exam,
                total_score: total,
              };
            }

            default:
              return {
                ...base,
                total_ca_score: parseFloat(sr.total_ca_score || sr.ca_total || '0'),
                ca_total: parseFloat(sr.ca_total || sr.total_ca_score || '0'),
                exam_score: parseFloat(sr.exam_score || '0'),
                total_score: parseFloat(sr.total_score || '0'),
              };
          }
        });

      return [
        ...nurseryReports.map((report: any) => ({
          id: report.id,
          student: report.student || {},
          academic_session: this.extractSessionInfo(report),
          term: report.exam_session?.term || 'N/A',
          total_subjects: report.total_subjects || 0,
          subjects_passed: report.subjects_passed || 0,
          subjects_failed: report.subjects_failed || 0,
          total_score: report.total_marks_obtained || 0,
          average_score: report.overall_percentage || 0,
          gpa: 0,
          class_position: report.class_position || null,
          total_students: report.total_students_in_class || 0,
          status: report.status || 'DRAFT',
          remarks: report.academic_comment || '',
          next_term_begins: report.next_term_begins || null,
          subject_results: transformSubjectResults(report.subject_results, 'NURSERY'),
          created_at: report.created_at,
          updated_at: report.updated_at,
          overall_grade: calculateGrade(report.overall_percentage),
          education_level: 'NURSERY',
          physical_development: report.physical_development,
          health: report.health,
          cleanliness: report.cleanliness,
          general_conduct: report.general_conduct,
          height_beginning: report.height_beginning,
          height_end: report.height_end,
          weight_beginning: report.weight_beginning,
          weight_end: report.weight_end,
        })),

        ...primaryReports.map((report: any) => ({
          id: report.id,
          student: report.student || {},
          academic_session: this.extractSessionInfo(report),
          term: report.exam_session?.term || 'N/A',
          total_subjects: report.total_subjects || 0,
          subjects_passed: report.subjects_passed || 0,
          subjects_failed: report.subjects_failed || 0,
          total_score: report.total_score || 0,
          average_score: report.average_score || 0,
          gpa: report.gpa || 0,
          class_position: report.class_position || null,
          total_students: report.total_students || 0,
          status: report.status || 'DRAFT',
          remarks: report.class_teacher_remark || report.remarks || '',
          next_term_begins: report.next_term_begins || null,
          subject_results: transformSubjectResults(report.subject_results, 'PRIMARY'),
          created_at: report.created_at,
          updated_at: report.updated_at,
          overall_grade: report.overall_grade || calculateGrade(report.average_score),
          education_level: 'PRIMARY',
        })),

        ...juniorReports.map((report: any) => ({
          id: report.id,
          student: report.student || {},
          academic_session: this.extractSessionInfo(report),
          term: report.exam_session?.term || 'N/A',
          total_subjects: report.total_subjects || 0,
          subjects_passed: report.subjects_passed || 0,
          subjects_failed: report.subjects_failed || 0,
          total_score: report.total_score || 0,
          average_score: report.average_score || 0,
          gpa: report.gpa || 0,
          class_position: report.class_position || null,
          total_students: report.total_students || 0,
          status: report.status || 'DRAFT',
          remarks: report.class_teacher_remark || report.remarks || '',
          next_term_begins: report.next_term_begins || null,
          subject_results: transformSubjectResults(report.subject_results, 'JUNIOR_SECONDARY'),
          created_at: report.created_at,
          updated_at: report.updated_at,
          overall_grade: report.overall_grade || calculateGrade(report.average_score),
          education_level: 'JUNIOR_SECONDARY',
        })),

        ...seniorReports.map((report: any) => ({
          id: report.id,
          student: report.student || {},
          academic_session: this.extractSessionInfo(report),
          term: report.exam_session?.term || 'N/A',
          total_subjects: report.total_subjects || 0,
          subjects_passed: report.subjects_passed || 0,
          subjects_failed: report.subjects_failed || 0,
          total_score: report.total_score || 0,
          average_score: report.average_score || 0,
          gpa: report.gpa || 0,
          class_position: report.class_position || null,
          total_students: report.total_students || 0,
          status: report.status || 'DRAFT',
          remarks: report.class_teacher_remark || report.remarks || '',
          next_term_begins: report.next_term_begins || null,
          subject_results: transformSubjectResults(report.subject_results, 'SENIOR_SECONDARY'),
          created_at: report.created_at,
          updated_at: report.updated_at,
          overall_grade: report.overall_grade || calculateGrade(report.average_score),
          education_level: 'SENIOR_SECONDARY',
          stream: report.stream || null,
        })),
      ];
    } catch (error) {
      console.error('Error fetching term results:', error);
      return [];
    }
  }

  // ── Filtered result queries ────────────────────────────────────────────────

 async getStudentResults(params: FilterParams): Promise<StandardResult[]> {
  const { education_level, result_type = 'termly', student } = params;

  if (!education_level) {
    console.warn('No education_level specified in getStudentResults');
    return [];
  }

  try {
    let results: StandardResult[] = [];

    switch (education_level.toUpperCase()) {
      case 'NURSERY':
        results = this.transformNurseryResults(await this.getNurseryResults(params));
        break;
      case 'PRIMARY':
        results = this.transformPrimaryResults(await this.getPrimaryResults(params));
        break;
      case 'JUNIOR_SECONDARY':
        results = this.transformJuniorSecondaryResults(await this.getJuniorSecondaryResults(params));
        break;
      case 'SENIOR_SECONDARY':
        results =
          result_type === 'session'
            ? this.transformSeniorSessionResults(await this.getSeniorSecondarySessionResults(params))
            : this.transformSeniorSecondaryResults(await this.getSeniorSecondaryResults(params));
        break;
      default:
        console.warn(`Unsupported education level: ${education_level}`);
        return [];
    }

    if (student && results.length > 0) {
      return results.filter((result) => {
        if (!result?.student) return false;
        const id = typeof result.student === 'object' ? result.student.id : result.student;
        return id?.toString() === student.toString();
      });
    }

    return results;
  } catch (error) {
    console.error('Error in getStudentResults:', error);
    return [];
  }
}
  async getTeacherResults(assignments: TeacherAssignment[]): Promise<StandardResult[]> {
    const results: StandardResult[] = [];

    for (const a of assignments) {
      if (!a.subject_id || !a.education_level) continue;

      if (a.education_level === 'JUNIOR_SECONDARY') {
        const res = await this.getJuniorSecondaryResults({
          subject: a.subject_id.toString(),
          education_level: 'JUNIOR_SECONDARY',
        });
        results.push(...this.transformJuniorSecondaryResults(res));
      }

      if (a.education_level === 'SENIOR_SECONDARY') {
        const res = await this.getSeniorSecondaryResults({
          subject: a.subject_id.toString(),
          education_level: 'SENIOR_SECONDARY',
        });
        results.push(...this.transformSeniorSecondaryResults(res));
      }
    }

    return results;
  }

  // ── PDF download methods ───────────────────────────────────────────────────

  async downloadTermReportPDF(
    reportId: string,
    educationLevel: string,
    term?: string
  ): Promise<Blob> {
    const url = new URL(
      `${API_BASE_URL}/results/report-generation/download-term-report/`
    );
    url.searchParams.append('report_id', reportId);
    url.searchParams.append('education_level', educationLevel.toUpperCase());
    if (term) url.searchParams.append('term', term.toUpperCase());

    const response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: buildHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) throw new Error('Report not found. Please ensure the report has been generated.');
      if (response.status === 403) throw new Error('Access denied. You may not have permission to view this report.');
      if (response.status === 401) throw new Error('Session expired. Please log in again.');
      await throwFromResponse(response);
    }

    const blob = await response.blob();
    if (blob.size === 0) throw new Error('Received empty PDF. The report may not be ready yet.');
    return blob;
  }

  async downloadSessionReportPDF(reportId: string): Promise<Blob> {
    const url = new URL(
      `${API_BASE_URL}/results/report-generation/download-session-report/`
    );
    url.searchParams.append('report_id', reportId);

    const response = await fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: buildHeaders(),
    });

    if (!response.ok) await throwFromResponse(response);

    const blob = await response.blob();
    if (blob.size === 0) throw new Error('Received empty PDF.');
    return blob;
  }

  async bulkDownloadTermReports(reportIds: string[], educationLevel: string): Promise<Blob> {
    const response = await fetch(
      `${API_BASE_URL}/results/report-generation/bulk-download/`,
      {
        method: 'POST',
        credentials: 'include',
        headers: buildHeaders({ includeCsrf: true, json: true }),
        body: JSON.stringify({
          report_ids: reportIds,
          education_level: educationLevel.toUpperCase(),
        }),
      }
    );

    if (!response.ok) await throwFromResponse(response);

    const blob = await response.blob();
    if (blob.size === 0) throw new Error('Received empty ZIP file.');
    return blob;
  }

  /** Trigger a browser file download from a Blob. */
  triggerBlobDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  // ── Status management ──────────────────────────────────────────────────────

  private educationLevelEndpoints(
    resultId: string,
    resource: 'results' | 'term-reports',
    action: string
  ): Record<string, string> {
    const base = this.baseURL;
    return {
      NURSERY: `${base}/nursery/${resource}/${resultId}/${action}/`,
      PRIMARY: `${base}/primary/${resource}/${resultId}/${action}/`,
      JUNIOR_SECONDARY: `${base}/junior-secondary/${resource}/${resultId}/${action}/`,
      SENIOR_SECONDARY: `${base}/senior-secondary/${resource}/${resultId}/${action}/`,
    };
  }

  async approveSubjectResult(resultId: string, educationLevel: string) {
    const level = educationLevel.toUpperCase().replace(/\s+/g, '_');
    const endpoint = this.educationLevelEndpoints(resultId, 'results', 'approve')[level];
    if (!endpoint) throw new Error(`Unsupported education level: ${level}`);
    return api.post(endpoint, {});
  }

  async publishSubjectResult(resultId: string, educationLevel: string) {
    const level = educationLevel.toUpperCase().replace(/\s+/g, '_');
    const endpoint = this.educationLevelEndpoints(resultId, 'results', 'publish')[level];
    if (!endpoint) throw new Error(`Unsupported education level: ${level}`);
    return api.post(endpoint, {});
  }

  async approveResult(resultId: string, educationLevel: string) {
    const level = educationLevel.toUpperCase().replace(/\s+/g, '_');
    const endpoint = this.educationLevelEndpoints(resultId, 'term-reports', 'approve')[level];
    if (!endpoint) return api.post(`${this.baseURL}/student-term-results/${resultId}/approve/`, {});
    return api.post(endpoint, {});
  }

  async publishResult(resultId: string, educationLevel: string) {
    const level = educationLevel.toUpperCase().replace(/\s+/g, '_');
    const endpoint = this.educationLevelEndpoints(resultId, 'term-reports', 'publish')[level];
    if (!endpoint) return api.post(`${this.baseURL}/student-term-results/${resultId}/publish/`, {});
    return api.post(endpoint, {});
  }

  // ── CRUD operations ────────────────────────────────────────────────────────

  private resolveEndpoint(
    educationLevel: string,
    resultId?: string,
    resource = 'results'
  ): string {
    const level = educationLevel.toUpperCase().replace(/\s+/g, '_') as keyof typeof map;
    const map = {
      NURSERY: `${this.baseURL}/nursery/${resource}/`,
      PRIMARY: `${this.baseURL}/primary/${resource}/`,
      JUNIOR_SECONDARY: `${this.baseURL}/junior-secondary/${resource}/`,
      SENIOR_SECONDARY: `${this.baseURL}/senior-secondary/${resource}/`,
    };
    const base = map[level];
    if (!base) throw new Error(`Unsupported education level: ${educationLevel}`);
    return resultId ? `${base}${resultId}/` : base;
  }

  async createStudentResult(data: any, educationLevel: string) {
    return api.post(this.resolveEndpoint(educationLevel), data);
  }

  async updateStudentResult(resultId: string, data: any, educationLevel: string) {
    return api.patch(this.resolveEndpoint(educationLevel, resultId), data);
  }

  async deleteStudentResult(resultId: string, educationLevel: string) {
    return api.delete(this.resolveEndpoint(educationLevel, resultId));
  }

  async deleteTermResult(termResultId: string, educationLevel?: string): Promise<void> {
    if (!educationLevel) {
      try {
        await api.delete(`${this.baseURL}/student-term-results/${termResultId}/`);
        return;
      } catch {
        // Fall through to level-specific endpoints
      }
    }

    const level = educationLevel?.toUpperCase().replace(/\s+/g, '_');
    const endpoints: Record<string, string> = {
      NURSERY: `${this.baseURL}/nursery/term-reports/${termResultId}/`,
      PRIMARY: `${this.baseURL}/primary/term-reports/${termResultId}/`,
      JUNIOR_SECONDARY: `${this.baseURL}/junior-secondary/term-reports/${termResultId}/`,
      SENIOR_SECONDARY: `${this.baseURL}/senior-secondary/term-reports/${termResultId}/`,
    };

    if (level && endpoints[level]) {
      await api.delete(endpoints[level]);
      return;
    }

    for (const endpoint of Object.values(endpoints)) {
      try {
        await api.delete(endpoint);
        return;
      } catch {
        // Try next
      }
    }

    throw new Error(`Term result with ID ${termResultId} not found in any education level.`);
  }

  async bulkCreateResults(data: any[], educationLevel: string) {
    return api.post(this.resolveEndpoint(educationLevel) + 'bulk_create/', { results: data });
  }

  // ── Utility & convenience queries ──────────────────────────────────────────

  async getAllResults(): Promise<StandardResult[]> {
    try {
      const [nursery, primary, junior, senior] = await Promise.all([
        this.getNurseryResults(),
        this.getPrimaryResults(),
        this.getJuniorSecondaryResults(),
        this.getSeniorSecondaryResults(),
      ]);

      return [
        ...this.transformNurseryResults(nursery),
        ...this.transformPrimaryResults(primary),
        ...this.transformJuniorSecondaryResults(junior),
        ...this.transformSeniorSecondaryResults(senior),
      ];
    } catch (error) {
      console.error('Error fetching all results:', error);
      return [];
    }
  }

  async getResultsByStudent(
    studentId: string | number,
    educationLevel?: string
  ): Promise<StandardResult[]> {
    if (educationLevel) {
      return this.getStudentResults({
        student: studentId.toString(),
        education_level: educationLevel,
      });
    }

    const allResults = await this.getAllResults();
    return allResults.filter((result) => {
      if (!result?.student) return false;
      const id = typeof result.student === 'object' ? result.student.id : result.student;
      return id?.toString() === studentId.toString();
    });
  }

  async getResultsByExamSession(
    examSessionId: string,
    educationLevel: string
  ): Promise<StandardResult[]> {
    return this.getStudentResults({ exam_session: examSessionId, education_level: educationLevel });
  }

  async getDetailedTermResult(termResultId: string): Promise<StudentTermResult> {
    return api.get(`${this.baseURL}/student-term-results/${termResultId}/detailed/`);
  }

  async getTermResultsByStudent(studentId: string): Promise<StudentTermResult[]> {
    try {
      const response = await api.get(
        `${this.baseURL}/student-term-results/by_student/?student_id=${studentId}`
      );
      return Array.isArray(response) ? response : response?.results || [];
    } catch (error) {
      console.error('Error fetching term results by student:', error);
      return [];
    }
  }

  async getTermResultsByEducationLevel(educationLevel: string, params?: FilterParams) {
    try {
      const endpoint = this.resolveEndpoint(educationLevel, undefined, 'term-reports');
      const response = await api.get(endpoint, params);
      return Array.isArray(response) ? response : response?.results || [];
    } catch (error) {
      console.error(`Error fetching ${educationLevel} term results:`, error);
      return [];
    }
  }

  async generateTermReport(studentId: string, examSessionId: string) {
    return api.post(`${this.baseURL}/student-term-results/generate_report/`, {
      student_id: studentId,
      exam_session_id: examSessionId,
    });
  }

  async getExamSessions(params?: FilterParams): Promise<ExamSessionInfo[]> {
    try {
      const response = await api.get(`${this.baseURL}/exam-sessions/`, params);

      if (Array.isArray(response)) return response;
      if (response?.results && Array.isArray(response.results)) return response.results;
      if (response?.data && Array.isArray(response.data)) return response.data;
      if (typeof response === 'object' && response !== null) return [response];
      return [];
    } catch (error: any) {
      console.error('Error fetching exam sessions:', error);
      throw new Error(
        error.response?.data?.message || error.message || 'Failed to fetch exam sessions'
      );
    }
  }

  async getClassStatistics(
    educationLevel: string,
    params?: { exam_session?: string; student_class?: string; subject?: string }
  ) {
    return api.get(
      this.resolveEndpoint(educationLevel) + 'class_statistics/',
      params
    );
  }

  async findResultIdByComposite(params: {
    student: string;
    subject: string;
    exam_session: string;
    education_level: string;
  }): Promise<string | null> {
    try {
      const { education_level, ...filterParams } = params;
      const endpoint = this.resolveEndpoint(education_level);
      const response = await api.get(endpoint, filterParams);

      const results = Array.isArray(response)
        ? response
        : response?.results || response?.data || [];

      if (results.length > 0) {
        const id = results[0]?.id || results[0]?.pk;
        return id ? id.toString() : null;
      }

      return null;
    } catch (error) {
      console.error('Error finding result by composite:', error);
      return null;
    }
  }

  // ── Statistics & analytics ─────────────────────────────────────────────────

  async getGradeDistribution(params?: { exam_session?: string; student_class?: string }) {
    return api.get(`${this.baseURL}/senior-secondary/results/grade_distribution/`, params);
  }

  async getClassPerformance(params?: {
    education_level?: string;
    student_class?: string;
    exam_session?: string;
    subject?: string;
  }) {
    return api.get(`${this.baseURL}/analytics/class_performance/`, params);
  }

  async getSubjectPerformance(params?: {
    subject?: string;
    education_level?: string;
    exam_session?: string;
  }) {
    return api.get(`${this.baseURL}/analytics/subject_performance/`, params);
  }

  async getStudentPerformanceTrend(params: {
    student: string;
    education_level: string;
    subject?: string;
  }) {
    return api.get(`${this.baseURL}/analytics/student_performance_trend/`, params);
  }

  async getResultSummary(params?: {
    education_level?: string;
    exam_session?: string;
    student_class?: string;
  }) {
    return api.get(`${this.baseURL}/analytics/result_summary/`, params);
  }

  // ── Bulk operations ────────────────────────────────────────────────────────

  async bulkPublishResults(data: { result_ids: string[]; education_level: string }) {
    return api.post(`${this.baseURL}/bulk-operations/bulk_publish_results/`, data);
  }

  async bulkStatusUpdate(data: {
    result_ids: string[];
    status: ResultStatus;
    education_level: string;
  }) {
    return api.post(`${this.baseURL}/bulk-operations/bulk_status_update/`, data);
  }

  async bulkUpdate(data: {
    updates: Array<{ result_id: string; data: any }>;
    education_level: string;
  }) {
    return api.post(`${this.baseURL}/bulk-operations/bulk_update/`, data);
  }

  // ── Import / export ────────────────────────────────────────────────────────

  async importResults(
    file: File,
    educationLevel: string
  ): Promise<{ message: string; imported_count: number; errors?: any[] }> {
    const form = new FormData();
    form.append('file', file);
    form.append('education_level', educationLevel);

    const response = await fetch(`${this.baseURL}/import-export/import_results/`, {
      method: 'POST',
      credentials: 'include',
      headers: buildHeaders({ includeCsrf: true }),
      body: form,
    });

    if (!response.ok) await throwFromResponse(response);
    return response.json();
  }

  async exportResults(params?: {
    education_level?: string;
    exam_session?: string;
    student_class?: string;
    subject?: string;
    status?: string;
    format?: 'csv' | 'xlsx';
  }): Promise<Blob> {
    const query = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) query.append(key, value.toString());
      }
    }

    const qs = query.toString();
    const response = await fetch(
      `${this.baseURL}/import-export/export_results/${qs ? `?${qs}` : ''}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: buildHeaders(),
      }
    );

    if (!response.ok) await throwFromResponse(response);
    return response.blob();
  }

  // ── Misc ───────────────────────────────────────────────────────────────────

  async generateTranscript(studentId: string, options?: TranscriptOptions) {
    return api.post(`${this.baseURL}/transcripts/generate/`, {
      student_id: studentId,
      ...options,
    });
  }

  async verifyResult(resultId: string, verificationCode: string) {
    return api.post(`${this.baseURL}/verify/`, { result_id: resultId, code: verificationCode });
  }

  async getAvailableStreams(classLevel?: string) {
    return api.get(`${this.baseURL}/academic/streams/`, { class_level: classLevel });
  }

  async getGradingSystems() {
    return api.get(`${this.baseURL}/grading-systems/`);
  }

  async getAssessmentTypes() {
    return api.get(`${this.baseURL}/assessment-types/`);
  }

  async getScoringConfigurations() {
    return api.get(`${this.baseURL}/scoring-configurations/`);
  }

  async getResultSheets(params?: FilterParams) {
    return api.get(`${this.baseURL}/result-sheets/`, params);
  }

  async getAssessmentScores(params?: FilterParams) {
    return api.get(`${this.baseURL}/assessment-scores/`, params);
  }

  async getResultComments(params?: FilterParams) {
    return api.get(`${this.baseURL}/result-comments/`, params);
  }
}

export default new ResultService();