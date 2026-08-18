import { useEffect, useMemo } from 'react';
import { useSettings } from './useSettings';
import ResultSettingsService from '@/services/ResultSettingsService';
import resultCheckerService from '@/services/ResultCheckerService';

import type { 
  GradingSystem, 
  GradeRange, 
  AssessmentType, 
  ExamSession, 
  ScoringConfiguration,
  
  GradingSystemCreateUpdate,
  AssessmentTypeCreateUpdate,
  ExamSessionCreateUpdate,
  ScoringConfigurationCreateUpdate,
  GradeCreateUpdate,

} from '@/services/ResultSettingsService';

// Result row shapes live in ResultService, which owns those endpoints.
import type {
  NurseryResult,
  PrimaryResult,
  JuniorSecondaryResult,
  SeniorSecondaryResult,
  SeniorSecondarySessionReport,
} from '@/services/ResultService';

/**
 * Filters accepted by the ResultCheckerService lookups below. Kept loose on
 * purpose: the wrappers forward it straight through, and the checker service
 * validates what it actually supports.
 */
export interface ResultFilters {
  student?: string | number;
  subject?: string | number;
  exam_session?: string | number;
  academic_session?: string | number;
  term?: string | number;
  status?: string;
  [key: string]: unknown;
}

/** Query params for the exam-sessions list. */
export interface ExamSessionFilters {
  academic_session?: string | number;
  term?: string | number;
  is_active?: boolean;
  is_published?: boolean;
  [key: string]: unknown;
}

/** A student's results as returned by ResultCheckerService. */
export type StudentResult = Record<string, unknown>;

/** A student's term results as returned by ResultCheckerService. */
export type StudentTermResult = Record<string, unknown>;

/**
 * Shape of an enhanced (template-rendered) result sheet.
 *
 * There is no backend implementation yet -- generateEnhancedResultSheet below
 * resolves to null -- but StudentResultDisplay2 imports this type, so it is
 * declared and exported here rather than left dangling.
 */
export type EnhancedResultSheet = Record<string, unknown>;

