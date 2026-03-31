// pages/BulkUploadPage.tsx

import { useState, useRef, useCallback, CSSProperties } from "react";
import { useBulkUpload } from "@/hooks/useBulkUpload";
import UploadProgressModal from "@/components/dashboards/admin/UploadProgressModal";
import CredentialExportPanel from "@/components/dashboards/admin/CredentialExportPanel";
import { API_BASE_URL } from "@/services/api";
import type { UploadRowError, ExportFormat, TemplateFormat } from "@/types/bulkUpload";
import { bulkUploadService } from "@/services/bulkUploadService";


// ---------------------------------------------------------------------------
// Template download
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const IconUpload = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);

const IconFile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconWarning = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  label:   string;
  value:   number;
  color?:  string;
  bg?:     string;
  iconEl?: React.ReactNode;
}

function SummaryCard({
  label,
  value,
  color = "var(--color-text-primary)",
  bg    = "var(--color-background-secondary)",
  iconEl,
}: SummaryCardProps) {
  return (
    <div style={{
      background:   bg,
      border:       "1px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding:      "18px 20px",
    }}>
      <p style={{
        margin:        0,
        fontSize:      12,
        color:         "var(--color-text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        {iconEl && <span style={{ color }}>{iconEl}</span>}
        <span style={{ fontSize: 28, fontWeight: 500, color }}>{value}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BulkUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver]         = useState<boolean>(false);
  const [sessionId, setSessionId]       = useState<string>("");
  const [showProgress, setShowProgress] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    phase, progress, stats, result, errorMessage,
    uploadFile, exportCredentials, downloadErrorReport, reset,
  } = useBulkUpload();

  // ---- File selection ----
  const handleFileSelect = useCallback((file: File | null): void => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      alert("Please upload a .csv, .xlsx, or .xls file.");
      return;
    }
    setSelectedFile(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0] ?? null;
    handleFileSelect(file);
  }, [handleFileSelect]);

  // ---- Upload ----
  const handleUpload = (): void => {
    if (!selectedFile) return;
    setShowProgress(true);
    uploadFile(selectedFile, sessionId ? Number(sessionId) : null);
  };

  // ---- Reset ----
  const handleReset = (): void => {
    reset();
    setSelectedFile(null);
    setShowProgress(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isDone      = phase === "done";
  const hasErrors   = (result?.errors?.length ?? 0) > 0;
  const hasImported = (result?.imported?.length ?? 0) > 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px", color: "var(--color-text-primary)" }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>Bulk Student Upload</h1>
        <p style={{ color: "var(--color-text-secondary)", marginTop: 6, fontSize: 14 }}>
          Upload a CSV or Excel file to register multiple students at once.
          Parents must already have accounts before uploading.
        </p>
      </div>

      {/* Template download strip */}
      <div style={{
        background:    "var(--color-background-info)",
        border:        "1px solid var(--color-border-info)",
        borderRadius:  "var(--border-radius-lg)",
        padding:       "14px 18px",
        marginBottom:  24,
        display:       "flex",
        alignItems:    "center",
        justifyContent:"space-between",
        flexWrap:      "wrap",
        gap:           12,
      }}>
        <div>
          <p style={{ margin: 0, fontWeight: 500, color: "var(--color-text-info)", fontSize: 14 }}>
            Download the upload template first
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
            Fill in student data exactly as shown. Required columns are marked with *.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => bulkUploadService.downloadTemplate("excel")} style={btnOutlineStyle}>
            <IconDownload /> Excel template
          </button>
          <button onClick={() => bulkUploadService.downloadTemplate("csv")} style={btnOutlineStyle}>
            <IconDownload /> CSV template
          </button>
        </div>
      </div>

      {/* Upload form */}
      {!isDone && (
        <>
          {/* Academic session */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Academic session (optional)</label>
            <input
              type="number"
              placeholder="Enter Academic Session ID"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={inputStyle}
            />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
              Used to match sections. Leave blank to use the most recent active session.
            </p>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            style={{
              border:       `2px dashed ${dragOver ? "var(--color-border-info)" : "var(--color-border-secondary)"}`,
              borderRadius: "var(--border-radius-lg)",
              padding:      "40px 24px",
              textAlign:    "center",
              cursor:       selectedFile ? "default" : "pointer",
              background:   dragOver ? "var(--color-background-info)" : "var(--color-background-secondary)",
              transition:   "all 0.15s",
              marginBottom: 20,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />

            {!selectedFile ? (
              <>
                <div style={{ color: "var(--color-text-secondary)", marginBottom: 10 }}>
                  <IconUpload />
                </div>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  Drag & drop your file here, or click to browse
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
                  Supported formats: .csv, .xlsx, .xls
                </p>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ color: "var(--color-text-info)" }}><IconFile /></div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>{selectedFile.name}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
                    {formatBytes(selectedFile.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  style={{ ...btnOutlineStyle, marginLeft: 12, color: "var(--color-text-danger)" }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Upload button */}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || phase === "uploading" || phase === "processing"}
              style={{ ...btnPrimaryStyle, opacity: !selectedFile ? 0.5 : 1, color: (phase === "uploading" || phase === "processing") ? "var(--color-text-secondary)" : btnPrimaryStyle.color }}

            >
              {phase === "uploading"
                ? "Uploading…"
                : phase === "processing"
                  ? "Processing…"
                  : "Upload & Process"}
            </button>
          </div>
        </>
      )}

      {/* Progress */}
      {showProgress && (phase === "uploading" || phase === "processing") && (
        <UploadProgressModal
          phase={phase}
          progress={progress}
          stats={stats}
          filename={selectedFile?.name}
        />
      )}

      {/* Error state */}
      {phase === "error" && (
        <div style={{
          background:   "var(--color-background-danger)",
          border:       "1px solid var(--color-border-danger)",
          borderRadius: "var(--border-radius-lg)",
          padding:      "16px 20px",
          marginTop:    24,
        }}>
          <p style={{ margin: 0, fontWeight: 500, color: "var(--color-text-danger)" }}>
            Upload failed
          </p>
          <p style={{ margin: "6px 0 12px", fontSize: 14, color: "var(--color-text-secondary)" }}>
            {errorMessage}
          </p>
          <button onClick={handleReset} style={btnOutlineStyle}>Try again</button>
        </div>
      )}

      {/* Results */}
      {isDone && result && (
        <div style={{ marginTop: 24 }}>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            <SummaryCard
              label="Total rows"
              value={result.summary?.total ?? 0}
            />
            <SummaryCard
              label="Imported"
              value={result.summary?.imported ?? 0}
              color="#15803d"
              bg="#f0fdf4"
              iconEl={<IconCheck />}
            />
            <SummaryCard
              label="Skipped (errors)"
              value={result.summary?.skipped ?? 0}
              color="#b45309"
              bg="#fffbeb"
              iconEl={hasErrors ? <IconWarning /> : undefined}
            />
          </div>

          {/* Credential export */}
          {hasImported && (
            <CredentialExportPanel
              onExport={(fmt: ExportFormat) => exportCredentials(fmt)}
              importedCount={result.summary?.imported ?? 0}
            />
          )}

          {/* Error table */}
          {hasErrors && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
                  Rows with errors ({result.errors.length})
                </h2>
                <button onClick={downloadErrorReport} style={btnOutlineStyle}>
                  <IconDownload /> Download error report
                </button>
              </div>

              <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--color-background-secondary)" }}>
                      {["Row", "Name", "Class", "Section", "Error(s)"].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((err: UploadRowError, i: number) => (
                      <tr
                        key={i}
                        style={{
                          borderTop:  "1px solid var(--color-border-tertiary)",
                          background: i % 2 === 0 ? "transparent" : "var(--color-background-secondary)",
                        }}
                      >
                        <td style={tdStyle}>{err.row}</td>
                        <td style={tdStyle}>{err.data?.first_name} {err.data?.last_name}</td>
                        <td style={tdStyle}>{err.data?.class_code  ?? "—"}</td>
                        <td style={tdStyle}>{err.data?.section_name ?? "—"}</td>
                        <td style={{ ...tdStyle, color: "var(--color-text-danger)", maxWidth: 360 }}>
                          {err.errors.join(" | ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button onClick={handleReset} style={{ ...btnOutlineStyle, marginTop: 24 }}>
            Upload another file
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const btnPrimaryStyle: CSSProperties = {
  background:  "var(--color-text-primary)",
  color:       "var(--color-background-primary)",
  border:      "none",
  borderRadius:"var(--border-radius-md)",
  padding:     "10px 20px",
  fontSize:    14,
  fontWeight:  500,
  cursor:      "pointer",
  display:     "flex",
  alignItems:  "center",
  gap:         6,
};

const btnOutlineStyle: CSSProperties = {
  background:   "transparent",
  color:        "var(--color-text-primary)",
  border:       "1px solid var(--color-border-secondary)",
  borderRadius: "var(--border-radius-md)",
  padding:      "8px 14px",
  fontSize:     13,
  cursor:       "pointer",
  display:      "inline-flex",
  alignItems:   "center",
  gap:          6,
};

const labelStyle: CSSProperties = {
  display:    "block",
  fontSize:   13,
  fontWeight: 500,
  marginBottom: 6,
  color:      "var(--color-text-primary)",
};

const inputStyle: CSSProperties = {
  width:        "100%",
  maxWidth:     320,
  padding:      "8px 12px",
  border:       "1px solid var(--color-border-secondary)",
  borderRadius: "var(--border-radius-md)",
  fontSize:     14,
  background:   "var(--color-background-primary)",
  color:        "var(--color-text-primary)",
  boxSizing:    "border-box",
};

const thStyle: CSSProperties = {
  padding:    "10px 14px",
  textAlign:  "left",
  fontWeight: 500,
  fontSize:   12,
  color:      "var(--color-text-secondary)",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding:       "10px 14px",
  verticalAlign: "top",
};