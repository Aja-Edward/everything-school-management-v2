import { useState, useEffect, useCallback } from 'react';
import ResultService from '@/services/ResultService';
import type { EducationLevelType, AnyTermReport, SessionReport, ExamSession } from '@/services/ResultService';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';
import {
  Eye, Trash2, Download, Printer, X, ChevronLeft, ChevronRight,
  CheckCircle, Globe, RefreshCw, Calculator,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatResult {
  id: string;
  education_level: EducationLevelType;
  student_id: string;
  full_name: string;
  username: string;
  student_class: string | null;
  education_level_raw: string;
  academic_session_name: string;
  term_name: string;
  total_subjects: number;
  total_score: number;
  average_score: number;
  class_position: number | null;
  total_students: number;
  subjects_passed: number;
  subjects_failed: number;
  gpa: number;
  status: string;
  remarks: string;
  next_term_begins: string;
  profile_picture?: string;
  subject_results: SubjectRow[];
  stream_name: string;
  raw: AnyTermReport;
}

interface FlatSessionReport {
  id: string;
  education_level: EducationLevelType;
  full_name: string;
  username: string;
  student_class: string | null;
  academic_session_name: string;
  overall_average: number;
  overall_grade: string;
  overall_position: number | null;
  total_students: number;
  status: string;
  raw: SessionReport;
}

interface SubjectRow {
  name: string; code: string; ca_score: number; exam_score: number;
  total_score: number; percentage: number; grade: string; remarks: string;
  stream_name?: string; stream_id?: string;
}

type ViewMode = 'term' | 'session';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const LEVELS: { value: EducationLevelType; label: string }[] = [
  { value: 'SENIOR_SECONDARY', label: 'Senior Secondary' },
  { value: 'JUNIOR_SECONDARY', label: 'Junior Secondary' },
  { value: 'PRIMARY',          label: 'Primary' },
  { value: 'NURSERY',          label: 'Nursery' },
];

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'DRAFT',     label: 'Draft' },
  { value: 'APPROVED',  label: 'Approved' },
  { value: 'PUBLISHED', label: 'Published' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTermDisplay = (t: string) =>
  ({ FIRST: '1st Term', SECOND: '2nd Term', THIRD: '3rd Term' }[(t || '').toUpperCase()] || t || '—');

const safeFloat = (v: unknown): number => { const n = Number(v); return isNaN(n) ? 0 : n; };

const gradeFromAvg = (avg: number) =>
  avg >= 80 ? 'A' : avg >= 70 ? 'B' : avg >= 60 ? 'C' : avg >= 50 ? 'D' : 'F';

const gradeColor = (g: string) => {
  if (!g || g === 'N/A') return 'bg-gray-100 text-gray-700';
  if (g.startsWith('A')) return 'bg-green-100 text-green-800';
  if (g.startsWith('B')) return 'bg-blue-100 text-blue-800';
  if (g.startsWith('C')) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const statusBadge = (s: string) =>
  s === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
  s === 'APPROVED'  ? 'bg-blue-100 text-blue-800' :
  'bg-gray-100 text-gray-700';

function flattenTermReport(report: AnyTermReport, level: EducationLevelType): FlatResult {
  const s = report.student;
  const es = report.exam_session;
  const avg = 'overall_percentage' in report
    ? safeFloat((report as any).overall_percentage)
    : safeFloat((report as any).average_score);
  const totalStudents = 'total_students_in_class' in report
    ? safeFloat((report as any).total_students_in_class)
    : safeFloat((report as any).total_students);
  const subjectResults: SubjectRow[] = ((report as any).subject_results || []).map((sr: any) => ({
    name: sr.subject?.name ?? sr.subject_name ?? 'Unknown',
    code: sr.subject?.code ?? sr.subject_code ?? '',
    ca_score: safeFloat(sr.ca_total ?? sr.mark_obtained ?? 0),
    exam_score: safeFloat(sr.exam_score ?? 0),
    total_score: safeFloat(sr.total_score ?? sr.mark_obtained ?? 0),
    percentage: safeFloat(sr.percentage ?? 0),
    grade: sr.grade ?? '',
    remarks: sr.teacher_remark ?? sr.remarks ?? '',
    stream_name: sr.stream?.name ?? sr.stream_name ?? '',
    stream_id: sr.stream?.id ?? '',
  }));
  return {
    id: report.id,
    education_level: level,
    education_level_raw: level,
    student_id: String(s.id),
    full_name: s.full_name,
    username: (s as any).username ?? (s as any).admission_number ?? '',
    student_class: s.student_class_name ?? s.student_class ?? null,
    academic_session_name: es.academic_session?.name ?? (es as any).academic_session_name ?? '',
    term_name: (es as any).term_name ?? '',
    total_subjects: safeFloat((report as any).total_subjects ?? subjectResults.length),
    total_score: safeFloat((report as any).total_score ?? 0),
    average_score: avg,
    class_position: report.class_position ?? null,
    total_students: totalStudents,
    subjects_passed: subjectResults.filter(r => r.grade && r.grade !== 'F').length,
    subjects_failed: subjectResults.filter(r => r.grade === 'F').length,
    gpa: safeFloat((report as any).gpa ?? 0),
    status: report.status ?? '',
    remarks: (report as any).class_teacher_remark ?? '',
    next_term_begins: report.next_term_begins ?? '',
    profile_picture: (s as any).profile_picture,
    subject_results: subjectResults,
    stream_name: (report as any).stream_name ?? subjectResults.find(r => r.stream_name)?.stream_name ?? '',
    raw: report,
  };
}

function flattenSessionReport(report: SessionReport, level: EducationLevelType): FlatSessionReport {
  const s = (report as any).student;
  return {
    id: report.id,
    education_level: level,
    full_name: s?.full_name ?? '—',
    username: s?.username ?? s?.admission_number ?? '—',
    student_class: s?.student_class_name ?? s?.student_class ?? null,
    academic_session_name: (report as any).academic_session?.name ?? '—',
    overall_average: safeFloat((report as any).overall_average ?? 0),
    overall_grade: (report as any).overall_grade ?? '—',
    overall_position: (report as any).overall_position ?? null,
    total_students: safeFloat((report as any).total_students ?? 0),
    status: report.status ?? '',
    raw: report,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const AdminResult = () => {
  const { settings } = useSettings();
  const schoolName    = settings?.school_name || 'School Name';
  const schoolAddress = settings?.address || '';
  const schoolLogo    = getAbsoluteUrl(settings?.logo) || '';

  // ── View mode: term reports vs session reports ────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('term');

  // ── Level tab ─────────────────────────────────────────────────────────────
  const [activeLevel, setActiveLevel] = useState<EducationLevelType>('SENIOR_SECONDARY');

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page,       setPage]       = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ── Server-side filters ───────────────────────────────────────────────────
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter,    setStatusFilter]    = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────
  const [termResults,    setTermResults]    = useState<FlatResult[]>([]);
  const [sessionResults, setSessionResults] = useState<FlatSessionReport[]>([]);
  const [examSessions,   setExamSessions]   = useState<ExamSession[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // ── Selection (bulk ops) ──────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Modals ────────────────────────────────────────────────────────────────
  const [viewTarget,   setViewTarget]   = useState<FlatResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatResult | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // ── Recalculate modal ─────────────────────────────────────────────────────
  const [showRecalc,       setShowRecalc]       = useState(false);
  const [recalcSession,    setRecalcSession]    = useState('');
  const [recalculating,    setRecalculating]    = useState(false);
  const [recalcResult,     setRecalcResult]     = useState<string | null>(null);

  // ── Bulk action state ─────────────────────────────────────────────────────
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Debounce search ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Reset page when filters/level/mode change ─────────────────────────────
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [activeLevel, debouncedSearch, statusFilter, viewMode]);

  // ── Fetch exam sessions for recalculate modal ─────────────────────────────
  useEffect(() => {
    ResultService.getExamSessions().then(setExamSessions).catch(() => {});
  }, []);

  // ── Fetch page ────────────────────────────────────────────────────────────
  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const params: Record<string, unknown> = { page, page_size: PAGE_SIZE };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter)    params.status = statusFilter;

      if (viewMode === 'term') {
        const res = await ResultService.getTermReportsPaginated(activeLevel, params);
        setTermResults(res.results.map(r => flattenTermReport(r, activeLevel)));
        setTotalCount(res.count);
      } else {
        const res = await ResultService.getSessionReportsPaginated(activeLevel, params);
        setSessionResults(res.results.map(r => flattenSessionReport(r, activeLevel)));
        setTotalCount(res.count);
      }
    } catch {
      setError('Failed to load results. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeLevel, page, debouncedSearch, statusFilter, viewMode]);

  useEffect(() => { loadPage(); }, [loadPage]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const currentIds = viewMode === 'term'
    ? termResults.map(r => r.id)
    : sessionResults.map(r => r.id);

  const allSelected = currentIds.length > 0 && currentIds.every(id => selected.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(currentIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Single approve/publish ────────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    try {
      await ResultService.approveTermReport(activeLevel, id);
      loadPage();
    } catch (e: any) {
      alert(e?.message || 'Approve failed.');
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await ResultService.publishTermReport(activeLevel, id);
      loadPage();
    } catch (e: any) {
      alert(e?.message || 'Publish failed.');
    }
  };

  // ── Bulk approve/publish ──────────────────────────────────────────────────
  const handleBulkApprove = async () => {
    if (!selected.size) return;
    setBulkLoading(true);
    try {
      const res = await ResultService.bulkApproveTermReports(activeLevel, [...selected]);
      alert(`Approved ${res.approved_reports} report(s) and ${res.approved_subject_results} subject result(s).`);
      loadPage();
    } catch (e: any) {
      alert(e?.message || 'Bulk approve failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkPublish = async () => {
    if (!selected.size) return;
    setBulkLoading(true);
    try {
      const res = await ResultService.bulkPublishTermReports(activeLevel, [...selected]);
      alert(`Published ${res.published_reports} report(s) and ${res.published_subject_results} subject result(s).`);
      loadPage();
    } catch (e: any) {
      alert(e?.message || 'Bulk publish failed.');
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Session report compute/publish ────────────────────────────────────────
  const handleCompute = async (id: string) => {
    try {
      await ResultService.computeSessionReport(activeLevel, id);
      loadPage();
    } catch (e: any) {
      alert(e?.message || 'Compute failed.');
    }
  };

  const handlePublishSession = async (id: string) => {
    try {
      await ResultService.publishSessionReport(activeLevel, id);
      loadPage();
    } catch (e: any) {
      alert(e?.message || 'Publish failed.');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await ResultService.deleteTermReport(deleteTarget.education_level, deleteTarget.id);
      setDeleteTarget(null);
      loadPage();
    } catch {
      alert('Delete failed. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Recalculate positions ─────────────────────────────────────────────────
  const handleRecalculate = async () => {
    if (!recalcSession) return;
    setRecalculating(true);
    setRecalcResult(null);
    try {
      const res = await ResultService.recalculatePositions(activeLevel, recalcSession);
      setRecalcResult(`Positions recalculated for ${res.recalculated_groups} class group(s).`);
      loadPage();
    } catch (e: any) {
      setRecalcResult(`Error: ${e?.message || 'Recalculation failed.'}`);
    } finally {
      setRecalculating(false);
    }
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageStart  = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd    = Math.min(page * PAGE_SIZE, totalCount);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Student Results Management</h2>
        <button
          onClick={() => { setShowRecalc(true); setRecalcResult(null); }}
          className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm transition-colors"
        >
          <Calculator size={15} /> Recalculate Positions
        </button>
      </div>

      {/* ── View Mode Toggle ── */}
      <div className="flex gap-1 mb-3 bg-white border rounded-lg p-1 w-fit shadow-sm">
        {([['term', 'Term Reports'], ['session', 'Session Reports']] as [ViewMode, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setViewMode(v)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === v ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Level Tabs ── */}
      <div className="flex gap-1 mb-4 bg-white border rounded-lg p-1 w-fit shadow-sm">
        {LEVELS.map(({ value, label }) => (
          <button key={value} onClick={() => setActiveLevel(value)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeLevel === value ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-3">
        <input type="text" placeholder="Search by student name…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="border px-3 py-2 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border px-3 py-2 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Bulk actions (term mode only) ── */}
      {viewMode === 'term' && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          <button onClick={handleBulkApprove} disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <CheckCircle size={13} /> Bulk Approve
          </button>
          <button onClick={handleBulkPublish} disabled={bulkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <Globe size={13} /> Bulk Publish
          </button>
          <button onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center gap-3">
          {error}
          <button onClick={loadPage} className="underline text-sm">Retry</button>
        </div>
      )}

      {/* ── TERM REPORTS TABLE ── */}
      {viewMode === 'term' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  {['Name', 'Admission No.', 'Class', 'Term', 'Session', 'Avg', 'Grade', 'Position', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                      <span className="text-gray-500 text-sm">Loading…</span>
                    </div>
                  </td></tr>
                ) : termResults.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-gray-400">
                    {debouncedSearch || statusFilter ? 'No results match your filters.' : 'No term reports recorded yet.'}
                  </td></tr>
                ) : termResults.map(r => {
                  const avg   = r.average_score;
                  const grade = avg > 0 ? gradeFromAvg(avg) : 'N/A';
                  return (
                    <tr key={r.id} className={`border-b transition-colors ${selected.has(r.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.full_name}</td>
                      <td className="px-4 py-3 text-gray-500">{r.username || '—'}</td>
                      <td className="px-4 py-3">{r.student_class || '—'}</td>
                      <td className="px-4 py-3">{getTermDisplay(r.term_name)}</td>
                      <td className="px-4 py-3">{r.academic_session_name || '—'}</td>
                      <td className="px-4 py-3 text-center font-semibold">{avg > 0 ? `${avg.toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${gradeColor(grade)}`}>{grade}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {r.class_position ? `${r.class_position}/${r.total_students}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(r.status)}`}>{r.status || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {/* Approve — only shown for DRAFT */}
                          {r.status === 'DRAFT' && (
                            <button onClick={() => handleApprove(r.id)} title="Approve"
                              className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                              <CheckCircle size={13} />
                            </button>
                          )}
                          {/* Publish — shown for DRAFT or APPROVED */}
                          {(r.status === 'DRAFT' || r.status === 'APPROVED') && (
                            <button onClick={() => handlePublish(r.id)} title="Publish"
                              className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                              <Globe size={13} />
                            </button>
                          )}
                          <button onClick={() => setViewTarget(r)} title="View report"
                            className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors">
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={() =>
                              ResultService.downloadTermReportPDF(r.id, r.education_level)
                                .then(b => ResultService.triggerDownload(b, `${r.full_name}_report.pdf`))
                                .catch(() => alert('PDF download failed'))
                            }
                            title="Download PDF"
                            className="p-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors">
                            <Download size={13} />
                          </button>
                          <button onClick={() => setDeleteTarget(r)} title="Delete"
                            className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="px-4 py-3 border-t bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-sm text-gray-600">
              {totalCount === 0 ? 'No results' : `Showing ${pageStart}–${pageEnd} of ${totalCount.toLocaleString()}`}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
                className="p-1.5 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium px-2">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
                className="p-1.5 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION REPORTS TABLE ── */}
      {viewMode === 'session' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100 border-b">
                  {['Name', 'Admission No.', 'Class', 'Session', 'Overall Avg', 'Grade', 'Position', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                      <span className="text-gray-500 text-sm">Loading…</span>
                    </div>
                  </td></tr>
                ) : sessionResults.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                    {debouncedSearch || statusFilter ? 'No session reports match your filters.' : 'No session reports computed yet.'}
                  </td></tr>
                ) : sessionResults.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.username}</td>
                    <td className="px-4 py-3">{r.student_class || '—'}</td>
                    <td className="px-4 py-3">{r.academic_session_name}</td>
                    <td className="px-4 py-3 text-center font-semibold">
                      {r.overall_average > 0 ? `${r.overall_average.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${gradeColor(r.overall_grade)}`}>
                        {r.overall_grade || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {r.overall_position ? `${r.overall_position}/${r.total_students}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(r.status)}`}>
                        {r.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => handleCompute(r.id)} title="Recompute from term reports"
                          className="p-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors">
                          <RefreshCw size={13} />
                        </button>
                        {r.status !== 'PUBLISHED' && (
                          <button onClick={() => handlePublishSession(r.id)} title="Publish"
                            className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                            <Globe size={13} />
                          </button>
                        )}
                        <button
                          onClick={() =>
                            ResultService.downloadSessionReportPDF(r.id, r.education_level)
                              .then(b => ResultService.triggerDownload(b, `${r.full_name}_session_report.pdf`))
                              .catch(() => alert('PDF download failed'))
                          }
                          title="Download PDF"
                          className="p-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors">
                          <Download size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="px-4 py-3 border-t bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-sm text-gray-600">
              {totalCount === 0 ? 'No results' : `Showing ${pageStart}–${pageEnd} of ${totalCount.toLocaleString()}`}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}
                className="p-1.5 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium px-2">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
                className="p-1.5 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Modal (term reports) ── */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto relative">
            <button onClick={() => setViewTarget(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 z-10">
              <X size={20} />
            </button>
            <div className="p-6 border-b flex items-center justify-between">
              <div className="flex items-center gap-4">
                {schoolLogo && <img src={schoolLogo} alt="" className="h-14 w-14 object-contain" />}
                <div>
                  <h1 className="text-xl font-bold">{schoolName}</h1>
                  <p className="text-sm text-gray-500">{schoolAddress}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-semibold">STUDENT REPORT CARD</h2>
                {viewTarget.next_term_begins && (
                  <p className="text-sm text-gray-500">Next Term: {viewTarget.next_term_begins}</p>
                )}
              </div>
            </div>
            <div className="p-6 border-b grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p><strong>Name:</strong> {viewTarget.full_name}</p>
                <p><strong>Class:</strong> {viewTarget.student_class || 'N/A'}</p>
                {viewTarget.stream_name && <p><strong>Stream:</strong> {viewTarget.stream_name}</p>}
              </div>
              <div className="space-y-1">
                <p><strong>Session:</strong> {viewTarget.academic_session_name || 'N/A'}</p>
                <p><strong>Term:</strong> {getTermDisplay(viewTarget.term_name)}</p>
                <p><strong>Position:</strong>{' '}
                  {viewTarget.class_position && viewTarget.total_students
                    ? `${viewTarget.class_position} of ${viewTarget.total_students}` : 'N/A'}
                </p>
                <p><strong>Subjects:</strong> {viewTarget.total_subjects}</p>
              </div>
            </div>
            <div className="p-6">
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    {['S/N','Subject','CA','Exam','Total','%','Grade','Remarks'].map(h => (
                      <th key={h} className="border border-gray-300 px-3 py-2 text-center font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewTarget.subject_results.map((sr, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2 text-center">{i + 1}</td>
                      <td className="border border-gray-300 px-3 py-2">{sr.name}</td>
                      <td className="border border-gray-300 px-3 py-2 text-center">{sr.ca_score}</td>
                      <td className="border border-gray-300 px-3 py-2 text-center">{sr.exam_score}</td>
                      <td className="border border-gray-300 px-3 py-2 text-center font-semibold">{sr.total_score}</td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {sr.percentage > 0 ? `${sr.percentage.toFixed(1)}%` : '—'}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${gradeColor(sr.grade)}`}>{sr.grade || '—'}</span>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">{sr.remarks || '—'}</td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, 15 - viewTarget.subject_results.length) }, (_, i) => (
                    <tr key={`pad-${i}`}>
                      <td className="border border-gray-300 px-3 py-2 text-center text-gray-300">
                        {viewTarget.subject_results.length + i + 1}
                      </td>
                      {Array.from({ length: 7 }, (_, j) => (
                        <td key={j} className="border border-gray-300 px-3 py-2" />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 pb-4 grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p><strong>Total Score:</strong> {viewTarget.total_score}</p>
                <p><strong>Average:</strong>{' '}
                  {viewTarget.average_score > 0 ? `${viewTarget.average_score.toFixed(1)}%` : 'N/A'}
                </p>
                {viewTarget.gpa > 0 && <p><strong>GPA:</strong> {viewTarget.gpa.toFixed(2)}</p>}
              </div>
              <div className="space-y-1">
                <p><strong>Passed:</strong> {viewTarget.subjects_passed}</p>
                <p><strong>Failed:</strong> {viewTarget.subjects_failed}</p>
              </div>
            </div>
            {viewTarget.remarks && (
              <div className="px-6 pb-4 text-sm"><strong>Teacher's Remark:</strong> {viewTarget.remarks}</div>
            )}
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              {viewTarget.status === 'DRAFT' && (
                <button onClick={() => { handleApprove(viewTarget.id); setViewTarget(null); }}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 text-sm">
                  <CheckCircle size={15} /> Approve
                </button>
              )}
              {(viewTarget.status === 'DRAFT' || viewTarget.status === 'APPROVED') && (
                <button onClick={() => { handlePublish(viewTarget.id); setViewTarget(null); }}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2 text-sm">
                  <Globe size={15} /> Publish
                </button>
              )}
              <button onClick={() => window.print()}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 flex items-center gap-2 text-sm">
                <Printer size={15} /> Print
              </button>
              <button
                onClick={() =>
                  ResultService.downloadTermReportPDF(viewTarget.id, viewTarget.education_level)
                    .then(b => ResultService.triggerDownload(b, `${viewTarget.full_name}_report.pdf`))
                    .catch(() => alert('PDF download failed'))
                }
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center gap-2 text-sm">
                <Download size={15} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Delete the term report for <strong>{deleteTarget.full_name}</strong>?{' '}
              This removes all subject results for that term and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recalculate Positions Modal ── */}
      {showRecalc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calculator size={18} /> Recalculate Class Positions
              </h3>
              <button onClick={() => setShowRecalc(false)} className="text-gray-500 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Re-ranks all <strong>Approved</strong> and <strong>Published</strong> term reports
              for the selected exam session using SQL RANK(). Only affects the current level tab:
              <strong> {LEVELS.find(l => l.value === activeLevel)?.label}</strong>.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exam Session</label>
            <select value={recalcSession} onChange={e => setRecalcSession(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select exam session…</option>
              {examSessions.map(es => (
                <option key={es.id} value={es.id}>{es.name}</option>
              ))}
            </select>
            {recalcResult && (
              <div className={`text-sm px-3 py-2 rounded mb-4 ${
                recalcResult.startsWith('Error')
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {recalcResult}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRecalc(false)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm">
                Close
              </button>
              <button onClick={handleRecalculate} disabled={!recalcSession || recalculating}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm flex items-center gap-2">
                {recalculating
                  ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> Recalculating…</>
                  : <><Calculator size={14} /> Recalculate</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminResult;
