import api, { API_BASE_URL } from './api';
import { SchoolSettings, AcademicSession } from '@/types/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GradingSystem {
  id: string;
  name: string;
  grading_type: string;
  description: string;
  min_score: number;
  max_score: number;
  pass_mark: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  grades: GradeRange[];
}

export interface GradeRange {
  id: string;
  grading_system: string;
  grade: string;
  remark: string;
  min_score: number;
  max_score: number;
  grade_point?: number;
  description: string;
  is_passing: boolean;
}

export interface AssessmentType {
  id: string;
  name: string;
  code: string;
  description: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY' | 'ALL';
  education_level_display: string;
  max_score: number;
  weight_percentage: number;
  is_active: boolean;
  created_at: string;
}

export interface ExamSession {
  id: string;
  name: string;
  exam_type: string;
  term: string;
  academic_session: AcademicSession | string | number;
  start_date: string;
  end_date: string;
  result_release_date: string;
  is_published: boolean;
  is_active: boolean;
}

export interface ScoringConfiguration {
  id: string;
  name: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  education_level_display: string;
  result_type: 'TERMLY' | 'SESSION';
  description: string;
  first_test_max_score: number;
  second_test_max_score: number;
  third_test_max_score: number;
  exam_max_score: number;
  total_max_score: number;
  ca_weight_percentage: number;
  exam_weight_percentage: number;
  total_ca_max_score: number;
  continuous_assessment_max_score: number;
  take_home_test_max_score: number;
  appearance_max_score: number;
  practical_max_score: number;
  project_max_score: number;
  note_copying_max_score: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentResult {
  id: string;
  student: string;
  subject: string;
  exam_session: string;
  mark_obtained: number;
  max_marks_obtainable: number;
  grade?: string;
  position?: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubjectResult {
  subject: { id: string; name: string; code: string };
  total_score: number;
  percentage: number;
  grade: string;
  position: number;
  class_average: number;
  highest_in_class: number;
  lowest_in_class: number;
  teacher_remark?: string;
  test1_score?: number;
  test2_score?: number;
  test3_score?: number;
  exam_score?: number;
  ca1_score?: number;
  ca2_score?: number;
  ca3_score?: number;
  ca4_score?: number;
  ca5_score?: number;
  ca6_score?: number;
  exam_marks?: number;
}

export interface ResultSheet {
  id: string;
  student_id: string;
  exam_session_id: string;
  subjects: SubjectResult[];
  overall_total: number;
  average: number;
  position: string;
  remarks?: string;
}

export interface StudentTermResult {
  id: string;
  student: string;
  term: string;
  academic_session: string;
  total_marks: number;
  total_possible: number;
  average: number;
  position: number;
  class_size: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiResultSheet {
  id: string;
  exam_session: string;
  class_level: string;
  subject: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssessmentScore {
  id: string;
  student: string;
  subject: string;
  assessment_type: string;
  score: number;
  max_score: number;
  exam_session: string;
  created_at: string;
  updated_at: string;
}

export interface ResultComment {
  id: string;
  student: string;
  exam_session: string;
  teacher_comment?: string;
  head_teacher_comment?: string;
  created_at: string;
  updated_at: string;
}

export interface EnhancedResultSheet {
  student_id: string;
  exam_session_id: string;
  class_level: string;
  subjects: SubjectResult[];
  overall_total: number;
  average: number;
  position: string;
  remarks?: string;
  school_info: SchoolSettings;
}

export interface NurseryResult {
  id: string;
  student: string;
  subject: string;
  exam_session: string;
  [key: string]: any;
}

export interface PrimaryResult {
  id: string;
  student: string;
  subject: string;
  exam_session: string;
  ca1_score?: number;
  ca2_score?: number;
  ca3_score?: number;
  exam_score: number;
  total_score: number;
  [key: string]: any;
}

export interface JuniorSecondaryResult {
  id: string;
  student: string;
  subject: string;
  exam_session: string;
  ca1_score?: number;
  ca2_score?: number;
  ca3_score?: number;
  exam_score: number;
  total_score: number;
  [key: string]: any;
}

export interface SeniorSecondaryResult {
  id: string;
  student: {
    id: string;
    name?: string;
    full_name?: string;
    username?: string;
    registration_number?: string;
    class?: string;
    student_class?: string;
    age?: number;
    education_level?: string;
  };
  subject: { id: string; name: string; code?: string };
  exam_session: {
    id: string;
    name?: string;
    term_display?: string;
    start_date?: string;
    end_date?: string;
    academic_session?: string;
    academic_session_name?: string;
  };
  test1_score?: number;
  test2_score?: number;
  test3_score?: number;
  exam_score: number;
  total_score: number;
  class_average?: number;
  highest_in_class?: number;
  lowest_in_class?: number;
  position?: number;
  grade?: string;
  teacher_remark?: string;
  percentage?: number;
  [key: string]: any;
}

export interface SeniorSecondarySessionResult {
  id: string;
  student: string;
  subject: string;
  academic_session: string;
  first_term_total: number;
  second_term_total: number;
  third_term_total: number;
  session_total: number;
  session_average: number;
  [key: string]: any;
}

export interface ApiResponse<T> {
  results?: T[];
  data?: T;
  count?: number;
  next?: string;
  previous?: string;
}

export interface ExamSessionFilters {
  is_active?: boolean;
  is_published?: boolean;
  term?: string;
  academic_session?: string;
}

export interface ResultFilters {
  student?: string;
  subject?: string;
  exam_session?: string;
  is_published?: boolean;
  class_level?: string;
}

// Create/Update interfaces
export interface ScoringConfigurationCreateUpdate {
  name: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  result_type: 'TERMLY' | 'SESSION';
  description: string;
  first_test_max_score: number;
  second_test_max_score: number;
  third_test_max_score: number;
  exam_max_score: number;
  total_max_score: number;
  ca_weight_percentage: number;
  exam_weight_percentage: number;
  continuous_assessment_max_score: number;
  take_home_test_max_score: number;
  appearance_max_score: number;
  practical_max_score: number;
  project_max_score: number;
  note_copying_max_score: number;
  is_active: boolean;
  is_default: boolean;
}

export interface GradingSystemCreateUpdate {
  name: string;
  grading_type: string;
  description: string;
  min_score: number;
  max_score: number;
  pass_mark: number;
  is_active: boolean;
}

export interface AssessmentTypeCreateUpdate {
  name: string;
  code: string;
  description: string;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY' | 'ALL';
  max_score: number;
  weight_percentage: number;
  is_active: boolean;
}

export interface GradeCreateUpdate {
  grading_system: string;
  grade: string;
  remark: string;
  min_score: number;
  max_score: number;
  grade_point?: number;
  description: string;
  is_passing: boolean;
}

export interface ExamSessionCreateUpdate {
  academic_session: number | string;
  name: string;
  exam_type: string;
  term: string;
  start_date: string;
  end_date: string;
  result_release_date: string;
  is_published: boolean;
  is_active: boolean;
}

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

  if (options.json) headers['Content-Type'] = 'application/json';

  const tenantSlug = localStorage.getItem('tenantSlug');
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  if (options.includeCsrf) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
  }

  return headers;
}

/** Normalize the API base URL — strips trailing slash, ensures no double-slash. */
function getBaseUrl(): string {
  return API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
}

/** Parse an error response body and throw a descriptive Error. */
async function throwFromResponse(response: Response): Promise<never> {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    const data = await response.json();
    throw new Error(data.detail || data.error || `HTTP ${response.status}`);
  }
  const text = await response.text();
  throw new Error(text || `HTTP ${response.status} ${response.statusText}`);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ResultSettingsService {
  private schoolSettings: SchoolSettings | null = null;
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  setSchoolSettings(settings: SchoolSettings) {
    this.schoolSettings = settings;
  }

  getSchoolSettings(): SchoolSettings | null {
    return this.schoolSettings;
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ── Response normalizers ───────────────────────────────────────────────────

  private list<T>(response: any): T[] {
    if (Array.isArray(response)) return response;
    if (response?.results && Array.isArray(response.results)) return response.results;
    if (response?.data && Array.isArray(response.data)) return response.data;
    return [];
  }

  private single<T>(response: any): T {
    return response?.data ?? response;
  }

  // ── Academic Sessions ──────────────────────────────────────────────────────

  async getAcademicSessions(): Promise<AcademicSession[]> {
    try {
      return this.list<AcademicSession>(await api.get('/api/academics/sessions/'));
    } catch (error) {
      console.error('Error fetching academic sessions:', error);
      throw error;
    }
  }

  async getAcademicSession(id: string): Promise<AcademicSession> {
    try {
      return this.single<AcademicSession>(await api.get(`/api/academics/sessions/${id}/`));
    } catch (error) {
      console.error('Error fetching academic session:', error);
      throw error;
    }
  }

  // ── Grading Systems ────────────────────────────────────────────────────────

  async getGradingSystems(): Promise<GradingSystem[]> {
    try {
      return this.list<GradingSystem>(await api.get('/api/results/grading-systems/'));
    } catch (error) {
      console.error('Error fetching grading systems:', error);
      throw error;
    }
  }

  async getGradingSystem(id: string): Promise<GradingSystem> {
    try {
      return this.single<GradingSystem>(await api.get(`/api/results/grading-systems/${id}/`));
    } catch (error) {
      console.error('Error fetching grading system:', error);
      throw error;
    }
  }

  async createGradingSystem(data: GradingSystemCreateUpdate): Promise<GradingSystem> {
    try {
      return this.single<GradingSystem>(await api.post('/api/results/grading-systems/', data));
    } catch (error) {
      console.error('Error creating grading system:', error);
      throw error;
    }
  }

  async updateGradingSystem(id: string, data: Partial<GradingSystemCreateUpdate>): Promise<GradingSystem> {
    try {
      return this.single<GradingSystem>(await api.patch(`/api/results/grading-systems/${id}/`, data));
    } catch (error) {
      console.error('Error updating grading system:', error);
      throw error;
    }
  }

  async deleteGradingSystem(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/grading-systems/${id}/`);
    } catch (error) {
      console.error('Error deleting grading system:', error);
      throw error;
    }
  }

  async activateGradingSystem(systemId: string): Promise<any> {
    try {
      return this.single(await api.post(`/api/results/grading-systems/${systemId}/activate/`, {}));
    } catch (error) {
      console.error('Error activating grading system:', error);
      throw error;
    }
  }

  async deactivateGradingSystem(systemId: string): Promise<any> {
    try {
      return this.single(await api.post(`/api/results/grading-systems/${systemId}/deactivate/`, {}));
    } catch (error) {
      console.error('Error deactivating grading system:', error);
      throw error;
    }
  }

  // ── Grades ─────────────────────────────────────────────────────────────────

  async getGrades(gradingSystemId?: string): Promise<GradeRange[]> {
    try {
      const url = gradingSystemId
        ? `/api/results/grades/?grading_system=${gradingSystemId}`
        : '/api/results/grades/';
      return this.list<GradeRange>(await api.get(url));
    } catch (error) {
      console.error('Error fetching grade ranges:', error);
      throw error;
    }
  }

  async createGrade(data: GradeCreateUpdate): Promise<GradeRange> {
    try {
      return this.single<GradeRange>(await api.post('/api/results/grades/', data));
    } catch (error) {
      console.error('Error creating grade:', error);
      throw error;
    }
  }

  async updateGrade(id: string, data: Partial<GradeCreateUpdate>): Promise<GradeRange> {
    try {
      return this.single<GradeRange>(await api.patch(`/api/results/grades/${id}/`, data));
    } catch (error) {
      console.error('Error updating grade:', error);
      throw error;
    }
  }

  async deleteGrade(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/grades/${id}/`);
    } catch (error) {
      console.error('Error deleting grade:', error);
      throw error;
    }
  }

  // ── Assessment Types ───────────────────────────────────────────────────────

  async getAssessmentTypes(educationLevel?: string): Promise<AssessmentType[]> {
    try {
      const url = educationLevel
        ? `/api/results/assessment-types/?education_level=${educationLevel}`
        : '/api/results/assessment-types/';
      return this.list<AssessmentType>(await api.get(url));
    } catch (error) {
      console.error('Error fetching assessment types:', error);
      throw error;
    }
  }

  async createAssessmentType(data: AssessmentTypeCreateUpdate): Promise<AssessmentType> {
    try {
      return this.single<AssessmentType>(await api.post('/api/results/assessment-types/', data));
    } catch (error) {
      console.error('Error creating assessment type:', error);
      throw error;
    }
  }

  async updateAssessmentType(id: string, data: Partial<AssessmentTypeCreateUpdate>): Promise<AssessmentType> {
    try {
      return this.single<AssessmentType>(await api.patch(`/api/results/assessment-types/${id}/`, data));
    } catch (error) {
      console.error('Error updating assessment type:', error);
      throw error;
    }
  }

  async deleteAssessmentType(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/assessment-types/${id}/`);
    } catch (error) {
      console.error('Error deleting assessment type:', error);
      throw error;
    }
  }

  // ── Exam Sessions ──────────────────────────────────────────────────────────

  async getExamSessions(filters?: ExamSessionFilters): Promise<ExamSession[]> {
    try {
      return this.list<ExamSession>(await api.get('/api/results/exam-sessions/', filters));
    } catch (error) {
      console.error('Error fetching exam sessions:', error);
      throw error;
    }
  }

  async getExamSession(id: string): Promise<ExamSession> {
    try {
      return this.single<ExamSession>(await api.get(`/api/results/exam-sessions/${id}/`));
    } catch (error) {
      console.error('Error fetching exam session:', error);
      throw error;
    }
  }

  async createExamSession(data: ExamSessionCreateUpdate): Promise<ExamSession> {
    try {
      return this.single<ExamSession>(await api.post('/api/results/exam-sessions/', data));
    } catch (error) {
      console.error('Error creating exam session:', error);
      throw error;
    }
  }

  async updateExamSession(id: string, data: Partial<ExamSessionCreateUpdate>): Promise<ExamSession> {
    try {
      return this.single<ExamSession>(await api.patch(`/api/results/exam-sessions/${id}/`, data));
    } catch (error) {
      console.error('Error updating exam session:', error);
      throw error;
    }
  }

  async deleteExamSession(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/exam-sessions/${id}/`);
    } catch (error) {
      console.error('Error deleting exam session:', error);
      throw error;
    }
  }

  async publishExamSession(examSessionId: string): Promise<any> {
    try {
      return this.single(await api.post(`/api/results/exam-sessions/${examSessionId}/publish/`, {}));
    } catch (error) {
      console.error('Error publishing exam session:', error);
      throw error;
    }
  }

  async getExamSessionStatistics(examSessionId: string): Promise<any> {
    try {
      return this.single(await api.get(`/api/results/exam-sessions/${examSessionId}/statistics/`));
    } catch (error) {
      console.error('Error fetching exam session statistics:', error);
      throw error;
    }
  }

  // ── Scoring Configurations ─────────────────────────────────────────────────

  async getScoringConfigurations(educationLevel?: string): Promise<ScoringConfiguration[]> {
    try {
      const url = educationLevel
        ? `/api/results/scoring-configurations/?education_level=${educationLevel}`
        : '/api/results/scoring-configurations/';
      return this.list<ScoringConfiguration>(await api.get(url));
    } catch (error) {
      console.error('Error fetching scoring configurations:', error);
      throw error;
    }
  }

  async getScoringConfiguration(id: string): Promise<ScoringConfiguration> {
    try {
      return this.single<ScoringConfiguration>(await api.get(`/api/results/scoring-configurations/${id}/`));
    } catch (error) {
      console.error('Error fetching scoring configuration:', error);
      throw error;
    }
  }

  async createScoringConfiguration(data: ScoringConfigurationCreateUpdate): Promise<ScoringConfiguration> {
    try {
      return this.single<ScoringConfiguration>(await api.post('/api/results/scoring-configurations/', data));
    } catch (error) {
      console.error('Error creating scoring configuration:', error);
      throw error;
    }
  }

  async updateScoringConfiguration(id: string, data: Partial<ScoringConfigurationCreateUpdate>): Promise<ScoringConfiguration> {
    try {
      return this.single<ScoringConfiguration>(await api.patch(`/api/results/scoring-configurations/${id}/`, data));
    } catch (error) {
      console.error('Error updating scoring configuration:', error);
      throw error;
    }
  }

  async deleteScoringConfiguration(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/scoring-configurations/${id}/`);
    } catch (error) {
      console.error('Error deleting scoring configuration:', error);
      throw error;
    }
  }

  async getDefaultScoringConfigurations(): Promise<Record<string, ScoringConfiguration>> {
    try {
      const response = await api.get('/api/results/scoring-configurations/defaults/');
      return response?.data ?? response ?? {};
    } catch (error) {
      console.error('Error fetching default scoring configurations:', error);
      throw error;
    }
  }

  async setDefaultScoringConfiguration(configId: string): Promise<any> {
    try {
      return this.single(await api.post(`/api/results/scoring-configurations/${configId}/set_as_default/`, {}));
    } catch (error) {
      console.error('Error setting default scoring configuration:', error);
      throw error;
    }
  }

  async getScoringConfigurationsByEducationLevel(educationLevel: string): Promise<ScoringConfiguration[]> {
    try {
      return this.list<ScoringConfiguration>(
        await api.get('/api/results/scoring-configurations/by_education_level/', { education_level: educationLevel })
      );
    } catch (error) {
      console.error('Error fetching scoring configurations by education level:', error);
      throw error;
    }
  }

  async getScoringConfigurationsByResultType(resultType: string): Promise<ScoringConfiguration[]> {
    try {
      return this.list<ScoringConfiguration>(
        await api.get('/api/results/scoring-configurations/by_result_type/', { result_type: resultType })
      );
    } catch (error) {
      console.error('Error fetching scoring configurations by result type:', error);
      throw error;
    }
  }

  // ── Result Sheet Generation ────────────────────────────────────────────────

  async generateEnhancedResultSheet(
    studentId: string,
    examSessionId: string,
    templateId?: string
  ): Promise<EnhancedResultSheet> {
    try {
      const params: Record<string, string> = { student: studentId, exam_session: examSessionId };
      if (templateId) params.template = templateId;

      const response = await api.get('/api/results/generate-enhanced-result/', params);
      const result = this.single<Omit<EnhancedResultSheet, 'school_info'>>(response);

      return { ...result, school_info: this.schoolSettings ?? ({} as SchoolSettings) };
    } catch (error) {
      console.error('Error generating enhanced result sheet:', error);
      throw error;
    }
  }

  async generateBulkResultSheets(studentIds: string[], examSessionId: string): Promise<EnhancedResultSheet[]> {
    try {
      const response = await api.post('/api/results/generate-bulk-results/', {
        students: studentIds,
        exam_session: examSessionId,
      });

      return this.list<Omit<EnhancedResultSheet, 'school_info'>>(response).map((result) => ({
        ...result,
        school_info: this.schoolSettings ?? ({} as SchoolSettings),
      }));
    } catch (error) {
      console.error('Error generating bulk result sheets:', error);
      throw error;
    }
  }

  async generateResultSheet(data: any): Promise<any> {
    try {
      return this.single(await api.post('/api/results/result-sheets/generate_sheet/', data));
    } catch (error) {
      console.error('Error generating result sheet:', error);
      throw error;
    }
  }

  async generateTermReport(data: any): Promise<any> {
    try {
      return this.single(await api.post('/api/results/student-term-results/generate_report/', data));
    } catch (error) {
      console.error('Error generating term report:', error);
      throw error;
    }
  }

  async generateSessionReport(data: any): Promise<any> {
    try {
      return this.single(
        await api.post('/api/results/senior-secondary/session-reports/generate_session_report/', data)
      );
    } catch (error) {
      console.error('Error generating session report:', error);
      throw error;
    }
  }

  // ── Education-level specific results ──────────────────────────────────────

  async getNurseryResults(filters?: ResultFilters): Promise<NurseryResult[]> {
    try {
      return this.list<NurseryResult>(await api.get('/api/results/nursery/results/', filters));
    } catch (error) {
      console.error('Error fetching nursery results:', error);
      throw error;
    }
  }

  async getNurseryTermReports(filters?: ResultFilters): Promise<any[]> {
    try {
      return this.list(await api.get('/api/results/nursery/term-reports/', filters));
    } catch (error) {
      console.error('Error fetching nursery term reports:', error);
      throw error;
    }
  }

  async createNurseryResult(data: Partial<NurseryResult>): Promise<NurseryResult> {
    try {
      return this.single<NurseryResult>(await api.post('/api/results/nursery/results/', data));
    } catch (error) {
      console.error('Error creating nursery result:', error);
      throw error;
    }
  }

  async updateNurseryResult(id: string, data: Partial<NurseryResult>): Promise<NurseryResult> {
    try {
      return this.single<NurseryResult>(await api.patch(`/api/results/nursery/results/${id}/`, data));
    } catch (error) {
      console.error('Error updating nursery result:', error);
      throw error;
    }
  }

  async deleteNurseryResult(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/nursery/results/${id}/`);
    } catch (error) {
      console.error('Error deleting nursery result:', error);
      throw error;
    }
  }

  async getPrimaryResults(filters?: ResultFilters): Promise<PrimaryResult[]> {
    try {
      return this.list<PrimaryResult>(await api.get('/api/results/primary/results/', filters));
    } catch (error) {
      console.error('Error fetching primary results:', error);
      throw error;
    }
  }

  async getPrimaryTermReports(filters?: ResultFilters): Promise<any[]> {
    try {
      return this.list(await api.get('/api/results/primary/term-reports/', filters));
    } catch (error) {
      console.error('Error fetching primary term reports:', error);
      throw error;
    }
  }

  async createPrimaryResult(data: Partial<PrimaryResult>): Promise<PrimaryResult> {
    try {
      return this.single<PrimaryResult>(await api.post('/api/results/primary/results/', data));
    } catch (error) {
      console.error('Error creating primary result:', error);
      throw error;
    }
  }

  async updatePrimaryResult(id: string, data: Partial<PrimaryResult>): Promise<PrimaryResult> {
    try {
      return this.single<PrimaryResult>(await api.patch(`/api/results/primary/results/${id}/`, data));
    } catch (error) {
      console.error('Error updating primary result:', error);
      throw error;
    }
  }

  async deletePrimaryResult(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/primary/results/${id}/`);
    } catch (error) {
      console.error('Error deleting primary result:', error);
      throw error;
    }
  }

  async getJuniorSecondaryResults(filters?: ResultFilters): Promise<JuniorSecondaryResult[]> {
    try {
      return this.list<JuniorSecondaryResult>(await api.get('/api/results/junior-secondary/results/', filters));
    } catch (error) {
      console.error('Error fetching junior secondary results:', error);
      throw error;
    }
  }

  async getJuniorSecondaryTermReports(filters?: ResultFilters): Promise<any[]> {
    try {
      return this.list(await api.get('/api/results/junior-secondary/term-reports/', filters));
    } catch (error) {
      console.error('Error fetching junior secondary term reports:', error);
      throw error;
    }
  }

  async createJuniorSecondaryResult(data: Partial<JuniorSecondaryResult>): Promise<JuniorSecondaryResult> {
    try {
      return this.single<JuniorSecondaryResult>(await api.post('/api/results/junior-secondary/results/', data));
    } catch (error) {
      console.error('Error creating junior secondary result:', error);
      throw error;
    }
  }

  async updateJuniorSecondaryResult(id: string, data: Partial<JuniorSecondaryResult>): Promise<JuniorSecondaryResult> {
    try {
      return this.single<JuniorSecondaryResult>(
        await api.patch(`/api/results/junior-secondary/results/${id}/`, data)
      );
    } catch (error) {
      console.error('Error updating junior secondary result:', error);
      throw error;
    }
  }

  async deleteJuniorSecondaryResult(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/junior-secondary/results/${id}/`);
    } catch (error) {
      console.error('Error deleting junior secondary result:', error);
      throw error;
    }
  }

  async getSeniorSecondaryTermlyResults(filters?: ResultFilters): Promise<SeniorSecondaryResult[]> {
    try {
      return this.list<SeniorSecondaryResult>(await api.get('/api/results/senior-secondary/results/', filters));
    } catch (error) {
      console.error('Error fetching senior secondary results:', error);
      throw error;
    }
  }

  async getSeniorSecondaryTermReports(filters?: ResultFilters): Promise<any[]> {
    try {
      return this.list(await api.get('/api/results/senior-secondary/term-reports/', filters));
    } catch (error) {
      console.error('Error fetching senior secondary term reports:', error);
      throw error;
    }
  }

  async createSeniorSecondaryResult(data: Partial<SeniorSecondaryResult>): Promise<SeniorSecondaryResult> {
    try {
      return this.single<SeniorSecondaryResult>(await api.post('/api/results/senior-secondary/results/', data));
    } catch (error) {
      console.error('Error creating senior secondary result:', error);
      throw error;
    }
  }

  async updateSeniorSecondaryResult(id: string, data: Partial<SeniorSecondaryResult>): Promise<SeniorSecondaryResult> {
    try {
      return this.single<SeniorSecondaryResult>(
        await api.patch(`/api/results/senior-secondary/results/${id}/`, data)
      );
    } catch (error) {
      console.error('Error updating senior secondary result:', error);
      throw error;
    }
  }

  async deleteSeniorSecondaryResult(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/senior-secondary/results/${id}/`);
    } catch (error) {
      console.error('Error deleting senior secondary result:', error);
      throw error;
    }
  }

  async getSeniorSecondarySessionResults(filters?: ResultFilters): Promise<SeniorSecondarySessionResult[]> {
    try {
      return this.list<SeniorSecondarySessionResult>(
        await api.get('/api/results/senior-secondary/session-results/', filters)
      );
    } catch (error) {
      console.error('Error fetching senior secondary session results:', error);
      throw error;
    }
  }

  async createSeniorSecondarySessionResult(
    data: Partial<SeniorSecondarySessionResult>
  ): Promise<SeniorSecondarySessionResult> {
    try {
      return this.single<SeniorSecondarySessionResult>(
        await api.post('/api/results/senior-secondary/session-results/', data)
      );
    } catch (error) {
      console.error('Error creating senior secondary session result:', error);
      throw error;
    }
  }

  async updateSeniorSecondarySessionResult(
    id: string,
    data: Partial<SeniorSecondarySessionResult>
  ): Promise<SeniorSecondarySessionResult> {
    try {
      return this.single<SeniorSecondarySessionResult>(
        await api.patch(`/api/results/senior-secondary/session-results/${id}/`, data)
      );
    } catch (error) {
      console.error('Error updating senior secondary session result:', error);
      throw error;
    }
  }

  async deleteSeniorSecondarySessionResult(id: string): Promise<void> {
    try {
      await api.delete(`/api/results/senior-secondary/session-results/${id}/`);
    } catch (error) {
      console.error('Error deleting senior secondary session result:', error);
      throw error;
    }
  }

  // ── Generic/legacy result endpoints ───────────────────────────────────────

  async getStudentResults(filters?: ResultFilters): Promise<StudentResult[]> {
    try {
      return this.list<StudentResult>(await api.get('/api/results/student-results/', filters));
    } catch (error) {
      console.error('Error fetching student results:', error);
      throw error;
    }
  }

  async getStudentResultsByStudent(studentId: string): Promise<StudentResult[]> {
    try {
      return this.list<StudentResult>(
        await api.get('/api/results/student-results/by_student/', { student: studentId })
      );
    } catch (error) {
      console.error('Error fetching student results by student:', error);
      throw error;
    }
  }

  async getStudentTermResults(filters?: ResultFilters): Promise<StudentTermResult[]> {
    try {
      return this.list<StudentTermResult>(await api.get('/api/results/student-term-results/', filters));
    } catch (error) {
      console.error('Error fetching student term results:', error);
      throw error;
    }
  }

  async getStudentTermResultDetailed(resultId: string): Promise<any> {
    try {
      return this.single(await api.get(`/api/results/student-term-results/${resultId}/detailed/`));
    } catch (error) {
      console.error('Error fetching detailed student term result:', error);
      throw error;
    }
  }

  async getResultSheets(filters?: ResultFilters): Promise<ApiResultSheet[]> {
    try {
      return this.list<ApiResultSheet>(await api.get('/api/results/result-sheets/', filters));
    } catch (error) {
      console.error('Error fetching result sheets:', error);
      throw error;
    }
  }

  async approveResultSheet(sheetId: string): Promise<any> {
    try {
      return this.single(await api.post(`/api/results/result-sheets/${sheetId}/approve/`, {}));
    } catch (error) {
      console.error('Error approving result sheet:', error);
      throw error;
    }
  }

  async getAssessmentScores(filters?: ResultFilters): Promise<AssessmentScore[]> {
    try {
      return this.list<AssessmentScore>(await api.get('/api/results/assessment-scores/', filters));
    } catch (error) {
      console.error('Error fetching assessment scores:', error);
      throw error;
    }
  }

  async getResultComments(filters?: ResultFilters): Promise<ResultComment[]> {
    try {
      return this.list<ResultComment>(await api.get('/api/results/result-comments/', filters));
    } catch (error) {
      console.error('Error fetching result comments:', error);
      throw error;
    }
  }

  // ── Approval & publishing ──────────────────────────────────────────────────

  async approveResult(
    educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary' | 'student',
    resultId: string
  ): Promise<any> {
    try {
      const endpoint =
        educationLevel === 'student'
          ? `/api/results/student-results/${resultId}/approve/`
          : `/api/results/${educationLevel}/results/${resultId}/approve/`;
      return this.single(await api.post(endpoint, {}));
    } catch (error) {
      console.error(`Error approving ${educationLevel} result:`, error);
      throw error;
    }
  }

  async publishResult(
    educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary' | 'student',
    resultId: string
  ): Promise<any> {
    try {
      const endpoint =
        educationLevel === 'student'
          ? `/api/results/student-results/${resultId}/publish/`
          : `/api/results/${educationLevel}/results/${resultId}/publish/`;
      return this.single(await api.post(endpoint, {}));
    } catch (error) {
      console.error(`Error publishing ${educationLevel} result:`, error);
      throw error;
    }
  }

  async publishTermReport(
    educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
    reportId: string
  ): Promise<any> {
    try {
      return this.single(
        await api.post(`/api/results/${educationLevel}/term-reports/${reportId}/publish/`, {})
      );
    } catch (error) {
      console.error(`Error publishing ${educationLevel} term report:`, error);
      throw error;
    }
  }

  async calculateTermReportMetrics(
    educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
    reportId: string
  ): Promise<any> {
    try {
      return this.single(
        await api.post(`/api/results/${educationLevel}/term-reports/${reportId}/calculate_metrics/`, {})
      );
    } catch (error) {
      console.error(`Error calculating ${educationLevel} term report metrics:`, error);
      throw error;
    }
  }

  async bulkPublishSeniorSecondaryTermReports(data: any): Promise<any> {
    try {
      return this.single(
        await api.post('/api/results/senior-secondary/term-reports/bulk_publish/', data)
      );
    } catch (error) {
      console.error('Error bulk publishing senior secondary term reports:', error);
      throw error;
    }
  }

  async calculateSessionReportMetrics(reportId: string): Promise<any> {
    try {
      return this.single(
        await api.post(
          `/api/results/senior-secondary/session-reports/${reportId}/calculate_metrics/`,
          {}
        )
      );
    } catch (error) {
      console.error('Error calculating session report metrics:', error);
      throw error;
    }
  }

  // ── Bulk operations & statistics ───────────────────────────────────────────

  async bulkCreateResults(
    educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
    results: any[]
  ): Promise<any[]> {
    try {
      return this.list(await api.post(`results/${educationLevel}/results/bulk_create/`, results));
    } catch (error) {
      console.error(`Error bulk creating ${educationLevel} results:`, error);
      throw error;
    }
  }

  async getResultStatistics(
    educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
    filters?: { exam_session?: string; class_level?: string; subject?: string }
  ): Promise<any> {
    try {
      return this.single(
        await api.get(`/api/results/${educationLevel}/results/class_statistics/`, filters)
      );
    } catch (error) {
      console.error(`Error fetching ${educationLevel} result statistics:`, error);
      throw error;
    }
  }

  async getGradeDistribution(filters?: ResultFilters): Promise<any> {
    try {
      return this.single(
        await api.get('/api/results/senior-secondary/results/grade_distribution/', filters)
      );
    } catch (error) {
      console.error('Error fetching grade distribution:', error);
      throw error;
    }
  }

  // ── Result Checker ─────────────────────────────────────────────────────────

  async checkResult(data: {
    student_id?: string;
    registration_number?: string;
    exam_session_id?: string;
    access_code?: string;
  }): Promise<any> {
    try {
      return this.single(await api.post('/api/results/result-checker/', data));
    } catch (error) {
      console.error('Error checking result:', error);
      throw error;
    }
  }

  async getResultCheckerOptions(): Promise<{
    exam_sessions: ExamSession[];
    access_required: boolean;
    available_formats: string[];
  }> {
    try {
      return this.single(await api.get('/api/results/result-checker/options/'));
    } catch (error) {
      console.error('Error fetching result checker options:', error);
      throw error;
    }
  }

  // ── PDF download methods ───────────────────────────────────────────────────

  /** Download a term report as PDF. Auth via httpOnly cookie. */
  async downloadTermReportPDF(reportId: string, educationLevel: string): Promise<Blob> {
    const params = new URLSearchParams({
      report_id: reportId,
      education_level: educationLevel.toUpperCase(),
    });

    const response = await fetch(
      `${getBaseUrl()}/results/report-generation/download-term-report/?${params}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: buildHeaders(),
      }
    );

    if (!response.ok) await throwFromResponse(response);

    const blob = await response.blob();
    if (blob.size === 0) throw new Error('Received empty PDF. The report may not be ready yet.');
    return blob;
  }

  /** Download a session report as PDF (Senior Secondary only). Auth via httpOnly cookie. */
  async downloadSessionReportPDF(reportId: string): Promise<Blob> {
    const params = new URLSearchParams({ report_id: reportId });

    const response = await fetch(
      `${getBaseUrl()}/results/report-generation/download-session-report/?${params}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: buildHeaders(),
      }
    );

    if (!response.ok) await throwFromResponse(response);

    const blob = await response.blob();
    if (blob.size === 0) throw new Error('Received empty PDF.');
    return blob;
  }

  /** Bulk-download multiple term reports as a ZIP. Auth via httpOnly cookie. */
  async bulkDownloadTermReports(reportIds: string[], educationLevel: string): Promise<Blob> {
    if (!reportIds.length) throw new Error('No report IDs provided for bulk download.');

    const response = await fetch(
      `${getBaseUrl()}/results/report-generation/bulk-download/`,
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

  // ── Utilities ──────────────────────────────────────────────────────────────

  getEducationLevelEndpoint(educationLevel: string): string {
    const mapping: Record<string, string> = {
      NURSERY: 'nursery',
      PRIMARY: 'primary',
      JUNIOR_SECONDARY: 'junior-secondary',
      SENIOR_SECONDARY: 'senior-secondary',
    };
    return mapping[educationLevel] ?? educationLevel.toLowerCase().replace('_', '-');
  }
}

export default new ResultSettingsService();