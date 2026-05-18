import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy, TrendingUp, CheckCircle, XCircle,
  ChevronDown, RefreshCw, Loader2, AlertCircle,
  BookOpen, BarChart2,
} from 'lucide-react';
import api, { API_BASE_URL } from '@/services/api';
import { useDesign } from '@/contexts/DesignContext';

// ============================================================================
// TYPES
// ============================================================================

interface TermInfo {
  id: string | number;
  name: string;
  name_display?: string;
  academic_session: string | number;
}

interface AcademicSession {
  id: string | number;
  name: string;
}

interface ComponentScore {
  id: number;
  component_name: string;
  component_code: string;
  component_type: string;
  max_score: string;
  score: string;
  contributes_to_ca: boolean;
  display_order: number;
}

interface SubjectResult {
  id: string;
  subject: { id: string | number; name: string; code?: string };
  total_score: string | number;
  percentage: string | number;
  grade: string;
  grade_point: string | number | null;
  is_passed: boolean;
  ca_total: string | number;
  class_average: string | number | null;
  highest_in_class: string | number | null;
  subject_position: number | null;
  position?: string;
  teacher_remark?: string;
  component_scores: ComponentScore[];
  status?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const toNum = (v: any): number => {
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

const gradeColor: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', E: '#ef4444', F: '#dc2626',
};

function gradeFromStr(g: string): string {
  return g ? g.charAt(0).toUpperCase() : 'F';
}

function levelPath(raw: string): string {
  const up = raw.toUpperCase().replace(/[ -]/g, '_');
  if (up.includes('NURSERY')) return 'nursery';
  if (up.includes('PRIMARY')) return 'primary';
  if (up.includes('JUNIOR') || up.includes('JSS')) return 'junior-secondary';
  if (up.includes('SENIOR') || up.includes('SSS')) return 'senior-secondary';
  return 'primary';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const GradeBadge = ({ grade }: { grade: string }) => {
  const g = gradeFromStr(grade);
  return (
    <span
      className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-lg font-black text-white shadow-sm"
      style={{ background: gradeColor[g] || '#6b7280' }}
    >
      {g}
    </span>
  );
};

const ScoreBar = ({ value, max = 100, color }: { value: number; max?: number; color: string }) => (
  <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-600 rounded-full overflow-hidden">
    <div
      className="h-full rounded-full transition-all duration-500"
      style={{ width: `${Math.min((value / max) * 100, 100)}%`, background: color }}
    />
  </div>
);

interface SubjectCardProps {
  result: SubjectResult;
  primaryColor: string;
  expanded: boolean;
  onToggle: () => void;
}

const SubjectCard = ({ result, primaryColor, expanded, onToggle }: SubjectCardProps) => {
  const g = gradeFromStr(result.grade);
  const color = gradeColor[g] || '#6b7280';
  const pct = toNum(result.percentage);
  const scoreColor = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden transition-shadow hover:shadow-md"
    >
      {/* Card header */}
      <div className="p-4 flex items-start gap-3">
        <GradeBadge grade={result.grade} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                {result.subject?.name || 'Unknown'}
              </p>
              {result.subject?.code && (
                <p className="text-xs text-gray-400 dark:text-slate-500">{result.subject.code}</p>
              )}
            </div>
            {result.is_passed ? (
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
          </div>

          {/* Score + bar */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-slate-400">Score</span>
              <span className="font-bold" style={{ color: scoreColor }}>{pct.toFixed(1)}%</span>
            </div>
            <ScoreBar value={pct} color={scoreColor} />
          </div>

          {/* Quick stats */}
          <div className="mt-2 flex gap-3 text-xs text-gray-400 dark:text-slate-500">
            {result.class_average !== null && (
              <span>Class avg: <span className="text-gray-600 dark:text-slate-300">{toNum(result.class_average).toFixed(1)}</span></span>
            )}
            {result.subject_position && (
              <span>Rank: <span className="font-semibold" style={{ color: primaryColor }}>{result.position || `#${result.subject_position}`}</span></span>
            )}
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      {result.component_scores?.length > 0 && (
        <>
          <button
            onClick={onToggle}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-400 dark:text-slate-500 border-t border-gray-50 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <span>{expanded ? 'Hide' : 'View'} assessment breakdown</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-2 bg-gray-50 dark:bg-slate-700/20">
              {result.component_scores
                .slice()
                .sort((a, b) => a.display_order - b.display_order)
                .map(cs => {
                  const scored = toNum(cs.score);
                  const maxS = toNum(cs.max_score);
                  const compPct = maxS > 0 ? (scored / maxS) * 100 : 0;
                  return (
                    <div key={cs.id} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-slate-300 font-medium">
                          {cs.component_name}
                        </span>
                        <span className="text-gray-700 dark:text-slate-200 font-semibold">
                          {scored} / {maxS}
                        </span>
                      </div>
                      <ScoreBar value={compPct} max={100} color={primaryColor} />
                    </div>
                  );
                })}
              {result.teacher_remark && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-600">
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Teacher's remark</p>
                  <p className="text-xs text-gray-700 dark:text-slate-200 italic">"{result.teacher_remark}"</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StudentGrades: React.FC = () => {
  const { settings: designSettings } = useDesign();
  const primaryColor = designSettings?.primary_color || '#4F46E5';

  const [session, setSession] = useState<AcademicSession | null>(null);
  const [terms, setTerms] = useState<TermInfo[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string | number | null>(null);
  const [edLevel, setEdLevel] = useState('');
  const [edLevelPath, setEdLevelPath] = useState('primary');

  const [results, setResults] = useState<SubjectResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOpts: RequestInit = { credentials: 'include', headers: { 'Content-Type': 'application/json' } };

  // ── Bootstrap: session, terms, education level ───────────────────────────
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const [sessionRes, classRes] = await Promise.all([
          fetch(`${API_BASE_URL}/classrooms/academic-sessions/current/`, fetchOpts),
          fetch(`${API_BASE_URL}/students/my-classroom/`, fetchOpts),
        ]);
        if (!sessionRes.ok) throw new Error('Failed to load session');
        const sess: AcademicSession = await sessionRes.json();
        const cls = classRes.ok ? await classRes.json() : null;

        if (!alive) return;
        setSession(sess);
        if (cls?.education_level) {
          setEdLevel(String(cls.education_level));
          setEdLevelPath(levelPath(String(cls.education_level)));
        }

        const termsRes = await fetch(`${API_BASE_URL}/classrooms/academic-sessions/${sess.id}/terms/`, fetchOpts);
        if (!termsRes.ok) throw new Error('Failed to load terms');
        const termsData: TermInfo[] = await termsRes.json();
        if (!alive) return;
        setTerms(Array.isArray(termsData) ? termsData : []);
        if (termsData.length > 0) setSelectedTermId(termsData[termsData.length - 1].id);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch results when term changes ──────────────────────────────────────
  const fetchResults = useCallback(async () => {
    if (!selectedTermId || !edLevelPath) return;
    setResultsLoading(true);
    try {
      const res = await api.get(`/results/${edLevelPath}/results/?term=${selectedTermId}`);
      const list: SubjectResult[] = Array.isArray(res) ? res : (res.results || []);
      setResults(list);
    } catch {
      setResults([]);
    } finally {
      setResultsLoading(false);
    }
  }, [selectedTermId, edLevelPath]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!results.length) return null;
    const passed = results.filter(r => r.is_passed).length;
    const avg = results.reduce((s, r) => s + toNum(r.percentage), 0) / results.length;
    return { total: results.length, passed, failed: results.length - passed, avg };
  }, [results]);

  const selectedTerm = useMemo(() => terms.find(t => String(t.id) === String(selectedTermId)), [terms, selectedTermId]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-gray-100 dark:bg-slate-700 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-slate-700 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-gray-100 dark:bg-slate-700 rounded-xl" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-10 text-center">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
      <p className="text-sm text-red-500 mb-4">{error}</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: primaryColor }}>Retry</button>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Grades</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {edLevel ? `${edLevel.replace(/_/g, ' ')} · ` : ''}{session?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={String(selectedTermId ?? '')}
              onChange={e => setSelectedTermId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-200 focus:outline-none"
            >
              {terms.map(t => <option key={t.id} value={String(t.id)}>{t.name_display || t.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <button onClick={fetchResults} disabled={resultsLoading}
            className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 hover:text-gray-800 dark:hover:text-slate-200 transition-colors">
            <RefreshCw className={`w-4 h-4 ${resultsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Subjects', value: String(stats.total), icon: BookOpen, color: primaryColor },
            { label: 'Average', value: `${stats.avg.toFixed(1)}%`, icon: TrendingUp, color: primaryColor },
            { label: 'Passed', value: String(stats.passed), icon: CheckCircle, color: '#10b981' },
            { label: 'Failed', value: String(stats.failed), icon: XCircle, color: '#ef4444' },
          ].map(card => (
            <div key={card.label} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: card.color + '18' }}>
                <card.icon className="w-4 h-4" style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-slate-500">{card.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {resultsLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading grades…
        </div>
      )}

      {/* Empty state */}
      {!resultsLoading && results.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-10 text-center">
          <BarChart2 className="w-12 h-12 mx-auto mb-3" style={{ color: primaryColor, opacity: 0.35 }} />
          <p className="font-semibold text-gray-700 dark:text-slate-200 mb-1">No grades yet</p>
          <p className="text-sm text-gray-400 dark:text-slate-500">
            Grades for <strong>{selectedTerm?.name_display || selectedTerm?.name}</strong> haven't been published yet.
          </p>
        </div>
      )}

      {/* Subject cards grid */}
      {!resultsLoading && results.length > 0 && (
        <>
          {/* Pass / Fail grouping */}
          {results.some(r => r.is_passed) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                Passed — {results.filter(r => r.is_passed).length} subjects
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results
                  .filter(r => r.is_passed)
                  .sort((a, b) => toNum(b.percentage) - toNum(a.percentage))
                  .map(r => (
                    <SubjectCard
                      key={r.id}
                      result={r}
                      primaryColor={primaryColor}
                      expanded={expandedId === r.id}
                      onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    />
                  ))}
              </div>
            </div>
          )}

          {results.some(r => !r.is_passed) && (
            <div>
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
                Failed — {results.filter(r => !r.is_passed).length} subjects
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results
                  .filter(r => !r.is_passed)
                  .sort((a, b) => toNum(b.percentage) - toNum(a.percentage))
                  .map(r => (
                    <SubjectCard
                      key={r.id}
                      result={r}
                      primaryColor={primaryColor}
                      expanded={expandedId === r.id}
                      onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Grade legend */}
          <div className="flex flex-wrap gap-3 pt-2">
            {Object.entries(gradeColor).map(([g, c]) => (
              <div key={g} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                <span className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: c }}>{g}</span>
                {{A:'Excellent', B:'Very Good', C:'Good', D:'Pass', E:'Weak', F:'Fail'}[g]}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default StudentGrades;
