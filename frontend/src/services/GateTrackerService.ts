/**
 * GateTrackerService
 *
 * Client for the chip/card gate tracking endpoints:
 *   /api/attendance/tags/           enrollment and identification
 *   /api/attendance/scans/          the arrival/departure log
 *   /api/attendance/notifications/  what parents were told
 *
 * Enrolling a chip needs a device that can read one, so that happens in the
 * scanner app. What this covers is the oversight the web admin needs: how far
 * enrollment has got, retiring a lost chip, correcting one on the wrong bag,
 * and answering "did the parent actually get told?".
 */

import api from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TagStatus = 'active' | 'lost' | 'revoked';
export type ScanDirection = 'in' | 'out';
export type NotificationChannel = 'in_app' | 'email' | 'sms';
export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'skipped';

export interface StudentIdentity {
  id: number;
  name: string | null;
  registration_number: string | null;
  class_display: string | null;
  section: number | null;
  section_name: string | null;
  profile_picture: string | null;
}

export interface StudentTag {
  id: number;
  uid: string;
  label: string;
  status: TagStatus;
  status_display: string;
  student: number;
  student_detail: StudentIdentity | null;
  issued_at: string;
  issued_by: number | null;
  issued_by_name: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  revoked_by_name: string | null;
  revoke_reason: string;
}

export interface RosterTag {
  id: number;
  uid: string;
  label: string;
  issued_at: string;
}

export interface RosterRow extends StudentIdentity {
  is_enrolled: boolean;
  tags: RosterTag[];
}

export interface RosterCounts {
  total: number;
  enrolled: number;
  unenrolled: number;
}

export interface RosterResponse {
  count: number;
  next: string | null;
  previous: string | null;
  total_pages?: number;
  current_page?: number;
  section: { id: number; name: string } | null;
  counts: RosterCounts;
  results: RosterRow[];
}

export interface GateScan {
  id: number;
  uid: string;
  tag: number | null;
  student: number;
  student_detail: StudentIdentity | null;
  direction: ScanDirection;
  direction_display: string;
  scanned_at: string;
  received_at: string;
  scanned_by: number | null;
  scanned_by_name: string | null;
  device_id: string;
  client_scan_id: string;
  attendance: number | null;
  is_duplicate: boolean;
}

export interface ScanNotification {
  id: number;
  scan: number;
  direction: ScanDirection | null;
  student: number;
  student_detail: StudentIdentity | null;
  recipient: number;
  channel: NotificationChannel;
  channel_display: string;
  destination: string;
  subject: string;
  body: string;
  status: NotificationStatus;
  status_display: string;
  provider: string;
  provider_message_id: string;
  error: string;
  attempts: number;
  queued_at: string;
  sent_at: string | null;
  read_at: string | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

export interface SectionOption {
  id: number;
  name: string;
}

/**
 * The backend answers a rejected write with a `code` plus a human `detail`,
 * so the UI can act on the case rather than print a blob.
 *
 * The api client throws an Error and hangs the parsed body off
 * `error.response.data` (see handleResponseError in api.ts) — reading
 * `error.data` instead silently yields undefined and every conflict looks
 * like a generic failure.
 */
export interface ApiFailure {
  code?: string;
  detail?: string;
  status?: number;
  assigned_to?: StudentIdentity;
  [key: string]: unknown;
}

export function failureOf(error: unknown): ApiFailure {
  const wrapped = error as {
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  const body = wrapped?.response?.data;

  if (body && typeof body === 'object') {
    return { ...(body as ApiFailure), status: wrapped.response?.status };
  }
  return {
    detail:
      (typeof body === 'string' && body) ||
      wrapped?.message ||
      'Something went wrong.',
    status: wrapped?.response?.status,
  };
}

// ── Enrollment ────────────────────────────────────────────────────────────────

export interface RosterParams {
  section?: number;
  enrolled?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export async function getRoster(params: RosterParams = {}): Promise<RosterResponse> {
  const query: Record<string, unknown> = { ...params };
  // The endpoint reads enrolled as a string; sending a bare boolean false
  // would be dropped as falsy by the query builder.
  if (params.enrolled !== undefined) query.enrolled = params.enrolled ? 'true' : 'false';
  return api.get('/api/attendance/tags/roster/', query);
}

export interface TagListParams {
  student?: number;
  status?: TagStatus;
  search?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export async function getTags(params: TagListParams = {}): Promise<Paginated<StudentTag>> {
  return api.get('/api/attendance/tags/', params as Record<string, unknown>);
}

export async function enrollTag(data: {
  student: number;
  uid: string;
  label?: string;
}): Promise<StudentTag> {
  return api.post('/api/attendance/tags/', data);
}

export async function revokeTag(
  id: number,
  data: { status?: 'revoked' | 'lost'; reason?: string } = {}
): Promise<StudentTag> {
  return api.post(`/api/attendance/tags/${id}/revoke/`, data);
}

export async function reassignTag(data: {
  uid: string;
  student: number;
  reason?: string;
}): Promise<StudentTag> {
  return api.post('/api/attendance/tags/reassign/', data);
}

export interface ResolveResult {
  tag: StudentTag;
  student: StudentIdentity;
}

export async function resolveUid(uid: string): Promise<ResolveResult> {
  return api.get('/api/attendance/tags/resolve/', { uid });
}

// ── Scan log ──────────────────────────────────────────────────────────────────

export interface ScanListParams {
  student?: number;
  direction?: ScanDirection;
  is_duplicate?: boolean;
  device_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export async function getScans(params: ScanListParams = {}): Promise<Paginated<GateScan>> {
  const query: Record<string, unknown> = { ...params };
  if (params.is_duplicate !== undefined) {
    query.is_duplicate = params.is_duplicate ? 'true' : 'false';
  }
  return api.get('/api/attendance/scans/', query);
}

// ── Notification log ──────────────────────────────────────────────────────────

export interface NotificationListParams {
  channel?: NotificationChannel;
  status?: NotificationStatus;
  student?: number;
  page?: number;
  page_size?: number;
  ordering?: string;
}

export async function getNotifications(
  params: NotificationListParams = {}
): Promise<Paginated<ScanNotification>> {
  return api.get(
    '/api/attendance/notifications/',
    params as Record<string, unknown>
  );
}

// ── Sections, for the roster picker ───────────────────────────────────────────

export async function getSections(): Promise<SectionOption[]> {
  const response = await api.get('/api/classrooms/sections/', { page_size: 200 });
  const rows = Array.isArray(response) ? response : response?.results ?? [];
  return rows.map((row: { id: number; name: string }) => ({
    id: row.id,
    name: row.name,
  }));
}

export default {
  getRoster,
  getTags,
  enrollTag,
  revokeTag,
  reassignTag,
  resolveUid,
  getScans,
  getNotifications,
  getSections,
  failureOf,
};
