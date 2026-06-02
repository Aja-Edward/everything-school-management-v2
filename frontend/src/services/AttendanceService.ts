/**
 * AttendanceService
 *
 * All changes from review
 * ──────────────────────
 * #2  bulkUpsert       — single POST to /bulk-upsert/ with { created, updated, records }
 * #3  getStats         — delegates to /stats/ endpoint (server-side aggregation)
 * #6  bulkCreateWithResults — returns { succeeded, failed } for partial-success handling
 * #8  date-keyed cache — avoids redundant fetches within the same browser session
 * #9  pagination guard — warns and auto-pages when page_size cap is hit
 * #10 downloadPDF      — calls server /export-pdf/ (WeasyPrint) instead of jsPDF
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AttendanceStatusCode  = 'P' | 'A' | 'L' | 'E';
export type AttendanceStatusLabel = 'present' | 'absent' | 'late' | 'excused';
export type AttendanceSession     = 'morning' | 'afternoon';

export interface AttendanceRecord {
  id: number;
  date: string;
  session: AttendanceSession;
  session_display?: string;
  student: number | null;
  student_name?: string | null;
  teacher: number | null;
  teacher_name?: string | null;
  section: number | null;
  section_name?: string | null;
  status: AttendanceStatusCode;
  time_in?: string | null;
  time_out?: string | null;
  marked_late?: boolean;
  back_fill_reason?: string;
  created_at?: string;
  updated_at?: string;
  student_stream?: number | null;
  student_stream_name?: string | null;
  student_stream_type?: string | null;
  student_education_level?: string | null;
  student_education_level_display?: string | null;
  student_class_display?: string | null;
}

export interface CreateAttendanceData {
  date: string;
  session?: AttendanceSession;
  student: number;
  teacher?: number | null;
  section: number;
  status: AttendanceStatusCode;
  time_in?: string | null;
  time_out?: string | null;
  back_fill_reason?: string;
}

export type UpdateAttendanceData = Partial<CreateAttendanceData>;

export interface BulkUpsertItem {
  student: number;
  section: number;
  date: string;
  session?: AttendanceSession;
  status: AttendanceStatusCode;
  teacher?: number | null;
  time_in?: string | null;
  time_out?: string | null;
  back_fill_reason?: string;
}

export interface BulkUpsertResponse {
  created: number;
  updated: number;
  records: AttendanceRecord[];
}

/** Returned by bulkCreateWithResults — FIX #6 */
export interface BulkOperationResult {
  succeeded: AttendanceRecord[];
  failed: Array<{ item: CreateAttendanceData; error: string }>;
}

export interface AttendanceFilters {
  date?: string;
  start_date?: string;
  end_date?: string;
  student?: number;
  teacher?: number;
  section?: number;
  session?: AttendanceSession;
  status?: AttendanceStatusCode;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

/** Shape returned by the /stats/ endpoint — FIX #3 */
export interface AttendanceStatistics {
  total_records: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  attendance_rate: number;
  session_breakdown: {
    morning:   Record<AttendanceStatusCode, number>;
    afternoon: Record<AttendanceStatusCode, number>;
  };
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── Status maps ───────────────────────────────────────────────────────────────

export const AttendanceStatusMap: Record<AttendanceStatusLabel, AttendanceStatusCode> = {
  present: 'P',
  absent:  'A',
  late:    'L',
  excused: 'E',
};

export const AttendanceCodeToStatusMap: Record<AttendanceStatusCode, AttendanceStatusLabel> = {
  P: 'present',
  A: 'absent',
  L: 'late',
  E: 'excused',
};

export function toStatusLabel(code: string): AttendanceStatusLabel {
  return AttendanceCodeToStatusMap[code as AttendanceStatusCode] ?? 'absent';
}

export function toStatusCode(label: string): AttendanceStatusCode {
  return AttendanceStatusMap[label as AttendanceStatusLabel] ?? 'A';
}

// ============================================================================
// HELPERS
// ============================================================================

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function unwrapList<T>(response: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(response)) return response;
  return response.results ?? [];
}

// ============================================================================
// DATE-KEYED SESSION CACHE — FIX #8
// ============================================================================

/**
 * In-memory cache keyed by `${sectionId}|${date}|${session}`.
 * Avoids re-fetching when the teacher switches dates back and forth
 * within the same browser session. Cleared on explicit refresh or
 * when the component unmounts via invalidate().
 */

type CacheKey = string;

class AttendanceCache {
  private store = new Map<CacheKey, { data: AttendanceRecord[]; ts: number }>();
  private TTL_MS = 5 * 60 * 1000; // 5 minutes

