// hooks/useParentBulkUpload.ts

import { useState, useRef, useCallback } from "react";
import { bulkUploadService } from "@/services/ParentBulkUploadService";
import type {
  UploadPhase,
  UploadStats,
  UploadResult,
  ExportFormat,
  UseParentBulkUploadReturn,
} from "@/types/parentBulkUpload";

const POLL_INTERVAL_MS = 2000;

export function useParentBulkUpload(): UseParentBulkUploadReturn {
  const [uploadId,     setUploadId]     = useState<number | null>(null);
  const [phase,        setPhase]        = useState<UploadPhase>("idle");
  const [progress,     setProgress]     = useState<number>(0);
  const [stats,        setStats]        = useState<UploadStats | null>(null);
  const [result,       setResult]       = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = useCallback((id: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await bulkUploadService.getStatus(id);

        setProgress(status.progress ?? 0);
        setStats({
          total:     status.total_rows,
          processed: status.processed_rows,
          imported:  status.imported_rows,
          failed:    status.failed_rows,
        });

        if (status.status === "completed") {
          stopPolling();
          const res = status.result!;
          setResult({
            summary: {
              total:    status.total_rows,
              imported: status.imported_rows,
              skipped:  status.failed_rows,
            },
            imported: res.imported ?? [],
            errors:   res.errors   ?? [],
          });
          setPhase("done");
        } else if (status.status === "failed") {
          stopPolling();
          setErrorMessage(
            status.result?.error ?? "Processing failed. Please try again."
          );
          setPhase("error");
        } else {
          setPhase("processing");
        }
      } catch {
        stopPolling();
        setErrorMessage("Lost connection while checking progress.");
        setPhase("error");
      }
    }, POLL_INTERVAL_MS);
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<void> => {
    try {
      setPhase("uploading");
      setErrorMessage(null);
      setProgress(0);
      setStats(null);
      setResult(null);

      const init = await bulkUploadService.uploadFile(file);
      setUploadId(init.upload_id);
      setPhase("processing");
      startPolling(init.upload_id);
    } catch (err: unknown) {
      const msg =
        (err as { error?: string })?.error ??
        "Upload failed. Check the file and try again.";
      setErrorMessage(msg);
      setPhase("error");
    }
  }, [startPolling]);

  const exportCredentials = useCallback(
    async (format: ExportFormat = "excel"): Promise<void> => {
      if (!uploadId) return;
      await bulkUploadService.exportCredentials(uploadId, format);
    },
    [uploadId]
  );

  const downloadErrorReport = useCallback(async (): Promise<void> => {
    if (!uploadId) return;
    await bulkUploadService.downloadErrorReport(uploadId);
  }, [uploadId]);

  const reset = useCallback((): void => {
    stopPolling();
    setUploadId(null);
    setPhase("idle");
    setProgress(0);
    setStats(null);
    setResult(null);
    setErrorMessage(null);
  }, []);

  return {
    uploadId,
    phase,
    progress,
    stats,
    result,
    errorMessage,
    uploadFile,
    exportCredentials,
    downloadErrorReport,
    reset,
  };
}