import api from './api';

// Base interfaces matching Django models
export type ResultStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED';

import {
  AcademicSession,  
  ExamSessionInfo, 
  NurseryResultData,
  PrimaryResultData,
  JuniorSecondaryResultData,
  SeniorSecondaryResultData,
  SeniorSecondarySessionResultData,
  StandardResult,
  SeniorSecondaryStandardResult, 
  StudentTermResult,
  TeacherAssignment,
  SeniorSecondarySessionStandardResultBreakdown
} from '../types/types';

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

class ResultService {
  private baseURL = '/api/results';
  private cache = new Map<string, {data: any; timestamp: number}>();
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // ===== CACHE MANAGEMENT =====
  
  async getCachedOrFetch(key: string, fetcher: () => Promise<any>) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }
    
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  // ===== HELPER METHODS =====

  private extractSessionInfo(report: any): AcademicSession | undefined {
    if (!report) return undefined;
    
    const examSession = report.exam_session;
    
    // Case 1: exam_session is just an ID (string/number)
    if (typeof examSession === 'string' || typeof examSession === 'number') {
      return {
        id: examSession.toString(),
        name: report.academic_session_name || report.session_name || 'Unknown',
        start_date: '',
        end_date: '',
        is_current: false,
        is_active: true,
        created_at: '',
        updated_at: ''
      } as AcademicSession;
    }
    
    // Case 2: exam_session is an object
    if (examSession && typeof examSession === 'object') {
      // Nested academic_session object
      if (examSession.academic_session && typeof examSession.academic_session === 'object') {
        return examSession.academic_session as AcademicSession;
      }
      
      // academic_session as ID with name
      if (examSession.academic_session_name) {
        return {
          id: examSession.academic_session?.toString() || '',
          name: examSession.academic_session_name,
          start_date: '',
          end_date: '',
          is_current: false,
          is_active: true,
          created_at: '',
          updated_at: ''
        } as AcademicSession;
      }
    }
    
    // Case 3: Direct academic_session field on report
    if (report.academic_session) {
      if (typeof report.academic_session === 'object') {
        return report.academic_session;
      }
      return {
        id: report.academic_session.toString(),
        name: report.academic_session_name || 'Unknown',
        start_date: '',
        end_date: '',
        is_current: false,
        is_active: true,
        created_at: '',
        updated_at: ''
      } as AcademicSession;
    }
    
    return undefined;
  }

  private isValidStatusTransition(currentStatus: ResultStatus, newStatus: ResultStatus): boolean {
    const validTransitions: Record<ResultStatus, ResultStatus[]> = {
      'DRAFT': ['SUBMITTED', 'DRAFT'],
      'SUBMITTED': ['APPROVED', 'DRAFT', 'SUBMITTED'],
      'APPROVED': ['PUBLISHED', 'SUBMITTED', 'APPROVED'],
      'PUBLISHED': ['PUBLISHED']
    };
    
    return validTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  /**
   * Helper method to fetch ALL pages from a paginated endpoint
   */
  private async fetchAllPages<T>(
    endpoint: string,
    params: ResultQueryParams = {}
  ): Promise<T[]> {
    let allResults: T[] = [];
    let currentPage = 1;
    let hasMore = true;
    
    console.log(`🔄 Fetching all pages from ${endpoint}...`);
    
    while (hasMore) {
      try {
        const response = await api.get(endpoint, {
          ...params,
          page: currentPage,
          page_size: params.page_size || 100
        });
        
        // Handle both paginated and non-paginated responses
        if (response && typeof response === 'object') {
          // Paginated response
          if ('results' in response && Array.isArray(response.results)) {
            const paginatedResponse = response as PaginatedResponse<T>;
            const pageResults = paginatedResponse.results;
            allResults = [...allResults, ...pageResults];
            
            console.log(`📄 Page ${currentPage}: ${pageResults.length} items (Total so far: ${allResults.length}/${paginatedResponse.count || '?'})`);
            
            hasMore = !!paginatedResponse.next;
            currentPage++;
          } 
          // Non-paginated array response
          else if (Array.isArray(response)) {
            allResults = response as T[];
            hasMore = false;
            console.log(`📄 Got ${allResults.length} items (non-paginated)`);
          }
          // Single page with no pagination
          else {
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
        console.error(`❌ Error fetching page ${currentPage}:`, error);
        hasMore = false;
      }
    }
    
    console.log(`✅ Fetched ${allResults.length} total items from ${endpoint}`);
    return allResults;
  }

  // ===== DATA TRANSFORMATION METHODS =====

  private transformNurseryResults(results: NurseryResultData[]): StandardResult[] {
    console.log("Transforming Nursery Results:", results.length);

    return results.map((result): StandardResult => ({
      id: result.id,
      student: result.student,
      subject: result.subject,
      academic_session: this.extractSessionInfo(result),
      education_level: 'NURSERY',
      grading_system: result.grading_system,
      
      // Scores
      total_score: result.mark_obtained,
      percentage: result.percentage,
      grade: result.grade,
      grade_point: result.grade_point,
      is_passed: result.is_passed,

      // Position - use subject_position as primary source (consistent with other education levels)
      position: result.subject_position ?? null,

      // Exam score
      exam_score: result.mark_obtained,
      
      // Remarks
      teacher_remark: result.academic_comment || '',
      
      // Status
      status: result.status,
      
      // Tracking
      created_at: result.created_at,
      updated_at: result.updated_at,
      
      // Breakdown
      breakdown: {
        max_marks_obtainable: result.max_marks_obtainable,
        mark_obtained: result.mark_obtained,
        physical_development: result.physical_development,
        health: result.health,
        cleanliness: result.cleanliness,
        general_conduct: result.general_conduct,
      }
    }));
  }

  private transformPrimaryResults(results: PrimaryResultData[]): StandardResult[] {
    console.log("Transforming Primary Results:", results.length);
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
    console.log("Transforming Junior Secondary Results:", results.length);
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

 // For term results - use SeniorSecondaryTermResultBreakdown
private transformSeniorSecondaryResults(results: SeniorSecondaryResultData[]): StandardResult[] {
  console.log("Transforming Senior Secondary Results:", results.length);
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

// For session results - use SeniorSecondarySessionResultBreakdown
private transformSeniorSessionResults(results: SeniorSecondarySessionResultData[]): StandardResult[] {
  console.log("Transforming Senior Session Results:", results.length);
  return results.map((result): SeniorSecondaryStandardResult => ({
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
    is_passed: result.obtained >= (result.obtainable * 0.4),
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

  // ===== CORE API METHODS WITH PAGINATION =====

  async getNurseryResults(params?: ResultQueryParams): Promise<NurseryResultData[]> {
    try {
      return await this.fetchAllPages<NurseryResultData>(
        `${this.baseURL}/nursery/results/`,
        params
      );
    } catch (error) {
      console.error('Error fetching nursery results:', error);
      return [];
    }
  }

  async getPrimaryResults(params?: ResultQueryParams): Promise<PrimaryResultData[]> {
    try {
      return await this.fetchAllPages<PrimaryResultData>(
        `${this.baseURL}/primary/results/`,
        params
      );
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

  async getSeniorSecondarySessionResults(params?: ResultQueryParams): Promise<SeniorSecondarySessionResultData[]> {
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

  // ===== TERM REPORT METHODS =====

  async getNurseryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(
        `${this.baseURL}/nursery/term-reports/`,
        params
      );
    } catch (error) {
      console.error('Error fetching nursery term reports:', error);
      return [];
    }
  }

  async getPrimaryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(
        `${this.baseURL}/primary/term-reports/`,
        params
      );
    } catch (error) {
      console.error('Error fetching primary term reports:', error);
      return [];
    }
  }

  async getJuniorSecondaryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(
        `${this.baseURL}/junior-secondary/term-reports/`,
        params
      );
    } catch (error) {
      console.error('Error fetching junior secondary term reports:', error);
      return [];
    }
  }

  async getSeniorSecondaryTermReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(
        `${this.baseURL}/senior-secondary/term-reports/`,
        params
      );
    } catch (error) {
      console.error('Error fetching senior secondary term reports:', error);
      return [];
    }
  }

  async getSeniorSecondarySessionReports(params?: ResultQueryParams): Promise<any[]> {
    try {
      return await this.fetchAllPages(
        `${this.baseURL}/senior-secondary/session-reports/`,
        params
      );
    } catch (error) {
      console.error('Error fetching senior secondary session reports:', error);
      return [];
    }
  }

  /**
   * Get ALL term results across all education levels with pagination
   */
  async getTermResults(params: ResultQueryParams = {}): Promise<any[]> {
    try {
      console.log('🔄 Fetching ALL term results with params:', params);
      
      const [nurseryReports, primaryReports, juniorReports, seniorReports] = await Promise.all([
        this.fetchAllPages(`${this.baseURL}/nursery/term-reports/`, params).catch(() => []),
        this.fetchAllPages(`${this.baseURL}/primary/term-reports/`, params).catch(() => []),
        this.fetchAllPages(`${this.baseURL}/junior-secondary/term-reports/`, params).catch(() => []),
        this.fetchAllPages(`${this.baseURL}/senior-secondary/term-reports/`, params).catch(() => []),
      ]);

      console.log(`📊 Fetched term reports: Nursery=${nurseryReports.length}, Primary=${primaryReports.length}, Junior=${juniorReports.length}, Senior=${seniorReports.length}`);

      const calculateGrade = (averageScore: number) => {
        if (!averageScore || isNaN(averageScore)) return 'N/A';
        if (averageScore >= 70) return 'A';
        if (averageScore >= 60) return 'B';
        if (averageScore >= 50) return 'C';
        if (averageScore >= 45) return 'D';
        if (averageScore >= 39) return 'E';
        return 'F';
      };

      const transformSubjectResults = (subjectResults: any[], educationLevel: string) => {
        return (subjectResults || []).map((sr: any) => {
          const baseResult = {
            id: sr.id,
            subject: sr.subject || { name: 'Unknown', code: 'N/A' },
            percentage: parseFloat(sr.percentage || sr.total_percentage || '0'),
            grade: sr.grade || 'N/A',
            grade_point: parseFloat(sr.grade_point || '0'),
            is_passed: sr.is_passed ?? true,
            status: sr.status || 'DRAFT'
          };

          switch (educationLevel) {
            case 'NURSERY':
              return {
                ...baseResult,
                total_ca_score: 0,
                ca_total: 0,
                exam_score: parseFloat(sr.mark_obtained || sr.exam_score || '0'),
                total_score: parseFloat(sr.mark_obtained || sr.total_score || '0'),
              };

            case 'PRIMARY':
            case 'JUNIOR_SECONDARY':
              const caTotal = parseFloat(sr.ca_total || sr.total_ca_score || '0');
              return {
                ...baseResult,
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

            case 'SENIOR_SECONDARY':
              const firstTest = parseFloat(sr.first_test_score || sr.test1_score || '0');
              const secondTest = parseFloat(sr.second_test_score || sr.test2_score || '0');
              const thirdTest = parseFloat(sr.third_test_score || sr.test3_score || '0');
              const examScore = parseFloat(sr.exam_score || '0');
              const calculatedCA = firstTest + secondTest + thirdTest;
              const finalCATotal = parseFloat(sr.ca_total || sr.total_ca_score || '0') || calculatedCA;
              const totalScore = parseFloat(sr.total_score || '0') || (finalCATotal + examScore);
              
              return {
                ...baseResult,
                first_test_score: firstTest,
                second_test_score: secondTest,
                third_test_score: thirdTest,
                ca_total: finalCATotal,
                total_ca_score: finalCATotal,
                exam_score: examScore,
                total_score: totalScore,
              };

            default:
              return {
                ...baseResult,
                total_ca_score: parseFloat(sr.total_ca_score || sr.ca_total || '0'),
                ca_total: parseFloat(sr.ca_total || sr.total_ca_score || '0'),
                exam_score: parseFloat(sr.exam_score || '0'),
                total_score: parseFloat(sr.total_score || '0'),
              };
          }
        });
      };

      const allReports = [
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

      console.log(`✅ Total term reports fetched: ${allReports.length}`);
      return allReports;
    } catch (error) {
      console.error('❌ Error fetching term results:', error);
      return [];
    }
  }

  // ===== CONTINUATION OF ResultService CLASS =====

  // ... (previous methods continued)

  async getStudentResults(params: FilterParams): Promise<StandardResult[]> {
    const { education_level, result_type = 'termly', student } = params;

    console.log('getStudentResults called with params:', params);

    if (!education_level) {
      console.warn('No education_level specified in getStudentResults, returning empty array');
      return [];
    }

    try {
      let results: StandardResult[] = [];
      
      switch (education_level.toUpperCase()) {
        case 'NURSERY':
          const nurseryResults = await this.getNurseryResults(params);
          results = this.transformNurseryResults(nurseryResults);
          break;
        
        case 'PRIMARY':
          const primaryResults = await this.getPrimaryResults(params);
          results = this.transformPrimaryResults(primaryResults);
          break;
        
        case 'JUNIOR_SECONDARY':
          const juniorResults = await this.getJuniorSecondaryResults(params);
          results = this.transformJuniorSecondaryResults(juniorResults);
          break;
        
        case 'SENIOR_SECONDARY':
          if (result_type === 'session') {
            const sessionResults = await this.getSeniorSecondarySessionResults(params);
            results = this.transformSeniorSessionResults(sessionResults);
          } else {
            const seniorResults = await this.getSeniorSecondaryResults(params);
            results = this.transformSeniorSecondaryResults(seniorResults);
          }
          break;
        
        default:
          console.warn(`Unsupported education level: ${education_level}`);
          return [];
      }

      console.log('Transformed results:', results);

      // Additional client-side filtering by student if needed
      if (student && results.length > 0) {
        const filtered = results.filter(result => {
          if (!result || !result.student) return false;
          
          const resultStudentId = typeof result.student === 'object' ? result.student.id : result.student;
          return resultStudentId?.toString() === student?.toString();
        });
        console.log('Client-side filtered results:', filtered);
        return filtered;
      }

      return results;
    } catch (error) {
      console.error('Error in getStudentResults:', error);
      return [];
    }
  }


  async getTeacherResults(assignments: TeacherAssignment[]) {
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


  // ===== PDF REPORT GENERATION METHODS =====

  private getAuthToken(): string | null {
    const token = 
      localStorage.getItem('access_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      sessionStorage.getItem('access_token') ||
      sessionStorage.getItem('token') ||
      sessionStorage.getItem('authToken');

    if (!token) {
      console.error('🔒 No authentication token found in storage');
      console.log('Available localStorage keys:', Object.keys(localStorage));
      console.log('Available sessionStorage keys:', Object.keys(sessionStorage));
    } else {
      console.log('✅ Authentication token found');
    }

    return token;
  }

  private getBaseURL(): string {
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    console.log('🌐 Using API base URL:', baseURL);
    return baseURL;
  }

  async downloadTermReportPDF(
    reportId: string, 
    educationLevel: string, 
    term?: string
  ): Promise<Blob> {
    try {
      console.group('📥 downloadTermReportPDF');
      console.log('Report ID:', reportId);
      console.log('Education Level:', educationLevel);
      console.log('Term:', term);

      const authToken = this.getAuthToken();
      if (!authToken) {
        throw new Error('Authentication required. Please log in again.');
      }

      const baseURL = this.getBaseURL();
      const url = new URL(`${baseURL}/api/results/report-generation/download-term-report/`);
      url.searchParams.append('report_id', reportId);
      url.searchParams.append('education_level', educationLevel.toUpperCase());

      if (term) {
        url.searchParams.append('term', term.toUpperCase());
      }

      console.log('📡 Fetching from:', url.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/pdf, application/octet-stream, */*'
        }
      });

      console.log('📊 Response status:', response.status);
      console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorData.message || errorData.error || errorMessage;
            console.error('❌ Error data:', errorData);
          } else {
            const errorText = await response.text();
            if (errorText) {
              errorMessage = errorText;
            }
          }
        } catch (parseError) {
          console.warn('⚠️ Could not parse error response');
        }

        console.error('❌ Download failed:', errorMessage);
        console.groupEnd();

        if (response.status === 404) {
          throw new Error('Report not found. Please ensure the report has been generated.');
        } else if (response.status === 403) {
          throw new Error('Access denied. You may not have permission to view this report.');
        } else if (response.status === 401) {
          throw new Error('Authentication expired. Please log in again.');
        } else {
          throw new Error(errorMessage);
        }
      }

      const blob = await response.blob();
      
      console.log('✅ PDF blob received:', {
        size: blob.size,
        type: blob.type,
        sizeInKB: (blob.size / 1024).toFixed(2) + ' KB'
      });

      if (blob.size === 0) {
        console.error('❌ Received empty blob');
        throw new Error('Received empty PDF file. The report may not be ready yet.');
      }

      const contentType = blob.type || response.headers.get('content-type') || '';
      if (contentType && !contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        console.warn('⚠️ Unexpected content type:', contentType);
        console.warn('⚠️ This might not be a PDF, but attempting download anyway');
      }

      console.log('✅ Download successful');
      console.groupEnd();

      return blob;
    } catch (error: any) {
      console.error('❌ Error in downloadTermReportPDF:', error);
      console.groupEnd();
      
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Cannot connect to server. Please check your internet connection and ensure the backend is running.');
      }
      
      throw error;
    }
  }

  async downloadSessionReportPDF(reportId: string): Promise<Blob> {
    try {
      console.group('📥 downloadSessionReportPDF');
      console.log('Report ID:', reportId);

      const authToken = this.getAuthToken();
      if (!authToken) {
        throw new Error('Authentication required. Please log in again.');
      }

      const baseURL = this.getBaseURL();
      const url = new URL(`${baseURL}/api/results/report-generation/download-session-report/`);
      url.searchParams.append('report_id', reportId);

      console.log('📡 Fetching from:', url.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/pdf, application/octet-stream, */*'
        }
      });

      console.log('📊 Response status:', response.status);

      if (!response.ok) {
        let errorMessage = `Failed to download PDF: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {}
        
        console.error('❌ Download failed:', errorMessage);
        console.groupEnd();
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      console.log('✅ PDF blob received:', blob.size, 'bytes');
      console.groupEnd();

      return blob;
    } catch (error) {
      console.error('❌ Error downloading session report PDF:', error);
      console.groupEnd();
      throw error;
    }
  }

  async bulkDownloadTermReports(
    reportIds: string[], 
    educationLevel: string
  ): Promise<Blob> {
    try {
      console.group('📥 bulkDownloadTermReports');
      console.log('Report IDs:', reportIds);
      console.log('Education Level:', educationLevel);
      console.log('Count:', reportIds.length);

      const authToken = this.getAuthToken();
      if (!authToken) {
        throw new Error('Authentication required. Please log in again.');
      }

      const baseURL = this.getBaseURL();
      const url = `${baseURL}/api/results/report-generation/bulk-download/`;

      console.log('📡 Posting to:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/zip, application/octet-stream, */*'
        },
        body: JSON.stringify({
          report_ids: reportIds,
          education_level: educationLevel.toUpperCase()
        })
      });

      console.log('📊 Response status:', response.status);

      if (!response.ok) {
        let errorMessage = `Failed to download reports: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {}
        
        console.error('❌ Bulk download failed:', errorMessage);
        console.groupEnd();
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      
      console.log('✅ ZIP blob received:', {
        size: blob.size,
        type: blob.type,
        sizeInMB: (blob.size / 1024 / 1024).toFixed(2) + ' MB'
      });

      if (blob.size === 0) {
        throw new Error('Received empty ZIP file');
      }

      console.log('✅ Bulk download successful');
      console.groupEnd();

      return blob;
    } catch (error) {
      console.error('❌ Error bulk downloading reports:', error);
      console.groupEnd();
      throw error;
    }
  }

  triggerBlobDownload(blob: Blob, filename: string): void {
    try {
      console.log('💾 Triggering download:', filename, `(${blob.size} bytes)`);

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
        console.log('✅ Download triggered and cleaned up');
      }, 100);
    } catch (error) {
      console.error('❌ Error triggering download:', error);
      throw new Error('Failed to trigger file download');
    }
  }

  // ===== STATUS MANAGEMENT =====

  async approveSubjectResult(resultId: string, educationLevel: string) {
    try {
      const normalizedLevel = educationLevel.toUpperCase().replace(/\s+/g, '_');
      
      const endpoints: Record<string, string> = {
        'NURSERY': `${this.baseURL}/nursery/results/${resultId}/approve/`,
        'PRIMARY': `${this.baseURL}/primary/results/${resultId}/approve/`,
        'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/${resultId}/approve/`,
        'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/${resultId}/approve/`,
      };
      
      const endpoint = endpoints[normalizedLevel];
      if (!endpoint) {
        throw new Error(`Unsupported education level for approve subject result: ${normalizedLevel}`);
      }
      
      return api.post(endpoint, {});
    } catch (error) {
      console.error('Error approving subject result:', error);
      throw error;
    }
  }

  async publishSubjectResult(resultId: string, educationLevel: string) {
    try {
      const normalizedLevel = educationLevel.toUpperCase().replace(/\s+/g, '_');
      
      const endpoints: Record<string, string> = {
        'NURSERY': `${this.baseURL}/nursery/results/${resultId}/publish/`,
        'PRIMARY': `${this.baseURL}/primary/results/${resultId}/publish/`,
        'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/${resultId}/publish/`,
        'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/${resultId}/publish/`,
      };
      
      const endpoint = endpoints[normalizedLevel];
      if (!endpoint) {
        throw new Error(`Unsupported education level for publish subject result: ${normalizedLevel}`);
      }
      
      return api.post(endpoint, {});
    } catch (error) {
      console.error('Error publishing subject result:', error);
      throw error;
    }
  }

  async approveResult(resultId: string, educationLevel: string) {
    try {
      const normalizedLevel = educationLevel.toUpperCase().replace(/\s+/g, '_');
      
      const endpoints: Record<string, string> = {
        'NURSERY': `${this.baseURL}/nursery/term-reports/${resultId}/approve/`,
        'PRIMARY': `${this.baseURL}/primary/term-reports/${resultId}/approve/`,
        'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/term-reports/${resultId}/approve/`,
        'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/term-reports/${resultId}/approve/`,
      };
      
      const endpoint = endpoints[normalizedLevel];
      if (!endpoint) {
        console.warn(`Unsupported education level for approve: ${normalizedLevel}`);
        return api.post(`${this.baseURL}/student-term-results/${resultId}/approve/`, {});
      }
      
      return api.post(endpoint, {});
    } catch (error) {
      console.error('Error approving result:', error);
      throw error;
    }
  }

  async publishResult(resultId: string, educationLevel: string) {
    try {
      const normalizedLevel = educationLevel.toUpperCase().replace(/\s+/g, '_');
      
      const endpoints: Record<string, string> = {
        'NURSERY': `${this.baseURL}/nursery/term-reports/${resultId}/publish/`,
        'PRIMARY': `${this.baseURL}/primary/term-reports/${resultId}/publish/`,
        'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/term-reports/${resultId}/publish/`,
        'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/term-reports/${resultId}/publish/`,
      };
      
      const endpoint = endpoints[normalizedLevel];
      if (!endpoint) {
        console.warn(`Unsupported education level for publish: ${normalizedLevel}`);
        return api.post(`${this.baseURL}/student-term-results/${resultId}/publish/`, {});
      }
      
      return api.post(endpoint, {});
    } catch (error) {
      console.error('Error publishing result:', error);
      throw error;
    }
  }

  // ===== CRUD OPERATIONS =====

  async createStudentResult(data: any, educationLevel: string) {
    const endpoints = {
      'NURSERY': `${this.baseURL}/nursery/results/`,
      'PRIMARY': `${this.baseURL}/primary/results/`,
      'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/`,
      'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/`,
    };
    
    const endpoint = endpoints[educationLevel as keyof typeof endpoints];
    if (!endpoint) {
      throw new Error(`Unsupported education level: ${educationLevel}`);
    }
    
    return api.post(endpoint, data);
  }

  async updateStudentResult(resultId: string, data: any, educationLevel: string) {
    const endpoints = {
      'NURSERY': `${this.baseURL}/nursery/results/${resultId}/`,
      'PRIMARY': `${this.baseURL}/primary/results/${resultId}/`,
      'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/${resultId}/`,
      'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/${resultId}/`,
    };
    
    const endpoint = endpoints[educationLevel as keyof typeof endpoints];
    if (!endpoint) {
      throw new Error(`Unsupported education level: ${educationLevel}`);
    }
    
    console.log('📤 ResultService.updateStudentResult:', {
      endpoint,
      resultId,
      educationLevel,
      dataKeys: Object.keys(data),  
      data
    });
  
    const response = await api.patch(endpoint, data);
    console.log('📥 ResultService.updateStudentResult RESPONSE:', response);
    return response;
  }

  async deleteStudentResult(resultId: string, educationLevel: string) {
    const endpoints = {
      'NURSERY': `${this.baseURL}/nursery/results/${resultId}/`,
      'PRIMARY': `${this.baseURL}/primary/results/${resultId}/`,
      'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/${resultId}/`,
      'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/${resultId}/`,
    };
    
    const endpoint = endpoints[educationLevel as keyof typeof endpoints];
    if (!endpoint) {
      throw new Error(`Unsupported education level: ${educationLevel}`);
    }
    
    try {
      await api.get(endpoint);
    } catch (checkError: any) {
      if (checkError.response?.status === 404) {
        throw new Error(`${educationLevel} result with ID ${resultId} not found. This might be a term report ID instead of an individual result ID.`);
      }
      throw checkError;
    }
    
    return api.delete(endpoint);
  }

  async deleteTermResult(termResultId: string, educationLevel?: string): Promise<void> {
    try {
      if (!educationLevel) {
        try {
          await api.delete(`${this.baseURL}/student-term-results/${termResultId}/`);
          return;
        } catch (baseError: any) {
          console.log('Base endpoint delete failed, trying education-level specific endpoints');
        }
      }
      
      const normalizedLevel = educationLevel?.toUpperCase().replace(/\s+/g, '_');
      
      const endpoints: Record<string, string> = {
        'NURSERY': `${this.baseURL}/nursery/term-reports/${termResultId}/`,
        'PRIMARY': `${this.baseURL}/primary/term-reports/${termResultId}/`,
        'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/term-reports/${termResultId}/`,
        'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/term-reports/${termResultId}/`,
      };
      
      if (normalizedLevel && endpoints[normalizedLevel]) {
        await api.delete(endpoints[normalizedLevel]);
      } else {
        for (const endpoint of Object.values(endpoints)) {
          try {
            await api.delete(endpoint);
            return;
          } catch (err) {
            // Continue to next endpoint
          }
        }
        throw new Error(`Term result with ID ${termResultId} not found in any education level.`);
      }
    } catch (error) {
      console.error('Error deleting term result:', error);
      throw error;
    }
  }

  async bulkCreateResults(data: any[], educationLevel: string) {
    const endpoints = {
      'NURSERY': `${this.baseURL}/nursery/results/bulk_create/`,
      'PRIMARY': `${this.baseURL}/primary/results/bulk_create/`,
      'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/bulk_create/`,
      'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/bulk_create/`,
    };
    
    const endpoint = endpoints[educationLevel as keyof typeof endpoints];
    if (!endpoint) {
      throw new Error(`Unsupported education level: ${educationLevel}`);
    }
    
    return api.post(endpoint, { results: data });
  }

  // ===== UTILITY & HELPER METHODS =====

  async getAllResults(): Promise<StandardResult[]> {
    try {
      const [nursery, primary, juniorSecondary, seniorSecondary] = await Promise.all([
        this.getNurseryResults(),
        this.getPrimaryResults(),
        this.getJuniorSecondaryResults(),
        this.getSeniorSecondaryResults()
      ]);

      return [
        ...this.transformNurseryResults(nursery),
        ...this.transformPrimaryResults(primary),
        ...this.transformJuniorSecondaryResults(juniorSecondary),
        ...this.transformSeniorSecondaryResults(seniorSecondary)
      ];
    } catch (error) {
      console.error('Error fetching all results:', error);
      return [];
    }
  }

  async getResultsByStudent(studentId: string | number, educationLevel?: string): Promise<StandardResult[]> {
    console.log('Getting results for student:', studentId, 'education level:', educationLevel);
    
    if (educationLevel) {
      const results = await this.getStudentResults({ 
        student: studentId.toString(), 
        education_level: educationLevel 
      });
      console.log('Results from specific education level:', results);
      return results;
    }
    
    const allResults = await this.getAllResults();
    const filteredResults = allResults.filter(result => {
      if (!result || !result.student) return false;
      
      const resultStudentId = typeof result.student === 'object' ? result.student.id : result.student;
      const matches = resultStudentId?.toString() === studentId?.toString();
      
      if (matches) {
        console.log('Found matching result:', result);
      }
      
      return matches;
    });
    
    console.log('Filtered results:', filteredResults);
    return filteredResults;
  }

  async getResultsByExamSession(examSessionId: string, educationLevel: string): Promise<StandardResult[]> {
    return this.getStudentResults({ 
      exam_session: examSessionId, 
      education_level: educationLevel 
    });
  }

  async getDetailedTermResult(termResultId: string): Promise<StudentTermResult> {
    return api.get(`${this.baseURL}/student-term-results/${termResultId}/detailed/`);
  }

  async getTermResultsByStudent(studentId: string): Promise<StudentTermResult[]> {
    try {
      const response = await api.get(`${this.baseURL}/student-term-results/by_student/?student_id=${studentId}`);
      return Array.isArray(response) ? response : (response?.results || []);
    } catch (error) {
      console.error('Error fetching term results by student:', error);
      return [];
    }
  }

  async getTermResultsByEducationLevel(educationLevel: string, params?: FilterParams) {
    try {
      const endpoints: Record<string, string> = {
        'NURSERY': `${this.baseURL}/nursery/term-reports/`,
        'PRIMARY': `${this.baseURL}/primary/term-reports/`,
        'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/term-reports/`,
        'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/term-reports/`,
      };

      const endpoint = endpoints[educationLevel.toUpperCase()];
      if (!endpoint) {
        console.warn(`Unsupported education level: ${educationLevel}`);
        return [];
      }

      const response = await api.get(endpoint, params);
      return Array.isArray(response) ? response : (response?.results || []);
    } catch (error) {
      console.error(`Error fetching ${educationLevel} term results:`, error);
      return [];
    }
  }

  async generateTermReport(studentId: string, examSessionId: string) {
    try {
      const response = await api.post(`${this.baseURL}/student-term-results/generate_report/`, {
        student_id: studentId,
        exam_session_id: examSessionId,
      });
      return response;
    } catch (error) {
      console.error('Error generating term report:', error);
      throw error;
    }
  }

  async getExamSessions(params?: FilterParams): Promise<ExamSessionInfo[]> {
    try {
      const response = await api.get(`${this.baseURL}/exam-sessions/`, params);
      console.log("📦 Exam sessions raw response:", response);
      
      let sessions: ExamSessionInfo[] = [];
      
      if (Array.isArray(response)) {
        sessions = response;
      } else if (response?.results && Array.isArray(response.results)) {
        sessions = response.results;
      } else if (response?.data && Array.isArray(response.data)) {
        sessions = response.data;
      } else if (typeof response === 'object' && response !== null) {
        sessions = [response];
      }
      
      console.log("✅ Processed sessions:", sessions.length, "items");

      if (sessions.length === 0) {
        console.warn('⚠️ No exam sessions found. Admin needs to create exam sessions.');
      }

      return sessions;
      
    } catch (error: any) {
      console.error('❌ Error fetching exam sessions:', error);
      throw new Error(
        error.response?.data?.message || 
        error.message || 
        'Failed to fetch exam sessions'
      );
    }
  }

  async getClassStatistics(educationLevel: string, params?: {
    exam_session?: string;
    student_class?: string;
    subject?: string;
  }) {
    const endpoints = {
      'NURSERY': `${this.baseURL}/nursery/results/class_statistics/`,
      'PRIMARY': `${this.baseURL}/primary/results/class_statistics/`,
      'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/class_statistics/`,
      'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/class_statistics/`,
    };
    
    const endpoint = endpoints[educationLevel as keyof typeof endpoints];
    if (!endpoint) {
      throw new Error(`Unsupported education level: ${educationLevel}`);
    }
    
    return api.get(endpoint, params);
  }

  async findResultIdByComposite(params: {
    student: string;
    subject: string;
    exam_session: string;
    education_level: string;
  }): Promise<string | null> {
    try {
      console.log('🔍 findResultIdByComposite called with:', params);
      
      const { education_level, ...filterParams } = params;
      const normalizedLevel = education_level.toUpperCase().replace(/\s+/g, '_');
      
      const endpoints: Record<string, string> = {
        'NURSERY': `${this.baseURL}/nursery/results/`,
        'PRIMARY': `${this.baseURL}/primary/results/`,
        'JUNIOR_SECONDARY': `${this.baseURL}/junior-secondary/results/`,
        'SENIOR_SECONDARY': `${this.baseURL}/senior-secondary/results/`,
      };
      
      const endpoint = endpoints[normalizedLevel];
      
      if (!endpoint) {
        console.warn(`⚠️ Unsupported education level: ${normalizedLevel}`);
        return null;
      }
      
      const response = await api.get(endpoint, { params: filterParams });
      
      const results = Array.isArray(response.data) 
        ? response.data 
        : (response.data?.results || response.data?.data || []);
      
      if (results.length > 0) {
        const resultId = results[0]?.id || results[0]?.pk;
        
        if (resultId) {
          console.log('✅ Found result ID:', resultId);
          return resultId.toString();
        }
      }
      
      console.warn('⚠️ No results found matching criteria');
      return null;
      
    } catch (error: any) {
      console.error('❌ Error finding result by composite:', error);
      return null;
    }
  }

  async getGradeDistribution(params?: {
    exam_session?: string;
    student_class?: string;
  }) {
    return api.get(`${this.baseURL}/senior-secondary/results/grade_distribution/`, params);
  }

  async generateTranscript(studentId: string, options?: TranscriptOptions) {
    return api.post(`${this.baseURL}/transcripts/generate/`, {
      student_id: studentId,
      ...options
    });
  }

  async verifyResult(resultId: string, verificationCode: string) {
    return api.post(`${this.baseURL}/verify/`, {
      result_id: resultId,
      code: verificationCode
    });
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

  // ===== DEBUG METHODS =====

  async debugTermReports() {
    console.log('=== Debugging Term Reports ===');
    
    const nursery = await this.getNurseryTermReports();
    console.log('Nursery Reports:', nursery.length);
    
    const primary = await this.getPrimaryTermReports();
    console.log('Primary Reports:', primary.length);
    
    const junior = await this.getJuniorSecondaryTermReports();
    console.log('Junior Secondary Reports:', junior.length);
    
    const senior = await this.getSeniorSecondaryTermReports();
    console.log('Senior Secondary Reports:', senior.length);
    
    console.log('=== End Debug ===');
  }

  async testTermReports() {
    console.log('=== TESTING TERM REPORTS API ===');
    
    try {
      const seniorResults = await api.get(`${this.baseURL}/senior-secondary/term-reports/`);
      console.log('Senior Secondary Reports:', seniorResults);
      console.log('Count:', Array.isArray(seniorResults) ? seniorResults.length : seniorResults?.results?.length);
      
      const juniorResults = await api.get(`${this.baseURL}/junior-secondary/term-reports/`);
      console.log('Junior Secondary Reports:', juniorResults);
      
      const primaryResults = await api.get(`${this.baseURL}/primary/term-reports/`);
      console.log('Primary Reports:', primaryResults);
      
      const nurseryResults = await api.get(`${this.baseURL}/nursery/term-reports/`);
      console.log('Nursery Reports:', nurseryResults);
      
    } catch (error) {
      console.error('Test failed:', error);
    }
    
    console.log('=== END TEST ===');
  }

  // ============================================================================
  // MISSING INTEGRATIONS: BULK OPERATIONS, ANALYTICS, IMPORT/EXPORT
  // ============================================================================

  /**
   * Bulk publish multiple results at once
   */
  async bulkPublishResults(data: {
    result_ids: string[];
    education_level: string;
  }): Promise<{ message: string; updated_count: number; errors?: any[] }> {
    try {
      const response = await api.post(`${this.baseURL}/bulk-operations/bulk_publish_results/`, data);
      return response;
    } catch (error) {
      console.error('Error bulk publishing results:', error);
      throw error;
    }
  }

  /**
   * Bulk update status for multiple results
   */
  async bulkStatusUpdate(data: {
    result_ids: string[];
    status: ResultStatus;
    education_level: string;
  }): Promise<{ message: string; updated_count: number; errors?: any[] }> {
    try {
      const response = await api.post(`${this.baseURL}/bulk-operations/bulk_status_update/`, data);
      return response;
    } catch (error) {
      console.error('Error bulk updating status:', error);
      throw error;
    }
  }

  /**
   * Bulk update multiple results with different data
   */
  async bulkUpdate(data: {
    updates: Array<{
      result_id: string;
      data: any;
    }>;
    education_level: string;
  }): Promise<{ message: string; updated_count: number; errors?: any[] }> {
    try {
      const response = await api.post(`${this.baseURL}/bulk-operations/bulk_update/`, data);
      return response;
    } catch (error) {
      console.error('Error bulk updating results:', error);
      throw error;
    }
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get class performance analytics
   */
  async getClassPerformance(params?: {
    education_level?: string;
    student_class?: string;
    exam_session?: string;
    subject?: string;
  }): Promise<{
    class_average: number;
    highest_score: number;
    lowest_score: number;
    pass_rate: number;
    total_students: number;
    grade_distribution: Record<string, number>;
    subject_averages: any[];
  }> {
    try {
      const response = await api.get(`${this.baseURL}/analytics/class_performance/`, params);
      return response;
    } catch (error) {
      console.error('Error fetching class performance:', error);
      throw error;
    }
  }

  /**
   * Get subject performance analytics
   */
  async getSubjectPerformance(params?: {
    subject?: string;
    education_level?: string;
    exam_session?: string;
  }): Promise<{
    subject: any;
    average_score: number;
    highest_score: number;
    lowest_score: number;
    pass_rate: number;
    total_students: number;
    grade_distribution: Record<string, number>;
  }> {
    try {
      const response = await api.get(`${this.baseURL}/analytics/subject_performance/`, params);
      return response;
    } catch (error) {
      console.error('Error fetching subject performance:', error);
      throw error;
    }
  }

  /**
   * Get student performance trend over time
   */
  async getStudentPerformanceTrend(params: {
    student: string;
    education_level: string;
    subject?: string;
  }): Promise<{
    student: any;
    trends: Array<{
      exam_session: any;
      average_score: number;
      total_subjects: number;
      subjects_passed: number;
      gpa: number;
      class_position: number;
    }>;
  }> {
    try {
      const response = await api.get(`${this.baseURL}/analytics/student_performance_trend/`, params);
      return response;
    } catch (error) {
      console.error('Error fetching student performance trend:', error);
      throw error;
    }
  }

  /**
   * Get overall result summary/statistics
   */
  async getResultSummary(params?: {
    education_level?: string;
    exam_session?: string;
    student_class?: string;
  }): Promise<{
    total_results: number;
    total_students: number;
    average_score: number;
    pass_rate: number;
    status_breakdown: Record<string, number>;
    grade_distribution: Record<string, number>;
    by_education_level: any[];
  }> {
    try {
      const response = await api.get(`${this.baseURL}/analytics/result_summary/`, params);
      return response;
    } catch (error) {
      console.error('Error fetching result summary:', error);
      throw error;
    }
  }

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  /**
   * Import results from CSV file
   */
  async importResults(file: File, educationLevel: string): Promise<{
    message: string;
    imported_count: number;
    errors?: any[];
  }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('education_level', educationLevel);

      const response = await fetch(`${this.baseURL}/import-export/import_results/`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Import failed' }));
        throw new Error(error.detail || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error importing results:', error);
      throw error;
    }
  }

  /**
   * Export results to CSV/Excel
   */
  async exportResults(params?: {
    education_level?: string;
    exam_session?: string;
    student_class?: string;
    subject?: string;
    status?: string;
    format?: 'csv' | 'xlsx';
  }): Promise<Blob> {
    try {
      const queryParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value.toString());
          }
        });
      }

      const queryString = queryParams.toString();
      const url = `${this.baseURL}/import-export/export_results/${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting results:', error);
      throw error;
    }
  }
}

export default new ResultService();