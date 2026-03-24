// components/students/UploadProgressModal.tsx

import type { UploadPhase, UploadStats } from "@/types/bulkUpload";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadProgressModalProps {
  phase:    UploadPhase;
  progress: number;
  stats:    UploadStats | null;
  filename?: string;
}

interface StatChipProps {
  label: string;
  value: number | undefined;
  color?: string;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function UploadProgressModal({
  phase,
  progress,
  stats,
  filename,
}: UploadProgressModalProps) {
  const isUploading = phase === "uploading";
  const label       = isUploading ? "Uploading file…" : "Processing students…";
  const subLabel    = isUploading
    ? `Sending ${filename ?? "file"} to server`
    : stats
      ? `${stats.processed} / ${stats.total} rows processed — ${stats.imported} imported, ${stats.failed} skipped`
      : "Validating and creating student accounts…";

  return (
    <div style={{
      background:   "var(--color-background-secondary)",
      border:       "1px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding:      "24px 28px",
      marginTop:    24,
    }}>
      {/* Spinner + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <Spinner />
        <div>
          <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{label}</p>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
            {subLabel}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        background:   "var(--color-border-tertiary)",
        borderRadius: 99,
        height:       8,
        overflow:     "hidden",
        marginBottom: 10,
      }}>
        <div style={{
          width:        `${isUploading ? 30 : progress}%`,
          height:       "100%",
          background:   "var(--color-text-primary)",
          borderRadius: 99,
          transition:   "width 0.4s ease",
          minWidth:     "4%",
        }} />
      </div>

      {/* Stats row */}
      {!isUploading && stats && (
        <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
          <StatChip label="Total"     value={stats.total}     />
          <StatChip label="Processed" value={stats.processed} />
          <StatChip label="Imported"  value={stats.imported}  color="#15803d" />
          <StatChip
            label="Errors"
            value={stats.failed}
            color={stats.failed > 0 ? "#b45309" : undefined}
          />
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color }: StatChipProps) {
  return (
    <div>
      <span style={{
        fontSize:      11,
        color:         "var(--color-text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}>
        {label}
      </span>
      <p style={{
        margin:     "2px 0 0",
        fontWeight: 500,
        fontSize:   18,
        color:      color ?? "var(--color-text-primary)",
      }}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width:        28,
      height:       28,
      border:       "3px solid var(--color-border-secondary)",
      borderTop:    "3px solid var(--color-text-primary)",
      borderRadius: "50%",
      animation:    "spin 0.8s linear infinite",
      flexShrink:   0,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default UploadProgressModal;