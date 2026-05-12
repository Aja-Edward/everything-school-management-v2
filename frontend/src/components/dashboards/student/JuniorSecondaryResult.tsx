import { useRef, useState, useEffect, useMemo } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useResultService } from "@/hooks/useResultService";
import { SchoolSettings } from '@/types/types';
import type {
  GradingSystem,
  GradeRange,
  ScoringConfiguration,
  ExamSession,
} from "@/services/ResultSettingsService";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface StudentBasicInfo {
  id: string;
  name: string;
  full_name?: string;
  class: string;
  house?: string;
  age?: number;
}

export interface TermInfo {
  name: string;
  session: string;
  year: string;
}

export interface SubjectResult {
  id: string;
  subject: { id: string; name: string };
  continuous_assessment_score: number;
  take_home_test_score: number;
  project_score: number;
  appearance_score: number;
  note_copying_score: number;
  practical_score: number;
  ca_total: number;
  exam_marks: number;
  total_obtainable: number;
  mark_obtained: number;
  grade?: string;
  position?: string | number;
  subject_position?: number;
  teacher_remark?: string;
  is_passed?: boolean;
  status?: string;
}

export interface JuniorSecondaryResultData {
  id: string;
  student: StudentBasicInfo;
  term: TermInfo;
  subjects: SubjectResult[];
  total_score: number;
  average_score: number;
  overall_grade: string;
  class_position: number;
  total_students: number;
  attendance: { times_opened: number; times_present: number };
  next_term_begins: string;
  class_teacher_remark?: string;
  head_teacher_remark?: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface JuniorSecondaryResultProps {
  data: JuniorSecondaryResultData;
  studentId?: string;
  examSessionId?: string;
  onDataChange?: (data: JuniorSecondaryResultData) => void;
  onPDFGenerated?: (pdfUrl: string) => void;
  enableEnhancedFeatures?: boolean;
  showOnlyPublished?: boolean;
}

// ─── Watermark ────────────────────────────────────────────────────────────────

const WatermarkLogo = ({ schoolInfo }: { schoolInfo: SchoolSettings }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-3 z-0">
    <div className="text-center">
      <div
        className="w-64 h-64 rounded-full flex items-center justify-center mb-6 mx-auto border-4"
        style={{
          background: 'linear-gradient(135deg, rgba(30,64,175,0.1), rgba(59,130,246,0.1))',
          borderColor: 'rgba(30,64,175,0.2)',
        }}
      >
        <div className="text-center" style={{ color: 'rgba(30,64,175,0.3)' }}>
          {schoolInfo?.logo ? (
            <img src={schoolInfo.logo} alt="School Logo" className="w-16 h-16 opacity-30 mx-auto mb-2" />
          ) : (
            <div className="text-4xl font-bold mb-2">
              {schoolInfo?.school_name?.split(' ').map((w: string) => w[0]).join('')}
            </div>
          )}
          <div className="text-sm font-semibold">{schoolInfo?.school_name?.toUpperCase()}</div>
        </div>
      </div>
      <div className="text-5xl font-bold tracking-wider" style={{ color: 'rgba(30,64,175,0.15)' }}>
        {schoolInfo?.school_name?.toUpperCase()}
      </div>
    </div>
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOrdinalSuffix = (n: number): string => {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso || iso === 'Invalid Date' || iso === 'TBA') return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function JuniorSecondaryResult({
  data,
  studentId,
  examSessionId,
  onDataChange,
  onPDFGenerated,
  enableEnhancedFeatures = true,
  showOnlyPublished = false,
}: JuniorSecondaryResultProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { service, schoolSettings, loading: serviceLoading } = useResultService();

  const [gradingSystem, setGradingSystem] = useState<GradingSystem | null>(null);
  const [grades, setGrades] = useState<GradeRange[]>([]);
  const [scoringConfig, setScoringConfig] = useState<ScoringConfiguration | null>(null);
  const [examSession, setExamSession] = useState<ExamSession | null>(null);
  const [nextTermBegins, setNextTermBegins] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Resolve next_term_begins ────────────────────────────────────────────────
  useEffect(() => {
    const resolve = async () => {
      const raw = data?.next_term_begins;
      if (raw && raw !== 'Invalid Date' && raw !== 'TBA') {
        setNextTermBegins(raw);
        return;
      }
      try {
        const { default: AcademicCalendarService } = await import('@/services/AcademicCalendarService');
        const sessions = await AcademicCalendarService.getAcademicSessions();
        const current = sessions.find((s: any) => s.is_current);
        if (current) {
          const allTerms = await AcademicCalendarService.getTerms();
          const terms = allTerms.filter((t: any) => t.academic_session === current.id);
          const currentTerm = terms.find((t: any) => t.is_current);
          if (currentTerm?.next_term_begins) {
            setNextTermBegins(currentTerm.next_term_begins);
            return;
          }
          const order = ['FIRST', 'SECOND', 'THIRD'];
          const idx = order.indexOf(currentTerm?.name);
          if (idx >= 0 && idx < order.length - 1) {
            const next = terms.find((t: any) => t.name === order[idx + 1]);
            if (next?.next_term_begins) { setNextTermBegins(next.next_term_begins); return; }
          }
        }
        setNextTermBegins(null);
      } catch {
        setNextTermBegins(null);
      }
    };
    resolve();
  }, [data?.next_term_begins]);

  // ── Fetch grading / scoring / session data ─────────────────────────────────
  useEffect(() => {
    const fetch = async () => {
      if (!service || serviceLoading) return;
      try {
        setLoading(true);
        setError(null);

        const systems = await service.getGradingSystems();
        const active = systems.find((s: GradingSystem) => s.is_active);
        if (active) {
          setGradingSystem(active);
          setGrades(await service.getGrades(active.id));
        }

        const configs = await service.getScoringConfigurationsByEducationLevel('JUNIOR_SECONDARY');
        const cfg = configs.find((c: ScoringConfiguration) =>
          c.education_level === 'JUNIOR_SECONDARY' && c.is_active
        );
        if (cfg) setScoringConfig(cfg);

        if (examSessionId && enableEnhancedFeatures) {
          try {
            const all = await service.getExamSessions();
            const sess = all.find((s: ExamSession) => s.id === examSessionId);
            if (sess) setExamSession(sess);
          } catch { /* session info is optional */ }
        }
      } catch (err) {
        setError('Failed to load grading data');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [service, serviceLoading, examSessionId, enableEnhancedFeatures]);

  // ── Dynamic column headers from scoring config ─────────────────────────────
  const columnHeaders = useMemo((): string[] => {
    const c = scoringConfig as any;
    const label = (base: string, key: string) =>
      c?.[key] != null ? `${base}\n(${c[key]})` : base;

    return [
      label('C.A', 'continuous_assessment_max_score'),
      label('TAKE HOME\nTEST', 'take_home_test_max_score'),
      label('PROJECT\nMARKS', 'project_max_score'),
      label('APPEARANCE\nMARKS', 'appearance_max_score'),
      label('PRACTICAL\nMARKS', 'practical_max_score'),
      label('NOTE COPYING\nMARKS', 'note_copying_max_score'),
      label('C.A\nTOTAL', 'total_ca_max_score'),
      label('EXAM', 'exam_max_score'),
      'TOTAL\n(100%)',
      'POSITION',
      'GRADE',
      'REMARKS BY\nCLASS TEACHER',
    ];
  }, [scoringConfig]);

  // ── School info (must be before early returns — hooks rule) ────────────────
  const schoolInfo = useMemo(() => {
    if (!schoolSettings) return undefined;
    return { ...schoolSettings, school_name: (schoolSettings as any).school_name || '' };
  }, [schoolSettings]);

  // ── Grade lookup ───────────────────────────────────────────────────────────
  const getGradeForScore = (score: number): { grade: string; remark: string; isPass: boolean } => {
    if (!gradingSystem || grades.length === 0)
      return { grade: '—', remark: '—', isPass: false };

    const range = grades.find(g => score >= g.min_score && score <= g.max_score);
    if (range) return { grade: range.grade, remark: range.remark, isPass: range.is_passing };

    return { grade: '—', remark: '—', isPass: score >= gradingSystem.pass_mark };
  };

  // ── CA total ───────────────────────────────────────────────────────────────
  const calcCATotal = (s: SubjectResult): number => {
    if (s.ca_total != null && !isNaN(Number(s.ca_total))) return Number(s.ca_total);
    return (
      (Number(s.continuous_assessment_score) || 0) +
      (Number(s.take_home_test_score) || 0) +
      (Number(s.practical_score) || 0) +
      (Number(s.appearance_score) || 0) +
      (Number(s.project_score) || 0) +
      (Number(s.note_copying_score) || 0)
    );
  };

  // ── Total score for a subject row ──────────────────────────────────────────
  const rowTotal = (s: SubjectResult): number => {
    const mo = Number(s.mark_obtained);
    if (mo > 0 && String(s.mark_obtained).length < 20) return mo;
    return calcCATotal(s) + (Number(s.exam_marks) || 0);
  };

  // ── Filtered subjects ──────────────────────────────────────────────────────
  const subjectsToUse = useMemo(() => {
    if (!data?.subjects) return [];
    return showOnlyPublished
      ? data.subjects.filter(s => s.status === 'PUBLISHED')
      : data.subjects;
  }, [data?.subjects, showOnlyPublished]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const { totalScore, averageScore } = useMemo(() => {
    if (data.total_score > 0) return { totalScore: data.total_score, averageScore: data.average_score };
    if (!subjectsToUse.length) return { totalScore: 0, averageScore: 0 };
    const sum = subjectsToUse.reduce((acc, s) => acc + rowTotal(s), 0);
    return { totalScore: Math.round(sum), averageScore: Math.round((sum / subjectsToUse.length) * 100) / 100 };
  }, [subjectsToUse, data.total_score, data.average_score]);

  // ── PDF ────────────────────────────────────────────────────────────────────
  const downloadPDF = async () => {
    if (!ref.current) return;
    try {
      const canvas = await html2canvas(ref.current, {
        scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff',
        removeContainer: true, scrollX: 0, scrollY: 0,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const props = (pdf as any).getImageProperties(imgData);
      let w = pw, h = (props.height * pw) / props.width;
      if (h > ph) { h = ph; w = (props.width * ph) / props.height; }
      (pdf as any).addImage(imgData, 'PNG', 0, 0, w, h);
      const name = (data.student?.name || data.student?.full_name || 'student').replace(/\s+/g, '_');
      const term = data.term?.name || 'term';
      const sess = data.term?.session || data.term?.year || 'session';
      pdf.save(`${name}_result_${term}_${sess}_${new Date().toISOString().split('T')[0]}.pdf`);
      if (onPDFGenerated) {
        const url = URL.createObjectURL((pdf as any).output('blob'));
        onPDFGenerated(url);
      }
    } catch { setError('Failed to generate PDF'); }
  };

  const generateEnhancedPDF = async () => {
    if (!studentId || !examSessionId || !service || !enableEnhancedFeatures) return downloadPDF();
    try {
      const result = await service.generateEnhancedResultSheet(studentId, examSessionId);
      if (result?.download_url) {
        window.open(result.download_url as string, '_blank');
        onPDFGenerated?.(result.download_url as string);
      } else {
        await downloadPDF();
      }
    } catch { await downloadPDF(); }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (serviceLoading || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p>Loading result data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64 text-red-600">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 bg-gray-100 min-h-screen">
      <div className="mb-4">
        <button
          onClick={enableEnhancedFeatures ? generateEnhancedPDF : downloadPDF}
          className="px-4 py-2 bg-indigo-700 text-white rounded shadow hover:bg-indigo-800 transition-colors"
        >
          Download PDF
        </button>
      </div>

      <div
        ref={ref}
        className="bg-white mx-auto p-6 border border-gray-300 relative"
        style={{ width: '850px' }}
      >
        {schoolInfo?.school_name && <WatermarkLogo schoolInfo={schoolInfo} />}

        {/* ── Header ── */}
        <div className="text-center mb-6">
          <div className="grid grid-cols-[20%_60%_20%] gap-4 mb-4">
            <div className="flex justify-start items-center">
              {schoolSettings?.logo ? (
                <img src={schoolSettings.logo} alt="School Logo" className="w-16 h-16 object-contain rounded-full" />
              ) : schoolSettings?.school_name ? (
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold">
                  {(schoolSettings.school_name as string).split(' ').map((w: string) => w[0]).join('')}
                </div>
              ) : null}
            </div>

            <div className="text-center relative z-10">
              {schoolInfo?.school_name && (
                <h1 className="text-3xl font-bold text-blue-900 mb-2">
                  {(schoolInfo.school_name as string).toUpperCase()}
                </h1>
              )}
              {schoolSettings?.address && (
                <p className="text-xs text-gray-600">{schoolSettings.address as string}</p>
              )}
              {(schoolSettings?.phone || schoolSettings?.email) && (
                <p className="text-sm text-gray-600">
                  {[schoolSettings?.phone, schoolSettings?.email].filter(Boolean).join(' | ')}
                </p>
              )}
              {schoolSettings?.motto && (
                <p className="text-xs italic text-blue-700 mt-1">{schoolSettings.motto as string}</p>
              )}
            </div>
          </div>

          <div className="bg-blue-900 text-white py-1 px-2 rounded-lg inline-block">
            <h5 className="text-sm font-semibold">STUDENT'S TERMLY REPORT</h5>
            <p className="text-xs">
              {data.term?.name}{data.term?.name && (data.term?.session || data.term?.year) ? ', ' : ''}
              {data.term?.session || data.term?.year} Academic Session
            </p>
          </div>
        </div>

        {/* ── Student Info ── */}
        <div className="mb-6 text-sm space-y-3 relative z-10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">NAME</span>
            <div className="w-64 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">
                {data.student?.name || data.student?.full_name || ''}
              </span>
            </div>
            <span className="ml-4 font-semibold text-slate-700">AGE</span>
            <div className="w-24 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">{data.student?.age || ''}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">CLASS</span>
            <div className="w-36 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">{data.student?.class || ''}</span>
            </div>
            <span className="ml-4 font-semibold text-slate-700">NO IN CLASS</span>
            <div className="w-36 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">{data.total_students || ''}</span>
            </div>
            <span className="ml-4 font-semibold text-slate-700">POSITION IN CLASS</span>
            <div className="w-36 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">
                {data.class_position
                  ? `${data.class_position}${getOrdinalSuffix(data.class_position)}`
                  : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">TIMES SCHOOL OPENED:</span>
            <div className="w-32 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">
                {data.attendance?.times_opened || ''}
              </span>
            </div>
            <span className="ml-4 font-semibold text-slate-700">TIMES PRESENT:</span>
            <div className="w-32 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">
                {data.attendance?.times_present || ''}
              </span>
            </div>
            <span className="ml-4 font-semibold text-slate-700">NEXT TERM BEGINS</span>
            <div className="w-36 border-b border-slate-400 text-center" style={{ height: 1 }}>
              <span className="bg-white px-2 text-slate-800 font-medium">
                {formatDate(nextTermBegins)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Academic Performance ── */}
        <div className="text-center font-semibold text-base mb-2 text-blue-900 relative z-10">
          ACADEMIC PERFORMANCE
        </div>

        <div className="overflow-x-auto mb-6 relative z-10">
          <table className="w-full border-collapse border-2 border-slate-800 bg-white">
            <thead>
              <tr style={{ height: '100px' }}>
                {/* Grading key */}
                <th
                  className="border border-slate-600 p-2 text-left align-top bg-slate-100"
                  style={{ width: '180px' }}
                >
                  <div className="text-[10px] font-bold mb-1 text-slate-800">SUBJECTS / KEY TO GRADING</div>
                  {grades.length > 0 ? (
                    <div className="text-[9px] leading-tight space-y-0.5 text-slate-600">
                      {[...grades]
                        .sort((a, b) => b.min_score - a.min_score)
                        .slice(0, 7)
                        .map(g => (
                          <div key={g.id}>
                            {g.grade} {g.description || g.remark} {g.min_score}–{g.max_score}%
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-400 italic">Loading grades…</div>
                  )}
                </th>

                {/* Dynamic column headers */}
                {columnHeaders.map((header, idx) => (
                  <th
                    key={idx}
                    className="border border-slate-600 p-0.5 relative bg-slate-200"
                    style={{ width: '45px', minWidth: '32px', height: '100px' }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="transform -rotate-90 text-[9px] font-medium text-center leading-tight text-slate-700"
                        style={{
                          width: '90px', textAlign: 'center', height: '100px',
                          display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        }}
                      >
                        {header.split('\n').map((line, i) => (
                          <div key={i} style={{ marginBottom: i < header.split('\n').length - 1 ? '3px' : 0, lineHeight: '1.1' }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </th>
                ))}

                <th
                  className="border border-slate-600 p-1 text-center font-bold bg-slate-300"
                  style={{ width: '40px', height: '100px' }}
                >
                  <div className="text-[10px] flex items-center justify-center h-full text-slate-800">GRADE</div>
                </th>
              </tr>
            </thead>

            <tbody>
              {subjectsToUse.map((s, idx) => {
                const total = rowTotal(s);
                const gradeInfo = getGradeForScore(total);
                const bg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';

                const positionText = (() => {
                  if (s.position && typeof s.position === 'string' &&
                    ['st','nd','rd','th'].some(sfx => s.position!.includes(sfx))) return s.position as string;
                  if (typeof s.subject_position === 'number')
                    return `${s.subject_position}${getOrdinalSuffix(s.subject_position)}`;
                  if (typeof s.position === 'number')
                    return `${s.position}${getOrdinalSuffix(s.position as number)}`;
                  return '';
                })();

                return (
                  <tr key={s.id || idx}>
                    <td className={`border border-slate-600 p-2 font-semibold text-[10px] ${bg}`}>
                      {s.subject?.name || ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {s.continuous_assessment_score ? Math.round(s.continuous_assessment_score) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {s.take_home_test_score ? Math.round(s.take_home_test_score) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {s.project_score ? Math.round(s.project_score) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {s.appearance_score ? Math.round(s.appearance_score) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {s.practical_score ? Math.round(s.practical_score) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {s.note_copying_score ? Math.round(s.note_copying_score) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs font-semibold ${bg}`}>
                      {Math.round(calcCATotal(s)) || ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {s.exam_marks ? Math.round(s.exam_marks) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs font-bold ${bg}`}>
                      {total > 0 ? Math.round(total) : ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs ${bg}`}>
                      {positionText}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs font-bold ${bg}`}>
                      {s.grade || gradeInfo.grade}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-[8px] ${bg}`}>
                      {s.teacher_remark || ''}
                    </td>
                    <td className={`border border-slate-600 p-0.5 text-center text-xs font-bold ${bg}`} style={{ width: '40px' }}>
                      {s.grade || gradeInfo.grade}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-between text-sm relative z-10">
          {/* Totals + Physical Development */}
          <div className="flex-1 pr-6">
            <div className="mb-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="mb-2 text-xs font-semibold text-slate-700">
                Total Scores:{' '}
                <span className="inline-block w-20 text-center font-bold text-blue-800">
                  {totalScore > 0 ? Math.round(totalScore) : ''}
                </span>
              </div>
              <div className="mb-2 text-xs font-semibold text-slate-700">
                Average Scores:{' '}
                <span className="inline-block w-20 text-center font-bold text-blue-800">
                  {averageScore > 0 ? Math.round(averageScore * 100) / 100 : ''}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-700">
                Grade:{' '}
                <span className="inline-block w-20 text-center">
                  {data.overall_grade || (averageScore > 0 ? getGradeForScore(averageScore).grade : '')}
                </span>
              </div>
            </div>

            <div className="border-2 border-slate-800 rounded-lg overflow-hidden" style={{ width: '360px' }}>
              <div className="text-center font-bold py-2 text-xs bg-blue-900 text-white">
                PHYSICAL DEVELOPMENT
              </div>
              <table className="w-full border-collapse bg-white">
                <thead>
                  <tr>
                    <th className="border border-slate-600 p-1 text-center font-bold text-[10px] bg-slate-100" colSpan={2}>HEIGHT</th>
                    <th className="border border-slate-600 p-1 text-center font-bold text-[10px] bg-slate-100" colSpan={2}>WEIGHT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-[9px]">
                    <td className="border border-slate-600 p-1 bg-slate-50">Beginning of<br />Term</td>
                    <td className="border border-slate-600 p-1 bg-white">End of<br />Term</td>
                    <td className="border border-slate-600 p-1 bg-slate-50">Beginning of<br />Term</td>
                    <td className="border border-slate-600 p-1 bg-white">End of<br />Term</td>
                  </tr>
                  <tr className="text-[8px]">
                    {['cm','cm','cm','cm'].map((u, i) => (
                      <td key={i} className="border border-slate-600 p-1 text-center">{u}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-slate-600 p-1 text-[9px] bg-slate-100" colSpan={4}>NURSE'S COMMENT</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Remarks + Signatures */}
          <div className="flex-1">
            <div className="mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="font-semibold text-[10px] text-slate-800">CLASS TEACHER'S COMMENT:</div>
              <div className="text-[10px] mt-1 text-slate-600">{data.class_teacher_remark || ''}</div>
            </div>
            <div className="mb-4">
              <div className="text-[10px] font-medium text-slate-700">
                SIGNATURE/DATE: <span className="border-b border-slate-400 inline-block w-28" />
              </div>
            </div>
            <div className="mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="font-semibold text-[10px] text-slate-800">HEAD TEACHER'S COMMENT:</div>
              <div className="text-[10px] mt-1 text-slate-600">{data.head_teacher_remark || ''}</div>
            </div>
            <div className="mb-4">
              <div className="text-[10px] font-medium text-slate-700">
                SIGNATURE/DATE: <span className="border-b border-slate-400 inline-block w-28" />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-slate-700">
                PARENT'S SIGNATURE/DATE: <span className="border-b border-slate-400 inline-block w-32" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
