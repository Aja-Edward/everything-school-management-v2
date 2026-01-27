/**
 * ============================================================================
 * resultHelpers.ts
 * Utility functions for result display and processing
 * ============================================================================
 */

import { AcademicSession } from '@/types/types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type EducationLevel = 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
export type TermType = 'FIRST' | 'SECOND' | 'THIRD';

// ============================================================================
// ACADEMIC SESSION HELPERS
// ============================================================================

/**
 * Type guard to check if value is an AcademicSession object
 */
export const isAcademicSessionObject = (value: unknown): value is AcademicSession => {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    'name' in value
  );
};

/**
 * Extract academic session name from various input types
 */
export const getAcademicSessionString = (
  academicSession: AcademicSession | string | undefined
): string => {
  if (!academicSession) return '';
  if (typeof academicSession === 'string') return academicSession;
  if (isAcademicSessionObject(academicSession)) {
    return academicSession.name || academicSession.id || '';
  }
  return '';
};

/**
 * Extract academic session ID from various input types
 */
export const getAcademicSessionId = (
  academicSession: AcademicSession | string | undefined
): string => {
  if (!academicSession) return '';
  if (typeof academicSession === 'string') return academicSession;
  if (isAcademicSessionObject(academicSession)) return academicSession.id || '';
  return '';
};

/**
 * Create a default academic session object
 * Adjusts properties based on actual AcademicSession type
 */
export const createDefaultAcademicSession = (
  sessionName?: string,
  sessionId?: string
): AcademicSession => {
  const currentYear = new Date().getFullYear();
  
  // Base properties that should always be present
  const baseSession: any = {
    id: sessionId || 'session-default',
    name: sessionName || `${currentYear}/${currentYear + 1}`,
    start_date: new Date().toISOString(),
    end_date: new Date().toISOString(),
    is_current: false,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Only add start_year and end_year if they exist in the type
  // This prevents TypeScript errors if they're not part of AcademicSession
  return baseSession as AcademicSession;
};

// ============================================================================
// EDUCATION LEVEL HELPERS
// ============================================================================

/**
 * Normalize education level from various formats
 */
export const normalizeEducationLevel = (
  educationLevel?: string,
  studentClass?: string
): EducationLevel => {
  // First try direct education level
  if (educationLevel) {
    const level = educationLevel.toUpperCase();
    if (level === 'NURSERY' || level === 'PRIMARY' || 
        level === 'JUNIOR_SECONDARY' || level === 'SENIOR_SECONDARY') {
      return level as EducationLevel;
    }
  }

  // Fallback to class name detection
  if (studentClass) {
    const className = studentClass.toLowerCase();
    if (className.includes('nursery')) return 'NURSERY';
    if (className.includes('primary')) return 'PRIMARY';
    if (className.includes('jss') || className.includes('junior')) return 'JUNIOR_SECONDARY';
    if (className.includes('sss') || className.includes('senior')) return 'SENIOR_SECONDARY';
  }

  // Default fallback
  return 'PRIMARY';
};

/**
 * Get human-readable education level name
 */
export const getEducationLevelDisplayName = (level: EducationLevel): string => {
  const displayNames: Record<EducationLevel, string> = {
    NURSERY: 'Nursery',
    PRIMARY: 'Primary',
    JUNIOR_SECONDARY: 'Junior Secondary',
    SENIOR_SECONDARY: 'Senior Secondary'
  };
  return displayNames[level] || level;
};

/**
 * Validate education level
 */
export const isValidEducationLevel = (level: string): level is EducationLevel => {
  return ['NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY'].includes(level);
};

// ============================================================================
// TERM HELPERS
// ============================================================================

/**
 * Normalize term name to standard format
 */
export const normalizeTermName = (termName?: string): TermType | '' => {
  if (!termName || typeof termName !== 'string') return '';
  
  const termMap: Record<string, TermType> = {
    '1st Term': 'FIRST',
    '2nd Term': 'SECOND',
    '3rd Term': 'THIRD',
    'First Term': 'FIRST',
    'Second Term': 'SECOND',
    'Third Term': 'THIRD',
    'FIRST': 'FIRST',
    'SECOND': 'SECOND',
    'THIRD': 'THIRD',
    'Term 1': 'FIRST',
    'Term 2': 'SECOND',
    'Term 3': 'THIRD'
  };
  
  return termMap[termName] || (termName.toUpperCase() as TermType);
};

/**
 * Get display name for term
 */
export const getTermDisplayName = (term: TermType | string): string => {
  const displayNames: Record<string, string> = {
    FIRST: '1st Term',
    SECOND: '2nd Term',
    THIRD: '3rd Term'
  };
  return displayNames[term] || term;
};

/**
 * Get term number (1, 2, or 3)
 */
export const getTermNumber = (term: TermType | string): number => {
  const termNumbers: Record<string, number> = {
    FIRST: 1,
    SECOND: 2,
    THIRD: 3
  };
  return termNumbers[term] || 1;
};

// ============================================================================
// GRADE CALCULATION HELPERS
// ============================================================================

/**
 * Calculate grade based on percentage
 */
export const calculateGrade = (percentage: number): string => {
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 45) return 'D';
  if (percentage >= 39) return 'E';
  return 'F';
};

