import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PopulationTrendChartProps {
  students: any[];
  teachers: any[];
  parents: any[];
  classrooms: any[];
  loading?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERIES_CONFIG = [
  { key: 'students', label: 'Students', color: '#3b82f6', dash: '' },
  { key: 'teachers', label: 'Teachers', color: '#10b981', dash: '' },
  { key: 'parents', label: 'Parents', color: '#f59e0b', dash: '5 5' },
  { key: 'classrooms', label: 'Classrooms', color: '#8b5cf6', dash: '5 5' },
] as const;

type SeriesKey = (typeof SERIES_CONFIG)[number]['key'];

/** Parse created_at into a JS Date, return null if unparseable. */
const parseDate = (item: any): Date | null => {
  const raw =
    item?.created_at ??
    item?.user?.created_at ??
    item?.date_joined ??
    item?.user?.date_joined ??
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

/** Return "YYYY-MM" string for a Date. */
const toMonthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Return short label e.g. "Apr '25" */
const toMonthLabel = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

/** Build the last N month keys relative to today, inclusive. */
const buildMonthKeys = (n: number): string[] => {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(toMonthKey(d));
  }
  return keys;
};

/**
 * For each month, count how many items had been created AT OR BEFORE that
 * month (cumulative = running total, reflects actual school size).
 */
const buildCumulativeSeries = (items: any[], monthKeys: string[]): Record<string, number> => {
  const result: Record<string, number> = {};
  monthKeys.forEach((mk) => {
    const [year, month] = mk.split('-').map(Number);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59); // last ms of month
    result[mk] = items.filter((item) => {
      const d = parseDate(item);
      return d !== null && d <= endOfMonth;
    }).length;
  });
  return result;
};

// ── Custom tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-sm min-w-[160px]">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-gray-600">{p.name}:</span>
          </div>
          <span className="font-semibold text-gray-900">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Component ──────────────────────────────────────────────────────────────────
const PopulationTrendChart: React.FC<PopulationTrendChartProps> = ({
  students,
  teachers,
  parents,
  classrooms,
  loading = false,
}) => {
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesKey>>(new Set());

  const toggleSeries = (key: SeriesKey) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const MONTHS = 12;
  const monthKeys = useMemo(() => buildMonthKeys(MONTHS), []);

  // ── Build chart data ──────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const studentSeries = buildCumulativeSeries(students, monthKeys);
    const teacherSeries = buildCumulativeSeries(teachers, monthKeys);
    const parentSeries = buildCumulativeSeries(parents, monthKeys);
    const classroomSeries = buildCumulativeSeries(classrooms, monthKeys);

    return monthKeys.map((mk) => ({
      month: toMonthLabel(mk),
      monthKey: mk,
      students: studentSeries[mk],
      teachers: teacherSeries[mk],
      parents: parentSeries[mk],
      classrooms: classroomSeries[mk],
    }));
  }, [students, teachers, parents, classrooms, monthKeys]);

  // ── Growth stats (first vs last month) ────────────────────────────────────
  const growthStats = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    return SERIES_CONFIG.map((cfg) => {
      const prev = first[cfg.key] as number;
      const curr = last[cfg.key] as number;
      const diff = curr - prev;
      const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : null;
      return { ...cfg, current: curr, diff, pct };
    });
  }, [chartData]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">School Population Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-200 rounded-lg" />)}
            </div>
            <div className="h-64 bg-gray-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div>
          <CardTitle className="text-lg font-semibold">School Population Trend</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Cumulative growth over the last 12 months
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Growth KPI cards */}
        {growthStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {growthStats.map((s) => {
              const growing = s.diff > 0;
              const flat = s.diff === 0;
              return (
                <div
                  key={s.key}
                  className="p-3 rounded-xl border bg-gray-50 border-gray-200"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 font-medium">{s.label}</span>
                    {flat ? (
                      <Minus className="w-3.5 h-3.5 text-gray-400" />
                    ) : growing ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                  <p className="text-xl font-bold text-gray-900">{s.current}</p>
                  <p
                    className={`text-xs mt-0.5 font-medium ${
                      flat
                        ? 'text-gray-400'
                        : growing
                        ? 'text-emerald-600'
                        : 'text-red-500'
                    }`}
                  >
                    {flat
                      ? 'No change'
                      : `${growing ? '+' : ''}${s.diff} ${
                          s.pct ? `(${growing ? '+' : ''}${s.pct}%)` : ''
                        } vs 12mo ago`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Toggle buttons */}
        <div className="flex flex-wrap gap-2">
          {SERIES_CONFIG.map((cfg) => {
            const hidden = hiddenSeries.has(cfg.key);
            return (
              <button
                key={cfg.key}
                onClick={() => toggleSeries(cfg.key)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  hidden
                    ? 'bg-white text-gray-400 border-gray-200'
                    : 'text-white border-transparent'
                }`}
                style={hidden ? {} : { backgroundColor: cfg.color }}
              >
                <span
                  className={`w-2 h-2 rounded-full ${hidden ? 'bg-gray-300' : 'bg-white'}`}
                />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Line chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                interval={1}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {SERIES_CONFIG.map((cfg) =>
                hiddenSeries.has(cfg.key) ? null : (
                  <Line
                    key={cfg.key}
                    type="monotone"
                    dataKey={cfg.key}
                    name={cfg.label}
                    stroke={cfg.color}
                    strokeWidth={2.5}
                    strokeDasharray={cfg.dash}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                )
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Insight note */}
        {growthStats && (() => {
          const studentGrowth = growthStats.find((s) => s.key === 'students');
          if (!studentGrowth) return null;
          const growing = studentGrowth.diff > 0;
          const flat = studentGrowth.diff === 0;
          return (
            <div
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs border ${
                flat
                  ? 'bg-gray-50 border-gray-200 text-gray-500'
                  : growing
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {flat ? (
                <Minus className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              ) : growing ? (
                <TrendingUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              )}
              <span>
                {flat
                  ? 'Student enrollment has remained unchanged over the past 12 months.'
                  : growing
                  ? `Your school is growing — student enrollment increased by ${studentGrowth.diff} over the past 12 months${studentGrowth.pct ? ` (${studentGrowth.pct}%)` : ''}.`
                  : `Student enrollment has declined by ${Math.abs(studentGrowth.diff)} over the past 12 months${studentGrowth.pct ? ` (${studentGrowth.pct}%)` : ''}. Consider reviewing your enrollment strategy.`}
              </span>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
};

export default PopulationTrendChart;