/**
 * Attendance Service
 *
 * Manages attendance tracking including daily attendance, statistics, and CSV import/export.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AttendanceStatusCode = 'P' | 'A' | 'L' | 'E';
export type AttendanceStatusLabel = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: number;
  date: string;
  student: number | null;
  student_name?: string | null;       // ← must exist
  teacher: number | null;
  teacher_name?: string | null;       // ← must exist
  section: number | null;
  section_name?: string | null;       // ← ADD THIS — was missing
  status: AttendanceStatusCode;
  status_display?: string;
  time_in?: string | null;            // ← must exist
  time_out?: string | null;           // ← must exist
  student_stream?: number | null;
  student_stream_name?: string | null; // ← must exist
  student_stream_type?: string | null;
  student_education_level?: string | null;
  student_education_level_display?: string | null;
  student_class_display?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateAttendanceData {
  date: string;
  student: number;
  teacher?: number | null;
  section: number;
  status: AttendanceStatusCode;
  time_in?: string;
  time_out?: string;
}

export type UpdateAttendanceData = Partial<CreateAttendanceData>;

export interface AttendanceFilters {
  date?: string;
  start_date?: string;
  end_date?: string;
  date__gte?: string;
  date__lte?: string;
  student?: number;
  teacher?: number;
  limit?: number;
  section?: number;
  status?: AttendanceStatusCode;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface AttendanceStatistics {
  total_records: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  attendance_rate: number;
  by_date?: Record<string, number>;
  by_student?: Record<number, {
    present: number;
    absent: number;
    late: number;
    excused: number;
  }>;
}

// ── Paginated response shape from DRF ────────────────────────────────────────
interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── Strongly-typed status maps ────────────────────────────────────────────────
export const AttendanceStatusMap: Record<AttendanceStatusLabel, AttendanceStatusCode> = {
  present: 'P',
  absent: 'A',
  late: 'L',
  excused: 'E',
};

export const AttendanceCodeToStatusMap: Record<AttendanceStatusCode, AttendanceStatusLabel> = {
  P: 'present',
  A: 'absent',
  L: 'late',
  E: 'excused',
};

/** Safely convert a raw backend code string to a typed status label. */
export function toStatusLabel(code: string): AttendanceStatusLabel {
  return AttendanceCodeToStatusMap[code as AttendanceStatusCode] ?? 'absent';
}

/** Safely convert a label string to a typed status code. */
export function toStatusCode(label: string): AttendanceStatusCode {
  return AttendanceStatusMap[label as AttendanceStatusLabel] ?? 'A';
}

// ── Lesson-attendance backend shape (used by LessonAttendanceDashboard) ───────
export interface AttendanceRecordBackend {
  id: number;
  date: string;
  student: number | null;
  teacher: number | null;
  section: number | null;
  /** Raw backend code — intentionally `string` to handle unknown values gracefully */
  status: string;
  time_in?: string | null;
  time_out?: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Build a URLSearchParams string from a filter object, omitting null/undefined. */
function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

/** Download a Blob as a named file. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/** Unwrap DRF paginated or plain-array responses. */
function unwrapList<T>(response: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(response)) return response;
  return response.results ?? [];
}

// ============================================================================
// ATTENDANCE SERVICE
// ============================================================================

class AttendanceService {

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /** Fetch all attendance records, unwrapping pagination automatically. */
  async getAttendanceRecords(params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    try {
      console.log('🔍 AttendanceService: Fetching records with params:', params);
      const response = await api.get('/api/attendance/attendance/', params);
      const records = unwrapList<AttendanceRecord>(response);
      console.log(`✅ AttendanceService: ${records.length} records fetched`);
      return records;
    } catch (error) {
      console.error('❌ AttendanceService: Error fetching records:', error);
      throw error;
    }
  }

  /** Fetch a single attendance record by ID. */
  async getAttendanceRecord(id: number): Promise<AttendanceRecord> {
    try {
      return await api.get(`/api/attendance/attendance/${id}/`);
    } catch (error) {
      console.error(`❌ AttendanceService: Error fetching record ${id}:`, error);
      throw error;
    }
  }

  /** Create a new attendance record. */
  async createAttendanceRecord(data: CreateAttendanceData): Promise<AttendanceRecord> {
    try {
      return await api.post('/api/attendance/attendance/', data);
    } catch (error) {
      console.error('❌ AttendanceService: Error creating record:', error);
      throw error;
    }
  }

  /** Partially update an attendance record. */
  async updateAttendanceRecord(id: number, data: UpdateAttendanceData): Promise<AttendanceRecord> {
    try {
      return await api.patch(`/api/attendance/attendance/${id}/`, data);
    } catch (error) {
      console.error(`❌ AttendanceService: Error updating record ${id}:`, error);
      throw error;
    }
  }

  /** Delete an attendance record. */
  async deleteAttendanceRecord(id: number): Promise<void> {
    try {
      await api.delete(`/api/attendance/attendance/${id}/`);
    } catch (error) {
      console.error(`❌ AttendanceService: Error deleting record ${id}:`, error);
      throw error;
    }
  }

  // ── BULK OPERATIONS ────────────────────────────────────────────────────────

  /** Create multiple records in parallel. */
  async bulkCreateAttendance(records: CreateAttendanceData[]): Promise<AttendanceRecord[]> {
    try {
      return await Promise.all(records.map(r => this.createAttendanceRecord(r)));
    } catch (error) {
      console.error('❌ AttendanceService: Error bulk creating records:', error);
      throw error;
    }
  }

