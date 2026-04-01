
import api, { API_BASE_URL } from "@/services/api";
import type {
  BulkUploadInitResponse,
  BulkUploadStatusResponse,
  ExportFormat,
  TemplateFormat,
} from "@/types/parentBulkUpload";

const PARENTS_BASE = `${API_BASE_URL}/parents`;



// Reuse the same auth + tenant headers api.ts already builds
const getHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {};

  const token = localStorage.getItem("authToken"); // ← matches api.ts
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const tenantSlug = localStorage.getItem("tenantSlug");
  if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;

  return headers;
};

export const bulkUploadService = {
  uploadFile: async (
    file: File,
    sessionId?: number | null
  ): Promise<BulkUploadInitResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (sessionId) form.append("academic_session", String(sessionId));

    const headers = await getHeaders();
    // Don't set Content-Type — browser sets it with boundary for multipart
    const res = await fetch(`${PARENTS_BASE}/bulk-upload/`, {
      method: "POST",
      headers,
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  getStatus: async (uploadId: number): Promise<BulkUploadStatusResponse> => {
    return api.get(`${PARENTS_BASE}/bulk-upload/${uploadId}/status/`);
  },

  exportCredentials: async (
    uploadId: number,
    format: ExportFormat = "excel"
  ): Promise<void> => {
    const headers = await getHeaders();
    const res = await fetch(
      `${PARENTS_BASE}/bulk-upload/${uploadId}/export-credentials/`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format }),
      }
    );
    if (!res.ok) throw new Error("Export failed");
    await triggerBlobDownload(res, `credentials.${format === "excel" ? "xlsx" : format}`);
  },

  downloadErrorReport: async (uploadId: number): Promise<void> => {
    const headers = await getHeaders();
    const res = await fetch(
      `${PARENTS_BASE}/bulk-upload/${uploadId}/errors/`,
      { headers, credentials: "include" }
    );
    if (!res.ok) throw new Error("Download failed");
    await triggerBlobDownload(res, "upload_errors.csv");
  },

  downloadTemplate: async (format: TemplateFormat = "excel"): Promise<void> => {
    const headers = await getHeaders();
    const res = await fetch(
      `${PARENTS_BASE}/bulk-upload/template/?format=${format}`,
      { headers, credentials: "include" }
    );
    if (!res.ok) throw new Error(`Template download failed: ${res.status}`);
    const ext = format === "excel" ? "xlsx" : "csv";
    await triggerBlobDownload(res, `parent_upload_template.${ext}`);
  },
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function triggerBlobDownload(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  // Use filename from Content-Disposition if available
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/);
  a.download = match?.[1] ?? fallbackName;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}