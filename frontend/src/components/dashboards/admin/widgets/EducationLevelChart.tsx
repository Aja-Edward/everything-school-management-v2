import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { GraduationCap } from 'lucide-react';

interface Classroom {
  id: number;
  name: string;
  grade_level_name: string;
  education_level: string;
  current_enrollment: number;
  student_enrollments?: any[]; // Optional array of enrolled students
  max_capacity: number;
  enrollment_percentage: number;
  is_active: boolean;
}

interface EducationLevelChartProps {
  classrooms: Classroom[];
  loading?: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<
  string,
  { label: string; color: string; light: string; border: string; text: string; order: number }
> = {
  pre_nursery: {
    label: 'Pre-Nursery',
    color: '#f59e0b',
    light: '#fffbeb',
    border: '#fde68a',
    text: '#b45309',
    order: 1,
  },
  nursery: {
    label: 'Nursery',
    color: '#10b981',
    light: '#ecfdf5',
    border: '#6ee7b7',
    text: '#047857',
    order: 2,
  },
  primary: {
    label: 'Primary',
    color: '#3b82f6',
    light: '#eff6ff',
    border: '#bfdbfe',
    text: '#1d4ed8',
    order: 3,
  },
  junior_secondary: {
    label: 'Junior Secondary',
    color: '#8b5cf6',
    light: '#f5f3ff',
    border: '#ddd6fe',
    text: '#6d28d9',
    order: 4,
  },
  senior_secondary: {
    label: 'Senior Secondary',
    color: '#ec4899',
    light: '#fdf2f8',
    border: '#fbcfe8',
    text: '#be185d',
    order: 5,
  },
};

const FALLBACK_CONFIG = {
  label: 'Other',
  color: '#6b7280',
  light: '#f9fafb',
  border: '#e5e7eb',
  text: '#374151',
  order: 99,
};

// Normalise DB codes to canonical keys so aggregation groups correctly
const LEVEL_ALIASES: Record<string, string> = {
  jss: 'junior_secondary',
  sss: 'senior_secondary',
  'junior secondary': 'junior_secondary',
  'senior secondary': 'senior_secondary',
};

const normaliseLevel = (level: string): string => {
  const lower = level?.toLowerCase() ?? '';
  return LEVEL_ALIASES[lower] ?? lower;
};

const getConfig = (level: string) =>
  LEVEL_CONFIG[normaliseLevel(level)] ?? FALLBACK_CONFIG;

// ── Tooltips ──────────────────────────────────────────────────────────────────
const BarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-sm">
      <p className="font-semibold text-gray-900 mb-1">{d.label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Enrolled:</span>
          <span className="font-semibold">{d.enrolled}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Capacity:</span>
          <span className="font-semibold">{d.capacity}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Fill rate:</span>
          <span className="font-semibold">{d.fillRate}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Classes:</span>
          <span className="font-semibold">{d.classCount}</span>
        </div>
      </div>
    </div>
  );
};

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-sm">
      <p className="font-semibold text-gray-900 mb-1">{d.label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Enrolled:</span>
          <span className="font-semibold">{d.enrolled}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Share:</span>
          <span className="font-semibold">{d.percentage}%</span>
        </div>
      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────
const EducationLevelChart: React.FC<EducationLevelChartProps> = ({
  classrooms,
  loading = false,
}) => {
  const [view, setView] = useState<'bar' | 'pie'>('bar');

  // ── Aggregate by education_level ────────────────────────────────────────
  const levelData = useMemo(() => {
    const map: Record<
      string,
      { enrolled: number; capacity: number; classCount: number }
    > = {};

    classrooms
      .filter((c) => c.is_active !== false)
      .forEach((c) => {
        const key = normaliseLevel(c.education_level || 'other');
        if (!map[key]) map[key] = { enrolled: 0, capacity: 0, classCount: 0 };
        // current_enrollment is only populated on fully-expanded classroom objects.
        // Fall back to student_enrollments.length for classrooms where the API
        // returns 0 but the enrollment array is present.
        const enrolledCount =
          (c.current_enrollment > 0)
            ? c.current_enrollment
            : (Array.isArray(c.student_enrollments) ? c.student_enrollments.length : 0);
        map[key].enrolled += enrolledCount;
        map[key].capacity += c.max_capacity ?? 0;
        map[key].classCount += 1;
      });

    const totalEnrolled = Object.values(map).reduce((s, v) => s + v.enrolled, 0);

    return Object.entries(map)
      .map(([key, val]) => {
        const cfg = getConfig(key);
        return {
          key,
          label: cfg.label,
          color: cfg.color,
          order: cfg.order,
          enrolled: val.enrolled,
          capacity: val.capacity,
          classCount: val.classCount,
          fillRate:
            val.capacity > 0 ? Math.round((val.enrolled / val.capacity) * 100) : 0,
          percentage:
            totalEnrolled > 0
              ? ((val.enrolled / totalEnrolled) * 100).toFixed(1)
              : '0.0',
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [classrooms]);

  // ── Grade-level breakdown (for the detail table) ────────────────────────
  const gradeData = useMemo(() => {
    return classrooms
      .filter((c) => c.is_active !== false)
      .reduce<
        Record<string, { enrolled: number; capacity: number; level: string }>
      >((acc, c) => {
        const key = c.grade_level_name || c.name;
        if (!acc[key]) acc[key] = { enrolled: 0, capacity: 0, level: normaliseLevel(c.education_level) };
        const enrolledCount =
          (c.current_enrollment > 0)
            ? c.current_enrollment
            : (Array.isArray(c.student_enrollments) ? c.student_enrollments.length : 0);
        acc[key].enrolled += enrolledCount;
        acc[key].capacity += c.max_capacity ?? 0;
        return acc;
      }, {});
  }, [classrooms]);

  const totalEnrolled = useMemo(
    () => levelData.reduce((s, d) => s + d.enrolled, 0),
    [levelData]
  );
  const totalCapacity = useMemo(
    () => levelData.reduce((s, d) => s + d.capacity, 0),
    [levelData]
  );
  const overallFillRate =
    totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Education Level Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-56 bg-gray-200 rounded" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 bg-gray-200 rounded-lg" />)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Empty ───────────────────────────────────────────────────────────────
  if (levelData.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Education Level Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
            <GraduationCap className="w-8 h-8 text-gray-300" />
            <p className="text-gray-400 text-sm">No classroom data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Education Level Distribution</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Student enrollment across all levels
            </p>
          </div>
          <div className="flex gap-2">
            {(['bar', 'pie'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs rounded capitalize ${
                  view === v
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">Total Enrolled</p>
            <p className="text-2xl font-bold text-blue-900">{totalEnrolled}</p>
            <p className="text-xs text-gray-400 mt-0.5">students</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-600 font-medium">Total Capacity</p>
            <p className="text-2xl font-bold text-gray-900">{totalCapacity}</p>
            <p className="text-xs text-gray-400 mt-0.5">seats</p>
          </div>
          <div
            className="text-center p-3 rounded-lg border"
            style={{
              backgroundColor:
                overallFillRate >= 80
                  ? '#ecfdf5'
                  : overallFillRate >= 50
                  ? '#fffbeb'
                  : '#fef2f2',
              borderColor:
                overallFillRate >= 80
                  ? '#6ee7b7'
                  : overallFillRate >= 50
                  ? '#fde68a'
                  : '#fecaca',
            }}
          >
            <p
              className="text-xs font-medium"
              style={{
                color:
                  overallFillRate >= 80
                    ? '#047857'
                    : overallFillRate >= 50
                    ? '#b45309'
                    : '#b91c1c',
              }}
            >
              Fill Rate
            </p>
            <p className="text-2xl font-bold text-gray-900">{overallFillRate}%</p>
            <p className="text-xs text-gray-400 mt-0.5">overall</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            {view === 'bar' ? (
              <BarChart
                data={levelData}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                />
                <Tooltip content={<BarTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="enrolled" radius={[6, 6, 0, 0]} name="Enrolled">
                  {levelData.map((entry, i) => (
                    <Cell key={`bar-${i}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <PieChart>
                <Pie
                  data={levelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="enrolled"
                  strokeWidth={0}
                >
                  {levelData.map((entry, i) => (
                    <Cell key={`pie-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px' }}
                  formatter={(_v: any, entry: any) =>
                    `${entry.payload.label} (${entry.payload.enrolled})`
                  }
                />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Per-level progress bars */}
        <div className="space-y-2 border-t pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Breakdown by Level
          </p>
          {levelData.map((lvl) => (
            <div key={lvl.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: lvl.color }}
                  />
                  <span className="text-sm text-gray-700">{lvl.label}</span>
                  <span className="text-xs text-gray-400">
                    ({lvl.classCount} {lvl.classCount === 1 ? 'class' : 'classes'})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{lvl.fillRate}% full</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {lvl.enrolled}/{lvl.capacity}
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(lvl.fillRate, 100)}%`, backgroundColor: lvl.color }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Grade-level detail table */}
        <details className="border-t pt-3">
          <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 transition-colors">
            View by Grade Level ▾
          </summary>
          <div className="mt-3 space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {Object.entries(gradeData)
              .sort(([, a], [, b]) => {
                const aOrder = getConfig(a.level).order;
                const bOrder = getConfig(b.level).order;
                return aOrder - bOrder;
              })
              .map(([gradeName, data]) => {
                const cfg = getConfig(data.level);
                const pct =
                  data.capacity > 0
                    ? Math.round((data.enrolled / data.capacity) * 100)
                    : 0;
                return (
                  <div
                    key={gradeName}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50"
                  >
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded"
                      style={{ backgroundColor: cfg.light, color: cfg.text }}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-sm text-gray-700 flex-1">{gradeName}</span>
                    <span className="text-xs text-gray-400">{pct}%</span>
                    <span className="text-sm font-semibold text-gray-900 w-16 text-right">
                      {data.enrolled}/{data.capacity}
                    </span>
                  </div>
                );
              })}
          </div>
        </details>
      </CardContent>
    </Card>
  );
};

export default EducationLevelChart;