  key(sectionId: number, date: string, session?: AttendanceSession): CacheKey {
    return `${sectionId}|${date}|${session ?? 'all'}`;
  }

  get(k: CacheKey): AttendanceRecord[] | null {
    const entry = this.store.get(k);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.TTL_MS) { this.store.delete(k); return null; }
    return entry.data;
  }

  set(k: CacheKey, data: AttendanceRecord[]): void {
    this.store.set(k, { data, ts: Date.now() });
  }

  invalidate(k: CacheKey): void { this.store.delete(k); }

  invalidateSection(sectionId: number): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(`${sectionId}|`)) this.store.delete(key);
    }
  }

  clear(): void { this.store.clear(); }
}

export const attendanceCache = new AttendanceCache();

// ============================================================================
// ATTENDANCE SERVICE
// ============================================================================

class AttendanceService {

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async getAttendanceRecords(params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    const response = await api.get('/api/attendance/attendance/', params);
    return unwrapList<AttendanceRecord>(response);
  }

  /**
   * Fetch all pages when a result set might exceed page_size. — FIX #9
   * Use this for student year-view and any unbounded queries.
   */
  async getAllAttendanceRecords(params?: AttendanceFilters): Promise<AttendanceRecord[]> {
    const PAGE_SIZE = 500;
    const firstPage = await api.get('/api/attendance/attendance/', {
      ...params,
      page_size: PAGE_SIZE,
      page: 1,
    }) as PaginatedResponse<AttendanceRecord>;

    if (Array.isArray(firstPage)) return firstPage;

    const results = [...firstPage.results];
    const totalPages = Math.ceil(firstPage.count / PAGE_SIZE);

    if (totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          api.get('/api/attendance/attendance/', {
            ...params,
            page_size: PAGE_SIZE,
            page: i + 2,
          }) as Promise<PaginatedResponse<AttendanceRecord>>
        )
      );
      rest.forEach(p => results.push(...(p.results ?? [])));
    }

    if (totalPages > 5) {
      console.warn(
        `[AttendanceService] Fetched ${results.length} records across ${totalPages} pages. ` +
        'Consider adding tighter date filters to reduce response size.'
      );
    }

    return results;
  }

  async getAttendanceRecord(id: number): Promise<AttendanceRecord> {
    return api.get(`/api/attendance/attendance/${id}/`);
  }

  async createAttendanceRecord(data: CreateAttendanceData): Promise<AttendanceRecord> {
    return api.post('/api/attendance/attendance/', data);
  }

  async updateAttendanceRecord(id: number, data: UpdateAttendanceData): Promise<AttendanceRecord> {
    return api.patch(`/api/attendance/attendance/${id}/`, data);
  }

  async deleteAttendanceRecord(id: number): Promise<void> {
    await api.delete(`/api/attendance/attendance/${id}/`);
  }

  // ── FIX #2 — Bulk upsert ──────────────────────────────────────────────────

  /**
   * Send up to 500 records in a single atomic request.
   * The backend will create or update each record based on
   * (tenant, student, section, date, session).
   *
   * Also invalidates the cache for the affected sections.
   */
  async bulkUpsert(records: BulkUpsertItem[]): Promise<BulkUpsertResponse> {
    const response = await api.post('/api/attendance/attendance/bulk-upsert/', { records });

    // Invalidate cache for every section touched by this upsert
    const sectionIds = new Set(records.map(r => r.section));
    sectionIds.forEach(id => attendanceCache.invalidateSection(id));

    return response as BulkUpsertResponse;
  }

  // ── FIX #6 — Partial success bulk create ─────────────────────────────────

  /**
   * Fire individual creates concurrently; collect successes and failures
   * instead of aborting on first error.
   *
   * Use bulkUpsert() for the common teacher flow (it is atomic and faster).
   * Use this only when you genuinely need per-record error detail and
   * don't need atomicity.
   */
  async bulkCreateWithResults(records: CreateAttendanceData[]): Promise<BulkOperationResult> {
    const settled = await Promise.allSettled(
      records.map(r => this.createAttendanceRecord(r))
    );

    const result: BulkOperationResult = { succeeded: [], failed: [] };

    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        result.succeeded.push(outcome.value);
      } else {
        result.failed.push({
          item:  records[i],
          error: outcome.reason?.message ?? String(outcome.reason),
        });
      }
    });

    return result;
  }

  // ── FIX #3 — Server-side statistics ──────────────────────────────────────

  /**
   * Fetch pre-aggregated statistics from the backend.
   * Supports all the same filter params as getAttendanceRecords.
   * No client-side counting; a single DB query does the work.
   */
  async getStats(params?: AttendanceFilters): Promise<AttendanceStatistics> {
    return api.get('/api/attendance/attendance/stats/', params);
  }

  // ── Cached section+date fetch — FIX #8 ───────────────────────────────────

  /**
   * Fetch attendance for a section on a date, with 5-minute in-memory cache.
   * Designed for the teacher attendance-marking view.
   *
   * Pass forceRefresh=true to bypass the cache (e.g. after a save).
   */
  async getSectionDateAttendance(
    sectionId: number,
    date: string,
    session?: AttendanceSession,
    forceRefresh = false,
  ): Promise<AttendanceRecord[]> {
    const key = attendanceCache.key(sectionId, date, session);

    if (!forceRefresh) {
      const cached = attendanceCache.get(key);
      if (cached) return cached;
    }

    const params: AttendanceFilters = { section: sectionId, date };
    if (session) params.session = session;

    const records = await this.getAttendanceRecords(params);
    attendanceCache.set(key, records);
    return records;
  }

  // ── Filtered helpers ───────────────────────────────────────────────────────

  async getStudentAttendance(studentId: number, params?: AttendanceFilters) {
    return this.getAllAttendanceRecords({ ...params, student: studentId });
  }

  async getAttendanceByDate(date: string, params?: AttendanceFilters) {
    return this.getAttendanceRecords({ ...params, date });
  }

  async getAttendanceByDateRange(start: string, end: string, params?: AttendanceFilters) {
    return this.getAllAttendanceRecords({ ...params, start_date: start, end_date: end });
  }

  async getSectionAttendance(sectionId: number, params?: AttendanceFilters) {
    return this.getAttendanceRecords({ ...params, section: sectionId });
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Upload a CSV file for server-side import.
   *
   * @param partial  When true, valid rows are imported even if some rows fail.
   *                 The response includes { imported, skipped, errors }.
   */
  async importFromCSV(
    file: File,
    partial = false,
  ): Promise<{ message: string; imported: number; skipped: number; errors: unknown[] }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `/api/attendance/attendance/import-csv/${partial ? '?partial=true' : ''}`;
    const response = await fetch(url, {
      method:      'POST',
      body:        formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Import failed' }));
      throw new Error(err.error ?? err.detail ?? `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async exportToCSV(params?: AttendanceFilters): Promise<Blob> {
    const url = `/api/attendance/attendance/export-csv/${buildQuery(params as Record<string, unknown>)}`;
    const response = await fetch(url, { method: 'GET', credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  }

  async downloadCSV(params?: AttendanceFilters, filename = 'attendance.csv'): Promise<void> {
    const blob = await this.exportToCSV(params);
    downloadBlob(blob, filename);
  }

  /**
   * FIX #10 — Download a WeasyPrint PDF from the backend.
   * The server renders the full report template; no client-side PDF generation.
   */
  async downloadPDF(params?: AttendanceFilters, filename = 'attendance_report.pdf'): Promise<void> {
    const url = `/api/attendance/attendance/export-pdf/${buildQuery(params as Record<string, unknown>)}`;
    const response = await fetch(url, { method: 'GET', credentials: 'include' });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'PDF export failed' }));
      throw new Error(err.error ?? `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    downloadBlob(blob, filename);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const attendanceService = new AttendanceService();
export default attendanceService;

// ── Named helpers (for clean imports in components) ───────────────────────────

export const getAttendance         = (p?: AttendanceFilters)           => attendanceService.getAttendanceRecords(p);
export const getAllAttendance      = (p?: AttendanceFilters)           => attendanceService.getAllAttendanceRecords(p);
export const addAttendance         = (d: CreateAttendanceData)         => attendanceService.createAttendanceRecord(d);
export const updateAttendance      = (id: number, d: UpdateAttendanceData) => attendanceService.updateAttendanceRecord(id, d);
export const deleteAttendance      = (id: number)                      => attendanceService.deleteAttendanceRecord(id);
export const bulkUpsertAttendance  = (r: BulkUpsertItem[])             => attendanceService.bulkUpsert(r);
export const getAttendanceStats    = (p?: AttendanceFilters)           => attendanceService.getStats(p);
export const getSectionDateAttendance = (
  sId: number, date: string, session?: AttendanceSession, force?: boolean
) => attendanceService.getSectionDateAttendance(sId, date, session, force);