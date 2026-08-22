// hooks/useTeacherBulkUpload.ts

import { useState, useRef, useCallback } from "react";
import { teacherBulkUploadService } from "@/services/teacherBulkUploadService";
import type {
  UploadPhase,
  UploadStats,
  UploadResult,
  ExportFormat,
  UseTeacherBulkUploadReturn,
} from "@/types/teacherBulkUpload";

const POLL_INTERVAL = 2_000;
/** Stop polling once the backend has reported no progress for this long. */
const STALL_TIMEOUT_MS = 5 * 60 * 1_000;

export function useTeacherBulkUpload(): UseTeacherBulkUploadReturn {
  const [uploadId, setUploadId]         = useState<number | null>(null);
  const [phase, setPhase]               = useState<UploadPhase>("idle");
  const [progress, setProgress]         = useState<number>(0);
  const [stats, setStats]               = useState<UploadStats | null>(null);
  const [result, setResult]             = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback((): void => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (id: number): void => {
      stopPolling();

      // Track when the backend last reported something new, so a job that
      // never gets picked up ends in an error instead of polling forever.
      let lastSnapshot = "";
      let lastChangeAt = Date.now();

      pollTimer.current = setInterval(async () => {
        try {
          const data = await teacherBulkUploadService.getStatus(id);

          const snapshot = `${data.status}:${data.total_rows}:${data.processed_rows}`;
          if (snapshot !== lastSnapshot) {
            lastSnapshot = snapshot;
            lastChangeAt = Date.now();
          }

          setProgress(data.progress ?? 0);
          setStats({
            total:     data.total_rows,
            processed: data.processed_rows,
            imported:  data.imported_rows,
            failed:    data.failed_rows,
          });

          if (data.status === "completed" || data.status === "failed") {
            stopPolling();
            setPhase(data.status === "completed" ? "done" : "error");
            if (data.result) setResult(data.result);
            if (data.status === "failed") {
              setErrorMessage(data.result?.error ?? "Upload processing failed.");
            }
          } else if (Date.now() - lastChangeAt > STALL_TIMEOUT_MS) {
            stopPolling();
            setErrorMessage(
              "Processing has not moved for 5 minutes. The background worker " +
              "may be down — please try the upload again."
            );
            setPhase("error");
          }
        } catch (err) {
          console.warn("Poll error:", err);
          // Keep retrying through a blip, but don't poll a dead endpoint forever.
          if (Date.now() - lastChangeAt > STALL_TIMEOUT_MS) {
            stopPolling();
            setErrorMessage(
              "Lost contact with the server while checking progress. " +
              "Please try the upload again."
            );
            setPhase("error");
          }
        }
      }, POLL_INTERVAL);
    },
    [stopPolling]
  );

  const uploadFile = useCallback(
    async (file: File): Promise<void> => {
      setPhase("uploading");
      setErrorMessage(null);
      setResult(null);
      setProgress(0);
      setStats(null);

      try {
        const data = await teacherBulkUploadService.uploadFile(file);
        setUploadId(data.upload_id);
        setPhase("processing");
        startPolling(data.upload_id);
      } catch (err) {
        setPhase("error");
        setErrorMessage(
          (err as Record<string, string>)?.error ?? "Upload failed."
        );
      }
    },
    [startPolling]
  );

  const exportCredentials = useCallback(
    async (format: ExportFormat = "excel"): Promise<void> => {
      if (!uploadId) return;
      try {
        await teacherBulkUploadService.exportCredentials(uploadId, format);
      } catch {
        alert("Export failed. Please try again.");
      }
    },
    [uploadId]
  );

  const downloadErrorReport = useCallback(async (): Promise<void> => {
    if (!uploadId) return;
    try {
      await teacherBulkUploadService.downloadErrorReport(uploadId);
    } catch {
      alert("Could not download error report.");
    }
  }, [uploadId]);

  const reset = useCallback((): void => {
    stopPolling();
    setUploadId(null);
    setPhase("idle");
    setProgress(0);
    setStats(null);
    setResult(null);
    setErrorMessage(null);
  }, [stopPolling]);

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
    downloadTemplate: teacherBulkUploadService.downloadTemplate,
    reset,
  };
}