export const useResultService = () => {
  const { settings, isLoading, error } = useSettings();

  // Sync school settings to the service when available
  // Guard: setSchoolSettings may not exist on all versions of ResultSettingsService
  useEffect(() => {
    if (settings && typeof (ResultSettingsService as any).setSchoolSettings === 'function') {
      (ResultSettingsService as any).setSchoolSettings(settings);
    }
  }, [settings]);

  // Memoized service wrapper to provide type-safe methods
  const service = useMemo(() => ({
    // School Settings (guard: these methods may not exist on all service versions)
    getSchoolSettings: () => typeof (ResultSettingsService as any).getSchoolSettings === 'function'
      ? (ResultSettingsService as any).getSchoolSettings()
      : null,
    setSchoolSettings: (schoolSettings: any) => typeof (ResultSettingsService as any).setSchoolSettings === 'function'
      ? (ResultSettingsService as any).setSchoolSettings(schoolSettings)
      : undefined,

    // Grading Systems - Updated with proper methods
    getGradingSystems: (): Promise<GradingSystem[]> => ResultSettingsService.getGradingSystems(),
    createGradingSystem: (data: GradingSystemCreateUpdate): Promise<GradingSystem> => 
      ResultSettingsService.createGradingSystem(data),
    updateGradingSystem: (id: string, data: Partial<GradingSystemCreateUpdate>): Promise<GradingSystem> => 
      ResultSettingsService.updateGradingSystem(id, data),
    deleteGradingSystem: (id: string): Promise<void> => ResultSettingsService.deleteGradingSystem(id),
    getGrades: (gradingSystemId?: string): Promise<GradeRange[]> =>
      ResultSettingsService.getGrades(
        gradingSystemId ? { grading_system: gradingSystemId } : undefined
      ),
    createGrade: (data: GradeCreateUpdate): Promise<GradeRange> => ResultSettingsService.createGrade(data),
    updateGrade: (id: string, data: Partial<GradeCreateUpdate>): Promise<GradeRange> => 
      ResultSettingsService.updateGrade(id, data),
    deleteGrade: (id: string): Promise<void> => ResultSettingsService.deleteGrade(id),

    // Assessment Types - Updated with education level filter
    getAssessmentTypes: (): Promise<AssessmentType[]> =>
      ResultSettingsService.getAssessmentTypes(),
    createAssessmentType: (data: AssessmentTypeCreateUpdate): Promise<AssessmentType> => 
      ResultSettingsService.createAssessmentType(data),
    updateAssessmentType: (id: string, data: Partial<AssessmentTypeCreateUpdate>): Promise<AssessmentType> => 
      ResultSettingsService.updateAssessmentType(id, data),
    deleteAssessmentType: (id: string): Promise<void> => ResultSettingsService.deleteAssessmentType(id),

    // Exam Sessions - Updated with proper filters
    getExamSessions: (filters?: ExamSessionFilters): Promise<ExamSession[]> => 
      ResultSettingsService.getExamSessions(filters),


    createExamSession: (data: ExamSessionCreateUpdate): Promise<ExamSession> => 
      ResultSettingsService.createExamSession(data),
    updateExamSession: (id: string, data: Partial<ExamSessionCreateUpdate>): Promise<ExamSession> => 
      ResultSettingsService.updateExamSession(id, data),
    deleteExamSession: (id: string): Promise<void> => ResultSettingsService.deleteExamSession(id),
    publishExamSession: (id: string): Promise<any> => ResultSettingsService.publishExamSession(id),
    getScoringConfigurations: (educationLevel?: string): Promise<ScoringConfiguration[]> =>
      ResultSettingsService.getScoringConfigurations(
        educationLevel ? { education_level: educationLevel } : undefined
      ),
    createScoringConfiguration: (data: ScoringConfigurationCreateUpdate): Promise<ScoringConfiguration> => 
      ResultSettingsService.createScoringConfiguration(data),
    updateScoringConfiguration: (id: string, data: Partial<ScoringConfigurationCreateUpdate>): Promise<ScoringConfiguration> => 
      ResultSettingsService.updateScoringConfiguration(id, data),
    deleteScoringConfiguration: (id: string): Promise<void> => ResultSettingsService.deleteScoringConfiguration(id),
    getScoringConfigurationsByEducationLevel: (educationLevel: string): Promise<ScoringConfiguration[]> => 
      ResultSettingsService.getScoringConfigurationsByEducationLevel(educationLevel),
    setDefaultScoringConfiguration: (id: string): Promise<any> => 
      ResultSettingsService.setDefaultScoringConfiguration(id),

    // Student Results — delegated to ResultCheckerService (correct service)
    getStudentResults: (filters?: ResultFilters): Promise<StudentResult[]> =>
      resultCheckerService.getStudentResults(filters as any) as any,
    getStudentResultsByStudent: (studentId: string): Promise<StudentResult[]> =>
      resultCheckerService.getStudentResults({ student: studentId } as any) as any,
    getStudentTermResults: (filters?: ResultFilters): Promise<StudentTermResult[]> =>
      resultCheckerService.getStudentTermResults(filters as any) as any,
    generateEnhancedResultSheet: (
      _studentId: string,
      _examSessionId: string,
      _templateId?: string
    ): Promise<EnhancedResultSheet | null> =>
      Promise.resolve(null),
    generateBulkResultSheets: (
      _studentIds: string[],
      _examSessionId: string
    ): Promise<EnhancedResultSheet[]> =>
      Promise.resolve([]),

    // Assessment Scores
    getNurseryResults: (filters?: ResultFilters): Promise<NurseryResult[]> =>
      resultCheckerService.getTermlyResults('NURSERY', filters as any) as any,
    getNurseryTermReports: (filters?: ResultFilters): Promise<any[]> =>
      resultCheckerService.getTermReports('NURSERY', filters as any),
    getPrimaryResults: (filters?: ResultFilters): Promise<PrimaryResult[]> =>
      resultCheckerService.getTermlyResults('PRIMARY', filters as any) as any,
    getPrimaryTermReports: (filters?: ResultFilters): Promise<any[]> =>
      resultCheckerService.getTermReports('PRIMARY', filters as any),
    getJuniorSecondaryResults: (filters?: ResultFilters): Promise<JuniorSecondaryResult[]> =>
      resultCheckerService.getTermlyResults('JUNIOR_SECONDARY', filters as any) as any,
    getJuniorSecondaryTermReports: (filters?: ResultFilters): Promise<any[]> =>
      resultCheckerService.getTermReports('JUNIOR_SECONDARY', filters as any),
    getSeniorSecondaryTermlyResults: (filters?: ResultFilters): Promise<SeniorSecondaryResult[]> =>
      resultCheckerService.getTermlyResults('SENIOR_SECONDARY', filters as any) as any,
    getSeniorSecondaryTermReports: (filters?: ResultFilters): Promise<any[]> =>
      resultCheckerService.getTermReports('SENIOR_SECONDARY', filters as any),
    getSeniorSecondarySessionResults: (filters?: ResultFilters): Promise<SeniorSecondarySessionReport[]> =>
      resultCheckerService.getSessionResults(filters as any) as any,
  }), []);

  return {
    service,
    schoolSettings: settings,
    loading: isLoading,
    error,
    // Helper flags
    isReady: !isLoading && !error && !!settings,
    hasSchoolSettings: !!settings,
  };
};

// Export types for convenience
export type {
  GradingSystem,
  GradeRange,
  AssessmentType,
  ExamSession,
  ScoringConfiguration,
  GradingSystemCreateUpdate,
  AssessmentTypeCreateUpdate,
  ExamSessionCreateUpdate,
  ScoringConfigurationCreateUpdate,
  GradeCreateUpdate,
  
};