// types/teacherBulkUpload.ts

// ---------------------------------------------------------------------------
// Phase / Status
// ---------------------------------------------------------------------------

/** Frontend lifecycle phase */
export type UploadPhase = "idle" | "uploading" | "processing" | "done" | "error";

/** Backend processing status */
export type UploadStatus = "pending" | "processing" | "completed" | "failed";

/** Export format options */
export type ExportFormat = "csv" | "excel" | "pdf";

/** Template download format */
export type TemplateFormat = "csv" | "excel";

// ---------------------------------------------------------------------------
// Upload stats (live progress)
// ---------------------------------------------------------------------------

export interface UploadStats {
  total: number;
  processed: number;
  imported: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Individual row results
// ---------------------------------------------------------------------------

/** A successfully imported teacher entry */
export interface ImportedTeacher {
  row: number;
  teacher_id: number;
  full_name: string;
  username: string;
  password: string;
  employee_id: string;
}

/** A failed row with its validation errors */
export interface UploadRowError {
  row: number;
  data: {
    first_name?: string;
    last_name?: string;
    employee_id?: string;
    staff_type?: string;
    level?: string;
  };
  errors: string[];
}

// ---------------------------------------------------------------------------
// Upload result (returned when status === completed/failed)
// ---------------------------------------------------------------------------

export interface UploadSummary {
  total: number;
  imported: number;
  skipped: number;
}

export interface UploadResult {
  summary: UploadSummary;
  imported: ImportedTeacher[];
  errors: UploadRowError[];
  error?: string; // present only when status === 'failed'
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

/** POST /teachers/bulk-upload/ → response */
export interface BulkUploadInitResponse {
  upload_id: number;
  task_id: string;
  status: "pending";
  message: string;
}

/** GET /teachers/bulk-upload/<id>/status/ → response */
export interface BulkUploadStatusResponse {
  upload_id: number;
  status: UploadStatus;
  progress: number; // 0-100
  total_rows: number;
  processed_rows: number;
  imported_rows: number;
  failed_rows: number;
  created_at: string; // ISO datetime
  original_filename: string;
  result?: UploadResult; // only present when completed or failed
}

/** POST /teachers/bulk-upload/<id>/export-credentials/ → body */
export interface ExportCredentialsRequest {
  format: ExportFormat;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseTeacherBulkUploadReturn {
  // State
  uploadId: number | null;
  phase: UploadPhase;
  progress: number;
  stats: UploadStats | null;
  result: UploadResult | null;
  errorMessage: string | null;

  // Actions
  uploadFile: (file: File) => Promise<void>;
  exportCredentials: (format?: ExportFormat) => Promise<void>;
  downloadErrorReport: () => Promise<void>;
  downloadTemplate: (format?: TemplateFormat) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Service layer
// ---------------------------------------------------------------------------

export interface TeacherBulkUploadService {
  uploadFile: (file: File) => Promise<BulkUploadInitResponse>;

  getStatus: (uploadId: number) => Promise<BulkUploadStatusResponse>;

  exportCredentials: (uploadId: number, format?: ExportFormat) => Promise<Blob>;

  downloadErrorReport: (uploadId: number) => Promise<Blob>;

  downloadTemplate: (format?: TemplateFormat) => void;
}
