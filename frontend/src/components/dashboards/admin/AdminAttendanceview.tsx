import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Users, Calendar, Download, Eye, File, FileSpreadsheet, FileText, X } from 'lucide-react';
import {
  getAttendance,
  addAttendance,
  updateAttendance,
  deleteAttendance,
  AttendanceStatusMap,
  AttendanceCodeToStatusMap,
} from '@/services/AttendanceService';
import StudentService, { Student } from '@/services/StudentService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: number;
  name: string;
  type: 'student' | 'teacher' | 'staff';
  level: string;
  class: string;
  section: string;
  section_name?: string;
  results?: any;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  timeIn: string;
  timeOut: string;
  term: string;
  stream?: string;
  stream_type?: string;
  education_level?: string;
  education_level_display?: string;
  class_display?: string;
}

// ─── Export utilities ─────────────────────────────────────────────────────────

const EXPORT_COLS = ['Name', 'Type', 'Level', 'Class', 'Stream', 'Section', 'Status', 'Time In', 'Time Out', 'Date'];

const toRow = (r: AttendanceRecord) => [
  r.name, r.type, r.level, r.class, r.stream || '-', r.section, r.status,
  r.timeIn || '-', r.timeOut || '-', r.date,
];

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const doCSV = (records: AttendanceRecord[], filename: string) => {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [EXPORT_COLS, ...records.map(toRow)];
  const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
};