/**
 * Calculate grade with custom boundaries
 */
export const calculateGradeCustom = (
  score: number,
  boundaries: { grade: string; min: number; max: number }[]
): string => {
  for (const boundary of boundaries) {
    if (score >= boundary.min && score <= boundary.max) {
      return boundary.grade;
    }
  }
  return 'F';
};

/**
 * Get grade remark/description
 */
export const getGradeRemark = (grade: string): string => {
  const remarks: Record<string, string> = {
    A: 'Excellent',
    B: 'Very Good',
    C: 'Good',
    D: 'Pass',
    E: 'Poor',
    F: 'Fail'
  };
  return remarks[grade] || 'No Remark';
};

// ============================================================================
// SCORE CALCULATION HELPERS
// ============================================================================

/**
 * Calculate total score from assessment components
 */
export const calculateTotalScore = (scores: Record<string, number | undefined>): number => {
  return Object.values(scores).reduce((sum: number, score) => sum + (score || 0), 0);
};

/**
 * Calculate average score
 */
export const calculateAverage = (scores: number[]): number => {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, score) => acc + score, 0);
  return sum / scores.length;
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (obtained: number, total: number): number => {
  if (total === 0) return 0;
  return (obtained / total) * 100;
};

/**
 * Round to specified decimal places
 */
export const roundToDecimal = (value: number, decimals: number = 1): number => {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
};

// ============================================================================
// POSITION HELPERS
// ============================================================================

/**
 * Get position suffix (1st, 2nd, 3rd, etc.)
 */
