import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Eye, Edit, Trash2, CheckCircle, Award, FileText,
  Filter, Search, User, AlertCircle, Plus, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, Download,
  RefreshCw, Clock, X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import ResultService, {
  AnyTermReport,
  EducationLevelType,
  ResultStatus,
  NurseryTermReport,
} from '@/services/ResultService';
import AddResultForm from './AddResultForm';
import EditResultForm from './EditResultForm';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const EDUCATION_LEVELS: EducationLevelType[] = [
  'NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY',
];

const LEVEL_LABELS: Record<EducationLevelType, string> = {
  NURSERY: 'Nursery',
  PRIMARY: 'Primary',
  JUNIOR_SECONDARY: 'Junior Secondary',
  SENIOR_SECONDARY: 'Senior Secondary',
};

const LEVEL_COLORS: Record<EducationLevelType, string> = {
  NURSERY: 'bg-pink-100 text-pink-800 border-pink-200',
  PRIMARY: 'bg-blue-100 text-blue-800 border-blue-200',
  JUNIOR_SECONDARY: 'bg-amber-100 text-amber-800 border-amber-200',
  SENIOR_SECONDARY: 'bg-purple-100 text-purple-800 border-purple-200',
};

const STATUS_CONFIG: Record<ResultStatus, { label: string; color: string; dot: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  APPROVED: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  PUBLISHED: { label: 'Published', color: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type EnrichedReport = AnyTermReport & { education_level: EducationLevelType };

interface Filters {
  search: string;
  status: ResultStatus | 'all';
  level: EducationLevelType | 'all';
  session: string;
  term: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatScore(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return 'N/A';
  return `${n.toFixed(1)}%`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getAvgScore(report: AnyTermReport): number {
  return ResultService.getAverageScore(report);
}

function getTotalStudents(report: AnyTermReport): number {
  return ResultService.getTotalStudents(report);
}

function getSubjectCount(report: AnyTermReport): number {
  if ('total_subjects' in report) return (report as NurseryTermReport).total_subjects;
  return report.subject_results?.length ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ResultStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function LevelBadge({ level }: { level: EducationLevelType }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${LEVEL_COLORS[level]}`}>
      {LEVEL_LABELS[level]}
    </span>
  );
}

function GradeChip({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: 'text-emerald-700 bg-emerald-50',
    B: 'text-blue-700 bg-blue-50',
    C: 'text-amber-700 bg-amber-50',
    D: 'text-orange-700 bg-orange-50',
    E: 'text-red-600 bg-red-50',
    F: 'text-red-800 bg-red-100',
  };
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${colors[grade] || 'text-slate-600 bg-slate-50'}`}>
      {grade || '—'}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────

function DetailModal({ report, level, onClose, onApprove, onPublish, onDownload }: {
  report: EnrichedReport; level: EducationLevelType;
  onClose: () => void; onApprove: () => void; onPublish: () => void; onDownload: () => void;
}) {
  const avgScore = getAvgScore(report);
  const overallGrade = ResultService.getOverallGrade(report);
  const isNursery = level === 'NURSERY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{report.student?.full_name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <LevelBadge level={level} />
              <span className="text-sm text-slate-500">{report.student?.student_class_name}</span>
              <span className="text-slate-300">•</span>
              <span className="text-sm text-slate-500">{report.exam_session?.term_name}</span>
              <span className="text-slate-300">•</span>
              <span className="text-sm text-slate-500">{report.exam_session?.academic_session?.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {report.status === 'DRAFT' && (
              <button onClick={onApprove} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            )}
            {report.status === 'APPROVED' && (
              <button onClick={onPublish} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors">
                <Award className="w-4 h-4" /> Publish
              </button>
            )}
            <button onClick={onDownload} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors">
              <Download className="w-4 h-4" /> PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{formatScore(avgScore)}</p>
              <p className="text-xs text-slate-500 mt-1">{isNursery ? 'Overall %' : 'Average'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <GradeChip grade={overallGrade} />
              <p className="text-xs text-slate-500 mt-2">Grade</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">
                {report.class_position ? `${report.class_position}/${getTotalStudents(report)}` : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Position</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <StatusBadge status={report.status} />
              <p className="text-xs text-slate-500 mt-2">Status</p>
            </div>
          </div>

          {/* Subject results */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Subject Results ({report.subject_results?.length ?? 0})
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Subject</th>
                    {isNursery ? (
                      <>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Marks</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Max</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">CA</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Total</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">%</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Grade</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Result</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(report.subject_results ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No subject results</td></tr>
                  ) : (
                    (report.subject_results ?? []).map((sr, i) => (
                      <tr key={sr.id || i} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{sr.subject?.name}</div>
                          <div className="text-xs text-slate-400">{sr.subject?.code}</div>
                        </td>
                        {isNursery ? (
                          <>
                            <td className="px-4 py-3 text-center font-medium text-slate-700">{(sr as any).mark_obtained ?? '—'}</td>
                            <td className="px-4 py-3 text-center text-slate-500">{(sr as any).max_marks_obtainable ?? '—'}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-center text-slate-700">{parseFloat(sr.ca_total || '0').toFixed(1)}</td>
                            <td className="px-4 py-3 text-center font-medium text-slate-900">{parseFloat(sr.total_score || '0').toFixed(1)}</td>
                            <td className="px-4 py-3 text-center text-slate-700">{formatScore(sr.percentage)}</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-center"><GradeChip grade={sr.grade} /></td>
                        <td className="px-4 py-3 text-center">
                          {sr.is_passed
                            ? <span className="text-emerald-600 font-semibold text-xs">Pass</span>
                            : <span className="text-red-500 font-semibold text-xs">Fail</span>}
                        </td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={sr.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Component score breakdown */}
          {!isNursery && report.subject_results?.some((sr) => sr.component_scores?.length > 0) && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Score Breakdown</h3>
              <div className="space-y-3">
                {report.subject_results.map((sr) =>
                  sr.component_scores?.length > 0 ? (
                    <div key={sr.id} className="bg-slate-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-slate-700 mb-2">{sr.subject?.name}</p>
                      <div className="flex flex-wrap gap-2">
                        {sr.component_scores.map((cs) => (
                          <div key={cs.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center min-w-[80px]">
                            <p className="text-xs text-slate-500">{cs.component_name}</p>
                            <p className="text-sm font-bold text-slate-900 mt-0.5">{cs.score}/{cs.max_score}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Remarks */}
          {(report.class_teacher_remark || report.head_teacher_remark) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.class_teacher_remark && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Class Teacher Remark</p>
                  <p className="text-sm text-blue-900">{report.class_teacher_remark}</p>
                </div>
              )}
              {report.head_teacher_remark && (
                <div className="bg-violet-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-violet-700 mb-1">Head Teacher Remark</p>
                  <p className="text-sm text-violet-900">{report.head_teacher_remark}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE MODAL
// ─────────────────────────────────────────────────────────────────────────────

function DeleteModal({ report, onConfirm, onCancel, loading }: {
  report: EnrichedReport; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Delete Term Report</h3>
            <p className="text-sm text-slate-500">This cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-6">
          Delete the term report for <strong>{report.student?.full_name}</strong>?
          All subject results will also be deleted.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const EnhancedResultsManagement: React.FC = () => {
  const [reports, setReports] = useState<EnrichedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>({
    search: '', status: 'all', level: 'all', session: 'all', term: 'all',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modals
  const [detailReport, setDetailReport] = useState<EnrichedReport | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedReport | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editTarget, setEditTarget] = useState<{ report: EnrichedReport; subjectResult: any } | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadReports = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await ResultService.getAllTermReports();
      setReports(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load results.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => { setCurrentPage(1); }, [filters, pageSize]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const uniqueSessions = useMemo(() =>
    Array.from(new Set(reports.map((r) => r.exam_session?.academic_session?.name).filter(Boolean) as string[])),
    [reports]
  );
  const uniqueTerms = useMemo(() =>
    Array.from(new Set(reports.map((r) => r.exam_session?.term_name).filter(Boolean) as string[])),
    [reports]
  );

  const filtered = useMemo(() => reports.filter((r) => {
    if (filters.search &&
      !r.student?.full_name?.toLowerCase().includes(filters.search.toLowerCase()) &&
      !r.student?.student_class_name?.toLowerCase().includes(filters.search.toLowerCase()))
      return false;
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.level !== 'all' && r.education_level !== filters.level) return false;
    if (filters.session !== 'all' && r.exam_session?.academic_session?.name !== filters.session) return false;
    if (filters.term !== 'all' && r.exam_session?.term_name !== filters.term) return false;
    return true;
  }), [reports, filters]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const counts = useMemo(() => ({
    total: reports.length,
    draft: reports.filter((r) => r.status === 'DRAFT').length,
    approved: reports.filter((r) => r.status === 'APPROVED').length,
    published: reports.filter((r) => r.status === 'PUBLISHED').length,
  }), [reports]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleApprove = async (report: EnrichedReport) => {
    setActionLoading(report.id);
    try {
      await ResultService.approveTermReport(report.education_level, report.id);
      toast.success('Term report approved');
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: 'APPROVED' as ResultStatus } : r));
      if (detailReport?.id === report.id) setDetailReport((p) => p ? { ...p, status: 'APPROVED' as ResultStatus } : null);
    } catch (err: any) { toast.error(err?.message || 'Failed to approve'); }
    finally { setActionLoading(null); }
  };

  const handlePublish = async (report: EnrichedReport) => {
    setActionLoading(report.id);
    try {
      await ResultService.publishTermReport(report.education_level, report.id);
      toast.success('Term report published');
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: 'PUBLISHED' as ResultStatus } : r));
      if (detailReport?.id === report.id) setDetailReport((p) => p ? { ...p, status: 'PUBLISHED' as ResultStatus } : null);
    } catch (err: any) { toast.error(err?.message || 'Failed to publish'); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (report: EnrichedReport) => {
    setActionLoading('delete');
    try {
      await ResultService.deleteTermReport(report.education_level, report.id);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setDeleteTarget(null);
      toast.success('Term report deleted');
    } catch (err: any) { toast.error(err?.message || 'Failed to delete'); }
    finally { setActionLoading(null); }
  };

  const handleBulkApprove = async () => {
    setActionLoading('bulk');
    try {
      const byLevel = new Map<EducationLevelType, string[]>();
      for (const id of selectedIds) {
        const r = reports.find((x) => x.id === id);
        if (!r) continue;
        const list = byLevel.get(r.education_level) || [];
        list.push(id);
        byLevel.set(r.education_level, list);
      }
      let total = 0;
      for (const [level, ids] of byLevel) {
        const res = await ResultService.bulkApproveTermReports(level, ids);
        total += res.approved_reports;
      }
      setReports((prev) => prev.map((r) =>
        selectedIds.includes(r.id) && r.status === 'DRAFT' ? { ...r, status: 'APPROVED' as ResultStatus } : r
      ));
      setSelectedIds([]);
      toast.success(`${total} report(s) approved`);
    } catch (err: any) { toast.error(err?.message || 'Bulk approve failed'); }
    finally { setActionLoading(null); }
  };

  const handleBulkPublish = async () => {
    setActionLoading('bulk');
    try {
      const byLevel = new Map<EducationLevelType, string[]>();
      for (const id of selectedIds) {
        const r = reports.find((x) => x.id === id);
        if (!r) continue;
        const list = byLevel.get(r.education_level) || [];
        list.push(id);
        byLevel.set(r.education_level, list);
      }
      let total = 0;
      for (const [level, ids] of byLevel) {
        const res = await ResultService.bulkPublishTermReports(level, ids);
        total += res.published_reports;
      }
      setReports((prev) => prev.map((r) =>
        selectedIds.includes(r.id) && r.status === 'APPROVED' ? { ...r, status: 'PUBLISHED' as ResultStatus } : r
      ));
      setSelectedIds([]);
      toast.success(`${total} report(s) published`);
    } catch (err: any) { toast.error(err?.message || 'Bulk publish failed'); }
    finally { setActionLoading(null); }
  };

  const handleDownloadPDF = async (report: EnrichedReport) => {
    setActionLoading(report.id + '_pdf');
    try {
      const blob = await ResultService.downloadTermReportPDF(report.id, report.education_level);
      const term = report.exam_session?.term_name?.replace(/\s/g, '_') || 'Term';
      const sess = report.exam_session?.academic_session?.name?.replace(/\s/g, '_') || 'Session';
      ResultService.triggerDownload(blob, `${report.student?.full_name}_${term}_${sess}.pdf`);
    } catch (err: any) { toast.error(err?.message || 'PDF download failed'); }
    finally { setActionLoading(null); }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === paginated.length && paginated.length > 0) setSelectedIds([]);
    else setSelectedIds(paginated.map((r) => r.id));
  };

  const getPageNumbers = (): (number | '…')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '…')[] = [];
    if (currentPage <= 4) { for (let i = 1; i <= 5; i++) pages.push(i); pages.push('…', totalPages); }
    else if (currentPage >= totalPages - 3) { pages.push(1, '…'); for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i); }
    else { pages.push(1, '…', currentPage - 1, currentPage, currentPage + 1, '…', totalPages); }
    return pages;
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-slate-700 font-medium mb-4">{error}</p>
          <button onClick={() => loadReports()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Results Management</h1>
            <p className="text-slate-500 text-sm mt-1">Review, approve, and publish student term reports</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> Record Result
            </button>
            <button
              onClick={() => loadReports(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm transition-colors ${
                showFilters ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-300 text-slate-600 hover:bg-white'
              }`}
            >
              <Filter className="w-4 h-4" /> Filters
              {(filters.status !== 'all' || filters.level !== 'all' || filters.session !== 'all' || filters.term !== 'all' || filters.search) && (
                <span className="w-2 h-2 rounded-full bg-violet-500" />
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Reports" value={counts.total} icon={FileText} color="bg-slate-600" />
          <StatCard label="Draft" value={counts.draft} icon={Clock} color="bg-amber-500" sub="Awaiting approval" />
          <StatCard label="Approved" value={counts.approved} icon={CheckCircle} color="bg-emerald-500" sub="Ready to publish" />
          <StatCard label="Published" value={counts.published} icon={Award} color="bg-violet-600" sub="Visible to students" />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student or class…"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none"
                />
              </div>
              {(['status', 'level', 'session', 'term'] as const).map((key) => (
                <select
                  key={key}
                  value={filters[key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                >
                  {key === 'status' && (
                    <>
                      <option value="all">All Statuses</option>
                      <option value="DRAFT">Draft</option>
                      <option value="APPROVED">Approved</option>
                      <option value="PUBLISHED">Published</option>
                    </>
                  )}
                  {key === 'level' && (
                    <>
                      <option value="all">All Levels</option>
                      {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                    </>
                  )}
                  {key === 'session' && (
                    <>
                      <option value="all">All Sessions</option>
                      {uniqueSessions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </>
                  )}
                  {key === 'term' && (
                    <>
                      <option value="all">All Terms</option>
                      {uniqueTerms.map((t) => <option key={t} value={t}>{t}</option>)}
                    </>
                  )}
                </select>
              ))}
            </div>
            {(filters.status !== 'all' || filters.level !== 'all' || filters.session !== 'all' || filters.term !== 'all' || filters.search) && (
              <button
                onClick={() => setFilters({ search: '', status: 'all', level: 'all', session: 'all', term: 'all' })}
                className="mt-3 text-xs text-violet-600 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Term Reports <span className="text-slate-400 font-normal">({filtered.length})</span>
            </h2>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">{selectedIds.length} selected</span>
                <button onClick={handleBulkApprove} disabled={actionLoading === 'bulk'} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </button>
                <button onClick={handleBulkPublish} disabled={actionLoading === 'bulk'} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">
                  <Award className="w-3.5 h-3.5" /> Publish
                </button>
                <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <input type="checkbox" checked={selectedIds.length === paginated.length && paginated.length > 0} onChange={handleSelectAll} className="rounded border-slate-300 text-violet-600 focus:ring-violet-400" />
                  </th>
                  {['Student', 'Level', 'Term / Session', 'Subjects', 'Average', 'Grade', 'Position', 'Status', 'Updated', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No results found</p>
                    </td>
                  </tr>
                ) : (
                  paginated.map((report) => {
                    const avg = getAvgScore(report);
                    const grade = ResultService.getOverallGrade(report);
                    const isActing = actionLoading === report.id;
                    const totalStudents = getTotalStudents(report);

                    return (
                      <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedIds.includes(report.id)} onChange={() => setSelectedIds((prev) => prev.includes(report.id) ? prev.filter((x) => x !== report.id) : [...prev, report.id])} className="rounded border-slate-300 text-violet-600 focus:ring-violet-400" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-violet-600" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 leading-tight">{report.student?.full_name || 'N/A'}</p>
                              <p className="text-xs text-slate-400">{report.student?.student_class_name || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><LevelBadge level={report.education_level} /></td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700 font-medium leading-tight">{report.exam_session?.term_name || 'N/A'}</p>
                          <p className="text-xs text-slate-400">{report.exam_session?.academic_session?.name || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{getSubjectCount(report)}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-900">{formatScore(avg)}</td>
                        <td className="px-4 py-3 text-center"><GradeChip grade={grade} /></td>
                        <td className="px-4 py-3 text-center text-slate-500 text-xs">
                          {report.class_position ? `${report.class_position}${totalStudents ? `/${totalStudents}` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={report.status} /></td>
                        <td className="px-4 py-3 text-xs text-slate-400">{formatDate(report.updated_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setDetailReport(report)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                            {/* Edit: opens edit form for the first subject result */}
                            <button
                              onClick={() => {
                                const sr = report.subject_results?.[0];
                                if (sr) setEditTarget({ report, subjectResult: sr });
                                else toast.info('No subject results to edit');
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {report.status === 'DRAFT' && (
                              <button onClick={() => handleApprove(report)} disabled={isActing} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40" title="Approve">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            {report.status === 'APPROVED' && (
                              <button onClick={() => handlePublish(report)} disabled={isActing} className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40" title="Publish">
                                <Award className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => handleDownloadPDF(report)} disabled={actionLoading === report.id + '_pdf'} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40" title="Download PDF">
                              <Download className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteTarget(report)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Show</span>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-400 outline-none">
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>Showing <strong>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)}</strong> of <strong>{filtered.length}</strong></span>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  {([
                    { icon: ChevronsLeft, action: () => setCurrentPage(1), disabled: currentPage === 1 },
                    { icon: ChevronLeft, action: () => setCurrentPage((p) => p - 1), disabled: currentPage === 1 },
                  ] as const).map(({ icon: Icon, action, disabled }, i) => (
                    <button key={i} onClick={action} disabled={disabled} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                  <div className="hidden sm:flex items-center gap-1">
                    {getPageNumbers().map((p, i) =>
                      p === '…' ? (
                        <span key={`e${i}`} className="px-2 text-slate-400">…</span>
                      ) : (
                        <button key={p} onClick={() => setCurrentPage(p as number)}
                          className={`min-w-[2.25rem] h-9 rounded-lg border text-sm font-medium transition-colors ${currentPage === p ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                          {p}
                        </button>
                      )
                    )}
                  </div>
                  {([
                    { icon: ChevronRight, action: () => setCurrentPage((p) => p + 1), disabled: currentPage === totalPages },
                    { icon: ChevronsRight, action: () => setCurrentPage(totalPages), disabled: currentPage === totalPages },
                  ] as const).map(({ icon: Icon, action, disabled }, i) => (
                    <button key={i} onClick={action} disabled={disabled} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {detailReport && (
        <DetailModal
          report={detailReport}
          level={detailReport.education_level}
          onClose={() => setDetailReport(null)}
          onApprove={() => handleApprove(detailReport)}
          onPublish={() => handlePublish(detailReport)}
          onDownload={() => handleDownloadPDF(detailReport)}
        />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteModal
          report={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          loading={actionLoading === 'delete'}
        />
      )}

      {/* Add Result Form */}
      {showAddForm && (
        <AddResultForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => { setShowAddForm(false); loadReports(true); }}
        />
      )}

      {/* Edit Result Form */}
      {editTarget && (
        <EditResultForm
          result={editTarget.subjectResult}
          educationLevel={editTarget.report.education_level}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); loadReports(true); }}
        />
      )}
    </div>
  );
};

export default EnhancedResultsManagement;