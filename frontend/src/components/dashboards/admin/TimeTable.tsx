import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit3, X, Save, Loader2, AlertCircle,
  CheckCircle2, Clock, Coffee, Settings, ChevronDown,
  Calendar, BookOpen,
} from 'lucide-react';
import { Classroom, ClassroomTeacherAssignment } from '@/types/classroomtypes';
import classroomService from '@/services/ClassroomService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Period {
  id: string;           // local id for UI (e.g. 'p1', 'break1')
  label: string;        // e.g. "Period 1", "Lunch Break"
  start_time: string;   // "08:00"
  end_time: string;     // "08:40"
  is_break: boolean;
  order: number;
}

interface TimetableSlot {
  id?: number;          // backend id (undefined = not yet saved)
  period_number: number; // maps to Period.order
  day_of_week: string;   // "monday" | "tuesday" | ...
  subject_id: number;
  subject_name: string;
  subject_code?: string;
  teacher_id: number;
  teacher_name: string;
  start_time: string;
  end_time: string;
}

interface SlotForm {
  subject_id: number | '';
  teacher_id: number | '';
}

interface TimetableTabProps {
  classroom: Classroom;
  canEdit: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { key: 'monday',    label: 'Mon' },
  { key: 'tuesday',   label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday',  label: 'Thu' },
  { key: 'friday',    label: 'Fri' },
];

const DAY_COLORS: Record<string, string> = {
  monday:    'bg-blue-50 border-blue-200 text-blue-700',
  tuesday:   'bg-violet-50 border-violet-200 text-violet-700',
  wednesday: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  thursday:  'bg-amber-50 border-amber-200 text-amber-700',
  friday:    'bg-rose-50 border-rose-200 text-rose-700',
};

const DAY_ACCENT: Record<string, string> = {
  monday:    'bg-blue-600',
  tuesday:   'bg-violet-600',
  wednesday: 'bg-emerald-600',
  thursday:  'bg-amber-500',
  friday:    'bg-rose-600',
};

// localStorage key per classroom
const storageKey = (classroomId: number) => `timetable_periods_${classroomId}`;

// Default period template
const defaultPeriods = (): Period[] => [
  { id: 'p1',    label: 'Period 1',    start_time: '08:00', end_time: '08:40', is_break: false, order: 1 },
  { id: 'p2',    label: 'Period 2',    start_time: '08:40', end_time: '09:20', is_break: false, order: 2 },
  { id: 'p3',    label: 'Period 3',    start_time: '09:20', end_time: '10:00', is_break: false, order: 3 },
  { id: 'brk1',  label: 'Short Break', start_time: '10:00', end_time: '10:20', is_break: true,  order: 4 },
  { id: 'p4',    label: 'Period 4',    start_time: '10:20', end_time: '11:00', is_break: false, order: 5 },
  { id: 'p5',    label: 'Period 5',    start_time: '11:00', end_time: '11:40', is_break: false, order: 6 },
  { id: 'p6',    label: 'Period 6',    start_time: '11:40', end_time: '12:20', is_break: false, order: 7 },
  { id: 'brk2',  label: 'Lunch Break', start_time: '12:20', end_time: '13:00', is_break: true,  order: 8 },
  { id: 'p7',    label: 'Period 7',    start_time: '13:00', end_time: '13:40', is_break: false, order: 9 },
  { id: 'p8',    label: 'Period 8',    start_time: '13:40', end_time: '14:20', is_break: false, order: 10 },
];

// ─── Component ────────────────────────────────────────────────────────────────

const TimetableTab: React.FC<TimetableTabProps> = ({ classroom, canEdit }) => {

  // ── Period config state ────────────────────────────────────────────────────
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showPeriodConfig, setShowPeriodConfig] = useState(false);
  const [editingPeriods, setEditingPeriods] = useState<Period[]>([]);

