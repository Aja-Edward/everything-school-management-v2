// types/parentBulkUpload.ts

export type UploadPhase = "idle" | "uploading" | "processing" | "done" | "error";
export type UploadStatus = "pending" | "processing" | "completed" | "failed";
export type ExportFormat = "csv" | "excel" | "pdf";
export type TemplateFormat = "csv" | "excel";

export interface UploadStats {
  total: number;
  processed: number;
  imported: number;
  failed: number;
}

export interface ImportedParent {
  row: number;
  parent_id: number;
  full_name: string;
  phone: string;
  role: string;
  username: string;
  password: string;
  email: string;
}

// ← parent-specific shape (matches backend error report)
export interface UploadRowError {
  row: number;
  data: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    relationship?: string;
  };
  errors: string[];
}

export interface UploadSummary {
  total: number;
  imported: number;
  skipped: number;
}

export interface UploadResult {
  summary: UploadSummary;
  imported: ImportedParent[];
  errors: UploadRowError[];
  error?: string;
}

export interface BulkUploadInitResponse {
  upload_id: number;
  task_id: string;
  status: "pending";
  message: string;
}

export interface BulkUploadStatusResponse {
  upload_id: number;
  status: UploadStatus;
  progress: number;
  total_rows: number;
  processed_rows: number;
  imported_rows: number;
  failed_rows: number;
  created_at: string;
  original_filename: string;
  result?: UploadResult;
}

export interface ExportCredentialsRequest {
  format: ExportFormat;
}

export interface UseParentBulkUploadReturn {
  uploadId: number | null;
  phase: UploadPhase;
  progress: number;
  stats: UploadStats | null;
  result: UploadResult | null;
  errorMessage: string | null;
  uploadFile: (file: File) => Promise<void>;
  exportCredentials: (format?: ExportFormat) => Promise<void>;
  downloadErrorReport: () => Promise<void>;
  reset: () => void;
}