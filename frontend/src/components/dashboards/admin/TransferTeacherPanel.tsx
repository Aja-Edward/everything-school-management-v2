// TransferTeacherPanel.tsx
import React, { useState, useMemo } from 'react';
import {
  ArrowRightLeft, ChevronDown, CheckCircle2, AlertCircle,
  Loader2, User, BookOpen, X, Check,
} from 'lucide-react';
import { Classroom, ClassroomTeacherAssignment } from '@/types/classroomtypes';
import classroomService from '@/services/ClassroomService';

interface Props {
  classroom: Classroom;
  targetOptions: Classroom[];        // other active classrooms
  onComplete: () => void;            // called after successful transfer (refresh parent)
  onCancel: () => void;
}

type Step = 'select-teacher' | 'select-subjects' | 'select-destination' | 'confirm' | 'done';

interface TransferState {
  teacher: ClassroomTeacherAssignment | null;  // representative assignment row
  teacherId: number | null;
  teacherName: string;
  subjectIds: number[];
  targetClassroomId: number | '';
}

const EMPTY: TransferState = {
  teacher: null, teacherId: null, teacherName: '',
  subjectIds: [], targetClassroomId: '',
};

const TransferTeacherPanel: React.FC<Props> = ({
  classroom, targetOptions, onComplete, onCancel,
}) => {
  const [step, setStep] = useState<Step>('select-teacher');
  const [state, setState] = useState<TransferState>(EMPTY);
  const [transferring, setTransferring] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Group assignments by teacher
  const teacherMap = useMemo(() => {
    const map = new Map<number, { name: string; assignments: ClassroomTeacherAssignment[] }>();
    (classroom.teacher_assignments ?? []).forEach((a) => {
      if (!map.has(a.teacher)) {
        const name = `${a.teacher_first_name ?? ''} ${a.teacher_last_name ?? ''}`.trim();
        map.set(a.teacher, { name, assignments: [] });
      }
      map.get(a.teacher)!.assignments.push(a);
    });
    return map;
  }, [classroom.teacher_assignments]);

  const teacherList = Array.from(teacherMap.entries()).map(([id, v]) => ({ id, ...v }));

  // Teacher's subjects in this classroom
  const teacherSubjects = state.teacherId
    ? (teacherMap.get(state.teacherId)?.assignments ?? [])
    : [];

  const targetClassroom = targetOptions.find(
    (c) => c.id === state.targetClassroomId
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const selectTeacher = (id: number, name: string) => {
    setState({ ...EMPTY, teacherId: id, teacherName: name });
    setError(null);
    setStep('select-subjects');
  };

  const toggleSubject = (subjectId: number) => {
    setState((prev) => ({
      ...prev,
      subjectIds: prev.subjectIds.includes(subjectId)
        ? prev.subjectIds.filter((id) => id !== subjectId)
        : [...prev.subjectIds, subjectId],
    }));
  };

  const selectAll = () =>
    setState((prev) => ({
      ...prev,
      subjectIds: teacherSubjects.map((a) => a.subject),
    }));

  const handleConfirm = async () => {
    if (!state.teacherId || !state.targetClassroomId || state.subjectIds.length === 0) return;
    setTransferring(true);
    setError(null);
    try {
      const res = await classroomService.transferTeacher(classroom.id, {
        teacher_id: state.teacherId,
        target_classroom_id: Number(state.targetClassroomId),
        subject_ids: state.subjectIds,
      });
      setResult(res);
      setStep('done');
    } catch (err: any) {
      setError(
        err?.response?.data?.error ??
        err?.message ??
        'Transfer failed. Please try again.'
      );
    } finally {
      setTransferring(false);
    }
  };

  // ── Step renderers ────────────────────────────────────────────────────────

  const renderSelectTeacher = () => (
    <div className="space-y-3">
      <p className="text-xs font-bold tracking-[0.14em] uppercase text-gray-400 mb-4">
        Step 1 — Choose a teacher to transfer
      </p>
      {teacherList.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">No teachers assigned to this classroom.</p>
      )}
      {teacherList.map(({ id, name, assignments }) => (
        <button
          key={id}
          onClick={() => selectTeacher(id, name)}
          className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 hover:border-gray-300 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">{name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {assignments.length} subject{assignments.length !== 1 ? 's' : ''} ·{' '}
              {assignments.map((a) => a.subject_name).join(', ')}
            </p>
          </div>
          <ArrowRightLeft size={14} className="text-gray-300 group-hover:text-gray-600 transition-colors flex-shrink-0" />
        </button>
      ))}
    </div>
  );

  const renderSelectSubjects = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-[0.14em] uppercase text-gray-400">
          Step 2 — Select subjects to transfer
        </p>
        <button
          onClick={selectAll}
          className="text-xs font-bold text-blue-500 hover:text-blue-700 transition-colors"
        >
          Select all
        </button>
      </div>

      {/* Teacher badge */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl">
        <User size={14} className="text-white/60 flex-shrink-0" />
        <span className="text-sm font-bold text-white">{state.teacherName}</span>
        <span className="ml-auto text-xs text-white/40">{classroom.name}</span>
      </div>

      <div className="space-y-2">
        {teacherSubjects.map((a) => {
          const selected = state.subjectIds.includes(a.subject);
          return (
            <button
              key={a.subject}
              onClick={() => toggleSubject(a.subject)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                selected
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-gray-50 border-gray-100 text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
                {selected && <Check size={11} className="text-white" />}
              </div>
              <BookOpen size={13} className="flex-shrink-0 opacity-60" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold">{a.subject_name}</span>
                {a.subject_code && (
                  <span className="text-xs font-mono ml-2 opacity-50">({a.subject_code})</span>
                )}
              </div>
              <span className="text-xs opacity-40">{a.periods_per_week}×/wk</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => { setState(EMPTY); setStep('select-teacher'); }}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
        >
          Back
        </button>
        <button
          disabled={state.subjectIds.length === 0}
          onClick={() => setStep('select-destination')}
          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            state.subjectIds.length === 0
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
          }`}
        >
          Continue with {state.subjectIds.length} subject{state.subjectIds.length !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );

  const renderSelectDestination = () => (
    <div className="space-y-4">
      <p className="text-xs font-bold tracking-[0.14em] uppercase text-gray-400">
        Step 3 — Choose destination classroom
      </p>

      <div className="relative">
        <select
          value={state.targetClassroomId}
          onChange={(e) =>
            setState((prev) => ({
              ...prev,
              targetClassroomId: e.target.value === '' ? '' : Number(e.target.value),
            }))
          }
          className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 text-sm text-gray-700 bg-white outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/5 transition-all"
        >
          <option value="">Select destination classroom…</option>
          {targetOptions.map((c) => (
            <option key={c.id} value={c.id} disabled={c.is_full ?? false}>
              {c.name} — {c.grade_level_name}
              {c.is_full ? ' (Full)' : c.available_spots != null ? ` (${c.available_spots} spots)` : ''}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      {/* Summary card */}
      {state.targetClassroomId !== '' && targetClassroom && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Transfer Summary</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Teacher</span>
            <span className="font-semibold text-gray-800">{state.teacherName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">From</span>
            <span className="font-semibold text-gray-800">{classroom.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">To</span>
            <span className="font-semibold text-gray-800">{targetClassroom.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subjects</span>
            <span className="font-semibold text-gray-800">
              {state.subjectIds.length} selected
            </span>
          </div>
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              {teacherSubjects
                .filter((a) => state.subjectIds.includes(a.subject))
                .map((a) => a.subject_name)
                .join(' · ')}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-semibold">
          <AlertCircle size={15} className="flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => { setError(null); setStep('select-subjects'); }}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
        >
          Back
        </button>
        <button
          disabled={state.targetClassroomId === '' || transferring}
          onClick={handleConfirm}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            state.targetClassroomId === '' || transferring
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
          }`}
        >
          {transferring ? (
            <><Loader2 size={14} className="animate-spin" /> Transferring…</>
          ) : (
            <><ArrowRightLeft size={14} /> Confirm Transfer</>
          )}
        </button>
      </div>
    </div>
  );

  const renderDone = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-emerald-50 border border-emerald-200">
        <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-800">{result?.message}</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            {result?.from_classroom} → {result?.to_classroom}
          </p>
        </div>
      </div>

      {result?.transferred?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Transferred ({result.transferred_count})
          </p>
          {result.transferred.map((t: any) => (
            <div key={t.subject_id} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
              <Check size={12} className="text-emerald-600 flex-shrink-0" />
              <span className="text-sm text-emerald-800 font-medium">{t.subject_name}</span>
            </div>
          ))}
        </div>
      )}

      {result?.skipped?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Skipped ({result.skipped_count}) — conflicts in target
          </p>
          {result.skipped.map((s: any) => (
            <div key={s.subject_id} className="flex items-start gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
              <AlertCircle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-800 font-medium">{s.subject_name}</p>
                <p className="text-xs text-amber-600">{s.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => { setState(EMPTY); setStep('select-teacher'); setResult(null); onComplete(); }}
        className="w-full px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 transition-all"
      >
        Done
      </button>
    </div>
  );

  // ── Step indicator ────────────────────────────────────────────────────────

  const STEPS = ['select-teacher', 'select-subjects', 'select-destination'] as const;
  const stepIdx = STEPS.indexOf(step as any);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ArrowRightLeft size={14} className="text-gray-400" />
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">
            Transfer Teacher
          </span>
        </div>
        <button
          onClick={onCancel}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-700 hover:bg-gray-100 transition-all"
        >
          <X size={14} />
        </button>
      </div>

      {/* Step dots */}
      {step !== 'done' && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`w-2 h-2 rounded-full transition-all ${
                i < stepIdx ? 'bg-gray-900' :
                i === stepIdx ? 'bg-blue-600 ring-4 ring-blue-100' :
                'bg-gray-200'
              }`} />
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px transition-all ${i < stepIdx ? 'bg-gray-900' : 'bg-gray-100'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="p-6">
        {step === 'select-teacher' && renderSelectTeacher()}
        {step === 'select-subjects' && renderSelectSubjects()}
        {step === 'select-destination' && renderSelectDestination()}
        {step === 'done' && renderDone()}
      </div>
    </div>
  );
};

export default TransferTeacherPanel;