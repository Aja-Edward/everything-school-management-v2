// components/dashboards/admin/ParentBulkUploadMenu.tsx

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, ChevronDown, Upload,
  FileSpreadsheet, FileText, BookOpen,
} from "lucide-react";
import { bulkUploadService } from "@/services/ParentBulkUploadService";

type DownloadState = "idle" | "loading" | "done" | "error";

interface ParentBulkUploadMenuProps {
  onOpenGuide?: () => void;
}

const ParentBulkUploadMenu: React.FC<ParentBulkUploadMenuProps> = ({
  onOpenGuide,
}) => {
  const navigate  = useNavigate();
  const [open,      setOpen]      = useState(false);
  const [csvState,  setCsvState]  = useState<DownloadState>("idle");
  const [xlsxState, setXlsxState] = useState<DownloadState>("idle");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCSVDownload = async () => {
    setCsvState("loading");
    try {
      await bulkUploadService.downloadTemplate("csv");
      setCsvState("done");
    } catch {
      setCsvState("error");
    } finally {
      setTimeout(() => setCsvState("idle"), 2000);
    }
  };

  const handleExcelDownload = async () => {
    setXlsxState("loading");
    try {
      await bulkUploadService.downloadTemplate("excel");
      setXlsxState("done");
    } catch {
      setXlsxState("error");
    } finally {
      setTimeout(() => setXlsxState("idle"), 2000);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors
          ${open
            ? "bg-gray-900 text-white border-gray-900"
            : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
          }`}
      >
        <Users className="w-4 h-4" />
        Bulk Upload
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-[280px] bg-white border border-gray-100 rounded-2xl shadow-xl z-30">

          {/* Section header */}
          <div className="px-4 pt-3 pb-2 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
            Bulk Parent Import
          </div>

          <div className="px-2 pb-2 space-y-1">

            {/* Navigate to upload page */}
            <MenuItem
              icon={<Upload className="w-4 h-4 text-white" />}
              iconBg="bg-gray-900"
              label="Upload Parents"
              description="Import CSV or Excel file"
              onClick={() => {
                navigate("/admin/parent_bulk_upload");
                setOpen(false);
              }}
            />

            <Divider label="Download Template" />

            {/* CSV */}
            <MenuItem
              icon={
                csvState === "loading" ? <Spinner /> :
                csvState === "done"    ? <Checkmark color="text-emerald-600" /> :
                <FileText className="w-4 h-4 text-emerald-600" />
              }
              iconBg="bg-emerald-50"
              label={
                csvState === "loading" ? "Downloading..." :
                csvState === "done"    ? "Downloaded!" :
                "CSV Template"
              }
              description="Simple format, easy to edit"
              onClick={handleCSVDownload}
              badge={<Badge text=".csv" color="emerald" />}
            />

            {/* Excel */}
            <MenuItem
              icon={
                xlsxState === "loading" ? <Spinner /> :
                xlsxState === "done"    ? <Checkmark color="text-blue-600" /> :
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              }
              iconBg="bg-blue-50"
              label={
                xlsxState === "loading" ? "Downloading..." :
                xlsxState === "done"    ? "Downloaded!" :
                "Excel Template"
              }
              description="Formatted + field guide sheet"
              onClick={handleExcelDownload}
              badge={<Badge text=".xlsx" color="blue" />}
            />

            {onOpenGuide && (
              <>
                <Divider />
                <MenuItem
                  icon={<BookOpen className="w-4 h-4 text-violet-600" />}
                  iconBg="bg-violet-50"
                  label="Upload Guide"
                  description="Rules & formatting tips"
                  onClick={() => {
                    onOpenGuide();
                    setOpen(false);
                  }}
                />
              </>
            )}
          </div>

          <div className="px-4 py-2.5 text-xs text-gray-400 border-t border-gray-100">
            Upload parents <strong className="text-gray-500">before</strong> students — phone numbers link them automatically.
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared micro-components
// ---------------------------------------------------------------------------

const MenuItem = ({
  icon, iconBg, label, description, onClick, badge,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  description: string;
  onClick: () => void;
  badge?: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className="w-full flex gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors text-left"
  >
    <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${iconBg}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
        {label} {badge}
      </div>
      <div className="text-xs text-gray-400">{description}</div>
    </div>
  </button>
);

const Divider = ({ label }: { label?: string }) =>
  label ? (
    <div className="flex items-center gap-2 px-3 py-1">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-[10px] text-gray-300 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  ) : (
    <div className="h-px bg-gray-100 my-1 mx-2" />
  );

const Badge = ({
  text,
  color,
}: {
  text: string;
  color: "blue" | "emerald";
}) => (
  <span
    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
      ${color === "blue"    ? "bg-blue-100 text-blue-700" : ""}
      ${color === "emerald" ? "bg-emerald-100 text-emerald-700" : ""}
    `}
  >
    {text}
  </span>
);

const Checkmark = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={color}>
    <polyline points="3 8 6.5 11.5 13 5" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
      strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round" />
  </svg>
);

export default ParentBulkUploadMenu;