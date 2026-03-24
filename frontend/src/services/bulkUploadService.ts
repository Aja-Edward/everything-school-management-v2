// services/bulkUploadService.ts

import { API_BASE_URL } from "@/services/api";
import type {
  BulkUploadInitResponse,
  BulkUploadStatusResponse,
  ExportFormat,
  TemplateFormat,
} from "@/types/bulkUpload";

const getToken = (): string => localStorage.getItem("access_token") ?? "";

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${getToken()}`,
});

export const bulkUploadService = {
  uploadFile: async (
    file: File,
    sessionId?: number | null
  ): Promise<BulkUploadInitResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (sessionId) form.append("academic_session", String(sessionId));

    const res = await fetch(`${API_BASE_URL}/students/bulk-upload/`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  getStatus: async (uploadId: number): Promise<BulkUploadStatusResponse> => {
    const res = await fetch(
      `${API_BASE_URL}/students/bulk-upload/${uploadId}/status/`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error("Status fetch failed");
    return res.json();
  },

  exportCredentials: async (
    uploadId: number,
    format: ExportFormat = "excel"
  ): Promise<Blob> => {
    const res = await fetch(
      `${API_BASE_URL}/students/bulk-upload/${uploadId}/export-credentials/`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      }
    );
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
  },

  downloadErrorReport: async (uploadId: number): Promise<Blob> => {
    const res = await fetch(
      `${API_BASE_URL}/students/bulk-upload/${uploadId}/error-report/`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error("Download failed");
    return res.blob();
  },

  downloadTemplate: (format: TemplateFormat = "excel"): void => {
    window.open(
      `${API_BASE_URL}/students/bulk-upload/template/?format=${format}`,
      "_blank"
    );
  },
};