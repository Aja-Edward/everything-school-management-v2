import { API_BASE_URL } from "@/services/api";
import type {
  BulkUploadInitResponse,
  BulkUploadStatusResponse,
  ExportFormat,
  TemplateFormat,
} from "@/types/teacherBulkUpload";

const TEACHERS_BASE = `${API_BASE_URL}/teachers`;

// Tenant slug is non-sensitive routing metadata — kept in localStorage.
// Auth is handled automatically via the httpOnly cookie + credentials: "include".
const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};

  const tenantSlug = localStorage.getItem("tenantSlug");
  if (tenantSlug) headers["X-Tenant-Slug"] = tenantSlug;

  return headers;
};

export const teacherBulkUploadService = {
  uploadFile: async (file: File): Promise<BulkUploadInitResponse> => {
    const form = new FormData();
    form.append("file", file);

    // Don't set Content-Type — browser sets it with boundary for multipart
    const res = await fetch(`${TEACHERS_BASE}/bulk-upload/`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  getStatus: async (uploadId: number): Promise<BulkUploadStatusResponse> => {
    const res = await fetch(`${TEACHERS_BASE}/bulk-upload/${uploadId}/status/`, {
      headers: getHeaders(),
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
      `${TEACHERS_BASE}/bulk-upload/${uploadId}/export-credentials/`,
      {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format }),
      }
    );
    if (!res.ok) throw new Error("Export failed");
    await triggerBlobDownload(res, `credentials.${format === "excel" ? "xlsx" : format}`);
  },

  downloadErrorReport: async (uploadId: number): Promise<void> => {
    const res = await fetch(
      `${TEACHERS_BASE}/bulk-upload/${uploadId}/error-report/`,
      { headers: getHeaders(), credentials: "include" }
    );
    if (!res.ok) throw new Error("Download failed");
    await triggerBlobDownload(res, "upload_errors.csv");
  },

  downloadTemplate: async (format: TemplateFormat = "excel"): Promise<void> => {
    const res = await fetch(
      `${TEACHERS_BASE}/bulk-upload/template/?format=${format}`,
      { headers: getHeaders(), credentials: "include" }
    );
    if (!res.ok) throw new Error(`Template download failed: ${res.status}`);
    const ext = format === "excel" ? "xlsx" : "csv";
    await triggerBlobDownload(res, `teacher_upload_template.${ext}`);
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