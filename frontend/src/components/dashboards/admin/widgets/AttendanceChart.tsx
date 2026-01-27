import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { AttendanceTrends } from '../../../../services/AdminDashboardService';

interface AttendanceChartProps {
  data: AttendanceTrends | null;
  loading?: boolean;
  chartType?: 'line' | 'area';
}

const AttendanceChart: React.FC<AttendanceChartProps> = ({
  data,
  loading = false,
  chartType = 'area'
}) => {
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Attendance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.chart_data || data.chart_data.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Attendance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">No attendance data available</p>
        </CardContent>
      </Card>
    );
  }

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Format chart data
  const chartData = data.chart_data.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    present: day.present,
    absent: day.absent,
    late: day.late,
    excused: day.excused,
    rate: day.attendance_rate,
    total: day.total
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{data.date}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-green-600">Present:</span>
              <span className="font-semibold">{data.present}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-red-600">Absent:</span>
              <span className="font-semibold">{data.absent}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-yellow-600">Late:</span>
              <span className="font-semibold">{data.late}</span>
            </div>
            {data.excused > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-blue-600">Excused:</span>
                <span className="font-semibold">{data.excused}</span>
              </div>
            )}
            <div className="border-t pt-1 mt-1 flex justify-between gap-4">
              <span className="text-gray-700">Rate:</span>
              <span className="font-bold">{data.rate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Attendance Trends</CardTitle>
          <div className="text-right">
            <p className={`text-2xl font-bold ${getAttendanceRateColor(data.overall_rate)}`}>
              {data.overall_rate.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">{data.period}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-2 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-green-600 font-medium">Present</p>
            <p className="text-lg font-bold text-green-900">{data.present_count}</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs text-red-600 font-medium">Absent</p>
            <p className="text-lg font-bold text-red-900">{data.absent_count}</p>
          </div>
          <div className="text-center p-2 bg-yellow-50 rounded-lg border border-yellow-100">
            <p className="text-xs text-yellow-600 font-medium">Late</p>
            <p className="text-lg font-bold text-yellow-900">{data.late_count}</p>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 font-medium">Total</p>
            <p className="text-lg font-bold text-blue-900">{data.total_records}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'area' ? (
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  iconType="circle"
                />
                <Area
                  type="monotone"
                  dataKey="present"
                  stackId="1"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.6}
                  name="Present"
                />
                <Area
                  type="monotone"
                  dataKey="late"
                  stackId="1"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.6}
                  name="Late"
                />
                <Area
                  type="monotone"
                  dataKey="absent"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.6}
                  name="Absent"
                />
              </AreaChart>
            ) : (
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="present"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Present"
                />
                <Line
                  type="monotone"
                  dataKey="late"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Late"
                />
                <Line
                  type="monotone"
                  dataKey="absent"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Absent"
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 4 }}
                  name="Rate %"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Attendance Rate Progress */}
        <div className="border-t pt-3">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-gray-700">Overall Attendance Rate</p>
            <p className={`text-sm font-bold ${getAttendanceRateColor(data.overall_rate)}`}>
              {data.overall_rate.toFixed(1)}%
            </p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                data.overall_rate >= 90
                  ? 'bg-green-500'
                  : data.overall_rate >= 80
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(data.overall_rate, 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceChart;
