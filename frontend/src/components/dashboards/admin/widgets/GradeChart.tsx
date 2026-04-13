import React, { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { GradeDistributionData } from '../../../../services/AdminDashboardService';

interface GradeChartProps {
  data: GradeDistributionData | null;
  loading?: boolean;
}

const GradeChart: React.FC<GradeChartProps> = ({ data, loading = false }) => {
  const [chartView, setChartView] = useState<'pie' | 'bar'>('pie');

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Grade Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── DEBUG: log what the API actually returned so you can verify the shape ──
  if (!data) {
    console.warn('[GradeChart] data is null – check enhancedStats?.grade_distribution');
  } else if (!data.distribution) {
    console.warn('[GradeChart] data.distribution is missing. Received keys:', Object.keys(data));
  } else if (data.distribution.length === 0) {
    console.warn('[GradeChart] data.distribution is an empty array');
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (!data || !data.distribution || data.distribution.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Grade Distribution & Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
            <p className="text-gray-400 text-sm">No grade data available</p>
            {data && !data.distribution && (
              <p className="text-xs text-red-400">
                API returned data but <code>distribution</code> field is missing.
                Check <code>AdminDashboardService.fetchEnhancedStats()</code> response shape.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const GRADE_COLORS: Record<string, string> = {
    'A': '#10b981',
    'B': '#3b82f6',
    'C': '#f59e0b',
    'D': '#f97316',
    'E': '#ef4444',
    'F': '#dc2626'
  };

  const getPassRateColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const chartData = data.distribution.map((item) => ({
    grade: item.grade,
    count: item.count,
    percentage: item.percentage,
    fill: GRADE_COLORS[item.grade] || '#6b7280'
  }));

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-1">Grade {d.grade}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Count:</span>
              <span className="font-semibold">{d.count}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Percentage:</span>
              <span className="font-semibold">{d.percentage}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-1">Grade {payload[0].payload.grade}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Students:</span>
              <span className="font-semibold">{payload[0].value}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Percentage:</span>
              <span className="font-semibold">{payload[0].payload.percentage}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percentage }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percentage < 5) return null;
    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-semibold">
        {`${percentage}%`}
      </text>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Grade Distribution & Performance</CardTitle>
          <div className="flex gap-2">
            <button
              onClick={() => setChartView('pie')}
              className={`px-3 py-1 text-xs rounded ${chartView === 'pie' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              Pie
            </button>
            <button
              onClick={() => setChartView('bar')}
              className={`px-3 py-1 text-xs rounded ${chartView === 'bar' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              Bar
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-green-600 font-medium">Pass Rate</p>
            <p className={`text-2xl font-bold ${getPassRateColor(data.pass_rate)}`}>
              {data.pass_rate.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">{data.pass_count} students</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs text-red-600 font-medium">Failed</p>
            <p className="text-2xl font-bold text-red-900">{data.fail_count}</p>
            <p className="text-xs text-gray-500 mt-1">
              {data.total_results > 0 ? ((data.fail_count / data.total_results) * 100).toFixed(1) : 0}%
            </p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">Total Results</p>
            <p className="text-2xl font-bold text-blue-900">{data.total_results}</p>
            <p className="text-xs text-gray-500 mt-1">all grades</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartView === 'pie' ? (
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={90}
                  dataKey="count"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(_value: any, entry: any) =>
                    `Grade ${entry.payload.grade} (${entry.payload.count})`
                  }
                />
              </PieChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="grade"
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                  label={{ value: 'Grade', position: 'insideBottom', offset: -5, fontSize: 12 }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                  label={{ value: 'Students', angle: -90, position: 'insideLeft', fontSize: 12 }}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Pass Rate Progress */}
        <div className="border-t pt-3">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-gray-700">Overall Pass Rate</p>
            <p className={`text-sm font-bold ${getPassRateColor(data.pass_rate)}`}>
              {data.pass_rate.toFixed(1)}%
            </p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                data.pass_rate >= 80 ? 'bg-green-500' : data.pass_rate >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(data.pass_rate, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {data.pass_count} of {data.total_results} students passed
          </p>
        </div>

        {/* Top Performing Subjects */}
        {data.top_subjects && data.top_subjects.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">Top Performing Subjects</p>
            <div className="space-y-2">
              {data.top_subjects.slice(0, 5).map((subject, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{subject.subject}</span>
                      <span className="text-sm font-semibold text-blue-600">
                        {subject.average.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(subject.average, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 ml-3">{subject.student_count} students</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GradeChart;