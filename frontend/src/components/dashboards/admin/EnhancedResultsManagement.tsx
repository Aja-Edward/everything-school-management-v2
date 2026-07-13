import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Eye, Edit, Trash2, CheckCircle, Award, FileText,
  Search, User, AlertCircle, Plus, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, Download,
  RefreshCw, Clock, X, BookOpen, List,
} from 'lucide-react';
import { toast } from 'react-toastify';
import ResultService, {
  AnyTermReport,
  EducationLevelType,
  ResultStatus,
  NurseryTermReport,
  TermReportParams,
  PaginatedTermReports,
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
  NURSERY:           'Nursery',
  PRIMARY:           'Primary',
  JUNIOR_SECONDARY:  'Junior Secondary',
  SENIOR_SECONDARY:  'Senior Secondary',
};

const LEVEL_COLORS: Record<EducationLevelType, string> = {
  NURSERY:           'bg-pink-100 text-pink-800 border-pink-200',
  PRIMARY:           'bg-blue-100 text-blue-800 border-blue-200',
  JUNIOR_SECONDARY:  'bg-amber-100 text-amber-800 border-amber-200',
  SENIOR_SECONDARY:  'bg-purple-100 text-purple-800 border-purple-200',
};

const STATUS_CONFIG: Record<ResultStatus, { label: string; color: string; dot: string }> = {
  DRAFT:     { label: 'Draft',     color: 'bg-slate-100  text-slate-700   border-slate-200',   dot: 'bg-slate-400'   },
  APPROVED:  { label: 'Approved',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  PUBLISHED: { label: 'Published', color: 'bg-violet-100  text-violet-700  border-violet-200',  dot: 'bg-violet-500'  },
};

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-700 bg-emerald-50',
  A:    'text-emerald-700 bg-emerald-50',
  B:    'text-blue-700    bg-blue-50',
  C:    'text-amber-700   bg-amber-50',
  D:    'text-orange-700  bg-orange-50',
  E:    'text-red-600     bg-red-50',
  F:    'text-red-800     bg-red-100',
};

// Subject-results page size is fixed; term-reports page size is user-selectable.
const SR_PAGE_SIZE = 25;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type EnrichedReport = AnyTermReport & { education_level: EducationLevelType };

type TermTab = 'FIRST' | 'SECOND' | 'THIRD' | 'SESSION';

