// components/students/CredentialExportPanel.tsx

import { useState } from "react";
import type { ExportFormat } from "@/types/bulkUpload";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormatOption {
  id:    ExportFormat;
  label: string;
  desc:  string;
}

interface CredentialExportPanelProps {
  importedCount: number;
  onExport:      (format: ExportFormat) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORMATS: FormatOption[] = [
  {
    id:    "excel",
    label: "Excel (.xlsx)",
    desc:  "Best for sharing via email. Includes summary sheet.",
  },
  {
    id:    "csv",
    label: "CSV (.csv)",
    desc:  "Universal format. Opens in any spreadsheet app.",
  },
  {
    id:    "pdf",
    label: "PDF",
    desc:  "Printable table of all credentials. Easy to distribute.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CredentialExportPanel({
  importedCount,
  onExport,
}: CredentialExportPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("excel");
  const [exporting, setExporting]           = useState<boolean>(false);

  const handleExport = async (): Promise<void> => {
    setExporting(true);
    try {
      await onExport(selectedFormat);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{
      background:   "var(--color-background-secondary)",
      border:       "1px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding:      "22px 24px",
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px" }}>
        Download login credentials
      </h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--color-text-secondary)" }}>
        {importedCount} students were created. Download their initial usernames
        and passwords to distribute to the school.
      </p>

      {/* Format selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {FORMATS.map((fmt) => (
          <label
            key={fmt.id}
            style={{
              display:    "flex",
              alignItems: "flex-start",
              gap:        12,
              padding:    "12px 16px",
              border:     `1.5px solid ${
                selectedFormat === fmt.id
                  ? "var(--color-border-primary)"
                  : "var(--color-border-tertiary)"
              }`,
              borderRadius: "var(--border-radius-md)",
              cursor:       "pointer",
              background:   selectedFormat === fmt.id
                ? "var(--color-background-primary)"
                : "transparent",
              transition: "all 0.1s",
            }}
          >
            <input
              type="radio"
              name="export-format"
              value={fmt.id}
              checked={selectedFormat === fmt.id}
              onChange={() => setSelectedFormat(fmt.id)}
              style={{ marginTop: 2 }}
            />
            <div>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{fmt.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
                {fmt.desc}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Warning */}
      <div style={{
        background:   "var(--color-background-warning)",
        border:       "1px solid var(--color-border-warning)",
        borderRadius: "var(--border-radius-md)",
        padding:      "10px 14px",
        marginBottom: 18,
        fontSize:     12,
        color:        "var(--color-text-warning)",
      }}>
        ⚠ These are initial passwords. Advise students and parents to change
        their password on first login.
      </div>

      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          background:   "var(--color-text-primary)",
          color:        "var(--color-background-primary)",
          border:       "none",
          borderRadius: "var(--border-radius-md)",
          padding:      "10px 22px",
          fontSize:     14,
          fontWeight:   500,
          cursor:       exporting ? "not-allowed" : "pointer",
          opacity:      exporting ? 0.7 : 1,
          display:      "inline-flex",
          alignItems:   "center",
          gap:          8,
        }}
      >
        {exporting
          ? "Preparing download…"
          : `Download ${selectedFormat.toUpperCase()}`}
      </button>
    </div>
  );
}

export default CredentialExportPanel;