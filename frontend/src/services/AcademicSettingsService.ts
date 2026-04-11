/**
 * Academic Settings Service
 *
 * All operations use a single endpoint: PATCH/GET /api/tenants/settings/
 * 
 * This endpoint (TenantSettingsViewSet.current) is the authoritative source
 * for all academic settings. It supports both GET (fetch) and PATCH (partial update).
 *
 * Settings are shared across all components via this centralized service.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AcademicYearSettings {
  academic_year_start: string;
  academic_year_end: string;
  terms_per_year: number;
  weeks_per_term: number;
}

export interface ClassSettings {
  allow_class_overflow: boolean;
  enable_streaming: boolean;
  enable_subject_electives: boolean;
}

export interface GradingSettings {
  grading_system: 'percentage' | 'letter' | 'gpa' | 'points';
  pass_percentage: number;
  enable_grade_curving: boolean;
  enable_grade_weighting: boolean;
}

export interface AttendanceSettings {
  require_attendance: boolean;
  minimum_attendance_percentage: number;
  enable_attendance_tracking: boolean;
  allow_late_arrival: boolean;
}

export interface CurriculumSettings {
  enable_cross_cutting_subjects: boolean;
  enable_subject_prerequisites: boolean;
  allow_subject_changes: boolean;
  enable_credit_system: boolean;
}

export interface AllAcademicSettings
  extends AcademicYearSettings,
    ClassSettings,
    GradingSettings,
    AttendanceSettings,
    CurriculumSettings {}

// ============================================================================
// DEFAULTS (fallback if backend fields are missing pre-migration)
// ============================================================================

const DEFAULTS: AllAcademicSettings = {
  academic_year_start: 'September',
  academic_year_end: 'July',
  terms_per_year: 3,
  weeks_per_term: 13,
  allow_class_overflow: false,
  enable_streaming: true,
  enable_subject_electives: true,
  grading_system: 'percentage',
  pass_percentage: 40,
  enable_grade_curving: false,
  enable_grade_weighting: true,
  require_attendance: true,
  minimum_attendance_percentage: 75,
  enable_attendance_tracking: true,
  allow_late_arrival: true,
  enable_cross_cutting_subjects: true,
  enable_subject_prerequisites: true,
  allow_subject_changes: true,
  enable_credit_system: true,
};

// ============================================================================
// SERVICE
// ============================================================================

class AcademicSettingsService {
  // TenantSettingsViewSet `current` action — supports both GET and PATCH
  // This is the authoritative endpoint for all academic settings
  private readonly endpoint = '/api/tenants/settings/';

  /**
   * Fetch all academic settings for the current tenant.
   */
  async getAcademicSettings(): Promise<AllAcademicSettings> {
    try {
      console.log('📥 Fetching academic settings from:', this.endpoint);
      const response = await api.get(this.endpoint);
      console.log('📊 Raw response:', response);

      return {
        academic_year_start:            response.academic_year_start            ?? DEFAULTS.academic_year_start,
        academic_year_end:              response.academic_year_end              ?? DEFAULTS.academic_year_end,
        terms_per_year:                 response.terms_per_year                 ?? DEFAULTS.terms_per_year,
        weeks_per_term:                 response.weeks_per_term                 ?? DEFAULTS.weeks_per_term,
        allow_class_overflow:           response.allow_class_overflow           ?? DEFAULTS.allow_class_overflow,
        enable_streaming:               response.enable_streaming               ?? DEFAULTS.enable_streaming,
        enable_subject_electives:       response.enable_subject_electives       ?? DEFAULTS.enable_subject_electives,
        grading_system:                 response.grading_system                 ?? DEFAULTS.grading_system,
        pass_percentage:                response.pass_percentage                ?? DEFAULTS.pass_percentage,
        enable_grade_curving:           response.enable_grade_curving           ?? DEFAULTS.enable_grade_curving,
        enable_grade_weighting:         response.enable_grade_weighting         ?? DEFAULTS.enable_grade_weighting,
        require_attendance:             response.require_attendance             ?? DEFAULTS.require_attendance,
        minimum_attendance_percentage:  response.minimum_attendance_percentage  ?? DEFAULTS.minimum_attendance_percentage,
        enable_attendance_tracking:     response.enable_attendance_tracking     ?? DEFAULTS.enable_attendance_tracking,
        allow_late_arrival:             response.allow_late_arrival             ?? DEFAULTS.allow_late_arrival,
        enable_cross_cutting_subjects:  response.enable_cross_cutting_subjects  ?? DEFAULTS.enable_cross_cutting_subjects,
        enable_subject_prerequisites:   response.enable_subject_prerequisites   ?? DEFAULTS.enable_subject_prerequisites,
        allow_subject_changes:          response.allow_subject_changes          ?? DEFAULTS.allow_subject_changes,
        enable_credit_system:           response.enable_credit_system           ?? DEFAULTS.enable_credit_system,
      };
    } catch (error) {
      console.error('Error fetching academic settings:', error);
      throw error;
    }
  }

  /**
   * Save a partial set of academic settings via PATCH.
   * Only the supplied fields are updated — all others remain untouched.
   */
 async updateAcademicSettings(data: Partial<AllAcademicSettings>): Promise<AllAcademicSettings> {
    console.log('📤 PATCH to:', this.endpoint);
    console.log('📤 PATCH payload:', JSON.stringify(data, null, 2));
    try {
      const response = await api.patch(this.endpoint, data);
      console.log('📥 PATCH response:', response);
      
      // Return the updated settings from the response
      if (response && typeof response === 'object') {
        return {
          academic_year_start:            response.academic_year_start            ?? DEFAULTS.academic_year_start,
          academic_year_end:              response.academic_year_end              ?? DEFAULTS.academic_year_end,
          terms_per_year:                 response.terms_per_year                 ?? DEFAULTS.terms_per_year,
          weeks_per_term:                 response.weeks_per_term                 ?? DEFAULTS.weeks_per_term,
          allow_class_overflow:           response.allow_class_overflow           ?? DEFAULTS.allow_class_overflow,
          enable_streaming:               response.enable_streaming               ?? DEFAULTS.enable_streaming,
          enable_subject_electives:       response.enable_subject_electives       ?? DEFAULTS.enable_subject_electives,
          grading_system:                 response.grading_system                 ?? DEFAULTS.grading_system,
          pass_percentage:                response.pass_percentage                ?? DEFAULTS.pass_percentage,
          enable_grade_curving:           response.enable_grade_curving           ?? DEFAULTS.enable_grade_curving,
          enable_grade_weighting:         response.enable_grade_weighting         ?? DEFAULTS.enable_grade_weighting,
          require_attendance:             response.require_attendance             ?? DEFAULTS.require_attendance,
          minimum_attendance_percentage:  response.minimum_attendance_percentage  ?? DEFAULTS.minimum_attendance_percentage,
          enable_attendance_tracking:     response.enable_attendance_tracking     ?? DEFAULTS.enable_attendance_tracking,
          allow_late_arrival:             response.allow_late_arrival             ?? DEFAULTS.allow_late_arrival,
          enable_cross_cutting_subjects:  response.enable_cross_cutting_subjects  ?? DEFAULTS.enable_cross_cutting_subjects,
          enable_subject_prerequisites:   response.enable_subject_prerequisites   ?? DEFAULTS.enable_subject_prerequisites,
          allow_subject_changes:          response.allow_subject_changes          ?? DEFAULTS.allow_subject_changes,
          enable_credit_system:           response.enable_credit_system           ?? DEFAULTS.enable_credit_system,
        };
      }
      throw new Error('Invalid response format from server');
    } catch (error: any) {
      console.error('Error saving academic settings:', error);
      
      // Log detailed error info
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Error data:', error.response.data);
        const errorMsg = error.response.data?.detail || error.response.data?.error || JSON.stringify(error.response.data);
        throw new Error(`Failed to save settings: ${errorMsg}`);
      }
      throw error;
    }
  }

  // ── Per-section convenience savers ─────────────────────────────────────────

  async saveAcademicYearSettings(data: AcademicYearSettings): Promise<AllAcademicSettings> {
    return this.updateAcademicSettings(data);
  }

  async saveClassSettings(data: ClassSettings): Promise<AllAcademicSettings> {
    return this.updateAcademicSettings(data);
  }

  async saveGradingSettings(data: GradingSettings): Promise<AllAcademicSettings> {
    return this.updateAcademicSettings(data);
  }

  async saveAttendanceSettings(data: AttendanceSettings): Promise<AllAcademicSettings> {
    return this.updateAcademicSettings(data);
  }

  async saveCurriculumSettings(data: CurriculumSettings): Promise<AllAcademicSettings> {
    return this.updateAcademicSettings(data);
  }
}

export const academicSettingsService = new AcademicSettingsService();
export default academicSettingsService;