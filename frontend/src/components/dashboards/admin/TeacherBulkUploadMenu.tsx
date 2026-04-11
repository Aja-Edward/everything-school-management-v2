/**
 * TeacherBulkUploadMenu.tsx
 *
 * Dropdown menu for teacher bulk upload with template downloads
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  BookOpen,
  ChevronDown,
  Upload,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { teacherBulkUploadService } from "@/services/teacherBulkUploadService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeacherBulkUploadMenuProps {
  onOpenGuide: () => void;
}

type DownloadState = 'idle' | 'loading' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TeacherBulkUploadMenu: React.FC<TeacherBulkUploadMenuProps> = ({ onOpenGuide }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [csvState, setCsvState] = useState<DownloadState>('idle');
  const [xlsxState, setXlsxState] = useState<DownloadState>('idle');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCSVDownload = async () => {
  setCsvState('loading');
  try {
    await teacherBulkUploadService.downloadTemplate('csv');
    setCsvState('done');
  } catch {
    setCsvState('error');
  } finally {
    setTimeout(() => setCsvState('idle'), 2000);
  }
};

  const handleExcelDownload = async () => {
  setXlsxState('loading');
  try {
    await teacherBulkUploadService.downloadTemplate('excel');
    setXlsxState('done');
  } catch {
    setXlsxState('error');
  } finally {
    setTimeout(() => setXlsxState('idle'), 2000);
  }
};

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border
          ${open
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}
        `}
      >
        <Users className="w-4 h-4" />
        Bulk Upload Teachers
        <ChevronDown className={`w-3.5 h-3.5 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-[280px] bg-white border border-gray-100 rounded-2xl shadow-xl z-30" style={{ minHeight: 'auto', visibility: 'visible' }}>

          {/* Header */}
          <div className="px-4 pt-3 pb-2 text-[11px] text-gray-400 font-semibold uppercase">
            Bulk Teacher Import
          </div>

          <div className="px-2 pb-2 space-y-1">

            {/* Upload */}
            <MenuItem
              icon={<Upload className="w-4 h-4 text-white" />}
              iconBg="bg-gray-900"
              label="Upload Teachers"
              description="Import CSV or Excel file"
              onClick={() => {
                navigate('/admin/teacher_bulk_upload');
                setOpen(false);
              }}
            />

            <Divider label="Download Template" />

            {/* CSV */}
            <MenuItem
              icon={
                csvState === 'done'
                  ? <span className="text-green-600 font-bold">✓</span>
                  : <FileText className="w-4 h-4 text-emerald-600" />
              }
              iconBg="bg-emerald-50"
              label={csvState === 'done' ? 'Downloaded!' : 'CSV Template'}
              description="Simple format (recommended fallback)"
              onClick={handleCSVDownload}
              badge={<Badge text=".csv" color="emerald" />}
            />

            {/* Excel */}
            <MenuItem
              icon={
                xlsxState === 'loading'
                  ? <Spinner />
                  : xlsxState === 'done'
                    ? <span className="text-blue-600 font-bold">✓</span>
                    : <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              }
              iconBg="bg-blue-50"
              label={
                xlsxState === 'loading'
                  ? 'Downloading...'
                  : xlsxState === 'done'
                    ? 'Downloaded!'
                    : 'Excel Template'
              }
              description="Formatted + field guide"
              onClick={handleExcelDownload}
              badge={<Badge text=".xlsx" color="blue" />}
            />

            <Divider />

            {/* Guide */}
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
          </div>

          <div className="px-4 py-2 text-xs text-gray-400 border-t">
            Email addresses must be unique. Passwords will be auto-generated.
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

const MenuItem = ({ icon, iconBg, label, description, onClick, badge }: any) => (
  <button
    onClick={onClick}
    className="w-full flex gap-3 px-3 py-2 rounded-xl hover:bg-gray-50"
  >
    <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${iconBg}`}>
      {icon}
    </div>

    <div className="flex-1 text-left">
      <div className="flex items-center gap-2 text-sm font-medium">
        {label} {badge}
      </div>
      <div className="text-xs text-gray-400">{description}</div>
    </div>
  </button>
);

const Divider = ({ label }: { label?: string }) => (
  label ? (
    <div className="flex items-center gap-2 px-3 py-1">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-[10px] text-gray-300 uppercase">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  ) : (
    <div className="h-px bg-gray-100 my-1 mx-2" />
  )
);

const Badge = ({ text, color }: { text: string; color: 'blue' | 'emerald' }) => (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-${color}-100 text-${color}-700`}>
    {text}
  </span>
);

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
  </svg>
);

export default TeacherBulkUploadMenu;
