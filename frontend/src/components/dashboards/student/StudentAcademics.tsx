import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  BookOpen, TrendingUp, Award, Users, ChevronDown,
  AlertCircle, Loader2, BarChart2, RefreshCw,
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
  start_date?: string;
  end_date?: string;
}

interface AcademicSessionInfo {
  id: string | number;
  name: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

/** Shape of each item in `subject_results[]` from the backend */
interface SubjectResult {
  subject: { id: string | number; name: string; code?: string };
  total_score: string | number;
  percentage: string | number;
  grade: string;
  grade_point?: string | number | null;
  is_passed: boolean;
  class_average: string | number | null;
  highest_in_class: string | number | null;
  lowest_in_class: string | number | null;
  subject_position: number | null;
  position?: string;
  teacher_remark?: string;
  ca_total?: string | number;
  component_scores?: Array<{ component_name: string; score: string; max_score: string }>;
}

/** Shape returned by /api/results/{level}/term-reports/ */
interface TermReport {
  id: string;
  average_score: string | number;
  total_score?: string | number;
  overall_grade?: string;
  class_position?: number | null;
  total_students?: number;
  times_opened?: number;
  times_present?: number;
  subject_results: SubjectResult[];
  is_published?: boolean;
  class_teacher_remark?: string;
  head_teacher_remark?: string;
}

interface TermTrend {
  term: string;
  avg: number;
}

// ============================================================================
// HELPERS
// ============================================================================

const toNum = (v: any): number => {
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
};

const gradeColor: Record<string, string> = {
  A: '#10b981',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#f97316',
  E: '#ef4444',
  F: '#dc2626',
};

const levelPath: Record<string, string> = {
  NURSERY: 'nursery',
  PRIMARY: 'primary',
  JUNIOR_SECONDARY: 'junior-secondary',
  JUNIOR_SEC: 'junior-secondary',
  JSS: 'junior-secondary',
  SENIOR_SECONDARY: 'senior-secondary',
  SENIOR_SEC: 'senior-secondary',
  SSS: 'senior-secondary',
};

function resolveLevelPath(raw: string): string {
  const up = raw.toUpperCase().replace(/ /g, '_').replace(/-/g, '_');
  if (levelPath[up]) return levelPath[up];
  if (up.includes('NURSERY')) return 'nursery';
  if (up.includes('PRIMARY')) return 'primary';
  if (up.includes('JUNIOR') || up.includes('JSS')) return 'junior-secondary';
  if (up.includes('SENIOR') || up.includes('SSS')) return 'senior-secondary';
  return 'primary';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatCard = ({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5 flex items-start gap-4">
    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
      <Icon className="w-5 h-5" style={{ color }} />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-4">{children}</h3>
);

// ============================================================================
// CUSTOM TOOLTIPS
// ============================================================================

const SubjectTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-lg border border-gray-200 dark:border-slate-600 text-xs">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{d.name}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
          <span className="text-gray-500 dark:text-slate-400">{p.name}:</span>
          <span className="font-semibold text-gray-800 dark:text-slate-200">{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-lg border border-gray-200 dark:border-slate-600 text-xs">
      <p className="font-semibold text-gray-800 dark:text-white">Grade {payload[0].name}</p>
      <p className="text-gray-500 dark:text-slate-400">{payload[0].value} subject{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  );
};

const TrendTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-lg border border-gray-200 dark:border-slate-600 text-xs">
      <p className="font-semibold text-gray-800 dark:text-white">{payload[0].payload.term}</p>
      <p className="text-gray-500 dark:text-slate-400">Avg: <span className="font-semibold text-gray-800 dark:text-slate-200">{Number(payload[0].value).toFixed(1)}%</span></p>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StudentAcademics: React.FC = () => {
  const { settings: designSettings } = useDesign();
  const primaryColor = designSettings?.primary_color || '#4F46E5';

  // ── data state ─────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<AcademicSessionInfo[]>([]);
  const [terms, setTerms] = useState<TermInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | number | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<string | number | null>(null);
  const [educationLevel, setEducationLevel] = useState<string>('');
  const [levelPath_, setLevelPath_] = useState<string>('primary');

  const [termReport, setTermReport] = useState<TermReport | null>(null);
  const [trendData, setTrendData] = useState<TermTrend[]>([]);

  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpts: RequestInit = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };

  // ── bootstrap: fetch session, terms, classroom ────────────────────────────
  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      try {
        setLoading(true);
        setError(null);

        const [sessionRes, classRes] = await Promise.all([
          fetch(`${API_BASE_URL}/classrooms/academic-sessions/current/`, fetchOpts),
          fetch(`${API_BASE_URL}/students/my-classroom/`, fetchOpts),
        ]);

        if (!sessionRes.ok) throw new Error('Could not load academic session');

        const session: AcademicSessionInfo = await sessionRes.json();
        const classroom = classRes.ok ? await classRes.json() : null;

        if (!alive) return;

        setSessions([session]);
        setSelectedSessionId(session.id);

        if (classroom?.education_level) {
          const el = String(classroom.education_level);
          setEducationLevel(el);
          setLevelPath_(resolveLevelPath(el));
        }

        const termsRes = await fetch(
          `${API_BASE_URL}/classrooms/academic-sessions/${session.id}/terms/`,
          fetchOpts
        );
        if (!termsRes.ok) throw new Error('Could not load terms');
        const termsData: TermInfo[] = await termsRes.json();

        if (!alive) return;
        setTerms(Array.isArray(termsData) ? termsData : []);

        // default to the most recent term
        if (termsData.length > 0) {
          setSelectedTermId(termsData[termsData.length - 1].id);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (alive) setLoading(false);
      }
    };
    bootstrap();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── fetch term report when term/level changes ─────────────────────────────
  const fetchReport = useCallback(async () => {
    if (!selectedTermId || !levelPath_) return;
    setReportLoading(true);
    try {
      const res = await api.get(
        `/results/${levelPath_}/term-reports/?term=${selectedTermId}`
      );
      const list: TermReport[] = Array.isArray(res) ? res : (res.results || []);
      setTermReport(list.length > 0 ? list[0] : null);
    } catch {
      setTermReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [selectedTermId, levelPath_]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // ── build term trend across all terms of the session ─────────────────────
  useEffect(() => {
    if (!terms.length || !levelPath_) return;
    let alive = true;
    const buildTrend = async () => {
      try {
        const results = await Promise.all(
          terms.map(t =>
            api.get(`/results/${levelPath_}/term-reports/?term=${t.id}`)
              .then((res: any) => {
                const list: TermReport[] = Array.isArray(res) ? res : (res.results || []);
                const r = list[0];
                return {
                  term: t.name_display || t.name,
                  avg: r ? toNum(r.average_score) : 0,
                };
              })
              .catch(() => ({ term: t.name_display || t.name, avg: 0 }))
          )
        );
        if (alive) setTrendData(results.filter(r => r.avg > 0));
      } catch { /* silent */ }
    };
    buildTrend();
    return () => { alive = false; };
  }, [terms, levelPath_]);

  // ── derived chart data ────────────────────────────────────────────────────
  const subjectBarData = useMemo(() => {
    const list = termReport?.subject_results;
    if (!list?.length) return [];
    return list.map(s => {
      const name = s.subject?.name || 'Unknown';
      return {
        name: name.length > 12 ? name.slice(0, 12) + '…' : name,
        fullName: name,
        score: toNum(s.percentage),
        classAvg: toNum(s.class_average),
        grade: s.grade,
      };
    });
  }, [termReport]);

  const gradeDistData = useMemo(() => {
    const list = termReport?.subject_results;
    if (!list?.length) return [];
    const counts: Record<string, number> = {};
    list.forEach(s => {
      const g = (s.grade || 'F').charAt(0).toUpperCase();
      counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts).map(([grade, count]) => ({ grade, count }));
  }, [termReport]);

  const filteredTerms = useMemo(
    () => terms.filter(t => t.academic_session === selectedSessionId || !selectedSessionId),
    [terms, selectedSessionId]
  );

  const attendanceRate = useMemo(() => {
    const opened = termReport?.times_opened;
    const present = termReport?.times_present;
    if (!opened) return null;
    return Math.round(((present ?? 0) / opened) * 100);
  }, [termReport]);

  // ── loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-100 dark:bg-slate-700 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 dark:bg-slate-700 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-64 bg-gray-100 dark:bg-slate-700 rounded-xl" />
          <div className="h-64 bg-gray-100 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-10 text-center">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: primaryColor }}
        >
          Retry
        </button>
      </div>
    );
  }

  const hasData = !!termReport;

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Academics</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {educationLevel ? `${educationLevel.replace(/_/g, ' ')} · ` : ''}
            Your academic performance overview
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Session */}
          <div className="relative">
            <select
              value={String(selectedSessionId ?? '')}
              onChange={e => setSelectedSessionId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-200 focus:outline-none"
            >
              {sessions.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Term */}
          <div className="relative">
            <select
              value={String(selectedTermId ?? '')}
              onChange={e => setSelectedTermId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-200 focus:outline-none"
            >
              {filteredTerms.map(t => (
                <option key={t.id} value={String(t.id)}>{t.name_display || t.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Refresh */}
          <button
            onClick={fetchReport}
            disabled={reportLoading}
            className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 hover:text-gray-800 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${reportLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Loading overlay for report ─────────────────────────────────────── */}
      {reportLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading results…
        </div>
      )}

      {/* ── No data state ──────────────────────────────────────────────────── */}
      {!reportLoading && !hasData && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-10 text-center">
          <BarChart2 className="w-12 h-12 mx-auto mb-3" style={{ color: primaryColor, opacity: 0.4 }} />
          <p className="font-semibold text-gray-700 dark:text-slate-200 mb-1">No results yet</p>
          <p className="text-sm text-gray-400 dark:text-slate-500">
            Results for the selected term have not been published yet. Try a different term.
          </p>
        </div>
      )}

      {/* ── Summary Stats ─────────────────────────────────────────────────── */}
      {hasData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Average Score"
              value={`${toNum(termReport!.average_score).toFixed(1)}%`}
              sub="This term"
              icon={TrendingUp}
              color={primaryColor}
            />
            <StatCard
              label="Overall Grade"
              value={termReport!.overall_grade || '—'}
              sub={termReport!.is_published ? 'Published' : 'Pending'}
              icon={Award}
              color={gradeColor[termReport!.overall_grade?.charAt(0) || 'A'] || primaryColor}
            />
            <StatCard
              label="Class Position"
              value={
                termReport!.class_position
                  ? `${termReport!.class_position}${ordinal(termReport!.class_position)}`
                  : '—'
              }
              sub={termReport!.total_students ? `of ${termReport!.total_students} students` : undefined}
              icon={Users}
              color="#f59e0b"
            />
            <StatCard
              label="Attendance"
              value={attendanceRate !== null ? `${attendanceRate}%` : '—'}
              sub={
                termReport!.times_opened
                  ? `${termReport!.times_present ?? 0} / ${termReport!.times_opened} days`
                  : undefined
              }
              icon={BookOpen}
              color="#10b981"
            />
          </div>

          {/* ── Charts row ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Subject Performance – bar chart */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5">
              <SectionTitle>Subject Performance</SectionTitle>
              {subjectBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={subjectBarData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<SubjectTooltip />} cursor={{ fill: '#f9fafb' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="score" name="Your Score" fill={primaryColor} radius={[4, 4, 0, 0]} maxBarSize={24} />
                    <Bar dataKey="classAvg" name="Class Avg" fill={`${primaryColor}55`} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  <p className="text-sm text-gray-400">No subject data available</p>
                </div>
              )}
            </div>

            {/* Grade Distribution – pie chart */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5">
              <SectionTitle>Grade Distribution</SectionTitle>
              {gradeDistData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={gradeDistData}
                        dataKey="count"
                        nameKey="grade"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={78}
                        paddingAngle={2}
                      >
                        {gradeDistData.map((entry, i) => (
                          <Cell key={i} fill={gradeColor[entry.grade] || '#6b7280'} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Legend */}
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {gradeDistData.map(d => (
                      <div key={d.grade} className="flex items-center gap-1 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: gradeColor[d.grade] || '#6b7280' }} />
                        <span className="text-gray-600 dark:text-slate-400">Grade {d.grade}</span>
                        <span className="font-semibold text-gray-800 dark:text-slate-200">({d.count})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  <p className="text-sm text-gray-400">No grade data</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Term trend – only if multiple terms have data ───────────────── */}
          {trendData.length >= 2 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5">
              <SectionTitle>Performance Trend Across Terms</SectionTitle>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primaryColor} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="term" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TrendTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="avg"
                    stroke={primaryColor}
                    strokeWidth={2}
                    fill="url(#trendGrad)"
                    dot={{ fill: primaryColor, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Subject Detail Table ─────────────────────────────────────────── */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <SectionTitle>Subject Breakdown</SectionTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-700/50 text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-medium">Subject</th>
                    <th className="text-center px-3 py-3 font-medium">Score</th>
                    <th className="text-center px-3 py-3 font-medium">Grade</th>
                    <th className="text-center px-3 py-3 font-medium hidden sm:table-cell">Class Avg</th>
                    <th className="text-center px-3 py-3 font-medium hidden md:table-cell">Highest</th>
                    <th className="text-center px-3 py-3 font-medium hidden md:table-cell">Position</th>
                    <th className="text-center px-3 py-3 font-medium hidden lg:table-cell">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                  {(termReport!.subject_results ?? []).map((s, i) => {
                    const scoreNum = toNum(s.percentage);
                    const scoreColor = scoreNum >= 70 ? '#10b981' : scoreNum >= 50 ? '#f59e0b' : '#ef4444';
                    const subjectName = s.subject?.name || 'Unknown';
                    return (
                      <tr
                        key={i}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        {/* Subject name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                              style={{ background: gradeColor[s.grade?.charAt(0)] || '#6b7280' }}
                            >
                              {s.grade?.charAt(0) || '?'}
                            </div>
                            <span className="font-medium text-gray-800 dark:text-slate-200">{subjectName}</span>
                          </div>
                        </td>

                        {/* Score with bar */}
                        <td className="px-3 py-3.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-bold text-gray-900 dark:text-white" style={{ color: scoreColor }}>
                              {scoreNum.toFixed(1)}
                            </span>
                            <div className="w-16 h-1.5 bg-gray-100 dark:bg-slate-600 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${Math.min(scoreNum, 100)}%`, background: scoreColor }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Grade badge */}
                        <td className="px-3 py-3.5 text-center">
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white"
                            style={{ background: gradeColor[s.grade?.charAt(0)] || '#6b7280' }}
                          >
                            {s.grade || '—'}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-center text-gray-500 dark:text-slate-400 hidden sm:table-cell">
                          {s.class_average !== null ? toNum(s.class_average).toFixed(1) : '—'}
                        </td>

                        <td className="px-3 py-3.5 text-center text-gray-500 dark:text-slate-400 hidden md:table-cell">
                          {s.highest_in_class !== null ? toNum(s.highest_in_class).toFixed(1) : '—'}
                        </td>

                        <td className="px-3 py-3.5 text-center hidden md:table-cell">
                          {s.subject_position ? (
                            <span className="text-xs font-semibold" style={{ color: primaryColor }}>
                              {s.position || `${s.subject_position}${ordinal(s.subject_position)}`}
                            </span>
                          ) : '—'}
                        </td>

                        <td className="px-3 py-3.5 text-center text-xs text-gray-400 dark:text-slate-500 hidden lg:table-cell max-w-[140px] truncate">
                          {s.teacher_remark || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer summary */}
            {(() => {
              const list = termReport!.subject_results ?? [];
              const passed = list.filter(s => s.is_passed).length;
              return (
                <div className="px-5 py-3 bg-gray-50 dark:bg-slate-700/30 border-t border-gray-100 dark:border-slate-700 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-slate-400">
                  <span>
                    <span className="font-semibold text-gray-700 dark:text-slate-200">{list.length}</span> subjects
                  </span>
                  <span>
                    Avg:{' '}
                    <span className="font-semibold text-gray-700 dark:text-slate-200">
                      {toNum(termReport!.average_score).toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    Pass rate:{' '}
                    <span className="font-semibold text-gray-700 dark:text-slate-200">
                      {list.length > 0 ? `${Math.round((passed / list.length) * 100)}%` : '—'}
                    </span>
                  </span>
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
};

// ── ordinal suffix helper ─────────────────────────────────────────────────────
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default StudentAcademics;
