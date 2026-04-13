import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Users } from 'lucide-react';

interface GenderChartProps {
  /**
   * Raw students array (extracted from paginated response).
   * Each student should have a `gender` field (or `user.gender`).
   * Accepted values (case-insensitive): 'male'|'m', 'female'|'f', anything else → 'Other'
   */
  students: any[];
  loading?: boolean;
  /**
   * Optional pre-computed counts from the API.
   * Shape: { male: number; female: number; other: number }
   * If provided, takes priority over client-side computation from `students`.
   */
  apiData?: { male: number; female: number; other: number } | null;
}

const GENDER_CONFIG = [
  {
    key: 'male',
    label: 'Male',
    color: '#3b82f6',
    light: '#eff6ff',
    border: '#bfdbfe',
    text: '#1d4ed8',
  },
  {
    key: 'female',
    label: 'Female',
    color: '#ec4899',
    light: '#fdf2f8',
    border: '#fbcfe8',
    text: '#be185d',
  },
  {
    key: 'other',
    label: 'Other / N/A',
    color: '#8b5cf6',
    light: '#f5f3ff',
    border: '#ddd6fe',
    text: '#6d28d9',
  },
];

const GenderChart: React.FC<GenderChartProps> = ({
  students,
  loading = false,
  apiData
}) => {
  const counts = useMemo(() => {
    if (apiData) return apiData;
    const result = { male: 0, female: 0, other: 0 };
    students.forEach((s: any) => {
      const raw = (s.gender ?? s.user?.gender ?? '').toString().toLowerCase().trim();
      if (raw === 'male' || raw === 'm') result.male++;
      else if (raw === 'female' || raw === 'f') result.female++;
      else result.other++;
    });
    return result;
  }, [students, apiData]);

  const total = counts.male + counts.female + counts.other;

  // Hide zero-value slices so the pie doesn't render invisible segments
  const chartData = GENDER_CONFIG.map((cfg) => ({
    name: cfg.label,
    value: counts[cfg.key as keyof typeof counts],
    color: cfg.color,
    percentage:
      total > 0
        ? ((counts[cfg.key as keyof typeof counts] / total) * 100).toFixed(1)
        : '0.0',
  })).filter((d) => d.value > 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-1">{d.name}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Students:</span>
              <span className="font-semibold">{d.value.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Share:</span>
              <span className="font-semibold">{d.percentage}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Gender Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-52 bg-gray-200 rounded" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (total === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Gender Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
            <Users className="w-8 h-8 text-gray-300" />
            <p className="text-gray-400 text-sm">No student gender data available</p>
            <p className="text-xs text-gray-400">
              Make sure students have a{' '}
              <code className="bg-gray-100 px-1 rounded">gender</code> field set.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Chart ─────────────────────────────────────────────────────────────────
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Gender Distribution</CardTitle>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-lg">
            <Users className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-600 font-medium">
              {total.toLocaleString()} total
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/*
          Donut chart.
          The centre label is a plain absolutely-positioned <div> overlaid on
          top of the chart wrapper — NOT a Recharts label component.
          This avoids the `viewBox is undefined` crash that happens when
          Recharts calls a custom label before the chart has laid out.
        */}
        <div className="relative h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`gender-cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Centre label — pure DOM, zero Recharts involvement */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
            aria-hidden="true"
          >
            <span className="text-2xl font-bold text-gray-900 leading-tight">
              {total.toLocaleString()}
            </span>
            <span className="text-xs text-gray-400 mt-0.5">students</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-2">
          {GENDER_CONFIG.map((cfg) => {
            const count = counts[cfg.key as keyof typeof counts];
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            return (
              <div
                key={cfg.key}
                className="flex flex-col items-center p-3 rounded-xl border"
                style={{ backgroundColor: cfg.light, borderColor: cfg.border }}
              >
                <span className="text-xs font-medium mb-1" style={{ color: cfg.text }}>
                  {cfg.label}
                </span>
                <span className="text-xl font-bold text-gray-900">
                  {count.toLocaleString()}
                </span>
                <span className="text-xs mt-0.5" style={{ color: cfg.text }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bars */}
        <div className="border-t pt-3 space-y-2">
          {GENDER_CONFIG.map((cfg) => {
            const count = counts[cfg.key as keyof typeof counts];
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={cfg.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="text-sm text-gray-700">{cfg.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default GenderChart;