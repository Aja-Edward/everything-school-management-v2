import React, { useState, useEffect, useCallback } from 'react';
import {
  X, UserCheck, Trash2, Search, AlertCircle,
  Users, ArrowRightLeft, ChevronDown, CheckCircle2,
  GraduationCap, Building2, TrendingUp, RefreshCw,
  Loader2, MapPin, Calendar, Hash,
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

const getInitials = (name: string) =>
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

  const { transferStudent, transferring, getClassroomStudents } = useStudentEnrollment();
  const { classrooms } = useClassroomList();
  const targetOptions = classrooms.filter(c => c.id !== classroom?.id && c.is_active);

  const fetchStudents = useCallback(async () => {
    if (!classroom) return;
    setLoadingStudents(true);
    setStudentError(null);
    try {
      const list = await getClassroomStudents(classroom.id);
      const result: Student[] = Array.isArray(list) ? list : [];
      setStudents(result);
      if (result.length === 0) setStudentError('No students enrolled yet.');
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
      }, 2800);
    } catch (err: any) {
      setTransferStatus('error');
      setTransferMessage(err?.response?.data?.error || err.message || 'Transfer failed.');
    }
  };

  if (!isOpen || !classroom) return null;

  const filteredStudents = students.filter(s =>
    s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const enrollmentPct = classroom.max_capacity > 0
    ? Math.round((classroom.current_enrollment / classroom.max_capacity) * 100) : 0;

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'students', label: 'Students', count: students.length },
    { key: 'teachers', label: 'Teachers', count: classroom.teacher_assignments?.length ?? 0 },
  ];

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(15,15,20,0.7)', backdropFilter: 'blur(10px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        {/* ── Modal shell ── */}
        <div
          className="relative w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-modal-in"
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            boxShadow: '0 8px 8px rgba(0,0,0,0.04), 0 24px 60px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
          }}
        >

          {/* ══════════════════════════════════
              HEADER  — white bg, black accents
          ══════════════════════════════════ */}
          <div
            className="flex-shrink-0 relative overflow-hidden"
            style={{ background: 'linear-gradient(160deg, #0a0a0a 0%, #1c1c1c 100%)' }}
          >
            {/* Subtle dot-grid texture */}
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="relative px-8 pt-8 pb-7">
              <div className="flex items-start justify-between gap-6">
                {/* Identity */}
                <div className="flex items-start gap-5">
                  {/* Icon square */}
                  <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 shadow-lg">
                    <GraduationCap size={28} className="text-gray-900" />
                  </div>

                  <div className="pt-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/40">
                        {classroom.education_level.replace(/_/g, ' ')}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/40">
                        {classroom.section_name}
                      </span>
                    </div>

                    <h2
                      className="text-[28px] font-bold text-white leading-tight mb-2.5"
                      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.02em' }}
                    >
                      {classroom.name}
                    </h2>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 text-white/50 text-xs font-medium">
                        <Calendar size={11} />
                        <span>{classroom.academic_session_name}</span>
                      </div>
                      <span className="text-white/20">·</span>
                      <div className="flex items-center gap-1.5 text-white/50 text-xs font-medium">
                        <Hash size={11} />
                        <span>{classroom.term_name}</span>
                      </div>
                      {classroom.room_number && (
                        <>
                          <span className="text-white/20">·</span>
                          <div className="flex items-center gap-1.5 text-white/50 text-xs font-medium">
                            <MapPin size={11} />
                            <span>Room {classroom.room_number}</span>
                          </div>
                        </>
                      )}
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                          classroom.is_active
                            ? 'bg-white/15 text-white ring-1 ring-white/25'
                            : 'bg-white/5 text-white/40 ring-1 ring-white/10'
                        }`}
                      >
                        {classroom.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white/30 hover:text-white hover:bg-white/10 transition-all duration-200"
                >
                  <X size={18} />
                </button>
              </div>

              {/* ── Stat strip ── */}
              <div className="grid grid-cols-4 gap-3 mt-7">
                {[
                  { label: 'Enrolled',  value: classroom.current_enrollment, dark: true },
                  { label: 'Capacity',  value: classroom.max_capacity,       dark: false },
                  { label: 'Available', value: classroom.available_spots,    dark: false },
                  { label: 'Fill Rate', value: `${enrollmentPct}%`,          dark: false },
                ].map(s => (
                  <div
                    key={s.label}
                    className={`rounded-2xl px-4 py-4 ${
                      s.dark
                        ? 'bg-white shadow-lg'
                        : 'bg-white/[0.07] border border-white/[0.1]'
                    }`}
                  >
                    <p className={`text-[9px] font-bold tracking-[0.2em] uppercase mb-1.5 ${s.dark ? 'text-gray-400' : 'text-white/35'}`}>
                      {s.label}
                    </p>
                    <p
                      className={`text-[26px] font-bold leading-none ${s.dark ? 'text-gray-900' : 'text-white/85'}`}
                      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════
              TABS
          ══════════════════════════════════ */}
          <div className="flex-shrink-0 flex border-b border-gray-100 bg-white px-8">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2 px-1 py-4 mr-8 text-[11px] font-bold tracking-[0.12em] uppercase transition-all duration-200 ${
                  activeTab === tab.key ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                      activeTab === tab.key
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {/* Active underline */}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-gray-900" />
                )}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════
              CONTENT
          ══════════════════════════════════ */}
          <div className="flex-1 overflow-y-auto bg-gray-50/60 p-7">

            {/* ── OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Details card */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 flex items-center gap-2.5 border-b border-gray-100 bg-gray-50">
                    <Building2 size={13} className="text-gray-400" />
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                      Classroom Details
                    </span>
                  </div>
                  {[
                    { label: 'Education Level', value: classroom.education_level.replace(/_/g, ' ') },
                    { label: 'Section',          value: classroom.section_name },
                    { label: 'Academic Session', value: classroom.academic_session_name },
                    { label: 'Term',             value: classroom.term_name },
                    { label: 'Room Number',      value: classroom.room_number || '—' },
                  ].map((row, i, arr) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between px-5 py-3.5 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      <span className="text-xs text-gray-400 font-medium">{row.label}</span>
                      <span className="text-sm font-semibold text-gray-800">{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Enrollment card */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 flex items-center gap-2.5 border-b border-gray-100 bg-gray-50">
                    <TrendingUp size={13} className="text-gray-400" />
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                      Enrollment
                    </span>
                  </div>
                  <div className="p-5">
                    {/* Progress bar */}
                    <div className="mb-5">
                      <div className="flex justify-between text-xs font-medium text-gray-400 mb-2">
                        <span>{classroom.current_enrollment} enrolled</span>
                        <span className="text-gray-600 font-bold">{enrollmentPct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(enrollmentPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Stat boxes */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Enrolled',  value: classroom.current_enrollment, dark: false },
                        { label: 'Available', value: classroom.available_spots,    dark: true },
                        { label: 'Capacity',  value: classroom.max_capacity,       dark: false },
                      ].map(s => (
                        <div
                          key={s.label}
                          className={`text-center py-4 rounded-xl border ${
                            s.dark
                              ? 'bg-gray-900 border-gray-900'
                              : 'bg-gray-50 border-gray-100'
                          }`}
                        >
                          <p
                            className={`text-2xl font-bold leading-none mb-1 ${s.dark ? 'text-white' : 'text-gray-800'}`}
                            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                          >
                            {s.value}
                          </p>
                          <p className={`text-[9px] font-bold tracking-[0.14em] uppercase ${s.dark ? 'text-gray-400' : 'text-gray-300'}`}>
                            {s.label}
                          </p>
                        </div>
                      ))}
                    </div>

                    {classroom.is_full && (
                      <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs font-semibold">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        Classroom is at full capacity
                      </div>
                    )}
                  </div>
                </div>

                {/* Class teacher — nursery/primary only */}
                {(classroom.education_level === 'NURSERY' || classroom.education_level === 'PRIMARY') && (
                  <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="px-5 py-3.5 flex items-center gap-2.5 border-b border-gray-100 bg-gray-50">
                      <UserCheck size={13} className="text-gray-400" />
                      <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                        Class Teacher
                      </span>
                    </div>
                    <div className="p-5">
                      {classroom.class_teacher_name ? (
                        <div className="flex items-center gap-4">
                          <div
                            className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                            style={{ fontFamily: "'Cormorant Garamond', serif" }}
                          >
                            {getInitials(classroom.class_teacher_name)}
                          </div>
                          <div>
                            <p className="text-base font-bold text-gray-900" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                              {classroom.class_teacher_name}
                            </p>
                            {classroom.class_teacher_phone && (
                              <p className="text-xs text-gray-400 mt-0.5">{classroom.class_teacher_phone}</p>
                            )}
                            {classroom.class_teacher_employee_id && (
                              <p className="text-[11px] text-gray-300 mt-0.5 font-mono">
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
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="text"
                      placeholder="Search by name or registration number…"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-gray-700 placeholder-gray-300 bg-white border border-gray-200 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 transition-all"
                    />
                  </div>
                  <button
                    onClick={fetchStudents}
                    disabled={loadingStudents}
                    className="px-3.5 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-300 transition-all disabled:opacity-30"
                  >
                    <RefreshCw size={15} className={loadingStudents ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Transfer status banner */}
                {transferStatus !== 'idle' && (
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-4 text-sm font-semibold ${
                    transferStatus === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}>
                    {transferStatus === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {transferMessage}
                  </div>
                )}

                {/* Loading */}
                {loadingStudents && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300">
                    <Loader2 size={28} className="animate-spin" />
                    <p className="text-xs tracking-widest uppercase font-semibold text-gray-300">Loading students…</p>
                  </div>
                )}

                {/* Error */}
                {studentError && !loadingStudents && students.length === 0 && (
                  <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-white border border-gray-100 text-gray-400 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0 text-gray-300" />
                    {studentError}
                  </div>
                )}

                {/* Student table */}
                {!loadingStudents && filteredStudents.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {['#', 'Student', 'Reg. No.', 'Gender', 'Status', 'Transfer'].map(h => (
                            <th
                              key={h}
                              className={`px-5 py-3.5 text-[9px] font-bold tracking-[0.2em] uppercase text-gray-400 ${h === 'Transfer' ? 'text-center' : 'text-left'}`}
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
                            <tr
                              className={`border-b border-gray-50 transition-colors duration-150 ${
                                transferringStudent?.id === student.id
                                  ? 'bg-gray-50'
                                  : 'hover:bg-gray-50/70'
                              }`}
                            >
                              <td className="px-5 py-4 text-gray-300 text-xs font-mono w-10">{idx + 1}</td>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                                    {student.full_name?.charAt(0) ?? '?'}
                                  </div>
                                  <span className="font-semibold text-gray-800">{student.full_name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-gray-400 text-xs font-mono">
                                {student.registration_number || student.username || '—'}
                              </td>
                              <td className="px-5 py-4 text-gray-400 text-xs capitalize">
                                {student.gender || '—'}
                              </td>
                              <td className="px-5 py-4">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide ${
                                  student.is_active
                                    ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                                    : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                                }`}>
                                  {student.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-center">
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
                                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-150 ${
                                    transferringStudent?.id === student.id
                                      ? 'bg-gray-900 text-white'
                                      : 'bg-gray-100 text-gray-500 hover:bg-gray-900 hover:text-white'
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
                                <td colSpan={6} className="px-5 pb-4 pt-1">
                                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400 mb-3 flex items-center gap-2">
                                      <ArrowRightLeft size={11} />
                                      Transfer{' '}
                                      <span className="text-gray-800">{student.full_name}</span>
                                      {' '}to another classroom
                                    </p>
                                    <div className="flex gap-2.5 flex-wrap">
                                      {/* Select */}
                                      <div className="relative flex-1 min-w-[200px]">
                                        <select
                                          value={targetClassroomId}
                                          onChange={e => setTargetClassroomId(e.target.value === '' ? '' : Number(e.target.value))}
                                          className="w-full appearance-none px-4 py-2.5 pr-9 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 cursor-pointer transition-all"
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

                                      {/* Confirm button */}
                                      <button
                                        onClick={handleTransfer}
                                        disabled={!targetClassroomId || transferring}
                                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                                          !targetClassroomId || transferring
                                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                            : 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm cursor-pointer'
                                        }`}
                                      >
                                        {transferring
                                          ? <><Loader2 size={14} className="animate-spin" /> Transferring…</>
                                          : <><ArrowRightLeft size={14} /> Confirm Transfer</>
                                        }
                                      </button>
                                    </div>

                                    {transferStatus === 'error' && (
                                      <p className="mt-2.5 flex items-center gap-2 text-xs text-red-500 font-medium">
                                        <AlertCircle size={12} />{transferMessage}
                                      </p>
                                    )}
                                    {transferStatus === 'success' && (
                                      <p className="mt-2.5 flex items-center gap-2 text-xs text-emerald-600 font-medium">
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
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-200">
                    <Users size={44} />
                    <p className="text-xs tracking-widest uppercase font-semibold text-gray-300">
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
                    <div className="flex items-center gap-4 p-5 rounded-2xl mb-5 bg-gray-900 shadow-xl">
                      <div
                        className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                        style={{ fontFamily: "'Cormorant Garamond', serif" }}
                      >
                        {getInitials(classroom.class_teacher_name)}
                      </div>
                      <div>
                        <p className="font-bold text-white text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                          {classroom.class_teacher_name}
                        </p>
                        <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/40 mt-0.5">
                          Class Teacher · All Subjects
                        </p>
                        {classroom.class_teacher_phone && (
                          <p className="text-xs text-white/40 mt-0.5">{classroom.class_teacher_phone}</p>
                        )}
                      </div>
                    </div>
                  )}

                {/* Subject teachers grid */}
                {classroom.teacher_assignments && classroom.teacher_assignments.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {classroom.teacher_assignments.map(assignment => (
                      <div
                        key={assignment.id}
                        className="group flex items-start justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-gray-300 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {(assignment.teacher_first_name ?? '?').charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800">
                              {assignment.teacher_first_name} {assignment.teacher_last_name}
                            </p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                              {assignment.subject_name}
                              {assignment.subject_code && (
                                <span className="text-gray-300 font-mono text-[10px] ml-1.5">
                                  ({assignment.subject_code})
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-gray-300 font-medium">
                                {assignment.periods_per_week}×/wk
                              </span>
                              {assignment.is_primary_teacher && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-gray-900 text-white">
                                  Primary
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {onRemoveAssignment && (
                          <button
                            onClick={() => onRemoveAssignment(assignment.id)}
                            className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-200">
                    <UserCheck size={44} />
                    <p className="text-xs tracking-widest uppercase font-semibold text-gray-300">
                      No teachers assigned yet
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══════════════════════════════════
              FOOTER
          ══════════════════════════════════ */}
          <div className="flex-shrink-0 px-8 py-4 flex items-center justify-between bg-white border-t border-gray-100">
            <p className="text-[11px] text-gray-300 font-medium">
              Last updated{' '}
              {new Date(classroom.updated_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-900 hover:text-white transition-all duration-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap');

        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.97) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in {
          animation: modal-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </>
  );
};

export default ClassroomViewModal;