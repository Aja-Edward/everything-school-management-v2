import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  X, UserCheck, Trash2, Search, AlertCircle,
  Users, ArrowRightLeft, ChevronDown, CheckCircle2,
  GraduationCap, Building2, TrendingUp, RefreshCw,
  Loader2, MapPin, Calendar, Hash, UserCog, Phone,
  Mail, BadgeCheck, Save, Pencil, XCircle, ChevronLeft,
  Plus, Clock, Coffee, Settings, BookOpen,
} from 'lucide-react';
import { Classroom, Teacher, ClassroomTeacherAssignment } from '@/types/classroomtypes';
import classroomService from '@/services/ClassroomService';
import {
  useStudentEnrollment,
  useClassroomList,
  useClassroom,
} from '@/contexts/ClassroomContext';
import type {Student, Period, TimetableSlot, SlotForm} from '@/types/classtimetabletypes'
import TransferTeacherPanel from '@/components/dashboards/admin/TransferTeacherPanel';

// ─── Auth hook ────────────────────────────────────────────────────────────────
import { useAuth } from '@/hooks/useAuth';

type TabType = 'overview' | 'students' | 'teachers' | 'form-teacher' | 'timetable';


// ─── Helpers ──────────────────────────────────────────────────────────────────

const getInitials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const getFormTeacherLabel = (level: string) => {
  const upper = (level ?? '').toUpperCase().replace(/-/g, '_');
  if (upper === 'JUNIOR_SECONDARY' || upper === 'SENIOR_SECONDARY')
    return 'Form Teacher';
  return 'Class Teacher';
};

// ─── Timetable constants ───────────────────────────────────────────────────────

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
];

const DAY_COLORS: Record<string, string> = {
  monday: 'bg-blue-50 border-blue-200 text-blue-700',
  tuesday: 'bg-violet-50 border-violet-200 text-violet-700',
  wednesday: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  thursday: 'bg-amber-50 border-amber-200 text-amber-700',
  friday: 'bg-rose-50 border-rose-200 text-rose-700',
};

const DAY_ACCENT: Record<string, string> = {
  monday: 'bg-blue-600',
  tuesday: 'bg-violet-600',
  wednesday: 'bg-emerald-600',
  thursday: 'bg-amber-500',
  friday: 'bg-rose-600',
};

const storageKey = (classroomId: number) => `timetable_periods_${classroomId}`;

const defaultPeriods = (): Period[] => [
  { id: 'p1',   label: 'Period 1',    start_time: '08:00', end_time: '08:40', is_break: false, order: 1  },
  { id: 'p2',   label: 'Period 2',    start_time: '08:40', end_time: '09:20', is_break: false, order: 2  },
  { id: 'p3',   label: 'Period 3',    start_time: '09:20', end_time: '10:00', is_break: false, order: 3  },
  { id: 'brk1', label: 'Short Break', start_time: '10:00', end_time: '10:20', is_break: true,  order: 4  },
  { id: 'p4',   label: 'Period 4',    start_time: '10:20', end_time: '11:00', is_break: false, order: 5  },
  { id: 'p5',   label: 'Period 5',    start_time: '11:00', end_time: '11:40', is_break: false, order: 6  },
  { id: 'p6',   label: 'Period 6',    start_time: '11:40', end_time: '12:20', is_break: false, order: 7  },
  { id: 'brk2', label: 'Lunch Break', start_time: '12:20', end_time: '13:00', is_break: true,  order: 8  },
  { id: 'p7',   label: 'Period 7',    start_time: '13:00', end_time: '13:40', is_break: false, order: 9  },
  { id: 'p8',   label: 'Period 8',    start_time: '13:40', end_time: '14:20', is_break: false, order: 10 },
];

// ─── Permission helper ────────────────────────────────────────────────────────
// 🔧 ADAPTER: Adjust role strings to match exactly what your backend returns.
// If your role field is nested (e.g. user.profile.role), update the destructure below.
const canEditTimetable = (
  user: any,
  classroom: Classroom | null,
): boolean => {
  if (!user || !classroom) return false;

  const role = (
    user.role ??
    user.user_type ??
    user.userType ??
    ''
  ).toString().toLowerCase();

  // Admins / superusers always have full access
  if (role === 'admin' || role === 'superuser' || user.is_superuser || user.is_staff) {
    return true;
  }

  // Form/class teachers: only editable when this user IS the assigned class_teacher.
  // classroom.class_teacher is the FK id stored on the Classroom model.
  // We check several common field names so this works with different auth shapes.
  // ADAPTER: add any other id field your user object uses to candidateIds.
  if (role === 'form_teacher' || role === 'class_teacher' || role === 'teacher') {
    if (classroom.class_teacher == null) return false;

    const candidateIds: (number | string | undefined | null)[] = [
      user.teacher_id,          // explicit teacher FK on user
      user.teacher?.id,         // nested teacher object
      user.profile?.teacher_id, // nested profile object
      user.id,                  // user id (if class_teacher FK points at User)
    ];

    return candidateIds.some(
      (id) => id != null && Number(id) === Number(classroom.class_teacher),
    );
  }

  return false;
};


// ═══════════════════════════════════════════════════════════════════════════════
// TIMETABLE SECTION (extracted for clarity)
// ═══════════════════════════════════════════════════════════════════════════════

interface TimetableSectionProps {
  classroom: Classroom;
  canEdit: boolean;
}