export const getPositionSuffix = (position: number): string => {
  if (position <= 0) return '';
  
  const lastDigit = position % 10;
  const lastTwoDigits = position % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${position}th`;
  }
  
  switch (lastDigit) {
    case 1: return `${position}st`;
    case 2: return `${position}nd`;
    case 3: return `${position}rd`;
    default: return `${position}th`;
  }
};

/**
 * Format position display
 */
export const formatPosition = (position: number, totalStudents?: number): string => {
  if (!position || position <= 0) return 'N/A';

  const positionText = getPositionSuffix(position);

  if (totalStudents && totalStudents > 0) {
    return `${positionText} of ${totalStudents}`;
  }

  return positionText;
};

/**
 * Validate and normalize position value
 * Returns null for invalid positions (null, undefined, NaN, or < 1)
 * Returns the position as a number for valid values
 *
 * @param position - The position value to validate (can be any type)
 * @returns number | null - Valid position number or null
 *
 * @example
 * validatePosition(1) // 1
 * validatePosition("3") // 3
 * validatePosition(0) // null
 * validatePosition(-1) // null
 * validatePosition(null) // null
 * validatePosition(undefined) // null
 * validatePosition("abc") // null
 */
export const validatePosition = (position: any): number | null => {
  // Handle null or undefined
  if (position === null || position === undefined) {
    return null;
  }

  // Convert to number
  const numPosition = Number(position);

  // Check if conversion resulted in NaN or position is less than 1
  if (isNaN(numPosition) || numPosition < 1) {
    return null;
  }

  // Return valid position
  return numPosition;
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate student ID
 */
export const isValidStudentId = (studentId: string | number | undefined): boolean => {
  if (!studentId) return false;
  const id = typeof studentId === 'string' ? studentId : studentId.toString();
  return id.length > 0 && /^[0-9]+$/.test(id);
};

/**
 * Validate exam session ID
 */
export const isValidExamSessionId = (examSessionId: string | undefined): boolean => {
  return !!examSessionId && examSessionId.length > 0;
};

/**
 * Validate score range
 */
export const isValidScore = (score: number | undefined, min: number = 0, max: number = 100): boolean => {
  if (score === undefined || score === null) return false;
  return score >= min && score <= max;
};

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format date for display
 */
export const formatDate = (date: string | Date | undefined): string => {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return 'Invalid Date';
  }
};

/**
 * Format short date
 */
export const formatShortDate = (date: string | Date | undefined): string => {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return 'Invalid Date';
  }
};

/**
 * Format percentage
 */
export const formatPercentage = (value: number | undefined, decimals: number = 1): string => {
  if (value === undefined || value === null || isNaN(value)) return 'N/A';
  return `${roundToDecimal(value, decimals)}%`;
};

/**
 * Format score display
 */
export const formatScore = (obtained: number | undefined, total: number | undefined): string => {
  if (obtained === undefined || total === undefined) return 'N/A';
  return `${obtained}/${total}`;
};

// ============================================================================
// ATTENDANCE HELPERS
// ============================================================================

/**
 * Calculate attendance percentage
 */
export const calculateAttendancePercentage = (
  timesPresent: number,
  timesOpened: number
): number => {
  if (timesOpened === 0) return 0;
  return (timesPresent / timesOpened) * 100;
};

/**
 * Format attendance display
 */
export const formatAttendance = (
  timesPresent: number,
  timesOpened: number
): string => {
  const percentage = calculateAttendancePercentage(timesPresent, timesOpened);
  return `${timesPresent}/${timesOpened} (${roundToDecimal(percentage, 1)}%)`;
};

/**
 * Get attendance status
 */
export const getAttendanceStatus = (
  timesPresent: number,
  timesOpened: number
): 'excellent' | 'good' | 'fair' | 'poor' => {
  const percentage = calculateAttendancePercentage(timesPresent, timesOpened);
  
  if (percentage >= 90) return 'excellent';
  if (percentage >= 75) return 'good';
  if (percentage >= 60) return 'fair';
  return 'poor';
};

// ============================================================================
// COMPARISON HELPERS
// ============================================================================

/**
 * Compare with class average
 */
export const compareWithClassAverage = (
  studentScore: number,
  classAverage: number
): 'above' | 'at' | 'below' => {
  const difference = studentScore - classAverage;
  
  if (Math.abs(difference) < 1) return 'at';
  if (difference > 0) return 'above';
  return 'below';
};

/**
 * Get performance level
 */
export const getPerformanceLevel = (percentage: number): string => {
  if (percentage >= 80) return 'Outstanding';
  if (percentage >= 70) return 'Excellent';
  if (percentage >= 60) return 'Very Good';
  if (percentage >= 50) return 'Good';
  if (percentage >= 40) return 'Fair';
  return 'Needs Improvement';
};

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  // Academic Session
  isAcademicSessionObject,
  getAcademicSessionString,
  getAcademicSessionId,
  createDefaultAcademicSession,
  
  // Education Level
  normalizeEducationLevel,
  getEducationLevelDisplayName,
  isValidEducationLevel,
  
  // Terms
  normalizeTermName,
  getTermDisplayName,
  getTermNumber,
  
  // Grades
  calculateGrade,
  calculateGradeCustom,
  getGradeRemark,
  
  // Scores
  calculateTotalScore,
  calculateAverage,
  calculatePercentage,
  roundToDecimal,
  
  // Positions
  getPositionSuffix,
  formatPosition,
  validatePosition,

  // Validation
  isValidStudentId,
  isValidExamSessionId,
  isValidScore,
  
  // Formatting
  formatDate,
  formatShortDate,
  formatPercentage,
  formatScore,
  
  // Attendance
  calculateAttendancePercentage,
  formatAttendance,
  getAttendanceStatus,
  
  // Comparison
  compareWithClassAverage,
  getPerformanceLevel
};