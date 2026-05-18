import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw,
  Loader2, AlertCircle, Calendar,
} from 'lucide-react';
import api from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useDesign } from '@/contexts/DesignContext';

// ============================================================================
// TYPES
// ============================================================================

type StatusCode = 'P' | 'A' | 'L' | 'E';

interface AttendanceRecord {
  id: number;
  date: string;
  status: StatusCode;
  time_in?: string | null;
  time_out?: string | null;
  section_name?: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_META: Record<StatusCode, { label: string; color: string; bg: string; light: string }> = {
  P: { label: 'Present',  color: '#10b981', bg: '#10b981', light: '#d1fae5' },
  A: { label: 'Absent',   color: '#ef4444', bg: '#ef4444', light: '#fee2e2' },
  L: { label: 'Late',     color: '#f59e0b', bg: '#f59e0b', light: '#fef3c7' },
  E: { label: 'Excused',  color: '#3b82f6', bg: '#3b82f6', light: '#dbeafe' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ============================================================================
// CALENDAR GRID
// ============================================================================

interface CalendarProps {
  year: number;
  month: number;
  statusByDate: Record<string, StatusCode>;
  primaryColor: string;
}

const CalendarGrid = ({ year, month, statusByDate, primaryColor }: CalendarProps) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();
  const todayStr = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-2">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 dark:text-slate-500 py-1">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = isoDate(year, month, day);
          const status = statusByDate[dateStr] ?? null;
          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const meta = status ? STATUS_META[status] : null;

          return (
            <div
              key={i}
              title={meta ? `${dateStr}: ${meta.label}` : dateStr}
              className={`
                aspect-square flex items-center justify-center rounded-lg text-xs font-medium
                transition-all duration-150 select-none
                ${isFuture ? 'opacity-30' : ''}
                ${isToday ? 'ring-2 font-bold' : ''}
              `}
              style={{
                background: meta ? meta.light : 'transparent',
                color: meta ? meta.color : '#9ca3af',
                ...(isToday ? { ringColor: primaryColor } : {}),
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// STAT CARD
// ============================================================================

const StatPill = ({
  label, value, color, total,
}: { label: string; value: number; color: string; total: number }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
    <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-600 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: total > 0 ? `${Math.min((value / total) * 100, 100)}%` : '0%', background: color }}
      />
    </div>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StudentAttendance: React.FC = () => {
  const { settings: designSettings } = useDesign();
  const { user } = useAuth();
  const primaryColor = designSettings?.primary_color || '#4F46E5';

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [studentId, setStudentId] = useState<number | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error] = useState<string | null>(null);

  // ── Fetch student ID once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    api.get(`/students/students/?user=${user.id}`)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res.results || []);
        if (list.length > 0) setStudentId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  // ── Fetch attendance for current month view ───────────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!studentId) return;
    setFetching(true);
    try {
      // Fetch a wide range covering the full view year so navigation doesn't re-fetch
      const yearStart = `${viewYear}-01-01`;
      const yearEnd   = `${viewYear}-12-31`;
      const res = await api.get(
        `/attendance/attendance/?student=${studentId}&start_date=${yearStart}&end_date=${yearEnd}&page_size=500`
      );
      const list: AttendanceRecord[] = Array.isArray(res) ? res : (res.results || []);
      setRecords(list);
    } catch {
      setRecords([]);
    } finally {
      setFetching(false);
    }
  }, [studentId, viewYear]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const statusByDate = useMemo(() => {
    const map: Record<string, StatusCode> = {};
    records.forEach(r => { map[r.date] = r.status as StatusCode; });
    return map;
  }, [records]);

  const monthRecords = useMemo(
    () => records.filter(r => {
      const d = new Date(r.date);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    }),
    [records, viewYear, viewMonth]
  );

  const stats = useMemo(() => {
    const counts = { P: 0, A: 0, L: 0, E: 0 };
    records.forEach(r => { if (r.status in counts) counts[r.status as StatusCode]++; });
    const total = counts.P + counts.A + counts.L + counts.E;
    const rate = total > 0 ? Math.round(((counts.P + counts.L) / total) * 100) : 0;
    return { ...counts, total, rate };
  }, [records]);

  const recentMonthRecords = useMemo(
    () => [...monthRecords].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15),
    [monthRecords]
  );

  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const isNextDisabled = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth >= now.getMonth());

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-gray-100 dark:bg-slate-700 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-slate-700 rounded-xl" />)}
      </div>
      <div className="h-72 bg-gray-100 dark:bg-slate-700 rounded-xl" />
    </div>
  );

