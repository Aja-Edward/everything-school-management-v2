/**
 * ResultSettingsService.ts
 *
 * Covers every endpoint in the result settings domain:
 *   - GradingSystem + Grade
 *   - AssessmentComponent  (replaces hardcoded score columns)
 *   - ExamType             (FK on ExamSession — no more hardcoded strings)
 *   - ExamSession
 *   - ScoringConfiguration
 *   - AssessmentType (legacy)
 */

import api from './api';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface GradingSystem {
  id: string;
  name: string;
  grading_type: 'PERCENTAGE' | 'POINTS' | 'LETTER' | 'PASS_FAIL';
  description: string;
  min_score: number;
  max_score: number;
  pass_mark: number;
  is_active: boolean;
  grades?: GradeRange[];
}

export interface GradingSystemCreateUpdate {
  name: string;
  grading_type: 'PERCENTAGE' | 'POINTS' | 'LETTER' | 'PASS_FAIL';
  description: string;
  min_score: number;
  max_score: number;
  pass_mark: number;
  is_active: boolean;
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

// ── AssessmentComponent ───────────────────────────────────────────────────────

export type ComponentType = 'CA' | 'EXAM' | 'PRACTICAL' | 'PROJECT' | 'ORAL' | 'OTHER';

export interface AssessmentComponent {
  id: number;
  education_level: string | { id: number; name: string; level_type: string };
  name: string;
  code: string;
  component_type: ComponentType;
  component_type_display: string;
  max_score: string; // Decimal from Django → string
  contributes_to_ca: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssessmentComponentCreateUpdate {
  education_level: number; // PK
  name: string;
  code: string;
  component_type: ComponentType;
  max_score: string;
  contributes_to_ca: boolean;
  display_order: number;
  is_active: boolean;
}

// ── ExamType ──────────────────────────────────────────────────────────────────

export type ExamTypeCategory = 'CA' | 'EXAM' | 'PRACTICAL' | 'PROJECT' | 'OTHER';

export interface ExamType {
  id: number;
  name: string;
  code: string;
  category: ExamTypeCategory;
  category_display: string;
  description: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExamTypeCreateUpdate {
  name: string;
  code: string;
  category: ExamTypeCategory;
  description: string;
  display_order: number;
  is_active: boolean;
}

// ── ExamSession ───────────────────────────────────────────────────────────────

export interface ExamSession {
  id: string;
  name: string;
  /** ExamType FK — serialized as nested object */
  exam_type: ExamType | number;
  exam_type_name: string;
  exam_type_code: string;
  exam_type_category: string;
  academic_session: any;
  term: any;
  term_name: string | null;
  start_date: string;
  end_date: string;
  result_release_date: string;
  is_published: boolean;
  is_active: boolean;
}

export interface ExamSessionCreateUpdate {
  id?: string;
  name: string;
  /** PK of ExamType */
  exam_type: number | string;
  /** PK of Term */
  term: number | string;
  /** PK of AcademicSession */
  academic_session: number | string;
  start_date: string;
  end_date: string;
  result_release_date: string;
  is_published: boolean;
  is_active: boolean;
}

// ── ScoringConfiguration ──────────────────────────────────────────────────────

export interface ScoringConfiguration {
  id: string;
  name: string;
  education_level: string;
  education_level_display: string;
  result_type: 'TERMLY' | 'SESSION';
  result_type_display: string;
  description: string;
  total_max_score: number;
  is_active: boolean;
  is_default: boolean;
  created_by_name: string | null;
  // Legacy fields still on the model (may be null)
  first_test_max_score?: number;
  second_test_max_score?: number;
  third_test_max_score?: number;
  exam_max_score?: number;
  ca_weight_percentage?: number;
  exam_weight_percentage?: number;
  continuous_assessment_max_score?: number;
  take_home_test_max_score?: number;
  appearance_max_score?: number;
  practical_max_score?: number;
  project_max_score?: number;
  note_copying_max_score?: number;
  total_ca_max_score?: number;
}

export interface ScoringConfigurationCreateUpdate {
  id?: string;
  name: string;
  education_level: string;
  result_type: 'TERMLY' | 'SESSION';
  description: string;
  total_max_score: number;
  is_active: boolean;
  is_default: boolean;
  // Optional legacy fields
  first_test_max_score?: number;
  second_test_max_score?: number;
  third_test_max_score?: number;
  exam_max_score?: number;
  ca_weight_percentage?: number;
  exam_weight_percentage?: number;
  continuous_assessment_max_score?: number;
  take_home_test_max_score?: number;
  appearance_max_score?: number;
  practical_max_score?: number;
  project_max_score?: number;
  note_copying_max_score?: number;
}

// ── AssessmentType (legacy) ───────────────────────────────────────────────────

export interface AssessmentType {
  id: string;
  name: string;
  code: string;
  description: string;
  education_level: string;
  max_score: number;
  weight_percentage: number;
  is_active: boolean;
}

export interface AssessmentTypeCreateUpdate {
  name: string;
  code: string;
  description: string;
  education_level: string;
  max_score: number;
  weight_percentage: number;
  is_active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function extractArray<T>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res?.results && Array.isArray(res.results)) return res.results as T[];
  if (res?.data && Array.isArray(res.data)) return res.data as T[];
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────

class ResultSettingsService {
  private base = '/api/results';