interface TrFilters {
  search: string;
  status: ResultStatus | 'all';
  level:  EducationLevelType | 'all';
  session: string;
  term:    string;
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
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function getAvgScore(report: AnyTermReport): number {
  const stored = ResultService.getAverageScore(report);
  if (stored > 0) return stored;
  const srs: any[] = (report.subject_results ?? []) as any[];
  if (srs.length === 0) return 0;
  const sum = srs.reduce((s: number, sr: any) => s + (parseFloat(sr.total_score || '0') || 0), 0);
  return parseFloat((sum / srs.length).toFixed(2));
}

function getOverallGrade(report: AnyTermReport): string {
  const stored = ResultService.getOverallGrade(report);
  if (stored && stored !== 'N/A' && stored !== '') return stored;
  const avg = getAvgScore(report);
  if (avg <= 0) return '—';
  if (avg >= 95) return 'A+';
  if (avg >= 80) return 'A';
  if (avg >= 70) return 'B';
  if (avg >= 60) return 'C';
  if (avg >= 50) return 'D';
  if (avg >= 40) return 'E';
  return 'F';
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
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
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
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${GRADE_COLORS[grade] ?? 'text-slate-600 bg-slate-50'}`}>
      {grade || '—'}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
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
  report: EnrichedReport;
  level: EducationLevelType;
  onClose: () => void;
  onApprove: () => void;
  onPublish: () => void;
  onDownload: () => void;
}) {
  const avgScore     = getAvgScore(report);
  const overallGrade = getOverallGrade(report);
  const isNursery    = level === 'NURSERY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
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
              <button
                onClick={onApprove}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
            )}
            {report.status === 'APPROVED' && (
              <button
                onClick={onPublish}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
              >
                <Award className="w-4 h-4" /> Publish
              </button>
            )}
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" /> PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">

          {/* Summary tiles */}
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
                {report.class_position
                  ? `${report.class_position}/${getTotalStudents(report)}`
                  : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Position</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <StatusBadge status={report.status} />
              <p className="text-xs text-slate-500 mt-2">Status</p>
            </div>
          </div>

          {/* Subject results table */}
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
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">No subject results</td>
                    </tr>
                  ) : (
                    (report.subject_results ?? []).map((sr, i) => (
                      <tr key={sr.id ?? i} className="hover:bg-slate-50">
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

          {/* Score breakdown */}
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
  report: EnrichedReport;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
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
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-xl text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('…', total);
  } else if (current >= total - 3) {
    pages.push(1, '…');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1, '…', current - 1, current, current + 1, '…', total);
  }
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const EnhancedResultsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'term-reports' | 'subject-results'>('subject-results');

  // ── Term Reports ──────────────────────────────────────────────────────────
  const [reports, setReports]           = useState<EnrichedReport[]>([]);
  const [trLoading, setTrLoading]       = useState(true);
  const [trRefreshing, setTrRefreshing] = useState(false);
  const [trError, setTrError]           = useState<string | null>(null);
  const [trTotalCount, setTrTotalCount] = useState(0);
  // Server-side status counts (accurate across all pages)
  const [trDraftCount, setTrDraftCount]         = useState(0);
  const [trApprovedCount, setTrApprovedCount]   = useState(0);
  const [trPublishedCount, setTrPublishedCount] = useState(0);

  const [trFilters, setTrFilters] = useState<TrFilters>({
    search: '', status: 'all', level: 'all', session: 'all', term: 'all',
  });
  const [trSelectedIds, setTrSelectedIds] = useState<string[]>([]);
  const [trCurrentPage, setTrCurrentPage] = useState(1);
  const [trPageSize, setTrPageSize]       = useState(20);
  const [trTermTab, setTrTermTab]         = useState<TermTab>('FIRST');

  // Modals
  const [detailReport, setDetailReport] = useState<EnrichedReport | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedReport | null>(null);
  const [showAddForm, setShowAddForm]   = useState(false);
  const [editTarget, setEditTarget]     = useState<{ report: EnrichedReport; subjectResult: any } | null>(null);
  const [trActionLoading, setTrActionLoading] = useState<string | null>(null);

  // ── Subject Results ───────────────────────────────────────────────────────
  const [subjectResults, setSubjectResults]         = useState<any[]>([]);
  const [srLoading, setSrLoading]                   = useState(false);
  const [srSelectedIds, setSrSelectedIds]           = useState<string[]>([]);
  const [srFilterStatus, setSrFilterStatus]         = useState<string>('all');
  const [srFilterLevel, setSrFilterLevel]           = useState<EducationLevelType | 'all'>('all');
  const [srSearch, setSrSearch]                     = useState('');
  const [srActionLoading, setSrActionLoading]       = useState<string | null>(null);
  const [srTermTab, setSrTermTab]                   = useState<TermTab>('FIRST');
  const [srSelectedSession, setSrSelectedSession]   = useState('');
  const [srCurrentPage, setSrCurrentPage]           = useState(1);
  const [srTotalCount, setSrTotalCount]             = useState(0);
  const [srDraftCount, setSrDraftCount]             = useState(0);
  const [srApprovedCount, setSrApprovedCount]       = useState(0);
  const [srPublishedCount, setSrPublishedCount]     = useState(0);

  // ── Derived ───────────────────────────────────────────────────────────────

  const trTotalPages = Math.ceil(trTotalCount / trPageSize);
  const srTotalPages = Math.ceil(srTotalCount / SR_PAGE_SIZE);

  // Unique session/term values derived from the current page (used for SESSION dropdowns)
  const uniqueTrSessions = useMemo(
    () => Array.from(new Set(reports.map((r) => r.exam_session?.academic_session?.name).filter(Boolean) as string[])),
    [reports],
  );
  const uniqueTrTerms = useMemo(
    () => Array.from(new Set(reports.map((r) => r.exam_session?.term_name).filter(Boolean) as string[])),
    [reports],
  );

  // ── Load Term Reports ─────────────────────────────────────────────────────

  const loadTermReports = useCallback(async (silent = false) => {
    if (silent) setTrRefreshing(true);
    else setTrLoading(true);
    setTrError(null);

    const termNameMap: Record<string, string> = {
      FIRST: 'First', SECOND: 'Second', THIRD: 'Third',
    };

    const baseParams = {
      ...(trFilters.status !== 'all' && { status: trFilters.status as ResultStatus }),
      ...(trFilters.search  !== ''   && { search: trFilters.search }),
      ...(trFilters.level   !== 'all' && { level: trFilters.level as EducationLevelType }),
      ...(trTermTab !== 'SESSION'    && { term_name: termNameMap[trTermTab] }),
      ...(trTermTab === 'SESSION' && trFilters.session !== 'all' && { session_name: trFilters.session }),
      ...(trTermTab === 'SESSION' && trFilters.term    !== 'all' && { term_name:    trFilters.term }),
    };

    try {
      const [mainRes, draftRes, approvedRes, publishedRes] = await Promise.all([
        ResultService.getAllTermReports({ ...baseParams, page: trCurrentPage, page_size: trPageSize } as TermReportParams & { level?: EducationLevelType }),
        ResultService.getAllTermReports({ ...baseParams, status: 'DRAFT',     page: 1, page_size: 1 } as any),
        ResultService.getAllTermReports({ ...baseParams, status: 'APPROVED',  page: 1, page_size: 1 } as any),
        ResultService.getAllTermReports({ ...baseParams, status: 'PUBLISHED', page: 1, page_size: 1 } as any),
      ]);

      setReports(mainRes.results as EnrichedReport[]);
      setTrTotalCount(mainRes.count);
      setTrDraftCount(draftRes.count);
      setTrApprovedCount(approvedRes.count);
      setTrPublishedCount(publishedRes.count);
    } catch (err: any) {
      setTrError(err?.message || 'Failed to load results.');
    } finally {
      setTrLoading(false);
      setTrRefreshing(false);
    }
  }, [trCurrentPage, trPageSize, trFilters, trTermTab]);

  useEffect(() => { loadTermReports(); }, [loadTermReports]);

  // Reset to page 1 when filters or term tab changes
  useEffect(() => { setTrCurrentPage(1); }, [trFilters, trTermTab, trPageSize]);

  // ── Load Subject Results ──────────────────────────────────────────────────

  const loadSubjectResults = useCallback(async () => {
    setSrLoading(true);
    const termNameMap: Record<string, string> = {
      FIRST: 'First', SECOND: 'Second', THIRD: 'Third',
    };

    const baseParams = {
      ...(srFilterLevel      !== 'all' && { level:        srFilterLevel }),
      ...(srSearch           !== ''    && { search:       srSearch }),
      ...(srTermTab !== 'SESSION'      && { term_name:    termNameMap[srTermTab] }),
      ...(srTermTab === 'SESSION' && srSelectedSession && { session_name: srSelectedSession }),
    };

    try {
      const [mainRes, draftRes, approvedRes, publishedRes] = await Promise.all([
        ResultService.getAllSubjectResultsPaginated({
          ...baseParams,
          page:      srCurrentPage,
          page_size: SR_PAGE_SIZE,
          ...(srFilterStatus !== 'all' && { status: srFilterStatus }),
        }),
        ResultService.getAllSubjectResultsPaginated({ ...baseParams, status: 'DRAFT',     page: 1, page_size: 1 }),
        ResultService.getAllSubjectResultsPaginated({ ...baseParams, status: 'APPROVED',  page: 1, page_size: 1 }),
        ResultService.getAllSubjectResultsPaginated({ ...baseParams, status: 'PUBLISHED', page: 1, page_size: 1 }),
      ]);

      setSubjectResults(mainRes.results as any[]);
      setSrTotalCount(mainRes.count);
      setSrDraftCount(draftRes.count);
      setSrApprovedCount(approvedRes.count);
      setSrPublishedCount(publishedRes.count);
    } finally {
      setSrLoading(false);
    }
  }, [srCurrentPage, srFilterStatus, srFilterLevel, srSearch, srTermTab, srSelectedSession]);

  useEffect(() => {
    if (activeTab === 'subject-results') loadSubjectResults();
  }, [activeTab, loadSubjectResults]);

  // Reset to page 1 when any filter changes
  useEffect(() => { setSrCurrentPage(1); }, [srFilterLevel, srFilterStatus, srSearch, srTermTab, srSelectedSession]);

  // ── Shared refresh ────────────────────────────────────────────────────────

  const handleRefresh = () => {
    loadTermReports(true);
    if (activeTab === 'subject-results') loadSubjectResults();
  };

  // ── Recalculate positions helper ──────────────────────────────────────────

  const recalcPositions = async (affected: EnrichedReport[]) => {
    const seen   = new Set<string>();
    const combos: { level: EducationLevelType; sid: string }[] = [];
    affected.forEach((r) => {
      const sid = r.exam_session?.id;
      const key = `${r.education_level}:${sid}`;
      if (sid && !seen.has(key)) {
        seen.add(key);
        combos.push({ level: r.education_level, sid: String(sid) });
      }
    });
    for (const { level, sid } of combos) {
      await ResultService.recalculatePositions(level, sid);
    }
  };

  // ── Term Report actions ───────────────────────────────────────────────────

  const handleTrApprove = async (report: EnrichedReport) => {
    setTrActionLoading(report.id);
    try {
      await ResultService.approveTermReport(report.education_level, report.id);
      toast.success('Term report approved');
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: 'APPROVED' as ResultStatus } : r));
      if (detailReport?.id === report.id)
        setDetailReport((p) => p ? { ...p, status: 'APPROVED' as ResultStatus } : null);
      await recalcPositions([report]);
      await loadTermReports(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve');
    } finally {
      setTrActionLoading(null);
    }
  };

  const handleTrPublish = async (report: EnrichedReport) => {
    setTrActionLoading(report.id);
    try {
      await ResultService.publishTermReport(report.education_level, report.id);
      toast.success('Term report published');
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: 'PUBLISHED' as ResultStatus } : r));
      if (detailReport?.id === report.id)
        setDetailReport((p) => p ? { ...p, status: 'PUBLISHED' as ResultStatus } : null);
      await recalcPositions([report]);
      await loadTermReports(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to publish');
    } finally {
      setTrActionLoading(null);
    }
  };

  const handleTrDelete = async (report: EnrichedReport) => {
    setTrActionLoading('delete');
    try {
      await ResultService.deleteTermReport(report.education_level, report.id);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setTrTotalCount((c) => c - 1);
      setDeleteTarget(null);
      toast.success('Term report deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    } finally {
      setTrActionLoading(null);
    }
  };

  const handleTrDownloadPDF = async (report: EnrichedReport) => {
    setTrActionLoading(`${report.id}_pdf`);
    try {
      const blob = await ResultService.downloadTermReportPDF(report.id, report.education_level);
      const term = report.exam_session?.term_name?.replace(/\s/g, '_') || 'Term';
      const sess = report.exam_session?.academic_session?.name?.replace(/\s/g, '_') || 'Session';
      ResultService.triggerDownload(blob, `${report.student?.full_name}_${term}_${sess}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || 'PDF download failed');
    } finally {
      setTrActionLoading(null);
    }
  };

  const handleRecalculatePositions = async () => {
    setTrActionLoading('positions');
    try {
      await recalcPositions(reports);
      await loadTermReports(true);
      toast.success('Positions recalculated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to recalculate positions');
    } finally {
      setTrActionLoading(null);
    }
  };

  const handleTrBulkApprove = async () => {
    if (!trSelectedIds.length) return;
    setTrActionLoading('bulk');
    try {
      const byLevel = new Map<EducationLevelType, string[]>();
      for (const id of trSelectedIds) {
        const r = reports.find((x) => x.id === id);
        if (!r) continue;
        const list = byLevel.get(r.education_level) ?? [];
        list.push(id);
        byLevel.set(r.education_level, list);
      }
      let total = 0;
      for (const [level, ids] of byLevel) {
        const res = await ResultService.bulkApproveTermReports(level, ids);
        total += res.approved_reports;
      }
      setTrSelectedIds([]);
      toast.success(`${total} report(s) approved`);
      const affected = reports.filter((r) => trSelectedIds.includes(r.id));
      await recalcPositions(affected);
      await loadTermReports(true);
    } catch (err: any) {
      toast.error(err?.message || 'Bulk approve failed');
    } finally {
      setTrActionLoading(null);
    }
  };

  const handleTrBulkPublish = async () => {
    if (!trSelectedIds.length) return;
    setTrActionLoading('bulk');
    try {
      const byLevel = new Map<EducationLevelType, string[]>();
      for (const id of trSelectedIds) {
        const r = reports.find((x) => x.id === id);
        if (!r) continue;
        const list = byLevel.get(r.education_level) ?? [];
        list.push(id);
        byLevel.set(r.education_level, list);
      }
      let total = 0;
      for (const [level, ids] of byLevel) {
        const res = await ResultService.bulkPublishTermReports(level, ids);
        total += res.published_reports;
      }
      setTrSelectedIds([]);
      toast.success(`${total} report(s) published`);
      const affected = reports.filter((r) => trSelectedIds.includes(r.id));
      await recalcPositions(affected);
      await loadTermReports(true);
    } catch (err: any) {
      toast.error(err?.message || 'Bulk publish failed');
    } finally {
      setTrActionLoading(null);
    }
  };

  // "Select all on this page" — correctly scoped to the current page only
  const handleTrSelectAllPage = () => {
    const pageIds = reports.map((r) => r.id);
    const allSelected = pageIds.every((id) => trSelectedIds.includes(id));
    setTrSelectedIds(allSelected
      ? trSelectedIds.filter((id) => !pageIds.includes(id))
      : Array.from(new Set([...trSelectedIds, ...pageIds]))
    );
  };

  // ── Subject Result actions ────────────────────────────────────────────────

  const handleSrApprove = async (result: any) => {
    setSrActionLoading(result.id);
    try {
      await ResultService.approveSubjectResult(result.education_level, String(result.id));
      toast.success('Result approved — term report updated');
      await Promise.all([loadSubjectResults(), loadTermReports(true)]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to approve');
    } finally {
      setSrActionLoading(null);
    }
  };

  const handleSrPublish = async (result: any) => {
    setSrActionLoading(result.id);
    try {
      await ResultService.publishSubjectResult(result.education_level, String(result.id));
      toast.success('Result published — term report updated');
      await Promise.all([loadSubjectResults(), loadTermReports(true)]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to publish');
    } finally {
      setSrActionLoading(null);
    }
  };

  const handleSrBulkApprove = async () => {
    if (!srSelectedIds.length) return;
    setSrActionLoading('bulk');
    try {
      const byLevel = new Map<EducationLevelType, string[]>();
      for (const id of srSelectedIds) {
        const r = subjectResults.find((x) => String(x.id) === id);
        if (!r) continue;
        const list = byLevel.get(r.education_level) ?? [];
        list.push(id);
        byLevel.set(r.education_level, list);
      }
      let total = 0;
      for (const [level, ids] of byLevel) {
        const res = await ResultService.bulkApproveSubjectResults(level, ids);
        total += (res as any).approved_count ?? 0;
      }
      toast.success(`${total} result(s) approved — term reports updated`);
      setSrSelectedIds([]);
      await Promise.all([loadSubjectResults(), loadTermReports(true)]);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk approve failed');
    } finally {
      setSrActionLoading(null);
    }
  };

  const handleSrBulkPublish = async () => {
    if (!srSelectedIds.length) return;
    setSrActionLoading('bulk');
    try {
      const byLevel = new Map<EducationLevelType, string[]>();
      for (const id of srSelectedIds) {
        const r = subjectResults.find((x) => String(x.id) === id);
        if (!r) continue;
        const list = byLevel.get(r.education_level) ?? [];
        list.push(id);
        byLevel.set(r.education_level, list);
      }
      let total = 0;
      for (const [level, ids] of byLevel) {
        const res = await ResultService.bulkPublishSubjectResults(level, ids);
        total += (res as any).published_count ?? 0;
      }
      toast.success(`${total} result(s) published — term reports updated`);
      setSrSelectedIds([]);
      await Promise.all([loadSubjectResults(), loadTermReports(true)]);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk publish failed');
    } finally {
      setSrActionLoading(null);
    }
  };

  // ── Guard: initial full-screen loading / error ────────────────────────────

  if (trLoading && activeTab === 'term-reports' && reports.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading results…</p>
        </div>
      </div>
    );
  }

  if (trError && activeTab === 'term-reports') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-slate-700 font-medium mb-4">{trError}</p>
          <button
            onClick={() => loadTermReports()}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-screen-xl mx-auto px-4 py-8 space-y-6">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Results Management</h1>
            <p className="text-slate-500 text-sm mt-1">Approve and publish subject results to generate term reports</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> Record Result
            </button>
            <button
              onClick={handleRefresh}
              disabled={trRefreshing || srLoading}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-slate-600 text-sm hover:bg-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${(trRefreshing || srLoading) ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {activeTab === 'term-reports' && (
              <button
                onClick={handleRecalculatePositions}
                disabled={trActionLoading === 'positions' || reports.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${trActionLoading === 'positions' ? 'animate-spin' : ''}`} />
                Recalculate Positions
              </button>
            )}
          </div>
        </div>

        {/* ── Tab switcher ─────────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('subject-results')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'subject-results'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Subject Results
            {srDraftCount > 0 && (
              <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{srDraftCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('term-reports')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'term-reports'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List className="w-4 h-4" />
            Term Reports
          </button>
        </div>

        {/* ═══════════════════════ SUBJECT RESULTS TAB ═══════════════════════ */}
        {activeTab === 'subject-results' && (
          <div className="space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Results" value={srTotalCount}    icon={BookOpen}    color="bg-slate-600" />
              <StatCard label="Draft"         value={srDraftCount}    icon={Clock}       color="bg-amber-500"   sub="Pending approval" />
              <StatCard label="Approved"      value={srApprovedCount} icon={CheckCircle} color="bg-emerald-500" sub="Ready to publish" />
              <StatCard label="Published"     value={srPublishedCount}icon={Award}       color="bg-violet-600"  sub="Term report generated" />
            </div>

            {/* Term tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-1 flex gap-1 w-fit">
              {(['FIRST', 'SECOND', 'THIRD'] as const).map((t, i) => (
                <button
                  key={t}
                  onClick={() => { setSrTermTab(t); setSrSelectedSession(''); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    srTermTab === t
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {['1st Term', '2nd Term', '3rd Term'][i]}
                </button>
              ))}
              <button
                onClick={() => { setSrTermTab('SESSION'); setSrSelectedSession(''); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  srTermTab === 'SESSION'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                By Session
              </button>
            </div>

            {/* Session input (only when By Session is active) */}
            {srTermTab === 'SESSION' && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Session Name</label>
                <input
                  type="text"
                  placeholder="e.g. 2024/2025"
                  value={srSelectedSession}
                  onChange={(e) => setSrSelectedSession(e.target.value)}
                  className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                />
              </div>
            )}

            {/* Filters + bulk actions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-3 mb-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student or subject…"
                    value={srSearch}
                    onChange={(e) => setSrSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                  />
                </div>
                <select
                  value={srFilterLevel}
                  onChange={(e) => setSrFilterLevel(e.target.value as any)}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                >
                  <option value="all">All Levels</option>
                  {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                </select>
                <select
                  value={srFilterStatus}
                  onChange={(e) => setSrFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </div>

              {srSelectedIds.length > 0 && (
                <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                  <span className="text-sm text-slate-500">{srSelectedIds.length} selected</span>
                  <button
                    onClick={handleSrBulkApprove}
                    disabled={srActionLoading === 'bulk'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve All
                  </button>
                  <button
                    onClick={handleSrBulkPublish}
                    disabled={srActionLoading === 'bulk'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Award className="w-3.5 h-3.5" /> Publish All
                  </button>
                  <button onClick={() => setSrSelectedIds([])} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Subject Results table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {srLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                </div>
              ) : subjectResults.length === 0 ? (
                <div className="py-16 text-center">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No subject results found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 900 }}>
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left w-10">
                          <input
                            type="checkbox"
                            checked={
                              subjectResults.length > 0 &&
                              subjectResults.every((r) => srSelectedIds.includes(String(r.id)))
                            }
                            onChange={() => {
                              const pageIds = subjectResults.map((r) => String(r.id));
                              const allSelected = pageIds.every((id) => srSelectedIds.includes(id));
                              setSrSelectedIds(allSelected
                                ? srSelectedIds.filter((id) => !pageIds.includes(id))
                                : Array.from(new Set([...srSelectedIds, ...pageIds]))
                              );
                            }}
                            className="rounded border-slate-300 text-violet-600"
                          />
                        </th>
                        {['Student', 'Level', 'Subject', 'Session', 'CA', 'Exam', 'Total', 'Grade', 'Remark', 'Status', 'Actions'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {subjectResults.map((r, idx) => {
                        const comps     = [...(r.component_scores ?? [])].sort((a: any, b: any) => a.display_order - b.display_order);
                        const hasComps  = comps.length > 0;
                        // contributes_to_ca is the field that actually determines whether a
                        // component counts toward the CA sub-total or stands alone as an
                        // exam/final score. component_type is just a free-text label a
                        // tenant may set when creating a component (defaults to "CA" if
                        // never touched) — it isn't a reliable signal for "is this the exam".
                        const caComps   = comps.filter((c: any) => c.contributes_to_ca);
                        const examComps = comps.filter((c: any) => !c.contributes_to_ca);
                        const caTotal   = hasComps
                          ? caComps.reduce((s: number, c: any) => s + (parseFloat(c.score) || 0), 0)
                          : parseFloat(r.ca_total || '0');
                        const examScore = hasComps
                          ? examComps.reduce((s: number, c: any) => s + (parseFloat(c.score) || 0), 0)
                          // Nursery-only simple-mark fallback — no components at all for
                          // this result. Every other level has no score without components,
                          // so there's nothing meaningful to fall back to for them.
                          : ('mark_obtained' in r ? parseFloat(r.mark_obtained || '0') : 0);
                        const isActing  = srActionLoading === String(r.id);
                          console.log(r.subject?.name, { hasComps, comps, ca_total: r.ca_total, mark_obtained: r.mark_obtained });
                        return (
                          <tr key={r.id ?? idx} className={`hover:bg-slate-50 ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={srSelectedIds.includes(String(r.id))}
                                onChange={() => setSrSelectedIds((prev) =>
                                  prev.includes(String(r.id))
                                    ? prev.filter((x) => x !== String(r.id))
                                    : [...prev, String(r.id)]
                                )}
                                className="rounded border-slate-300 text-violet-600"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                                  <User className="w-3.5 h-3.5 text-violet-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-slate-900 text-xs leading-tight">{r.student?.full_name || '—'}</p>
                                  <p className="text-[10px] text-slate-400">{r.student?.student_class_name || r.student?.admission_number || ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><LevelBadge level={r.education_level} /></td>
                            <td className="px-4 py-3">
                              <p className="text-xs font-medium text-slate-900">{r.subject?.name || '—'}</p>
                              <p className="text-[10px] text-slate-400">{r.subject?.code || ''}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-slate-700">{r.exam_session?.term_name || r.exam_session?.name || '—'}</p>
                              <p className="text-[10px] text-slate-400">{r.exam_session?.academic_session?.name || ''}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-xs font-medium text-slate-700">{caTotal > 0 ? caTotal.toFixed(1) : '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-xs font-medium text-slate-700">{examScore > 0 ? examScore.toFixed(1) : '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-bold text-slate-900">{parseFloat(r.total_score || '0').toFixed(1)}</span>
                            </td>
                            <td className="px-4 py-3 text-center"><GradeChip grade={r.grade || '—'} /></td>
                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[120px] truncate">
                              {r.teacher_remark || (r as any).academic_comment || ''}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={(r.status || 'DRAFT') as ResultStatus} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setEditTarget({ report: { education_level: r.education_level } as EnrichedReport, subjectResult: r })}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                  title="Edit result"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                {r.status === 'DRAFT' && (
                                  <button
                                    onClick={() => handleSrApprove(r)}
                                    disabled={isActing}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                                    title="Approve"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {r.status === 'APPROVED' && (
                                  <button
                                    onClick={() => handleSrPublish(r)}
                                    disabled={isActing}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-40"
                                    title="Publish"
                                  >
                                    <Award className="w-4 h-4" />
                                  </button>
                                )}
                                {isActing && (
                                  <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin ml-1" />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Subject results pagination */}
              {srTotalCount > SR_PAGE_SIZE && (
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                  <span className="text-sm text-slate-500">
                    Showing{' '}
                    <strong>
                      {(srCurrentPage - 1) * SR_PAGE_SIZE + 1}–{Math.min(srCurrentPage * SR_PAGE_SIZE, srTotalCount)}
                    </strong>{' '}
                    of <strong>{srTotalCount}</strong>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSrCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={srCurrentPage === 1}
                      className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 text-sm text-slate-600">Page {srCurrentPage} of {srTotalPages}</span>
                    <button
                      onClick={() => setSrCurrentPage((p) => Math.min(srTotalPages, p + 1))}
                      disabled={srCurrentPage >= srTotalPages}
                      className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>How it works:</strong> Approving a subject result locks the score. Publishing makes it
                visible to students and automatically creates or updates the student's Term Report in the Term
                Reports tab.
              </span>
            </div>
          </div>
        )}

        {/* ═══════════════════════ TERM REPORTS TAB ══════════════════════════ */}
        {activeTab === 'term-reports' && (
          <div className="space-y-4">

            {/* Term tabs */}
            <div className="flex gap-1 bg-white rounded-2xl border border-slate-200 p-1 w-fit">
              {(['FIRST', 'SECOND', 'THIRD'] as const).map((t, i) => {
                  const label = ['1st Term', '2nd Term', '3rd Term'][i];
                  return (
                    <button
                      key={t}
                      onClick={() => { setSrTermTab(t); setSrSelectedSession(''); }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                        srTermTab === t ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              <button
                onClick={() => setTrTermTab('SESSION')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  trTermTab === 'SESSION'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                By Session
              </button>
            </div>

            {/* Session/term dropdowns (only when By Session is active) */}
            {trTermTab === 'SESSION' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Academic Session</label>
                  <select
                    value={trFilters.session}
                    onChange={(e) => setTrFilters((f) => ({ ...f, session: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                  >
                    <option value="all">— All sessions —</option>
                    {uniqueTrSessions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Term</label>
                  <select
                    value={trFilters.term}
                    onChange={(e) => setTrFilters((f) => ({ ...f, term: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                  >
                    <option value="all">— All terms —</option>
                    {uniqueTrTerms.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Stats — counts come from server, accurate across all pages */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Reports" value={trTotalCount}     icon={FileText}    color="bg-slate-600" />
              <StatCard label="Draft"         value={trDraftCount}     icon={Clock}       color="bg-amber-500"   sub="Awaiting approval" />
              <StatCard label="Approved"      value={trApprovedCount}  icon={CheckCircle} color="bg-emerald-500" sub="Ready to publish" />
              <StatCard label="Published"     value={trPublishedCount} icon={Award}       color="bg-violet-600"  sub="Visible to students" />
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student or class…"
                    value={trFilters.search}
                    onChange={(e) => setTrFilters((f) => ({ ...f, search: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                  />
                </div>
                <select
                  value={trFilters.status}
                  onChange={(e) => setTrFilters((f) => ({ ...f, status: e.target.value as any }))}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PUBLISHED">Published</option>
                </select>
                <select
                  value={trFilters.level}
                  onChange={(e) => setTrFilters((f) => ({ ...f, level: e.target.value as any }))}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                >
                  <option value="all">All Levels</option>
                  {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                </select>
              </div>
              {(trFilters.status !== 'all' || trFilters.level !== 'all' || trFilters.search) && (
                <button
                  onClick={() => setTrFilters({ search: '', status: 'all', level: 'all', session: 'all', term: 'all' })}
                  className="mt-3 text-xs text-violet-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Term Reports table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Term Reports <span className="text-slate-400 font-normal">({trTotalCount})</span>
                </h2>
                {trSelectedIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">{trSelectedIds.length} selected</span>
                    <button
                      onClick={handleTrBulkApprove}
                      disabled={trActionLoading === 'bulk'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={handleTrBulkPublish}
                      disabled={trActionLoading === 'bulk'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
                    >
                      <Award className="w-3.5 h-3.5" /> Publish
                    </button>
                    <button onClick={() => setTrSelectedIds([])} className="text-slate-400 hover:text-slate-600 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left w-10">
                        <input
                          type="checkbox"
                          checked={reports.length > 0 && reports.every((r) => trSelectedIds.includes(r.id))}
                          onChange={handleTrSelectAllPage}
                          className="rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                        />
                      </th>
                      {['Student', 'Level', 'Term / Session', 'Subjects', 'Average', 'Grade', 'Position', 'Status', 'Updated', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-16 text-center">
                          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-500 font-medium">No results found</p>
                        </td>
                      </tr>
                    ) : (
                      reports.map((report) => {
                        const avg           = getAvgScore(report);
                        const grade         = getOverallGrade(report);
                        const isActing      = trActionLoading === report.id;
                        const totalStudents = getTotalStudents(report);

                        return (
                          <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={trSelectedIds.includes(report.id)}
                                onChange={() => setTrSelectedIds((prev) =>
                                  prev.includes(report.id)
                                    ? prev.filter((x) => x !== report.id)
                                    : [...prev, report.id]
                                )}
                                className="rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                              />
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
                              {report.class_position
                                ? `${report.class_position}${totalStudents ? `/${totalStudents}` : ''}`
                                : '—'}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={report.status} /></td>
                            <td className="px-4 py-3 text-xs text-slate-400">{formatDate(report.updated_at)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setDetailReport(report)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="View"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
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
                                  <button
                                    onClick={() => handleTrApprove(report)}
                                    disabled={isActing}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                                    title="Approve"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {report.status === 'APPROVED' && (
                                  <button
                                    onClick={() => handleTrPublish(report)}
                                    disabled={isActing}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40"
                                    title="Publish"
                                  >
                                    <Award className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleTrDownloadPDF(report)}
                                  disabled={trActionLoading === `${report.id}_pdf`}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
                                  title="Download PDF"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(report)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
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

              {/* Term Reports pagination */}
              {trTotalCount > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>Show</span>
                    <select
                      value={trPageSize}
                      onChange={(e) => setTrPageSize(Number(e.target.value))}
                      className="px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-400 outline-none"
                    >
                      {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span>
                      Showing{' '}
                      <strong>{(trCurrentPage - 1) * trPageSize + 1}–{Math.min(trCurrentPage * trPageSize, trTotalCount)}</strong>
                      {' '}of <strong>{trTotalCount}</strong>
                    </span>
                  </div>
                  {trTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setTrCurrentPage(1)}
                        disabled={trCurrentPage === 1}
                        className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setTrCurrentPage((p) => p - 1)}
                        disabled={trCurrentPage === 1}
                        className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="hidden sm:flex items-center gap-1">
                        {buildPageNumbers(trCurrentPage, trTotalPages).map((p, i) =>
                          p === '…' ? (
                            <span key={`e${i}`} className="px-2 text-slate-400">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setTrCurrentPage(p as number)}
                              className={`min-w-[2.25rem] h-9 rounded-lg border text-sm font-medium transition-colors ${
                                trCurrentPage === p
                                  ? 'bg-violet-600 border-violet-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      </div>
                      <button
                        onClick={() => setTrCurrentPage((p) => p + 1)}
                        disabled={trCurrentPage === trTotalPages}
                        className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setTrCurrentPage(trTotalPages)}
                        disabled={trCurrentPage === trTotalPages}
                        className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {detailReport && (
        <DetailModal
          report={detailReport}
          level={detailReport.education_level}
          onClose={() => setDetailReport(null)}
          onApprove={() => handleTrApprove(detailReport)}
          onPublish={() => handleTrPublish(detailReport)}
          onDownload={() => handleTrDownloadPDF(detailReport)}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          report={deleteTarget}
          onConfirm={() => handleTrDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          loading={trActionLoading === 'delete'}
        />
      )}

      {showAddForm && (
        <AddResultForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => { setShowAddForm(false); loadTermReports(true); }}
        />
      )}

      {editTarget && (
        <EditResultForm
          result={editTarget.subjectResult}
          educationLevel={editTarget.report.education_level}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            loadTermReports(true);
            loadSubjectResults();
          }}
        />
      )}
    </div>
  );
};

export default EnhancedResultsManagement;