  if (error) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-10 text-center border border-gray-100 dark:border-slate-700">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
      <p className="text-sm text-red-500">{error}</p>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Attendance</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Your attendance record for {viewYear}</p>
        </div>
        <button
          onClick={fetchAttendance}
          disabled={fetching}
          className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Overall Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Rate highlight card */}
        <div
          className="col-span-2 md:col-span-1 rounded-xl p-4 flex flex-col items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
        >
          <p className="text-4xl font-black text-white">{stats.rate}%</p>
          <p className="text-sm font-semibold text-white mt-1">Attendance Rate</p>
          <p className="text-xs text-white/75 mt-0.5">{stats.total} days recorded</p>
        </div>
        <StatPill label="Present" value={stats.P} color="#10b981" total={stats.total} />
        <StatPill label="Absent"  value={stats.A} color="#ef4444" total={stats.total} />
        <StatPill label="Late"    value={stats.L} color="#f59e0b" total={stats.total} />
        <StatPill label="Excused" value={stats.E} color="#3b82f6" total={stats.total} />
      </div>

      {/* ── Calendar + Records ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Calendar */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {MONTHS[viewMonth]} {viewYear}
            </h3>
            <button onClick={goNext} disabled={isNextDisabled} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-30">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {fetching ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : (
            <CalendarGrid
              year={viewYear}
              month={viewMonth}
              statusByDate={statusByDate}
              primaryColor={primaryColor}
            />
          )}

          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
            {Object.entries(STATUS_META).map(([code, m]) => (
              <div key={code} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                <span className="w-3 h-3 rounded" style={{ background: m.light, border: `1.5px solid ${m.color}` }} />
                {m.label}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
              <span className="w-3 h-3 rounded bg-transparent border border-gray-200" />
              No record
            </div>
          </div>

          {/* Month summary */}
          {monthRecords.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 grid grid-cols-4 gap-2 text-center">
              {(['P', 'A', 'L', 'E'] as StatusCode[]).map(code => (
                <div key={code}>
                  <p className="text-lg font-bold" style={{ color: STATUS_META[code].color }}>
                    {monthRecords.filter(r => r.status === code).length}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{STATUS_META[code].label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Records list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: primaryColor }} />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {MONTHS[viewMonth]} Records
            </h3>
            <span className="ml-auto text-xs text-gray-400">{monthRecords.length} days</span>
          </div>

          {monthRecords.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-20" style={{ color: primaryColor }} />
              <p className="text-sm text-gray-400 dark:text-slate-500">No records this month</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-slate-700 max-h-[420px] overflow-y-auto">
              {recentMonthRecords.map(rec => {
                const meta = STATUS_META[rec.status as StatusCode] || STATUS_META.A;
                const d = new Date(rec.date + 'T12:00:00');
                return (
                  <div key={rec.id} className="px-4 py-3 flex items-center gap-3">
                    {/* Day indicator */}
                    <div className="w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0" style={{ background: meta.light }}>
                      <span className="text-sm font-bold leading-none" style={{ color: meta.color }}>{d.getDate()}</span>
                      <span className="text-xs leading-none" style={{ color: meta.color }}>{WEEKDAYS[d.getDay()]}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{meta.label}</p>
                      {(rec.time_in || rec.time_out) && (
                        <p className="text-xs text-gray-400 dark:text-slate-500">
                          {rec.time_in ? `In: ${fmt12(rec.time_in)}` : ''}
                          {rec.time_in && rec.time_out ? ' · ' : ''}
                          {rec.time_out ? `Out: ${fmt12(rec.time_out)}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Status dot */}
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: meta.color }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── No data at all ─────────────────────────────────────────────────── */}
      {!fetching && records.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-10 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: primaryColor }} />
          <p className="font-semibold text-gray-700 dark:text-slate-200 mb-1">No attendance records found</p>
          <p className="text-sm text-gray-400 dark:text-slate-500">
            Attendance records will appear here once they are entered by your school.
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentAttendance;
