/**
 * ComponentScoreRecordingModal — Premium Redesign
 *
 * All backend logic, service calls, hooks, and state management
 * are identical to the original. Only the JSX/styling layer has
 * been replaced with a premium design system.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, CheckCircle2, AlertCircle, Clock, ChevronRight,
  Users, Save, RefreshCw, Info, ClipboardList,
} from 'lucide-react';
import ResultService from '@/services/ResultService';
import type {
  EducationLevelType, AssessmentComponentInfo,
  ExamSession, BulkComponentScoreEntry,
} from '@/services/ResultService';
import ClassroomService from '@/services/ClassroomService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  subject_id: number;
  subject_name: string;
  subject_code: string;
  classroom_id?: number | null;
  classroom_name: string;
  education_level?: string;
}

interface StudentRow {
  id: string;
  full_name: string;
  admission_number: string;
  existingScores: Record<number, number>;
  resultId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  assignments: Assignment[];
}

// ─── Component status helper ──────────────────────────────────────────────────

type ComponentStatus = 'complete' | 'partial' | 'empty';

function componentStatus(
  componentId: number,
  students: StudentRow[],
): ComponentStatus {
  if (students.length === 0) return 'empty';
  const recorded = students.filter(s => (s.existingScores[componentId] ?? 0) > 0).length;
  if (recorded === 0) return 'empty';
  if (recorded < students.length) return 'partial';
  return 'complete';
}

// ─── Design tokens (Tailwind-compatible class helpers) ────────────────────────

const pillClasses = (status: ComponentStatus, isActive: boolean) => {
  if (isActive)
    return 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200';
  if (status === 'complete')
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300';
  if (status === 'partial')
    return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300';
  return 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700';
};

const dotClasses = (status: ComponentStatus, isActive: boolean) => {
  if (isActive) return 'bg-white/50';
  if (status === 'complete') return 'bg-emerald-500';
  if (status === 'partial') return 'bg-amber-500';
  return 'bg-gray-300 dark:bg-gray-600';
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const ComponentScoreRecordingModal: React.FC<Props> = ({ open, onClose, assignments }) => {

  // ── Selectors ──────────────────────────────────────────────────────────────
  const [selectedSubjectId,   setSelectedSubjectId]   = useState<number>(0);
  const [selectedClassroomId, setSelectedClassroomId] = useState<number>(0);
  const [selectedSessionId,   setSelectedSessionId]   = useState<string>('');
  const [selectedComponentId, setSelectedComponentId] = useState<number>(0);

  // ── Reference data ─────────────────────────────────────────────────────────
  const [examSessions,         setExamSessions]         = useState<ExamSession[]>([]);
  const [assessmentComponents, setAssessmentComponents] = useState<AssessmentComponentInfo[]>([]);
  const [students,             setStudents]             = useState<StudentRow[]>([]);

  // ── Entry state ────────────────────────────────────────────────────────────
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [loadingStudents,   setLoadingStudents]   = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [saveMsg,           setSaveMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [validationErrors,  setValidationErrors]  = useState<Record<string, string>>({});

  // ── Derived ────────────────────────────────────────────────────────────────

  const subjects = useMemo(() => {
    const seen = new Set<number>();
    return assignments.filter(a => {
      if (seen.has(a.subject_id)) return false;
      seen.add(a.subject_id);
      return true;
    });
  }, [assignments]);

  const classroomsForSubject = useMemo(() =>
    assignments
      .filter(a => a.subject_id === selectedSubjectId && a.classroom_id)
      .map(a => ({ id: a.classroom_id!, name: a.classroom_name })),
  [assignments, selectedSubjectId]);

  const educationLevel = useMemo(() => {
    const a = assignments.find(
      a => a.subject_id === selectedSubjectId && a.classroom_id === selectedClassroomId
    );
    return a?.education_level as EducationLevelType | undefined;
  }, [assignments, selectedSubjectId, selectedClassroomId]);

  const teacherEducationLevels = useMemo(() => {
    const levels = new Set<string>();
    assignments.forEach(a => { if (a.education_level) levels.add(a.education_level); });
    return levels;
  }, [assignments]);

  const activeComponent = useMemo(
    () => assessmentComponents.find(c => c.id === selectedComponentId),
    [assessmentComponents, selectedComponentId]
  );

  const maxScore = activeComponent ? parseFloat(activeComponent.max_score) : 0;

  // ── Effects (all identical to original) ───────────────────────────────────

  useEffect(() => {
    if (!open) return;
    ResultService.getExamSessions().then(setExamSessions).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedSubjectId(subjects[0]?.subject_id ?? 0);
    setSelectedComponentId(0);
    setScoreInputs({});
    setSaveMsg(null);
  }, [open]);

  useEffect(() => {
    setSelectedClassroomId(classroomsForSubject[0]?.id ?? 0);
    setSelectedComponentId(0);
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!educationLevel) return;
    setLoadingComponents(true);
    ResultService.getAssessmentComponents({ is_active: true, page_size: 50 })
      .then(all => {
        const filtered = all.filter(c => {
          const levelType = c.education_level_detail?.level_type;
          if (!levelType) return c.is_active !== false;
          return teacherEducationLevels.has(levelType);
        });
        const sorted = filtered.sort((a, b) => a.display_order - b.display_order);
        setAssessmentComponents(sorted);
        if (sorted.length > 0 && !selectedComponentId) {
          setSelectedComponentId(sorted[0].id);
        }
      })
      .catch(() => setAssessmentComponents([]))
      .finally(() => setLoadingComponents(false));
  }, [educationLevel, teacherEducationLevels]);

  // Re-select the first component whenever selectedComponentId is reset to 0
  // (e.g. when the modal re-opens with the same education level)
  useEffect(() => {
    if (!selectedComponentId && assessmentComponents.length > 0) {
      setSelectedComponentId(assessmentComponents[0].id);
    }
  }, [selectedComponentId, assessmentComponents]);

  const loadStudentsAndScores = useCallback(async () => {
    if (!selectedClassroomId || !selectedSessionId || !selectedSubjectId || !educationLevel) return;
    setLoadingStudents(true);
    try {
      const studentsRaw: any[] = await ClassroomService.getClassroomStudents(selectedClassroomId)
        .then((r: any) => Array.isArray(r) ? r : r?.results ?? []);

      const existingResults = await ResultService.getSubjectResults(educationLevel, {
        exam_session: selectedSessionId,
        subject:      selectedSubjectId,
        page_size:    200,
      } as any);

      const resultByStudent = new Map<string, any>();
      existingResults.forEach((r: any) => {
        const sid = String(r.student?.id ?? r.student_id ?? '');
        if (sid) resultByStudent.set(sid, r);
      });

      const rows: StudentRow[] = studentsRaw.map((s: any) => {
        const sid      = String(s.id ?? s.student_id ?? '');
        const existing = resultByStudent.get(sid);
        const scores: Record<number, number> = {};
        if (existing?.component_scores) {
          existing.component_scores.forEach((cs: any) => {
            scores[cs.component] = parseFloat(cs.score ?? '0');
          });
        }
        return {
          id:               sid,
          full_name:        s.full_name ?? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
          admission_number: s.admission_number ?? s.username ?? '—',
          existingScores:   scores,
          resultId:         existing?.id,
        };
      });

      setStudents(rows);
      const inputs: Record<string, string> = {};
      rows.forEach(r => {
        if (selectedComponentId && r.existingScores[selectedComponentId] !== undefined) {
          inputs[r.id] = String(r.existingScores[selectedComponentId] || '');
        }
      });
      setScoreInputs(inputs);
    } catch {
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedClassroomId, selectedSessionId, selectedSubjectId, educationLevel, selectedComponentId]);

  useEffect(() => { loadStudentsAndScores(); }, [loadStudentsAndScores]);

  useEffect(() => {
    if (!selectedComponentId) return;
    const inputs: Record<string, string> = {};
    students.forEach(s => {
      const existing = s.existingScores[selectedComponentId];
      inputs[s.id] = existing !== undefined ? String(existing || '') : '';
    });
    setScoreInputs(inputs);
    setValidationErrors({});
    setSaveMsg(null);
  }, [selectedComponentId, students]);

  // ── Handlers (identical to original) ──────────────────────────────────────

  const handleScoreChange = (studentId: string, raw: string) => {
    setScoreInputs(prev => ({ ...prev, [studentId]: raw }));
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  };

  const handleSave = async () => {
    if (!activeComponent || !selectedSessionId || !educationLevel) return;

    const errors: Record<string, string> = {};
    students.forEach(s => {
      const raw = scoreInputs[s.id];
      if (raw === '' || raw === undefined) return;
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0) {
        errors[s.id] = 'Must be ≥ 0';
      } else if (n > maxScore) {
        errors[s.id] = `Max is ${maxScore}`;
      }
    });
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSaving(true);
    setSaveMsg(null);
    try {
      const entries: BulkComponentScoreEntry[] = students
        .filter(s => scoreInputs[s.id] !== '' && scoreInputs[s.id] !== undefined)
        .map(s => ({
          student:      s.id,
          subject:      selectedSubjectId,
          exam_session: selectedSessionId,
          scores:       [{ component_id: activeComponent.id, score: parseFloat(scoreInputs[s.id] || '0') }],
        }));

      if (entries.length === 0) {
        setSaveMsg({ ok: false, text: 'No scores entered. Enter at least one score to save.' });
        return;
      }

      await ResultService.bulkRecordComponentScores(educationLevel, entries);
      setSaveMsg({ ok: true, text: `${entries.length} score(s) saved for "${activeComponent.name}".` });
      await loadStudentsAndScores();
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e?.message || 'Save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!open) return null;

  const canLoad = !!selectedClassroomId && !!selectedSessionId && !!selectedSubjectId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="bg-white dark:bg-gray-950 rounded-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.06)' }}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex-shrink-0">
              <ClipboardList size={17} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white tracking-tight">
                Record Component Scores
              </h2>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5 font-normal">
                Record one component at a time — saved scores are preserved automatically
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Selectors ── */}
        <div className="px-7 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 flex-shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: 'Subject',
                value: selectedSubjectId,
                onChange: (v: string) => setSelectedSubjectId(Number(v)),
                disabled: false,
                options: [
                  <option key={0} value={0}>Select subject…</option>,
                  ...subjects.map(s => (
                    <option key={s.subject_id} value={s.subject_id}>
                      {s.subject_name} ({s.subject_code})
                    </option>
                  )),
                ],
              },
              {
                label: 'Class',
                value: selectedClassroomId,
                onChange: (v: string) => setSelectedClassroomId(Number(v)),
                disabled: !selectedSubjectId,
                options: [
                  <option key={0} value={0}>Select class…</option>,
                  ...classroomsForSubject.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  )),
                ],
              },
              {
                label: 'Exam Session',
                value: selectedSessionId,
                onChange: (v: string) => setSelectedSessionId(v),
                disabled: false,
                options: [
                  <option key="" value="">Select session…</option>,
                  ...examSessions.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  )),
                ],
              },
            ].map(({ label, value, onChange, disabled, options }) => (
              <div key={label}>
                <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                  {label}
                </label>
                <select
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  disabled={disabled}
                  className="w-full h-9 border border-gray-200 dark:border-gray-700 rounded-lg px-3 text-[13.5px] font-medium text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    paddingRight: '32px',
                  }}
                >
                  {options}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* ── Component Pills ── */}
        {assessmentComponents.length > 0 && canLoad && !loadingStudents && (
          <div className="px-7 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              Assessment Components — click to record
            </p>
            <div className="flex flex-wrap gap-2">
              {assessmentComponents.map(comp => {
                const st       = componentStatus(comp.id, students);
                const recorded = students.filter(s => (s.existingScores[comp.id] ?? 0) > 0).length;
                const isActive = comp.id === selectedComponentId;
                return (
                  <button
                    key={comp.id}
                    onClick={() => setSelectedComponentId(comp.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[12.5px] font-medium transition-all duration-150 ${pillClasses(st, isActive)}`}
                  >
                    {/* Status dot */}
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClasses(st, isActive)}`} />

                    {comp.name}

                    <span className={`text-[11px] font-normal tabular-nums ${isActive ? 'text-white/70' : 'text-current opacity-50'}`}>
                      {comp.max_score}pts
                    </span>

                    {!isActive && (
                      <span className={`text-[11px] font-normal tabular-nums ${
                        st === 'complete' ? 'text-emerald-500'
                        : st === 'partial' ? 'text-amber-500'
                        : 'text-gray-400'
                      }`}>
                        {recorded}/{students.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Active Component Banner ── */}
        {activeComponent && canLoad && (
          <div className="px-7 py-3 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">
                Recording
              </span>
              <span className="text-[13.5px] font-semibold text-indigo-700 dark:text-indigo-300">
                {activeComponent.name}
              </span>
              <span className="text-[12px] text-indigo-400 dark:text-indigo-500">
                · max {activeComponent.max_score} pts
                {activeComponent.contributes_to_ca ? ' · counts as CA' : ''}
              </span>
            </div>
            <button
              onClick={loadStudentsAndScores}
              disabled={loadingStudents}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-transparent transition-all disabled:opacity-50"
            >
              <RefreshCw size={11} className={loadingStudents ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Not ready */}
          {!canLoad && (
            <div className="flex flex-col items-center justify-center h-52 gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Info size={22} className="text-gray-400" />
              </div>
              <p className="text-[13px] text-gray-400 dark:text-gray-500">
                Select subject, class, and exam session to begin
              </p>
            </div>
          )}

          {/* Loading */}
          {canLoad && loadingStudents && (
            <div className="flex items-center justify-center h-52 gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              <span className="text-[13px] text-gray-400">Loading students…</span>
            </div>
          )}

          {/* No component selected */}
          {canLoad && !loadingStudents && !selectedComponentId && (
            <div className="flex flex-col items-center justify-center h-52 gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Clock size={22} className="text-gray-400" />
              </div>
              <p className="text-[13px] text-gray-400 dark:text-gray-500">
                Select a component above to start recording
              </p>
            </div>
          )}

          {/* No students */}
          {canLoad && !loadingStudents && !!selectedComponentId && students.length === 0 && (
            <div className="flex flex-col items-center justify-center h-52 gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Users size={22} className="text-gray-400" />
              </div>
              <p className="text-[13px] text-gray-400 dark:text-gray-500">
                No students found in this class
              </p>
            </div>
          )}

          {/* Student table */}
          {canLoad && !loadingStudents && !!selectedComponentId && students.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="px-5 py-3 text-left w-10">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">#</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</span>
                  </th>
                  <th className="px-4 py-3 text-left w-32">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Adm. No.</span>
                  </th>
                  {/* Other recorded components — read-only context */}
                  {assessmentComponents
                    .filter(c => c.id !== selectedComponentId)
                    .slice(0, 3)
                    .map(c => (
                      <th key={c.id} className="px-3 py-3 text-center w-20">
                        <span className="text-[11px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider">
                          {c.name}
                        </span>
                        <div className="text-[10px] text-gray-300 dark:text-gray-700 font-normal">
                          /{c.max_score}
                        </div>
                      </th>
                    ))}
                  {/* Active component */}
                  <th className="px-4 py-3 text-center w-36 bg-indigo-50/80 dark:bg-indigo-950/30">
                    <span className="text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
                      {activeComponent?.name}
                    </span>
                    <div className="text-[10px] text-indigo-400/60 dark:text-indigo-600 font-normal">
                      /{activeComponent?.max_score}
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {students.map((student, idx) => {
                  const existing = student.existingScores[selectedComponentId!];
                  const hasError = !!validationErrors[student.id];
                  return (
                    <tr
                      key={student.id}
                      className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Row number */}
                      <td className="px-5 py-3 text-[11px] text-gray-300 dark:text-gray-700 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </td>

                      {/* Student name */}
                      <td className="px-4 py-3">
                        <span className="text-[13.5px] font-medium text-gray-800 dark:text-gray-200">
                          {student.full_name}
                        </span>
                      </td>

                      {/* Admission number */}
                      <td className="px-4 py-3">
                        <span className="inline-block text-[11.5px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500 px-2 py-0.5 rounded-md tracking-wide">
                          {student.admission_number}
                        </span>
                      </td>

                      {/* Context scores */}
                      {assessmentComponents
                        .filter(c => c.id !== selectedComponentId)
                        .slice(0, 3)
                        .map(c => {
                          const s = student.existingScores[c.id];
                          return (
                            <td key={c.id} className="px-3 py-3 text-center">
                              {s !== undefined && s > 0
                                ? <span className="text-[13px] font-medium text-gray-500 dark:text-gray-400 tabular-nums">{s}</span>
                                : <span className="text-gray-200 dark:text-gray-700 text-base">—</span>
                              }
                            </td>
                          );
                        })}

                      {/* Active score input */}
                      <td className="px-4 py-2.5 bg-indigo-50/30 dark:bg-indigo-950/10 group-hover:bg-indigo-50/60 dark:group-hover:bg-indigo-950/20 transition-colors">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={maxScore}
                            step="0.5"
                            value={scoreInputs[student.id] ?? ''}
                            onChange={e => handleScoreChange(student.id, e.target.value)}
                            placeholder={existing !== undefined && existing > 0 ? `${existing}` : '—'}
                            className={`w-20 text-center rounded-lg px-2 py-1.5 text-[13.5px] font-semibold tabular-nums transition-all focus:outline-none focus:ring-2 ${
                              hasError
                                ? 'border border-red-300 bg-red-50 text-red-600 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400 focus:ring-red-500/20 focus:border-red-400'
                                : 'border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 focus:ring-indigo-500/20 focus:border-indigo-400'
                            }`}
                          />
                          {hasError && (
                            <span className="text-[10.5px] text-red-500 font-medium">
                              {validationErrors[student.id]}
                            </span>
                          )}
                          {existing !== undefined && existing > 0 && !scoreInputs[student.id] && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-500 font-medium">
                              <CheckCircle2 size={9} />
                              saved: {existing}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ── */}
        {canLoad && (
          <div className="px-7 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4 flex-shrink-0 bg-white dark:bg-gray-950">

            {/* Save message */}
            <div className="flex-1 min-w-0">
              {saveMsg && (
                <div className={`inline-flex items-center gap-2 text-[12.5px] font-medium px-3.5 py-2 rounded-lg ${
                  saveMsg.ok
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                }`}>
                  {saveMsg.ok
                    ? <CheckCircle2 size={13} />
                    : <AlertCircle size={13} />
                  }
                  {saveMsg.text}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Student count chip */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <Users size={12} className="text-gray-400" />
                <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400 tabular-nums">
                  {students.length} student{students.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving || !selectedComponentId || students.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-[13.5px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{ boxShadow: saving || !selectedComponentId || students.length === 0 ? 'none' : '0 2px 8px rgba(99,102,241,0.3)' }}
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Save {activeComponent?.name || 'Scores'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComponentScoreRecordingModal;