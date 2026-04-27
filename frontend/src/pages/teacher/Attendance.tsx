import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import TeacherDashboardService from '@/services/TeacherDashboardService';
import ClassroomService from '@/services/ClassroomService';
import { getAttendance, addAttendance, updateAttendance, AttendanceStatusMap, AttendanceCodeToStatusMap } from '@/services/AttendanceService';
import { toast } from 'react-toastify';
import {
  CheckSquare,
  XSquare,
  Clock,
  Calendar,
  Users,
  Save,
  ArrowLeft,
  Search,
  Eye,
  Edit,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIME_IN  = '07:20';
const DEFAULT_TIME_OUT = '15:00';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  max_capacity: number;
  subject_name: string;
  subject_code: string;
  room_number: string;
  is_class_teacher: boolean;
}

interface StudentAttendance {
  status: string;
  timeIn: string;
  timeOut: string;
  existingId?: number; // backend record id if already saved
  showTimeEdit: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Attendance: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { classId } = useParams();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  // Per-student attendance map: studentId → StudentAttendance
  const [attendanceData, setAttendanceData] = useState<Record<number, StudentAttendance>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [viewMode, setViewMode] = useState<'mark' | 'view'>('mark');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const now24h = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const defaultEntry = (existingId?: number): StudentAttendance => ({
    status: 'present',
    timeIn: DEFAULT_TIME_IN,
    timeOut: DEFAULT_TIME_OUT,
    existingId,
    showTimeEdit: false,
  });

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadClassAndStudents = async () => {
    try {
      setLoadingStudents(true);
      setError(null);

      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!teacherId) throw new Error('Teacher ID not found');

      const teacherClasses = await TeacherDashboardService.getTeacherClasses(teacherId);
      const classData = teacherClasses.find(cls => cls.id === parseInt(classId!));
      if (!classData) throw new Error('Class not found or you are not assigned to this class');

      setSelectedClass(classData);

      let studentsData: Student[] = [];
      if (classId) {
        const res = await ClassroomService.getClassroomStudents(parseInt(classId));
        studentsData = res.data || res || [];
        setStudents(studentsData);
      }

      // Default all students to present with school default times
      const initial: Record<number, StudentAttendance> = {};
      studentsData.forEach((s: Student) => { initial[s.id] = defaultEntry(); });
      setAttendanceData(initial);

      // Overlay any existing saved attendance
      if (classData.section_id) {
        await loadExistingAttendance(classData.section_id, selectedDate, initial);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load class data';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadExistingAttendance = async (
    sectionId: number,
    date: string,
    base: Record<number, StudentAttendance>
  ) => {
    try {
      const existing = await getAttendance({ section: sectionId, date });
      if (!existing || existing.length === 0) return;

      const overlay: Record<number, StudentAttendance> = { ...base };
      existing.forEach((rec: any) => {
        const label = AttendanceCodeToStatusMap[rec.status as keyof typeof AttendanceCodeToStatusMap] ?? 'present';
        overlay[rec.student] = {
          status: label,
          timeIn: rec.time_in ? rec.time_in.slice(0, 5) : DEFAULT_TIME_IN,
          timeOut: rec.time_out ? rec.time_out.slice(0, 5) : DEFAULT_TIME_OUT,
          existingId: rec.id,
          showTimeEdit: false,
        };
      });
      setAttendanceData(overlay);
    } catch (err) {
      console.error('Error loading existing attendance:', err);
    }
  };

  useEffect(() => {
    if (classId) loadClassAndStudents();
  }, [classId]);

  // Reload when date changes
  useEffect(() => {
    if (selectedClass?.section_id) {
      const base: Record<number, StudentAttendance> = {};
      students.forEach(s => { base[s.id] = defaultEntry(); });
      setAttendanceData(base);
      loadExistingAttendance(selectedClass.section_id, selectedDate, base);
    }
  }, [selectedDate]);

  // ── Per-student attendance updates ───────────────────────────────────────────

  const setStudentField = (studentId: number, field: keyof StudentAttendance, value: any) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value },
    }));
  };

  const handleStatusChange = (studentId: number, status: string) => {
    const currentTimeIn = attendanceData[studentId]?.timeIn;
    // If marking as present/late and no custom time was set, use current time
    const newTimeIn = (status === 'present' || status === 'late')
      && currentTimeIn === DEFAULT_TIME_IN
      ? now24h()
      : currentTimeIn;

    setAttendanceData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        timeIn: newTimeIn,
        timeOut: prev[studentId]?.timeOut ?? DEFAULT_TIME_OUT,
      },
    }));
  };

  const toggleTimeEdit = (studentId: number) => {
    setStudentField(studentId, 'showTimeEdit', !attendanceData[studentId]?.showTimeEdit);
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSaveAttendance = async () => {
    if (!selectedClass) { toast.error('No class selected'); return; }

    setIsLoading(true);
    try {
      const teacherId = await TeacherDashboardService.getTeacherIdFromUser(user);
      if (!teacherId) throw new Error('Teacher ID not found');

      for (const student of students) {
        const entry = attendanceData[student.id] ?? defaultEntry();
        const code = AttendanceStatusMap[entry.status as keyof typeof AttendanceStatusMap];
        if (!code) {
          console.warn(`Invalid status for student ${student.id}: ${entry.status}`);
          continue;
        }

        const payload = {
          student: student.id,
          teacher: teacherId,
          section: selectedClass.section_id,
          date: selectedDate,
          status: code,
          time_in: entry.timeIn || DEFAULT_TIME_IN,
          time_out: entry.timeOut || DEFAULT_TIME_OUT,
        };

        try {
          if (entry.existingId) {
            await updateAttendance(entry.existingId, {
              status: payload.status,
              time_in: payload.time_in,
              time_out: payload.time_out,
              teacher: teacherId,
            });
          } else {
            const created = await addAttendance(payload);
            // Store the new id so a second save does an update
            setStudentField(student.id, 'existingId', created.id);
          }
        } catch (err: any) {
          // Fallback: if duplicate constraint, find and update
          if (err.response?.status === 400) {
            try {
              const all = await getAttendance({ date: selectedDate, section: selectedClass.section_id });
              const dup = all.find((r: any) => r.student === student.id);
              if (dup) {
                await updateAttendance(dup.id, {
                  status: payload.status,
                  time_in: payload.time_in,
                  time_out: payload.time_out,
                });
                setStudentField(student.id, 'existingId', dup.id);
              }
            } catch (fb) {
              console.error('Fallback update failed:', fb);
              throw err;
            }
          } else {
            throw err;
          }
        }
      }

      toast.success('Attendance saved successfully!');
      setViewMode('view');
    } catch (err) {
      console.error('Error saving attendance:', err);
      toast.error('Failed to save attendance. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────────

  const stats = (() => {
    const total = students.length;
    const values = Object.values(attendanceData);
    const present = values.filter(v => v.status === 'present').length;
    const absent  = values.filter(v => v.status === 'absent').length;
    const late    = values.filter(v => v.status === 'late').length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, percentage };
  })();

  const getStatusColor = (status: string) => ({
    present: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    absent:  'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    late:    'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
  }[status] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400');

  const getStatusIcon = (status: string) => ({
    present: <CheckCircle className="w-4 h-4" />,
    absent:  <XCircle className="w-4 h-4" />,
    late:    <AlertCircle className="w-4 h-4" />,
  }[status] || <Clock className="w-4 h-4" />);

  const filteredStudents = students.filter(s =>
    s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.registration_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── Render guards ─────────────────────────────────────────────────────────────

  if (loadingStudents) {
    return (
      <TeacherDashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            <p className="text-slate-600 dark:text-slate-400">Loading class and students...</p>
          </div>
        </div>
      </TeacherDashboardLayout>
    );
  }

  if (!selectedClass) {
    return (
      <TeacherDashboardLayout>
        <div className="p-6 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Class Not Found</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error || 'Class not found or not assigned.'}</p>
          <button onClick={() => navigate('/teacher/classes')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
            Back to Classes
          </button>
        </div>
      </TeacherDashboardLayout>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <TeacherDashboardLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/teacher/classes')}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Attendance — {selectedClass.name}
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                {selectedClass.subject_name} • {selectedClass.grade_level_name} {selectedClass.section_name}
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            {(['view', 'mark'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}>
                {mode === 'view' ? <Eye className="w-4 h-4 inline mr-2" /> : <CheckSquare className="w-4 h-4 inline mr-2" />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Date + Stats */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
                <input type="date" value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={loadClassAndStudents}
                className="mt-6 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">
                <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
            <div className="flex space-x-6">
              {[
                { label: 'Total', value: stats.total, color: 'text-slate-900 dark:text-white' },
                { label: 'Present', value: stats.present, color: 'text-green-600 dark:text-green-400' },
                { label: 'Absent', value: stats.absent, color: 'text-red-600 dark:text-red-400' },
                { label: 'Late', value: stats.late, color: 'text-yellow-600 dark:text-yellow-400' },
                { label: 'Rate', value: `${stats.percentage}%`, color: 'text-blue-600 dark:text-blue-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Default times notice */}
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Default times: Time In <strong className="mx-1">7:20 AM</strong> · Time Out <strong className="mx-1">3:00 PM</strong>.
            Click the <strong className="mx-1">clock icon</strong> on any student to override.
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name or registration number..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Students list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Students ({filteredStudents.length})
            </h2>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-6 text-center">
              <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                {searchTerm ? 'No students match your search.' : 'No students enrolled in this class.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredStudents.map(student => {
                const entry = attendanceData[student.id] ?? defaultEntry();
                return (
                  <div key={student.id}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">

                    {/* Main row */}
                    <div className="flex items-center justify-between">
                      {/* Avatar + name */}
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden shrink-0">
                          {student.profile_picture
                            ? <img src={student.profile_picture} alt={student.full_name} className="w-10 h-10 object-cover" />
                            : <User className="w-5 h-5 text-white" />}
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-900 dark:text-white">{student.full_name}</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {student.registration_number} · {student.gender} · Age {student.age}
                          </p>
                          {/* Time summary (always visible) */}
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            <Clock className="w-3 h-3 inline mr-1" />
                            In: {entry.timeIn || DEFAULT_TIME_IN} · Out: {entry.timeOut || DEFAULT_TIME_OUT}
                          </p>
                        </div>
                      </div>

                      {/* Right side */}
                      <div className="flex items-center gap-2">
                        {viewMode === 'mark' ? (
                          <>
                            {/* Status buttons */}
                            {(['present', 'late', 'absent'] as const).map(s => (
                              <button key={s} onClick={() => handleStatusChange(student.id, s)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                  entry.status === s
                                    ? getStatusColor(s)
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </button>
                            ))}
                            {/* Time edit toggle */}
                            <button onClick={() => toggleTimeEdit(student.id)}
                              title="Edit time in/out"
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-500 hover:text-blue-600 transition-colors">
                              {entry.showTimeEdit
                                ? <ChevronUp className="w-4 h-4" />
                                : <Clock className="w-4 h-4" />}
                            </button>
                          </>
                        ) : (
                          /* View mode */
                          <span className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium ${getStatusColor(entry.status)}`}>
                            {getStatusIcon(entry.status)}
                            <span className="capitalize ml-1">{entry.status || 'Not marked'}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable time editor */}
                    {entry.showTimeEdit && viewMode === 'mark' && (
                      <div className="mt-3 ml-14 flex items-center gap-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-4 py-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Time In</label>
                          <input type="time" value={entry.timeIn}
                            onChange={e => setStudentField(student.id, 'timeIn', e.target.value)}
                            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Time Out</label>
                          <input type="time" value={entry.timeOut}
                            onChange={e => setStudentField(student.id, 'timeOut', e.target.value)}
                            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <button onClick={() => {
                          setAttendanceData(prev => ({
                            ...prev,
                            [student.id]: { ...prev[student.id], timeIn: DEFAULT_TIME_IN, timeOut: DEFAULT_TIME_OUT },
                          }));
                        }} className="mt-5 text-xs text-slate-400 hover:text-slate-600 underline">
                          Reset to default
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
            <button onClick={handleSaveAttendance} disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2 transition-colors">
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Attendance ({students.length} students)</span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </TeacherDashboardLayout>
  );
};

export default Attendance;