/**
 * ============================================================================
 * resultTransformers.ts
 * Data transformation functions for different education levels
 * UPDATED: Uses single source of truth types
 * ============================================================================
 */

import {
  AcademicSession,
  StudentInfo,
  Subject,
  ExamSession,
  NurseryResult,
  NurseryTermReport,
  PrimaryResult,
  PrimaryTermReport,
  JuniorSecondaryResult,
  JuniorSecondaryTermReport,
  SeniorSecondaryResult,
  SeniorSecondaryTermReport,
  EducationLevel,
  Term,
  StandardResult,
  TermReport
} from '@/types/types'; // Import from single source of truth

import {SeniorSecondarySessionReport} from '@/services/ResultService'
import {
  isAcademicSessionObject,
  getAcademicSessionString,
  getAcademicSessionId,
  createDefaultAcademicSession,
  calculateGrade,
  calculateTotalScore,
  validatePosition
} from './resultHelpers';

// ============================================================================
// EXTENDED TYPES (for API responses that may have additional fields)
// ============================================================================

// Common fields that appear across all result types
interface BaseResultFields {
  id?: string;
  student?: StudentInfo;
  subject?: Subject;
  exam_session?: ExamSession;
  grading_system?: any;
  total_score?: number;
  percentage?: number;
  grade?: string;
  grade_point?: number;
  is_passed?: boolean;
  position?: number;
  subject_position?: number;
  class_average?: number;
  highest_in_class?: number;
  lowest_in_class?: number;
  teacher_remark?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

// Extended type that includes all possible fields from API
export interface ExtendedStandardResult extends BaseResultFields {
  // Senior Secondary specific fields
  first_test_score?: number;
  second_test_score?: number;
  third_test_score?: number;
  test1_score?: number;
  test2_score?: number;
  test3_score?: number;
  total_ca_score?: number;
  
  // Primary/Junior Secondary specific fields
  continuous_assessment_score?: number;
  take_home_test_score?: number;
  project_score?: number;
  appearance_score?: number;
  note_copying_score?: number;
  practical_score?: number;
  ca_total?: number;
  ca_percentage?: number;
  exam_percentage?: number;
  total_percentage?: number;
  
  // Nursery specific fields
  mark_obtained?: number;
  max_marks_obtainable?: number;
  academic_comment?: string;
  
  // Common exam field
  exam_score?: number;
  
