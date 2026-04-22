import { useEffect, useMemo } from 'react';
import { useSettings } from './useSettings';
import ResultSettingsService from '@/services/ResultSettingsService';

import type { 
  GradingSystem, 
  GradeRange, 
  AssessmentType, 
  ExamSession, 
  ScoringConfiguration,
  StudentResult,
  StudentTermResult,
  ApiResultSheet,
  AssessmentScore,
  ResultComment,
  EnhancedResultSheet,
  GradingSystemCreateUpdate,
  AssessmentTypeCreateUpdate,
  ExamSessionCreateUpdate,
  ScoringConfigurationCreateUpdate,
  GradeCreateUpdate,
  ResultFilters,
  ExamSessionFilters,
  NurseryResult,
  PrimaryResult,
  JuniorSecondaryResult,
  SeniorSecondaryResult,
  SeniorSecondarySessionReport
} from '@/services/ResultSettingsService';

export const useResultService = () => {
  const { settings, isLoading, error } = useSettings();

  // Automatically set school settings when available
  useEffect(() => {
    if (settings) {
      ResultSettingsService.setSchoolSettings(settings);
    }
  }, [settings]);

  // Memoized service wrapper to provide type-safe methods
  const service = useMemo(() => ({
    // School Settings
    getSchoolSettings: () => ResultSettingsService.getSchoolSettings(),
    setSchoolSettings: (schoolSettings: any) => ResultSettingsService.setSchoolSettings(schoolSettings),

    // Grading Systems - Updated with proper methods
    getGradingSystems: (): Promise<GradingSystem[]> => ResultSettingsService.getGradingSystems(),
    getGradingSystem: (id: string): Promise<GradingSystem> => ResultSettingsService.getGradingSystem(id),
    createGradingSystem: (data: GradingSystemCreateUpdate): Promise<GradingSystem> => 
      ResultSettingsService.createGradingSystem(data),
    updateGradingSystem: (id: string, data: Partial<GradingSystemCreateUpdate>): Promise<GradingSystem> => 
      ResultSettingsService.updateGradingSystem(id, data),
    deleteGradingSystem: (id: string): Promise<void> => ResultSettingsService.deleteGradingSystem(id),
    activateGradingSystem: (id: string): Promise<any> => ResultSettingsService.activateGradingSystem(id),
    deactivateGradingSystem: (id: string): Promise<any> => ResultSettingsService.deactivateGradingSystem(id),

    // Grade Ranges - Updated with optional grading system filter
    getGrades: (gradingSystemId?: string): Promise<GradeRange[]> => ResultSettingsService.getGrades(gradingSystemId),
    createGrade: (data: GradeCreateUpdate): Promise<GradeRange> => ResultSettingsService.createGrade(data),
    updateGrade: (id: string, data: Partial<GradeCreateUpdate>): Promise<GradeRange> => 
      ResultSettingsService.updateGrade(id, data),
    deleteGrade: (id: string): Promise<void> => ResultSettingsService.deleteGrade(id),

    // Assessment Types - Updated with education level filter
    getAssessmentTypes: (educationLevel?: string): Promise<AssessmentType[]> => 
      ResultSettingsService.getAssessmentTypes(educationLevel),
    createAssessmentType: (data: AssessmentTypeCreateUpdate): Promise<AssessmentType> => 
      ResultSettingsService.createAssessmentType(data),
    updateAssessmentType: (id: string, data: Partial<AssessmentTypeCreateUpdate>): Promise<AssessmentType> => 
      ResultSettingsService.updateAssessmentType(id, data),
    deleteAssessmentType: (id: string): Promise<void> => ResultSettingsService.deleteAssessmentType(id),

    // Exam Sessions - Updated with proper filters
    getExamSessions: (filters?: ExamSessionFilters): Promise<ExamSession[]> => 
      ResultSettingsService.getExamSessions(filters),


    getExamSession: (id: string): Promise<ExamSession> => ResultSettingsService.getExamSession(id),
    createExamSession: (data: ExamSessionCreateUpdate): Promise<ExamSession> => 
      ResultSettingsService.createExamSession(data),
    updateExamSession: (id: string, data: Partial<ExamSessionCreateUpdate>): Promise<ExamSession> => 
      ResultSettingsService.updateExamSession(id, data),
    deleteExamSession: (id: string): Promise<void> => ResultSettingsService.deleteExamSession(id),
    publishExamSession: (id: string): Promise<any> => ResultSettingsService.publishExamSession(id),
    getExamSessionStatistics: (id: string): Promise<any> => ResultSettingsService.getExamSessionStatistics(id),

    // Scoring Configurations - Updated with all available methods
    getScoringConfigurations: (educationLevel?: string): Promise<ScoringConfiguration[]> => 
      ResultSettingsService.getScoringConfigurations(educationLevel),
    getScoringConfiguration: (id: string): Promise<ScoringConfiguration> => 
      ResultSettingsService.getScoringConfiguration(id),
    createScoringConfiguration: (data: ScoringConfigurationCreateUpdate): Promise<ScoringConfiguration> => 
      ResultSettingsService.createScoringConfiguration(data),
    updateScoringConfiguration: (id: string, data: Partial<ScoringConfigurationCreateUpdate>): Promise<ScoringConfiguration> => 
      ResultSettingsService.updateScoringConfiguration(id, data),
    deleteScoringConfiguration: (id: string): Promise<void> => ResultSettingsService.deleteScoringConfiguration(id),
    getScoringConfigurationsByEducationLevel: (educationLevel: string): Promise<ScoringConfiguration[]> => 
      ResultSettingsService.getScoringConfigurationsByEducationLevel(educationLevel),
    getScoringConfigurationsByResultType: (resultType: string): Promise<ScoringConfiguration[]> => 
      ResultSettingsService.getScoringConfigurationsByResultType(resultType),
    getDefaultScoringConfigurations: (): Promise<Record<string, ScoringConfiguration>> => 
      ResultSettingsService.getDefaultScoringConfigurations(),
    setDefaultScoringConfiguration: (id: string): Promise<any> => 
      ResultSettingsService.setDefaultScoringConfiguration(id),

    // Student Results (Legacy/Generic)
    getStudentResults: (filters?: ResultFilters): Promise<StudentResult[]> => 
      ResultSettingsService.getStudentResults(filters),
    getStudentResultsByStudent: (studentId: string): Promise<StudentResult[]> => 
      ResultSettingsService.getStudentResultsByStudent(studentId),
    approveStudentResult: (id: string): Promise<any> => 
      ResultSettingsService.approveResult('student', id),
    publishStudentResult: (id: string): Promise<any> => 
      ResultSettingsService.publishResult('student', id),

    // Student Term Results
    getStudentTermResults: (filters?: ResultFilters): Promise<StudentTermResult[]> => 
      ResultSettingsService.getStudentTermResults(filters),
    getStudentTermResultDetailed: (id: string): Promise<any> => 
      ResultSettingsService.getStudentTermResultDetailed(id),
    generateTermReport: (data: any): Promise<any> => 
      ResultSettingsService.generateTermReport(data),

    // Result Sheets
    getResultSheets: (filters?: ResultFilters): Promise<ApiResultSheet[]> => 
      ResultSettingsService.getResultSheets(filters),
    generateResultSheet: (data: any): Promise<any> => 
      ResultSettingsService.generateResultSheet(data),
    approveResultSheet: (id: string): Promise<any> => 
      ResultSettingsService.approveResultSheet(id),

    // Enhanced Result Generation
    generateEnhancedResultSheet: (
      studentId: string, 
      examSessionId: string, 
      templateId?: string
    ): Promise<EnhancedResultSheet> => 
      ResultSettingsService.generateEnhancedResultSheet(studentId, examSessionId, templateId),
    generateBulkResultSheets: (
      studentIds: string[], 
      examSessionId: string
    ): Promise<EnhancedResultSheet[]> => 
      ResultSettingsService.generateBulkResultSheets(studentIds, examSessionId),

    // Assessment Scores
    getAssessmentScores: (filters?: ResultFilters): Promise<AssessmentScore[]> => 
      ResultSettingsService.getAssessmentScores(filters),

    // Result Comments
    getResultComments: (filters?: ResultFilters): Promise<ResultComment[]> => 
      ResultSettingsService.getResultComments(filters),

    // Education Level Specific Results with proper typing
    // Nursery
    getNurseryResults: (filters?: ResultFilters): Promise<NurseryResult[]> => 
      ResultSettingsService.getNurseryResults(filters),

    getNurseryTermReports: (filters?: ResultFilters): Promise<any[]> => 
      ResultSettingsService.getNurseryTermReports(filters),

    createNurseryResult: (data: Partial<NurseryResult>): Promise<NurseryResult> => 
      ResultSettingsService.createNurseryResult(data),
    updateNurseryResult: (id: string, data: Partial<NurseryResult>): Promise<NurseryResult> => 
      ResultSettingsService.updateNurseryResult(id, data),
    deleteNurseryResult: (id: string): Promise<void> => ResultSettingsService.deleteNurseryResult(id),
    approveNurseryResult: (id: string): Promise<any> => 
      ResultSettingsService.approveResult('nursery', id),
    publishNurseryResult: (id: string): Promise<any> => 
      ResultSettingsService.publishResult('nursery', id),

    // Primary
    getPrimaryResults: (filters?: ResultFilters): Promise<PrimaryResult[]> => 
      ResultSettingsService.getPrimaryResults(filters),

    getPrimaryTermReports: (filters?: ResultFilters): Promise<any[]> => 
      ResultSettingsService.getPrimaryTermReports(filters),

    createPrimaryResult: (data: Partial<PrimaryResult>): Promise<PrimaryResult> => 
      ResultSettingsService.createPrimaryResult(data),
    updatePrimaryResult: (id: string, data: Partial<PrimaryResult>): Promise<PrimaryResult> => 
      ResultSettingsService.updatePrimaryResult(id, data),
    deletePrimaryResult: (id: string): Promise<void> => ResultSettingsService.deletePrimaryResult(id),
    approvePrimaryResult: (id: string): Promise<any> => 
      ResultSettingsService.approveResult('primary', id),
    publishPrimaryResult: (id: string): Promise<any> => 
      ResultSettingsService.publishResult('primary', id),

    // Junior Secondary
    getJuniorSecondaryResults: (filters?: ResultFilters): Promise<JuniorSecondaryResult[]> => 
      ResultSettingsService.getJuniorSecondaryResults(filters),

    getJuniorSecondaryTermReports: (filters?: ResultFilters): Promise<any[]> => 
      ResultSettingsService.getJuniorSecondaryTermReports(filters),

    createJuniorSecondaryResult: (data: Partial<JuniorSecondaryResult>): Promise<JuniorSecondaryResult> => 
      ResultSettingsService.createJuniorSecondaryResult(data),
    updateJuniorSecondaryResult: (id: string, data: Partial<JuniorSecondaryResult>): Promise<JuniorSecondaryResult> => 
      ResultSettingsService.updateJuniorSecondaryResult(id, data),
    deleteJuniorSecondaryResult: (id: string): Promise<void> => 
      ResultSettingsService.deleteJuniorSecondaryResult(id),
    approveJuniorSecondaryResult: (id: string): Promise<any> => 
      ResultSettingsService.approveResult('junior-secondary', id),
    publishJuniorSecondaryResult: (id: string): Promise<any> => 
      ResultSettingsService.publishResult('junior-secondary', id),

    // Senior Secondary
    getSeniorSecondaryTermlyResults: (filters?: ResultFilters): Promise<SeniorSecondaryResult[]> => 
      ResultSettingsService.getSeniorSecondaryTermlyResults(filters),

    getSeniorSecondaryTermReports: (filters?: ResultFilters): Promise<any[]> => 
      ResultSettingsService.getSeniorSecondaryTermReports(filters),
    
    createSeniorSecondaryResult: (data: Partial<SeniorSecondaryResult>): Promise<SeniorSecondaryResult> => 
      ResultSettingsService.createSeniorSecondaryResult(data),
    updateSeniorSecondaryResult: (id: string, data: Partial<SeniorSecondaryResult>): Promise<SeniorSecondaryResult> => 
      ResultSettingsService.updateSeniorSecondaryResult(id, data),
    deleteSeniorSecondaryResult: (id: string): Promise<void> => 
      ResultSettingsService.deleteSeniorSecondaryResult(id),
    approveSeniorSecondaryResult: (id: string): Promise<any> => 
      ResultSettingsService.approveResult('senior-secondary', id),
    publishSeniorSecondaryResult: (id: string): Promise<any> => 
      ResultSettingsService.publishResult('senior-secondary', id),

    // Senior Secondary Session Results
    getSeniorSecondarySessionResults: (filters?: ResultFilters): Promise<SeniorSecondarySessionReport[]> => 
      ResultSettingsService.getSeniorSecondarySessionResults(filters),
    createSeniorSecondarySessionResult: (data: Partial<SeniorSecondarySessionReport>): Promise<SeniorSecondarySessionReport> => 
      ResultSettingsService.createSeniorSecondarySessionResult(data),
    updateSeniorSecondarySessionResult: (id: string, data: Partial<SeniorSecondarySessionReport>): Promise<SeniorSecondarySessionReport> => 
      ResultSettingsService.updateSeniorSecondarySessionResult(id, data),
    deleteSeniorSecondarySessionResult: (id: string): Promise<void> => 
      ResultSettingsService.deleteSeniorSecondarySessionResult(id),

    // Bulk Operations (using actual endpoints)
    bulkCreateResults: (
      educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
      results: any[]
    ): Promise<any[]> => ResultSettingsService.bulkCreateResults(educationLevel, results),

    // Statistics and Analytics (using actual endpoints)
    getResultStatistics: (
      educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
      filters?: { exam_session?: string; class_level?: string; subject?: string }
    ): Promise<any> => ResultSettingsService.getResultStatistics(educationLevel, filters),
    
    getGradeDistribution: (filters?: ResultFilters): Promise<any> => 
      ResultSettingsService.getGradeDistribution(filters),

    // Term Reports
    publishTermReport: (
      educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
      reportId: string
    ): Promise<any> => ResultSettingsService.publishTermReport(educationLevel, reportId),
    
    calculateTermReportMetrics: (
      educationLevel: 'nursery' | 'primary' | 'junior-secondary' | 'senior-secondary',
      reportId: string
    ): Promise<any> => ResultSettingsService.calculateTermReportMetrics(educationLevel, reportId),

    // Senior Secondary Specific
    bulkPublishSeniorSecondaryTermReports: (data: any): Promise<any> => 
      ResultSettingsService.bulkPublishSeniorSecondaryTermReports(data),
    
    calculateSessionReportMetrics: (reportId: string): Promise<any> => 
      ResultSettingsService.calculateSessionReportMetrics(reportId),
    
    generateSessionReport: (data: any): Promise<any> => 
      ResultSettingsService.generateSessionReport(data),

    // Result Checker
    checkResult: (data: {
      student_id?: string;
      registration_number?: string;
      exam_session_id?: string;
      access_code?: string;
    }): Promise<any> => ResultSettingsService.checkResult(data),
    getResultCheckerOptions: (): Promise<{
      exam_sessions: ExamSession[];
      access_required: boolean;
      available_formats: string[];
    }> => ResultSettingsService.getResultCheckerOptions(),

    // Utility Methods
    getEducationLevelEndpoint: (educationLevel: string): string => 
      ResultSettingsService.getEducationLevelEndpoint(educationLevel),
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
  StudentResult,
  StudentTermResult,
  ApiResultSheet,
  AssessmentScore,
  ResultComment,
  EnhancedResultSheet,
  GradingSystemCreateUpdate,
  AssessmentTypeCreateUpdate,
  ExamSessionCreateUpdate,
  ScoringConfigurationCreateUpdate,
  GradeCreateUpdate,
  ResultFilters,
  ExamSessionFilters,
  NurseryResult,
  PrimaryResult,
  JuniorSecondaryResult,
  SeniorSecondaryResult,
  SeniorSecondarySessionReport
};