  // ── Timetable slot state ───────────────────────────────────────────────────
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);

  // ── Slot editing state ─────────────────────────────────────────────────────
  const [activeCell, setActiveCell] = useState<{ period: Period; day: string } | null>(null);
  const [slotForm, setSlotForm] = useState<SlotForm>({ subject_id: '', teacher_id: '' });
  const [savingSlot, setSavingSlot] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState<number | null>(null);
  const [slotStatus, setSlotStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [slotStatusMsg, setSlotStatusMsg] = useState('');

  // ── Classroom teacher assignments ──────────────────────────────────────────
  const assignments: ClassroomTeacherAssignment[] = classroom.teacher_assignments ?? [];

  // Unique teachers in this classroom
  const classroomTeachers = React.useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    assignments.forEach(a => {
      if (!map.has(a.teacher)) {
        map.set(a.teacher, {
          id: a.teacher,
          name: `${a.teacher_first_name ?? ''} ${a.teacher_last_name ?? ''}`.trim(),
        });
      }
    });
    return Array.from(map.values());
  }, [assignments]);

  // Subjects for selected teacher
  const subjectsForTeacher = React.useMemo(() => {
    if (!slotForm.teacher_id) return [];
    return assignments
      .filter(a => a.teacher === Number(slotForm.teacher_id))
      .map(a => ({ id: a.subject, name: a.subject_name ?? '', code: a.subject_code }));
  }, [assignments, slotForm.teacher_id]);

  // ── Load periods from localStorage ────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(storageKey(classroom.id));
    if (saved) {
      try { setPeriods(JSON.parse(saved)); } catch { setPeriods(defaultPeriods()); }
    } else {
      setPeriods(defaultPeriods());
    }
  }, [classroom.id]);

  // ── Load slots from backend ────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    setSlotError(null);
    try {
      const res = await classroomService.getWeeklySchedule({ classroom: classroom.id });
      const raw: any[] = Array.isArray(res) ? res : (res as any)?.results ?? [];
      const mapped: TimetableSlot[] = raw.map((s: any) => ({
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
      }));
      setSlots(mapped);
    } catch (err: any) {
      setSlotError(err?.message ?? 'Failed to load timetable');
    } finally {
      setLoadingSlots(false);
    }
  }, [classroom.id]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getSlot = (period: Period, day: string) =>
    slots.find(s => s.period_number === period.order && s.day_of_week === day);

  const openCell = (period: Period, day: string) => {
    if (!canEdit || period.is_break) return;
    const existing = getSlot(period, day);
    setSlotForm({
      teacher_id: existing?.teacher_id ?? '',
      subject_id: existing?.subject_id ?? '',
    });
    setActiveCell({ period, day });
    setSlotStatus('idle');
  };

  const closeCell = () => {
    setActiveCell(null);
    setSlotForm({ subject_id: '', teacher_id: '' });
    setSlotStatus('idle');
  };

  // ── Save slot ──────────────────────────────────────────────────────────────
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

  // ── Delete slot ────────────────────────────────────────────────────────────
  const handleDeleteSlot = async (slot: TimetableSlot) => {
    if (!slot.id) return;
    setDeletingSlotId(slot.id);
    try {
      await classroomService.deleteClassSchedule(slot.id);
      setSlots(prev => prev.filter(s => s.id !== slot.id));
      closeCell();
    } catch (err: any) {
      setSlotStatus('error');
      setSlotStatusMsg(err?.message ?? 'Failed to delete slot.');
    } finally {
      setDeletingSlotId(null);
    }
  };

  // ── Period config helpers ──────────────────────────────────────────────────
  const openPeriodConfig = () => {
    setEditingPeriods(periods.map(p => ({ ...p })));
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
    const newP: Period = {
      id:         `p_${Date.now()}`,
      label:      isBreak ? 'Break' : `Period ${editingPeriods.filter(p => !p.is_break).length + 1}`,
      start_time: '08:00',
      end_time:   '08:40',
      is_break:   isBreak,
      order:      maxOrder + 1,
    };
    setEditingPeriods(prev => [...prev, newP]);
  };

  const removePeriod = (id: string) =>
    setEditingPeriods(prev => prev.filter(p => p.id !== id));

  const updatePeriodField = (id: string, field: keyof Period, value: any) =>
    setEditingPeriods(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));

  // ── Empty state ────────────────────────────────────────────────────────────
  if (periods.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Calendar size={28} className="text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-400">No periods configured</p>
        {canEdit && (
          <button
            onClick={openPeriodConfig}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 transition-all"
          >
            <Settings size={14} /> Configure Periods
          </button>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Weekly Timetable
          </p>
          <p className="text-[11px] text-gray-300 mt-0.5">
            {periods.filter(p => !p.is_break).length} periods · {periods.filter(p => p.is_break).length} breaks
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button
              onClick={openPeriodConfig}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all"
            >
              <Settings size={13} /> Configure Periods
            </button>
          )}
          <button
            onClick={loadSlots}
            disabled={loadingSlots}
            className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-300 transition-all disabled:opacity-30"
          >
            <Loader2 size={13} className={loadingSlots ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {slotError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs font-semibold">
          <AlertCircle size={14} /> {slotError}
        </div>
      )}

      {/* ── Timetable Grid ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100">
                {/* Period column header */}
                <th className="px-4 py-3 text-left bg-gray-50 border-r border-gray-100 w-36">
                  <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-gray-400">Period</span>
                </th>
                {DAYS.map(day => (
                  <th key={day.key} className="px-3 py-3 bg-gray-50 border-r border-gray-100 last:border-r-0">
                    <div className={`inline-flex items-center justify-center w-full py-1.5 px-3 rounded-lg text-[11px] font-bold tracking-wide ${DAY_COLORS[day.key]}`}>
                      {day.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((period, idx) => (
                <tr
                  key={period.id}
                  className={`border-b border-gray-50 last:border-b-0 ${period.is_break ? 'bg-amber-50/40' : ''}`}
                >
                  {/* Period label */}
                  <td className="px-4 py-2.5 border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      {period.is_break
                        ? <Coffee size={12} className="text-amber-400 flex-shrink-0" />
                        : <div className={`w-1.5 h-6 rounded-full flex-shrink-0 ${Object.values(DAY_ACCENT)[idx % 5]}`} />
                      }
                      <div>
                        <p className={`text-[11px] font-bold ${period.is_break ? 'text-amber-600' : 'text-gray-700'}`}>
                          {period.label}
                        </p>
                        <p className="text-[10px] text-gray-300 font-mono">
                          {period.start_time} – {period.end_time}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Day cells */}
                  {DAYS.map(day => {
                    const slot = getSlot(period, day.key);
                    const isActive = activeCell?.period.id === period.id && activeCell?.day === day.key;

                    if (period.is_break) {
                      return (
                        <td key={day.key} className="px-3 py-2 border-r border-gray-50 last:border-r-0">
                          <div className="flex items-center justify-center py-1">
                            <span className="text-[10px] text-amber-400 font-semibold italic">break</span>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={day.key} className="px-2 py-2 border-r border-gray-50 last:border-r-0">
                        {slot ? (
                          /* Filled slot */
                          <button
                            onClick={() => openCell(period, day.key)}
                            disabled={!canEdit}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all duration-150 group ${
                              isActive
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : `${DAY_COLORS[day.key]} hover:shadow-sm`
                            } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            <p className={`text-[11px] font-bold leading-tight truncate ${isActive ? 'text-white' : ''}`}>
                              {slot.subject_name}
                            </p>
                            {slot.subject_code && (
                              <p className={`text-[9px] font-mono mt-0.5 ${isActive ? 'text-white/60' : 'opacity-60'}`}>
                                {slot.subject_code}
                              </p>
                            )}
                            <p className={`text-[10px] mt-1 truncate ${isActive ? 'text-white/70' : 'opacity-70'}`}>
                              {slot.teacher_name}
                            </p>
                          </button>
                        ) : (
                          /* Empty slot */
                          canEdit ? (
                            <button
                              onClick={() => openCell(period, day.key)}
                              className="w-full h-full min-h-[60px] rounded-xl border-2 border-dashed border-gray-150 hover:border-gray-300 hover:bg-gray-50 transition-all duration-150 flex items-center justify-center group"
                            >
                              <Plus size={14} className="text-gray-200 group-hover:text-gray-400 transition-colors" />
                            </button>
                          ) : (
                            <div className="min-h-[60px] rounded-xl bg-gray-50/50" />
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Slot Edit Panel (inline below grid) ── */}
      {activeCell && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2.5">
              <BookOpen size={13} className="text-gray-400" />
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
                {activeCell.day.charAt(0).toUpperCase() + activeCell.day.slice(1)} · {activeCell.period.label}
                <span className="ml-2 font-mono text-gray-300">
                  {activeCell.period.start_time}–{activeCell.period.end_time}
                </span>
              </span>
            </div>
            <button onClick={closeCell} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-900 hover:bg-gray-100 transition-all">
              <X size={14} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Status banner */}
            {slotStatus !== 'idle' && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold ${
                slotStatus === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-600'
              }`}>
                {slotStatus === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {slotStatusMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Teacher select */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
                  Teacher
                </label>
                <div className="relative">
                  <select
                    value={slotForm.teacher_id}
                    onChange={e => setSlotForm({ teacher_id: e.target.value === '' ? '' : Number(e.target.value), subject_id: '' })}
                    className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 cursor-pointer transition-all"
                  >
                    <option value="">Select teacher…</option>
                    {classroomTeachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {classroomTeachers.length === 0 && (
                  <p className="text-[11px] text-red-400 mt-1">No teachers assigned to this classroom yet.</p>
                )}
              </div>

              {/* Subject select */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
                  Subject
                </label>
                <div className="relative">
                  <select
                    value={slotForm.subject_id}
                    onChange={e => setSlotForm(prev => ({ ...prev, subject_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                    disabled={!slotForm.teacher_id}
                    className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">Select subject…</option>
                    {subjectsForTeacher.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.code ? ` (${s.code})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {slotForm.teacher_id && subjectsForTeacher.length === 0 && (
                  <p className="text-[11px] text-red-400 mt-1">This teacher has no subjects assigned to this classroom.</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              {/* Delete button — only if slot exists */}
              {getSlot(activeCell.period, activeCell.day)?.id && (
                <button
                  onClick={() => handleDeleteSlot(getSlot(activeCell.period, activeCell.day)!)}
                  disabled={deletingSlotId !== null}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-bold hover:bg-red-50 transition-all disabled:opacity-40"
                >
                  {deletingSlotId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Remove
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={closeCell}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSlot}
                disabled={!slotForm.teacher_id || !slotForm.subject_id || savingSlot}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  !slotForm.teacher_id || !slotForm.subject_id || savingSlot
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                }`}
              >
                {savingSlot
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : <><Save size={14} /> Save Slot</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          PERIOD CONFIG MODAL
      ══════════════════════════════════ */}
      {showPeriodConfig && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,15,20,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={e => e.target === e.currentTarget && setShowPeriodConfig(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Clock size={15} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-700">Configure Periods</span>
              </div>
              <button onClick={() => setShowPeriodConfig(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-gray-900 hover:bg-gray-100 transition-all">
                <X size={15} />
              </button>
            </div>

            {/* Period list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {editingPeriods
                .sort((a, b) => a.order - b.order)
                .map((period, idx) => (
                  <div
                    key={period.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      period.is_break ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    {/* Order badge */}
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      period.is_break ? 'bg-amber-200 text-amber-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {idx + 1}
                    </div>

                    {/* Break indicator */}
                    {period.is_break && <Coffee size={13} className="text-amber-400 flex-shrink-0" />}

                    {/* Label */}
                    <input
                      type="text"
                      value={period.label}
                      onChange={e => updatePeriodField(period.id, 'label', e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white outline-none focus:border-gray-900 transition-all"
                      placeholder="Label"
                    />

                    {/* Start time */}
                    <input
                      type="time"
                      value={period.start_time}
                      onChange={e => updatePeriodField(period.id, 'start_time', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 bg-white outline-none focus:border-gray-900 transition-all w-24"
                    />
                    <span className="text-gray-300 text-xs">–</span>
                    {/* End time */}
                    <input
                      type="time"
                      value={period.end_time}
                      onChange={e => updatePeriodField(period.id, 'end_time', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 bg-white outline-none focus:border-gray-900 transition-all w-24"
                    />

                    {/* Break toggle */}
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

                    {/* Remove */}
                    <button
                      onClick={() => removePeriod(period.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
            </div>

            {/* Footer actions */}
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

export default TimetableTab;