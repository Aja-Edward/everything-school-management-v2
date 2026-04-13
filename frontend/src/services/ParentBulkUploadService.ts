import { API_BASE_URL } from "@/services/api";
import type {
  BulkUploadInitResponse,
  BulkUploadStatusResponse,
  ExportFormat,
  TemplateFormat,
} from "@/types/parentBulkUpload";

const PARENTS_BASE = `${API_BASE_URL}/parents`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base headers shared by every request. Auth flows via httpOnly cookies. */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const tenantSlug = localStorage.getItem("tenantSlug");
  if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;
  return headers;
}

/** Trigger a file download from a fetch Response. */
async function triggerBlobDownload(res: Response, fallbackName: string): Promise<void> {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/);
  a.download = match?.[1] ?? fallbackName;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const bulkUploadService = {
  uploadFile: async (
    file: File,
    sessionId?: number | null
  ): Promise<BulkUploadInitResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (sessionId) form.append("academic_session", String(sessionId));

    // Don't set Content-Type — browser sets it with boundary for multipart
    const res = await fetch(`${PARENTS_BASE}/bulk-upload/`, {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: form,
    });

    if (!res.ok) throw await res.json();
    return res.json();
  },

  getStatus: async (uploadId: number): Promise<BulkUploadStatusResponse> => {
    const res = await fetch(`${PARENTS_BASE}/bulk-upload/${uploadId}/status/`, {
      headers: buildHeaders(),
      credentials: "include",
    });

    if (!res.ok) throw await res.json();
    return res.json();
  },

  exportCredentials: async (
    uploadId: number,
    format: ExportFormat = "excel"
  ): Promise<void> => {
    const res = await fetch(
      `${PARENTS_BASE}/bulk-upload/${uploadId}/export-credentials/`,
      {
        method: "POST",
        headers: { ...buildHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format }),
      }
    );

    if (!res.ok) throw new Error("Export failed");
    await triggerBlobDownload(res, `credentials.${format === "excel" ? "xlsx" : format}`);
  },

  downloadErrorReport: async (uploadId: number): Promise<void> => {
    const res = await fetch(`${PARENTS_BASE}/bulk-upload/${uploadId}/errors/`, {
      headers: buildHeaders(),
      credentials: "include",
    });

    if (!res.ok) throw new Error("Download failed");
    await triggerBlobDownload(res, "upload_errors.csv");
  },

  downloadTemplate: async (format: TemplateFormat = "excel"): Promise<void> => {
    const res = await fetch(
      `${PARENTS_BASE}/bulk-upload/template/?format=${format}`,
      {
        headers: buildHeaders(),
        credentials: "include",
      }
    );

    if (!res.ok) throw new Error(`Template download failed: HTTP ${res.status}`);
    await triggerBlobDownload(res, `parent_upload_template.${format === "excel" ? "xlsx" : "csv"}`);
  },
};