const doExcel = async (records: AttendanceRecord[], filename: string) => {
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs' as any).catch(() => null);
  if (!XLSX) { alert('Excel library failed to load — try CSV instead.'); return; }
  const wsData = [EXPORT_COLS, ...records.map(toRow)];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = EXPORT_COLS.map((_, i) => ({ wch: i === 0 ? 24 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

const loadScript = (src: string) =>
  new Promise<void>((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });

const doPDF = async (
  records: AttendanceRecord[],
  filename: string,
  stats: { total: number; present: number; absent: number; late: number; rate: string | number },
  dateRange: { from: string; to: string }
) => {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

  // @ts-ignore
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Blue header bar
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('Attendance Report', 14, 15);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 220, 10);
  doc.text(`Period: ${dateRange.from} → ${dateRange.to}`, 220, 17);

  // Stats row
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  const summaryY = 32;
  [
    `Total: ${stats.total}`,
    `Present: ${stats.present}`,
    `Absent: ${stats.absent}`,
    `Late: ${stats.late}`,
    `Rate: ${stats.rate}%`,
  ].forEach((txt, i) => doc.text(txt, 14 + i * 55, summaryY));

  // Table
  // @ts-ignore
  doc.autoTable({
    startY: 38,
    head: [EXPORT_COLS],
    body: records.map(toRow),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    columnStyles: { 6: { fontStyle: 'bold' } }, // status col
    didDrawCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 6) {
        const status = data.cell.raw as string;
        const c: Record<string, [number, number, number]> = {
          present: [22, 163, 74], absent: [220, 38, 38],
          late: [202, 138, 4], excused: [37, 99, 235],
        };
        const col = c[status] ?? [107, 114, 128];
        doc.setTextColor(...col);
        doc.setFont('helvetica', 'bold');
        doc.text(status, data.cell.x + 2, data.cell.y + data.cell.height / 2 + 1);
        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'normal');
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Page numbers
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pages}`, 272, 205);
  }

  doc.save(`${filename}.pdf`);
};

// ─── Export Modal ─────────────────────────────────────────────────────────────

interface ExportModalProps {
  records: AttendanceRecord[];
  stats: { total: number; present: number; absent: number; late: number; rate: string | number };
  onClose: () => void;
  defaultDate: string;
}

const ExportModal: React.FC<ExportModalProps> = ({ records, stats, onClose, defaultDate }) => {
  const [format, setFormat] = useState<'csv' | 'excel' | 'pdf'>('pdf');
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState(defaultDate);
  const [exporting, setExporting] = useState(false);

  // Filter records to the chosen date range
  const filteredByRange = records.filter(r => r.date >= dateFrom && r.date <= dateTo);

  const filename = `attendance_${dateFrom}_${dateTo}`;

  const handleExport = async () => {
    if (filteredByRange.length === 0) {
      alert('No records in the selected date range.');
      return;
    }
    setExporting(true);
    try {
      if (format === 'csv') doCSV(filteredByRange, filename);
      else if (format === 'excel') await doExcel(filteredByRange, filename);
      else await doPDF(filteredByRange, filename, stats, { from: dateFrom, to: dateTo });
      onClose();
    } catch (e) {
      alert(`Export failed: ${e}`);
    } finally {
      setExporting(false);
    }
  };

  const formatMeta: Record<string, { icon: React.ReactNode; label: string; ext: string; desc: string }> = {
    csv:   { icon: <File className="h-5 w-5 text-green-600" />,      label: 'CSV',   ext: '.csv',  desc: 'Plain text, opens in any spreadsheet app' },
    excel: { icon: <FileSpreadsheet className="h-5 w-5 text-emerald-600" />, label: 'Excel', ext: '.xlsx', desc: 'Formatted spreadsheet with column widths' },
    pdf:   { icon: <FileText className="h-5 w-5 text-red-600" />,    label: 'PDF',   ext: '.pdf',  desc: 'Printable report with colour-coded status' },
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Export Attendance</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Date range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-500 mb-1 block">From</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <span className="text-xs text-gray-500 mb-1 block">To</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {filteredByRange.length} record{filteredByRange.length !== 1 ? 's' : ''} in this range
            </p>
          </div>

          {/* Format picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <div className="space-y-2">
              {(Object.keys(formatMeta) as Array<'csv' | 'excel' | 'pdf'>).map(f => (
                <label key={f}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    format === f
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <input type="radio" name="format" value={f} checked={format === f}
                    onChange={() => setFormat(f)} className="sr-only" />
                  {formatMeta[f].icon}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{formatMeta[f].label}</span>
                      <span className="text-xs text-gray-400">{formatMeta[f].ext}</span>
                    </div>
                    <p className="text-xs text-gray-500">{formatMeta[f].desc}</p>
                  </div>
                  {format === f && (
                    <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Preview stats */}
          <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Total', value: filteredByRange.length, color: 'text-gray-900' },
              { label: 'Present', value: filteredByRange.filter(r => r.status === 'present').length, color: 'text-green-600' },
              { label: 'Absent', value: filteredByRange.filter(r => r.status === 'absent').length, color: 'text-red-600' },
              { label: 'Late', value: filteredByRange.filter(r => r.status === 'late').length, color: 'text-yellow-600' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
            Cancel
          </button>
          <button onClick={handleExport} disabled={exporting || filteredByRange.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            {exporting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export {formatMeta[format].label}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const AttendanceDashboard = () => {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  const [filters, setFilters] = useState<{
    level: string; class: string; type: string; period: string; date: string; section: string;
  }>({
    level: 'all', class: 'all', type: 'all', period: 'daily',
    date: new Date().toISOString().slice(0, 10), section: 'all',
  });
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const levels   = ['all', 'nursery', 'primary', 'junior_secondary', 'senior_secondary', 'secondary'];
  const types    = ['all', 'student', 'teacher', 'staff'];
  const periods  = ['daily', 'weekly', 'termly'];
  const sections = ['all', 'Blue', 'Red', 'Green', 'Staff', 'Support'];
  const statuses = ['present', 'absent', 'late', 'excused'];

  const loadAttendanceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAttendance({});
      const attendanceData = Array.isArray(data) ? data : [];
      const mapped: AttendanceRecord[] = attendanceData.map((rec: any) => ({
        id: rec.id,
        name: rec.student_name || rec.teacher_name || `ID ${rec.student || rec.teacher}` || 'Unknown',
        type: rec.student ? 'student' : rec.teacher ? 'teacher' : 'staff',
        level: rec.student_education_level_display || '',
        class: rec.student_class_display || '',
        section: rec.section_name || '',
        date: rec.date,
        status: AttendanceCodeToStatusMap[rec.status as keyof typeof AttendanceCodeToStatusMap] ?? 'absent',
        timeIn: rec.time_in || '',
        timeOut: rec.time_out || '',
        term: '',
        stream: rec.student_stream_name || '',
        stream_type: rec.student_stream_type || '',
        education_level: rec.student_education_level || '',
        education_level_display: rec.student_education_level_display || '',
        class_display: rec.student_class_display || '',
      }));
      setAttendanceRecords(mapped);
    } catch (err) {
      console.error('❌ Error fetching attendance:', err);
      setError('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAttendanceData(); }, []);

  useEffect(() => {
    setFilteredRecords(attendanceRecords.filter(record =>
      (filters.level === 'all' || record.level === filters.level) &&
      (filters.type === 'all' || record.type === filters.type) &&
      (filters.section === 'all' || record.section === filters.section) &&
      record.name.toLowerCase().includes(searchTerm.toLowerCase())
    ));
  }, [filters, attendanceRecords, searchTerm]);

  const handleFilterChange = (key: string, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  const handleAdd = () => { setEditingRecord(null); setShowModal(true); };
  const handleEdit = (record: AttendanceRecord) => { setEditingRecord(record); setShowModal(true); };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this record?')) return;
    setLoading(true);
    try {
      await deleteAttendance(id);
      setAttendanceRecords(prev => prev.filter(r => r.id !== id));
      loadAttendanceData();
    } catch { setError('Failed to delete record'); }
    finally { setLoading(false); }
  };

  const handleSave = async (formData: any) => {
    setLoading(true); setError(null);
    try {
      const { selectedStudent, ...rest } = formData;
      if (!selectedStudent) { setError('Please select a student.'); return; }
      if (!selectedStudent.section_id) {
        setError(`"${selectedStudent.full_name}" has no section assignment.`);
        return;
      }
      const payload = {
        student: selectedStudent.id,
        section: selectedStudent.section_id,
        date: rest.date || filters.date,
        status: AttendanceStatusMap[rest.status as keyof typeof AttendanceStatusMap],
        time_in: rest.timeIn || null,
        time_out: rest.timeOut || null,
      };
      if (editingRecord) {
        await updateAttendance(editingRecord.id, payload);
      } else {
        const dup = attendanceRecords.find(r =>
          r.name.includes(selectedStudent.full_name) && r.date === (rest.date || filters.date)
        );
        if (dup) {
          setError(`Record already exists for ${selectedStudent.full_name} on that date.`);
          return;
        }
        await addAttendance(payload);
      }
      loadAttendanceData();
      setShowModal(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to save record');
    } finally { setLoading(false); }
  };

  const getStatusColor = (status: string) => ({
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    late: 'bg-yellow-100 text-yellow-800',
    excused: 'bg-blue-100 text-blue-800',
  }[status] || 'bg-gray-100 text-gray-800');

  const getStats = (records: AttendanceRecord[]) => {
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent  = records.filter(r => r.status === 'absent').length;
    const late    = records.filter(r => r.status === 'late').length;
    const rate    = total > 0 ? ((present / total) * 100).toFixed(1) : 0;
    return { total, present, absent, late, rate };
  };

  const stats = getStats(filteredRecords);

  return (
    <div className="bg-gray-50">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Attendance Dashboard</h1>
        <p className="text-gray-600">Manage student, teacher, and staff attendance</p>
      </div>
      {loading && <div className="text-blue-600 mb-2">Loading...</div>}
      {error && <div className="text-red-600 mb-2">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {[
          { label: 'Total Records', value: stats.total, icon: <Users className="h-8 w-8 text-blue-600" />, color: 'text-gray-900' },
          { label: 'Present', value: stats.present, icon: <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center"><div className="h-4 w-4 bg-green-600 rounded-full" /></div>, color: 'text-green-600' },
          { label: 'Absent', value: stats.absent, icon: <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center"><div className="h-4 w-4 bg-red-600 rounded-full" /></div>, color: 'text-red-600' },
          { label: 'Attendance Rate', value: `${stats.rate}%`, icon: <Calendar className="h-8 w-8 text-purple-600" />, color: 'text-purple-600' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center">
              <div className="mr-3">{icon}</div>
              <div>
                <p className="text-sm font-medium text-gray-600">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
          {[
            { key: 'type', opts: types, placeholder: 'All Types' },
            { key: 'level', opts: levels, placeholder: 'All Levels' },
            { key: 'section', opts: sections, placeholder: 'All Sections' },
            { key: 'period', opts: periods, placeholder: '' },
          ].map(({ key, opts, placeholder }) => (
            <select key={key} value={(filters as any)[key]} onChange={e => handleFilterChange(key, e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              {placeholder && <option value="all">{placeholder}</option>}
              {(placeholder ? opts.slice(1) : opts).map(o => (
                <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              ))}
            </select>
          ))}
          <input type="date" value={filters.date} onChange={e => handleFilterChange('date', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search by name..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <button onClick={handleAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Record
          </button>
          <div className="flex gap-2">
            <button onClick={() => setShowExportModal(true)}
              className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-md flex items-center gap-2">
              <Download className="h-4 w-4" /> Export
            </button>
            <button onClick={() => setShowReportModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2">
              <Eye className="h-4 w-4" /> View Report
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name','Type','Level','Class','Stream','Section','Status','Time In','Time Out','Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecords.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-400">No records found</td></tr>
              ) : filteredRecords.map(record => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{record.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{record.level}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.class}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.stream || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.section}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.status)}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.timeIn || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.timeOut || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEdit(record)} className="text-blue-600 hover:text-blue-900 mr-3">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(record.id)} className="text-red-600 hover:text-red-900">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <AttendanceModal
          record={editingRecord}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          levels={levels.slice(1)}
          sections={sections.slice(1)}
          statuses={statuses}
          types={types.slice(1)}
        />
      )}

      {showExportModal && (
        <ExportModal
          records={filteredRecords}
          stats={stats}
          onClose={() => setShowExportModal(false)}
          defaultDate={filters.date}
        />
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Attendance Report</h3>
              <button onClick={() => setShowReportModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total', value: stats.total, bg: 'bg-blue-50', color: 'text-blue-900', hdr: 'text-blue-600' },
                  { label: 'Present', value: stats.present, bg: 'bg-green-50', color: 'text-green-900', hdr: 'text-green-600' },
                  { label: 'Absent', value: stats.absent, bg: 'bg-red-50', color: 'text-red-900', hdr: 'text-red-600' },
                  { label: 'Rate', value: `${stats.rate}%`, bg: 'bg-purple-50', color: 'text-purple-900', hdr: 'text-purple-600' },
                ].map(({ label, value, bg, color, hdr }) => (
                  <div key={label} className={`${bg} p-4 rounded-lg`}>
                    <h4 className={`text-sm font-medium ${hdr}`}>{label}</h4>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-md font-semibold mb-3">Detailed Records</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        {['Name','Type','Level','Class','Section','Status','Date'].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredRecords.slice(0, 20).map(record => (
                        <tr key={record.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{record.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-500 capitalize">{record.type}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{record.level}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{record.class}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{record.section}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(record.status)}`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">{record.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredRecords.length > 20 && (
                  <p className="text-sm text-gray-500 mt-2">Showing 20 of {filteredRecords.length} records</p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                  Close
                </button>
                <button onClick={() => window.print()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  Print Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Attendance Modal ─────────────────────────────────────────────────────────

interface AttendanceModalProps {
  record: AttendanceRecord | null;
  onClose: () => void;
  onSave: (formData: Omit<AttendanceRecord, 'id' | 'date'> & { date?: string; selectedStudent: Student | null }) => void;
  levels: string[];
  sections: string[];
  statuses: string[];
  types: string[];
}

const AttendanceModal: React.FC<AttendanceModalProps> = ({ record, onClose, onSave, levels, sections, statuses, types }) => {
  const [formData, setFormData] = useState<Omit<AttendanceRecord, 'id' | 'date'> & { date?: string }>({
    name: record?.name || '',
    type: (record?.type as 'student' | 'teacher' | 'staff') || 'student',
    level: record?.level || 'primary',
    class: record?.class || '',
    section: record?.section || 'Blue',
    status: (record?.status as 'present' | 'absent' | 'late' | 'excused') || 'present',
    timeIn: record?.timeIn || '',
    timeOut: record?.timeOut || '',
    term: record?.term || 'Second Term',
  });
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentOptions, setStudentOptions] = useState<Student[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);

  useEffect(() => {
    if (studentQuery.length < 2) { setStudentOptions([]); return; }
    setStudentLoading(true);
    StudentService.searchStudents(studentQuery).then(s => { setStudentOptions(s); setStudentLoading(false); });
  }, [studentQuery]);

  const handleStudentSelect = (student: Student) => {
    setFormData(prev => ({
      ...prev,
      name: student.full_name, type: 'student',
      level: student.education_level_display || '',
      class: student.student_class_display || '',
      section: student.classroom || '',
      stream: student.stream_name || '',
      education_level: student.education_level || '',
    }));
    setSelectedStudent(student);
    setStudentQuery(student.full_name);
    setStudentOptions([]);
  };

  const handleChange = (key: string, value: string) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, selectedStudent });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold">{record ? 'Edit' : 'Add'} Attendance Record</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
              <input type="text" value={studentQuery} onChange={e => setStudentQuery(e.target.value)}
                placeholder="Search by name or username..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="off" />
              {studentLoading && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
              {studentOptions.length > 0 && (
                <ul className="border rounded-lg bg-white mt-1 max-h-40 overflow-y-auto shadow-lg z-10 relative">
                  {studentOptions.map(s => (
                    <li key={s.id} onClick={() => handleStudentSelect(s)}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">
                      {s.full_name} <span className="text-gray-400">({s.email || s.id})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={formData.date || new Date().toISOString().slice(0, 10)}
                onChange={e => handleChange('date', e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {[
              { label: 'Type', key: 'type' },
              { label: 'Level', key: 'level' },
              { label: 'Class', key: 'class' },
              { label: 'Section', key: 'section' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" value={(formData as any)[key]} disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500" />
              </div>
            ))}
            {(formData as any).education_level === 'SENIOR_SECONDARY' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stream</label>
                <input type="text" value={(formData as any).stream || 'Not assigned'} disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={formData.status} onChange={e => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                {statuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[{ label: 'Time In', key: 'timeIn' }, { label: 'Time Out', key: 'timeOut' }].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type="time" value={(formData as any)[key]} onChange={e => handleChange(key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm font-medium">
                {record ? 'Update' : 'Add'} Record
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-md text-sm font-medium">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AttendanceDashboard;