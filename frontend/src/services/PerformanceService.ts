import api from './api';

const BASE = '/api/teachers';

// ── Types ────────────────────────────────────────────────────────────────────

export type AppraiserRole = 'proprietress' | 'head_teacher' | 'form_teacher' | 'admin';
export type AppraisalPeriod = 'first_term' | 'second_term' | 'third_term' | 'annual' | 'probation';
export type AppraisalStatus = 'draft' | 'submitted' | 'acknowledged';
export type NoteType = 'commendation' | 'appreciation' | 'query' | 'warning' | 'caution' | 'improvement_plan';
export type NoteCategory =
  | 'punctuality' | 'performance' | 'conduct' | 'innovation'
  | 'teamwork' | 'student_relations' | 'administrative' | 'other';

export interface AppraisalCriteria {
  id: number;
  name: string;
  code: string;
  description: string;
  applicable_to: 'all' | 'teaching' | 'non-teaching';
  applicable_to_display: string;
  max_score: number;
  display_order: number;
  is_active: boolean;
  is_system_default: boolean;
}

export interface AppraisalScore {
  id?: number;
  criteria: number;
  criteria_name: string;
  criteria_code: string;
  max_score: number;
  score: number;
  score_percentage: number;
  comment: string;
}

export interface PerformanceAppraisal {
  id: number;
  teacher: number;
  teacher_name: string;
  teacher_employee_id: string;
  teacher_staff_type: string;
  teacher_class_name: string;
  appraiser: number | null;
  appraiser_name: string;
  appraiser_role: AppraiserRole;
  appraiser_role_display: string;
  period: AppraisalPeriod;
  period_display: string;
  academic_year: string;
  status: AppraisalStatus;
  status_display: string;
  overall_score: number | null;
  overall_grade: string;
  overall_comment: string;
  recommendation: string;
  teacher_response: string;
  scores: AppraisalScore[];
  submitted_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface StaffNote {
  id: number;
  teacher: number;
  teacher_name: string;
  teacher_employee_id: string;
  issued_by: number | null;
  issued_by_name: string;
  note_type: NoteType;
  note_type_display: string;
  category: NoteCategory;
  category_display: string;
  title: string;
  content: string;
  is_positive: boolean;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  teacher_comment: string;
  created_at: string;
}

export interface CreateAppraisalPayload {
  teacher: number;
  appraiser_role: AppraiserRole;
  period: AppraisalPeriod;
  academic_year: string;
  overall_comment?: string;
  recommendation?: string;
  scores?: Array<{ criteria: number; score: number; comment?: string }>;
}

export interface CreateNotePayload {
  teacher: number;
  note_type: NoteType;
  category: NoteCategory;
  title: string;
  content: string;
}

export type PDType =
  | 'training' | 'workshop' | 'certification' | 'seminar'
  | 'conference' | 'course' | 'degree' | 'other';

export type PDApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ProfessionalDevelopment {
  id: number;
  teacher: number;
  teacher_name: string;
  teacher_employee_id: string;
  title: string;
  dev_type: PDType;
  dev_type_display: string;
  provider: string;
  date_completed: string;
  date_expires: string | null;
  duration_hours: string | null;
  certificate_url: string | null;
  description: string;
  approval_status: PDApprovalStatus;
  approval_status_display: string;
  rejection_reason: string;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  is_verified: boolean;
  is_expired: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePDPayload {
  title: string;
  dev_type: PDType;
  provider?: string;
  date_completed: string;
  date_expires?: string;
  duration_hours?: number;
  certificate_url?: string;
  description?: string;
}

export interface PDSummary {
  total_records: number;
  total_hours: number;
  certifications: number;
  workshops: number;
  by_type: Array<{ dev_type: string; count: number }>;
}

// ── Service ──────────────────────────────────────────────────────────────────

const PerformanceService = {
  // ── Criteria ────────────────────────────────────────────────────────────

  getCriteria(params?: { applicable_to?: string; is_active?: boolean }) {
    return api.get(`${BASE}/appraisal-criteria/`, params as any) as Promise<AppraisalCriteria[]>;
  },

  createCriteria(data: Partial<AppraisalCriteria>) {
    return api.post(`${BASE}/appraisal-criteria/`, data) as Promise<AppraisalCriteria>;
  },

  updateCriteria(id: number, data: Partial<AppraisalCriteria>) {
    return api.patch(`${BASE}/appraisal-criteria/${id}/`, data) as Promise<AppraisalCriteria>;
  },

  deleteCriteria(id: number) {
    return api.delete(`${BASE}/appraisal-criteria/${id}/`);
  },

  seedDefaultCriteria() {
    return api.post(`${BASE}/appraisal-criteria/seed-defaults/`, {}) as Promise<{ seeded: number; total: number; message: string }>;
  },

  // ── Appraisals ───────────────────────────────────────────────────────────

  getAppraisals(params?: {
    status?: AppraisalStatus;
    period?: AppraisalPeriod;
    teacher?: number;
    appraiser_role?: AppraiserRole;
    search?: string;
  }) {
    return api.get(`${BASE}/appraisals/`, params as any) as Promise<PerformanceAppraisal[]>;
  },

  getAppraisal(id: number) {
    return api.get(`${BASE}/appraisals/${id}/`) as Promise<PerformanceAppraisal>;
  },

  createAppraisal(data: CreateAppraisalPayload) {
    return api.post(`${BASE}/appraisals/`, data) as Promise<PerformanceAppraisal>;
  },

  updateAppraisal(id: number, data: Partial<CreateAppraisalPayload>) {
    return api.patch(`${BASE}/appraisals/${id}/`, data) as Promise<PerformanceAppraisal>;
  },

  deleteAppraisal(id: number) {
    return api.delete(`${BASE}/appraisals/${id}/`);
  },

  submitAppraisal(id: number) {
    return api.post(`${BASE}/appraisals/${id}/submit/`, {}) as Promise<PerformanceAppraisal>;
  },

  acknowledgeAppraisal(id: number, teacher_response?: string) {
    return api.post(`${BASE}/appraisals/${id}/acknowledge/`, { teacher_response }) as Promise<PerformanceAppraisal>;
  },

  getAppraisalSummary() {
    return api.get(`${BASE}/appraisals/summary/`) as Promise<{
      total: number;
      by_status: Record<string, number>;
      by_period: Array<{ period: string; count: number }>;
      pending_acknowledgment: PerformanceAppraisal[];
    }>;
  },

  // ── Staff Notes ──────────────────────────────────────────────────────────

  getNotes(params?: {
    note_type?: NoteType;
    category?: NoteCategory;
    is_acknowledged?: boolean;
    teacher?: number;
    search?: string;
  }) {
    return api.get(`${BASE}/staff-notes/`, params as any) as Promise<StaffNote[]>;
  },

  getNote(id: number) {
    return api.get(`${BASE}/staff-notes/${id}/`) as Promise<StaffNote>;
  },

  createNote(data: CreateNotePayload) {
    return api.post(`${BASE}/staff-notes/`, data) as Promise<StaffNote>;
  },

  updateNote(id: number, data: Partial<CreateNotePayload>) {
    return api.patch(`${BASE}/staff-notes/${id}/`, data) as Promise<StaffNote>;
  },

  deleteNote(id: number) {
    return api.delete(`${BASE}/staff-notes/${id}/`);
  },

  acknowledgeNote(id: number, teacher_comment?: string) {
    return api.post(`${BASE}/staff-notes/${id}/acknowledge/`, { teacher_comment }) as Promise<StaffNote>;
  },

  getNotesSummary() {
    return api.get(`${BASE}/staff-notes/summary/`) as Promise<{
      total: number;
      unacknowledged: number;
      by_type: Array<{ note_type: string; count: number }>;
    }>;
  },

  // ── Professional Development ─────────────────────────────────────────────

  getPDRecords(params?: { dev_type?: string; is_verified?: boolean; teacher?: number }) {
    return api.get(`${BASE}/professional-development/`, params as any) as Promise<ProfessionalDevelopment[]>;
  },

  getPDRecord(id: number) {
    return api.get(`${BASE}/professional-development/${id}/`) as Promise<ProfessionalDevelopment>;
  },

  createPDRecord(data: CreatePDPayload) {
    return api.post(`${BASE}/professional-development/`, data) as Promise<ProfessionalDevelopment>;
  },

  updatePDRecord(id: number, data: Partial<CreatePDPayload>) {
    return api.patch(`${BASE}/professional-development/${id}/`, data) as Promise<ProfessionalDevelopment>;
  },

  deletePDRecord(id: number) {
    return api.delete(`${BASE}/professional-development/${id}/`);
  },

  reviewPDRecord(id: number, action: 'approve' | 'reject', rejection_reason?: string) {
    return api.post(`${BASE}/professional-development/${id}/review/`, { action, rejection_reason }) as Promise<ProfessionalDevelopment>;
  },

  revokeApproval(id: number) {
    return api.post(`${BASE}/professional-development/${id}/revoke-approval/`, {}) as Promise<ProfessionalDevelopment>;
  },

  async downloadPDReport(teacherId: number, teacherName: string): Promise<void> {
    const params = new URLSearchParams({ teacher: String(teacherId) });
    const res = await fetch(
      `/api/teachers/professional-development/teacher-report/?${params}`,
      { method: 'GET', credentials: 'include' }
    );
    if (!res.ok) throw new Error('Failed to generate PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PD_Report_${teacherName.replace(/ /g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },

  getPDSummary(params?: { teacher?: number }) {
    return api.get(`${BASE}/professional-development/summary/`, params as any) as Promise<PDSummary>;
  },
};

export default PerformanceService;