  // Additional tracking fields
  term_report?: string;
  stream?: any;
  previous_term_score?: number;
  cumulative_score?: number;
}

// ============================================================================
// INPUT DATA TYPES
// ============================================================================

interface StudentData {
  id: string;
  full_name: string;
  username: string;
  student_class: string;
  education_level: EducationLevel | string;
  profile_picture?: string;
  gender?: string;
  age?: number;
  date_of_birth?: string;
  classroom?: string;
  stream?: string;
  parent_contact?: string;
  emergency_contact?: string;
  admission_date?: string;
  house?: string;
}

interface TermData {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  academic_session: AcademicSession;
  next_term_begins?: string;
}

interface SelectionData {
  academicSession: AcademicSession | string;
  term: TermData;
  class: {
    id: string;
    name: string;
    section: string;
    education_level?: string;
  };
  resultType?: string;
  examSession?: string;
}

// Extended StudentTermResult to match what API returns
interface ExtendedStudentTermResult {
  id: string;
  class_position?: number;
  total_students?: number;
  times_opened?: number;
  times_present?: number;
  term: string;
  next_term_begins?: string;
  remarks?: string;
  class_teacher_remark?: string;
  head_teacher_remark?: string;
  gpa?: number;
  average_score?: number;
  total_score?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const createStudentInfo = (student: StudentData): StudentInfo => ({
  id: student.id,
  admission_number: student.username,
  full_name: student.full_name,
  student_class: student.student_class,
  education_level: student.education_level as EducationLevel,
  gender: student.gender,
  date_of_birth: student.date_of_birth,
  profile_image: student.profile_picture
});

const createDefaultSubject = (result: ExtendedStandardResult, educationLevel: EducationLevel): Subject => ({
  id: result.subject?.id || 'unknown',
  name: result.subject?.name || 'Unknown Subject',
  code: result.subject?.code || '',
  description: result.subject?.description || '',
  grade_levels: result.subject?.grade_levels || [],
  credit_hours: result.subject?.credit_hours || 0,
  is_core_subject: result.subject?.is_core_subject || false,
  is_active: true,
  created_at: result.subject?.created_at || new Date().toISOString(),
  updated_at: result.subject?.updated_at || new Date().toISOString()
});

const createExamSession = (
  term: TermData,
  academicSession: AcademicSession
): ExamSession => ({
  id: term.id,
  name: term.name,
  exam_type: 'FINAL_EXAM', // Default, should come from API
  academic_session: academicSession,
  term: term.name.toUpperCase().includes('FIRST') ? 'FIRST' :
        term.name.toUpperCase().includes('SECOND') ? 'SECOND' : 'THIRD',
  start_date: term.start_date,
  end_date: term.end_date,
  is_published: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

/**
 * Get class position from term results
 * Finds the first non-null/undefined class_position value
 * This handles cases where the first result might not have the position
 *
 * @param termResults - Array of term results
 * @returns number | null - Class position or null if not found
 */
const getClassPosition = (termResults: ExtendedStudentTermResult[]): number | null => {
  if (!Array.isArray(termResults) || termResults.length === 0) {
    return null;
  }

  // Find first result with a valid class_position
  for (const result of termResults) {
    if (result.class_position !== null && result.class_position !== undefined) {
      const validated = validatePosition(result.class_position);
      if (validated !== null) {
        return validated;
      }
    }
  }

  return null;
};

// ============================================================================
// NURSERY RESULT TRANSFORMER
// ============================================================================

export const transformDataForNursery = (
  student: StudentData,
  results: ExtendedStandardResult[],
  termResults: ExtendedStudentTermResult[],
  selections: SelectionData,
  educationLevel: EducationLevel
): NurseryTermReport => {
  const academicSession = isAcademicSessionObject(selections.academicSession)
    ? selections.academicSession
    : createDefaultAcademicSession(
        getAcademicSessionString(selections.academicSession),
        getAcademicSessionId(selections.academicSession)
      );

  const examSession = createExamSession(selections.term, academicSession);
  const studentInfo = createStudentInfo(student);

  const subjectResults: NurseryResult[] = results.map(result => ({
    id: result.id || `nursery-result-${Math.random()}`,
    student: studentInfo,
    subject: result.subject || createDefaultSubject(result, educationLevel),
    exam_session: examSession,
    grading_system: {
      id: 1,  // Default grading system ID (number)
      name: 'Default Grading',
      grading_type: 'PERCENTAGE',
      min_score: 0,
      max_score: 100,
      pass_mark: 40,
      is_active: true
    },
    max_marks_obtainable: 100,
    mark_obtained: result.total_score || 0,
    percentage: result.percentage || 0,
    subject_position: validatePosition(result.subject_position),
    academic_comment: result.teacher_remark || '',
    grade: result.grade || '',
    grade_point: undefined,
    is_passed: (result.percentage || 0) >= 40,
    status: 'PUBLISHED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const totalMarksObtained = results.reduce(
    (sum, r) => sum + (r.total_score || 0),
    0
  );
  const totalMaxMarks = results.length * 100;
  const overallPercentage = totalMaxMarks > 0 
    ? (totalMarksObtained / totalMaxMarks) * 100 
    : 0;

  return {
    id: `nursery-report-${student.id}`,
    student: studentInfo,
    exam_session: examSession,
    total_subjects: results.length,
    total_max_marks: totalMaxMarks,
    total_marks_obtained: totalMarksObtained,
    overall_percentage: overallPercentage,
    class_position: getClassPosition(termResults),
    total_students_in_class: termResults[0]?.total_students || 0,
    times_school_opened: termResults[0]?.times_opened || 0,
    times_student_present: termResults[0]?.times_present || 0,
    physical_development_comment: '',
    next_term_begins: termResults[0]?.next_term_begins || selections.term.next_term_begins,
    class_teacher_remark: termResults[0]?.class_teacher_remark || termResults[0]?.remarks || '',
    head_teacher_remark: termResults[0]?.head_teacher_remark || '',
    status: 'PUBLISHED',
    is_published: true,
    subject_results: subjectResults,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

// ============================================================================
// PRIMARY RESULT TRANSFORMER
// ============================================================================

export const transformDataForPrimary = (
  student: StudentData,
  results: ExtendedStandardResult[],
  termResults: ExtendedStudentTermResult[],
  selections: SelectionData,
  educationLevel: EducationLevel
): PrimaryTermReport => {
  const academicSession = isAcademicSessionObject(selections.academicSession)
    ? selections.academicSession
    : createDefaultAcademicSession(
        getAcademicSessionString(selections.academicSession),
        getAcademicSessionId(selections.academicSession)
      );

  const examSession = createExamSession(selections.term, academicSession);
  const studentInfo = createStudentInfo(student);

  const calculateCaTotal = (result: ExtendedStandardResult) => {
    return (
      (result.continuous_assessment_score || 0) +
      (result.take_home_test_score || 0) +
      (result.project_score || 0) +
      (result.appearance_score || 0) +
      (result.note_copying_score || 0) +
      (result.practical_score || 0)
    );
  };

  const subjectResults: PrimaryResult[] = results.map(result => {
    const caTotal = calculateCaTotal(result);
    const examScore = result.exam_score || 0;
    const totalScore = caTotal + examScore;
    const totalPercentage = (totalScore / 100) * 100;

    return {
      id: result.id || `primary-result-${Math.random()}`,
      student: studentInfo,
      subject: result.subject || createDefaultSubject(result, educationLevel),
      exam_session: examSession,
      grading_system: {
        id: 1,  // Default grading system ID (number)
        name: 'Default Grading',
        grading_type: 'PERCENTAGE',
        min_score: 0,
        max_score: 100,
        pass_mark: 40,
        is_active: true
      },
      continuous_assessment_score: result.continuous_assessment_score || 0,
      take_home_test_score: result.take_home_test_score || 0,
      practical_score: result.practical_score || 0,
      appearance_score: result.appearance_score || 0,
      project_score: result.project_score || 0,
      note_copying_score: result.note_copying_score || 0,
      exam_score: examScore,
      ca_total: caTotal,
      total_score: totalScore,
      ca_percentage: (caTotal / 40) * 100,
      exam_percentage: (examScore / 60) * 100,
      total_percentage: totalPercentage,
      grade: result.grade || calculateGrade(totalPercentage),
      grade_point: undefined,
      is_passed: totalPercentage >= 40,
      class_average: result.class_average || 0,
      highest_in_class: result.highest_in_class || 0,
      lowest_in_class: result.lowest_in_class || 0,
      subject_position: validatePosition(result.subject_position),
      previous_term_score: 0,
      cumulative_score: 0,
      teacher_remark: result.teacher_remark || '',
      class_teacher_remark: '',
      head_teacher_remark: '',
      status: 'PUBLISHED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  const totalScore = subjectResults.reduce((sum, r) => sum + r.total_score, 0);
  const averageScore = results.length > 0
    ? subjectResults.reduce((sum, r) => sum + r.total_percentage, 0) / results.length
    : 0;

  return {
    id: `primary-report-${student.id}`,
    student: studentInfo,
    exam_session: examSession,
    total_score: totalScore,
    average_score: averageScore,
    overall_grade: calculateGrade(averageScore),
    class_position: getClassPosition(termResults),
    total_students: termResults[0]?.total_students || 0,
    times_opened: termResults[0]?.times_opened || 0,
    times_present: termResults[0]?.times_present || 0,
    next_term_begins: termResults[0]?.next_term_begins || selections.term.next_term_begins,
    class_teacher_remark: termResults[0]?.class_teacher_remark || termResults[0]?.remarks || '',
    head_teacher_remark: termResults[0]?.head_teacher_remark || '',
    status: 'PUBLISHED',
    is_published: true,
    subject_results: subjectResults,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

// ============================================================================
// JUNIOR SECONDARY RESULT TRANSFORMER
// ============================================================================

export const transformDataForJuniorSecondary = (
  student: StudentData,
  results: ExtendedStandardResult[],
  termResults: ExtendedStudentTermResult[],
  selections: SelectionData,
  educationLevel: EducationLevel
): JuniorSecondaryTermReport => {
  const academicSession = isAcademicSessionObject(selections.academicSession)
    ? selections.academicSession
    : createDefaultAcademicSession(
        getAcademicSessionString(selections.academicSession),
        getAcademicSessionId(selections.academicSession)
      );

  const examSession = createExamSession(selections.term, academicSession);
  const studentInfo = createStudentInfo(student);

  const calculateCaTotal = (result: ExtendedStandardResult) => {
    return (
      (result.continuous_assessment_score || 0) +
      (result.take_home_test_score || 0) +
      (result.project_score || 0) +
      (result.appearance_score || 0) +
      (result.note_copying_score || 0) +
      (result.practical_score || 0)
    );
  };

  const subjectResults: JuniorSecondaryResult[] = results.map(result => {
    const caTotal = calculateCaTotal(result);
    const examScore = result.exam_score || 0;
    const totalScore = caTotal + examScore;
    const totalPercentage = (totalScore / 100) * 100;

    return {
      id: result.id || `junior-result-${Math.random()}`,
      student: studentInfo,
      subject: result.subject || createDefaultSubject(result, educationLevel),
      exam_session: examSession,
      grading_system: {
        id: 1,  // Default grading system ID (number)
        name: 'Default Grading',
        grading_type: 'PERCENTAGE',
        min_score: 0,
        max_score: 100,
        pass_mark: 40,
        is_active: true
      },
      continuous_assessment_score: result.continuous_assessment_score || 0,
      take_home_test_score: result.take_home_test_score || 0,
      practical_score: result.practical_score || 0,
      appearance_score: result.appearance_score || 0,
      project_score: result.project_score || 0,
      note_copying_score: result.note_copying_score || 0,
      exam_score: examScore,
      ca_total: caTotal,
      total_score: totalScore,
      ca_percentage: (caTotal / 40) * 100,
      exam_percentage: (examScore / 60) * 100,
      total_percentage: totalPercentage,
      grade: result.grade || calculateGrade(totalPercentage),
      grade_point: undefined,
      is_passed: totalPercentage >= 40,
      class_average: result.class_average || 0,
      highest_in_class: result.highest_in_class || 0,
      lowest_in_class: result.lowest_in_class || 0,
      subject_position: validatePosition(result.subject_position),
      previous_term_score: 0,
      cumulative_score: 0,
      teacher_remark: result.teacher_remark || '',
      class_teacher_remark: '',
      head_teacher_remark: '',
      status: 'PUBLISHED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  const totalScore = subjectResults.reduce((sum, r) => sum + r.total_score, 0);
  const averageScore = results.length > 0
    ? subjectResults.reduce((sum, r) => sum + r.total_percentage, 0) / results.length
    : 0;

  return {
    id: `junior-report-${student.id}`,
    student: studentInfo,
    exam_session: examSession,
    total_score: totalScore,
    average_score: averageScore,
    overall_grade: calculateGrade(averageScore),
    class_position: getClassPosition(termResults),
    total_students: termResults[0]?.total_students || 0,
    times_opened: termResults[0]?.times_opened || 0,
    times_present: termResults[0]?.times_present || 0,
    next_term_begins: termResults[0]?.next_term_begins || selections.term.next_term_begins,
    class_teacher_remark: termResults[0]?.class_teacher_remark || termResults[0]?.remarks || '',
    head_teacher_remark: termResults[0]?.head_teacher_remark || '',
    status: 'PUBLISHED',
    is_published: true,
    subject_results: subjectResults,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

// ============================================================================
// SENIOR SECONDARY RESULT TRANSFORMER
// ============================================================================

// Overloaded function signatures for type safety
export function transformDataForSeniorSecondary(
  student: StudentData,
  results: ExtendedStandardResult[],
  termResults: ExtendedStudentTermResult[],
  selections: SelectionData,
  educationLevel: EducationLevel,
  resultType: 'annually'
): SeniorSecondarySessionReport;

export function transformDataForSeniorSecondary(
  student: StudentData,
  results: ExtendedStandardResult[],
  termResults: ExtendedStudentTermResult[],
  selections: SelectionData,
  educationLevel: EducationLevel,
  resultType?: 'termly' | undefined
): SeniorSecondaryTermReport;

export function transformDataForSeniorSecondary(
  student: StudentData,
  results: ExtendedStandardResult[],
  termResults: ExtendedStudentTermResult[],
  selections: SelectionData,
  educationLevel: EducationLevel,
  resultType?: string
): SeniorSecondaryTermReport | SeniorSecondarySessionReport {
  const academicSession = isAcademicSessionObject(selections.academicSession)
    ? selections.academicSession
    : createDefaultAcademicSession(
        getAcademicSessionString(selections.academicSession),
        getAcademicSessionId(selections.academicSession)
      );

  const studentInfo = createStudentInfo(student);

  // ============================================================================
  // ANNUAL/SESSION RESULT
  // ============================================================================
  if (resultType === 'annually') {
    const subjectResults: SeniorSecondarySessionReport[] = results.map(result => ({
      id: result.id || `senior-session-result-${Math.random()}`,
      student: studentInfo,
      subject: result.subject || createDefaultSubject(result, educationLevel),
      academic_session: academicSession,
      first_term_score: 0,
      second_term_score: 0,
      third_term_score: 0,
      average_for_year: result.percentage || 0,
      obtainable: 300,
      obtained: result.total_score || 0,
      class_average: result.class_average || 0,
      highest_in_class: result.highest_in_class || 0,
      lowest_in_class: result.lowest_in_class || 0,
      subject_position: validatePosition(result.subject_position),
      teacher_remark: result.teacher_remark || '',
      class_teacher_remark: '',
      head_teacher_remark: '',
      status: 'PUBLISHED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const totalObtained = results.reduce((sum, r) => sum + (r.total_score || 0), 0);
    const totalObtainable = results.length * 300;
    const averageScore = results.length > 0 ? totalObtained / results.length : 0;

    return {
      id: `senior-session-report-${student.id}`,
      student: studentInfo,
      academic_session: academicSession,
      term1_total: 0,
      term2_total: 0,
      term3_total: 0,
      taa_score: averageScore,
      average_for_year: averageScore,
      obtainable: totalObtainable,
      obtained: totalObtained,
      overall_grade: calculateGrade(averageScore),
      class_position: getClassPosition(termResults),
      total_students: termResults[0]?.total_students || 0,
      teacher_remark: termResults[0]?.class_teacher_remark || '',
      head_teacher_remark: termResults[0]?.head_teacher_remark || '',
      status: 'PUBLISHED',
      is_published: true,
      subject_results: subjectResults,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  // ============================================================================
  // TERMLY RESULT
  // ============================================================================
  const examSession = createExamSession(selections.term, academicSession);

  const subjectResults: SeniorSecondaryResult[] = results.map(result => {
    const firstTestScore = result.test1_score || result.first_test_score || 0;
    const secondTestScore = result.test2_score || result.second_test_score || 0;
    const thirdTestScore = result.test3_score || result.third_test_score || 0;
    const examScore = result.exam_score || 0;
    const totalCaScore = firstTestScore + secondTestScore + thirdTestScore;
    const totalScore = totalCaScore + examScore;
    const percentage = (totalScore / 100) * 100;

    return {
      id: result.id || `senior-result-${Math.random()}`,
      student: studentInfo,
      subject: result.subject || createDefaultSubject(result, educationLevel),
      exam_session: examSession,
      grading_system: {
        id: 1,  // Default grading system ID (number)
        name: 'Default Grading',
        grading_type: 'PERCENTAGE',
        min_score: 0,
        max_score: 100,
        pass_mark: 40,
        is_active: true
      },
      first_test_score: firstTestScore,
      second_test_score: secondTestScore,
      third_test_score: thirdTestScore,
      exam_score: examScore,
      total_ca_score: totalCaScore,
      total_score: totalScore,
      percentage: percentage,
      grade: result.grade || calculateGrade(percentage),
      grade_point: undefined,
      is_passed: percentage >= 40,
      class_average: result.class_average || 0,
      highest_in_class: result.highest_in_class || 0,
      lowest_in_class: result.lowest_in_class || 0,
      subject_position: validatePosition(result.subject_position),
      teacher_remark: result.teacher_remark || '',
      class_teacher_remark: '',
      head_teacher_remark: '',
      status: 'PUBLISHED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  const totalScore = subjectResults.reduce((sum, r) => sum + r.total_score, 0);
  const averageScore = results.length > 0
    ? subjectResults.reduce((sum, r) => sum + r.percentage, 0) / results.length
    : 0;

  return {
    id: `senior-term-report-${student.id}`,
    student: studentInfo,
    exam_session: examSession,
    total_score: totalScore,
    average_score: averageScore,
    overall_grade: calculateGrade(averageScore),
    class_position: getClassPosition(termResults),
    total_students: termResults[0]?.total_students || 0,
    times_opened: termResults[0]?.times_opened || 0,
    times_present: termResults[0]?.times_present || 0,
    next_term_begins: termResults[0]?.next_term_begins || selections.term.next_term_begins,
    class_teacher_remark: termResults[0]?.class_teacher_remark || termResults[0]?.remarks || '',
    head_teacher_remark: termResults[0]?.head_teacher_remark || '',
    status: 'PUBLISHED',
    is_published: true,
    subject_results: subjectResults,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// ============================================================================
// UNIFIED TRANSFORMER
// ============================================================================

export const transformResultData = (
  educationLevel: EducationLevel,
  student: StudentData,
  results: ExtendedStandardResult[],
  termResults: ExtendedStudentTermResult[],
  selections: SelectionData,
  resultType?: string
): NurseryTermReport | PrimaryTermReport | JuniorSecondaryTermReport | SeniorSecondaryTermReport | SeniorSecondarySessionReport => {
  switch (educationLevel) {
    case 'NURSERY':
      return transformDataForNursery(student, results, termResults, selections, educationLevel);

    case 'PRIMARY':
      return transformDataForPrimary(student, results, termResults, selections, educationLevel);

    case 'JUNIOR_SECONDARY':
      return transformDataForJuniorSecondary(student, results, termResults, selections, educationLevel);

    case 'SENIOR_SECONDARY':
      // Type narrowing for Senior Secondary
      if (resultType === 'annually') {
        return transformDataForSeniorSecondary(
          student,
          results,
          termResults,
          selections,
          educationLevel,
          'annually'
        );
      } else {
        return transformDataForSeniorSecondary(
          student,
          results,
          termResults,
          selections,
          educationLevel,
          'termly'
        );
      }

    default:
      throw new Error(`Unsupported education level: ${educationLevel}`);
  }
};

// ============================================================================
// EXPORT ALL
// ============================================================================

export type {
 
  ExtendedStudentTermResult,
  EducationLevel,
  Term,

  StandardResult,
  TermReport,
 
};

export default {
  transformDataForNursery,
  transformDataForPrimary,
  transformDataForJuniorSecondary,
  transformDataForSeniorSecondary,
  transformResultData
};