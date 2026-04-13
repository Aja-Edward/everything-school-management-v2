// services/ProfessionalAssignmentService.ts
import api from './api';
import type {
  AssignedStudentsResponse,
  UpdateTeacherRemarkRequest,
  UpdateTeacherRemarkResponse,
  SignatureUploadResponse,
  ApplySignatureRequest,
  ApplySignatureResponse,
  RemarkTemplatesResponse,
  StudentFilters,
  UpdateHeadTeacherRemarkRequest,
  UpdateHeadTeacherRemarkResponse,
  PendingReviewsResponse,
} from '@/types/results';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the CSRF token from the readable `csrftoken` cookie.
 * Required for all mutating requests (POST/PATCH/PUT/DELETE).
 */
function getCsrfToken(): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Headers for mutating fetch requests.
 * Auth flows via httpOnly cookies — no Authorization header needed.
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  const tenantSlug = localStorage.getItem('tenantSlug');
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRFToken'] = csrfToken;

  return headers;
}

/**
 * Parse an error response body and throw a descriptive Error.
 * Handles both JSON and plain-text error bodies.
 */
async function throwFromResponse(response: Response): Promise<never> {
  const text = await response.text();
  let detail = `HTTP ${response.status}`;

  try {
    const parsed = JSON.parse(text);
    detail = parsed.error || parsed.detail || detail;
  } catch {
    if (text) detail = text;
  }

  throw new Error(detail);
}

/**
 * Serialize a plain data object into FormData.
 * Arrays are JSON-stringified so the backend receives them as a single field.
 */
function toFormData(data: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    form.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  }
  return form;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ProfessionalAssignmentService {
  private baseUrl = '/api/results/professional-assignment';
  private headTeacherUrl = '/api/results/head-teacher-assignment';

  // ── Teacher methods ────────────────────────────────────────────────────────

  /** Get all students assigned to the current teacher. */
  async getAssignedStudents(filters?: StudentFilters): Promise<AssignedStudentsResponse> {
    try {
      return await api.get(`${this.baseUrl}/my-students/`, filters);
    } catch (error: any) {
      console.error('Error fetching assigned students:', error.response?.data ?? error);
      throw error;
    }
  }

  /** Update teacher remark for a student's term report. */
  async updateTeacherRemark(
    data: UpdateTeacherRemarkRequest
  ): Promise<UpdateTeacherRemarkResponse> {
    const response = await fetch(
      `${API_BASE_URL}${this.baseUrl}/update-remark/`,
      {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: toFormData(data as unknown as Record<string, unknown>),
      }
    );

    if (!response.ok) await throwFromResponse(response);
    return response.json();
  }

  /** Upload teacher signature image to Cloudinary. */
  async uploadTeacherSignature(signatureFile: File): Promise<SignatureUploadResponse> {
    const form = new FormData();
    form.append('signature_image', signatureFile);

    const response = await fetch(
      `${API_BASE_URL}${this.baseUrl}/upload-signature/`,
      {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: form,
      }
    );

    if (!response.ok) await throwFromResponse(response);
    return response.json();
  }

  /** Apply an uploaded signature to multiple term reports. */
  async applySignatureToReports(
    data: ApplySignatureRequest
  ): Promise<ApplySignatureResponse> {
    const form = new FormData();
    form.append('signature_url', data.signature_url);
    form.append('education_level', data.education_level);
    form.append('term_report_ids', JSON.stringify(data.term_report_ids));

    const response = await fetch(
      `${API_BASE_URL}${this.baseUrl}/apply-signature/`,
      {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: form,
      }
    );

    if (!response.ok) await throwFromResponse(response);
    return response.json();
  }

  /** Get remark templates for quick insertion. */
  async getRemarkTemplates(): Promise<RemarkTemplatesResponse> {
    try {
      return await api.get(`${this.baseUrl}/remark-templates/`);
    } catch (error: any) {
      console.error('Error fetching remark templates:', error.response?.data ?? error);
      throw error;
    }
  }

  // ── Head teacher methods ───────────────────────────────────────────────────

  /** Get all pending reviews for the head teacher. */
  async getPendingReviews(examSessionId?: string): Promise<PendingReviewsResponse> {
    try {
      return await api.get(
        `${this.headTeacherUrl}/pending-reviews/`,
        examSessionId ? { exam_session: examSessionId } : undefined
      );
    } catch (error: any) {
      console.error('Error fetching pending reviews:', error.response?.data ?? error);
      throw error;
    }
  }

  /** Update head teacher remark for a term report. */
  async updateHeadTeacherRemark(
    data: UpdateHeadTeacherRemarkRequest
  ): Promise<UpdateHeadTeacherRemarkResponse> {
    const response = await fetch(
      `${API_BASE_URL}${this.headTeacherUrl}/update-head-remark/`,
      {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: toFormData(data as unknown as Record<string, unknown>),
      }
    );

    if (!response.ok) await throwFromResponse(response);
    return response.json();
  }

  /** Upload head teacher signature image to Cloudinary. */
  async uploadHeadTeacherSignature(signatureFile: File): Promise<SignatureUploadResponse> {
    const form = new FormData();
    form.append('signature_image', signatureFile);

    const response = await fetch(
      `${API_BASE_URL}${this.headTeacherUrl}/upload-head-signature/`,
      {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: form,
      }
    );

    if (!response.ok) await throwFromResponse(response);
    return response.json();
  }

  /** Apply head teacher signature to multiple term reports. */
  async applyHeadSignature(data: ApplySignatureRequest): Promise<ApplySignatureResponse> {
    const response = await fetch(
      `${API_BASE_URL}${this.headTeacherUrl}/apply-head-signature/`,
      {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: toFormData(data as unknown as Record<string, unknown>),
      }
    );

    if (!response.ok) await throwFromResponse(response);
    return response.json();
  }
}

export default new ProfessionalAssignmentService();