  // ── Grading Systems ─────────────────────────────────────────────────────────

  async getGradingSystems(): Promise<GradingSystem[]> {
    const res = await api.get(`${this.base}/grading-systems/`);
    return extractArray<GradingSystem>(res);
  }

  async createGradingSystem(data: GradingSystemCreateUpdate): Promise<GradingSystem> {
    return api.post(`${this.base}/grading-systems/`, data);
  }

  async updateGradingSystem(id: string, data: GradingSystemCreateUpdate): Promise<GradingSystem> {
    return api.patch(`${this.base}/grading-systems/${id}/`, data);
  }

  async deleteGradingSystem(id: string): Promise<void> {
    return api.delete(`${this.base}/grading-systems/${id}/`);
  }

  // ── Grades ──────────────────────────────────────────────────────────────────

  async getGrades(params?: { grading_system?: string }): Promise<GradeRange[]> {
    const res = await api.get(`${this.base}/grades/`, params);
    return extractArray<GradeRange>(res);
  }

  async createGrade(data: GradeCreateUpdate): Promise<GradeRange> {
    return api.post(`${this.base}/grades/`, data);
  }

  async updateGrade(id: string, data: GradeCreateUpdate): Promise<GradeRange> {
    return api.patch(`${this.base}/grades/${id}/`, data);
  }

  async deleteGrade(id: string): Promise<void> {
    return api.delete(`${this.base}/grades/${id}/`);
  }

  // ── AssessmentComponent ─────────────────────────────────────────────────────

  async getAssessmentComponents(params?: {
    education_level?: string | number;
    component_type?: ComponentType;
    is_active?: boolean;
    contributes_to_ca?: boolean;
  }): Promise<AssessmentComponent[]> {
    const res = await api.get(`${this.base}/assessment-components/`, params);
    return extractArray<AssessmentComponent>(res);
  }

  async getComponentsByEducationLevel(
    educationLevel: string | number
  ): Promise<AssessmentComponent[]> {
    const res = await api.get(
      `${this.base}/assessment-components/by_education_level/`,
      { education_level: educationLevel }
    );
    return extractArray<AssessmentComponent>(res);
  }

  async createAssessmentComponent(
    data: AssessmentComponentCreateUpdate
  ): Promise<AssessmentComponent> {
    return api.post(`${this.base}/assessment-components/`, data);
  }

  async updateAssessmentComponent(
    id: number,
    data: Partial<AssessmentComponentCreateUpdate>
  ): Promise<AssessmentComponent> {
    return api.patch(`${this.base}/assessment-components/${id}/`, data);
  }

  async deleteAssessmentComponent(id: number): Promise<void> {
    return api.delete(`${this.base}/assessment-components/${id}/`);
  }

  // ── ExamType ────────────────────────────────────────────────────────────────

