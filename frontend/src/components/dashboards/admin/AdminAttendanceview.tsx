/**
 * Admin AttendanceDashboard
 *
 * Changes
 * ───────
 * #3  Stats card hits /stats/ endpoint — no client-side counting
 * #7  All filtering + pagination is server-side via query params
 * #10 PDF export calls backend /export-pdf/ (WeasyPrint)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Edit, Trash2, Users, Calendar,
  Download, Eye, X, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import {
  getAttendance,
  deleteAttendance,
  updateAttendance,
  addAttendance,
  getAttendanceStats,
  AttendanceStatusMap,
  AttendanceCodeToStatusMap,
  AttendanceFilters,
  AttendanceRecord,
  AttendanceStatistics,
  AttendanceSession,
} from '@/services/AttendanceService';
import StudentService, { Student } from '@/services/StudentService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UIAttendanceRecord {
  id: number;
  name: string;
  type: 'student' | 'teacher' | 'staff';
  level: string;
  studentClass: string;
  section: string;
  sectionId: number | null;
  date: string;
  session: AttendanceSession;
  sessionDisplay: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  timeIn: string;
  timeOut: string;
  stream: string;
  markedLate: boolean;
}

interface ServerFilters {
  date?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  session?: AttendanceSession;
  section?: number;
  search?: string;
  page: number;
  page_size: number;
}

const PAGE_SIZE = 25;

const SESSION_OPTIONS: { value: AttendanceSession | 'all'; label: string }[] = [
  { value: 'all',       label: 'All sessions' },
  { value: 'morning',   label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const getStatusColor = (status: string) => ({
  present: 'bg-green-100 text-green-800',
  absent:  'bg-red-100 text-red-800',
  late:    'bg-yellow-100 text-yellow-800',
  excused: 'bg-blue-100 text-blue-800',
}[status] ?? 'bg-gray-100 text-gray-800');

function mapRecord(rec: AttendanceRecord): UIAttendanceRecord {
  return {
    id:           rec.id,
    name:         rec.student_name || rec.teacher_name || `ID ${rec.student ?? rec.teacher}` || 'Unknown',
    type:         rec.student ? 'student' : rec.teacher ? 'teacher' : 'staff',
    level:        rec.student_education_level_display || '',
    studentClass: rec.student_class_display || '',
    section:      rec.section_name || '',
    sectionId:    rec.section,
    date:         rec.date,
    session:      rec.session ?? 'morning',
    sessionDisplay: rec.session_display ?? rec.session ?? 'Morning',
    status:       AttendanceCodeToStatusMap[rec.status] ?? 'absent',
    timeIn:       rec.time_in || '',
    timeOut:      rec.time_out || '',
    stream:       rec.student_stream_name || '',
    markedLate:   rec.marked_late ?? false,
  };
}

// ── Download PDF (server-side WeasyPrint) ────────────────────────────────────

async function downloadPDF(filters: ServerFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && k !== 'page' && k !== 'page_size') {
      params.append(k, String(v));
    }
  });
  params.append('title', 'Attendance Report');

  const url = `/api/attendance/attendance/export-pdf/?${params.toString()}`;
  const response = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!response.ok) throw new Error(`PDF export failed: HTTP ${response.status}`);

  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Main component ─────────────────────────────────────────────────────────────

const AttendanceDashboard: React.FC = () => {
  // Server filter state
  const [filters, setFilters] = useState<ServerFilters>({
    date:      new Date().toISOString().slice(0, 10),
    page:      1,
    page_size: PAGE_SIZE,
  });
  const [sessionFilter, setSessionFilter] = useState<AttendanceSession | 'all'>('all');
  const [search, setSearch] = useState('');

  // Data state
  const [records, setRecords]     = useState<UIAttendanceRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats]         = useState<AttendanceStatistics | null>(null);

  // UI state
  const [loading, setLoading]   = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [showModal, setShowModal]         = useState(false);
  const [editingRecord, setEditingRecord] = useState<UIAttendanceRecord | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Build API params ───────────────────────────────────────────────────────

  const buildApiParams = useCallback((): AttendanceFilters => {
    const p: AttendanceFilters = {
      page:      filters.page,
      page_size: filters.page_size,
    };
    if (filters.date)       p.date       = filters.date;
    if (filters.start_date) p.start_date = filters.start_date;
    if (filters.end_date)   p.end_date   = filters.end_date;
    if (filters.status)     p.status     = filters.status as any;
    if (sessionFilter !== 'all') p.session = sessionFilter;
    if (search.trim())      p.search     = search.trim();
    return p;
  }, [filters, sessionFilter, search]);

  // ── Load paginated records ─────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildApiParams();
      // Use raw api call to preserve count for pagination
      const res = await fetch(
        `/api/attendance/attendance/?${new URLSearchParams(
          Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
        )}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setRecords(data.map(mapRecord));
        setTotalCount(data.length);
      } else {
        setRecords((data.results ?? []).map(mapRecord));
        setTotalCount(data.count ?? 0);
      }
    } catch (err) {
      setError('Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  }, [buildApiParams]);

  // ── Load server-side stats — FIX #3 ──────────────────────────────────────

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      // Stats use same filters but no pagination
      const { page, page_size, ...statsParams } = buildApiParams();
      const data = await getAttendanceStats(statsParams);
      setStats(data);
    } catch {
      // Non-fatal — stats card shows "—" if this fails
    } finally {
      setStatsLoading(false);
    }
  }, [buildApiParams]);

  // Reload when filters / search / page changes (debounced for search)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadRecords();
      loadStats();
    }, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [loadRecords, loadStats]);

  // ── Filter helpers ─────────────────────────────────────────────────────────

  const setFilter = (key: keyof ServerFilters, value: any) =>
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));

  const handleSearch = (val: string) => {
    setSearch(val);
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this attendance record?')) return;
    setLoading(true);
    try {
      await deleteAttendance(id);
      loadRecords();
      loadStats();
    } catch {
      setError('Failed to delete record.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (formData: any) => {
    setLoading(true);
    setError(null);
    try {
      const { selectedStudent, ...rest } = formData;
      if (!selectedStudent) { setError('Please select a student.'); return; }
      if (!selectedStudent.section_id) {
        setError(`"${selectedStudent.full_name}" has no section assignment.`);
        return;
      }
      const payload = {
        student:          selectedStudent.id,
        section:          selectedStudent.section_id,
        date:             rest.date || filters.date,
        session:          rest.session || 'morning',
        status:           AttendanceStatusMap[rest.status as keyof typeof AttendanceStatusMap],
        time_in:          rest.timeIn  || null,
        time_out:         rest.timeOut || null,
        back_fill_reason: rest.backFillReason || '',
      };
      if (editingRecord) {
        await updateAttendance(editingRecord.id, payload);
      } else {
        await addAttendance(payload as any);
      }
      loadRecords();
      loadStats();
      setShowModal(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to save record.');
    } finally {
      setLoading(false);
    }
  };

  // ── Export helpers ─────────────────────────────────────────────────────────

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const { page, page_size, ...exportParams } = buildApiParams();
      const url = `/api/attendance/attendance/export-csv/?${new URLSearchParams(
        Object.entries(exportParams).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
      )}`;
      const res  = await fetch(url, { credentials: 'include' });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `attendance_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch {
      setError('CSV export failed.');
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await downloadPDF(filters);
    } catch (e: any) {
      setError(e.message || 'PDF export failed.');
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  // ── Stat display helper ────────────────────────────────────────────────────

  const statVal = (key: keyof AttendanceStatistics) =>
    statsLoading ? '…' : stats ? String(stats[key]) : '—';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-gray-50 min-h-screen p-6">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Attendance Dashboard</h1>
        <p className="text-gray-500">Manage student and staff attendance records</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Stats — from /stats/ endpoint */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total',    value: statVal('total_records'),   color: 'text-gray-900' },
          { label: 'Present',  value: statVal('present_count'),   color: 'text-green-600' },
          { label: 'Absent',   value: statVal('absent_count'),    color: 'text-red-600' },
          { label: 'Late',     value: statVal('late_count'),      color: 'text-yellow-600' },
          { label: 'Rate',     value: stats ? `${stats.attendance_rate}%` : statsLoading ? '…' : '—', color: 'text-purple-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Session breakdown */}
      {stats?.session_breakdown && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Session breakdown</p>
          <div className="grid grid-cols-2 gap-4">
            {(['morning', 'afternoon'] as const).map(sess => {
              const sb = stats.session_breakdown[sess];
              const total = sb.P + sb.A + sb.L + sb.E;
              return (
                <div key={sess} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-600 capitalize mb-2">{sess}</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { code: 'P', label: 'Present',  color: 'text-green-600'  },
                      { code: 'A', label: 'Absent',   color: 'text-red-600'    },
                      { code: 'L', label: 'Late',     color: 'text-yellow-600' },
                      { code: 'E', label: 'Excused',  color: 'text-blue-600'   },
                    ].map(({ code, label, color }) => (
                      <div key={code}>
                        <p className={`text-lg font-bold ${color}`}>{sb[code as keyof typeof sb]}</p>
                        <p className="text-xs text-gray-400">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={filters.date || ''}
              onChange={e => setFilter('date', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date range from */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={filters.start_date || ''}
              onChange={e => {
                setFilter('start_date', e.target.value || undefined);
                setFilter('date', undefined as any);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date range to */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={filters.end_date || ''}
              onChange={e => setFilter('end_date', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Session */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Session</label>
            <select
              value={sessionFilter}
              onChange={e => { setSessionFilter(e.target.value as any); setFilters(prev => ({ ...prev, page: 1 })); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SESSION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={filters.status || 'all'}
              onChange={e => setFilter('status', e.target.value === 'all' ? undefined : e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="P">Present</option>
              <option value="A">Absent</option>
              <option value="L">Late</option>
              <option value="E">Excused</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <Search className="absolute left-3 top-8 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Name..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingRecord(null); setShowModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add record
            </button>
            <button
              onClick={() => { loadRecords(); loadStats(); }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>

          {/* Export menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
                <button onClick={handleExportCSV}
                  className="w-full px-4 py-3 text-sm text-left text-gray-700 hover:bg-gray-50 border-b border-gray-100">
                  CSV download
                </button>
                <button onClick={handleExportPDF}
                  className="w-full px-4 py-3 text-sm text-left text-gray-700 hover:bg-gray-50">
                  PDF report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading records…</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name','Level','Class','Section','Date','Session','Status','Time in','Time out','Back-filled','Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-400">No records found</td></tr>
                  ) : records.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.level || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.studentClass || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.section || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.date}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          r.session === 'morning' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
                        }`}>
                          {r.sessionDisplay}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.timeIn || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.timeOut || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {r.markedLate && (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            Back-filled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setEditingRecord(r); setShowModal(true); }}
                            className="text-blue-600 hover:text-blue-800">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(r.id)}
                            className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Showing {(filters.page - 1) * PAGE_SIZE + 1}–{Math.min(filters.page * PAGE_SIZE, totalCount)} of {totalCount} records
                </p>
                <div className="flex items-center gap-1">
                  <button
                    disabled={filters.page <= 1}
                    onClick={() => setFilter('page', filters.page - 1)}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-3 text-sm text-gray-700">
                    {filters.page} / {totalPages}
                  </span>
                  <button
                    disabled={filters.page >= totalPages}
                    onClick={() => setFilter('page', filters.page + 1)}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <AttendanceModal
          record={editingRecord}
          defaultDate={filters.date || new Date().toISOString().slice(0, 10)}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

// ── Add/Edit modal ────────────────────────────────────────────────────────────

interface ModalProps {
  record: UIAttendanceRecord | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (data: any) => void;
}

const AttendanceModal: React.FC<ModalProps> = ({ record, defaultDate, onClose, onSave }) => {
  const [date, setDate]             = useState(record?.date || defaultDate);
  const [session, setSession]       = useState<AttendanceSession>(record?.session || 'morning');
  const [status, setStatus]         = useState(record?.status || 'present');
  const [timeIn, setTimeIn]         = useState(record?.timeIn || '');
  const [timeOut, setTimeOut]       = useState(record?.timeOut || '');
  const [backFillReason, setBackFillReason] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentQuery, setStudentQuery]       = useState(record?.name || '');
  const [studentOptions, setStudentOptions]   = useState<Student[]>([]);
  const [studentLoading, setStudentLoading]   = useState(false);

  const isBackFill = date < new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (studentQuery.length < 2) { setStudentOptions([]); return; }
    setStudentLoading(true);
    StudentService.searchStudents(studentQuery)
      .then(s => setStudentOptions(s))
      .finally(() => setStudentLoading(false));
  }, [studentQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ selectedStudent, date, session, status, timeIn, timeOut, backFillReason });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold">{record ? 'Edit' : 'Add'} attendance record</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Student search (create only) */}
          {!record && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
              <input
                type="text"
                value={studentQuery}
                onChange={e => setStudentQuery(e.target.value)}
                placeholder="Search by name or username…"
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {studentLoading && <p className="text-xs text-gray-400 mt-1">Searching…</p>}
              {studentOptions.length > 0 && (
                <ul className="border rounded-lg bg-white mt-1 max-h-40 overflow-y-auto shadow-lg">
                  {studentOptions.map(s => (
                    <li key={s.id}
                      onClick={() => { setSelectedStudent(s); setStudentQuery(s.full_name); setStudentOptions([]); }}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">
                      {s.full_name} <span className="text-gray-400">({s.email || s.id})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Date — unrestricted for back-fill */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
              {isBackFill && (
                <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                  Back-filling past date
                </span>
              )}
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Session */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session</label>
            <div className="grid grid-cols-2 gap-3">
              {(['morning', 'afternoon'] as const).map(s => (
                <label key={s}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    session === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <input type="radio" name="session" value={s} checked={session === s}
                    onChange={() => setSession(s)} className="sr-only" />
                  <span className="text-sm font-medium capitalize">{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as 'present' | 'absent' | 'late' | 'excused')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {['present', 'absent', 'late', 'excused'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-4">
            {[{ label: 'Time in', val: timeIn, set: setTimeIn }, { label: 'Time out', val: timeOut, set: setTimeOut }].map(({ label, val, set }) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="time" value={val} onChange={e => set(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
          </div>

          {/* Back-fill reason */}
          {isBackFill && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for back-filling <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={backFillReason}
                onChange={e => setBackFillReason(e.target.value)}
                rows={2}
                placeholder="e.g. School joined mid-term; populating historical records."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm font-medium">
              {record ? 'Update' : 'Add'} record
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendanceDashboard;