// components/students/CredentialExportPanel.tsx

import { useState } from "react";
import type { ExportFormat } from "@/types/studentBulkUpload";

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
              <p 
              className="m-0 font-medium text-sm">{fmt.label}</p>
              <p className="mt-2 mb-2 ml-0 mr-0 text-sm text-variant" >
                {fmt.desc}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Warning */}
      <div 
      className="bg-yellow-50 border-yellow-200 text-yellow-800 rounded-md p-3 mb-4 text-sm"
      >
        ⚠ These are initial passwords. Advise students and parents to change
        their password on first login.
      </div>

      <button
        onClick={handleExport}
        disabled={exporting}
        className="bg-black hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors p-2"
      >
        {exporting
          ? "Preparing download…"
          : `Download ${selectedFormat.toUpperCase()}`}
      </button>
    </div>
  );
}

export default CredentialExportPanel;