  /** Update multiple records in parallel. */
  async bulkUpdateAttendance(
    updates: Array<{ id: number; data: UpdateAttendanceData }>
  ): Promise<AttendanceRecord[]> {
    try {
      return await Promise.all(updates.map(({ id, data }) => this.updateAttendanceRecord(id, data)));
    } catch (error) {
      console.error('❌ AttendanceService: Error bulk updating records:', error);
      throw error;
    }
  }

  // ── FILTERED QUERIES ───────────────────────────────────────────────────────

  async getStudentAttendance(studentId: number, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, student: studentId });
  }

  async getAttendanceByDate(date: string, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, date });
  }

  async getAttendanceByDateRange(
    startDate: string,
    endDate: string,
    params?: AttendanceFilters
  ): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, start_date: startDate, end_date: endDate });
  }

  async getSectionAttendance(sectionId: number, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, section: sectionId });
  }

  async getTeacherAttendance(teacherId: number, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, teacher: teacherId });
  }

  async getAttendanceByStatus(
    status: AttendanceStatusCode,
    params?: AttendanceFilters
  ): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, status });
  }

  // ── IMPORT / EXPORT ────────────────────────────────────────────────────────

  /**
   * Import attendance records from a CSV file.
   * Expected CSV columns: student, teacher, section, date, status
   */
  async importFromCSV(file: File): Promise<{ message: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/attendance/attendance/import-csv/', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Import failed' }));
        throw new Error(err.error ?? err.detail ?? `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('❌ AttendanceService: Error importing CSV:', error);
      throw error;
    }
  }

  /**
   * Fetch attendance records as a CSV Blob from the backend export endpoint.
   */
  async exportToCSV(params?: AttendanceFilters): Promise<Blob> {
    try {
      const url = `/api/attendance/attendance/export-csv/${buildQuery(params as Record<string, unknown>)}`;
      const response = await fetch(url, { method: 'GET', credentials: 'include' });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    } catch (error) {
      console.error('❌ AttendanceService: Error exporting CSV:', error);
      throw error;
    }
  }

  /** Fetch and immediately download the CSV export. */
  async downloadCSV(
    params?: AttendanceFilters,
    filename = 'attendance.csv'
  ): Promise<void> {
    const blob = await this.exportToCSV(params);
    downloadBlob(blob, filename);
  }

  // ── STATISTICS ─────────────────────────────────────────────────────────────

  /**
   * Calculate attendance statistics client-side.
   * For large datasets, prefer a dedicated backend endpoint.
   */
  async calculateStatistics(params?: AttendanceFilters): Promise<AttendanceStatistics> {
    try {
      const records = await this.getAttendanceRecords(params);

      const stats: AttendanceStatistics = {
        total_records: records.length,
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        excused_count: 0,
        attendance_rate: 0,
      };

      for (const record of records) {
        if (record.status === 'P') stats.present_count++;
        else if (record.status === 'A') stats.absent_count++;
        else if (record.status === 'L') stats.late_count++;
        else if (record.status === 'E') stats.excused_count++;
      }

      if (stats.total_records > 0) {
        stats.attendance_rate =
          ((stats.present_count + stats.late_count + stats.excused_count) / stats.total_records) * 100;
      }

      return stats;
    } catch (error) {
      console.error('❌ AttendanceService: Error calculating statistics:', error);
      throw error;
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const attendanceService = new AttendanceService();
export default attendanceService;

// ── Lesson-attendance helpers (used by LessonAttendanceDashboard) ─────────────

export async function getLessonAttendance(params?: { date?: string }) {
  return attendanceService.getAttendanceRecords(params);
}

export async function addLessonAttendance(
  data: Pick<CreateAttendanceData, 'status' | 'date'>
): Promise<AttendanceRecord> {
  // student & section are required by the backend; callers must pass them via a full CreateAttendanceData.
  // This shim preserves the existing call-sites — extend as needed.
  return attendanceService.createAttendanceRecord(data as CreateAttendanceData);
}

export async function updateLessonAttendance(
  id: number,
  data: UpdateAttendanceData
): Promise<AttendanceRecord> {
  return attendanceService.updateAttendanceRecord(id, data);
}

export async function deleteLessonAttendance(id: number): Promise<void> {
  return attendanceService.deleteAttendanceRecord(id);
}

// ── Legacy named exports (deprecated — use attendanceService.* instead) ────────

/** @deprecated Use attendanceService.getAttendanceRecords() */
export async function getAttendance(params?: AttendanceFilters) {
  return attendanceService.getAttendanceRecords(params);
}

/** @deprecated Use attendanceService.createAttendanceRecord() */
export async function addAttendance(data: CreateAttendanceData) {
  return attendanceService.createAttendanceRecord(data);
}

/** @deprecated Use attendanceService.updateAttendanceRecord() */
export async function updateAttendance(id: number, data: UpdateAttendanceData) {
  return attendanceService.updateAttendanceRecord(id, data);
}

/** @deprecated Use attendanceService.deleteAttendanceRecord() */
export async function deleteAttendance(id: number) {
  return attendanceService.deleteAttendanceRecord(id);
}

/** @deprecated Use attendanceService.importFromCSV() */
export async function importAttendanceFromCSV(file: File) {
  return attendanceService.importFromCSV(file);
}

/** @deprecated Use attendanceService.exportToCSV() */
export async function exportAttendanceToCSV(params?: AttendanceFilters) {
  return attendanceService.exportToCSV(params);
}