  async getExamTypes(params?: { category?: ExamTypeCategory; is_active?: boolean }): Promise<ExamType[]> {
    const res = await api.get(`${this.base}/exam-types/`, params);
    return extractArray<ExamType>(res);
  }

  async createExamType(data: ExamTypeCreateUpdate): Promise<ExamType> {
    return api.post(`${this.base}/exam-types/`, data);
  }

  async updateExamType(id: number, data: Partial<ExamTypeCreateUpdate>): Promise<ExamType> {
    return api.patch(`${this.base}/exam-types/${id}/`, data);
  }

  async deleteExamType(id: number): Promise<void> {
    return api.delete(`${this.base}/exam-types/${id}/`);
  }

  async activateExamType(id: number): Promise<ExamType> {
    return api.post(`${this.base}/exam-types/${id}/activate/`, {});
  }

  async deactivateExamType(id: number): Promise<ExamType> {
    return api.post(`${this.base}/exam-types/${id}/deactivate/`, {});
  }

  // ── ExamSession ─────────────────────────────────────────────────────────────

  async getExamSessions(params?: Record<string, unknown>): Promise<ExamSession[]> {
    const res = await api.get(`${this.base}/exam-sessions/`, params);
    return extractArray<ExamSession>(res);
  }

  async createExamSession(data: ExamSessionCreateUpdate): Promise<ExamSession> {
    return api.post(`${this.base}/exam-sessions/`, data);
  }

  async updateExamSession(id: string, data: ExamSessionCreateUpdate): Promise<ExamSession> {
    return api.patch(`${this.base}/exam-sessions/${id}/`, data);
  }

  async deleteExamSession(id: string): Promise<void> {
    return api.delete(`${this.base}/exam-sessions/${id}/`);
  }

  async publishExamSession(id: string): Promise<ExamSession> {
    return api.post(`${this.base}/exam-sessions/${id}/publish/`, {});
  }

  // ── ScoringConfiguration ────────────────────────────────────────────────────

  async getScoringConfigurations(params?: Record<string, unknown>): Promise<ScoringConfiguration[]> {
    const res = await api.get(`${this.base}/scoring-configurations/`, params);
    return extractArray<ScoringConfiguration>(res);
  }

  async createScoringConfiguration(data: ScoringConfigurationCreateUpdate): Promise<ScoringConfiguration> {
    return api.post(`${this.base}/scoring-configurations/`, data);
  }

  async updateScoringConfiguration(
    id: string,
    data: Partial<ScoringConfigurationCreateUpdate>
  ): Promise<ScoringConfiguration> {
    return api.patch(`${this.base}/scoring-configurations/${id}/`, data);
  }

  async deleteScoringConfiguration(id: string): Promise<void> {
    return api.delete(`${this.base}/scoring-configurations/${id}/`);
  }

  async setDefaultScoringConfiguration(id: string): Promise<ScoringConfiguration> {
    return api.post(`${this.base}/scoring-configurations/${id}/set_as_default/`, {});
  }

  // ── AssessmentType (legacy) ─────────────────────────────────────────────────

  async getAssessmentTypes(): Promise<AssessmentType[]> {
    const res = await api.get(`${this.base}/assessment-types/`);
    return extractArray<AssessmentType>(res);
  }

  async createAssessmentType(data: AssessmentTypeCreateUpdate): Promise<AssessmentType> {
    return api.post(`${this.base}/assessment-types/`, data);
  }

  async updateAssessmentType(id: string, data: AssessmentTypeCreateUpdate): Promise<AssessmentType> {
    return api.patch(`${this.base}/assessment-types/${id}/`, data);
  }

  async deleteAssessmentType(id: string): Promise<void> {
    return api.delete(`${this.base}/assessment-types/${id}/`);
  }

  // ── AcademicSessions (for dropdowns) ───────────────────────────────────────

  async getAcademicSessions(): Promise<any[]> {
    const res = await api.get('/api/academics/sessions/');
    return extractArray(res);
  }

  async getTerms(params?: { academic_session?: number | string }): Promise<any[]> {
    const res = await api.get('/api/academics/terms/', params);
    return extractArray(res);
  }
}

export default new ResultSettingsService();