const TimetableSection: React.FC<TimetableSectionProps> = ({ classroom, canEdit }) => {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showPeriodConfig, setShowPeriodConfig] = useState(false);
  const [editingPeriods, setEditingPeriods] = useState<Period[]>([]);
  

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);

  const [activeCell, setActiveCell] = useState<{ period: Period; day: string } | null>(null);
  const [slotForm, setSlotForm] = useState<SlotForm>({ subject_id: '', teacher_id: '' });
  const [savingSlot, setSavingSlot] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState<number | null>(null);
  const [slotStatus, setSlotStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [slotStatusMsg, setSlotStatusMsg] = useState('');

  const assignments: ClassroomTeacherAssignment[] = classroom.teacher_assignments ?? [];

  const classroomTeachers = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    assignments.forEach((a) => {
      if (!map.has(a.teacher)) {
        map.set(a.teacher, {
          id: a.teacher,
          name: `${a.teacher_first_name ?? ''} ${a.teacher_last_name ?? ''}`.trim(),
        });
      }
    });
    return Array.from(map.values());
  }, [assignments]);

  const subjectsForTeacher = React.useMemo(() => {
    if (!slotForm.teacher_id) return [];
    return assignments
      .filter((a) => a.teacher === Number(slotForm.teacher_id))
      .map((a) => ({ id: a.subject, name: a.subject_name ?? '', code: a.subject_code }));
  }, [assignments, slotForm.teacher_id]);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey(classroom.id));
    if (saved) {
      try { setPeriods(JSON.parse(saved)); } catch { setPeriods(defaultPeriods()); }
    } else {
      setPeriods(defaultPeriods());
    }
  }, [classroom.id]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    setSlotError(null);
    try {
      const res = await classroomService.getWeeklySchedule({ classroom: classroom.id });
      const raw: any[] = Array.isArray(res) ? res : (res as any)?.results ?? [];
      setSlots(
        raw.map((s: any) => ({
          id:            s.id,
          period_number: s.period_number,
          day_of_week:   s.day_of_week?.toLowerCase(),
          subject_id:    s.subject,
          subject_name:  s.subject_name ?? s.subject?.name ?? '',
          subject_code:  s.subject_code ?? s.subject?.code,
          teacher_id:    s.teacher,
          teacher_name:  s.teacher_name ?? '',
          start_time:    s.start_time,
          end_time:      s.end_time,
        })),
      );
    } catch (err: any) {
      setSlotError(err?.message ?? 'Failed to load timetable');
    } finally {
      setLoadingSlots(false);
    }
  }, [classroom.id]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const getSlot = (period: Period, day: string) =>
    slots.find((s) => s.period_number === period.order && s.day_of_week === day);

  const openCell = (period: Period, day: string) => {
    if (!canEdit || period.is_break) return;
    const existing = getSlot(period, day);
    setSlotForm({ teacher_id: existing?.teacher_id ?? '', subject_id: existing?.subject_id ?? '' });
    setActiveCell({ period, day });
    setSlotStatus('idle');
  };

  const closeCell = () => {
    setActiveCell(null);
    setSlotForm({ subject_id: '', teacher_id: '' });
    setSlotStatus('idle');
  };

  const handleSaveSlot = async () => {
    if (!activeCell || !slotForm.teacher_id || !slotForm.subject_id) return;
    setSavingSlot(true);
    setSlotStatus('idle');
    const { period, day } = activeCell;
    const existing = getSlot(period, day);
    const payload = {
      classroom:     classroom.id,
      subject:       Number(slotForm.subject_id),
      teacher:       Number(slotForm.teacher_id),
      day_of_week:   day,
      start_time:    period.start_time,
      end_time:      period.end_time,
      period_number: period.order,
    };
    try {
      if (existing?.id) {
        await classroomService.updateClassSchedule(existing.id, {
          day_of_week:   payload.day_of_week,
          start_time:    payload.start_time,
          end_time:      payload.end_time,
          period_number: payload.period_number,
        });
      } else {
        await classroomService.createClassSchedule(payload);
      }
      setSlotStatus('success');
      setSlotStatusMsg('Slot saved successfully.');
      await loadSlots();
      setTimeout(closeCell, 1200);
    } catch (err: any) {
      setSlotStatus('error');
      setSlotStatusMsg(err?.response?.data?.error ?? err?.message ?? 'Failed to save slot.');
    } finally {
      setSavingSlot(false);
    }
  };

  const handleDeleteSlot = async (slot: TimetableSlot) => {
    if (!slot.id) return;
    setDeletingSlotId(slot.id);
    try {
      await classroomService.deleteClassSchedule(slot.id);
      setSlots((prev) => prev.filter((s) => s.id !== slot.id));
      closeCell();
    } catch (err: any) {
      setSlotStatus('error');
      setSlotStatusMsg(err?.message ?? 'Failed to delete slot.');
    } finally {
      setDeletingSlotId(null);
    }
  };

  const openPeriodConfig = () => {
    setEditingPeriods(periods.map((p) => ({ ...p })));
    setShowPeriodConfig(true);
  };

  const savePeriods = () => {
    const sorted = [...editingPeriods].sort((a, b) => a.order - b.order);
    setPeriods(sorted);
    localStorage.setItem(storageKey(classroom.id), JSON.stringify(sorted));
    setShowPeriodConfig(false);
  };

  const addPeriod = (isBreak: boolean) => {
    const maxOrder = editingPeriods.reduce((m, p) => Math.max(m, p.order), 0);
    setEditingPeriods((prev) => [
      ...prev,
      {
        id:         `p_${Date.now()}`,
        label:      isBreak ? 'Break' : `Period ${prev.filter((p) => !p.is_break).length + 1}`,
        start_time: '08:00',
        end_time:   '08:40',
        is_break:   isBreak,
        order:      maxOrder + 1,
      },
    ]);
  };

  const removePeriod = (id: string) =>
    setEditingPeriods((prev) => prev.filter((p) => p.id !== id));

  const updatePeriodField = (id: string, field: keyof Period, value: any) =>
    setEditingPeriods((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );

  return (
    <div className="space-y-6">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Weekly Timetable</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {periods.filter((p) => !p.is_break).length} periods ·{' '}
            {periods.filter((p) => p.is_break).length} breaks per day
          </p>
        </div>
        <div className="flex gap-2.5">
          {canEdit && (
            <button
              onClick={openPeriodConfig}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm"
            >
              <Settings size={14} /> Configure Periods
            </button>
          )}
          <button
            onClick={loadSlots}
            disabled={loadingSlots}
            className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm disabled:opacity-30"
          >
            <RefreshCw size={14} className={loadingSlots ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Permission notice ── */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          You have view-only access to this timetable.
        </div>
      )}

      {slotError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-sm font-semibold">
          <AlertCircle size={15} /> {slotError}
        </div>
      )}

      {/* ── Full-width timetable grid (one table per day on large screens) ── */}
      <div className="space-y-5">
        {DAYS.map((day) => (
          <div key={day.key} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Day header */}
            <div className={`px-6 py-3.5 flex items-center gap-3 border-b border-gray-100 ${DAY_COLORS[day.key]} bg-opacity-40`}>
              <div className={`w-2 h-2 rounded-full ${DAY_ACCENT[day.key]}`} />
              <span className="text-sm font-bold tracking-wide">{day.label}</span>
              <span className="ml-auto text-xs opacity-60">
                {slots.filter((s) => s.day_of_week === day.key).length} /{' '}
                {periods.filter((p) => !p.is_break).length} filled
              </span>
            </div>

            {/* Periods row */}
            <div className="flex overflow-x-auto">
              {periods.map((period) => {
                const slot = getSlot(period, day.key);
                const isActive =
                  activeCell?.period.id === period.id && activeCell?.day === day.key;

                if (period.is_break) {
                  return (
                    <div
                      key={period.id}
                      className="flex-shrink-0 flex flex-col items-center justify-center px-4 py-5 bg-amber-50/60 border-r border-amber-100 last:border-r-0 min-w-[100px]"
                    >
                      <Coffee size={14} className="text-amber-400 mb-1" />
                      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider text-center">
                        {period.label}
                      </p>
                      <p className="text-[9px] text-amber-400 font-mono mt-0.5">
                        {period.start_time}–{period.end_time}
                      </p>
                    </div>
                  );
                }

                return (
                  <div
                    key={period.id}
                    className="flex-1 min-w-[140px] border-r border-gray-100 last:border-r-0 flex flex-col"
                  >
                    {/* Period label */}
                    <div className="px-3 py-2 border-b border-gray-50 bg-gray-50/50">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                        {period.label}
                      </p>
                      <p className="text-[9px] text-gray-300 font-mono">
                        {period.start_time}–{period.end_time}
                      </p>
                    </div>

                    {/* Cell */}
                    <div className="flex-1 p-2">
                      {slot ? (
                        <button
                          onClick={() => openCell(period, day.key)}
                          disabled={!canEdit}
                          className={`w-full h-full min-h-[72px] text-left px-3 py-3 rounded-xl border transition-all duration-150 group ${
                            isActive
                              ? 'border-gray-900 bg-gray-900 text-white shadow-lg'
                              : `${DAY_COLORS[day.key]} hover:shadow-md`
                          } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <p
                            className={`text-[11px] font-bold leading-tight ${
                              isActive ? 'text-white' : ''
                            }`}
                          >
                            {slot.subject_name}
                          </p>
                          {slot.subject_code && (
                            <p
                              className={`text-[9px] font-mono mt-0.5 ${
                                isActive ? 'text-white/60' : 'opacity-60'
                              }`}
                            >
                              {slot.subject_code}
                            </p>
                          )}
                          <p
                            className={`text-[10px] mt-1.5 leading-tight ${
                              isActive ? 'text-white/70' : 'opacity-70'
                            }`}
                          >
                            {slot.teacher_name}
                          </p>
                        </button>
                      ) : canEdit ? (
                        <button
                          onClick={() => openCell(period, day.key)}
                          className="w-full h-full min-h-[72px] rounded-xl border-2 border-dashed border-gray-150 hover:border-gray-300 hover:bg-gray-50 transition-all duration-150 flex items-center justify-center group"
                        >
                          <Plus
                            size={16}
                            className="text-gray-200 group-hover:text-gray-400 transition-colors"
                          />
                        </button>
                      ) : (
                        <div className="min-h-[72px] rounded-xl bg-gray-50/50" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Slot Edit Panel ── */}
      {activeCell && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-md">
          <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <BookOpen size={15} className="text-gray-400" />
              <div>
                <p className="text-sm font-bold text-gray-800">
                  {activeCell.day.charAt(0).toUpperCase() + activeCell.day.slice(1)} ·{' '}
                  {activeCell.period.label}
                </p>
                <p className="text-[11px] text-gray-400 font-mono">
                  {activeCell.period.start_time} – {activeCell.period.end_time}
                </p>
              </div>
            </div>
            <button
              onClick={closeCell}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-gray-900 hover:bg-gray-100 transition-all"
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {slotStatus !== 'idle' && (
              <div
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold ${
                  slotStatus === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border border-red-200 text-red-600'
                }`}
              >
                {slotStatus === 'success' ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <AlertCircle size={15} />
                )}
                {slotStatusMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Teacher */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                  Teacher
                </label>
                <div className="relative">
                  <select
                    value={slotForm.teacher_id}
                    onChange={(e) =>
                      setSlotForm({
                        teacher_id: e.target.value === '' ? '' : Number(e.target.value),
                        subject_id: '',
                      })
                    }
                    className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 cursor-pointer transition-all"
                  >
                    <option value="">Select teacher…</option>
                    {classroomTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>
                {classroomTeachers.length === 0 && (
                  <p className="text-xs text-red-400 mt-1.5">
                    No teachers assigned to this classroom yet.
                  </p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                  Subject
                </label>
                <div className="relative">
                  <select
                    value={slotForm.subject_id}
                    onChange={(e) =>
                      setSlotForm((prev) => ({
                        ...prev,
                        subject_id: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    disabled={!slotForm.teacher_id}
                    className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">Select subject…</option>
                    {subjectsForTeacher.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.code ? ` (${s.code})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>
                {slotForm.teacher_id && subjectsForTeacher.length === 0 && (
                  <p className="text-xs text-red-400 mt-1.5">
                    This teacher has no subjects assigned to this classroom.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              {getSlot(activeCell.period, activeCell.day)?.id && (
                <button
                  onClick={() => handleDeleteSlot(getSlot(activeCell.period, activeCell.day)!)}
                  disabled={deletingSlotId !== null}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-bold hover:bg-red-50 transition-all disabled:opacity-40"
                >
                  {deletingSlotId ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Remove Slot
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={closeCell}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSlot}
                disabled={!slotForm.teacher_id || !slotForm.subject_id || savingSlot}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  !slotForm.teacher_id || !slotForm.subject_id || savingSlot
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                }`}
              >
                {savingSlot ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Save size={14} /> Save Slot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Period Config Modal ── */}
      {showPeriodConfig && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,15,20,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => e.target === e.currentTarget && setShowPeriodConfig(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Clock size={15} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-700">Configure Periods</span>
              </div>
              <button
                onClick={() => setShowPeriodConfig(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-gray-900 hover:bg-gray-100 transition-all"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {editingPeriods
                .sort((a, b) => a.order - b.order)
                .map((period, idx) => (
                  <div
                    key={period.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      period.is_break
                        ? 'bg-amber-50 border-amber-100'
                        : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        period.is_break
                          ? 'bg-amber-200 text-amber-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    {period.is_break && (
                      <Coffee size={13} className="text-amber-400 flex-shrink-0" />
                    )}
                    <input
                      type="text"
                      value={period.label}
                      onChange={(e) => updatePeriodField(period.id, 'label', e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white outline-none focus:border-gray-900 transition-all"
                      placeholder="Label"
                    />
                    <input
                      type="time"
                      value={period.start_time}
                      onChange={(e) => updatePeriodField(period.id, 'start_time', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 bg-white outline-none focus:border-gray-900 transition-all w-24"
                    />
                    <span className="text-gray-300 text-xs">–</span>
                    <input
                      type="time"
                      value={period.end_time}
                      onChange={(e) => updatePeriodField(period.id, 'end_time', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 bg-white outline-none focus:border-gray-900 transition-all w-24"
                    />
                    <button
                      onClick={() => updatePeriodField(period.id, 'is_break', !period.is_break)}
                      title={period.is_break ? 'Mark as period' : 'Mark as break'}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${
                        period.is_break
                          ? 'bg-amber-100 text-amber-500 hover:bg-amber-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-amber-100 hover:text-amber-500'
                      }`}
                    >
                      <Coffee size={12} />
                    </button>
                    <button
                      onClick={() => removePeriod(period.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
            </div>

            <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => addPeriod(false)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-white hover:text-gray-900 transition-all"
                >
                  <Plus size={12} /> Add Period
                </button>
                <button
                  onClick={() => addPeriod(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 text-xs font-bold text-amber-500 hover:bg-amber-50 transition-all"
                >
                  <Coffee size={12} /> Add Break
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPeriodConfig(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={savePeriods}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 shadow-sm transition-all"
                >
                  <Save size={14} /> Save Periods
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const ClassroomDetailPage: React.FC = () => {
  // ── Routing ────────────────────────────────────────────────────────────────
  // Route must be: /classrooms/:classroomId
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();

  // ── Auth ───────────────────────────────────────────────────────────────────
  // ADAPTER: swap useAuth() for your actual hook if the import path differs.
  // The user object is passed as-is to canEditTimetable() which reads role,
  // user_type, teacher_id, teacher?.id, profile?.teacher_id, or id from it.
  const { user } = useAuth();


  // ── Data ───────────────────────────────────────────────────────────────────
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [loadingClassroom, setLoadingClassroom] = useState(true);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const [showTeacherTransfer, setShowTeacherTransfer] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Students
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [targetClassroomId, setTargetClassroomId] = useState<number | ''>('');
  const [transferStatus, setTransferStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [transferMessage, setTransferMessage] = useState('');

  // Form teacher
  const [isEditingFormTeacher, setIsEditingFormTeacher] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | ''>('');
  const [savingFormTeacher, setSavingFormTeacher] = useState(false);
  const [formTeacherSaveStatus, setFormTeacherSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [formTeacherSaveMessage, setFormTeacherSaveMessage] = useState('');

  const { transferStudent, transferring, getClassroomStudents } = useStudentEnrollment();
  const { classrooms } = useClassroomList();
  const { teachers, updateClassroom } = useClassroom();

  // ── Load classroom ─────────────────────────────────────────────────────────
  // Strategy:
  //   1. If the parent navigated with `state: { classroom }`, use it instantly
  //      (zero loading flash, data is already fresh from the list page).
  //   2. Otherwise try to find the classroom in the context list (already loaded).
  //   3. If neither works (e.g. direct URL visit), fall back to getClassrooms()
  //      and pick the matching entry by id.
  const location = useLocation(); // add `useLocation` to your react-router-dom import

  const [classroomReady, setClassroomReady] = useState(false);

useEffect(() => {
  if (!classroomId) return;
  const numId = Number(classroomId);

  // Show cached data immediately
  const cached = (location.state as any)?.classroom as Classroom | undefined;
  if (cached?.id === numId) {
    setClassroom(cached);
    setSelectedTeacherId(cached.class_teacher ?? '');
    setLoadingClassroom(false);
  } else {
    const contextMatch = classrooms.find((c) => c.id === numId);
    if (contextMatch) {
      setClassroom(contextMatch);
      setSelectedTeacherId(contextMatch.class_teacher ?? '');
      setLoadingClassroom(false);
    }
  }

  // Always fetch fresh — this is the authoritative data
  classroomService
    .getClassrooms()
    .then((list) => {
      const match = list.find((c) => c.id === numId);
      if (match) {
        setClassroom(match);
        setSelectedTeacherId(match.class_teacher ?? '');
        setClassroomReady(true);  // ← signal that fresh data is here
      } else {
        setClassroomError('Classroom not found.');
      }
    })
    .catch((err: any) => {
      setClassroomError(err?.message ?? 'Failed to load classroom');
    })
    .finally(() => setLoadingClassroom(false));
}, [classroomId]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Load students ──────────────────────────────────────────────────────────
  const fetchStudents = async (classroomIdToFetch?: number) => {
  const id = classroomIdToFetch ?? classroom?.id;
  if (!id) return;
  setLoadingStudents(true);
  setStudentError(null);
  try {
    const list = await getClassroomStudents(id);
    const result: Student[] = Array.isArray(list) ? list : [];
    setStudents(result);
    if (result.length === 0) setStudentError('No students enrolled yet.');
  } catch (err: any) {
    setStudentError(err.message || 'Failed to load students');
  } finally {
    setLoadingStudents(false);
  }
};

useEffect(() => {
  if (!classroomReady) return;
  const numId = Number(classroomId);
  fetchStudents(numId);
}, [classroomReady]);



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
      setTransferMessage(
        result?.message || `${transferringStudent.full_name} transferred successfully.`,
      );
      setStudents((prev) => prev.filter((s) => s.id !== transferringStudent.id));
      setTimeout(() => {
        setTransferringStudent(null);
        setTargetClassroomId('');
        setTransferStatus('idle');
      }, 2800);
    } catch (err: any) {
      setTransferStatus('error');
      setTransferMessage(
        err?.response?.data?.error || err.message || 'Transfer failed.',
      );
    }
  };

  // ── Form teacher save ──────────────────────────────────────────────────────
  const handleSaveFormTeacher = async () => {
    if (!classroom) return;
    setSavingFormTeacher(true);
    setFormTeacherSaveStatus('idle');
    try {
      await updateClassroom(classroom.id, {
        class_teacher: selectedTeacherId === '' ? undefined : Number(selectedTeacherId),
      });
      setFormTeacherSaveStatus('success');
      setFormTeacherSaveMessage('Form teacher updated successfully.');
      setIsEditingFormTeacher(false);
      setTimeout(() => setFormTeacherSaveStatus('idle'), 3000);
    } catch (err: any) {
      setFormTeacherSaveStatus('error');
      setFormTeacherSaveMessage(err?.message || 'Failed to update form teacher.');
    } finally {
      setSavingFormTeacher(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const targetOptions = classrooms.filter(
    (c) => c.id !== classroom?.id && c.is_active,
  );

  const filteredStudents = students.filter(
    (s) =>
      s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.username?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const previewTeacher =
    selectedTeacherId !== ''
      ? teachers.find((t) => t.id === Number(selectedTeacherId))
      : null;

  const enrollmentPct =
    classroom && classroom.max_capacity > 0
      ? Math.round(
          ((classroom.current_enrollment ?? 0) / classroom.max_capacity) * 100,
        )
      : 0;

  const formTeacherLabel = getFormTeacherLabel(classroom?.education_level ?? '');
  const assignedTeacher: Teacher | undefined = teachers.find(
    (t) => t.id === classroom?.class_teacher,
  );

  const tabs: { key: TabType; label: string; count?: number }[] = classroom
    ? [
        { key: 'overview',     label: 'Overview' },
        { key: 'students',     label: 'Students',     count: students.length },
        { key: 'teachers',     label: 'Teachers',     count: classroom.teacher_assignments?.length ?? 0 },
        { key: 'form-teacher', label: formTeacherLabel },
        { key: 'timetable',    label: 'Timetable' },
      ]
    : [];

  // ── Loading / Error states ─────────────────────────────────────────────────
  if (loadingClassroom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 text-gray-300">
          <Loader2 size={36} className="animate-spin" />
          <p className="text-sm font-semibold tracking-widest uppercase">Loading classroom…</p>
        </div>
      </div>
    );
  }

  if (classroomError || !classroom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <p className="text-base font-bold text-gray-700 mb-1">Failed to load classroom</p>
          <p className="text-sm text-gray-400 mb-6">{classroomError}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 transition-all"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap');
      `}</style>

      <div className="min-h-screen bg-gray-50">

        {/* ══════════════════════════════════
            HERO HEADER
        ══════════════════════════════════ */}
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(160deg, #1e2a3a 0%, #2d3f55 60%, #1a3048 100%)',
          }}
        >
          {/* Dot-grid texture */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 pt-6 pb-2">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-white/40 hover:text-white/80 text-xs font-semibold tracking-wide transition-colors"
              >
                <ChevronLeft size={14} /> Classrooms
              </button>
              <span className="text-white/20 text-xs">/</span>
              <span className="text-white/60 text-xs font-semibold">{classroom.name}</span>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 py-8">
              {/* Identity */}
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 shadow-xl">
                  <GraduationCap size={32} className="text-gray-900" />
                </div>
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/40">
                      {classroom.education_level.replace(/_/g, ' ')}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/40">
                      {classroom.section_name}
                    </span>
                  </div>
                  <h1
                    className="text-4xl font-bold text-white leading-tight mb-3"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.02em' }}
                  >
                    {classroom.name}
                  </h1>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-white/50 text-xs font-medium">
                      <Calendar size={12} />
                      <span>{classroom.academic_session_name}</span>
                    </div>
                    <span className="text-white/20">·</span>
                    <div className="flex items-center gap-1.5 text-white/50 text-xs font-medium">
                      <Hash size={12} />
                      <span>{classroom.term_name}</span>
                    </div>
                    {classroom.room_number && (
                      <>
                        <span className="text-white/20">·</span>
                        <div className="flex items-center gap-1.5 text-white/50 text-xs font-medium">
                          <MapPin size={12} />
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

              {/* Stat strip */}
              <div className="grid grid-cols-4 gap-3 lg:min-w-[440px]">
                {[
                  { label: 'Enrolled',  value: classroom.current_enrollment ?? 0, dark: true  },
                  { label: 'Capacity',  value: classroom.max_capacity,             dark: false },
                  { label: 'Available', value: classroom.available_spots ?? (classroom.max_capacity - (classroom.current_enrollment ?? 0)), dark: false },
                  { label: 'Fill Rate', value: `${enrollmentPct}%`,                dark: false },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`rounded-2xl px-4 py-5 ${
                      s.dark
                        ? 'bg-white shadow-xl'
                        : 'bg-white/[0.07] border border-white/[0.1]'
                    }`}
                  >
                    <p
                      className={`text-[9px] font-bold tracking-[0.2em] uppercase mb-1.5 ${
                        s.dark ? 'text-gray-400' : 'text-white/35'
                      }`}
                    >
                      {s.label}
                    </p>
                    <p
                      className={`text-[30px] font-bold leading-none ${
                        s.dark ? 'text-gray-900' : 'text-white/85'
                      }`}
                      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex overflow-x-auto border-t border-white/[0.08] -mx-6 lg:-mx-10 px-6 lg:px-10">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex items-center gap-2 px-1 py-4 mr-8 text-[11px] font-bold tracking-[0.12em] uppercase transition-all duration-200 whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'text-white'
                      : 'text-white/35 hover:text-white/65'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                        activeTab === tab.key
                          ? 'bg-white text-gray-900'
                          : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-white" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════
            PAGE CONTENT
        ══════════════════════════════════ */}
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left column */}
              <div className="lg:col-span-2 space-y-6">

                {/* Details card */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 flex items-center gap-2.5 border-b border-gray-100 bg-gray-50">
                    <Building2 size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                      Classroom Details
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {[
                      { label: 'Education Level', value: classroom.education_level.replace(/_/g, ' ') },
                      { label: 'Section',          value: classroom.section_name },
                      { label: 'Academic Session', value: classroom.academic_session_name },
                      { label: 'Term',             value: classroom.term_name },
                      { label: 'Room Number',      value: classroom.room_number || '—' },
                      { label: 'Status',           value: classroom.is_active ? 'Active' : 'Inactive' },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between px-6 py-4">
                        <span className="text-sm text-gray-400 font-medium">{row.label}</span>
                        <span className="text-sm font-semibold text-gray-800">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Form teacher preview */}
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2.5">
                      <UserCog size={14} className="text-gray-400" />
                      <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                        {formTeacherLabel}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab('form-teacher')}
                      className="text-[10px] font-bold tracking-wider uppercase text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      Manage →
                    </button>
                  </div>
                  <div className="p-6">
                    {classroom.class_teacher_name ? (
                      <div className="flex items-center gap-5">
                        <div
                          className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                          style={{ fontFamily: "'Cormorant Garamond', serif" }}
                        >
                          {getInitials(classroom.class_teacher_name)}
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-900">
                            {classroom.class_teacher_name}
                          </p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {classroom.class_teacher_phone && (
                              <span className="text-sm text-gray-400">
                                {classroom.class_teacher_phone}
                              </span>
                            )}
                            {classroom.class_teacher_employee_id && (
                              <span className="text-xs text-gray-300 font-mono">
                                ID: {classroom.class_teacher_employee_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between py-2">
                        <p className="text-sm text-gray-300">
                          No {formTeacherLabel.toLowerCase()} assigned
                        </p>
                        <button
                          onClick={() => setActiveTab('form-teacher')}
                          className="text-sm font-bold text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          Assign now →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right column — Enrollment */}
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 flex items-center gap-2.5 border-b border-gray-100 bg-gray-50">
                    <TrendingUp size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                      Enrollment
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="mb-6">
                      <div className="flex justify-between text-sm font-medium text-gray-400 mb-2.5">
                        <span>{classroom.current_enrollment ?? 0} enrolled</span>
                        <span className="text-gray-700 font-bold">{enrollmentPct}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(enrollmentPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      {[
                        { label: 'Enrolled',  value: classroom.current_enrollment ?? 0, dark: false },
                        { label: 'Available', value: classroom.available_spots ?? (classroom.max_capacity - (classroom.current_enrollment ?? 0)), dark: true },
                        { label: 'Capacity',  value: classroom.max_capacity, dark: false },
                      ].map((s) => (
                        <div
                        
                          key={s.label}
                          className={`flex items-center justify-between px-5 py-4 rounded-xl border ${
                            s.dark
                              ? 'bg-gray-600 border-gray-900 text-white'
                              : 'bg-gray-50 border-gray-100 text-gray-800'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold tracking-[0.14em] uppercase ${
                              s.dark ? 'text-gray-400' : 'text-gray-300'
                            }`}
                          >
                            {s.label}
                          </span>
                          <span
                            className={`text-3xl font-bold leading-none ${
                              s.dark ? 'text-white' : 'text-gray-800'
                            }`}
                            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                          >
                            {s.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {classroom.is_full && (
                      <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-sm font-semibold">
                        <AlertCircle size={15} className="flex-shrink-0" />
                        Classroom is at full capacity
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick nav cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { tab: 'students' as TabType,     icon: Users,    label: 'Students',    count: students.length },
                    { tab: 'teachers' as TabType,     icon: UserCheck, label: 'Teachers',   count: classroom.teacher_assignments?.length ?? 0 },
                    { tab: 'timetable' as TabType,    icon: Calendar, label: 'Timetable',   count: null },
                    { tab: 'form-teacher' as TabType, icon: UserCog,  label: formTeacherLabel, count: null },
                  ].map(({ tab, icon: Icon, label, count }) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="flex flex-col items-start p-4 bg-white rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all duration-200 text-left group"
                    >
                      <Icon size={18} className="text-gray-300 group-hover:text-gray-700 transition-colors mb-3" />
                      <p className="text-xs font-bold text-gray-700 leading-tight">{label}</p>
                      {count !== null && (
                        <p className="text-[11px] text-gray-300 mt-0.5">{count} assigned</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STUDENTS ── */}
          {activeTab === 'students' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"
                  />
                  <input
                    type="text"
                    placeholder="Search by name or registration number…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl text-sm text-gray-700 placeholder-gray-300 bg-white border border-gray-200 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 transition-all shadow-sm"
                  />
                </div>
                <button
                    onClick={() => fetchStudents(classroom?.id)}
                    disabled={loadingStudents}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm disabled:opacity-30"
                >
                  <RefreshCw size={14} className={loadingStudents ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {transferStatus !== 'idle' && (
                <div
                  className={`flex items-center gap-3 px-5 py-4 rounded-xl text-sm font-semibold ${
                    transferStatus === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}
                >
                  {transferStatus === 'success' ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  {transferMessage}
                </div>
              )}

              {loadingStudents && (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-300">
                  <Loader2 size={32} className="animate-spin" />
                  <p className="text-xs tracking-widest uppercase font-semibold">
                    Loading students…
                  </p>
                </div>
              )}

              {studentError && !loadingStudents && students.length === 0 && (
                <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-white border border-gray-100 text-gray-400 text-sm shadow-sm">
                  <AlertCircle size={16} className="flex-shrink-0 text-gray-300" />
                  {studentError}
                </div>
              )}

              {!loadingStudents && filteredStudents.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['#', 'Student', 'Reg. No.', 'Gender', 'Status', 'Transfer'].map(
                          (h) => (
                            <th
                              key={h}
                              className={`px-6 py-4 text-[9px] font-bold tracking-[0.2em] uppercase text-gray-400 ${
                                h === 'Transfer' ? 'text-center' : 'text-left'
                              }`}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, idx) => (
                        <React.Fragment key={student.id}>
                          <tr
                            className={`border-b border-gray-50 transition-colors duration-150 ${
                              transferringStudent?.id === student.id
                                ? 'bg-gray-50'
                                : 'hover:bg-gray-50/70'
                            }`}
                          >
                            <td className="px-6 py-4 text-gray-300 text-xs font-mono w-12">
                              {idx + 1}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                                  {student.full_name?.charAt(0) ?? '?'}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800">
                                    {student.full_name}
                                  </p>
                                  {student.age && (
                                    <p className="text-xs text-gray-300">{student.age} yrs</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-400 text-xs font-mono">
                              {student.registration_number || student.username || '—'}
                            </td>
                            <td className="px-6 py-4 text-gray-400 text-sm capitalize">
                              {student.gender || '—'}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide ${
                                  student.is_active
                                    ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                                    : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                                }`}
                              >
                                {student.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
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
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 ${
                                  transferringStudent?.id === student.id
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-900 hover:text-white'
                                }`}
                              >
                                <ArrowRightLeft size={12} />
                                {transferringStudent?.id === student.id ? 'Cancel' : 'Transfer'}
                              </button>
                            </td>
                          </tr>

                          {transferringStudent?.id === student.id && (
                            <tr className="bg-gray-50/80">
                              <td colSpan={6} className="px-6 pb-5 pt-2">
                                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                                  <p className="text-xs font-bold tracking-[0.16em] uppercase text-gray-400 mb-4 flex items-center gap-2">
                                    <ArrowRightLeft size={12} />
                                    Transfer{' '}
                                    <span className="text-gray-800">{student.full_name}</span>{' '}
                                    to another classroom
                                  </p>
                                  <div className="flex gap-3 flex-wrap">
                                    <div className="relative flex-1 min-w-[220px]">
                                      <select
                                        value={targetClassroomId}
                                        onChange={(e) =>
                                          setTargetClassroomId(
                                            e.target.value === ''
                                              ? ''
                                              : Number(e.target.value),
                                          )
                                        }
                                        className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 cursor-pointer transition-all"
                                      >
                                        <option value="">Select target classroom…</option>
                                        {targetOptions.map((c) => (
                                          <option
                                            key={c.id}
                                            value={c.id}
                                            disabled={c.is_full}
                                          >
                                            {c.name} — {c.grade_level_name}
                                            {c.is_full
                                              ? ' (Full)'
                                              : ` (${c.available_spots} spot${c.available_spots !== 1 ? 's' : ''})`}
                                          </option>
                                        ))}
                                      </select>
                                      <ChevronDown
                                        size={14}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                                      />
                                    </div>
                                    <button
                                      onClick={handleTransfer}
                                      disabled={!targetClassroomId || transferring}
                                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-150 ${
                                        !targetClassroomId || transferring
                                          ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                          : 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm cursor-pointer'
                                      }`}
                                    >
                                      {transferring ? (
                                        <>
                                          <Loader2 size={14} className="animate-spin" />{' '}
                                          Transferring…
                                        </>
                                      ) : (
                                        <>
                                          <ArrowRightLeft size={14} /> Confirm Transfer
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  {transferStatus === 'error' && (
                                    <p className="mt-3 flex items-center gap-2 text-xs text-red-500 font-medium">
                                      <AlertCircle size={12} />
                                      {transferMessage}
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

              {!loadingStudents && filteredStudents.length === 0 && !studentError && (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-200">
                  <Users size={48} />
                  <p className="text-sm tracking-widest uppercase font-semibold text-gray-300">
                    {searchTerm ? 'No students match your search' : 'No students enrolled yet'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── TEACHERS ── */}
          {activeTab === 'teachers' && (
            <div className="space-y-5">
            <div className="flex justify-end">
                <button
                    onClick={() => setShowTeacherTransfer((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm"
                >
                    <ArrowRightLeft size={14} />
                    {showTeacherTransfer ? 'Cancel Transfer' : 'Transfer Teacher'}
                </button>
                </div>

                {/* ── Transfer panel ── */}
                
                {showTeacherTransfer && (
                <TransferTeacherPanel
                    classroom={classroom}
                    targetOptions={targetOptions}   // already computed in ClassroomDetailPage
                    onComplete={() => {
                    setShowTeacherTransfer(false);
                    // Reload classroom data to reflect changes
                    classroomService.getClassrooms().then((list) => {
                        const match = list.find((c) => c.id === classroom.id);
                        if (match) setClassroom(match);
                    });
                    }}
                    onCancel={() => setShowTeacherTransfer(false)}
                />
                )}
              {(['NURSERY', 'PRIMARY'].includes(
                (classroom.education_level ?? '').toUpperCase(),
              ) &&
                classroom.class_teacher_name) && (
                <div className="flex items-center gap-5 p-6 rounded-2xl bg-gray-900 shadow-xl">
                  <div
                    className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    {getInitials(classroom.class_teacher_name)}
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">
                      {classroom.class_teacher_name}
                    </p>
                    <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/40 mt-0.5">
                      Class Teacher · All Subjects
                    </p>
                    {classroom.class_teacher_phone && (
                      <p className="text-sm text-white/40 mt-1">
                        {classroom.class_teacher_phone}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {classroom.teacher_assignments && classroom.teacher_assignments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {classroom.teacher_assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="group flex items-start justify-between gap-4 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-gray-300 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                          {(assignment.teacher_first_name ?? '?').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">
                            {assignment.teacher_first_name} {assignment.teacher_last_name}
                          </p>
                          <p className="text-sm text-gray-500 font-medium mt-0.5">
                            {assignment.subject_name}
                            {assignment.subject_code && (
                              <span className="text-gray-300 font-mono text-xs ml-1.5">
                                ({assignment.subject_code})
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-300 font-medium">
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
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-200">
                  <UserCheck size={48} />
                  <p className="text-sm tracking-widest uppercase font-semibold text-gray-300">
                    No teachers assigned yet
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── FORM TEACHER ── */}
          {activeTab === 'form-teacher' && (
            <div className="max-w-2xl space-y-5">
              <div className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-blue-50 border border-blue-100">
                <UserCog size={17} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-700 mb-1">{formTeacherLabel} Role</p>
                  <p className="text-sm text-blue-500 leading-relaxed">
                    {['JUNIOR_SECONDARY', 'SENIOR_SECONDARY'].includes(
                      (classroom.education_level ?? '').toUpperCase(),
                    )
                      ? 'The form teacher oversees the welfare and activities of all students and subject teachers in this class. They may also teach a subject in the same class.'
                      : 'The class teacher is primarily responsible for the day-to-day welfare, attendance, and overall supervision of students in this classroom.'}
                  </p>
                </div>
              </div>

              {formTeacherSaveStatus !== 'idle' && (
                <div
                  className={`flex items-center gap-3 px-5 py-4 rounded-xl text-sm font-semibold ${
                    formTeacherSaveStatus === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}
                >
                  {formTeacherSaveStatus === 'success' ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  {formTeacherSaveMessage}
                </div>
              )}

              {/* Current assignment */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <BadgeCheck size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                      Currently Assigned
                    </span>
                  </div>
                  {!isEditingFormTeacher && (
                    <button
                      onClick={() => {
                        setIsEditingFormTeacher(true);
                        setSelectedTeacherId(classroom.class_teacher ?? '');
                        setFormTeacherSaveStatus('idle');
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      <Pencil size={12} />
                      {classroom.class_teacher ? 'Change' : 'Assign'}
                    </button>
                  )}
                </div>
                <div className="p-6">
                  {classroom.class_teacher_name ? (
                    <div className="flex items-start gap-6">
                      <div
                        className="w-20 h-20 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-3xl font-bold flex-shrink-0"
                        style={{ fontFamily: "'Cormorant Garamond', serif" }}
                      >
                        {getInitials(classroom.class_teacher_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-2xl font-bold text-gray-900 leading-tight"
                          style={{ fontFamily: "'Cormorant Garamond', serif" }}
                        >
                          {classroom.class_teacher_name}
                        </p>
                        <div className="mt-4 space-y-2.5">
                          {(classroom.class_teacher_employee_id || assignedTeacher?.employee_id) && (
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Hash size={12} className="text-gray-400" />
                              </div>
                              <span className="font-mono font-semibold">
                                {classroom.class_teacher_employee_id || assignedTeacher?.employee_id}
                              </span>
                            </div>
                          )}
                          {(classroom.class_teacher_phone || assignedTeacher?.phone_number) && (
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Phone size={12} className="text-gray-400" />
                              </div>
                              <span>
                                {classroom.class_teacher_phone || assignedTeacher?.phone_number}
                              </span>
                            </div>
                          )}
                          {assignedTeacher?.email && (
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Mail size={12} className="text-gray-400" />
                              </div>
                              <span className="truncate">{assignedTeacher.email}</span>
                            </div>
                          )}
                          {assignedTeacher && (
                            <div className="pt-1">
                              <span
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide ${
                                  assignedTeacher.is_active
                                    ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                                    : 'bg-red-50 text-red-500 ring-1 ring-red-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    assignedTeacher.is_active ? 'bg-emerald-500' : 'bg-red-400'
                                  }`}
                                />
                                {assignedTeacher.is_active ? 'Active teacher' : 'Inactive teacher'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
                        <UserCog size={32} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400 font-medium">
                        No {formTeacherLabel.toLowerCase()} assigned
                      </p>
                      <p className="text-xs text-gray-300 text-center max-w-xs">
                        Click "Assign" above to designate a{' '}
                        {formTeacherLabel.toLowerCase()} for this classroom.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Edit panel */}
              {isEditingFormTeacher && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 flex items-center gap-2.5 border-b border-gray-100 bg-gray-50">
                    <Pencil size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                      {classroom.class_teacher
                        ? `Change ${formTeacherLabel}`
                        : `Assign ${formTeacherLabel}`}
                    </span>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2.5 tracking-wide uppercase">
                        Select Teacher
                      </label>
                      <div className="relative">
                        <select
                          value={selectedTeacherId}
                          onChange={(e) =>
                            setSelectedTeacherId(
                              e.target.value === '' ? '' : Number(e.target.value),
                            )
                          }
                          className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 cursor-pointer transition-all"
                        >
                          <option value="">— Remove / Unassign —</option>
                          {teachers
                            .filter((t) => t.is_active)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.full_name || `${t.first_name} ${t.last_name}`} ·{' '}
                                {t.employee_id}
                                {t.id === classroom.class_teacher ? ' (current)' : ''}
                              </option>
                            ))}
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                        />
                      </div>
                      <p className="text-xs text-gray-300 mt-1.5">
                        Only active teachers are shown. Select "Remove" to unassign the current{' '}
                        {formTeacherLabel.toLowerCase()}.
                      </p>
                    </div>

                    {previewTeacher && (
                      <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {getInitials(
                            previewTeacher.full_name ||
                              `${previewTeacher.first_name} ${previewTeacher.last_name}`,
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">
                            {previewTeacher.full_name ||
                              `${previewTeacher.first_name} ${previewTeacher.last_name}`}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">
                            {previewTeacher.employee_id}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={() => {
                          setIsEditingFormTeacher(false);
                          setSelectedTeacherId(classroom.class_teacher ?? '');
                          setFormTeacherSaveStatus('idle');
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
                      >
                        <XCircle size={15} /> Cancel
                      </button>
                      <button
                        onClick={handleSaveFormTeacher}
                        disabled={savingFormTeacher}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                          savingFormTeacher
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                        }`}
                      >
                        {savingFormTeacher ? (
                          <>
                            <Loader2 size={15} className="animate-spin" /> Saving…
                          </>
                        ) : (
                          <>
                            <Save size={15} /> Save Assignment
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TIMETABLE ── */}
          {activeTab === 'timetable' && (
            <TimetableSection classroom={classroom} canEdit={canEditTimetable(user, classroom)} />
          )}
        </div>

        {/* Footer */}
        <div className="max-w-7xl mx-auto px-6 lg:px-10 pb-8">
          <p className="text-xs text-gray-300 font-medium">
            Last updated{' '}
            {new Date(classroom.updated_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>
    </>
  );
};

export default ClassroomDetailPage;