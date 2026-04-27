import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2, Users, Calendar, Download, Eye, FileText, FileSpreadsheet, File } from 'lucide-react';
import {
  getLessonAttendance,
  addLessonAttendance,
  updateLessonAttendance,
  deleteLessonAttendance,
  AttendanceStatusMap,
  AttendanceRecord,
  AttendanceCodeToStatusMap,
} from '@/services/AttendanceService';

interface LessonAttendanceRecord {
  id: number;
  name: string;
  type: 'student' | 'teacher' | 'staff';
  level: string;
  class: string;
  section: string;
  section_name: string;
  stream: string; 
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  timeIn: string;
  timeOut: string;
  term: string;
}

// ─── Export Utilities ─────────────────────────────────────────────────────────

const EXPORT_COLUMNS = ['Name', 'Type', 'Level', 'Class', 'Section', 'Status', 'Time In', 'Time Out', 'Date', 'Term'];

const recordToRow = (r: LessonAttendanceRecord) => [
  r.name, r.type, r.level, r.class, r.section, r.status, r.timeIn || '-', r.timeOut || '-', r.date, r.term,
];

/** CSV export — no external library needed */
const exportCSV = (records: LessonAttendanceRecord[], filename: string) => {
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [EXPORT_COLUMNS, ...records.map(recordToRow)];
  const csv = rows.map(row => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}.csv`);
};

/** Excel export using SheetJS (available as window.XLSX via CDN) */
const exportExcel = async (records: LessonAttendanceRecord[], filename: string) => {
  // Dynamically import SheetJS
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs' as any).catch(() => null);
  if (!XLSX) {
    alert('Excel export library failed to load. Please try CSV export instead.');
    return;
  }
  const wsData = [EXPORT_COLUMNS, ...records.map(recordToRow)];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  // Column widths
  ws['!cols'] = EXPORT_COLUMNS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

/** PDF export using jsPDF + autoTable (loaded via CDN) */
const exportPDF = async (records: LessonAttendanceRecord[], filename: string, stats: ReturnType<typeof getStats>) => {
  // @ts-ignore
  if (!window.jspdf) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(script);
    await new Promise(res => { script.onload = res; });
  }
  // @ts-ignore
  if (!window.jspdf?.jsPDF?.API?.autoTable) {
    const script2 = document.createElement('script');
    script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
    document.head.appendChild(script2);
    await new Promise(res => { script2.onload = res; });
  }

  // @ts-ignore
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Lesson / Class Attendance Report', 14, 14);

  // Meta row
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 14);

  // Stats summary
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  const summaryY = 28;
  const summaryItems = [
    `Total: ${stats.total}`,
    `Present: ${stats.present}`,
    `Absent: ${stats.absent}`,
    `Late: ${stats.late}`,
    `Rate: ${stats.rate}%`,
  ];
  summaryItems.forEach((item, i) => {
    doc.text(item, 14 + i * 52, summaryY);
  });

  // Table
  // @ts-ignore
  doc.autoTable({
    startY: 34,
    head: [EXPORT_COLUMNS],
    body: records.map(recordToRow),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    columnStyles: {
      5: {
        // status column — color by value
        fontStyle: 'bold',
      },
    },
    didDrawCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 5) {
        const status = data.cell.raw as string;
        const colors: Record<string, [number, number, number]> = {
          present: [22, 163, 74],
          absent: [220, 38, 38],
          late: [202, 138, 4],
          excused: [37, 99, 235],
        };
        const c = colors[status] || [107, 114, 128];
        doc.setTextColor(...c);
        doc.setFont('helvetica', 'bold');
        doc.text(status, data.cell.x + 2, data.cell.y + data.cell.height / 2 + 1);
        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'normal');
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, 270, 205);
  }

  doc.save(`${filename}.pdf`);
};

const getStats = (records: LessonAttendanceRecord[]) => {
  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const late = records.filter(r => r.status === 'late').length;
  const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '0';
  return { total, present, absent, late, rate };
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Export Button Component ──────────────────────────────────────────────────

interface ExportMenuProps {
  records: LessonAttendanceRecord[];
  stats: ReturnType<typeof getStats>;
  date: string;
}

const ExportMenu: React.FC<ExportMenuProps> = ({ records, stats, date }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const filename = `attendance_${date}`;

  const handle = async (type: 'csv' | 'excel' | 'pdf') => {
    setOpen(false);
    setExporting(type);
    try {
      if (type === 'csv') exportCSV(records, filename);
      else if (type === 'excel') await exportExcel(records, filename);
      else await exportPDF(records, filename, stats);
    } catch (e) {
      alert(`Export failed: ${e}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!exporting || records.length === 0}
        className="bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
      >
        {exporting ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? `Exporting ${exporting.toUpperCase()}…` : 'Export'}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-50 overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              Export {records.length} records
            </div>
            <button
              onClick={() => handle('csv')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <File className="h-4 w-4 text-green-600" />
              <span>CSV</span>
              <span className="ml-auto text-xs text-gray-400">.csv</span>
            </button>
            <button
              onClick={() => handle('excel')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>Excel</span>
              <span className="ml-auto text-xs text-gray-400">.xlsx</span>
            </button>
            <button
              onClick={() => handle('pdf')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileText className="h-4 w-4 text-red-600" />
              <span>PDF</span>
              <span className="ml-auto text-xs text-gray-400">.pdf</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const LessonAttendanceDashboard = () => {
  const [attendanceRecords, setAttendanceRecords] = useState<LessonAttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<LessonAttendanceRecord[]>([]);
  const [filters, setFilters] = useState<{
    level: string; class: string; type: string; period: string; date: string; section: string;
  }>({
    level: 'all', class: 'all', type: 'all', period: 'daily',
    date: new Date().toISOString().slice(0, 10), section: 'all',
  });
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LessonAttendanceRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levels = ['all', 'nursery', 'primary', 'secondary'];
  const types = ['all', 'student', 'teacher', 'staff'];
  const periods = ['daily', 'weekly', 'termly'];
  const sections = ['all', 'Blue', 'Red', 'Green', 'Staff', 'Support'];
  const statuses = ['present', 'absent', 'late', 'excused'];

  useEffect(() => {
  setLoading(true);
  setError(null);
  getLessonAttendance({ date: filters.date })
    .then((data) => {
  const mapped: LessonAttendanceRecord[] = data.map((rec: AttendanceRecord) => {
  console.log('section_name:', rec.section_name, '| time_in:', rec.time_in, '| stream:', rec.student_stream_name);
  return {
    id: rec.id,
    name: rec.student_name ?? rec.teacher_name ?? 'Unknown',
    type: rec.student !== null ? 'student' : rec.teacher !== null ? 'teacher' : ('staff' as const),
    level: rec.student_education_level_display ?? '',
    class: rec.student_class_display ?? '',
    section: rec.section_name ?? '',
    section_name: rec.section_name ?? '',
    stream: rec.student_stream_name ?? '',
    date: rec.date,
    status: AttendanceCodeToStatusMap[rec.status as keyof typeof AttendanceCodeToStatusMap] ?? 'absent',
    timeIn: rec.time_in ?? '',
    timeOut: rec.time_out ?? '',
    term: '',
  };
});
  console.log('Final mapped[0]:', mapped[0]); // ← AND THIS
  setAttendanceRecords(mapped);
})
    .catch(() => setError('Failed to load lesson attendance'))
    .finally(() => setLoading(false));
}, [filters.date]);

  useEffect(() => {
    const filtered = attendanceRecords.filter(record =>
      (filters.level === 'all' || record.level === filters.level) &&
      (filters.type === 'all' || record.type === filters.type) &&
      (filters.section === 'all' || record.section === filters.section) &&
      record.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredRecords(filtered);
  }, [filters, attendanceRecords, searchTerm]);

  const handleFilterChange = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));
  const handleAdd = () => { setEditingRecord(null); setShowModal(true); };
  const handleEdit = (record: LessonAttendanceRecord) => { setEditingRecord(record); setShowModal(true); };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      setLoading(true);
      try {
        await deleteLessonAttendance(id);
        setAttendanceRecords(prev => prev.filter(r => r.id !== id));
      } catch { setError('Failed to delete record'); }
      finally { setLoading(false); }
    }
  };

  const handleSave = async (formData: Omit<LessonAttendanceRecord, 'id' | 'date'> & { date?: string }) => {
    setLoading(true); setError(null);
    try {
      if (editingRecord) {
        await updateLessonAttendance(editingRecord.id, {
          status: AttendanceStatusMap[formData.status as keyof typeof AttendanceStatusMap],
        });
        setAttendanceRecords(prev => prev.map(r => r.id === editingRecord.id ? { ...r, ...formData } : r));
      } else {
        const newRec = await addLessonAttendance({
          status: AttendanceStatusMap[formData.status as keyof typeof AttendanceStatusMap],
          date: filters.date,
        });
        setAttendanceRecords(prev => [...prev, { ...formData, id: newRec.id, date: filters.date } as LessonAttendanceRecord]);
      }
      setShowModal(false);
    } catch { setError('Failed to save record'); }
    finally { setLoading(false); }
  };

  const getStatusColor = (status: string) => ({
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    late: 'bg-yellow-100 text-yellow-800',
    excused: 'bg-blue-100 text-blue-800',
  }[status] || 'bg-gray-100 text-gray-800');

  const stats = getStats(filteredRecords);

  return (
    <div className="bg-gray-50">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Lesson/Class Attendance Dashboard</h1>
        <p className="text-gray-600">Manage lesson/class attendance</p>
      </div>
      {loading && <div className="text-blue-600 mb-2">Loading...</div>}
      {error && <div className="text-red-600 mb-2">{error}</div>}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Total Records</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
              <div className="h-4 w-4 bg-green-600 rounded-full" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Present</p>
              <p className="text-2xl font-bold text-green-600">{stats.present}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
              <div className="h-4 w-4 bg-red-600 rounded-full" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Absent</p>
              <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-600">Attendance Rate</p>
              <p className="text-2xl font-bold text-purple-600">{stats.rate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
          <select value={filters.type} onChange={e => handleFilterChange('type', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Types</option>
            {types.slice(1).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <select value={filters.level} onChange={e => handleFilterChange('level', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Levels</option>
            {levels.slice(1).map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
          </select>
          <select value={filters.section} onChange={e => handleFilterChange('section', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Sections</option>
            {sections.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.period} onChange={e => handleFilterChange('period', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            {periods.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
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
            <Plus className="h-4 w-4" />
            Add Record
          </button>
          <div className="flex gap-2 items-center">
            {/* ── Export Menu ── */}
            <ExportMenu records={filteredRecords} stats={stats} date={filters.date} />

            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2">
              <Eye className="h-4 w-4" />
              View Report
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Type', 'Level', 'Class', 'Section', 'Streams', 'Status', 'Time In', 'Time Out', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-400">No records found</td>
                </tr>
              ) : filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{record.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{record.level}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.class}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.section_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.stream || '-'}</td>
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

      {showModal && (
        <LessonAttendanceModal
          record={editingRecord}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          levels={levels.slice(1)}
          sections={sections.slice(1)}
          statuses={statuses}
          types={types.slice(1)}
        />
      )}
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface LessonAttendanceModalProps {
  record: LessonAttendanceRecord | null;
  onClose: () => void;
  onSave: (formData: Omit<LessonAttendanceRecord, 'id' | 'date'> & { date?: string }) => void;
  levels: string[];
  sections: string[];
  statuses: string[];
  types: string[];
}

const LessonAttendanceModal: React.FC<LessonAttendanceModalProps> = ({ record, onClose, onSave, levels, sections, statuses, types }) => {
  const [formData, setFormData] = useState<Omit<LessonAttendanceRecord, 'id' | 'date'> & { date?: string }>({
    name: record?.name || '',
    type: (record?.type as 'student' | 'teacher' | 'staff') || 'student',
    level: record?.level || 'primary',
    class: record?.class || '',
    section: record?.section || 'Blue',
    section_name: record?.section_name || 'Pink',
    stream: record?.stream || '',
    status: (record?.status as 'present' | 'absent' | 'late' | 'excused') || 'present',
    timeIn: record?.timeIn || '',
    timeOut: record?.timeOut || '',
    term: record?.term || 'Second Term',
  });

  const handleChange = (key: string, value: string) => setFormData(prev => ({ ...prev, [key]: value }));
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            {record ? 'Edit Lesson Attendance Record' : 'Add Lesson Attendance Record'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Name', key: 'name', type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type={type} required value={(formData as any)[key]}
                  onChange={e => handleChange(key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            {[
              { label: 'Type', key: 'type', opts: types },
              { label: 'Section', key: 'section', opts: sections },
              { label: 'Status', key: 'status', opts: statuses },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <select value={(formData as any)[key]} onChange={e => handleChange(key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {opts.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <select value={formData.level} onChange={e => handleChange('level', e.target.value)}
                disabled={formData.type !== 'student'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                {formData.type === 'student'
                  ? levels.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)
                  : <option value="all">All</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <input type="text" required value={formData.class} onChange={e => handleChange('class', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(['timeIn', 'timeOut'] as const).map((k) => (
                <div key={k}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {k === 'timeIn' ? 'Time In' : 'Time Out'}
                  </label>
                  <input type="time" value={formData[k]} onChange={e => handleChange(k, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-4">
              <button type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md">
                {record ? 'Update' : 'Add'} Record
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LessonAttendanceDashboard;