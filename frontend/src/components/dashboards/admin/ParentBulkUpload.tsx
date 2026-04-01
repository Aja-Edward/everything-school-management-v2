// pages/ParentBulkUploadPage.tsx

import { useState, useRef, useCallback } from "react";
import { useParentBulkUpload } from "@/hooks/useParentBulkUpload";
import UploadProgressModal from "@/components/dashboards/admin/UploadProgressModal";
import CredentialExportPanel from "@/components/dashboards/admin/CredentialExportPanel";
import type { UploadRowError, ExportFormat } from "@/types/parentBulkUpload";
import { bulkUploadService } from "@/services/ParentBulkUploadService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const IconUpload = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);

const IconFile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconWarning = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// ---------------------------------------------------------------------------
// SummaryCard
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  label:   string;
  value:   number;
  style?:  string; // Tailwind color classes for value text
  bg?:     string; // Tailwind bg class
  iconEl?: React.ReactNode;
}

function SummaryCard({ label, value, style = "text-gray-900", bg = "bg-gray-50", iconEl }: SummaryCardProps) {
  return (
    <div className={`${bg} border border-gray-200 rounded-xl p-5`}>
      <p className="text-xs uppercase tracking-wide text-gray-500 m-0">{label}</p>
      <div className="flex items-center gap-2 mt-1.5">
        {iconEl && <span className={style}>{iconEl}</span>}
        <span className={`text-3xl font-medium ${style}`}>{value}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ParentBulkUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver,     setDragOver]     = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    phase, progress, stats, result, errorMessage,
    uploadFile, exportCredentials, downloadErrorReport, reset,
  } = useParentBulkUpload();

  // ---- File selection ----
  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      alert("Please upload a .csv, .xlsx, or .xls file.");
      return;
    }
    setSelectedFile(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0] ?? null);
  }, [handleFileSelect]);

  // ---- Upload ----
  const handleUpload = () => {
    if (!selectedFile) return;
    setShowProgress(true);
    uploadFile(selectedFile);
  };

  // ---- Reset ----
  const handleReset = () => {
    reset();
    setSelectedFile(null);
    setShowProgress(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isDone      = phase === "done";
  const hasErrors   = (result?.errors?.length ?? 0) > 0;
  const hasImported = (result?.imported?.length ?? 0) > 0;
  const isWorking   = phase === "uploading" || phase === "processing";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 text-gray-900">

      {/* ── Page header ── */}
      <div className="mb-7">
        <h1 className="text-2xl font-medium m-0">Bulk Parent Upload</h1>
        <p className="text-sm text-gray-500 mt-1.5">
          Upload a CSV or Excel file to register multiple parents at once.{" "}
          Upload parents <strong>before</strong> uploading students — phone numbers
          are used to auto-link parents to their children.
        </p>
      </div>

      {/* ── Template strip ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5 mb-6">
        <div>
          <p className="text-sm font-medium text-blue-700 m-0">
            Download the upload template first
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Fill in parent data exactly as shown. Required columns are marked with *.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => bulkUploadService.downloadTemplate("excel")}
            className="inline-flex items-center gap-1.5 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <IconDownload /> Excel template
          </button>
          <button
            onClick={() => bulkUploadService.downloadTemplate("csv")}
            className="inline-flex items-center gap-1.5 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <IconDownload /> CSV template
          </button>
        </div>
      </div>

      {/* ── Upload form (hidden once done) ── */}
      {!isDone && (
        <>
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl px-6 py-10 text-center mb-5 transition-all
              ${dragOver
                ? "border-blue-400 bg-blue-50 cursor-copy"
                : selectedFile
                  ? "border-gray-200 bg-gray-50 cursor-default"
                  : "border-gray-300 bg-gray-50 cursor-pointer hover:border-blue-300 hover:bg-blue-50"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />

            {!selectedFile ? (
              <>
                <div className="text-gray-400 mb-2.5 flex justify-center">
                  <IconUpload />
                </div>
                <p className="font-medium m-0">Drag & drop your file here, or click to browse</p>
                <p className="text-sm text-gray-500 mt-1.5">Supported formats: .csv, .xlsx, .xls</p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <span className="text-blue-500"><IconFile /></span>
                <div className="text-left">
                  <p className="font-medium m-0">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{formatBytes(selectedFile.size)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="ml-3 text-sm text-red-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-red-50 cursor-pointer transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isWorking}
            className="bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm cursor-pointer
                       hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {phase === "uploading"
              ? "Uploading…"
              : phase === "processing"
                ? "Processing…"
                : "Upload & Process"}
          </button>
        </>
      )}

      {/* ── Progress modal ── */}
      {showProgress && isWorking && (
        <UploadProgressModal
          phase={phase}
          progress={progress}
          stats={stats}
          filename={selectedFile?.name}
        />
      )}

      {/* ── Error state ── */}
      {phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mt-6">
          <p className="font-medium text-red-600 m-0">Upload failed</p>
          <p className="text-sm text-gray-500 mt-1.5 mb-3">{errorMessage}</p>
          <button
            onClick={handleReset}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Results ── */}
      {isDone && result && (
        <div className="mt-6 space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3.5">
            <SummaryCard
              label="Total rows"
              value={result.summary?.total ?? 0}
            />
            <SummaryCard
              label="Imported"
              value={result.summary?.imported ?? 0}
              style="text-green-700"
              bg="bg-green-50"
              iconEl={<IconCheck />}
            />
            <SummaryCard
              label="Skipped (errors)"
              value={result.summary?.skipped ?? 0}
              style="text-amber-700"
              bg="bg-amber-50"
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
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-medium m-0">
                  Rows with errors ({result.errors.length})
                </h2>
                <button
                  onClick={downloadErrorReport}
                  className="inline-flex items-center gap-1.5 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <IconDownload /> Download error report
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {["Row", "Name", "Phone", "Role", "Error(s)"].map((h) => (
                        <th
                          key={h}
                          className="px-3.5 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((err: UploadRowError, i: number) => (
                      <tr
                        key={i}
                        className={`border-t border-gray-200 ${i % 2 !== 0 ? "bg-gray-50" : ""}`}
                      >
                        <td className="px-3.5 py-2.5 align-top">{err.row}</td>
                        <td className="px-3.5 py-2.5 align-top">
                          {err.data?.first_name} {err.data?.last_name}
                        </td>
                        <td className="px-3.5 py-2.5 align-top">{err.data?.phone        ?? "—"}</td>
                        <td className="px-3.5 py-2.5 align-top">{err.data?.relationship ?? "—"}</td>
                        <td className="px-3.5 py-2.5 align-top text-red-600 max-w-sm">
                          {err.errors.join(" | ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Upload another file
          </button>
        </div>
      )}
    </div>
  );
}