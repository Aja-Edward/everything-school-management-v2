/**
 * Timetable Service
 *
 * Manages timetable operations including CRUD, bulk upload, and CSV import.
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Timetable {
  id: number;
  day: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  day_display: string;
  start_time: string; // HH:MM:SS format
  end_time: string;   // HH:MM:SS format
  subject: number;
  subject_name: string;
  teacher: number;
  teacher_name: string;
  classroom: number;
  classroom_name: string;
  period_number: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTimetableData {
  day: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  start_time: string;
  end_time: string;
  subject: number;
  teacher: number;
  classroom: number;
  period_number?: number;
}

export interface UpdateTimetableData extends Partial<CreateTimetableData> {}

export interface TimetableFilters {
  day?: string;
  classroom?: number;
  teacher?: number;
  subject?: number;
  page?: number;
  page_size?: number;
}

export interface BulkUploadResponse {
  message: string;
  count: number;
}

export interface CSVUploadResponse {
  message: string;
}

export interface CSVUploadError {
  errors: Array<{
    line: number;
    errors: Record<string, string[]>;
  }>;
}

// ============================================================================
// TIMETABLE SERVICE
// ============================================================================

class TimetableService {
  /**
   * Get all timetable entries
   */
  async getTimetables(params?: TimetableFilters): Promise<Timetable[]> {
    try {
      const response = await api.get('/api/timetable/timetables/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching timetables:', error);
      throw error;
    }
  }

  /**
   * Get a single timetable entry by ID
   */
  async getTimetable(id: number): Promise<Timetable> {
    try {
      const response = await api.get(`/api/timetable/timetables/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching timetable ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new timetable entry
   */
  async createTimetable(data: CreateTimetableData): Promise<Timetable> {
    try {
      const response = await api.post('/api/timetable/timetables/', data);
      return response;
    } catch (error) {
      console.error('Error creating timetable:', error);
      throw error;
    }
  }

  /**
   * Update a timetable entry
   */
  async updateTimetable(id: number, data: UpdateTimetableData): Promise<Timetable> {
    try {
      const response = await api.patch(`/api/timetable/timetables/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating timetable ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a timetable entry
   */
  async deleteTimetable(id: number): Promise<void> {
    try {
      await api.delete(`/api/timetable/timetables/${id}/`);
    } catch (error) {
      console.error(`Error deleting timetable ${id}:`, error);
      throw error;
    }
  }

  /**
   * Bulk upload timetable entries (JSON format)
   */
  async bulkUploadTimetables(data: CreateTimetableData[]): Promise<BulkUploadResponse> {
    try {
      const response = await api.post('/api/timetable/timetables/bulk-upload/', data);
      return response;
    } catch (error) {
      console.error('Error bulk uploading timetables:', error);
      throw error;
    }
  }

  /**
   * Upload timetable entries from CSV file
   * CSV format: day,start_time,end_time,subject,teacher,classroom
   */
  async uploadTimetableCSV(file: File): Promise<CSVUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/timetable/timetables/csv-upload/', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'CSV upload failed' }));
        throw new Error(error.error || error.errors?.[0]?.errors || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error uploading timetable CSV:', error);
      throw error;
    }
  }

  /**
   * Get timetables by day
   */
  async getTimetablesByDay(day: string): Promise<Timetable[]> {
    return this.getTimetables({ day });
  }

  /**
   * Get timetables by classroom
   */
  async getTimetablesByClassroom(classroomId: number): Promise<Timetable[]> {
    return this.getTimetables({ classroom: classroomId });
  }

  /**
   * Get timetables by teacher
   */
  async getTimetablesByTeacher(teacherId: number): Promise<Timetable[]> {
    return this.getTimetables({ teacher: teacherId });
  }

  /**
   * Get timetables by subject
   */
  async getTimetablesBySubject(subjectId: number): Promise<Timetable[]> {
    return this.getTimetables({ subject: subjectId });
  }

  /**
   * Get weekly timetable for a classroom
   * Returns timetables grouped by day
   */
  async getWeeklyTimetableForClassroom(classroomId: number): Promise<Record<string, Timetable[]>> {
    try {
      const timetables = await this.getTimetablesByClassroom(classroomId);

      const weeklyTimetable: Record<string, Timetable[]> = {
        MONDAY: [],
        TUESDAY: [],
        WEDNESDAY: [],
        THURSDAY: [],
        FRIDAY: [],
        SATURDAY: [],
        SUNDAY: [],
      };

      timetables.forEach(entry => {
        if (weeklyTimetable[entry.day]) {
          weeklyTimetable[entry.day].push(entry);
        }
      });

      // Sort each day's entries by start_time
      Object.keys(weeklyTimetable).forEach(day => {
        weeklyTimetable[day].sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        );
      });

      return weeklyTimetable;
    } catch (error) {
      console.error(`Error fetching weekly timetable for classroom ${classroomId}:`, error);
      throw error;
    }
  }

  /**
   * Get weekly timetable for a teacher
   * Returns timetables grouped by day
   */
  async getWeeklyTimetableForTeacher(teacherId: number): Promise<Record<string, Timetable[]>> {
    try {
      const timetables = await this.getTimetablesByTeacher(teacherId);

      const weeklyTimetable: Record<string, Timetable[]> = {
        MONDAY: [],
        TUESDAY: [],
        WEDNESDAY: [],
        THURSDAY: [],
        FRIDAY: [],
        SATURDAY: [],
        SUNDAY: [],
      };

      timetables.forEach(entry => {
        if (weeklyTimetable[entry.day]) {
          weeklyTimetable[entry.day].push(entry);
        }
      });

      // Sort each day's entries by start_time
      Object.keys(weeklyTimetable).forEach(day => {
        weeklyTimetable[day].sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        );
      });

      return weeklyTimetable;
    } catch (error) {
      console.error(`Error fetching weekly timetable for teacher ${teacherId}:`, error);
      throw error;
    }
  }

  /**
   * Check for timetable conflicts
   * Returns true if there's a conflict (same teacher/classroom at the same time)
   */
  async checkConflict(data: {
    day: string;
    start_time: string;
    end_time: string;
    teacher?: number;
    classroom?: number;
    exclude_id?: number; // Exclude this timetable entry when checking (for updates)
  }): Promise<{ hasConflict: boolean; conflicts: Timetable[] }> {
    try {
      const filters: TimetableFilters = { day: data.day };

      if (data.teacher) filters.teacher = data.teacher;
      if (data.classroom) filters.classroom = data.classroom;

      const timetables = await this.getTimetables(filters);

      // Filter out the excluded entry (if updating)
      const relevantTimetables = data.exclude_id
        ? timetables.filter(t => t.id !== data.exclude_id)
        : timetables;

      // Check for time overlaps
      const conflicts = relevantTimetables.filter(entry => {
        // Check if time ranges overlap
        const entryStart = entry.start_time;
        const entryEnd = entry.end_time;
        const newStart = data.start_time;
        const newEnd = data.end_time;

        return (
          (newStart >= entryStart && newStart < entryEnd) || // New starts during existing
          (newEnd > entryStart && newEnd <= entryEnd) ||     // New ends during existing
          (newStart <= entryStart && newEnd >= entryEnd)      // New completely overlaps existing
        );
      });

      return {
        hasConflict: conflicts.length > 0,
        conflicts,
      };
    } catch (error) {
      console.error('Error checking timetable conflict:', error);
      throw error;
    }
  }

  /**
   * Bulk delete timetables by IDs
   */
  async bulkDeleteTimetables(ids: number[]): Promise<void> {
    try {
      const promises = ids.map(id => this.deleteTimetable(id));
      await Promise.all(promises);
    } catch (error) {
      console.error('Error bulk deleting timetables:', error);
      throw error;
    }
  }

  /**
   * Clear all timetables for a classroom
   */
  async clearClassroomTimetable(classroomId: number): Promise<void> {
    try {
      const timetables = await this.getTimetablesByClassroom(classroomId);
      const ids = timetables.map(t => t.id);
      await this.bulkDeleteTimetables(ids);
    } catch (error) {
      console.error(`Error clearing timetable for classroom ${classroomId}:`, error);
      throw error;
    }
  }

  /**
   * Generate sample CSV template
   * Returns a CSV string that can be used as a template
   */
  generateCSVTemplate(): string {
    const header = 'day,start_time,end_time,subject,teacher,classroom';
    const sampleRow = 'MONDAY,08:00:00,09:00:00,1,1,1';
    return `${header}\n${sampleRow}`;
  }

  /**
   * Download CSV template
   * Triggers browser download of a sample CSV file
   */
  downloadCSVTemplate(): void {
    const csvContent = this.generateCSVTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'timetable_template.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  }
}

export const timetableService = new TimetableService();
export default timetableService;
