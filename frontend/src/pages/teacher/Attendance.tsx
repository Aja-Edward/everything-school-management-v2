/**
 * Teacher attendance page
 *
 * Changes
 * ───────
 * #2  Save uses bulkUpsert — single POST instead of N individual saves
 * #8  Date-keyed cache via attendanceService.getSectionDateAttendance()
 *     Switching dates no longer re-fetches if data is already cached
 * Dual session — teacher selects Morning or Afternoon; each saves independently
 * Back-fill — no date restriction; past dates show a notice
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import ClassroomService from '@/services/ClassroomService';
import {
  bulkUpsertAttendance,
  getSectionDateAttendance,
  AttendanceStatusMap,
  AttendanceCodeToStatusMap,
  BulkUpsertItem,
  AttendanceSession,
  attendanceCache,
} from '@/services/AttendanceService';
import { toast } from 'react-toastify';
import {
  CheckSquare, XSquare, Clock, Calendar, Users, Save,
  ArrowLeft, Search, Eye, CheckCircle, XCircle, AlertCircle,
  RefreshCw, ChevronDown, ChevronUp, Sun, Sunset,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MORNING_IN    = '07:20';
const DEFAULT_MORNING_OUT   = '12:30';
const DEFAULT_AFTERNOON_IN  = '13:00';
const DEFAULT_AFTERNOON_OUT = '15:00';

const SESSION_DEFAULTS: Record<AttendanceSession, { timeIn: string; timeOut: string }> = {
  morning:   { timeIn: DEFAULT_MORNING_IN,   timeOut: DEFAULT_MORNING_OUT   },
  afternoon: { timeIn: DEFAULT_AFTERNOON_IN, timeOut: DEFAULT_AFTERNOON_OUT },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Student {
  id: number;
  full_name: string;
  registration_number: string;
  profile_picture?: string;
  gender: string;
  age: number;
}

interface ClassData {
  id: number;
  name: string;
  section_id: number;
  section_name: string;
  grade_level_name: string;
  education_level: string;
  student_count: number;
  subject_name: string;
  is_class_teacher: boolean;
}

interface StudentEntry {
  status: string;
  timeIn: string;
  timeOut: string;
  existingId?: number;
  showTimeEdit: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const TeacherAttendance: React.FC = () => {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const { classId } = useParams<{ classId: string }>();

  // Core state
  const [selectedDate, setSelectedDate]   = useState(new Date().toISOString().slice(0, 10));
  const [session, setSession]             = useState<AttendanceSession>('morning');
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [students, setStudents]           = useState<Student[]>([]);
  const [attendanceData, setAttendanceData] = useState<Record<number, StudentEntry>>({});

  // UI state
  const [isLoading, setIsLoading]         = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [viewMode, setViewMode]           = useState<'mark' | 'view'>('mark');
  const [searchTerm, setSearchTerm]       = useState('');
  const [error, setError]                 = useState<string | null>(null);
  const [teacherId, setTeacherId]         = useState<number | null>(null);

  const isBackFill = selectedDate < new Date().toISOString().slice(0, 10);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const defaultEntry = (existingId?: number): StudentEntry => ({
    status: 'present',
    ...SESSION_DEFAULTS[session],
    existingId,
    showTimeEdit: false,
  });

  // ── Initial load ──────────────────────────────────────────────────────────

  const loadClassAndStudents = useCallback(async () => {
    if (!classId) return;
    setLoadingStudents(true);
    setError(null);
    try {
      const tid = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!tid) throw new Error('Teacher ID not found');
      setTeacherId(tid);

      const classes   = await TeacherDashboardService.getTeacherClasses(tid);
      const classData = classes.find(c => c.id === parseInt(classId));
      if (!classData) throw new Error('Class not found or not assigned to you');
      setSelectedClass(classData);

      const res         = await ClassroomService.getClassroomStudents(parseInt(classId));
      const studentsData: Student[] = res.data ?? res ?? [];
      setStudents(studentsData);

      const initial: Record<number, StudentEntry> = {};
      studentsData.forEach(s => { initial[s.id] = defaultEntry(); });
      setAttendanceData(initial);

      if (classData.section_id) {
        await loadExistingAttendance(classData.section_id, selectedDate, session, initial);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load class data';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingStudents(false);
    }
  }, [classId, user]);

  // ── Load existing attendance — FIX #8 cached ─────────────────────────────

  const loadExistingAttendance = useCallback(async (
    sectionId: number,
    date: string,
    sess: AttendanceSession,
    base: Record<number, StudentEntry>,
    forceRefresh = false,
  ) => {
    try {
      const existing = await getSectionDateAttendance(sectionId, date, sess, forceRefresh);
      if (!existing?.length) return;

      const overlay = { ...base };
      existing.forEach(rec => {
        if (!rec.student) return;
        const label = AttendanceCodeToStatusMap[rec.status] ?? 'present';
        overlay[rec.student] = {
          status:       label,
          timeIn:       rec.time_in?.slice(0, 5)  ?? SESSION_DEFAULTS[sess].timeIn,
          timeOut:      rec.time_out?.slice(0, 5) ?? SESSION_DEFAULTS[sess].timeOut,
          existingId:   rec.id,
          showTimeEdit: false,
        };
      });
      setAttendanceData(overlay);
    } catch (err) {
      console.error('Error loading existing attendance:', err);
    }
  }, []);

  useEffect(() => { loadClassAndStudents(); }, [loadClassAndStudents]);

  // Reload when date or session changes (uses cache if available)
  useEffect(() => {
    if (!selectedClass?.section_id || !students.length) return;
    const base: Record<number, StudentEntry> = {};
    students.forEach(s => { base[s.id] = defaultEntry(); });
    setAttendanceData(base);
    loadExistingAttendance(selectedClass.section_id, selectedDate, session, base);
  }, [selectedDate, session]);

  // ── Per-student updaters ──────────────────────────────────────────────────

  const setStudentField = (studentId: number, field: keyof StudentEntry, value: any) =>
    setAttendanceData(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));

  const handleStatusChange = (studentId: number, newStatus: string) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status: newStatus },
    }));
  };

  const markAll = (newStatus: string) => {
    setAttendanceData(prev => {
      const next = { ...prev };
      students.forEach(s => { next[s.id] = { ...next[s.id], status: newStatus }; });
      return next;
    });
  };

  // ── FIX #2 — Save via bulk upsert ────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedClass || !teacherId) { toast.error('No class selected'); return; }
    setIsLoading(true);

    try {
      const records: BulkUpsertItem[] = students.map(student => {
        const entry   = attendanceData[student.id] ?? defaultEntry();
        const code    = AttendanceStatusMap[entry.status as keyof typeof AttendanceStatusMap] ?? 'A';
        const defaults = SESSION_DEFAULTS[session];
        return {
          student:  student.id,
          teacher:  teacherId,
          section:  selectedClass.section_id,
          date:     selectedDate,
          session,
          status:   code,
          time_in:  entry.timeIn  || defaults.timeIn,
          time_out: entry.timeOut || defaults.timeOut,
          back_fill_reason: isBackFill ? `Back-filled by teacher ${teacherId}` : '',
        };
      });

      const result = await bulkUpsertAttendance(records);

      // Update existingIds from the response so the next save does updates
      result.records.forEach(rec => {
        if (rec.student) setStudentField(rec.student, 'existingId', rec.id);
      });

      // Invalidate cache for this section+date+session so a manual refresh sees fresh data
      if (selectedClass.section_id) {
        attendanceCache.invalidateSection(selectedClass.section_id);
      }

      toast.success(
        `Saved! ${result.created} created, ${result.updated} updated.`
      );
      setViewMode('view');
    } catch (err) {
      console.error('Error saving attendance:', err);
      toast.error('Failed to save attendance. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = (() => {
    const total   = students.length;
    const values  = Object.values(attendanceData);
    const present = values.filter(v => v.status === 'present').length;
    const absent  = values.filter(v => v.status === 'absent').length;
    const late    = values.filter(v => v.status === 'late').length;
    const rate    = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, rate };
  })();

  const getStatusColor = (s: string) => ({
    present: 'bg-green-100 text-green-600',
    absent:  'bg-red-100 text-red-600',
    late:    'bg-yellow-100 text-yellow-600',
  }[s] ?? 'bg-slate-100 text-slate-600');

  const filteredStudents = students.filter(s =>
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.registration_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Render guards ──────────────────────────────────────────────────────────

  if (loadingStudents) return (
    <TeacherDashboardLayout>
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-b-2 border-blue-500 rounded-full" />
          <p className="text-slate-500">Loading class…</p>
        </div>
      </div>
    </TeacherDashboardLayout>
  );

  if (!selectedClass) return (
    <TeacherDashboardLayout>
      <div className="p-6 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Class not found</h2>
        <p className="text-slate-500 mb-4">{error}</p>
        <button onClick={() => navigate('/teacher/classes')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg">
          Back to classes
        </button>
      </div>
    </TeacherDashboardLayout>
  );

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <TeacherDashboardLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/teacher/classes')}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Attendance — {selectedClass.name}
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {selectedClass.subject_name} · {selectedClass.grade_level_name} {selectedClass.section_name}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {(['view', 'mark'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === mode ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {mode === 'view' ? <Eye className="w-4 h-4 inline mr-1" /> : <CheckSquare className="w-4 h-4 inline mr-1" />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Date + Session selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-end gap-5">

            {/* Date picker */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
                {isBackFill && (
                  <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Back-filling past date
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => {
                    if (selectedClass?.section_id) {
                      attendanceCache.invalidateSection(selectedClass.section_id);
                      const base: Record<number, StudentEntry> = {};
                      students.forEach(s => { base[s.id] = defaultEntry(); });
                      setAttendanceData(base);
                      loadExistingAttendance(selectedClass.section_id, selectedDate, session, base, true);
                    }
                  }}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200"
                  title="Refresh from server">
                  <RefreshCw className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Session picker */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Session</label>
              <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                {(['morning', 'afternoon'] as const).map(sess => (
                  <button
                    key={sess}
                    onClick={() => setSession(sess)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                      session === sess
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}>
                    {sess === 'morning'
                      ? <Sun className="w-4 h-4" />
                      : <Sunset className="w-4 h-4" />}
                    {sess.charAt(0).toUpperCase() + sess.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-6 ml-auto">
              {[
                { label: 'Total',   value: stats.total,   color: 'text-slate-900' },
                { label: 'Present', value: stats.present, color: 'text-green-600' },
                { label: 'Absent',  value: stats.absent,  color: 'text-red-600'   },
                { label: 'Late',    value: stats.late,    color: 'text-yellow-600'},
                { label: 'Rate',    value: `${stats.rate}%`, color: 'text-blue-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Default times notice */}
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {session === 'morning'
              ? <>Default: In <strong className="mx-1">{DEFAULT_MORNING_IN}</strong> · Out <strong className="mx-1">{DEFAULT_MORNING_OUT}</strong></>
              : <>Default: In <strong className="mx-1">{DEFAULT_AFTERNOON_IN}</strong> · Out <strong className="mx-1">{DEFAULT_AFTERNOON_OUT}</strong></>
            }
            — click the clock icon on any student to override.
          </div>
        </div>

        {/* Bulk actions */}
        {viewMode === 'mark' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Mark all as:</span>
            {['present', 'absent', 'late'].map(s => (
              <button key={s} onClick={() => markAll(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${getStatusColor(s)} border-transparent`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or registration number…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Student list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Students ({filteredStudents.length})
            </h2>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              session === 'morning' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
            }`}>
              {session === 'morning' ? '☀️ Morning' : '🌇 Afternoon'} session
            </span>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                {searchTerm ? 'No students match your search.' : 'No students enrolled.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredStudents.map(student => {
                const entry   = attendanceData[student.id] ?? defaultEntry();
                const defaults = SESSION_DEFAULTS[session];
                return (
                  <div key={student.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">

                      {/* Avatar + info */}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden shrink-0">
                          {student.profile_picture
                            ? <img src={student.profile_picture} alt={student.full_name} className="w-9 h-9 object-cover" />
                            : <span className="text-white text-xs font-bold">
                                {student.full_name.charAt(0)}
                              </span>}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{student.full_name}</p>
                          <p className="text-xs text-slate-400">
                            {student.registration_number} · {student.gender} · Age {student.age}
                          </p>
                          <p className="text-xs text-slate-300 mt-0.5">
                            <Clock className="w-3 h-3 inline mr-0.5" />
                            In: {entry.timeIn || defaults.timeIn} · Out: {entry.timeOut || defaults.timeOut}
                          </p>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2">
                        {viewMode === 'mark' ? (
                          <>
                            {(['present', 'late', 'absent'] as const).map(s => (
                              <button key={s} onClick={() => handleStatusChange(student.id, s)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                                  entry.status === s
                                    ? getStatusColor(s)
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </button>
                            ))}
                            <button onClick={() => setStudentField(student.id, 'showTimeEdit', !entry.showTimeEdit)}
                              title="Edit time in/out"
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                              {entry.showTimeEdit ? <ChevronUp className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            </button>
                          </>
                        ) : (
                          <span className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium ${getStatusColor(entry.status)}`}>
                            {entry.status === 'present' && <CheckCircle className="w-3.5 h-3.5" />}
                            {entry.status === 'absent'  && <XCircle    className="w-3.5 h-3.5" />}
                            {entry.status === 'late'    && <AlertCircle className="w-3.5 h-3.5" />}
                            <span className="capitalize ml-0.5">{entry.status || 'Not marked'}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable time editor */}
                    {entry.showTimeEdit && viewMode === 'mark' && (
                      <div className="mt-3 ml-12 flex items-center gap-4 bg-slate-50 rounded-lg px-4 py-3">
                        {[
                          { label: 'Time in',  key: 'timeIn'  as const, val: entry.timeIn,  def: defaults.timeIn  },
                          { label: 'Time out', key: 'timeOut' as const, val: entry.timeOut, def: defaults.timeOut },
                        ].map(({ label, key, val, def }) => (
                          <div key={key}>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                            <input type="time" value={val || def}
                              onChange={e => setStudentField(student.id, key, e.target.value)}
                              className="px-2 py-1 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                        ))}
                        <button
                          onClick={() => setAttendanceData(prev => ({
                            ...prev,
                            [student.id]: { ...prev[student.id], ...SESSION_DEFAULTS[session] },
                          }))}
                          className="mt-5 text-xs text-slate-400 hover:text-slate-600 underline">
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Save button */}
        {viewMode === 'mark' && filteredStudents.length > 0 && (
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm">
              {isLoading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-b-2 border-white rounded-full" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>
                    Save {session} attendance ({students.length} students)
                    {isBackFill && ' · back-fill'}
                  </span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </TeacherDashboardLayout>
  );
};

export default TeacherAttendance;