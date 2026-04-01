// types/bulkUpload.ts

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

/** A successfully imported student entry */
export interface ImportedStudent {
  row: number;
  student_id: number;
  full_name: string;
  username: string;
  password: string;
  registration_number: string | null;
  classroom: string;
  parent_name: string;
  parent_phone: string;
}

/** A failed row with its validation errors */
export interface UploadRowError {
  row: number;
  data: {
    first_name?: string;
    last_name?: string;
    registration_number?: string;
    class_code?: string;
    section_name?: string;
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
  imported: ImportedStudent[];
  errors: UploadRowError[];
  error?: string; // present only when status === 'failed'
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

/** POST /students/bulk-upload/ → response */
export interface BulkUploadInitResponse {
  upload_id: number;
  task_id: string;
  status: "pending";
  message: string;
}

/** GET /students/bulk-upload/<id>/status/ → response */
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

/** POST /students/bulk-upload/<id>/export-credentials/ → body */
export interface ExportCredentialsRequest {
  format: ExportFormat;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseBulkUploadReturn {
  // State
  uploadId: number | null;
  phase: UploadPhase;
  progress: number;
  stats: UploadStats | null;
  result: UploadResult | null;
  errorMessage: string | null;

  // Actions
  uploadFile: (file: File, sessionId?: number | null) => Promise<void>;
  exportCredentials: (format?: ExportFormat) => Promise<void>;
  downloadErrorReport: () => Promise<void>;
  downloadTemplate: (format?: TemplateFormat) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Service layer
// ---------------------------------------------------------------------------

export interface BulkUploadService {
  uploadFile: (
    file: File,
    sessionId?: number | null
  ) => Promise<BulkUploadInitResponse>;

  getStatus: (uploadId: number) => Promise<BulkUploadStatusResponse>;

  exportCredentials: (uploadId: number, format?: ExportFormat) => Promise<Blob>;

  downloadErrorReport: (uploadId: number) => Promise<Blob>;

  downloadTemplate: (format?: TemplateFormat) => void;
}