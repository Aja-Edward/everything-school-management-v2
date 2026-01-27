/**
 * Attendance Service
 *
 * Manages attendance tracking including daily attendance, statistics, and CSV import/export.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AttendanceRecord {
  id: number;
  date: string;
  student: number | null;
  student_name?: string | null;
  teacher: number | null;
  teacher_name?: string | null;
  section: number | null;
  section_name?: string | null;
  status: 'P' | 'A' | 'L' | 'E'; // Present, Absent, Late, Excused
  status_display?: string;
  time_in?: string | null;
  time_out?: string | null;
  student_stream?: number | null;
  student_stream_name?: string | null;
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
  status: 'P' | 'A' | 'L' | 'E';
  time_in?: string;
  time_out?: string;
}

export interface UpdateAttendanceData extends Partial<CreateAttendanceData> {}

export interface AttendanceFilters {
  date?: string;
  start_date?: string;
  end_date?: string;
  student?: number;
  teacher?: number;
  section?: number;
  status?: string;
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
  by_student?: Record<number, { present: number; absent: number; late: number; excused: number }>;
}

export const AttendanceStatusMap: Record<'present' | 'absent' | 'late' | 'excused', 'P' | 'A' | 'L' | 'E'> = {
  present: 'P',
  absent: 'A',
  late: 'L',
  excused: 'E',
};

export const AttendanceCodeToStatusMap: Record<'P' | 'A' | 'L' | 'E', 'present' | 'absent' | 'late' | 'excused'> = {
  P: 'present',
  A: 'absent',
  L: 'late',
  E: 'excused',
};

// ============================================================================
// ATTENDANCE SERVICE
// ============================================================================

class AttendanceService {
  /**
   * Get all attendance records
   */
  async getAttendanceRecords(params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    try {
      console.log('🔍 AttendanceService: Fetching records with params:', params);
      const response = await api.get('/api/attendance/attendance/', params);
      console.log('✅ AttendanceService: Records fetched:', response);
      return response.results || response;
    } catch (error) {
      console.error('❌ AttendanceService: Error fetching records:', error);
      throw error;
    }
  }

  /**
   * Get a single attendance record by ID
   */
  async getAttendanceRecord(id: number): Promise<AttendanceRecord> {
    try {
      const response = await api.get(`/api/attendance/attendance/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching attendance record ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new attendance record
   */
  async createAttendanceRecord(data: CreateAttendanceData): Promise<AttendanceRecord> {
    try {
      const response = await api.post('/api/attendance/attendance/', data);
      return response;
    } catch (error) {
      console.error('Error creating attendance record:', error);
      throw error;
    }
  }

  /**
   * Update an attendance record
   */
  async updateAttendanceRecord(id: number, data: UpdateAttendanceData): Promise<AttendanceRecord> {
    try {
      const response = await api.patch(`/api/attendance/attendance/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating attendance record ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete an attendance record
   */
  async deleteAttendanceRecord(id: number): Promise<void> {
    try {
      await api.delete(`/api/attendance/attendance/${id}/`);
    } catch (error) {
      console.error(`Error deleting attendance record ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // IMPORT/EXPORT OPERATIONS
  // ============================================================================

  /**
   * Import attendance records from CSV file
   * Expected CSV format: student, teacher, section, date, status
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
        const error = await response.json().catch(() => ({ detail: 'Import failed' }));
        throw new Error(error.error || error.detail || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error importing attendance from CSV:', error);
      throw error;
    }
  }

  /**
   * Export attendance records to CSV
   * Returns a Blob that can be downloaded
   */
  async exportToCSV(params?: AttendanceFilters): Promise<Blob> {
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
      const url = `/api/attendance/attendance/export-csv/${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting attendance to CSV:', error);
      throw error;
    }
  }

  /**
   * Download CSV export as a file
   */
  async downloadCSV(params?: AttendanceFilters, filename: string = 'attendance.csv'): Promise<void> {
    try {
      const blob = await this.exportToCSV(params);
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
    } catch (error) {
      console.error('Error downloading attendance CSV:', error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get attendance records for a specific student
   */
  async getStudentAttendance(studentId: number, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, student: studentId });
  }

  /**
   * Get attendance records for a specific date
   */
  async getAttendanceByDate(date: string, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, date });
  }

  /**
   * Get attendance records for a date range
   */
  async getAttendanceByDateRange(
    startDate: string,
    endDate: string,
    params?: AttendanceFilters
  ): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({
      ...params,
      start_date: startDate,
      end_date: endDate,
    });
  }

  /**
   * Get attendance records by section
   */
  async getSectionAttendance(sectionId: number, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, section: sectionId });
  }

  /**
   * Get attendance records by teacher
   */
  async getTeacherAttendance(teacherId: number, params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, teacher: teacherId });
  }

  /**
   * Get attendance records by status
   */
  async getAttendanceByStatus(status: 'P' | 'A' | 'L' | 'E', params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    return this.getAttendanceRecords({ ...params, status });
  }

  /**
   * Bulk create attendance records
   */
  async bulkCreateAttendance(records: CreateAttendanceData[]): Promise<void> {
    try {
      const promises = records.map(record => this.createAttendanceRecord(record));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk creating attendance records:', error);
      throw error;
    }
  }

  /**
   * Bulk update attendance records
   */
  async bulkUpdateAttendance(updates: Array<{ id: number; data: UpdateAttendanceData }>): Promise<void> {
    try {
      const promises = updates.map(({ id, data }) => this.updateAttendanceRecord(id, data));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk updating attendance records:', error);
      throw error;
    }
  }

  /**
   * Calculate attendance statistics
   * Note: This is client-side calculation. Consider adding a backend endpoint for better performance.
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

      records.forEach(record => {
        switch (record.status) {
          case 'P':
            stats.present_count++;
            break;
          case 'A':
            stats.absent_count++;
            break;
          case 'L':
            stats.late_count++;
            break;
          case 'E':
            stats.excused_count++;
            break;
        }
      });

      // Calculate attendance rate (present + late + excused) / total
      if (stats.total_records > 0) {
        stats.attendance_rate =
          ((stats.present_count + stats.late_count + stats.excused_count) / stats.total_records) * 100;
      }

      return stats;
    } catch (error) {
      console.error('Error calculating attendance statistics:', error);
      throw error;
    }
  }
}

export const attendanceService = new AttendanceService();
export default attendanceService;

// ============================================================================
// LEGACY EXPORTS (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use attendanceService.getAttendanceRecords() instead
 */
export async function getAttendance(params?: Record<string, any>) {
  return attendanceService.getAttendanceRecords(params);
}

/**
 * @deprecated Use attendanceService.createAttendanceRecord() instead
 */
export async function addAttendance(data: Partial<AttendanceRecord>) {
  return attendanceService.createAttendanceRecord(data as CreateAttendanceData);
}

/**
 * @deprecated Use attendanceService.updateAttendanceRecord() instead
 */
export async function updateAttendance(id: number, data: Partial<AttendanceRecord>) {
  return attendanceService.updateAttendanceRecord(id, data);
}

/**
 * @deprecated Use attendanceService.deleteAttendanceRecord() instead
 */
export async function deleteAttendance(id: number) {
  return attendanceService.deleteAttendanceRecord(id);
}

/**
 * @deprecated Use attendanceService.importFromCSV() instead
 */
export async function importAttendanceFromCSV(file: File) {
  return attendanceService.importFromCSV(file);
}

/**
 * @deprecated Use attendanceService.exportToCSV() instead
 */
export async function exportAttendanceToCSV(params?: AttendanceFilters) {
  return attendanceService.exportToCSV(params);
}
