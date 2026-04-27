import { useState, useMemo, useEffect } from 'react';
import ResultService from '@/services/ResultService';
import type { EducationLevelType, AnyTermReport } from '@/services/ResultService';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';
import { Eye, Edit, Trash2, Download, Printer, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Flattened view-model built from AnyTermReport for this component */
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

interface SubjectRow {
  name: string;
  code: string;
  ca_score: number;
  exam_score: number;
  total_score: number;
  percentage: number;
  grade: string;
  remarks: string;
  stream_name?: string;
  stream_id?: string;
}

// ─── All four levels we fetch ──────────────────────────────────────────────

const ALL_LEVELS: EducationLevelType[] = [
  'NURSERY', 'PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getUnique = (arr: string[]): string[] =>
  Array.from(new Set(arr.filter(Boolean)));

const getTermDisplay = (term: string): string => {
  const map: Record<string, string> = {
    FIRST: '1st Term', SECOND: '2nd Term', THIRD: '3rd Term',
  };
  return map[(term || '').toUpperCase()] || term || 'N/A';
};

const getLevelDisplay = (level: string): string => {
  const map: Record<string, string> = {
    NURSERY: 'Nursery', PRIMARY: 'Primary',
    JUNIOR_SECONDARY: 'Junior Secondary', SENIOR_SECONDARY: 'Senior Secondary',
  };
  return map[(level || '').toUpperCase()] || level || 'N/A';
};

const safeFloat = (v: any): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const gradeFromAvg = (avg: number): string => {
  if (avg >= 80) return 'A';
  if (avg >= 70) return 'B';
  if (avg >= 60) return 'C';
  if (avg >= 50) return 'D';
  return 'F';
};

const gradeColor = (grade: string): string => {
  if (!grade || grade === 'N/A') return 'bg-gray-100 text-gray-700';
  if (grade.startsWith('A')) return 'bg-green-100 text-green-800';
  if (grade.startsWith('B')) return 'bg-blue-100 text-blue-800';
  if (grade.startsWith('C')) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

/**
 * Flatten an AnyTermReport into the FlatResult view-model.
 * Handles both Nursery (overall_percentage / total_students_in_class)
 * and standard (average_score / total_students) shapes.
 */
function flatten(report: AnyTermReport, level: EducationLevelType): FlatResult {
  const s = report.student;
  const es = report.exam_session;

  // Average score
  const avg = 'overall_percentage' in report
    ? safeFloat(report.overall_percentage)
    : safeFloat((report as any).average_score);

  // Total students
  const totalStudents = 'total_students_in_class' in report
    ? (report as any).total_students_in_class
    : safeFloat((report as any).total_students);

  // Subject results → SubjectRow[]
  const subjectResults: SubjectRow[] = ((report as any).subject_results || []).map((sr: any) => ({
    name:       sr.subject?.name  ?? sr.subject_name ?? 'Unknown',
    code:       sr.subject?.code  ?? sr.subject_code ?? '',
    ca_score:   safeFloat(sr.ca_total ?? sr.mark_obtained ?? 0),
    exam_score: safeFloat(sr.exam_score ?? 0),
    total_score: safeFloat(sr.total_score ?? sr.mark_obtained ?? 0),
    percentage: safeFloat(sr.percentage ?? 0),
    grade:      sr.grade ?? '',
    remarks:    sr.teacher_remark ?? sr.remarks ?? '',
    stream_name: sr.stream?.name ?? sr.stream_name ?? '',
    stream_id:   sr.stream?.id ?? '',
  }));

  // Stream (SSS only)
  const streamName = (report as any).stream_name
    ?? subjectResults.find(r => r.stream_name)?.stream_name
    ?? '';

  return {
    id:                   report.id,
    education_level:      level,
    education_level_raw:  level,
    student_id:           String(s.id),
    full_name:            s.full_name,
    username:             (s as any).username ?? (s as any).admission_number ?? '',
    student_class:        s.student_class_name ?? s.student_class ?? null,
    academic_session_name: es.academic_session?.name ?? es.academic_session_name ?? '',
    term_name:            es.term_name ?? '',
    total_subjects:       safeFloat((report as any).total_subjects ?? subjectResults.length),
    total_score:          safeFloat((report as any).total_score ?? 0),
    average_score:        avg,
    class_position:       report.class_position ?? null,
    total_students:       totalStudents,
    subjects_passed:      subjectResults.filter(r => r.grade && r.grade !== 'F').length,
    subjects_failed:      subjectResults.filter(r => r.grade === 'F').length,
    gpa:                  safeFloat((report as any).gpa ?? 0),
    status:               report.status ?? '',
    remarks:              (report as any).class_teacher_remark ?? '',
    next_term_begins:     report.next_term_begins ?? '',
    profile_picture:      (s as any).profile_picture,
    subject_results:      subjectResults,
    stream_name:          streamName,
    raw:                  report,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const SchoolResultTemplate = () => {
  const { settings } = useSettings();

  const schoolName    = settings?.school_name    || 'School Name';
  const schoolAddress = settings?.address || '';
  const schoolLogo    = getAbsoluteUrl(settings?.logo) || '';

  const [results, setResults]           = useState<FlatResult[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // Filters
  const [classFilter,   setClassFilter]   = useState('all');
  const [yearFilter,    setYearFilter]    = useState('all');
  const [termFilter,    setTermFilter]    = useState('all');
  const [levelFilter,   setLevelFilter]   = useState('all');
  const [streamFilter,  setStreamFilter]  = useState('all');
  const [search,        setSearch]        = useState('');

  // Modals
  const [viewTarget,   setViewTarget]   = useState<FlatResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatResult | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // ── Fetch all levels in parallel ───────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const settled = await Promise.allSettled(
          ALL_LEVELS.map((level) =>
            ResultService.getTermReports(level).then((reports) =>
              reports.map((r) => flatten(r, level))
            )
          )
        );

        const all: FlatResult[] = settled.flatMap((res) =>
          res.status === 'fulfilled' ? res.value : []
        );

        setResults(all);
      } catch (err) {
        console.error('Error loading results:', err);
        setError('Failed to load results. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Derived filter options ─────────────────────────────────────────────────

  const classes = useMemo(() =>
    getUnique(results.map((r) => r.student_class ?? '')), [results]);

  const years = useMemo(() =>
    getUnique(results.map((r) => r.academic_session_name)), [results]);

  const terms = useMemo(() =>
    getUnique(results.map((r) => r.term_name)), [results]);

  const streams = useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((r) => {
      if (r.stream_name) map.set(r.stream_name, r.stream_name);
      r.subject_results.forEach((sr) => {
        if (sr.stream_id && sr.stream_name)
          map.set(sr.stream_id, sr.stream_name);
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [results]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() =>
    results.filter((r) => {
      const q = search.toLowerCase();
      return (
        (classFilter  === 'all' || r.student_class === classFilter) &&
        (yearFilter   === 'all' || r.academic_session_name === yearFilter) &&
        (termFilter   === 'all' || r.term_name === termFilter) &&
        (levelFilter  === 'all' || r.education_level_raw === levelFilter) &&
        (streamFilter === 'all' ||
          r.stream_name === streamFilter ||
          r.subject_results.some((sr) => sr.stream_id === streamFilter)) &&
        (q === '' ||
          r.full_name.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q))
      );
    }),
  [results, classFilter, yearFilter, termFilter, levelFilter, streamFilter, search]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await ResultService.deleteTermReport(deleteTarget.education_level, deleteTarget.id);
      setResults((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete result. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600" />
        <p className="text-gray-600">Loading results…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {error}
        <button onClick={() => window.location.reload()}
          className="ml-4 underline text-sm">Retry</button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h2 className="text-xl font-bold mb-4">Student Results Management</h2>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="text" placeholder="Search name or username…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="border px-3 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

        {[
          { label: 'All Sections', value: levelFilter, set: setLevelFilter,
            opts: ALL_LEVELS.map((l) => ({ v: l, label: getLevelDisplay(l) })) },
          { label: 'All Classes', value: classFilter, set: setClassFilter,
            opts: classes.map((c) => ({ v: c, label: c })) },
          { label: 'All Years', value: yearFilter, set: setYearFilter,
            opts: years.map((y) => ({ v: y, label: y })) },
          { label: 'All Terms', value: termFilter, set: setTermFilter,
            opts: terms.map((t) => ({ v: t, label: getTermDisplay(t) })) },
        ].map(({ label, value, set, opts }) => (
          <select key={label} value={value} onChange={(e) => set(e.target.value)}
            className="border px-3 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">{label}</option>
            {opts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        ))}

        {streams.length > 0 && (
          <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)}
            className="border px-3 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Streams</option>
            {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-200">
              {['Name','Username','Section','Class','Stream','Term','Year','Average','Grade','Actions'].map((h) => (
                <th key={h} className="px-4 py-3 border text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-gray-400">
                  No results found.
                </td>
              </tr>
            ) : filtered.map((r) => {
              const avg = r.average_score;
              const grade = avg > 0 ? gradeFromAvg(avg) : 'N/A';
              return (
                <tr key={r.id} className="hover:bg-blue-50 transition-colors">
                  <td className="border px-4 py-3 font-medium">{r.full_name}</td>
                  <td className="border px-4 py-3 text-gray-600">{r.username || 'N/A'}</td>
                  <td className="border px-4 py-3">{getLevelDisplay(r.education_level_raw)}</td>
                  <td className="border px-4 py-3">{r.student_class || 'N/A'}</td>
                  <td className="border px-4 py-3">{r.stream_name || '-'}</td>
                  <td className="border px-4 py-3">{getTermDisplay(r.term_name)}</td>
                  <td className="border px-4 py-3">{r.academic_session_name || 'N/A'}</td>
                  <td className="border px-4 py-3 text-center font-semibold">
                    {avg > 0 ? `${avg.toFixed(1)}%` : 'N/A'}
                  </td>
                  <td className="border px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${gradeColor(grade)}`}>
                      {grade}
                    </span>
                  </td>
                  <td className="border px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => setViewTarget(r)}
                        className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700" title="View">
                        <Eye size={15} />
                      </button>
                      <button onClick={() => setDeleteTarget(r)}
                        className="bg-red-600 text-white p-1.5 rounded hover:bg-red-700" title="Delete">
                        <Trash2 size={15} />
                      </button>
                      <button onClick={() => {
                        ResultService.downloadTermReportPDF(r.id, r.education_level)
                          .then((blob) => ResultService.triggerDownload(blob, `${r.full_name}_report.pdf`))
                          .catch(() => alert('PDF download failed'));
                      }} className="bg-purple-600 text-white p-1.5 rounded hover:bg-purple-700" title="Download PDF">
                        <Download size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── View Modal ── */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto relative">
            {/* Close */}
            <button onClick={() => setViewTarget(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 z-10">
              <X size={20} />
            </button>

            {/* School header */}
            <div className="p-6 border-b flex items-center justify-between">
              <div className="flex items-center gap-4">
                {schoolLogo && (
                  <img src={schoolLogo} alt="Logo" className="h-14 w-14 object-contain" />
                )}
                <div>
                  <h1 className="text-xl font-bold">{schoolName}</h1>
                  <p className="text-sm text-gray-500">{schoolAddress}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-semibold">STUDENT REPORT CARD</h2>
                {viewTarget.next_term_begins && (
                  <p className="text-sm text-gray-500">
                    Next Term: {viewTarget.next_term_begins}
                  </p>
                )}
              </div>
            </div>

            {/* Student info */}
            <div className="p-6 border-b grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p><strong>Name:</strong> {viewTarget.full_name}</p>
                <p><strong>Class:</strong> {viewTarget.student_class || 'N/A'}</p>
                <p><strong>Section:</strong> {getLevelDisplay(viewTarget.education_level_raw)}</p>
                {viewTarget.stream_name && (
                  <p><strong>Stream:</strong> {viewTarget.stream_name}</p>
                )}
              </div>
              <div className="space-y-1">
                <p><strong>Session:</strong> {viewTarget.academic_session_name || 'N/A'}</p>
                <p><strong>Term:</strong> {getTermDisplay(viewTarget.term_name)}</p>
                <p><strong>Position:</strong>{' '}
                  {viewTarget.class_position && viewTarget.total_students
                    ? `${viewTarget.class_position} of ${viewTarget.total_students}`
                    : 'N/A'}
                </p>
                <p><strong>Subjects:</strong> {viewTarget.total_subjects}</p>
              </div>
            </div>

            {/* Subjects table */}
            <div className="p-6">
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    {['S/N','Subject','CA','Exam','Total','%','Grade','Remarks'].map((h) => (
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
                        {sr.percentage > 0 ? `${sr.percentage.toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${gradeColor(sr.grade)}`}>
                          {sr.grade || 'N/A'}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">{sr.remarks || '-'}</td>
                    </tr>
                  ))}
                  {/* Pad to 15 rows */}
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

            {/* Summary */}
            <div className="px-6 pb-4 grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p><strong>Total Score:</strong> {viewTarget.total_score}</p>
                <p><strong>Average:</strong>{' '}
                  {viewTarget.average_score > 0
                    ? `${viewTarget.average_score.toFixed(1)}%`
                    : 'N/A'}
                </p>
                {viewTarget.gpa > 0 && (
                  <p><strong>GPA:</strong> {viewTarget.gpa.toFixed(2)}</p>
                )}
              </div>
              <div className="space-y-1">
                <p><strong>Passed:</strong> {viewTarget.subjects_passed}</p>
                <p><strong>Failed:</strong> {viewTarget.subjects_failed}</p>
              </div>
            </div>

            {viewTarget.remarks && (
              <div className="px-6 pb-4 text-sm">
                <strong>Teacher's Remark:</strong> {viewTarget.remarks}
              </div>
            )}

            {/* Actions */}
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => window.print()}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 text-sm">
                <Printer size={15} /> Print
              </button>
              <button onClick={() => {
                ResultService.downloadTermReportPDF(viewTarget.id, viewTarget.education_level)
                  .then((blob) => ResultService.triggerDownload(blob, `${viewTarget.full_name}_report.pdf`))
                  .catch(() => alert('PDF download failed'));
              }} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2 text-sm">
                <Download size={15} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-3">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Delete the term report for <strong>{deleteTarget.full_name}</strong>?
              This will also remove all subject results for that term. This cannot be undone.
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
    </div>
  );
};

export default SchoolResultTemplate;