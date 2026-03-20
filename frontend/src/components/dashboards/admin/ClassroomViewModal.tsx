import React, { useState, useEffect, useCallback } from 'react';
import {
  X, UserCheck, Trash2, Search, AlertCircle,
  Users, ArrowRightLeft, ChevronDown, CheckCircle2,
  GraduationCap, Building2, TrendingUp,
  Loader2, RefreshCw,
} from 'lucide-react';
import { Classroom } from '@/services/ClassroomService';
import { useStudentEnrollment, useClassroomList } from '@/contexts/ClassroomContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassroomViewModalProps {
  classroom: Classroom | null;
  isOpen: boolean;
  onClose: () => void;
  onRemoveAssignment?: (assignmentId: number) => void;
}

interface Student {
  id: number;
  full_name: string;
  registration_number?: string;
  username?: string;
  is_active: boolean;
  gender?: string;
  age?: number;
}

type TabType = 'overview' | 'students' | 'teachers';

// ─── Helper ───────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

// ─── Component ────────────────────────────────────────────────────────────────

const ClassroomViewModal: React.FC<ClassroomViewModalProps> = ({
  classroom,
  isOpen,
  onClose,
  onRemoveAssignment,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [targetClassroomId, setTargetClassroomId] = useState<number | ''>('');
  const [transferStatus, setTransferStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [transferMessage, setTransferMessage] = useState('');

  // ── Context ────────────────────────────────────────────────────────────────
  const { transferStudent, transferring, getClassroomStudents } = useStudentEnrollment();
  const { classrooms } = useClassroomList();

  const targetOptions = classrooms.filter(c => c.id !== classroom?.id && c.is_active);

  // ── Fetch students ─────────────────────────────────────────────────────────
  const fetchStudents = useCallback(async () => {
    if (!classroom) return;
    setLoadingStudents(true);
    setStudentError(null);
    try {
      const list = await getClassroomStudents(classroom.id);
      const result: Student[] = Array.isArray(list) ? list : [];
      setStudents(result);
      if (result.length === 0)
        setStudentError('No students enrolled in this classroom yet.');
    } catch (err: any) {
      setStudentError(err.message || 'Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  }, [classroom, getClassroomStudents]);

  useEffect(() => {
    if (isOpen && classroom) {
      setActiveTab('overview');
      setSearchTerm('');
      setTransferringStudent(null);
      setTransferStatus('idle');
      fetchStudents();
    }
  }, [isOpen, classroom?.id]);

  // ── Transfer ───────────────────────────────────────────────────────────────
  const handleTransfer = async () => {
    if (!transferringStudent || !targetClassroomId || !classroom) return;
    setTransferStatus('idle');
    try {
      const result = await transferStudent(classroom.id, {
        student_id: transferringStudent.id,
        target_classroom_id: Number(targetClassroomId),
      });
      setTransferStatus('success');
      setTransferMessage(result?.message || `${transferringStudent.full_name} transferred successfully.`);
      setStudents(prev => prev.filter(s => s.id !== transferringStudent.id));
      setTimeout(() => {
        setTransferringStudent(null);
        setTargetClassroomId('');
        setTransferStatus('idle');
      }, 2500);
    } catch (err: any) {
      setTransferStatus('error');
      setTransferMessage(err?.response?.data?.error || err.message || 'Transfer failed. Please try again.');
    }
  };

  if (!isOpen || !classroom) return null;

  const filteredStudents = students.filter(s =>
    s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const enrollmentPct = classroom.max_capacity > 0
    ? Math.round((classroom.current_enrollment / classroom.max_capacity) * 100)
    : 0;

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'students', label: 'Students', count: students.length },
    { key: 'teachers', label: 'Teachers', count: classroom.teacher_assignments?.length ?? 0 },
  ];

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        {/* ── Modal shell ── */}
        <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden bg-white ring-1 ring-black rounded-sm shadow-[0_32px_80px_rgba(0,0,0,0.5)]">

          {/* Top accent stripe */}
          <div className="h-[3px] bg-black flex-shrink-0" />

          {/* ════════════ HEADER ════════════ */}
          <div className="flex-shrink-0 px-8 pt-7 pb-6 border-b border-gray-100">
            <div className="flex items-start justify-between gap-6">

              {/* Left: identity */}
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 bg-black rounded-sm flex items-center justify-center flex-shrink-0">
                  <GraduationCap size={26} className="text-white" />
                </div>
                <div>
                  <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-gray-400 mb-1">
                    {classroom.education_level.replace(/_/g, ' ')} · {classroom.section_name}
                  </p>
                  <h2 className="font-serif text-[26px] font-bold text-black leading-tight tracking-tight">
                    {classroom.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap font-mono text-[11px] text-gray-500">
                    <span>{classroom.academic_session_name}</span>
                    <span className="text-gray-200">·</span>
                    <span>{classroom.term_name}</span>
                    {classroom.room_number && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span>Room {classroom.room_number}</span>
                      </>
                    )}
                    <span className="text-gray-200">·</span>
                    <span className={`px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-[0.1em] uppercase ${
                      classroom.is_active ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {classroom.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Close */}
              <button
                onClick={onClose}
                className="w-9 h-9 border border-gray-200 rounded-sm flex items-center justify-center flex-shrink-0 hover:bg-black hover:border-black group transition-colors duration-150"
              >
                <X size={16} className="text-gray-500 group-hover:text-white transition-colors duration-150" />
              </button>
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-4 gap-3 mt-6">
              {[
                { label: 'Enrolled',  value: classroom.current_enrollment, dark: true },
                { label: 'Capacity',  value: classroom.max_capacity,       dark: false },
                { label: 'Available', value: classroom.available_spots,    dark: false },
                { label: 'Fill Rate', value: `${enrollmentPct}%`,          dark: false },
              ].map(s => (
                <div key={s.label} className={`px-4 py-3 border rounded-sm ${s.dark ? 'bg-black border-black' : 'bg-gray-50 border-gray-100'}`}>
                  <p className={`font-mono text-[9px] tracking-[0.14em] uppercase mb-1.5 ${s.dark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {s.label}
                  </p>
                  <p className={`font-serif text-[22px] font-bold leading-none ${s.dark ? 'text-white' : 'text-gray-900'}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ════════════ TABS ════════════ */}
          <div className="flex-shrink-0 flex border-b border-gray-100 bg-gray-50">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-6 py-3.5 font-mono text-[11px] tracking-[0.1em] uppercase border-b-2 -mb-px transition-colors duration-150 ${
                  activeTab === tab.key
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`min-w-[20px] h-5 px-1.5 rounded-sm font-mono text-[10px] inline-flex items-center justify-center ${
                    activeTab === tab.key ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ════════════ CONTENT ════════════ */}
          <div className="flex-1 overflow-y-auto p-8">

            {/* ── OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Details */}
                <div className="border border-gray-100 rounded-sm overflow-hidden">
                  <div className="px-5 py-3 bg-black flex items-center gap-2">
                    <Building2 size={13} className="text-gray-500" />
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-gray-400">
                      Classroom Details
                    </span>
                  </div>
                  {[
                    { label: 'Education Level', value: classroom.education_level.replace(/_/g, ' ') },
                    { label: 'Section',          value: classroom.section_name },
                    { label: 'Academic Session', value: classroom.academic_session_name },
                    { label: 'Term',             value: classroom.term_name },
                    { label: 'Room Number',      value: classroom.room_number || 'Not assigned' },
                  ].map((row, i, arr) => (
                    <div key={row.label} className={`flex items-center justify-between px-5 py-3 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <span className="font-mono text-[11px] tracking-wide text-gray-400">{row.label}</span>
                      <span className="text-sm font-semibold text-gray-800">{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Enrollment */}
                <div className="border border-gray-100 rounded-sm overflow-hidden">
                  <div className="px-5 py-3 bg-black flex items-center gap-2">
                    <TrendingUp size={13} className="text-gray-500" />
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-gray-400">
                      Enrollment
                    </span>
                  </div>
                  <div className="p-5">
                    <div className="flex justify-between font-mono text-[11px] text-gray-400 mb-2">
                      <span>{classroom.current_enrollment} enrolled</span>
                      <span>{enrollmentPct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-sm overflow-hidden mb-5">
                      <div
                        className={`h-full transition-all duration-700 rounded-sm ${enrollmentPct >= 100 ? 'bg-black' : enrollmentPct >= 80 ? 'bg-gray-600' : 'bg-gray-900'}`}
                        style={{ width: `${Math.min(enrollmentPct, 100)}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Enrolled',  value: classroom.current_enrollment, dark: false },
                        { label: 'Available', value: classroom.available_spots,    dark: true },
                        { label: 'Capacity',  value: classroom.max_capacity,       dark: false },
                      ].map(s => (
                        <div key={s.label} className={`text-center py-3.5 px-2 border rounded-sm ${s.dark ? 'bg-black border-black' : 'bg-gray-50 border-gray-100'}`}>
                          <p className={`font-serif text-2xl font-bold leading-none ${s.dark ? 'text-white' : 'text-gray-900'}`}>{s.value}</p>
                          <p className={`font-mono text-[9px] tracking-[0.12em] uppercase mt-1.5 ${s.dark ? 'text-gray-500' : 'text-gray-300'}`}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {classroom.is_full && (
                      <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-black rounded-sm font-mono text-[11px] text-gray-400">
                        <AlertCircle size={13} />
                        Classroom is at full capacity
                      </div>
                    )}
                  </div>
                </div>

                {/* Class teacher — nursery/primary */}
                {(classroom.education_level === 'NURSERY' || classroom.education_level === 'PRIMARY') && (
                  <div className="md:col-span-2 border border-gray-100 rounded-sm overflow-hidden">
                    <div className="px-5 py-3 bg-black flex items-center gap-2">
                      <UserCheck size={13} className="text-gray-500" />
                      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-gray-400">
                        Class Teacher
                      </span>
                    </div>
                    <div className="p-5">
                      {classroom.class_teacher_name ? (
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-black rounded-sm flex items-center justify-center font-serif text-lg font-bold text-white flex-shrink-0">
                            {initials(classroom.class_teacher_name)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{classroom.class_teacher_name}</p>
                            {classroom.class_teacher_phone && (
                              <p className="font-mono text-xs text-gray-500 mt-0.5">{classroom.class_teacher_phone}</p>
                            )}
                            {classroom.class_teacher_employee_id && (
                              <p className="font-mono text-[11px] text-gray-400 mt-0.5">
                                ID: {classroom.class_teacher_employee_id}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-center text-sm text-gray-300 py-5">No class teacher assigned</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STUDENTS ── */}
            {activeTab === 'students' && (
              <div>
                {/* Toolbar */}
                <div className="flex gap-2.5 mb-5">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="text"
                      placeholder="Search by name or registration number…"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-sm text-sm bg-gray-50 outline-none focus:border-black focus:bg-white transition-colors font-sans"
                    />
                  </div>
                  <button
                    onClick={fetchStudents}
                    disabled={loadingStudents}
                    className="px-3.5 border border-gray-200 rounded-sm bg-gray-50 hover:bg-black hover:border-black group transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={14} className={`text-gray-500 group-hover:text-white transition-colors ${loadingStudents ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Transfer status banner */}
                {transferStatus !== 'idle' && (
                  <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-sm mb-4 font-mono text-xs ${
                    transferStatus === 'success'
                      ? 'bg-black text-gray-400'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}>
                    {transferStatus === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {transferMessage}
                  </div>
                )}

                {/* Loading */}
                {loadingStudents && (
                  <div className="flex flex-col items-center justify-center py-14 gap-3 text-gray-300">
                    <Loader2 size={24} className="animate-spin" />
                    <p className="font-mono text-xs tracking-wider">Loading students…</p>
                  </div>
                )}

                {/* Error */}
                {studentError && !loadingStudents && students.length === 0 && (
                  <div className="flex items-center gap-3 px-4 py-3.5 border border-gray-100 rounded-sm text-gray-400 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0" />
                    {studentError}
                  </div>
                )}

                {/* Table */}
                {!loadingStudents && filteredStudents.length > 0 && (
                  <div className="border border-gray-100 rounded-sm overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-black">
                          {['#', 'Student', 'Reg. No.', 'Gender', 'Status', 'Transfer'].map(h => (
                            <th
                              key={h}
                              className={`px-4 py-3 font-mono text-[9px] tracking-[0.14em] uppercase text-gray-500 font-medium ${h === 'Transfer' ? 'text-center' : 'text-left'}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((student, idx) => (
                          <React.Fragment key={student.id}>
                            {/* Row */}
                            <tr className={`border-b border-gray-50 transition-colors ${
                              transferringStudent?.id === student.id ? 'bg-gray-50' : 'bg-white hover:bg-gray-50/70'
                            }`}>
                              <td className="px-4 py-3.5 font-mono text-[11px] text-gray-300 w-10">{idx + 1}</td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 bg-gray-900 rounded-sm flex items-center justify-center font-serif text-xs font-bold text-white flex-shrink-0">
                                    {student.full_name?.charAt(0) ?? '?'}
                                  </div>
                                  <span className="font-semibold text-gray-800">{student.full_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 font-mono text-[11px] text-gray-400">
                                {student.registration_number || student.username || '—'}
                              </td>
                              <td className="px-4 py-3.5 text-xs text-gray-400 capitalize">
                                {student.gender || '—'}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className={`px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-[0.08em] uppercase ${
                                  student.is_active ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {student.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <button
                                  onClick={() => {
                                    if (transferringStudent?.id === student.id) {
                                      setTransferringStudent(null);
                                      setTargetClassroomId('');
                                      setTransferStatus('idle');
                                    } else {
                                      setTransferringStudent(student);
                                      setTargetClassroomId('');
                                      setTransferStatus('idle');
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-sm font-mono text-[10px] tracking-wide transition-colors duration-150 ${
                                    transferringStudent?.id === student.id
                                      ? 'bg-black border-black text-white'
                                      : 'bg-white border-gray-200 text-gray-500 hover:border-black hover:text-black'
                                  }`}
                                >
                                  <ArrowRightLeft size={11} />
                                  {transferringStudent?.id === student.id ? 'Cancel' : 'Transfer'}
                                </button>
                              </td>
                            </tr>

                            {/* Inline transfer panel */}
                            {transferringStudent?.id === student.id && (
                              <tr className="bg-gray-50">
                                <td colSpan={6} className="px-4 pb-4 pt-0">
                                  <div className="border border-gray-200 rounded-sm p-4 bg-white">
                                    <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-gray-400 mb-3 flex items-center gap-2">
                                      <ArrowRightLeft size={11} />
                                      Transfer <strong className="text-black">{student.full_name}</strong> to
                                    </p>
                                    <div className="flex gap-2.5 flex-wrap">
                                      <div className="relative flex-1 min-w-[200px]">
                                        <select
                                          value={targetClassroomId}
                                          onChange={e => setTargetClassroomId(e.target.value === '' ? '' : Number(e.target.value))}
                                          className="w-full appearance-none px-3 py-2.5 pr-8 border border-gray-200 rounded-sm text-sm bg-white outline-none focus:border-black transition-colors cursor-pointer"
                                        >
                                          <option value="">Select target classroom…</option>
                                          {targetOptions.map(c => (
                                            <option key={c.id} value={c.id} disabled={c.is_full}>
                                              {c.name} — {c.grade_level_name}
                                              {c.is_full ? ' (Full)' : ` (${c.available_spots} spot${c.available_spots !== 1 ? 's' : ''})`}
                                            </option>
                                          ))}
                                        </select>
                                        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                      </div>
                                      <button
                                        onClick={handleTransfer}
                                        disabled={!targetClassroomId || transferring}
                                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-sm font-mono text-xs tracking-wide transition-colors duration-150 ${
                                          !targetClassroomId || transferring
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-black text-white hover:bg-gray-800 cursor-pointer'
                                        }`}
                                      >
                                        {transferring ? (
                                          <><Loader2 size={13} className="animate-spin" /> Transferring…</>
                                        ) : (
                                          <><ArrowRightLeft size={13} /> Confirm Transfer</>
                                        )}
                                      </button>
                                    </div>
                                    {transferStatus === 'error' && (
                                      <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-red-600">
                                        <AlertCircle size={12} />{transferMessage}
                                      </p>
                                    )}
                                    {transferStatus === 'success' && (
                                      <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[11px] text-gray-700">
                                        <CheckCircle2 size={12} />{transferMessage}
                                      </p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Empty state */}
                {!loadingStudents && filteredStudents.length === 0 && !studentError && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300">
                    <Users size={40} />
                    <p className="font-mono text-xs tracking-wider text-gray-400">
                      {searchTerm ? 'No students match your search' : 'No students enrolled yet'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── TEACHERS ── */}
            {activeTab === 'teachers' && (
              <div>
                {/* Class teacher banner */}
                {(classroom.education_level === 'NURSERY' || classroom.education_level === 'PRIMARY') &&
                  classroom.class_teacher_name && (
                    <div className="flex items-center gap-4 p-4 bg-black border border-black rounded-sm mb-5">
                      <div className="w-11 h-11 bg-gray-800 rounded-sm flex items-center justify-center font-serif text-base font-bold text-white flex-shrink-0">
                        {initials(classroom.class_teacher_name)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{classroom.class_teacher_name}</p>
                        <p className="font-mono text-[10px] tracking-wider uppercase text-gray-500 mt-0.5">
                          Class Teacher · All Subjects
                        </p>
                        {classroom.class_teacher_phone && (
                          <p className="font-mono text-xs text-gray-500 mt-0.5">{classroom.class_teacher_phone}</p>
                        )}
                      </div>
                    </div>
                  )}

                {/* Subject teachers */}
                {classroom.teacher_assignments && classroom.teacher_assignments.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {classroom.teacher_assignments.map(assignment => (
                      <div
                        key={assignment.id}
                        className="flex items-start justify-between gap-3 p-4 border border-gray-100 rounded-sm bg-white hover:border-black hover:shadow-[2px_2px_0_#000] transition-all duration-150"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-black rounded-sm flex items-center justify-center font-serif text-sm font-bold text-white flex-shrink-0">
                            {(assignment.teacher_first_name ?? '?').charAt(0)}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-gray-900">
                              {assignment.teacher_first_name} {assignment.teacher_last_name}
                            </p>
                            <p className="text-xs text-gray-600 font-medium mt-0.5">
                              {assignment.subject_name}
                              {assignment.subject_code && (
                                <span className="font-mono text-[10px] text-gray-400 ml-1.5">
                                  ({assignment.subject_code})
                                </span>
                              )}
                            </p>
                            <p className="font-mono text-[10px] text-gray-300 mt-1 flex items-center gap-2">
                              {assignment.periods_per_week} period{assignment.periods_per_week !== 1 ? 's' : ''}/week
                              {assignment.is_primary_teacher && (
                                <span className="bg-black text-white px-1.5 py-px rounded-sm font-mono text-[9px] tracking-[0.1em] uppercase">
                                  Primary
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        {onRemoveAssignment && (
                          <button
                            onClick={() => onRemoveAssignment(assignment.id)}
                            title="Remove assignment"
                            className="w-7 h-7 border border-gray-100 rounded-sm flex items-center justify-center flex-shrink-0 hover:bg-black hover:border-black group transition-colors duration-150"
                          >
                            <Trash2 size={12} className="text-gray-300 group-hover:text-white transition-colors" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300">
                    <UserCheck size={40} />
                    <p className="font-mono text-xs tracking-wider text-gray-400">No teachers assigned yet</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ════════════ FOOTER ════════════ */}
          <div className="flex-shrink-0 border-t border-gray-100 px-8 py-3.5 flex items-center justify-between bg-gray-50">
            <p className="font-mono text-[10px] tracking-wide text-gray-300">
              Updated {new Date(classroom.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-black text-white font-mono text-xs tracking-[0.12em] uppercase rounded-sm hover:bg-gray-800 transition-colors duration-150"
            >
              Close
            </button>
          </div>

          {/* Bottom accent stripe */}
          <div className="h-[3px] bg-black flex-shrink-0" />
        </div>
      </div>

      {/* Custom fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Mono:wght@400;500&display=swap');
        .font-serif { font-family: 'Playfair Display', Georgia, serif !important; }
        .font-mono  { font-family: 'DM Mono', 'Courier New', monospace !important; }
      `}</style>
    </>
  );
};

export default ClassroomViewModal;